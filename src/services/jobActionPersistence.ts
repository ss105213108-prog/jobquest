import { jobActionService } from './jobActionService'
import { jobActionSource } from './jobActionIdentity'
import type { Job, JobStatus, StatusMap } from '../types'
import { serializeJobSnapshot, type JobSnapshotV1 } from './jobSnapshot'

export interface JobActionPersistenceState {
  ownerId: string | null
  statuses: StatusMap
  jobs: Record<string, Job>
  phase: 'idle' | 'restoring' | 'restored' | 'saving' | 'saved' | 'error'
  operation: 'restore' | 'save' | null
  ready: boolean
  unsavedCount: number
}
export const initialJobActionPersistenceState: JobActionPersistenceState = {
  ownerId: null, statuses: {}, jobs: {}, phase: 'idle', operation: null, ready: false, unsavedCount: 0,
}

export function createJobActionPersistence(
  publish: (state: JobActionPersistenceState) => void,
  service: Pick<typeof jobActionService, 'load' | 'set'> & Partial<Pick<typeof jobActionService, 'loadRecords'>> = jobActionService,
) {
  let ownerId: string | null = null
  let statuses: StatusMap = {}
  let jobs: Record<string, Job> = {}
  let epoch = 0, active = true, ready = false, loading = false, restoreFailed = false
  let restored = false, saved = false
  let queue = Promise.resolve()
  const versions = new Map<string, number>()
  const dirty = new Map<string, { version: number; statuses: JobStatus[]; snapshot?: JobSnapshotV1 }>()
  const failed = new Set<string>()
  const emit = () => {
    if (!active) return
    const saveError = failed.size > 0 || (!ownerId && dirty.size > 0)
    publish({ ownerId, statuses: structuredClone(statuses), jobs: structuredClone(jobs), ready, unsavedCount: dirty.size,
      phase: saveError || restoreFailed ? 'error' : loading ? 'restoring' : dirty.size ? 'saving' : saved ? 'saved' : restored ? 'restored' : 'idle',
      operation: saveError || dirty.size ? 'save' : restoreFailed || loading ? 'restore' : null,
    })
  }
  const persist = (jobKey: string): Promise<void> => {
    const edit = dirty.get(jobKey), owner = ownerId, generation = epoch
    if (!edit || !owner) { emit(); return Promise.resolve() }
    queue = queue.then(async () => {
      if (!active || generation !== epoch || owner !== ownerId || dirty.get(jobKey)?.version !== edit.version) return
      try {
        if (edit.snapshot) await service.set(owner, jobKey, [...edit.statuses], structuredClone(edit.snapshot))
        else await service.set(owner, jobKey, [...edit.statuses])
        if (!active || generation !== epoch) return
        if (dirty.get(jobKey)?.version === edit.version) { dirty.delete(jobKey); failed.delete(jobKey); saved = true }
      } catch {
        if (active && generation === epoch && dirty.get(jobKey)?.version === edit.version) failed.add(jobKey)
      }
      emit()
    })
    return queue
  }
  const start = async (nextOwner: string | null): Promise<void> => {
    const generation = ++epoch
    active = true
    if (ownerId !== nextOwner && ownerId !== null) {
      statuses = {}; jobs = {}; versions.clear(); dirty.clear(); failed.clear()
      ready = false; restored = false; saved = false
      queue = Promise.resolve()
    }
    ownerId = nextOwner
    restoreFailed = false
    if (!ownerId) { loading = false; ready = true; emit(); return }
    loading = true
    emit()
    const pending = [...dirty.keys()].map(persist)
    try {
      const records = service.loadRecords ? await service.loadRecords(ownerId) : { statuses: await service.load(ownerId), jobs: {} }
      const cloud = records.statuses
      if (!active || generation !== epoch) return
      // A delayed read can restore untouched jobs, but never overwrite an edit.
      const edits = Object.fromEntries([...versions.keys()].map(key => [key, statuses[key] ?? []]))
      statuses = { ...structuredClone(cloud), ...edits }
      const editedJobs = Object.fromEntries(Object.entries(jobs).filter(([key, job]) => versions.has(key)
        && (!records.jobs[key] || job.collectedAt >= records.jobs[key].collectedAt)))
      jobs = { ...structuredClone(records.jobs), ...editedJobs }
      restored = Object.keys(cloud).length > 0
    } catch {
      if (!active || generation !== epoch) return
      restoreFailed = true
    }
    if (!active || generation !== epoch) return
    loading = false; ready = true; emit()
    await Promise.all(pending)
  }
  const change = (jobKey: string, next: (current: JobStatus[]) => JobStatus[], job?: Job): Promise<void> => {
    if (!jobActionSource(jobKey)) return Promise.resolve()
    const snapshot = next([...(statuses[jobKey] ?? [])])
    const version = (versions.get(jobKey) ?? 0) + 1
    versions.set(jobKey, version)
    statuses = { ...statuses, [jobKey]: [...snapshot] }
    const candidate = job?.id === jobKey ? serializeJobSnapshot(job) : null
    if (candidate && (!jobs[jobKey] || candidate.capturedAt >= jobs[jobKey].collectedAt)) jobs = { ...jobs, [jobKey]: structuredClone(job!) }
    const metadata = jobs[jobKey] ? serializeJobSnapshot(jobs[jobKey]) : null
    dirty.set(jobKey, { version, statuses: [...snapshot], ...(metadata ? { snapshot: metadata } : {}) })
    failed.delete(jobKey)
    emit() // Update local UI before any remote request; errors never roll it back.
    return persist(jobKey)
  }
  return {
    start,
    toggleFavorite: (id: string, job?: Job) => change(id, jobActionService.nextFavorite, job),
    markViewed: (id: string, job?: Job) => change(id, jobActionService.nextViewed, job),
    markApplied: (id: string, job?: Job) => change(id, jobActionService.nextApplied, job),
    markRejected: (id: string, job?: Job) => change(id, jobActionService.nextRejected, job),
    async retry(): Promise<void> {
      if (restoreFailed) { await start(ownerId); return }
      await Promise.all([...dirty.keys()].map(key => { failed.delete(key); return persist(key) }))
      emit()
    },
    discard(): void {
      epoch++; statuses = {}; jobs = {}; versions.clear(); dirty.clear(); failed.clear()
      loading = false; restoreFailed = false; restored = false; saved = false; ready = true
      emit() // Session-only reset never deletes saved rows.
    },
    suspend(): void { active = false; epoch++ },
  }
}
