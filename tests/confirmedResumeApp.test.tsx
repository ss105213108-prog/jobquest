import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ResumeProfile } from '../src/types'

const app = vi.hoisted(() => ({
  auth: { user: { id: 'owner-a' }, initializing: false, error: null as string | null, retry: vi.fn() },
  local: { resume: null as ResumeProfile | null, preference: { source: '104', keyword: '', location: '全部地區', sortBy: 'match-desc' }, statuses: {}, actions: {}, confirmResume: vi.fn(), reset: vi.fn(), savePreference: vi.fn() },
  persistence: { initializing: false, status: { ownerId: 'owner-a', phase: 'idle', operation: null as string | null }, confirm: vi.fn(async (_profile: ResumeProfile) => {}), retry: vi.fn(), discard: vi.fn() },
  onComplete: null as null | ((profile: ResumeProfile) => Promise<void>),
  useAuth: vi.fn(), usePersistence: vi.fn(),
}))
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => { app.useAuth(); return app.auth } }))
vi.mock('../src/hooks/useLocalAcceptance', () => ({ useLocalAcceptance: () => app.local }))
vi.mock('../src/hooks/useConfirmedResumePersistence', () => ({ useConfirmedResumePersistence: (...args: unknown[]) => { app.usePersistence(...args); return app.persistence } }))
vi.mock('../src/components/onboarding/ManualResumeEntry', () => ({ ManualResumeEntry: ({ onComplete }: { onComplete: (value: ResumeProfile) => Promise<void> }) => { app.onComplete = onComplete; return <div>Manual Resume Entry</div> } }))
vi.mock('../src/pages/BoardPage', () => ({ BoardPage: ({ resume }: { resume: ResumeProfile }) => <div>Confirmed Matching: {resume.skills.join(',')}</div> }))
vi.mock('../src/components/resume/ResumePanel', () => ({ ResumePanel: ({ resume }: { resume: ResumeProfile }) => <div>Confirmed Certificate: {resume.certifications?.join(',')}</div> }))
import App from '../src/App'

const profile = (): ResumeProfile => ({
  id: 'synthetic-profile', name: 'Synthetic Candidate', skills: ['Edited Skill'],
  education: { school: '', department: '', graduationStatus: '' }, workExperiences: [], projects: [],
  certifications: ['Edited Certificate'], careerDirections: [], level: 1, abilities: [], updatedAt: '2026-09-28T00:00:00Z',
})
beforeEach(() => {
  vi.clearAllMocks()
  app.auth.initializing = false; app.auth.error = null
  app.local.resume = null
  app.persistence.initializing = false
  app.persistence.status = { ownerId: 'owner-a', phase: 'idle', operation: null }
  app.onComplete = null
})

describe('App confirmed persistence integration, without browser acceptance', () => {
  it('reuses existing Auth and passes only its existing state into persistence', () => {
    renderToStaticMarkup(<App />)
    expect(app.useAuth).toHaveBeenCalledTimes(1)
    expect(app.usePersistence).toHaveBeenCalledExactlyOnceWith(app.auth, app.local)
    expect(app.persistence.confirm).not.toHaveBeenCalled()
  })
  it('hides creation while Auth/restore is initializing, without unlocking matching', () => {
    app.auth.initializing = true; app.persistence.initializing = true
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('正在初始化公會身份')
    expect(html).toContain('class="resume-upload-flow" hidden=""')
    expect(html).not.toContain('Manual Resume Entry')
    expect(app.onComplete).toBeNull()
    expect(html).not.toContain('Confirmed Matching')
  })
  it('waits for restore before showing creation for an authenticated user', () => {
    app.persistence.initializing = true
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('正在還原已確認履歷')
    expect(html).toContain('hidden=""')
  })
  it('routes explicit review confirmation through persistence, never the original raw mock', async () => {
    renderToStaticMarkup(<App />)
    const edited = profile()
    await app.onComplete!(edited)
    expect(app.persistence.confirm).toHaveBeenCalledExactlyOnceWith(edited)
    expect(app.local.confirmResume).not.toHaveBeenCalled()
  })
  it('uses the restored confirmed profile for matching and certificate display', () => {
    app.local.resume = profile(); app.persistence.status.phase = 'restored'
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('Confirmed Matching: Edited Skill')
    expect(html).toContain('Confirmed Certificate: Edited Certificate')
    expect(html).toContain('已還原雲端保存的確認履歷')
    expect(html).not.toContain('Manual Resume Entry')
    expect(app.persistence.confirm).not.toHaveBeenCalled()
  })
  it('keeps the confirmed matching screen when save fails', () => {
    app.local.resume = profile(); app.persistence.status.phase = 'error'; app.persistence.status.operation = 'save'
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('履歷雲端保存失敗')
    expect(html).toContain('Confirmed Matching: Edited Skill')
    expect(html).toContain('role="alert"')
  })
  it('offers the normal manual flow when restore fails, without inventing a resume', () => {
    app.persistence.status.phase = 'error'; app.persistence.status.operation = 'restore'
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('履歷還原失敗')
    expect(html).toContain('Manual Resume Entry')
    expect(html).not.toContain('class="resume-upload-flow" hidden=""')
    expect(html).not.toContain('Confirmed Matching')
  })
  it('does not expose raw Auth error details and accurately distinguishes local draft from saved confirmation', () => {
    app.auth.error = 'private auth error detail'
    const html = renderToStaticMarkup(<App />)
    expect(html).not.toContain('private auth error detail')
    expect(html).toContain('目前無法取得公會身份')
    expect(html).toContain('確認後的結構化履歷才保存至 Supabase')
    expect(html).toContain('草稿僅在本機供您編輯')
  })
  it('hides a previous profile during an authenticated owner transition', () => {
    app.local.resume = profile(); app.persistence.initializing = true
    const html = renderToStaticMarkup(<App />)
    expect(html).not.toContain('Confirmed Matching')
    expect(html).not.toContain('Confirmed Certificate')
  })
})
