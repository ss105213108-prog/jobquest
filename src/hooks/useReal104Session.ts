import { useCallback, useEffect, useRef, useState } from 'react'
import { JOB104_PAYLOAD_TTL_MS } from '../integrations/job104/types'
import { matchingService } from '../services/matchingService'
import { createReal104Session, readReal104Session, writeReal104Session, type JobDataMode, type Real104SessionView, type Real104Snapshot } from '../services/real104Session'
import type { JobWithMatch, ResumeProfile, SearchPreference } from '../types'

export function useReal104Session(resume: ResumeProfile | null) {
  const [session, setSession] = useState(readReal104Session)
  const [storageFailed, setStorageFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ snapshot: Real104Snapshot | null; resume: ResumeProfile | null; matches: JobWithMatch[]; error: string | null; pending: boolean }>({ snapshot: null, resume: null, matches: [], error: null, pending: false })
  const known = useRef<{ snapshot: Real104Snapshot | null; resume: ResumeProfile | null }>({ snapshot: null, resume: null })
  const currentSession = useRef(session)
  const currentResume = useRef(resume)
  currentSession.current = session
  currentResume.current = resume
  const commit = (next: typeof session) => {
    currentSession.current = next
    setStorageFailed(!writeReal104Session(next)); setSession(next)
  }

  const selectMode = useCallback((mode: JobDataMode) => {
    commit({ ...currentSession.current, mode })
  }, [])
  const clear = useCallback(() => {
    const next = { mode: 'DEMO_LOCAL' as const, status: 'missing' as const, snapshot: null }
    commit(next)
  }, [])
  const clearSearch = useCallback(() => {
    const next = { mode: 'REAL_104' as const, status: 'missing' as const, snapshot: null }
    commit(next)
  }, [])
  const acceptImport = useCallback((matches: JobWithMatch[], preference: SearchPreference, capturedAt: string) => {
    if (resume !== currentResume.current || currentSession.current.mode === 'DEMO_LOCAL') return
    const next = createReal104Session(matches.map(item => item.job), preference.keyword, preference.location, capturedAt)
    commit(next)
    known.current = { snapshot: next.snapshot, resume }
    setResult({ snapshot: next.snapshot, resume, matches: next.status === 'ready' ? matches : [], pending: false, error: null })
  }, [resume])

  useEffect(() => {
    const snapshot = session.snapshot
    if (!snapshot || session.status !== 'ready') return
    const expire = () => {
      if (Date.now() - Date.parse(snapshot.capturedAt) <= JOB104_PAYLOAD_TTL_MS) return
      const current = currentSession.current
      if (current.snapshot === snapshot) commit({ ...current, snapshot: null, status: 'expired' })
    }
    const timer = setTimeout(expire, Math.max(0, Date.parse(snapshot.capturedAt) + JOB104_PAYLOAD_TTL_MS - Date.now() + 1))
    window.addEventListener?.('focus', expire)
    return () => { clearTimeout(timer); window.removeEventListener?.('focus', expire) }
  }, [session.snapshot, session.status])

  useEffect(() => {
    let active = true
    const snapshot = session.snapshot
    if (!resume || !snapshot || session.status !== 'ready' || session.mode === 'DEMO_LOCAL') return
    if (known.current.snapshot === snapshot && known.current.resume === resume && result.error === null) return
    setResult({ snapshot, resume, matches: [], error: null, pending: true })
    matchingService.matchJobs(resume, snapshot.jobs)
      .then(matches => { if (active) { known.current = { snapshot, resume }; setResult({ snapshot, resume, matches, error: null, pending: false }) } })
      .catch(() => { if (active) setResult({ snapshot, resume, matches: [], error: '目前無法完成職缺匹配，請稍後再試。', pending: false }) })
    return () => { active = false }
  }, [resume, session.snapshot, session.status, session.mode, attempt])

  const current = result.snapshot === session.snapshot && result.resume === resume
  const valid = session.status === 'ready' && session.mode !== 'DEMO_LOCAL'
  const view: Real104SessionView = { status: session.status, matches: valid && current ? result.matches : [],
    matching: valid && !!resume && (!current || result.pending), error: current ? result.error : null }
  return { ...view, mode: session.mode, snapshot: session.snapshot, storageFailed, selectMode, clear, clearSearch, acceptImport,
    retryMatching: () => setAttempt(value => value + 1) }
}
