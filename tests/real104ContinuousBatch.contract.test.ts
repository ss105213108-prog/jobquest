import { describe, expect, it, vi } from 'vitest'
import { JOB104_PAYLOAD_TTL_MS } from '../src/integrations/job104/types'
import { createReal104Session, readReal104Session, writeReal104Session } from '../src/services/real104Session'
import type { Real104BatchView } from '../src/services/real104BatchWorkingSet'
import type { Job } from '../src/types'
import { INTENT, NOW, UID, capture, harness, ids, keys, matcher, memoryStorage, names, normalized, profile, started } from './helpers/real104BatchContract'

type PendingEntry = { job: Job; sourceUrl: string; capturedAt: string; validOrdinal: number }
const pendingEntries = (view: Real104BatchView) => (view as Real104BatchView & { pendingJobs?: PendingEntry[] }).pendingJobs
const pendingKeys = (view: Real104BatchView) => pendingEntries(view)?.map(item => item.job.id)

async function fill38(batch: Awaited<ReturnType<typeof started>>, at = NOW) {
  for (let offset = 0; offset < 30; offset += 10)
    await batch.addCapture(capture(names(offset, 10), { page: 1 + offset / 10, at }), UID, at)
  return batch.addCapture(capture(names(30, 8), { page: 4, at }), UID, at)
}

describe('REAL104 continuous full-page allocation contract', () => {
  it('Page1=18, Page2=20, Page3=20 yields one ordered 40 and preserves Page3 remainder 18', async () => {
    const batch = await started()
    await batch.addCapture(capture(names(0, 18), { page: 1 }), UID, NOW)
    await batch.addCapture(capture(names(18, 20), { page: 2 }), UID, NOW)
    const result = await batch.addCapture(capture(names(38, 20), { page: 3 }), UID, NOW)
    expect(result.status).toBe('presented')
    expect(keys(result)).toEqual(ids(...names(0, 40)))
    expect(pendingKeys(result)).toEqual(ids(...names(40, 18)))
    expect(matcher).toHaveBeenCalledOnce()
    expect(matcher.mock.calls[0][1].map(job => job.id)).toEqual(ids(...names(0, 40)))
    expect(result.seenSourceKeys).toEqual([])
  })

  it('accepts variable 17, 19, 22-job pages without assuming twenty jobs per page', async () => {
    const batch = await started()
    await batch.addCapture(capture(names(0, 17), { page: 1 }), UID, NOW)
    await batch.addCapture(capture(names(17, 19), { page: 2 }), UID, NOW)
    const result = await batch.addCapture(capture(names(36, 22), { page: 3 }), UID, NOW)
    expect(keys(result)).toEqual(ids(...names(0, 40)))
    expect(pendingKeys(result)).toEqual(ids(...names(40, 18)))
  })

  it('stores overflow from a legal small capture with source-page provenance and consumes it first next batch', async () => {
    const batch = await started()
    await fill38(batch)
    const page = capture(names(38, 3), { page: 5 })
    const first = await batch.addCapture(page, UID, NOW)
    expect(keys(first)).toEqual(ids(...names(0, 40)))
    expect(pendingKeys(first)).toEqual(ids('j14'))
    expect(pendingEntries(first)?.[0]).toMatchObject({ sourceUrl: page.sourceUrl, capturedAt: page.capturedAt, validOrdinal: 2 })

    const next = await batch.startNextBatch(UID, NOW)
    expect(next.batchNumber).toBe(2)
    expect(keys(next)).toEqual(ids('j14'))
    expect(pendingKeys(next)).toEqual([])
    expect(next.seenSourceKeys).toEqual(ids(...names(0, 40)))
    const extended = await batch.addCapture(capture(['j15', 'j16'], { page: 6 }), UID, NOW)
    expect(keys(extended)).toEqual(ids('j14', 'j15', 'j16'))
  })

  it('preserves candidates beyond two batch capacities until each next-batch transition', async () => {
    const batch = await started()
    const all = names(0, 91)
    const first = await batch.addCapture(capture(all, { page: 1 }), UID, NOW)
    expect(keys(first)).toEqual(ids(...all.slice(0, 40)))
    expect(pendingKeys(first)).toEqual(ids(...all.slice(40)))
    const second = await batch.startNextBatch(UID, NOW)
    expect(keys(second)).toEqual(ids(...all.slice(40, 80)))
    expect(pendingKeys(second)).toEqual(ids(...all.slice(80)))
    const third = await batch.startNextBatch(UID, NOW)
    expect(keys(third)).toEqual(ids(...all.slice(80)))
    expect(pendingKeys(third)).toEqual([])
    expect(third.seenSourceKeys).toEqual(ids(...all.slice(0, 80)))
  })

  it('skips current, pending and seen sourceKeys when the same page is imported again', async () => {
    const batch = await started()
    await fill38(batch)
    const page = capture(names(38, 3), { page: 5 })
    await batch.addCapture(page, UID, NOW)
    await batch.startNextBatch(UID, NOW)
    const duplicate = await batch.addCapture(capture([...names(38, 3), 'j15'], { page: 5 }), UID, NOW)
    expect(keys(duplicate)).toEqual(ids('j14', 'j15'))
    expect(pendingKeys(duplicate)).toEqual([])
    expect(duplicate.seenSourceKeys).toEqual(ids(...names(0, 40)))
  })

  it('does not lose pending when Matching fails after filling current 40', async () => {
    const batch = await started()
    await fill38(batch)
    matcher.mockRejectedValueOnce(new Error('test-only Matching failure'))
    try { await batch.addCapture(capture(names(38, 3), { page: 5 }), UID, NOW) } catch { /* failure must leave collecting persisted */ }
    const restored = await batch.restore(UID, NOW)
    expect(restored.status).toBe('collecting')
    expect(keys(restored)).toEqual(ids(...names(0, 40)))
    expect(pendingKeys(restored)).toEqual(ids('j14'))
    expect(restored.seenSourceKeys).toEqual([])
    expect(matcher).toHaveBeenCalledOnce()
  })
})

