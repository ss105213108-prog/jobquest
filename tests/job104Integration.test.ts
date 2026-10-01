import { describe, expect, it } from 'vitest'
import sampleJobs from '../experiments/104-browser-connector/sample-output.json'
import { build104SearchUrl, payloadMatches104Search } from '../src/integrations/job104/build104SearchUrl'
import { create104ConnectorClient } from '../src/integrations/job104/connectorClient'
import { get104ConnectorMessage } from '../src/integrations/job104/connectorUi'
import { get104AreaCode, isSupported104Location, location104Map } from '../src/integrations/job104/locationMap'
import { normalize104CapturedJob } from '../src/integrations/job104/normalize104CapturedJob'
import { build104CanonicalUrl, get104PayloadState, parse104Capture, parse104Payload } from '../src/integrations/job104/schema'
import { JOB104_PAYLOAD_TTL_MS, JOB104_PAYLOAD_VERSION, type Job104Capture, type Job104Payload } from '../src/integrations/job104/types'
import { analyzeJobRequirements } from '../src/matching/jobRequirementAnalyzer'
import { calculateJobMatch, prepareResumeForMatching } from '../src/matching/scoreCalculator'
import { sortMatchedJobs } from '../src/services/matchingService'
import type { ResumeProfile } from '../src/types'

const capturedAt = '2026-09-20T02:00:00.000Z'
const payload = (overrides: Partial<Job104Payload> = {}): Job104Payload => ({
  version: JOB104_PAYLOAD_VERSION,
  source: '104',
  capturedAt,
  sourceUrl: 'https://www.104.com.tw/jobs/search/?area=6001008000&keyword=%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB',
  jobs: sampleJobs as Job104Capture[],
  ...overrides,
})

const resume: ResumeProfile = {
  id: 'real-profile',
  name: 'Frontend Adventurer',
  skills: ['Vue', 'JavaScript', 'HTML', 'CSS', 'Git'],
  projects: [{ name: '前端平台', skills: ['Vue', 'JavaScript', 'REST API'] }],
  workExperiences: [{ title: '前端開發', durationText: '3 年前端開發經驗' }],
  education: { school: '', department: '', graduationStatus: '畢業' },
  careerDirections: ['前端工程師'],
  updatedAt: capturedAt,
  level: 4,
  abilities: [],
}

