import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { AuthContext } from '../../hooks/useAuth'
import { createProductionAuthIntegration, guestExitWarning, guestSwitchWarning, saveExitWarning, type AuthIntegration, type AuthSnapshot } from '../../services/authIntegration'
import './auth.css'

type FormKind = 'login' | 'register' | 'upgrade'
type Panel = FormKind | 'switch-warning' | 'exit-warning' | null
const titles: Record<FormKind, string> = { login: '登入公會', register: '建立公會帳號', upgrade: '建立帳號以保留目前資料' }

export function AuthForm({ kind, controller, busy, error, onClose, onSuccess, switching = false, pendingUsername }: {
  kind: FormKind; controller: AuthIntegration; busy: boolean; error: string | null; onClose(): void; onSuccess(): void; switching?: boolean; pendingUsername?: string
}) {
  const [username, setUsername] = useState(pendingUsername ?? '')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    // Clear both password fields immediately; the operation alone retains its request value.
    const input = { username, password, confirmation, confirmed: switching }
    setPassword(''); setConfirmation('')
    if (await controller.perform(kind, input)) onSuccess()
  }
  return <form className="auth-form" onSubmit={submit} noValidate aria-labelledby="auth-form-title">
    <h1 id="auth-form-title">{titles[kind]}</h1>
    <p>使用代稱加入公會，帳號不分大小寫。</p>
    <fieldset disabled={busy}>
      <label htmlFor="auth-username">帳號</label>
      <input id="auth-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} readOnly={!!pendingUsername} onChange={event => setUsername(event.target.value)} aria-describedby="auth-username-help" />
      <small id="auth-username-help">3–32 個字元，以英文字母開頭，可使用英文字母、數字與底線。</small>
      <label htmlFor="auth-password">密碼</label>
      <input id="auth-password" name="password" type="password" autoComplete={kind === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} />
      {kind !== 'login' && <><label htmlFor="auth-confirmation">確認密碼</label>
        <input id="auth-confirmation" name="confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} />
        <small>密碼至少 8 個字元。本版未提供密碼找回功能，請妥善保存帳號與密碼。</small></>}
      {switching && <p className="auth-caution">{guestSwitchWarning} {saveExitWarning}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="auth-actions"><button type="submit" className="auth-primary">{busy ? '處理中…' : kind === 'login' ? '登入' : '建立帳號'}</button>
        <button type="button" onClick={onClose}>返回</button></div>
    </fieldset>
  </form>
}

function Brand() { return <div className="auth-brand"><span className="guild-seal">JQ</span><div><strong>Job Quest Guild</strong><small>求職冒險者公會</small></div></div> }

