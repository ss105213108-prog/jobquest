import { describe, expect, it } from 'vitest'
import { INTENT, NOW, UID, capture, harness, ids, keys, matcher, names, profile, started } from './helpers/real104BatchContract'

const fill = async (batch: Awaited<ReturnType<typeof started>>, start = 0, count = 40) => {
  let view
  for (let offset = 0; offset < count; offset += 10) {
    view = await batch.addCapture(capture(names(start + offset, Math.min(10, count - offset)), { page: 1 + offset / 10 }), UID, NOW)
  }
  return view!
}

describe('REAL 104 batch working set: fingerprint and reset', () => {
  it('A1–A2: same intent and surrounding keyword whitespace share one trim-only fingerprint', async () => {
    const batch = await started()
    const first = await batch.restore(UID, NOW)
    const same = await batch.startOrResumeSearch({ ...INTENT, keyword: '  工程師  ' }, UID, NOW)
    expect(same.searchFingerprint).toBe(first.searchFingerprint)
    expect(same.searchFingerprint).toBe(JSON.stringify(['REAL_104', '工程師', '台中市']))
  })

  it.each([
    ['A3: keyword', { ...INTENT, keyword: '後端工程師' }],
    ['A4: region', { ...INTENT, region: '台北市' }],
  ])('%s changes the fingerprint and clears the earlier search history', async (_label, changed) => {
    const batch = await started()
    await batch.addCapture(capture(['ja']), UID, NOW)
    await batch.presentCurrentBatch(profile, UID, NOW)
    await batch.startNextBatch(UID, NOW)
    const next = await batch.startOrResumeSearch(changed, UID, NOW)
    expect(next.searchFingerprint).toBe(JSON.stringify(['REAL_104', changed.keyword.trim(), changed.region]))
    expect(next.batchNumber).toBe(1)
    expect(keys(next)).toEqual([])
    expect(next.seenSourceKeys).toEqual([])
  })

  it('A5–A6, H37: page and capture order do not change search history', async () => {
    const batch = await started()
    const first = await batch.addCapture(capture(['ja', 'jb'], { page: 1 }), UID, NOW)
    const second = await batch.addCapture(capture(['jd', 'jc'], { page: 2 }), UID, NOW)
    expect(second.searchFingerprint).toBe(first.searchFingerprint)
    expect(keys(second)).toEqual(ids('ja', 'jb', 'jd', 'jc'))
  })

  it('H38–H39 precursor: re-submitting the same intent keeps current and seen', async () => {
    const batch = await started()
    await batch.addCapture(capture(['ja']), UID, NOW)
    await batch.presentCurrentBatch(profile, UID, NOW)
    await batch.startNextBatch(UID, NOW)
    await batch.addCapture(capture(['jb']), UID, NOW)
    const before = await batch.restore(UID, NOW)
    const after = await batch.startOrResumeSearch(INTENT, UID, NOW)
    expect({ fingerprint: after.searchFingerprint, seen: after.seenSourceKeys, current: keys(after), number: after.batchNumber })
      .toEqual({ fingerprint: before.searchFingerprint, seen: before.seenSourceKeys, current: keys(before), number: before.batchNumber })
  })
})

