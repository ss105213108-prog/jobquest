import { describe, expect, it, vi } from 'vitest'
import { createJobActionPersistence, initialJobActionPersistenceState, type JobActionPersistenceState } from '../src/services/jobActionPersistence'
import { jobActionService } from '../src/services/jobActionService'
import { initialLocalAcceptanceState, localAcceptanceReducer } from '../src/hooks/useLocalAcceptance'
import type { JobStatus, StatusMap } from '../src/types'

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function setup() {
  let state = initialJobActionPersistenceState
  const updates: JobActionPersistenceState[] = []
  const service = { load: vi.fn<(owner: string) => Promise<StatusMap>>().mockResolvedValue({}), set: vi.fn<(owner: string, key: string, statuses: JobStatus[]) => Promise<void>>().mockResolvedValue(undefined) }
  const controller = createJobActionPersistence(next => { state = next; updates.push(next) }, service)
  return { controller, service, state: () => state, updates }
}
describe('optimistic owner-scoped user job action persistence', () => {
  it('does not access DB without an Auth owner', async () => {
    const s = setup()
    await s.controller.start(null)
    expect(s.state()).toMatchObject({ ready: true, phase: 'idle', statuses: {} })
    expect(s.service.load).not.toHaveBeenCalled()
    expect(s.service.set).not.toHaveBeenCalled()
  })
  it('restores actions even when no full job records have been imported', async () => {
    const s = setup(), cloud: StatusMap = { '104:abc123': ['applied'], '104:other456': ['favorite', 'viewed'] }
    s.service.load.mockResolvedValue(cloud)
    await s.controller.start('owner-a')
    expect(s.state()).toMatchObject({ ready: true, phase: 'restored', statuses: cloud })
    cloud['104:abc123'].push('favorite')
    expect(s.state().statuses['104:abc123']).toEqual(['applied'])
    expect(s.service.set).not.toHaveBeenCalled()
  })
  it('preserves no-row defaults without writing synthetic rows', async () => {
    const s = setup()
    await s.controller.start('owner-a')
    expect(s.state()).toMatchObject({ ready: true, phase: 'idle', statuses: {} })
    expect(s.service.set).not.toHaveBeenCalled()
  })
  it.each(['toggleFavorite', 'markViewed', 'markApplied', 'markRejected'] as const)('updates local state before the %s remote write resolves', async method => {
    const s = setup(), write = deferred<void>()
    await s.controller.start('owner-a')
    s.service.set.mockReturnValue(write.promise)
    const saving = s.controller[method]('104:abc123')
    expect(s.state().statuses['104:abc123']).toHaveLength(1)
    expect(s.state()).toMatchObject({ phase: 'saving', unsavedCount: 1 })
    await vi.waitFor(() => expect(s.service.set).toHaveBeenCalledTimes(1))
    write.resolve()
    await saving
    expect(s.state()).toMatchObject({ phase: 'saved', unsavedCount: 0 })
  })
  it('keeps the exact current product status semantics for all status combinations', () => {
    const values: JobStatus[] = ['favorite', 'viewed', 'applied', 'rejected']
    for (let mask = 0; mask < 16; mask++) {
      const current = values.filter((_, bit) => mask & (1 << bit))
      for (const [action, next] of [['favorite', jobActionService.nextFavorite], ['viewed', jobActionService.nextViewed], ['applied', jobActionService.nextApplied], ['rejected', jobActionService.nextRejected]] as const) {
        const state = { ...initialLocalAcceptanceState, statuses: { '104:abc123': current } }
        expect(next(current)).toEqual(localAcceptanceReducer(state, { type: 'status', jobId: '104:abc123', status: action }).statuses['104:abc123'])
      }
    }
  })
  it('retains local status on write failure and retries its independent snapshot', async () => {
    const s = setup()
    await s.controller.start('owner-a')
    s.service.set.mockRejectedValueOnce(new Error('private DB detail'))
    await expect(s.controller.markApplied('104:abc123')).resolves.toBeUndefined()
    expect(s.state()).toMatchObject({ phase: 'error', operation: 'save', statuses: { '104:abc123': ['applied'] } })
    expect(JSON.stringify(s.updates)).not.toContain('private DB detail')
    s.state().statuses['104:abc123'].push('favorite')
    await s.controller.retry()
    expect(s.service.set.mock.calls[1]).toEqual(['owner-a', '104:abc123', ['applied']])
    expect(s.state()).toMatchObject({ phase: 'saved', unsavedCount: 0 })
  })
  it('does not hide one job failure when a different job saves successfully', async () => {
    const s = setup()
    await s.controller.start('owner-a')
    s.service.set.mockRejectedValueOnce(new Error('offline'))
    await s.controller.toggleFavorite('104:a')
    await s.controller.markRejected('104:b')
    expect(s.state()).toMatchObject({ phase: 'error', unsavedCount: 1, statuses: { '104:a': ['favorite'], '104:b': ['rejected'] } })
    await s.controller.retry()
    expect(s.service.set.mock.calls.at(-1)).toEqual(['owner-a', '104:a', ['favorite']])
    expect(s.state().phase).toBe('saved')
  })
  it('protects a newer edit from a delayed restore while restoring other jobs', async () => {
    const s = setup(), read = deferred<StatusMap>()
    s.service.load.mockReturnValue(read.promise)
    const restoring = s.controller.start('owner-a')
    await s.controller.markApplied('104:a')
    read.resolve({ '104:a': ['viewed'], '104:b': ['rejected'] })
    await restoring
    expect(s.state().statuses).toEqual({ '104:a': ['applied'], '104:b': ['rejected'] })
  })
  it('serializes rapid same-job writes and preserves the newest combined state', async () => {
    const s = setup(), write = deferred<void>()
    await s.controller.start('owner-a')
    s.service.set.mockReturnValueOnce(write.promise)
    const first = s.controller.toggleFavorite('104:a')
    await vi.waitFor(() => expect(s.service.set).toHaveBeenCalledTimes(1))
    const second = s.controller.markViewed('104:a')
    const third = s.controller.markApplied('104:a')
    expect(s.state().statuses['104:a']).toEqual(['favorite', 'viewed', 'applied'])
    write.resolve()
    await Promise.all([first, second, third])
    expect(s.service.set.mock.calls.at(-1)).toEqual(['owner-a', '104:a', ['favorite', 'viewed', 'applied']])
    expect(s.state().phase).toBe('saved')
  })
  it('persists removing favorite as an empty state and restores that after app restart', async () => {
    const cloud: StatusMap = {}
    const s = setup()
    s.service.load.mockImplementation(async () => structuredClone(cloud))
    s.service.set.mockImplementation(async (_owner, key, value) => { cloud[key] = [...value] })
    await s.controller.start('owner-a')
    await s.controller.toggleFavorite('104:a')
    await s.controller.toggleFavorite('104:a')
    const restart = createJobActionPersistence(state => s.updates.push(state), s.service)
    await restart.start('owner-a')
    expect(s.updates.at(-1)?.statuses).toEqual({ '104:a': [] })
  })
  it('round-trips distinct REAL and Demo action states through an app restart', async () => {
    const cloud: StatusMap = {}, s = setup()
    s.service.load.mockImplementation(async () => structuredClone(cloud))
    s.service.set.mockImplementation(async (_owner, key, value) => { cloud[key] = [...value] })
    await s.controller.start('owner-a')
    await s.controller.toggleFavorite('104:01')
    await s.controller.markViewed('104:b')
    await s.controller.markApplied('104:c')
    await s.controller.markRejected('104:d')
    await s.controller.markRejected('104-01')
    const restart = createJobActionPersistence(state => s.updates.push(state), s.service)
    await restart.start('owner-a')
    expect(s.updates.at(-1)?.statuses).toEqual({ '104:01': ['favorite'], '104:b': ['viewed'], '104:c': ['applied'], '104:d': ['rejected'], '104-01': ['rejected'] })
  })
  it('supports a safe usable restore error and retry without writes', async () => {
    const s = setup()
    s.service.load.mockRejectedValueOnce(new Error('private restore detail')).mockResolvedValue({ '104:a': ['viewed'] })
    await s.controller.start('owner-a')
    expect(s.state()).toMatchObject({ ready: true, phase: 'error', operation: 'restore' })
    await s.controller.retry()
    expect(s.state()).toMatchObject({ phase: 'restored', statuses: { '104:a': ['viewed'] } })
    expect(s.service.set).not.toHaveBeenCalled()
    expect(JSON.stringify(s.updates)).not.toContain('private restore detail')
  })
  it('can save local actions after restore fails without erasing the restore error', async () => {
    const s = setup()
    s.service.load.mockRejectedValueOnce(new Error('offline'))
    await s.controller.start('owner-a')
    await s.controller.markApplied('104:a')
    expect(s.state()).toMatchObject({ phase: 'error', operation: 'restore', statuses: { '104:a': ['applied'] } })
    s.service.load.mockResolvedValue({ '104:b': ['favorite'] })
    await s.controller.retry()
    expect(s.state().statuses).toEqual({ '104:a': ['applied'], '104:b': ['favorite'] })
  })
  it('preserves initial ownerless edits and saves them only after Auth recovers', async () => {
    const s = setup()
    await s.controller.start(null)
    await s.controller.toggleFavorite('104:a')
    expect(s.state()).toMatchObject({ phase: 'error', operation: 'save' })
    expect(s.service.set).not.toHaveBeenCalled()
    await s.controller.start('owner-a')
    expect(s.service.set).toHaveBeenCalledExactlyOnceWith('owner-a', '104:a', ['favorite'])
  })
  it('cannot apply a previous owner delayed read to the new owner', async () => {
    const s = setup(), read = deferred<StatusMap>()
    s.service.load.mockReturnValueOnce(read.promise).mockResolvedValueOnce({ '104:b': ['viewed'] })
    const old = s.controller.start('owner-a')
    await s.controller.start('owner-b')
    read.resolve({ '104:a': ['favorite'] })
    await old
    expect(s.state()).toMatchObject({ ownerId: 'owner-b', statuses: { '104:b': ['viewed'] } })
  })
  it('drops previous-owner queued writes and ignores an in-flight completion', async () => {
    const s = setup(), write = deferred<void>()
    await s.controller.start('owner-a')
    s.service.set.mockReturnValueOnce(write.promise)
    const old = s.controller.toggleFavorite('104:a')
    await vi.waitFor(() => expect(s.service.set).toHaveBeenCalledTimes(1))
    const queued = s.controller.markApplied('104:b')
    s.service.load.mockResolvedValueOnce({ '104:c': ['rejected'] })
    await s.controller.start('owner-b')
    write.resolve()
    await Promise.all([old, queued])
    expect(s.service.set).toHaveBeenCalledTimes(1)
    expect(s.state()).toMatchObject({ ownerId: 'owner-b', statuses: { '104:c': ['rejected'] } })
  })
  it('clears another owner statuses and dirty retries on identity loss', async () => {
    const s = setup()
    await s.controller.start('owner-a')
    s.service.set.mockRejectedValueOnce(new Error('offline'))
    await s.controller.markApplied('104:a')
    await s.controller.start(null)
    await s.controller.start('owner-b')
    await s.controller.retry()
    expect(s.state().statuses).toEqual({})
    expect(s.service.set).toHaveBeenCalledTimes(1)
  })
  it('ignores late work after unmount and allows StrictMode restart', async () => {
    const s = setup(), read = deferred<StatusMap>()
    s.service.load.mockReturnValueOnce(read.promise).mockResolvedValueOnce({ '104:b': ['viewed'] })
    const old = s.controller.start('owner-a')
    s.controller.suspend()
    const length = s.updates.length
    read.resolve({ '104:a': ['applied'] })
    await old
    expect(s.updates).toHaveLength(length)
    await s.controller.start('owner-a')
    expect(s.state().statuses).toEqual({ '104:b': ['viewed'] })
  })
  it('retries a suspended pending write on restart without losing optimistic state', async () => {
    const s = setup(), write = deferred<void>()
    await s.controller.start('owner-a')
    s.service.set.mockReturnValueOnce(write.promise)
    const old = s.controller.markApplied('104:a')
    await vi.waitFor(() => expect(s.service.set).toHaveBeenCalledTimes(1))
    s.controller.suspend()
    const restarted = s.controller.start('owner-a')
    write.resolve()
    await Promise.all([old, restarted])
    expect(s.service.set).toHaveBeenCalledTimes(2)
    expect(s.state()).toMatchObject({ phase: 'saved', statuses: { '104:a': ['applied'] } })
  })
  it('session reset invalidates late restore without deleting saved rows', async () => {
    const s = setup(), read = deferred<StatusMap>()
    s.service.load.mockReturnValue(read.promise)
    const restoring = s.controller.start('owner-a')
    s.controller.discard()
    read.resolve({ '104:a': ['favorite'] })
    await restoring
    expect(s.state()).toMatchObject({ statuses: {}, phase: 'idle' })
    expect(s.service.set).not.toHaveBeenCalled()
  })
  it('rejects noncanonical job actions before changing local or remote state', async () => {
    const s = setup()
    await s.controller.start('owner-a')
    await s.controller.toggleFavorite('title only')
    expect(s.state().statuses).toEqual({})
    expect(s.service.set).not.toHaveBeenCalled()
  })
})
