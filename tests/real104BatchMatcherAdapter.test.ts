import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { matchReal104BatchJobs } from '../src/services/real104BatchMatcher'
import { matchingService } from '../src/services/matchingService'
import { createReal104BatchWorkingSet } from '../src/services/real104BatchWorkingSet'
import type { JobWithMatch, ResumeProfile } from '../src/types'
import { INTENT, NOW, UID, capture, ids, keys, memoryStorage, names, profile } from './helpers/real104BatchContract'

const workingSet = (getConfirmedResume: () => ResumeProfile | null = () => profile) => {
  const batch = createReal104BatchWorkingSet({ storage: memoryStorage().storage, matchJobs: matchReal104BatchJobs, getConfirmedResume })
  batch.startOrResumeSearch(INTENT, UID, NOW)
  return batch
}

beforeEach(() => vi.stubGlobal('window', { setTimeout, location: { search: '' } }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('REAL 104 batch concrete Matcher adapter', () => {
  it('passes a committed partial batch and the exact confirmed ResumeProfile to existing Matching', async () => {
    const spy = vi.spyOn(matchingService, 'matchJobs')
    const batch = workingSet()
    await batch.addCapture(capture(['ja', 'jb']), UID, NOW)
    expect(spy).not.toHaveBeenCalled()
    const presented = await batch.presentCurrentBatch(profile, UID, NOW)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe(profile)
    expect(spy.mock.calls[0][1].map(job => job.id)).toEqual(ids('ja', 'jb'))
    expect(presented.status).toBe('presented')
    expect(presented.matches).toEqual(await spy.mock.results[0].value)
  })

  it('accepts a 27-job partial batch without a ten-job adapter cap', async () => {
    const spy = vi.spyOn(matchingService, 'matchJobs')
    const batch = workingSet()
    await batch.addCapture(capture(names(0, 10)), UID, NOW)
    await batch.addCapture(capture(names(10, 10), { page: 2 }), UID, NOW)
    await batch.addCapture(capture(names(20, 7), { page: 3 }), UID, NOW)
    const presented = await batch.presentCurrentBatch(profile, UID, NOW)
    expect(spy.mock.calls[0][1].map(job => job.id)).toEqual(ids(...names(0, 27)))
    expect(presented.matches).toHaveLength(27)
    expect(keys(presented)).toEqual(ids(...names(0, 27)))
  })

  it('auto-matches all 40 current jobs using the profile available at the 40th capture', async () => {
    const spy = vi.spyOn(matchingService, 'matchJobs')
    let confirmed: ResumeProfile | null = null
    const batch = workingSet(() => confirmed)
    for (let start = 0; start < 30; start += 10) {
      await batch.addCapture(capture(names(start, 10), { page: 1 + start / 10 }), UID, NOW)
    }
    expect(spy).not.toHaveBeenCalled()
    confirmed = profile
    const presented = await batch.addCapture(capture(names(30, 10), { page: 4 }), UID, NOW)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe(profile)
    expect(spy.mock.calls[0][1].map(job => job.id)).toEqual(ids(...names(0, 40)))
    expect(presented.status).toBe('presented')
    expect(presented.matches).toHaveLength(40)
  })

  it('does not change input identity/order or alter the Matching output', async () => {
    const batch = workingSet()
    const collecting = await batch.addCapture(capture(['jc', 'ja', 'jb']), UID, NOW)
    const expectedMatches: JobWithMatch[] = [...collecting.currentBatchJobs].reverse().map((job, index) => ({
      job, match: { jobId: job.id, matchScore: index * 10, matchLevel: 'C', matchedSkills: [], missingSkills: [], matchReasons: [] },
    }))
    const spy = vi.spyOn(matchingService, 'matchJobs').mockResolvedValueOnce(expectedMatches)
    const presented = await batch.presentCurrentBatch(profile, UID, NOW)
    expect(spy.mock.calls[0][1].map(job => job.id)).toEqual(ids('jc', 'ja', 'jb'))
    expect(keys(presented)).toEqual(ids('jc', 'ja', 'jb'))
    expect(presented.matches).toEqual(expectedMatches)
  })

  it('never sends historical seen jobs into the next Matching input', async () => {
    const spy = vi.spyOn(matchingService, 'matchJobs')
    const batch = workingSet()
    await batch.addCapture(capture(['ja', 'jb']), UID, NOW)
    await batch.presentCurrentBatch(profile, UID, NOW)
    batch.startNextBatch(UID, NOW)
    await batch.addCapture(capture(['ja', 'jc']), UID, NOW)
    const next = await batch.presentCurrentBatch(profile, UID, NOW)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[1][1].map(job => job.id)).toEqual(ids('jc'))
    expect(next.seenSourceKeys).toEqual(ids('ja', 'jb'))
  })

  it('Matching failure keeps a partial batch collecting and its seen history unchanged', async () => {
    const batch = workingSet()
    await batch.addCapture(capture(['ja']), UID, NOW)
    vi.spyOn(matchingService, 'matchJobs').mockRejectedValueOnce(new Error('test-only Matching failure'))
    await expect(batch.presentCurrentBatch(profile, UID, NOW)).rejects.toMatchObject({ code: 'MATCHING_FAILED' })
    const restored = batch.restore(UID, NOW)
    expect(restored.status).toBe('collecting')
    expect(keys(restored)).toEqual(ids('ja'))
    expect(restored.seenSourceKeys).toEqual([])
  })

  it('Matching failure at 40 leaves all accepted jobs recoverable and unpresented', async () => {
    const batch = workingSet()
    for (let start = 0; start < 30; start += 10) {
      await batch.addCapture(capture(names(start, 10), { page: 1 + start / 10 }), UID, NOW)
    }
    vi.spyOn(matchingService, 'matchJobs').mockRejectedValueOnce(new Error('test-only Matching failure'))
    await expect(batch.addCapture(capture(names(30, 10), { page: 4 }), UID, NOW)).rejects.toMatchObject({ code: 'MATCHING_FAILED' })
    const restored = batch.restore(UID, NOW)
    expect(restored.status).toBe('collecting')
    expect(keys(restored)).toEqual(ids(...names(0, 40)))
    expect(restored.seenSourceKeys).toEqual([])
  })
})