describe('REAL 104 batch working set: collection and canonical identity', () => {
  it('B7–B8: two disjoint ten-job captures collect 10 then 20', async () => {
    const batch = await started()
    const ten = await batch.addCapture(capture(names(0, 10)), UID, NOW)
    const twenty = await batch.addCapture(capture(names(10, 10), { page: 2 }), UID, NOW)
    expect(ten.status).toBe('collecting')
    expect(ten.currentBatchJobs).toHaveLength(10)
    expect(twenty.currentBatchJobs).toHaveLength(20)
    expect(twenty.seenSourceKeys).toEqual([])
    expect(matcher).not.toHaveBeenCalled()
  })

  it('B9–B10: four disjoint captures reach 40 and auto-present only those 40', async () => {
    const batch = await started()
    const view = await fill(batch)
    expect(keys(view)).toEqual(ids(...names(0, 40)))
    expect(view.status).toBe('presented')
    expect(matcher).toHaveBeenCalledOnce()
    expect(matcher.mock.calls[0][1].map(job => job.id)).toEqual(ids(...names(0, 40)))
  })

  it('B10: reaching 40 without a confirmed resume keeps the batch recoverable and unpresented', async () => {
    const { batch } = await harness(undefined, () => null)
    await batch.startOrResumeSearch(INTENT, UID, NOW)
    for (let start = 0; start < 40; start += 10) {
      try { await batch.addCapture(capture(names(start, 10)), UID, NOW) } catch { /* Matching error may be surfaced. */ }
    }
    const view = await batch.restore(UID, NOW)
    expect(view.status).toBe('collecting')
    expect(view.currentBatchJobs).toHaveLength(40)
    expect(view.seenSourceKeys).toEqual([])
    expect(matcher).not.toHaveBeenCalled()
  })

  it('B11: a 41st candidate never enters or evicts a full batch', async () => {
    const batch = await started()
    await fill(batch)
    const full = await batch.restore(UID, NOW)
    try { await batch.addCapture(capture(['jextra'], { page: 5 }), UID, NOW) } catch { /* explicit rejection is allowed */ }
    const after = await batch.restore(UID, NOW)
    expect(keys(after)).toEqual(keys(full))
    expect(after.seenSourceKeys).toEqual([])
  })

  // Supersedes B11's discard-overflow contract: full-page continuous batch keeps
  // remaining candidates in pendingJobs (see full-page continuous batch design).
  it('B11 superseded: overflow fills current up to 40 and preserves remaining jobs in pending source order', async () => {
    const batch = await started()
    await fill(batch, 0, 38)
    const view = await batch.addCapture(capture(['jextraa', 'jextrab', 'jextrac']), UID, NOW)
    expect(keys(view).slice(-2)).toEqual(ids('jextraa', 'jextrab'))
    expect(keys(view)).not.toContain('104:jextrac')
    expect(view.seenSourceKeys).not.toContain('104:jextrac')
    expect(view.lastCapture?.overflow).toBe(1)
    expect(view.currentBatchJobs).toHaveLength(40)
    const pending = (view as typeof view & { pendingJobs?: Array<{ job: { id: string } }> }).pendingJobs
    expect(pending?.map(item => item.job.id)).toEqual(ids('jextrac'))
  })

  it('C12, C14, L62: later overlap is skipped, while same title/company with different keys is retained in first-seen order', async () => {
    const batch = await started()
    await batch.addCapture(capture(['ja', 'jb', 'jc'], { title: '同名職缺', company: '匿名公司' }), UID, NOW)
    const view = await batch.addCapture(capture(['jb', 'jc', 'jd', 'je'], { title: '同名職缺', company: '匿名公司' }), UID, NOW)
    expect(keys(view)).toEqual(ids('ja', 'jb', 'jc', 'jd', 'je'))
    expect(view.lastCapture).toMatchObject({ accepted: 2, skipped: 2 })
  })

  it('C15: changed title/company cannot change the identity or replace the first accepted Job', async () => {
    const batch = await started()
    const first = await batch.addCapture(capture(['ja'], { title: '原職稱', company: '原公司' }), UID, NOW)
    const again = await batch.addCapture(capture(['ja'], { title: '新職稱', company: '新公司' }), UID, NOW)
    expect(keys(again)).toEqual(ids('ja'))
    expect(again.currentBatchJobs[0]).toEqual(first.currentBatchJobs[0])
  })

  it('C13 contract resolution: duplicate IDs within ONE capture reject the whole malformed payload', async () => {
    const batch = await started()
    const before = await batch.addCapture(capture(['ja']), UID, NOW)
    try { await batch.addCapture(capture(['jb', 'jb']), UID, NOW) } catch { /* rejection */ }
    expect(keys(await batch.restore(UID, NOW))).toEqual(keys(before))
  })
})

