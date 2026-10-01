import { describe, expect, it } from 'vitest'
import { scenario } from './helpers/structuredResumeAnalyzerContractHarness'
import { createResumeAnalysisView, localAnalysisText, normalizationOperations, projectResumeAnalysisDiagnostic,
  resumeAnalysisIssues, sourceReferenceIssues, type ResumeAnalysisDocument, type SourceRef } from '../src/parsers/resumeStructuredAnalysis'
import { detectStructuredResumeSections, projectStructuredSectionDiagnostic, structuredSectionIssues,
  type StructuredResumeSections } from '../src/parsers/structuredResumeSections'

describe('RP-108 source-bound production validators', () => {
  it('validates literal source ranges and separately preserved CRLF metadata', () => {
    const input = scenario([['Intro\r\nSkills\r\nReact']])
    const view = createResumeAnalysisView(input)
    expect(view.segments.map(({ rawText, sourceRef }) => [rawText, sourceRef.rawStart, sourceRef.rawEnd]))
      .toEqual([['Intro', 0, 5], ['Skills', 7, 13], ['React', 15, 20]])
    expect(view.breaks.map(({ spelling, analysisSpelling, sourceRef }) => [spelling, analysisSpelling, sourceRef.rawStart, sourceRef.rawEnd]))
      .toEqual([['\r\n', '\n', 5, 7], ['\r\n', '\n', 13, 15]])
    expect(resumeAnalysisIssues(input, view)).toEqual([])
    for (const record of [...view.segments, ...view.breaks]) expect(sourceReferenceIssues(input, record.sourceRef)).toEqual([])
    const sections = detectStructuredResumeSections(input, view)
    expect(structuredSectionIssues(input, view, sections)).toEqual([])
    expect(sections.sections.skills?.[0].sourceRef).toEqual({ pageNumber: 1, unitIndex: 0,
      groupId: 'anonymous:0', runId: 0, rawStart: 15, rawEnd: 20 })
  })

  it.each([
    ['negative offset', { rawStart: -1 }],
    ['reversed range', { rawStart: 2, rawEnd: 1 }],
    ['out-of-source range', { rawEnd: 99 }],
    ['fractional offset', { rawStart: 0.5 }],
    ['missing page', { pageNumber: 2 }],
    ['wrong unit', { unitIndex: 1 }],
    ['wrong group', { groupId: 'other' }],
    ['wrong run', { runId: 1 }],
    ['CRLF start split', { rawStart: 2, rawEnd: 3 }],
    ['CRLF end split', { rawStart: 0, rawEnd: 2 }],
    ['extra field', { text: 'private@example.invalid' }],
  ] as const)('rejects %s in a source reference', (_, change) => {
    const input = scenario([['A\r\nB']])
    const ref: SourceRef = createResumeAnalysisView(input).segments[0].sourceRef
    expect(sourceReferenceIssues(input, { ...ref, ...change })).toEqual(['INVALID_SOURCE_REFERENCE'])
  })

  it.each([
    ['fabricated raw text', (view: ResumeAnalysisDocument) => { view.segments[0].rawText = 'Changed' }],
    ['fabricated comparison', (view: ResumeAnalysisDocument) => { view.segments[0].analysisText = 'Changed' }],
    ['invented edge authority', (view: ResumeAnalysisDocument) => { view.segments[0].leading = 'UNIT_EDGE' }],
    ['forged complete line', (view: ResumeAnalysisDocument) => { view.segments[0].completeLine = false }],
    ['dropped slice', (view: ResumeAnalysisDocument) => { view.segments.pop() }],
    ['duplicated slice', (view: ResumeAnalysisDocument) => { view.segments.push(structuredClone(view.segments[0])) }],
    ['reordered slices', (view: ResumeAnalysisDocument) => { view.segments.reverse() }],
    ['overlapping range', (view: ResumeAnalysisDocument) => { view.segments[1].sourceRef.rawStart = 0 }],
    ['wrong page traversal', (view: ResumeAnalysisDocument) => { view.pages[0].segmentOrdinals.reverse() }],
    ['reordered events', (view: ResumeAnalysisDocument) => { view.events.reverse() }],
    ['missing break', (view: ResumeAnalysisDocument) => { view.breaks.pop() }],
    ['CRLF metadata split', (view: ResumeAnalysisDocument) => { view.breaks[0].sourceRef.rawEnd -= 1 }],
    ['break spelling rewrite', (view: ResumeAnalysisDocument) => { view.breaks[0].spelling = '\n' }],
    ['sparse segments', (view: ResumeAnalysisDocument) => { delete view.segments[0] }],
  ] as const)('rejects %s instead of trusting derived records', (_, mutate) => {
    const input = scenario([['Intro\r\nSkills\r\nReact']])
    const view = structuredClone(createResumeAnalysisView(input))
    mutate(view)
    expect(resumeAnalysisIssues(input, view)).toEqual(['INVALID_ANALYSIS_STRUCTURE'])
    expect(() => detectStructuredResumeSections(input, view)).toThrow('INVALID_ANALYSIS_STRUCTURE')
    expect(projectResumeAnalysisDiagnostic(input, view)).toEqual({ code: 'INVALID_ANALYSIS_STRUCTURE' })
  })

  it.each([
    ['foreign heading ref', (sections: StructuredResumeSections) => { sections.occurrences[0].heading.sourceRef.unitIndex = 4 }],
    ['out-of-source body', (sections: StructuredResumeSections) => { sections.sections.skills![0].sourceRef.rawEnd = 999 }],
    ['dropped occurrence', (sections: StructuredResumeSections) => { sections.occurrences.pop() }],
    ['wrong key order', (sections: StructuredResumeSections) => { sections.detectedKeys.reverse() }],
    ['duplicated key', (sections: StructuredResumeSections) => { sections.detectedKeys.push('skills') }],
    ['reordered body', (sections: StructuredResumeSections) => { sections.sections.skills!.reverse() }],
    ['fabricated preamble', (sections: StructuredResumeSections) => { sections.preamble[0].rawText = 'Changed' }],
  ] as const)('rejects %s in section output', (_, mutate) => {
    const input = scenario([['Intro\nSkills\nReact\nTypeScript\nEducation\nSchool']])
    const view = createResumeAnalysisView(input)
    const sections = structuredClone(detectStructuredResumeSections(input, view))
    mutate(sections)
    expect(structuredSectionIssues(input, view, sections)).toEqual(['INVALID_SECTION_STRUCTURE'])
    expect(projectStructuredSectionDiagnostic(input, view, sections)).toEqual({ code: 'INVALID_SECTION_STRUCTURE' })
  })

  it('rejects a derived view and references when source correspondence changes', () => {
    const input = scenario([['Skills\nReact']])
    const view = createResumeAnalysisView(input)
    const changed = { ...input, serialized: scenario([['Skills\nOther']]).serialized }
    expect(resumeAnalysisIssues(changed, view)).toEqual(['INVALID_SOURCE_DOCUMENT'])
    expect(sourceReferenceIssues(changed, view.segments[0].sourceRef)).toEqual(['INVALID_SOURCE_DOCUMENT'])
  })

  it('validates a deliberately disabled safe comparison plan without making it the section default', () => {
    const input = scenario([[' Skills\t : React ']])
    const view = createResumeAnalysisView(input, undefined, [])
    expect(resumeAnalysisIssues(input, view, [])).toEqual([])
    expect(resumeAnalysisIssues(input, view)).toEqual(['INVALID_ANALYSIS_STRUCTURE'])
  })
})

