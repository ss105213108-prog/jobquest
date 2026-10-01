import { describe, expect, it, vi } from 'vitest'
import { createReal104BatchWorkingSet, REAL104_BATCH_KEY, REAL104_BATCH_LEGACY_KEY } from '../src/services/real104BatchWorkingSet'
import { createReal104BatchSessionStorage } from '../src/services/real104BatchSessionStorage'
import { REAL104_SESSION_KEY } from '../src/services/real104Session'
import { INTENT, NOW, UID, capture, ids, keys, memoryStorage, names, normalized, profile } from './helpers/real104BatchContract'
import type { Job, JobWithMatch, ResumeProfile } from '../src/types'

const matching = () => vi.fn(async (_resume: ResumeProfile, jobs: Job[]): Promise<JobWithMatch[]> =>
  jobs.map(job => ({ job, match: { jobId: job.id, matchScore: 0, matchLevel: 'C', matchedSkills: [], missingSkills: [], matchReasons: [] } })))

function setup(initial: Record<string, string> = {}) {
  const { storage, values } = memoryStorage(initial)
  const matchJobs = matching()
  const port = createReal104BatchSessionStorage(() => storage)
  const create = () => createReal104BatchWorkingSet({ storage: port, matchJobs, getConfirmedResume: () => profile })
  return { storage, values, matchJobs, port, create }
}

function v1() {
  const at = new Date(NOW).toISOString()
  return JSON.stringify({ version: 1, ownerUid: UID, keyword: INTENT.keyword, region: INTENT.region,
    searchFingerprint: JSON.stringify(['REAL_104', INTENT.keyword, INTENT.region]), batchNumber: 1,
    phase: 'collecting', currentBatchJobs: normalized(capture(['legacy'])), seenSourceKeys: [], firstCapturedAt: at, presentedAt: null })
}

