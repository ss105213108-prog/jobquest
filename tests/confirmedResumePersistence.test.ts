import { describe, expect, it, vi } from 'vitest'
import { createConfirmedResumePersistence, type ResumePersistenceStatus } from '../src/services/confirmedResumePersistence'
import { initialLocalAcceptanceState, localAcceptanceReducer } from '../src/hooks/useLocalAcceptance'
import type { ResumeProfile } from '../src/types'

const profile = (): ResumeProfile => ({
  id: 'synthetic-profile', name: 'Edited Candidate', skills: ['Edited Skill'],
  education: { school: '', department: 'Edited Department', graduationStatus: '' },
  workExperiences: [{ title: 'Edited Role', company: '', description: 'Edited Work' }],
  projects: [{ name: 'Edited Project', skills: ['Edited Project Skill'], description: '' }],
  certifications: ['Edited Certificate'], careerDirections: ['Edited Direction'],
  level: 1, abilities: [], updatedAt: '2026-09-28T00:00:00Z',
})
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function setup() {
  let local = structuredClone(initialLocalAcceptanceState)
  const repository = { getCurrent: vi.fn<() => Promise<ResumeProfile | null>>().mockResolvedValue(null), upsert: vi.fn<(owner: string, value: ResumeProfile) => Promise<void>>().mockResolvedValue(undefined) }
  const commit = vi.fn(async (value: ResumeProfile) => { local = localAcceptanceReducer(local, { type: 'confirm', resume: value }) })
  const reset = vi.fn(() => { local = localAcceptanceReducer(local, { type: 'reset' }) })
  const statuses: ResumePersistenceStatus[] = []
  const controller = createConfirmedResumePersistence(commit, reset, value => statuses.push(value), repository)
  return { controller, repository, commit, reset, local: () => local, status: () => statuses.at(-1), statuses }
}

