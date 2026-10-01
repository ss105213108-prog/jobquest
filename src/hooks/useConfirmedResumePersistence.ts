import { useEffect, useRef, useState } from 'react'
import { createConfirmedResumePersistence, initialResumePersistenceStatus } from '../services/confirmedResumePersistence'
import type { useAuth } from './useAuth'
import type { useLocalAcceptance } from './useLocalAcceptance'

export function useConfirmedResumePersistence(auth: ReturnType<typeof useAuth>, local: ReturnType<typeof useLocalAcceptance>) {
  const callbacks = useRef(local)
  callbacks.current = local
  const [status, setStatus] = useState(initialResumePersistenceStatus)
  const [controller] = useState(() => createConfirmedResumePersistence(
    profile => callbacks.current.confirmResume(profile),
    () => callbacks.current.reset(),
    setStatus,
  ))
  const ownerId = auth.error ? null : auth.user?.id ?? null
  useEffect(() => {
    if (!auth.initializing) void controller.start(ownerId)
    return () => controller.suspend()
  }, [controller, auth.initializing, ownerId])

  const initializing = auth.initializing || ownerId !== status.ownerId || status.phase === 'restoring'
  return { status, initializing, confirm: controller.confirm, retry: controller.retry, discard: controller.discard }
}
