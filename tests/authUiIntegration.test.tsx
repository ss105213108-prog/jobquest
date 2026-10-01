import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, User } from '@supabase/supabase-js'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const harness = vi.hoisted(() => ({ cursor: 0, slots: [] as any[], effects: [] as (() => void)[], sdk: null as any }))
vi.mock('../src/lib/supabase', () => ({ requireSupabase: () => ({ auth: harness.sdk }) }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const i = harness.cursor++
    if (!(i in harness.slots)) harness.slots[i] = typeof initial === 'function' ? initial() : initial
    return [harness.slots[i], (value: any) => { harness.slots[i] = typeof value === 'function' ? value(harness.slots[i]) : value }]
  },
  useEffect: (effect: () => void, deps: unknown[]) => {
    const i = harness.cursor++, previous = harness.slots[i]
    if (!previous || !deps.every((value, index) => Object.is(value, previous[index]))) { harness.slots[i] = deps; harness.effects.push(effect) }
  },
}))
import { authService } from '../src/services/authService'
import { createUsernameAuthService, type UsernameAuthPort } from '../src/services/usernameAuthService'
import { deriveSyntheticIdentifier } from '../src/services/authIdentity'
import { createAuthIntegration, validateAuthInput, type AuthIntegration } from '../src/services/authIntegration'
import { AUTH_UPGRADE_PENDING_KEY, AUTH_WORKING_OWNER_KEY, createAuthIntegrationStorage } from '../src/services/authIntegrationStorage'
import { AuthForm, AuthGatewayView } from '../src/components/auth/AuthGateway'

const account = (id = 'owner-a', username = 'quest_user') => ({ id, is_anonymous: false, email: deriveSyntheticIdentifier(username), email_confirmed_at: '2026-09-29T00:00:00Z', identities: [{ provider: 'email' }] } as User)
const guest = (id = 'owner-a') => ({ id, is_anonymous: true, email: '', identities: [] } as unknown as User)
const session = (user: User) => ({ user } as Session)
const credentials = { username: 'quest_user', password: 'Test_password_42', confirmation: 'Test_password_42' }
const waitReady = async (controller: AuthIntegration) => { await vi.waitFor(() => expect(controller.getSnapshot().initializing).toBe(false)) }
function fixture(initial: User | null = null) {
  let current = initial
  let listener: (event: string, next: Session | null) => void = () => {}
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const set = (user: User | null, event = 'SIGNED_IN') => { current = user; listener(event, user ? session(user) : null) }
  const sdk = {
    getSession: vi.fn(async () => ({ data: { session: current ? session(current) : null }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: current }, error: null })),
    signInAnonymously: vi.fn(async () => { set(guest()); return { data: { user: current, session: session(current!) }, error: null } }),
    signUp: vi.fn(async () => { set(account('registered-owner')); return { data: { user: current, session: session(current!) }, error: null } }),
    signInWithPassword: vi.fn(async () => { set(account('existing-owner')); return { data: { user: current, session: session(current!) }, error: null } }),
    updateUser: vi.fn(async (attributes: { email?: string; password?: string }) => {
      if (attributes.email) set({ ...account(current!.id), email: attributes.email }, 'USER_UPDATED')
      else listener('USER_UPDATED', session(current!))
      return { data: { user: current }, error: null }
    }),
    signOut: vi.fn(async () => { set(null, 'SIGNED_OUT'); return { error: null } }),
    onAuthStateChange: vi.fn((callback: typeof listener) => { listener = callback; return { data: { subscription: { unsubscribe: vi.fn(() => { listener = () => {} }) } } } }),
  }
  harness.sdk = sdk
  const deferred: (() => void)[] = []
  const controller = createAuthIntegration({ session: authService, accounts: createUsernameAuthService(() => sdk as UsernameAuthPort), storage: createAuthIntegrationStorage(() => storage), defer: callback => { deferred.push(callback) } })
  const start = async () => { controller.start(); await waitReady(controller) }
  return { controller, sdk, values, storage, set, start, deferred, current: () => current }
}
const view = (controller: AuthIntegration, child: ReactNode = <div>JobQuest product</div>) => {
  harness.cursor = 0
  const tree = AuthGatewayView({ state: controller.getSnapshot(), controller, children: child })
  const effects = harness.effects.splice(0); effects.forEach(effect => effect())
  return tree
}
const elements = (node: ReactNode): ReactElement<any>[] => {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<{ children?: ReactNode }>(node)) return []
  return [node, ...elements(node.props.children)]
}
const button = (tree: ReactNode, label: string) => {
  const result = elements(tree).find(el => el.type === 'button' && el.props.children === label)
  if (!result) throw new Error(`Button missing: ${label}`)
  return result
}
beforeEach(() => { vi.clearAllMocks(); harness.slots = []; harness.effects = []; harness.cursor = 0 })

