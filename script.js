/* =========================
   CA Dashboard — Firebase RTDB (Compat)
   + Lightweight PDF export (~300 KB) & Edit-from-PDF
   ========================= */

/* ---------- Utilities ---------- */
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const $  = (sel, root=document) => root.querySelector(sel);
const el = (id) => document.getElementById(id);
const fmtMoney = n => (Number(n||0)).toLocaleString('en-IN',{maximumFractionDigits:2});
const todayStr = () => new Date().toISOString().slice(0,10);
const yymm = (dstr) => (dstr||'').slice(0,7);
const DIGITS = /[\d,]+(?:\.\d{1,2})?/;
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]))}

/* =========================
   Typeahead (datalist) for Client & Title
   ========================= */
function ensureDatalist(id){
  let dl = document.getElementById(id);
  if(!dl){
    dl = document.createElement('datalist');
    dl.id = id;
    document.body.appendChild(dl);
  }
  return dl;
}
function updateDatalist(id, items){
  const dl = ensureDatalist(id);
  if(!Array.isArray(items)) items = [];
  dl.innerHTML = items.map(v => `<option value="${esc(v)}"></option>`).join('');
}
function initCombo(inputId, hiddenId, listId){
  const input = document.getElementById(inputId);
  const hidden = document.getElementById(hiddenId);
  if(!input || !hidden) return;
  input.setAttribute('list', listId);
  const sync = ()=> hidden.value = (input.value||'').trim();
  input.addEventListener('input', sync);
  input.addEventListener('change', sync);
  sync();
}

/* Make datalist behave like a suggestions menu with an "Add ..." affordance */
function enableSuggestWithAdd(inputId, listId, itemsProvider){
  const input = document.getElementById(inputId);
  if (!input) return;

  const normalize = s => String(s||'').trim();
  const eq = (a,b) => normalize(a).toLowerCase() === normalize(b).toLowerCase();

  function refresh(){
    const term = normalize(input.value);
    let items = (typeof itemsProvider === 'function' ? (itemsProvider()||[]) : []).slice();

    // If user typed something not present, append it as a candidate
    if (term && !items.some(v => eq(v, term))) items.push(term);

    // Re-render the datalist with a label for the "add" candidate
    const dl = ensureDatalist(listId);
    dl.innerHTML = items.map(v => {
      if (term && eq(v, term)) {
        return `<option value="${esc(v)}" label="➕ Add “${esc(v)}”"></option>`;
      }
      return `<option value="${esc(v)}"></option>`;
    }).join('');
  }

  // Update suggestions as user interacts
  input.addEventListener('focus', refresh);
  input.addEventListener('input', refresh);
}

function fmtDateDDMMYYYY(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function parseDDMM(dateStr){ const m = dateStr && dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; }
function addDays(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function lastDayOfMonth(y,m){ return new Date(y, m+1, 0).getDate(); }
function makeDateYMD(y,m,day){ const max=lastDayOfMonth(y,m); const d=Math.min(day,max); return new Date(y,m,d).toISOString().slice(0,10); }
function prioRank(p){ return ({High:1, Medium:2, Low:3}[p]||9); }

/* =========================
   Task Title dropdown (select + custom)
   ========================= */
function getAllTitles(){
  const seen = new Set(); const out = [];
  for(const t of tasks){
    const title = (t && t.title ? String(t.title).trim() : '');
    if(title && !seen.has(title)){ seen.add(title); out.push(title); }
  }
  out.sort((a,b)=> a.localeCompare(b));
  return out;
}
function refreshTitleOptions(){
  const sel = document.getElementById('fTitleSelect');
  if(!sel) return;
  const cur = sel.value;
  const titles = getAllTitles();
  const opts = ['<option value="">Select Title</option>']
    .concat(titles.map(t=>`<option value="${t.replace(/"/g,'&quot;')}">${t.replace(/</g,'&lt;')}</option>`))
    .concat(['<option value="__new__">➕ New title…</option>']);
  sel.innerHTML = opts.join('');
  if(cur && [...sel.options].some(o=>o.value===cur)){ sel.value = cur; }
  toggleTitleCustom(sel.value);

// Typeahead: ALWAYS use the input with suggestions; keep <select> hidden  (TITLE)
try{
  updateDatalist('titleList', getAllTitles());
  const sel = document.getElementById('fTitleSelect');
  const inp = document.getElementById('fTitleNew');
  if (sel) sel.style.display = 'none';     // hide the select entirely
  if (inp) {
    inp.style.display = '';                 // show the input always
    initCombo('fTitleNew','fTitle','titleList');                   // keep hidden #fTitle in sync
    enableSuggestWithAdd('fTitleNew','titleList', getAllTitles);   // “Add …” affordance
  }
}catch(e){}
}
function toggleTitleCustom(val){
  const custom = document.getElementById('fTitleNew');
  if(!custom) return;
  custom.style.display = (val==='__new__') ? '' : 'none';
}

/* =========================
   Client dropdown (select + custom)
   ========================= */
function getAllClients(){
  const seen = new Set(); const out = [];
  for(const t of tasks){
    const client = (t && t.client ? String(t.client).trim() : '');
    if(client && !seen.has(client)){ seen.add(client); out.push(client); }
  }
  out.sort((a,b)=> a.localeCompare(b));
  return out;
}
function refreshClientOptions(){
  const sel = document.getElementById('fClientSelect');
  if(!sel) return;
  const cur = sel.value;
  const clients = getAllClients();
  const opts = ['<option value="">Select Client</option>']
    .concat(clients.map(c=>`<option value="${c.replace(/"/g,'&quot;')}">${c.replace(/</g,'&lt;')}</option>`))
    .concat(['<option value="__new__">➕ New client…</option>']);
  sel.innerHTML = opts.join('');
  if(cur && [...sel.options].some(o=>o.value===cur)){ sel.value = cur; }
  toggleClientCustom(sel.value);

// Typeahead: ALWAYS use the input with suggestions; keep <select> hidden  (CLIENT)
try{
  updateDatalist('clientList', getAllClients());
  const sel = document.getElementById('fClientSelect');
  const inp = document.getElementById('fClientNew');
  if (sel) sel.style.display = 'none';     // hide the select entirely
  if (inp) {
    inp.style.display = '';                 // show the input always
    initCombo('fClientNew','fClient','clientList');                 // keep hidden #fClient in sync
    enableSuggestWithAdd('fClientNew','clientList', getAllClients); // “Add …” affordance
  }
}catch(e){}
}
function toggleClientCustom(val){
  const custom = document.getElementById('fClientNew');
  if(!custom) return;
  custom.style.display = (val==='__new__') ? '' : 'none';
}



/* ---------- Firebase Config (your real keys) ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyCpBJUNBB-ncgcDwq6CjDqkjkaSp4Gky-w",
  authDomain: "sanjeevsriram-1b0e4.firebaseapp.com",
  projectId: "sanjeevsriram-1b0e4",
  storageBucket: "sanjeevsriram-1b0e4.firebasestorage.app",
  messagingSenderId: "265405165493",
  appId: "1:265405165493:web:f23b52369f0920dfd533fc",
  measurementId: "G-92M9Z1L7W3"
};
if (typeof firebase === 'undefined') {
  console.error('Firebase SDK not loaded. Ensure compat scripts are before script.js.');
}
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const rtdb = firebase.database();

/* ---------- Workspace ---------- */
const WORKSPACE = 'insight-dashboard-1408';
const tasksRef = rtdb.ref(`workspaces/${WORKSPACE}/tasks`);
const skipsRef = rtdb.ref(`workspaces/${WORKSPACE}/skips`);

/* ---------- App State ---------- */
let tasks = [];
let skips = [];
let selectedIds = new Set();
let isListening = false;

/* ---------- Realtime listeners ---------- */
function startRealtime(){
  if (isListening) return;
  isListening = true;

  skipsRef.on('value', snap => {
    const obj = snap.val() || {};
    const arr = Object.values(obj);
    skips = arr.map(s => ({ id: s.id || `${s.recurringId}_${s.period}`, recurringId: s.recurringId, period: s.period }));
    render();
  });

  tasksRef.on('value', async snap => {
    const obj = snap.val() || {};
    tasks = Object.values(obj);
    try { await ensureRecurringInstances(); }
    catch (e) { console.error('ensureRecurringInstances failed:', e); }
    render();
  }, err => {
    console.error('RTDB listener error:', err?.message || err);
  });
}
function teardownRealtime(){
  if (!isListening) return;
  isListening = false;
  tasksRef.off(); skipsRef.off();
  tasks=[]; skips=[]; selectedIds.clear();
  render();
}

/* ---------- Skip helpers ---------- */
function isSkipped(recurringId, period){
  return !!skips.find(s => s.recurringId === recurringId && s.period === period);
}
async function addSkip(recurringId, period){
  if (!recurringId || !period || isSkipped(recurringId, period)) return;
  const id = `${recurringId}_${period}`;
  await skipsRef.child(id).set({ id, recurringId, period, createdAt: Date.now() }).catch(e => alert('Write failed (skips): ' + e.message));
}
async function removeSkipsForSeries(recurringId){
  const toRemove = skips.filter(s => s.recurringId === recurringId);
  for (const s of toRemove) { await skipsRef.child(s.id).remove().catch(()=>{}); }
}

/* ---------- Recurring generation (duplicate-proof) ---------- */
const HORIZON_MONTHS = 9;
let isGenerating = false;

async function ensureRecurringInstances() {
  if (isGenerating) return;
  isGenerating = true;
  try {
    const now = new Date();
    const templates = tasks.filter(t => t.recur && !t.period);

    const existingKeys = new Set(
      tasks
        .filter(t => t.period && t.recurringId)
        .map(t => `${t.recurringId}|${t.period}`)
    );

    const updates = {};
    for (const tpl of templates) {
      const rid = tpl.recurringId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()));
      let startY, startM;
      if (tpl.deadline && /^\d{4}-\d{2}-\d{2}$/.test(tpl.deadline)) {
        const [y, m] = tpl.deadline.split('-').map(Number);
        startY = y; startM = m - 1;
      } else {
        startY = now.getFullYear(); startM = now.getMonth();
      }
      const recurDay = tpl.recurDay || (tpl.deadline ? Number(tpl.deadline.slice(8,10)) : now.getDate());

      if (!tpl.recurringId || tpl.recurDay !== recurDay) {
        updates[`workspaces/${WORKSPACE}/tasks/${tpl.id}/recurringId`] = rid;
        updates[`workspaces/${WORKSPACE}/tasks/${tpl.id}/recurDay`]    = recurDay;
        tpl.recurringId = rid; tpl.recurDay = recurDay;
      }

      const step = tpl.recurQuarterly ? 3 : 1;
      for (let i = 0; i < HORIZON_MONTHS; i += step) {
        const y = startY + Math.floor((startM + i) / 12);
        const m = (startM + i) % 12;
        const period = `${y}-${String(m+1).padStart(2, '0')}`;
        const key = `${rid}|${period}`;
        if (existingKeys.has(key) || isSkipped(rid, period)) continue;

        const id = `${rid}_${period}`;
        const deadline = makeDateYMD(y, m, recurDay);

        updates[`workspaces/${WORKSPACE}/tasks/${id}`] = {
          id,
          client: tpl.client,
          title: tpl.title,
          priority: tpl.priority,
          assignee: tpl.assignee,
          status: 'Not Started',
          fee: Number(tpl.fee || 0),
          advance: 0,
          invoiceStatus: 'Not Raised',
          notes: tpl.notes || '',
          recur: true,
          recurDay,
          recurQuarterly: !!tpl.recurQuarterly,
          recurringId: rid,
          deadline,
          createdAt: Date.now(),
          period
        };
        existingKeys.add(key);
      }
    }

    if (Object.keys(updates).length) {
      await rtdb.ref().update(updates);
    }
  } finally {
    isGenerating = false;
  }
}

