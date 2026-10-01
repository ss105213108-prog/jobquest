import { jobActionRepository } from '../repositories/jobActionRepository'
import { jobActionSource } from './jobActionIdentity'
import type { JobStatus, StatusMap } from '../types'
import type { JobSnapshotV1 } from './jobSnapshot'

const addStatus = (current: JobStatus[], next: JobStatus): JobStatus[] => [...new Set([...current, next])]

export const jobActionService = {
  async load(userId: string): Promise<StatusMap> {
    // Restore is read-only; unowned legacy localStorage is never auto-imported.
    return jobActionRepository.getAll(userId)
  },
  loadRecords: jobActionRepository.getRecords,
  async set(userId: string, jobId: string, statuses: JobStatus[], snapshot?: JobSnapshotV1): Promise<void> {
    const source = jobActionSource(jobId)
    if (!source) throw new Error('JOB_IDENTITY_CONTRACT_MISMATCH')
    if (snapshot) await jobActionRepository.upsert(userId, jobId, source, statuses, snapshot)
    else await jobActionRepository.upsert(userId, jobId, source, statuses)
  },
  nextFavorite(current: JobStatus[]): JobStatus[] {
    return current.includes('favorite') ? current.filter((status) => status !== 'favorite') : [...current, 'favorite']
  },
  nextViewed(current: JobStatus[]): JobStatus[] {
    return addStatus(current, 'viewed')
  },
  // Match the current local reducer: retain viewed; only applied/rejected conflict.
  nextApplied: (current: JobStatus[]) => addStatus(current.filter(status => status !== 'rejected'), 'applied'),
  nextRejected: (current: JobStatus[]) => addStatus(current.filter(status => status !== 'applied'), 'rejected'),
}