describe('Auth startup and foundation integration', () => {
  it('no session renders all Landing choices and never creates Guest', async () => {
    const f = fixture(); await f.start()
    const html = renderToStaticMarkup(view(f.controller))
    for (const choice of ['登入', '註冊', '先以訪客試用']) expect(html).toContain(choice)
    expect(html).not.toContain('JobQuest product'); expect(f.sdk.signInAnonymously).not.toHaveBeenCalled()
  })
  it.each([[account(), 'account', '帳號：quest_user'], [guest(), 'guest', '訪客試用中']] as const)('restores a valid %s session into the product', async (user, mode, label) => {
    const f = fixture(user); await f.start()
    const html = renderToStaticMarkup(view(f.controller))
    expect(f.controller.getSnapshot().mode).toBe(mode); expect(html).toContain(label); expect(html).toContain('JobQuest product')
    expect(f.sdk.signInAnonymously).not.toHaveBeenCalled(); expect(f.sdk.getUser).toHaveBeenCalled()
  })
  it('explicit Guest button alone calls anonymous sign-in', async () => {
    const f = fixture(); await f.start()
    button(view(f.controller), '先以訪客試用').props.onClick()
    await vi.waitFor(() => expect(f.controller.getSnapshot().mode).toBe('guest'))
    expect(f.sdk.signInAnonymously).toHaveBeenCalledOnce()
  })
  it.each(['register', 'login'] as const)('%s uses foundation credentials and enters the product', async intent => {
    const f = fixture(); await f.start()
    expect(await f.controller.perform(intent, credentials)).toBe(true)
    const method = intent === 'register' ? f.sdk.signUp : f.sdk.signInWithPassword
    expect(method).toHaveBeenCalledExactlyOnceWith({ email: deriveSyntheticIdentifier(credentials.username), password: credentials.password })
    expect(f.controller.getSnapshot().mode).toBe('account'); expect(renderToStaticMarkup(view(f.controller))).toContain('JobQuest product')
  })
  it.each([
    [{ ...credentials, username: '' }, '請輸入帳號。'], [{ ...credentials, username: '中文' }, '帳號需為'],
    [{ ...credentials, password: '' }, '請輸入密碼。'], [{ ...credentials, password: 'short' }, '密碼至少'],
    [{ ...credentials, confirmation: '' }, '請再次輸入密碼。'], [{ ...credentials, confirmation: 'different' }, '兩次輸入的密碼不同。'],
  ])('registration validation never reaches SDK: %s', async (input, copy) => {
    const f = fixture(); await f.start()
    expect(await f.controller.perform('register', input)).toBe(false)
    expect(f.controller.getSnapshot().actionError).toContain(copy); expect(f.sdk.signUp).not.toHaveBeenCalled()
  })
  it('login accepts a nonempty legacy short password without new-password policy', () => {
    expect(validateAuthInput('login', { username: 'quest_user', password: ' old ' })).toBeNull()
  })
  it('invalid login exposes only neutral copy', async () => {
    const f = fixture(); await f.start()
    f.sdk.signInWithPassword.mockResolvedValueOnce({ data: { user: null, session: null! }, error: { code: 'invalid_credentials', message: deriveSyntheticIdentifier('secret_user') } } as any)
    expect(await f.controller.perform('login', credentials)).toBe(false)
    expect(f.controller.getSnapshot().actionError).toBe('帳號或密碼不正確。'); expect(f.controller.getSnapshot().mode).toBe('landing')
    expect(JSON.stringify(f.controller.getSnapshot())).not.toContain('@jobquest.invalid')
  })
  it('same UID upgrade retains the product key and working cache', async () => {
    const f = fixture(guest()); await f.start()
    f.values.set('jobQuest.real104Session.v1', 'existing-public-jobs')
    const before = elements(view(f.controller)).find(el => el.props.className === 'auth-product')!
    expect(await f.controller.perform('upgrade', credentials)).toBe(true)
    const after = elements(view(f.controller)).find(el => el.props.className === 'auth-product')!
    expect(before.key).toBe(after.key); expect(after.key).toBe('owner-a'); expect(f.controller.getSnapshot().user?.id).toBe('owner-a')
    expect(f.controller.getSnapshot().mode).toBe('account'); expect(f.values.get('jobQuest.real104Session.v1')).toBe('existing-public-jobs')
    expect(f.sdk.updateUser.mock.calls.map(call => call[0])).toEqual([{ email: deriveSyntheticIdentifier('quest_user') }, { password: credentials.password }])
    expect(f.sdk.signUp).not.toHaveBeenCalled(); expect(f.sdk.signOut).not.toHaveBeenCalled(); expect(f.values.has(AUTH_UPGRADE_PENDING_KEY)).toBe(false)
  })
  it('duplicate username preserves Guest UID, product key and local jobs', async () => {
    const f = fixture(guest()); await f.start(); f.values.set('jobQuest.real104Session.v1', 'guest-jobs')
    f.sdk.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'email_exists', message: 'private provider error' } } as any)
    expect(await f.controller.perform('upgrade', credentials)).toBe(false)
    expect(f.controller.getSnapshot().mode).toBe('guest'); expect(f.controller.getSnapshot().user?.id).toBe('owner-a')
    expect(f.controller.getSnapshot().error).toBeNull(); expect(f.controller.getSnapshot().actionError).toContain('此帳號已被使用')
    expect(f.values.get('jobQuest.real104Session.v1')).toBe('guest-jobs'); expect(f.sdk.signInWithPassword).not.toHaveBeenCalled(); expect(f.sdk.signOut).not.toHaveBeenCalled()
  })
  it('guest existing-account login requires visible warning and explicit confirmation', async () => {
    const f = fixture(guest()); await f.start()
    expect(await f.controller.perform('login', credentials)).toBe(false); expect(f.sdk.signInWithPassword).not.toHaveBeenCalled()
    button(view(f.controller), '登入既有帳號').props.onClick()
    const warning = renderToStaticMarkup(view(f.controller))
    expect(warning).toContain('訪客資料不會合併'); expect(warning).toContain('留在訪客'); expect(warning).toContain('繼續登入')
    button(view(f.controller), '繼續登入').props.onClick()
    expect(renderToStaticMarkup(view(f.controller))).toContain('登入公會')
    f.values.set('jobQuest.real104Session.v1', 'guest-jobs')
    expect(await f.controller.perform('login', { ...credentials, confirmed: true })).toBe(true)
    expect(f.controller.getSnapshot().user?.id).toBe('existing-owner'); expect(f.values.has('jobQuest.real104Session.v1')).toBe(false)
    expect(elements(view(f.controller)).find(el => el.props.className === 'auth-product')!.key).toBe('existing-owner')
    expect(f.sdk.signOut).not.toHaveBeenCalled()
  })
  it('wrong-password switch preserves Guest and its cache', async () => {
    const f = fixture(guest()); await f.start(); f.values.set('jobQuest.real104Session.v1', 'guest-jobs')
    f.sdk.signInWithPassword.mockResolvedValueOnce({ data: { user: null, session: null! }, error: { code: 'invalid_credentials' } } as any)
    expect(await f.controller.perform('login', { ...credentials, confirmed: true })).toBe(false)
    expect(f.controller.getSnapshot().mode).toBe('guest'); expect(f.values.get('jobQuest.real104Session.v1')).toBe('guest-jobs')
  })
  it('permanent logout returns Landing without creating anonymous identity', async () => {
    const f = fixture(account()); await f.start(); f.values.set('jobQuest.real104Session.v1', 'old-jobs')
    expect(await f.controller.perform('logout')).toBe(true)
    expect(f.controller.getSnapshot().mode).toBe('landing'); expect(f.controller.getSnapshot().user).toBeNull()
    expect(f.sdk.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' }); expect(f.sdk.signInAnonymously).not.toHaveBeenCalled()
    expect(f.values.has('jobQuest.real104Session.v1')).toBe(false)
  })
  it('Guest exit warns, can be cancelled and needs explicit confirmation', async () => {
    const f = fixture(guest()); await f.start()
    button(view(f.controller), '離開訪客').props.onClick()
    expect(renderToStaticMarkup(view(f.controller))).toContain('可能無法再找回此訪客身份')
    expect(await f.controller.perform('logout')).toBe(false); expect(f.sdk.signOut).not.toHaveBeenCalled()
    button(view(f.controller), '繼續使用訪客').props.onClick()
    expect(f.controller.getSnapshot().mode).toBe('guest')
    expect(await f.controller.perform('logout', { confirmed: true })).toBe(true); expect(f.controller.getSnapshot().mode).toBe('landing')
  })
  it('suppresses pre-password USER_UPDATED success and restores partial-upgrade continuation after F5', async () => {
    const f = fixture(guest()); await f.start(); f.values.set('jobQuest.real104Session.v1', 'same-owner-jobs')
    const modes: string[] = []; f.controller.subscribe(() => modes.push(f.controller.getSnapshot().mode))
    f.sdk.updateUser.mockImplementationOnce(async ({ email }) => { f.set({ ...account(), email }, 'USER_UPDATED'); expect(f.controller.getSnapshot().mode).toBe('guest'); return { data: { user: f.current() }, error: null } })
    f.sdk.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'weak_password' } } as any)
    expect(await f.controller.perform('upgrade', credentials)).toBe(false)
    expect(modes).not.toContain('account'); expect(f.controller.getSnapshot().mode).toBe('pending')
    expect(f.values.get(AUTH_UPGRADE_PENDING_KEY)).not.toContain(credentials.password)
    const reloaded = createAuthIntegration({ session: authService, accounts: createUsernameAuthService(() => f.sdk as UsernameAuthPort), storage: createAuthIntegrationStorage(() => f.storage), defer: callback => { f.deferred.push(callback) } })
    reloaded.start(); await waitReady(reloaded)
    expect(reloaded.getSnapshot().mode).toBe('pending'); expect(reloaded.getSnapshot().user?.id).toBe('owner-a')
    expect(await reloaded.perform('upgrade', credentials)).toBe(true)
    expect(reloaded.getSnapshot().mode).toBe('account'); expect(f.values.has(AUTH_UPGRADE_PENDING_KEY)).toBe(false)
    expect(f.values.get('jobQuest.real104Session.v1')).toBe('same-owner-jobs')
  })
  it('ignores late startup responses after an Auth event', async () => {
    const f = fixture(guest()); let finish!: (reply: any) => void
    f.sdk.getSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    f.controller.start(); f.set(null, 'SIGNED_OUT')
    finish({ data: { session: null }, error: null }); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(f.controller.getSnapshot().mode).toBe('restoring')
    f.deferred.splice(0).forEach(fn => fn()); await waitReady(f.controller)
    expect(f.controller.getSnapshot().mode).toBe('landing')
  })
  it('hides old owner immediately on cross-tab identity change and retains same-owner refresh', async () => {
    const f = fixture(guest()); await f.start(); f.values.set('jobQuest.real104Session.v1', 'old-jobs')
    f.set(guest(), 'TOKEN_REFRESHED'); f.deferred.splice(0).forEach(fn => fn()); await waitReady(f.controller)
    expect(f.controller.getSnapshot().user?.id).toBe('owner-a'); expect(f.values.get('jobQuest.real104Session.v1')).toBe('old-jobs')
    f.set(account('owner-b')); expect(f.controller.getSnapshot().user).toBeNull(); expect(renderToStaticMarkup(view(f.controller))).not.toContain('JobQuest product')
    f.deferred.splice(0).forEach(fn => fn()); await waitReady(f.controller)
    expect(f.controller.getSnapshot().user?.id).toBe('owner-b'); expect(f.values.has('jobQuest.real104Session.v1')).toBe(false)
  })
  it('blocks read failures without exposing raw provider messages or creating Guest', async () => {
    const f = fixture(); f.sdk.getSession.mockRejectedValueOnce(new Error('token=private u1.secret@jobquest.invalid'))
    await f.start(); const html = renderToStaticMarkup(view(f.controller))
    expect(f.controller.getSnapshot().mode).toBe('blocked'); expect(html).not.toContain('private'); expect(f.sdk.signInAnonymously).not.toHaveBeenCalled()
  })
  it('never uses a mismatched pending marker to change another owner password', async () => {
    const f = fixture(account('owner-b')); f.values.set(AUTH_UPGRADE_PENDING_KEY, JSON.stringify({ version: 1, uid: 'owner-a', username: 'quest_user' }))
    await f.start(); expect(f.controller.getSnapshot().mode).toBe('account')
    expect(await f.controller.perform('upgrade', credentials)).toBe(false); expect(f.sdk.updateUser).not.toHaveBeenCalled()
  })
  it('blocks unsupported identity without exposing real or synthetic identifiers', async () => {
    const f = fixture({ ...account(), email: 'private@example.com' }); await f.start()
    const html = renderToStaticMarkup(view(f.controller)); expect(html).not.toContain('private@example.com'); expect(html).not.toContain('JobQuest product'); expect(f.controller.getSnapshot().mode).toBe('blocked')
  })
  it('serializes double submissions', async () => {
    const f = fixture(); await f.start()
    const first = f.controller.perform('register', credentials)
    expect(await f.controller.perform('register', credentials)).toBe(false); expect(await first).toBe(true); expect(f.sdk.signUp).toHaveBeenCalledOnce()
  })
})

