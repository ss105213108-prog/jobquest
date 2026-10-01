import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import sampleJobs from '../experiments/104-browser-connector/sample-output.json'
import { normalize104CapturedJob } from '../src/integrations/job104/normalize104CapturedJob'
import type { JobWithMatch, ResumeProfile, SearchPreference } from '../src/types'

// Deterministic mount/re-render loop for real component effects; no browser or DB.
const harness = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as (() => void)[], changed: false, board: null as any,
  importJobs: null as null | (() => void),
  resume: null as ResumeProfile | null, preference: { source: '104', keyword: '前端工程師', location: '台中市', sortBy: 'match-desc' } as SearchPreference,
  same: (a: unknown[] | undefined, b: unknown[] | undefined) => !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])),
}))
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual,
    useState: (initial: any) => {
      const index = harness.cursor++
      if (!(index in harness.slots)) harness.slots[index] = typeof initial === 'function' ? initial() : initial
      return [harness.slots[index], (value: any) => { const next = typeof value === 'function' ? value(harness.slots[index]) : value; if (!Object.is(next, harness.slots[index])) { harness.slots[index] = next; harness.changed = true } }]
    },
    useRef: (initial: any) => { const index = harness.cursor++; return harness.slots[index] ??= { current: initial } },
    useCallback: (callback: any, deps: unknown[]) => { const index = harness.cursor++; const prior = harness.slots[index]; if (!prior || !harness.same(prior.deps, deps)) harness.slots[index] = { deps, callback }; return harness.slots[index].callback },
    useEffect: (effect: () => any, deps: unknown[]) => {
      const index = harness.cursor++, prior = harness.slots[index]
      if (!prior || !harness.same(prior.deps, deps)) {
        harness.effects.push(() => { prior?.cleanup?.(); const cleanup = effect(); harness.slots[index] = { deps, cleanup } })
      }
    },
  }
})
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner-a' }, initializing: false, error: null }) }))
vi.mock('../src/hooks/useLocalAcceptance', () => ({ useLocalAcceptance: () => ({ resume: harness.resume, preference: harness.preference, statuses: {}, actions: {} }) }))
vi.mock('../src/hooks/useConfirmedResumePersistence', () => ({ useConfirmedResumePersistence: () => ({ initializing: false, status: { phase: 'restored' } }) }))
vi.mock('../src/hooks/useJobPreferencePersistence', () => ({ useJobPreferencePersistence: () => ({ initializing: false, status: { phase: 'restored', ready: true }, save: vi.fn() }) }))
vi.mock('../src/hooks/useJobActions', () => ({ useJobActions: () => ({ initializing: false, state: { phase: 'restored' }, statuses: { '104:844qv': ['favorite'] }, actions: {} }) }))
vi.mock('../src/pages/BoardPage', () => ({ BoardPage: (props: any) => { harness.board = props; return <p>Board source: {props.localDemo ? 'DEMO_LOCAL' : 'REAL_104'}</p> } }))
vi.mock('../src/components/search/Job104ConnectorControls', async importOriginal => {
  const original = await importOriginal<typeof import('../src/components/search/Job104ConnectorControls')>()
  return { Job104ConnectorControls: (props: any) => { harness.importJobs = props.onImport; return original.Job104ConnectorControls(props) } }
})
vi.mock('../src/components/search/SearchPanel', () => ({ SearchPanel: () => <p>Existing Search</p> }))
vi.mock('../src/services/serviceSupport', async importOriginal => ({ ...await importOriginal<typeof import('../src/services/serviceSupport')>(), wait: async () => {} }))
import App, { DevelopmentApp } from '../src/App'
import { CollectionPage } from '../src/pages/CollectionPage'
import { matchingService } from '../src/services/matchingService'
import { REAL104_SESSION_KEY } from '../src/services/real104Session'
import { JOB104_PAYLOAD_TTL_MS } from '../src/integrations/job104/types'
import { job104Connector } from '../src/integrations/job104/connectorClient'
import { build104SearchUrl } from '../src/integrations/job104/build104SearchUrl'

