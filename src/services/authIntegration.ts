import type { User } from '@supabase/supabase-js'
import { normalizeUsername, usernameFromSyntheticIdentifier } from './authIdentity'
import { authService } from './authService'
import * as foundation from './usernameAuthService'
import { createAuthIntegrationStorage, type AuthIntegrationStorage } from './authIntegrationStorage'

export type AuthMode = 'restoring' | 'landing' | 'guest' | 'account' | 'pending' | 'blocked'
export interface ProductIdentity { id: string; kind: 'guest' | 'account'; username?: string }
export interface AuthSnapshot {
  mode: AuthMode; user: ProductIdentity | null; initializing: boolean; error: string | null
  busy: boolean; actionError: string | null; notice: string | null
}
export type AuthIntent = 'guest' | 'register' | 'login' | 'upgrade' | 'logout'
export interface AuthInput { username?: string; password?: string; confirmation?: string; confirmed?: boolean }
export interface AuthIntegrationPorts {
  session: typeof authService
  accounts: Pick<typeof foundation, 'registerWithUsername' | 'signInWithUsername' | 'upgradeAnonymousToUsernamePassword' | 'signOutPermanentSession'>
  storage: AuthIntegrationStorage
  defer: (callback: () => void) => void
}
const unavailable = '目前無法確認登入狀態，請保留目前登入狀態並重試。'
const failure = '目前無法完成帳號操作，請稍後再試。'
const pendingCopy = '帳號建立尚未確認完成，請重新輸入密碼完成設定。請先保留目前登入狀態。'
export const guestSwitchWarning = '登入既有帳號後，將顯示該帳號的資料。訪客資料不會合併、刪除或覆寫帳號資料；切換後，你可能無法再回到目前訪客身份。尚未確認的編輯及本機工作清單不會帶入帳號。'
export const guestExitWarning = '離開後，可能無法再找回此訪客身份與其資料。雲端資料不會自動刪除，但你可能無法再存取。尚未確認的編輯及本機工作清單會離開目前畫面。'
export const saveExitWarning = '若仍有保存中的操作，結果尚未確認；離開後請重新登入確認已保存內容。尚未確認的編輯不會自動保存。'

export function validateAuthInput(intent: AuthIntent, input: AuthInput): string | null {
  if (!['register', 'login', 'upgrade'].includes(intent)) return null
  if (!input.username?.trim()) return '請輸入帳號。'
  try { normalizeUsername(input.username) } catch { return '帳號需為 3–32 個字元，以英文字母開頭，只能使用英文字母、數字與底線。' }
  if (!input.password) return '請輸入密碼。'
  if (intent !== 'login') {
    if (Array.from(input.password).length < 8) return '密碼至少需要 8 個字元。'
    if (!input.confirmation) return '請再次輸入密碼。'
    if (input.confirmation !== input.password) return '兩次輸入的密碼不同。'
  }
  return null
}

