import { describe, expect, it, vi } from 'vitest'
import sample from '../experiments/104-browser-connector/sample-output.json'
import { normalize104CapturedJob } from '../src/integrations/job104/normalize104CapturedJob'
import { restoreJobSnapshot, serializeJobSnapshot } from '../src/services/jobSnapshot'
import { matchingService } from '../src/services/matchingService'
import type { ResumeProfile } from '../src/types'
vi.mock('../src/services/serviceSupport', async original => ({ ...await original<typeof import('../src/services/serviceSupport')>(), wait: async () => {}, shouldMockFail: () => false }))
const capturedAt = '2026-09-29T04:00:00.000Z'
const job = (snippetText?: string, experienceText?: string) => normalize104CapturedJob({ ...sample[0], snippetText, experienceText }, capturedAt)
const profile: ResumeProfile = { id: 'confirmed', name: 'Candidate', skills: ['React', 'JavaScript'], projects: [], workExperiences: [], education: { school: '', department: '', graduationStatus: '' }, careerDirections: [], updatedAt: capturedAt, level: 1, abilities: [] }

describe('closed V1 public normalized job snapshot', () => {
  it.each([[undefined, undefined], [' React / JavaScript 公開摘要 ', ' 3年以上 ']])('round-trips normalized facts and identical existing matching results (%s)', async (snippet, experience) => {
    const current = job(snippet, experience), snapshot = serializeJobSnapshot(current)!
    expect(Object.keys(snapshot).sort()).toEqual(['schemaVersion', 'sourceKey', 'title', 'company', 'location', 'salary', 'experience', 'description', 'capturedAt'].sort())
    expect(snapshot.description).toBe(current.description)
    const restored = restoreJobSnapshot(snapshot, current.id, current.source)!
    expect(restored).toEqual(current)
    expect(await matchingService.matchJobs(profile, [restored])).toEqual(await matchingService.matchJobs(profile, [current]))
    expect(restored.url).toBe('https://www.104.com.tw/job/844qv')
    expect(snapshot).not.toHaveProperty('matchScore')
    expect(snapshot).not.toHaveProperty('url')
  })
  it('does not refresh capture time or apply working-session TTL to persisted facts', () => {
    const ancient = { ...job(), publishedAt: '2020-01-01T00:00:00.000Z', collectedAt: '2020-01-01T00:00:00.000Z' }
    expect(restoreJobSnapshot(serializeJobSnapshot(ancient), ancient.id, '104')).toEqual(ancient)
  })
  it.each([null, [], {}, 'not JSON', { schemaVersion: 2 }, { description: undefined }, { description: null }, { salary: '' }, { experience: '  ' }, { capturedAt: 'invalid' }, { capturedAt: '2026-09-29' }, { rawHtml: '<html>private</html>' }, { sourceKey: '104:other' }])('rejects malformed/unsupported metadata without fabricating a job: %j', change => {
    const value = change && typeof change === 'object' && !Array.isArray(change) ? { ...serializeJobSnapshot(job()), ...change } : change
    // Empty object itself is invalid, rather than a request to patch a valid object.
    expect(restoreJobSnapshot(change && Object.keys(change).length ? value : change, '104:844qv', '104')).toBeNull()
  })
  it('requires every field and accepts only the authoritative REAL key/source', () => {
    const snapshot = serializeJobSnapshot(job())!
    for (const key of Object.keys(snapshot)) {
      const incomplete = { ...snapshot }; delete (incomplete as any)[key]
      expect(restoreJobSnapshot(incomplete, job().id, '104')).toBeNull()
    }
    for (const [key, source] of [['104:other', '104'], ['104-01', '104'], ['1111-01', '1111'], ['104:844qv', '1111'], ['104:844QV', '104']]) expect(restoreJobSnapshot(snapshot, key, source)).toBeNull()
  })
  it.each([{ url: 'https://evil.invalid/job/844qv' }, { externalId: 'other' }, { category: 'guessed category' }, { requiredSkills: ['invented'] }, { status: 'closed' as const }, { publishedAt: '2020-01-01T00:00:00.000Z' }, { id: '104-01' }, { description: ' unnormalized ' }])('refuses non-normalizer input: %j', patch => {
    expect(serializeJobSnapshot({ ...job(), ...patch })).toBeNull()
  })
  it('ignores unrelated input properties while projecting only the approved nine fields', () => {
    const snapshot = serializeJobSnapshot({ ...job(), rawHtml: 'private', matchScore: 99 } as any)!
    expect(snapshot).toEqual(serializeJobSnapshot(job()))
    expect(JSON.stringify(snapshot)).not.toContain('private')
  })
})
