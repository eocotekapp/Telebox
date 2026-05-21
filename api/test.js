const TOKEN = "IPDILThtaKVMuzN8";
const BASE = "https://www.telebox.online/api/open";

function send(res, code, data) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data, null, 2));
}

async function callTelebox(endpoint, params = {}) {
  const url = new URL(BASE + endpoint);
  for (const [k, v] of Object.entries({ ...params, token: TOKEN })) {
    url.searchParams.set(k, String(v));
  }
  const started = Date.now();
  const r = await fetch(url.toString(), { method: "GET", headers: { accept: "application/json,text/plain,*/*" } });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { endpoint, requestUrl: url.toString().replace(TOKEN, "***TOKEN***"), httpStatus: r.status, ms: Date.now() - started, body };
}

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, "http://local");
    const action = u.searchParams.get("action") || "all";
    const pid = u.searchParams.get("pid") || "0";
    const name = u.searchParams.get("name") || "api_test_" + Date.now();
    const results = [];

    if (action === "all" || action === "root") {
      results.push(await callTelebox("/folder_details", { dirId: pid }));
    }
    if (action === "all" || action === "search") {
      results.push(await callTelebox("/file_search", { name: "", pid, pageNo: 1, pageSize: 20 }));
    }
    if (action === "create") {
      results.push(await callTelebox("/folder_create", { name, pid, isShare: 0, canInvite: 0, canShare: 0 }));
    }
    if (!["all", "root", "search", "create"].includes(action)) {
      return send(res, 400, { ok: false, error: "Unknown action", allowed: ["all", "root", "search", "create"] });
    }
    send(res, 200, { ok: true, tokenConfigured: Boolean(TOKEN), action, results });
  } catch (err) {
    send(res, 500, { ok: false, error: String(err && err.message || err), stack: err && err.stack });
  }
}
