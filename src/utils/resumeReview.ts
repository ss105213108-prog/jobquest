import type { ResumeProfile } from '../types'

export function canConfirmResumeDraft(draft: ResumeProfile): boolean {
  return Boolean(draft.name.trim())
    && draft.workExperiences.every(item => Boolean(item.title.trim()))
    && draft.projects.every(item => Boolean(item.name.trim()))
}

export function confirmResumeDraft(draft: ResumeProfile): ResumeProfile {
  if (!canConfirmResumeDraft(draft)) throw new Error('請填寫名稱、每筆工作職稱與專案名稱，或移除空白項目。')
  return structuredClone({ ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() })
}
