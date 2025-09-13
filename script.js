/* =========================
   Global Debug Utilities
   ========================= */
(function initDebugFlag(){
  const url = new URL(window.location.href);
  const qd = url.searchParams.get('debug');
  if (qd === '1') localStorage.setItem('__DEBUG', '1');
  if (qd === '0') localStorage.removeItem('__DEBUG');
})();
const DEBUG = !!localStorage.getItem('__DEBUG');

function nowTs(){ return new Date().toISOString().split('T')[1].replace('Z',''); }
function dlog(...args){ if (DEBUG) console.log('[DBG]', nowTs(), ...args); }
function el(id){ return document.getElementById(id); }

function reportDebugInfo(extra=''){
  const info = [];
  info.push(`Time: ${new Date().toLocaleString()}`);
  info.push(`UserAgent: ${navigator.userAgent}`);
  info.push(`Location Protocol: ${location.protocol}`);
  info.push(`CDN load errors: ${(window.__libErr||[]).join(' | ') || 'none'}`);
  info.push(`pdfjsLib: ${!!window.pdfjsLib}`);
  info.push(`pdf.js worker set: ${!!window.__pdfWorkerSet}`);
  info.push(`Tesseract: ${!!window.Tesseract}`);
  info.push(`html2canvas: ${!!window.html2canvas}`);
  info.push(`jsPDF: ${!!window.jspdf}`);
  if (extra) info.push(`\nLast Operation:\n${extra}`);
  const target = el('debugInfo'); if (target) target.textContent = info.join('\n');
}

function formatStepLog(steps){
  return steps.map(s => `${s.t} — ${s.msg}${s.code?` [${s.code}]`:''}`).join('\n');
}

function pushStep(steps, msg, code=''){
  const entry = { t: nowTs(), msg, code };
  steps.push(entry);
  el('parseLog').innerHTML = steps.map(s => `${s.t} — ${s.msg}${s.code?` <code>${s.code}</code>`:''}`).join('<br>');
  reportDebugInfo(formatStepLog(steps));
}

/* =========================
   Existing Utilities
   ========================= */
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const $  = (sel, root=document) => root.querySelector(sel);
const fmtMoney = n => (Number(n||0)).toLocaleString('en-IN',{maximumFractionDigits:2});
const todayStr = () => new Date().toISOString().slice(0,10);
const yymm = (dstr) => (dstr||'').slice(0,7);
const DIGITS = /[\d,]+(?:\.\d{1,2})?/;

