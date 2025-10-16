// firebase-sync.js — hardened Auth + Firestore mirror with safe first-sync & logging
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

// Optional offline cache (warning in console about deprecation is harmless)
try { await enableIndexedDbPersistence(db); } catch(e) {
  console.warn('[firebase-sync] persistence not enabled:', e?.message || e);
}

// --- UI hooks
const $ = (id)=>document.getElementById(id);
const signinBtn  = $('signinBtn');
const signoutBtn = $('signoutBtn');
const userBadge  = $('userBadge');

// --- State
const LS_KEY = 'ca-dashboard-tasks-v1';
const PATH   = (uid)=> `users/${uid}/state`;
const DOC_ID = 'app_v1';

let isApplyingRemote = false;
let lastAppliedRemoteAt = 0;
let unsubscribeCloud = null;

// --- Utils
function readLocal(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||'[]'); }catch{ return []; } }
function writeLocal(arr){ localStorage.setItem(LS_KEY, JSON.stringify(arr??[])); }
function debounce(fn, ms=450){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
const pushToCloudDebounced = debounce(pushToCloud, 650);

// Shim save() so every local change mirrors to cloud once authenticated
(function shimSave(){
  const original = window.save;
  window.save = function patchedSave(){
    try { if (typeof original === 'function') original(); }
    finally { if (window.__cloudSync_notifyLocalChanged) window.__cloudSync_notifyLocalChanged(); }
  };
})();

async function pushToCloud(uid){
  if(!uid) return;                        // never write without auth
  const tasks = readLocal();
  const ref = doc(db, PATH(uid), DOC_ID);
  await setDoc(ref, { tasks, updatedAt: serverTimestamp() }, { merge: true });
}

function adoptRemote(tasks){
  writeLocal(tasks);
  lastAppliedRemoteAt = Date.now();
  try{
    if (window.ensureRecurringInstances) window.ensureRecurringInstances();
    if (window.render) window.render();
  }catch(e){ console.error(e); }
  console.log('[firebase-sync] adopted cloud → local, tasks:', tasks.length);
}

async function startCloudSubscription(user){
  if (unsubscribeCloud) { unsubscribeCloud(); unsubscribeCloud=null; }

  // UI reflect auth
  if(!user){
    if(signinBtn)  signinBtn.style.display = '';
    if(signoutBtn) signoutBtn.style.display = 'none';
    if(userBadge)  userBadge.textContent   = '';
    console.log('[firebase-sync] signed out; not touching Firestore.');
    return;
  }
  if(signinBtn)  signinBtn.style.display = 'none';
  if(signoutBtn) signoutBtn.style.display = '';
  if(userBadge)  userBadge.textContent   = `Signed in as ${user.displayName || user.email || user.uid}`;

  const uid = user.uid;
  console.log('[firebase-sync] auth state:', uid);

  const ref = doc(db, PATH(uid), DOC_ID);

  // FIRST SYNC: prefer cloud if it has data; otherwise seed from local
  try{
    const snap = await getDoc(ref);
    if(!snap.exists()){
      const local = readLocal();
      await setDoc(ref, { tasks: Array.isArray(local)?local:[], updatedAt: serverTimestamp() }, { merge: true });
      console.log('[firebase-sync] no cloud doc; seeded from local:', local.length);
    }else{
      const data = snap.data() || {};
      const remoteTasks = Array.isArray(data.tasks) ? data.tasks : [];
      if (remoteTasks.length === 0 && Array.isArray(readLocal()) && readLocal().length > 0) {
        await setDoc(ref, { tasks: readLocal(), updatedAt: serverTimestamp() }, { merge: true });
        console.log('[firebase-sync] cloud empty; pushed local → cloud:', readLocal().length);
      } else {
        adoptRemote(remoteTasks);
      }
    }

    // Live updates
    unsubscribeCloud = onSnapshot(ref, (docSnap)=>{
      if(!docSnap.exists()) return;
      const data = docSnap.data() || {};
      const remoteTasks = Array.isArray(data.tasks) ? data.tasks : [];
      if (Date.now() - lastAppliedRemoteAt < 500) return; // skip our own echo
      isApplyingRemote = true;
      adoptRemote(remoteTasks);
      isApplyingRemote = false;
    }, (err)=>{
      console.error('[firebase-sync] onSnapshot error:', err?.code, err?.message);
    });

  }catch(err){
    console.error('[firebase-sync] first-sync error:', err?.code, err?.message);
    if (String(err?.message||'').includes('Missing or insufficient permissions')) {
      console.warn('→ Check Firestore **Rules published**, and Auth → **Authorized domains** includes your Netlify domain.');
    }
  }
}

// Auth buttons (popup → redirect fallback)
if (signinBtn) signinBtn.addEventListener('click', async ()=>{
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) {
    console.warn('[firebase-sync] popup failed; redirecting:', e?.code, e?.message);
    try { await signInWithRedirect(auth, new GoogleAuthProvider()); }
    catch (err) { console.error('[firebase-sync] redirect error:', err?.code, err?.message); alert('Sign-in failed. See Console.'); }
  }
});
if (signoutBtn) signoutBtn.addEventListener('click', ()=> signOut(auth));

try { await getRedirectResult(auth); } catch(e) {
  console.warn('[firebase-sync] getRedirectResult:', e?.code, e?.message);
  if (e?.code === 'auth/unauthorized-domain') alert('This domain is not authorized in Firebase Auth settings.');
}

// Drive the flow only from authenticated state
onAuthStateChanged(auth, (user)=> startCloudSubscription(user));

// Hooks used by the save() shim
window.__cloudSync_notifyLocalChanged = function(){
  if (isApplyingRemote) return;
  const uid = auth.currentUser?.uid;
  if (uid) { lastAppliedRemoteAt = Date.now(); pushToCloudDebounced(uid); }
};
