import type { ResumeProfile } from '../../types'

export function ResumePanel({ resume }: { resume: ResumeProfile }) {
  return (
    <aside className="resume-panel">
      <div className="profile-heading">
        <span className="avatar" aria-hidden="true">{resume.name.trim().charAt(0) || '？'}</span>
        <div><small>冒險者檔案</small><h2>{resume.name}</h2></div>
        <span className="level-badge">Lv. {resume.level}</span>
      </div>
      <div className="profile-section">
        <h3>職涯方向</h3>
        <p>{resume.careerDirections.join(' ／ ')}</p>
      </div>
      <div className="profile-section">
        <h3>能力紀錄</h3>
        <div className="abilities">
          {resume.abilities.map((ability) => (
            <div className="ability" key={ability.label}>
              <div><span>{ability.label}</span><b>{ability.value}</b></div>
              <div className="ability-track"><span style={{ width: `${ability.value}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
      <div className="profile-section">
        <h3>技能</h3>
        <div className="skill-list">
          {resume.skills.map((skill) => <span key={skill}>{skill}</span>)}
        </div>
      </div>
      <p className="level-note">職涯等級為遊戲化顯示，不代表真實職涯能力排名。</p>
    </aside>
  )
}
