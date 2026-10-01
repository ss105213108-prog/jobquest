import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn(), signOut: vi.fn(), updateUser: vi.fn(), signInAnonymously: vi.fn(), onAuthStateChange: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ requireSupabase: () => ({ auth }) }))
const user = { id: 'unit-anonymous-owner', is_anonymous: true }
const session = { user }

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  auth.getSession.mockResolvedValue({ data: { session }, error: null })
  auth.getUser.mockResolvedValue({ data: { user }, error: null })
  auth.signInAnonymously.mockResolvedValue({ data: { session, user }, error: null })
})

describe('existing anonymous Auth reuse', () => {
  it('reuses the existing session without creating an anonymous identity', async () => {
    const { authService } = await import('../src/services/authService')
    expect(await authService.initialize()).toEqual({ user })
    expect(auth.signInAnonymously).not.toHaveBeenCalled()
  })
  it('shows no session without automatically creating an anonymous identity', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { authService } = await import('../src/services/authService')
    expect(await authService.initialize()).toEqual({ user: null })
    expect(auth.signInAnonymously).not.toHaveBeenCalled()
    expect(auth.getUser).not.toHaveBeenCalled()
  })
  it('deduplicates concurrent initialization for the same existing product lifecycle', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { authService } = await import('../src/services/authService')
    await Promise.all([authService.initialize(), authService.initialize()])
    expect(auth.getSession).toHaveBeenCalledOnce()
    expect(auth.signInAnonymously).not.toHaveBeenCalled()
  })
  it('does not create another user when reading the session fails', async () => {
    auth.getSession.mockResolvedValue({ data: {}, error: new Error('session unavailable') })
    const { authService } = await import('../src/services/authService')
    await expect(authService.initialize()).rejects.toThrow('session unavailable')
    expect(auth.signInAnonymously).not.toHaveBeenCalled()
  })
  it('reports creation failure and permits the existing explicit retry path', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    auth.signInAnonymously.mockResolvedValueOnce({ data: {}, error: new Error('anonymous unavailable') })
    const { authService } = await import('../src/services/authService')
    await expect(authService.enterGuest()).rejects.toThrow('AUTH_UNAVAILABLE')
    await expect(authService.enterGuest()).resolves.toBeUndefined()
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(2)
  })
  it('refuses an incomplete successful anonymous response', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    auth.signInAnonymously.mockResolvedValue({ data: { session: null, user }, error: null })
    const { authService } = await import('../src/services/authService')
    await expect(authService.enterGuest()).rejects.toThrow('AUTH_UNAVAILABLE')
  })
  it('reuses the existing auth subscription', async () => {
    const { authService } = await import('../src/services/authService')
    const callback = vi.fn(), unsubscribe = vi.fn()
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } })
    const subscription = authService.subscribe(callback)
    const handler = auth.onAuthStateChange.mock.calls[0][0]
    handler('SIGNED_IN', session); handler('SIGNED_OUT', null)
    expect(callback.mock.calls).toEqual([[user], [null]])
    subscription.data.subscription.unsubscribe()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
  it('does not retain a successful read after the SDK session changes', async () => {
    const { authService } = await import('../src/services/authService')
    await authService.initialize()
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    expect(await authService.initialize()).toEqual({ user: null })
    expect(auth.getSession).toHaveBeenCalledTimes(2)
  })
  it('rejects a cached session whose fresh server user differs', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { ...user, id: 'other-owner' } }, error: null })
    const { authService } = await import('../src/services/authService')
    await expect(authService.initialize()).rejects.toThrow('AUTH_UNAVAILABLE')
    expect(auth.signInAnonymously).not.toHaveBeenCalled()
  })
  it('refuses explicit Guest entry while a session already exists', async () => {
    const { authService } = await import('../src/services/authService')
    await expect(authService.enterGuest()).rejects.toThrow('SESSION_ALREADY_PRESENT')
    expect(auth.signInAnonymously).not.toHaveBeenCalled()
  })
})
