// firebase-sync.js — Firestore two-way sync (robust first-pull + strict auth + visibility logs)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot,
  serverTimestamp, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* 1) Paste your Firebase config here (from Console → Project settings → Web app) */
const firebaseConfig = {
  apiKey: "AIzaSyCpBJUNBB-ncgcDwq6CjDqkjkaSp4Gky-w",
  authDomain: "sanjeevsriram-1b0e4.firebaseapp.com",
  projectId: "sanjeevsriram-1b0e4",
  storageBucket: "sanjeevsriram-1b0e4.firebasestorage.app",
  messagingSenderId: "265405165493",
  appId: "1:265405165493:web:f23b52369f0920dfd533fc",
  measurementId: "G-92M9Z1L7W3"
};

/* 2) Initialize */
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Optional cache (warning about deprecation is harmless)
try { await enableIndexedDbPersistence(db); } catch(e) { console.warn('[sync] persistence off:', e?.message || e); }

// --- Minimal UI hooks
const $ = (id)=>document.getElementById(id);
const signinBtn  = $('signinBtn');
const signoutBtn = $('signoutBtn');
const userBadge  = $('userBadge');
let userUidSpan  = document.getElementById('userUid');
let taskCountSpan= document.getElementById('taskCount');
if (!userUidSpan)  { userUidSpan  = document.createElement('span'); userUidSpan.id='userUid';  userUidSpan.style.marginLeft='.5rem'; userUidSpan.style.opacity='.6'; document.querySelector('header .actions')?.appendChild(userUidSpan); }
if (!taskCountSpan){ taskCountSpan= document.createElement('span'); taskCountSpan.id='taskCount';taskCountSpan.style.marginLeft='.5rem'; taskCountSpan.style.opacity='.6'; document.querySelector('header .actions')?.appendChild(taskCountSpan); }

// --- Local state
const LS_KEY = 'ca-dashboard-tasks-v1';
const PATH   = (uid)=> `users/${uid}/state`;
const DOC_ID = 'app_v1';

let isApplyingRemote = false;
let lastAppliedRemoteAt = 0;
let unsubscribeCloud = null;

