import { build104SearchUrl } from '../integrations/job104/build104SearchUrl'
import { build104CanonicalUrl, get104PayloadState } from '../integrations/job104/schema'
import { JOB104_MAX_JOBS, JOB104_PAYLOAD_VERSION } from '../integrations/job104/types'
import type { Job, JobWithMatch } from '../types'

export const REAL104_SESSION_KEY = 'jobQuest.real104Session.v1'
export type JobDataMode = 'REAL_104' | 'DEMO_LOCAL'
export interface Real104Snapshot {
  jobs: Job[]
  keyword: string
  location: string
  capturedAt: string
  importedAt: string
}
export interface Real104Session {
  mode: JobDataMode | null
  status: 'missing' | 'ready' | 'expired' | 'corrupt'
  snapshot: Real104Snapshot | null
}
export interface Real104SessionView {
  status: Real104Session['status']
  matches: JobWithMatch[]
  matching: boolean
  error: string | null
}
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
const browserStorage = (): StoragePort | null => { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage } catch { return null } }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const validTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))

function publicJob(value: unknown, capturedAt: string): Job | null {
  if (!record(value)) return null
  const { id, externalId, source, title, company, location, salary, experience, category, description, requiredSkills, url, publishedAt, collectedAt, status } = value
  if (source !== '104' || typeof externalId !== 'string' || !/^[a-z0-9]+$/.test(externalId) || id !== `104:${externalId}` || url !== build104CanonicalUrl(externalId)) return null
  if (![title, company, location, salary, experience, category].every(field => typeof field === 'string' && field.trim().length > 0) || typeof description !== 'string') return null
  if (!Array.isArray(requiredSkills) || !requiredSkills.every(skill => typeof skill === 'string') || publishedAt !== capturedAt || collectedAt !== capturedAt || status !== 'active') return null
  // Project only normalized public Job fields, never payloads, credentials or scores.
  return { id, externalId, source, title, company, location, salary, experience, category, description, requiredSkills: [...requiredSkills], url, publishedAt, collectedAt, status } as Job
}

export function validateReal104Session(value: unknown, now = Date.now()): Real104Session {
  const mode = record(value) && (value.mode === 'REAL_104' || value.mode === 'DEMO_LOCAL') ? value.mode : 'REAL_104'
  const invalid: Real104Session = { mode, status: 'corrupt', snapshot: null }
  if (!record(value) || value.version !== 1 || (value.mode !== 'REAL_104' && value.mode !== 'DEMO_LOCAL')) return invalid
  if (value.snapshot === null) return { mode, status: value.issue === 'expired' || value.issue === 'corrupt' ? value.issue : 'missing', snapshot: null }
  const snapshot = value.snapshot
  if (!record(snapshot) || typeof snapshot.keyword !== 'string' || typeof snapshot.location !== 'string' || !validTime(snapshot.capturedAt) || !validTime(snapshot.importedAt)) return invalid
  if (!Array.isArray(snapshot.jobs) || !snapshot.jobs.length || snapshot.jobs.length > JOB104_MAX_JOBS) return invalid
  const jobs = snapshot.jobs.map(job => publicJob(job, snapshot.capturedAt as string))
  if (jobs.some(job => !job)) return invalid
  const normalized = jobs as Job[]
  try {
    // Reuse the accepted Connector validator, including its exact TTL and clock
    // tolerance. This transient envelope is validated in memory, never stored.
    const freshness = get104PayloadState({ version: JOB104_PAYLOAD_VERSION, source: '104', capturedAt: snapshot.capturedAt,
      sourceUrl: build104SearchUrl(snapshot.keyword, snapshot.location),
      jobs: normalized.map(job => ({ externalId: job.externalId, sourceKey: job.id, title: job.title, company: job.company, location: job.location, salaryText: job.salary, canonicalUrl: job.url })),
    }, now)
    if (freshness.state === 'expired') return { mode, status: 'expired', snapshot: null }
    if (freshness.state !== 'ready') return invalid
  } catch { return invalid }
  return { mode, status: 'ready', snapshot: { jobs: normalized, keyword: snapshot.keyword, location: snapshot.location, capturedAt: snapshot.capturedAt, importedAt: snapshot.importedAt } }
}

export function writeReal104Session(session: Real104Session, storage = browserStorage()): boolean {
  if (!storage) return false
  try {
    const snapshot = session.snapshot
    storage.setItem(REAL104_SESSION_KEY, JSON.stringify({ version: 1, mode: session.mode ?? 'DEMO_LOCAL',
      snapshot: snapshot ? { jobs: snapshot.jobs.map(job => publicJob(job, snapshot.capturedAt)), keyword: snapshot.keyword, location: snapshot.location, capturedAt: snapshot.capturedAt, importedAt: snapshot.importedAt } : null,
      issue: session.status === 'expired' || session.status === 'corrupt' ? session.status : null,
    }))
    return true
  } catch { return false }
}

export function readReal104Session(storage = browserStorage(), now = Date.now()): Real104Session {
  const empty: Real104Session = { mode: null, status: 'missing', snapshot: null }
  if (!storage) return empty
  try {
    const raw = storage.getItem(REAL104_SESSION_KEY)
    if (raw === null) return empty
    const session = validateReal104Session(JSON.parse(raw), now)
    if (session.status === 'expired' || session.status === 'corrupt') writeReal104Session(session, storage)
    return session
  } catch {
    const invalid: Real104Session = { mode: 'REAL_104', status: 'corrupt', snapshot: null }
    writeReal104Session(invalid, storage)
    return invalid
  }
}

export function createReal104Session(jobs: Job[], keyword: string, location: string, capturedAt: string, now = Date.now()): Real104Session {
  return validateReal104Session({ version: 1, mode: 'REAL_104', snapshot: { jobs, keyword, location, capturedAt, importedAt: new Date(now).toISOString() } }, now)
}

export function real104SessionMessage(status: Real104Session['status']): string | null {
  return status === 'expired' ? '104 職缺資料已過期，請重新匯入。'
    : status === 'corrupt' ? '104 職缺資料無法還原，請重新匯入。' : null
}
