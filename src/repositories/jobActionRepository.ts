import { requireSupabase } from '../lib/supabase'
import type { JobSource, JobStatus, StatusMap } from '../types'
import { jobActionSource } from '../services/jobActionIdentity'
import { restoreJobSnapshot, type JobActionRecords, type JobSnapshotV1 } from '../services/jobSnapshot'

const toStatuses = (row: { favorite: boolean; viewed: boolean; applied: boolean; rejected: boolean }): JobStatus[] => {
  const statuses: JobStatus[] = []
  if (row.favorite) statuses.push('favorite')
  if (row.viewed) statuses.push('viewed')
  if (row.applied) statuses.push('applied')
  if (row.rejected) statuses.push('rejected')
  return statuses
}

export const jobActionRepository = {
  async getAll(userId: string): Promise<StatusMap> {
    return (await jobActionRepository.getRecords(userId)).statuses
  },
  async getRecords(userId: string): Promise<JobActionRecords> {
    const { data, error } = await requireSupabase().from('user_job_actions').select('job_key,source,favorite,viewed,applied,rejected,job_snapshot').eq('user_id', userId)
    if (error) throw error
    const records: JobActionRecords = { statuses: {}, jobs: {} }
    for (const row of data ?? []) {
      if (jobActionSource(row.job_key) !== row.source) continue
      records.statuses[row.job_key] = toStatuses(row)
      const job = restoreJobSnapshot(row.job_snapshot, row.job_key, row.source)
      if (job) records.jobs[row.job_key] = job
    }
    return records
  },
  async upsert(userId: string, jobKey: string, source: JobSource, statuses: JobStatus[], snapshot?: JobSnapshotV1): Promise<void> {
    if (!userId || jobActionSource(jobKey) !== source) throw new Error('JOB_IDENTITY_CONTRACT_MISMATCH')
    if (snapshot && !restoreJobSnapshot(snapshot, jobKey, source)) throw new Error('JOB_SNAPSHOT_CONTRACT_MISMATCH')
    const { error } = await requireSupabase().from('user_job_actions').upsert({
      user_id: userId,
      job_key: jobKey,
      source,
      favorite: statuses.includes('favorite'),
      viewed: statuses.includes('viewed'),
      applied: statuses.includes('applied'),
      rejected: statuses.includes('rejected'),
      // Omit the column for flags-only writes; never erase metadata with NULL.
      ...(snapshot ? { job_snapshot: { ...snapshot } } : {}),
    }, { onConflict: 'user_id,job_key' })
    if (error) throw error
  },
  async importMany(userId: string, entries: Array<{ jobKey: string; source: JobSource; statuses: JobStatus[] }>): Promise<void> {
    if (!entries.length) return
    const rows = entries.map(({ jobKey, source, statuses }) => ({ user_id: userId, job_key: jobKey, source, favorite: statuses.includes('favorite'), viewed: statuses.includes('viewed'), applied: statuses.includes('applied'), rejected: statuses.includes('rejected') }))
    const { error } = await requireSupabase().from('user_job_actions').upsert(rows, { onConflict: 'user_id,job_key' })
    if (error) throw error
  },
}
