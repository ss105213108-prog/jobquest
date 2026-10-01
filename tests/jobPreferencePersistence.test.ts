import { describe, expect, it, vi } from 'vitest'
import { createJobPreferencePersistence, type JobPreferencePersistenceStatus } from '../src/services/jobPreferencePersistence'
import { initialLocalAcceptanceState, localAcceptanceReducer } from '../src/hooks/useLocalAcceptance'
import type { SearchPreference } from '../src/types'

const edited = (): SearchPreference => ({ source: '104', keyword: '前端工程師', location: '台中市', sortBy: 'match-desc' })
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function setup() {
  let local = structuredClone(initialLocalAcceptanceState)
  const service = { load: vi.fn<() => Promise<SearchPreference | null>>().mockResolvedValue(null), save: vi.fn<(owner: string, preference: SearchPreference) => Promise<void>>().mockResolvedValue(undefined) }
  const commit = vi.fn(async (preference: SearchPreference) => { local = localAcceptanceReducer(local, { type: 'preference', preference }) })
  const statuses: JobPreferencePersistenceStatus[] = []
  const controller = createJobPreferencePersistence(commit, initialLocalAcceptanceState.preference, status => statuses.push(status), service)
  return { controller, service, commit, local: () => local, status: () => statuses.at(-1), statuses }
}
describe('isolated job preference persistence lifecycle', () => {
  it('does not load or write before Auth readiness supplies an owner', async () => {
    const s = setup()
    await s.controller.start(null)
    expect(s.service.load).not.toHaveBeenCalled()
    expect(s.service.save).not.toHaveBeenCalled()
    expect(s.local().preference).toEqual(initialLocalAcceptanceState.preference)
  })
  it('restores the existing fields without re-saving or fabricating defaults', async () => {
    const s = setup(), saved = edited()
    s.service.load.mockResolvedValue(saved)
    await s.controller.start('owner-a')
    expect(s.local().preference).toEqual(edited())
    expect(s.status()).toMatchObject({ ownerId: 'owner-a', phase: 'restored', ready: true })
    expect(s.service.save).not.toHaveBeenCalled()
    saved.keyword = 'Late mutation'
    expect(s.local().preference.keyword).toBe('前端工程師')
  })
  it('keeps product defaults when no row exists without writing a fake preference', async () => {
    const s = setup()
    await s.controller.start('owner-a')
    expect(s.local().preference).toEqual(initialLocalAcceptanceState.preference)
    expect(s.commit).not.toHaveBeenCalled()
    expect(s.service.save).not.toHaveBeenCalled()
    expect(s.status()).toMatchObject({ phase: 'idle', ready: true })
  })
  it('keeps defaults and a safe usable error after restore fails', async () => {
    const s = setup()
    s.service.load.mockRejectedValue(new Error('private DB detail'))
    await s.controller.start('owner-a')
    expect(s.local().preference).toEqual(initialLocalAcceptanceState.preference)
    expect(s.status()).toMatchObject({ phase: 'error', operation: 'restore', ready: true })
    expect(JSON.stringify(s.statuses)).not.toContain('private DB detail')
    expect(s.service.save).not.toHaveBeenCalled()
  })
  it('saves only an explicit preference change with the authenticated owner', async () => {
    const s = setup(), preference = edited()
    await s.controller.start('owner-a')
    expect(s.service.save).not.toHaveBeenCalled()
    const pending = s.controller.save(preference)
    preference.keyword = 'Late mutation'
    await pending
    expect(s.service.save).toHaveBeenCalledExactlyOnceWith('owner-a', edited())
    expect(s.local().preference).toEqual(edited())
    expect(s.status()?.phase).toBe('saved')
    expect(s.local().resume).toBeNull()
    expect(s.local().statuses).toEqual({})
  })
  it('commits local filters before a remote write resolves', async () => {
    const s = setup(), write = deferred<void>()
    await s.controller.start('owner-a')
    s.service.save.mockReturnValue(write.promise)
    const pending = s.controller.save(edited())
    await vi.waitFor(() => expect(s.service.save).toHaveBeenCalledTimes(1))
    expect(s.local().preference).toEqual(edited())
    write.resolve()
    await pending
  })
  it('save failure cannot roll back local preferences or corrupt matching state', async () => {
    const s = setup()
    await s.controller.start('owner-a')
    s.service.save.mockRejectedValue(new Error('private DB detail'))
    await expect(s.controller.save(edited())).resolves.toBeUndefined()
    expect(s.local().preference).toEqual(edited())
    expect(s.local().resume).toBeNull()
    expect(s.local().statuses).toEqual({})
    expect(s.status()).toMatchObject({ phase: 'error', operation: 'save' })
    expect(JSON.stringify(s.statuses)).not.toContain('private DB detail')
  })
  it('uses no fake owner when Auth is unavailable', async () => {
    const s = setup()
    await s.controller.save(edited())
    expect(s.local().preference).toEqual(edited())
    expect(s.service.save).not.toHaveBeenCalled()
    expect(s.status()).toMatchObject({ phase: 'error', operation: 'save' })
  })
  it('preserves initial offline edits when Auth later recovers', async () => {
    const s = setup()
    await s.controller.start(null)
    await s.controller.save(edited())
    await s.controller.start('owner-a')
    expect(s.local().preference).toEqual(edited())
    expect(s.service.load).not.toHaveBeenCalled()
    expect(s.service.save).toHaveBeenCalledExactlyOnceWith('owner-a', edited())
  })
  it('a delayed restore cannot overwrite a newer user change', async () => {
    const s = setup(), read = deferred<SearchPreference | null>()
    s.service.load.mockReturnValue(read.promise)
    const restoring = s.controller.start('owner-a')
    await s.controller.save(edited())
    read.resolve({ ...edited(), keyword: 'Old Remote' })
    await restoring
    expect(s.local().preference).toEqual(edited())
    expect(s.status()?.phase).toBe('saved')
  })
  it('serializes saves so a slow older write does not become the final remote preference', async () => {
    const s = setup(), write = deferred<void>()
    await s.controller.start('owner-a')
    s.service.save.mockReturnValueOnce(write.promise)
    const first = s.controller.save(edited())
    await vi.waitFor(() => expect(s.service.save).toHaveBeenCalledTimes(1))
    const next = { ...edited(), keyword: 'Newest Keyword' }
    const second = s.controller.save(next)
    await vi.waitFor(() => expect(s.local().preference).toEqual(next))
    expect(s.service.save).toHaveBeenCalledTimes(1)
    write.resolve()
    await Promise.all([first, second])
    expect(s.service.save.mock.calls[1]).toEqual(['owner-a', next])
    expect(s.status()?.phase).toBe('saved')
  })
  it('retry uses the last edited snapshot without a default write', async () => {
    const s = setup(), preference = edited()
    await s.controller.start('owner-a')
    s.service.save.mockRejectedValueOnce(new Error('offline'))
    await s.controller.save(preference)
    preference.location = 'Unconfirmed mutation'
    await s.controller.retry()
    expect(s.service.save.mock.calls[1]).toEqual(['owner-a', edited()])
    expect(s.status()?.phase).toBe('saved')
  })
  it('restore retry stays usable and does not fabricate or auto-save settings', async () => {
    const s = setup()
    s.service.load.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(edited())
    await s.controller.start('owner-a')
    const retry = s.controller.retry()
    expect(s.status()).toMatchObject({ phase: 'restoring', ready: true })
    await retry
    expect(s.local().preference).toEqual(edited())
    expect(s.service.save).not.toHaveBeenCalled()
  })
  it('same-owner reinitialization cannot replace fresh edited preferences', async () => {
    const s = setup()
    await s.controller.start('owner-a')
    await s.controller.save(edited())
    await s.controller.start('owner-a')
    expect(s.service.load).toHaveBeenCalledTimes(1)
    expect(s.local().preference).toEqual(edited())
  })
  it('owner change restores defaults rather than leaking previous owner settings', async () => {
    const s = setup()
    await s.controller.start('owner-a')
    await s.controller.save(edited())
    await s.controller.start('owner-b')
    expect(s.local().preference).toEqual(initialLocalAcceptanceState.preference)
    expect(s.status()?.ownerId).toBe('owner-b')
    expect(s.service.save).toHaveBeenCalledTimes(1)
  })
  it('session loss clears preference ownership without changing Auth semantics', async () => {
    const s = setup()
    s.service.load.mockResolvedValue(edited())
    await s.controller.start('owner-a')
    await s.controller.start(null)
    expect(s.local().preference).toEqual(initialLocalAcceptanceState.preference)
    expect(s.status()).toMatchObject({ ownerId: null, ready: true })
    expect(s.service.save).not.toHaveBeenCalled()
  })
  it('ignores a previous owner\'s delayed restore', async () => {
    const s = setup(), read = deferred<SearchPreference | null>()
    s.service.load.mockReturnValueOnce(read.promise).mockResolvedValue(null)
    const old = s.controller.start('owner-a')
    await s.controller.start('owner-b')
    read.resolve(edited())
    await old
    expect(s.local().preference).toEqual(initialLocalAcceptanceState.preference)
    expect(s.status()?.ownerId).toBe('owner-b')
  })
  it('skips queued old-owner saves and ignores their late completion', async () => {
    const s = setup(), write = deferred<void>()
    await s.controller.start('owner-a')
    s.service.save.mockReturnValueOnce(write.promise)
    const first = s.controller.save(edited())
    await vi.waitFor(() => expect(s.service.save).toHaveBeenCalledTimes(1))
    const second = s.controller.save({ ...edited(), keyword: 'Queued Old Owner' })
    await vi.waitFor(() => expect(s.local().preference.keyword).toBe('Queued Old Owner'))
    await s.controller.start('owner-b')
    write.resolve()
    await Promise.all([first, second])
    expect(s.service.save).toHaveBeenCalledTimes(1)
    expect(s.status()).toMatchObject({ ownerId: 'owner-b', phase: 'idle' })
  })
  it('unmount ignores pending read and StrictMode restart can restore normally', async () => {
    const s = setup(), read = deferred<SearchPreference | null>()
    s.service.load.mockReturnValueOnce(read.promise).mockResolvedValue(edited())
    const restoring = s.controller.start('owner-a')
    s.controller.suspend()
    read.resolve({ ...edited(), keyword: 'Stale' })
    await restoring
    expect(s.commit).not.toHaveBeenCalled()
    await s.controller.start('owner-a')
    expect(s.local().preference).toEqual(edited())
  })
  it('local reset invalidates pending restore without any remote delete or write', async () => {
    const s = setup(), read = deferred<SearchPreference | null>()
    s.service.load.mockReturnValue(read.promise)
    const restoring = s.controller.start('owner-a')
    s.controller.discard()
    read.resolve(edited())
    await restoring
    expect(s.local().preference).toEqual(initialLocalAcceptanceState.preference)
    expect(s.service.save).not.toHaveBeenCalled()
  })
})