describe('REAL 104 batch working set: partial commit, next batch and duplicate-only input', () => {
  it('D16–D19: a partial batch becomes presented only after commit; no previous seen before next', async () => {
    const batch = await started()
    const collecting = await batch.addCapture(capture(['ja', 'jb']), UID, NOW)
    expect(collecting.status).toBe('collecting')
    expect(collecting.seenSourceKeys).toEqual([])
    expect(matcher).not.toHaveBeenCalled()
    const committed = await batch.presentCurrentBatch(profile, UID, NOW)
    expect(committed.status).toBe('presented')
    expect(keys(committed)).toEqual(ids('ja', 'jb'))
    expect(committed.seenSourceKeys).toEqual([])
    expect(matcher.mock.calls[0][1].map(job => job.id)).toEqual(ids('ja', 'jb'))
  })

  it('D19: abandoning an uncommitted collection does not put it in seen history', async () => {
    const batch = await started()
    await batch.addCapture(capture(['ja']), UID, NOW)
    const next = await batch.startOrResumeSearch({ ...INTENT, keyword: '另一關鍵字' }, UID, NOW)
    expect(next.seenSourceKeys).toEqual([])
    expect(keys(next)).toEqual([])
  })

  it('D16: zero-job partial batch cannot be presented', async () => {
    const batch = await started()
    try { await batch.presentCurrentBatch(profile, UID, NOW) } catch { /* expected validation */ }
    const view = await batch.restore(UID, NOW)
    expect(view.status).toBe('collecting')
    expect(keys(view)).toEqual([])
    expect(matcher).not.toHaveBeenCalled()
  })

  it('E20–E23: next batch transfers displayed IDs to seen and starts empty, accepting only new keys', async () => {
    const batch = await started()
    await batch.addCapture(capture(['ja', 'jb']), UID, NOW)
    await batch.presentCurrentBatch(profile, UID, NOW)
    const next = await batch.startNextBatch(UID, NOW)
    expect(next.batchNumber).toBe(2)
    expect(next.status).toBe('collecting')
    expect(keys(next)).toEqual([])
    expect(next.seenSourceKeys).toEqual(ids('ja', 'jb'))
    const collected = await batch.addCapture(capture(['jb', 'jc']), UID, NOW)
    expect(keys(collected)).toEqual(ids('jc'))
  })

  it('E24–E26: third batch excludes the first TWO committed batches and never fills with repeats', async () => {
    const batch = await started()
    await batch.addCapture(capture(['ja', 'jb']), UID, NOW)
    await batch.presentCurrentBatch(profile, UID, NOW)
    await batch.startNextBatch(UID, NOW)
    await batch.addCapture(capture(['jc', 'jd']), UID, NOW)
    await batch.presentCurrentBatch(profile, UID, NOW)
    await batch.startNextBatch(UID, NOW)
    const third = await batch.addCapture(capture(['ja', 'jc', 'je']), UID, NOW)
    expect(third.batchNumber).toBe(3)
    expect(third.seenSourceKeys).toEqual(ids('ja', 'jb', 'jc', 'jd'))
    expect(keys(third)).toEqual(ids('je'))
  })

  it('F27–F29, L63: repeated/current-only duplicates change no count, no phase and no search', async () => {
    const batch = await started()
    const before = await batch.addCapture(capture(['ja', 'jb']), UID, NOW)
    const after = await batch.addCapture(capture(['ja', 'jb']), UID, NOW)
    expect(keys(after)).toEqual(keys(before))
    expect(after.status).toBe('collecting')
    expect(after.searchFingerprint).toBe(before.searchFingerprint)
    expect(after.seenSourceKeys).toEqual([])
  })

  it('F28–F29: seen-only capture leaves the new collection unchanged', async () => {
    const batch = await started()
    await batch.addCapture(capture(['ja']), UID, NOW)
    await batch.presentCurrentBatch(profile, UID, NOW)
    await batch.startNextBatch(UID, NOW)
    const before = await batch.restore(UID, NOW)
    const after = await batch.addCapture(capture(['ja']), UID, NOW)
    expect(keys(after)).toEqual(keys(before))
    expect(after.seenSourceKeys).toEqual(ids('ja'))
    expect(after.batchNumber).toBe(2)
  })
})
