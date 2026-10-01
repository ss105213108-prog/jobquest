import { payloadMatches104Search } from '../integrations/job104/build104SearchUrl'
import { isSupported104Location } from '../integrations/job104/locationMap'
import { normalize104CapturedJob } from '../integrations/job104/normalize104CapturedJob'
import { build104CanonicalUrl, get104PayloadState } from '../integrations/job104/schema'
import { JOB104_PAYLOAD_TTL_MS } from '../integrations/job104/types'
import type { Job, JobWithMatch, ResumeProfile } from '../types'

export const REAL104_BATCH_LEGACY_KEY = 'jobQuest.real104Batch.v1'
export const REAL104_BATCH_KEY = 'jobQuest.real104Batch.v2'
export const REAL104_MAX_BATCH_SIZE = 40

export interface Real104BatchStoragePort {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface Real104BatchDependencies {
  storage: Real104BatchStoragePort
  matchJobs(resume: ResumeProfile, jobs: Job[]): Promise<JobWithMatch[]>
  getConfirmedResume(): ResumeProfile | null
}

export interface Real104BatchIntent {
  source: 'REAL_104'
  keyword: string
  region: string
}

export type Real104BatchStatus = 'collecting' | 'presented' | 'missing' | 'expired' | 'corrupt' | 'owner-mismatch'

export interface Real104BatchView {
  status: Real104BatchStatus
  searchFingerprint: string | null
  batchNumber: number | null
  currentBatchJobs: Job[]
  pendingJobs: Real104PendingJob[]
  seenSourceKeys: string[]
  firstCapturedAt: string | null
  matches?: JobWithMatch[]
  lastCapture?: { accepted: number; skipped: number; overflow: number }
}

export interface Real104PendingJob {
  job: Job
  sourceUrl: string
  capturedAt: string
  validOrdinal: number
}

interface BatchState {
  version: 2
  ownerUid: string
  keyword: string
  region: string
  searchFingerprint: string
  batchNumber: number
  phase: 'collecting' | 'presented'
  currentBatchJobs: Job[]
  pendingJobs: Real104PendingJob[]
  seenSourceKeys: string[]
  firstCapturedAt: string | null
  presentedAt: string | null
}

type ReadResult =
  | { status: 'ready'; state: BatchState; raw: string }
  | { status: 'missing' | 'expired' | 'corrupt' | 'owner-mismatch' }

export class Real104BatchError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'Real104BatchError'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isIsoTime = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
const isKey = (value: unknown): value is string =>
  typeof value === 'string' && /^104:[a-z0-9]+$/.test(value)
const validNow = (now: number) => Number.isFinite(now) && Number.isFinite(new Date(now).getTime())

export function real104SearchFingerprint(intent: Real104BatchIntent): string {
  if (intent.source !== 'REAL_104' || typeof intent.keyword !== 'string' || !intent.keyword.trim()
    || !isSupported104Location(intent.region)) throw new Real104BatchError('INVALID_SEARCH_INTENT')
  return JSON.stringify(['REAL_104', intent.keyword.trim(), intent.region])
}

// The new envelope stores only canonical public Job fields. Matcher output,
// Connector payloads and private profile data never become working-session data.
function publicJob(value: unknown): Job | null {
  if (!isRecord(value)) return null
  const { id, externalId, source, title, company, location, salary, experience, category,
    description, requiredSkills, url, publishedAt, collectedAt, status } = value
  if (source !== '104' || typeof externalId !== 'string' || !/^[a-z0-9]+$/.test(externalId)
    || id !== `104:${externalId}` || url !== build104CanonicalUrl(externalId) || status !== 'active') return null
  if (![title, company, location, salary, experience, category].every(field => typeof field === 'string' && field.trim().length > 0)
    || typeof description !== 'string' || !Array.isArray(requiredSkills)
    || !requiredSkills.every(skill => typeof skill === 'string')
    || !isIsoTime(collectedAt) || publishedAt !== collectedAt) return null
  return {
    id, externalId, source, title, company, location, salary, experience, category, description,
    requiredSkills: [...requiredSkills], url, publishedAt, collectedAt, status,
  } as Job
}

function validateState(value: unknown, now: number, legacy = false): { status: 'ready'; state: BatchState } | { status: 'corrupt' | 'expired' } {
  if (!isRecord(value) || value.version !== (legacy ? 1 : 2) || typeof value.ownerUid !== 'string' || !value.ownerUid.trim()
    || typeof value.keyword !== 'string' || !value.keyword || value.keyword.trim() !== value.keyword
    || typeof value.region !== 'string' || !isSupported104Location(value.region)
    || typeof value.searchFingerprint !== 'string'
    || !Number.isSafeInteger(value.batchNumber) || (value.batchNumber as number) < 1
    || (value.phase !== 'collecting' && value.phase !== 'presented')
    || !Array.isArray(value.currentBatchJobs) || value.currentBatchJobs.length > REAL104_MAX_BATCH_SIZE
    || (!legacy && !Array.isArray(value.pendingJobs))
    || !Array.isArray(value.seenSourceKeys) || !value.seenSourceKeys.every(isKey)
    || new Set(value.seenSourceKeys).size !== value.seenSourceKeys.length
    || (value.firstCapturedAt !== null && !isIsoTime(value.firstCapturedAt))
    || (value.presentedAt !== null && !isIsoTime(value.presentedAt))) return { status: 'corrupt' }
  const keyword = value.keyword as string
  const region = value.region as string
  if (value.searchFingerprint !== JSON.stringify(['REAL_104', keyword, region])) return { status: 'corrupt' }
  const jobs = value.currentBatchJobs.map(publicJob)
  if (jobs.some(job => job === null)) return { status: 'corrupt' }
  const currentBatchJobs = jobs as Job[]
  const pendingJobs: Real104PendingJob[] = []
  for (const entry of legacy ? [] : value.pendingJobs as unknown[]) {
    if (!isRecord(entry) || typeof entry.sourceUrl !== 'string' || !isIsoTime(entry.capturedAt)
      || !Number.isSafeInteger(entry.validOrdinal) || (entry.validOrdinal as number) < 0) return { status: 'corrupt' }
    const job = publicJob(entry.job)
    if (!job || job.collectedAt !== entry.capturedAt) return { status: 'corrupt' }
    try {
      const url = new URL(entry.sourceUrl)
      if (url.protocol !== 'https:' || url.hostname !== 'www.104.com.tw' || url.pathname !== '/jobs/search/'
        || !payloadMatches104Search({ version: 1, source: '104', sourceUrl: entry.sourceUrl, capturedAt: entry.capturedAt, jobs: [] }, keyword, region))
        return { status: 'corrupt' }
    } catch { return { status: 'corrupt' } }
    pendingJobs.push({ job, sourceUrl: entry.sourceUrl, capturedAt: entry.capturedAt, validOrdinal: entry.validOrdinal as number })
  }
  const ids = currentBatchJobs.map(job => job.id)
  const allIds = [...ids, ...pendingJobs.map(entry => entry.job.id), ...value.seenSourceKeys as string[]]
  if (new Set(allIds).size !== allIds.length) return { status: 'corrupt' }
  if (value.phase === 'collecting' && ids.length < REAL104_MAX_BATCH_SIZE && pendingJobs.length) return { status: 'corrupt' }
  if (value.phase === 'presented' && (!ids.length || value.presentedAt === null)) return { status: 'corrupt' }
  if (value.phase === 'collecting' && value.presentedAt !== null) return { status: 'corrupt' }
  const firstCapturedAt = value.firstCapturedAt as string | null
  if (firstCapturedAt === null) {
    if (ids.length || pendingJobs.length || value.seenSourceKeys.length || value.batchNumber !== 1) return { status: 'corrupt' }
  } else {
    const first = Date.parse(firstCapturedAt)
    if (now - first < -5 * 60 * 1000 || [...currentBatchJobs, ...pendingJobs.map(entry => entry.job)].some(job => Date.parse(job.collectedAt) < first
      || Date.parse(job.collectedAt) > first + JOB104_PAYLOAD_TTL_MS
      || now - Date.parse(job.collectedAt) < -5 * 60 * 1000)) return { status: 'corrupt' }
    if (now - first > JOB104_PAYLOAD_TTL_MS) return { status: 'expired' }
  }
  return { status: 'ready', state: {
    version: 2, ownerUid: value.ownerUid as string, keyword, region,
    searchFingerprint: value.searchFingerprint as string, batchNumber: value.batchNumber as number,
    phase: value.phase as BatchState['phase'], currentBatchJobs, pendingJobs,
    seenSourceKeys: [...value.seenSourceKeys] as string[], firstCapturedAt,
    presentedAt: value.presentedAt as string | null,
  } }
}

function view(state: BatchState, extras: Pick<Real104BatchView, 'matches' | 'lastCapture'> = {}): Real104BatchView {
  return {
    status: state.phase,
    searchFingerprint: state.searchFingerprint,
    batchNumber: state.batchNumber,
    currentBatchJobs: structuredClone(state.currentBatchJobs),
    pendingJobs: structuredClone(state.pendingJobs),
    seenSourceKeys: [...state.seenSourceKeys],
    firstCapturedAt: state.firstCapturedAt,
    ...extras,
  }
}

const unavailable = (status: Exclude<Real104BatchStatus, 'collecting' | 'presented'>): Real104BatchView => ({
  status, searchFingerprint: null, batchNumber: null, currentBatchJobs: [], pendingJobs: [], seenSourceKeys: [], firstCapturedAt: null,
})

export function createReal104BatchWorkingSet({ storage, matchJobs, getConfirmedResume }: Real104BatchDependencies) {
  function read(uid: string, now: number): ReadResult {
    if (!uid?.trim() || !validNow(now)) throw new Real104BatchError('INVALID_OWNER_OR_TIME')
    let raw: string | null
    let legacy = false
    try {
      raw = storage.getItem(REAL104_BATCH_KEY)
      if (raw === null) { raw = storage.getItem(REAL104_BATCH_LEGACY_KEY); legacy = raw !== null }
    }
    catch { throw new Real104BatchError('STORAGE_READ_FAILED') }
    if (raw === null) return { status: 'missing' }
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { return { status: 'corrupt' } }
    const validated = validateState(parsed, now, legacy)
    if (validated.status !== 'ready') return { status: validated.status }
    if (validated.state.ownerUid !== uid) return { status: 'owner-mismatch' }
    if (legacy) {
      // Never invent overflow lost by v1. Keep its bytes as a dormant backup;
      // once v2 exists it is authoritative, even when invalid or expired.
      save(validated.state)
      raw = JSON.stringify(validated.state)
    }
    return { status: 'ready', state: validated.state, raw }
  }

  function ready(uid: string, now: number): Extract<ReadResult, { status: 'ready' }> {
    const result = read(uid, now)
    if (result.status !== 'ready') throw new Real104BatchError(result.status.toUpperCase().replace('-', '_'))
    return result
  }

  function save(state: BatchState): void {
    try { storage.setItem(REAL104_BATCH_KEY, JSON.stringify(state)) }
    catch { throw new Real104BatchError('STORAGE_WRITE_FAILED') }
  }

  async function present(resume: ResumeProfile | null, uid: string, now: number, lastCapture?: Real104BatchView['lastCapture']): Promise<Real104BatchView> {
    const before = ready(uid, now)
    if (before.state.phase !== 'collecting' || !before.state.currentBatchJobs.length)
      throw new Real104BatchError('BATCH_NOT_COMMITTABLE')
    if (!resume) throw new Real104BatchError('CONFIRMED_RESUME_REQUIRED')
    let matches: JobWithMatch[]
    try { matches = await matchJobs(resume, structuredClone(before.state.currentBatchJobs)) }
    catch { throw new Real104BatchError('MATCHING_FAILED') }
    const expected = before.state.currentBatchJobs.map(job => job.id)
    if (!Array.isArray(matches) || matches.length !== expected.length
      || new Set(matches.map(item => item?.job?.id)).size !== expected.length
      || matches.some(item => !expected.includes(item?.job?.id))) throw new Real104BatchError('MATCHING_RESULT_INVALID')
    const latest = ready(uid, now)
    if (latest.raw !== before.raw) throw new Real104BatchError('STALE_BATCH_OPERATION')
    const next: BatchState = { ...before.state, phase: 'presented', presentedAt: new Date(now).toISOString() }
    save(next)
    return view(next, { matches: structuredClone(matches), ...(lastCapture ? { lastCapture } : {}) })
  }

  return {
    startOrResumeSearch(intent: Real104BatchIntent, uid: string, now: number): Real104BatchView {
      const searchFingerprint = real104SearchFingerprint(intent)
      const existing = read(uid, now)
      if (existing.status === 'ready' && existing.state.searchFingerprint === searchFingerprint) return view(existing.state)
      const next: BatchState = {
        version: 2, ownerUid: uid, keyword: intent.keyword.trim(), region: intent.region,
        searchFingerprint, batchNumber: 1, phase: 'collecting', currentBatchJobs: [],
        pendingJobs: [], seenSourceKeys: [], firstCapturedAt: null, presentedAt: null,
      }
      save(next)
      return view(next)
    },

    async addCapture(input: unknown, uid: string, now: number): Promise<Real104BatchView> {
      const before = ready(uid, now)
      if (before.state.phase !== 'collecting' || before.state.currentBatchJobs.length === REAL104_MAX_BATCH_SIZE)
        throw new Real104BatchError('BATCH_FULL_OR_PRESENTED')
      const result = get104PayloadState(input, now)
      if (result.state !== 'ready' || !result.payload) throw new Real104BatchError(`CAPTURE_${result.state.toUpperCase().replace('-', '_')}`)
      if (!payloadMatches104Search(result.payload, before.state.keyword, before.state.region))
        throw new Real104BatchError('CAPTURE_SEARCH_MISMATCH')
      const normalized = result.payload.jobs.map(job => normalize104CapturedJob(job, result.payload!.capturedAt))
      const existing = new Set([...before.state.seenSourceKeys, ...before.state.currentBatchJobs.map(job => job.id), ...before.state.pendingJobs.map(entry => entry.job.id)])
      const added: Job[] = []
      const pendingJobs = [...before.state.pendingJobs]
      let skipped = 0, overflow = 0
      for (const [validOrdinal, job] of normalized.entries()) {
        if (existing.has(job.id)) { skipped++; continue }
        existing.add(job.id)
        if (before.state.currentBatchJobs.length + added.length >= REAL104_MAX_BATCH_SIZE) {
          pendingJobs.push({ job, sourceUrl: result.payload.sourceUrl, capturedAt: result.payload.capturedAt, validOrdinal })
          overflow++
          continue
        }
        added.push(job)
      }
      const lastCapture = { accepted: added.length, skipped, overflow }
      if (!added.length) return view(before.state, { lastCapture })
      const at = result.payload.capturedAt
      const firstCapturedAt = !before.state.firstCapturedAt || at < before.state.firstCapturedAt ? at : before.state.firstCapturedAt
      const next: BatchState = {
        ...before.state, currentBatchJobs: [...before.state.currentBatchJobs, ...added], pendingJobs, firstCapturedAt,
      }
      save(next)
      if (next.currentBatchJobs.length < REAL104_MAX_BATCH_SIZE) return view(next, { lastCapture })
      let resume: ResumeProfile | null
      try { resume = getConfirmedResume() }
      catch { throw new Real104BatchError('CONFIRMED_RESUME_UNAVAILABLE') }
      return present(resume, uid, now, lastCapture)
    },

    presentCurrentBatch(resume: ResumeProfile, uid: string, now: number): Promise<Real104BatchView> {
      return present(resume, uid, now)
    },

    startNextBatch(uid: string, now: number): Real104BatchView | Promise<Real104BatchView> {
      const before = ready(uid, now).state
      if (before.phase !== 'presented') throw new Real104BatchError('BATCH_NOT_PRESENTED')
      const next: BatchState = {
        ...before, batchNumber: before.batchNumber + 1, phase: 'collecting',
        currentBatchJobs: before.pendingJobs.slice(0, REAL104_MAX_BATCH_SIZE).map(entry => entry.job),
        pendingJobs: before.pendingJobs.slice(REAL104_MAX_BATCH_SIZE),
        seenSourceKeys: [...before.seenSourceKeys, ...before.currentBatchJobs.map(job => job.id)], presentedAt: null,
      }
      save(next)
      if (next.currentBatchJobs.length === REAL104_MAX_BATCH_SIZE) {
        let resume: ResumeProfile | null
        try { resume = getConfirmedResume() }
        catch { throw new Real104BatchError('CONFIRMED_RESUME_UNAVAILABLE') }
        return present(resume, uid, now)
      }
      return view(next)
    },

    restore(uid: string, now: number): Real104BatchView {
      const result = read(uid, now)
      return result.status === 'ready' ? view(result.state) : unavailable(result.status)
    },
  }
}
