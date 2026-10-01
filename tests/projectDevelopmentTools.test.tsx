import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import type { ResumeProfile, ResumeProject } from '../src/types'

// Same deterministic callback harness as the existing manual editor tests.
// This exercises component handlers without performing browser acceptance.
const state = vi.hoisted(() => ({ slots: [] as any[], cursor: 0 }))
const db = vi.hoisted(() => ({ from: vi.fn(), read: vi.fn(), write: vi.fn(), row: null as any }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const i = state.cursor++
    if (!(i in state.slots)) state.slots[i] = typeof initial === 'function' ? initial() : initial
    return [state.slots[i], (next: any) => { state.slots[i] = typeof next === 'function' ? next(state.slots[i]) : next }]
  },
}))
vi.mock('../src/lib/supabase', () => ({ requireSupabase: () => ({ from: db.from }) }))
import { ResumeReview } from '../src/components/onboarding/ResumeReview'
import { ProfilePage } from '../src/pages/ProfilePage'
import { resumeRepository } from '../src/repositories/resumeRepository'
import { createConfirmedResumePersistence } from '../src/services/confirmedResumePersistence'
import { canConfirmResumeDraft } from '../src/utils/resumeReview'
import { calculateJobMatch, prepareResumeForMatching } from '../src/matching/scoreCalculator'
import { analyzeJobRequirements } from '../src/matching/jobRequirementAnalyzer'
import { mockJobs } from '../src/data/mockJobs'

const description = '原始專案說明\n開發工具 Visual Studio Code、InfinityFree\n使用技術 HTML5｜保留原文與空格  '
const legacy: ResumeProject = { name: 'VTUBER電商', skills: ['HTML5', 'CSS3', 'JavaScript', 'Bootstrap', 'PHP', 'MySQL'], description }
const profile = (projects: ResumeProject[] = [structuredClone(legacy)]): ResumeProfile => ({
  id: 'project-tools-test-only', name: 'Test Candidate', skills: ['JavaScript'], projects,
  education: { school: 'Original School', department: 'Original Department', graduationStatus: '' },
  workExperiences: [], careerDirections: ['前端開發'], certifications: [], level: 1, abilities: [],
  updatedAt: '2026-09-29T00:00:00Z',
})
function nodes(value: any): ReactElement<any>[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!value || typeof value !== 'object' || !('props' in value)) return []
  return [value, ...nodes(value.props.children)]
}
const render = <T,>(run: () => T, offset = 0): T => { state.cursor = offset; return run() }
function editor(original = profile(), save = vi.fn(async (_value: ResumeProfile) => {}), cancel = vi.fn()) {
  const run = () => ResumeReview({ profile: original, sourceContext: 'confirmed-edit', onConfirm: save, onChangeFile: cancel })
  const tree = () => render(run)
  const tags = (index = 0) => nodes(tree()).find(node => node.props.accessibleLabel === `專案 ${index + 1} 開發工具`)!
  const tagTree = (index = 0) => {
    const node = tags(index)
    return render(() => (node.type as any)(node.props), 100 + index * 10)
  }
  const add = (text: string, index = 0) => {
    nodes(tagTree(index)).find(node => node.type === 'input')!.props.onChange({ target: { value: text } })
    nodes(tagTree(index)).find(node => node.type === 'form')!.props.onSubmit({ preventDefault: vi.fn() })
  }
  const remove = (text: string, index = 0) => nodes(tagTree(index)).find(node => node.props['aria-label'] === `移除專案 ${index + 1} 開發工具：${text}`)!.props.onClick()
  const confirm = async () => {
    nodes(tree()).find(node => node.props.className === 'primary-button')!.props.onClick()
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  }
  return { tree, tags, tagTree, add, remove, confirm, save, cancel }
}

