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
        <div className="connector-help">
          <a href="/downloads/jobquest-104-connector.zip" download="jobquest-104-connector.zip">下載 104 Connector</a>
          <details>
            <summary>安裝說明（解壓後載入）</summary>
            <ol>
              <li>下載 ZIP。</li>
              <li>解壓縮 ZIP；ZIP 無法直接安裝。</li>
              <li>開啟 Chrome／Edge 擴充功能頁（<code>chrome://extensions</code>／<code>edge://extensions</code>）。</li>
              <li>開啟 Developer Mode（開發人員模式）。</li>
              <li>選擇 Load unpacked（載入未封裝項目）。</li>
              <li>選擇解壓後包含 <code>manifest.json</code> 的資料夾。</li>
              <li>重新整理 Job Quest，再按「檢查 Connector」。</li>
            </ol>
          </details>
        </div>
      )}
    </section>
  )
}
