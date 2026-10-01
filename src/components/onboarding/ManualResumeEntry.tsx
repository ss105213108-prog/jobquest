import { useState } from 'react'
import type { ResumeProfile } from '../../types'
import { createEmptyResumeDraft } from '../../services/manualResumeDraft'
import { ResumeReview } from './ResumeReview'

export function ManualResumeEntry({ onComplete }: { onComplete: (profile: ResumeProfile) => Promise<void> }) {
  const [draft, setDraft] = useState<ResumeProfile | null>(null)
  if (draft) return <ResumeReview profile={draft} sourceContext="manual-create" changeFileLabel="返回"
    onChangeFile={() => setDraft(null)} onConfirm={onComplete} />
  return <section className="onboarding-card">
    <div className="step-kicker">ADVENTURER RECORD</div>
    <h1>建立我的履歷</h1>
    <p>填寫履歷資料並確認後，即可用於職缺匹配。草稿尚未確認，不會保存。</p>
    <button className="primary-button" onClick={() => setDraft(createEmptyResumeDraft())}>建立我的履歷 <span>✦</span></button>
  </section>
}
