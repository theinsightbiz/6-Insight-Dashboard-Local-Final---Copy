// ===== Utilities =====
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const $ = (sel, root=document) => root.querySelector(sel);
const fmtMoney = n => (Number(n||0)).toLocaleString('en-IN',{maximumFractionDigits:2});
const todayStr = () => new Date().toISOString().slice(0,10);
const yymm = (dstr) => (dstr||'').slice(0,7); // YYYY-MM

// DD/MM/YYYY
function fmtDateDDMMYYYY(iso){
  if(!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Date helpers
function addDays(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function lastDayOfMonth(y,m){ return new Date(y, m+1, 0).getDate(); }
function makeDateYMD(y,m,day){ const max = lastDayOfMonth(y,m); const d = Math.min(day, max); return new Date(y, m, d).toISOString().slice(0,10); }

// ===== Storage =====
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

// ===== Recurring generation =====
function ensureRecurringInstances(){
  const now = new Date();
  const horizon = 6; // months ahead
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
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          client: tpl.client,
          title: tpl.title,
          priority: tpl.priority,
          assignee: tpl.assignee,
          status: 'Not Started',
          deadline: dl,
          fee: Number(tpl.fee||0),
          advance: 0,
          invoiceStatus: 'Not Raised',
          notes: tpl.notes||'',
          recur: true,
          recurDay,
          recurringId: rid,
          period
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

// ===== Demo Seed =====
function seedDemo(){
  tasks = [
    {id:crypto.randomUUID(), client:'Multi Client (GSTR-1)', title:'GSTR-1 Filing', priority:'High', assignee:'Team GST', status:'Not Started', deadline: makeDateYMD(new Date().getFullYear(), new Date().getMonth(), 11), fee:1200, advance:0, invoiceStatus:'', notes:'Auto-generated monthly from template', createdAt:Date.now(), recur:true, recurDay:11, recurringId: crypto.randomUUID()},
    {id:crypto.randomUUID(), client:'BlueLeaf LLP', title:'Tax Audit – Form 3CB-3CD FY 24-25', priority:'High', assignee:'Netan', status:'Not Started', deadline:addDays(20), fee:85000, advance:20000, invoiceStatus:'', notes:'Engagement letter signed', createdAt:Date.now()-86400000},
    {id:crypto.randomUUID(), client:'Nova Foods', title:'Incorporation – OPC (SPICe+) corrections', priority:'High', assignee:'Pratik', status:'In Progress', deadline:addDays(5), fee:25000, advance:10000, invoiceStatus:addDays(-1), notes:'ROC resubmission comments to fix AOA', createdAt:Date.now()-3600}
  ];
  tasks[0].period = undefined; // template
  save(); ensureRecurringInstances(); render();
}

// ===== Selection (bulk delete) =====
let selectedIds = new Set();
function toggleSelect(id, checked){ checked ? selectedIds.add(id) : selectedIds.delete(id); updateSelectAllState(); }
function updateSelectAllState(){
  const visibleRows = $$('#taskTbody tr');
  const visibleIds = new Set(visibleRows.map(r=>r.dataset.id));
  const allChecked = visibleRows.length>0 && [...visibleIds].every(id=>selectedIds.has(id));
  $('#selectAll').checked = allChecked;
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

// ===== Rendering =====
const tbody = document.getElementById('taskTbody');

function render(){
  ensureRecurringInstances();

  const q = $('#searchInput').value.trim().toLowerCase();
  const pf = $('#priorityFilter').value;
  const sfRaw = $('#statusFilter').value;
  const sf = sfRaw ? new Set(sfRaw.split('|')) : null;
  const af = $('#assigneeFilter').value;
  const mf = $('#monthFilter').value;

  let filtered = tasks.filter(t => !(t.recur && !t.period));

  filtered = filtered.filter(t => {
    const matchQ = !q || [t.client,t.title,t.assignee,(t.notes||'')].some(x => String(x).toLowerCase().includes(q));
    const matchP = !pf || t.priority===pf;
    const matchS = !sf || sf.has(t.status);
    const matchA = !af || t.assignee===af;
    const matchM = !mf || yymm(t.deadline)===mf;
    return matchQ && matchP && matchS && matchA && matchM;
  });

  const sortBy = $('#sortBy').value; const dir = $('#sortDir').value==='asc'?1:-1;
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
  const afSel = $('#assigneeFilter');
  const curA = afSel.value; afSel.innerHTML = '<option value="">In-Charge: All</option>' + assignees.map(a=>`<option ${a===curA?'selected':''}>${a}</option>`).join('');

  // Month filter options
  const months = [...new Set(tasks.filter(t=>t.deadline).map(t=>yymm(t.deadline)))].sort();
  const mfSel = $('#monthFilter');
  const curM = mfSel.value; mfSel.innerHTML = '<option value="">Month: All</option>' + months.map(m=>`<option ${m===curM?'selected':''} value="${m}">${formatMonthLabel(m)}</option>`).join('');

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
  $('#kpiTotal').textContent=total;
  $('#kpiPending').textContent=pending;
  $('#kpiOverdue').textContent=overdue;
  $('#kpiFee').textContent=fmtMoney(sumFee);
  $('#kpiAdv').textContent=fmtMoney(sumAdv);
  $('#kpiOut').textContent=fmtMoney(sumOut);

  updateSelectAllState();
}

function formatMonthLabel(m){
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo-1, 1).toLocaleString('en-IN',{month:'short', year:'numeric'});
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

// ===== Actions =====
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
  const form = document.getElementById('taskForm');
  form.dataset.editId = id;
  $('#fClient').value=t.client||'';
  $('#fTitle').value=t.title||'';
  $('#fPriority').value=t.priority||'Medium';
  $('#fAssignee').value=t.assignee||'';
  $('#fStatus').value=t.status||'In Progress';
  $('#fDeadline').value=t.deadline||'';
  $('#fFee').value=t.fee||0;
  $('#fAdvance').value=t.advance||0;
  $('#fInvoiceStatus').value = t.invoiceStatus || '';
  $('#fNotes').value=t.notes||'';
  $('#fRecurring').checked=!!t.recur && !t.period;
}

function changeInvoiceStatus(id, val){
  const t = tasks.find(x=>x.id===id); if(!t) return;
  t.invoiceStatus = val; save(); render();
}

// ===== Task Modal wiring =====
const taskModal = document.getElementById('taskModal');
document.getElementById('addTaskBtn').addEventListener('click', ()=>{
  openTaskModal('New Task');
  const form = document.getElementById('taskForm');
  form.reset();
  $('#fDeadline').value=todayStr();
  delete form.dataset.editId;
});
document.getElementById('cancelBtn').addEventListener('click', closeTaskModal);
taskModal.addEventListener('click', e=>{ if(e.target===taskModal) closeTaskModal(); });
function openTaskModal(title){ $('#taskModalTitle').textContent=title; taskModal.classList.add('active'); setTimeout(()=>$('#fClient').focus(), 10); }
function closeTaskModal(){ taskModal.classList.remove('active'); }

document.getElementById('taskForm').addEventListener('submit', e=>{
  e.preventDefault();
  const form = e.currentTarget;
  const editId = form.dataset.editId;
  const existing = editId ? tasks.find(x=>x.id===editId) : null;

  const isRecurringTemplate = $('#fRecurring').checked;
  const deadlineVal = $('#fDeadline').value;
  const recurDay = deadlineVal ? Number(deadlineVal.slice(8,10)) : new Date().getDate();

  const data = {
    client: $('#fClient').value.trim(),
    title: $('#fTitle').value.trim(),
    priority: $('#fPriority').value,
    assignee: $('#fAssignee').value.trim(),
    status: $('#fStatus').value,
    deadline: deadlineVal,
    fee: Number($('#fFee').value||0),
    advance: Number($('#fAdvance').value||0),
    invoiceStatus: $('#fInvoiceStatus').value,
    notes: $('#fNotes').value.trim()
  };
  if(data.advance > data.fee){ alert('Advance cannot exceed total fee.'); return; }

  if(existing){
    const wasTemplate = !!existing.recur && !existing.period;
    if(wasTemplate){
      existing.client = data.client;
      existing.title = data.title;
      existing.priority = data.priority;
      existing.assignee = data.assignee;
      existing.fee = data.fee;
      existing.notes = data.notes;
      existing.deadline = data.deadline;
      existing.recur = true;
      existing.recurDay = recurDay;
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

// ===== Export CSV =====
$('#exportCsvBtn').addEventListener('click', ()=>{
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

// ===== Filters wiring =====
['searchInput','priorityFilter','assigneeFilter','monthFilter','sortBy','sortDir']
  .forEach(id=> document.getElementById(id).addEventListener('input', render));

// ===== Status Multi-select =====
const STATUS_OPTIONS = ['Not Started','In Progress','Waiting Client','On Hold','Completed'];
(function initStatusMulti(){
  const hidden = $('#statusFilter');
  const btn = $('#statusMultiBtn');
  const menu = $('#statusMultiMenu');
  const applyBtn = $('#statusApplyBtn');
  const clearBtn = $('#statusClearBtn');
  const sel = new Set();
  function updateButtonLabel(){ if(sel.size===0 || sel.size===STATUS_OPTIONS.length) btn.textContent='Status: All'; else btn.textContent=`Status: ${sel.size} selected`; }
  function syncHidden(){ hidden.value = (sel.size===0 || sel.size===STATUS_OPTIONS.length) ? '' : [...sel].join('|'); }
  function open(){ menu.hidden=false; document.addEventListener('click', onDocClick, { once:false }); }
  function close(){ menu.hidden=true; document.removeEventListener('click', onDocClick, { once:false }); }
  function onDocClick(e){ if(menu.contains(e.target) || btn.contains(e.target)) return; close(); }
  btn.addEventListener('click', ()=>{ menu.hidden?open():close(); });
  menu.querySelectorAll('input[type="checkbox"]').forEach(cb=>{
    cb.addEventListener('change', ()=>{ cb.checked ? sel.add(cb.value) : sel.delete(cb.value); });
  });
  applyBtn.addEventListener('click', ()=>{ syncHidden(); updateButtonLabel(); close(); render(); });
  clearBtn.addEventListener('click', ()=>{ sel.clear(); menu.querySelectorAll('input[type="checkbox"]').forEach(cb=> cb.checked=false); syncHidden(); updateButtonLabel(); close(); render(); });
  if(hidden.value){ hidden.value.split('|').forEach(v=>{ if(STATUS_OPTIONS.includes(v)) sel.add(v); }); menu.querySelectorAll('input[type="checkbox"]').forEach(cb=> cb.checked = sel.has(cb.value)); }
  updateButtonLabel();
})();

// Select-all wiring
$('#selectAll').addEventListener('change', (e)=>{
  const rows = $$('#taskTbody tr');
  const ids = rows.map(r=>r.dataset.id);
  if(e.target.checked){ ids.forEach(id=>selectedIds.add(id)); }
  else { ids.forEach(id=>selectedIds.delete(id)); }
  render();
});

// Bulk delete button
$('#bulkDeleteBtn').addEventListener('click', bulkDelete);

// ===== Init =====
function migrate(){
  for(const t of tasks){
    if(t.recur && t.period===undefined && !t.recurringId){ t.recurringId = crypto.randomUUID(); }
    if(t.recur && t.recurDay===undefined && t.deadline){ t.recurDay = Number(t.deadline.slice(8,10)); }
  }
}
load(); migrate();
if(tasks.length===0) seedDemo(); else { ensureRecurringInstances(); render(); }

// ===== CREATE INVOICE FEATURE =====

// Open/close modal
const invoiceModal = $('#invoiceModal');
$('#createInvoiceBtn').addEventListener('click', ()=>{
  openInvoiceModal();
  autoPopulateInvoiceMeta();
});
$('#invoiceCancelBtn').addEventListener('click', ()=> invoiceModal.classList.remove('active'));
invoiceModal.addEventListener('click', e=>{ if(e.target===invoiceModal) invoiceModal.classList.remove('active'); });
function openInvoiceModal(){ $('#invoiceModalTitle').textContent='Create Invoice'; invoiceModal.classList.add('active'); setTimeout(()=>$('#invClient').focus(),10); }

// Service rows
const serviceRows = $('#serviceRows');
$('#addServiceRowBtn').addEventListener('click', addServiceRow);
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
  row.querySelector('.svc-desc').addEventListener('input', ()=>{});
  row.querySelector('.remove').addEventListener('click', ()=>{
    row.remove();
    reindexServiceRows();
    recomputeTotals();
  });
  recomputeTotals();
}
function reindexServiceRows(){ [...serviceRows.children].forEach((r,i)=>{ r.firstElementChild.textContent = String(i+1); }); }

// Invoice numbering (auto but editable)
function currentFY(dateObj){
  const d = dateObj || new Date();
  const y = d.getFullYear();
  const m = d.getMonth(); // 0=Jan
  return (m>=3) ? `${y}-${String(y+1).slice(-2)}` : `${y-1}-${String(y).slice(-2)}`;
}
function nextInvoiceSequence(){
  const seqKey = 'ca-invoice-seq';
  const fyKey  = 'ca-invoice-fy';
  const today = new Date();
  const fy = currentFY(today);
  const storedFY = localStorage.getItem(fyKey);
  let seq = Number(localStorage.getItem(seqKey) || 0);
  if(storedFY !== fy){ seq = 0; }
  seq += 1;
  localStorage.setItem(seqKey, String(seq));
  localStorage.setItem(fyKey, fy);
  return { fy, seq };
}
function formatInvoiceNumber(prefix, fy, seq){
  return `${prefix}/${fy}/${String(seq).padStart(3,'0')}`;
}
function autoPopulateInvoiceMeta(){
  $('#invDate').value = todayStr();
  const { fy, seq } = nextInvoiceSequence();
  $('#invNumber').value = formatInvoiceNumber('INSIGHT', fy, seq);
  // fresh default rows
  serviceRows.innerHTML = '';
  addServiceRow('', '');
  $('#discountInput').value = 0;
  recomputeTotals();
}

// Totals + words
$('#discountInput').addEventListener('input', recomputeTotals);
function recomputeTotals(){
  const amts = $$('.svc-amt', serviceRows).map(i=>Number(i.value||0));
  const sub = amts.reduce((s,n)=>s+n,0);
  const disc = Number($('#discountInput').value||0);
  const grand = Math.max(sub - disc, 0);
  $('#subTotal').textContent = fmtMoney(sub);
  $('#grandTotal').textContent = fmtMoney(grand);
  $('#amountWords').textContent = toIndianWords(Math.round(grand)) + ' only';
}

// Indian number to words (simple integer rupees)
function toIndianWords(num){
  if(num===0) return 'Zero Rupees';
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function two(n){ return n<20 ? a[n] : b[Math.floor(n/10)] + (n%10?` ${a[n%10]}`:''); }
  function three(n){ const h = Math.floor(n/100), r=n%100; return (h?`${a[h]} Hundred${r?' ':''}`:'') + (r?two(r):''); }
  const crore = Math.floor(num/10000000); num%=10000000;
  const lakh = Math.floor(num/100000); num%=100000;
  const thousand = Math.floor(num/1000); num%=1000;
  const hundred = num;
  let out = '';
  if(crore) out += `${three(crore)} Crore `;
  if(lakh) out += `${three(lakh)} Lakh `;
  if(thousand) out += `${three(thousand)} Thousand `;
  if(hundred) out += `${three(hundred)}`;
  return (out.trim() || 'Zero') + ' Rupees';
}

// Preview binds form values into A4 template
$('#previewInvoiceBtn').addEventListener('click', ()=>{
  bindInvoicePreview();
  window.open().document.write($('#invoiceA4').innerHTML);
});

// Download PDF (4) higher DPI + robust sizing for crisp Firefox/Chrome output
$('#downloadPdfBtn').addEventListener('click', async ()=>{
  bindInvoicePreview();

  const page = $('.a4');
  const holder = $('#invoiceA4');

  // make visible for accurate rendering
  holder.style.visibility = 'visible';
  holder.style.left = '0'; holder.style.top = '0'; holder.style.position = 'fixed';

  // device-aware scale (improves sharpness esp. Firefox)
  const scale = Math.max(3, Math.ceil((window.devicePixelRatio || 1) * 2));

  const canvas = await html2canvas(page, {
    scale,
    useCORS: true,
    backgroundColor: '#FFFFFF',
    logging: false
  });

  const imgData = canvas.toDataURL('image/png'); // keep default quality (sharper than FAST)
  const pdf = new jspdf.jsPDF('p','mm','a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = canvas.height * imgWidth / canvas.width;

  pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
  const name = `${($('#invNumber').value||'Invoice').replace(/[^\w\-]+/g,'_')}.pdf`;
  pdf.save(name);

  // hide again
  holder.style.visibility = 'hidden';
  holder.style.left = '-9999px'; holder.style.top = '-9999px';
});

// Bind data into the printable template
function bindInvoicePreview(){
  const ddmmyyyy = fmtDateDDMMYYYY($('#invDate').value);

  // (2) write to ALL matching placeholders, not just the first
  $$('[data-bind="invNumber"]').forEach(el => el.textContent = $('#invNumber').value || '');
  $$('[data-bind="invDateDDMM"]').forEach(el => el.textContent = ddmmyyyy || '');
  $$('[data-bind="client"]').forEach(el => el.textContent = $('#invClient').value || '');
  $$('[data-bind="address"]').forEach(el => el.textContent = $('#invAddress').value || '');
  $$('[data-bind="email"]').forEach(el => el.textContent = $('#invEmail').value || '');
  $$('[data-bind="mobile"]').forEach(el => el.textContent = $('#invMobile').value || '');
  $$('[data-bind="subTotal"]').forEach(el => el.textContent = $('#subTotal').textContent || '0');
  $$('[data-bind="discount"]').forEach(el => el.textContent = fmtMoney(Number($('#discountInput').value||0)));
  $$('[data-bind="grandTotal"]').forEach(el => el.textContent = $('#grandTotal').textContent || '0');
  $$('[data-bind="amountWords"]').forEach(el => el.textContent = $('#amountWords').textContent || '');

  // rows
  const tbody = $('[data-bind="rows"]');
  tbody.innerHTML = '';
  $$('.inv-row', serviceRows).forEach((r,i)=>{
    const desc = r.querySelector('.svc-desc').value.trim();
    const amt  = Number(r.querySelector('.svc-amt').value||0);
    if(!desc && !amt) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td>${esc(desc)}</td><td class="money">₹ ${fmtMoney(amt)}</td>`;
    tbody.appendChild(tr);
  });

  // (3) move computer-generated note outside T&C box (below it)
  const termsBox = document.querySelector('.inv-terms');
  if(termsBox){
    // ensure external note exists once
    let external = document.querySelector('.inv-note');
    if(!external){
      external = document.createElement('div');
      external.className = 'inv-note';
      termsBox.insertAdjacentElement('afterend', external);
    }
    external.textContent = 'Note: This is a computer generated invoice and hence does not require a signature.';
  }
}

// Helpers
function esc(s){return String(s).replace(/[&<>\"]+/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]))}

// Demo reset
const resetBtn = $('#resetDemoBtn');
if(resetBtn){
  resetBtn.addEventListener('click', ()=>{
    if(confirm('Reset demo data?')){ localStorage.clear(); load(); seedDemo(); }
  });
}