const now = '2026-09-29T04:00:00.000Z'
const jobs = () => sampleJobs.slice(0, 1).map(job => normalize104CapturedJob(job, now))
const mount = async (render: () => React.ReactNode) => {
  let html = ''
  for (let attempt = 0; attempt < 10; attempt++) {
    harness.changed = false; harness.cursor = 0
    html = renderToStaticMarkup(render())
    const effects = harness.effects.splice(0)
    effects.forEach(effect => effect())
    for (let i = 0; i < 8; i++) await Promise.resolve()
    if (!harness.changed && !harness.effects.length) break
  }
  return html
}
const remount = () => {
  harness.slots.forEach(slot => slot?.cleanup?.())
  harness.slots = []; harness.effects = []; harness.cursor = 0; harness.board = null
}
beforeEach(() => {
  harness.slots = []; harness.effects = []; harness.cursor = 0; harness.board = null
  harness.importJobs = null
  harness.resume = { id: 'confirmed', name: 'Candidate', skills: ['React', 'JavaScript'], projects: [], workExperiences: [], education: { school: '', department: '', graduationStatus: '' }, careerDirections: [], updatedAt: now, level: 1, abilities: [] }
  vi.useFakeTimers(); vi.setSystemTime(new Date(now))
  vi.stubGlobal('window', { location: { search: '' }, setTimeout: globalThis.setTimeout })
  const values = new Map<string, string>()
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
  sessionStorage.setItem('jobQuest.real104Session.v1', JSON.stringify({ version: 1, mode: 'REAL_104', snapshot: { jobs: jobs(), keyword: '前端工程師', location: '台中市', capturedAt: now, importedAt: now } }))
})
import { afterEach } from 'vitest'
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('user-reported REAL 104 session symptoms', () => {
  it('keeps REAL 104 selected after a fresh App mount with a valid working-session snapshot', async () => {
    const html = await mount(() => <App />)
    expect(html).toContain('Board source: REAL_104')
    expect(harness.board.realSession.matches.map((item: JobWithMatch) => item.job.id)).toEqual(['104:844qv'])
  })
  it('renders the saved REAL job card when canonical action and available normalized metadata join', async () => {
    const matches: JobWithMatch[] = await matchingService.matchJobs(harness.resume, jobs())
    const props = { localDemo: false, mode: 'favorites' as const, source: '104' as const, resume: harness.resume!, statuses: { '104:844qv': ['favorite' as const] }, actions: { toggleFavorite: vi.fn(), markViewed: vi.fn(), markApplied: vi.fn(), markRejected: vi.fn() }, realSession: { status: 'ready', matches, matching: false, error: null } }
    const html = await mount(() => <CollectionPage {...props} />)
    expect(html).toContain(sampleJobs[0].title)
    expect(html).toContain('★ 已收藏')
    expect(html).toContain('https://www.104.com.tw/job/844qv')
  })
  it('recomputes matching from the restored confirmed profile and normalized jobs after F5', async () => {
    const matching = vi.spyOn(matchingService, 'matchJobs')
    await mount(() => <App />)
    const first = harness.board.realSession.matches
    expect(matching).toHaveBeenCalledWith(harness.resume, jobs())
    remount()
    await mount(() => <App />)
    expect(harness.board.realSession.matches).toEqual(first)
    expect(matching).toHaveBeenCalledTimes(2)
    expect(sessionStorage.getItem(REAL104_SESSION_KEY)).not.toContain('matchScore')
  })
  it('recomputes when the confirmed profile changes instead of using a cached score', async () => {
    const matching = vi.spyOn(matchingService, 'matchJobs')
    await mount(() => <App />)
    harness.resume = { ...harness.resume!, skills: ['Python'] }
    await mount(() => <App />)
    expect(matching).toHaveBeenLastCalledWith(harness.resume, jobs())
    expect(harness.board.realSession.matches[0].match.matchedSkills).not.toContain('React')
  })
  it('keeps REAL with an explicit re-import state after TTL, including another F5', async () => {
    await mount(() => <App />)
    await vi.advanceTimersByTimeAsync(JOB104_PAYLOAD_TTL_MS + 1)
    await mount(() => <App />)
    expect(harness.board.localDemo).toBe(false)
    expect(harness.board.realSession).toMatchObject({ status: 'expired', matches: [], matching: false })
    remount()
    await mount(() => <App />)
    expect(harness.board.localDemo).toBe(false)
    expect(harness.board.realSession.status).toBe('expired')
  })
  it('does not match corrupt data or fall back to Demo', async () => {
    sessionStorage.setItem(REAL104_SESSION_KEY, '{bad JSON')
    const matching = vi.spyOn(matchingService, 'matchJobs')
    const html = await mount(() => <App />)
    expect(html).toContain('Board source: REAL_104')
    expect(harness.board.realSession).toMatchObject({ status: 'corrupt', matches: [], matching: false })
    expect(matching).not.toHaveBeenCalled()
  })
  it('preserves an explicit Demo selection without presenting REAL cards as Demo', async () => {
    const cached = JSON.parse(sessionStorage.getItem(REAL104_SESSION_KEY)!)
    cached.mode = 'DEMO_LOCAL'
    sessionStorage.setItem(REAL104_SESSION_KEY, JSON.stringify(cached))
    const matching = vi.spyOn(matchingService, 'matchJobs')
    await mount(() => <DevelopmentApp />)
    expect(harness.board.localDemo).toBe(true)
    expect(harness.board.realSession.matches).toEqual([])
    expect(matching).not.toHaveBeenCalled()
  })
  it('persists the normalized import handoff for a new mount without storing Matching results', async () => {
    sessionStorage.setItem(REAL104_SESSION_KEY, JSON.stringify({ version: 1, mode: 'REAL_104', snapshot: null }))
    await mount(() => <App />)
    const imported = await matchingService.matchJobs(harness.resume, jobs())
    harness.board.onRealImport(imported, harness.preference, now)
    await mount(() => <App />)
    expect(harness.board.realSession.matches).toEqual(imported)
    remount()
    await mount(() => <App />)
    expect(harness.board.realSession.matches).toEqual(imported)
    expect(sessionStorage.getItem(REAL104_SESSION_KEY)).not.toContain('matchScore')
  })
  it('uses the same App import snapshot on favorites immediately and after F5', async () => {
    sessionStorage.setItem(REAL104_SESSION_KEY, JSON.stringify({ version: 1, mode: 'REAL_104', snapshot: null }))
    await mount(() => <App />)
    const imported = await matchingService.matchJobs(harness.resume, jobs())
    harness.board.onRealImport(imported, harness.preference, now)
    harness.slots[0] = 'favorites'
    const saved = await mount(() => <App />)
    expect(saved).toContain('★ 已收藏')
    expect(saved).toContain('https://www.104.com.tw/job/844qv')
    remount()
    await mount(() => <App />)
    harness.slots[0] = 'favorites'
    expect(await mount(() => <App />)).toContain('https://www.104.com.tw/job/844qv')
  })
  it('does not allow an old import callback to override a newer explicit Demo selection', async () => {
    await mount(() => <DevelopmentApp />)
    const oldImport = harness.board.onRealImport
    harness.board.realSession.selectMode('DEMO_LOCAL')
    await mount(() => <DevelopmentApp />)
    oldImport(await matchingService.matchJobs(harness.resume, jobs()), harness.preference, now)
    await mount(() => <DevelopmentApp />)
    expect(harness.board.localDemo).toBe(true)
    expect(JSON.parse(sessionStorage.getItem(REAL104_SESSION_KEY)!).mode).toBe('DEMO_LOCAL')
    remount()
    expect(await mount(() => <DevelopmentApp />)).toContain('Board source: DEMO_LOCAL')
  })
  it('rejects an import tied to a previous confirmed profile', async () => {
    await mount(() => <App />)
    const oldImport = harness.board.onRealImport
    const first = await matchingService.matchJobs(harness.resume, jobs())
    harness.resume = { ...harness.resume!, skills: ['Python'] }
    await mount(() => <App />)
    oldImport(first, harness.preference, now)
    await mount(() => <App />)
    expect(harness.board.realSession.matches[0].match.matchedSkills).not.toContain('React')
  })
  it('keeps imported jobs usable while reporting that browser storage failed', async () => {
    await mount(() => <App />)
    vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    harness.board.onRealImport(await matchingService.matchJobs(harness.resume, jobs()), harness.preference, now)
    const html = await mount(() => <App />)
    expect(harness.board.realSession.matches).toHaveLength(1)
    expect(html).toContain('目前無法保存瀏覽器職缺工作清單')
  })
  it('shows a usable matching failure and retries from the same normalized snapshot', async () => {
    const matching = vi.spyOn(matchingService, 'matchJobs').mockRejectedValueOnce(new Error('private detail'))
    await mount(() => <App />)
    expect(harness.board.realSession.error).toBe('目前無法完成職缺匹配，請稍後再試。')
    expect(harness.board.realSession.matches).toEqual([])
    harness.board.realSession.retryMatching()
    await mount(() => <App />)
    expect(harness.board.realSession.error).toBeNull()
    expect(harness.board.realSession.matches).toHaveLength(1)
    expect(matching).toHaveBeenCalledTimes(2)
  })
  it.each(['favorites', 'history'] as const)('joins different job actions by canonical ID on the %s page', async mode => {
    const allJobs = sampleJobs.slice(0, 3).map(job => normalize104CapturedJob(job, now))
    const matches = await matchingService.matchJobs(harness.resume, allJobs)
    const statuses = { [allJobs[0].id]: ['favorite' as const], [allJobs[1].id]: ['applied' as const], [allJobs[2].id]: ['rejected' as const], '104-01': ['favorite' as const] }
    const props = { localDemo: false, mode, source: '104' as const, resume: harness.resume!, statuses, actions: { toggleFavorite: vi.fn(), markViewed: vi.fn(), markApplied: vi.fn(), markRejected: vi.fn() }, realSession: { status: 'ready' as const, matches, matching: false, error: null } }
    const html = await mount(() => <CollectionPage {...props} />)
    for (const [i, job] of allJobs.entries()) expect(html.includes(`href="${job.url}"`)).toBe(mode === 'favorites' ? i === 0 : i !== 0)
    expect(html).not.toContain('（模擬）')
  })
  it('does not expose expired job content in favorites', async () => {
    const props = { localDemo: false, mode: 'favorites' as const, source: '104' as const, resume: harness.resume!, statuses: { '104:844qv': ['favorite' as const] }, actions: { toggleFavorite: vi.fn(), markViewed: vi.fn(), markApplied: vi.fn(), markRejected: vi.fn() }, realSession: { status: 'expired' as const, matches: [], matching: false, error: null } }
    const html = await mount(() => <CollectionPage {...props} />)
    expect(html).toContain('104 職缺資料已過期，請重新匯入')
    expect(html).not.toContain('https://www.104.com.tw/job/844qv')
  })
})

