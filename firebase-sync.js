/* firebase-sync.js — cloud mirroring for tasks via Firebase Auth + Firestore */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot,
  serverTimestamp, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* 1) Paste your Firebase config here (from Console → Project settings → Web app) */
const firebaseConfig = {
  apiKey:        "AIzaSyCpBJUNBB-ncgcDwq6CjDqkjkaSp4Gky-w",
  authDomain:    "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:     "YOUR_PROJECT_ID",
  appId:         "YOUR_APP_ID",
  // storageBucket / measurementId optional
};

/* 2) Initialize */
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* Optional: offline cache for Firestore */
try { await enableIndexedDbPersistence(db); } catch { /* ignore multi-tab errors */ }

/* 3) Minimal UI */
const $ = (id)=>document.getElementById(id);
const signinBtn  = $('signinBtn');
const signoutBtn = $('signoutBtn');
const userBadge  = $('userBadge');

signinBtn?.addEventListener('click', async ()=>{
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
});
signoutBtn?.addEventListener('click', ()=> signOut(auth));

/* 4) Two-way sync state */
const LS_KEY = 'ca-dashboard-tasks-v1';
const CLOUD_COLLECTION_PATH = (uid)=> `users/${uid}/state`;
const CLOUD_DOC_ID = 'app_v1';

let isApplyingRemote = false;
let lastAppliedRemoteAt = 0;

function readLocalTasks(){
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}
function writeLocalTasks(arr){
  localStorage.setItem(LS_KEY, JSON.stringify(arr ?? []));
}

/* Debounce helper */
function debounce(fn, ms=400){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
const pushToCloudDebounced = debounce(pushToCloud, 700);

/* Local ➜ Cloud */
async function pushToCloud(uid){
  if(!uid) return;
  const tasks = readLocalTasks();
  const ref = doc(db, CLOUD_COLLECTION_PATH(uid), CLOUD_DOC_ID);
  try{
    await setDoc(ref, { tasks, updatedAt: serverTimestamp() }, { merge: true });
  }catch(e){ console.error('pushToCloud failed', e); }
}

/* Cloud ➜ Local */
let unsubscribeCloud = null;

async function startCloudSubscription(user){
  if(unsubscribeCloud){ unsubscribeCloud(); unsubscribeCloud=null; }

  if(!user){
    signinBtn?.style?.setProperty('display','');
    signoutBtn?.style?.setProperty('display','none');
    if (userBadge) userBadge.textContent = '';
    return;
  }

  signinBtn?.style?.setProperty('display','none');
  signoutBtn?.style?.setProperty('display','');
  if (userBadge) userBadge.textContent = `Signed in as ${user.displayName || user.email || user.uid}`;

  const ref = doc(db, CLOUD_COLLECTION_PATH(user.uid), CLOUD_DOC_ID);

  // Seed cloud from local if doc empty; else adopt cloud.
  const snap = await getDoc(ref);
  if(!snap.exists()){
    const local = readLocalTasks();
    await setDoc(ref, { tasks: Array.isArray(local)?local:[], updatedAt: serverTimestamp() }, { merge: true });
  }else{
    const cloud = snap.data();
    const remoteTasks = Array.isArray(cloud?.tasks) ? cloud.tasks : [];
    writeLocalTasks(remoteTasks);
    lastAppliedRemoteAt = Date.now();
    window.__cloudSync_onLocalDataReplaced?.();
  }

  // Live updates
  unsubscribeCloud = onSnapshot(ref, (docSnap)=>{
    if(!docSnap.exists()) return;
    const data = docSnap.data();
    const remoteTasks = Array.isArray(data?.tasks) ? data.tasks : [];
    if(Date.now() - lastAppliedRemoteAt < 500) return; // skip our own echo
    isApplyingRemote = true;
    writeLocalTasks(remoteTasks);
    window.__cloudSync_onLocalDataReplaced?.();
    isApplyingRemote = false;
  });
}

/* Auth state */
onAuthStateChanged(auth, (user)=>{ startCloudSubscription(user); });

/* Public hooks that your existing code will call */
window.__cloudSync_notifyLocalChanged = function(){
  if(isApplyingRemote) return;
  const uid = auth.currentUser?.uid;
  if(uid){ lastAppliedRemoteAt = Date.now(); pushToCloudDebounced(uid); }
};
window.__cloudSync_onLocalDataReplaced = function(){
  try{
    if(window.ensureRecurringInstances) window.ensureRecurringInstances();
    if(window.render) window.render();
  }catch(e){ console.error(e); }
};
