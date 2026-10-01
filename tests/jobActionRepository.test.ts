import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobStatus } from '../src/types'
import { mockJobs } from '../src/data/mockJobs'
import { jobActionSource, isJobActionInScope } from '../src/services/jobActionIdentity'

const db = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), read: vi.fn(), write: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ requireSupabase: () => ({ from: db.from }) }))
import { jobActionRepository } from '../src/repositories/jobActionRepository'
import { jobActionService } from '../src/services/jobActionService'

const row = (job_key: string, statuses: JobStatus[], source = '104') => ({ job_key, source,
  favorite: statuses.includes('favorite'), viewed: statuses.includes('viewed'), applied: statuses.includes('applied'), rejected: statuses.includes('rejected') })
beforeEach(() => {
  vi.clearAllMocks()
  db.from.mockReturnValue({ select: db.select, upsert: db.write })
  db.select.mockReturnValue({ eq: db.read })
  db.read.mockResolvedValue({ data: [], error: null })
  db.write.mockResolvedValue({ error: null })
})
describe('existing user_job_actions repository and canonical identity', () => {
  it.each(['favorite', 'viewed', 'applied', 'rejected'] as JobStatus[])('round-trips %s through existing booleans without a job record', async status => {
    await jobActionService.set('owner-a', '104:abc123', [status])
    const payload = db.write.mock.calls[0][0]
    expect(payload).toEqual({ user_id: 'owner-a', ...row('104:abc123', [status]) })
    expect(db.write.mock.calls[0][1]).toEqual({ onConflict: 'user_id,job_key' })
    db.read.mockResolvedValue({ data: [payload], error: null })
    expect(await jobActionService.load('owner-a')).toEqual({ '104:abc123': [status] })
    expect(db.read).toHaveBeenCalledExactlyOnceWith('user_id', 'owner-a')
    expect(db.from.mock.calls.every(([table]) => table === 'user_job_actions')).toBe(true)
  })
  it('round-trips combined favorite/viewed/progress and serializes removal as false', async () => {
    const statuses: JobStatus[] = ['favorite', 'viewed', 'applied']
    await jobActionService.set('owner-a', '104:abc123', statuses)
    db.read.mockResolvedValue({ data: [db.write.mock.calls[0][0]], error: null })
    expect(await jobActionService.load('owner-a')).toEqual({ '104:abc123': statuses })
    await jobActionService.set('owner-a', '104:abc123', [])
    expect(db.write.mock.calls[1][0]).toEqual({ user_id: 'owner-a', ...row('104:abc123', []) })
  })
  it('loads an empty owner without writes or legacy localStorage access', async () => {
    const localStorage = { getItem: vi.fn(() => { throw new Error('Legacy storage must not be used') }) }
    vi.stubGlobal('localStorage', localStorage)
    try {
      expect(await jobActionService.load('owner-a')).toEqual({})
      expect(localStorage.getItem).not.toHaveBeenCalled()
      expect(db.write).not.toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })
  it('restores multiple REAL/Demo keys separately and ignores mismatched or unknown identities', async () => {
    db.read.mockResolvedValue({ data: [row('104:01', ['applied']), row('104-01', ['favorite']), row('1111-01', ['viewed'], '1111'), row('104:badsource', ['rejected'], '1111'), row('title-only', ['favorite'])], error: null })
    expect(await jobActionService.load('owner-a')).toEqual({ '104:01': ['applied'], '104-01': ['favorite'], '1111-01': ['viewed'] })
  })
  it.each(['title only', 'abc123', '0', '104:ABC123', '104:', '1111:abc', '__proto__'])('never writes unsupported identity %s', async key => {
    await expect(jobActionService.set('owner-a', key, ['favorite'])).rejects.toThrow('JOB_IDENTITY_CONTRACT_MISMATCH')
    expect(db.from).not.toHaveBeenCalled()
  })
  it('rejects a source/key mismatch before making a DB request', async () => {
    await expect(jobActionRepository.upsert('owner-a', '104:abc123', '1111', ['favorite'])).rejects.toThrow('JOB_IDENTITY_CONTRACT_MISMATCH')
    expect(db.from).not.toHaveBeenCalled()
  })
  it('propagates a read failure rather than fabricating restored statuses', async () => {
    const error = new Error('read failure')
    db.read.mockResolvedValue({ data: null, error })
    await expect(jobActionService.load('owner-a')).rejects.toBe(error)
    expect(db.write).not.toHaveBeenCalled()
  })
  it('propagates owner/RLS write rejection through the service', async () => {
    const error = { code: '42501', message: 'synthetic RLS rejection' }
    db.write.mockResolvedValue({ error })
    await expect(jobActionService.set('owner-a', '104:abc123', ['applied'])).rejects.toBe(error)
  })
  it('retains every existing fixture identity and separates it from REAL keys', () => {
    for (const job of mockJobs) {
      expect(jobActionSource(job.id)).toBe(job.source)
      expect(isJobActionInScope(job.id, job.source, true)).toBe(true)
      expect(isJobActionInScope(job.id, job.source, false)).toBe(false)
    }
    expect(isJobActionInScope('104:01', '104', false)).toBe(true)
    expect(isJobActionInScope('104:01', '104', true)).toBe(false)
    expect(isJobActionInScope('104:01', '1111', false)).toBe(false)
  })
})
