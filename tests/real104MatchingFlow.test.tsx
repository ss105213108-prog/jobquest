import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import sampleJobs from '../experiments/104-browser-connector/sample-output.json'
import { BoardPage } from '../src/pages/BoardPage'
import { GuildHeader } from '../src/components/layout/GuildHeader'
import { JobCard } from '../src/components/jobs/JobCard'
import { job104Connector } from '../src/integrations/job104/connectorClient'
import { normalize104CapturedJob } from '../src/integrations/job104/normalize104CapturedJob'
import { build104SearchUrl } from '../src/integrations/job104/build104SearchUrl'
import { location104Map } from '../src/integrations/job104/locationMap'
import { JOB104_PAYLOAD_TTL_MS, type Job104ConnectorResponse, type Job104Payload } from '../src/integrations/job104/types'
import { matchCaptured104Jobs } from '../src/services/connectorJobService'
import { matchingService } from '../src/services/matchingService'
import { searchLocalJobs } from '../src/services/localJobService'
import type { JobActionHandlers, ResumeProfile, SearchPreference } from '../src/types'

const controls = vi.hoisted(() => ({ onImport: null as (() => void) | null, onSearch: null as ((keyword: string, location: string) => void) | null }))
vi.mock('../src/components/search/SearchPanel', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/components/search/SearchPanel')>()
  return { SearchPanel: (props: Parameters<typeof actual.SearchPanel>[0]) => {
    controls.onSearch = props.onSearch
    return actual.SearchPanel(props)
  } }
})
vi.mock('../src/components/search/Job104ConnectorControls', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/components/search/Job104ConnectorControls')>()
  return {
    Job104ConnectorControls: (props: Parameters<typeof actual.Job104ConnectorControls>[0]) => {
      controls.onImport = props.onImport
      return actual.Job104ConnectorControls(props)
    },
  }
})

