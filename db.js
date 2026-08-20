// db.js — tiny promise-based IndexedDB wrapper for MediSaathi.
// No external dependencies, so the app keeps working fully offline.

const DB_NAME = 'medisaathi-db';
const DB_VERSION = 1;

const STORES = [
  { name: 'persons', keyPath: 'id' },
  { name: 'medicines', keyPath: 'id' },
  { name: 'doseLogs', keyPath: 'id' },
  { name: 'vitalsBP', keyPath: 'id' },
  { name: 'vitalsSugar', keyPath: 'id' },
  { name: 'vitalsWeight', keyPath: 'id' },
  { name: 'vitalsOther', keyPath: 'id' },
  { name: 'notes', keyPath: 'id' },
  { name: 'vault', keyPath: 'id' },
  { name: 'settings', keyPath: 'key' }
];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      STORES.forEach((s) => {
        if (!db.objectStoreNames.contains(s.name)) {
          db.createObjectStore(s.name, { keyPath: s.keyPath });
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

async function tx(storeName, mode = 'readonly') {
  const db = await openDB();
  const transaction = db.transaction(storeName, mode);
  return transaction.objectStore(storeName);
}

async function getAll(storeName) {
  try {
    const store = await tx(storeName);
    return await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('getAll failed for', storeName, err);
    return [];
  }
}

async function get(storeName, key) {
  try {
    const store = await tx(storeName);
    return await new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('get failed for', storeName, err);
    return null;
  }
}

async function put(storeName, value) {
  const store = await tx(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
  });
}

async function remove(storeName, key) {
  const store = await tx(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function clearStore(storeName) {
  const store = await tx(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function clearAllData() {
  for (const s of STORES) {
    await clearStore(s.name);
  }
}

async function exportAllData() {
  const data = {};
  for (const s of STORES) {
    data[s.name] = await getAll(s.name);
  }
  data.__meta = { app: 'MediSaathi', exportedAt: new Date().toISOString(), version: DB_VERSION };
  return data;
}

async function importAllData(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid backup file.');
  for (const s of STORES) {
    if (Array.isArray(data[s.name])) {
      await clearStore(s.name);
      const store = await tx(s.name, 'readwrite');
      for (const item of data[s.name]) {
        store.put(item);
      }
    }
  }
  return true;
}

async function getSetting(key, fallback = null) {
  const row = await get('settings', key);
  return row ? row.value : fallback;
}

async function setSetting(key, value) {
  return put('settings', { key, value });
}

export const DB = {
  uid,
  getAll,
  get,
  put,
  remove,
  clearStore,
  clearAllData,
  exportAllData,
  importAllData,
  getSetting,
  setSetting
};
