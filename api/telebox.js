import crypto from 'crypto';
import { IncomingForm } from 'formidable';
import fs from 'fs/promises';

const TOKEN = process.env.TELEBOX_TOKEN || 'IPDILThtaKVMuzN8';
const BASE = 'https://www.telebox.online/api/open';

export const config = { api: { bodyParser: false } };

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data, null, 2));
}
function maskUrl(u){ return String(u).replace(TOKEN, '***TOKEN***'); }
async function callTelebox(endpoint, params = {}, method = 'GET') {
  const url = new URL(BASE + endpoint);
  for (const [k, v] of Object.entries({ ...params, token: TOKEN })) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const started = Date.now();
  const r = await fetch(url, { method });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { endpoint, requestUrl: maskUrl(url.toString()), httpStatus: r.status, ms: Date.now() - started, body };
}
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ multiples: false, keepExtensions: true, maxFileSize: 1024 * 1024 * 1024 });
    form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ fields, files }));
  });
}
function one(x){ return Array.isArray(x) ? x[0] : x; }

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action') || 'health';

    if (action === 'health') return json(res, 200, { ok: true, tokenConfigured: !!TOKEN, time: new Date().toISOString() });

    if (action === 'list') {
      const pid = url.searchParams.get('pid') || '0';
      const name = url.searchParams.get('name') || '';
      const pageNo = url.searchParams.get('pageNo') || '1';
      const pageSize = url.searchParams.get('pageSize') || '80';
      const result = await callTelebox('/file_search', { name, pid, pageNo, pageSize });
      return json(res, 200, result);
    }

    if (action === 'details') {
      const dirId = url.searchParams.get('dirId') || '0';
      const result = await callTelebox('/folder_details', { dirId });
      return json(res, 200, result);
    }

    if (action === 'mkdir') {
      const name = url.searchParams.get('name') || '';
      const pid = url.searchParams.get('pid') || '0';
      const desc = url.searchParams.get('desc') || '';
      if (!name.trim()) return json(res, 400, { ok:false, msg:'Thiếu tên thư mục' });
      const result = await callTelebox('/folder_create', { name, pid, isShare:0, canInvite:0, canShare:0, withBodyImg:0, desc });
      return json(res, 200, result);
    }

    if (action === 'renameFile') {
      const itemId = url.searchParams.get('itemId');
      const name = url.searchParams.get('name');
      const result = await callTelebox('/file_rename', { itemId, name });
      return json(res, 200, result);
    }

    if (action === 'renameFolder') {
      const dirId = url.searchParams.get('dirId');
      const name = url.searchParams.get('name');
      const desc = url.searchParams.get('desc') || '';
      const result = await callTelebox('/folder_edit', { dirId, name, canShare:0, canInvite:0, change_avatar:0, desc });
      return json(res, 200, result);
    }

    if (action === 'deleteFile') {
      const itemIds = url.searchParams.get('itemIds');
      const result = await callTelebox('/file_del', { itemIds });
      return json(res, 200, result);
    }

    if (action === 'deleteFolder') {
      const dirIds = url.searchParams.get('dirIds');
      const result = await callTelebox('/folder_del', { dirIds });
      return json(res, 200, result);
    }

    if (action === 'shareFile') {
      const itemIds = url.searchParams.get('itemIds');
      const expire_enum = url.searchParams.get('expire_enum') || '4';
      const result = await callTelebox('/file_share', { itemIds, expire_enum });
      return json(res, 200, result);
    }

    if (action === 'shareFolder') {
      const dirId = url.searchParams.get('dirId');
      const expire_enum = url.searchParams.get('expire_enum') || '4';
      const result = await callTelebox('/folder_share', { dirId, expire_enum });
      return json(res, 200, result);
    }

    if (action === 'upload' && req.method === 'POST') {
      const { fields, files } = await parseForm(req);
      const pid = String(one(fields.pid) ?? '0');
      const fileObj = one(files.file);
      const diyName = String(one(fields.diyName) || fileObj?.originalFilename || 'upload.bin');
      if (!fileObj) return json(res, 400, { ok:false, msg:'Không nhận được file' });
      const filePath = fileObj.filepath;
      const full = await fs.readFile(filePath);
      const first10m = full.subarray(0, Math.min(full.length, 10 * 1024 * 1024));
      const md5 = crypto.createHash('md5').update(first10m).digest('hex');
      const auth = await callTelebox('/get_upload_url', { fileMd5ofPre10m: md5, fileSize: full.length });
      const signUrl = auth?.body?.data?.signUrl;
      if (!signUrl) return json(res, 200, { ok:false, step:'get_upload_url', auth });
      const putStart = Date.now();
      const put = await fetch(signUrl, { method:'PUT', body: full, headers: { 'content-type': fileObj.mimetype || 'application/octet-stream' } });
      const putText = await put.text().catch(()=> '');
      const create = await callTelebox('/folder_upload_file', { fileMd5ofPre10m: md5, fileSize: full.length, pid, diyName });
      return json(res, 200, { ok:true, auth, uploadPut:{ httpStatus: put.status, ms: Date.now()-putStart, text: putText.slice(0,500) }, create });
    }

    if (action === 'all') {
      const pid = url.searchParams.get('pid') || '0';
      const results = [];
      results.push(await callTelebox('/folder_details', { dirId: pid }));
      results.push(await callTelebox('/file_search', { name:'', pid, pageNo:1, pageSize:20 }));
      return json(res, 200, { ok:true, action:'all', results });
    }

    return json(res, 404, { ok:false, msg:'Unknown action', action });
  } catch (err) {
    return json(res, 500, { ok:false, error: String(err?.message || err), stack: String(err?.stack || '') });
  }
}
