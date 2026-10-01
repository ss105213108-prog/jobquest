import { useEffect, useState } from 'react'
import { JobList } from '../components/jobs/JobList'
import { ErrorState, LoadingState } from '../components/ui/AsyncState'
import { jobService } from '../services/jobService'
import { searchLocalJobs } from '../services/localJobService'
import { matchingService } from '../services/matchingService'
import { clearMockFailure } from '../services/serviceSupport'
import { real104SessionMessage, type Real104SessionView } from '../services/real104Session'
import type { JobActionHandlers, JobSource, JobStatus, JobWithMatch, ResumeProfile } from '../types'

interface CollectionPageProps {
  localDemo?: boolean
  mode: 'favorites' | 'history'
  source: JobSource
  resume: ResumeProfile
  statuses: Record<string, JobStatus[]>
  actions: JobActionHandlers
  realSession?: Real104SessionView & { retryMatching?: () => void }
}

export function CollectionPage({ localDemo = false, mode, source, resume, statuses, actions, realSession }: CollectionPageProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sourceJobs, setSourceJobs] = useState<JobWithMatch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let active = true
    if (source === '104' && !localDemo) {
      setSourceJobs([])
      setError(null)
      setIsLoading(false)
      return () => { active = false }
    }
    setIsLoading(true)
    setError(null)
    const search = localDemo ? searchLocalJobs({ source, keyword: '', location: '全部地區', sortBy: 'match-desc' }) : jobService.searchJobs({ source, keyword: '', location: '全部地區' })
    search
      .then((jobs) => matchingService.matchJobs(resume, jobs))
      .then((matched) => { if (active) setSourceJobs(matched) })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : '目前無法取得職缺資料，請稍後再試。') })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [localDemo, resume, retryKey, source])

  const useReal = source === '104' && !localDemo
  const displaySourceJobs = useReal ? realSession?.matches ?? [] : sourceJobs
  const displayLoading = useReal ? realSession?.matching ?? false : isLoading
  const displayError = useReal ? realSession?.error ?? null : error
  const sessionMessage = useReal && realSession && real104SessionMessage(realSession.status)
  const jobs = displaySourceJobs.filter((item) => {
    const list = statuses[item.job.id] ?? []
    return mode === 'favorites' ? list.includes('favorite') : list.some((status) => status !== 'favorite')
  })

  return (
    <div className="simple-page">
      <span className="eyebrow">{mode === 'favorites' ? 'SAVED QUESTS' : 'QUEST LOG'}</span>
      <h1>{mode === 'favorites' ? '收藏任務' : '任務紀錄'}</h1>
      <p>{useReal ? '顯示有效工作清單或已保存的 104 職缺快照；操作狀態依 sourceKey 還原。' : mode === 'favorites' ? `只顯示已收藏的 ${source} 模擬職缺。` : '整理已查看、已投遞與標記不適合的職缺。'}</p>
      {sessionMessage && <p role="status">{sessionMessage}</p>}
      {mode === 'history' && <div className="history-legend"><span>◉ 已查看</span><span>✓ 已投遞</span><span>× 不適合</span></div>}
      {displayLoading && <LoadingState message="正在整理任務紀錄……" />}
      {displayError && <ErrorState message={displayError} onRetry={() => { if (useReal) realSession?.retryMatching?.(); else { clearMockFailure(); setRetryKey((value) => value + 1) } }} />}
      {!displayLoading && !displayError && <JobList jobs={jobs} expandedId={expandedId} statuses={statuses} actions={actions} onExpand={setExpandedId} emptyMessage={sessionMessage || (useReal && !realSession?.matches.length ? '請回到佈告欄匯入有效的 REAL 104 工作清單；已保存的操作狀態仍會保留。' : mode === 'favorites' ? '前往職缺任務佈告欄，收藏想追蹤的職缺。' : '查看或標記職缺後，紀錄會出現在這裡。')} />}
    </div>
  )
}
