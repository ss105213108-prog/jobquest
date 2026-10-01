import type { Real104BatchView } from '../../services/real104BatchWorkingSet'

interface Real104BatchProgressProps {
  view: Real104BatchView
  disabled: boolean
  onCommit: () => void
  onNext: () => void
}

export function Real104BatchProgress({ view, disabled, onCommit, onNext }: Real104BatchProgressProps) {
  const collected = view.currentBatchJobs.length
  if (view.status === 'presented') return <section role="status" aria-label="104 批次收集進度">
    <p>第 {view.batchNumber} 批 · 已配對 {collected} 筆職缺</p>
    <p>待續職缺 {view.pendingJobs.length} 筆</p>
    <button type="button" className="primary-button" disabled={disabled} onClick={onNext}>下一批</button>
  </section>
  if (view.status !== 'collecting') return null
  return <section role="status" aria-label="104 批次收集進度">
    <p>第 {view.batchNumber} 批 · 已收集 {collected} / 40 筆</p>
    <p>待續職缺 {view.pendingJobs.length} 筆</p>
    {view.lastCapture && <p>本次新增 {view.lastCapture.accepted} 筆 · 略過 {view.lastCapture.skipped} 筆重複職缺</p>}
    {collected > 0 && <button type="button" disabled={disabled} onClick={onCommit}>
      {collected === 40 ? '重試目前 40 筆配對' : `使用目前 ${collected} 筆進行配對`}
    </button>}
  </section>
}