describe('104 browser connector integration', () => {
  it('builds the verified 104 search URL without hardcoding the keyword', () => {
    const url = new URL(build104SearchUrl(' Vue 前端 ', '台中市'))
    expect(url.origin + url.pathname).toBe('https://www.104.com.tw/jobs/search/')
    expect(url.searchParams.get('keyword')).toBe('Vue 前端')
    expect(url.searchParams.get('area')).toBe('6001008000')
  })

  it('keeps the verified location mapping centralized and rejects unknown locations', () => {
    expect(location104Map.台中市).toBe('6001008000')
    expect(get104AreaCode('台中市')).toBe('6001008000')
    expect(isSupported104Location('台北市')).toBe(true)
    expect(isSupported104Location('未知地區')).toBe(false)
    expect(() => build104SearchUrl('前端工程師', '未知地區')).toThrow('此地區尚未完成 104 Connector 驗證。')
  })

  it('validates the fixed capture DTO fixture, job id, canonical URL, and payload version', () => {
    const parsed = parse104Payload(payload())
    expect(parsed?.jobs).toHaveLength(10)
    expect(parse104Capture(sampleJobs[0])).toMatchObject({ externalId: '844qv', sourceKey: '104:844qv' })
    expect(build104CanonicalUrl('844QV')).toBe('https://www.104.com.tw/job/844qv')
    expect(parse104Payload({ ...payload(), version: 2 })).toBeNull()
  })

  it('rejects malformed, duplicate, empty payloads and tracking or invalid source URLs', () => {
    expect(parse104Capture({ ...sampleJobs[0], canonicalUrl: `${sampleJobs[0].canonicalUrl}?jobsource=test` })).toBeNull()
    expect(parse104Payload({ ...payload(), jobs: [sampleJobs[0], sampleJobs[0]] })).toBeNull()
    expect(parse104Payload({ ...payload(), jobs: [] })).toBeNull()
    expect(parse104Payload({ ...payload(), sourceUrl: 'https://example.com/jobs/search/' })).toBeNull()
  })

  // Same superseded ten-job ceiling as G34; only the size rejection changes.
  it('superseded size ceiling: accepts all valid full-page candidates above ten in original order', () => {
    const jobs = [...sampleJobs, { ...sampleJobs[0], externalId: 'extra1', sourceKey: '104:extra1', canonicalUrl: 'https://www.104.com.tw/job/extra1' }]
    expect(parse104Payload({ ...payload(), jobs })?.jobs.map(job => job.sourceKey)).toEqual(jobs.map(job => job.sourceKey))
  })

  it('detects ready, expired, no-capture, and malformed payload states', () => {
    const now = Date.parse(capturedAt) + 1000
    expect(get104PayloadState(payload(), now).state).toBe('ready')
    expect(get104PayloadState(payload(), now + JOB104_PAYLOAD_TTL_MS + 1).state).toBe('expired')
    expect(get104PayloadState(null, now).state).toBe('no-capture')
    expect(get104PayloadState({ version: 99 }, now).state).toBe('malformed')
  })

  it('reports a missing extension when the bridge times out', async () => {
    const client = create104ConnectorClient(async () => null)
    await expect(client.status()).resolves.toEqual({ status: 'missing-extension', message: '尚未偵測到 Job Quest 104 Connector。' })
    expect(get104ConnectorMessage('missing-extension')).toBe('尚未偵測到 Job Quest 104 Connector。')
  })

  it('reports no capture and validates bridge payloads before returning them', async () => {
    const noCapture = create104ConnectorClient(async () => ({ status: 'no-capture' }))
    await expect(noCapture.getLatest()).resolves.toEqual({ status: 'no-capture' })

    const malformed = create104ConnectorClient(async () => ({ status: 'ready', payload: { ...payload(), version: 2 } as unknown as Job104Payload }))
    await expect(malformed.getLatest()).resolves.toMatchObject({ status: 'malformed' })
  })

  it('matches a payload only to the current verified keyword and location', () => {
    expect(payloadMatches104Search(payload(), '前端工程師', '台中市')).toBe(true)
    expect(payloadMatches104Search(payload(), '後端工程師', '台中市')).toBe(false)
    expect(payloadMatches104Search(payload(), '前端工程師', '台北市')).toBe(false)
  })

  it('normalizes a captured job and extracts skills from title plus snippet', () => {
    const captured: Job104Capture = {
      ...sampleJobs[0],
      title: 'Vue 前端工程師',
      snippetText: '使用 Vue 3、JavaScript、HTML、CSS 與 Git 開發公開網站。',
    }
    const job = normalize104CapturedJob(captured, capturedAt)
    expect(job).toMatchObject({ id: '104:844qv', source: '104', externalId: '844qv', salary: captured.salaryText, description: captured.snippetText, url: captured.canonicalUrl })
    expect(job.requiredSkills).toEqual(['HTML', 'CSS', 'JavaScript', 'Vue', 'Git'])
  })

  it('feeds real normalized jobs into matching and preserves evidence', () => {
    const captures: Job104Capture[] = [
      { ...sampleJobs[0], title: 'Vue 前端工程師', snippetText: '使用 Vue、JavaScript、HTML、CSS 與 Git 開發。' },
      { ...sampleJobs[1], title: 'React 前端工程師', snippetText: '需要 React、TypeScript 與 Git。' },
    ]
    const prepared = prepareResumeForMatching(resume)
    const matched = captures.map((capture) => {
      const job = normalize104CapturedJob(capture, capturedAt)
      return { job, match: calculateJobMatch(prepared, analyzeJobRequirements(job)) }
    })
    const sorted = sortMatchedJobs(matched)
    expect(sorted[0].job.externalId).toBe('844qv')
    expect(sorted[0].match.matchedSkills).toEqual(expect.arrayContaining(['Vue', 'JavaScript', 'HTML', 'CSS', 'Git']))
    expect(sorted[1].match.missingSkills).toEqual(expect.arrayContaining(['React', 'TypeScript']))
  })

  it('keeps stable sorting for repeated imports of the same payload', () => {
    const prepared = prepareResumeForMatching(resume)
    const entries = payload().jobs.slice(0, 5).map((capture) => {
      const job = normalize104CapturedJob(capture, capturedAt)
      return { job, match: calculateJobMatch(prepared, analyzeJobRequirements(job)) }
    })
    const tied = entries.slice(0, 3).map((entry) => ({
      job: { ...entry.job, publishedAt: capturedAt },
      match: { ...entry.match, matchScore: 50 },
    }))
    const expectedIds = tied.map((item) => item.job.id).sort((left, right) => left.localeCompare(right))
    expect(sortMatchedJobs(tied).map((item) => item.job.id)).toEqual(expectedIds)
    expect(sortMatchedJobs([...tied].reverse()).map((item) => item.job.id)).toEqual(expectedIds)
  })
})
