// firebase-sync.js — Auth + Firestore mirror with legacy-doc migration + save() shim
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

// Optional offline cache
try { await enableIndexedDbPersistence(db); } catch {}

/* ---------- UI hooks ---------- */
const $ = (id)=>document.getElementById(id);
const signinBtn  = $('signinBtn');
const signoutBtn = $('signoutBtn');
const userBadge  = $('userBadge');

/* ---------- Local ↔ Cloud state ---------- */
const LS_KEY = 'ca-dashboard-tasks-v1';
const PATH   = (uid)=> `users/${uid}/state`;
const DOC_ID = 'app_v1';

let isApplyingRemote = false;
let lastAppliedRemoteAt = 0;
let unsubscribeCloud = null;

function readLocal(){
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}
function writeLocal(arr){
  localStorage.setItem(LS_KEY, JSON.stringify(arr ?? []));
}
function debounce(fn, ms=400){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
const pushToCloudDebounced = debounce(pushToCloud, 700);

/* ---------- Shim your app's save() so cloud sync ALWAYS fires ---------- */
(function shimSave(){
  const original = window.save;
  window.save = function patchedSave(){
    try { if (typeof original === 'function') original(); }
    finally {
      if (window.__cloudSync_notifyLocalChanged) window.__cloudSync_notifyLocalChanged();
    }
  };
})();

/* ---------- Helpers ---------- */
function isLikelySingleTaskDoc(obj){
  if (!obj || typeof obj !== 'object') return false;
  // typical task fields your app uses
  const indicative = ['title','client','status','priority','assignee','deadline','id'];
  return !Array.isArray(obj.tasks) && indicative.some(k => k in obj);
}

/* ---------- Local ➜ Cloud ---------- */
async function pushToCloud(uid){
  if(!uid) return;
  const tasks = readLocal();
  const ref = doc(db, PATH(uid), DOC_ID);
  await setDoc(ref, { tasks, updatedAt: serverTimestamp() }, { merge: true });
}

/* ---------- Cloud ➜ Local (with migration) ---------- */
async function startCloudSubscription(user){
  if (unsubscribeCloud) { unsubscribeCloud(); unsubscribeCloud = null; }

  if(!user){
    signinBtn?.style?.setProperty('display','');
    signoutBtn?.style?.setProperty('display','none');
    if (userBadge) userBadge.textContent = '';
    return;
  }

  signinBtn?.style?.setProperty('display','none');
  signoutBtn?.style?.setProperty('display','');
  if (userBadge) userBadge.textContent = `Signed in as ${user.displayName || user.email || user.uid}`;

  const ref = doc(db, PATH(user.uid), DOC_ID);
  const localNow = readLocal();

  // Read current cloud doc
  const snap = await getDoc(ref);
  if(!snap.exists()){
    // no cloud yet → seed from local (even if empty)
    await setDoc(ref, { tasks: Array.isArray(localNow)?localNow:[], updatedAt: serverTimestamp() }, { merge: true });
  }else{
    let cloud = snap.data() || {};
    // ---- MIGRATION: legacy single-task-at-root → wrap into tasks array ----
    if (isLikelySingleTaskDoc(cloud)) {
      const legacy = { ...cloud };
      delete legacy.updatedAt; // keep only task fields
      await setDoc(ref, { tasks: [legacy], updatedAt: serverTimestamp() }, { merge: true });
      cloud = { tasks: [legacy] };
    }

    const remoteTasks = Array.isArray(cloud.tasks) ? cloud.tasks : [];
    const remoteEmpty = remoteTasks.length === 0;
    const localHas    = Array.isArray(localNow) && localNow.length > 0;

    // First-sync policy: if cloud empty but local has tasks → push local to cloud.
    if (remoteEmpty && localHas){
      await setDoc(ref, { tasks: localNow, updatedAt: serverTimestamp() }, { merge: true });
    }else{
      writeLocal(remoteTasks);
      lastAppliedRemoteAt = Date.now();
      window.__cloudSync_onLocalDataReplaced?.();
    }
  }

  // Live subscription (with migration if someone writes legacy again)
  unsubscribeCloud = onSnapshot(ref, (docSnap)=>{
    if(!docSnap.exists()) return;
    let data = docSnap.data() || {};
    if (isLikelySingleTaskDoc(data)) {
      // migrate in listener too; then local will be updated on next snapshot
      const legacy = { ...data };
      delete legacy.updatedAt;
      setDoc(ref, { tasks: [legacy], updatedAt: serverTimestamp() }, { merge: true });
      return;
    }
    const remoteTasks = Array.isArray(data.tasks) ? data.tasks : [];
    if (Date.now() - lastAppliedRemoteAt < 500) return; // skip echo
    isApplyingRemote = true;
    writeLocal(remoteTasks);
    window.__cloudSync_onLocalDataReplaced?.();
    isApplyingRemote = false;
  });
}

/* ---------- Auth handlers (popup→redirect fallback) ---------- */
if (signinBtn) {
  signinBtn.addEventListener('click', async ()=>{
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      try {
        const provider = new GoogleAuthProvider();
        await signInWithRedirect(auth, provider);
      } catch (err) {
        console.error('[firebase-sync] Redirect sign-in error:', err?.code, err?.message);
        alert('Sign-in failed. See Console for details.');
      }
    }
  });
}
if (signoutBtn) signoutBtn.addEventListener('click', ()=> signOut(auth));

try { await getRedirectResult(auth); } catch (e) {
  if (e?.code === 'auth/unauthorized-domain') {
    alert('This domain is not authorized for sign-in in Firebase Auth settings.');
  }
}

onAuthStateChanged(auth, (user)=> { startCloudSubscription(user); });

/* ---------- Public hooks for your app ---------- */
window.__cloudSync_notifyLocalChanged = function(){
  if (isApplyingRemote) return;
  const uid = auth.currentUser?.uid;
  if (uid) { lastAppliedRemoteAt = Date.now(); pushToCloudDebounced(uid); }
};
window.__cloudSync_onLocalDataReplaced = function(){
  try{
    if(window.ensureRecurringInstances) window.ensureRecurringInstances();
    if(window.render) window.render();
  }catch(e){ console.error(e); }
};
