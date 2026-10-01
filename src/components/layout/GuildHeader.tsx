import type { JobSource } from '../../types'

interface GuildHeaderProps {
  source: JobSource
  onRestart: () => void
  demoJobCount?: number
}

export function GuildHeader({ source, onRestart, demoJobCount }: GuildHeaderProps) {
  return (
    <header className="guild-header">
      <div className="brand-lockup">
        <span className="guild-seal" aria-hidden="true">JQ</span>
        <div>
          <strong>Job Quest Guild</strong>
          <span>求職冒險者公會</span>
        </div>
      </div>
      <p className="header-title">求職冒險者公會</p>
      <div className="header-stats">
        <button className="source-reset" onClick={onRestart} title={demoJobCount === undefined ? '公會設定' : '本機公會設定'}>
          <span>{demoJobCount === undefined ? '目前來源' : '示範來源'}</span><strong>{source}</strong>
        </button>
        {demoJobCount !== undefined && <div><span>示範職缺</span><strong>{demoJobCount}</strong></div>}
      </div>
    </header>
  )
}
