import { useState } from 'react'
import type { ResumeProfile, WorkExperience } from '../../types'
import { canConfirmResumeDraft, confirmResumeDraft } from '../../utils/resumeReview'
import { createResumeEducationInput, replacesStructuredEducation, resolveResumeEducationInput } from '../../utils/resumeEducationInput'

function EditableTags({ label, accessibleLabel = label, items, onChange, missingLabel = '未辨識，可手動補充' }: { label: string; accessibleLabel?: string; items: string[]; onChange: (items: string[]) => void; missingLabel?: string }) {
  const [input, setInput] = useState('')
  return <div className="editable-tags">
    <strong>{label}</strong>
    {items.length === 0 && <p className="review-missing">{missingLabel}</p>}
    <div>{items.map((item, index) => <button key={`${item}-${index}`} title={`移除${accessibleLabel}：${item}`} aria-label={`移除${accessibleLabel}：${item}`}
      onClick={() => onChange(items.filter((_, i) => i !== index))}>{item} ×</button>)}</div>
    <form onSubmit={event => {
      event.preventDefault()
      const value = input.trim()
      if (value && !items.some(item => item.toLocaleLowerCase() === value.toLocaleLowerCase())) onChange([...items, value])
      setInput('')
    }}>
      <input value={input} onChange={event => setInput(event.target.value)} aria-label={`新增${accessibleLabel}`} placeholder={`新增${label}`} />
      <button disabled={!input.trim()} aria-label={`加入${accessibleLabel}`}>新增</button>
    </form>
  </div>
}

const experienceFields: Array<{ key: keyof WorkExperience; label: string }> = [
  { key: 'company', label: '公司' }, { key: 'title', label: '職稱' }, { key: 'location', label: '地點' },
  { key: 'startDate', label: '開始日期' }, { key: 'endDate', label: '結束日期' }, { key: 'durationText', label: '年資' },
]

