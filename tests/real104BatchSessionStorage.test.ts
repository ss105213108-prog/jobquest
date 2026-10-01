import { afterEach, describe, expect, it, vi } from 'vitest'
import { JOB104_PAYLOAD_TTL_MS } from '../src/integrations/job104/types'
import { createReal104BatchWorkingSet, REAL104_BATCH_KEY } from '../src/services/real104BatchWorkingSet'
import { createReal104BatchSessionStorage } from '../src/services/real104BatchSessionStorage'
import { REAL104_SESSION_KEY } from '../src/services/real104Session'
import type { Job, JobWithMatch, ResumeProfile } from '../src/types'
import { INTENT, NOW, UID, capture, ids, keys, names, profile } from './helpers/real104BatchContract'

function browserStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  let failRead = false
  let failWrite = false
  const storage = {
    getItem: (key: string) => { if (failRead) throw new Error('blocked read'); return values.get(key) ?? null },
    setItem: (key: string, value: string) => { if (failWrite) throw new Error('quota'); values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  vi.stubGlobal('window', { sessionStorage: storage })
  return { values, failReads: (value: boolean) => { failRead = value }, failWrites: (value: boolean) => { failWrite = value } }
}

const matchJobs = vi.fn(async (_resume: ResumeProfile, jobs: Job[]): Promise<JobWithMatch[]> =>
  jobs.map(job => ({ job, match: { jobId: job.id, matchScore: 0, matchLevel: 'C', matchedSkills: [], missingSkills: [], matchReasons: [] } })))
const batch = () => createReal104BatchWorkingSet({
  storage: createReal104BatchSessionStorage(), matchJobs, getConfirmedResume: () => profile,
})
const started = (at = NOW) => {
  const workingSet = batch()
  workingSet.startOrResumeSearch(INTENT, UID, at)
  return workingSet
}

afterEach(() => { vi.unstubAllGlobals(); matchJobs.mockClear() })

describe('REAL 104 batch sessionStorage adapter', () => {
  it('round-trips the versioned envelope with owner, fingerprint and canonical capturedAt', async () => {
    const { values } = browserStorage()
    const first = started()
    await first.addCapture(capture(['ja'], { at: NOW - 1000 }), UID, NOW)
    const raw = JSON.parse(values.get(REAL104_BATCH_KEY)!)
    expect(raw).toMatchObject({ version: 2, pendingJobs: [], ownerUid: UID, searchFingerprint: JSON.stringify(['REAL_104', INTENT.keyword, INTENT.region]), batchNumber: 1, phase: 'collecting' })
    expect(raw.currentBatchJobs[0].collectedAt).toBe(new Date(NOW - 1000).toISOString())
    const restored = batch().restore(UID, NOW)
    expect(restored.status).toBe('collecting')
    expect(keys(restored)).toEqual(ids('ja'))
    expect(restored.firstCapturedAt).toBe(new Date(NOW - 1000).toISOString())
  })

  it('restores a partial 27-job batch in first-accepted order', async () => {
    browserStorage()
    const first = started()
    await first.addCapture(capture(names(0, 10)), UID, NOW)
    await first.addCapture(capture(names(10, 10)), UID, NOW)
    await first.addCapture(capture(names(20, 7)), UID, NOW)
    const restored = batch().restore(UID, NOW)
    expect(restored.status).toBe('collecting')
    expect(restored.batchNumber).toBe(1)
    expect(keys(restored)).toEqual(ids(...names(0, 27)))
    expect(matchJobs).not.toHaveBeenCalled()
  })

  it('restores a presented current batch separately from earlier seen history', async () => {
    const { values } = browserStorage()
    const first = started()
    await first.addCapture(capture(['ja']), UID, NOW)
    await first.presentCurrentBatch(profile, UID, NOW)
    first.startNextBatch(UID, NOW)
    await first.addCapture(capture(['ja', 'jb']), UID, NOW)
    await first.presentCurrentBatch(profile, UID, NOW)
    const restored = batch().restore(UID, NOW)
    expect(restored.status).toBe('presented')
    expect(restored.batchNumber).toBe(2)
    expect(keys(restored)).toEqual(ids('jb'))
    expect(restored.seenSourceKeys).toEqual(ids('ja'))
    expect(JSON.parse(values.get(REAL104_BATCH_KEY)!).presentedAt).toBe(new Date(NOW).toISOString())
  })

  it('does not restore another UID’s current or seen history', async () => {
    browserStorage()
    const first = started()
    await first.addCapture(capture(['ja']), UID, NOW)
    await first.presentCurrentBatch(profile, UID, NOW)
    first.startNextBatch(UID, NOW)
    const other = batch().restore('owner-b', NOW)
    expect(other.status).toBe('owner-mismatch')
    expect(keys(other)).toEqual([])
    expect(other.seenSourceKeys).toEqual([])
    expect(batch().restore(UID, NOW).seenSourceKeys).toEqual(ids('ja'))
  })

  it('expires at the original 30-minute boundary', async () => {
    browserStorage()
    const at = NOW - JOB104_PAYLOAD_TTL_MS
    const first = started(at)
    await first.addCapture(capture(['ja'], { at }), UID, at)
    expect(batch().restore(UID, NOW).status).toBe('collecting')
    expect(batch().restore(UID, NOW + 1).status).toBe('expired')
  })

  it('later saved captures and a next-batch transition do not extend the earliest capturedAt TTL', async () => {
    const { values } = browserStorage()
    const at = NOW - JOB104_PAYLOAD_TTL_MS + 1000
    const first = started(at)
    await first.addCapture(capture(['ja'], { at }), UID, at)
    await first.presentCurrentBatch(profile, UID, at)
    first.startNextBatch(UID, NOW)
    await first.addCapture(capture(['jb'], { at: NOW }), UID, NOW)
    expect(JSON.parse(values.get(REAL104_BATCH_KEY)!).firstCapturedAt).toBe(new Date(at).toISOString())
    expect(batch().restore(UID, NOW + 1001).status).toBe('expired')
  })

  it.each(['not-json', JSON.stringify({ version: 3, ownerUid: UID })])('rejects corrupt JSON or an unsupported version without changing stored bytes: %s', raw => {
    const { values } = browserStorage({ [REAL104_BATCH_KEY]: raw })
    const restored = batch().restore(UID, NOW)
    expect(restored.status).toBe('corrupt')
    expect(keys(restored)).toEqual([])
    expect(values.get(REAL104_BATCH_KEY)).toBe(raw)
  })

  it('coexists with the legacy REAL session and only removes its own key', async () => {
    const legacy = JSON.stringify({ version: 1, mode: 'REAL_104', snapshot: { jobs: ['legacy'] } })
    const { values } = browserStorage({ [REAL104_SESSION_KEY]: legacy })
    started()
    expect(values.get(REAL104_SESSION_KEY)).toBe(legacy)
    const port = createReal104BatchSessionStorage()
    expect(() => port.removeItem(REAL104_SESSION_KEY)).toThrow()
    expect(values.get(REAL104_SESSION_KEY)).toBe(legacy)
    port.removeItem(REAL104_BATCH_KEY)
    expect(values.has(REAL104_BATCH_KEY)).toBe(false)
    expect(values.get(REAL104_SESSION_KEY)).toBe(legacy)
  })

  it('propagates browser read and write failures as typed Foundation errors without overwriting valid state', async () => {
    const browser = browserStorage()
    const first = started()
    await first.addCapture(capture(['ja']), UID, NOW)
    const original = browser.values.get(REAL104_BATCH_KEY)
    browser.failReads(true)
    expect(() => batch().restore(UID, NOW)).toThrowError(expect.objectContaining({ code: 'STORAGE_READ_FAILED' }))
    expect(() => first.startOrResumeSearch({ ...INTENT, keyword: '新搜尋' }, UID, NOW)).toThrowError(expect.objectContaining({ code: 'STORAGE_READ_FAILED' }))
    browser.failReads(false)
    browser.failWrites(true)
    await expect(first.addCapture(capture(['jb']), UID, NOW)).rejects.toMatchObject({ code: 'STORAGE_WRITE_FAILED' })
    browser.failWrites(false)
    expect(browser.values.get(REAL104_BATCH_KEY)).toBe(original)
    expect(keys(batch().restore(UID, NOW))).toEqual(ids('ja'))
  })
})
