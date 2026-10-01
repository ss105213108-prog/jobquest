import { describe, expect, it, vi } from 'vitest'
import type { Session, User } from '@supabase/supabase-js'
import { deriveSyntheticIdentifier, normalizeUsername, usernameFromSyntheticIdentifier, UsernameValidationError } from '../src/services/authIdentity'
import { createUsernameAuthService, type UsernameAuthPort } from '../src/services/usernameAuthService'

const password = 'Generic9!Password'
const username = 'sample_user'
const identifier = deriveSyntheticIdentifier(username)
const account = (anonymous = false, uid = 'owner-a'): User => ({
  id: uid, aud: 'authenticated', role: 'authenticated', created_at: '2026-01-01T00:00:00Z',
  app_metadata: {}, user_metadata: anonymous ? {} : { email: identifier },
  is_anonymous: anonymous, email: anonymous ? undefined : identifier,
  email_confirmed_at: anonymous ? undefined : '2026-01-01T00:00:00Z',
  identities: anonymous ? [] : [{ id: 'identity-a', user_id: uid, identity_data: { email: identifier }, provider: 'email', identity_id: 'identity-a', created_at: '2026-01-01T00:00:00Z' }],
})
const sessionFor = (user: User): Session => ({ user, access_token: 'not-real-access-token', refresh_token: 'not-real-refresh-token', expires_in: 3600, token_type: 'bearer' })

function setup(initial: User | null = null) {
  let current = initial && structuredClone(initial)
  const state = () => ({ user: current && structuredClone(current), session: current ? sessionFor(structuredClone(current)) : null })
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: state().session }, error: null as unknown })),
    getUser: vi.fn(async () => ({ data: { user: state().user }, error: null as unknown })),
    signUp: vi.fn(async (_credentials: { email: string; password: string }) => { current = account(); return { data: state(), error: null as unknown } }),
    signInWithPassword: vi.fn(async (_credentials: { email: string; password: string }) => { current = account(); return { data: state(), error: null as unknown } }),
    updateUser: vi.fn(async (attributes: { email: string } | { password: string }) => {
      if (current && 'email' in attributes) current = { ...account(false, current.id), email: attributes.email }
      return { data: { user: state().user }, error: null as unknown }
    }),
    signOut: vi.fn(async (_options: { scope: 'local' }) => { current = null; return { error: null as unknown } }),
  } satisfies UsernameAuthPort
  return { auth, service: createUsernameAuthService(() => auth), current: () => current, setCurrent: (next: User | null) => { current = next } }
}
const rawError = (code: string) => ({ code, message: `private detail ${identifier} ${password} not-real-access-token`, status: 422 })
const safeResult = (result: unknown) => {
  const text = JSON.stringify(result)
  for (const secret of [identifier, '@jobquest.invalid', password, 'not-real-access-token', 'not-real-refresh-token', 'private detail', 'identity_data', 'user_metadata']) expect(text).not.toContain(secret)
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}

describe('approved username identity contract', () => {
  it.each(['abc', 'Alpha9', 'sample_user', 'a'.repeat(32)])('accepts the allowed alphabet and boundaries: %s', input => {
    expect(normalizeUsername(input)).toBe(input.toLowerCase())
  })
  it('only trims surrounding whitespace and lowercases ASCII', () => {
    expect(normalizeUsername(' \tSAMPLE_User\n')).toBe(username)
  })
  it.each([null, undefined, 123, {}, '', 'ab', 'a'.repeat(33), '1abc', '_abc', 'user-name', 'user name', 'user.name', 'user@example.invalid', '測試帳號', 'ＡＢＣ', 'aéx'])('rejects invalid input without echoing it: %j', input => {
    expect(() => normalizeUsername(input)).toThrow(UsernameValidationError)
    try { normalizeUsername(input) } catch (error) {
      expect((error as UsernameValidationError).code).toBe('INVALID_USERNAME')
      expect((error as Error).message).not.toContain('@')
    }
  })
  it('uses the exact stable deterministic namespace with no hidden suffix', () => {
    expect(deriveSyntheticIdentifier(' SAMPLE_USER ')).toBe('u1.sample_user@jobquest.invalid')
    expect(deriveSyntheticIdentifier(username)).toBe(identifier)
    expect(deriveSyntheticIdentifier('other_user')).not.toBe(identifier)
    expect(deriveSyntheticIdentifier('a'.repeat(32))).toBe(`u1.${'a'.repeat(32)}@jobquest.invalid`)
  })
  it('only decodes strict canonical identities', () => {
    expect(usernameFromSyntheticIdentifier(identifier)).toBe(username)
    for (const value of ['u2.sample_user@jobquest.invalid', 'u1.SAMPLE_USER@jobquest.invalid', 'u1.ab@jobquest.invalid', 'u1.sample_user@jobquest.invalid.attacker.invalid', 'u1.sample_user@other.invalid', null]) expect(usernameFromSyntheticIdentifier(value)).toBeNull()
  })
})

