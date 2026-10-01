import type { GuildPage } from '../../types'

interface GuildSidebarProps {
  active: GuildPage
  onNavigate: (page: GuildPage) => void
  favoriteCount: number
  localDemo?: boolean
}

const navItems: Array<{ id: GuildPage; icon: string; label: string; sub: string }> = [
  { id: 'board', icon: '◆', label: '職缺任務佈告欄', sub: '搜尋職缺' },
  { id: 'profile', icon: '♙', label: '冒險者檔案', sub: '履歷與技能' },
  { id: 'favorites', icon: '★', label: '收藏任務', sub: '已收藏職缺' },
  { id: 'history', icon: '▤', label: '任務紀錄', sub: '已查看／已投遞' },
  { id: 'settings', icon: '⚙', label: '公會設定', sub: '切換 104／1111' },
]

export function GuildSidebar({ active, onNavigate, favoriteCount, localDemo = false }: GuildSidebarProps) {
  return (
    <aside className="guild-sidebar" aria-label="公會選單">
      <p className="sidebar-heading">公會選單</p>
      <nav>
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${active === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            <span><strong>{item.label}</strong><small>{localDemo && item.id === 'settings' ? '本次資料' : item.sub}</small></span>
            {item.id === 'favorites' && favoriteCount > 0 && <b>{favoriteCount}</b>}
          </button>
        ))}
      </nav>
      <div className="guild-motto">
        <span aria-hidden="true">✦</span>
        <p>每一次投遞<br />都是冒險的下一步</p>
      </div>
    </aside>
  )
}
