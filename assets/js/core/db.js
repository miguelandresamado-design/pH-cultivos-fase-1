const DB_NAME = "ph-cultivos-fase-1";
const DB_VERSION = 1;
const STORES = ["meta", "technicians", "farms", "lots", "campaigns", "sessions", "measurements", "sync_operations"];

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(store, mode, work) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = work(tx.objectStore(store));
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transacción cancelada"));
  });
}

export const put = (store, value) => transaction(store, "readwrite", objectStore => objectStore.put(value));
export const remove = (store, id) => transaction(store, "readwrite", objectStore => objectStore.delete(id));
export const clear = store => transaction(store, "readwrite", objectStore => objectStore.clear());

export async function get(store, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readonly").objectStore(store).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readonly").objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putMany(store, values) {
  if (!values.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const objectStore = tx.objectStore(store);
    values.forEach(value => objectStore.put(value));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function resetOperationalData() {
  for (const store of ["sessions", "measurements", "sync_operations"]) await clear(store);
}

export { DB_NAME, STORES };
