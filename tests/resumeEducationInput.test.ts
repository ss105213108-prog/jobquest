import { describe, expect, it } from 'vitest'
import { createResumeEducationInput, replacesStructuredEducation, resolveResumeEducationInput } from '../src/utils/resumeEducationInput'
import { createEmptyResumeDraft } from '../src/services/manualResumeDraft'
import { confirmResumeDraft } from '../src/utils/resumeReview'
import { prepareResumeForMatching, calculateJobMatch } from '../src/matching/scoreCalculator'
import { analyzeJobRequirements } from '../src/matching/jobRequirementAnalyzer'
import { mockJobs } from '../src/data/mockJobs'

describe('approved Option A education presentation boundary', () => {
  it('starts empty and remains optional with no example data in the draft', () => {
    const profile = { ...createEmptyResumeDraft(), name: 'User' }
    const input = createResumeEducationInput(profile.education)
    expect(input.initialText).toBe('')
    expect(confirmResumeDraft(profile).education).toEqual({ school: '', department: '', graduationStatus: '' })
  })
  it.each([
    { school: 'School', department: 'Department', graduationStatus: 'Status' },
    { school: '', department: 'Department', graduationStatus: '' },
    { school: '', department: '', graduationStatus: 'Status' },
    { school: 'School | raw delimiter', department: '', graduationStatus: '' },
  ])('preserves original field positions when unchanged, including %j', education => {
    const input = createResumeEducationInput(education)
    expect(resolveResumeEducationInput(input, input.initialText)).toEqual(education)
    expect(resolveResumeEducationInput(input, input.initialText)).not.toBe(input.original)
    expect(replacesStructuredEducation(input, input.initialText)).toBe(false)
  })
  it.each(['朝陽科技大學 資訊工程系', '  原文 | 科系｜畢業 ?  ', '', '2024 degree unknown'])('stores replacement as opaque raw input without inference: %j', text => {
    const input = createResumeEducationInput({ school: 'School', department: 'Department', graduationStatus: 'Status' })
    expect(resolveResumeEducationInput(input, text)).toEqual({ school: text, department: '', graduationStatus: '' })
    expect(replacesStructuredEducation(input, text)).toBe(true)
    expect(resolveResumeEducationInput(input, input.initialText)).toEqual(input.original)
  })
  it('isolates the source, draft and confirmed education objects', () => {
    const original = { school: 'School', department: 'Department', graduationStatus: '' }
    const input = createResumeEducationInput(original)
    original.department = 'Late mutation'
    const result = resolveResumeEducationInput(input, input.initialText)
    result.department = 'Draft mutation'
    expect(input.original.department).toBe('Department')
  })
  it('does not show a richer-data warning when only an opaque school text existed', () => {
    const input = createResumeEducationInput({ school: 'Manual text', department: '', graduationStatus: '' })
    expect(replacesStructuredEducation(input, 'Edited manual text')).toBe(false)
  })
  it('keeps the entire match output unchanged across all existing jobs when only education differs', () => {
    const profile = { ...createEmptyResumeDraft(), name: 'User', skills: ['React'], careerDirections: ['前端工程師'] }
    const input = createResumeEducationInput({ school: 'School', department: 'Department', graduationStatus: 'Status' })
    const matches = (education: typeof profile.education) => mockJobs.map(job => calculateJobMatch(prepareResumeForMatching({ ...profile, education }), analyzeJobRequirements(job)))
    expect(matches(resolveResumeEducationInput(input, '朝陽科技大學 資訊工程系'))).toEqual(matches(input.original))
    expect(matches(resolveResumeEducationInput(input, ''))).toEqual(matches(input.original))
  })
})
