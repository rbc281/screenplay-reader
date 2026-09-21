const DB_NAME = "scene-reader";
const DB_VERSION = 1;
const STORE = "screenplays";
const LAST_KEY = "scene-reader:last-script";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Local storage is unavailable."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Could not open local storage."));
  });
}

async function transaction(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Could not access saved screenplay data."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

export async function hashFile(file) {
  const data = await file.arrayBuffer();
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (const byte of new Uint8Array(data)) hash = Math.imul(hash ^ byte, 16777619);
  return `fallback-${(hash >>> 0).toString(16)}-${data.byteLength}`;
}

export async function saveScreenplay(record) {
  const saved = { ...record, updatedAt: Date.now() };
  await transaction("readwrite", (store) => store.put(saved));
  try { localStorage.setItem(LAST_KEY, record.id); } catch { /* Optional convenience only. */ }
  return saved;
}

export async function loadScreenplay(id) {
  if (!id) return null;
  const record = await transaction("readonly", (store) => store.get(id));
  if (!record || !record.script || !Array.isArray(record.script.units)) {
    throw new Error("Saved screenplay data is incomplete.");
  }
  return record;
}

export async function loadLastScreenplay() {
  let id = null;
  try { id = localStorage.getItem(LAST_KEY); } catch { return null; }
  return loadScreenplay(id);
}

