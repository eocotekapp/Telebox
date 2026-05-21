const logEl = document.getElementById('log');
const configEl = document.getElementById('config');

function pretty(obj) { return JSON.stringify(obj, null, 2); }
function setLog(title, data) { logEl.textContent = `${title}\n\n${pretty(data)}`; }
function clearLog() { logEl.textContent = 'Chưa có log.'; }
async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { httpStatus: res.status, raw: text }; }
}
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    configEl.textContent = `Token: ${data.tokenPreview} • Base: ${data.base} • Node: ${data.node}`;
  } catch (e) {
    configEl.textContent = 'Không tải được config: ' + e.message;
  }
}
async function runAll() {
  setLog('Đang chạy test tổng hợp...', {});
  const res = await fetch('/api/test/all');
  setLog('Kết quả test tổng hợp', await res.json());
}
async function testFolderDetails() {
  setLog('Đang test folder_details root...', {});
  const data = await postJson('/api/test/folder-details', { dirId: 0 });
  setLog('Kết quả folder_details root', data);
}
async function testSearch() {
  setLog('Đang test search root...', {});
  const data = await postJson('/api/test/search', { name: '', pid: 0, pageNo: 1, pageSize: 20, method: 'GET' });
  setLog('Kết quả search root', data);
}
async function createFolder() {
  const body = {
    name: document.getElementById('folderName').value.trim() || `api-test-${Date.now()}`,
    pid: Number(document.getElementById('folderPid').value || 0),
    desc: 'Created from TeleBox API Tester',
    method: document.getElementById('folderMethod').value
  };
  setLog('Đang tạo folder...', body);
  const data = await postJson('/api/test/create-folder', body);
  setLog('Kết quả tạo folder', data);
}
async function uploadText() {
  const body = {
    pid: Number(document.getElementById('uploadPid').value || 0),
    filename: document.getElementById('uploadName').value.trim() || `telebox-test-${Date.now()}.txt`,
    content: document.getElementById('uploadContent').value
  };
  setLog('Đang upload text test...', body);
  const data = await postJson('/api/test/upload-text', body);
  setLog('Kết quả upload text test', data);
}
async function uploadRealFile() {
  const fileInput = document.getElementById('realFile');
  if (!fileInput.files[0]) return alert('Chọn file trước đã');
  const fd = new FormData();
  fd.append('pid', document.getElementById('realPid').value || '0');
  fd.append('filename', document.getElementById('realName').value.trim() || fileInput.files[0].name);
  fd.append('file', fileInput.files[0]);
  setLog('Đang upload file thật...', { file: fileInput.files[0].name, size: fileInput.files[0].size });
  const res = await fetch('/api/test/upload-file', { method: 'POST', body: fd });
  const data = await res.json();
  setLog('Kết quả upload file thật', data);
}
async function shareFolder() {
  const dirId = document.getElementById('shareDirId').value.trim();
  if (!dirId) return alert('Nhập Folder ID trước');
  setLog('Đang tạo share folder...', { dirId });
  const data = await postJson('/api/test/share-folder', { dirId, expire_enum: 4 });
  setLog('Kết quả share folder', data);
}
loadConfig();
