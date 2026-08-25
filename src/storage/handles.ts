// Persists FileSystemDirectoryHandle objects (from the File System Access
// API) across reloads. These aren't JSON-serializable, so they can't live in
// localStorage like everything else — IndexedDB can store them directly.

const DB_NAME = "mdviewer-handles";
const STORE = "handles";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function saveHandle(sourceId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  return withStore("readwrite", (store) => store.put(handle, sourceId)).then(() => undefined);
}

export function loadHandle(sourceId: string): Promise<FileSystemDirectoryHandle | undefined> {
  return withStore("readonly", (store) => store.get(sourceId));
}

export function deleteHandle(sourceId: string): Promise<void> {
  return withStore("readwrite", (store) => store.delete(sourceId)).then(() => undefined);
}