describe('actual Board import-to-session handoff', () => {
  const ready = () => ({ status: 'ready' as const, payload: { version: 1 as const, source: '104' as const, capturedAt: now, sourceUrl: build104SearchUrl('前端工程師', '台中市'), jobs: structuredClone(sampleJobs.slice(0, 1)) } })
  const props = () => ({ source: '104' as const, localDemo: false, resume: harness.resume!, initialPreference: harness.preference, onPreferenceChange: vi.fn(async () => {}), statuses: {}, actions: { toggleFavorite: vi.fn(), markViewed: vi.fn(), markApplied: vi.fn(), markRejected: vi.fn() } })
  it('hands normalized matched jobs and capture time to App only after a valid explicit import', async () => {
    const { BoardPage } = await vi.importActual<typeof import('../src/pages/BoardPage')>('../src/pages/BoardPage')
    vi.spyOn(job104Connector, 'status').mockResolvedValue(ready())
    vi.spyOn(job104Connector, 'getLatest').mockResolvedValue(ready())
    const accept = vi.fn(), persist = vi.fn(async () => {}), inputs = { ...props(), onPreferenceChange: persist, onRealImport: accept }
    await mount(() => <BoardPage {...inputs} />)
    harness.importJobs!()
    for (let i = 0; i < 16; i++) await Promise.resolve()
    const [matched, preference, capturedAt] = accept.mock.calls[0]
    expect(matched[0].job).toEqual(jobs()[0])
    expect(matched[0].job.url).toBe('https://www.104.com.tw/job/844qv')
    expect(preference).toBe(harness.preference)
    expect(capturedAt).toBe(now)
    expect(persist).not.toHaveBeenCalled()
  })
  it('retains the canonical capture instant when the accepted payload uses a timezone offset', async () => {
    const { BoardPage } = await vi.importActual<typeof import('../src/pages/BoardPage')>('../src/pages/BoardPage')
    const response = ready()
    response.payload.capturedAt = '2026-09-29T12:00:00+08:00'
    vi.spyOn(job104Connector, 'status').mockResolvedValue(response)
    vi.spyOn(job104Connector, 'getLatest').mockResolvedValue(response)
    const accept = vi.fn(), inputs = { ...props(), onRealImport: accept }
    await mount(() => <BoardPage {...inputs} />)
    harness.importJobs!()
    for (let i = 0; i < 16; i++) await Promise.resolve()
    expect(accept.mock.calls[0][2]).toBe(now)
    expect(accept.mock.calls[0][0][0].job.collectedAt).toBe(now)
  })
  it('cannot hand off a late Connector response after leaving the Board', async () => {
    const { BoardPage } = await vi.importActual<typeof import('../src/pages/BoardPage')>('../src/pages/BoardPage')
    let resolve!: (value: ReturnType<typeof ready>) => void
    const response = new Promise<ReturnType<typeof ready>>(yes => { resolve = yes })
    vi.spyOn(job104Connector, 'status').mockResolvedValue(ready())
    vi.spyOn(job104Connector, 'getLatest').mockReturnValue(response)
    const accept = vi.fn(), inputs = { ...props(), onRealImport: accept }
    await mount(() => <BoardPage {...inputs} />)
    harness.importJobs!()
    remount()
    resolve(ready())
    for (let i = 0; i < 16; i++) await Promise.resolve()
    expect(accept).not.toHaveBeenCalled()
  })
  it('cannot hand off an old matching response after the confirmed profile changes', async () => {
    const { BoardPage } = await vi.importActual<typeof import('../src/pages/BoardPage')>('../src/pages/BoardPage')
    const previous = await matchingService.matchJobs(harness.resume, jobs())
    let resolve!: (value: JobWithMatch[]) => void
    const matching = new Promise<JobWithMatch[]>(yes => { resolve = yes })
    vi.spyOn(job104Connector, 'status').mockResolvedValue(ready())
    vi.spyOn(job104Connector, 'getLatest').mockResolvedValue(ready())
    vi.spyOn(matchingService, 'matchJobs').mockReturnValueOnce(matching)
    const accept = vi.fn(), inputs = { ...props(), onRealImport: accept }
    await mount(() => <BoardPage {...inputs} />)
    harness.importJobs!()
    for (let i = 0; i < 8; i++) await Promise.resolve()
    inputs.resume = { ...inputs.resume, skills: ['Python'] }
    await mount(() => <BoardPage {...inputs} />)
    resolve(previous)
    for (let i = 0; i < 16; i++) await Promise.resolve()
    expect(accept).not.toHaveBeenCalled()
  })
})