describe('REAL104 continuous session, reset and compatibility contract', () => {
  it('F5 restores presented current, pending head, fingerprint and batch number without extending TTL', async () => {
    const { storage } = memoryStorage()
    const firstAt = NOW - 5000
    const first = await started(storage, INTENT, firstAt)
    await fill38(first, firstAt)
    await first.addCapture(capture(names(38, 3), { page: 5, at: NOW }), UID, NOW)
    const { batch: remount } = await harness(storage)
    const restored = await remount.restore(UID, NOW)
    expect(restored.status).toBe('presented')
    expect(keys(restored)).toEqual(ids(...names(0, 40)))
    expect(pendingKeys(restored)).toEqual(ids('j14'))
    expect(restored.batchNumber).toBe(1)
    expect(restored.searchFingerprint).toBe(JSON.stringify(['REAL_104', INTENT.keyword, INTENT.region]))
    expect(restored.firstCapturedAt).toBe(new Date(firstAt).toISOString())
    const next = await remount.startNextBatch(UID, NOW)
    expect(keys(next)).toEqual(ids('j14'))
    expect(next.seenSourceKeys).toEqual(ids(...names(0, 40)))
    expect(next.firstCapturedAt).toBe(restored.firstCapturedAt)
  })

  it('F5 preserves collecting 40 plus pending after a failed auto-Matching attempt', async () => {
    const { storage } = memoryStorage()
    const first = await started(storage)
    await fill38(first)
    matcher.mockRejectedValueOnce(new Error('test-only Matching failure'))
    try { await first.addCapture(capture(names(38, 3), { page: 5 }), UID, NOW) } catch { /* expected */ }
    const { batch: remount } = await harness(storage)
    const restored = await remount.restore(UID, NOW)
    expect(restored.status).toBe('collecting')
    expect(keys(restored)).toEqual(ids(...names(0, 40)))
    expect(pendingKeys(restored)).toEqual(ids('j14'))
  })

  it('F5 in batch 2 restores consumed pending before later-page jobs and preserves seen history', async () => {
    const { storage } = memoryStorage()
    const first = await started(storage)
    await fill38(first)
    await first.addCapture(capture(names(38, 3), { page: 5 }), UID, NOW)
    await first.startNextBatch(UID, NOW)
    await first.addCapture(capture(['j15', 'j16'], { page: 6 }), UID, NOW)
    const { batch: remount } = await harness(storage)
    const restored = await remount.restore(UID, NOW)
    expect(restored.status).toBe('collecting')
    expect(restored.batchNumber).toBe(2)
    expect(keys(restored)).toEqual(ids('j14', 'j15', 'j16'))
    expect(pendingKeys(restored)).toEqual([])
    expect(restored.seenSourceKeys).toEqual(ids(...names(0, 40)))
    expect(restored.searchFingerprint).toBe(JSON.stringify(['REAL_104', INTENT.keyword, INTENT.region]))
  })

  it('resubmitting the same fingerprint preserves current, pending, seen and capturedAt', async () => {
    const batch = await started()
    await fill38(batch)
    const before = await batch.addCapture(capture(names(38, 3), { page: 5 }), UID, NOW)
    const after = await batch.startOrResumeSearch({ ...INTENT, keyword: ` ${INTENT.keyword} ` }, UID, NOW)
    expect(keys(after)).toEqual(keys(before))
    expect(pendingKeys(after)).toEqual(ids('j14'))
    expect(after.seenSourceKeys).toEqual(before.seenSourceKeys)
    expect(after.batchNumber).toBe(before.batchNumber)
    expect(after.firstCapturedAt).toBe(before.firstCapturedAt)
  })

  it('a different UID cannot recover current, pending, seen or the continuation position', async () => {
    const { storage } = memoryStorage()
    const first = await started(storage)
    await fill38(first)
    await first.addCapture(capture(names(38, 3), { page: 5 }), UID, NOW)
    const { batch: remount } = await harness(storage)
    const other = await remount.restore('different-owner', NOW)
    expect(other.status).toBe('owner-mismatch')
    expect(keys(other)).toEqual([])
    expect(pendingKeys(other)).toEqual([])
    expect(other.seenSourceKeys).toEqual([])
    expect(other.searchFingerprint).toBeNull()
  })

  it.each([
    ['keyword', { ...INTENT, keyword: '後端工程師' }],
    ['region', { ...INTENT, region: '台北市' }],
  ])('%s reset clears current, pending, seen, cursor, batch number and TTL anchor', async (_label, changed) => {
    const batch = await started()
    await fill38(batch)
    await batch.addCapture(capture(names(38, 3), { page: 5 }), UID, NOW)
    await batch.startNextBatch(UID, NOW)
    const reset = await batch.startOrResumeSearch(changed, UID, NOW)
    expect(reset.searchFingerprint).toBe(JSON.stringify(['REAL_104', changed.keyword, changed.region]))
    expect(reset.batchNumber).toBe(1)
    expect(keys(reset)).toEqual([])
    expect(pendingKeys(reset)).toEqual([])
    expect(reset.seenSourceKeys).toEqual([])
    expect(reset.firstCapturedAt).toBeNull()
  })

  it('the earliest capturedAt still expires the entire current/pending/seen history at 30 minutes + 1 ms', async () => {
    const { storage } = memoryStorage()
    const firstAt = NOW - JOB104_PAYLOAD_TTL_MS
    const first = await started(storage, INTENT, firstAt)
    await fill38(first, firstAt)
    await first.addCapture(capture(names(38, 3), { page: 5, at: NOW }), UID, NOW)
    const { batch: remount } = await harness(storage)
    expect(pendingKeys(await remount.restore(UID, NOW))).toEqual(ids('j14'))
    const expired = await remount.restore(UID, NOW + 1)
    expect(expired.status).toBe('expired')
    expect(keys(expired)).toEqual([])
    expect(pendingKeys(expired)).toEqual([])
    expect(expired.seenSourceKeys).toEqual([])
  })

  it('a failed pending write leaves the previous current/cursor recoverable and does not claim import success', async () => {
    const values = new Map<string, string>()
    let failWrite = false
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { if (failWrite) throw new Error('quota'); values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
    const first = await started(storage)
    await fill38(first)
    const before = [...values.entries()]
    failWrite = true
    await expect(first.addCapture(capture(names(38, 3), { page: 5 }), UID, NOW)).rejects.toBeDefined()
    expect([...values.entries()]).toEqual(before)
    failWrite = false
    const { batch: remount } = await harness(storage)
    expect(keys(await remount.restore(UID, NOW))).toEqual(ids(...names(0, 38)))
  })

  it('a failed next-batch write leaves the presented 40 and pending queue unchanged', async () => {
    const values = new Map<string, string>()
    let failWrite = false
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { if (failWrite) throw new Error('quota'); values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
    const first = await started(storage)
    await fill38(first)
    await first.addCapture(capture(names(38, 3), { page: 5 }), UID, NOW)
    const before = [...values.entries()]
    failWrite = true
    let rejected = false
    try { await first.startNextBatch(UID, NOW) } catch { rejected = true }
    expect(rejected).toBe(true)
    expect([...values.entries()]).toEqual(before)
    failWrite = false
    const { batch: remount } = await harness(storage)
    const restored = await remount.restore(UID, NOW)
    expect(restored.status).toBe('presented')
    expect(keys(restored)).toEqual(ids(...names(0, 40)))
    expect(pendingKeys(restored)).toEqual(ids('j14'))
  })

  it('migrates a valid old Batch v1 without inventing previously dropped overflow', async () => {
    const at = new Date(NOW).toISOString()
    const { storage, values } = memoryStorage({
      'jobQuest.real104Batch.v1': JSON.stringify({ version: 1, ownerUid: UID,
        keyword: INTENT.keyword, region: INTENT.region,
        searchFingerprint: JSON.stringify(['REAL_104', INTENT.keyword, INTENT.region]),
        batchNumber: 1, phase: 'collecting', currentBatchJobs: normalized(capture(['ja'], { at: NOW })),
        seenSourceKeys: [], firstCapturedAt: at, presentedAt: null }),
    })
    const { batch } = await harness(storage)
    const restored = await batch.restore(UID, NOW)
    expect(keys(restored)).toEqual(ids('ja'))
    expect(pendingKeys(restored)).toEqual([])
    expect(values.has('jobQuest.real104Batch.v2')).toBe(true)
  })

  it('migrates a presented Batch v1 with its current and seen keys, but no invented pending', async () => {
    const at = new Date(NOW).toISOString()
    const { storage, values } = memoryStorage({
      'jobQuest.real104Batch.v1': JSON.stringify({ version: 1, ownerUid: UID,
        keyword: INTENT.keyword, region: INTENT.region,
        searchFingerprint: JSON.stringify(['REAL_104', INTENT.keyword, INTENT.region]),
        batchNumber: 2, phase: 'presented', currentBatchJobs: normalized(capture(['jc'], { at: NOW })),
        seenSourceKeys: ids('ja', 'jb'), firstCapturedAt: at, presentedAt: at }),
    })
    const { batch } = await harness(storage)
    const restored = await batch.restore(UID, NOW)
    expect(restored.status).toBe('presented')
    expect(restored.batchNumber).toBe(2)
    expect(keys(restored)).toEqual(ids('jc'))
    expect(restored.seenSourceKeys).toEqual(ids('ja', 'jb'))
    expect(pendingKeys(restored)).toEqual([])
    expect(values.has('jobQuest.real104Batch.v2')).toBe(true)
  })

  it('a corrupt v2 takes precedence over an otherwise valid old Batch v1', async () => {
    const at = new Date(NOW).toISOString()
    const { storage } = memoryStorage({
      'jobQuest.real104Batch.v1': JSON.stringify({ version: 1, ownerUid: UID,
        keyword: INTENT.keyword, region: INTENT.region,
        searchFingerprint: JSON.stringify(['REAL_104', INTENT.keyword, INTENT.region]),
        batchNumber: 1, phase: 'collecting', currentBatchJobs: normalized(capture(['ja'], { at: NOW })),
        seenSourceKeys: [], firstCapturedAt: at, presentedAt: null }),
      'jobQuest.real104Batch.v2': '{not-json',
    })
    const { batch } = await harness(storage)
    const restored = await batch.restore(UID, NOW)
    expect(restored.status).toBe('corrupt')
    expect(keys(restored)).toEqual([])
    expect(pendingKeys(restored)).toEqual([])
  })

  it('keeps the older REAL single-page session readable with its own ten-job limit', () => {
    const { storage } = memoryStorage()
    const legacy = createReal104Session(normalized(capture(['ja', 'jb'])), INTENT.keyword, INTENT.region, new Date(NOW).toISOString(), NOW)
    expect(legacy.status).toBe('ready')
    expect(writeReal104Session(legacy, storage)).toBe(true)
    expect(readReal104Session(storage, NOW).snapshot?.jobs.map(job => job.id)).toEqual(ids('ja', 'jb'))
    const tooMany = createReal104Session(normalized(capture(names(0, 11))), INTENT.keyword, INTENT.region, new Date(NOW).toISOString(), NOW)
    expect(tooMany.status).toBe('corrupt')
  })
})