describe('new account registration and password login', () => {
  it('registers with derived internal credentials but returns only safe account data', async () => {
    const s = setup(), exactPassword = '  Generic9!Password  '
    const result = await s.service.registerWithUsername(' SAMPLE_USER ', exactPassword)
    expect(s.auth.signUp).toHaveBeenCalledExactlyOnceWith({ email: identifier, password: exactPassword })
    expect(result).toEqual({ ok: true, data: { uid: 'owner-a', username, kind: 'pseudonymous' } })
    safeResult(result)
  })
  it('never creates a second UID when registration is requested during Guest use', async () => {
    const s = setup(account(true))
    expect(await s.service.registerWithUsername(username, password)).toMatchObject({ ok: false, error: { code: 'SESSION_ALREADY_PRESENT' } })
    expect(s.auth.signUp).not.toHaveBeenCalled()
    expect(s.current()?.is_anonymous).toBe(true)
  })
  it.each(['email_exists', 'user_already_exists'])('maps registration conflict %s without raw backend data', async code => {
    const s = setup()
    s.auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: rawError(code) })
    const result = await s.service.registerWithUsername(username, password)
    expect(result).toMatchObject({ ok: false, error: { code: 'ACCOUNT_CONFLICT' } })
    expect(s.auth.signInWithPassword).not.toHaveBeenCalled()
    safeResult(result)
  })
  it('does not accept a signup response without a usable session', async () => {
    const s = setup()
    s.auth.signUp.mockResolvedValue({ data: { user: account(), session: null }, error: null })
    expect(await s.service.registerWithUsername(username, password)).toMatchObject({ ok: false, error: { code: 'SESSION_NOT_RETURNED' } })
    expect(s.auth.signUp).toHaveBeenCalledTimes(1)
    expect(s.auth.getUser).not.toHaveBeenCalled()
  })
  it('rejects a registration session belonging to a different UID', async () => {
    const s = setup()
    s.auth.signUp.mockResolvedValue({ data: { user: account(), session: sessionFor(account(false, 'owner-b')) }, error: null })
    expect(await s.service.registerWithUsername(username, password)).toMatchObject({ ok: false, error: { code: 'UID_MISMATCH' } })
  })
  it('rejects malformed usernames and short new passwords before any SDK mutation', async () => {
    const s = setup()
    expect(await s.service.registerWithUsername('user name', password)).toMatchObject({ ok: false, error: { code: 'INVALID_USERNAME' } })
    expect(await s.service.registerWithUsername(username, 'short')).toMatchObject({ ok: false, error: { code: 'PASSWORD_TOO_SHORT' } })
    expect(s.auth.signUp).not.toHaveBeenCalled()
    expect(s.auth.getSession).not.toHaveBeenCalled()
  })
  it('counts Unicode code points for the product minimum', async () => {
    const s = setup()
    expect(await s.service.registerWithUsername(username, '😀'.repeat(7))).toMatchObject({ ok: false, error: { code: 'PASSWORD_TOO_SHORT' } })
    expect((await s.service.registerWithUsername(username, '😀'.repeat(8))).ok).toBe(true)
  })
  it('logs in with the same normalization and preserves even an old short password exactly', async () => {
    const s = setup()
    const result = await s.service.signInWithUsername(' Sample_User ', ' old ')
    expect(result).toMatchObject({ ok: true, data: { uid: 'owner-a', username } })
    expect(s.auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith({ email: identifier, password: ' old ' })
    safeResult(result)
  })
  it('does not silently replace an existing session unless a future integration explicitly opts in', async () => {
    const s = setup(account(true))
    expect(await s.service.signInWithUsername(username, password)).toMatchObject({ ok: false, error: { code: 'SESSION_ALREADY_PRESENT' } })
    expect(s.auth.signInWithPassword).not.toHaveBeenCalled()
    expect((await s.service.signInWithUsername(username, password, { allowSessionSwitch: true })).ok).toBe(true)
    expect(s.auth.signOut).not.toHaveBeenCalled()
  })
  it('maps wrong and unknown-account credentials to the same safe error', async () => {
    const s = setup()
    s.auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: rawError('invalid_credentials') })
    const wrong = await s.service.signInWithUsername(username, password)
    const unknown = await s.service.signInWithUsername('unknown_user', password)
    expect(wrong).toEqual(unknown)
    expect(wrong).toMatchObject({ ok: false, error: { code: 'INVALID_CREDENTIALS', message: '帳號或密碼不正確。' } })
    safeResult(wrong)
  })
  it('keeps successful login separate from a weak-password warning', async () => {
    const s = setup()
    s.auth.signInWithPassword.mockImplementation(async () => {
      s.setCurrent(account())
      return { data: { user: account(), session: sessionFor(account()), weakPassword: { message: identifier } }, error: null }
    })
    const result = await s.service.signInWithUsername(username, password)
    expect(result).toMatchObject({ ok: true, data: { passwordWarning: 'WEAK_PASSWORD' } })
    safeResult(result)
  })
  it('rejects unexpected identity data even if the SDK returns a session', async () => {
    const s = setup()
    s.auth.getUser.mockResolvedValue({ data: { user: { ...account(), email: 'u1.other_user@jobquest.invalid' } }, error: null })
    expect(await s.service.signInWithUsername(username, password)).toMatchObject({ ok: false, error: { code: 'IDENTITY_MISMATCH' } })
  })
  it('contains thrown exceptions rather than exposing credentials or internal identifiers', async () => {
    const s = setup()
    s.auth.signInWithPassword.mockRejectedValue(new Error(rawError('unknown').message))
    const result = await s.service.signInWithUsername(username, password)
    expect(result).toMatchObject({ ok: false, error: { code: 'AUTH_UNAVAILABLE' } })
    safeResult(result)
  })
})