/* ---------- Rendering ---------- */
function render(){
  const tbody = $('#taskTbody'); if (!tbody) return;

  const q  = ($('#searchInput')?.value || '').trim().toLowerCase();
  const pf = $('#priorityFilter')?.value || '';
  const sfRaw = $('#statusFilter')?.value || '';
  const sf = sfRaw ? new Set(sfRaw.split('|')) : null;
  const af = $('#assigneeFilter')?.value || '';
  const mf = $('#monthFilter')?.value || '';

  let filtered = tasks.filter(t => !(t.recur && !t.period));
  filtered = filtered.filter(t => {
    const matchQ = !q || [t.client,t.title,t.assignee,(t.notes||'')].some(x => String(x||'').toLowerCase().includes(q));
    const matchP = !pf || t.priority === pf;
    const matchS = !sf || sf.has(t.status);
    const matchA = !af || t.assignee === af;
    const matchM = !mf || yymm(t.deadline) === mf;
    return matchQ && matchP && matchS && matchA && matchM;
  });

  const sortBy = $('#sortBy')?.value || 'deadline';
  const dir = ($('#sortDir')?.value || 'asc') === 'asc' ? 1 : -1;
  filtered.sort((a,b)=>{
    if (sortBy==='deadline')  return (a.deadline||'').localeCompare(b.deadline||'') * dir;
    if (sortBy==='createdAt') return ((a.createdAt||0)-(b.createdAt||0)) * dir;
    if (sortBy==='priority')  return (prioRank(a.priority)-prioRank(b.priority)) * dir;
    if (sortBy==='status')    return (a.status||'').localeCompare(b.status||'') * dir;
    if (sortBy==='fee')       return ((a.fee||0)-(b.fee||0)) * dir;
    return 0;
  });

  const assignees = [...new Set(tasks.filter(t=>!(t.recur && !t.period)).map(t=>t.assignee).filter(Boolean))].sort();
  const afSel = $('#assigneeFilter');
  if (afSel) {
    const cur = afSel.value;
    afSel.innerHTML = '<option value="">In-Charge: All</option>' + assignees.map(a=>`<option ${a===cur?'selected':''}>${esc(a)}</option>`).join('');
  }

  const months = [...new Set(tasks.filter(t=>t.deadline).map(t=>yymm(t.deadline)))].sort();
  const mfSel = $('#monthFilter');
  if (mfSel){
    const cur = mfSel.value;
    mfSel.innerHTML = '<option value="">Month: All</option>' + months.map(m=>`<option ${m===cur?'selected':''} value="${m}">${formatMonthLabel(m)}</option>`).join('');
  }

  tbody.innerHTML = filtered.map(rowHtml).join('');

  for (const cb of $$('#taskTbody input[type="checkbox"].row-select')) {
    cb.checked = selectedIds.has(cb.dataset.id);
  }

  const now = todayStr();
  const visible = tasks.filter(t=>!(t.recur && !t.period));
  const total = visible.length;
  const pending = visible.filter(t=>t.status!=='Completed').length;
  const overdue = visible.filter(t=>t.status!=='Completed' && t.deadline && t.deadline < now).length;
  const sumFee = visible.reduce((s,t)=>s+Number(t.fee||0),0);
  const sumAdv = visible.reduce((s,t)=>s+Number(t.advance||0),0);
  const sumOut = sumFee - sumAdv;
  $('#kpiTotal') && ($('#kpiTotal').textContent = total);
  $('#kpiPending') && ($('#kpiPending').textContent = pending);
  $('#kpiOverdue') && ($('#kpiOverdue').textContent = overdue);
  $('#kpiFee') && ($('#kpiFee').textContent = fmtMoney(sumFee));
  $('#kpiAdv') && ($('#kpiAdv').textContent = fmtMoney(sumAdv));
  $('#kpiOut') && ($('#kpiOut').textContent = fmtMoney(sumOut));

  updateSelectAllState();

  try{ refreshTitleOptions(); }catch(e){}
  try{ refreshClientOptions(); }catch(e){}
}
function formatMonthLabel(m){
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo-1, 1).toLocaleString('en-IN',{month:'short', year:'numeric'});
}
function rowHtml(t){
  const out = (Number(t.fee||0) - Number(t.advance||0));
  const overdue = t.deadline && t.deadline < todayStr() && t.status !== 'Completed';
  const recBadge = t.recur ? ` <span class="badge recurring" title="${t.recurQuarterly?'Recurring quarterly':'Recurring monthly'}">${t.recurQuarterly?'Quarterly':'Monthly'}</span>` : '';
  return `<tr class="row" data-id="${esc(t.id)}">
    <td><input type="checkbox" class="row-select" data-id="${esc(t.id)}" onchange="toggleSelect('${esc(t.id)}', this.checked)"></td>
    <td title="${esc(t.notes||'')}"><strong>${esc(t.client)}</strong></td>
    <td>${esc(t.title)}${recBadge}</td>
    <td><span class="badge priority ${esc((t.priority||'').toLowerCase())}">${esc(t.priority||'')}</span></td>
    <td>${esc(t.assignee||'')}</td>
    <td>
      <select class="status" onchange="changeStatus('${esc(t.id)}', this.value)">
        ${['Not Started','In Progress','Waiting Client','On Hold','Completed'].map(s=>`<option ${s===t.status?'selected':''}>${s}</option>`).join('')}
      </select>
    </td>
    <td class="${overdue?'overdue':''}">${fmtDateDDMMYYYY(t.deadline)||''}</td>
    <td class="money">₹ ${fmtMoney(t.fee||0)}</td>
    <td class="money">₹ ${fmtMoney(t.advance||0)}</td>
    <td class="money">₹ ${fmtMoney(out)}</td>
    <td>
      <select class="status" onchange="changeInvoiceStatus('${t.id}', this.value)">
        ${['Not Raised','Sent','Paid','Partially Paid'].map(s=>`<option ${s===(t.invoiceStatus||'Not Raised')?'selected':''}>${s}</option>`).join('')}
      </select>
    </td>
    <td>
      <button class="btn ghost" onclick="editTask('${esc(t.id)}')">Edit</button>
    </td>
  </tr>`;
}

