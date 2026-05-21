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

function uniq(arr){ return [...new Set(arr.filter(Boolean).map(x=>String(x).trim()))]; }
function unescapeHtml(s){ return String(s).replace(/&amp;/g,'&').replace(/\\u002F/g,'/').replace(/\//g,'/'); }
function guessPublicLinks(shareToken){
  if(!shareToken) return [];
  return uniq([
    `https://www.telebox.online/s/${shareToken}`,
    `https://www.telebox.online/share/${shareToken}`,
    `https://www.telebox.online/web/share?shareToken=${shareToken}`,
    `https://www.telebox.online/sharing/link?surl=${shareToken}`,
  ]);
}
async function fetchTextSafe(url){
  try{
    const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 TeleBoxDirectLinkFinder/1.0'}});
    const text=await r.text();
    return {url,httpStatus:r.status,contentType:r.headers.get('content-type')||'',finalUrl:r.url,text:text.slice(0,350000)};
  }catch(e){ return {url,error:String(e?.message||e)}; }
}
function extractUrls(text){
  const raw=unescapeHtml(text||'');
  const urls=[];
  const re=/https?:\\?\/\\?\/[^\s"'<>)}\\]+/g;
  let m;
  while((m=re.exec(raw))){
    let u=m[0].replace(/\\\//g,'/').replace(/\\u002F/g,'/');
    u=u.replace(/[\\"'\],;]+$/g,'');
    urls.push(u);
  }
  return uniq(urls);
}
function classifyLink(u){
  const x=String(u).toLowerCase();
  if(/\.(m3u8)(\?|$)/.test(x)) return 'video stream m3u8';
  if(/\.(mp4|mov|mkv|webm|avi)(\?|$)/.test(x)) return 'video direct/preview';
  if(/\.(jpg|jpeg|png|webp|gif|heic)(\?|$)/.test(x)) return 'image direct/preview';
  if(/\.(zip|rar|7z|apk|ipa|pdf|docx?|xlsx?)(\?|$)/.test(x)) return 'file direct';
  if(x.includes('nuplink') || x.includes('fuplink')) return 'TeleBox CDN candidate';
  if(x.includes('telebox.online')) return 'TeleBox page/API';
  return 'other';
}

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


    if (action === 'directFile') {
      const itemId = url.searchParams.get('itemId');
      const cover = url.searchParams.get('cover') || '';
      const itemIdPublic = url.searchParams.get('item_id') || '';
      const name = url.searchParams.get('name') || '';
      if (!itemId) return json(res, 400, { ok:false, msg:'Thiếu itemId' });

      const share = await callTelebox('/file_share', { itemIds:itemId, expire_enum:4 });
      const shareToken = share?.body?.data?.shareToken || '';
      const sharePages = guessPublicLinks(shareToken);
      const initialLinks = [];
      if (cover) initialLinks.push(cover);
      for (const u of sharePages) initialLinks.push(u);

      const fetched = [];
      const extracted = [];
      for (const page of sharePages.slice(0,4)) {
        const f = await fetchTextSafe(page);
        fetched.push({ url:f.url, finalUrl:f.finalUrl, httpStatus:f.httpStatus, contentType:f.contentType, error:f.error, sample:f.text ? f.text.slice(0,800) : '' });
        if (f.text) extracted.push(...extractUrls(f.text));
      }
      const allLinks = uniq([...initialLinks, ...extracted]).map(u => ({ url:u, kind:classifyLink(u) }));
      const directCandidates = allLinks.filter(x => !x.url.includes('/api/open/') && (x.kind.includes('direct') || x.kind.includes('stream') || x.kind.includes('CDN') || x.url === cover));
      return json(res, 200, {
        ok:true,
        note:'TeleBox public API docs chỉ có shareToken, không ghi endpoint download trực tiếp. Kết quả dưới đây là link tìm được từ cover/share page; link video/file thật phụ thuộc TeleBox có nhúng URL trong trang share hay không.',
        item:{ itemId, item_id:itemIdPublic, name, cover },
        share,
        shareToken,
        sharePages,
        directCandidates,
        allLinks,
        fetched
      });
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
