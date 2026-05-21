import express from 'express';
import multer from 'multer';
import crypto from 'crypto';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_BASE = 'https://www.telebox.online/api/open';
const TELEBOX_TOKEN = process.env.TELEBOX_TOKEN || 'IPDILThtaKVMuzN8';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } });

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

function md5First10MB(buffer) {
  return crypto.createHash('md5').update(buffer.subarray(0, Math.min(buffer.length, 10 * 1024 * 1024))).digest('hex');
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function buildQuery(params = {}) {
  const qs = new URLSearchParams();
  const finalParams = { ...params, token: TELEBOX_TOKEN };
  for (const [key, value] of Object.entries(finalParams)) {
    // QUAN TRỌNG: TeleBox yêu cầu cả tham số rỗng như desc= và name=.
    // Bản trước bỏ qua chuỗi rỗng nên API có thể trả {} hoặc lỗi mơ hồ.
    if (value !== undefined && value !== null) qs.set(key, String(value));
  }
  return qs;
}

async function teleboxRequest(path, params = {}, method = 'GET') {
  const qs = buildQuery(params);
  const url = new URL(`${API_BASE}${path}`);
  let res;
  if (method === 'POST') {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: qs
    });
  } else {
    url.search = qs.toString();
    res = await fetch(url, { method: 'GET' });
  }
  const text = await res.text();
  const json = safeJson(text);
  const data = json ?? { status: res.ok ? 1 : 0, msg: text || `HTTP ${res.status}`, rawText: text };
  data.__debug = { method, upstreamStatus: res.status, path, params: Object.fromEntries(qs), hasToken: Boolean(TELEBOX_TOKEN) };
  if (!res.ok) {
    const err = new Error(`TeleBox HTTP ${res.status}`);
    err.status = 502;
    err.data = data;
    throw err;
  }
  return data;
}

async function teleboxGet(path, params = {}) {
  return teleboxRequest(path, params, 'GET');
}

async function teleboxGetThenPost(path, params = {}) {
  const first = await teleboxRequest(path, params, 'GET');
  // Nếu TeleBox trả object rỗng {}, thử lại bằng POST form-urlencoded.
  const keys = Object.keys(first).filter(k => k !== '__debug');
  if (keys.length === 0 || (first.status === undefined && !first.msg && !first.data)) {
    return teleboxRequest(path, params, 'POST');
  }
  return first;
}

function normalizeList(raw) {
  const data = raw?.data ?? raw;
  const candidates = [
    data?.list, data?.items, data?.rows, data?.records, data?.files,
    data?.fileList, data?.folderList, data?.dirList, data?.dirs,
    data?.children, data?.data?.list, data?.data?.items
  ];
  for (const c of candidates) if (Array.isArray(c)) return c;
  if (Array.isArray(data)) return data;
  return [];
}
function itemName(x) { return x?.name || x?.fileName || x?.filename || x?.diyName || x?.title || x?.tname || 'Không tên'; }
function itemId(x) { return x?.id ?? x?.itemId ?? x?.fileId ?? x?.dirId ?? x?.fid ?? x?.folderId ?? ''; }
function isFolder(x) {
  const type = String(x?.type ?? x?.fileType ?? x?.itemType ?? x?.category ?? '').toLowerCase();
  return x?.isDir === true || x?.isFolder === true || x?.dirId !== undefined || type.includes('folder') || type === 'dir' || type === 'sdir' || type === '1';
}
function isImage(x) {
  const name = itemName(x).toLowerCase();
  const mime = String(x?.mimeType || x?.mime || '').toLowerCase();
  return mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(name);
}
function thumbUrl(x) { return x?.thumb || x?.thumbnail || x?.thumbnailUrl || x?.cover || x?.img_url || x?.url || x?.downloadUrl || x?.previewUrl || ''; }
function normalizeItem(x) {
  return {
    raw: x,
    id: String(itemId(x)),
    name: itemName(x),
    folder: isFolder(x),
    image: isImage(x),
    size: x?.size ?? x?.fileSize ?? x?.length ?? '',
    thumb: thumbUrl(x),
    createdAt: x?.createdAt || x?.createTime || x?.ctime || x?.addTime || ''
  };
}

app.get('/api/health', (req, res) => res.json({ ok: true, tokenConfigured: Boolean(TELEBOX_TOKEN), runtime: process.env.VERCEL ? 'vercel' : 'local' }));

app.get('/api/diagnose', async (req, res) => {
  const results = {};
  try { results.health = { ok: true, tokenConfigured: Boolean(TELEBOX_TOKEN) }; } catch (e) { results.health = String(e); }
  try { results.searchRoot = await teleboxGet('/file_search', { name: '', pid: 0, pageNo: 1, pageSize: 5 }); } catch (e) { results.searchRoot = e.data || { msg: e.message }; }
  res.json(results);
});

