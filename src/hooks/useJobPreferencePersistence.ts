import { useEffect, useRef, useState } from 'react'
import { createJobPreferencePersistence, initialJobPreferencePersistenceStatus } from '../services/jobPreferencePersistence'
import type { useLocalAcceptance } from './useLocalAcceptance'
import type { useAuth } from './useAuth'

export function useJobPreferencePersistence(auth: ReturnType<typeof useAuth>, local: ReturnType<typeof useLocalAcceptance>) {
  const callbacks = useRef(local)
  callbacks.current = local
  const [status, setStatus] = useState(initialJobPreferencePersistenceStatus)
  const [controller] = useState(() => createJobPreferencePersistence(
    preference => callbacks.current.savePreference(preference),
    { ...local.preference },
    setStatus,
  ))
  const ownerId = auth.error ? null : auth.user?.id ?? null
  useEffect(() => {
    if (!auth.initializing) void controller.start(ownerId)
    return () => controller.suspend()
  }, [controller, auth.initializing, ownerId])
  const initializing = auth.initializing || ownerId !== status.ownerId || !status.ready
  return { status, initializing, save: controller.save, retry: controller.retry, discard: controller.discard }
}
