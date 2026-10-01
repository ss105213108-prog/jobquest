import { useEffect, useMemo, useState } from 'react'
import { GuildHeader } from './components/layout/GuildHeader'
import { GuildSidebar } from './components/layout/GuildSidebar'
import { ManualResumeEntry } from './components/onboarding/ManualResumeEntry'
import { ResumePanel } from './components/resume/ResumePanel'
import { useLocalAcceptance } from './hooks/useLocalAcceptance'
import { useAuth } from './hooks/useAuth'
import { useConfirmedResumePersistence } from './hooks/useConfirmedResumePersistence'
import { useJobPreferencePersistence } from './hooks/useJobPreferencePersistence'
import { useJobActions } from './hooks/useJobActions'
import { useReal104Session } from './hooks/useReal104Session'
import { useReal104Batch } from './hooks/useReal104Batch'
import { useJobActionResolution } from './hooks/useJobActionResolution'
import { isJobActionInScope } from './services/jobActionIdentity'
import { ErrorState, LoadingState } from './components/ui/AsyncState'
import { mockJobs } from './data/mockJobs'
import { BoardPage } from './pages/BoardPage'
import { CollectionPage } from './pages/CollectionPage'
import { ProfilePage } from './pages/ProfilePage'
import type { GuildPage, JobActionHandlers } from './types'

function batchSearchIntent(fingerprint: string | null): { keyword: string; location: string } | null {
  if (!fingerprint) return null
  try {
    const parts: unknown = JSON.parse(fingerprint)
    if (Array.isArray(parts) && parts.length === 3 && parts[0] === 'REAL_104'
      && typeof parts[1] === 'string' && typeof parts[2] === 'string') return { keyword: parts[1], location: parts[2] }
  } catch { /* The Foundation has already rejected an invalid persisted fingerprint. */ }
  return null
}