/* ---------- Selection & Bulk ---------- */
function toggleSelect(id, checked){ checked ? selectedIds.add(id) : selectedIds.delete(id); updateSelectAllState(); }
function updateSelectAllState(){
  const rows = $$('#taskTbody tr');
  const ids = new Set(rows.map(r=>r.dataset.id));
  const allChecked = rows.length>0 && [...ids].every(id=>selectedIds.has(id));
  const selAll = $('#selectAll'); if (selAll) selAll.checked = allChecked;
}
window.toggleSelect = toggleSelect;

/* ---------- CRUD ---------- */
async function changeStatus(id, val){
  if (!id) return;
  await tasksRef.child(id).update({ status: val }).catch(e => alert('Update failed: '+e.message));
}
window.changeStatus = changeStatus;

async function delTask(id){
  const t = tasks.find(x=>x.id===id); if(!t) return;
  if (t.recur && !t.period && t.recurringId){
    if(!confirm('Delete this recurring template and all its instances?')) return;
    await tasksRef.child(id).remove().catch(e=>alert('Delete failed: '+e.message));
    const inst = tasks.filter(x=>x.recurringId===t.recurringId && x.period);
    for (const it of inst) await tasksRef.child(it.id).remove().catch(()=>{});
    await removeSkipsForSeries(t.recurringId);
  } else if (t.recur && t.period && t.recurringId){
    if(!confirm('Delete this recurring instance for this month?')) return;
    await addSkip(t.recurringId, t.period);
    await tasksRef.child(id).remove().catch(e=>alert('Delete failed: '+e.message));
  } else {
    if(!confirm('Delete this task?')) return;
    await tasksRef.child(id).remove().catch(e=>alert('Delete failed: '+e.message));
  }
  selectedIds.delete(id);
}
window.delTask = delTask;

/* ---------- Modal handling ---------- */
const modal = $('#taskModal');
const taskForm = $('#taskForm');
function openModal(title){
  if (modal) {
    $('#taskModalTitle') && ($('#taskModalTitle').textContent = title||'Task');
    modal.classList.add('active');
    setTimeout(()=> (document.getElementById('fClientNew')||document.getElementById('fClient'))?.focus(), 20);
  }
}
function closeModal(){ modal && modal.classList.remove('active'); }

// Title select change -> show/hide custom input and keep hidden #fTitle in sync
(function initTitleSelect(){
  const sel = document.getElementById('fTitleSelect');
  const hidden = document.getElementById('fTitle');
  const custom = document.getElementById('fTitleNew');
  if(!sel || !hidden || !custom) return;
  sel.addEventListener('change', ()=>{
    toggleTitleCustom(sel.value);
    if(sel.value==='__new__'){
      custom.focus();
      hidden.value = (custom.value||'').trim();
    } else {
      hidden.value = (sel.value||'').trim();
    }
  });
  custom.addEventListener('input', ()=>{
    if(sel.value==='__new__'){
      hidden.value = (custom.value||'').trim();
    }
  });
})();

// Client select change -> show/hide custom input and keep hidden #fClient in sync
(function initClientSelect(){
  const sel = document.getElementById('fClientSelect');
  const hidden = document.getElementById('fClient');
  const custom = document.getElementById('fClientNew');
  if(!sel || !hidden || !custom) return;
  sel.addEventListener('change', ()=>{
    toggleClientCustom(sel.value);
    if(sel.value==='__new__'){
      custom.focus();
      hidden.value = (custom.value||'').trim();
    } else {
      hidden.value = (sel.value||'').trim();
    }
  });
  custom.addEventListener('input', ()=>{
    if(sel.value==='__new__'){
      hidden.value = (custom.value||'').trim();
    }
  });
})();



$('#addTaskBtn') && ($('#addTaskBtn').onclick = async ()=>{
  if (taskForm) {
    taskForm.reset(); delete taskForm.dataset.editId;
    $('#fDeadline') && ($('#fDeadline').value = todayStr());
    openModal('New Task');
    try{ document.getElementById('fRecurringQ').checked = false; }catch(e){}
  } else {
    try { await createTaskByPrompt(); }
    catch(e){ alert('Add failed: ' + (e?.message||e)); }
  }

    try{
      refreshTitleOptions();
      const selT = document.getElementById('fTitleSelect'), newT = document.getElementById('fTitleNew'), hidT = document.getElementById('fTitle');
      if(selT){ selT.value=''; toggleTitleCustom(selT.value); }
      if(newT){ newT.value=''; }
      if(hidT){ hidT.value=''; }
    }catch(e){}

    try{
      refreshClientOptions();
      const selC = document.getElementById('fClientSelect'), newC = document.getElementById('fClientNew'), hidC = document.getElementById('fClient');
      if(selC){ selC.value=''; toggleClientCustom(selC.value); }
      if(newC){ newC.value=''; }
      if(hidC){ hidC.value=''; }
    }catch(e){}

    // Typeahead reset
    try{
      refreshTitleOptions(); refreshClientOptions();
      const tI = document.getElementById('fTitleNew'), tH = document.getElementById('fTitle');
      const cI = document.getElementById('fClientNew'), cH = document.getElementById('fClient');
      if(tI){ tI.value=''; } if(tH){ tH.value=''; }
      if(cI){ cI.value=''; } if(cH){ cH.value=''; }
    }catch(e){}});
$('#cancelBtn') && ($('#cancelBtn').onclick = closeModal);
modal && (modal.addEventListener('click', e=>{ if(e.target===modal) closeModal(); }));

