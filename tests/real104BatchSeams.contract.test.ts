import { describe, expect, it, vi } from 'vitest'
import { createJobActionPersistence, initialJobActionPersistenceState } from '../src/services/jobActionPersistence'
import { jobActionRepository } from '../src/repositories/jobActionRepository'
import { restoreJobSnapshot, serializeJobSnapshot } from '../src/services/jobSnapshot'
import { matchingService } from '../src/services/matchingService'
import type { JobActionPersistenceState } from '../src/services/jobActionPersistence'
import { NOW, UID, capture, ids, keys, matcher, names, profile, started } from './helpers/real104BatchContract'

describe('REAL 104 batch working set: Matching seam', () => {
  it('J51–J54: only a committed current batch reaches Matching, never historical or collecting jobs', async () => {
    const batch = await started()
    await batch.addCapture(capture(['ja', 'jb']), UID, NOW)
    expect(matcher).not.toHaveBeenCalled()
    await batch.presentCurrentBatch(profile, UID, NOW)
    expect(matcher.mock.calls[0][1].map(job => job.id)).toEqual(ids('ja', 'jb'))
    await batch.startNextBatch(UID, NOW)
    await batch.addCapture(capture(['jc']), UID, NOW)
    expect(matcher).toHaveBeenCalledTimes(1)
    const second = await batch.presentCurrentBatch(profile, UID, NOW)
    expect(second.status).toBe('presented')
    expect(matcher).toHaveBeenCalledTimes(2)
    expect(matcher.mock.calls[1][1].map(job => job.id)).toEqual(ids('jc'))
    expect(second.seenSourceKeys).toEqual(ids('ja', 'jb'))
  })

  it('J55: the existing Matching implementation still accepts canonical Jobs without a 10-job cap', async () => {
    const batch = await started()
    for (let start = 0; start < 40; start += 10) {
      await batch.addCapture(capture(names(start, 10), { page: 1 + start / 10 }), UID, NOW)
    }
    const current = await batch.restore(UID, NOW)
    expect(current.currentBatchJobs).toHaveLength(40)
    vi.stubGlobal('window', { setTimeout, location: { search: '' } })
    try {
      const existing = await matchingService.matchJobs(profile, current.currentBatchJobs)
      expect(existing.map(item => item.job.id).sort()).toEqual(ids(...names(0, 40)).sort())
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('Matching failure leaves a partial collection uncommitted and out of seen history', async () => {
    const batch = await started()
    await batch.addCapture(capture(['ja', 'jb']), UID, NOW)
    matcher.mockRejectedValueOnce(new Error('test-only matching failure'))
    try { await batch.presentCurrentBatch(profile, UID, NOW) } catch { /* explicit failure */ }
    const view = await batch.restore(UID, NOW)
    expect(view.status).toBe('collecting')
    expect(keys(view)).toEqual(ids('ja', 'jb'))
    expect(view.seenSourceKeys).toEqual([])
  })
})

describe('REAL 104 batch working set: interaction-only snapshot seam', () => {
  it('K56–K57: importing and presenting creates no action write; one user action writes one existing snapshot', async () => {
    const upsert = vi.spyOn(jobActionRepository, 'upsert')
    const batch = await started()
    await batch.addCapture(capture(['ja', 'jb']), UID, NOW)
    const displayed = await batch.presentCurrentBatch(profile, UID, NOW)
    expect(keys(displayed)).toEqual(ids('ja', 'jb'))
    expect(upsert).not.toHaveBeenCalled()
    const set = vi.fn(async () => {})
    const service = { load: vi.fn(async () => ({})), set }
    let state: JobActionPersistenceState = initialJobActionPersistenceState
    const actions = createJobActionPersistence(next => { state = next }, service)
    await actions.start(UID)
    expect(set).not.toHaveBeenCalled()
    await actions.toggleFavorite('104:ja', displayed.currentBatchJobs[0])
    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith(UID, '104:ja', ['favorite'], serializeJobSnapshot(displayed.currentBatchJobs[0]))
    expect(state.jobs['104:ja']).toEqual(displayed.currentBatchJobs[0])
    upsert.mockRestore()
  })

  it('K58: persisted action evidence rejoins only through its canonical sourceKey', async () => {
    const batch = await started()
    await batch.addCapture(capture(['ja', 'jb']), UID, NOW)
    const displayed = await batch.presentCurrentBatch(profile, UID, NOW)
    const saved = serializeJobSnapshot(displayed.currentBatchJobs[0])
    expect(saved).not.toBeNull()
    expect(restoreJobSnapshot(saved, '104:ja', '104')).toEqual(displayed.currentBatchJobs[0])
    expect(restoreJobSnapshot(saved, '104:jb', '104')).toBeNull()
  })

  it('K59: legacy NULL snapshot keeps action flags without inventing an old card', async () => {
    const batch = await started()
    await batch.addCapture(capture(['ja']), UID, NOW)
    await batch.presentCurrentBatch(profile, UID, NOW)
    await batch.startNextBatch(UID, NOW)
    expect(restoreJobSnapshot(null, '104:ja', '104')).toBeNull()
    const legacy = { statuses: { '104:ja': ['favorite' as const] }, jobs: {} }
    const loadRecords = vi.fn(async () => legacy)
    let state: JobActionPersistenceState = initialJobActionPersistenceState
    const actions = createJobActionPersistence(next => { state = next }, { loadRecords, load: vi.fn(async () => ({})), set: vi.fn(async () => {}) })
    await actions.start(UID)
    expect(state.statuses['104:ja']).toEqual(['favorite'])
    expect(state.jobs).toEqual({})
  })
})
