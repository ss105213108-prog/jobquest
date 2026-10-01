import { useEffect, useState } from 'react'
import { createJobActionPersistence, initialJobActionPersistenceState } from '../services/jobActionPersistence'
import type { useAuth } from './useAuth'

export function useJobActions(auth: ReturnType<typeof useAuth>) {
  const [state, setState] = useState(initialJobActionPersistenceState)
  const [controller] = useState(() => createJobActionPersistence(setState))
  const ownerId = auth.error ? null : auth.user?.id ?? null
  useEffect(() => {
    if (!auth.initializing) void controller.start(ownerId)
    return () => controller.suspend()
  }, [controller, auth.initializing, ownerId])
  const initializing = auth.initializing || ownerId !== state.ownerId || !state.ready
  const statuses = auth.initializing || ownerId !== state.ownerId ? {} : state.statuses
  const jobs = auth.initializing || ownerId !== state.ownerId ? {} : state.jobs
  return { state, statuses, jobs, initializing, retry: controller.retry, discard: controller.discard,
    actions: { toggleFavorite: controller.toggleFavorite, markViewed: controller.markViewed,
      markApplied: controller.markApplied, markRejected: controller.markRejected },
  }
}
