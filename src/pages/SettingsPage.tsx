import { useState } from 'react'
import type { JobSource } from '../types'

export function SettingsPage({ source, onChangeSource }: { source: JobSource; onChangeSource: (source: JobSource) => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changeSource = async (nextSource: JobSource) => {
    if (nextSource === source || saving) return
    setSaving(true)
    setError(null)
    try { await onChangeSource(nextSource) }
    catch { setError('目前無法同步公會資料，請稍後再試。') }
    finally { setSaving(false) }
  }
  return (
    <div className="simple-page settings-page">
      <span className="eyebrow">GUILD SETTINGS</span><h1>公會設定</h1><p>切換任務來源後，104 由 Browser Connector 匯入公開職缺；1111 維持 Demo 資料。</p>
      <section className="setting-block"><h2>目前職缺來源</h2><div className="setting-sources">{(['104', '1111'] as JobSource[]).map((item) => <button disabled={saving} className={item === source ? 'active' : ''} key={item} onClick={() => void changeSource(item)}><strong>{item}</strong><span>{item} 人力銀行</span><b>{item === source ? '使用中' : saving ? '同步中…' : '切換來源'}</b></button>)}</div>{error && <p className="cloud-inline-error" role="alert">{error}</p>}</section>
      <div className="mock-boundary"><strong>Phase 6C 本機 Connector 模式</strong><p>匿名身份、履歷與偏好仍同步至既有雲端；履歷解析與 deterministic matching 在瀏覽器執行。104 職缺只存在 Extension session，不寫入 Supabase；1111 尚未正式串接。</p></div>
    </div>
  )
}
