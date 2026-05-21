const $ = s => document.querySelector(s);
const itemsBox = $('#items');
const logBox = $('#log');
const toastBox = $('#toast');
const folderSelects = [$('#uploadFolder'), $('#createFolderParent')];
let currentFolder = { id: '0', name: 'Root' };
let folderOptions = [{ id: '0', name: '📁 Root' }];
let historyStack = [{ id: '0', name: 'Root' }];

function toast(msg){ toastBox.textContent = msg; toastBox.classList.add('show'); setTimeout(()=>toastBox.classList.remove('show'), 2300); }
function log(data){
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  logBox.textContent = text && text !== '{}' ? text : 'Không có chi tiết lỗi từ server. Bấm nút Kiểm tra API để xem TeleBox/Vercel trả gì.';
}
function esc(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function fmtSize(v){ const n=Number(v); if(!n) return ''; const u=['B','KB','MB','GB']; let i=0,x=n; while(x>1024&&i<u.length-1){x/=1024;i++} return `${x.toFixed(i?1:0)} ${u[i]}`; }

async function api(path, opts={}){
  const res = await fetch(path, opts);
  const data = await res.json().catch(()=>({status:0,msg:'Không đọc được phản hồi server'}));
  if(!res.ok) throw data;
  return data;
}

function setSelects(){
  const html = folderOptions.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
  folderSelects.forEach(sel=>{ sel.innerHTML = html; sel.value = currentFolder.id; });
}
function rememberFolders(list){
  const map = new Map(folderOptions.map(f=>[String(f.id), f]));
  for(const it of list){ if(it.folder && it.id) map.set(String(it.id), {id:String(it.id), name:'📁 '+it.name}); }
  folderOptions = [...map.values()]; setSelects();
}
function renderCrumbs(){
  $('#currentFolderName').textContent = '📁 ' + currentFolder.name;
  $('#crumbs').innerHTML = historyStack.map((f,i)=>`<button data-idx="${i}">${i===0?'Root':esc(f.name)}</button>`).join('');
  $('#crumbs').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    const idx = Number(b.dataset.idx); historyStack = historyStack.slice(0, idx+1); openFolder(historyStack[idx].id, historyStack[idx].name, false);
  });
}

async function openFolder(id='0', name='Root', push=true){
  currentFolder = { id:String(id||0), name:name||'Root' };
  if(push){ const last=historyStack[historyStack.length-1]; if(String(last.id)!==String(id)) historyStack.push(currentFolder); }
  renderCrumbs(); setSelects(); itemsBox.innerHTML = '<p class="muted">Đang tải...</p>';
  try{
    const data = await api('/api/folder/'+encodeURIComponent(currentFolder.id));
    const list = data.list || [];
    rememberFolders(list);
    renderItems(list);
    log({msg:'Đã tải thư mục', folder:currentFolder, count:list.length});
  }catch(e){ itemsBox.innerHTML='<p class="muted">Không tải được thư mục. Có thể TeleBox không cho liệt kê root bằng API search rỗng. Bạn vẫn có thể tạo thư mục/upload, hoặc bấm Kiểm tra API.</p>'; log(e); }
}

function renderItems(list){
  if(!list.length){ itemsBox.innerHTML='<p class="muted">Thư mục này đang trống.</p>'; return; }
  itemsBox.innerHTML = list.map(it=>{
    const icon = it.folder ? '📁' : (it.image ? '🖼️' : '📄');
    const thumb = it.image && it.thumb ? `<img src="${esc(it.thumb)}" onerror="this.remove()">` : icon;
    return `<article class="item">
      <div class="thumb">${thumb}</div>
      <div>
        <h3>${esc(it.name)}</h3>
        <div class="meta">
          <span>${it.folder?'Thư mục':'File'}</span>
          ${it.size?`<span>${esc(fmtSize(it.size))}</span>`:''}
          <span>ID: ${esc(it.id)}</span>
        </div>
      </div>
      <div class="actions">
        ${it.folder?`<button data-open="${esc(it.id)}" data-name="${esc(it.name)}">Mở</button>`:''}
        <button data-share="${esc(it.id)}" data-folder="${it.folder?1:0}">Share</button>
        ${!it.folder?`<button data-rename="${esc(it.id)}" data-name="${esc(it.name)}">Đổi tên</button>`:''}
        <button class="danger" data-del="${esc(it.id)}" data-folder="${it.folder?1:0}">Xóa</button>
      </div>
    </article>`;
  }).join('');
  itemsBox.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openFolder(b.dataset.open,b.dataset.name,true));
  itemsBox.querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>shareItem(b.dataset.share,b.dataset.folder==='1'));
  itemsBox.querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>renameFile(b.dataset.rename,b.dataset.name));
  itemsBox.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteItem(b.dataset.del,b.dataset.folder==='1'));
}

