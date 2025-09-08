// Tiny IndexedDB helper (Promises), no external deps
const DB_NAME = 'ui-detective';
const DB_VER = 1;
const RUN_STORE = 'runs';
const IMG_STORE = 'images';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RUN_STORE)) db.createObjectStore(RUN_STORE);
      if (!db.objectStoreNames.contains(IMG_STORE)) db.createObjectStore(IMG_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const st = tx.objectStore(store);
    const p = Promise.resolve(fn(st));
    tx.oncomplete = () => resolve(p);
    tx.onerror = () => reject(tx.error);
  });
}

export const IDB = {
  async putRun(id, data) {
    return withStore(RUN_STORE, 'readwrite', st => st.put(data, id));
  },
  async getRun(id) {
    return withStore(RUN_STORE, 'readonly', st => new Promise((res, rej) => {
      const r = st.get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
  },
  async putImage(key, blob) {
    return withStore(IMG_STORE, 'readwrite', st => st.put(blob, key));
  },
  async getImage(key) {
    return withStore(IMG_STORE, 'readonly', st => new Promise((res, rej) => {
      const r = st.get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
  },
  async clearAll() {
    return withStore(RUN_STORE, 'readwrite', st => st.clear()).then(() => withStore(IMG_STORE, 'readwrite', st => st.clear()));
  }
};

