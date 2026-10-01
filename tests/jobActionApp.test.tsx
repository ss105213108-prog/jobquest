import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { GuildPage, JobActionHandlers, ResumeProfile, SearchPreference, StatusMap } from '../src/types'

const app = vi.hoisted(() => ({
  mode: 'DEMO_LOCAL' as 'REAL_104' | 'DEMO_LOCAL', page: 'board' as GuildPage,
  auth: { user: { id: 'owner-a' }, initializing: false, error: null, retry: vi.fn() },
  local: { resume: null as ResumeProfile | null, preference: { source: '104', keyword: '前端工程師', location: '台中市', sortBy: 'match-desc' } as SearchPreference, statuses: {}, actions: {}, confirmResume: vi.fn(), savePreference: vi.fn(), reset: vi.fn() },
  resumePersistence: { initializing: false, status: { phase: 'restored', operation: 'restore' }, confirm: vi.fn(), retry: vi.fn(), discard: vi.fn() },
  preferences: { initializing: false, status: { phase: 'restored', ready: true }, save: vi.fn(), retry: vi.fn(), discard: vi.fn() },
  jobActions: { initializing: false, state: { phase: 'restored', operation: null as string | null }, statuses: {} as StatusMap, actions: { toggleFavorite: vi.fn(), markViewed: vi.fn(), markApplied: vi.fn(), markRejected: vi.fn() }, retry: vi.fn(), discard: vi.fn() },
  useActions: vi.fn(), board: null as null | { statuses: StatusMap; actions: JobActionHandlers; initialPreference: SearchPreference; resume: ResumeProfile; localDemo: boolean },
  collection: null as null | { statuses: StatusMap; actions: JobActionHandlers }, retry: null as null | (() => void),
}))
vi.mock('react', async importOriginal => {
  const original = await importOriginal<typeof import('react')>()
  return { ...original, useState: (initial: unknown) => initial === 'DEMO_LOCAL' ? [app.mode, vi.fn()] : initial === 'board' ? [app.page, vi.fn()] : original.useState(initial) }
})
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => app.auth }))
vi.mock('../src/hooks/useLocalAcceptance', () => ({ useLocalAcceptance: () => app.local }))
vi.mock('../src/hooks/useConfirmedResumePersistence', () => ({ useConfirmedResumePersistence: () => app.resumePersistence }))
vi.mock('../src/hooks/useJobPreferencePersistence', () => ({ useJobPreferencePersistence: () => app.preferences }))
vi.mock('../src/hooks/useJobActions', () => ({ useJobActions: (...args: unknown[]) => { app.useActions(...args); return app.jobActions } }))
vi.mock('../src/pages/BoardPage', () => ({ BoardPage: (props: NonNullable<typeof app.board>) => { app.board = props; return <div>Frozen Board</div> } }))
vi.mock('../src/pages/CollectionPage', () => ({ CollectionPage: (props: NonNullable<typeof app.collection>) => { app.collection = props; return <div>Frozen Collection</div> } }))
vi.mock('../src/components/ui/AsyncState', () => ({ LoadingState: ({ message }: { message: string }) => <p>{message}</p>, ErrorState: ({ message, onRetry }: { message: string; onRetry: () => void }) => { app.retry = onRetry; return <p role="alert">{message}</p> } }))
import { DevelopmentApp as App } from '../src/App'

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } })
  vi.clearAllMocks()
  app.mode = 'DEMO_LOCAL'; app.page = 'board'
  app.board = null; app.collection = null; app.retry = null
  app.local.resume = { id: 'synthetic', name: 'Candidate', skills: ['React'], projects: [], workExperiences: [], education: { school: '', department: '', graduationStatus: '' }, certifications: ['Certificate'], careerDirections: [], level: 1, abilities: [], updatedAt: '2026-09-29' }
  app.jobActions.initializing = false
  app.jobActions.state = { phase: 'restored', operation: null }
  app.jobActions.statuses = { '104:01': ['applied'], '104-01': ['favorite'], '1111-01': ['rejected'] }
})
afterEach(() => vi.unstubAllGlobals())
describe('job action App wiring, development verification only', () => {
  it('uses the same Auth and routes Demo actions through persistence without changing resume/preferences', async () => {
    const html = renderToStaticMarkup(<App />)
    expect(app.useActions).toHaveBeenCalledExactlyOnceWith(app.auth)
    expect(app.board?.statuses).toEqual({ '104-01': ['favorite'] })
    expect(app.board?.actions).toBe(app.jobActions.actions)
    expect(app.board?.resume).toBe(app.local.resume)
    expect(app.board?.initialPreference).toBe(app.local.preference)
    await app.board!.actions.toggleFavorite('104-01')
    expect(app.jobActions.actions.toggleFavorite).toHaveBeenCalledExactlyOnceWith('104-01')
    expect(app.resumePersistence.confirm).not.toHaveBeenCalled()
    expect(app.preferences.save).not.toHaveBeenCalled()
    expect(html).toContain('已還原雲端職缺操作')
  })
  it('passes only REAL canonical statuses to the unchanged Board in REAL mode', () => {
    app.mode = 'REAL_104'
    renderToStaticMarkup(<App />)
    expect(app.board?.localDemo).toBe(false)
    expect(app.board?.statuses).toEqual({ '104:01': ['applied'] })
    expect(app.jobActions.actions.markViewed).not.toHaveBeenCalled()
  })
  it.each(['favorites', 'history'] as const)('uses the same persisted action state for %s without storing job records', page => {
    app.page = page
    renderToStaticMarkup(<App />)
    expect(app.collection?.statuses).toEqual({ '104-01': ['favorite'] })
    expect(app.collection?.actions).toBe(app.jobActions.actions)
  })
  it('shows loading without triggering a source switch, import or action save', () => {
    app.jobActions.initializing = true
    expect(renderToStaticMarkup(<App />)).toContain('正在還原職缺操作')
    expect(app.board?.localDemo).toBe(true)
    for (const action of Object.values(app.jobActions.actions)) expect(action).not.toHaveBeenCalled()
  })
  it('keeps the Board and local markers on save failure and retries through application state', () => {
    app.jobActions.state = { phase: 'error', operation: 'save' }
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('職缺操作保存失敗')
    expect(html).toContain('目前本機標記仍保留')
    expect(app.board?.statuses).toEqual({ '104-01': ['favorite'] })
    app.retry!()
    expect(app.jobActions.retry).toHaveBeenCalledTimes(1)
  })
  it('leaves existing Board available on restore failure and reports only a safe error', () => {
    app.jobActions.state = { phase: 'error', operation: 'restore' }
    expect(renderToStaticMarkup(<App />)).toContain('職缺操作還原失敗')
    expect(app.board?.resume).toBe(app.local.resume)
    expect(app.board?.initialPreference).toBe(app.local.preference)
  })
  it('reports the saved state so the user can wait before F5', () => {
    app.jobActions.state.phase = 'saved'
    expect(renderToStaticMarkup(<App />)).toContain('職缺操作已保存至雲端')
  })
})
