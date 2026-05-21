const TOKEN = process.env.TELEBOX_TOKEN || 'IPDILThtaKVMuzN8';
const BASE = 'https://www.telebox.online/api/open';

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data, null, 2));
}
function getQuery(req) {
  const u = new URL(req.url, 'http://local');
  return Object.fromEntries(u.searchParams.entries());
}
async function readTextSafe(resp) {
  const text = await resp.text();
  try { return { text, json: JSON.parse(text) }; } catch { return { text, json: null }; }
}
function maskToken(url) { return String(url).replace(TOKEN, '***TOKEN***'); }
async function callTelebox(endpoint, params = {}, method = 'GET') {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) sp.set(k, String(v));
  }
  sp.set('token', TOKEN);
  const url = `${BASE}${endpoint}?${sp.toString()}`;
  const started = Date.now();
  const resp = await fetch(url, { method, headers: { 'User-Agent': 'Mozilla/5.0 TeleBoxTester/1.0' } });
  const body = await readTextSafe(resp);
  return { endpoint, requestUrl: maskToken(url), httpStatus: resp.status, ms: Date.now() - started, body: body.json ?? body.text };
}
function extractUrls(text) {
  const s = String(text || '');
  const urls = new Set();
  const re = /https?:\\/\\/[^\s"'<>\\)]+/g;
  let m;
  while ((m = re.exec(s))) urls.add(m[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&'));
  return [...urls];
}
function classifyUrls(urls) {
  return urls.map(u => {
    const l = u.toLowerCase();
    let type = 'other';
    if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/.test(l) || l.includes('x-image-process')) type = 'image';
    if (/\.(mp4|mov|mkv|webm)(\?|$)/.test(l)) type = 'video';
    if (/\.m3u8(\?|$)/.test(l)) type = 'm3u8';
    if (/\.(zip|rar|7z|apk|ipa|pdf|docx?)(\?|$)/.test(l)) type = 'download';
    if (l.includes('nuplink') || l.includes('fuplink') || l.includes('pool/pub')) type += '+cdn';
    return { type, url: u };
  });
}
async function scanSharePage(shareToken) {
  const candidates = [
    `https://www.telebox.online/s/${shareToken}`,
    `https://www.telebox.online/share/${shareToken}`,
    `https://www.telebox.online/web/share/${shareToken}`,
    `https://www.telebox.online/share/file/${shareToken}`,
    `https://www.telebox.online/file/${shareToken}`,
    `https://www.telebox.online/xfile/${shareToken}`,
    `https://www.telebox.online/s/file/${shareToken}`
  ];
  const pages = [];
  const found = [];
  for (const url of candidates) {
    try {
      const started = Date.now();
      const resp = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1' } });
      const text = await resp.text();
      const urls = classifyUrls(extractUrls(text));
      pages.push({ url, status: resp.status, finalUrl: resp.url, ms: Date.now() - started, title: (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim(), foundCount: urls.length });
      found.push(...urls);
    } catch (e) {
      pages.push({ url, error: e.message });
    }
  }
  const seen = new Set();
  return { pages, urls: found.filter(x => !seen.has(x.url) && seen.add(x.url)) };
}

export default async function handler(req, res) {
  try {
    const q = getQuery(req);
    const action = q.action || 'health';
    if (action === 'health') return json(res, 200, { ok: true, tokenConfigured: Boolean(TOKEN), actions: ['list','share','shareScan','details'] });
    if (action === 'list') {
      const pid = q.pid || '0';
      const name = q.name ?? '';
      const pageNo = q.pageNo || '1';
      const pageSize = q.pageSize || '50';
      const r = await callTelebox('/file_search', { name, pid, pageNo, pageSize });
      return json(res, 200, { ok: true, tokenConfigured: true, result: r });
    }
    if (action === 'details') {
      const dirId = q.dirId || q.pid || '0';
      const r = await callTelebox('/folder_details', { dirId });
      return json(res, 200, { ok: true, result: r });
    }
    if (action === 'share') {
      const itemIds = q.itemIds || q.id;
      const expire_enum = q.expire_enum || q.expire || '4';
      if (!itemIds) return json(res, 400, { ok: false, error: 'Thiếu itemIds/file id' });
      const r = await callTelebox('/file_share', { itemIds, expire_enum });
      const shareToken = r?.body?.data?.shareToken || r?.body?.data?.share_token || null;
      return json(res, 200, { ok: true, itemIds, expire_enum, shareToken, possibleShareUrls: shareToken ? [`https://www.telebox.online/s/${shareToken}`, `https://www.telebox.online/share/${shareToken}`] : [], result: r });
    }
    if (action === 'shareScan') {
      const itemIds = q.itemIds || q.id;
      const expire_enum = q.expire_enum || q.expire || '4';
      if (!itemIds) return json(res, 400, { ok: false, error: 'Thiếu itemIds/file id' });
      const share = await callTelebox('/file_share', { itemIds, expire_enum });
      const shareToken = share?.body?.data?.shareToken || share?.body?.data?.share_token || null;
      let scan = null;
      if (shareToken) scan = await scanSharePage(shareToken);
      return json(res, 200, { ok: true, itemIds, expire_enum, shareToken, shareUrls: shareToken ? [`https://www.telebox.online/s/${shareToken}`, `https://www.telebox.online/share/${shareToken}`] : [], shareApi: share, scan });
    }
    return json(res, 404, { ok: false, error: 'Unknown action', action });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message, stack: e.stack });
  }
}
