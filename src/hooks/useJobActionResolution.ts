import { useEffect, useState } from 'react'
import { matchingService, sortMatchedJobs } from '../services/matchingService'
import type { Real104SessionView } from '../services/real104Session'
import type { Job, JobWithMatch, ResumeProfile, StatusMap } from '../types'

// Reuse current session matches; only missing interacted jobs need snapshot matching.
export function useJobActionResolution(ownerId: string | null, enabled: boolean, resume: ResumeProfile | null,
  statuses: StatusMap, savedJobs: Record<string, Job>, session: Real104SessionView & { currentJobs: Job[]; retryMatching: () => void }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ input: string; resume: ResumeProfile | null; matches: JobWithMatch[]; pending: boolean; error: string | null }>({ input: '', resume: null, matches: [], pending: false, error: null })
  const currentIds = new Set(session.status === 'ready' ? session.currentJobs.map(job => job.id) : [])
  const missing = enabled ? Object.keys(statuses).sort().filter(key => statuses[key].length && !currentIds.has(key) && savedJobs[key]).map(key => savedJobs[key]) : []
  // Content signature keeps status-only updates from restarting matching; owner and
  // profile remain generation boundaries, including late failures/completions.
  const input = JSON.stringify({ ownerId, enabled, jobs: missing })
  useEffect(() => {
    let active = true
    const jobs: Job[] = JSON.parse(input).jobs
    if (!resume || !jobs.length) return
    setResult({ input, resume, matches: [], pending: true, error: null })
    matchingService.matchJobs(resume, jobs)
      .then(matches => { if (active) setResult({ input, resume, matches, pending: false, error: null }) })
      .catch(() => { if (active) setResult({ input, resume, matches: [], pending: false, error: '目前無法完成職缺匹配，請稍後再試。' }) })
    return () => { active = false }
  }, [input, resume, attempt])
  const current = result.input === input && result.resume === resume
  const snapshotPending = !!resume && missing.length > 0 && (!current || result.pending)
  const error = enabled ? session.error || (missing.length && current ? result.error : null) : null
  const matching = enabled && (session.matching || snapshotPending)
  const byKey = new Map<string, JobWithMatch>()
  if (enabled && resume) {
    if (missing.length && current) for (const item of result.matches) byKey.set(item.job.id, item)
    for (const item of session.matches) byKey.set(item.job.id, item)
  }
  const matches = sortMatchedJobs([...byKey.values()].filter(item => statuses[item.job.id]?.length))
  return { matches, matching, error,
    retryMatching: () => { session.retryMatching(); setAttempt(value => value + 1) } }
}
