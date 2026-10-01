import { beforeEach, describe, expect, it, vi } from 'vitest'
import sample from '../experiments/104-browser-connector/sample-output.json'
import { normalize104CapturedJob } from '../src/integrations/job104/normalize104CapturedJob'
import { serializeJobSnapshot } from '../src/services/jobSnapshot'
import { jobActionRepository } from '../src/repositories/jobActionRepository'
import { createJobActionPersistence, initialJobActionPersistenceState } from '../src/services/jobActionPersistence'

// Synthetic owner/key transport exercises the actual repository/service/controller.
// It is not live Supabase/RLS acceptance.
const db = vi.hoisted(() => ({ rows: new Map<string, any>(), writes: [] as any[], fail: false, read: vi.fn(), write: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ requireSupabase: () => ({ from: () => ({
  select: () => ({ eq: db.read }), upsert: db.write,
}) }) }))
const now = '2026-09-29T04:00:00.000Z'
const job = (id = '844qv') => normalize104CapturedJob({ ...sample[0], sourceKey: `104:${id}`, externalId: id }, now)
const row = (key: string, snapshot: unknown = null) => ({ user_id: 'owner-a', job_key: key, source: '104', favorite: true, viewed: false, applied: false, rejected: false, job_snapshot: snapshot })
const setup = () => {
  let state = initialJobActionPersistenceState
  const controller = createJobActionPersistence(next => { state = next })
  return { controller, state: () => state }
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
beforeEach(() => {
  db.rows.clear(); db.writes = []; db.fail = false; vi.clearAllMocks()
  db.read.mockImplementation(async (column, owner) => {
    expect(column).toBe('user_id')
    return { data: structuredClone([...db.rows.values()].filter(row => row.user_id === owner)), error: null }
  })
  db.write.mockImplementation(async (payload, options) => {
    expect(options).toEqual({ onConflict: 'user_id,job_key' })
    db.writes.push(structuredClone(payload))
    if (db.fail) return { error: new Error('offline') }
    const key = `${payload.user_id}/${payload.job_key}`
    db.rows.set(key, { job_snapshot: null, ...db.rows.get(key), ...structuredClone(payload) })
    return { error: null }
  })
})

describe('interacted snapshot writes and owner-safe restore', () => {
  it.each(['toggleFavorite', 'markViewed', 'markApplied', 'markRejected'] as const)('%s writes only its same owner/key row and restores both facts and flags', async method => {
    const first = setup(); await first.controller.start('owner-a')
    expect(db.writes).toHaveLength(0)
    await first.controller[method](job().id, job())
    expect(db.writes).toHaveLength(1)
    expect(db.writes[0]).toMatchObject({ user_id: 'owner-a', job_key: job().id, source: '104', job_snapshot: serializeJobSnapshot(job()) })
    const restart = setup(); await restart.controller.start('owner-a')
    expect(restart.state().jobs).toEqual({ [job().id]: job() })
    expect(restart.state().statuses).toEqual(first.state().statuses)
    expect(db.rows.size).toBe(1)
    expect(db.writes).toHaveLength(1)
  })
  it('preserves snapshot on flags-only upsert and persists removing favorite', async () => {
    await jobActionRepository.upsert('owner-a', job().id, '104', ['favorite'], serializeJobSnapshot(job())!)
    await jobActionRepository.upsert('owner-a', job().id, '104', [])
    expect(db.writes[1]).not.toHaveProperty('job_snapshot')
    expect(await jobActionRepository.getRecords('owner-a')).toEqual({ statuses: { [job().id]: [] }, jobs: { [job().id]: job() } })
  })
  it('legacy rejoin populates only the same row on interaction, without duplicates or untouched jobs', async () => {
    db.rows.set(`owner-a/${job().id}`, row(job().id))
    const s = setup(); await s.controller.start('owner-a')
    expect(s.state().jobs).toEqual({}); expect(db.writes).toHaveLength(0)
    await s.controller.markViewed(job().id, job())
    expect(db.rows.size).toBe(1)
    expect(s.state().statuses[job().id]).toEqual(['favorite', 'viewed'])
    expect(db.rows.get(`owner-a/${job().id}`).job_snapshot).toEqual(serializeJobSnapshot(job()))
  })
  it('separates two same-title/company REAL identities and Demo/1111 actions', async () => {
    const a = job(), b = job('other123'), s = setup(); await s.controller.start('owner-a')
    await s.controller.toggleFavorite(a.id, a)
    await s.controller.markApplied(b.id, b)
    await s.controller.toggleFavorite('104-01', a)
    await s.controller.markRejected('1111-01', b)
    const records = await jobActionRepository.getRecords('owner-a')
    expect(records.jobs).toEqual({ [a.id]: a, [b.id]: b })
    expect(records.statuses).toEqual({ [a.id]: ['favorite'], [b.id]: ['applied'], '104-01': ['favorite'], '1111-01': ['rejected'] })
    expect(db.writes.slice(2).every(row => !('job_snapshot' in row))).toBe(true)
    expect(records.jobs[b.id].url).toBe('https://www.104.com.tw/job/other123')
  })
  it('refuses cross-attachment at writer and reader boundaries; preserves the action', async () => {
    const a = job(), b = job('other123'), s = setup(); await s.controller.start('owner-a')
    await s.controller.markViewed(a.id, b)
    expect(db.writes[0]).not.toHaveProperty('job_snapshot')
    await expect(jobActionRepository.upsert('owner-a', a.id, '104', ['favorite'], serializeJobSnapshot(b)!)).rejects.toThrow('JOB_SNAPSHOT_CONTRACT_MISMATCH')
    db.rows.set(`owner-a/${a.id}`, row(a.id, serializeJobSnapshot(b)))
    expect(await jobActionRepository.getRecords('owner-a')).toEqual({ statuses: { [a.id]: ['favorite'] }, jobs: {} })
    expect(db.rows.size).toBe(1)
  })
  it.each([null, {}, { schemaVersion: 99 }, 'bad JSON'])('invalid persisted metadata %j keeps the legacy action and does not rewrite/delete', async invalid => {
    db.rows.set(`owner-a/${job().id}`, row(job().id, invalid))
    const s = setup(); await s.controller.start('owner-a')
    expect(s.state().statuses).toEqual({ [job().id]: ['favorite'] })
    expect(s.state().jobs).toEqual({}); expect(db.writes).toHaveLength(0); expect(db.rows.size).toBe(1)
  })
  it('uses newer capture evidence on subsequent action and never changes its timestamp to save time', async () => {
    const s = setup(); await s.controller.start('owner-a')
    await s.controller.toggleFavorite(job().id, job())
    const newer = normalize104CapturedJob({ ...sample[0], title: '更新的 React 工程師' }, '2026-09-29T04:05:00.000Z')
    await s.controller.markApplied(newer.id, newer)
    await s.controller.markViewed(job().id, job())
    expect(db.writes.at(-1).job_snapshot).toEqual(serializeJobSnapshot(newer))
    expect(db.rows.size).toBe(1)
  })
  it('retains independent local metadata and flags after failure, then retries only that job', async () => {
    const s = setup(); await s.controller.start('owner-a'); db.fail = true
    const a = job(); await s.controller.toggleFavorite(a.id, a)
    a.title = 'caller mutation'; s.state().jobs[job().id].title = 'published state mutation'
    expect(s.state().phase).toBe('error')
    db.fail = false; await s.controller.markRejected(job('other').id, job('other'))
    expect(s.state().phase).toBe('error')
    await s.controller.retry()
    expect(db.writes.at(-1).job_snapshot).toEqual(serializeJobSnapshot(job()))
    expect(s.state().unsavedCount).toBe(0)
  })
  it('protects an edited job from delayed cloud metadata and ignores previous-owner restore', async () => {
    const read = deferred<{ data: any[]; error: null }>()
    db.read.mockReturnValueOnce(read.promise)
    const s = setup(), restoring = s.controller.start('owner-a')
    await s.controller.markApplied(job().id, job())
    const older = { ...serializeJobSnapshot(job()), title: 'older', capturedAt: '2020-01-01T00:00:00.000Z' }
    read.resolve({ data: [row(job().id, older), row(job('other').id, serializeJobSnapshot(job('other')))], error: null })
    await restoring
    expect(s.state().jobs[job().id]).toEqual(job())
    expect(s.state().jobs[job('other').id]).toEqual(job('other'))
    await s.controller.start('owner-b')
    expect(s.state()).toMatchObject({ ownerId: 'owner-b', statuses: {}, jobs: {} })
    expect(db.rows.size).toBe(1)
  })
  it('owner switch/discard/suspend prevent stale snapshot restore and queued writes', async () => {
    for (const action of ['owner', 'discard', 'suspend']) {
      const read = deferred<{ data: any[]; error: null }>()
      db.read.mockReturnValueOnce(read.promise)
      const s = setup(), restoring = s.controller.start('owner-a')
      if (action === 'owner') await s.controller.start('owner-b')
      else if (action === 'discard') s.controller.discard()
      else s.controller.suspend()
      read.resolve({ data: [row(job().id, serializeJobSnapshot(job()))], error: null }); await restoring
      expect(s.state().jobs).toEqual({}); expect(s.state().statuses).toEqual({})
    }
    const s = setup(); await s.controller.start('owner-a')
    const queued = s.controller.markViewed(job().id, job()); s.controller.discard(); await queued
    expect(db.writes).toHaveLength(0)
  })
  it('rapid edits retain the newest bound metadata while skipping an obsolete queued version', async () => {
    const write = deferred<{ error: null }>(), s = setup(); await s.controller.start('owner-a')
    db.write.mockReturnValueOnce(write.promise)
    const first = s.controller.toggleFavorite(job().id, job())
    await vi.waitFor(() => expect(db.write).toHaveBeenCalledTimes(1))
    const newer = normalize104CapturedJob({ ...sample[0], title: '新 React 職稱' }, '2026-09-29T04:05:00.000Z')
    const second = s.controller.markViewed(newer.id, newer)
    const third = s.controller.markApplied(newer.id, newer)
    write.resolve({ error: null }); await Promise.all([first, second, third])
    expect(db.write).toHaveBeenCalledTimes(2)
    expect(db.write.mock.calls.at(-1)?.[0]).toMatchObject({ favorite: true, viewed: true, applied: true, rejected: false, job_snapshot: serializeJobSnapshot(newer) })
    expect(s.state().jobs[newer.id]).toEqual(newer)
    expect(s.state().unsavedCount).toBe(0)
  })
})
