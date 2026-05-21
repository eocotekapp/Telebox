const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = { folderId: '0', folderName: 'Root', folders: [{ id: '0', name: 'Root', isFolder: true }] };

function log(data) {
  $('#log').textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}
function toast(message, type = 'ok') {
  const box = $('#toast');
  box.textContent = message;
  box.style.borderColor = type === 'bad' ? 'rgba(255,109,122,.55)' : 'rgba(100,216,255,.55)';
  box.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => box.classList.remove('show'), 2800);
}
function escapeHtml(str = '') {
  return String(str).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}
function formatSize(bytes = 0) {
  if (!bytes) return '';
  const units = ['B','KB','MB','GB'];
  let n = Number(bytes), i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
function isImage(item) {
  const n = (item.name || '').toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|avif)$/.test(n) || /^image\//.test(item.mime || '');
}
async function api(path, options = {}) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === 0) throw data;
  return data;
}
function setFolder(id, name) {
  state.folderId = String(id || '0');
  state.folderName = name || 'Root';
  $('#currentFolderName').textContent = state.folderName;
  $('#uploadPid').value = state.folderId;
  $('#folderPid').value = state.folderId;
  $('#folderSelect').value = state.folderId;
}
function renderFolderOptions() {
  const select = $('#folderSelect');
  const unique = new Map();
  unique.set('0', { id: '0', name: 'Root' });
  state.folders.forEach(f => unique.set(String(f.id), f));
  select.innerHTML = [...unique.values()].map(f => `<option value="${escapeHtml(f.id)}">📁 ${escapeHtml(f.name)}${f.id === '0' ? ' - ngoài cùng' : ''}</option>`).join('');
  select.value = state.folderId;
}
async function loadFolders() {
  try {
    const data = await api('/api/folders?pid=0&name=');
    const folders = Array.isArray(data.folders) ? data.folders.filter(f => f.id) : [];
    state.folders = [{ id: '0', name: 'Root' }, ...folders];
    renderFolderOptions();
    $('#statusText').textContent = folders.length ? `Đã tải ${folders.length} thư mục. Không cần nhập ID nữa.` : 'Đã kết nối. Nếu chưa thấy folder, hãy tạo folder mới hoặc dùng tab File để tìm.';
    log(data);
  } catch (err) {
    $('#statusText').textContent = 'Không tải được folder. Xem log kỹ thuật để biết lỗi.';
    toast(err.msg || 'Không tải được folder', 'bad');
    log(err);
  }
}
async function checkHealth() {
  try {
    const data = await api('/api/health');
    $('#statusText').textContent = data.tokenConfigured ? 'Đã kết nối server. Đang tải folder...' : 'Chưa có token.';
    log(data);
  } catch (err) {
    $('#statusText').textContent = 'Không gọi được server Node.js.';
    log(err);
  }
}
function renderResults(items = []) {
  const box = $('#results');
  if (!items.length) {
    box.innerHTML = '<div class="empty">Chưa có kết quả. Hãy nhập từ khóa rồi bấm Tìm.</div>';
    return;
  }
  box.innerHTML = items.map(item => {
    const icon = item.isFolder ? '📁' : (isImage(item) ? '🖼️' : '📄');
    const img = item.cover && isImage(item) ? `<img src="${escapeHtml(item.cover)}" alt="">` : `<span class="big-icon">${icon}</span>`;
    const id = escapeHtml(item.id || '');
    const name = escapeHtml(item.name || 'Không tên');
    const size = formatSize(item.size);
    return `<article class="file-card">
      <div class="thumb">${img}</div>
      <div class="file-name">${name}</div>
      <div class="meta"><span>${item.isFolder ? 'Folder' : 'File'}</span>${size ? `<span>• ${size}</span>` : ''}<span>• ID: ${id}</span></div>
      <div class="actions">
        ${item.isFolder ? `<button data-open-folder="${id}" data-name="${name}">Mở</button>` : ''}
        <button data-share="${id}" data-kind="${item.isFolder ? 'folder' : 'file'}">Share</button>
        ${!item.isFolder ? `<button data-rename="${id}" data-name="${name}">Đổi tên</button>` : ''}
        <button data-delete="${id}" data-kind="${item.isFolder ? 'folder' : 'file'}">Xóa</button>
      </div>
    </article>`;
  }).join('');
}
async function searchFiles(keyword = '') {
  try {
    $('#results').innerHTML = '<div class="empty">Đang tải...</div>';
    const qs = new URLSearchParams({ name: keyword, pid: state.folderId, pageNo: 1, pageSize: 100 });
    const data = await api('/api/search?' + qs.toString());
    renderResults(data.items || []);
    log(data);
  } catch (err) {
    $('#results').innerHTML = '<div class="empty">Lỗi khi tìm kiếm. Mở log kỹ thuật để xem chi tiết.</div>';
    toast(err.msg || 'Tìm kiếm lỗi', 'bad');
    log(err);
  }
}
async function shareItem(kind, id) {
  try {
    const url = kind === 'folder' ? `/api/folder/${encodeURIComponent(id)}/share` : `/api/file/${encodeURIComponent(id)}/share`;
    const data = await api(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ expire_enum: 4 }) });
    const link = data.shareUrl || data?.data?.shareToken || '';
    if (link && navigator.clipboard) await navigator.clipboard.writeText(link);
    toast(link ? 'Đã tạo share và copy link/token' : 'Đã tạo share');
    log(data);
  } catch (err) { toast(err.msg || 'Share lỗi', 'bad'); log(err); }
}
async function deleteItem(kind, id) {
  if (!confirm(`Xóa ${kind === 'folder' ? 'folder' : 'file'} ID ${id}?`)) return;
  try {
    const url = kind === 'folder' ? `/api/folder/${encodeURIComponent(id)}` : `/api/file/${encodeURIComponent(id)}`;
    const data = await api(url, { method:'DELETE' });
    toast('Đã xóa');
    log(data);
    searchFiles($('#searchInput').value.trim());
    loadFolders();
  } catch (err) { toast(err.msg || 'Xóa lỗi', 'bad'); log(err); }
}
async function renameFile(id, oldName) {
  const name = prompt('Tên mới:', oldName || '');
  if (!name) return;
  try {
    const data = await api(`/api/file/${encodeURIComponent(id)}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
    toast('Đã đổi tên');
    log(data);
    searchFiles($('#searchInput').value.trim());
  } catch (err) { toast(err.msg || 'Đổi tên lỗi', 'bad'); log(err); }
}

$$('.tab').forEach(btn => btn.addEventListener('click', () => {
  $$('.tab').forEach(b => b.classList.remove('active'));
  $$('.panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  $('#' + btn.dataset.tab).classList.add('active');
  if (btn.dataset.tab === 'files') searchFiles($('#searchInput').value.trim());
}));

$('#folderSelect').addEventListener('change', (e) => {
  const opt = e.target.selectedOptions[0];
  const name = opt.textContent.replace(/^📁\s*/, '').replace(' - ngoài cùng', '');
  setFolder(e.target.value, name);
  toast(`Đã chọn: ${name}`);
});
$('#refreshBtn').addEventListener('click', async () => { await loadFolders(); await searchFiles($('#searchInput').value.trim()); });
$('#fileInput').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  $('#fileNameText').textContent = file ? file.name : 'Chạm để chọn file';
  if (file && !$('#diyNameInput').value) $('#diyNameInput').value = file.name;
});
$('#uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const bar = $('#progressBar');
  $('#progressWrap').classList.remove('hidden');
  bar.style.width = '12%';
  $('#progressText').textContent = 'Đang chuẩn bị upload...';
  try {
    bar.style.width = '45%';
    $('#progressText').textContent = 'Đang gửi file lên TeleBox...';
    const data = await api('/api/upload', { method:'POST', body: fd });
    bar.style.width = '100%';
    $('#progressText').textContent = 'Upload xong';
    toast('Upload thành công');
    log(data);
    e.currentTarget.reset();
    $('#fileNameText').textContent = 'Chạm để chọn file';
    $('#uploadPid').value = state.folderId;
    setTimeout(() => $('#progressWrap').classList.add('hidden'), 1200);
  } catch (err) {
    $('#progressText').textContent = 'Upload lỗi';
    toast(err.msg || 'Upload lỗi', 'bad');
    log(err);
  }
});
$('#folderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.currentTarget));
  try {
    const data = await api('/api/folder', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    toast('Đã tạo thư mục');
    log(data);
    e.currentTarget.reset();
    $('#folderPid').value = state.folderId;
    await loadFolders();
  } catch (err) { toast(err.msg || 'Tạo folder lỗi', 'bad'); log(err); }
});
$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); searchFiles($('#searchInput').value.trim()); });
$('#results').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.openFolder) { setFolder(btn.dataset.openFolder, btn.dataset.name || 'Folder'); searchFiles(''); }
  if (btn.dataset.share) shareItem(btn.dataset.kind, btn.dataset.share);
  if (btn.dataset.rename) renameFile(btn.dataset.rename, btn.dataset.name);
  if (btn.dataset.delete) deleteItem(btn.dataset.kind, btn.dataset.delete);
});
$('#shareForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); await shareItem(f.kind, f.id);
});
$('#renameForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); await renameFile(f.id, f.name);
});
$('#deleteForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); await deleteItem(f.kind, f.id);
});
$('#toggleLog').addEventListener('click', () => {
  $('#log').classList.toggle('hidden');
  $('#toggleLog').textContent = $('#log').classList.contains('hidden') ? 'Hiện log kỹ thuật' : 'Ẩn log kỹ thuật';
});

(async function init(){
  renderResults([]);
  renderFolderOptions();
  await checkHealth();
  await loadFolders();
})();
