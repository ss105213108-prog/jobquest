import type { Session, User } from '@supabase/supabase-js'
import { requireSupabase } from '../lib/supabase'
import { deriveSyntheticIdentifier, normalizeUsername, UsernameValidationError } from './authIdentity'

export { deriveSyntheticIdentifier, normalizeUsername } from './authIdentity'

type Reply<T> = Promise<{ data: T; error: unknown }>
type Credentials = { email: string; password: string }
type SessionReply = { user: User | null; session: Session | null; weakPassword?: unknown }

// Narrow test seam; production uses the existing guarded Supabase client.
export interface UsernameAuthPort {
  getSession(): Reply<{ session: Session | null }>
  getUser(): Reply<{ user: User | null }>
  signUp(credentials: Credentials): Reply<SessionReply>
  signInWithPassword(credentials: Credentials): Reply<SessionReply>
  updateUser(attributes: { email: string } | { password: string }): Reply<{ user: User | null }>
  signOut(options: { scope: 'local' }): Promise<{ error: unknown }>
}

const messages = {
  INVALID_USERNAME: '帳號需為 3–32 個字元，以英文字母開頭，只能使用英文字母、數字與底線。',
  PASSWORD_REQUIRED: '請輸入密碼。',
  PASSWORD_TOO_SHORT: '密碼至少需要 8 個字元。',
  PASSWORD_TOO_WEAK: '密碼不符合安全要求，請使用較長、較難猜測的密碼。',
  ACCOUNT_CONFLICT: '此帳號已被使用，請登入或換一個帳號。',
  INVALID_CREDENTIALS: '帳號或密碼不正確。',
  SESSION_REQUIRED: '目前沒有可用的登入狀態。',
  SESSION_ALREADY_PRESENT: '目前已有登入身份，請先明確選擇帳號切換方式。',
  ANONYMOUS_SESSION_REQUIRED: '此操作只適用於目前的訪客身份。',
  PERMANENT_SESSION_REQUIRED: '離開訪客前需要先確認可能無法找回訪客資料。',
  EMAIL_VERIFICATION_REQUIRED: '目前的帳號設定無法完成此操作。',
  REAUTHENTICATION_REQUIRED: '目前無法完成帳號升級，請保留目前登入狀態。',
  UID_MISMATCH: '登入身份發生變更，已停止帳號操作。',
  IDENTITY_MISMATCH: '無法確認帳號身份，已停止帳號操作。',
  SESSION_NOT_RETURNED: '目前無法確認帳號登入狀態，請稍後重試。',
  SIGNOUT_INCOMPLETE: '目前尚未完成登出，請重試。',
  RATE_LIMITED: '嘗試次數較多，請稍後再試。',
  OPERATION_IN_PROGRESS: '帳號操作正在進行，請稍候。',
  AUTH_UNAVAILABLE: '目前無法完成帳號操作，請稍後再試。',
} as const

export type UsernameAuthErrorCode = keyof typeof messages
export type AuthOperation = 'register' | 'login' | 'upgrade' | 'logout'
export type AuthStep = 'validation' | 'session' | 'registration' | 'login' | 'identity_link' | 'password_set' | 'verification' | 'logout'
export interface UpgradeProgress {
  originalUid: string
  username: string
  phase: 'identity-linked' | 'password-set'
}
export type UsernameAuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: UsernameAuthErrorCode; message: string; operation: AuthOperation; step: AuthStep }; upgradeProgress?: UpgradeProgress }
export interface UsernameAccount {
  uid: string
  username: string
  kind: 'pseudonymous'
  passwordWarning?: 'WEAK_PASSWORD'
}

class FoundationFault extends Error {
  constructor(readonly code: UsernameAuthErrorCode) { super(messages[code]) }
}
function stop(code: UsernameAuthErrorCode): never { throw new FoundationFault(code) }
const take = <T,>(reply: { data: T; error: unknown }): T => {
  if (reply.error) throw reply.error
  return reply.data
}
function errorCode(error: unknown): UsernameAuthErrorCode {
  if (error instanceof UsernameValidationError) return 'INVALID_USERNAME'
  if (error instanceof FoundationFault) return error.code
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  switch (code) {
    case 'email_exists': case 'user_already_exists': return 'ACCOUNT_CONFLICT'
    case 'invalid_credentials': return 'INVALID_CREDENTIALS'
    case 'weak_password': return 'PASSWORD_TOO_WEAK'
    case 'email_not_confirmed': return 'EMAIL_VERIFICATION_REQUIRED'
    case 'reauthentication_needed': case 'reauthentication_not_valid': return 'REAUTHENTICATION_REQUIRED'
    case 'over_request_rate_limit': case 'over_email_send_rate_limit': return 'RATE_LIMITED'
    default: return 'AUTH_UNAVAILABLE'
  }
}
function validatePassword(password: unknown, isNew: boolean): asserts password is string {
  if (typeof password !== 'string' || password.length === 0) stop('PASSWORD_REQUIRED')
  if (isNew && Array.from(password).length < 8) stop('PASSWORD_TOO_SHORT')
}
async function readOwner(auth: UsernameAuthPort) {
  const { session } = take(await auth.getSession())
  if (!session) return stop('SESSION_REQUIRED')
  const { user } = take(await auth.getUser())
  if (!user) return stop('SESSION_REQUIRED')
  if (user.id !== session.user.id) stop('UID_MISMATCH')
  return { session, user }
}
function checkAccount(user: User, uid: string, username: string): UsernameAccount {
  if (user.id !== uid) stop('UID_MISMATCH')
  if (user.email !== deriveSyntheticIdentifier(username) || user.is_anonymous !== false || user.new_email) stop('IDENTITY_MISMATCH')
  if (!user.email_confirmed_at) stop('EMAIL_VERIFICATION_REQUIRED')
  return { uid, username, kind: 'pseudonymous' }
}

