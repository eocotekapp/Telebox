import express from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import { IncomingForm } from 'formidable';

const app = express();
const PORT = process.env.PORT || 3000;
const TELEBOX_TOKEN = 'IPDILThtaKVMuzN8';
const TELEBOX_BASE = 'https://www.telebox.online/api/open';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

function now() {
  return new Date().toISOString();
}

function safeJsonParse(text) {
  try { return { ok: true, json: JSON.parse(text) }; }
  catch { return { ok: false, json: null }; }
}

async function callTelebox(endpoint, params = {}, method = 'GET') {
  const url = new URL(`${TELEBOX_BASE}/${endpoint}`);
  const allParams = { ...params, token: TELEBOX_TOKEN };
  const options = { method, headers: { 'user-agent': 'TeleBox-API-Tester/1.0' } };

  if (method === 'GET') {
    for (const [key, value] of Object.entries(allParams)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  } else {
    options.headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
    options.body = new URLSearchParams(Object.entries(allParams).map(([k, v]) => [k, String(v ?? '')]));
  }

  const started = Date.now();
  let res;
  let text = '';
  try {
    res = await fetch(url.toString(), options);
    text = await res.text();
  } catch (error) {
    return {
      time: now(),
      endpoint,
      method,
      requestUrl: maskToken(url.toString()),
      params: maskParams(allParams),
      networkError: String(error?.message || error),
      durationMs: Date.now() - started
    };
  }

  const parsed = safeJsonParse(text);
  return {
    time: now(),
    endpoint,
    method,
    requestUrl: maskToken(url.toString()),
    params: maskParams(allParams),
    httpStatus: res.status,
    httpOk: res.ok,
    durationMs: Date.now() - started,
    responseText: text,
    json: parsed.ok ? parsed.json : null,
    isJson: parsed.ok,
    headers: Object.fromEntries(res.headers.entries())
  };
}

function maskToken(s) {
  return String(s).replaceAll(TELEBOX_TOKEN, '***TOKEN***');
}
function maskParams(obj) {
  const clone = { ...obj };
  if (clone.token) clone.token = '***TOKEN***';
  return clone;
}
function first10mMd5(buffer) {
  const tenMb = 10 * 1024 * 1024;
  return crypto.createHash('md5').update(buffer.subarray(0, Math.min(buffer.length, tenMb))).digest('hex');
}

app.get('/api/config', (req, res) => {
  res.json({
    ok: true,
    tokenConfigured: Boolean(TELEBOX_TOKEN),
    tokenPreview: TELEBOX_TOKEN.slice(0, 4) + '...' + TELEBOX_TOKEN.slice(-4),
    base: TELEBOX_BASE,
    node: process.version,
    time: now()
  });
});

app.post('/api/test/folder-details', async (req, res) => {
  const dirId = req.body?.dirId ?? 0;
  res.json(await callTelebox('folder_details', { dirId }, 'GET'));
});

app.post('/api/test/search', async (req, res) => {
  const { name = '', pid = 0, pageNo = 1, pageSize = 20, method = 'GET' } = req.body || {};
  res.json(await callTelebox('file_search', { name, pid, pageNo, pageSize }, method));
});

app.post('/api/test/create-folder', async (req, res) => {
  const { name = `api-test-${Date.now()}`, pid = 0, desc = '', method = 'GET' } = req.body || {};
  const params = {
    name,
    pid,
    isShare: 0,
    canInvite: 0,
    canShare: 0,
    withBodyImg: 0,
    desc
  };
  const first = await callTelebox('folder_create', params, method);
  if (first?.json && first.json.status === 1) return res.json({ main: first });

  // fallback automatic thử method còn lại để biết API chấp nhận GET hay POST
  const fallbackMethod = method === 'GET' ? 'POST' : 'GET';
  const second = await callTelebox('folder_create', params, fallbackMethod);
  res.json({ main: first, fallback: second });
});

app.post('/api/test/share-folder', async (req, res) => {
  const { dirId, expire_enum = 4 } = req.body || {};
  if (!dirId) return res.status(400).json({ error: 'Thiếu dirId' });
  res.json(await callTelebox('folder_share', { dirId, expire_enum }, 'GET'));
});

app.post('/api/test/upload-text', async (req, res) => {
  const { pid = 0, filename = `telebox-test-${Date.now()}.txt`, content = 'Hello TeleBox API tester' } = req.body || {};
  const buffer = Buffer.from(String(content), 'utf8');
  const md5 = first10mMd5(buffer);
  const fileSize = buffer.length;

  const auth = await callTelebox('get_upload_url', { fileMd5ofPre10m: md5, fileSize }, 'GET');
  const signUrl = auth?.json?.data?.signUrl;
  const result = { step1_getUploadUrl: auth };

  if (!signUrl) {
    result.error = 'TeleBox không trả signUrl, chưa thể PUT file.';
    return res.json(result);
  }

  const started = Date.now();
  let putText = '';
  let putInfo;
  try {
    const putRes = await fetch(signUrl, { method: 'PUT', body: buffer });
    putText = await putRes.text();
    putInfo = {
      httpStatus: putRes.status,
      httpOk: putRes.ok,
      durationMs: Date.now() - started,
      responseText: putText,
      headers: Object.fromEntries(putRes.headers.entries())
    };
  } catch (error) {
    putInfo = { networkError: String(error?.message || error), durationMs: Date.now() - started };
  }
  result.step2_putToSignUrl = putInfo;

  if (!putInfo.httpOk) {
    result.error = 'PUT lên signUrl thất bại, nên chưa tạo file item.';
    return res.json(result);
  }

  result.step3_createFileItem = await callTelebox('folder_upload_file', {
    fileMd5ofPre10m: md5,
    fileSize,
    pid,
    diyName: filename
  }, 'GET');

  res.json(result);
});

app.post('/api/test/upload-file', async (req, res) => {
  const form = new IncomingForm({ multiples: false, maxFileSize: 100 * 1024 * 1024 });
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ error: String(err.message || err) });
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) return res.status(400).json({ error: 'Chưa chọn file' });
    const pid = Number(Array.isArray(fields.pid) ? fields.pid[0] : fields.pid || 0);
    const diyName = String(Array.isArray(fields.filename) ? fields.filename[0] : fields.filename || file.originalFilename || `upload-${Date.now()}`);
    const buffer = await fs.readFile(file.filepath);
    const md5 = first10mMd5(buffer);
    const fileSize = buffer.length;

    const result = {};
    result.step1_getUploadUrl = await callTelebox('get_upload_url', { fileMd5ofPre10m: md5, fileSize }, 'GET');
    const signUrl = result.step1_getUploadUrl?.json?.data?.signUrl;
    if (!signUrl) return res.json({ ...result, error: 'Không có signUrl' });

    try {
      const putRes = await fetch(signUrl, { method: 'PUT', body: buffer });
      result.step2_putToSignUrl = {
        httpStatus: putRes.status,
        httpOk: putRes.ok,
        responseText: await putRes.text(),
        headers: Object.fromEntries(putRes.headers.entries())
      };
    } catch (error) {
      result.step2_putToSignUrl = { networkError: String(error?.message || error) };
      return res.json(result);
    }

    result.step3_createFileItem = await callTelebox('folder_upload_file', {
      fileMd5ofPre10m: md5,
      fileSize,
      pid,
      diyName
    }, 'GET');
    res.json(result);
  });
});

