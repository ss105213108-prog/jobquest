import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { GuildPage, ResumeProfile, SearchPreference } from '../src/types'
import { INTENT, NOW, capture, ids, names, normalized, profile } from './helpers/real104BatchContract'

const harness = vi.hoisted(() => ({
  slots: [] as any[], cursor: 0, effects: [] as (() => void)[], changed: false,
  owner: 'owner-a', resume: null as ResumeProfile | null,
  preference: { source: '104', keyword: '工程師', location: '台中市', sortBy: 'match-desc' } as SearchPreference,
  savePreference: async (preference: SearchPreference) => { harness.preference = preference },
  onImport: null as null | (() => void), onSearch: null as null | ((keyword: string, location: string) => void),
  onCommit: null as null | (() => void), onNext: null as null | (() => void), response: null as any,
  onNavigate: null as null | ((page: GuildPage) => void),
  values: new Map<string, string>(), failWrite: false,
  same: (a: unknown[] | undefined, b: unknown[] | undefined) => !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])),
}))

vi.mock('react', async original => {
  const actual = await original<typeof import('react')>()
  return { ...actual,
    useState: (initial: any) => {
      const index = harness.cursor++
      if (!(index in harness.slots)) harness.slots[index] = typeof initial === 'function' ? initial() : initial
      return [harness.slots[index], (value: any) => {
        const next = typeof value === 'function' ? value(harness.slots[index]) : value
        if (!Object.is(next, harness.slots[index])) { harness.slots[index] = next; harness.changed = true }
      }]
    },
    useRef: (initial: any) => { const index = harness.cursor++; return harness.slots[index] ??= { current: initial } },
    useCallback: (callback: any, deps: unknown[]) => {
      const index = harness.cursor++, prior = harness.slots[index]
      if (!prior || !harness.same(prior.deps, deps)) harness.slots[index] = { deps, callback }
      return harness.slots[index].callback
    },
    useMemo: (factory: () => unknown, deps: unknown[]) => {
      const index = harness.cursor++, prior = harness.slots[index]
      if (!prior || !harness.same(prior.deps, deps)) harness.slots[index] = { deps, value: factory() }
      return harness.slots[index].value
    },
    useEffect: (effect: () => any, deps: unknown[]) => {
      const index = harness.cursor++, prior = harness.slots[index]
      if (!prior || !harness.same(prior.deps, deps)) harness.effects.push(() => {
        prior?.cleanup?.(); harness.slots[index] = { deps, cleanup: effect() }
      })
    },
  }
})
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: harness.owner }, initializing: false, error: null }) }))
vi.mock('../src/hooks/useLocalAcceptance', () => ({ useLocalAcceptance: () => ({ resume: harness.resume, preference: harness.preference, statuses: {}, actions: {} }) }))
vi.mock('../src/hooks/useConfirmedResumePersistence', () => ({ useConfirmedResumePersistence: () => ({ initializing: false, status: { phase: 'restored' } }) }))
vi.mock('../src/hooks/useJobPreferencePersistence', () => ({ useJobPreferencePersistence: () => ({ initializing: false, status: { phase: 'restored', ready: true }, save: harness.savePreference }) }))
vi.mock('../src/hooks/useJobActions', () => ({ useJobActions: () => ({ initializing: false, state: { ownerId: harness.owner, phase: 'restored' }, statuses: {}, jobs: {}, actions: {} }) }))
vi.mock('../src/components/search/SearchPanel', () => ({ SearchPanel: (props: any) => { harness.onSearch = props.onSearch; return <p>搜尋條件：{props.keyword} · {props.location}</p> } }))
vi.mock('../src/components/layout/GuildSidebar', async original => {
  const actual = await original<typeof import('../src/components/layout/GuildSidebar')>()
  return { GuildSidebar: (props: Parameters<typeof actual.GuildSidebar>[0]) => { harness.onNavigate = props.onNavigate; return actual.GuildSidebar(props) } }
})
vi.mock('../src/components/search/Job104ConnectorControls', async original => {
  const actual = await original<typeof import('../src/components/search/Job104ConnectorControls')>()
  return { Job104ConnectorControls: (props: Parameters<typeof actual.Job104ConnectorControls>[0]) => { harness.onImport = props.onImport; return actual.Job104ConnectorControls(props) } }
})
vi.mock('../src/components/search/Real104BatchProgress', async original => {
  const actual = await original<typeof import('../src/components/search/Real104BatchProgress')>()
  return { Real104BatchProgress: (props: Parameters<typeof actual.Real104BatchProgress>[0]) => {
    harness.onCommit = props.onCommit
    harness.onNext = (props as typeof props & { onNext?: () => void }).onNext ?? null
    return actual.Real104BatchProgress(props)
  } }
})
vi.mock('../src/services/serviceSupport', async original => ({ ...await original<typeof import('../src/services/serviceSupport')>(), wait: async () => {} }))