function editTask(id){
  const t = tasks.find(x=>x.id===id); if(!t) return;
  if (taskForm){
    openModal('Edit Task');
    taskForm.dataset.editId = id;
    document.getElementById('fClientNew') && (document.getElementById('fClientNew').value = t.client||''); document.getElementById('fClient') && (document.getElementById('fClient').value = t.client||'');
    document.getElementById('fTitleNew') && (document.getElementById('fTitleNew').value = t.title||''); document.getElementById('fTitle') && (document.getElementById('fTitle').value = t.title||'');
    $('#fPriority').value = t.priority||'Medium';
    $('#fAssignee').value = t.assignee||'';
    $('#fStatus').value = t.status||'In Progress';
    $('#fDeadline').value = t.deadline||'';
    $('#fFee').value = t.fee||0;
    $('#fAdvance').value = t.advance||0;
    $('#fInvoiceStatus').value = t.invoiceStatus||'';
    $('#fNotes').value = t.notes||'';
    $('#fRecurring') && ($('#fRecurring').checked = !!t.recur && !t.period);
    $('#fRecurringQ') && ($('#fRecurringQ').checked = !!t.recurQuarterly && !t.period);
  } else {
    editTaskByPrompt(t);
  }

  // Populate title select/custom
  try{
    refreshTitleOptions();
    (function(){
      const sel = document.getElementById('fTitleSelect');
      const custom = document.getElementById('fTitleNew');
      const hidden = document.getElementById('fTitle');
      const title = t.title||'';
      if(sel && [...sel.options].some(o=>o.value===title)){
        sel.value = title; toggleTitleCustom(sel.value); if(custom) custom.value=''; if(hidden) hidden.value=title;
      } else if(sel){
        sel.value='__new__'; toggleTitleCustom(sel.value); if(custom) custom.value=title; if(hidden) hidden.value=title;
      }
    })();
  }catch(e){}

  // Populate client select/custom
  try{
    refreshClientOptions();
    (function(){
      const sel = document.getElementById('fClientSelect');
      const custom = document.getElementById('fClientNew');
      const hidden = document.getElementById('fClient');
      const client = t.client||'';
      if(sel && [...sel.options].some(o=>o.value===client)){
        sel.value = client; toggleClientCustom(sel.value); if(custom) custom.value=''; if(hidden) hidden.value=client;
      } else if(sel){
        sel.value='__new__'; toggleClientCustom(sel.value); if(custom) custom.value=client; if(hidden) hidden.value=client;
      }
    })();
  }catch(e){}}
window.editTask = editTask;

async function changeInvoiceStatus(id, val){
  if (!id) return;
  try{
    await tasksRef.child(id).update({ invoiceStatus: val });
  } catch(e){
    alert('Update failed (invoice status): ' + (e?.message || e));
  }
}
window.changeInvoiceStatus = changeInvoiceStatus;

if (taskForm) {
  taskForm.addEventListener('submit', async (e)=>{
    // Ensure Title & Client from select/new
    const _titleVal = (document.getElementById('fTitleNew')?.value||document.getElementById('fTitle')?.value||'').trim();
const _clientVal = (document.getElementById('fClientNew')?.value||document.getElementById('fClient')?.value||'').trim();
if(!_titleVal){ e.preventDefault(); alert('Please select a Task Title or enter a new one.'); return; }
    if(!_clientVal){ e.preventDefault(); alert('Please select a Client or enter a new one.'); return; }
    e.preventDefault();
    const editId = taskForm.dataset.editId;
    const existing = editId ? tasks.find(x=>x.id===editId) : null;

    const isRecurringTemplate = $('#fRecurring')?.checked;
    const isRecurringQuarterly = $('#fRecurringQ')?.checked;
    const dval = $('#fDeadline')?.value || '';

    const data = {
      client: _clientVal,
      title: _titleVal,
      priority: $('#fPriority')?.value || 'Medium',
      assignee: $('#fAssignee')?.value.trim() || '',
      status: $('#fStatus')?.value || 'In Progress',
      deadline: dval,
      fee: Number($('#fFee')?.value || 0),
      advance: Number($('#fAdvance')?.value || 0),
      invoiceStatus: $('#fInvoiceStatus')?.value || '',
      notes: $('#fNotes')?.value?.trim() || ''
    };
    if (data.advance > data.fee){ alert('Advance cannot exceed total fee.'); return; }

    try{
      if (existing){
        const wasTemplate = !!existing.recur && !existing.period;
        if (wasTemplate){
          const recurDay = dval ? Number(dval.slice(8,10)) : new Date().getDate();
          const updates = { ...data, recur:true, recurDay, recurringId: existing.recurringId || (crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random())), recurQuarterly: !!isRecurringQuarterly };
          await tasksRef.child(existing.id).update(updates);
          const today = todayStr();
          const fut = tasks.filter(t=> t.recurringId===updates.recurringId && t.period && t.deadline>=today);
          for (const it of fut) await tasksRef.child(it.id).remove();
          await ensureRecurringInstances();
        } else {
          await tasksRef.child(existing.id).update(data);
        }
      } else {
        if (isRecurringTemplate || isRecurringQuarterly){
          const recurDay = dval ? Number(dval.slice(8,10)) : new Date().getDate();
          const rid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random());
          const id = rid;
          const tpl = { id, createdAt: Date.now(), ...data, recur:true, recurDay, recurringId: rid, period: null, ...(isRecurringQuarterly?{recurQuarterly:true}:{}) };
          await tasksRef.child(id).set(tpl);
          await ensureRecurringInstances();
        } else {
          const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random());
          await tasksRef.child(id).set({ id, createdAt: Date.now(), ...data });
        }
      }
    } catch(e){
      alert('Save failed: ' + e.message);
    }

    closeModal();
  });
}

/* ---------- Prompt-based create/edit (fallback if no modal) ---------- */
async function createTaskByPrompt(){
  const client = prompt('Client?'); if (client==null) return;
  const title = prompt('Task title?'); if (title==null) return;
  const priority = prompt('Priority (High/Medium/Low)?','Medium') || 'Medium';
  const assignee = prompt('In-Charge?') || '';
  const status = prompt('Status? (Not Started/In Progress/Waiting Client/On Hold/Completed)','In Progress') || 'In Progress';
  const deadline = prompt('Deadline (YYYY-MM-DD)?', todayStr()) || '';
  const fee = Number(prompt('Fee?','0')||0);
  const advance = Number(prompt('Advance?','0')||0);
  const invoiceDate = prompt('Invoice Date (YYYY-MM-DD)?','') || '';
  const notes = prompt('Notes?','') || '';
  const id = crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random());
  await tasksRef.child(id).set({ id, client, title, priority, assignee, status, deadline, fee, advance, invoiceDate, notes, createdAt: Date.now() });
}
async function editTaskByPrompt(t){
  const client = prompt('Client?', t.client||''); if (client==null) return;
  const title = prompt('Task title?', t.title||''); if (title==null) return;
  const priority = prompt('Priority (High/Medium/Low)?', t.priority||'Medium') || 'Medium';
  const assignee = prompt('In-Charge?', t.assignee||'') || '';
  const status = prompt('Status?', t.status||'In Progress') || 'In Progress';
  const deadline = prompt('Deadline (YYYY-MM-DD)?', t.deadline||todayStr()) || '';
  const fee = Number(prompt('Fee?', String(t.fee||0))||0);
  const advance = Number(prompt('Advance?', String(t.advance||0))||0);
  const invoiceDate = prompt('Invoice Date (YYYY-MM-DD)?', t.invoiceDate||'') || '';
  const notes = prompt('Notes?', t.notes||'') || '';
  await tasksRef.child(t.id).update({ client, title, priority, assignee, status, deadline, fee, advance, invoiceDate, notes });
}

/* ---------- Filters, select-all, bulk, export ---------- */
;['searchInput','priorityFilter','assigneeFilter','monthFilter','sortBy','sortDir']
.forEach(id=> document.getElementById(id)?.addEventListener('input', render));

