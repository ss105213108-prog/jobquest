import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import sampleJobs from '../experiments/104-browser-connector/sample-output.json'
import { normalize104CapturedJob } from '../src/integrations/job104/normalize104CapturedJob'
import { serializeJobSnapshot } from '../src/services/jobSnapshot'
import type { Job, JobWithMatch, ResumeProfile, SearchPreference } from '../src/types'

// Actual App/action hook/controller/repository/Collection/cards/session/matching,
// with synthetic DB transport and a deterministic component effect loop.
const harness = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as (() => void)[], changed: false,
  board: null as any, collection: null as any, action: null as any, owner: 'owner-a',
  rows: new Map<string, any>(), writes: [] as any[], fail: false,
  resume: null as ResumeProfile | null, preference: { source: '104', keyword: '前端工程師', location: '台中市', sortBy: 'match-desc' } as SearchPreference,
  same: (a: unknown[] | undefined, b: unknown[] | undefined) => !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])),
}))
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>()
  return { ...actual,
    useState: (initial: any) => {
      const index = harness.cursor++
      if (!(index in harness.slots)) harness.slots[index] = typeof initial === 'function' ? initial() : initial
      return [harness.slots[index], (value: any) => { const next = typeof value === 'function' ? value(harness.slots[index]) : value; if (!Object.is(next, harness.slots[index])) { harness.slots[index] = next; harness.changed = true } }]
    },
    useRef: (initial: any) => { const index = harness.cursor++; return harness.slots[index] ??= { current: initial } },
    useCallback: (callback: any, deps: unknown[]) => { const index = harness.cursor++, prior = harness.slots[index]; if (!prior || !harness.same(prior.deps, deps)) harness.slots[index] = { deps, callback }; return harness.slots[index].callback },
    useEffect: (effect: () => any, deps: unknown[]) => {
      const index = harness.cursor++, prior = harness.slots[index]
      if (!prior || !harness.same(prior.deps, deps)) harness.effects.push(() => { prior?.cleanup?.(); harness.slots[index] = { deps, cleanup: effect() } })
    },
  }
})
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: harness.owner }, initializing: false, error: null }) }))
vi.mock('../src/hooks/useLocalAcceptance', () => ({ useLocalAcceptance: () => ({ resume: harness.resume, preference: harness.preference, statuses: {}, actions: {} }) }))
vi.mock('../src/hooks/useConfirmedResumePersistence', () => ({ useConfirmedResumePersistence: () => ({ initializing: false, status: { phase: 'restored' } }) }))
vi.mock('../src/hooks/useJobPreferencePersistence', () => ({ useJobPreferencePersistence: () => ({ initializing: false, status: { phase: 'restored', ready: true }, save: vi.fn() }) }))
vi.mock('../src/hooks/useJobActions', async original => {
  const actual = await original<typeof import('../src/hooks/useJobActions')>()
  return { useJobActions: (...args: Parameters<typeof actual.useJobActions>) => { harness.action = actual.useJobActions(...args); return harness.action } }
})
vi.mock('../src/pages/BoardPage', () => ({ BoardPage: (props: any) => { harness.board = props; return <p>Board source: {props.localDemo ? 'DEMO_LOCAL' : 'REAL_104'}</p> } }))
vi.mock('../src/pages/CollectionPage', async original => {
  const actual = await original<typeof import('../src/pages/CollectionPage')>()
  return { CollectionPage: (props: any) => { harness.collection = props; return actual.CollectionPage(props) } }
})
vi.mock('../src/services/serviceSupport', async original => ({ ...await original<typeof import('../src/services/serviceSupport')>(), wait: async () => {} }))
vi.mock('../src/lib/supabase', () => ({ requireSupabase: () => ({ from: () => ({
  select: () => ({ eq: async (_column: string, owner: string) => ({ data: structuredClone([...harness.rows.values()].filter(row => row.user_id === owner)), error: null }) }),
  upsert: async (payload: any, options: any) => {
    expect(options).toEqual({ onConflict: 'user_id,job_key' })
    harness.writes.push(structuredClone(payload))
    if (harness.fail) return { error: new Error('offline') }
    const key = `${payload.user_id}/${payload.job_key}`
    harness.rows.set(key, { job_snapshot: null, ...harness.rows.get(key), ...structuredClone(payload) })
    return { error: null }
  },
}) }) }))
import { DevelopmentApp as App } from '../src/App'
import { matchingService } from '../src/services/matchingService'
import { REAL104_SESSION_KEY } from '../src/services/real104Session'
import { JOB104_PAYLOAD_TTL_MS } from '../src/integrations/job104/types'