import App from '../src/App'
import { job104Connector } from '../src/integrations/job104/connectorClient'
import { matchingService } from '../src/services/matchingService'
import { REAL104_BATCH_KEY } from '../src/services/real104BatchWorkingSet'
import { REAL104_SESSION_KEY } from '../src/services/real104Session'

async function mount() {
  let html = ''
  for (let attempt = 0; attempt < 25; attempt++) {
    harness.changed = false; harness.cursor = 0
    html = renderToStaticMarkup(<App />)
    harness.effects.splice(0).forEach(effect => effect())
    for (let i = 0; i < 12; i++) await Promise.resolve()
    if (!harness.changed && !harness.effects.length) return html
  }
  throw new Error('component effect loop did not settle')
}
const remount = () => { harness.slots.forEach(slot => slot?.cleanup?.()); harness.slots = []; harness.effects = []; harness.cursor = 0 }
async function importCapture(jobNames: string[], page = 1) {
  harness.response = { status: 'ready', payload: capture(jobNames, { page }) }
  await mount()
  harness.onImport?.()
  for (let i = 0; i < 8; i++) await mount()
  return mount()
}
const cards = (html: string) => (html.match(/<article class="job-card /g) ?? []).length

beforeEach(() => {
  harness.slots = []; harness.effects = []; harness.cursor = 0; harness.changed = false
  harness.owner = 'owner-a'; harness.resume = profile
  harness.preference = { source: '104', keyword: INTENT.keyword, location: INTENT.region, sortBy: 'match-desc' }
  harness.onImport = null; harness.onSearch = null; harness.onCommit = null; harness.onNext = null
  harness.onNavigate = null
  harness.values = new Map(); harness.failWrite = false
  vi.useFakeTimers(); vi.setSystemTime(new Date(NOW))
  const storage = {
    getItem: (key: string) => harness.values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (harness.failWrite && key === REAL104_BATCH_KEY) throw new Error('quota'); harness.values.set(key, value) },
    removeItem: (key: string) => { harness.values.delete(key) },
  }
  vi.stubGlobal('sessionStorage', storage)
  vi.stubGlobal('window', { sessionStorage: storage, location: { search: '' }, setTimeout: globalThis.setTimeout, open: vi.fn() })
  harness.values.set(REAL104_SESSION_KEY, JSON.stringify({ version: 1, mode: 'REAL_104', snapshot: null }))
  harness.response = { status: 'no-capture' }
  vi.spyOn(job104Connector, 'status').mockImplementation(async () => harness.response)
  vi.spyOn(job104Connector, 'getLatest').mockImplementation(async () => harness.response)
})
afterEach(() => { remount(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('REAL 104 batch App integration', () => {
  it('production starts with only 104 and no source radios or Mock branding even without saved mode', async () => {
    harness.values.delete(REAL104_SESSION_KEY)
    const matching = vi.spyOn(matchingService, 'matchJobs')
    const html = await mount()
    expect(html).not.toMatch(/MOCK|DEMO|name="job-data-source"/)
    expect(html).toContain('來源限定：104')
    expect(html).toContain('前往 104 搜尋')
    expect(harness.values.has(REAL104_BATCH_KEY)).toBe(false)
    expect(matching).not.toHaveBeenCalled()
  })

  it('production keeps old Demo mode and 1111 preferences out of the 104 Board without saving preferences', async () => {
    harness.values.set(REAL104_SESSION_KEY, JSON.stringify({ version: 1, mode: 'DEMO_LOCAL', snapshot: null }))
    harness.preference = { ...harness.preference, source: '1111' }
    const html = await mount()
    expect(html).not.toMatch(/MOCK|DEMO|name="job-data-source"/)
    expect(html).toContain('來源限定：104')
    expect(harness.preference.source).toBe('1111')
    expect(JSON.parse(harness.values.get(REAL104_SESSION_KEY)!).mode).toBe('REAL_104')
    expect(harness.values.has(REAL104_BATCH_KEY)).toBe(false)
  })

  it.each(['favorites', 'history', 'profile', 'settings'] as const)('production %s has no Mock branding or source chooser', async page => {
    await mount()
    harness.onNavigate?.(page)
    // This SSR harness flattens component hook slots; simulate the Board's
    // unmount before the Profile editor mounts its own draft state.
    if (page === 'profile') { remount(); harness.slots[0] = page }
    const html = await mount()
    expect(html).not.toMatch(/MOCK|DEMO|name="job-data-source"/)
    expect(html).toContain('目前來源')
    expect(html).toContain('REAL 104 · 確認履歷雲端保存')
    if (page === 'settings') expect(html).toContain('REAL 104 職缺')
  })

  it('collects 10→20→30→40 without replacing earlier captures, then presents one 40-job Board', async () => {
    const matching = vi.spyOn(matchingService, 'matchJobs')
    for (let page = 0; page < 4; page++) {
      const html = await importCapture(names(page * 10, 10), page + 1)
      if (page < 3) { expect(html).toContain(`已收集 ${(page + 1) * 10} / 40`); expect(cards(html)).toBe(0) }
      else { expect(html).toContain('已配對 40 筆職缺'); expect(cards(html)).toBe(40) }
      expect(JSON.parse(harness.values.get(REAL104_BATCH_KEY)!).currentBatchJobs).toHaveLength((page + 1) * 10)
    }
    expect(matching).toHaveBeenCalledTimes(1)
    expect(matching.mock.calls[0][1].map(job => job.id)).toEqual(ids(...names(0, 40)))
  })

  it('skips repeat sourceKeys without increasing the collection count', async () => {
    await importCapture(names(0, 10))
    const html = await importCapture([...names(0, 4), ...names(10, 6)], 2)
    expect(html).toContain('已收集 16 / 40')
    expect(JSON.parse(harness.values.get(REAL104_BATCH_KEY)!).currentBatchJobs.map((job: { id: string }) => job.id)).toEqual(ids(...names(0, 16)))
  })

  it('rejects a malformed Connector payload without changing an earlier valid collection', async () => {
    await importCapture(names(0, 10))
    const original = harness.values.get(REAL104_BATCH_KEY)
    const bad = capture(['jnew']) as unknown as { jobs: Array<Record<string, unknown>> }
    delete bad.jobs[0].sourceKey
    harness.response = { status: 'ready', payload: bad }
    await mount(); harness.onImport?.()
    let html = ''
    for (let i = 0; i < 8; i++) html = await mount()
    expect(html).toContain('已收集 10 / 40')
    expect(harness.values.get(REAL104_BATCH_KEY)).toBe(original)
  })

  it('F5 restores a partial 20/40 collection without running Matching', async () => {
    const matching = vi.spyOn(matchingService, 'matchJobs')
    await importCapture(names(0, 10))
    await importCapture(names(10, 10), 2)
    remount()
    const html = await mount()
    expect(html).toContain('已收集 20 / 40')
    expect(cards(html)).toBe(0)
    expect(matching).not.toHaveBeenCalled()
  })

  it('F5 restores a presented partial batch and recomputes its matching', async () => {
    const matching = vi.spyOn(matchingService, 'matchJobs')
    await importCapture(names(0, 10))
    harness.onCommit?.()
    for (let i = 0; i < 8; i++) await mount()
    expect(matching).toHaveBeenCalledTimes(1)
    remount()
    const html = await mount()
    expect(html).toContain('已配對 10 筆職缺')
    expect(cards(html)).toBe(10)
    expect(matching).toHaveBeenCalledTimes(2)
  })

  it('F5 restores a presented 40-job batch as one Board result', async () => {
    const matching = vi.spyOn(matchingService, 'matchJobs')
    for (let page = 0; page < 4; page++) await importCapture(names(page * 10, 10), page + 1)
    expect(matching).toHaveBeenCalledTimes(1)
    remount()
    const html = await mount()
    expect(html).toContain('已配對 40 筆職缺')
    expect(cards(html)).toBe(40)
    expect(matching).toHaveBeenCalledTimes(2)
    expect(matching.mock.calls[1][1].map(job => job.id)).toEqual(ids(...names(0, 40)))
  })

  it('keyword and region changes reset the fingerprint and current collection', async () => {
    await importCapture(names(0, 10))
    harness.onSearch?.(`  ${INTENT.keyword}  `, INTENT.region)
    expect((await mount())).toContain('已收集 10 / 40')
    harness.onSearch?.('後端工程師', INTENT.region)
    let html = await mount()
    expect(html).toContain('已收集 0 / 40')
    expect(JSON.parse(harness.values.get(REAL104_BATCH_KEY)!).keyword).toBe('後端工程師')
    harness.onSearch?.('後端工程師', '台北市')
    html = await mount()
    expect(html).toContain('已收集 0 / 40')
    expect(JSON.parse(harness.values.get(REAL104_BATCH_KEY)!).region).toBe('台北市')
  })

  it('does not expose another UID’s batch after remount', async () => {
    await importCapture(names(0, 10))
    remount(); harness.owner = 'owner-b'
    const html = await mount()
    expect(html).not.toContain('已收集 10 / 40')
    expect(cards(html)).toBe(0)
    expect(html).toContain('104 批次工作清單無法還原')
  })

  it('Matching failure at 40 leaves a recoverable collecting batch without Board cards', async () => {
    vi.spyOn(matchingService, 'matchJobs').mockRejectedValueOnce(new Error('test-only failure'))
    for (let page = 0; page < 4; page++) await importCapture(names(page * 10, 10), page + 1)
    const html = await mount()
    expect(html).toContain('已收集 40 / 40')
    expect(cards(html)).toBe(0)
    expect(JSON.parse(harness.values.get(REAL104_BATCH_KEY)!).phase).toBe('collecting')
  })

  it('storage failure does not claim a successful capture or erase the prior collection', async () => {
    await importCapture(names(0, 10))
    const original = harness.values.get(REAL104_BATCH_KEY)
    harness.failWrite = true
    const html = await importCapture(names(10, 10), 2)
    expect(html).toContain('已收集 10 / 40')
    expect(html).not.toContain('已收集 20 / 40')
    expect(harness.values.get(REAL104_BATCH_KEY)).toBe(original)
  })

  it('preserves a valid legacy REAL session until an explicit new batch search', async () => {
    const at = new Date(NOW).toISOString()
    harness.values.set(REAL104_SESSION_KEY, JSON.stringify({ version: 1, mode: 'REAL_104', snapshot: {
      jobs: normalized(capture(['ja'])), keyword: INTENT.keyword, location: INTENT.region, capturedAt: at, importedAt: at,
    } }))
    const legacy = harness.values.get(REAL104_SESSION_KEY)
    const html = await mount()
    expect(cards(html)).toBe(1)
    expect(harness.values.has(REAL104_BATCH_KEY)).toBe(false)
    expect(harness.values.get(REAL104_SESSION_KEY)).toBe(legacy)
    harness.onSearch?.(INTENT.keyword, INTENT.region)
    await mount()
    expect(harness.values.has(REAL104_BATCH_KEY)).toBe(true)
    expect(JSON.parse(harness.values.get(REAL104_SESSION_KEY)!).snapshot).toBeNull()
  })
})

describe('REAL 104 full-page continuous App contract', () => {
  it('imports 18+20+20 as one 40-card Board with 18 pending, without early cards', async () => {
    const matching = vi.spyOn(matchingService, 'matchJobs')
    expect(cards(await importCapture(names(0, 18), 1))).toBe(0)
    expect(cards(await importCapture(names(18, 20), 2))).toBe(0)
    const html = await importCapture(names(38, 20), 3)
    expect(cards(html)).toBe(40)
    expect(matching).toHaveBeenCalledOnce()
    const envelope = JSON.parse(harness.values.get('jobQuest.real104Batch.v2')!)
    expect(envelope.currentBatchJobs.map((job: { id: string }) => job.id)).toEqual(ids(...names(0, 40)))
    expect(envelope.pendingJobs.map((item: { job: { id: string } }) => item.job.id)).toEqual(ids(...names(40, 18)))
  })

  // The Next Batch UI ticket now authorizes the previously deferred control.
  it('offers next batch after presentation and starts from saved pending before a new page', async () => {
    for (let start = 0; start < 30; start += 10) await importCapture(names(start, 10), start / 10 + 1)
    await importCapture(names(30, 8), 4)
    const first = await importCapture(names(38, 3), 5)
    expect(cards(first)).toBe(40)
    expect(first).toContain('下一批')
    expect(first).toContain('待續職缺 1 筆')
    expect(harness.onNext).toBeTypeOf('function')
    harness.onNext?.()
    for (let i = 0; i < 8; i++) await mount()
    const second = await mount()
    expect(second).toContain('第 2 批')
    expect(second).toContain('已收集 1 / 40')
    expect(second).not.toContain('下一批')
    const envelope = JSON.parse(harness.values.get('jobQuest.real104Batch.v2')!)
    expect(envelope.currentBatchJobs.map((job: { id: string }) => job.id)).toEqual(ids('j14'))
    expect(envelope.seenSourceKeys).toEqual(ids(...names(0, 40)))
    expect(envelope.pendingJobs).toEqual([])
    expect(envelope.batchNumber).toBe(2)
  })

  it('keeps a valid legacy REAL card until explicit new search instead of silently slicing a full page', async () => {
    const at = new Date(NOW).toISOString()
    harness.values.set(REAL104_SESSION_KEY, JSON.stringify({ version: 1, mode: 'REAL_104', snapshot: {
      jobs: normalized(capture(['ja'])), keyword: INTENT.keyword, location: INTENT.region, capturedAt: at, importedAt: at,
    } }))
    const legacy = harness.values.get(REAL104_SESSION_KEY)
    await mount()
    const html = await importCapture(names(0, 17), 2)
    expect(html).toContain('請先開始新批次搜尋')
    expect(cards(html)).toBe(1)
    expect(harness.values.get(REAL104_SESSION_KEY)).toBe(legacy)
    expect(harness.values.has('jobQuest.real104Batch.v2')).toBe(false)
  })
})

describe('REAL104 next batch UI integration', () => {
  it('21+20 starts Batch2 with pending 1, skips seen jobs, and continues through Batch3 and F5 without repeats', async () => {
    const matching = vi.spyOn(matchingService, 'matchJobs')
    const collecting = await importCapture(names(0, 21), 1)
    expect(collecting).not.toContain('下一批')
    const first = await importCapture(names(21, 20), 2)
    expect(first).toContain('第 1 批')
    expect(first).toContain('待續職缺 1 筆')
    remount()
    expect(await mount()).toContain('待續職缺 1 筆')
    harness.onNext?.()
    let second = await mount()
    expect(second).toContain('第 2 批')
    expect(second).toContain('已收集 1 / 40')
    expect(cards(second)).toBe(0)
    let envelope = JSON.parse(harness.values.get(REAL104_BATCH_KEY)!)
    expect(envelope.currentBatchJobs.map((job: { id: string }) => job.id)).toEqual(ids(...names(40, 1)))
    expect(envelope.seenSourceKeys).toEqual(ids(...names(0, 40)))
    second = await importCapture(['j0', ...names(40, 41)], 3)
    expect(second).toContain('第 2 批')
    expect(cards(second)).toBe(40)
    expect(second).toContain('待續職缺 1 筆')
    envelope = JSON.parse(harness.values.get(REAL104_BATCH_KEY)!)
    expect(envelope.currentBatchJobs.map((job: { id: string }) => job.id)).toEqual(ids(...names(40, 40)))
    expect(envelope.pendingJobs.map((item: { job: { id: string } }) => item.job.id)).toEqual(ids(...names(80, 1)))
    harness.onNext?.()
    const third = await mount()
    expect(third).toContain('第 3 批')
    expect(third).toContain('已收集 1 / 40')
    remount()
    expect(await mount()).toContain('第 3 批')
    const extended = await importCapture(names(0, 83), 4)
    expect(extended).toContain('已收集 3 / 40')
    envelope = JSON.parse(harness.values.get(REAL104_BATCH_KEY)!)
    expect(envelope.currentBatchJobs.map((job: { id: string }) => job.id)).toEqual(ids(...names(80, 3)))
    expect(envelope.seenSourceKeys).toEqual(ids(...names(0, 80)))
    expect(envelope.pendingJobs).toEqual([])
    expect(envelope.batchNumber).toBe(3)
    harness.onCommit?.()
    expect(cards(await mount())).toBe(3)
    // first batch and its F5 recomputation, second batch, third partial commit.
    expect(matching).toHaveBeenCalledTimes(4)
    expect(matching.mock.calls[2][1].map(job => job.id)).toEqual(ids(...names(40, 40)))
    expect(matching.mock.calls[3][1].map(job => job.id)).toEqual(ids(...names(80, 3)))
  })

  it('immediately Matches a full pending batch once, disables the control while busy, and ignores a rapid second click', async () => {
    const matching = vi.spyOn(matchingService, 'matchJobs')
    await importCapture(names(0, 91))
    const onNext = harness.onNext!
    onNext()
    onNext()
    // Snapshot the in-flight render before effects/microtasks settle.
    harness.cursor = 0
    const busy = renderToStaticMarkup(<App />)
    expect(busy).toMatch(/<button[^>]*disabled=""[^>]*>下一批<\/button>/)
    const second = await mount()
    expect(second).toContain('第 2 批')
    expect(second).toContain('待續職缺 11 筆')
    expect(cards(second)).toBe(40)
    expect(matching).toHaveBeenCalledTimes(2)
    expect(matching.mock.calls[1][1].map(job => job.id)).toEqual(ids(...names(40, 40)))
    const envelope = JSON.parse(harness.values.get(REAL104_BATCH_KEY)!)
    expect(envelope.batchNumber).toBe(2)
    expect(envelope.seenSourceKeys).toEqual(ids(...names(0, 40)))
    remount()
    const restored = await mount()
    expect(restored).toContain('第 2 批')
    expect(restored).toContain('待續職缺 11 筆')
    harness.onNext?.()
    expect(await mount()).toContain('第 3 批 · 已收集 11 / 40')
  })

  it('starts an empty collecting batch when no pending exists and waits for an explicit import', async () => {
    const matching = vi.spyOn(matchingService, 'matchJobs')
    await importCapture(['ja', 'jb'])
    harness.onCommit?.()
    const first = await mount()
    expect(first).toContain('下一批')
    expect(first).toContain('待續職缺 0 筆')
    harness.onNext?.()
    const second = await mount()
    expect(second).toContain('第 2 批 · 已收集 0 / 40')
    expect(second).not.toContain('下一批')
    expect(matching).toHaveBeenCalledOnce()
    const imported = await importCapture(['ja', 'jc'], 2)
    expect(imported).toContain('已收集 1 / 40')
    expect(JSON.parse(harness.values.get(REAL104_BATCH_KEY)!).currentBatchJobs.map((job: { id: string }) => job.id)).toEqual(ids('jc'))
  })

  it.each([
    ['keyword', '後端工程師', INTENT.region],
    ['region', INTENT.keyword, '台北市'],
  ])('%s change clears batch number, pending and previous seen after next batch', async (_label, keyword, region) => {
    await importCapture(names(0, 41))
    harness.onNext?.()
    expect(await mount()).toContain('第 2 批')
    harness.onSearch?.(keyword, region)
    const reset = await mount()
    expect(reset).toContain('第 1 批 · 已收集 0 / 40')
    expect(reset).not.toContain('下一批')
    const envelope = JSON.parse(harness.values.get(REAL104_BATCH_KEY)!)
    expect(envelope.currentBatchJobs).toEqual([])
    expect(envelope.pendingJobs).toEqual([])
    expect(envelope.seenSourceKeys).toEqual([])
    expect(envelope.firstCapturedAt).toBeNull()
    expect(envelope.searchFingerprint).toBe(JSON.stringify(['REAL_104', keyword, region]))
  })

  it('failed next-batch storage retains presented and pending, then permits one retry', async () => {
    await importCapture(names(0, 41))
    const original = harness.values.get(REAL104_BATCH_KEY)
    harness.failWrite = true
    harness.onNext?.()
    const failed = await mount()
    expect(failed).toContain('無法保存或讀取批次工作清單')
    expect(failed).toContain('第 1 批')
    expect(failed).toContain('待續職缺 1 筆')
    expect(harness.values.get(REAL104_BATCH_KEY)).toBe(original)
    harness.failWrite = false
    harness.onNext?.()
    expect(await mount()).toContain('第 2 批 · 已收集 1 / 40')
  })

  it('failed next-batch Matching leaves collecting 40 and pending for F5 and explicit retry', async () => {
    const matching = vi.spyOn(matchingService, 'matchJobs')
    await importCapture(names(0, 91))
    matching.mockRejectedValueOnce(new Error('Matching failure'))
    harness.onNext?.()
    const failed = await mount()
    expect(failed).toContain('第 2 批 · 已收集 40 / 40')
    expect(failed).toContain('待續職缺 11 筆')
    expect(failed).toContain('已收集職缺仍保留')
    expect(failed).not.toContain('下一批')
    expect(cards(failed)).toBe(0)
    remount()
    expect(await mount()).toContain('第 2 批 · 已收集 40 / 40')
    harness.onCommit?.()
    const retry = await mount()
    expect(retry).toContain('第 2 批 · 已配對 40 筆職缺')
    expect(cards(retry)).toBe(40)
    expect(matching).toHaveBeenCalledTimes(3)
  })

  it.each(['search', 'owner'])('a late next-batch result cannot replace a changed %s screen', async change => {
    const original = matchingService.matchJobs.bind(matchingService)
    const matching = vi.spyOn(matchingService, 'matchJobs')
    await importCapture(names(0, 91))
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    matching.mockImplementationOnce(async (resume, jobs) => {
      const results = await original(resume, jobs)
      await gate
      return results
    })
    harness.onNext?.()
    await mount()
    if (change === 'search') harness.onSearch?.('後端工程師', INTENT.region)
    else harness.owner = 'owner-b'
    await mount()
    release()
    let html = ''
    for (let i = 0; i < 8; i++) html = await mount()
    expect(cards(html)).toBe(0)
    expect(html).not.toContain('已配對 40 筆職缺')
    if (change === 'search') {
      expect(html).toContain('第 1 批 · 已收集 0 / 40')
      expect(JSON.parse(harness.values.get(REAL104_BATCH_KEY)!).keyword).toBe('後端工程師')
    } else expect(html).toContain('批次工作清單無法還原')
  })
})