const STATUS_OPTIONS = ['Not Started','In Progress','Waiting Client','On Hold','Completed'];
(function initStatusMulti(){
  const hidden = $('#statusFilter');
  const btn = $('#statusMultiBtn');
  const menu = $('#statusMultiMenu');
  const applyBtn = $('#statusApplyBtn');
  const clearBtn = $('#statusClearBtn');
  const sel = new Set();

  function updateButtonLabel(){
    if(sel.size===0){ btn.textContent = 'Status: All'; return; }
    if(sel.size===STATUS_OPTIONS.length){ btn.textContent = 'Status: All'; return; }
    btn.textContent = `Status: ${sel.size} selected`;
  }
  function syncHidden(){
    hidden.value = (sel.size===0 || sel.size===STATUS_OPTIONS.length) ? '' : [...sel].join('|');
  }
  function open(){ menu.hidden = false; document.addEventListener('click', onDocClick, { once:false }); }
  function close(){ menu.hidden = true; document.removeEventListener('click', onDocClick, { once:false }); }
  function onDocClick(e){
    if(menu.contains(e.target) || btn.contains(e.target)) return;
    close();
  }

  btn?.addEventListener('click', ()=>{ if(menu.hidden) open(); else close(); });
  menu?.querySelectorAll('input[type="checkbox"]').forEach(cb=>{
    cb.addEventListener('change', ()=>{ cb.checked ? sel.add(cb.value) : sel.delete(cb.value); });
  });
  applyBtn?.addEventListener('click', ()=>{ syncHidden(); updateButtonLabel(); close(); render(); });
  clearBtn?.addEventListener('click', ()=>{ sel.clear(); menu.querySelectorAll('input[type="checkbox"]').forEach(cb=> cb.checked=false); syncHidden(); updateButtonLabel(); close(); render(); });

  if(hidden?.value){
    hidden.value.split('|').forEach(v=>{ if(STATUS_OPTIONS.includes(v)) sel.add(v); });
    menu?.querySelectorAll('input[type="checkbox"]').forEach(cb=> cb.checked = sel.has(cb.value));
  }
  if(btn) updateButtonLabel();
})();

$('#selectAll')?.addEventListener('change', (e)=>{
  const rows = $$('#taskTbody tr');
  const ids = rows.map(r=>r.dataset.id);
  if (e.target.checked) ids.forEach(id=>selectedIds.add(id));
  else ids.forEach(id=>selectedIds.delete(id));
  render();
});

$('#bulkDeleteBtn')?.addEventListener('click', async ()=>{
  const visibleRows = $$('#taskTbody tr');
  const visibleIds = new Set(visibleRows.map(r=>r.dataset.id));
  const toActOn = [...selectedIds].filter(id=>visibleIds.has(id));
  if (toActOn.length===0){ alert('Select at least one task (visible).'); return; }
  const pass = prompt('Enter password to delete selected tasks:');
  if (pass !== '14Dec@1998'){ alert('Incorrect password.'); return; }
  if (!confirm(`Delete ${toActOn.length} task(s)? This cannot be undone.`)) return;

  const toDelete = new Set(toActOn);
  for (const t of tasks){
    if (!toDelete.has(t.id)) continue;
    if (t.recur && !t.period && t.recurringId){
      const inst = tasks.filter(x=>x.recurringId===t.recurringId && x.period);
      inst.forEach(i=>toDelete.add(i.id));
      await removeSkipsForSeries(t.recurringId);
    } else if (t.recur && t.period && t.recurringId){
      await addSkip(t.recurringId, t.period);
    }
  }
  for (const id of toDelete){ await tasksRef.child(id).remove().catch(()=>{}); }
  selectedIds.clear();
});

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  render();
  try{ refreshTitleOptions(); refreshClientOptions(); updateDatalist('titleList', getAllTitles()); updateDatalist('clientList', getAllClients()); initCombo('fTitleNew','fTitle','titleList'); initCombo('fClientNew','fClient','clientList'); }catch(e){}
  startRealtime();
});

/* =========================
   CREATE INVOICE FEATURE
   ========================= */
const invoiceModal = el('invoiceModal');
$('#createInvoiceBtn')?.addEventListener('click', ()=>{ openInvoiceModal(); autoPopulateInvoiceMeta(); });
$('#invoiceCancelBtn')?.addEventListener('click', ()=> invoiceModal.classList.remove('active'));
invoiceModal?.addEventListener('click', e=>{ if(e.target===invoiceModal) invoiceModal.classList.remove('active'); });
function openInvoiceModal(){ $('#invoiceModalTitle').textContent='Create Invoice'; invoiceModal.classList.add('active'); setTimeout(()=>$('#invClient').focus(),10); }

const serviceRows = el('serviceRows');
$('#addServiceRowBtn')?.addEventListener('click', ()=>addServiceRow());
function addServiceRow(desc='', amt=''){
  const idx = serviceRows.children.length + 1;
  const row = document.createElement('div');
  row.className='inv-row';
  row.innerHTML = `
    <span>${idx}</span>
    <input type="text" class="svc-desc" placeholder="Service description" value="${esc(desc)}">
    <input type="number" class="svc-amt" min="0" step="0.01" value="${amt}">
    <button type="button" class="btn ghost remove">✖</button>
  `;
  serviceRows.appendChild(row);
  row.querySelector('.svc-amt').addEventListener('input', recomputeTotals);
  row.querySelector('.remove').addEventListener('click', ()=>{
    row.remove(); [...serviceRows.children].forEach((r,i)=>{ r.firstElementChild.textContent = String(i+1); });
    recomputeTotals();
  });
  recomputeTotals();
}
function currentFY(dateObj){
  const d = dateObj || new Date(), y = d.getFullYear(), m = d.getMonth();
  return (m>=3) ? `${y}-${String(y+1).slice(-2)}` : `${y-1}-${String(y).slice(-2)}`;
}
function nextInvoiceSequence(){
  const seqKey = 'ca-invoice-seq', fyKey  = 'ca-invoice-fy';
  const today = new Date(); const fy = currentFY(today);
  const storedFY = localStorage.getItem(fyKey);
  let seq = Number(localStorage.getItem(seqKey) || 0);
  if(storedFY !== fy){ seq = 0; }
  seq += 1; localStorage.setItem(seqKey, String(seq)); localStorage.setItem(fyKey, fy);
  return { fy, seq };
}
function formatInvoiceNumber(prefix, fy, seq){ return `${prefix}/${fy}/${String(seq).padStart(3,'0')}`; }
function autoPopulateInvoiceMeta(){
  $('#invDate').value = todayStr();
  const { fy, seq } = nextInvoiceSequence();
  $('#invNumber').value = formatInvoiceNumber('INSIGHT', fy, seq);
  serviceRows.innerHTML = ''; addServiceRow('', '');
  $('#discountInput').value = 0; recomputeTotals();
}
$('#discountInput')?.addEventListener('input', recomputeTotals);
function recomputeTotals(){
  const amts = $$('.svc-amt', serviceRows).map(i=>Number(i.value||0));
  const sub = amts.reduce((s,n)=>s+n,0);
  const disc = Number($('#discountInput').value||0);
  const grand = Math.max(sub - disc, 0);
  $('#subTotal').textContent = fmtMoney(sub);
  $('#grandTotal').textContent = fmtMoney(grand);
  $('#amountWords').textContent = toIndianWords(Math.round(grand)) + ' only';
}
function toIndianWords(num){
  if(num===0) return 'Zero Rupees';
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function two(n){ return n<20 ? a[n] : b[Math.floor(n/10)] + (n%10?` ${a[n%10]}`:''); }
  function three(n){ const h = Math.floor(n/100), r=n%100; return (h?`${a[h]} Hundred${r?' ':''}`:'') + (r?two(r):''); }
  const crore = Math.floor(num/10000000); num%=10000000;
  const lakh = Math.floor(num/100000); num%=100000;
  const thousand = Math.floor(num/1000); num%=1000;
  const hundred = num; let out = '';
  if(crore) out += `${three(crore)} Crore `;
  if(lakh) out += `${three(lakh)} Lakh `;
  if(thousand) out += `${three(thousand)} Thousand `;
  if(hundred) out += `${three(hundred)}`;
  return (out.trim() || 'Zero') + ' Rupees';
}

