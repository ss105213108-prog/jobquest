import { useState } from 'react'
import { ResumeReview } from '../components/onboarding/ResumeReview'
import type { ResumeProfile } from '../types'
import { formatResumeEducation, formatWorkExperience } from '../utils/resumeFormatting'

export function ProfilePage({ resume, onUpdate }: { resume: ResumeProfile; onUpdate: (resume: ResumeProfile) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <div className="profile-resume-flow"><ResumeReview profile={resume} sourceContext="confirmed-edit" changeFileLabel="取消編輯" onChangeFile={() => setEditing(false)} onConfirm={async next => { await onUpdate(next); setEditing(false) }} /></div>
  return (
    <div className="simple-page profile-page">
      <span className="eyebrow">ADVENTURER RECORD</span><h1>冒險者檔案</h1><p>這是你已確認的履歷資料。編輯後再次確認，才會更新已保存的內容。</p>
      <button className="profile-upload-button" onClick={() => setEditing(true)}>編輯我的履歷</button>
      <div className="profile-sheet">
        <section><h2>基本資料</h2><dl><div><dt>姓名</dt><dd>{resume.name}</dd></div><div><dt>職涯方向</dt><dd>{resume.careerDirections.join('、')}</dd></div><div><dt>學歷</dt><dd>{formatResumeEducation(resume.education) || '未填寫'}</dd></div></dl></section>
        <section><h2>工作經歷</h2><ul>{resume.workExperiences.map((item, index) => <li key={`${item.company ?? ''}-${item.title}-${index}`}>{formatWorkExperience(item)}</li>)}</ul></section>
        <section><h2>專案經驗</h2><ul className="profile-projects">{resume.projects.map((project, index) => <li className="profile-project" key={`${project.name}-${index}`}>
          <h3>{project.name}</h3>
          <dl>
            {project.skills.some(skill => skill.trim()) && <div><dt>使用技術</dt><dd>{project.skills.join('、')}</dd></div>}
            {project.tools?.some(tool => tool.trim()) && <div><dt>開發工具</dt><dd>{project.tools.join('、')}</dd></div>}
            {project.description?.trim() && <div><dt>專案說明</dt><dd>{project.description}</dd></div>}
          </dl>
        </li>)}</ul></section>
        <section className="wide"><h2>技能清單</h2><div className="skill-list large">{resume.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></section>
        <section className="wide"><h2>證照</h2><ul>{(resume.certifications ?? []).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>
      </div>
    </div>
  )
}
