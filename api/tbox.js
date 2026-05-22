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

function safeUrl(url) {
  return url.toString().replace(TOKEN, '***TOKEN***');
}

async function readRawBody(req) {
  let body = '';
  await new Promise((resolve, reject) => {
    req.on('data', c => body += c);
    req.on('end', resolve);
    req.on('error', reject);
  });
  return body;
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

    const method = req.method === 'POST' ? 'POST' : 'GET';
    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      'Origin': 'https://www.telebox.online',
      'Referer': 'https://www.telebox.online/'
    };

    const options = { method, headers };
    if (method === 'POST') {
      const rawBody = await readRawBody(req);
      headers['Content-Type'] = req.headers['content-type'] || 'application/json';
      options.body = rawBody || '{}';
    }

    const teleboxRes = await fetch(target, options);
    const text = await teleboxRes.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }

    return json(res, 200, {
      ok: true,
      httpStatus: teleboxRes.status,
      endpoint,
      requestUrl: safeUrl(target),
      body
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message, stack: String(e.stack || '') });
  }
}