// Helpers
function readLocal(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||'[]'); }catch{ return []; } }
function writeLocal(arr){ localStorage.setItem(LS_KEY, JSON.stringify(arr??[])); }
function debounce(fn, ms=450){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
const pushToCloudDebounced = debounce(pushToCloud, 650);

function setHdr(uid, n){
  if (userBadge) userBadge.textContent = uid ? `Signed in as ${auth.currentUser?.displayName || auth.currentUser?.email || uid}` : '';
  if (userUidSpan)  userUidSpan.textContent   = uid ? `(uid: ${uid})` : '';
  if (taskCountSpan) taskCountSpan.textContent = Number.isFinite(n) ? `| tasks: ${n}` : '';
}
function adoptRemote(tasks){
  writeLocal(tasks ?? []);
  lastAppliedRemoteAt = Date.now();
  try{
    if (window.ensureRecurringInstances) window.ensureRecurringInstances();
    if (window.render) window.render();
  }catch(e){ console.error('[sync] render error:', e); }
  setHdr(auth.currentUser?.uid, Array.isArray(tasks)?tasks.length:0);
  console.log('[sync] adopted cloud → local;', { uid: auth.currentUser?.uid, count: (tasks||[]).length });
}

// Shim save() so every edit mirrors to cloud after auth
(function shimSave(){
  const original = window.save;
  window.save = function patchedSave(){
    try { if (typeof original === 'function') original(); }
    finally { if (window.__cloudSync_notifyLocalChanged) window.__cloudSync_notifyLocalChanged(); }
  };
})();

// Local ➜ Cloud
async function pushToCloud(uid){
  if(!uid) return;                         // never write without auth
  const tasks = readLocal();
  const ref = doc(db, PATH(uid), DOC_ID);
  await setDoc(ref, { tasks, updatedAt: serverTimestamp() }, { merge: true });
}

// One-time strong pull from cloud, then live listener
async function startCloudSubscription(user){
  if (unsubscribeCloud) { unsubscribeCloud(); unsubscribeCloud = null; }

  if(!user){
    if (signinBtn)  signinBtn.style.display  = '';
    if (signoutBtn) signoutBtn.style.display = 'none';
    setHdr('', undefined);
    console.log('[sync] signed out — not touching Firestore.');
    return;
  }

  if (signinBtn)  signinBtn.style.display  = 'none';
  if (signoutBtn) signoutBtn.style.display = '';
  setHdr(user.uid, undefined);
  console.log('[sync] auth state:', user.uid, 'path:', `${PATH(user.uid)}/${DOC_ID}`);

  const ref = doc(db, PATH(user.uid), DOC_ID);

  try {
    // ---------- FIRST PULL (blocking) ----------
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      const local = readLocal();
      await setDoc(ref, { tasks: Array.isArray(local) ? local : [], updatedAt: serverTimestamp() }, { merge: true });
      console.log('[sync] cloud was empty; seeded from local:', local.length);
      adoptRemote(local);
    } else {
      const data = snap.data() || {};
      const remoteTasks = Array.isArray(data.tasks) ? data.tasks : [];

      // Never let empty-local overwrite non-empty cloud
      if (remoteTasks.length === 0 && Array.isArray(readLocal()) && readLocal().length > 0) {
        await setDoc(ref, { tasks: readLocal(), updatedAt: serverTimestamp() }, { merge: true });
        console.log('[sync] cloud empty; pushed local → cloud:', readLocal().length);
        adoptRemote(readLocal());
      } else {
        adoptRemote(remoteTasks);         // <-- ensures Incognito shows data immediately
      }
    }

    // ---------- LIVE LISTENER ----------
    unsubscribeCloud = onSnapshot(ref, (docSnap)=>{
      if(!docSnap.exists()) return;
      const data = docSnap.data() || {};
      const remoteTasks = Array.isArray(data.tasks) ? data.tasks : [];
      if (Date.now() - lastAppliedRemoteAt < 500) return; // skip our own echo
      isApplyingRemote = true;
      adoptRemote(remoteTasks);
      isApplyingRemote = false;
    }, (err)=>{
      console.error('[sync] onSnapshot error:', err?.code, err?.message);
    });

  } catch (err) {
    console.error('[sync] first-sync error:', err?.code, err?.message);
    if (String(err?.message||'').includes('Missing or insufficient permissions')) {
      alert('Firestore blocked by rules: ensure Rules are PUBLISHED and you are signed in. See Console for details.');
    }
  }
}

// Auth buttons (popup → redirect fallback)
if (signinBtn) signinBtn.addEventListener('click', async ()=>{
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) {
    console.warn('[sync] popup failed; redirecting:', e?.code, e?.message);
    try { await signInWithRedirect(auth, new GoogleAuthProvider()); }
    catch (err) { console.error('[sync] redirect error:', err?.code, err?.message); alert('Sign-in failed. See Console.'); }
  }
});
if (signoutBtn) signoutBtn.addEventListener('click', ()=> signOut(auth));

try { await getRedirectResult(auth); } catch(e) {
  console.warn('[sync] getRedirectResult:', e?.code, e?.message);
  if (e?.code === 'auth/unauthorized-domain') alert('This domain is not authorized in Firebase Auth settings.');
}

// Drive only from auth state
onAuthStateChanged(auth, (user)=> startCloudSubscription(user));

// Hooks used by the save() shim
window.__cloudSync_notifyLocalChanged = function(){
  if (isApplyingRemote) return;
  const uid = auth.currentUser?.uid;
  if (uid) { lastAppliedRemoteAt = Date.now(); pushToCloudDebounced(uid); }
};