beforeEach(() => {
  state.slots = []; state.cursor = 0; db.row = null; vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden in project tools tests') }))
  db.from.mockReturnValue({ select: () => ({ maybeSingle: db.read }), upsert: db.write })
  db.read.mockImplementation(async () => ({ data: structuredClone(db.row), error: null }))
  db.write.mockImplementation(async (saved: any) => { db.row = structuredClone({ ...saved, updated_at: profile().updatedAt }); return { error: null } })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('explicit per-project development tools', () => {
  it('CASE 1: legacy projects remain valid, editable and unparsed without backfill', async () => {
    const original = profile(), e = editor(original)
    expect(canConfirmResumeDraft(original)).toBe(true)
    expect(e.tags().props.items).toEqual([])
    await e.confirm()
    expect(e.save.mock.calls[0][0].projects).toEqual(original.projects)
    expect(e.save.mock.calls[0][0].projects[0]).not.toHaveProperty('tools')
  })
  it('CASE 2: adds explicitly entered tools with the existing trim/duplicate/empty behavior', () => {
    const e = editor()
    e.add('  Visual Studio Code  '); e.add('InfinityFree'); e.add('visual studio code'); e.add('   ')
    expect(e.tags().props.items).toEqual(['Visual Studio Code', 'InfinityFree'])
    expect(nodes(e.tagTree()).find(node => node.type === 'button' && node.props['aria-label'] === '加入專案 1 開發工具')!.props.disabled).toBe(true)
  })
  it('CASE 3: removes an explicit tool without touching the other tool', () => {
    const e = editor()
    e.add('Visual Studio Code'); e.add('InfinityFree'); e.remove('Visual Studio Code')
    expect(e.tags().props.items).toEqual(['InfinityFree'])
  })
  it('CASE 4–5: real Review confirmation, repository write and fresh controller restore retain tools', async () => {
    const original = profile()
    let local: ResumeProfile | null = null
    const commit = vi.fn(async (value: ResumeProfile) => { local = value })
    const first = createConfirmedResumePersistence(commit, vi.fn(), vi.fn())
    await first.start('test-owner')
    let pending: Promise<void> | undefined
    const e = editor(original, vi.fn(async value => { pending = first.confirm(value); await pending }))
    e.add('Visual Studio Code'); e.add('InfinityFree')
    expect(db.write).not.toHaveBeenCalled()
    await e.confirm(); await pending
    expect(db.write).toHaveBeenCalledTimes(1)
    expect(db.write.mock.calls[0][1]).toEqual({ onConflict: 'user_id' })
    expect(db.row.user_id).toBe('test-owner')
    expect(db.row.projects[0].tools).toEqual(['Visual Studio Code', 'InfinityFree'])
    expect(db.row.projects[0].description).toBe(description)
    local = null
    const fresh = createConfirmedResumePersistence(commit, vi.fn(), vi.fn())
    await fresh.start('test-owner')
    expect(local?.projects[0].tools).toEqual(['Visual Studio Code', 'InfinityFree'])
    expect(local?.projects[0].description).toBe(description)
    expect(local?.skills).toEqual(original.skills)
    expect(db.write).toHaveBeenCalledTimes(1) // Reload does not repair-write/backfill.
    expect(fetch).not.toHaveBeenCalled()
  })
  it('CASE 6: two projects retain independent tool arrays through editing and restore', async () => {
    const original = profile([structuredClone(legacy), { name: 'Second', skills: ['React'], description: 'Second text' }])
    const e = editor(original)
    e.add('Visual Studio Code'); e.add('InfinityFree', 1)
    await e.confirm()
    await resumeRepository.upsert('test-owner', e.save.mock.calls[0][0])
    const restored = await resumeRepository.getCurrent()
    expect(restored?.projects.map(project => project.tools)).toEqual([['Visual Studio Code'], ['InfinityFree']])
    expect(original.projects.every(project => project.tools === undefined)).toBe(true)
  })
  it('CASE 7–9: tools edits leave project/global skills and raw description untouched, with no inference', async () => {
    const original = profile(), e = editor(original)
    expect(e.tags().props.items).toEqual([]) // Tool names already occur in legacy text.
    e.add('User supplied name'); e.add('React'); e.remove('React')
    await e.confirm()
    const saved = e.save.mock.calls[0][0]
    expect(saved.projects[0]).toEqual({ ...legacy, tools: ['User supplied name'] })
    expect(saved.skills).toEqual(original.skills)
    expect(saved.education).toEqual(original.education)
    expect(original.projects[0]).toEqual(legacy)
  })
  it('preserves tools when name, technology and description are manually edited', async () => {
    const e = editor(profile([{ ...legacy, tools: ['Explicit Tool'] }]))
    const field = (label: string) => nodes(e.tree()).find(node => node.type === 'label' && nodes(node).some(child => child.type === 'span' && child.props.children === label))!
    nodes(field('專案名稱')).find(node => node.type === 'input')!.props.onChange({ target: { value: 'New name' } })
    nodes(e.tree()).find(node => node.props.accessibleLabel === '專案 1 技術')!.props.onChange(['User Skill'])
    nodes(field('專案說明')).find(node => node.type === 'textarea')!.props.onChange({ target: { value: 'User edited text' } })
    await e.confirm()
    expect(e.save.mock.calls[0][0].projects[0]).toEqual({ name: 'New name', skills: ['User Skill'], tools: ['Explicit Tool'], description: 'User edited text' })
  })
  it('new manual projects initialize separate empty tool lists', () => {
    const e = editor(profile([]))
    const add = () => nodes(e.tree()).find(node => node.type === 'button' && node.props.children === '新增專案')!.props.onClick()
    add(); add(); e.add('First only')
    expect(e.tags().props.items).toEqual(['First only']); expect(e.tags(1).props.items).toEqual([])
    expect(e.tags().props.items).not.toBe(e.tags(1).props.items)
  })
  it('manual project editor presents name, technology, tools and description in order', () => {
    const html = renderToStaticMarkup(<ResumeReview profile={profile()} sourceContext="confirmed-edit" onConfirm={vi.fn()} onChangeFile={vi.fn()} />)
    const positions = ['<span>專案名稱</span>', '<strong>使用技術</strong>', '<strong>開發工具</strong>', '<span>專案說明</span>'].map(text => html.indexOf(text))
    expect(positions.every(position => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })
  it('cancel leaves the source untouched, and failed confirmation retains the tool draft', async () => {
    const original = profile(), save = vi.fn(async () => { throw new Error('private failure') }), e = editor(original, save)
    e.add('Explicit Tool')
    nodes(e.tree()).find(node => node.props.className === 'text-button back-button')!.props.onClick()
    expect(e.cancel).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled()
    await e.confirm()
    expect(e.tags().props.items).toEqual(['Explicit Tool'])
    expect(nodes(e.tree()).some(node => node.props.role === 'alert' && node.props.children === '目前無法確認履歷，請保留修改內容再試一次。')).toBe(true)
    expect(original.projects[0]).not.toHaveProperty('tools')
  })
  it.each(['mock', 'ai-draft'] as const)('CASE 14: %s correction does not expose the new manual tools contract', sourceContext => {
    const html = renderToStaticMarkup(<ResumeReview profile={profile()} sourceContext={sourceContext} onConfirm={vi.fn()} onChangeFile={vi.fn()} />)
    expect(html).not.toContain('aria-label="新增專案 1 開發工具"')
    expect(html).toContain('aria-label="新增專案 1 技術"')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('structured project presentation and backwards compatibility', () => {
  it('CASE 10: projects have separate ordered name, skills, tools and raw description sections', () => {
    const tree = render(() => ProfilePage({ resume: profile([{ ...legacy, tools: ['Visual Studio Code', 'InfinityFree'] }]), onUpdate: vi.fn() }))
    const project = nodes(tree).find(node => node.props.className === 'profile-project')!
    expect(nodes(project).filter(node => node.type === 'h3').map(node => node.props.children)).toEqual(['VTUBER電商'])
    expect(nodes(project).filter(node => node.type === 'dt').map(node => node.props.children)).toEqual(['使用技術', '開發工具', '專案說明'])
    expect(nodes(project).filter(node => node.type === 'dd').map(node => node.props.children)).toEqual([legacy.skills.join('、'), 'Visual Studio Code、InfinityFree', description])
    const html = renderToStaticMarkup(tree)
    expect(html).not.toContain('VTUBER電商｜')
    expect(html).toContain('使用技術 HTML5｜保留原文') // Literal user punctuation remains.
  })
  it.each([undefined, [], [' ', '\n']])('CASE 11: empty tools %j produce no empty tools heading', tools => {
    const html = renderToStaticMarkup(<ProfilePage resume={profile([{ name: 'Legacy name', skills: [], description: ' ', ...(tools === undefined ? {} : { tools }) }])} onUpdate={vi.fn()} />)
    expect(html).toContain('Legacy name')
    expect(html).not.toMatch(/<dt>(使用技術|開發工具|專案說明)<\/dt>/)
  })
  it('CASE 12: changing only tools leaves every full Matching result unchanged across all local jobs', () => {
    const original = profile(), results = (value: ResumeProfile) => mockJobs.map(job => calculateJobMatch(prepareResumeForMatching(value), analyzeJobRequirements(job)))
    const expected = results(original)
    expect(expected.length).toBeGreaterThan(0)
    for (const tools of [[], ['Visual Studio Code', 'InfinityFree'], ['React', 'Python', 'Docker', 'Java']]) {
      expect(results({ ...original, projects: original.projects.map(project => ({ ...project, tools })) })).toEqual(expected)
    }
  })
  it.each([undefined, [], ['Mixed CASE', 'Repeated', 'Repeated', '  literal spaces  ']])('CASE 13: legacy and explicit tools %j round-trip without rewriting values', async tools => {
    const original = profile([{ ...legacy, ...(tools === undefined ? {} : { tools }) }])
    await resumeRepository.upsert('test-owner', original)
    expect(await resumeRepository.getCurrent()).toEqual(original)
    if (tools === undefined) expect(db.row.projects[0]).not.toHaveProperty('tools')
  })
  it.each([null, 'Visual Studio Code', [123], ['Valid Tool', null]])('malformed explicit tools %j fail restore without silent erasure or repair write', async tools => {
    await resumeRepository.upsert('test-owner', profile())
    db.row.projects[0].tools = tools
    db.write.mockClear()
    await expect(resumeRepository.getCurrent()).rejects.toThrow('無法還原專案開發工具資料。')
    const commit = vi.fn(), publish = vi.fn()
    const controller = createConfirmedResumePersistence(commit, vi.fn(), publish)
    await controller.start('test-owner')
    expect(commit).not.toHaveBeenCalled(); expect(db.write).not.toHaveBeenCalled()
    expect(publish).toHaveBeenLastCalledWith({ ownerId: 'test-owner', phase: 'error', operation: 'restore' })
  })
  it('legacy string projects keep their existing restore behavior and never acquire tools', async () => {
    await resumeRepository.upsert('test-owner', profile())
    db.row.projects = ['Visual Studio Code 開發工具 InfinityFree']
    const restored = await resumeRepository.getCurrent()
    expect(restored?.projects[0].name).toBe(db.row.projects[0])
    expect(restored?.projects[0]).not.toHaveProperty('tools')
  })
})
