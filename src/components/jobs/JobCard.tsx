import type { JobActionHandlers, JobStatus, JobWithMatch } from '../../types'
import { getMatchLevelLabel } from '../../utils/getMatchLevel'

interface JobCardProps {
  item: JobWithMatch
  expanded: boolean
  hasStatus: (status: JobStatus) => boolean
  actions: JobActionHandlers
  onToggleDetail: () => void
}

export function JobCard({ item, expanded, hasStatus, actions, onToggleDetail }: JobCardProps) {
  const { job, match } = item
  const confidenceLabel = match.matchConfidence === 'high' ? '高' : match.matchConfidence === 'medium' ? '中' : '低'
  const isMockJob = job.externalId.startsWith('mock-')
  const isNew = isMockJob && new Date(job.collectedAt).getTime() - new Date(job.publishedAt).getTime() <= 48 * 60 * 60 * 1000
  return (
    <article className={`job-card grade-${match.matchLevel.toLowerCase()} ${expanded ? 'expanded' : ''}`}>
      <span className="job-pin" aria-hidden="true" />
      <div className="match-score"><strong>{match.matchScore}%</strong><b>{match.matchLevel} 級</b><small>{getMatchLevelLabel(match.matchLevel)}</small></div>
      <div className="job-main">
        <div className="job-title-row"><div><span>{job.category}</span><h2>{job.title}</h2></div>{isNew && <em>今日新增</em>}</div>
        <p className="company">{job.company}</p>
        <div className="job-facts"><span>⌖ {job.location}</span><span>▣ {job.salary}</span><span>◷ {job.experience}</span></div>
        <div className="requirement-row"><b>符合</b>{match.matchedSkills.map((skill) => <span key={skill}>{skill}</span>)}</div>
        {match.missingSkills.length > 0 && <div className="requirement-row missing"><b>待補</b>{match.missingSkills.map((skill) => <span key={skill}>{skill}</span>)}</div>}
        <div className="job-actions">
          {!isMockJob && <a className="detail-button" href={job.url} target="_blank" rel="noopener noreferrer" onClick={() => actions.markViewed(job.id)}>查看職缺</a>}
          <button className="detail-button" onClick={() => { onToggleDetail(); actions.markViewed(job.id) }}>{expanded ? '收起詳情' : isMockJob ? '查看職缺' : '查看配對'}</button>
          <button className={`save-button ${hasStatus('favorite') ? 'active' : ''}`} onClick={() => actions.toggleFavorite(job.id)}>{hasStatus('favorite') ? '★ 已收藏' : '☆ 收藏'}</button>
        </div>
      </div>
      {expanded && (
        <div className="job-detail">
          <div className="detail-copy">
            <span className="eyebrow">QUEST DETAIL</span><h3>任務詳情</h3><p>{job.description}</p>
            <dl><div><dt>職缺來源</dt><dd>{job.source} 人力銀行{isMockJob ? '（模擬）' : '（即時擷取）'}</dd></div><div><dt>工作經驗</dt><dd>{job.experience}</dd></div><div><dt>薪資條件</dt><dd>{job.salary}</dd></div></dl>
          </div>
          <div className="match-check">
            <h3>你的匹配情況</h3>
            {match.breakdown && <div className="match-breakdown" aria-label="匹配分數構成">
              <span>技能 <b>{match.breakdown.skills}</b></span><span>角色 <b>{match.breakdown.career}</b></span><span>年資 <b>{match.breakdown.experience}</b></span><span>專案 <b>{match.breakdown.projects}</b></span><span>情境 <b>{match.breakdown.context}</b></span>
              {match.breakdown.penalty < 0 && <span className="penalty">缺口限制 <b>{match.breakdown.penalty}</b></span>}
            </div>}
            <p className="match-confidence"><span>◇</span>資料信心<b>{confidenceLabel}</b></p>
            {match.matchedSkills.map((skill) => <p key={skill}><span>✓</span>{skill}<b>符合</b></p>)}
            {match.missingSkills.map((skill) => <p className="needs-work" key={skill}><span>!</span>{skill}<b>待補</b></p>)}
            <ul className="match-reasons">{match.matchReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            <div className="status-actions">
              <button className={hasStatus('applied') ? 'active' : ''} onClick={() => actions.markApplied(job.id)}>✓ {hasStatus('applied') ? '已投遞' : '標記已投遞'}</button>
              <button className={hasStatus('rejected') ? 'active rejected' : ''} onClick={() => actions.markRejected(job.id)}>× {hasStatus('rejected') ? '已標記不適合' : '不適合'}</button>
            </div>
            <a className="external-button" href={job.url} target="_blank" rel="noopener noreferrer">前往原始職缺 ↗</a>
          </div>
        </div>
      )}
    </article>
  )
}
