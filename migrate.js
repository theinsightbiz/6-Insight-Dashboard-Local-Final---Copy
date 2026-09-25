/* One-time owner-only copy. Never include this script in your normal dashboard. */
const config={
  apiKey:'AIzaSyCPrXLTK0klLUxWtC5XGLqUFDQXawllkzo',
  authDomain:'ssrdashboard.firebaseapp.com',
  databaseURL:'https://ssrdashboard-default-rtdb.firebaseio.com',
  projectId:'ssrdashboard',
  storageBucket:'ssrdashboard.firebasestorage.app',
  messagingSenderId:'677899078007',
  appId:'1:677899078007:web:80e9cbf3b71aeaf149f972'
};
if(!firebase.apps.length)firebase.initializeApp(config);
const db=firebase.database(),auth=firebase.auth(),base='workspaces/ssrdashboard';
let owner=null,source=null;
const $=id=>document.getElementById(id);
function log(msg){$('migrationLog').textContent+=`\n${new Date().toLocaleTimeString()} — ${msg}`;}
$('migrationLoginForm').addEventListener('submit',async e=>{
  e.preventDefault();$('migrationError').textContent='';
  try{
    const cred=await auth.signInWithEmailAndPassword($('migrationEmail').value.trim(),$('migrationPassword').value);
    const role=(await db.ref(`${base}/roles/${cred.user.uid}`).once('value')).val();
    if(role!=='owner')throw new Error('Only the designated owner can migrate data.');
    owner=cred.user;$('migrationLogin').hidden=true;$('migrationAdmin').hidden=false;
    $('migrationUser').textContent=owner.email;$('migrationLog').textContent='Signed in. Preview the old data.';
  }catch(err){$('migrationError').textContent=err.message;owner=null;await auth.signOut();}
  finally{$('migrationPassword').value='';}
});
$('migrationSignOut').addEventListener('click',async()=>{owner=null;source=null;await auth.signOut();location.reload();});
async function getLegacy(){
  if(!owner)throw new Error('Owner sign-in required.');
  const [main,sushmit,mainSkips,sushmitSkips]=await Promise.all([
    db.ref(`${base}/tasks`).once('value'),db.ref(`${base}/clientDashboards/sushmit/tasks`).once('value'),
    db.ref(`${base}/skips`).once('value'),db.ref(`${base}/clientDashboards/sushmit/skips`).once('value')
  ]);
  return {main:{tasks:main.val()||{},skips:mainSkips.val()||{}},
    sushmit:{tasks:sushmit.val()||{},skips:sushmitSkips.val()||{}}};
}
$('migrationPreview').addEventListener('click',async()=>{
  try{
    source=await getLegacy();
    $('migrationLog').textContent=`Legacy Main: ${Object.keys(source.main.tasks).length} tasks, ${Object.keys(source.main.skips).length} skips.\nLegacy Sushmit: ${Object.keys(source.sushmit.tasks).length} tasks, ${Object.keys(source.sushmit.skips).length} skips.\n`;
    $('migrationBackup').disabled=false;
    $('migrationStart').disabled=!$('migrationAck').checked;
  }catch(err){log('Preview failed: '+err.message);}
});
$('migrationAck').addEventListener('change',()=>{
  $('migrationStart').disabled=!owner||!source||!$('migrationAck').checked;
});
$('migrationBackup').addEventListener('click',()=>{
  if(!owner||!source)return;
  const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),legacy:source},null,2)],
    {type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`SSR-PRIVATE-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();
  URL.revokeObjectURL(a.href);
  log('Backup downloaded. Store it securely; it contains confidential fees.');
});
function publicTask(task,id,uid){
  const x={id,client:String(task.client||'Unknown client'),title:String(task.title||'Legacy task'),
    priority:['High','Medium','Low'].includes(task.priority)?task.priority:'Medium',
    assignee:String(task.assignee||''),
    status:['Not Started','In Progress','Waiting Client','On Hold','Completed'].includes(task.status)?task.status:'Not Started',
    deadline:String(task.deadline||''),notes:String(task.notes||''),
    createdAt:typeof task.createdAt==='number'?task.createdAt:Date.now(),
    createdBy:String(task.createdBy||uid)};
  if(task.recur){x.recur=true;x.recurQuarterly=!!task.recurQuarterly;
    x.recurDay=Number(task.recurDay)||Number((task.deadline||'').slice(8,10))||1;
    x.recurringId=String(task.recurringId||id);}
  if(task.period)x.period=String(task.period);
  return x;
}
function privateFinance(task,uid){
  const money={fee:Number(task.fee||0),advance:Number(task.advance||0),
    invoiceStatus:['Not Raised','Sent','Paid','Partially Paid'].includes(task.invoiceStatus)
      ?task.invoiceStatus:'Not Raised',updatedAt:Date.now(),updatedBy:uid};
  if(['cash','bank'].includes(task.paymentMode))money.paymentMode=task.paymentMode;
  if(task.invoiceDate)money.invoiceDate=String(task.invoiceDate);
  return money;
}
async function writeBatches(updates){
  const entries=Object.entries(updates);
  for(let i=0;i<entries.length;i+=35){
    await db.ref().update(Object.fromEntries(entries.slice(i,i+35)));
  }
}
$('migrationStart').addEventListener('click',async()=>{
  if(!owner||!source||!$('migrationAck').checked)return;
  if(!confirm('Copy both workspaces to the new public/private structure? Old data will be retained.'))return;
  $('migrationStart').disabled=true;$('migrationPreview').disabled=true;
  try{
    for(const board of ['main','sushmit']){
      const legacy=source[board];
      const [pub,priv,skip]=await Promise.all([
        db.ref(`${base}/taskPublic/${board}`).once('value'),
        db.ref(`${base}/taskFinance/${board}`).once('value'),
        db.ref(`${base}/taskSkips/${board}`).once('value')
      ]);
      const existingPublic=pub.val()||{},existingFinance=priv.val()||{},existingSkip=skip.val()||{};
      const pubUpdates={},finUpdates={},skipUpdates={};
      for(const [id,t] of Object.entries(legacy.tasks)){
        if(!Object.prototype.hasOwnProperty.call(existingPublic,id))
          pubUpdates[`${base}/taskPublic/${board}/${id}`]=publicTask(t,id,owner.uid);
        if(!Object.prototype.hasOwnProperty.call(existingFinance,id))
          finUpdates[`${base}/taskFinance/${board}/${id}`]=privateFinance(t,owner.uid);
      }
      for(const [id,sk] of Object.entries(legacy.skips)){
        if(!Object.prototype.hasOwnProperty.call(existingSkip,id))
          skipUpdates[`${base}/taskSkips/${board}/${id}`]={id,recurringId:String(sk.recurringId||''),
            period:String(sk.period||''),createdAt:Number(sk.createdAt)||Date.now()};
      }
      // Independent idempotent batches: a retry fills missing finance after a partial public copy.
      await writeBatches(pubUpdates);log(`${board}: ${Object.keys(pubUpdates).length} task records copied.`);
      await writeBatches(finUpdates);log(`${board}: ${Object.keys(finUpdates).length} private billing records copied.`);
      await writeBatches(skipUpdates);log(`${board}: ${Object.keys(skipUpdates).length} recurrence skips copied.`);
    }
    log('COPY COMPLETE. Verify counts and sample private fees before giving staff access. Old data retained.');
  }catch(err){log('Copy interrupted: '+err.message+' — fix the issue and run Preview + Copy again.');}
  finally{$('migrationStart').disabled=false;$('migrationPreview').disabled=false;}
});
