import { get104ConnectorMessage } from '../../integrations/job104/connectorUi'
import type { Job104ConnectorState } from '../../integrations/job104/types'

interface Job104ConnectorControlsProps {
  state: Job104ConnectorState
  capturedCount: number
  capturedAt: string | null
  disabled: boolean
  onImport: () => void
  onRefresh: () => void
  importLabel?: string
}

export function Job104ConnectorControls({ state, capturedCount, capturedAt, disabled, onImport, onRefresh, importLabel = '匯入並配對' }: Job104ConnectorControlsProps) {
  const ready = state === 'ready'
  return (
    <section className={`connector-panel state-${state}`} aria-live="polite">
      <div className="connector-copy">
        <span className="eyebrow">104 CONNECTOR</span>
        <h2>匯入目前瀏覽器工作清單</h2>
        <p>{get104ConnectorMessage(state, capturedCount)}</p>
        {capturedAt && ready && <small>擷取時間：{new Date(capturedAt).toLocaleString('zh-TW')} · 30 分鐘內有效</small>}
      </div>
      <div className="connector-actions">
        <button type="button" className="connector-refresh" disabled={disabled || state === 'checking'} onClick={onRefresh}>檢查 Connector</button>
        <button type="button" className="primary-button connector-import" disabled={disabled || !ready} onClick={onImport}>{importLabel}</button>
      </div>
      {state === 'missing-extension' && (
        <details className="connector-help">
          <summary>Development 安裝方式</summary>
          <ol>
            <li>在 Chromium Extensions 開啟 Developer Mode。</li>
            <li>選擇 Load unpacked。</li>
            <li>載入 <code>browser-extension/jobquest-104-connector/</code>。</li>
            <li>重新整理 Job Quest 後再檢查 Connector。</li>
          </ol>
        </details>
      )}
    </section>
  )
}