describe('Account UI field privacy and form interactions', () => {
  it.each(['register', 'login', 'upgrade'] as const)('%s fields request only username and passwords', async kind => {
    const f = fixture(kind === 'upgrade' ? guest() : null); await f.start()
    const html = renderToStaticMarkup(createElement(AuthForm, { kind, controller: f.controller, busy: false, error: null, onClose: vi.fn(), onSuccess: vi.fn() }))
    expect(html).toContain('帳號'); expect(html).toContain('密碼')
    if (kind !== 'login') expect(html).toContain('確認密碼')
    for (const forbidden of ['Email', '電子郵件', '@jobquest.invalid', 'type="email"', 'phone', 'birthday', 'realName', 'address']) expect(html).not.toContain(forbidden)
  })
  it('form submits entered fields to controller and clears passwords on failure', async () => {
    const f = fixture(); await f.start(); const success = vi.fn()
    const props = { kind: 'register' as const, controller: f.controller, busy: false, error: null, onClose: vi.fn(), onSuccess: success }
    const render = () => { harness.cursor = 0; return AuthForm(props) }
    let tree = render()
    for (const [id, value] of [['auth-username', 'quest_user'], ['auth-password', 'short'], ['auth-confirmation', 'short']]) elements(tree).find(el => el.props.id === id)!.props.onChange({ target: { value } })
    tree = render(); await tree.props.onSubmit({ preventDefault: vi.fn() })
    tree = render()
    expect(elements(tree).find(el => el.props.id === 'auth-password')!.props.value).toBe('')
    expect(elements(tree).find(el => el.props.id === 'auth-confirmation')!.props.value).toBe('')
    expect(elements(tree).find(el => el.props.id === 'auth-username')!.props.value).toBe('quest_user')
    expect(f.sdk.signUp).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled()
  })
  it('same account renders canonical username only, never raw user or UID', async () => {
    const f = fixture(account()); await f.start(); const html = renderToStaticMarkup(view(f.controller))
    expect(html).toContain('quest_user'); expect(html).not.toContain('@jobquest.invalid'); expect(html).not.toContain('owner-a')
    expect(Object.keys(f.controller.getSnapshot().user!)).toEqual(['id', 'kind', 'username'])
  })
})

describe('Auth working storage ownership', () => {
  it('clears only unowned public working cache and leaves unrelated storage intact', () => {
    const f = fixture(); f.values.set('jobQuest.real104Session.v1', 'legacy'); f.values.set('unrelated', 'keep')
    const storage = createAuthIntegrationStorage(() => f.storage)
    expect(storage.prepareOwner('owner-a')).toBe(true); expect(f.values.has('jobQuest.real104Session.v1')).toBe(false)
    expect(f.values.get('unrelated')).toBe('keep'); expect(f.values.get(AUTH_WORKING_OWNER_KEY)).toBe('owner-a')
  })
  it('does not clear a same-owner F5 working snapshot', async () => {
    const f = fixture(guest()); f.values.set(AUTH_WORKING_OWNER_KEY, 'owner-a'); f.values.set('jobQuest.real104Session.v1', 'preserve')
    await f.start(); expect(f.values.get('jobQuest.real104Session.v1')).toBe('preserve')
  })
})
