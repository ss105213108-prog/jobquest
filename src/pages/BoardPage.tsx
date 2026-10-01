import { useCallback, useEffect, useRef, useState } from 'react'
import { JobList } from '../components/jobs/JobList'
import { JobSummary } from '../components/jobs/JobSummary'
import { Job104ConnectorControls } from '../components/search/Job104ConnectorControls'
import { Real104BatchProgress } from '../components/search/Real104BatchProgress'
import { SearchPanel } from '../components/search/SearchPanel'
import { ErrorState, LoadingState } from '../components/ui/AsyncState'
import { build104SearchUrl } from '../integrations/job104/build104SearchUrl'
import { payloadMatches104Search } from '../integrations/job104/build104SearchUrl'
import { job104Connector } from '../integrations/job104/connectorClient'
import { connectorStateFromResponse } from '../integrations/job104/connectorUi'
import { get104PayloadState } from '../integrations/job104/schema'
import { matchCaptured104Jobs } from '../services/connectorJobService'
import { jobService } from '../services/jobService'
import { searchLocalJobs } from '../services/localJobService'
import { matchingService } from '../services/matchingService'
import { clearMockFailure } from '../services/serviceSupport'
import { real104SessionMessage, type Real104SessionView } from '../services/real104Session'
import type { Job104ConnectorState } from '../integrations/job104/types'
import type { Job104Payload } from '../integrations/job104/types'
import { JOB104_MAX_JOBS } from '../integrations/job104/types'
import type { Real104BatchIntent } from '../services/real104BatchWorkingSet'
import { Real104BatchError } from '../services/real104BatchWorkingSet'
import type { useReal104Batch } from '../hooks/useReal104Batch'
import type { JobActionHandlers, JobSource, JobStatus, JobWithMatch, ResumeProfile, SearchPreference } from '../types'

interface BoardPageProps {
  localDemo?: boolean
  source: JobSource
  resume: ResumeProfile
  initialPreference: SearchPreference
  onPreferenceChange: (preference: SearchPreference) => Promise<void>
  statuses: Record<string, JobStatus[]>
  actions: JobActionHandlers
  realSession?: Real104SessionView & { retryMatching?: () => void }
  onRealImport?: (matches: JobWithMatch[], preference: SearchPreference, capturedAt: string) => void
  onRealSearch?: () => void
  batch?: ReturnType<typeof useReal104Batch>
  onBatchSearch?: (intent: Real104BatchIntent) => void
  onBatchCapture?: (payload: Job104Payload, preference: SearchPreference) => Promise<void>
}

const isNewJob = (item: JobWithMatch) => item.job.externalId.startsWith('mock-') && new Date(item.job.collectedAt).getTime() - new Date(item.job.publishedAt).getTime() <= 48 * 60 * 60 * 1000
const legacyFullPageMessage = '請先開始新批次搜尋，再匯入完整頁面職缺。'

