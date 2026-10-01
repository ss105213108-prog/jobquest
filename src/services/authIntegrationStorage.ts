import { normalizeUsername } from './authIdentity'

export const AUTH_WORKING_OWNER_KEY = 'jobQuest.authWorkingOwner.v1'
export const AUTH_UPGRADE_PENDING_KEY = 'jobQuest.authUpgradePending.v1'
// The existing public working cache format and connector are unchanged.
const workingCacheKey = 'jobQuest.real104Session.v1'
export interface PendingUpgrade { version: 1; uid: string; username: string }
export type AuthStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export function createAuthIntegrationStorage(getStorage: () => AuthStorage) {
  return {
    prepareOwner(uid: string | null) {
      const storage = getStorage()
      const previous = storage.getItem(AUTH_WORKING_OWNER_KEY)
      const cleared = previous !== uid && storage.getItem(workingCacheKey) !== null
      if (previous !== uid) storage.removeItem(workingCacheKey)
      if (uid) storage.setItem(AUTH_WORKING_OWNER_KEY, uid)
      else storage.removeItem(AUTH_WORKING_OWNER_KEY)
      return cleared
    },
    pending(): PendingUpgrade | null {
      const raw = getStorage().getItem(AUTH_UPGRADE_PENDING_KEY)
      if (!raw) return null
      try {
        const value = JSON.parse(raw)
        if (value.version === 1 && typeof value.uid === 'string' && value.uid && typeof value.username === 'string' && normalizeUsername(value.username) === value.username) return { version: 1, uid: value.uid, username: value.username }
      } catch { /* Invalid markers never authorize a credential operation. */ }
      throw new Error('INVALID_PENDING_MARKER')
    },
    rememberPending(uid: string, username: string) {
      const value: PendingUpgrade = { version: 1, uid, username }
      getStorage().setItem(AUTH_UPGRADE_PENDING_KEY, JSON.stringify(value))
    },
    clearPending() { getStorage().removeItem(AUTH_UPGRADE_PENDING_KEY) },
  }
}
export type AuthIntegrationStorage = ReturnType<typeof createAuthIntegrationStorage>
