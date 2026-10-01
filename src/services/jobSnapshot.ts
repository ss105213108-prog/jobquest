import { normalize104CapturedJob } from '../integrations/job104/normalize104CapturedJob'
import { build104CanonicalUrl } from '../integrations/job104/schema'
import type { Job, StatusMap } from '../types'

export type JobSnapshotV1 = {
  schemaVersion: 1
  sourceKey: string
  title: string
  company: string
  location: string
  salary: string
  experience: string
  description: string
  capturedAt: string
}
export type JobActionRecords = { statuses: StatusMap; jobs: Record<string, Job> }
const fields = ['schemaVersion', 'sourceKey', 'title', 'company', 'location', 'salary', 'experience', 'description', 'capturedAt']

// The row owns identity. A persisted snapshot is historical evidence, without session TTL.
export function restoreJobSnapshot(value: unknown, jobKey: string, source: string): Job | null {
  if (source !== '104' || !/^104:[a-z0-9]+$/.test(jobKey) || !value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== fields.length || fields.some(key => !Object.hasOwn(record, key))) return null
  if (record.schemaVersion !== 1 || record.sourceKey !== jobKey) return null
  if (['title', 'company', 'location', 'salary', 'experience'].some(key => typeof record[key] !== 'string' || !(record[key] as string).trim())) return null
  if (typeof record.description !== 'string' || record.description !== record.description.trim() || record.experience !== (record.experience as string).trim()) return null
  if (typeof record.capturedAt !== 'string' || !Number.isFinite(Date.parse(record.capturedAt)) || new Date(record.capturedAt).toISOString() !== record.capturedAt) return null
  const snapshot = record as JobSnapshotV1
  const externalId = jobKey.slice(4)
  return normalize104CapturedJob({ externalId, sourceKey: jobKey, title: snapshot.title,
    company: snapshot.company, location: snapshot.location, salaryText: snapshot.salary,
    experienceText: snapshot.experience, snippetText: snapshot.description,
    canonicalUrl: build104CanonicalUrl(externalId) }, snapshot.capturedAt)
}

// Whitelist only existing normalized public facts; never project scores or raw capture data.
export function serializeJobSnapshot(job: Job): JobSnapshotV1 | null {
  const snapshot: JobSnapshotV1 = { schemaVersion: 1, sourceKey: job.id, title: job.title,
    company: job.company, location: job.location, salary: job.salary, experience: job.experience,
    description: job.description, capturedAt: job.collectedAt }
  const restored = restoreJobSnapshot(snapshot, job.id, job.source)
  if (!restored || (Object.keys(restored) as (keyof Job)[]).some(key => JSON.stringify(restored[key]) !== JSON.stringify(job[key]))) return null
  return snapshot
}
