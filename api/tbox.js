const TOKEN = 'IPDILThtaKVMuzN8';
const API_BASE = 'https://www.telebox.online/api/open';

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  try {
    const u = new URL(req.url, 'http://localhost');
    const endpoint = (u.searchParams.get('endpoint') || '').replace(/^\/+/, '');
    if (!endpoint) return json(res, 400, { ok: false, msg: 'Missing endpoint' });

    const target = new URL(`${API_BASE}/${endpoint}`);
    target.searchParams.set('token', TOKEN);
    for (const [k, v] of u.searchParams.entries()) {
      if (k !== 'endpoint' && k !== 'token') target.searchParams.set(k, v);
    }

    let teleboxRes;
    if (req.method === 'POST') {
      let body = '';
      await new Promise(resolve => {
        req.on('data', c => body += c);
        req.on('end', resolve);
      });
      teleboxRes = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': req.headers['content-type'] || 'application/json' },
        body: body || undefined
      });
    } else {
      teleboxRes = await fetch(target, { method: 'GET' });
    }

    const text = await teleboxRes.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }

    return json(res, 200, {
      ok: true,
      httpStatus: teleboxRes.status,
      endpoint,
      requestUrl: target.toString().replace(TOKEN, '***TOKEN***'),
      body
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message, stack: String(e.stack || '') });
  }
}
