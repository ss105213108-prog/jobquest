import { describe, expect, it } from 'vitest'
import sampleJobs from '../experiments/104-browser-connector/sample-output.json'
import { normalize104CapturedJob } from '../src/integrations/job104/normalize104CapturedJob'
import { JOB104_MAX_JOBS, JOB104_PAYLOAD_TTL_MS } from '../src/integrations/job104/types'
import { location104Map } from '../src/integrations/job104/locationMap'
import { createReal104Session, readReal104Session, writeReal104Session, validateReal104Session, REAL104_SESSION_KEY } from '../src/services/real104Session'

const now = Date.parse('2026-09-29T04:00:00Z')
const stored = (capturedAt = new Date(now).toISOString()) => ({ version: 1, mode: 'REAL_104', snapshot: {
  jobs: sampleJobs.slice(0, 2).map(job => normalize104CapturedJob(job, capturedAt)), keyword: '前端工程師', location: '台中市', capturedAt, importedAt: new Date(now).toISOString(),
} })
const storage = (value?: unknown) => {
  const values = new Map<string, string>()
  if (value !== undefined) values.set(REAL104_SESSION_KEY, typeof value === 'string' ? value : JSON.stringify(value))
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, text: string) => { values.set(key, text) }, values }
}
describe('minimal REAL 104 public working-session storage', () => {
  it.each(Object.keys(location104Map))('restores the exact approved region %s through the unchanged session validator', location => {
    const raw = stored()
    raw.snapshot.location = location
    const restored = readReal104Session(storage(raw), now)
    expect(restored).toEqual({ mode: 'REAL_104', status: 'ready', snapshot: raw.snapshot })
  })
  it('uses the explicit default selection contract on a fresh tab without manufacturing jobs', () => {
    const port = storage()
    expect(readReal104Session(port, now)).toEqual({ mode: null, status: 'missing', snapshot: null })
    expect(port.values.size).toBe(0)
  })
  it('restores REAL mode, public normalized jobs, search and original capture/import timestamps', () => {
    const raw = stored(), port = storage(raw)
    const session = readReal104Session(port, now)
    expect(session).toEqual({ mode: 'REAL_104', status: 'ready', snapshot: raw.snapshot })
    for (const job of session.snapshot!.jobs) {
      expect(job.id).toBe(`104:${job.externalId}`)
      expect(job.url).toBe(`https://www.104.com.tw/job/${job.externalId}`)
    }
  })
  it('keeps explicit REAL selection with a re-import requirement when no jobs exist', () => {
    const port = storage()
    expect(writeReal104Session({ mode: 'REAL_104', status: 'missing', snapshot: null }, port)).toBe(true)
    expect(readReal104Session(port, now)).toEqual({ mode: 'REAL_104', status: 'missing', snapshot: null })
  })
  it('preserves explicit Demo selection without converting cached REAL jobs to fixtures', () => {
    const raw = stored(), port = storage({ ...raw, mode: 'DEMO_LOCAL' })
    expect(readReal104Session(port, now)).toMatchObject({ mode: 'DEMO_LOCAL', status: 'ready', snapshot: raw.snapshot })
  })
  it('accepts the same inclusive TTL boundary and expires one millisecond later', () => {
    const raw = stored(new Date(now - JOB104_PAYLOAD_TTL_MS).toISOString())
    expect(validateReal104Session(raw, now).status).toBe('ready')
    expect(validateReal104Session(raw, now + 1)).toEqual({ mode: 'REAL_104', status: 'expired', snapshot: null })
  })
  it('never extends freshness using a newer import timestamp and drops stale jobs durably', () => {
    const raw = stored(new Date(now - JOB104_PAYLOAD_TTL_MS - 1).toISOString()), port = storage(raw)
    expect(readReal104Session(port, now)).toEqual({ mode: 'REAL_104', status: 'expired', snapshot: null })
    expect(JSON.parse(port.getItem(REAL104_SESSION_KEY)!)).toMatchObject({ mode: 'REAL_104', snapshot: null, issue: 'expired' })
    expect(readReal104Session(port, now + 1000).status).toBe('expired')
  })
  it('reuses the accepted Connector future-clock tolerance', () => {
    expect(validateReal104Session(stored(new Date(now + 2 * 60 * 1000).toISOString()), now).status).toBe('ready')
    expect(validateReal104Session(stored(new Date(now + 5 * 60 * 1000 + 1).toISOString()), now).status).toBe('corrupt')
  })
  it.each(['not-json', 'null', '[]', '{"version":2,"mode":"REAL_104"}', '{"version":1,"mode":"UNKNOWN","snapshot":null}'])('discards malformed cache %s without a silent Demo fallback', value => {
    const port = storage(value)
    expect(readReal104Session(port, now)).toEqual({ mode: 'REAL_104', status: 'corrupt', snapshot: null })
    expect(JSON.parse(port.getItem(REAL104_SESSION_KEY)!)).toMatchObject({ mode: 'REAL_104', snapshot: null, issue: 'corrupt' })
  })
  it.each(['id', 'url', 'source', 'requiredSkills', 'publishedAt'] as const)('rejects inconsistent job field %s without partial restore', field => {
    const raw = stored()
    ;(raw.snapshot.jobs[1] as any)[field] = field === 'requiredSkills' ? [1] : 'invalid'
    expect(validateReal104Session(raw, now)).toEqual({ mode: 'REAL_104', status: 'corrupt', snapshot: null })
  })
  it('rejects duplicate canonical IDs and arrays outside the accepted maximum', () => {
    const raw = stored()
    raw.snapshot.jobs.push(raw.snapshot.jobs[0])
    expect(validateReal104Session(raw, now).status).toBe('corrupt')
    raw.snapshot.jobs = Array.from({ length: JOB104_MAX_JOBS + 1 }, () => raw.snapshot.jobs[0])
    expect(validateReal104Session(raw, now).status).toBe('corrupt')
    raw.snapshot.jobs = []
    expect(validateReal104Session(raw, now).status).toBe('corrupt')
  })
  it('rejects a Demo fixture in a REAL cache even if its title/company match', () => {
    const raw = stored()
    raw.snapshot.jobs[1].id = '104-01'
    raw.snapshot.jobs[1].externalId = 'mock-104-1001'
    expect(validateReal104Session(raw, now).status).toBe('corrupt')
  })
  it.each(['capturedAt', 'importedAt', 'keyword', 'location'] as const)('rejects invalid snapshot metadata %s', field => {
    const raw = stored()
    ;(raw.snapshot as any)[field] = field === 'location' ? 'unapproved location' : field === 'keyword' ? '' : 'invalid time'
    expect(validateReal104Session(raw, now).status).toBe('corrupt')
  })
  it('writes only public fields and never match scores, credentials, resume or Connector envelope', () => {
    const raw = stored(), port = storage()
    const session = createReal104Session(raw.snapshot.jobs, raw.snapshot.keyword, raw.snapshot.location, raw.snapshot.capturedAt, now)
    Object.assign(session, { credentials: 'DO-NOT-STORE', resume: 'DO-NOT-STORE', matches: [{ score: 99 }] })
    Object.assign(session.snapshot!, { cookies: 'DO-NOT-STORE', sourceUrl: 'DO-NOT-STORE' })
    Object.assign(session.snapshot!.jobs[0], { rawHtml: 'DO-NOT-STORE', matchScore: 99, token: 'DO-NOT-STORE' })
    expect(writeReal104Session(session, port)).toBe(true)
    const text = port.getItem(REAL104_SESSION_KEY)!
    expect(text).not.toMatch(/DO-NOT-STORE|credentials|cookies|rawHtml|matchScore|matches|sourceUrl|resume|token/)
    expect(readReal104Session(port, now).snapshot).toEqual(raw.snapshot)
  })
  it('handles unavailable/blocked storage safely without claiming a saved session', () => {
    expect(readReal104Session(null, now)).toMatchObject({ mode: null, status: 'missing' })
    expect(writeReal104Session({ mode: 'REAL_104', snapshot: null, status: 'missing' }, null)).toBe(false)
    const port = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('quota') } }
    expect(readReal104Session(port, now)).toMatchObject({ mode: 'REAL_104', status: 'corrupt', snapshot: null })
    expect(writeReal104Session({ mode: 'REAL_104', snapshot: null, status: 'missing' }, port)).toBe(false)
  })
})
