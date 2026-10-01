import type { JobActionHandlers, JobStatus, JobWithMatch } from '../../types'
import { JobCard } from './JobCard'

interface JobListProps {
  jobs: JobWithMatch[]
  expandedId: string | null
  statuses: Record<string, JobStatus[]>
  actions: JobActionHandlers
  onExpand: (jobId: string | null) => void
  emptyMessage?: string
  onClearFilters?: () => void
}

export function JobList({ jobs, expandedId, statuses, actions, onExpand, emptyMessage = '目前沒有符合條件的任務。', onClearFilters }: JobListProps) {
  if (!jobs.length) return <div className="empty-state"><span>◇</span><h2>目前沒有找到符合此條件的職缺任務</h2><p>{emptyMessage}</p>{onClearFilters && <button onClick={onClearFilters}>清除搜尋條件</button>}</div>
  return (
    <div className="job-list">
      {jobs.map((item) => <JobCard key={item.job.id} item={item} expanded={expandedId === item.job.id} hasStatus={(status) => statuses[item.job.id]?.includes(status) ?? false} actions={actions} onToggleDetail={() => onExpand(expandedId === item.job.id ? null : item.job.id)} />)}
    </div>
  )
}