/* ---------- Lightweight PDF Export (~300 KB) ---------- */
// Uses html2canvas -> JPEG (quality 0.85) + jsPDF A4; avoids huge PNGs.
$('#downloadPdfBtn')?.addEventListener('click', async ()=>{
  bindInvoicePreview();

  const page = document.querySelector('.a4');
  const holder = el('invoiceA4');
  if (!page || !holder) { alert('Invoice preview area not found.'); return; }

  // Show for capture
  holder.style.visibility = 'visible';
  holder.style.left = '0';
  holder.style.top = '0';
  holder.style.position = 'fixed';

  const scale = 2;  // good balance of sharpness and size
  const canvas = await html2canvas(page, {
    scale,
    useCORS: true,
    backgroundColor: '#FFFFFF',
    logging: false
  });

  // JPEG instead of PNG to shrink size dramatically
  const imgData = canvas.toDataURL('image/jpeg', 0.85);

  const pdf = new jspdf.jsPDF('p','mm','a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const imgWidth = pageWidth;
  const imgHeight = canvas.height * imgWidth / canvas.width;

  pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);

  const name = `${($('#invNumber').value||'Invoice').replace(/[^\w\-]+/g,'_')}.pdf`;
  pdf.save(name);

  // Hide again
  holder.style.visibility = 'hidden';
  holder.style.left = '-9999px';
  holder.style.top = '-9999px';
});

