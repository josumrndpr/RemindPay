// RemindPay — mini IndexedDB para PWA/iPhone (persistencia local sin SQLite).
// Un almacén por entidad + kv genérico. Sin dependencias.

const DB = "remindpay";
const VER = 1;
const STORES = [
  "kv",
  "payments",
  "debts",
  "debt_payments",
  "contacts",
  "reminders",
  "budgets",
  "backups",
  "files",
];

let dbp: Promise<IDBDatabase> | null = null;

export function idb(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const req = indexedDB.open(DB, VER);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const s of STORES) {
        if (d.objectStoreNames.contains(s)) continue;
        if (s === "kv") d.createObjectStore(s, { keyPath: "k" });
        else if (s === "files") d.createObjectStore(s, { keyPath: "nombre" });
        else d.createObjectStore(s, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error ?? new Error("IndexedDB no disponible"));
  });
  return dbp;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return idb().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const t = d.transaction(store, mode);
        t.onerror = () => rej(t.error ?? new Error("tx falló"));
        const q = fn(t.objectStore(store));
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error ?? new Error("op falló"));
      }),
  );
}

export function kvGet(k: string): Promise<string | null> {
  return run<{ k: string; v: string } | undefined>("kv", "readonly", (s) =>
    s.get(k),
  ).then((r) => (r ? r.v : null));
}

export function kvSet(k: string, v: string): Promise<void> {
  return run("kv", "readwrite", (s) => s.put({ k, v })).then(() => {});
}

export function all<T>(store: string): Promise<T[]> {
  return run<T[]>(store, "readonly", (s) => s.getAll());
}

export function put<T>(store: string, val: T): Promise<number> {
  return run<IDBValidKey>(store, "readwrite", (s) =>
    s.put(val),
  ).then((k) => k as number);
}

export function del(store: string, id: number): Promise<void> {
  return run(store, "readwrite", (s) => s.delete(id)).then(() => {});
}

export function clearStore(store: string): Promise<void> {
  return run(store, "readwrite", (s) => s.clear()).then(() => {});
}
