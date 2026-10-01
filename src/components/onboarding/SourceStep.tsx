import type { JobSource } from '../../types'

interface SourceStepProps {
  value: JobSource | null
  onChange: (source: JobSource) => void
  onNext: () => void
}

export function SourceStep({ value, onChange, onNext }: SourceStepProps) {
  return (
    <section className="onboarding-card source-step">
      <div className="step-kicker">入會登錄 · 第一步</div>
      <h1>選擇今天要使用的人力銀行</h1>
      <p>公會只會從你選擇的來源整理職缺，兩邊的任務不會混在一起。</p>
      <div className="source-options">
        {(['104', '1111'] as JobSource[]).map((source, index) => (
          <button
            key={source}
            className={`source-paper ${value === source ? 'selected' : ''}`}
            onClick={() => onChange(source)}
            aria-pressed={value === source}
          >
            <span className="paper-pin" />
            <small>任務來源 {String(index + 1).padStart(2, '0')}</small>
            <strong>{source}</strong>
            <b>{source} 人力銀行</b>
            <span>搜尋 {source} 的公開職缺</span>
            <i>{value === source ? '✓ 已選擇' : '選擇此來源'}</i>
          </button>
        ))}
      </div>
      <button className="primary-button next-button" disabled={!value} onClick={onNext}>進入下一步 <span>→</span></button>
      <p className="mock-notice">104 使用本機 Browser Connector 匯入公開職缺；1111 目前仍為清楚標示的 Demo 資料。</p>
    </section>
  )
}
