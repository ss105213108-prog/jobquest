import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import type { ReactElement } from 'react'

// Exercise real component callbacks with deterministic state, without browser acceptance.
const state = vi.hoisted(() => ({ slots: [] as any[], cursor: 0 }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const i = state.cursor++
    if (!(i in state.slots)) state.slots[i] = typeof initial === 'function' ? initial() : initial
    return [state.slots[i], (next: any) => { state.slots[i] = typeof next === 'function' ? next(state.slots[i]) : next }]
  },
}))
import { createEmptyResumeDraft } from '../src/services/manualResumeDraft'
import { ManualResumeEntry } from '../src/components/onboarding/ManualResumeEntry'
import { ResumeReview } from '../src/components/onboarding/ResumeReview'
import { ProfilePage } from '../src/pages/ProfilePage'
import { canConfirmResumeDraft } from '../src/utils/resumeReview'
import { initialLocalAcceptanceState, localAcceptanceReducer } from '../src/hooks/useLocalAcceptance'
import { createConfirmedResumePersistence } from '../src/services/confirmedResumePersistence'
import { confirmResumeDraft } from '../src/utils/resumeReview'
import type { ResumeProfile } from '../src/types'

function nodes(value: any): ReactElement<any>[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!value || typeof value !== 'object' || !('props' in value)) return []
  return [value, ...nodes(value.props.children)]
}
const render = <T,>(run: () => T): T => { state.cursor = 0; return run() }
const reset = () => { state.slots = []; state.cursor = 0 }
beforeEach(reset)

