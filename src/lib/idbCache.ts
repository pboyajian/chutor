// Lightweight IndexedDB wrapper to cache summaries by dataset hash
export type CachedSummary<T> = { key: string; summary: T; createdAt: number; version: number }

const DB_NAME = 'chutor-cache'
const STORE = 'summaries'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' })
      }
    }
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
  })
}

export async function idbGet<T = any>(key: string): Promise<CachedSummary<T> | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result as CachedSummary<T> | undefined)
    req.onerror = () => reject(req.error)
  })
}

export async function idbSet<T = any>(entry: CachedSummary<T>): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req = store.put(entry)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}