/** No startup effects, storage, logging, data migration, or automatic fallback. */
export function createUsernameAuthService(getAuth: () => UsernameAuthPort) {
  let busy = false
  const run = async <T,>(operation: AuthOperation, action: (auth: UsernameAuthPort, context: { step: AuthStep; upgradeProgress?: UpgradeProgress }) => Promise<T>): Promise<UsernameAuthResult<T>> => {
    const context: { step: AuthStep; upgradeProgress?: UpgradeProgress } = { step: 'validation' }
    const failure = (code: UsernameAuthErrorCode): UsernameAuthResult<T> => ({
      ok: false, error: { code, message: messages[code], operation, step: context.step },
      ...(context.upgradeProgress ? { upgradeProgress: { ...context.upgradeProgress } } : {}),
    })
    if (busy) return failure('OPERATION_IN_PROGRESS')
    busy = true
    try { return { ok: true, data: await action(getAuth(), context) } }
    catch (error) { return failure(errorCode(error)) }
    finally { busy = false }
  }

  return {
    registerWithUsername(input: unknown, password: string) {
      return run('register', async (auth, context) => {
        const username = normalizeUsername(input)
        validatePassword(password, true)
        context.step = 'session'
        if (take(await auth.getSession()).session) stop('SESSION_ALREADY_PRESENT')
        context.step = 'registration'
        const data = take(await auth.signUp({ email: deriveSyntheticIdentifier(username), password }))
        if (!data.user || !data.session) return stop('SESSION_NOT_RETURNED')
        if (data.user.id !== data.session.user.id) stop('UID_MISMATCH')
        context.step = 'verification'
        const { user } = await readOwner(auth)
        return checkAccount(user, data.user.id, username)
      })
    },
    // Future integration must show the warning and isolate product state before opting in.
    signInWithUsername(input: unknown, password: string, options: { allowSessionSwitch?: boolean } = {}) {
      return run('login', async (auth, context) => {
        const username = normalizeUsername(input)
        validatePassword(password, false)
        context.step = 'session'
        if (take(await auth.getSession()).session && options.allowSessionSwitch !== true) stop('SESSION_ALREADY_PRESENT')
        context.step = 'login'
        const data = take(await auth.signInWithPassword({ email: deriveSyntheticIdentifier(username), password }))
        if (!data.user || !data.session) return stop('SESSION_NOT_RETURNED')
        if (data.user.id !== data.session.user.id) stop('UID_MISMATCH')
        context.step = 'verification'
        const { user } = await readOwner(auth)
        return { ...checkAccount(user, data.user.id, username), ...(data.weakPassword ? { passwordWarning: 'WEAK_PASSWORD' as const } : {}) }
      })
    },
    upgradeAnonymousToUsernamePassword(input: unknown, password: string) {
      return run('upgrade', async (auth, context) => {
        context.step = 'session'
        const original = (await readOwner(auth)).user
        if (original.is_anonymous !== true) stop('ANONYMOUS_SESSION_REQUIRED')
        const uid = original.id
        context.step = 'validation'
        const username = normalizeUsername(input)
        validatePassword(password, true)
        context.step = 'identity_link'
        const linked = await auth.updateUser({ email: deriveSyntheticIdentifier(username) })
        if (linked.error) {
          if (errorCode(linked.error) === 'ACCOUNT_CONFLICT') {
            // Do not claim guest preservation unless the current server owner agrees.
            const current = (await readOwner(auth)).user
            if (current.id !== uid) stop('UID_MISMATCH')
            if (current.is_anonymous !== true || current.email !== original.email || current.new_email !== original.new_email ||
              JSON.stringify(current.identities) !== JSON.stringify(original.identities)) stop('IDENTITY_MISMATCH')
          }
          throw linked.error
        }
        if (!linked.data.user) return stop('IDENTITY_MISMATCH')
        if (linked.data.user.id !== uid) stop('UID_MISMATCH')
        context.upgradeProgress = { originalUid: uid, username, phase: 'identity-linked' }
        const afterLink = (await readOwner(auth)).user
        if (afterLink.id !== uid) stop('UID_MISMATCH')
        if (afterLink.email !== deriveSyntheticIdentifier(username)) stop('IDENTITY_MISMATCH')
        if (!afterLink.email_confirmed_at || afterLink.new_email) stop('EMAIL_VERIFICATION_REQUIRED')
        context.step = 'password_set'
        const passwordData = take(await auth.updateUser({ password }))
        if (!passwordData.user) return stop('IDENTITY_MISMATCH')
        if (passwordData.user.id !== uid) stop('UID_MISMATCH')
        context.upgradeProgress.phase = 'password-set'
        context.step = 'verification'
        const { user } = await readOwner(auth)
        return checkAccount(user, uid, username)
      })
    },
    signOutPermanentSession() {
      return run('logout', async (auth, context) => {
        context.step = 'session'
        const { user } = await readOwner(auth)
        if (user.is_anonymous !== false) stop('PERMANENT_SESSION_REQUIRED')
        context.step = 'logout'
        const outcome = await auth.signOut({ scope: 'local' })
        const { session } = take(await auth.getSession())
        if (session) {
          if (session.user.id !== user.id) stop('UID_MISMATCH')
          if (outcome.error) throw outcome.error
          stop('SIGNOUT_INCOMPLETE')
        }
        return { signedOut: true as const }
      })
    },
  }
}

const production = createUsernameAuthService(() => requireSupabase().auth)
export const { registerWithUsername, signInWithUsername, upgradeAnonymousToUsernamePassword, signOutPermanentSession } = production