app.get('/api/test/all', async (req, res) => {
  const report = {};
  report.config = {
    tokenConfigured: true,
    tokenPreview: TELEBOX_TOKEN.slice(0, 4) + '...' + TELEBOX_TOKEN.slice(-4),
    base: TELEBOX_BASE,
    time: now()
  };
  report.folderDetailsRoot = await callTelebox('folder_details', { dirId: 0 }, 'GET');
  report.searchRootEmptyGET = await callTelebox('file_search', { name: '', pid: 0, pageNo: 1, pageSize: 10 }, 'GET');
  report.searchRootEmptyPOST = await callTelebox('file_search', { name: '', pid: 0, pageNo: 1, pageSize: 10 }, 'POST');
  const testName = `api-test-${Date.now()}`;
  report.createFolderGET = await callTelebox('folder_create', { name: testName, pid: 0, isShare: 0, canInvite: 0, canShare: 0, withBodyImg: 0, desc: 'api tester' }, 'GET');
  if (!(report.createFolderGET?.json?.status === 1)) {
    report.createFolderPOST = await callTelebox('folder_create', { name: testName + '-post', pid: 0, isShare: 0, canInvite: 0, canShare: 0, withBodyImg: 0, desc: 'api tester' }, 'POST');
  }
  res.json(report);
});

app.get('*', (req, res) => res.sendFile(process.cwd() + '/public/index.html'));

app.listen(PORT, () => {
  console.log(`TeleBox API Tester running on http://localhost:${PORT}`);
});

export default app;
