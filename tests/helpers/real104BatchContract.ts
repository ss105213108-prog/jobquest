import { vi } from 'vitest'
import { build104SearchUrl } from '../../src/integrations/job104/build104SearchUrl'
import { normalize104CapturedJob } from '../../src/integrations/job104/normalize104CapturedJob'
import { JOB104_PAYLOAD_VERSION, type Job104Payload } from '../../src/integrations/job104/types'
import type { Job, JobWithMatch, ResumeProfile } from '../../src/types'

// Test-only proposed interface from docs/jobquest-real104-batch-design.md.
// There is deliberately no production adapter or fallback implementation here.
export const NOW = Date.parse('2026-09-30T04:00:00.000Z')
export const UID = 'anonymous-owner-a'
export const INTENT = { source: 'REAL_104' as const, keyword: '工程師', region: '台中市' }
export type Intent = typeof INTENT
export type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface BatchView {
  status: 'collecting' | 'presented' | 'missing' | 'expired' | 'corrupt' | 'owner-mismatch'
  searchFingerprint: string | null
  batchNumber: number | null
  currentBatchJobs: Job[]
  seenSourceKeys: string[]
  firstCapturedAt: string | null
  matches?: JobWithMatch[]
  lastCapture?: { accepted: number; skipped: number; overflow: number }
}

export interface BatchContract {
  startOrResumeSearch(intent: Intent, uid: string, now: number): BatchView | Promise<BatchView>
  addCapture(payload: unknown, uid: string, now: number): BatchView | Promise<BatchView>
  presentCurrentBatch(resume: ResumeProfile, uid: string, now: number): BatchView | Promise<BatchView>
  startNextBatch(uid: string, now: number): BatchView | Promise<BatchView>
  restore(uid: string, now: number): BatchView | Promise<BatchView>
}

export type CreateBatchContract = (deps: {
  storage: StoragePort
  matchJobs: (resume: ResumeProfile, jobs: Job[]) => Promise<JobWithMatch[]>
  getConfirmedResume: () => ResumeProfile | null
}) => BatchContract

export async function loadBatchContract(): Promise<CreateBatchContract> {
  const modulePath = '../../src/services/real104BatchWorkingSet'
  // Vitest resolves this only when a behavior test runs. Missing production is
  // a deliberate RED, while unrelated existing tests remain runnable.
  const module = await vi.importActual<{ createReal104BatchWorkingSet?: CreateBatchContract }>(modulePath)
  if (typeof module.createReal104BatchWorkingSet !== 'function') {
    throw new Error('EXPECTED_RED: real104BatchWorkingSet contract has not been implemented')
  }
  return module.createReal104BatchWorkingSet
}

export function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  const storage: StoragePort = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  }
  return { storage, values }
}

export const profile: ResumeProfile = {
  id: 'anonymous-profile', name: '測試使用者', skills: [], projects: [],
  workExperiences: [], education: { school: '', department: '', graduationStatus: '' },
  careerDirections: [], updatedAt: new Date(NOW).toISOString(), level: 1, abilities: [],
}

export function ids(...names: string[]) { return names.map(name => `104:${name}`) }
export function names(start: number, count: number) {
  return Array.from({ length: count }, (_, offset) => `j${(start + offset).toString(36)}`)
}

export function capture(
  names: string[], options: { at?: number; page?: number; keyword?: string; region?: string; title?: string; company?: string } = {},
): Job104Payload {
  const at = options.at ?? NOW
  const sourceUrl = new URL(build104SearchUrl(options.keyword ?? INTENT.keyword, options.region ?? INTENT.region))
  if (options.page !== undefined) sourceUrl.searchParams.set('page', String(options.page))
  return {
    version: JOB104_PAYLOAD_VERSION, source: '104', capturedAt: new Date(at).toISOString(), sourceUrl: sourceUrl.toString(),
    jobs: names.map(name => ({
      externalId: name, sourceKey: `104:${name}`, title: options.title ?? `職缺 ${name}`,
      company: options.company ?? '測試公司', location: options.region ?? INTENT.region,
      salaryText: '面議', canonicalUrl: `https://www.104.com.tw/job/${name}`,
    })),
  }
}

export const normalized = (payload: Job104Payload) => payload.jobs.map(job => normalize104CapturedJob(job, payload.capturedAt))
export const keys = (view: BatchView) => view.currentBatchJobs.map(job => job.id)
export const matcher = vi.fn(async (_resume: ResumeProfile, jobs: Job[]): Promise<JobWithMatch[]> =>
  jobs.map(job => ({ job, match: { jobId: job.id, matchScore: 0, matchLevel: 'C', matchedSkills: [], missingSkills: [], matchReasons: [] } })))

export async function harness(storage = memoryStorage().storage, getConfirmedResume: () => ResumeProfile | null = () => profile) {
  const create = await loadBatchContract()
  matcher.mockClear()
  return { batch: create({ storage, matchJobs: matcher, getConfirmedResume }), storage }
}

export async function started(storage = memoryStorage().storage, intent: Intent = INTENT, now = NOW) {
  const { batch } = await harness(storage)
  await batch.startOrResumeSearch(intent, UID, now)
  return batch
}
