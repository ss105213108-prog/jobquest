import { REAL104_BATCH_KEY, REAL104_BATCH_LEGACY_KEY, type Real104BatchStoragePort } from './real104BatchWorkingSet'

// Keep browser access at the concrete adapter seam. The Foundation owns the
// envelope schema, UID checks, TTL, and typed read/write failures.
export function createReal104BatchSessionStorage(
  getStorage: () => Real104BatchStoragePort = () => window.sessionStorage,
): Real104BatchStoragePort {
  const batchKey = (key: string) => {
    if (key !== REAL104_BATCH_KEY) throw new Error('Unsupported REAL 104 batch storage key.')
    return key
  }
  return {
    getItem: key => getStorage().getItem(key === REAL104_BATCH_LEGACY_KEY ? key : batchKey(key)),
    setItem: (key, value) => getStorage().setItem(batchKey(key), value),
    removeItem: key => {
      batchKey(key)
      const storage = getStorage()
      // Remove the fallback first: failed clearing must not resurrect v1.
      storage.removeItem(REAL104_BATCH_LEGACY_KEY)
      storage.removeItem(key)
    },
  }
}
