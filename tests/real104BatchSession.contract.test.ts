import { describe, expect, it } from 'vitest'
import { get104PayloadState } from '../src/integrations/job104/schema'
import { JOB104_PAYLOAD_TTL_MS } from '../src/integrations/job104/types'
import { INTENT, NOW, UID, capture, harness, ids, keys, memoryStorage, names, profile, started } from './helpers/real104BatchContract'

const safeAdd = async (batch: Awaited<ReturnType<typeof started>>, value: unknown, now = NOW) => {
  try { await batch.addCapture(value, UID, now) } catch { /* Invalid input may reject via a typed error. */ }
  return batch.restore(UID, now)
}

describe('REAL 104 batch working set: malformed input and storage', () => {
  it('G30: one malformed job rejects the entire capture; earlier valid collection stays usable', async () => {
    const batch = await started()
    await batch.addCapture(capture(['ja']), UID, NOW)
    const mixed = capture(['jb', 'jc']) as unknown as { jobs: Array<Record<string, unknown>> }
    mixed.jobs[1].sourceKey = undefined
    expect(get104PayloadState(mixed, NOW).state).toBe('malformed')
    const view = await safeAdd(batch, mixed)
    expect(keys(view)).toEqual(ids('ja'))
    expect(view.seenSourceKeys).toEqual([])
  })

  it('G31–G32: missing canonical sourceKey in a later capture cannot destroy valid current jobs', async () => {
    const batch = await started()
    await batch.addCapture(capture(['ja', 'jb']), UID, NOW)
    const malformed = capture(['jc']) as unknown as { jobs: Array<Record<string, unknown>> }
    delete malformed.jobs[0].sourceKey
    expect(keys(await safeAdd(batch, malformed))).toEqual(ids('ja', 'jb'))
  })

  it('G33: an empty capture does not mutate current or seen', async () => {
    const batch = await started()
    await batch.addCapture(capture(['ja']), UID, NOW)
    const before = await batch.restore(UID, NOW)
    const after = await safeAdd(batch, null)
    expect(keys(after)).toEqual(keys(before))
    expect(after.seenSourceKeys).toEqual(before.seenSourceKeys)
    expect(after.firstCapturedAt).toBe(before.firstCapturedAt)
  })

  // Supersedes the ten-job capture ceiling; field/identity/TTL validation stays.
  it('G34, L60–L61 superseded: a valid full-page payload above ten jobs is accepted in source order', async () => {
    const batch = await started()
    const page = capture(names(0, 11))
    expect(get104PayloadState(page, NOW).state).toBe('ready')
    const view = await batch.addCapture(page, UID, NOW)
    expect(keys(view)).toEqual(ids(...names(0, page.jobs.length)))
    expect(view.status).toBe('collecting')
    expect(view.seenSourceKeys).toEqual([])
  })

  it('I40, I43–I44: F5 restores partial jobs, original times, batch number and fingerprint', async () => {
    const { storage } = memoryStorage()
    const first = await started(storage)
    await first.addCapture(capture(['ja', 'jb'], { at: NOW - 1000 }), UID, NOW)
    const { batch: remount } = await harness(storage)
    const restored = await remount.restore(UID, NOW)
    expect(restored.status).toBe('collecting')
    expect(keys(restored)).toEqual(ids('ja', 'jb'))
    expect(restored.currentBatchJobs.map(job => job.collectedAt)).toEqual([new Date(NOW - 1000).toISOString(), new Date(NOW - 1000).toISOString()])
    expect(restored.batchNumber).toBe(1)
    expect(restored.searchFingerprint).toBe(JSON.stringify(['REAL_104', INTENT.keyword, INTENT.region]))
  })

  it('I41–I42: F5 restores displayed current separately from previous seen history', async () => {
    const { storage } = memoryStorage()
    const first = await started(storage)
    await first.addCapture(capture(['ja']), UID, NOW)
    await first.presentCurrentBatch(profile, UID, NOW)
    await first.startNextBatch(UID, NOW)
    await first.addCapture(capture(['jb']), UID, NOW)
    await first.presentCurrentBatch(profile, UID, NOW)
    const { batch: remount } = await harness(storage)
    const view = await remount.restore(UID, NOW)
    expect(view.status).toBe('presented')
    expect(keys(view)).toEqual(ids('jb'))
    expect(view.seenSourceKeys).toEqual(ids('ja'))
    const third = await remount.startNextBatch(UID, NOW)
    expect(third.seenSourceKeys).toEqual(ids('ja', 'jb'))
  })

  it('I45–I46: another UID cannot restore a current or seen history', async () => {
    const { storage } = memoryStorage()
    const owner = await started(storage)
    await owner.addCapture(capture(['ja']), UID, NOW)
    await owner.presentCurrentBatch(profile, UID, NOW)
    await owner.startNextBatch(UID, NOW)
    const { batch: other } = await harness(storage)
    const view = await other.restore('anonymous-owner-b', NOW)
    expect(view.status).not.toBe('presented')
    expect(keys(view)).toEqual([])
    expect(view.seenSourceKeys).toEqual([])
  })

  it('I47–I48: original capturedAt remains valid at exactly 30 minutes and expires one millisecond later', async () => {
    const { storage } = memoryStorage()
    const old = NOW - JOB104_PAYLOAD_TTL_MS
    const first = await started(storage, INTENT, old)
    await first.addCapture(capture(['ja'], { at: old }), UID, old)
    const { batch: remount } = await harness(storage)
    expect(keys(await remount.restore(UID, NOW))).toEqual(ids('ja'))
    const expired = await remount.restore(UID, NOW + 1)
    expect(expired.status).toBe('expired')
    expect(keys(expired)).toEqual([])
  })

  it('I49: a later accepted capture cannot refresh the original thirty-minute deadline', async () => {
    const { storage } = memoryStorage()
    const firstAt = NOW - JOB104_PAYLOAD_TTL_MS + 1000
    const batch = await started(storage, INTENT, firstAt)
    await batch.addCapture(capture(['ja'], { at: firstAt }), UID, firstAt)
    await batch.addCapture(capture(['jb'], { at: NOW }), UID, NOW)
    const { batch: remount } = await harness(storage)
    const view = await remount.restore(UID, NOW + 1001)
    expect(view.status).toBe('expired')
    expect(keys(view)).toEqual([])
  })

  it('I49: a previously captured but still valid payload can only move the anchor earlier', async () => {
    const batch = await started()
    await batch.addCapture(capture(['ja'], { at: NOW - 1000 }), UID, NOW)
    const view = await batch.addCapture(capture(['jb'], { at: NOW - 2000 }), UID, NOW)
    expect(view.firstCapturedAt).toBe(new Date(NOW - 2000).toISOString())
  })

  it('I50: corrupt batch state cannot silently restore old REAL v1 or Demo content', async () => {
    const { storage, values } = memoryStorage()
    const batch = await started(storage)
    await batch.addCapture(capture(['ja']), UID, NOW)
    const batchKey = [...values.keys()].find(key => key.includes('real104Batch'))
    expect(batchKey).toBeDefined()
    values.set(batchKey!, 'not-json')
    values.set('jobQuest.real104Session.v1', JSON.stringify({ version: 1, mode: 'DEMO_LOCAL', snapshot: null }))
    const { batch: remount } = await harness(storage)
    const view = await remount.restore(UID, NOW)
    expect(view.status).toBe('corrupt')
    expect(keys(view)).toEqual([])
  })

  it('atomic save failure leaves the previously saved current batch recoverable', async () => {
    const values = new Map<string, string>()
    let fail = false
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { if (fail) throw new Error('quota'); values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
    const batch = await started(storage)
    await batch.addCapture(capture(['ja']), UID, NOW)
    fail = true
    try { await batch.addCapture(capture(['jb']), UID, NOW) } catch { /* save failure */ }
    fail = false
    const { batch: remount } = await harness(storage)
    expect(keys(await remount.restore(UID, NOW))).toEqual(ids('ja'))
  })

  it('a transient storage read failure cannot overwrite a valid batch during search reset', async () => {
    const values = new Map<string, string>()
    let failRead = false
    const storage = {
      getItem: (key: string) => { if (failRead) throw new Error('blocked read'); return values.get(key) ?? null },
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
    const batch = await started(storage)
    await batch.addCapture(capture(['ja']), UID, NOW)
    const original = [...values.values()]
    failRead = true
    expect(() => batch.startOrResumeSearch({ ...INTENT, keyword: '另一關鍵字' }, UID, NOW))
      .toThrowError(expect.objectContaining({ code: 'STORAGE_READ_FAILED' }))
    expect([...values.values()]).toEqual(original)
    failRead = false
    expect(keys(await batch.restore(UID, NOW))).toEqual(ids('ja'))
  })

  it('tab-scoped storage is the only batch history source', async () => {
    const first = await started(memoryStorage().storage)
    await first.addCapture(capture(['ja']), UID, NOW)
    const freshTab = await started(memoryStorage().storage)
    const view = await freshTab.restore(UID, NOW)
    expect(keys(view)).toEqual([])
    expect(view.seenSourceKeys).toEqual([])
  })
})