describe('confirmed resume persistence lifecycle', () => {
  it('does not access the database before an authenticated owner exists', async () => {
    const s = setup()
    await s.controller.start(null)
    expect(s.repository.getCurrent).not.toHaveBeenCalled()
    expect(s.repository.upsert).not.toHaveBeenCalled()
    expect(s.local().resume).toBeNull()
  })
  it('restores the saved edited profile without mock regeneration or another write', async () => {
    const s = setup(), saved = profile()
    s.repository.getCurrent.mockResolvedValue(saved)
    await s.controller.start('owner-a')
    expect(s.local().resume).toEqual(saved)
    expect(s.status()).toMatchObject({ ownerId: 'owner-a', phase: 'restored' })
    expect(s.repository.upsert).not.toHaveBeenCalled()
    saved.skills.push('Late Mutation')
    expect(s.local().resume?.skills).toEqual(['Edited Skill'])
  })
  it('leaves a missing row in the ordinary unconfirmed upload flow', async () => {
    const s = setup()
    await s.controller.start('owner-a')
    expect(s.local().resume).toBeNull()
    expect(s.commit).not.toHaveBeenCalled()
    expect(s.status()?.phase).toBe('idle')
    expect(s.repository.upsert).not.toHaveBeenCalled()
  })
  it('reports restore failure without inventing profile data or exposing raw errors', async () => {
    const s = setup()
    s.repository.getCurrent.mockRejectedValue(new Error('private database detail'))
    await s.controller.start('owner-a')
    expect(s.local().resume).toBeNull()
    expect(s.status()).toMatchObject({ phase: 'error', operation: 'restore' })
    expect(JSON.stringify(s.statuses)).not.toContain('private database detail')
    expect(s.repository.upsert).not.toHaveBeenCalled()
  })
  it('persists only the current explicit confirmation, with every edited field and session owner', async () => {
    const s = setup(), draft = profile()
    await s.controller.start('owner-a')
    draft.skills = ['Replacement Skill']
    expect(s.repository.upsert).not.toHaveBeenCalled()
    const pending = s.controller.confirm(draft)
    draft.skills.push('After Click Mutation')
    await pending
    expect(s.repository.upsert).toHaveBeenCalledExactlyOnceWith('owner-a', { ...profile(), skills: ['Replacement Skill'] })
    expect(s.local().resume?.skills).toEqual(['Replacement Skill'])
    expect(s.status()?.phase).toBe('saved')
  })
  it('preserves optional emptiness and the existing name trimming contract', async () => {
    const s = setup()
    await s.controller.start('owner-a')
    const edited = { ...profile(), name: '  Edited Candidate  ', certifications: [] }
    await s.controller.confirm(edited)
    expect(s.repository.upsert).toHaveBeenCalledWith('owner-a', { ...edited, name: 'Edited Candidate' })
    expect(s.local().resume?.certifications).toEqual([])
  })
  it('retains confirmed matching input after save failure and exposes only a safe status', async () => {
    const s = setup()
    await s.controller.start('owner-a')
    s.repository.upsert.mockRejectedValue(new Error('private database detail'))
    await expect(s.controller.confirm(profile())).resolves.toBeUndefined()
    expect(s.local().resume).toEqual(profile())
    expect(s.status()).toMatchObject({ phase: 'error', operation: 'save' })
    expect(JSON.stringify(s.statuses)).not.toContain('private database detail')
  })
  it('allows local confirmation without Auth but never uses a fabricated owner', async () => {
    const s = setup()
    await s.controller.confirm(profile())
    expect(s.local().resume).toEqual(profile())
    expect(s.repository.upsert).not.toHaveBeenCalled()
    expect(s.status()).toMatchObject({ phase: 'error', operation: 'save', ownerId: null })
  })
  it('never writes a confirmation rejected by the frozen local domain contract', async () => {
    const s = setup()
    await s.controller.start('owner-a')
    await expect(s.controller.confirm({ ...profile(), name: ' ' })).rejects.toThrow()
    expect(s.repository.upsert).not.toHaveBeenCalled()
    expect(s.local().resume).toBeNull()
  })
  it('preserves confirmation made during initial Auth failure and saves it after Auth recovery', async () => {
    const s = setup()
    await s.controller.start(null)
    await s.controller.confirm(profile())
    await s.controller.start('owner-a')
    expect(s.local().resume).toEqual(profile())
    expect(s.repository.getCurrent).not.toHaveBeenCalled()
    expect(s.repository.upsert).toHaveBeenCalledExactlyOnceWith('owner-a', profile())
    expect(s.status()?.phase).toBe('saved')
  })
  it('does not let delayed restore overwrite a newer confirmed snapshot', async () => {
    const s = setup(), read = deferred<ResumeProfile | null>()
    s.repository.getCurrent.mockReturnValue(read.promise)
    const restoring = s.controller.start('owner-a')
    await s.controller.confirm(profile())
    read.resolve({ ...profile(), skills: ['Outdated Remote Skill'] })
    await restoring
    expect(s.local().resume?.skills).toEqual(['Edited Skill'])
    expect(s.status()?.phase).toBe('saved')
    expect(s.commit).toHaveBeenCalledTimes(1)
  })
  it('serializes overlapping saves so the newer confirmed snapshot wins', async () => {
    const s = setup(), write = deferred<void>()
    await s.controller.start('owner-a')
    s.repository.upsert.mockReturnValueOnce(write.promise)
    const first = s.controller.confirm(profile())
    await vi.waitFor(() => expect(s.repository.upsert).toHaveBeenCalledTimes(1))
    const newer = { ...profile(), skills: ['Newest Skill'] }
    const second = s.controller.confirm(newer)
    await vi.waitFor(() => expect(s.local().resume?.skills).toEqual(['Newest Skill']))
    expect(s.repository.upsert).toHaveBeenCalledTimes(1)
    write.resolve()
    await Promise.all([first, second])
    expect(s.repository.upsert.mock.calls[1]).toEqual(['owner-a', newer])
    expect(s.status()?.phase).toBe('saved')
  })
  it('retries the last confirmed immutable snapshot, not an editing draft', async () => {
    const s = setup(), edited = profile()
    await s.controller.start('owner-a')
    s.repository.upsert.mockRejectedValueOnce(new Error('unavailable'))
    await s.controller.confirm(edited)
    edited.skills = ['Unconfirmed Edit']
    await s.controller.retry()
    expect(s.repository.upsert.mock.calls[1]).toEqual(['owner-a', profile()])
    expect(s.status()?.phase).toBe('saved')
  })
  it('retries restore explicitly when no local confirmation exists', async () => {
    const s = setup()
    s.repository.getCurrent.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(profile())
    await s.controller.start('owner-a')
    await s.controller.retry()
    expect(s.local().resume).toEqual(profile())
    expect(s.repository.upsert).not.toHaveBeenCalled()
  })
  it('does not overwrite a local confirmation on same-owner initialization', async () => {
    const s = setup()
    await s.controller.start('owner-a')
    await s.controller.confirm(profile())
    s.repository.getCurrent.mockResolvedValue({ ...profile(), skills: ['Old Remote'] })
    await s.controller.start('owner-a')
    expect(s.repository.getCurrent).toHaveBeenCalledTimes(1)
    expect(s.local().resume?.skills).toEqual(['Edited Skill'])
  })
  it('reset ignores pending restore and does not delete the remote profile', async () => {
    const s = setup(), read = deferred<ResumeProfile | null>()
    s.repository.getCurrent.mockReturnValue(read.promise)
    const restoring = s.controller.start('owner-a')
    s.controller.discard()
    read.resolve(profile())
    await restoring
    expect(s.local().resume).toBeNull()
    expect(s.status()?.phase).toBe('idle')
    expect(s.repository.upsert).not.toHaveBeenCalled()
  })
  it('ignores restore completion after unmount and supports StrictMode restart', async () => {
    const s = setup(), read = deferred<ResumeProfile | null>()
    s.repository.getCurrent.mockReturnValueOnce(read.promise).mockResolvedValue(profile())
    const restoring = s.controller.start('owner-a')
    s.controller.suspend()
    read.resolve({ ...profile(), skills: ['Stale'] })
    await restoring
    expect(s.commit).not.toHaveBeenCalled()
    await s.controller.start('owner-a')
    expect(s.local().resume).toEqual(profile())
  })
  it('clears the previous owner and ignores that owner\'s delayed read', async () => {
    const s = setup(), read = deferred<ResumeProfile | null>()
    s.repository.getCurrent.mockReturnValueOnce(read.promise).mockResolvedValue(null)
    const oldRead = s.controller.start('owner-a')
    await s.controller.start('owner-b')
    read.resolve(profile())
    await oldRead
    expect(s.local().resume).toBeNull()
    expect(s.status()?.ownerId).toBe('owner-b')
  })
  it('clears restored profile on session loss without reading or writing another owner', async () => {
    const s = setup()
    s.repository.getCurrent.mockResolvedValue(profile())
    await s.controller.start('owner-a')
    await s.controller.start(null)
    expect(s.local().resume).toBeNull()
    expect(s.repository.getCurrent).toHaveBeenCalledTimes(1)
    expect(s.repository.upsert).not.toHaveBeenCalled()
  })
  it('skips queued old-owner writes and does not let their completion change current status', async () => {
    const s = setup(), write = deferred<void>()
    await s.controller.start('owner-a')
    s.repository.upsert.mockReturnValueOnce(write.promise)
    const first = s.controller.confirm(profile())
    await vi.waitFor(() => expect(s.repository.upsert).toHaveBeenCalledTimes(1))
    const queued = s.controller.confirm({ ...profile(), skills: ['Queued Old Owner'] })
    await vi.waitFor(() => expect(s.local().resume?.skills).toEqual(['Queued Old Owner']))
    await s.controller.start('owner-b')
    write.resolve()
    await Promise.all([first, queued])
    expect(s.repository.upsert).toHaveBeenCalledTimes(1)
    expect(s.local().resume).toBeNull()
    expect(s.status()).toMatchObject({ ownerId: 'owner-b', phase: 'idle' })
  })
})