const preference: SearchPreference = { source: '104', keyword: '前端工程師', location: '台中市', sortBy: 'match-desc' }
const confirmed: ResumeProfile = {
  id: 'anonymous-confirmed', name: 'Anonymous Candidate', skills: ['JavaScript', 'HTML', 'CSS', 'Git'],
  projects: [{ name: 'Anonymous Project', skills: ['React'] }], workExperiences: [],
  education: { school: '', department: '', graduationStatus: '' }, certifications: [],
  careerDirections: [], updatedAt: '2026-09-28T00:00:00.000Z', level: 1, abilities: [],
}
const actions: JobActionHandlers = {
  toggleFavorite: () => {}, markViewed: () => {}, markApplied: () => {}, markRejected: () => {},
}
const payload = (): Job104Payload => ({
  version: 1, source: '104', capturedAt: new Date().toISOString(),
  sourceUrl: 'https://www.104.com.tw/jobs/search/?area=6001008000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB',
  jobs: structuredClone(sampleJobs),
})
const ready = (): Job104ConnectorResponse => ({ status: 'ready', payload: payload() })
const board = (localDemo: boolean, onPreferenceChange = vi.fn(async () => {})) => renderToStaticMarkup(
  <BoardPage localDemo={localDemo} source="104" resume={confirmed} initialPreference={preference}
    onPreferenceChange={onPreferenceChange} statuses={{}} actions={actions} />,
)
const importAndMatch = async (response = ready()) => {
  const pending = matchCaptured104Jobs(response, preference, confirmed)
  await vi.runAllTimersAsync()
  return pending
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden') }))
  vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, location: { search: '' } })
  controls.onImport = null
  controls.onSearch = null
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('real 104 connector to confirmed-profile matching seam', () => {
  it.each(Object.keys(location104Map))('hands off the same captured inputs through %s without changing scores, grades or evidence', async location => {
    const response = ready()
    const baseline = await importAndMatch(response)
    response.payload!.sourceUrl = build104SearchUrl(preference.keyword, location)
    const pending = matchCaptured104Jobs(response, { ...preference, location }, confirmed)
    await vi.runAllTimersAsync()
    expect(await pending).toEqual(baseline)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('preserves existing source identity, observed fields and canonical links, with no Demo mixture', async () => {
    const response = ready()
    const results = await importAndMatch(response)
    expect(results).toHaveLength(10)
    for (const { job, match } of results) {
      const capture = response.payload!.jobs.find(item => item.externalId === job.externalId)!
      expect(job.id).toBe(`104:${capture.externalId}`)
      expect(job.source).toBe('104')
      expect(job.url).toBe(`https://www.104.com.tw/job/${capture.externalId}`)
      expect(job).toMatchObject({ title: capture.title, company: capture.company, salary: capture.salaryText, location: capture.location })
      expect(job.externalId).not.toMatch(/^mock-/)
      expect(job.company).not.toMatch(/Demo|Synthetic/)
      expect(match.matchScore).toBeGreaterThanOrEqual(0)
      expect(match.matchScore).toBeLessThanOrEqual(100)
      expect(['S', 'A', 'B', 'C', 'D']).toContain(match.matchLevel)
    }
    expect(fetch).not.toHaveBeenCalled()
  })
  it('passes the exact confirmed profile and normalized Jobs into the unchanged engine', async () => {
    const spy = vi.spyOn(matchingService, 'matchJobs')
    const response = ready()
    const before = structuredClone(confirmed)
    await importAndMatch(response)
    expect(spy).toHaveBeenCalledWith(confirmed, response.payload!.jobs.map(capture => normalize104CapturedJob(capture, response.payload!.capturedAt)))
    expect(confirmed).toEqual(before)
  })
  it('does not restore a deleted primary skill from project skills', async () => {
    const response = ready()
    response.payload!.jobs = [{ ...response.payload!.jobs[0], title: 'React 前端工程師', snippetText: 'React 與 Git' }]
    const results = await importAndMatch(response)
    expect(results[0].match.matchedSkills).not.toContain('React')
    expect(results[0].match.missingSkills).toContain('React')
  })
  it('leaves optional description and skills empty, with the existing unknown experience marker', () => {
    const capture = { ...sampleJobs[0], title: '行政助理', snippetText: undefined, experienceText: undefined }
    const job = normalize104CapturedJob(capture, new Date().toISOString())
    expect(job.description).toBe('')
    expect(job.requiredSkills).toEqual([])
    expect(job.experience).toBe('未提供')
    expect(job.salary).toBe(capture.salaryText)
  })
  it('preserves stable grade, ranking and evidence across repeated imports', async () => {
    const response = ready()
    expect(await importAndMatch(response)).toEqual(await importAndMatch(response))
  })
  it.each(['missing-extension', 'no-capture', 'expired', 'malformed', 'error'] as const)(
    'rejects %s without matching or fixture fallback', async status => {
      const matching = vi.spyOn(matchingService, 'matchJobs')
      await expect(matchCaptured104Jobs({ status }, preference, confirmed)).rejects.toThrow()
      expect(matching).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    },
  )
  it('rejects a ready response without a payload', async () => {
    await expect(matchCaptured104Jobs({ status: 'ready' }, preference, confirmed)).rejects.toThrow('格式不正確')
  })
  it('revalidates TTL even if a response claims to be ready', async () => {
    const response = ready()
    response.payload!.capturedAt = new Date(Date.now() - JOB104_PAYLOAD_TTL_MS - 1).toISOString()
    await expect(matchCaptured104Jobs(response, preference, confirmed)).rejects.toThrow('已過期')
  })
  it('rejects a malformed canonical identity before matching', async () => {
    const response = ready()
    response.payload!.jobs[0].canonicalUrl += '?tracking=invalid'
    await expect(matchCaptured104Jobs(response, preference, confirmed)).rejects.toThrow('格式不正確')
  })
  it.each([{ keyword: '後端工程師' }, { location: '台北市' }])('rejects a different search %j', async overrides => {
    await expect(matchCaptured104Jobs(ready(), { ...preference, ...overrides }, confirmed)).rejects.toThrow('不一致')
  })
})

describe('existing Quest Board source and link wiring (development checks only)', () => {
  it.each(Object.keys(location104Map))('opens the public search and persists the exact %s label only on explicit submit', location => {
    const open = vi.fn()
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, location: { search: '' }, open })
    const persist = vi.fn(async () => {})
    const capture = vi.spyOn(job104Connector, 'getLatest')
    board(false, persist)
    expect(open).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
    controls.onSearch!(' 前端工程師 ', location)
    expect(open).toHaveBeenCalledExactlyOnceWith(build104SearchUrl('前端工程師', location), '_blank', 'noopener,noreferrer')
    expect(persist).toHaveBeenCalledExactlyOnceWith({ ...preference, keyword: '前端工程師', location })
    expect(capture).not.toHaveBeenCalled()
  })
  it.each(['新竹縣', '嘉義縣', 'unknown'])('does not open, save or capture an unsupported %s submission', location => {
    const open = vi.fn()
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, location: { search: '' }, open })
    const persist = vi.fn(async () => {})
    const capture = vi.spyOn(job104Connector, 'getLatest')
    board(false, persist)
    controls.onSearch!(preference.keyword, location)
    expect(open).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
  })
  it('makes Real and Demo states explicit and exposes the existing connector only in Real', () => {
    const real = board(false)
    expect(real).toContain('data-job-source="REAL_104"')
    expect(real).toContain('REAL 104')
    expect(real).toContain('匯入並配對')
    expect(real).not.toContain('LOCAL JOB FIXTURES')
    const demo = board(true)
    expect(demo).toContain('data-job-source="DEMO_LOCAL"')
    expect(demo).toContain('MOCK / DEMO MODE')
    expect(demo).not.toContain('匯入並配對')
  })
  it('does not persist preference after import, preventing the reset effect from clearing results', async () => {
    const persist = vi.fn(async () => {})
    vi.spyOn(job104Connector, 'getLatest').mockResolvedValue(ready())
    const matching = vi.spyOn(matchingService, 'matchJobs')
    board(false, persist)
    expect(controls.onImport).not.toBeNull()
    controls.onImport!()
    await vi.runAllTimersAsync()
    expect(job104Connector.getLatest).toHaveBeenCalledOnce()
    expect(matching).toHaveBeenCalledOnce()
    expect(persist).not.toHaveBeenCalled()
  })
  it('opens the canonical source from the real card, preserving details and evidence without synthetic freshness', async () => {
    const item = (await importAndMatch())[0]
    const html = renderToStaticMarkup(<JobCard item={item} expanded={false} hasStatus={() => false} actions={actions} onToggleDetail={() => {}} />)
    expect(html).toContain(`href="${item.job.url}" target="_blank" rel="noopener noreferrer">查看職缺</a>`)
    expect(html).toContain('查看配對')
    expect(html).toContain(item.job.company)
    expect(html).toContain(`${item.match.matchScore}%`)
    expect(html).toContain(`${item.match.matchLevel} 級`)
    expect(html).not.toContain('今日新增')
    expect(html).not.toContain('（模擬）')
  })
  it('keeps explicit Demo fixtures independent and unchanged', async () => {
    const jobs = await searchLocalJobs({ ...preference, keyword: '', location: '全部地區' })
    expect(jobs).toHaveLength(7)
    expect(jobs.every(job => job.externalId.startsWith('mock-'))).toBe(true)
    expect((await importAndMatch()).every(item => !item.job.externalId.startsWith('mock-'))).toBe(true)
  })
  it('does not invent a real job count in the header', () => {
    const real = renderToStaticMarkup(<GuildHeader source="104" onRestart={() => {}} />)
    expect(real).not.toContain('今日新增')
    expect(real).not.toContain('<strong>23</strong>')
    const demo = renderToStaticMarkup(<GuildHeader source="104" demoJobCount={7} onRestart={() => {}} />)
    expect(demo).toContain('示範職缺')
    expect(demo).toContain('<strong>7</strong>')
  })
})