export function ResumeReview({ profile, onConfirm, onChangeFile, changeFileLabel = '重新選擇檔案', sourceContext = 'mock' }: {
  profile: ResumeProfile; onConfirm: (profile: ResumeProfile) => Promise<void>; onChangeFile: () => void; changeFileLabel?: string; sourceContext?: 'manual-create' | 'confirmed-edit' | 'ai-draft' | 'mock'
}) {
  const [draft, setDraft] = useState(() => structuredClone(profile))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [educationInput] = useState(() => createResumeEducationInput(profile.education))
  const [educationText, setEducationText] = useState(() => educationInput.initialText)
  const manual = sourceContext === 'manual-create' || sourceContext === 'confirmed-edit'
  const missingLabel = manual ? '未填寫，可手動補充' : '未辨識，可手動補充'
  const sourceCopy = {
    'manual-create': ['DRAFT · 手動建立履歷', '請填寫並確認您的履歷資料。草稿尚未確認，確認後才會保存並用於職缺匹配。'],
    'confirmed-edit': ['DRAFT · 編輯已確認履歷', '正在編輯已確認履歷的草稿副本。取消不影響原內容，確認後才會更新。'],
    'ai-draft': ['DRAFT · AI 候選履歷', 'AI 提出的內容僅為未確認草稿，請逐項檢查並補充。確認後才會保存並用於職缺匹配。'],
    mock: ['DRAFT · MOCK / DEMO MODE · LOCAL ONLY', 'AI / DEMO 預填內容僅為草稿，請確認或補充後再進入職缺匹配。目前使用 Mock 示範資料，並非 PDF 的實際 AI 分析結果；資料不會同步至雲端。'],
  }[sourceContext]
  const invalid = !canConfirmResumeDraft(draft)
  const confirm = async () => {
    if (invalid || saving) return
    setSaving(true); setError(null)
    try { await onConfirm(confirmResumeDraft(draft)) }
    catch { setError('目前無法確認履歷，請保留修改內容再試一次。') }
    finally { setSaving(false) }
  }

  return <section className="onboarding-card resume-review">
    <button className="text-button back-button" disabled={saving} onClick={onChangeFile}>← {changeFileLabel}</button>
    <div className="step-kicker">{sourceCopy[0]}</div>
    <h1>確認冒險者資料</h1>
    <p>{sourceCopy[1]}</p>
    <fieldset disabled={saving} className="review-fields">
      <div className="review-grid">
        <label className="wide"><span>冒險者名稱</span><input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        {manual ? <div className="wide review-education">
          <label><span>學歷（選填）</span><input aria-describedby="resume-education-help" placeholder="例如：朝陽科技大學 資訊工程系" value={educationText} onChange={event => {
            const text = event.target.value
            setEducationText(text)
            setDraft({ ...draft, education: resolveResumeEducationInput(educationInput, text) })
          }} /></label>
          <p id="resume-education-help" className="review-missing">可直接填寫學校與科系，不需拆欄；不必填寫畢業狀態。</p>
          {replacesStructuredEducation(educationInput, educationText) && <p className="review-missing" role="status">修改學歷後，原有科系與畢業狀態會改為這段文字；確認後才會保存。取消可保留原資料。</p>}
        </div> : <>
        <label><span>學校</span><input placeholder={missingLabel} value={draft.education.school} onChange={event => setDraft({ ...draft, education: { ...draft.education, school: event.target.value } })} /></label>
        <label><span>科系</span><input placeholder={missingLabel} value={draft.education.department} onChange={event => setDraft({ ...draft, education: { ...draft.education, department: event.target.value } })} /></label>
        <label className="wide"><span>畢業狀態</span><input placeholder={missingLabel} value={draft.education.graduationStatus} onChange={event => setDraft({ ...draft, education: { ...draft.education, graduationStatus: event.target.value } })} /></label>
        </>}
      </div>
      <EditableTags missingLabel={missingLabel} label="技能" items={draft.skills} onChange={skills => setDraft({ ...draft, skills })} />
      <section className="review-group"><h2>工作經歷</h2>
        {draft.workExperiences.length === 0 && <p className="review-missing">{missingLabel}</p>}
        {draft.workExperiences.map((item, index) => <div className="review-entry" key={index}>
          <div className="review-entry-heading"><strong>經歷 {index + 1}</strong><button title="移除工作經歷" aria-label={`移除工作經歷 ${index + 1}`}
            onClick={() => setDraft({ ...draft, workExperiences: draft.workExperiences.filter((_, i) => i !== index) })}>×</button></div>
          <div className="review-grid">
            {experienceFields.map(field => <label key={field.key}><span>{field.label}</span><input placeholder={field.key === 'title' ? '職稱' : missingLabel} value={item[field.key] ?? ''}
              onChange={event => setDraft({ ...draft, workExperiences: draft.workExperiences.map((work, i) => i === index ? { ...work, [field.key]: event.target.value } : work) })} /></label>)}
            <label className="wide"><span>工作內容</span><textarea placeholder={missingLabel} value={item.description ?? ''} onChange={event => setDraft({ ...draft,
              workExperiences: draft.workExperiences.map((work, i) => i === index ? { ...work, description: event.target.value } : work) })} /></label>
          </div>
        </div>)}
        <button className="text-button" onClick={() => setDraft({ ...draft, workExperiences: [...draft.workExperiences, { title: '' }] })}>新增工作經歷</button>
      </section>
      <section className="review-group"><h2>專案</h2>
        {draft.projects.length === 0 && <p className="review-missing">{missingLabel}</p>}
        {draft.projects.map((item, index) => <div className="review-entry" key={index}>
          <div className="review-entry-heading"><strong>專案 {index + 1}</strong><button title="移除專案" aria-label={`移除專案 ${index + 1}`}
            onClick={() => setDraft({ ...draft, projects: draft.projects.filter((_, i) => i !== index) })}>×</button></div>
          <div className="review-grid">
            <label className="wide"><span>專案名稱</span><input value={item.name} onChange={event => setDraft({ ...draft,
              projects: draft.projects.map((project, i) => i === index ? { ...project, name: event.target.value } : project) })} /></label>
          </div>
          <EditableTags missingLabel={missingLabel} label="使用技術" accessibleLabel={`專案 ${index + 1} 技術`} items={item.skills} onChange={skills => setDraft({ ...draft,
            projects: draft.projects.map((project, i) => i === index ? { ...project, skills } : project) })} />
          {manual && <EditableTags missingLabel="未填寫，可手動新增" label="開發工具" accessibleLabel={`專案 ${index + 1} 開發工具`} items={item.tools ?? []} onChange={tools => setDraft({ ...draft,
            projects: draft.projects.map((project, i) => i === index ? { ...project, tools } : project) })} />}
          <div className="review-grid project-description-field">
            <label className="wide"><span>專案說明</span><textarea placeholder={missingLabel} value={item.description ?? ''} onChange={event => setDraft({ ...draft,
              projects: draft.projects.map((project, i) => i === index ? { ...project, description: event.target.value } : project) })} /></label>
          </div>
        </div>)}
        <button className="text-button" onClick={() => setDraft({ ...draft, projects: [...draft.projects, { name: '', skills: [], ...(manual ? { tools: [] } : {}) }] })}>新增專案</button>
      </section>
      <EditableTags missingLabel={missingLabel} label="證照" items={draft.certifications ?? []} onChange={certifications => setDraft({ ...draft, certifications })} />
      <EditableTags missingLabel={missingLabel} label="求職方向" items={draft.careerDirections} onChange={careerDirections => setDraft({ ...draft, careerDirections })} />
    </fieldset>
    {invalid && <div className="resume-error" role="alert">請填寫名稱、每筆工作職稱與專案名稱，或移除空白項目。</div>}
    {error && <div className="resume-error" role="alert">{error}</div>}
    <button className="primary-button" disabled={invalid || saving} onClick={() => void confirm()}>{saving ? '正在確認…' : '確認履歷'} <span>✦</span></button>
  </section>
}