describe('REAL104 continuous batch v2 persistence boundaries', () => {
  it('22 + 20 yields 40 + pending 2; F5 and next batch retain every candidate exactly once', async () => {
    const harness = setup()
    const batch = harness.create()
    batch.startOrResumeSearch(INTENT, UID, NOW)
    await batch.addCapture(capture(names(0, 22), { page: 1 }), UID, NOW)
    const page2 = capture(names(22, 20), { page: 2 })
    const first = await batch.addCapture(page2, UID, NOW)
    expect(keys(first)).toEqual(ids(...names(0, 40)))
    expect(first.pendingJobs.map(entry => entry.job.id)).toEqual(ids(...names(40, 2)))
    expect(first.pendingJobs.map(entry => entry.validOrdinal)).toEqual([18, 19])
    expect(harness.matchJobs).toHaveBeenCalledOnce()
    first.pendingJobs[0].job.title = 'external mutation'
    const remount = harness.create()
    const restored = remount.restore(UID, NOW)
    expect(restored.pendingJobs[0].job.title).not.toBe('external mutation')
    expect(restored.pendingJobs[0].sourceUrl).toBe(page2.sourceUrl)
    const second = await remount.startNextBatch(UID, NOW)
    expect(keys(second)).toEqual(ids(...names(40, 2)))
    expect(second.pendingJobs).toEqual([])
    expect(second.seenSourceKeys).toEqual(ids(...names(0, 40)))
    const after = await remount.addCapture(capture([...names(0, 42), ...names(42, 5)], { page: 3 }), UID, NOW)
    expect(keys(after)).toEqual(ids(...names(40, 7)))
    expect(after.lastCapture).toEqual({ accepted: 5, skipped: 42, overflow: 0 })
    expect(harness.matchJobs).toHaveBeenCalledOnce()
  })

  it.each(['duplicate-pending', 'overlap-current', 'overlap-seen', 'null-pending', 'ordinal', 'source-url', 'capture-time', 'job-id', 'underfilled', 'version'])('rejects corrupt v2 %s without falling back to valid v1 or modifying bytes', async kind => {
    const harness = setup()
    const batch = harness.create()
    batch.startOrResumeSearch(INTENT, UID, NOW)
    await batch.addCapture(capture(names(0, 42)), UID, NOW)
    const state = JSON.parse(harness.values.get(REAL104_BATCH_KEY)!)
    if (kind === 'duplicate-pending') state.pendingJobs.push(state.pendingJobs[0])
    if (kind === 'overlap-current') state.pendingJobs[0].job = state.currentBatchJobs[0]
    if (kind === 'overlap-seen') state.seenSourceKeys.push(state.pendingJobs[0].job.id)
    if (kind === 'null-pending') state.pendingJobs = null
    if (kind === 'ordinal') state.pendingJobs[0].validOrdinal = -1
    if (kind === 'source-url') state.pendingJobs[0].sourceUrl = 'https://example.com/jobs/search/'
    if (kind === 'capture-time') state.pendingJobs[0].capturedAt = new Date(NOW + 1).toISOString()
    if (kind === 'job-id') state.pendingJobs[0].job.id = '104:wrong'
    if (kind === 'underfilled') { state.phase = 'collecting'; state.presentedAt = null; state.currentBatchJobs.pop() }
    if (kind === 'version') state.version = 3
    const raw = JSON.stringify(state)
    harness.values.set(REAL104_BATCH_KEY, raw)
    harness.values.set(REAL104_BATCH_LEGACY_KEY, v1())
    const restored = harness.create().restore(UID, NOW)
    expect(restored.status).toBe('corrupt')
    expect(restored.pendingJobs).toEqual([])
    expect(keys(restored)).toEqual([])
    expect(harness.values.get(REAL104_BATCH_KEY)).toBe(raw)
  })

  it('full pending next-batch Matching failure saves collecting 40 and remaining pending for F5 retry', async () => {
    const harness = setup()
    const batch = harness.create()
    batch.startOrResumeSearch(INTENT, UID, NOW)
    await batch.addCapture(capture(names(0, 91)), UID, NOW)
    harness.matchJobs.mockRejectedValueOnce(new Error('Matching failure'))
    await expect(batch.startNextBatch(UID, NOW)).rejects.toMatchObject({ code: 'MATCHING_FAILED' })
    const remount = harness.create()
    const restored = remount.restore(UID, NOW)
    expect(restored.status).toBe('collecting')
    expect(restored.batchNumber).toBe(2)
    expect(keys(restored)).toEqual(ids(...names(40, 40)))
    expect(restored.pendingJobs.map(entry => entry.job.id)).toEqual(ids(...names(80, 11)))
    expect(restored.seenSourceKeys).toEqual(ids(...names(0, 40)))
    const retry = await remount.presentCurrentBatch(profile, UID, NOW)
    expect(retry.status).toBe('presented')
    expect(retry.pendingJobs).toEqual(restored.pendingJobs)
  })

  it('migration write failure preserves v1 and propagates a typed error instead of claiming v2 restore', () => {
    const raw = v1()
    const harness = setup({ [REAL104_BATCH_LEGACY_KEY]: raw })
    const port = createReal104BatchSessionStorage(() => ({ ...harness.storage, setItem: () => { throw new Error('quota') } }))
    const batch = createReal104BatchWorkingSet({ storage: port, matchJobs: harness.matchJobs, getConfirmedResume: () => profile })
    expect(() => batch.restore(UID, NOW)).toThrowError(expect.objectContaining({ code: 'STORAGE_WRITE_FAILED' }))
    expect(harness.values.get(REAL104_BATCH_LEGACY_KEY)).toBe(raw)
    expect(harness.values.has(REAL104_BATCH_KEY)).toBe(false)
    expect(keys(harness.create().restore(UID, NOW))).toEqual(ids('legacy'))
  })

  it('never migrates old state owned by another UID', () => {
    const harness = setup({ [REAL104_BATCH_LEGACY_KEY]: v1() })
    expect(harness.create().restore('another-owner', NOW).status).toBe('owner-mismatch')
    expect(harness.values.has(REAL104_BATCH_KEY)).toBe(false)
  })

  it('clearing removes both batch versions without touching legacy REAL single-page data', () => {
    const harness = setup({ [REAL104_BATCH_LEGACY_KEY]: v1(), [REAL104_SESSION_KEY]: 'unchanged' })
    harness.create().restore(UID, NOW)
    expect(harness.values.has(REAL104_BATCH_KEY)).toBe(true)
    harness.port.removeItem(REAL104_BATCH_KEY)
    expect(harness.create().restore(UID, NOW).status).toBe('missing')
    expect(harness.values.get(REAL104_SESSION_KEY)).toBe('unchanged')
    expect(() => harness.port.setItem(REAL104_BATCH_LEGACY_KEY, 'bad')).toThrow()
  })
})