describe('RP-108 completeness, isolation and diagnostics', () => {
  it('does not grant heading authority to authored fragments at opaque unit edges', () => {
    const input = scenario([['Intro\nSkills', 'React']])
    const view = createResumeAnalysisView(input)
    expect(view.segments[1]).toMatchObject({ rawText: 'Skills', authoredLine: true, completeLine: false, trailing: 'UNIT_EDGE' })
    expect(detectStructuredResumeSections(input, view).detectedKeys).toEqual([])
    const leading = scenario([['Intro', 'Skills\nReact']])
    expect(detectStructuredResumeSections(leading).detectedKeys).toEqual([])
  })

  it('does not grant heading authority to authored fragments at opaque page edges', () => {
    expect(detectStructuredResumeSections(scenario([['Intro\nSkills'], ['React']])).detectedKeys).toEqual([])
    expect(detectStructuredResumeSections(scenario([['Intro'], ['Skills\nReact']])).detectedKeys).toEqual([])
  })

  it('retains complete internal lines and the distinct bounded whole-unit candidate', () => {
    expect(detectStructuredResumeSections(scenario([['Intro', 'Prefix\nSkills\nReact']])).detectedKeys).toEqual(['skills'])
    const input = scenario([['Skills', 'React']])
    const view = createResumeAnalysisView(input)
    expect(view.segments[0]).toMatchObject({ authoredLine: false, completeLine: false })
    expect(detectStructuredResumeSections(input, view).detectedKeys).toEqual(['skills'])
  })

  it('does not invent break semantics for unapproved separator characters', () => {
    const raw = 'A\u2028Skills\u2029B\fC'
    const view = createResumeAnalysisView(scenario([[raw]]))
    expect(view.breaks).toEqual([])
    expect(view.segments).toHaveLength(1)
    expect(view.segments[0]).toMatchObject({ rawText: raw, analysisText: raw, authoredLine: false })
  })

  it('freezes the classification registry and rejects sparse or unknown normalization plans', () => {
    expect(Object.isFrozen(normalizationOperations)).toBe(true)
    for (const operation of normalizationOperations) expect(Object.isFrozen(operation)).toBe(true)
    expect(() => localAnalysisText('A', new Array<string>(1))).toThrow('NORMALIZATION_NOT_APPROVED')
    expect(() => localAnalysisText('A', ['NFKC'])).toThrow('NORMALIZATION_NOT_APPROVED')
    expect(() => localAnalysisText('A', ['LINE_JOIN'])).toThrow('NORMALIZATION_NOT_APPROVED')
  })

  it('applies approved line-ending comparison locally without changing raw source', () => {
    const raw = ' A\r\nB\rC\t D '
    expect(localAnalysisText(raw, ['LINE_ENDINGS'])).toBe(' A\nB\nC\t D ')
    expect(localAnalysisText(raw, [])).toBe(raw)
    expect(raw).toBe(' A\r\nB\rC\t D ')
  })

  it('does not mutate frozen source or view while validating and deriving sections', () => {
    const input = scenario([['Intro\nSkills: React']])
    const view = createResumeAnalysisView(input)
    const before = structuredClone({ input, view })
    const freeze = (value: unknown) => {
      if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
    }
    freeze(input)
    freeze(view)
    expect(resumeAnalysisIssues(input, view)).toEqual([])
    const sections = detectStructuredResumeSections(input, view)
    expect(structuredSectionIssues(input, view, sections)).toEqual([])
    sections.occurrences[0].heading.sourceRef.rawStart = 999
    expect({ input, view }).toEqual(before)
  })

  it('keeps hostile runtime values and private exceptions out of diagnostic output', () => {
    const input = scenario([['Skills\nReact']])
    const view = createResumeAnalysisView(input)
    const hostile = { get occurrences(): never { throw new Error('private@example.invalid C:\\private\\resume.pdf') } }
    expect(projectStructuredSectionDiagnostic(input, view, hostile)).toEqual({ code: 'INVALID_SECTION_STRUCTURE' })
    const brokenInput = { ...input, get source(): never { throw new Error('private@example.invalid') } }
    expect(projectResumeAnalysisDiagnostic(brokenInput, view)).toEqual({ code: 'INVALID_ANALYSIS_STRUCTURE' })
    expect(() => createResumeAnalysisView(brokenInput)).toThrow(/^INVALID_SOURCE_DOCUMENT$/)
  })
})