function AppContent({ allowDemo = false }: { allowDemo?: boolean }) {
  const [page, setPage] = useState<GuildPage>('board')
  const [jobDataMode, setJobDataMode] = useState<'REAL_104' | 'DEMO_LOCAL'>('DEMO_LOCAL')
  const local = useLocalAcceptance()
  const auth = useAuth()
  const persistence = useConfirmedResumePersistence(auth, local)
  const preferences = useJobPreferencePersistence(auth, local)
  const jobActions = useJobActions(auth)
  const realSession = useReal104Session(local.resume)
  const batch = useReal104Batch(auth.error ? null : auth.user?.id ?? null, local.resume)
  const batchActive = batch.view.status !== 'missing'
  const selectedMode = allowDemo ? realSession.mode ?? (batchActive ? 'REAL_104' : jobDataMode) : 'REAL_104'
  const localDemo = selectedMode === 'DEMO_LOCAL'
  useEffect(() => {
    // Production has one source. Preserve the legacy snapshot while retiring
    // an old Demo selection through the existing session API.
    if (!allowDemo && realSession.mode === 'DEMO_LOCAL') realSession.selectMode('REAL_104')
  }, [allowDemo, realSession.mode, realSession.selectMode])
  const activeBatchSearch = batchActive ? batchSearchIntent(batch.view.searchFingerprint) : null
  const sourcePreference = useMemo(() => {
    if (localDemo) return local.preference
    if (activeBatchSearch) return { ...local.preference, source: '104' as const, ...activeBatchSearch }
    const snapshot = realSession.snapshot
    return !batchActive && snapshot ? { ...local.preference, source: '104' as const, keyword: snapshot.keyword, location: snapshot.location }
      : local.preference.source === '104' ? local.preference : { ...local.preference, source: '104' as const }
  }, [local.preference, localDemo, realSession.snapshot, batchActive, activeBatchSearch?.keyword, activeBatchSearch?.location])
  const { resume } = local
  const source = sourcePreference.source
  const statuses = Object.fromEntries(Object.entries(jobActions.statuses).filter(([key]) => isJobActionInScope(key, source, localDemo)))
  const savedJobs = jobActions.jobs ?? {}
  const activeSession = batchActive ? {
    status: batch.view.status === 'presented' ? 'ready' as const : batch.view.status === 'expired' ? 'expired' as const
      : batch.view.status === 'collecting' ? 'missing' as const : 'corrupt' as const,
    matches: batch.view.status === 'presented' ? batch.matches : [], matching: batch.matching,
    error: batch.error, retryMatching: batch.retryMatching,
  } : realSession
  const currentJobs = batchActive ? batch.view.status === 'presented' ? batch.view.currentBatchJobs : []
    : realSession.status === 'ready' ? realSession.snapshot?.jobs ?? [] : []
  const resolved = useJobActionResolution(jobActions.state.ownerId, !localDemo, resume, statuses, savedJobs, { ...activeSession, currentJobs })
  const withJob = (method: keyof JobActionHandlers) => (id: string) => {
    const job = currentJobs.find(item => item.id === id) ?? savedJobs[id]
    return job ? jobActions.actions[method](id, job) : jobActions.actions[method](id)
  }
  const actions: JobActionHandlers = localDemo ? jobActions.actions : {
    toggleFavorite: withJob('toggleFavorite'), markViewed: withJob('markViewed'),
    markApplied: withJob('markApplied'), markRejected: withJob('markRejected'),
  }
  const persistenceNotice = <section className="resume-persistence-notice" aria-label="履歷保存狀態">
    <p>草稿僅在本機供您編輯。確認後的結構化履歷才保存至 Supabase，並用於職缺匹配。</p>
    {auth.error || (!auth.initializing && !auth.user)
      ? <ErrorState message="目前無法取得公會身份，履歷暫留本機，尚未保存至雲端。" onRetry={auth.retry} />
      : persistence.initializing
        ? <LoadingState message={auth.initializing ? '正在初始化公會身份…' : '正在還原已確認履歷…'} />
        : persistence.status.phase === 'error'
          ? <ErrorState message={persistence.status.operation === 'save' ? '履歷雲端保存失敗；已確認內容仍保留於目前畫面，可繼續匹配或重試保存。' : '履歷還原失敗；可重試，或手動建立並確認履歷。'} onRetry={() => { void persistence.retry() }} />
          : <p role="status">{persistence.status.phase === 'saving' ? '正在保存已確認履歷…'
            : persistence.status.phase === 'saved' ? '已確認履歷已保存至雲端。'
              : persistence.status.phase === 'restored' ? '已還原雲端保存的確認履歷。' : '尚無已保存履歷；請確認草稿後保存。'}</p>}
  </section>
  // Only a confirmed local snapshot or an authenticated saved profile unlocks matching.
  if (!resume) return <main className="onboarding-shell">
    <div className="onboarding-brand"><span className="guild-seal">JQ</span><strong>Job Quest Guild</strong><small>求職冒險者公會</small></div>
    {persistenceNotice}
    <div className="resume-upload-flow" hidden={persistence.initializing}>{!persistence.initializing && <ManualResumeEntry key={auth.user?.id ?? 'local'} onComplete={async next => { await persistence.confirm(next); setPage('board') }} />}</div>
    <div className="mock-ribbon">確認履歷後開始職缺匹配</div>
  </main>
  if (persistence.initializing) {
    return <main className="onboarding-shell">{persistenceNotice}</main>
  }
  const preferenceNotice = <section className="resume-persistence-notice" aria-label="求職偏好保存狀態">
    {preferences.initializing
      ? <LoadingState message="正在還原求職偏好…" />
      : preferences.status.phase === 'error'
        ? <ErrorState message={preferences.status.operation === 'save' ? '求職偏好保存失敗；目前本機搜尋條件仍保留，可重試保存。' : '求職偏好還原失敗；目前保留既有預設條件，可重試或自行設定。'} onRetry={() => { void preferences.retry() }} />
        : <p role="status">{preferences.status.phase === 'saving' ? '正在保存求職偏好…'
          : preferences.status.phase === 'saved' ? '求職偏好已保存至雲端。'
            : preferences.status.phase === 'restored' ? '已還原雲端求職偏好。' : '尚無已保存求職偏好，使用既有預設條件。'}</p>}
  </section>
  const actionNotice = <section className="resume-persistence-notice" aria-label="職缺操作保存狀態">
    {jobActions.initializing
      ? <LoadingState message="正在還原職缺操作…" />
      : jobActions.state.phase === 'error'
        ? <ErrorState message={jobActions.state.operation === 'save' ? '職缺操作保存失敗；目前本機標記仍保留，可重試保存。' : '職缺操作還原失敗；可重試，或繼續操作目前職缺。'} onRetry={() => { void jobActions.retry() }} />
        : <p role="status">{jobActions.state.phase === 'saving' ? '正在保存職缺操作…'
          : jobActions.state.phase === 'saved' ? '職缺操作已保存至雲端。'
            : jobActions.state.phase === 'restored' ? '已還原雲端職缺操作。' : '尚無已保存職缺操作。'}</p>}
  </section>
  const favoriteCount = localDemo ? Object.values(statuses).filter(list => list.includes('favorite')).length
    : resolved.matching || resolved.error ? 0 : resolved.matches.filter(item => statuses[item.job.id]?.includes('favorite')).length
  const renderPage = () => {
    if (page === 'board') return <>
      {allowDemo && <fieldset className="mock-scenario"><legend>職缺資料來源</legend>
        <label><input type="radio" name="job-data-source" checked={localDemo} onChange={() => { realSession.selectMode('DEMO_LOCAL'); setJobDataMode('DEMO_LOCAL') }} />MOCK / DEMO</label>
        <label><input type="radio" name="job-data-source" checked={!localDemo} onChange={() => { realSession.selectMode('REAL_104'); setJobDataMode('REAL_104') }} />REAL 104</label>
      </fieldset>}
      {preferenceNotice}
      {!localDemo && !batchActive && realSession.storageFailed && <p role="status">目前無法保存瀏覽器職缺工作清單；本次仍可使用，重新整理後可能需要重新匯入。</p>}
      {(preferences.status.phase !== 'restoring' || preferences.status.ready) && <BoardPage key={`${source}-${selectedMode}`} localDemo={localDemo} source={source} resume={resume} initialPreference={sourcePreference} onPreferenceChange={preferences.save} statuses={statuses} actions={actions} realSession={activeSession} batch={batch} onRealImport={realSession.acceptImport} onRealSearch={realSession.clearSearch}
        onBatchSearch={intent => { batch.startSearch(intent); realSession.clearSearch(); setJobDataMode('REAL_104') }}
        onBatchCapture={async (payload, preference) => {
          if (batch.view.status === 'missing') {
            batch.startSearch({ source: 'REAL_104', keyword: preference.keyword, region: preference.location })
            realSession.clearSearch()
            setJobDataMode('REAL_104')
          }
          await batch.addCapture(payload)
        }} />}
    </>
    if (page === 'favorites' || page === 'history') return <CollectionPage key={selectedMode} localDemo={localDemo} mode={page} source={source} resume={resume} statuses={statuses} actions={actions} realSession={{ ...activeSession, ...resolved }} />
    if (page === 'profile') return <ProfilePage resume={resume} onUpdate={persistence.confirm} />
    return <div className="simple-page"><span className="eyebrow">GUILD SETTINGS</span><h1>公會設定</h1><p>已確認履歷 · {localDemo ? 'MOCK / DEMO 職缺' : 'REAL 104 職缺'}</p><p>只清除目前畫面與瀏覽器職缺工作清單，不刪除已保存履歷、偏好或職缺操作；重新整理可再次還原雲端資料。</p>{batch.error && <p role="alert">{batch.error}</p>}<button className="profile-upload-button" onClick={() => { try { batch.clear() } catch { return } if (allowDemo) realSession.clear(); else realSession.clearSearch(); jobActions.discard(); preferences.discard(); persistence.discard(); setJobDataMode(allowDemo ? 'DEMO_LOCAL' : 'REAL_104'); setPage('board') }}>清除本次資料，重新建立履歷</button></div>
  }

  return (
    <div className="app-shell">
      <GuildHeader source={source} demoJobCount={localDemo ? mockJobs.filter(job => job.source === source && job.status === 'active').length : undefined} onRestart={() => setPage('settings')} />
      <div className="app-grid">
        <GuildSidebar localDemo active={page} onNavigate={setPage} favoriteCount={favoriteCount} />
        <main className="parchment-main">{persistenceNotice}{actionNotice}{renderPage()}</main>
        <ResumePanel resume={resume} />
      </div>
      <div className="mock-ribbon">{localDemo ? 'MOCK / DEMO 職缺 · 確認履歷雲端保存' : 'REAL 104 · 確認履歷雲端保存'}</div>
    </div>
  )
}

// Explicit development/test entry retains mock fixtures and their existing
// flow. main.tsx mounts only the fixed-104 default App; no production selector.
export function DevelopmentApp() {
  return <AppContent allowDemo />
}

function App() {
  return <AppContent />
}

export default App
