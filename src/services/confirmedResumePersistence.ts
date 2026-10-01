import { resumeRepository } from '../repositories/resumeRepository'
import type { ResumeProfile } from '../types'

export interface ResumePersistenceStatus {
  ownerId: string | null
  phase: 'idle' | 'restoring' | 'restored' | 'saving' | 'saved' | 'error'
  operation: 'restore' | 'save' | null
}

export const initialResumePersistenceStatus: ResumePersistenceStatus = { ownerId: null, phase: 'idle', operation: null }

export function createConfirmedResumePersistence(
  commitLocal: (profile: ResumeProfile) => Promise<void>,
  resetLocal: () => void,
  publish: (status: ResumePersistenceStatus) => void,
  repository: Pick<typeof resumeRepository, 'getCurrent' | 'upsert'> = resumeRepository,
) {
  let ownerId: string | null = null
  let epoch = 0
  let revision = 0
  let latestConfirmed: ResumeProfile | null = null
  let queue = Promise.resolve()
  let status = initialResumePersistenceStatus
  const update = (phase: ResumePersistenceStatus['phase'], operation: ResumePersistenceStatus['operation']) => {
    status = { ownerId, phase, operation }
    publish(status)
  }

  const save = (profile: ResumeProfile): Promise<void> => {
    const owner = ownerId, generation = epoch, version = revision
    if (!owner) { update('error', 'save'); return Promise.resolve() }
    update('saving', 'save')
    // Serialize confirmed snapshots so an older slow write cannot win remotely.
    queue = queue.then(async () => {
      if (generation !== epoch || owner !== ownerId) return
      try {
        await repository.upsert(owner, profile)
        if (generation === epoch && version === revision) update('saved', 'save')
      } catch {
        if (generation === epoch && version === revision) update('error', 'save')
      }
    })
    return queue
  }

  const start = async (nextOwner: string | null): Promise<void> => {
    const generation = ++epoch
    if (ownerId !== nextOwner && ownerId !== null) {
      resetLocal()
      latestConfirmed = null
      revision++
    }
    const confirmedWithoutOwner = ownerId === null && nextOwner !== null && latestConfirmed !== null
    ownerId = nextOwner
    if (!ownerId) { update('idle', null); return }
    if (latestConfirmed) {
      if (confirmedWithoutOwner) await save(structuredClone(latestConfirmed))
      else update(status.phase === 'saving' ? 'error' : status.phase, status.operation)
      return
    }
    const version = revision
    update('restoring', 'restore')
    try {
      const saved = await repository.getCurrent()
      // A newer confirmation/reset/session takes precedence over this read.
      if (generation !== epoch || version !== revision) return
      if (saved) {
        await commitLocal(structuredClone(saved))
        if (generation === epoch && version === revision) {
          latestConfirmed = structuredClone(saved)
          update('restored', 'restore')
        }
      } else update('idle', null)
    } catch {
      if (generation === epoch && version === revision) update('error', 'restore')
    }
  }

  return {
    start,
    async confirm(profile: ResumeProfile): Promise<void> {
      const snapshot = structuredClone({ ...profile, name: profile.name.trim() })
      const generation = epoch, version = ++revision
      await commitLocal(structuredClone(snapshot))
      if (generation !== epoch || version !== revision) return
      latestConfirmed = snapshot
      await save(snapshot)
    },
    retry(): Promise<void> {
      return latestConfirmed ? save(structuredClone(latestConfirmed)) : start(ownerId)
    },
    discard(): void {
      epoch++
      revision++
      latestConfirmed = null
      resetLocal()
      update('idle', null)
    },
    suspend(): void { epoch++ },
  }
}