async function shareItem(id,isFolder){
  try{
    const data = await api(`/api/${isFolder?'folder':'file'}/${encodeURIComponent(id)}/share`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expire_enum:4})});
    log(data); toast('Đã tạo link share');
  }catch(e){ log(e); toast('Share lỗi'); }
}
async function renameFile(id,oldName){
  const name = prompt('Tên file mới:', oldName||''); if(!name) return;
  try{ const data = await api('/api/file/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}); log(data); toast('Đã đổi tên'); openFolder(currentFolder.id,currentFolder.name,false); }
  catch(e){ log(e); toast('Đổi tên lỗi'); }
}
async function deleteItem(id,isFolder){
  if(!confirm(`Xóa ${isFolder?'thư mục':'file'} này?`)) return;
  try{ const data = await api(`/api/${isFolder?'folder':'file'}/`+encodeURIComponent(id),{method:'DELETE'}); log(data); toast('Đã xóa'); openFolder(currentFolder.id,currentFolder.name,false); }
  catch(e){ log(e); toast('Xóa lỗi'); }
}

$('#fileInput').addEventListener('change', e=>{
  const files=[...e.target.files]; $('#fileText').textContent = files.length ? files.map(f=>f.name).join(', ') : 'Chưa chọn file nào';
});
$('#uploadForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const progress=$('#uploadProgress'); progress.classList.remove('hidden'); progress.firstElementChild.style.width='35%';
  try{
    const fd=new FormData(e.currentTarget); if(!fd.get('pid')) fd.set('pid', currentFolder.id);
    log('Đang upload...');
    const data=await api('/api/upload',{method:'POST',body:fd}); progress.firstElementChild.style.width='100%'; log(data); toast(data.msg||'Upload xong'); e.currentTarget.reset(); $('#fileText').textContent='Chưa chọn file nào'; openFolder(currentFolder.id,currentFolder.name,false);
  }catch(err){ log(err); toast('Upload lỗi'); }
  setTimeout(()=>{progress.classList.add('hidden'); progress.firstElementChild.style.width='0'},900);
});
$('#folderForm').addEventListener('submit', async e=>{
  e.preventDefault();
  try{ const body=Object.fromEntries(new FormData(e.currentTarget)); const data=await api('/api/folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); log(data); toast('Đã tạo thư mục'); e.currentTarget.reset(); openFolder(currentFolder.id,currentFolder.name,false); }
  catch(err){ log(err); toast(err?.msg || 'Tạo thư mục lỗi'); }
});
$('#searchForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const form=Object.fromEntries(new FormData(e.currentTarget));
  try{ const qs=new URLSearchParams({name:form.name||'',pid:currentFolder.id,pageNo:1,pageSize:80}); const data=await api('/api/search?'+qs); renderItems(data.list||[]); log(data); }
  catch(err){ log(err); toast('Tìm kiếm lỗi'); }
});
$('#refreshBtn').onclick=()=>openFolder(currentFolder.id,currentFolder.name,false);
const diagBtn = document.createElement('button');
diagBtn.type = 'button'; diagBtn.className = 'ghost'; diagBtn.textContent = '🧪 Kiểm tra API';
diagBtn.onclick = async()=>{ try{ log('Đang kiểm tra API...'); const d=await api('/api/diagnose'); log(d); toast('Đã kiểm tra API'); }catch(e){ log(e); toast('Kiểm tra API lỗi'); } };
document.querySelector('.toolbar')?.appendChild(diagBtn);
$('#openCurrentBtn').onclick=()=>openFolder(currentFolder.id,currentFolder.name,false);
$('#goRootBtn').onclick=()=>{historyStack=[{id:'0',name:'Root'}]; openFolder('0','Root',false)};

openFolder('0','Root',false);
