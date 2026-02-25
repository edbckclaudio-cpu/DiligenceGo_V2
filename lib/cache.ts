type StoredResult = {
  timestamp: number
  cnpj: string
  year: number
  data: Record<string, unknown>[]
  grouped?: { file: string; rows: Record<string, unknown>[] }[]
}

const DB_NAME = 'diligencego'
const STORE_NAME = 'results'

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveResult(key: string, data: StoredResult): Promise<void> {
  const db = await getDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({ key, ...data })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadResult(key: string): Promise<StoredResult | null> {
  const db = await getDB()
  const result = await new Promise<StoredResult | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(key)
    req.onsuccess = () => resolve((req.result as StoredResult) ?? null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return result
}

export async function deleteResult(key: string): Promise<void> {
  const db = await getDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  db.close()
}

export async function clearOld(days: number): Promise<void> {
  const db = await getDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const now = Date.now()
    const req = store.openCursor()
    req.onsuccess = e => {
      const cursor = (e.target as IDBRequest).result as IDBCursorWithValue | null
      if (!cursor) return resolve()
      const val = cursor.value as StoredResult & { key: string }
      if (now - val.timestamp > days * 86400000) {
        cursor.delete()
      }
      cursor.continue()
    }
    req.onerror = () => reject(req.error)
  })
  db.close()
}
