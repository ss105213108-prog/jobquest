import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResumeReview } from '../src/components/onboarding/ResumeReview'
import { ResumeStep } from '../src/components/onboarding/ResumeStep'
import { mockIncompleteResumeExtraction, mockResumeExtraction } from '../src/services/mockResumeExtraction'
import { canConfirmResumeDraft, confirmResumeDraft } from '../src/utils/resumeReview'
import { initialLocalAcceptanceState, localAcceptanceReducer } from '../src/hooks/useLocalAcceptance'
import { searchLocalJobs } from '../src/services/localJobService'
import { matchingService } from '../src/services/matchingService'
import type { ResumeProfile } from '../src/types'

const selection = () => new File(['anonymous selection'], 'synthetic.pdf', { type: 'application/pdf' })
const review = (profile: ResumeProfile) => renderToStaticMarkup(
  <ResumeReview profile={profile} onConfirm={async () => {}} onChangeFile={() => {}} />,
)

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden') }))
  vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, location: { search: '' } })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('incomplete extraction remains an editable draft', () => {
  it('offers explicit complete and incomplete scenarios, defaulting to complete', () => {
    const html = renderToStaticMarkup(<ResumeStep onComplete={async () => {}} />)
    expect(html).toContain('Mock 草稿情境')
    expect(html).toContain('checked=""/>完整草稿')
    expect(html).toContain('/>缺漏草稿')
    expect(html).toContain('不分析 PDF 內容')
  })
  it('leaves deliberately missing facts absent without changing the complete adapter', async () => {
    const incomplete = await mockIncompleteResumeExtraction(selection())
    const complete = await mockResumeExtraction(selection())
    expect(incomplete.certifications).toEqual([])
    expect(incomplete.education).toEqual({ school: '', department: '', graduationStatus: '' })
    expect(incomplete.workExperiences).toEqual([{ title: 'Frontend Engineer' }])
    expect(incomplete.projects).toEqual([{ name: 'Demo Quest Board', skills: [] }])
    expect(complete.certifications?.length).toBe(1)
    expect(complete.workExperiences[0].company).toBe('Demo Studio')
    expect(complete.projects[0].skills).toContain('React')
    expect(incomplete).not.toHaveProperty('scenario')
    expect(incomplete).not.toHaveProperty('mock')
  })
  it('does not read or transmit files in the incomplete adapter', async () => {
    const file = selection()
    const spies = (['arrayBuffer', 'text', 'stream', 'slice'] as const).map(method => vi.spyOn(file, method))
    await mockIncompleteResumeExtraction(file)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    await expect(mockIncompleteResumeExtraction(new File(['x'], 'unsupported.docx'))).rejects.toThrow()
  })
  it('renders blank optional fields, empty-list hints and a truthful draft notice', async () => {
    const html = review(await mockIncompleteResumeExtraction(selection()))
    expect(html).toContain('DRAFT')
    expect(html).toContain('僅為草稿')
    expect(html).toContain('並非 PDF 的實際 AI 分析結果')
    expect(html).toContain('未辨識，可手動補充')
    expect(html).toContain('placeholder="未辨識，可手動補充" value=""')
    expect(html).not.toContain('Demo Studio')
    expect(html).not.toContain('DEMO Web Foundations Certificate')
    expect(html).not.toContain('class="primary-button" disabled=""')
    expect(html).not.toContain('required=""')
  })
  it('keeps a draft out of confirmed state until the confirmation action', async () => {
    const draft = await mockIncompleteResumeExtraction(selection())
    expect(initialLocalAcceptanceState.resume).toBeNull()
    review(draft)
    expect(initialLocalAcceptanceState.resume).toBeNull()
    const snapshot = confirmResumeDraft(draft)
    const confirmed = localAcceptanceReducer(initialLocalAcceptanceState, { type: 'confirm', resume: snapshot })
    expect(confirmed.resume).toEqual({ ...draft, updatedAt: snapshot.updatedAt })
  })
  it('exposes existing add/delete controls for every editable collection', async () => {
    const html = review(await mockResumeExtraction(selection()))
    for (const label of ['加入技能', '移除技能：React', '新增工作經歷', '移除工作經歷 1',
      '新增專案', '移除專案 1', '加入專案 1 技術', '移除專案 1 技術：React',
      '加入證照', '移除證照：DEMO Web Foundations Certificate', '加入求職方向', '移除求職方向：前端開發']) {
      expect(html).toContain(label)
    }
    for (const label of ['學校', '科系', '畢業狀態', '公司', '職稱', '工作內容', '專案名稱', '專案說明']) {
      expect(html).toContain(`<span>${label}</span>`)
    }
  })
  it('accepts completely empty optional areas and preserves them without guessing', async () => {
    const draft = await mockIncompleteResumeExtraction(selection())
    draft.skills = []; draft.workExperiences = []; draft.projects = []; draft.careerDirections = []
    const html = review(draft)
    expect(html).not.toContain('class="primary-button" disabled=""')
    expect(html.match(/class="review-missing"/g)).toHaveLength(5)
    expect(canConfirmResumeDraft(draft)).toBe(true)
    const snapshot = confirmResumeDraft(draft)
    expect(snapshot).toEqual({ ...draft, updatedAt: snapshot.updatedAt })
  })
  it('supports legacy profiles with absent certificates without creating a certificate', async () => {
    const draft = await mockIncompleteResumeExtraction(selection())
    delete draft.certifications
    expect(review(draft)).toContain('新增證照')
    expect(confirmResumeDraft(draft).certifications).toBeUndefined()
  })
  it.each(['name', 'title', 'project'] as const)('preserves the existing required %s boundary only', async field => {
    const draft = await mockIncompleteResumeExtraction(selection())
    if (field === 'name') draft.name = ' '
    if (field === 'title') draft.workExperiences[0].title = ' '
    if (field === 'project') draft.projects[0].name = ' '
    expect(canConfirmResumeDraft(draft)).toBe(false)
    expect(() => confirmResumeDraft(draft)).toThrow()
    expect(review(draft)).toContain('class="primary-button" disabled=""')
  })
})

