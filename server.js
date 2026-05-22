import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const TOKEN = 'IPDILThtaKVMuzN8';
const API_BASE = 'https://www.telebox.online/api/open';

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.all('/api/tbox', async (req, res) => {
  try {
    const endpoint = String(req.query.endpoint || '').replace(/^\/+/, '');
    if (!endpoint) return res.status(400).json({ ok: false, msg: 'Missing endpoint' });
    const target = new URL(`${API_BASE}/${endpoint}`);
    target.searchParams.set('token', TOKEN);
    for (const [k, v] of Object.entries(req.query)) {
      if (k !== 'endpoint' && k !== 'token') target.searchParams.set(k, v);
    }
    const r = await fetch(target, { method: 'GET' });
    const text = await r.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    res.json({ ok: true, httpStatus: r.status, endpoint, requestUrl: target.toString().replace(TOKEN, '***TOKEN***'), body });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.listen(process.env.PORT || 3000, () => console.log('TeleBox Cloud Manager running'));
