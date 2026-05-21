import express from 'express';
import multer from 'multer';
import crypto from 'crypto';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 }
});

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_TELEBOX_TOKEN = 'IPDILThtaKVMuzN8';
const TELEBOX_TOKEN = process.env.TELEBOX_TOKEN || DEFAULT_TELEBOX_TOKEN;
const API_BASE = 'https://www.telebox.online/api/open';
const SHARE_BASE = 'https://www.telebox.online/s/';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

function md5First10MB(buffer) {
  const first10MB = buffer.subarray(0, Math.min(buffer.length, 10 * 1024 * 1024));
  return crypto.createHash('md5').update(first10MB).digest('hex');
}

function normalizeErrorData(text, ok) {
  try { return JSON.parse(text); } catch { return { status: ok ? 1 : 0, msg: text }; }
}

async function teleboxGet(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  const query = { ...params, token: TELEBOX_TOKEN };
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, { method: 'GET' });
  const text = await res.text();
  const data = normalizeErrorData(text, res.ok);
  if (!res.ok) {
    const err = new Error(`TeleBox HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function getListFromTelebox(data) {
  if (Array.isArray(data?.data?.list)) return data.data.list;
  if (Array.isArray(data?.data?.items)) return data.data.items;
  if (Array.isArray(data?.data?.records)) return data.data.records;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function isFolderItem(item = {}) {
  const type = String(item.type || item.fileType || item.itemType || item.kind || '').toLowerCase();
  if (type.includes('dir') || type.includes('folder') || type === 'sdir') return true;
  if (item.dirId || item.tpid || item.shareDirName || item.memberCnt !== undefined) return true;
  return false;
}

function normalizeItem(item = {}) {
  const folder = isFolderItem(item);
  const id = item.id ?? item.dirId ?? item.itemId ?? item.fileId ?? item.tpid ?? '';
  const name = item.name || item.diyName || item.fileName || item.title || item.shareDirName || 'Không tên';
  const cover = item.cover || item.img_url || item.image || item.thumb || item.thumbnail || item.coverUrl || '';
  const url = item.url || item.downloadUrl || item.download_url || item.fileUrl || item.link || '';
  return {
    raw: item,
    id: String(id),
    name,
    isFolder: folder,
    type: folder ? 'folder' : 'file',
    size: Number(item.size || item.fileSize || 0),
    pid: item.pid ?? 0,
    cover,
    url,
    ctime: item.ctime || item.createTime || item.created_at || 0,
    utime: item.utime || item.updateTime || item.updated_at || item.comm_utime || 0,
    ext: item.ext || item.suffix || String(name).split('.').pop() || ''
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, tokenConfigured: Boolean(TELEBOX_TOKEN), apiBase: API_BASE });
});

app.get('/api/search', async (req, res, next) => {
  try {
    const data = await teleboxGet('/file_search', {
      name: req.query.name ?? '',
      pid: req.query.pid ?? 0,
      pageNo: req.query.pageNo ?? 1,
      pageSize: req.query.pageSize ?? 100
    });
    const items = getListFromTelebox(data).map(normalizeItem);
    res.json({ ...data, items });
  } catch (err) { next(err); }
});

app.get('/api/folders', async (req, res, next) => {
  try {
    const data = await teleboxGet('/file_search', {
      name: req.query.name ?? '',
      pid: req.query.pid ?? 0,
      pageNo: 1,
      pageSize: 100
    });
    const folders = getListFromTelebox(data).map(normalizeItem).filter(x => x.isFolder);
    res.json({ status: data.status, msg: data.msg, folders, raw: data });
  } catch (err) { next(err); }
});

app.get('/api/folder/:dirId', async (req, res, next) => {
  try { res.json(await teleboxGet('/folder_details', { dirId: req.params.dirId || 0 })); }
  catch (err) { next(err); }
});

app.post('/api/folder', async (req, res, next) => {
  try {
    const { name, pid = 0, desc = '' } = req.body;
    if (!name) return res.status(400).json({ status: 0, msg: 'Thiếu tên thư mục' });
    const data = await teleboxGet('/folder_create', {
      name, pid, isShare: 0, canInvite: 1, canShare: 1, withBodyImg: 0, desc
    });
    res.json(data);
  } catch (err) { next(err); }
});

app.patch('/api/folder/:dirId', async (req, res, next) => {
  try {
    const { name, desc = '', canShare = 1, canInvite = 1 } = req.body;
    if (!name) return res.status(400).json({ status: 0, msg: 'Thiếu tên thư mục mới' });
    res.json(await teleboxGet('/folder_edit', {
      dirId: req.params.dirId, name, canShare, canInvite, change_avatar: 0, desc
    }));
  } catch (err) { next(err); }
});

app.delete('/api/folder/:dirIds', async (req, res, next) => {
  try { res.json(await teleboxGet('/folder_del', { dirIds: req.params.dirIds })); }
  catch (err) { next(err); }
});

app.post('/api/folder/:dirIds/move', async (req, res, next) => {
  try { res.json(await teleboxGet('/folder_move', { dirIds: req.params.dirIds, pid: req.body.pid ?? 0 })); }
  catch (err) { next(err); }
});

app.post('/api/folder/:dirId/share', async (req, res, next) => {
  try {
    const data = await teleboxGet('/folder_share', { dirId: req.params.dirId, expire_enum: req.body.expire_enum ?? 4 });
    const shareToken = data?.data?.shareToken || '';
    res.json({ ...data, shareUrl: shareToken ? SHARE_BASE + shareToken : '' });
  } catch (err) { next(err); }
});

app.post('/api/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ status: 0, msg: 'Thiếu file upload' });
    const pid = req.body.pid || 0;
    const diyName = req.body.diyName || req.file.originalname;
    const fileSize = req.file.size;
    const fileMd5ofPre10m = md5First10MB(req.file.buffer);

    const auth = await teleboxGet('/get_upload_url', { fileMd5ofPre10m, fileSize });
    const signUrl = auth?.data?.signUrl;
    if (!signUrl) return res.status(502).json({ status: 0, msg: 'TeleBox không trả về signUrl', detail: auth });

    const putRes = await fetch(signUrl, {
      method: 'PUT',
      body: req.file.buffer,
      headers: { 'Content-Length': String(fileSize) }
    });
    const putText = await putRes.text();
    if (!putRes.ok) {
      return res.status(502).json({ status: 0, msg: `Upload PUT thất bại HTTP ${putRes.status}`, detail: putText });
    }

    const created = await teleboxGet('/folder_upload_file', { fileMd5ofPre10m, fileSize, pid, diyName });
    res.json({ status: created.status, msg: created.msg, data: created.data, uploadAuth: auth.msg });
  } catch (err) { next(err); }
});

app.patch('/api/file/:itemId', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ status: 0, msg: 'Thiếu tên file mới' });
    res.json(await teleboxGet('/file_rename', { itemId: req.params.itemId, name }));
  } catch (err) { next(err); }
});

app.delete('/api/file/:itemIds', async (req, res, next) => {
  try { res.json(await teleboxGet('/file_del', { itemIds: req.params.itemIds })); }
  catch (err) { next(err); }
});

app.post('/api/file/:itemIds/move', async (req, res, next) => {
  try { res.json(await teleboxGet('/file_move', { itemIds: req.params.itemIds, pid: req.body.pid ?? 0 })); }
  catch (err) { next(err); }
});

app.post('/api/file/:itemIds/share', async (req, res, next) => {
  try {
    const data = await teleboxGet('/file_share', { itemIds: req.params.itemIds, expire_enum: req.body.expire_enum ?? 4 });
    const shareToken = data?.data?.shareToken || '';
    res.json({ ...data, shareUrl: shareToken ? SHARE_BASE + shareToken : '' });
  } catch (err) { next(err); }
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ status: 0, msg: err.message || 'Server error', detail: err.data || null });
});

app.listen(PORT, '0.0.0.0', () => console.log(`TeleBox Drive chạy tại http://localhost:${PORT}`));