describe('official manual resume entry and unchanged Review handoff', () => {
  it.each(['manual-create', 'confirmed-edit'] as const)('has exactly one optional education input in %s and retains other controls', sourceContext => {
    const html = renderToStaticMarkup(<ResumeReview profile={createEmptyResumeDraft()} sourceContext={sourceContext} onChangeFile={vi.fn()} onConfirm={vi.fn()} />)
    expect(html.match(/<span>學歷（選填）<\/span>/g)).toHaveLength(1)
    for (const field of ['學校', '科系', '畢業狀態']) expect(html).not.toContain(`<span>${field}</span>`)
    expect(html).toContain('不必填寫畢業狀態')
    for (const label of ['新增工作經歷', '新增專案', '加入技能', '加入證照', '加入求職方向']) expect(html).toContain(label)
  })
  it.each(['mock', 'ai-draft'] as const)('retains structured education correction in %s', sourceContext => {
    const html = renderToStaticMarkup(<ResumeReview profile={createEmptyResumeDraft()} sourceContext={sourceContext} onChangeFile={vi.fn()} onConfirm={vi.fn()} />)
    for (const field of ['學校', '科系', '畢業狀態']) expect(html).toContain(`<span>${field}</span>`)
    expect(html).not.toContain('學歷（選填）')
  })
  it('skill-only edits preserve existing structured education through actual Review confirmation', async () => {
    const profile = { ...createEmptyResumeDraft(), name: 'User', education: { school: '', department: 'Existing department', graduationStatus: 'Existing status' } }
    const save = vi.fn(async (_value: ResumeProfile) => {})
    const run = () => ResumeReview({ profile, sourceContext: 'confirmed-edit', onChangeFile: vi.fn(), onConfirm: save })
    const tree = render(run)
    nodes(tree).find(node => node.props.label === '技能')!.props.onChange(['User Skill'])
    nodes(render(run)).find(node => node.props.className === 'primary-button')!.props.onClick()
    await Promise.resolve(); await Promise.resolve()
    expect(save.mock.calls[0][0].education).toEqual(profile.education)
    expect(save.mock.calls[0][0].skills).toEqual(['User Skill'])
  })
  it('saves and restores an education replacement through the real Review and existing persistence controller', async () => {
    const profile = { ...createEmptyResumeDraft(), name: 'User' }
    let saved: ResumeProfile | null = null, local: ResumeProfile | null = null
    const repository = { getCurrent: vi.fn(async () => saved && structuredClone(saved)), upsert: vi.fn(async (_owner: string, value: ResumeProfile) => { saved = structuredClone(value) }) }
    const commit = async (value: ResumeProfile) => { local = value }
    const controller = createConfirmedResumePersistence(commit, vi.fn(), vi.fn(), repository)
    await controller.start('same-owner')
    let pending: Promise<void> | undefined
    const run = () => ResumeReview({ profile, sourceContext: 'manual-create', onChangeFile: vi.fn(), onConfirm: value => pending = controller.confirm(value) })
    nodes(render(run)).find(node => node.type === 'input' && node.props['aria-describedby'])!.props.onChange({ target: { value: '朝陽科技大學 資訊工程系 | 原文' } })
    expect(repository.upsert).not.toHaveBeenCalled()
    nodes(render(run)).find(node => node.props.className === 'primary-button')!.props.onClick()
    await pending
    expect(saved?.education).toEqual({ school: '朝陽科技大學 資訊工程系 | 原文', department: '', graduationStatus: '' })
    local = null
    const restored = createConfirmedResumePersistence(commit, vi.fn(), vi.fn(), repository)
    await restored.start('same-owner')
    expect(local?.education).toEqual(saved?.education)
    expect(local?.id).toBe(profile.id)
    expect(repository.upsert).toHaveBeenCalledTimes(1)
  })
  it('education rewrite shows its consequence, reversion preserves structure, and confirmation uses the exact opaque mapping', async () => {
    const profile = { ...createEmptyResumeDraft(), name: 'User', education: { school: 'Existing school', department: 'Existing department', graduationStatus: 'Existing status' } }
    const save = vi.fn(async (_value: ResumeProfile) => {}), cancel = vi.fn()
    const run = () => ResumeReview({ profile, sourceContext: 'confirmed-edit', onChangeFile: cancel, onConfirm: save })
    const input = () => nodes(render(run)).find(node => node.type === 'input' && node.props['aria-describedby'] === 'resume-education-help')!
    const originalText = input().props.value
    input().props.onChange({ target: { value: '新原文 | 不解析｜2024' } })
    expect(nodes(render(run)).some(node => node.props.role === 'status')).toBe(true)
    expect(save).not.toHaveBeenCalled()
    input().props.onChange({ target: { value: originalText } })
    expect(nodes(render(run)).some(node => node.props.role === 'status')).toBe(false)
    input().props.onChange({ target: { value: '朝陽科技大學 資訊工程系' } })
    nodes(render(run)).find(node => node.props.className === 'primary-button')!.props.onClick()
    await Promise.resolve(); await Promise.resolve()
    expect(save.mock.calls[0][0].education).toEqual({ school: '朝陽科技大學 資訊工程系', department: '', graduationStatus: '' })
    expect(profile.education.department).toBe('Existing department')
  })
  it('cancel does not save an education replacement; failure retains the edited draft and safe retry message', async () => {
    const profile = { ...createEmptyResumeDraft(), name: 'User', education: { school: '', department: 'Original', graduationStatus: '' } }
    const save = vi.fn(async () => { throw new Error('private repository failure') }), cancel = vi.fn()
    const run = () => ResumeReview({ profile, sourceContext: 'confirmed-edit', onChangeFile: cancel, onConfirm: save })
    nodes(render(run)).find(node => node.type === 'input' && node.props['aria-describedby'])!.props.onChange({ target: { value: 'Edited text' } })
    nodes(render(run)).find(node => node.props.className === 'text-button back-button')!.props.onClick()
    expect(cancel).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled()
    nodes(render(run)).find(node => node.props.className === 'primary-button')!.props.onClick()
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(nodes(render(run)).find(node => node.type === 'input' && node.props['aria-describedby'])!.props.value).toBe('Edited text')
    expect(nodes(render(run)).some(node => node.props.children === '目前無法確認履歷，請保留修改內容再試一次。')).toBe(true)
    expect(profile.education.department).toBe('Original')
  })
  it('creates an entirely empty domain profile, without extraction metadata or invented abilities', () => {
    const draft = createEmptyResumeDraft()
    expect(draft).toEqual({ id: expect.any(String), updatedAt: expect.any(String), level: 1,
      name: '', skills: [], education: { school: '', department: '', graduationStatus: '' },
      workExperiences: [], projects: [], certifications: [], careerDirections: [], abilities: [] })
    expect(canConfirmResumeDraft(draft)).toBe(false)
  })
  it('creates isolated drafts with unique ids', () => {
    const a = createEmptyResumeDraft(), b = createEmptyResumeDraft()
    a.skills.push('User supplied'); a.education.school = 'User supplied'
    expect(b.skills).toEqual([]); expect(b.education.school).toBe(''); expect(a.id).not.toBe(b.id)
  })
  it('offers creation without a file input, PDF, Mock or AI wording', () => {
    const html = renderToStaticMarkup(<ManualResumeEntry onComplete={vi.fn()} />)
    expect(html).toContain('建立我的履歷')
    expect(html).not.toMatch(/type="file"|PDF|MOCK|Mock|AI/)
  })
  it('clicking creation opens the existing Review with a stable empty draft and original completion callback', () => {
    const complete = vi.fn(async () => {})
    const run = () => ManualResumeEntry({ onComplete: complete })
    const entry = render(run)
    nodes(entry).find(node => node.type === 'button')!.props.onClick()
    const review = render(run)
    expect(review.type).toBe(ResumeReview)
    expect(review.props.sourceContext).toBe('manual-create')
    expect(review.props.profile.name).toBe('')
    expect(review.props.onConfirm).toBe(complete)
    expect(render(run).props.profile).toBe(review.props.profile)
    expect(complete).not.toHaveBeenCalled()
  })
  it('returning discards only the local draft and creates a fresh draft on the next click', () => {
    const complete = vi.fn(async () => {}), run = () => ManualResumeEntry({ onComplete: complete })
    nodes(render(run)).find(node => node.type === 'button')!.props.onClick()
    const review = render(run), id = review.props.profile.id
    review.props.onChangeFile()
    nodes(render(run)).find(node => node.type === 'button')!.props.onClick()
    expect(render(run).props.profile.id).not.toBe(id)
    expect(complete).not.toHaveBeenCalled()
  })
  it.each(['manual-create', 'confirmed-edit'] as const)('uses truthful %s source copy without changing the editor fields', sourceContext => {
    const html = renderToStaticMarkup(<ResumeReview profile={createEmptyResumeDraft()} sourceContext={sourceContext}
      changeFileLabel="返回" onChangeFile={vi.fn()} onConfirm={vi.fn()} />)
    expect(html).not.toMatch(/MOCK|Mock|PDF|AI|未辨識/)
    expect(html).toContain('未填寫，可手動補充')
    for (const label of ['技能', '學歷（選填）', '工作經歷', '專案', '證照', '求職方向', '確認履歷']) expect(html).toContain(label)
    expect(html).toContain('class="primary-button" disabled=""')
  })
  it('retains Mock default and future AI candidate copy without executing extraction', () => {
    const props = { profile: createEmptyResumeDraft(), onChangeFile: vi.fn(), onConfirm: vi.fn() }
    expect(renderToStaticMarkup(<ResumeReview {...props} />)).toContain('MOCK / DEMO MODE')
    reset()
    expect(renderToStaticMarkup(<ResumeReview {...props} sourceContext="ai-draft" />)).toContain('AI 候選履歷')
  })
  it('edits name through the existing Review and confirms an isolated snapshot through the supplied save callback', async () => {
    const draft = createEmptyResumeDraft(), save = vi.fn(async () => {})
    const run = () => ResumeReview({ profile: draft, sourceContext: 'manual-create', changeFileLabel: '返回', onChangeFile: vi.fn(), onConfirm: save })
    const tree = render(run)
    nodes(tree).find(node => node.type === 'input' && node.props.placeholder === undefined)!.props.onChange({ target: { value: '  User Name  ' } })
    const edited = render(run)
    nodes(edited).find(node => node.type === 'button' && node.props.className === 'primary-button')!.props.onClick()
    await Promise.resolve(); await Promise.resolve()
    expect(save).toHaveBeenCalledTimes(1)
    const confirmed = save.mock.calls[0][0]
    expect(confirmed.name).toBe('User Name'); expect(confirmed.id).toBe(draft.id); expect(draft.name).toBe('')
    expect(initialLocalAcceptanceState.resume).toBeNull()
    expect(localAcceptanceReducer(initialLocalAcceptanceState, { type: 'confirm', resume: confirmed }).resume?.name).toBe('User Name')
  })
  it('existing profile edit reuses its id and Review, updates only on confirmation and supports cancellation', async () => {
    const resume = { ...createEmptyResumeDraft(), name: 'Existing', skills: ['Existing Skill'] }, update = vi.fn(async (_value: typeof resume) => {})
    const run = () => ProfilePage({ resume, onUpdate: update })
    const overview = render(run)
    const html = renderToStaticMarkup(overview)
    expect(html).toContain('編輯我的履歷'); expect(html).not.toContain('PDF')
    nodes(overview).find(node => node.type === 'button')!.props.onClick()
    const review = nodes(render(run)).find(node => node.type === ResumeReview)!
    expect(review.props.profile).toBe(resume); expect(review.props.sourceContext).toBe('confirmed-edit')
    review.props.onChangeFile(); expect(update).not.toHaveBeenCalled()
    nodes(render(run)).find(node => node.type === 'button')!.props.onClick()
    const reopened = nodes(render(run)).find(node => node.type === ResumeReview)!
    await reopened.props.onConfirm({ ...resume, skills: ['Edited Skill'] })
    expect(update).toHaveBeenCalledExactlyOnceWith({ ...resume, skills: ['Edited Skill'] })
    expect(resume.skills).toEqual(['Existing Skill'])
    expect(nodes(render(run)).some(node => node.type === ResumeReview)).toBe(false)
  })
  it('official entry modules do not import or invoke Mock extraction or the legacy PDF entry', () => {
    for (const path of ['src/App.tsx', 'src/pages/ProfilePage.tsx', 'src/components/onboarding/ManualResumeEntry.tsx', 'src/services/manualResumeDraft.ts']) {
      expect(readFileSync(path, 'utf8')).not.toMatch(/mockResumeExtraction|ResumeStep|callAiResumeExtraction|parse-resume-ai/)
    }
  })
  it('manual confirmation saves, restores on a fresh controller and updates the same profile via existing persistence', async () => {
    let saved: ResumeProfile | null = null
    const repository = { getCurrent: vi.fn(async () => saved && structuredClone(saved)),
      upsert: vi.fn(async (_owner: string, profile: ResumeProfile) => { saved = structuredClone(profile) }) }
    let local = structuredClone(initialLocalAcceptanceState)
    const commit = async (profile: ResumeProfile) => { local = localAcceptanceReducer(local, { type: 'confirm', resume: profile }) }
    const first = createConfirmedResumePersistence(commit, vi.fn(), vi.fn(), repository)
    await first.start('existing-owner')
    const draft = createEmptyResumeDraft()
    expect(local.resume).toBeNull(); expect(repository.upsert).not.toHaveBeenCalled()
    const confirmed = confirmResumeDraft({ ...draft, name: 'User entered', skills: ['User Skill'] })
    await first.confirm(confirmed)
    expect(repository.upsert).toHaveBeenCalledExactlyOnceWith('existing-owner', confirmed)
    local = structuredClone(initialLocalAcceptanceState)
    const restored = createConfirmedResumePersistence(commit, vi.fn(), vi.fn(), repository)
    await restored.start('existing-owner')
    expect(local.resume).toEqual(confirmed)
    expect(repository.upsert).toHaveBeenCalledTimes(1)
    const edited = confirmResumeDraft({ ...local.resume!, skills: ['User Edit'] })
    await restored.confirm(edited)
    expect(saved?.id).toBe(draft.id); expect(saved?.skills).toEqual(['User Edit'])
  })
})