export function BoardPage({ localDemo = false, source, resume, initialPreference, onPreferenceChange, statuses, actions, realSession, onRealImport, onRealSearch, batch, onBatchSearch, onBatchCapture }: BoardPageProps) {
  const useConnector = source === '104' && !localDemo
  const batchFlow = useConnector && !!onBatchCapture && !!batch && (batch.view.status !== 'missing' || realSession?.status !== 'ready')
  const [preference, setPreference] = useState<SearchPreference>(initialPreference)
  const [jobs, setJobs] = useState<JobWithMatch[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loadingStage, setLoadingStage] = useState<'searching' | 'matching' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connectorState, setConnectorState] = useState<Job104ConnectorState>('checking')
  const [capturedCount, setCapturedCount] = useState(0)
  const [capturedAt, setCapturedAt] = useState<string | null>(null)
  const importEpoch = useRef(0)
  useEffect(() => () => { importEpoch.current++ }, [preference.keyword, preference.location, resume, useConnector])

  const runSearch = useCallback(async (next: SearchPreference, persist = true) => {
    setPreference(next)
    setExpandedId(null)
    setError(null)
    setJobs([])
    try {
      setLoadingStage('searching')
      const foundJobs = await (localDemo ? searchLocalJobs(next) : jobService.searchJobs(next))
      setLoadingStage('matching')
      setJobs(await matchingService.matchJobs(resume, foundJobs))
      if (persist) await onPreferenceChange(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '目前無法取得職缺資料，請稍後再試。')
    } finally {
      setLoadingStage(null)
    }
  }, [localDemo, onPreferenceChange, resume])

  const refreshConnectorStatus = useCallback(async () => {
    if (source !== '104') return
    setConnectorState('checking')
    const response = await job104Connector.status()
    setConnectorState(connectorStateFromResponse(response))
    setCapturedCount(response.payload?.jobs.length ?? 0)
    setCapturedAt(response.payload?.capturedAt ?? null)
  }, [source])

  useEffect(() => {
    if (useConnector) {
      setPreference(initialPreference)
      setJobs([])
      setError(null)
      setLoadingStage(null)
      void refreshConnectorStatus()
      return
    }
    void runSearch(initialPreference, false)
  }, [initialPreference, refreshConnectorStatus, runSearch, source, useConnector])

  const open104Search = (keyword: string, location: string) => {
    importEpoch.current++
    const next = { source, keyword: keyword.trim(), location, sortBy: 'match-desc' as const }
    setError(null)
    try {
      const url = build104SearchUrl(next.keyword, next.location)
      if (onBatchSearch) onBatchSearch({ source: 'REAL_104', keyword: next.keyword, region: next.location })
      else onRealSearch?.()
      setPreference(next)
      setJobs([])
      setExpandedId(null)
      window.open(url, '_blank', 'noopener,noreferrer')
      void onPreferenceChange(next).catch(() => setError('搜尋偏好暫時無法同步，但仍可繼續使用 Connector。'))
    } catch (caught) {
      setError(caught instanceof Real104BatchError ? '目前無法建立批次搜尋；原有工作清單仍保留，請重試。'
        : caught instanceof Error ? caught.message : '目前無法建立 104 搜尋連結。')
    }
  }

  const import104Jobs = useCallback(async () => {
    const generation = ++importEpoch.current
    setExpandedId(null)
    if (!batchFlow) setJobs([])
    setError(null)
    setLoadingStage('searching')
    try {
      const response = await job104Connector.getLatest()
      if (generation !== importEpoch.current) return
      setConnectorState(connectorStateFromResponse(response))
      setCapturedCount(response.payload?.jobs.length ?? 0)
      setCapturedAt(response.payload?.capturedAt ?? null)

      if (batchFlow) {
        if (response.status !== 'ready' || !response.payload) throw new Error('尚無有效的 104 擷取；請先在公開搜尋頁使用 Connector。')
        const checked = get104PayloadState(response.payload)
        if (checked.state !== 'ready' || !checked.payload) throw new Error('104 擷取資料無效或已過期，請重新擷取。')
        if (!payloadMatches104Search(checked.payload, preference.keyword, preference.location))
          throw new Error('最近一次擷取與目前關鍵字或地區不一致，請重新擷取。')
        await onBatchCapture!(checked.payload, preference)
      } else {
        // Legacy snapshots retain their ten-job contract. A full page must enter
        // the batch lane explicitly so it cannot be silently sliced here.
        if (batch && onBatchCapture && response.payload && response.payload.jobs.length > JOB104_MAX_JOBS)
          throw new Error(legacyFullPageMessage)
        setLoadingStage('matching')
        const matched = await matchCaptured104Jobs(response, preference, resume)
        if (generation !== importEpoch.current) return
        setJobs(matched.slice(0, 10))
        onRealImport?.(matched, preference, matched[0].job.collectedAt)
      }
    } catch (caught) {
      if (generation === importEpoch.current) setError(batchFlow && caught instanceof Real104BatchError ? null
        : caught instanceof Error ? caught.message : '目前無法匯入 104 職缺。')
    } finally {
      if (generation === importEpoch.current) setLoadingStage(null)
    }
  }, [preference, resume, onRealImport, onBatchCapture, batchFlow, batch])

  const search = (keyword: string, location: string) => useConnector
    ? open104Search(keyword, location)
    : void runSearch({ source, keyword, location, sortBy: 'match-desc' })
  const clearFilters = () => search('', '全部地區')
  const session = useConnector ? realSession : undefined
  const displayJobs = batchFlow ? batch!.view.status === 'presented' ? batch!.matches : [] : session ? session.matches : jobs
  const displayStage = loadingStage ?? ((batchFlow ? batch!.matching : session?.matching) ? 'matching' : null)
  const displayError = error ?? session?.error ?? null
  const preserveLegacyCards = !batchFlow && session?.status === 'ready' && !session.error && error === legacyFullPageMessage
  const sessionMessage = batchFlow ? batch!.view.status === 'expired' ? '104 批次工作清單已過期，請重新搜尋並擷取。'
    : batch!.view.status === 'corrupt' || batch!.view.status === 'owner-mismatch' ? '104 批次工作清單無法還原，請重新搜尋並擷取。' : null
    : session && real104SessionMessage(session.status)
  const collected = batchFlow && batch!.view.status === 'collecting' ? batch!.view.currentBatchJobs.length : 0

  return (
    <div className="board-page" data-job-source={localDemo ? 'DEMO_LOCAL' : useConnector ? 'REAL_104' : undefined}>
      {(localDemo || useConnector) && <div className="step-kicker">{localDemo ? 'MOCK / DEMO MODE · LOCAL JOB FIXTURES' : 'REAL 104 · CONNECTOR JOBS'}</div>}
      <SearchPanel localDemo={localDemo} keyword={preference.keyword} location={preference.location} disabled={displayStage !== null} onSearch={search} submitLabel={useConnector ? '前往 104 搜尋' : '搜尋任務'} />
      {useConnector && <Job104ConnectorControls state={connectorState} capturedCount={capturedCount} capturedAt={capturedAt} disabled={displayStage !== null || (batchFlow && batch!.view.status === 'presented')} importLabel={batchFlow ? '加入目前批次' : undefined} onImport={() => void import104Jobs()} onRefresh={() => void refreshConnectorStatus()} />}
      {batchFlow && <Real104BatchProgress view={batch!.view} disabled={displayStage !== null} onCommit={() => { setError(null); void batch!.commitPartial().catch(() => {}) }} onNext={() => { setError(null); void batch!.nextBatch().catch(() => {}) }} />}
      {sessionMessage && <p role="status">{sessionMessage}</p>}
      {!displayStage && (!displayError || preserveLegacyCards) && !(batchFlow && batch!.view.status === 'collecting') && <JobSummary resultCount={displayJobs.length} highMatchCount={displayJobs.filter((item) => ['S', 'A'].includes(item.match.matchLevel)).length} newCount={displayJobs.filter(isNewJob).length} favoriteCount={Object.values(statuses).filter((list) => list.includes('favorite')).length} />}
      <div className="list-heading"><div><h2>推薦任務</h2><p>已依履歷匹配程度由高至低排列</p></div><span>來源限定：{source}</span></div>
      {displayStage && <LoadingState message={displayStage === 'searching' ? '正在查閱職缺任務……' : '正在比對冒險者能力與職缺條件……'} />}
      {displayError && <ErrorState message={displayError} onRetry={() => { if (batchFlow && batch!.view.status === 'collecting' && collected === 40) { setError(null); void batch!.commitPartial().catch(() => {}) } else if (!error && session?.error) session.retryMatching?.(); else if (useConnector) void import104Jobs(); else { clearMockFailure(); void runSearch(preference) } }} />}
      {!displayStage && (!displayError || preserveLegacyCards) && !(batchFlow && batch!.view.status === 'collecting') && <JobList jobs={displayJobs} expandedId={expandedId} statuses={statuses} actions={actions} onExpand={setExpandedId} onClearFilters={useConnector ? undefined : clearFilters} emptyMessage={useConnector ? sessionMessage || '請先前往 104 搜尋、使用 Connector 擷取，再回來匯入並配對。' : '請修改關鍵字、清除地區條件或重新搜尋。'} />}
      <p className="match-disclaimer"><b>匹配度說明</b> 匹配度是履歷與職缺條件的相符程度，不代表錄取機率。</p>
    </div>
  )
}