describe('anonymous upgrade owner invariants', () => {
  it('uses the verified two updates on the existing UID and never signUp/signIn/signOut', async () => {
    const s = setup(account(true))
    const result = await s.service.upgradeAnonymousToUsernamePassword(' SAMPLE_USER ', password)
    expect(s.auth.updateUser.mock.calls).toEqual([[{ email: identifier }], [{ password }]])
    expect(result).toEqual({ ok: true, data: { uid: 'owner-a', username, kind: 'pseudonymous' } })
    expect(s.auth.signUp).not.toHaveBeenCalled()
    expect(s.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(s.auth.signOut).not.toHaveBeenCalled()
    safeResult(result)
  })
  it.each([null, account()])('requires both a session and an anonymous server user', async initial => {
    const s = setup(initial)
    const result = await s.service.upgradeAnonymousToUsernamePassword(username, password)
    expect(result).toMatchObject({ ok: false, error: { code: initial ? 'ANONYMOUS_SESSION_REQUIRED' : 'SESSION_REQUIRED' } })
    expect(s.auth.updateUser).not.toHaveBeenCalled()
  })
  it('checks server UID against the original session before writing', async () => {
    const s = setup(account(true))
    s.auth.getUser.mockResolvedValue({ data: { user: account(true, 'owner-b') }, error: null })
    expect(await s.service.upgradeAnonymousToUsernamePassword(username, password)).toMatchObject({ ok: false, error: { code: 'UID_MISMATCH' } })
    expect(s.auth.updateUser).not.toHaveBeenCalled()
  })
  it('validates a new password before linking identity', async () => {
    const s = setup(account(true))
    expect(await s.service.upgradeAnonymousToUsernamePassword(username, 'short')).toMatchObject({ ok: false, error: { code: 'PASSWORD_TOO_SHORT' } })
    expect(s.auth.updateUser).not.toHaveBeenCalled()
  })
  it('hard-stops an identity-link response with another UID before password update', async () => {
    const s = setup(account(true))
    s.auth.updateUser.mockResolvedValueOnce({ data: { user: account(false, 'owner-b') }, error: null })
    const result = await s.service.upgradeAnonymousToUsernamePassword(username, password)
    expect(result).toMatchObject({ ok: false, error: { code: 'UID_MISMATCH', step: 'identity_link' } })
    expect(s.auth.updateUser).toHaveBeenCalledTimes(1)
    safeResult(result)
  })
  it('also checks fresh server/session ownership after linking', async () => {
    const s = setup(account(true))
    s.auth.getUser.mockResolvedValueOnce({ data: { user: account(true) }, error: null }).mockResolvedValueOnce({ data: { user: account(false, 'owner-b') }, error: null })
    expect(await s.service.upgradeAnonymousToUsernamePassword(username, password)).toMatchObject({ ok: false, error: { code: 'UID_MISMATCH' } })
    expect(s.auth.updateUser).toHaveBeenCalledTimes(1)
  })
  it('does not set password when the linked identity still requires email confirmation', async () => {
    const s = setup(account(true))
    s.auth.updateUser.mockImplementationOnce(async () => {
      const pending = { ...account(), email_confirmed_at: undefined, new_email: identifier }
      s.setCurrent(pending)
      return { data: { user: pending }, error: null }
    })
    expect(await s.service.upgradeAnonymousToUsernamePassword(username, password)).toMatchObject({ ok: false, error: { code: 'EMAIL_VERIFICATION_REQUIRED' }, upgradeProgress: { originalUid: 'owner-a', phase: 'identity-linked' } })
    expect(s.auth.updateUser).toHaveBeenCalledTimes(1)
  })
  it('does not treat is_anonymous=false after link as successful password establishment', async () => {
    const s = setup(account(true))
    s.auth.updateUser.mockImplementationOnce(async () => { s.setCurrent(account()); return { data: { user: account() }, error: null } })
      .mockResolvedValueOnce({ data: { user: null }, error: rawError('weak_password') })
    const result = await s.service.upgradeAnonymousToUsernamePassword(username, password)
    expect(result).toMatchObject({ ok: false, error: { code: 'PASSWORD_TOO_WEAK', step: 'password_set' }, upgradeProgress: { originalUid: 'owner-a', username, phase: 'identity-linked' } })
    expect(s.current()?.is_anonymous).toBe(false)
    safeResult(result)
  })
  it('hard-stops a password response with a different UID', async () => {
    const s = setup(account(true))
    s.auth.updateUser.mockImplementationOnce(async () => { s.setCurrent(account()); return { data: { user: account() }, error: null } })
      .mockResolvedValueOnce({ data: { user: account(false, 'owner-b') }, error: null })
    expect(await s.service.upgradeAnonymousToUsernamePassword(username, password)).toMatchObject({ ok: false, error: { code: 'UID_MISMATCH', step: 'password_set' } })
  })
  it('checks final server state even when both update responses claim the original UID', async () => {
    const s = setup(account(true))
    s.auth.getUser.mockResolvedValueOnce({ data: { user: account(true) }, error: null })
      .mockResolvedValueOnce({ data: { user: account() }, error: null })
      .mockResolvedValueOnce({ data: { user: account(false, 'owner-b') }, error: null })
    expect(await s.service.upgradeAnonymousToUsernamePassword(username, password)).toMatchObject({ ok: false, error: { code: 'UID_MISMATCH', step: 'verification' } })
  })
  it('returns typed conflict only after confirming the Guest was preserved', async () => {
    const original = account(true), s = setup(original)
    s.auth.updateUser.mockResolvedValueOnce({ data: { user: null }, error: rawError('email_exists') })
    const result = await s.service.upgradeAnonymousToUsernamePassword(username, password)
    expect(result).toMatchObject({ ok: false, error: { code: 'ACCOUNT_CONFLICT' } })
    expect(result).not.toHaveProperty('upgradeProgress')
    expect(s.current()).toEqual(original)
    expect(s.auth.getUser).toHaveBeenCalledTimes(2)
    expect(s.auth.updateUser).toHaveBeenCalledTimes(1)
    expect(s.auth.signUp).not.toHaveBeenCalled()
    expect(s.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(s.auth.signOut).not.toHaveBeenCalled()
    safeResult(result)
  })
  it('does not report preserved collision when server identity actually changed', async () => {
    const s = setup(account(true))
    s.auth.updateUser.mockImplementationOnce(async () => { s.setCurrent(account()); return { data: { user: null }, error: rawError('email_exists') } })
    expect(await s.service.upgradeAnonymousToUsernamePassword(username, password)).toMatchObject({ ok: false, error: { code: 'IDENTITY_MISMATCH' } })
  })
  it('does not fall back to registration on a thrown link failure', async () => {
    const s = setup(account(true))
    s.auth.updateUser.mockRejectedValueOnce(new Error(rawError('unknown').message))
    const result = await s.service.upgradeAnonymousToUsernamePassword(username, password)
    expect(result).toMatchObject({ ok: false, error: { code: 'AUTH_UNAVAILABLE', step: 'identity_link' } })
    expect(s.auth.signUp).not.toHaveBeenCalled()
    expect(s.auth.signInWithPassword).not.toHaveBeenCalled()
    safeResult(result)
  })
  it('contains password transport failures with non-secret partial progress', async () => {
    const s = setup(account(true))
    s.auth.updateUser.mockImplementationOnce(async () => { s.setCurrent(account()); return { data: { user: account() }, error: null } })
      .mockRejectedValueOnce(new Error(rawError('unknown').message))
    const result = await s.service.upgradeAnonymousToUsernamePassword(username, password)
    expect(result).toMatchObject({ ok: false, upgradeProgress: { phase: 'identity-linked' } })
    safeResult(result)
  })
})

describe('logout, concurrency and safe failures', () => {
  it('signs out only the local permanent session without creating a Guest', async () => {
    const s = setup(account())
    expect(await s.service.signOutPermanentSession()).toEqual({ ok: true, data: { signedOut: true } })
    expect(s.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
    expect(s.current()).toBeNull()
    expect(s.auth.signUp).not.toHaveBeenCalled()
    expect(s.auth.updateUser).not.toHaveBeenCalled()
  })
  it('refuses to silently end a Guest session', async () => {
    const s = setup(account(true))
    expect(await s.service.signOutPermanentSession()).toMatchObject({ ok: false, error: { code: 'PERMANENT_SESSION_REQUIRED' } })
    expect(s.auth.signOut).not.toHaveBeenCalled()
    expect(s.current()?.is_anonymous).toBe(true)
  })
  it('does not claim logout succeeded when a session remains', async () => {
    const s = setup(account())
    s.auth.signOut.mockResolvedValue({ error: null })
    expect(await s.service.signOutPermanentSession()).toMatchObject({ ok: false, error: { code: 'SIGNOUT_INCOMPLETE' } })
  })
  it('can confirm local logout despite a backend error when SDK session is already null', async () => {
    const s = setup(account())
    s.auth.signOut.mockImplementation(async () => { s.setCurrent(null); return { error: rawError('unknown') } })
    expect((await s.service.signOutPermanentSession()).ok).toBe(true)
  })
  it('serializes foundation mutations by refusing concurrent submissions and releases its lock', async () => {
    const s = setup(), pending = deferred<Awaited<ReturnType<UsernameAuthPort['signUp']>>>()
    s.auth.signUp.mockImplementationOnce(() => pending.promise)
    const registration = s.service.registerWithUsername(username, password)
    await vi.waitFor(() => expect(s.auth.signUp).toHaveBeenCalledTimes(1))
    expect(await s.service.signInWithUsername(username, password)).toMatchObject({ ok: false, error: { code: 'OPERATION_IN_PROGRESS' } })
    pending.resolve({ data: { user: null, session: null }, error: rawError('user_already_exists') })
    await registration
    expect((await s.service.signInWithUsername(username, password)).ok).toBe(true)
  })
  it.each(['weak_password', 'reauthentication_needed', 'over_request_rate_limit', 'email_not_confirmed', 'unknown'])('all mapped and unknown backend errors remain domain-safe: %s', async code => {
    const s = setup()
    s.auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: rawError(code) })
    const result = await s.service.registerWithUsername(username, password)
    expect(result.ok).toBe(false)
    safeResult(result)
  })
  it('sanitizes failures to acquire the configured client', async () => {
    const service = createUsernameAuthService(() => { throw new Error(rawError('unknown').message) })
    const result = await service.registerWithUsername(username, password)
    expect(result).toMatchObject({ ok: false, error: { code: 'AUTH_UNAVAILABLE' } })
    safeResult(result)
  })
})
