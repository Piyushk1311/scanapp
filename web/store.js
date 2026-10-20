// Encrypted local storage. Everything (page images + document metadata) is sealed with
// AES-GCM using a key derived from the user's PIN (PBKDF2). The key lives only in memory.

const DB_NAME = 'scanpro';
const enc = new TextEncoder();
const dec = new TextDecoder();
let db = null;
let key = null;

const rq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const store = (n, mode = 'readonly') => db.transaction(n, mode).objectStore(n);

const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function openDB() {
  if (db) return db;
  db = await new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('meta');
      d.createObjectStore('docs', { keyPath: 'id' });
      d.createObjectStore('pages', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return db;
}

async function derive(pin, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function seal(buf) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf);
  return { iv, data };
}
const unseal = (rec) => crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, key, rec.data);

// ---- PIN lifecycle -------------------------------------------------------

export const hasPin = () => !!localStorage.getItem('sp_salt');
export const isUnlocked = () => !!key;

export async function setupPin(pin) {
  await openDB();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  key = await derive(pin, salt);
  const check = await seal(enc.encode('scanpro-ok'));
  await rq(store('meta', 'readwrite').put(check, 'check'));
  localStorage.setItem('sp_salt', b64(salt));
}

export async function unlock(pin) {
  await openDB();
  const salt = unb64(localStorage.getItem('sp_salt'));
  const k = await derive(pin, salt);
  const check = await rq(store('meta').get('check'));
  try {
    const prev = key; key = k;
    const ok = dec.decode(await unseal(check)) === 'scanpro-ok';
    if (!ok) key = prev;
    return ok;
  } catch {
    key = null;
    return false;
  }
}

export function lock() { key = null; }

export async function eraseAll() {
  key = null;
  if (db) { db.close(); db = null; }
  await new Promise((res) => { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  localStorage.removeItem('sp_salt');
  localStorage.removeItem('sp_fail');
  localStorage.removeItem('sp_until');
}

// ---- Documents -----------------------------------------------------------

export async function listDocs() {
  const recs = await rq(store('docs').getAll());
  const out = [];
  for (const r of recs) {
    try { out.push(JSON.parse(dec.decode(await unseal(r)))); } catch { /* skip unreadable */ }
  }
  return out.sort((a, b) => b.created - a.created);
}

export async function saveDoc(meta) {
  const sealed = await seal(enc.encode(JSON.stringify(meta)));
  await rq(store('docs', 'readwrite').put({ id: meta.id, ...sealed }));
}

export async function deleteDoc(meta) {
  for (const p of meta.pages) await rq(store('pages', 'readwrite').delete(p));
  await rq(store('docs', 'readwrite').delete(meta.id));
}

// ---- Pages (JPEG blobs) --------------------------------------------------

export async function addPage(blob) {
  const id = crypto.randomUUID();
  await putPage(id, blob);
  return id;
}

export async function putPage(id, blob) {
  const sealed = await seal(await blob.arrayBuffer());
  await rq(store('pages', 'readwrite').put({ id, ...sealed }));
}

export async function getPage(id) {
  const rec = await rq(store('pages').get(id));
  return new Blob([await unseal(rec)], { type: 'image/jpeg' });
}

export const deletePage = (id) => rq(store('pages', 'readwrite').delete(id));