export function createAuthIntegration(ports: AuthIntegrationPorts) {
  let state: AuthSnapshot = { mode: 'restoring', user: null, initializing: true, error: null, busy: false, actionError: null, notice: null }
  const listeners = new Set<() => void>()
  let generation = 0, active = false, mutation = false
  let subscription: { unsubscribe(): void } | null = null
  const publish = (patch: Partial<AuthSnapshot>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()) }
  const block = () => publish({ mode: 'blocked', user: null, initializing: false, error: unavailable })
  const adopt = (raw: User | null) => {
    const pending = ports.storage.pending()
    if (!raw) {
      ports.storage.prepareOwner(null)
      ports.storage.clearPending()
      publish({ mode: 'landing', user: null, initializing: false, error: null })
      return
    }
    const username = usernameFromSyntheticIdentifier(raw.email)
    if (raw.is_anonymous !== true && (raw.is_anonymous !== false || !username || raw.new_email || !raw.email_confirmed_at)) {
      ports.storage.prepareOwner(raw.id)
      publish({ mode: 'blocked', user: null, initializing: false, error: '此登入方式尚未支援。可明確登出後重新登入。' })
      return
    }
    if (pending && pending.uid !== raw.id) ports.storage.clearPending()
    if (pending?.uid === raw.id && raw.is_anonymous === false && username !== pending.username) throw new Error('IDENTITY_MISMATCH')
    const cleared = ports.storage.prepareOwner(raw.id)
    const user: ProductIdentity = raw.is_anonymous === true ? { id: raw.id, kind: 'guest' } : { id: raw.id, kind: 'account', username: username! }
    publish({ user, mode: pending?.uid === raw.id ? 'pending' : user.kind, initializing: false, error: null,
      notice: cleared ? '本機職缺工作清單需重新匯入；已保存的履歷、偏好與職缺記錄會依目前身份還原。' : state.notice })
  }
  const reconcile = async () => {
    const ticket = ++generation
    try {
      const { user } = await ports.session.initialize()
      if (active && ticket === generation) adopt(user)
    } catch { if (active && ticket === generation) block() }
  }
  const controller = {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    start() {
      active = true
      try {
        subscription = ports.session.subscribe(raw => {
          if (!active) return
          ++generation
          // Hide old-owner data immediately; SDK reads run outside the callback.
          if (state.user && raw?.id !== state.user.id) publish({ mode: 'restoring', user: null, initializing: true, error: null, notice: '登入帳號已變更。' })
          if (!mutation) ports.defer(() => { if (active && !mutation) void reconcile() })
        }).data.subscription
        void reconcile()
      } catch { block() }
      return () => { active = false; ++generation; subscription?.unsubscribe(); subscription = null }
    },
    retry() { if (!mutation) void reconcile() },
    clearActionError() { publish({ actionError: null }) },
    async perform(intent: AuthIntent, input: AuthInput = {}): Promise<boolean> {
      if (mutation || !active || state.mode === 'restoring') return false
      const validation = validateAuthInput(intent, input)
      if (validation) { publish({ actionError: validation }); return false }
      const original = state.user
      let pending
      try { pending = ports.storage.pending() } catch { block(); return false }
      if ((intent === 'register' || intent === 'guest') && state.mode !== 'landing') return false
      if (intent === 'login' && original && (original.kind !== 'guest' || input.confirmed !== true)) return false
      if (intent === 'upgrade' && (!original || (original.kind !== 'guest' && state.mode !== 'pending'))) return false
      if (intent === 'logout' && original?.kind === 'guest' && input.confirmed !== true) return false
      mutation = true; ++generation
      publish({ busy: true, actionError: null })
      let succeeded = false, message: string | null = null, expectedUid: string | null = null
      try {
        if (intent === 'guest') { await ports.session.enterGuest(); succeeded = true }
        else if (intent === 'logout') {
          if (original?.kind === 'guest') { await ports.session.exitGuest(original.id); succeeded = true }
          else {
            const result = await ports.accounts.signOutPermanentSession()
            succeeded = result.ok
            if (!result.ok) message = result.error.message
          }
        } else {
          const username = normalizeUsername(input.username)
          if (intent === 'upgrade') {
            if (pending && pending.username !== username) throw new Error('PENDING_USERNAME_MISMATCH')
            ports.storage.rememberPending(original!.id, username)
          }
          if (intent === 'upgrade' && original!.kind === 'account') {
            await ports.session.finishPendingUpgrade(original!.id, username, input.password!)
            succeeded = true
          } else {
            const result = intent === 'register' ? await ports.accounts.registerWithUsername(username, input.password!)
              : intent === 'login' ? await ports.accounts.signInWithUsername(username, input.password!, { allowSessionSwitch: original?.kind === 'guest' && input.confirmed === true })
                : await ports.accounts.upgradeAnonymousToUsernamePassword(username, input.password!)
            succeeded = result.ok
            if (result.ok) expectedUid = result.data.uid
            if (result.ok && intent === 'upgrade' && result.data.uid !== original!.id) throw new Error('UID_MISMATCH')
            if (!result.ok) message = intent === 'login' && result.error.code === 'ACCOUNT_CONFLICT' ? '帳號或密碼不正確。' : result.error.message
          }
        }
        const readGeneration = generation
        const { user } = await ports.session.initialize()
        if (!active) return false
        if (readGeneration !== generation) throw new Error('SESSION_CHANGED_DURING_VERIFICATION')
        if (expectedUid && user?.id !== expectedUid) throw new Error('UID_MISMATCH')
        if (intent === 'guest' && succeeded && user?.is_anonymous !== true) throw new Error('IDENTITY_MISMATCH')
        if (intent === 'upgrade') {
          if (!user || user.id !== original!.id) throw new Error('UID_MISMATCH')
          if (succeeded && (user.is_anonymous !== false || usernameFromSyntheticIdentifier(user.email) !== normalizeUsername(input.username) || !user.email_confirmed_at || user.new_email)) throw new Error('IDENTITY_MISMATCH')
          if (succeeded || user.is_anonymous === true) ports.storage.clearPending()
          else message = pendingCopy
        }
        adopt(user)
        if (intent === 'logout' && !user) succeeded = true
        else if (intent === 'logout') succeeded = false
        if ((intent === 'guest' || intent === 'register' || intent === 'login') && succeeded && !user) throw new Error('SESSION_NOT_RETURNED')
        publish({ actionError: succeeded ? null : message ?? failure })
      } catch {
        succeeded = false
        // Failed mutations may have changed the session. Never publish an assumed old owner.
        try {
          const { user } = await ports.session.initialize()
          if (active) {
            if (intent === 'upgrade' && user?.id !== original?.id) block()
            else { adopt(user); publish({ actionError: state.mode === 'pending' ? pendingCopy : failure }) }
          }
        } catch { if (active) block() }
      } finally {
        mutation = false; ++generation
        if (active) publish({ busy: false })
      }
      return succeeded
    },
  }
  return controller
}
export type AuthIntegration = ReturnType<typeof createAuthIntegration>
export const createProductionAuthIntegration = () => createAuthIntegration({ session: authService, accounts: foundation,
  storage: createAuthIntegrationStorage(() => sessionStorage), defer: callback => { setTimeout(callback, 0) } })