describe('confirmation snapshots the current formal profile, not the extraction object', () => {
  it('retains edits, additions and deletions across all areas in an independent snapshot', async () => {
    const original = await mockIncompleteResumeExtraction(selection())
    const draft = structuredClone(original)
    draft.name = '  Reviewed Candidate  '
    draft.skills = draft.skills.filter(skill => skill !== 'React'); draft.skills.push('Python')
    draft.education = { school: 'Synthetic School', department: 'Synthetic Department', graduationStatus: '' }
    draft.workExperiences[0] = { ...draft.workExperiences[0], company: 'Synthetic Studio', description: 'Edited' }
    draft.workExperiences.push({ title: 'Temporary entry' }, { title: 'Added Role', location: '台中市' })
    draft.workExperiences.splice(1, 1)
    draft.projects[0].description = 'Edited project'; draft.projects[0].skills = ['Python', 'Git']
    draft.projects[0].skills = draft.projects[0].skills.filter(skill => skill !== 'Git')
    draft.projects.push({ name: 'Temporary project', skills: [] }, { name: 'Added Project', skills: [] })
    draft.projects.splice(1, 1)
    draft.certifications = ['Temporary certificate', 'Added Certificate']; draft.certifications.shift()
    draft.careerDirections = ['Temporary direction', '資料工程']; draft.careerDirections.shift()
    const expected = structuredClone({ ...draft, name: 'Reviewed Candidate' })
    const snapshot = confirmResumeDraft(draft)
    const state = localAcceptanceReducer(initialLocalAcceptanceState, { type: 'confirm', resume: snapshot })
    expect(state.resume).toEqual({ ...expected, updatedAt: snapshot.updatedAt })
    expect(original.certifications).toEqual([])
    expect(original.workExperiences[0].company).toBeUndefined()
    expect(original.skills).toContain('React')
    draft.education.school = 'Late'; draft.projects[0].skills.push('Late'); snapshot.certifications?.push('Late')
    expect(state.resume?.education.school).toBe('Synthetic School')
    expect(state.resume?.projects[0].skills).toEqual(['Python'])
    expect(state.resume?.certifications).toEqual(['Added Certificate'])
  })
  it('uses no Demo identity or fixed mock value as a confirmation condition', () => {
    const profile: ResumeProfile = {
      id: 'synthetic-contract', name: 'Synthetic Candidate', skills: [], education: { school: '', department: '', graduationStatus: '' },
      workExperiences: [{ title: 'Synthetic Role' }], projects: [{ name: 'Synthetic Project', skills: [] }],
      certifications: [], careerDirections: [], updatedAt: '2000-01-01T00:00:00.000Z', level: 0, abilities: [],
    }
    expect(canConfirmResumeDraft(profile)).toBe(true)
    expect(review(profile)).toContain('Synthetic Role')
    expect(review(profile)).not.toContain('Demo Adventurer')
    const result = confirmResumeDraft(profile)
    expect(result.name).toBe(profile.name)
    expect(result.updatedAt).not.toBe(profile.updatedAt)
    expect(profile.updatedAt).toBe('2000-01-01T00:00:00.000Z')
  })
  it('keeps deleted skills absent from matching even when projects still mention them', async () => {
    vi.useFakeTimers()
    const draft = await mockResumeExtraction(selection())
    draft.skills = draft.skills.filter(skill => skill !== 'React')
    expect(draft.projects[0].skills).toContain('React')
    const state = localAcceptanceReducer(initialLocalAcceptanceState, { type: 'confirm', resume: confirmResumeDraft(draft) })
    const jobs = await searchLocalJobs({ source: '104', keyword: '', location: '全部地區', sortBy: 'match-desc' })
    const promise = matchingService.matchJobs(state.resume, jobs)
    await vi.runAllTimersAsync()
    const results = await promise
    const reactJob = results.find(result => result.job.id === '104-03')!
    expect(reactJob.match.matchedSkills).not.toContain('React')
    expect(reactJob.match.missingSkills).toContain('React')
    expect(fetch).not.toHaveBeenCalled()
  })
})
