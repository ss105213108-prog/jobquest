import { useEffect, useState } from 'react'
import { isSupported104Location, location104Map } from '../../integrations/job104/locationMap'

interface SearchPanelProps {
  localDemo?: boolean
  keyword: string
  location: string
  onSearch: (keyword: string, location: string) => void
  disabled?: boolean
  submitLabel?: string
}

const quickSearches = ['AI', '前端工程師', '全端工程師', '軟體', '半導體', 'React']

export function SearchPanel({ localDemo = false, keyword, location, onSearch, disabled = false, submitLabel = '搜尋任務' }: SearchPanelProps) {
  const [draft, setDraft] = useState(keyword)
  const [draftLocation, setDraftLocation] = useState(location)

  useEffect(() => setDraft(keyword), [keyword])
  useEffect(() => setDraftLocation(location), [location])

  const submit = () => onSearch(draft.trim(), draftLocation)

  return (
    <section className="search-panel">
      <div className="section-title-row">
        <div><span className="eyebrow">QUEST BOARD</span><h1>職缺任務佈告欄</h1></div>
        <span className="wax-mark" aria-hidden="true">搜</span>
      </div>
      <p className="section-intro">{localDemo ? 'MOCK / DEMO MODE · 既有示範職缺，依你確認的履歷排序。' : '輸入你想找的職業群或關鍵字，系統會從你選擇的人力銀行搜尋，再依履歷匹配度重新排序。'}</p>
      <form className="search-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
        <label className="search-input">
          <span aria-hidden="true">⌕</span>
          <input disabled={disabled} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="例如：AI、前端工程師、軟體、半導體" />
        </label>
        <label className="location-select">
          <span className="visually-hidden">地區</span>
          <select disabled={disabled} value={draftLocation} onChange={(event) => setDraftLocation(event.target.value)}>
            {!isSupported104Location(draftLocation) && <option value={draftLocation} disabled>此地區不支援，請重新選擇</option>}
            {Object.keys(location104Map).map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </label>
        <button className="search-button" disabled={disabled}>{submitLabel}</button>
      </form>
      <div className="quick-search"><span>快速搜尋</span>{quickSearches.map((item) => <button disabled={disabled} key={item} onClick={() => { setDraft(item); onSearch(item, draftLocation) }}>{item}</button>)}</div>
    </section>
  )
}
