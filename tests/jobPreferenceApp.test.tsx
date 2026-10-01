import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ResumeProfile, SearchPreference } from '../src/types'

const app = vi.hoisted(() => ({
  auth: { user: { id: 'owner-a' }, initializing: false, error: null, retry: vi.fn() },
  local: { resume: null as ResumeProfile | null, preference: { source: '104', keyword: '前端工程師', location: '台中市', sortBy: 'match-desc' } as SearchPreference, statuses: {}, actions: {}, confirmResume: vi.fn(), reset: vi.fn(), savePreference: vi.fn() },
  resumePersistence: { initializing: false, status: { ownerId: 'owner-a', phase: 'restored', operation: 'restore' }, confirm: vi.fn(), retry: vi.fn(), discard: vi.fn() },
  preferencePersistence: { initializing: false, status: { ownerId: 'owner-a', phase: 'restored', operation: 'restore', ready: true }, save: vi.fn(async (_value: SearchPreference) => {}), retry: vi.fn(), discard: vi.fn() },
  usePreferences: vi.fn(), board: null as null | { initialPreference: SearchPreference; onPreferenceChange: (value: SearchPreference) => Promise<void>; resume: ResumeProfile; localDemo: boolean },
  profile: null as null | { resume: ResumeProfile; onUpdate: (value: ResumeProfile) => Promise<void> },
}))
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => app.auth }))
vi.mock('../src/hooks/useLocalAcceptance', () => ({ useLocalAcceptance: () => app.local }))
vi.mock('../src/hooks/useConfirmedResumePersistence', () => ({ useConfirmedResumePersistence: () => app.resumePersistence }))
vi.mock('../src/hooks/useJobPreferencePersistence', () => ({ useJobPreferencePersistence: (...args: unknown[]) => { app.usePreferences(...args); return app.preferencePersistence } }))
vi.mock('../src/pages/BoardPage', () => ({ BoardPage: (props: NonNullable<typeof app.board>) => { app.board = props; return <div>Existing Board: {props.initialPreference.keyword} / {props.initialPreference.location}</div> } }))
vi.mock('../src/components/resume/ResumePanel', () => ({ ResumePanel: ({ resume }: { resume: ResumeProfile }) => { app.profile = { resume, onUpdate: app.resumePersistence.confirm }; return <div>Confirmed Resume: {resume.skills.join(',')}</div> } }))
import { DevelopmentApp as App } from '../src/App'

const profile = (): ResumeProfile => ({ id: 'synthetic', name: 'Synthetic Candidate', skills: ['Python'], education: { school: '', department: '', graduationStatus: '' }, workExperiences: [], projects: [], certifications: ['Synthetic Certificate'], careerDirections: [], level: 1, abilities: [], updatedAt: '2026-09-28T00:00:00Z' })
beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } })
  vi.clearAllMocks()
  app.local.resume = profile()
  app.local.preference = { source: '104', keyword: '前端工程師', location: '台中市', sortBy: 'match-desc' }
  app.preferencePersistence.initializing = false
  app.preferencePersistence.status = { ownerId: 'owner-a', phase: 'restored', operation: 'restore', ready: true }
  app.board = null; app.profile = null
})
afterEach(() => vi.unstubAllGlobals())
describe('preference application wiring without browser final acceptance', () => {
  it('reuses the existing Auth/local state and passes restored fields to the frozen Board', () => {
    const html = renderToStaticMarkup(<App />)
    expect(app.usePreferences).toHaveBeenCalledExactlyOnceWith(app.auth, app.local)
    expect(app.board?.initialPreference).toBe(app.local.preference)
    expect(html).toContain('前端工程師 / 台中市')
    expect(html).toContain('已還原雲端求職偏好')
    expect(app.preferencePersistence.save).not.toHaveBeenCalled()
  })
  it('routes the existing Board submit callback through preference persistence only', async () => {
    renderToStaticMarkup(<App />)
    const next: SearchPreference = { ...app.local.preference, keyword: 'Edited Keyword' }
    await app.board!.onPreferenceChange(next)
    expect(app.preferencePersistence.save).toHaveBeenCalledExactlyOnceWith(next)
    expect(app.local.savePreference).not.toHaveBeenCalled()
    expect(app.resumePersistence.confirm).not.toHaveBeenCalled()
  })
  it('does not turn a restored source into REAL 104 mode or change matching input', () => {
    renderToStaticMarkup(<App />)
    expect(app.board?.localDemo).toBe(true)
    expect(app.board?.resume).toBe(app.local.resume)
    expect(app.profile?.resume).toBe(app.local.resume)
    expect(app.local.statuses).toEqual({})
  })
  it('waits for initial preference restore before mounting the Board while keeping the confirmed resume', () => {
    app.preferencePersistence.initializing = true
    app.preferencePersistence.status.phase = 'restoring'; app.preferencePersistence.status.ready = false
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('正在還原求職偏好')
    expect(app.board).toBeNull()
    expect(app.profile?.resume).toBe(app.local.resume)
    expect(app.resumePersistence.confirm).not.toHaveBeenCalled()
  })
  it('keeps the existing Board/confirmed resume available during an explicit restore retry', () => {
    app.preferencePersistence.initializing = true
    app.preferencePersistence.status.phase = 'restoring'; app.preferencePersistence.status.ready = true
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('正在還原求職偏好')
    expect(app.board?.resume).toBe(app.local.resume)
    expect(app.resumePersistence.confirm).not.toHaveBeenCalled()
  })
  it('shows a safe save failure without changing local filters or the resume', () => {
    app.preferencePersistence.status.phase = 'error'; app.preferencePersistence.status.operation = 'save'
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('求職偏好保存失敗')
    expect(html).toContain('目前本機搜尋條件仍保留')
    expect(html).toContain('Confirmed Resume: Python')
    expect(app.board?.initialPreference.keyword).toBe('前端工程師')
  })
  it('reports restore failure with the existing default UI still available', () => {
    app.local.preference = { source: '104', keyword: '', location: '全部地區', sortBy: 'match-desc' }
    app.preferencePersistence.status.phase = 'error'; app.preferencePersistence.status.operation = 'restore'
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('求職偏好還原失敗')
    expect(app.board?.initialPreference).toEqual(app.local.preference)
    expect(app.preferencePersistence.save).not.toHaveBeenCalled()
  })
})
