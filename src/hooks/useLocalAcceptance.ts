import { useCallback, useReducer } from 'react'
import type { JobStatus, ResumeProfile, SearchPreference, StatusMap } from '../types'

export interface LocalAcceptanceState {
  resume: ResumeProfile | null
  preference: SearchPreference
  statuses: StatusMap
}
export const initialLocalAcceptanceState: LocalAcceptanceState = {
  resume: null, preference: { source: '104', keyword: '', location: '全部地區', sortBy: 'match-desc' }, statuses: {},
}
type Action = { type: 'confirm'; resume: ResumeProfile }
  | { type: 'preference'; preference: SearchPreference }
  | { type: 'status'; jobId: string; status: JobStatus } | { type: 'reset' }

export function localAcceptanceReducer(state: LocalAcceptanceState, action: Action): LocalAcceptanceState {
  if (action.type === 'reset') return structuredClone(initialLocalAcceptanceState)
  if (action.type === 'confirm') {
    if (!action.resume.name.trim()) throw new Error('請填寫冒險者名稱後確認履歷。')
    return { ...state, resume: structuredClone({ ...action.resume, name: action.resume.name.trim() }) }
  }
  if (action.type === 'preference') return { ...state, preference: { ...action.preference } }
  const current = state.statuses[action.jobId] ?? []
  const next = action.status === 'favorite' && current.includes('favorite') ? current.filter(status => status !== 'favorite')
    : [...new Set([...current.filter(status => action.status !== 'applied' || status !== 'rejected')
      .filter(status => action.status !== 'rejected' || status !== 'applied'), action.status])]
  return { ...state, statuses: { ...state.statuses, [action.jobId]: next } }
}

export function useLocalAcceptance() {
  const [state, dispatch] = useReducer(localAcceptanceReducer, initialLocalAcceptanceState)
  const confirmResume = useCallback(async (resume: ResumeProfile) => { dispatch({ type: 'confirm', resume }) }, [])
  const savePreference = useCallback(async (preference: SearchPreference) => { dispatch({ type: 'preference', preference }) }, [])
  const status = (jobId: string, value: JobStatus) => dispatch({ type: 'status', jobId, status: value })
  return { ...state, confirmResume, savePreference, reset: () => dispatch({ type: 'reset' }), actions: {
    toggleFavorite: (id: string) => status(id, 'favorite'), markViewed: (id: string) => status(id, 'viewed'),
    markApplied: (id: string) => status(id, 'applied'), markRejected: (id: string) => status(id, 'rejected'),
  } }
}