app.get('/api/folder/:dirId', async (req, res, next) => {
  try {
    const raw = await teleboxGet('/file_search', {
      name: req.query.name ?? '',
      pid: req.params.dirId || 0,
      pageNo: req.query.pageNo || 1,
      pageSize: req.query.pageSize || 100
    });
    const list = normalizeList(raw).map(normalizeItem);
    res.json({ status: raw.status ?? 1, msg: raw.msg || 'success', list, raw });
  } catch (err) { next(err); }
});

app.post('/api/folder', async (req, res, next) => {
  try {
    const { name, pid = 0, desc = '' } = req.body || {};
    if (!String(name || '').trim()) return res.status(400).json({ status: 0, msg: 'Bạn chưa nhập tên thư mục' });
    const params = {
      name: String(name).trim(),
      pid: pid || 0,
      isShare: 0,
      // Theo tài liệu TeleBox: 0 = yes, 1 = no. Bản trước đang để 1.
      canInvite: 0,
      canShare: 0,
      withBodyImg: 0,
      desc: desc ?? ''
    };
    const data = await teleboxGetThenPost('/folder_create', params);
    if (data.status !== 1) return res.status(400).json(data);
    res.json(data);
  } catch (err) { next(err); }
});

app.post('/api/upload', upload.array('files', 20), async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ status: 0, msg: 'Bạn chưa chọn file' });
    const pid = req.body.pid || 0;
    const results = [];
    for (const file of req.files) {
      const diyName = req.body.diyName?.trim() || file.originalname;
      const fileSize = file.size;
      const fileMd5ofPre10m = md5First10MB(file.buffer);
      const auth = await teleboxGet('/get_upload_url', { fileMd5ofPre10m, fileSize });
      const signUrl = auth?.data?.signUrl || auth?.data?.url || auth?.signUrl;
      if (!signUrl) { results.push({ file: file.originalname, status: 0, msg: 'TeleBox không trả về link upload', auth }); continue; }
      const putRes = await fetch(signUrl, { method: 'PUT', body: file.buffer, headers: { 'Content-Length': String(fileSize) } });
      const putText = await putRes.text();
      if (!putRes.ok) { results.push({ file: file.originalname, status: 0, msg: `Upload PUT lỗi ${putRes.status}`, detail: putText }); continue; }
      const created = await teleboxGet('/folder_upload_file', { fileMd5ofPre10m, fileSize, pid, diyName });
      results.push({ file: file.originalname, ...created });
    }
    const ok = results.every(r => Number(r.status) === 1);
    res.status(ok ? 200 : 400).json({ status: ok ? 1 : 0, msg: ok ? 'Upload xong' : 'Có file upload lỗi', results });
  } catch (err) { next(err); }
});

app.get('/api/search', async (req, res, next) => {
  try {
    const raw = await teleboxGet('/file_search', { name: req.query.name ?? '', pid: req.query.pid || 0, pageNo: req.query.pageNo || 1, pageSize: req.query.pageSize || 80 });
    const list = normalizeList(raw).map(normalizeItem);
    res.json({ status: raw.status ?? 1, msg: raw.msg || 'success', list, raw });
  } catch (err) { next(err); }
});

app.patch('/api/file/:itemId', async (req, res, next) => { try { res.json(await teleboxGet('/file_rename', { itemId: req.params.itemId, name: req.body.name })); } catch (err) { next(err); } });
app.delete('/api/file/:itemIds', async (req, res, next) => { try { res.json(await teleboxGet('/file_del', { itemIds: req.params.itemIds })); } catch (err) { next(err); } });
app.post('/api/file/:itemIds/share', async (req, res, next) => { try { res.json(await teleboxGet('/file_share', { itemIds: req.params.itemIds, expire_enum: req.body.expire_enum ?? 4 })); } catch (err) { next(err); } });
app.delete('/api/folder/:dirIds', async (req, res, next) => { try { res.json(await teleboxGet('/folder_del', { dirIds: req.params.dirIds })); } catch (err) { next(err); } });
app.post('/api/folder/:dirId/share', async (req, res, next) => { try { res.json(await teleboxGet('/folder_share', { dirId: req.params.dirId, expire_enum: req.body.expire_enum ?? 4 })); } catch (err) { next(err); } });

app.use((err, req, res, next) => {
  const payload = {
    status: 0,
    msg: err.message || 'Server error',
    detail: err.data || null,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  };
  console.error(payload);
  res.status(err.status || 500).json(payload);
});

if (!process.env.VERCEL) app.listen(PORT, () => console.log(`TeleBox Drive Easy: http://localhost:${PORT}`));
export default app;
