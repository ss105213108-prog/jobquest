import { useCallback, useEffect, useState } from 'react'
import { preferenceService } from '../services/preferenceService'
import { resumeService } from '../services/resumeService'
import type { JobSource, ResumeProfile, SearchPreference } from '../types'

const defaultPreference = (source: JobSource): SearchPreference => ({ source, keyword: '', location: '全部地區', sortBy: 'match-desc' })

export function useCloudProfile(userId: string | undefined) {
  const [resume, setResume] = useState<ResumeProfile | null>(null)
  const [preference, setPreference] = useState<SearchPreference | null>(null)
  const [initializing, setInitializing] = useState(Boolean(userId))
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    if (!userId) { setResume(null); setPreference(null); setInitializing(false); return }
    setInitializing(true)
    setError(null)
    Promise.all([resumeService.loadSaved(), preferenceService.load()])
      .then(([savedResume, savedPreference]) => { if (active) { setResume(savedResume); setPreference(savedPreference) } })
      .catch(() => { if (active) setError('目前無法同步公會資料，請稍後再試。') })
      .finally(() => { if (active) setInitializing(false) })
    return () => { active = false }
  }, [attempt, userId])

  const saveOnboarding = useCallback(async (source: JobSource, nextResume: ResumeProfile) => {
    if (!userId) throw new Error('公會身份尚未建立。')
    const nextPreference = defaultPreference(source)
    await Promise.all([resumeService.save(userId, nextResume), preferenceService.save(userId, nextPreference)])
    setResume(nextResume)
    setPreference(nextPreference)
  }, [userId])

  const savePreference = useCallback(async (nextPreference: SearchPreference) => {
    if (!userId) throw new Error('公會身份尚未建立。')
    await preferenceService.save(userId, nextPreference)
    setPreference(nextPreference)
  }, [userId])

  const saveResume = useCallback(async (nextResume: ResumeProfile) => {
    if (!userId) throw new Error('公會身份尚未建立。')
    await resumeService.save(userId, nextResume)
    setResume(nextResume)
  }, [userId])

  const changeSource = useCallback((source: JobSource) => savePreference(defaultPreference(source)), [savePreference])

  return { resume, preference, initializing, error, retry: () => setAttempt((value) => value + 1), saveOnboarding, saveResume, savePreference, changeSource }
}