const now = '2026-09-29T04:00:00.000Z'
const job = (id = '844qv', title = sampleJobs[0].title, capturedAt = now): Job => normalize104CapturedJob({ ...sampleJobs[0], sourceKey: `104:${id}`, externalId: id, title }, capturedAt)
const put = (key: string, snapshot: unknown = null, flags = { favorite: true }) => harness.rows.set(`owner-a/${key}`, {
  user_id: 'owner-a', job_key: key, source: key.startsWith('1111') ? '1111' : '104', favorite: false, viewed: false, applied: false, rejected: false, ...flags, job_snapshot: snapshot,
})
const working = (jobs: Job[] | null) => sessionStorage.setItem(REAL104_SESSION_KEY, JSON.stringify({ version: 1, mode: 'REAL_104', snapshot: jobs ? { jobs, keyword: '前端工程師', location: '台中市', capturedAt: now, importedAt: now } : null }))
const mount = async () => {
  let html = ''
  for (let attempt = 0; attempt < 15; attempt++) {
    harness.changed = false; harness.cursor = 0; html = renderToStaticMarkup(<App />)
    harness.effects.splice(0).forEach(effect => effect())
    for (let i = 0; i < 12; i++) await Promise.resolve()
    if (!harness.changed && !harness.effects.length) return html
  }
  throw new Error('component effect loop did not settle')
}
const remount = () => {
  harness.slots.forEach(slot => slot?.cleanup?.()); harness.slots = []; harness.effects = []; harness.cursor = 0; harness.board = null; harness.collection = null
}
const favorites = async () => { harness.slots[0] = 'favorites'; return mount() }
const cards = (html: string) => (html.match(/<article class="job-card /g) ?? []).length
const badge = (html: string) => Number(html.match(/收藏任務<\/strong>.*?<b>(\d+)<\/b>/)?.[1] ?? 0)
const equalCards = (html: string, count: number) => { expect(cards(html)).toBe(count); expect(badge(html)).toBe(count) }
beforeEach(() => {
  harness.slots = []; harness.effects = []; harness.cursor = 0; harness.board = null; harness.collection = null
  harness.rows.clear(); harness.writes = []; harness.fail = false; harness.owner = 'owner-a'
  harness.resume = { id: 'confirmed', name: 'Candidate', skills: ['React', 'JavaScript'], projects: [], workExperiences: [], education: { school: '', department: '', graduationStatus: '' }, careerDirections: [], updatedAt: now, level: 1, abilities: [] }
  vi.useFakeTimers(); vi.setSystemTime(new Date(now))
  vi.stubGlobal('window', { location: { search: '' }, setTimeout: globalThis.setTimeout })
  const values = new Map<string, string>()
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
  working([job()])
})
afterEach(() => { remount(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('ghost saved job App regression and snapshot restore', () => {
  it.each([true, false])('original red reproduction: cache=%s, legacy row stays and badge equals renderable cards', async cacheExists => {
    put('104:orphan123')
    if (cacheExists) put(job().id)
    else working(null)
    await mount(); const html = await favorites()
    equalCards(html, cacheExists ? 1 : 0)
    expect(html).not.toContain('https://www.104.com.tw/job/orphan123')
    expect(harness.action.statuses['104:orphan123']).toEqual(['favorite'])
    expect(harness.rows.size).toBe(cacheExists ? 2 : 1); expect(harness.writes).toHaveLength(0)
  })
  it('new interacted REAL job saves exact V1 and survives F5', async () => {
    await mount(); expect(harness.writes).toHaveLength(0)
    await harness.board.actions.toggleFavorite(job().id); await mount()
    expect(harness.writes[0].job_snapshot).toEqual(serializeJobSnapshot(job()))
    equalCards(await favorites(), 1)
    remount(); await mount(); equalCards(await favorites(), 1)
    expect(harness.writes).toHaveLength(1)
  })
  it('close/remount with no sessionStorage: select REAL without reimport and recover the saved card', async () => {
    await mount(); await harness.board.actions.toggleFavorite(job().id)
    sessionStorage.removeItem(REAL104_SESSION_KEY); remount()
    expect(await mount()).toContain('Board source: DEMO_LOCAL')
    harness.board.realSession.selectMode('REAL_104'); await mount()
    const html = await favorites(); equalCards(html, 1)
    expect(html).toContain(`href="${job().url}"`)
    expect(harness.collection.realSession.status).toBe('missing')
    expect(harness.writes).toHaveLength(1)
  })
  it('current valid session metadata wins over saved metadata without duplicate or import writes', async () => {
    put(job().id, serializeJobSnapshot(job('844qv', '舊職稱', '2020-01-01T00:00:00.000Z')))
    await mount(); const html = await favorites(); equalCards(html, 1)
    expect(html).toContain(sampleJobs[0].title); expect(html).not.toContain('舊職稱')
    expect(harness.writes).toHaveLength(0)
    await harness.collection.actions.markViewed(job().id)
    expect(harness.writes[0].job_snapshot).toEqual(serializeJobSnapshot(job()))
  })
  it('expired/corrupt session still allows persisted interacted snapshot cards', async () => {
    put(job().id, serializeJobSnapshot(job()))
    await mount(); await vi.advanceTimersByTimeAsync(JOB104_PAYLOAD_TTL_MS + 1)
    equalCards(await favorites(), 1)
    expect(harness.collection.realSession.status).toBe('expired')
    sessionStorage.setItem(REAL104_SESSION_KEY, '{broken'); remount(); await mount()
    equalCards(await favorites(), 1)
    expect(harness.collection.realSession.status).toBe('corrupt')
  })
  it('reimport same canonical legacy key rejoins and next interaction populates one row', async () => {
    put(job().id); working(null); await mount(); equalCards(await favorites(), 0)
    harness.slots[0] = 'board'; await mount()
    harness.board.onRealImport(await matchingService.matchJobs(harness.resume, [job()]), harness.preference, now)
    await mount(); equalCards(await favorites(), 1)
    expect(harness.writes).toHaveLength(0)
    await harness.collection.actions.markViewed(job().id)
    expect(harness.rows.size).toBe(1); expect(harness.writes[0].job_snapshot).toEqual(serializeJobSnapshot(job()))
  })
  it('same title/company, different IDs: separate favorite/applied/rejected cards and original links after remount', async () => {
    const a = job(), b = job('other123'), c = job('third123'); working([a, b, c]); await mount()
    await harness.board.actions.toggleFavorite(a.id); await harness.board.actions.markApplied(b.id); await harness.board.actions.markRejected(c.id)
    working(null); remount(); await mount()
    const html = await favorites(); equalCards(html, 1)
    expect(html).toContain(`href="${a.url}"`); expect(html).not.toContain(`href="${b.url}"`)
    harness.slots[0] = 'history'; const history = await mount()
    expect(cards(history)).toBe(2); expect(history).toContain(`href="${b.url}"`); expect(history).toContain(`href="${c.url}"`)
    expect(harness.collection.statuses).toEqual({ [a.id]: ['favorite'], [b.id]: ['applied'], [c.id]: ['rejected'] })
    expect(harness.rows.size).toBe(3)
  })
  it('Demo and REAL keep separate statuses/cards; REAL snapshots are never written for Demo', async () => {
    put(job().id, serializeJobSnapshot(job())); put('104-01'); put('1111-01')
    await mount(); equalCards(await favorites(), 1)
    expect(harness.collection.statuses).toEqual({ [job().id]: ['favorite'] })
    harness.slots[0] = 'board'; await mount(); harness.board.realSession.selectMode('DEMO_LOCAL'); await mount()
    expect(harness.board.statuses).toEqual({ '104-01': ['favorite'] })
    await harness.board.actions.markViewed('104-01')
    expect(harness.writes[0]).not.toHaveProperty('job_snapshot')
    const html = await favorites(); expect(html).not.toContain(`href="${job().url}"`)
  })
  it('invalid/cross-attached snapshot retains action but produces neither fake card nor count', async () => {
    working(null); put('104:orphan', serializeJobSnapshot(job())); put(job().id, { ...serializeJobSnapshot(job()), schemaVersion: 999 })
    await mount(); equalCards(await favorites(), 0)
    expect(harness.action.statuses).toEqual({ '104:orphan': ['favorite'], [job().id]: ['favorite'] })
    expect(harness.rows.size).toBe(2); expect(harness.writes).toHaveLength(0)
  })
  it('failed save retains local card after session loss and existing retry persists correct snapshot', async () => {
    harness.fail = true; await mount(); await harness.board.actions.toggleFavorite(job().id); await mount()
    harness.board.realSession.clearSearch(); await mount()
    const html = await favorites(); equalCards(html, 1); expect(html).toContain('職缺操作保存失敗')
    expect(harness.rows.size).toBe(0)
    harness.fail = false; await harness.action.retry(); await mount()
    expect(harness.rows.size).toBe(1); expect(harness.writes.at(-1).job_snapshot).toEqual(serializeJobSnapshot(job()))
  })
  it('snapshot matching recomputes from current confirmed profile, never stored match percent', async () => {
    put(job().id, serializeJobSnapshot(job())); working(null)
    const matching = vi.spyOn(matchingService, 'matchJobs'); await mount(); await favorites()
    expect(matching).toHaveBeenCalledWith(harness.resume, [job()])
    harness.resume = { ...harness.resume!, skills: ['Python'] }; await mount()
    expect(matching).toHaveBeenLastCalledWith(harness.resume, [job()])
    expect(harness.collection.realSession.matches[0].match.matchedSkills).not.toContain('React')
    expect(JSON.stringify([...harness.rows.values()])).not.toContain('matchScore')
    expect(harness.writes).toHaveLength(0)
  })
  it('matching failure renders no cards/count and retries the same saved facts', async () => {
    put(job().id, serializeJobSnapshot(job())); working(null)
    vi.spyOn(matchingService, 'matchJobs').mockRejectedValueOnce(new Error('private detail'))
    await mount(); const html = await favorites(); equalCards(html, 0)
    expect(html).toContain('目前無法完成職缺匹配'); expect(html).not.toContain('private detail')
    harness.collection.realSession.retryMatching(); equalCards(await mount(), 1)
  })
  it('ignores a previous owner matching completion and waits for confirmed resume', async () => {
    put(job().id, serializeJobSnapshot(job())); working(null); harness.resume = null
    const matching = vi.spyOn(matchingService, 'matchJobs'); expect(await mount()).not.toContain('job-card'); expect(matching).not.toHaveBeenCalled()
    harness.resume = { id: 'confirmed', name: 'Candidate', skills: ['React'], projects: [], workExperiences: [], education: { school: '', department: '', graduationStatus: '' }, careerDirections: [], updatedAt: now, level: 1, abilities: [] }
    let resolve!: (matches: JobWithMatch[]) => void
    const oldMatches = await matchingService.matchJobs(harness.resume, [job()])
    matching.mockReturnValueOnce(new Promise(yes => { resolve = yes }))
    await mount(); equalCards(await favorites(), 0)
    harness.owner = 'owner-b'; await mount(); resolve(oldMatches); equalCards(await mount(), 0)
    expect(harness.action.statuses).toEqual({}); expect(harness.action.jobs).toEqual({})
    expect(harness.rows.size).toBe(1)
  })
  it('mixes current and persisted evidence only within REAL action scope, in existing match order', async () => {
    const a = job(), b = job('other123'), orphan = '104:orphan'
    put(a.id, serializeJobSnapshot(a)); put(b.id, serializeJobSnapshot(b)); put(orphan)
    const matching = vi.spyOn(matchingService, 'matchJobs'); await mount()
    const html = await favorites(); equalCards(html, 2)
    expect(html).toContain(`href="${a.url}"`); expect(html).toContain(`href="${b.url}"`)
    expect(harness.collection.realSession.matches).toEqual(await matchingService.matchJobs(harness.resume, [a, b]))
    expect(matching.mock.calls.slice(0, 2).map(call => call[1].map(job => job.id)).sort()).toEqual([[a.id], [b.id]].sort())
    expect(harness.rows.size).toBe(3); expect(harness.writes).toHaveLength(0)
  })
  it('late previous-profile snapshot matching cannot replace recomputation for a newer confirmed profile', async () => {
    put(job().id, serializeJobSnapshot(job())); working(null)
    const old = await matchingService.matchJobs(harness.resume, [job()])
    let resolve!: (matches: JobWithMatch[]) => void
    vi.spyOn(matchingService, 'matchJobs').mockReturnValueOnce(new Promise(yes => { resolve = yes }))
    await mount(); equalCards(await favorites(), 0)
    harness.resume = { ...harness.resume!, skills: ['Python'] }; equalCards(await mount(), 1)
    resolve(old); await mount()
    expect(harness.collection.realSession.matches[0].match.matchedSkills).not.toContain('React')
    expect(harness.writes).toHaveLength(0)
  })
})
