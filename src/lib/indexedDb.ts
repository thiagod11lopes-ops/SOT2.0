const DB_NAME = "sot_app_db";
const DB_VERSION = 1;
const KV_STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha ao abrir IndexedDB"));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

async function getDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

export async function idbGetJson<T>(key: string): Promise<T | null> {
  try {
    const db = await getDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(KV_STORE, "readonly");
      const store = tx.objectStore(KV_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const row = req.result as { key: string; value: T } | undefined;
        resolve(row?.value ?? null);
      };
      req.onerror = () => reject(req.error ?? new Error("Falha ao ler IndexedDB"));
    });
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Gravação com novas tentativas — IndexedDB pode falhar sob pressão de memória ou em Safari. */
export async function idbSetJson<T>(
  key: string,
  value: T,
  options?: { maxAttempts?: number },
): Promise<boolean> {
  const maxAttempts = options?.maxAttempts ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const db = await getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(KV_STORE, "readwrite");
        const store = tx.objectStore(KV_STORE);
        store.put({ key, value });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("Falha ao gravar IndexedDB"));
        tx.onabort = () => reject(tx.error ?? new Error("Transação abortada no IndexedDB"));
      });
      return true;
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        await sleep(80 * attempt);
      }
    }
  }
  console.warn("[SOT] IndexedDB: falha ao gravar após tentativas:", key, lastError);
  return false;
}
