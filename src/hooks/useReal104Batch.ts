import { useEffect, useRef, useState } from 'react'
import { JOB104_PAYLOAD_TTL_MS } from '../integrations/job104/types'
import { matchReal104BatchJobs } from '../services/real104BatchMatcher'
import { createReal104BatchSessionStorage } from '../services/real104BatchSessionStorage'
import { createReal104BatchWorkingSet, REAL104_BATCH_KEY, type Real104BatchIntent, type Real104BatchView } from '../services/real104BatchWorkingSet'
import type { JobWithMatch, ResumeProfile } from '../types'

interface BatchScreenState {
  view: Real104BatchView
  matches: JobWithMatch[]
  matchedResume: ResumeProfile | null
  matching: boolean
  error: string | null
}

const missing: Real104BatchView = {
  status: 'missing', searchFingerprint: null, batchNumber: null,
  currentBatchJobs: [], pendingJobs: [], seenSourceKeys: [], firstCapturedAt: null,
}

function message(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === 'STORAGE_READ_FAILED' || code === 'STORAGE_WRITE_FAILED') return '目前無法保存或讀取批次工作清單；原有資料仍保留，請稍後重試。'
  if (code === 'MATCHING_FAILED' || code === 'CONFIRMED_RESUME_UNAVAILABLE') return '目前無法完成職缺匹配；已收集職缺仍保留，可重試配對。'
  if (code === 'CONFIRMED_RESUME_REQUIRED') return '請先確認履歷，再使用目前職缺進行配對。'
  if (code === 'CAPTURE_SEARCH_MISMATCH') return '最近一次擷取與目前關鍵字或地區不一致，請重新擷取。'
  if (code.startsWith('CAPTURE_')) return '104 職缺資料無效或已過期，請重新擷取。'
  return '目前無法更新批次工作清單；原有資料仍保留，請重試。'
}

