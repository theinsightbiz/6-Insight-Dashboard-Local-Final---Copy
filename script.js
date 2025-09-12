// ===== Utilities =====
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const $  = (sel, root=document) => root.querySelector(sel);
const fmtMoney = n => (Number(n||0)).toLocaleString('en-IN',{maximumFractionDigits:2});
const todayStr = () => new Date().toISOString().slice(0,10);
const yymm = (dstr) => (dstr||'').slice(0,7);
const DIGITS = /[\d,]+(?:\.\d{1,2})?/;

// DD/MM/YYYY
function fmtDateDDMMYYYY(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function parseDDMM(s){ const m=s&&s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m?`${m[3]}-${m[2]}-${m[1]}`:''; }

// Date helpers
function addDays(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function lastDayOfMonth(y,m){ return new Date(y, m+1, 0).getDate(); }
function makeDateYMD(y,m,day){ const max=lastDayOfMonth(y,m); const d=Math.min(day,max); return new Date(y,m,d).toISOString().slice(0,10); }

// ===== Storage & tasks (UNCHANGED core logic) =====
const KEY='ca-dashboard-tasks-v1', SKIP_KEY='ca-dashboard-skip-v1';
let tasks=[], skips=[];
function load(){ try{tasks=JSON.parse(localStorage.getItem(KEY))||[];}catch{} try{skips=JSON.parse(localStorage.getItem(SKIP_KEY))||[];}catch{} }
function save(){ localStorage.setItem(KEY, JSON.stringify(tasks)); }
function saveSkips(){ localStorage.setItem(SKIP_KEY, JSON.stringify(skips)); }
function isSkipped(rid,period){ return !!skips.find(s=>s.recurringId===rid && s.period===period); }
function addSkip(rid,period){ if(rid && period && !isSkipped(rid,period)){ skips.push({recurringId:rid,period}); saveSkips(); } }
function removeSkipsForSeries(rid){ if(!rid) return; skips=skips.filter(s=>s.recurringId!==rid); saveSkips(); }

function ensureRecurringInstances(){
  const now=new Date(), horizon=6, templates=tasks.filter(t=>t.recur&&!t.period);
  for(const tpl of templates){
    const rid=tpl.recurringId||crypto.randomUUID(); tpl.recurringId=rid;
    const recurDay=tpl.recurDay||(tpl.deadline?Number(tpl.deadline.slice(8,10)):now.getDate()); tpl.recurDay=recurDay;
    const tplDate=tpl.deadline?new Date(tpl.deadline):now;
    const tplYM=tplDate.getFullYear()*12+tplDate.getMonth(), nowYM=now.getFullYear()*12+now.getMonth();
    const base=(tplYM>=nowYM)?tplDate:now, baseY=base.getFullYear(), baseM=base.getMonth();
    for(let i=0;i<horizon;i++){
      const y=baseY+Math.floor((baseM+i)/12), m=(baseM+i)%12;
      const dl=makeDateYMD(y,m,recurDay), period=`${y}-${String(m+1).padStart(2,'0')}`;
      const exists=tasks.some(t=>t.period===period && t.recurringId===rid);
      if(!exists && !isSkipped(rid,period)){
        tasks.push({id:crypto.randomUUID(),createdAt:Date.now(),client:tpl.client,title:tpl.title,priority:tpl.priority,assignee:tpl.assignee,status:'Not Started',deadline:dl,fee:Number(tpl.fee||0),advance:0,invoiceStatus:'Not Raised',notes:tpl.notes||'',recur:true,recurDay,recurringId:rid,period});
      }
    }
  }
  save();
}
function syncSeriesFromTemplate(tpl){
  const rid=tpl.recurringId; if(!rid) return;
  const today=todayStr(); tasks=tasks.filter(t=>!(t.recurringId===rid && t.period && t.deadline>=today));
  ensureRecurringInstances();
}

function seedDemo(){
  tasks=[
    {id:crypto.randomUUID(),client:'Multi Client (GSTR-1)',title:'GSTR-1 Filing',priority:'High',assignee:'Team GST',status:'Not Started',deadline:makeDateYMD(new Date().getFullYear(), new Date().getMonth(), 11),fee:1200,advance:0,invoiceStatus:'',notes:'Auto-generated monthly from template',createdAt:Date.now(),recur:true,recurDay:11,recurringId: crypto.randomUUID()},
    {id:crypto.randomUUID(),client:'BlueLeaf LLP',title:'Tax Audit – Form 3CB-3CD FY 24-25',priority:'High',assignee:'Netan',status:'Not Started',deadline:addDays(20),fee:85000,advance:20000,invoiceStatus:'',notes:'Engagement letter signed',createdAt:Date.now()-86400000},
    {id:crypto.randomUUID(),client:'Nova Foods',title:'Incorporation – OPC (SPICe+) corrections',priority:'High',assignee:'Pratik',status:'In Progress',deadline:addDays(5),fee:25000,advance:10000,invoiceStatus:addDays(-1),notes:'ROC resubmission comments to fix AOA',createdAt:Date.now()-3600}
  ];
  tasks[0].period=undefined; save(); ensureRecurringInstances(); render();
}

let selectedIds=new Set();
function toggleSelect(id,ch){ ch?selectedIds.add(id):selectedIds.delete(id); updateSelectAllState(); }
function updateSelectAllState(){ const rows=$$('#taskTbody tr'); const ids=new Set(rows.map(r=>r.dataset.id)); const all=rows.length>0 && [...ids].every(id=>selectedIds.has(id)); $('#selectAll').checked=all; }

function bulkDelete(){
  const rows=$$('#taskTbody tr'); const visIds=new Set(rows.map(r=>r.dataset.id));
  const to=[...selectedIds].filter(id=>visIds.has(id));
  if(!to.length) return alert('Select at least one task (visible).');
  const pass=prompt('Enter password to delete selected tasks:'); if(pass!=='14Dec@1998') return alert('Incorrect password.');
  if(!confirm(`Delete ${to.length} task(s)? This cannot be undone.`)) return;
  const kill=new Set(to);
  for(const t of tasks){
    if(!kill.has(t.id)) continue;
    if(t.recur&&!t.period&&t.recurringId){ for(const inst of tasks.filter(x=>x.recurringId===t.recurringId && x.period)) kill.add(inst.id); removeSkipsForSeries(t.recurringId); }
    else if(t.recur&&t.period&&t.recurringId){ addSkip(t.recurringId,t.period); }
  }
  tasks=tasks.filter(t=>!kill.has(t.id)); selectedIds.clear(); save(); render();
}

const tbody=document.getElementById('taskTbody');
function render(){
  ensureRecurringInstances();
  const q=$('#searchInput').value.trim().toLowerCase(), pf=$('#priorityFilter').value, sfRaw=$('#statusFilter').value, sf=sfRaw?new Set(sfRaw.split('|')):null, af=$('#assigneeFilter').value, mf=$('#monthFilter').value;
  let filtered=tasks.filter(t=>!(t.recur&&!t.period));
  filtered=filtered.filter(t=>{
    const matchQ=!q||[t.client,t.title,t.assignee,(t.notes||'')].some(x=>String(x).toLowerCase().includes(q));
    const matchP=!pf||t.priority===pf, matchS=!sf||sf.has(t.status), matchA=!af||t.assignee===af, matchM=!mf||yymm(t.deadline)===mf;
    return matchQ&&matchP&&matchS&&matchA&&matchM;
  });
  const sortBy=$('#sortBy').value, dir=$('#sortDir').value==='asc'?1:-1;
  filtered.sort((a,b)=>{
    if(sortBy==='deadline') return (a.deadline||'').localeCompare(b.deadline||'')*dir;
    if(sortBy==='createdAt') return (a.createdAt-b.createdAt)*dir;
    if(sortBy==='priority') return ({High:1,Medium:2,Low:3}[a.priority]-{High:1,Medium:2,Low:3}[b.priority])*dir;
    if(sortBy==='status') return a.status.localeCompare(b.status)*dir;
    if(sortBy==='fee') return ((a.fee||0)-(b.fee||0))*dir;
    return 0;
  });
  // Assignee options
  const assignees=[...new Set(tasks.filter(t=>!(t.recur&&!t.period)).map(t=>t.assignee).filter(Boolean))];
  const afSel=$('#assigneeFilter'); const curA=afSel.value; afSel.innerHTML='<option value="">In-Charge: All</option>'+assignees.map(a=>`<option ${a===curA?'selected':''}>${a}</option>`).join('');
  // Month options
  const months=[...new Set(tasks.filter(t=>t.deadline).map(t=>yymm(t.deadline)))].sort();
  const mfSel=$('#monthFilter'); const curM=mfSel.value; mfSel.innerHTML='<option value="">Month: All</option>'+months.map(m=>`<option ${m===curM?'selected':''} value="${m}">${new Date(m+'-01').toLocaleString('en-IN',{month:'short',year:'numeric'})}</option>`).join('');
  // Rows
  tbody.innerHTML=filtered.map(t=>rowHtml(t)).join('');
  // re-check selected
  for(const cb of $$('#taskTbody input[type="checkbox"].row-select')) cb.checked=selectedIds.has(cb.dataset.id);
  // KPIs
  const now=todayStr(), visible=tasks.filter(t=>!(t.recur&&!t.period)), total=visible.length, pending=visible.filter(t=>t.status!=='Completed').length, overdue=visible.filter(t=>t.status!=='Completed'&&t.deadline&&t.deadline<now).length;
  const sumFee=visible.reduce((s,t)=>s+Number(t.fee||0),0), sumAdv=visible.reduce((s,t)=>s+Number(t.advance||0),0), sumOut=sumFee-sumAdv;
  $('#kpiTotal').textContent=total; $('#kpiPending').textContent=pending; $('#kpiOverdue').textContent=overdue; $('#kpiFee').textContent=fmtMoney(sumFee); $('#kpiAdv').textContent=fmtMoney(sumAdv); $('#kpiOut').textContent=fmtMoney(sumOut);
  updateSelectAllState();
}
function rowHtml(t){
  const out=(Number(t.fee||0)-Number(t.advance||0)), overdue=t.deadline&&t.deadline<todayStr()&&t.status!=='Completed', rec=t.recur?' <span class="badge recurring">Monthly</span>':'';
  return `<tr class="row" data-id="${t.id}">
    <td><input type="checkbox" class="row-select" data-id="${t.id}" onchange="toggleSelect('${t.id}', this.checked)"></td>
    <td title="${esc(t.notes||'')}"><strong>${esc(t.client)}</strong></td>
    <td>${esc(t.title)}${rec}</td>
    <td><span class="badge priority ${t.priority.toLowerCase()}">${t.priority}</span></td>
    <td>${esc(t.assignee)}</td>
    <td><select class="status" onchange="changeStatus('${t.id}', this.value)">${['Not Started','In Progress','Waiting Client','On Hold','Completed'].map(s=>`<option ${s===t.status?'selected':''}>${s}</option>`).join('')}</select></td>
    <td class="${overdue?'overdue':''}">${fmtDateDDMMYYYY(t.deadline)||''}</td>
    <td class="money">₹ ${fmtMoney(t.fee||0)}</td>
    <td class="money">₹ ${fmtMoney(t.advance||0)}</td>
    <td class="money">₹ ${fmtMoney(out)}</td>
    <td><select class="status" onchange="changeInvoiceStatus('${t.id}', this.value)">${['Not Raised','Sent','Paid','Partially Paid'].map(s=>`<option ${s===(t.invoiceStatus||'Not Raised')?'selected':''}>${s}</option>`).join('')}</select></td>
    <td><button class="btn ghost" onclick="editTask('${t.id}')">Edit</button></td>
  </tr>`;
}
function esc(s){return String(s).replace(/[&<>\"]+/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]))}
function changeStatus(id,val){ const t=tasks.find(x=>x.id===id); if(!t) return; t.status=val; save(); render(); }
function delTask(id){ const t=tasks.find(x=>x.id===id); if(!t) return;
  if(t.recur&&!t.period&&t.recurringId){ if(!confirm('Delete this recurring template and all its instances?')) return; tasks=tasks.filter(x=>!(x.recurringId===t.recurringId)); removeSkipsForSeries(t.recurringId);}
  else if(t.recur&&t.period&&t.recurringId){ if(!confirm('Delete this recurring instance for this month?')) return; addSkip(t.recurringId,t.period); tasks=tasks.filter(x=>x.id!==t.id);}
  else { if(!confirm('Delete this task?')) return; tasks=tasks.filter(x=>x.id!==t.id);}
  selectedIds.delete(id); save(); render();
}
function editTask(id){
  const t=tasks.find(x=>x.id===id); if(!t) return;
  openTaskModal('Edit Task');
  const f=document.getElementById('taskForm'); f.dataset.editId=id;
  $('#fClient').value=t.client||''; $('#fTitle').value=t.title||''; $('#fPriority').value=t.priority||'Medium'; $('#fAssignee').value=t.assignee||''; $('#fStatus').value=t.status||'In Progress'; $('#fDeadline').value=t.deadline||''; $('#fFee').value=t.fee||0; $('#fAdvance').value=t.advance||0; $('#fInvoiceStatus').value=t.invoiceStatus||''; $('#fNotes').value=t.notes||''; $('#fRecurring').checked=!!t.recur&&!t.period;
}
function changeInvoiceStatus(id,val){ const t=tasks.find(x=>x.id===id); if(!t) return; t.invoiceStatus=val; save(); render(); }

// Task modal wiring
const taskModal=$('#taskModal');
$('#addTaskBtn').addEventListener('click',()=>{ openTaskModal('New Task'); const f=$('#taskForm'); f.reset(); $('#fDeadline').value=todayStr(); delete f.dataset.editId; });
$('#cancelBtn').addEventListener('click', closeTaskModal);
taskModal.addEventListener('click', e=>{ if(e.target===taskModal) closeTaskModal(); });
function openTaskModal(title){ $('#taskModalTitle').textContent=title; taskModal.classList.add('active'); setTimeout(()=>$('#fClient').focus(),10); }
function closeTaskModal(){ taskModal.classList.remove('active'); }

$('#taskForm').addEventListener('submit', e=>{
  e.preventDefault(); const form=e.currentTarget; const editId=form.dataset.editId; const existing=editId?tasks.find(x=>x.id===editId):null;
  const isRecurringTemplate=$('#fRecurring').checked; const deadlineVal=$('#fDeadline').value; const recurDay=deadlineVal?Number(deadlineVal.slice(8,10)):new Date().getDate();
  const data={client:$('#fClient').value.trim(),title:$('#fTitle').value.trim(),priority:$('#fPriority').value,assignee:$('#fAssignee').value.trim(),status:$('#fStatus').value,deadline:deadlineVal,fee:Number($('#fFee').value||0),advance:Number($('#fAdvance').value||0),invoiceStatus:$('#fInvoiceStatus').value,notes:$('#fNotes').value.trim()};
  if(data.advance>data.fee) return alert('Advance cannot exceed total fee.');
  if(existing){
    const wasTemplate=!!existing.recur&&!existing.period;
    if(wasTemplate){ Object.assign(existing,{client:data.client,title:data.title,priority:data.priority,assignee:data.assignee,fee:data.fee,notes:data.notes,deadline:data.deadline,recur:true,recurDay}); save(); syncSeriesFromTemplate(existing); }
    else { Object.assign(existing,data); save(); }
  } else {
    if(isRecurringTemplate){ const rid=crypto.randomUUID(); tasks.push({id:crypto.randomUUID(),createdAt:Date.now(),...data,recur:true,recurDay,recurringId:rid,period:undefined}); save(); ensureRecurringInstances(); }
    else { tasks.push({id:crypto.randomUUID(),createdAt:Date.now(),...data}); save(); }
  }
  closeTaskModal(); render();
});

// Export CSV
$('#exportCsvBtn').addEventListener('click', ()=>{
  const rows=[['Client','Task','Priority','In-Charge','Status','Deadline','Fee','Advance','Outstanding','Invoice Status','Notes','Recurring','Recurring Day','Recurring ID','Period']];
  tasks.forEach(t=>{ const out=(Number(t.fee||0)-Number(t.advance||0)); rows.push([t.client,t.title,t.priority,t.assignee,t.status,fmtDateDDMMYYYY(t.deadline),t.fee,t.advance,out,t.invoiceStatus,(t.notes||'').replace(/\n/g,' '),t.recur?'Yes':'No',t.recurDay||'',t.recurringId||'',t.period||'']); });
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`CA-Tasks-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
});

// Filters & status multi
['searchInput','priorityFilter','assigneeFilter','monthFilter','sortBy','sortDir'].forEach(id=> document.getElementById(id).addEventListener('input', render));
const STATUS_OPTIONS=['Not Started','In Progress','Waiting Client','On Hold','Completed'];
(function initStatusMulti(){
  const hidden=$('#statusFilter'), btn=$('#statusMultiBtn'), menu=$('#statusMultiMenu'), applyBtn=$('#statusApplyBtn'), clearBtn=$('#statusClearBtn'); const sel=new Set();
  function updateBtn(){ if(sel.size===0||sel.size===STATUS_OPTIONS.length) btn.textContent='Status: All'; else btn.textContent=`Status: ${sel.size} selected`; }
  function syncHidden(){ hidden.value=(sel.size===0||sel.size===STATUS_OPTIONS.length)?'':[...sel].join('|'); }
  function open(){ menu.hidden=false; document.addEventListener('click', onDoc,{once:false}); }
  function close(){ menu.hidden=true; document.removeEventListener('click', onDoc,{once:false}); }
  function onDoc(e){ if(menu.contains(e.target)||btn.contains(e.target)) return; close(); }
  btn.addEventListener('click', ()=>{ menu.hidden?open():close(); });
  menu.querySelectorAll('input[type="checkbox"]').forEach(cb=> cb.addEventListener('change',()=>{ cb.checked?sel.add(cb.value):sel.delete(cb.value); }));
  applyBtn.addEventListener('click', ()=>{ syncHidden(); updateBtn(); close(); render(); });
  clearBtn.addEventListener('click', ()=>{ sel.clear(); menu.querySelectorAll('input[type="checkbox"]').forEach(cb=> cb.checked=false); syncHidden(); updateBtn(); close(); render(); });
  if(hidden.value){ hidden.value.split('|').forEach(v=>{ if(STATUS_OPTIONS.includes(v)) sel.add(v); }); menu.querySelectorAll('input[type="checkbox"]').forEach(cb=> cb.checked=sel.has(cb.value)); }
  updateBtn();
})();

$('#selectAll').addEventListener('change', e=>{ const rows=$$('#taskTbody tr'); const ids=rows.map(r=>r.dataset.id); if(e.target.checked){ ids.forEach(id=>selectedIds.add(id)); } else { ids.forEach(id=>selectedIds.delete(id)); } render(); });
$('#bulkDeleteBtn').addEventListener('click', bulkDelete);

// Init
function migrate(){ for(const t of tasks){ if(t.recur && t.period===undefined && !t.recurringId) t.recurringId=crypto.randomUUID(); if(t.recur && t.recurDay===undefined && t.deadline) t.recurDay=Number(t.deadline.slice(8,10)); } }
load(); migrate(); if(tasks.length===0) seedDemo(); else { ensureRecurringInstances(); render(); }

// ===== CREATE INVOICE =====
const invoiceModal=$('#invoiceModal');
$('#createInvoiceBtn').addEventListener('click',()=>{ openInvoiceModal(); autoPopulateInvoiceMeta(); });
$('#invoiceCancelBtn').addEventListener('click',()=> invoiceModal.classList.remove('active'));
invoiceModal.addEventListener('click',e=>{ if(e.target===invoiceModal) invoiceModal.classList.remove('active'); });
function openInvoiceModal(){ $('#invoiceModalTitle').textContent='Create Invoice'; invoiceModal.classList.add('active'); setTimeout(()=>$('#invClient').focus(),10); }

const serviceRows=$('#serviceRows');
$('#addServiceRowBtn').addEventListener('click', addServiceRow);
function addServiceRow(desc='',amt=''){
  const idx=serviceRows.children.length+1;
  const row=document.createElement('div'); row.className='inv-row';
  row.innerHTML=`<span>${idx}</span><input type="text" class="svc-desc" placeholder="Service description" value="${esc(desc)}"><input type="number" class="svc-amt" min="0" step="0.01" value="${amt}"><button type="button" class="btn ghost remove">✖</button>`;
  serviceRows.appendChild(row);
  row.querySelector('.svc-amt').addEventListener('input', recomputeTotals);
  row.querySelector('.remove').addEventListener('click',()=>{ row.remove(); [...serviceRows.children].forEach((r,i)=> r.firstElementChild.textContent=String(i+1)); recomputeTotals(); });
  recomputeTotals();
}
function currentFY(d=new Date()){ const y=d.getFullYear(), m=d.getMonth(); return (m>=3)?`${y}-${String(y+1).slice(-2)}`:`${y-1}-${String(y).slice(-2)}`; }
function nextInvoiceSequence(){ const seqKey='ca-invoice-seq', fyKey='ca-invoice-fy'; const fy=currentFY(); const storedFY=localStorage.getItem(fyKey); let seq=Number(localStorage.getItem(seqKey)||0); if(storedFY!==fy) seq=0; seq+=1; localStorage.setItem(seqKey,String(seq)); localStorage.setItem(fyKey,fy); return {fy,seq}; }
function formatInvoiceNumber(prefix,fy,seq){ return `${prefix}/${fy}/${String(seq).padStart(3,'0')}`; }
function autoPopulateInvoiceMeta(){ $('#invDate').value=todayStr(); const {fy,seq}=nextInvoiceSequence(); $('#invNumber').value=formatInvoiceNumber('INSIGHT',fy,seq); serviceRows.innerHTML=''; addServiceRow('',''); $('#discountInput').value=0; recomputeTotals(); }
$('#discountInput').addEventListener('input', recomputeTotals);
function recomputeTotals(){ const amts=$$('.svc-amt',serviceRows).map(i=>Number(i.value||0)); const sub=amts.reduce((s,n)=>s+n,0); const disc=Number($('#discountInput').value||0); const grand=Math.max(sub-disc,0); $('#subTotal').textContent=fmtMoney(sub); $('#grandTotal').textContent=fmtMoney(grand); $('#amountWords').textContent=toIndianWords(Math.round(grand))+' only'; }
function toIndianWords(num){ if(num===0) return 'Zero Rupees'; const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']; const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']; function two(n){return n<20?a[n]:b[Math.floor(n/10)]+(n%10?` ${a[n%10]}`:'');} function three(n){const h=Math.floor(n/100),r=n%100; return (h?`${a[h]} Hundred${r?' ':''}`:'')+(r?two(r):'');}
  const crore=Math.floor(num/10000000); num%=10000000; const lakh=Math.floor(num/100000); num%=100000; const thousand=Math.floor(num/1000); num%=1000; const hundred=num; let out=''; if(crore) out+=`${three(crore)} Crore `; if(lakh) out+=`${three(lakh)} Lakh `; if(thousand) out+=`${three(thousand)} Thousand `; if(hundred) out+=`${three(hundred)}`; return (out.trim()||'Zero')+' Rupees'; }
$('#previewInvoiceBtn').addEventListener('click',()=>{ bindInvoicePreview(); window.open().document.write($('#invoiceA4').innerHTML); });
$('#downloadPdfBtn').addEventListener('click', async ()=>{
  bindInvoicePreview();
  const page=$('.a4'), holder=$('#invoiceA4');
  holder.style.visibility='visible'; holder.style.left='0'; holder.style.top='0'; holder.style.position='fixed';
  const scale=Math.max(3, Math.ceil((window.devicePixelRatio||1)*2));
  const canvas=await html2canvas(page,{scale,useCORS:true,backgroundColor:'#FFFFFF',logging:false});
  const imgData=canvas.toDataURL('image/png'); const pdf=new jspdf.jsPDF('p','mm','a4'); const pageWidth=pdf.internal.pageSize.getWidth(); const imgWidth=pageWidth; const imgHeight=canvas.height*imgWidth/canvas.width; pdf.addImage(imgData,'PNG',0,0,imgWidth,imgHeight);
  const name=`${($('#invNumber').value||'Invoice').replace(/[^\w\-]+/g,'_')}.pdf`; pdf.save(name);
  holder.style.visibility='hidden'; holder.style.left='-9999px'; holder.style.top='-9999px';
});
function bindInvoicePreview(){
  const ddmmyyyy=fmtDateDDMMYYYY($('#invDate').value);
  $$('[data-bind="invNumber"]').forEach(el=>el.textContent=$('#invNumber').value||'');
  $$('[data-bind="invDateDDMM"]').forEach(el=>el.textContent=ddmmyyyy||'');
  $$('[data-bind="client"]').forEach(el=>el.textContent=$('#invClient').value||'');
  $$('[data-bind="address"]').forEach(el=>el.textContent=$('#invAddress').value||'');
  $$('[data-bind="email"]').forEach(el=>el.textContent=$('#invEmail').value||'');
  $$('[data-bind="mobile"]').forEach(el=>el.textContent=$('#invMobile').value||'');
  $$('[data-bind="subTotal"]').forEach(el=>el.textContent=$('#subTotal').textContent||'0');
  $$('[data-bind="discount"]').forEach(el=>el.textContent=fmtMoney(Number($('#discountInput').value||0)));
  $$('[data-bind="grandTotal"]').forEach(el=>el.textContent=$('#grandTotal').textContent||'0');
  $$('[data-bind="amountWords"]').forEach(el=>el.textContent=$('#amountWords').textContent||'');
  const body=$('[data-bind="rows"]'); body.innerHTML=''; $$('.inv-row',serviceRows).forEach((r,i)=>{ const desc=r.querySelector('.svc-desc').value.trim(); const amt=Number(r.querySelector('.svc-amt').value||0); if(!desc&&!amt) return; const tr=document.createElement('tr'); tr.innerHTML=`<td>${i+1}</td><td>${esc(desc)}</td><td class="money">₹ ${fmtMoney(amt)}</td>`; body.appendChild(tr); });
}

// ===== EDIT INVOICE (Upload) =====
const editModal=$('#editInvoiceModal');
$('#openEditInvoiceBtn').addEventListener('click', ()=>{ openEditInvoiceModal(); });
$('#editCancelBtn').addEventListener('click', ()=> editModal.classList.remove('active'));
editModal.addEventListener('click', e=>{ if(e.target===editModal) editModal.classList.remove('active'); });

function openEditInvoiceModal(){
  const log=$('#parseLog');
  log.innerHTML = (location.protocol==='file:' ? '<div style="color:#ffd38a">Note: You are opening this page via file://. Some browsers restrict workers/OCR under file://. If parsing fails, please serve this folder via a local server (e.g., VS Code “Live Server”).</div>' : '') + ' Select or drop a PDF/image generated by this app.';
  $('#pdfInput').value=''; editModal.classList.add('active');
}

// Drag/drop + change
const drop=$('#pdfDrop');
drop.addEventListener('dragover', e=>{ e.preventDefault(); drop.classList.add('hover'); });
drop.addEventListener('dragleave', ()=> drop.classList.remove('hover'));
drop.addEventListener('drop', e=>{ e.preventDefault(); drop.classList.remove('hover'); const f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(f) handleUploadFile(f); });
$('#pdfInput').addEventListener('change', e=>{ const f=e.currentTarget.files&&e.currentTarget.files[0]; if(f) handleUploadFile(f); });

// Lazy loader for Tesseract with pinned paths
let tesseractReady=null;
function ensureTesseract(){
  if(tesseractReady) return tesseractReady;
  tesseractReady=new Promise((resolve,reject)=>{
    if(window.Tesseract) return resolve(window.Tesseract);
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js';
    s.onload=()=>{
      try{
        // Configure worker/core/lang paths explicitly
        window.Tesseract.create = (opts={}) => window.Tesseract.createWorker({
          // These CDN paths host worker + wasm + traineddata
          workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/worker.min.js',
          corePath:   'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.2/tesseract-core.wasm.js',
          langPath:   'https://tessdata.projectnaptha.com/4.0.0', // eng.traineddata
          ...opts
        });
        resolve(window.Tesseract);
      }catch(e){ reject(e); }
    };
    s.onerror=()=>reject(new Error('Failed to load Tesseract.js'));
    document.head.appendChild(s);
  });
  return tesseractReady;
}

async function handleUploadFile(file){
  const log=$('#parseLog');
  try{
    const isImage = /image\/(png|jpe?g)/i.test(file.type);
    const isPdf   = file.type==='application/pdf' || /\.pdf$/i.test(file.name);
    if(!isPdf && !isImage){ log.innerHTML='<span style="color:#ffb4b4">Unsupported file. Upload a PDF/PNG/JPG.</span>'; return; }

    if(isPdf){
      log.innerHTML='Reading PDF…';
      // ArrayBuffer to avoid Blob URL issues
      const buf=await file.arrayBuffer();
      if(window.pdfjsLib && (!pdfjsLib.GlobalWorkerOptions.workerSrc || !/pdf\.worker/.test(pdfjsLib.GlobalWorkerOptions.workerSrc))){
        pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.min.js";
      }
      const pdf=await pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise;

      // Gather embedded text
      let textAll=''; 
      for(let p=1;p<=pdf.numPages;p++){
        const page=await pdf.getPage(p);
        const tc=await page.getTextContent();
        textAll += tc.items.map(i=>(i.str||'').trim()).filter(Boolean).join('\n')+'\n';
      }
      if(textAll.trim()){
        log.innerHTML=`Found embedded text. Parsing…`;
        const parsed=parseInvoiceText(textAll);
        applyParsedToForm(parsed);
        recomputeTotals(); bindInvoicePreview();
        log.innerHTML='<span style="color:#a6f3c1">Parsed successfully from embedded text.</span>';
        setTimeout(()=> editModal.classList.remove('active'), 900);
        return;
      }

      // OCR fallback (image-based PDF)
      log.innerHTML='No embedded text. Rendering page for OCR…';
      const page1=await pdf.getPage(1);
      const viewport=page1.getViewport({scale:2.6});
      const canvas=document.createElement('canvas');
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
      await page1.render({canvasContext:ctx, viewport}).promise;

      log.innerHTML='Running OCR… (first page)';
      const T=await ensureTesseract();
      const worker=await T.create();
      await worker.loadLanguage('eng'); await worker.initialize('eng');
      const { data:{ text } } = await worker.recognize(canvas, { tessedit_pageseg_mode:6 }); // Assume a block of text
      await worker.terminate();
      const ocrText=(text||'').replace(/\r/g,'').trim();
      if(!ocrText){ log.innerHTML='<span style="color:#ffb4b4">OCR produced no text. Try a clearer copy.</span>'; return; }

      log.innerHTML='OCR text obtained. Parsing…';
      const parsed=parseInvoiceText(ocrText);
      applyParsedToForm(parsed); recomputeTotals(); bindInvoicePreview();
      log.innerHTML='<span style="color:#a6f3c1">Parsed successfully via OCR.</span>';
      setTimeout(()=> editModal.classList.remove('active'), 900);
      return;
    }

    // Image path (PNG/JPG)
    log.innerHTML='Reading image… running OCR…';
    const imgUrl=URL.createObjectURL(file);
    const img=new Image(); img.src=imgUrl; await img.decode();
    const canvas=document.createElement('canvas'); const ctx=canvas.getContext('2d',{willReadFrequently:true});
    canvas.width=img.naturalWidth; canvas.height=img.naturalHeight; ctx.drawImage(img,0,0); URL.revokeObjectURL(imgUrl);

    const T=await ensureTesseract();
    const worker=await T.create();
    await worker.loadLanguage('eng'); await worker.initialize('eng');
    const { data:{ text } } = await worker.recognize(canvas, { tessedit_pageseg_mode:6 });
    await worker.terminate();
    const ocrText=(text||'').replace(/\r/g,'').trim();
    if(!ocrText){ log.innerHTML='<span style="color:#ffb4b4">OCR produced no text. Try a clearer image.</span>'; return; }

    log.innerHTML='Parsing OCR results…';
    const parsed=parseInvoiceText(ocrText);
    applyParsedToForm(parsed); recomputeTotals(); bindInvoicePreview();
    log.innerHTML='<span style="color:#a6f3c1">Parsed successfully from image.</span>';
    setTimeout(()=> editModal.classList.remove('active'), 900);

  }catch(err){
    console.error(err);
    $('#parseLog').innerHTML='<span style="color:#ffb4b4">Could not read this file. If you opened this over file://, please serve over http://localhost and try again.</span>';
  }
}

// Parser (same logic; tolerant to OCR spacing/line breaks)
function parseInvoiceText(txt){
  const T=(txt||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n');

  function pick(re){ const m=T.match(re); return m?(m[1]||'').trim():''; }
  function pickMoneyAfter(label){
    const re=new RegExp(`${label}[\\s\\S]*?(₹?\\s*${DIGITS.source})`,'i');
    const m=T.match(re); if(!m) return ''; return (m[1]||'').replace(/[₹\s,]/g,'').trim();
  }
  const invNo=pick(/Invoice\s*No:\s*([^\n]+)/i);
  const invDateDD=pick(/Invoice\s*Date:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);

  const recvStart=T.search(/Detail\s+of\s+Receiver/i);
  const recvEnd=T.search(/S\.\s*No\.|Service\s*Description/i);
  const recvBlock=recvStart>=0 ? T.slice(recvStart, recvEnd>recvStart?recvEnd:undefined) : '';
  const name = (recvBlock.match(/Name:\s*([^\n]+)/i)||[])[1]?.trim()||'';
  const email= (recvBlock.match(/E-?mail:\s*([^\n]+)/i)||[])[1]?.trim()||'';
  const mobile=(recvBlock.match(/Mobile\s*No:\s*([^\n]+)/i)||[])[1]?.trim()||'';
  const address=((recvBlock.match(/Address:\s*([\s\S]*?)(?:E-?mail:|Mobile\s*No:|$)/i)||[])[1]||'').replace(/\n+/g,' ').trim();

  const tableStart=T.search(/Service\s*Description/i), tableEnd=T.search(/Sub\s*Total/i);
  const rowsBlock=(tableStart>=0 && tableEnd>tableStart) ? T.slice(tableStart, tableEnd) : '';
  const services=[];
  if(rowsBlock){
    const lines=rowsBlock.split('\n').map(s=>s.trim()).filter(Boolean)
      .filter(l=>!/^S\.\s*No\.?$/i.test(l) && !/^Service\s*Description$/i.test(l) && !/^Amount/i.test(l));
    let cur=''; for(const l of lines){
      cur = cur? (cur+' '+l) : l;
      const m=cur.match(new RegExp(`(.*?)\\s+(₹?\\s*${DIGITS.source})$`));
      if(m){ const desc=(m[1]||'').trim(); const amt=(m[2]||'').replace(/[₹\s,]/g,''); if(desc||amt) services.push({desc, amt:Number(amt||0)}); cur=''; }
    }
  }
  const subTotal=pickMoneyAfter('Sub\\s*Total'), discount=pickMoneyAfter('Less:\\s*Discount'), grandTotal=pickMoneyAfter('Invoice\\s*Amount');

  return { invNo, invDateISO:parseDDMM(invDateDD), name, email, mobile, address, services, subTotal:Number(subTotal||0), discount:Number(discount||0), grandTotal:Number(grandTotal||0) };
}

function applyParsedToForm(p){
  if(p.invNo) $('#invNumber').value=p.invNo;
  if(p.invDateISO) $('#invDate').value=p.invDateISO;
  if(p.name) $('#invClient').value=p.name;
  if(p.email) $('#invEmail').value=p.email;
  if(p.mobile) $('#invMobile').value=p.mobile;
  if(p.address) $('#invAddress').value=p.address;
  if(Array.isArray(p.services)&&p.services.length){ serviceRows.innerHTML=''; p.services.forEach(s=>addServiceRow(s.desc||'', String(s.amt||''))); }
  if(Number.isFinite(p.discount)) $('#discountInput').value=p.discount;
}

// Demo reset
const resetBtn=$('#resetDemoBtn');
if(resetBtn){ resetBtn.addEventListener('click', ()=>{ if(confirm('Reset demo data?')){ localStorage.clear(); load(); seedDemo(); } }); }
