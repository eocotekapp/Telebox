const TOKEN = "IPDILThtaKVMuzN8";
const BASE = "https://www.telebox.online/api/open";

function send(res, code, data) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data, null, 2));
}

function mask(s) {
  return String(s || "").replaceAll(TOKEN, "***TOKEN***");
}

async function callTelebox(endpoint, params = {}) {
  const url = new URL(BASE + endpoint);
  for (const [k, v] of Object.entries({ ...params, token: TOKEN })) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const started = Date.now();
  const r = await fetch(url.toString(), { method: "GET", headers: { accept: "application/json,text/plain,*/*" } });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { endpoint, requestUrl: mask(url.toString()), httpStatus: r.status, ms: Date.now() - started, body };
}

function guessShareUrls(shareToken) {
  if (!shareToken) return [];
  return [
    `https://www.telebox.online/s/${shareToken}`,
    `https://www.telebox.online/share/${shareToken}`,
    `https://www.telebox.online/web/share?code=${shareToken}`,
    `https://www.telebox.online/web/share/${shareToken}`,
    `https://www.telebox.online/file/share/${shareToken}`,
    `https://www.telebox.online/links/${shareToken}`,
    `https://www.telebox.online/share/file/${shareToken}`,
    `https://www.telebox.online/file/${shareToken}`,
    `https://telebox.online/s/${shareToken}`,
    `https://telebox.online/share/${shareToken}`,
    `https://telebox.online/web/share?code=${shareToken}`
  ];
}

function extractUrls(text) {
  if (!text) return [];
  const urls = new Set();
  const re = /https?:\\/\\/[^\"'<>\\s)]+/g;
  for (const m of String(text).matchAll(re)) {
    let u = m[0].replace(/\\u0026/g, "&").replace(/&amp;/g, "&");
    urls.add(u);
  }
  return [...urls];
}

async function probeUrl(url) {
  const started = Date.now();
  try {
    const r = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 TeleBoxShareTester/1.0",
        accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*"
      }
    });
    const text = await r.text();
    const urls = extractUrls(text);
    return {
      url,
      finalUrl: r.url,
      status: r.status,
      contentType: r.headers.get("content-type"),
      ms: Date.now() - started,
      htmlSample: text.slice(0, 600),
      foundUrls: urls.filter(u => /nuplink|uplink|cdn|pool|mp4|m3u8|download|api|telebox|jpg|jpeg|png|webp|mov|mkv/i.test(u)).slice(0, 80)
    };
  } catch (e) {
    return { url, error: String(e && e.message || e), ms: Date.now() - started };
  }
}

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, "http://local");
    const action = u.searchParams.get("action") || "all";
    const pid = u.searchParams.get("pid") || "0";
    const name = u.searchParams.get("name") || "api_test_" + Date.now();
    const itemId = u.searchParams.get("itemId") || "";
    const expire = u.searchParams.get("expire") || "4";
    const shareToken = u.searchParams.get("shareToken") || "";
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
    if (action === "share") {
      if (!itemId) return send(res, 400, { ok: false, error: "Thiếu itemId/file id. Copy ID của file rồi dán vào ô File ID." });
      const share = await callTelebox("/file_share", { itemIds: itemId, expire_enum: expire });
      results.push(share);
      const token = share?.body?.data?.shareToken || share?.body?.shareToken || "";
      const candidates = guessShareUrls(token);
      results.push({ endpoint: "share_url_candidates", shareToken: token, note: "Đây là các dạng URL share để test. URL nào status 200 và có nội dung đúng thì dùng tiếp để bóc direct/CDN.", urls: candidates });
    }
    if (action === "probeShare") {
      const token = shareToken;
      if (!token) return send(res, 400, { ok: false, error: "Thiếu shareToken" });
      const candidates = guessShareUrls(token);
      const probes = [];
      for (const url of candidates) probes.push(await probeUrl(url));
      results.push({ endpoint: "probe_share_pages", shareToken: token, probes });
    }
    if (action === "shareAndProbe") {
      if (!itemId) return send(res, 400, { ok: false, error: "Thiếu itemId/file id. Copy ID của file rồi dán vào ô File ID." });
      const share = await callTelebox("/file_share", { itemIds: itemId, expire_enum: expire });
      results.push(share);
      const token = share?.body?.data?.shareToken || share?.body?.shareToken || "";
      if (token) {
        const probes = [];
        for (const url of guessShareUrls(token)) probes.push(await probeUrl(url));
        results.push({ endpoint: "probe_share_pages", shareToken: token, probes });
      }
    }

    const allowed = ["all", "root", "search", "create", "share", "probeShare", "shareAndProbe"];
    if (!allowed.includes(action)) return send(res, 400, { ok: false, error: "Unknown action", allowed });
    send(res, 200, { ok: true, tokenConfigured: Boolean(TOKEN), action, results });
  } catch (err) {
    send(res, 500, { ok: false, error: String(err && err.message || err), stack: err && err.stack });
  }
}
