// firebase-sync.js — Auth + Firestore mirror with robust first-sync & save() shim
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
try { await enableIndexedDbPersistence(db); } catch (e) {
  console.debug('[firebase-sync] IndexedDB persistence not enabled:', e?.message || e);
}

// UI hooks
const $ = (id)=>document.getElementById(id);
const signinBtn  = $('signinBtn');
const signoutBtn = $('signoutBtn');
const userBadge  = $('userBadge');

// Local ↔ Cloud state
const LS_KEY = 'ca-dashboard-tasks-v1';
const PATH   = (uid)=> `users/${uid}/state`;
const DOC_ID = 'app_v1';

let isApplyingRemote = false;
let lastAppliedRemoteAt = 0;
let unsubscribeCloud = null;

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}
function writeLocal(arr) {
  localStorage.setItem(LS_KEY, JSON.stringify(arr ?? []));
}
function debounce(fn, ms=400){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
const pushToCloudDebounced = debounce(pushToCloud, 700);

// ---- IMPORTANT: shim your app's save() so cloud sync ALWAYS fires ----
(function shimSave(){
  const original = window.save;
  window.save = function patchedSave(){
    try { if (typeof original === 'function') original(); }
    finally {
      if (window.__cloudSync_notifyLocalChanged) window.__cloudSync_notifyLocalChanged();
    }
  };
})();

// Local ➜ Cloud
async function pushToCloud(uid){
  if(!uid) return;
  const tasks = readLocal();
  const ref = doc(db, PATH(uid), DOC_ID);
  await setDoc(ref, { tasks, updatedAt: serverTimestamp() }, { merge: true });
}

// Cloud ➜ Local
async function startCloudSubscription(user){
  if (unsubscribeCloud) { unsubscribeCloud(); unsubscribeCloud=null; }

  if(!user){
    if (signinBtn)  signinBtn.style.display  = '';
    if (signoutBtn) signoutBtn.style.display = 'none';
    if (userBadge)  userBadge.textContent    = '';
    return;
  }

  if (signinBtn)  signinBtn.style.display  = 'none';
  if (signoutBtn) signoutBtn.style.display = '';
  if (userBadge)  userBadge.textContent    = `Signed in as ${user.displayName || user.email || user.uid}`;

  const ref = doc(db, PATH(user.uid), DOC_ID);

  // ---------- FIRST-SYNC STRATEGY ----------
  // If cloud doc exists but is EMPTY and local has tasks → PUSH local → cloud.
  // Else (cloud has data) → ADOPT cloud → local (single source of truth).
  const snap = await getDoc(ref);
  const localNow = readLocal();
  if(!snap.exists()){
    // No cloud doc yet → seed with whatever local has (even if empty).
    await setDoc(ref, { tasks: Array.isArray(localNow)?localNow:[], updatedAt: serverTimestamp() }, { merge: true });
  }else{
    const cloud = snap.data();
    const remoteTasks = Array.isArray(cloud?.tasks) ? cloud.tasks : [];
    const remoteEmpty = remoteTasks.length === 0;
    const localHas    = Array.isArray(localNow) && localNow.length > 0;

    if (remoteEmpty && localHas) {
      // Prefer local when cloud is empty
      await setDoc(ref, { tasks: localNow, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      // Prefer cloud when it has any data
      writeLocal(remoteTasks);
      lastAppliedRemoteAt = Date.now();
      window.__cloudSync_onLocalDataReplaced?.();
    }
  }

  // Live updates
  unsubscribeCloud = onSnapshot(ref, (docSnap)=>{
    if(!docSnap.exists()) return;
    const data = docSnap.data();
    const remoteTasks = Array.isArray(data?.tasks) ? data.tasks : [];
    if (Date.now() - lastAppliedRemoteAt < 500) return; // skip echo
    isApplyingRemote = true;
    writeLocal(remoteTasks);
    window.__cloudSync_onLocalDataReplaced?.();
    isApplyingRemote = false;
  });
}

// Attach handlers with popup→redirect fallback + redirect result processing
if (signinBtn) {
  signinBtn.addEventListener('click', async ()=>{
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.warn('[firebase-sync] Popup failed, using redirect:', e?.code, e?.message);
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
if (signoutBtn) {
  signoutBtn.addEventListener('click', ()=> signOut(auth));
}

try {
  const res = await getRedirectResult(auth);
  if (res?.user) console.log('[firebase-sync] Redirect sign-in completed for:', res.user.uid);
} catch (e) {
  console.warn('[firebase-sync] getRedirectResult error:', e?.code, e?.message);
  if (e?.code === 'auth/unauthorized-domain') {
    alert('This domain is not authorized for sign-in in Firebase Auth settings.');
  }
}

onAuthStateChanged(auth, (user)=> {
  console.log('[firebase-sync] auth state:', user ? user.uid : 'signed-out');
  startCloudSubscription(user);
});

// Public hooks for your app (used by the shimmed save())
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

console.log('[firebase-sync] ready. authDomain:', firebaseConfig.authDomain);
