import {
  JOB104_PAYLOAD_TTL_MS,
  JOB104_PAYLOAD_VERSION,
  type Job104Capture,
  type Job104Payload,
  type Job104PayloadState,
} from './types'

const JOB_ID_PATTERN = /^[a-z0-9]+$/
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

export function build104CanonicalUrl(externalId: string): string {
  const normalizedId = externalId.trim().toLocaleLowerCase('en-US')
  if (!JOB_ID_PATTERN.test(normalizedId)) throw new Error('104 Job ID 格式不正確。')
  return `https://www.104.com.tw/job/${normalizedId}`
}

function validateSourceUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'www.104.com.tw' && url.pathname === '/jobs/search/'
  } catch {
    return false
  }
}

export function parse104Capture(value: unknown): Job104Capture | null {
  if (!isRecord(value)) return null
  const { externalId: rawExternalId, sourceKey, title, company, location, salaryText, canonicalUrl } = value
  if (![rawExternalId, sourceKey, title, company, location, salaryText, canonicalUrl].every(isNonEmptyString)) return null

  const externalId = (rawExternalId as string).trim().toLocaleLowerCase('en-US')
  if (!JOB_ID_PATTERN.test(externalId)) return null
  if (sourceKey !== `104:${externalId}` || canonicalUrl !== build104CanonicalUrl(externalId)) return null
  if (value.experienceText !== undefined && typeof value.experienceText !== 'string') return null
  if (value.snippetText !== undefined && typeof value.snippetText !== 'string') return null

  return {
    externalId,
    sourceKey: sourceKey as string,
    title: (title as string).trim(),
    company: (company as string).trim(),
    location: (location as string).trim(),
    salaryText: (salaryText as string).trim(),
    experienceText: value.experienceText?.trim() || undefined,
    snippetText: value.snippetText?.trim() || undefined,
    canonicalUrl: canonicalUrl as string,
  }
}

export function parse104Payload(value: unknown): Job104Payload | null {
  if (!isRecord(value) || value.version !== JOB104_PAYLOAD_VERSION || value.source !== '104') return null
  if (!isNonEmptyString(value.capturedAt) || !Number.isFinite(Date.parse(value.capturedAt))) return null
  if (!validateSourceUrl(value.sourceUrl) || !Array.isArray(value.jobs) || value.jobs.length < 1) return null

  const jobs = value.jobs.map(parse104Capture)
  if (jobs.some((job) => job === null)) return null
  const validJobs = jobs as Job104Capture[]
  if (new Set(validJobs.map((job) => job.sourceKey)).size !== validJobs.length) return null

  return {
    version: JOB104_PAYLOAD_VERSION,
    source: '104',
    capturedAt: new Date(value.capturedAt).toISOString(),
    sourceUrl: value.sourceUrl,
    jobs: validJobs,
  }
}

export function get104PayloadState(value: unknown, now = Date.now()): { state: Job104PayloadState; payload?: Job104Payload } {
  if (value === null || value === undefined) return { state: 'no-capture' }
  const payload = parse104Payload(value)
  if (!payload) return { state: 'malformed' }
  const age = now - Date.parse(payload.capturedAt)
  if (age < -5 * 60 * 1000) return { state: 'malformed' }
  if (age > JOB104_PAYLOAD_TTL_MS) return { state: 'expired', payload }
  return { state: 'ready', payload }
}
