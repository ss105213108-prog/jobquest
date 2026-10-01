import { describe, expect, it } from 'vitest'
import { scenario } from './helpers/structuredResumeAnalyzerContractHarness'
import { createResumeAnalysisView } from '../src/parsers/resumeStructuredAnalysis'
import { detectStructuredResumeSections } from '../src/parsers/structuredResumeSections'
import { analyzeStructuredWork, analyzeStructuredEducation, analyzeStructuredProjects,
  analyzeStructuredProfileFields } from '../src/parsers/structuredResumeDomains'

describe('RP-109 structured domain foundation', () => {
  it('consumes production section references and keeps labeled work state across pages', () => {
    const input = scenario([['Experience\nCompany: Orbit Company\nTitle: Frontend Engineer'], ['2020 - 2022']])
    const view = createResumeAnalysisView(input)
    const sections = detectStructuredResumeSections(input, view)
    expect(analyzeStructuredWork(input, view, sections)).toEqual([
      { company: 'Orbit Company', title: 'Frontend Engineer', startDate: '2020', endDate: '2022' },
    ])
  })

  it('uses education fallback only within one authoritative source-line window', () => {
    for (const [pages, expected] of [
      [[['Intro\nExample University\nComputer Science\nGraduated']], { school: 'Example University', department: 'Computer Science', graduationStatus: '畢業' }],
      [[['Example University', 'Computer Science', 'Graduated']], { school: '', department: '', graduationStatus: '' }],
    ] as const) {
      const input = scenario(pages)
      const view = createResumeAnalysisView(input)
      expect(analyzeStructuredEducation(input, view, detectStructuredResumeSections(input, view))).toEqual(expected)
    }
  })

  it('carries labeled project state across pages but does not infer an unlabeled project', () => {
    const input = scenario([['Projects', 'Project name: Atlas'], ['Technologies: React', 'Description: Task board']])
    const view = createResumeAnalysisView(input)
    expect(analyzeStructuredProjects(input, view, detectStructuredResumeSections(input, view))).toEqual([
      { name: 'Atlas', skills: ['React'], description: 'Task board' },
    ])
    const unsupported = scenario([['Projects', 'Atlas', 'React']])
    const otherView = createResumeAnalysisView(unsupported)
    expect(analyzeStructuredProjects(unsupported, otherView, detectStructuredResumeSections(unsupported, otherView))).toEqual([])
  })

  it('folds dictionary skills and career signals without manufacturing token boundaries', () => {
    const input = scenario([['Avery Stone\nSkills\nHTML CSS React Python Django\nbackend data analytics Pandas NumPy']])
    const view = createResumeAnalysisView(input)
    const fields = analyzeStructuredProfileFields(input, view, detectStructuredResumeSections(input, view))
    expect(fields.name).toBe('Avery Stone')
    expect(fields.careerDirections).toEqual(['前端開發', '後端開發', '資料應用'])
    const split = scenario([['Java', 'Script', 'REST', 'API']])
    const otherView = createResumeAnalysisView(split)
    expect(analyzeStructuredProfileFields(split, otherView, detectStructuredResumeSections(split, otherView)).skills).toEqual([])
  })
})
