import { preferenceService } from './preferenceService'
import type { SearchPreference } from '../types'

export interface JobPreferencePersistenceStatus {
  ownerId: string | null
  phase: 'idle' | 'restoring' | 'restored' | 'saving' | 'saved' | 'error'
  operation: 'restore' | 'save' | null
  ready: boolean
}

export const initialJobPreferencePersistenceStatus: JobPreferencePersistenceStatus = {
  ownerId: null, phase: 'idle', operation: null, ready: false,
}

export function createJobPreferencePersistence(
  commitLocal: (preference: SearchPreference) => Promise<void>,
  defaults: SearchPreference,
  publish: (status: JobPreferencePersistenceStatus) => void,
  service: Pick<typeof preferenceService, 'load' | 'save'> = preferenceService,
) {
  let ownerId: string | null = null
  let epoch = 0
  let revision = 0
  let latestEdit: SearchPreference | null = null
  let queue = Promise.resolve()
  let status = initialJobPreferencePersistenceStatus
  const update = (phase: JobPreferencePersistenceStatus['phase'], operation: JobPreferencePersistenceStatus['operation'], ready = true) => {
    status = { ownerId, phase, operation, ready }
    publish(status)
  }
  const persist = (preference: SearchPreference): Promise<void> => {
    const owner = ownerId, generation = epoch, version = revision
    if (!owner) { update('error', 'save'); return Promise.resolve() }
    update('saving', 'save')
    // Keep user edits ordered remotely; failures never roll back local filters.
    queue = queue.then(async () => {
      if (generation !== epoch || owner !== ownerId) return
      try {
        await service.save(owner, preference)
        if (generation === epoch && version === revision) update('saved', 'save')
      } catch {
        if (generation === epoch && version === revision) update('error', 'save')
      }
    })
    return queue
  }
  const start = async (nextOwner: string | null): Promise<void> => {
    const generation = ++epoch
    const changedOwner = ownerId !== nextOwner
    if (changedOwner && ownerId !== null) {
      latestEdit = null
      revision++
      await commitLocal({ ...defaults })
      if (generation !== epoch) return
    }
    const editedWithoutOwner = ownerId === null && nextOwner !== null && latestEdit !== null
    ownerId = nextOwner
    if (!ownerId) { update('idle', null); return }
    if (latestEdit) {
      if (editedWithoutOwner) await persist({ ...latestEdit })
      else update(status.phase === 'saving' ? 'error' : status.phase, status.operation)
      return
    }
    const version = revision
    update('restoring', 'restore', !changedOwner && status.ready)
    try {
      const saved = await service.load()
      // Remote reads cannot replace a newer local edit or another owner's state.
      if (generation !== epoch || version !== revision) return
      if (saved) {
        await commitLocal({ ...saved })
        if (generation === epoch && version === revision) update('restored', 'restore')
      } else update('idle', null)
    } catch {
      if (generation === epoch && version === revision) update('error', 'restore')
    }
  }
  return {
    start,
    async save(preference: SearchPreference): Promise<void> {
      const snapshot = { ...preference }
      const generation = epoch, version = ++revision
      await commitLocal({ ...snapshot })
      if (generation !== epoch || version !== revision) return
      latestEdit = snapshot
      await persist(snapshot)
    },
    retry(): Promise<void> { return latestEdit ? persist({ ...latestEdit }) : start(ownerId) },
    discard(): void {
      epoch++
      revision++
      latestEdit = null
      update('idle', null)
    },
    suspend(): void { epoch++ },
  }
}
