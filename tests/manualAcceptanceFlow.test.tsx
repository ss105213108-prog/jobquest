import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import App from '../src/App'
import { ResumeReview } from '../src/components/onboarding/ResumeReview'
import { mockResumeExtraction, validateMockResumeSelection } from '../src/services/mockResumeExtraction'
import { searchLocalJobs } from '../src/services/localJobService'
import { matchingService } from '../src/services/matchingService'
import { jobService } from '../src/services/jobService'
import { initialLocalAcceptanceState, localAcceptanceReducer } from '../src/hooks/useLocalAcceptance'
import { AuthContext } from '../src/hooks/useAuth'
import { createProductionAuthIntegration } from '../src/services/authIntegration'

const file = () => new File(['synthetic selection only'], 'synthetic.pdf', { type: 'application/pdf' })
const preferences = { source: '104' as const, keyword: '', location: '全部地區', sortBy: 'match-desc' as const }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden') }))
  vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, location: { search: '' } })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('manual acceptance local adapters and confirmation state', () => {
  it('returns the existing profile with all six editable domain areas populated', async () => {
    const profile = await mockResumeExtraction(file())
    expect(profile.skills.length).toBeGreaterThan(0)
    expect(profile.education.school).toBe('Demo University')
    expect(profile.workExperiences[0].title).toBe('Frontend Engineer')
    expect(profile.projects[0].skills.length).toBeGreaterThan(0)
    expect(profile.certifications).toEqual(['DEMO Web Foundations Certificate'])
    expect(profile.careerDirections.length).toBeGreaterThan(0)
    expect(profile.parseMetadata).toBeUndefined()
  })
  it('never reads, slices, parses or transmits the selected file', async () => {
    const selected = file()
    const readers = ['arrayBuffer', 'text', 'stream', 'slice'] as const
    const spies = readers.map(method => vi.spyOn(selected, method))
    await mockResumeExtraction(selected)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('does not use the filename or payload as extracted profile content', async () => {
    const a = await mockResumeExtraction(file())
    const b = await mockResumeExtraction(new File(['different bytes'], 'other.pdf'))
    expect({ ...a, id: '', updatedAt: '' }).toEqual({ ...b, id: '', updatedAt: '' })
  })
  it.each([
    ['not.pdf', 'text/plain', 'x'], ['not.docx', '', 'x'], ['empty.pdf', 'application/pdf', ''],
  ])('rejects an unsupported/empty selection %s', (name, type, content) => {
    expect(() => validateMockResumeSelection(new File([content], name, { type }))).toThrow()
  })
  it('accepts the size boundary and rejects only selections beyond it', () => {
    const atLimit = new File([new Uint8Array(10 * 1024 * 1024)], 'synthetic.pdf')
    expect(() => validateMockResumeSelection(atLimit)).not.toThrow()
    expect(() => validateMockResumeSelection(new File([new Uint8Array(atLimit.size + 1)], 'synthetic.pdf'))).toThrow()
  })
  it('returns isolated synthetic objects for independent attempts', async () => {
    const first = await mockResumeExtraction(file()), second = await mockResumeExtraction(file())
    first.skills.length = 0; first.education.school = 'Edited'
    expect(second.skills.length).toBeGreaterThan(0)
    expect(second.education.school).toBe('Demo University')
    expect(first.id).not.toBe(second.id)
  })
  it('keeps matching gated until explicit confirmation', async () => {
    await mockResumeExtraction(file())
    expect(initialLocalAcceptanceState.resume).toBeNull()
    // Preserve the original SSR state: Auth restoration is pending, with no user.
    // Do not start the controller or make session/identity requests in this business-flow test.
    const controller = createProductionAuthIntegration()
    const snapshot = controller.getSnapshot()
    const html = renderToStaticMarkup(
      <AuthContext.Provider value={{ ...snapshot, authenticated: Boolean(snapshot.user), retry: controller.retry, controller }}>
        <App />
      </AuthContext.Provider>,
    )
    expect(html).toContain('正在初始化公會身份')
    expect(html).toContain('class="resume-upload-flow" hidden=""')
    expect(html).not.toContain('產生 Mock Extraction')
    expect(html).not.toContain('職缺任務佈告欄')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('retains edited data and snapshots it independently from the draft', async () => {
    const draft = await mockResumeExtraction(file())
    draft.skills = ['Custom Skill']; draft.education.department = 'Edited Department'
    draft.workExperiences[0].description = 'Edited experience'; draft.projects[0].description = 'Edited project'
    draft.certifications = ['Edited Certificate']; draft.careerDirections = ['Edited Direction']
    const state = localAcceptanceReducer(initialLocalAcceptanceState, { type: 'confirm', resume: draft })
    expect(state.resume).toEqual(draft)
    draft.skills.push('Late mutation'); draft.projects[0].description = 'Late mutation'
    expect(state.resume?.skills).toEqual(['Custom Skill'])
    expect(state.resume?.projects[0].description).toBe('Edited project')
  })
  it('refuses blank confirmation and resets to the unconfirmed state', async () => {
    const draft = await mockResumeExtraction(file())
    expect(() => localAcceptanceReducer(initialLocalAcceptanceState, { type: 'confirm', resume: { ...draft, name: ' ' } })).toThrow()
    const confirmed = localAcceptanceReducer(initialLocalAcceptanceState, { type: 'confirm', resume: draft })
    expect(localAcceptanceReducer(confirmed, { type: 'reset' }).resume).toBeNull()
  })
  it('exposes structured review fields and explicit confirmation without cloud copy', async () => {
    const profile = await mockResumeExtraction(file())
    const html = renderToStaticMarkup(<ResumeReview profile={profile} onConfirm={async () => {}} onChangeFile={() => {}} />)
    for (const label of ['技能', '學校', '工作經歷', '專案', '證照', '求職方向', '確認履歷']) expect(html).toContain(label)
    expect(html).toContain('Demo University')
    expect(html).toContain('Frontend Engineer')
    expect(html).not.toContain('確認並儲存')
  })
  it('allows older profiles with no certificates and keeps empty-name confirmation disabled', async () => {
    const profile = await mockResumeExtraction(file())
    delete profile.certifications; profile.name = ''
    const html = renderToStaticMarkup(<ResumeReview profile={profile} onConfirm={async () => {}} onChangeFile={() => {}} />)
    expect(html).toContain('請填寫名稱')
    expect(html).toContain('class="primary-button" disabled=""')
  })
  it('uses only local source-scoped fixtures and returns independent copies', async () => {
    const jobs = await searchLocalJobs(preferences)
    expect(jobs.length).toBeGreaterThan(0)
    expect(jobs.every(job => job.source === '104' && job.externalId.startsWith('mock-'))).toBe(true)
    jobs[0].requiredSkills.length = 0
    expect((await searchLocalJobs(preferences))[0].requiredSkills.length).toBeGreaterThan(0)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('filters fixtures without changing the formal 104 service boundary', async () => {
    const jobs = await searchLocalJobs({ ...preferences, keyword: 'React', location: '新竹市' })
    expect(jobs.every(job => job.location === '新竹市')).toBe(true)
    expect((await searchLocalJobs({ ...preferences, keyword: 'missing-synthetic-job' }))).toEqual([])
    await expect(jobService.searchJobs(preferences)).rejects.toThrow('104 正式職缺不使用 Mock fallback')
  })
  it('feeds the edited confirmed profile to the unchanged matching engine', async () => {
    vi.useFakeTimers()
    const draft = await mockResumeExtraction(file())
    draft.skills = ['Python']; draft.projects = []; draft.careerDirections = ['資料工程']
    const state = localAcceptanceReducer(initialLocalAcceptanceState, { type: 'confirm', resume: draft })
    const jobs = await searchLocalJobs(preferences)
    const promise = matchingService.matchJobs(state.resume, jobs)
    await vi.runAllTimersAsync()
    const matched = await promise
    const reactJob = matched.find(item => item.job.id === '104-03')!
    expect(reactJob.match.matchedSkills).not.toContain('React')
    expect(reactJob.match.missingSkills).toContain('React')
    expect(matched.every(item => Number.isFinite(item.match.matchScore) && ['S', 'A', 'B', 'C', 'D'].includes(item.match.matchLevel))).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('keeps job actions in memory and preserves applied/rejected exclusivity', () => {
    const favorite = localAcceptanceReducer(initialLocalAcceptanceState, { type: 'status', jobId: '104-03', status: 'favorite' })
    const applied = localAcceptanceReducer(favorite, { type: 'status', jobId: '104-03', status: 'applied' })
    const rejected = localAcceptanceReducer(applied, { type: 'status', jobId: '104-03', status: 'rejected' })
    expect(rejected.statuses['104-03']).toEqual(['favorite', 'rejected'])
    expect(localAcceptanceReducer(rejected, { type: 'status', jobId: '104-03', status: 'favorite' }).statuses['104-03']).toEqual(['rejected'])
  })
})