export function AuthGatewayView({ state, controller, children }: { state: AuthSnapshot; controller: AuthIntegration; children: ReactNode }) {
  const [panel, setPanel] = useState<Panel>(null)
  // Close an old owner's form and remove its credentials on identity change.
  useEffect(() => { setPanel(null) }, [state.user?.id])
  const select = (next: Panel) => { controller.clearActionError(); setPanel(next) }
  const accountReady = !!state.user && ['guest', 'account', 'pending'].includes(state.mode)
  const completed = () => setPanel(null)
  const form = (kind: FormKind) => <AuthForm key={`${state.user?.id ?? 'landing'}:${kind}`} kind={kind} controller={controller} busy={state.busy} error={state.actionError}
    onClose={() => select(null)} onSuccess={completed} switching={kind === 'login' && !!state.user}
    pendingUsername={state.mode === 'pending' ? state.user?.username : undefined} />
  if (state.mode === 'restoring') return <main className="auth-shell"><section className="auth-card"><Brand /><p role="status">正在還原公會登入狀態…</p></section></main>
  if (state.mode === 'blocked') return <main className="auth-shell"><section className="auth-card"><Brand /><h1>暫時無法進入公會</h1><p role="alert">{state.error}</p>
    <div className="auth-actions"><button onClick={() => controller.retry()} disabled={state.busy}>重試</button><button onClick={() => select('exit-warning')} disabled={state.busy}>登出</button></div>
    {panel === 'exit-warning' && <section role="dialog" aria-modal="true" aria-label="確認登出"><p>{guestExitWarning} {saveExitWarning}</p><button disabled={state.busy} onClick={() => { void controller.perform('logout', { confirmed: true }) }}>確認離開</button><button disabled={state.busy} onClick={() => select(null)}>取消</button></section>}
    {state.actionError && <p role="alert">{state.actionError}</p>}</section></main>
  if (!accountReady) return <main className="auth-shell"><section className="auth-card"><Brand />
    {panel === 'login' || panel === 'register' ? form(panel) : <><span className="auth-eyebrow">冒險從這裡開始</span><h1>歡迎來到求職公會</h1><p>整理履歷，尋找適合你的下一段冒險。</p>
      <div className="auth-choices"><button className="auth-primary" disabled={state.busy} onClick={() => select('login')}>登入</button><button disabled={state.busy} onClick={() => select('register')}>註冊</button><button disabled={state.busy} onClick={() => { void controller.perform('guest') }}>{state.busy ? '處理中…' : '先以訪客試用'}</button></div>
      <small>訪客資料綁定目前登入狀態；離開或清除瀏覽器資料後，可能無法找回。</small>
      {state.actionError && <p className="auth-error" role="alert">{state.actionError}</p>}</>}
    {state.notice && <p role="status">{state.notice}</p>}
  </section></main>
  const guest = state.user!.kind === 'guest'
  return <AuthContext.Provider value={{ ...state, authenticated: true, retry: controller.retry, controller }}>
    <div className="auth-account-bar" aria-label="公會帳號">
      <span>{state.mode === 'pending' ? '帳號建立待完成' : guest ? '訪客試用中' : `帳號：${state.user!.username}`}</span>
      <div>{guest || state.mode === 'pending' ? <><button disabled={state.busy} onClick={() => select('upgrade')}>{state.mode === 'pending' ? '完成帳號設定' : '建立帳號以保留目前資料'}</button>
        {state.mode !== 'pending' && <button disabled={state.busy} onClick={() => select('switch-warning')}>登入既有帳號</button>}</> : null}
        <button disabled={state.busy} onClick={() => select('exit-warning')}>{guest ? '離開訪客' : '登出'}</button></div>
    </div>
    {state.mode === 'pending' && <p className="auth-status" role="status">帳號建立尚未確認完成，請保留目前登入狀態並完成密碼設定。</p>}
    {state.notice && <p className="auth-status" role="status">{state.notice}</p>}
    {!panel && state.actionError && <p className="auth-status auth-error" role="alert">{state.actionError}</p>}
    {/* Stable key preserves all product hooks on same-UID upgrade; new UID remounts them. */}
    <div inert={state.busy || !!panel} aria-busy={state.busy} className="auth-product" key={state.user!.id}>{children}</div>
    {panel && <div className="auth-overlay"><section className="auth-card" role="dialog" aria-modal="true" aria-label={panel === 'switch-warning' ? '確認切換帳號' : panel === 'exit-warning' ? '確認離開' : titles[panel]}>
      {panel === 'switch-warning' ? <><h1>登入既有帳號</h1><p>{guestSwitchWarning}</p><p>{saveExitWarning}</p><div className="auth-actions"><button disabled={state.busy} onClick={() => select('login')}>繼續登入</button><button disabled={state.busy} onClick={() => select(null)}>留在訪客</button></div></>
        : panel === 'exit-warning' ? <><h1>{guest ? '離開訪客' : '登出公會'}</h1><p>{guest || state.mode === 'pending' ? guestExitWarning : '登出後將返回登入入口。'}</p><p>{saveExitWarning}</p>
          {state.actionError && <p role="alert">{state.actionError}</p>}<div className="auth-actions"><button disabled={state.busy} onClick={async () => { if (await controller.perform('logout', { confirmed: true })) completed() }}>確認離開</button><button disabled={state.busy} onClick={() => select(null)}>{guest ? '繼續使用訪客' : '取消'}</button></div></> : form(panel)}
    </section></div>}
  </AuthContext.Provider>
}

export function AuthGateway({ children }: { children: ReactNode }) {
  const [controller] = useState(createProductionAuthIntegration)
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  useEffect(() => controller.start(), [controller])
  return <AuthGatewayView state={state} controller={controller}>{children}</AuthGatewayView>
}