function bindInvoicePreview(){
  const ddmmyyyy = fmtDateDDMMYYYY($('#invDate').value);
  $$('[data-bind="invNumber"]').forEach(e => e.textContent = $('#invNumber').value || '');
  $$('[data-bind="invDateDDMM"]').forEach(e => e.textContent = ddmmyyyy || '');
  $$('[data-bind="client"]').forEach(e => e.textContent = $('#invClient').value || '');
  $$('[data-bind="address"]').forEach(e => e.textContent = $('#invAddress').value || '');
  $$('[data-bind="email"]').forEach(e => e.textContent = $('#invEmail').value || '');
  $$('[data-bind="mobile"]').forEach(e => e.textContent = $('#invMobile').value || '');
  $$('[data-bind="subTotal"]').forEach(e => e.textContent = $('#subTotal').textContent || '0');
  $$('[data-bind="discount"]').forEach(e => e.textContent = fmtMoney(Number($('#discountInput').value||0)));
  $$('[data-bind="grandTotal"]').forEach(e => e.textContent = $('#grandTotal').textContent || '0');
  $$('[data-bind="amountWords"]').forEach(e => e.textContent = $('#amountWords').textContent || '');

  const tbody = document.querySelector('[data-bind="rows"]'); if (!tbody) return;
  tbody.innerHTML = '';
  $$('.inv-row', serviceRows).forEach((r,i)=>{
    const desc = r.querySelector('.svc-desc').value.trim();
    const amt  = Number(r.querySelector('.svc-amt').value||0);
    if(!desc && !amt) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td>${esc(desc)}</td><td class="money">₹ ${fmtMoney(amt)}</td>`;
    tbody.appendChild(tr);
  });
}

/* =========================
   EDIT INVOICE (Upload PDF)
   ========================= */
const editModal = el('editInvoiceModal');
$('#openEditInvoiceBtn')?.addEventListener('click', ()=>{ openEditInvoiceModal(); });
$('#editCancelBtn')?.addEventListener('click', ()=> editModal.classList.remove('active'));
editModal?.addEventListener('click', e=>{ if(e.target===editModal) editModal.classList.remove('active'); });

function openEditInvoiceModal(){
  const input = el('pdfInput');
  if (input) input.value = '';
  editModal.classList.add('active');
}

const drop = el('pdfDrop');
drop?.addEventListener('dragover', e=>{ e.preventDefault(); drop.classList.add('hover'); });
drop?.addEventListener('dragleave', ()=> drop.classList.remove('hover'));
drop?.addEventListener('drop', e=>{
  e.preventDefault(); drop.classList.remove('hover');
  const f = e.dataTransfer.files && e.dataTransfer.files[0]; if(f) handlePdfFile(f);
});
el('pdfInput')?.addEventListener('change', e=>{
  const f = e.currentTarget.files && e.currentTarget.files[0]; if(f) handlePdfFile(f);
});

async function handlePdfFile(file){
  try{
    if (!window.pdfjsLib){
      alert('PDF parser is not available. Please ensure pdf.js is loaded.'); return;
    }
    const buf = await file.arrayBuffer();
    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    } catch (err) {
      alert('Could not read this PDF. Ensure it was generated by this app and try again.'); return;
    }

    // Extract text (prefer embedded text; OCR fallback if Tesseract exists)
    let textAll = '';
    for (let p = 1; p <= pdf.numPages; p++){
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const chunk = tc.items.map(i => (i.str||'').trim()).filter(Boolean).join('\n');
      textAll += chunk + '\n';
    }
    if (!textAll.trim() && window.Tesseract){
      // OCR first page as fallback
      const page1 = await pdf.getPage(1);
      const viewport = page1.getViewport({ scale: 2.6 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page1.render({ canvasContext: ctx, viewport }).promise;
      const res = await Tesseract.recognize(canvas, 'eng');
      textAll = (res && res.data && res.data.text || '').replace(/\r/g,'').trim();
    }
    if (!textAll.trim()){
      alert('Could not read this PDF. Ensure it was generated by this app and try again.');
      return;
    }

    const parsed = parseInvoiceText(textAll);
    if (!parsed || (!parsed.invNo && !parsed.name && (!parsed.services || !parsed.services.length))){
      alert('Could not parse needed fields from this PDF. Ensure it matches the app format.'); return;
    }

    applyParsedToForm(parsed);
    recomputeTotals();
    bindInvoicePreview();
    setTimeout(()=> editModal.classList.remove('active'), 500);

  }catch(e){
    console.error(e);
    alert('Unexpected error while reading the PDF.');
  }
}

/* ============ Parser tailored to our invoice layout ============ */
function parseInvoiceText(txt){
  const T = (txt||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n');

  function pick(re, src=T){ const m = src.match(re); return m ? (m[1]||'').trim() : ''; }
  function pickMoneyAfter(label){
    const re = new RegExp(`${label}[\\s\\S]*?(₹?\\s*${DIGITS.source})`,'i');
    const m = T.match(re);
    if(!m) return '';
    return (m[1]||'').replace(/[₹\s,]/g,'').trim();
  }

  // Invoice meta
  const invNo = pick(/Invoice\s*No:\s*([^\n]+)/i);
  const invDateDD = pick(/Invoice\s*Date:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);

  // Receiver block
  const recvBlock = (() => {
    const start = T.search(/Detail\s+of\s+Receiver/i);
    if (start < 0) return '';
    const end = T.search(/S\.\s*No\.|Service\s*Description/i);
    return end>start ? T.slice(start, end) : T.slice(start);
  })();

  // Client Name — strictly after "Name:", strip any amounts/₹/trailing numerics
  let name = pick(/Name:\s*([^\n]+)/i, recvBlock)
               .replace(/\bInvoice\s*Amount.*$/i,'')
               .replace(/₹.*$/,'')
               .replace(/\d[\d,]*(\.\d{1,2})?$/,'')
               .trim();

  // Email — only valid email; blank if none
  let emailRaw = pick(/E-?mail:\s*([^\n]+)/i, recvBlock);
  let email = '';
  const emailMatch = emailRaw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) email = emailMatch[0].trim();

  // Mobile — digits/+()-/spaces only; blank if too few digits
  let mobileLine = pick(/Mobile\s*No:\s*([^\n]+)/i, recvBlock);
  let mobile = '';
  if (mobileLine){
    const cleaned = mobileLine.replace(/[^\d+()\-\s]/g,'').trim();
    const digitCount = (cleaned.match(/\d/g)||[]).length;
    mobile = (digitCount >= 7) ? cleaned : '';
  }

  // Address — between Address: and next Email/Mobile/end
  const address = (() => {
    const m = recvBlock.match(/Address:\s*([\s\S]*?)(?:E-?mail:|Mobile\s*No:|$)/i);
    return m ? m[1].replace(/\n+/g,' ').trim() : '';
  })();

  // Services block: between Service Description .. Sub Total
  const rowsBlock = (() => {
    const start = T.search(/Service\s*Description/i);
    const end = T.search(/Sub\s*Total/i);
    return (start>=0 && end>start) ? T.slice(start, end) : '';
  })();

  const services = [];
  if (rowsBlock){
    const lines = rowsBlock.split('\n').map(l=>l.trim()).filter(Boolean);
    for (const line of lines){
      if (/^S\.\s*No/i.test(line) || /^Service\s*Description/i.test(line) || /^Amount/i.test(line)) continue;
      const m = line.match(new RegExp(`^(\\d+)?\\s*([^₹\\d]+?)\\s+(₹?\\s*${DIGITS.source})$`));
      if (m){
        const desc = (m[2]||'')
          .replace(/\b(Service\s*Description|Amount(?:\s*\(₹\))?|S\.\s*No\.?)\b/ig,'')
          .replace(/\(\d+\)/g,'')
          .replace(/\s*%+\s*$/,'')
          .trim();
        const amtStr = (m[3]||'').replace(/[₹\s,]/g,'').trim();
        services.push({ desc, amt: Number(amtStr||0) });
      }
    }
  }

  // Totals
  const subTotalNum   = pickMoneyAfter('Sub\\s*Total');
  const discountNum = pickMoneyAfter('Less:\\s*(Discount|Advance)');
  const invoiceAmtNum = pickMoneyAfter('Invoice\\s*Amount');

  return {
    invNo,
    invDateISO: parseDDMM(invDateDD),
    name, email, mobile, address,
    services,
    subTotal: Number(subTotalNum||0),
    discount: Number(discountNum||0),
    grandTotal: Number(invoiceAmtNum||0)
  };
}

/* Apply parsed fields into Create Invoice form */
function applyParsedToForm(p){
  if(p.invNo) $('#invNumber').value = p.invNo;
  if(p.invDateISO) $('#invDate').value = p.invDateISO;

  if(typeof p.name === 'string')   $('#invClient').value = p.name;
  if(typeof p.email === 'string')  $('#invEmail').value  = p.email;
  if(typeof p.mobile === 'string') $('#invMobile').value = p.mobile;
  if(typeof p.address === 'string')$('#invAddress').value= p.address;

  if(Array.isArray(p.services) && p.services.length){
    serviceRows.innerHTML = '';
    p.services.forEach(s => addServiceRow(s.desc || '', String(s.amt || '')));
  }
  if(Number.isFinite(p.discount)) $('#discountInput').value = p.discount;
}

/* ---------- Export CSV ---------- */
$('#exportCsvBtn')?.addEventListener('click', ()=>{
  const rows = [[
    'Client','Task','Priority','In-Charge','Status','Deadline','Fee','Advance','Outstanding','Invoice Status','Notes','Recurring','Recurring Day','Recurring ID','Period'
  ]];
  tasks.forEach(t=>{
    if (t.recur && !t.period) return;
    const out = (Number(t.fee||0) - Number(t.advance||0));
    rows.push([
      t.client,t.title,t.priority,t.assignee,t.status,fmtDateDDMMYYYY(t.deadline),t.fee,t.advance,out,t.invoiceStatus,(t.notes||'').replace(/\n/g,' '),
      t.recur? 'Yes':'No', t.recurDay||'', t.recurringId||'', t.period||''
    ]);
  });
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `CA-Tasks-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
});


/* === Combobox for Client Name & Task Title (autofill-proof) === */
(function(){
  const $  = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opts)=> el && el.addEventListener(ev, fn, opts);
  const esc = (s)=> String(s??'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const norm = s => String(s||'').trim().toLowerCase();

  const STORAGE_KEYS = { client: 'comboBlock_clients', title: 'comboBlock_titles' };
  const KIND_BY_SELECT = { fClientSelect: 'client', fTitleSelect: 'title' };

  /* ---------- blocklist persistence ---------- */
  function loadBlockSet(kind){
    try{ return new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS[kind])||'[]')); }
    catch{ return new Set(); }
  }
  function saveBlockSet(kind, set){
    localStorage.setItem(STORAGE_KEYS[kind], JSON.stringify([...set]));
  }

  /* ---------- kill native datalist / autofill panels ---------- */
  function nukeDatalists(){
    ['clientList','titleList'].forEach(id=>{
      const dl = document.getElementById(id);
      if(dl && dl.parentNode) dl.parentNode.removeChild(dl);
    });
    document.querySelectorAll('datalist').forEach(dl => dl.remove());
  }
  function hardDisableNativeSuggestions(input){
    if(!input) return;
    input.removeAttribute('list');
    input.setAttribute('autocomplete','new-password');
    input.setAttribute('autocapitalize','off');
    input.setAttribute('autocorrect','off');
    input.setAttribute('spellcheck','false');
    input.setAttribute('name','no-autofill-'+Math.random().toString(36).slice(2));
    on(input,'focus',()=>{ input.readOnly = true; setTimeout(()=>{ input.readOnly = false; }, 100); });
  }
  function addAutofillTrap(beforeEl){
    if(!beforeEl || beforeEl.dataset.trapAdded) return;
    const trap = document.createElement('div');
    trap.style.position='absolute'; trap.style.opacity='0';
    trap.style.pointerEvents='none'; trap.style.height='0'; trap.style.overflow='hidden';
    trap.innerHTML = `
      <input type="text" autocomplete="username" tabindex="-1" />
      <input type="password" autocomplete="new-password" tabindex="-1" />
    `;
    beforeEl.parentNode.insertBefore(trap, beforeEl);
    beforeEl.dataset.trapAdded='1';
  }

  /* ---------- read options from hidden <select> + filter by blocklist ---------- */
  function getSelectValues(selectId){
    const sel = document.getElementById(selectId);
    if(!sel) return [];
    const kind = KIND_BY_SELECT[selectId];
    const blocked = loadBlockSet(kind);
    const out = []; const seen = new Set();
    for(const opt of sel.options){
      const v = (opt.value||'').trim();
      if(!v || v==='__new__') continue;
      const nv = norm(v);
      if(blocked.has(nv)) continue;                 // filter hidden values
      if(!seen.has(nv)){ seen.add(nv); out.push(v); }
    }
    out.sort((a,b)=> a.localeCompare(b));
    return out;
  }

  /* ---------- remove option from hidden <select> (immediate UI) ---------- */
  function removeOptionFromSelect(selectId, value){
    const sel = document.getElementById(selectId);
    if(!sel) return false;
    const target = Array.from(sel.options).find(opt => norm(opt.value) === norm(value));
    if(target){ sel.removeChild(target); return true; }
    return false;
  }

  /* ---------- custom combobox ---------- */
  function createCombobox({ input, hidden, sourceSelectId, placeholder='' }){
    if(!input || !hidden || !sourceSelectId) return null;

    hardDisableNativeSuggestions(input);
    addAutofillTrap(input);

    if(!input.classList.contains('combo-input')){
      const wrap = document.createElement('div');
      wrap.className = 'combo-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      input.classList.add('combo-input');
      if(placeholder) input.placeholder = placeholder;
    }

    let open=false, act=-1, menu=null, rows=[];

    const close=()=>{ if(menu && menu.parentNode){ menu.parentNode.removeChild(menu); } menu=null; open=false; act=-1; };
    const ensure=()=>{ if(menu) return menu; menu=document.createElement('div'); menu.className='combo-menu'; input.parentNode.appendChild(menu); open=true; return menu; };

    const highlight=(text,q)=>{
      if(!q) return esc(text);
      const i = text.toLowerCase().indexOf(q.toLowerCase());
      if(i<0) return esc(text);
      const a=esc(text.slice(0,i)), b=esc(text.slice(i,i+q.length)), c=esc(text.slice(i+q.length));
      return `${a}<span class="match">${b}</span>${c}`;
    };

    function refreshList(q){
      const kind = KIND_BY_SELECT[sourceSelectId];
      const all = getSelectValues(sourceSelectId);
      const query = (q||'').trim();
      const qn = query.toLowerCase();
      const list = !query ? all.slice(0,50) : all.filter(v=>v.toLowerCase().includes(qn)).slice(0,50);
      const exact = query && all.some(v=>v.toLowerCase()===qn);
      rows = [];
      if(query && !exact) rows.push({kind:'add', value:query});
      for(const v of list) rows.push({kind:'opt', value:v});
      act = rows.length ? 0 : -1;

      const m = ensure();
      if(!rows.length){ m.innerHTML = `<div class="combo-empty">Type to search…</div>`; return; }

      m.innerHTML = rows.map((r,i)=> r.kind==='add'
        ? `<div class="combo-item" data-i="${i}" data-k="add">
             <span class="text">➕ Add “${esc(r.value)}”</span>
           </div>`
        : `<div class="combo-item" data-i="${i}" data-k="opt">
             <span class="text">${highlight(r.value, query)}</span>
             <button type="button" class="combo-del" title="Remove this from list" aria-label="Delete ${esc(r.value)}">🗑</button>
           </div>`).join('');

      // hover + click (with inline delete)
      $$('.combo-item', m).forEach(el=>{
        on(el,'mouseenter', ()=>{
          $$('.combo-item[aria-selected="true"]', m).forEach(n=>n.removeAttribute('aria-selected'));
          el.setAttribute('aria-selected','true'); act = Number(el.dataset.i);
        });
        on(el,'mousedown', (ev)=>{
          const delBtn = ev.target.closest('.combo-del');
          if(delBtn){
            ev.preventDefault();
            const idx = Number(el.dataset.i);
            const row = rows[idx];
            if(row?.kind === 'opt'){
              const ok = confirm(`Remove “${row.value}” from the list?`);
              if(ok){
                // 1) Add to persistent blocklist
                const set = loadBlockSet(kind); set.add(norm(row.value)); saveBlockSet(kind, set);
                // 2) Remove from the current select to hide immediately
                removeOptionFromSelect(sourceSelectId, row.value);
                // 3) Refresh UI
                refreshList(input.value);
              }
            }
            return;
          }
          ev.preventDefault();
          commit(Number(el.dataset.i));
        });
      });
    }

    function commit(i){
      if(i<0 || i>=rows.length) { close(); return; }
      const r = rows[i];
      const val = (r.kind==='add') ? (input.value||'').trim() : r.value;
      input.value = val;
      hidden.value = val;
      close();
    }

    on(input,'input', ()=>{ hidden.value = (input.value||'').trim(); refreshList(input.value); });
    on(input,'focus', ()=>{ refreshList(input.value); });
    on(input,'blur',  ()=>{ setTimeout(close, 120); });

    on(input,'keydown', (e)=>{
      if(!open && (e.key==='ArrowDown' || e.key==='ArrowUp')){ refreshList(input.value); e.preventDefault(); return; }
      if(!open) return;
      const max = rows.length-1;
      if(e.key==='ArrowDown'){ act = Math.min(max, act+1); updateActive(); e.preventDefault(); }
      else if(e.key==='ArrowUp'){ act = Math.max(0, act-1); updateActive(); e.preventDefault(); }
      else if(e.key==='Enter'){ commit(act); e.preventDefault(); }
      else if(e.key==='Escape'){ close(); e.preventDefault(); }
      else if(e.key==='Tab'){ if(act>=0) commit(act); else hidden.value = (input.value||'').trim(); }
    });

    function updateActive(){
      if(!menu) return;
      $$('.combo-item', menu).forEach(n=>n.removeAttribute('aria-selected'));
      const el = menu.querySelector(`.combo-item[data-i="${act}"]`);
      if(el){ el.setAttribute('aria-selected','true'); el.scrollIntoView({block:'nearest'}); }
    }

    return {
      refresh: () => refreshList(input.value),
      setValue: (v) => { input.value = v||''; hidden.value = v||''; },
      focus:   () => input.focus()
    };
  }

  /* ---------- bootstrap both fields ---------- */
  function setupCombos(){
    nukeDatalists();

    const cSel = $('#fClientSelect'); if(cSel) cSel.style.display = 'none';
    const tSel = $('#fTitleSelect');  if(tSel) tSel.style.display  = 'none';
    const cInp = $('#fClientNew');    if(cInp) cInp.style.display  = '';
    const tInp = $('#fTitleNew');     if(tInp) tInp.style.display  = '';

    hardDisableNativeSuggestions(cInp);
    hardDisableNativeSuggestions(tInp);

    const state = (window.__clientTitleCombos ||= {});
    state.clientCombo = state.clientCombo || createCombobox({
      input:  cInp,
      hidden: $('#fClient'),
      sourceSelectId: 'fClientSelect',
      placeholder: 'Type client name…'
    });
    state.titleCombo  = state.titleCombo  || createCombobox({
      input:  tInp,
      hidden: $('#fTitle'),
      sourceSelectId: 'fTitleSelect',
      placeholder: 'Type task title…'
    });

    // Modal open → sync values + refresh + focus
    const modal = $('#taskModal');
    if(modal && !state.modalObs){
      state.modalObs = new MutationObserver(()=>{
        const isOpen = modal.classList.contains('active') || modal.classList.contains('show');
        if(!isOpen) return;
        hardDisableNativeSuggestions($('#fClientNew'));
        hardDisableNativeSuggestions($('#fTitleNew'));
        nukeDatalists();
        const curClient = ($('#fClient')?.value || $('#fClientSelect')?.value || '').trim();
        const curTitle  = ($('#fTitle')?.value  || $('#fTitleSelect')?.value  || '').trim();
        state.clientCombo?.setValue(curClient);
        state.titleCombo?.setValue(curTitle);
        state.clientCombo?.refresh();
        state.titleCombo?.refresh();
        setTimeout(()=> state.clientCombo?.focus(), 20);
      });
      state.modalObs.observe(modal, { attributes:true, attributeFilter:['class'] });
    }

    // Hidden select options changed → refresh suggestions
    if(cSel && !state.cSelObs){
      state.cSelObs = new MutationObserver(()=>{ state.clientCombo?.refresh(); });
      state.cSelObs.observe(cSel, { childList:true, subtree:true, attributes:true });
    }
    if(tSel && !state.tSelObs){
      state.tSelObs = new MutationObserver(()=>{ state.titleCombo?.refresh(); });
      state.tSelObs.observe(tSel, { childList:true, subtree:true, attributes:true });
    }
  }

  // Manual reapply hook if your framework re-renders the form
  window.refreshClientTitleCombos = setupCombos;

  // Restore helpers (unhide)
  window.restoreClientOption = function(value){
    const set = loadBlockSet('client'); set.delete(norm(value)); saveBlockSet('client', set);
    // only re-add to select if it doesn't exist already
    const sel = document.getElementById('fClientSelect');
    if(sel && !Array.from(sel.options).some(o=> norm(o.value)===norm(value))){
      const opt = document.createElement('option'); opt.value = value; sel.appendChild(opt);
    }
    setupCombos();
  };
  window.restoreTitleOption = function(value){
    const set = loadBlockSet('title'); set.delete(norm(value)); saveBlockSet('title', set);
    const sel = document.getElementById('fTitleSelect');
    if(sel && !Array.from(sel.options).some(o=> norm(o.value)===norm(value))){
      const opt = document.createElement('option'); opt.value = value; sel.appendChild(opt);
    }
    setupCombos();
  };

  // DOM ready
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ setupCombos(); setTimeout(setupCombos, 120); });
  }else{
    setupCombos(); setTimeout(setupCombos, 120);
  }
})();