function fmtDateDDMMYYYY(iso){
  if(!iso) return '';
  const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`;
}
function parseDDMM(dateStr){
  const m = dateStr && dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!m) return ''; return `${m[3]}-${m[2]}-${m[1]}`;
}
function addDays(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function lastDayOfMonth(y,m){ return new Date(y, m+1, 0).getDate(); }
function makeDateYMD(y,m,day){ const max = lastDayOfMonth(y,m); const d = Math.min(day, max); return new Date(y, m, d).toISOString().slice(0,10); }

/* =========================
   Data & Storage
   ========================= */
const KEY = 'ca-dashboard-tasks-v1';
const SKIP_KEY = 'ca-dashboard-skip-v1';
let tasks = [];
let skips = [];
function load(){
  try{ tasks = JSON.parse(localStorage.getItem(KEY)) || []; } catch{ tasks = []; }
  try{ skips = JSON.parse(localStorage.getItem(SKIP_KEY)) || []; } catch{ skips = []; }
}
function save(){ localStorage.setItem(KEY, JSON.stringify(tasks)); }
function saveSkips(){ localStorage.setItem(SKIP_KEY, JSON.stringify(skips)); }
function isSkipped(recurringId, period){ return !!skips.find(s=>s.recurringId===recurringId && s.period===period); }
function addSkip(recurringId, period){ if(recurringId && period && !isSkipped(recurringId, period)){ skips.push({recurringId, period}); saveSkips(); } }
function removeSkipsForSeries(recurringId){ if(!recurringId) return; skips = skips.filter(s=>s.recurringId!==recurringId); saveSkips(); }

/* =========================
   Recurring generation
   ========================= */
function ensureRecurringInstances(){
  const now = new Date();
  const horizon = 6;
  const templates = tasks.filter(t=>t.recur && !t.period);

  for (const tpl of templates){
    const rid = tpl.recurringId || crypto.randomUUID();
    tpl.recurringId = rid;

    const recurDay = tpl.recurDay || (tpl.deadline ? Number(tpl.deadline.slice(8,10)) : now.getDate());
    tpl.recurDay = recurDay;

    const tplDate = tpl.deadline ? new Date(tpl.deadline) : now;
    const tplYM = tplDate.getFullYear()*12 + tplDate.getMonth();
    const nowYM = now.getFullYear()*12 + now.getMonth();
    const base = (tplYM >= nowYM) ? tplDate : now;
    const baseY = base.getFullYear();
    const baseM = base.getMonth();

    for (let i = 0; i < horizon; i++){
      const y = baseY + Math.floor((baseM + i)/12);
      const m = (baseM + i) % 12;
      const dl = makeDateYMD(y, m, recurDay);
      const period = `${y}-${String(m+1).padStart(2,'0')}`;
      const exists = tasks.some(t => t.period === period && t.recurringId === rid);
      if (!exists && !isSkipped(rid, period)){
        tasks.push({
          id: crypto.randomUUID(), createdAt: Date.now(),
          client: tpl.client, title: tpl.title, priority: tpl.priority,
          assignee: tpl.assignee, status: 'Not Started', deadline: dl,
          fee: Number(tpl.fee||0), advance: 0, invoiceStatus: 'Not Raised',
          notes: tpl.notes||'', recur: true, recurDay, recurringId: rid, period
        });
      }
    }
  }
  save();
}
function syncSeriesFromTemplate(tpl){
  const rid = tpl.recurringId; if(!rid) return;
  const today = todayStr();
  tasks = tasks.filter(t=> !(t.recurringId===rid && t.period && t.deadline>=today));
  ensureRecurringInstances();
}

/* =========================
   Demo Seed
   ========================= */
function seedDemo(){
  tasks = [
    {id:crypto.randomUUID(), client:'Multi Client (GSTR-1)', title:'GSTR-1 Filing', priority:'High', assignee:'Team GST', status:'Not Started', deadline: makeDateYMD(new Date().getFullYear(), new Date().getMonth(), 11), fee:1200, advance:0, invoiceStatus:'', notes:'Auto-generated monthly from template', createdAt:Date.now(), recur:true, recurDay:11, recurringId: crypto.randomUUID()},
    {id:crypto.randomUUID(), client:'BlueLeaf LLP', title:'Tax Audit – Form 3CB-3CD FY 24-25', priority:'High', assignee:'Netan', status:'Not Started', deadline:addDays(20), fee:85000, advance:20000, invoiceStatus:'', notes:'Engagement letter signed', createdAt:Date.now()-86400000},
    {id:crypto.randomUUID(), client:'Nova Foods', title:'Incorporation – OPC (SPICe+) corrections', priority:'High', assignee:'Pratik', status:'In Progress', deadline:addDays(5), fee:25000, advance:10000, invoiceStatus:addDays(-1), notes:'ROC resubmission comments to fix AOA', createdAt:Date.now()-3600}
  ];
  tasks[0].period = undefined;
  save(); ensureRecurringInstances(); render();
}

/* =========================
   Selection / Bulk delete
   ========================= */
let selectedIds = new Set();
function toggleSelect(id, checked){ checked ? selectedIds.add(id) : selectedIds.delete(id); updateSelectAllState(); }
function updateSelectAllState(){
  const visibleRows = $$('#taskTbody tr');
  const visibleIds = new Set(visibleRows.map(r=>r.dataset.id));
  const allChecked = visibleRows.length>0 && [...visibleIds].every(id=>selectedIds.has(id));
  el('selectAll').checked = allChecked;
}
function bulkDelete(){
  const visibleRows = $$('#taskTbody tr');
  const visibleIds = new Set(visibleRows.map(r=>r.dataset.id));
  const toActOn = [...selectedIds].filter(id=>visibleIds.has(id));
  if(toActOn.length===0){ alert('Select at least one task (visible).'); return; }
  const pass = prompt('Enter password to delete selected tasks:');
  if(pass!== '14Dec@1998'){ alert('Incorrect password.'); return; }
  if(!confirm(`Delete ${toActOn.length} task(s)? This cannot be undone.`)) return;

  const toDelete = new Set(toActOn);
  for(const t of tasks){
    if(!toDelete.has(t.id)) continue;
    if(t.recur && !t.period && t.recurringId){
      for(const inst of tasks.filter(x=>x.recurringId===t.recurringId && x.period)) toDelete.add(inst.id);
      removeSkipsForSeries(t.recurringId);
    } else if(t.recur && t.period && t.recurringId){
      addSkip(t.recurringId, t.period);
    }
  }
  tasks = tasks.filter(t=>!toDelete.has(t.id));
  selectedIds.clear(); save(); render();
}

/* =========================
   Rendering
   ========================= */
const tbody = el('taskTbody');
function render(){
  ensureRecurringInstances();

  const q = el('searchInput').value.trim().toLowerCase();
  const pf = el('priorityFilter').value;
  const sfRaw = el('statusFilter').value;
  const sf = sfRaw ? new Set(sfRaw.split('|')) : null;
  const af = el('assigneeFilter').value;
  const mf = el('monthFilter').value;

  let filtered = tasks.filter(t => !(t.recur && !t.period));
  filtered = filtered.filter(t => {
    const matchQ = !q || [t.client,t.title,t.assignee,(t.notes||'')].some(x => String(x).toLowerCase().includes(q));
    const matchP = !pf || t.priority===pf;
    const matchS = !sf || sf.has(t.status);
    const matchA = !af || t.assignee===af;
    const matchM = !mf || yymm(t.deadline)===mf;
    return matchQ && matchP && matchS && matchA && matchM;
  });

  const sortBy = el('sortBy').value; const dir = el('sortDir').value==='asc'?1:-1;
  filtered.sort((a,b)=>{
    if(sortBy==='deadline') return (a.deadline||'').localeCompare(b.deadline||'')*dir;
    if(sortBy==='createdAt') return (a.createdAt-b.createdAt)*dir;
    if(sortBy==='priority') return (prioRank(a.priority)-prioRank(b.priority))*dir;
    if(sortBy==='status') return a.status.localeCompare(b.status)*dir;
    if(sortBy==='fee') return ((a.fee||0)-(b.fee||0))*dir;
    return 0;
  });

  // Assignee options
  const assignees = [...new Set(tasks.filter(t=>!(t.recur && !t.period)).map(t=>t.assignee).filter(Boolean))];
  const afSel = el('assigneeFilter');
  const curA = afSel.value; afSel.innerHTML = '<option value="">In-Charge: All</option>' + assignees.map(a=>`<option ${a===curA?'selected':''}>${a}</option>`).join('');

  // Month options
  const months = [...new Set(tasks.filter(t=>t.deadline).map(t=>yymm(t.deadline)))].sort();
  const mfSel = el('monthFilter');
  const curM = mfSel.value; mfSel.innerHTML = '<option value="">Month: All</option>' + months.map(m=>`<option ${m===curM?'selected':''} value="${m}">${new Date(m+'-01').toLocaleString('en-IN',{month:'short', year:'numeric'})}</option>`).join('');

  // Rows
  tbody.innerHTML = filtered.map(t => rowHtml(t)).join('');

  // re-check selected
  for(const cb of $$('#taskTbody input[type="checkbox"].row-select')){ cb.checked = selectedIds.has(cb.dataset.id); }

  // KPIs
  const now = todayStr();
  const visible = tasks.filter(t=>!(t.recur && !t.period));
  const total = visible.length;
  const pending = visible.filter(t=>t.status!=='Completed').length;
  const overdue = visible.filter(t=>t.status!=='Completed' && t.deadline && t.deadline<now).length;
  const sumFee = visible.reduce((s,t)=>s+Number(t.fee||0),0);
  const sumAdv = visible.reduce((s,t)=>s+Number(t.advance||0),0);
  const sumOut = sumFee - sumAdv;
  el('kpiTotal').textContent=total;
  el('kpiPending').textContent=pending;
  el('kpiOverdue').textContent=overdue;
  el('kpiFee').textContent=fmtMoney(sumFee);
  el('kpiAdv').textContent=fmtMoney(sumAdv);
  el('kpiOut').textContent=fmtMoney(sumOut);
}
function prioRank(p){ return {High:1, Medium:2, Low:3}[p]||9; }
function rowHtml(t){
  const out = (Number(t.fee||0) - Number(t.advance||0));
  const overdue = t.deadline && t.deadline < todayStr() && t.status !== 'Completed';
  const recBadge = t.recur ? ' <span class="badge recurring" title="Recurring monthly">Monthly</span>' : '';
  return `<tr class="row" data-id="${t.id}">
    <td><input type="checkbox" class="row-select" data-id="${t.id}" onchange="toggleSelect('${t.id}', this.checked)"></td>
    <td title="${esc(t.notes||'')}"><strong>${esc(t.client)}</strong></td>
    <td>${esc(t.title)}${recBadge}</td>
    <td><span class="badge priority ${t.priority.toLowerCase()}">${t.priority}</span></td>
    <td>${esc(t.assignee)}</td>
    <td>
      <select class="status" onchange="changeStatus('${t.id}', this.value)">
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
    <td><button class="btn ghost" onclick="editTask('${t.id}')">Edit</button></td>
  </tr>`;
}
function esc(s){return String(s).replace(/[&<>\"]+/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]))}

/* =========================
   Actions / Task Modal
   ========================= */
function changeStatus(id, val){ const t = tasks.find(x=>x.id===id); if(!t) return; t.status = val; save(); render(); }
function delTask(id){
  const t = tasks.find(x=>x.id===id); if(!t) return;
  if(t.recur && !t.period && t.recurringId){
    if(!confirm('Delete this recurring template and all its instances?')) return;
    tasks = tasks.filter(x=> !(x.recurringId===t.recurringId));
    removeSkipsForSeries(t.recurringId);
  } else if(t.recur && t.period && t.recurringId){
    if(!confirm('Delete this recurring instance for this month?')) return;
    addSkip(t.recurringId, t.period);
    tasks = tasks.filter(x=> x.id!==t.id);
  } else {
    if(!confirm('Delete this task?')) return;
    tasks = tasks.filter(x=> x.id!==t.id);
  }
  selectedIds.delete(id); save(); render();
}
function editTask(id){
  const t = tasks.find(x=>x.id===id); if(!t) return;
  openTaskModal('Edit Task');
  const form = el('taskForm');
  form.dataset.editId = id;
  el('fClient').value=t.client||'';
  el('fTitle').value=t.title||'';
  el('fPriority').value=t.priority||'Medium';
  el('fAssignee').value=t.assignee||'';
  el('fStatus').value=t.status||'In Progress';
  el('fDeadline').value=t.deadline||'';
  el('fFee').value=t.fee||0;
  el('fAdvance').value=t.advance||0;
  el('fInvoiceStatus').value = t.invoiceStatus || '';
  el('fNotes').value=t.notes||'';
  el('fRecurring').checked=!!t.recur && !t.period;
}

const taskModal = el('taskModal');
el('addTaskBtn').addEventListener('click', ()=>{
  openTaskModal('New Task');
  const form = el('taskForm');
  form.reset();
  el('fDeadline').value=todayStr();
  delete form.dataset.editId;
});
el('cancelBtn').addEventListener('click', closeTaskModal);
taskModal.addEventListener('click', e=>{ if(e.target===taskModal) closeTaskModal(); });
function openTaskModal(title){ el('taskModalTitle').textContent=title; taskModal.classList.add('active'); setTimeout(()=>el('fClient').focus(), 10); }
function closeTaskModal(){ taskModal.classList.remove('active'); }

el('taskForm').addEventListener('submit', e=>{
  e.preventDefault();
  const form = e.currentTarget;
  const editId = form.dataset.editId;
  const existing = editId ? tasks.find(x=>x.id===editId) : null;

  const isRecurringTemplate = el('fRecurring').checked;
  const deadlineVal = el('fDeadline').value;
  const recurDay = deadlineVal ? Number(deadlineVal.slice(8,10)) : new Date().getDate();

  const data = {
    client: el('fClient').value.trim(),
    title: el('fTitle').value.trim(),
    priority: el('fPriority').value,
    assignee: el('fAssignee').value.trim(),
    status: el('fStatus').value,
    deadline: deadlineVal,
    fee: Number(el('fFee').value||0),
    advance: Number(el('fAdvance').value||0),
    invoiceStatus: el('fInvoiceStatus').value,
    notes: el('fNotes').value.trim()
  };
  if(data.advance > data.fee){ alert('Advance cannot exceed total fee.'); return; }

  if(existing){
    const wasTemplate = !!existing.recur && !existing.period;
    if(wasTemplate){
      Object.assign(existing, {client:data.client,title:data.title,priority:data.priority,assignee:data.assignee,fee:data.fee,notes:data.notes,deadline:data.deadline,recur:true,recurDay});
      save(); syncSeriesFromTemplate(existing);
    } else {
      Object.assign(existing, data); save();
    }
  } else {
    if(isRecurringTemplate){
      const rid = crypto.randomUUID();
      tasks.push({id:crypto.randomUUID(), createdAt: Date.now(), ...data, recur:true, recurDay, recurringId: rid, period: undefined});
      save(); ensureRecurringInstances();
    } else {
      tasks.push({id:crypto.randomUUID(), createdAt: Date.now(), ...data}); save();
    }
  }
  closeTaskModal(); render();
});

/* =========================
   Export CSV
   ========================= */
el('exportCsvBtn').addEventListener('click', ()=>{
  const rows = [[
    'Client','Task','Priority','In-Charge','Status','Deadline','Fee','Advance','Outstanding','Invoice Status','Notes','Recurring','Recurring Day','Recurring ID','Period'
  ]];
  tasks.forEach(t=>{
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

/* =========================
   Filters wiring
   ========================= */
['searchInput','priorityFilter','assigneeFilter','monthFilter','sortBy','sortDir'].forEach(id=> el(id).addEventListener('input', render));

/* =========================
   Status Multi-select
   ========================= */
const STATUS_OPTIONS = ['Not Started','In Progress','Waiting Client','On Hold','Completed'];
(function initStatusMulti(){
  const hidden = el('statusFilter'), btn = el('statusMultiBtn'), menu = el('statusMultiMenu');
  const applyBtn = el('statusApplyBtn'), clearBtn = el('statusClearBtn'); const sel = new Set();
  function updateButtonLabel(){ if(sel.size===0 || sel.size===STATUS_OPTIONS.length) btn.textContent='Status: All'; else btn.textContent=`Status: ${sel.size} selected`; }
  function syncHidden(){ hidden.value = (sel.size===0 || sel.size===STATUS_OPTIONS.length) ? '' : [...sel].join('|'); }
  function open(){ menu.hidden=false; document.addEventListener('click', onDocClick); }
  function close(){ menu.hidden=true; document.removeEventListener('click', onDocClick); }
  function onDocClick(e){ if(menu.contains(e.target) || btn.contains(e.target)) return; close(); }
  btn.addEventListener('click', ()=>{ menu.hidden?open():close(); });
  menu.querySelectorAll('input[type="checkbox"]').forEach(cb=> cb.addEventListener('change', ()=>{ cb.checked ? sel.add(cb.value) : sel.delete(cb.value); }));
  applyBtn.addEventListener('click', ()=>{ syncHidden(); updateButtonLabel(); close(); render(); });
  clearBtn.addEventListener('click', ()=>{ sel.clear(); menu.querySelectorAll('input[type="checkbox"]').forEach(cb=> cb.checked=false); syncHidden(); updateButtonLabel(); close(); render(); });
  updateButtonLabel();
})();

/* =========================
   Select-all & Bulk delete
   ========================= */
el('selectAll').addEventListener('change', (e)=>{
  const rows = $$('#taskTbody tr');
  const ids = rows.map(r=>r.dataset.id);
  if(e.target.checked){ ids.forEach(id=>selectedIds.add(id)); }
  else { ids.forEach(id=>selectedIds.delete(id)); }
  render();
});
el('bulkDeleteBtn').addEventListener('click', bulkDelete);

/* =========================
   Init
   ========================= */
function migrate(){
  for(const t of tasks){
    if(t.recur && t.period===undefined && !t.recurringId){ t.recurringId = crypto.randomUUID(); }
    if(t.recur && t.recurDay===undefined && t.deadline){ t.recurDay = Number(t.deadline.slice(8,10)); }
  }
}
load(); migrate();
if(tasks.length===0) seedDemo(); else { ensureRecurringInstances(); render(); }

/* =========================
   CREATE INVOICE FEATURE
   ========================= */
const invoiceModal = el('invoiceModal');
el('createInvoiceBtn').addEventListener('click', ()=>{
  openInvoiceModal(); autoPopulateInvoiceMeta();
});
el('invoiceCancelBtn').addEventListener('click', ()=> invoiceModal.classList.remove('active'));
invoiceModal.addEventListener('click', e=>{ if(e.target===invoiceModal) invoiceModal.classList.remove('active'); });
function openInvoiceModal(){ el('invoiceModalTitle').textContent='Create Invoice'; invoiceModal.classList.add('active'); setTimeout(()=>el('invClient').focus(),10); }

const serviceRows = el('serviceRows');
el('addServiceRowBtn').addEventListener('click', addServiceRow);
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
  el('invDate').value = todayStr();
  const { fy, seq } = nextInvoiceSequence();
  el('invNumber').value = formatInvoiceNumber('INSIGHT', fy, seq);
  serviceRows.innerHTML = ''; addServiceRow('', '');
  el('discountInput').value = 0; recomputeTotals();
}
el('discountInput').addEventListener('input', recomputeTotals);
function recomputeTotals(){
  const amts = $$('.svc-amt', serviceRows).map(i=>Number(i.value||0));
  const sub = amts.reduce((s,n)=>s+n,0);
  const disc = Number(el('discountInput').value||0);
  const grand = Math.max(sub - disc, 0);
  el('subTotal').textContent = fmtMoney(sub);
  el('grandTotal').textContent = fmtMoney(grand);
  el('amountWords').textContent = toIndianWords(Math.round(grand)) + ' only';
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
el('previewInvoiceBtn').addEventListener('click', ()=>{
  bindInvoicePreview(); window.open().document.write(el('invoiceA4').innerHTML);
});
el('downloadPdfBtn').addEventListener('click', async ()=>{
  bindInvoicePreview();
  const page = document.querySelector('.a4'), holder = el('invoiceA4');
  holder.style.visibility = 'visible'; holder.style.left = '0'; holder.style.top = '0'; holder.style.position = 'fixed';
  const scale = Math.max(3, Math.ceil((window.devicePixelRatio || 1) * 2));
  const canvas = await html2canvas(page, { scale, useCORS: true, backgroundColor: '#FFFFFF', logging: false });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jspdf.jsPDF('p','mm','a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const imgWidth = pageWidth; const imgHeight = canvas.height * imgWidth / canvas.width;
  pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
  const name = `${(el('invNumber').value||'Invoice').replace(/[^\w\-]+/g,'_')}.pdf`;
  pdf.save(name);
  holder.style.visibility = 'hidden'; holder.style.left = '-9999px'; holder.style.top = '-9999px';
});
function bindInvoicePreview(){
  const ddmmyyyy = fmtDateDDMMYYYY(el('invDate').value);
  $$('[data-bind="invNumber"]').forEach(elm => elm.textContent = el('invNumber').value || '');
  $$('[data-bind="invDateDDMM"]').forEach(elm => elm.textContent = ddmmyyyy || '');
  $$('[data-bind="client"]').forEach(elm => elm.textContent = el('invClient').value || '');
  $$('[data-bind="address"]').forEach(elm => elm.textContent = el('invAddress').value || '');
  $$('[data-bind="email"]').forEach(elm => elm.textContent = el('invEmail').value || '');
  $$('[data-bind="mobile"]').forEach(elm => elm.textContent = el('invMobile').value || '');
  $$('[data-bind="subTotal"]').forEach(elm => elm.textContent = el('subTotal').textContent || '0');
  $$('[data-bind="discount"]').forEach(elm => elm.textContent = fmtMoney(Number(el('discountInput').value||0)));
  $$('[data-bind="grandTotal"]').forEach(elm => elm.textContent = el('grandTotal').textContent || '0');
  $$('[data-bind="amountWords"]').forEach(elm => elm.textContent = el('amountWords').textContent || '');
  const tbody = document.querySelector('[data-bind="rows"]'); tbody.innerHTML = '';
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
el('openEditInvoiceBtn').addEventListener('click', ()=>{ openEditInvoiceModal(); });
el('editCancelBtn').addEventListener('click', ()=> editModal.classList.remove('active'));
editModal.addEventListener('click', e=>{ if(e.target===editModal) editModal.classList.remove('active'); });

function openEditInvoiceModal(){
  el('parseLog').innerHTML = 'Select or drop a PDF generated by this app.';
  el('pdfInput').value = '';
  editModal.classList.add('active');
  // Show current library diagnostics
  reportDebugInfo();
}
const drop = el('pdfDrop');
drop.addEventListener('dragover', e=>{ e.preventDefault(); drop.classList.add('hover'); });
drop.addEventListener('dragleave', ()=> drop.classList.remove('hover'));
drop.addEventListener('drop', e=>{
  e.preventDefault(); drop.classList.remove('hover');
  const f = e.dataTransfer.files && e.dataTransfer.files[0]; if(f) handlePdfFile(f);
});
el('pdfInput').addEventListener('change', e=>{
  const f = e.currentTarget.files && e.currentTarget.files[0]; if(f) handlePdfFile(f);
});

/* Debug toggle button */
el('debugToggleBtn').addEventListener('click', ()=>{
  if (localStorage.getItem('__DEBUG')) { localStorage.removeItem('__DEBUG'); }
  else { localStorage.setItem('__DEBUG','1'); }
  alert('Debug is now ' + (localStorage.getItem('__DEBUG') ? 'ON' : 'OFF') + '. Reload to apply.');
});

async function handlePdfFile(file){
  const steps = [];
  const log = el('parseLog');
  function fail(code, err, advice=''){
    const base = `❌ ${code}${advice?` — ${advice}`:''}`;
    pushStep(steps, base, code);
    if (err) { dlog(code, err); }
  }
  function ok(msg){ pushStep(steps, `✅ ${msg}`); }

  try{
    // 0) Basic lib checks
    if (!window.pdfjsLib){ fail('E_NO_LIB_PDFJS', null, 'pdf.js not loaded'); return; }
    ok('pdf.js present');

    if (!window.__pdfWorkerSet){
      // If file:// protocol, workers are commonly blocked
      const advice = (location.protocol === 'file:') ? 'Worker likely blocked on file:// — serve via http:// (e.g., VSCode Live Server).' : 'Worker not set — check network.';
      fail('E_WORKER_NOT_SET', null, advice);
      // we still try; pdf.js can fall back in some environments
    } else {
      ok('pdf.js worker configured');
    }

    if (!window.Tesseract){ fail('E_NO_LIB_TESSERACT', null, 'tesseract.js not loaded (OCR fallback unavailable)'); }
    else ok('tesseract.js present');

    // 1) Read file buffer
    ok('Reading file (ArrayBuffer)…');
    const buf = await file.arrayBuffer();

    // 2) Open PDF
    ok('Opening PDF with pdf.js…');
    let pdf;
    try{
      pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    }catch(openErr){
      fail('E_PDF_OPEN', openErr, 'Could not open PDF — ensure it is a valid PDF file');
      return;
    }
    ok(`PDF opened (${pdf.numPages} page(s))`);

    // 3) Extract text from all pages
    let textAll = '';
    for (let p = 1; p <= pdf.numPages; p++){
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const chunk = tc.items.map(i => (i.str||'').trim()).filter(Boolean).join('\n');
      textAll += chunk + '\n';
    }
    if (textAll.trim()){
      ok('Embedded text found via pdf.js');
    } else {
      pushStep(steps, 'ℹ️ No embedded text found — attempting OCR…');

      // 4) OCR the first page (image-only PDFs)
      if (!window.Tesseract){
        fail('E_NO_TEXT_NO_OCR', null, 'No text & OCR lib missing — cannot parse');
        return;
      }
      const page1 = await pdf.getPage(1);
      const viewport = page1.getViewport({ scale: 2.6 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      try{
        await page1.render({ canvasContext: ctx, viewport }).promise;
        ok('Rendered page 1 to canvas for OCR');
      } catch(rendErr){
        fail('E_RENDER_PAGE', rendErr, 'Could not render page for OCR');
        return;
      }

      try{
        const res = await Tesseract.recognize(canvas, 'eng', { logger: (m)=>{ if(DEBUG) dlog('OCR', m); } });
        textAll = (res && res.data && res.data.text || '').replace(/\r/g,'').trim();
        if (textAll) ok('OCR text extracted');
        else { fail('E_OCR_EMPTY', null, 'OCR produced empty text'); return; }
      }catch(ocrErr){
        fail('E_OCR_FAIL', ocrErr, 'tesseract.js error');
        return;
      }
    }

    // 5) Parse invoice text
    ok('Parsing invoice text…');
    const parsed = parseInvoiceText(textAll);
    if (!parsed || (!parsed.invNo && !parsed.name && (!parsed.services || !parsed.services.length))){
      fail('E_PARSE_EMPTY', null, 'Parser did not find expected fields');
      return;
    }
    ok('Parser produced fields');

    // 6) Apply to form
    ok('Applying fields to Create Invoice form…');
    applyParsedToForm(parsed);
    recomputeTotals();
    bindInvoicePreview();
    ok('Done — form populated');
    setTimeout(()=> editModal.classList.remove('active'), 900);

  }catch(err){
    fail('E_UNCAUGHT', err, 'Unexpected error (see console)');
  }
}

/* ============ Parser tailored to our invoice layout ============ */
function parseInvoiceText(txt){
  // Normalise whitespace (keep newlines as hard row breaks)
  const T = (txt||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n');

  // helpers
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

  // Receiver block: between "Detail of Receiver" and table start
  const recvBlock = (() => {
    const start = T.search(/Detail\s+of\s+Receiver/i);
    if (start < 0) return '';
    const end = T.search(/S\.\s*No\.|Service\s*Description/i);
    return end>start ? T.slice(start, end) : T.slice(start);
  })();

  // Strict field extraction from receiver block
  // 1) Name — stop before any currency '₹' or the phrase 'Invoice Amount'
  let name = pick(/Name:\s*([^\n₹]+)/i, recvBlock).replace(/\bInvoice\s*Amount.*$/i,'').trim();
  // Remove stray currency/number fragments at end
  name = name.replace(/\s*₹.*$/,'').replace(/\s+\d[\d,]*(?:\.\d{1,2})?$/, '').trim();

  // 2) Email — capture only a valid email; blank if none
  let emailRaw = pick(/E-?mail:\s*([^\n]+)/i, recvBlock);
  let email = '';
  const emailMatch = emailRaw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) email = emailMatch[0].trim();

  // 3) Mobile — capture only phone-like value; blank if too few digits
  let mobileLine = pick(/Mobile\s*No:\s*([^\n]+)/i, recvBlock);
  let mobile = '';
  if (mobileLine) {
    // keep only digits, +, spaces, () and -
    const cleaned = mobileLine.replace(/[^\d+()\-\s]/g,'').trim();
    const digitCount = (cleaned.match(/\d/g)||[]).length;
    mobile = (digitCount >= 7) ? cleaned : '';
  }

  // 4) Address — between Address: and next Email/Mobile/end
  const address = (() => {
    const m = recvBlock.match(/Address:\s*([\s\S]*?)(?:E-?mail:|Mobile\s*No:|$)/i);
    return m ? m[1].replace(/\n+/g,' ').trim() : '';
  })();

  // Table rows block
  const rowsBlock = (() => {
    const start = T.search(/Service\s*Description/i);
    const end = T.search(/Sub\s*Total/i);
    return (start>=0 && end>start) ? T.slice(start, end) : '';
  })();

  // Extract services robustly
  const services = [];
  if (rowsBlock) {
    // Normalise for regex line scanning
    const R = rowsBlock.replace(/[ \t]+/g,' ').replace(/\r/g,'');
    // Prefer "S. No.  <desc>  <amount>" line pattern
    const rowRe = /(?:^|\n)\s*\d{1,3}\s+([^\n₹]+?)\s+(₹?\s*[\d,]+(?:\.\d{1,2})?)(?=\s*(?:\n|$))/g;
    let m;
    while ((m = rowRe.exec(R)) !== null) {
      const desc = (m[1]||'').replace(/\b(Service\s*Description|Amount(?:\s*\(₹\))?)\b/ig,'').trim();
      const amtStr = (m[2]||'').replace(/[₹\s,]/g,'').trim();
      if (desc || amtStr) services.push({ desc, amt: Number(amtStr||0) });
    }

    // Fallback: rolling window (as before) but with header stripping and symbol cleanup
    if (services.length === 0) {
      const lines = R.split('\n').map(s=>s.trim()).filter(Boolean);
      const filtered = lines.filter(l => !/^S\.\s*No\.?$/i.test(l) && !/^Service\s*Description$/i.test(l) && !/^Amount/i.test(l));
      let cur = '';
      for (const l of filtered) {
        cur = cur ? (cur + ' ' + l) : l;
        const amountMatch = cur.match(new RegExp(`(.*?)\\s+(₹?\\s*${DIGITS.source})$`));
        if (amountMatch) {
          let desc = (amountMatch[1]||'').trim();
          desc = desc
            .replace(/\b(Service\s*Description|Amount(?:\s*\(₹\))?|S\.\s*No\.?)\b/ig,'')
            .replace(/\(\d+\)/g,'')
            .replace(/\s*%+\s*$/,'')
            .trim();
          const amtStr = (amountMatch[2]||'').replace(/[₹\s,]/g,'').trim();
          if (desc || amtStr) services.push({ desc, amt: Number(amtStr||0) });
          cur = '';
        }
      }
    }
  }

  // Totals
  const subTotalNum   = pickMoneyAfter('Sub\\s*Total');
  const discountNum   = pickMoneyAfter('Less:\\s*Discount');
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

/* Apply parsed fields into Create Invoice form (unchanged) */
function applyParsedToForm(p){
  if(p.invNo) el('invNumber').value = p.invNo;
  if(p.invDateISO) el('invDate').value = p.invDateISO;

  // Only set values if present (blank stays blank)
  if(typeof p.name === 'string')   el('invClient').value = p.name;
  if(typeof p.email === 'string')  el('invEmail').value  = p.email;
  if(typeof p.mobile === 'string') el('invMobile').value = p.mobile;
  if(typeof p.address === 'string')el('invAddress').value= p.address;

  if(Array.isArray(p.services) && p.services.length){
    serviceRows.innerHTML = '';
    p.services.forEach(s => addServiceRow(s.desc || '', String(s.amt || '')));
  }
  if(Number.isFinite(p.discount)) el('discountInput').value = p.discount;
}

/* =========================
   Misc
   ========================= */
const resetBtn = el('resetDemoBtn');
if(resetBtn){
  resetBtn.addEventListener('click', ()=>{
    if(confirm('Reset demo data?')){ localStorage.clear(); load(); seedDemo(); }
  });
}