export function useReal104Batch(uid: string | null, confirmedResume: ResumeProfile | null) {
  const uidRef = useRef(uid)
  const resumeRef = useRef(confirmedResume)
  uidRef.current = uid
  resumeRef.current = confirmedResume
  const [coordinator] = useState(() => createReal104BatchWorkingSet({
    storage: createReal104BatchSessionStorage(() => sessionStorage),
    matchJobs: matchReal104BatchJobs,
    getConfirmedResume: () => resumeRef.current,
  }))
  const [state, setState] = useState<BatchScreenState>(() => {
    if (!uid) return { view: missing, matches: [], matchedResume: null, matching: false, error: null }
    try { return { view: coordinator.restore(uid, Date.now()), matches: [], matchedResume: null, matching: false, error: null } }
    catch (error) { return { view: { ...missing, status: 'corrupt' }, matches: [], matchedResume: null, matching: false, error: message(error) } }
  })
  const current = useRef(state)
  current.current = state
  const epoch = useRef(0)
  const nextOperation = useRef<number | null>(null)
  const owner = useRef(uid)
  const [retry, setRetry] = useState(0)
  const publish = (next: BatchScreenState) => { current.current = next; setState(next) }
  const emptyResult = (view: Real104BatchView, error: string | null = null): BatchScreenState =>
    ({ view, matches: [], matchedResume: null, matching: false, error })

  const refresh = () => {
    const user = uidRef.current
    if (!user) { publish(emptyResult(missing)); return }
    try {
      const view = coordinator.restore(user, Date.now())
      const previous = current.current
      const same = view.status === 'presented' && previous.view.status === 'presented'
        && view.searchFingerprint === previous.view.searchFingerprint && view.batchNumber === previous.view.batchNumber
        && view.currentBatchJobs.map(job => job.id).join('|') === previous.view.currentBatchJobs.map(job => job.id).join('|')
      publish(same ? { ...previous, view } : emptyResult(view))
    } catch (error) { publish({ ...current.current, error: message(error), matching: false }) }
  }

  useEffect(() => {
    if (owner.current === uid) return
    owner.current = uid
    epoch.current++
    if (!uid) { publish(emptyResult(missing)); return }
    try { publish(emptyResult(coordinator.restore(uid, Date.now()))) }
    catch (error) { publish(emptyResult({ ...missing, status: 'corrupt' }, message(error))) }
  }, [uid])

  useEffect(() => {
    const view = state.view
    if (!uid || view.status !== 'presented' || !confirmedResume) return
    if (state.matchedResume === confirmedResume && state.matches.length === view.currentBatchJobs.length && !state.error) return
    let active = true
    const ticket = epoch.current
    publish({ ...current.current, matches: [], matchedResume: null, matching: true, error: null })
    matchReal104BatchJobs(confirmedResume, view.currentBatchJobs)
      .then(matches => {
        if (!active || ticket !== epoch.current || uidRef.current !== uid || resumeRef.current !== confirmedResume) return
        const latest = coordinator.restore(uid, Date.now())
        if (latest.status === 'presented' && latest.searchFingerprint === view.searchFingerprint && latest.batchNumber === view.batchNumber)
          publish({ view: latest, matches, matchedResume: confirmedResume, matching: false, error: null })
        else publish(emptyResult(latest))
      })
      .catch(() => { if (active && ticket === epoch.current) publish({ ...current.current, matches: [], matchedResume: confirmedResume, matching: false, error: '目前無法完成職缺匹配，請稍後再試。' }) })
    return () => { active = false }
  }, [uid, confirmedResume, state.view.status, state.view.searchFingerprint, state.view.batchNumber, retry])

  useEffect(() => {
    const anchor = state.view.firstCapturedAt
    if (!anchor || (state.view.status !== 'collecting' && state.view.status !== 'presented')) return
    const expire = () => { if (Date.now() - Date.parse(anchor) > JOB104_PAYLOAD_TTL_MS) refresh() }
    const timer = setTimeout(expire, Math.max(0, Date.parse(anchor) + JOB104_PAYLOAD_TTL_MS - Date.now() + 1))
    window.addEventListener?.('focus', expire)
    return () => { clearTimeout(timer); window.removeEventListener?.('focus', expire) }
  }, [state.view.firstCapturedAt, state.view.status])

  const startSearch = (intent: Real104BatchIntent) => {
    const user = uidRef.current
    if (!user) throw new Error('登入狀態尚未就緒。')
    try {
      const view = coordinator.startOrResumeSearch(intent, user, Date.now())
      const previous = current.current
      const same = previous.view.status === view.status && previous.view.searchFingerprint === view.searchFingerprint
        && previous.view.batchNumber === view.batchNumber
      if (!same) epoch.current++
      publish(same ? { ...previous, view, error: null } : emptyResult(view))
      return view
    } catch (error) { publish({ ...current.current, error: message(error) }); throw error }
  }

  const addCapture = async (payload: unknown) => {
    const user = uidRef.current
    if (!user) throw new Error('登入狀態尚未就緒。')
    const ticket = epoch.current
    const resume = resumeRef.current
    try {
      const view = await coordinator.addCapture(payload, user, Date.now())
      if (ticket === epoch.current && uidRef.current === user)
        publish(view.status === 'presented' && resumeRef.current === resume
          ? { view, matches: view.matches ?? [], matchedResume: resume, matching: false, error: null } : emptyResult(view))
      return view
    } catch (error) {
      if (ticket === epoch.current && uidRef.current === user) {
        refresh()
        publish({ ...current.current, error: message(error), matching: false })
      }
      throw error
    }
  }

  const commitPartial = async () => {
    const user = uidRef.current, resume = resumeRef.current
    if (!user || !resume) throw new Error('請先確認履歷。')
    const ticket = epoch.current
    try {
      const view = await coordinator.presentCurrentBatch(resume, user, Date.now())
      if (ticket === epoch.current && uidRef.current === user && resumeRef.current === resume)
        publish({ view, matches: view.matches ?? [], matchedResume: resume, matching: false, error: null })
      return view
    } catch (error) {
      if (ticket === epoch.current && uidRef.current === user) {
        refresh()
        publish({ ...current.current, error: message(error), matching: false })
      }
      throw error
    }
  }

  const nextBatch = async () => {
    const user = uidRef.current
    if (!user) throw new Error('登入狀態尚未就緒。')
    if (nextOperation.current === epoch.current || current.current.view.status !== 'presented' || current.current.matching) return null
    const ticket = ++epoch.current
    nextOperation.current = ticket
    const resume = resumeRef.current
    publish({ ...current.current, matching: true, error: null })
    try {
      const view = await coordinator.startNextBatch(user, Date.now())
      if (ticket === epoch.current && uidRef.current === user)
        publish(view.status === 'presented' && resumeRef.current === resume
          ? { view, matches: view.matches ?? [], matchedResume: resume, matching: false, error: null } : emptyResult(view))
      return view
    } catch (error) {
      if (ticket === epoch.current && uidRef.current === user) {
        refresh()
        publish({ ...current.current, error: message(error), matching: false })
      }
      throw error
    } finally {
      if (nextOperation.current === ticket) nextOperation.current = null
    }
  }

  const clear = () => {
    try {
      createReal104BatchSessionStorage(() => sessionStorage).removeItem(REAL104_BATCH_KEY)
      epoch.current++
      publish(emptyResult(missing))
    } catch (error) { publish({ ...current.current, error: message(error) }); throw error }
  }

  const resumeMatches = state.view.status === 'presented' && state.matchedResume === confirmedResume
  return { ...state, matches: resumeMatches ? state.matches : [],
    matching: state.matching || (state.view.status === 'presented' && !!confirmedResume && !resumeMatches),
    startSearch, addCapture, commitPartial, nextBatch, clear, retryMatching: () => setRetry(value => value + 1) }
}
