interface JobSummaryProps {
  resultCount: number
  highMatchCount: number
  newCount: number
  favoriteCount: number
}

export function JobSummary({ resultCount, highMatchCount, newCount, favoriteCount }: JobSummaryProps) {
  const items = [
    [resultCount, '搜尋結果'], [highMatchCount, 'S／A 級任務'], [newCount, '今日新增'], [favoriteCount, '已收藏'],
  ]
  return <div className="job-summary">{items.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
}
