import { describe, expect, it } from 'vitest'
import { scenario, domainInputs, authoritativeWindow, analyzeSourceContract, structuredSkills,
  dualEntry, localRuleObservation } from './helpers/structuredResumeAnalyzerContractHarness'
import { createResumeAnalysisView as analysisView, normalizationOperations } from '../src/parsers/resumeStructuredAnalysis'
import { analyzeStructuredEducation, analyzeStructuredProfileFields } from '../src/parsers/structuredResumeDomains'
import { detectStructuredResumeSections as structuredSections, projectStructuredSectionDiagnostic } from '../src/parsers/structuredResumeSections'
import { admitted } from './helpers/resumeSourceDocumentContractHarness'
import { resumeAnalyzer } from '../src/analyzers/resumeAnalyzer'
import { normalizeResumeText } from '../src/parsers/normalizeResumeText'
import type { ResumeProfile } from '../src/types'

describe('RP-107 structured analysis source contracts (production-backed)', () => {
  it('represents a single authored line and its terminal break without treating the unit itself as a line', () => {
    const view = analysisView(scenario([['A\n']]))
    expect(view.segments.map((segment) => [segment.rawText, segment.authoredLine, segment.completeLine]))
      .toEqual([['A', true, true], ['', true, true]])
    expect(view.breaks.map((event) => event.spelling)).toEqual(['\n'])
    expect(view.pages[0].segmentOrdinals).toEqual([0, 1])
  })

  it('retains exact raw slices and authored LF with source-local UTF-16 identity', () => {
    const input = scenario([['A\nB']])
    const before = structuredClone(input.source)
    const view = analysisView(input)
    expect(view.segments.map((segment) => [segment.rawText, segment.sourceRef.rawStart, segment.sourceRef.rawEnd]))
      .toEqual([['A', 0, 1], ['B', 2, 3]])
    expect(view.breaks.map((event) => [event.spelling, event.sourceRef.rawStart, event.sourceRef.rawEnd]))
      .toEqual([['\n', 1, 2]])
    expect(view.segments.map((segment) => segment.authoredLine)).toEqual([true, true])
    expect(input.source).toEqual(before)
  })

  it.each([
    ['NFKC', 'SEMANTIC_OR_LOSSY'], ['LINE_ENDINGS', 'SOURCE_SAFE_LEXICAL'],
    ['DELETE_CONTROLS', 'SEMANTIC_OR_LOSSY'], ['BULLET_REWRITE', 'SEMANTIC_OR_LOSSY'],
    ['DOCUMENT_LINE_SPLIT', 'STRUCTURAL_FLATTENING'], ['HORIZONTAL_SPACE', 'SOURCE_SAFE_LEXICAL'],
    ['LINE_COMPARISON_TRIM', 'SOURCE_SAFE_LEXICAL'], ['LINE_JOIN', 'STRUCTURAL_FLATTENING'],
    ['BLANK_LINE_COLLAPSE', 'STRUCTURAL_FLATTENING'], ['DOCUMENT_TRIM', 'STRUCTURAL_FLATTENING'],
  ] as const)('locks %s normalization ownership and rejects automatic unapproved operations', (id, classification) => {
    expect(normalizationOperations.find((operation) => operation.id === id)?.classification).toBe(classification)
    const action = () => analysisView(scenario([[' A\t B\r\n']]), undefined, [id])
    if (classification === 'SOURCE_SAFE_LEXICAL') expect(action).not.toThrow()
    else expect(action).toThrow('NORMALIZATION_NOT_APPROVED')
  })

  it.each(['\n', '\r\n', '\r'])('preserves authored %j spelling and canonical typed break comparison', (spelling) => {
    const view = analysisView(scenario([[`A${spelling}B`]]))
    expect(view.breaks.map((event) => [event.spelling, event.analysisSpelling])).toEqual([[spelling, '\n']])
    expect(view.segments.map((segment) => segment.rawText)).toEqual(['A', 'B'])
  })

  it('does not turn separate source units into lines or invent breaks', () => {
    const view = analysisView(scenario([['A', 'B']]))
    expect(view.segments.map((segment) => [segment.rawText, segment.authoredLine])).toEqual([['A', false], ['B', false]])
    expect(view.breaks).toEqual([])
    expect(view.events.map((event) => event.kind)).toEqual(['TEXT', 'UNIT_TRANSITION', 'TEXT'])
  })

  it('retains a typed page transition without newline, paragraph or semantic break', () => {
    const view = analysisView(scenario([['A'], ['B']]))
    expect(view.events.map((event) => event.kind)).toEqual(['TEXT', 'PAGE_TRANSITION', 'TEXT'])
    expect(view.breaks).toEqual([])
    expect(view.segments.every((segment) => !segment.authoredLine)).toBe(true)
  })

  it('distinguishes an authored empty line from an empty unit', () => {
    const authored = analysisView(scenario([['A\n\nB']]))
    const empty = analysisView(scenario([['A', '', 'B']]))
    expect(authored.segments.map((segment) => [segment.rawText, segment.authoredLine])).toEqual([['A', true], ['', true], ['B', true]])
    expect(empty.segments.map((segment) => [segment.rawText, segment.authoredLine])).toEqual([['A', false], ['', false], ['B', false]])
    expect(empty.breaks).toEqual([])
  })

  it('retains whitespace-only units while deriving a local comparison view', () => {
    const input = scenario([['   ', '\t', '  A\t  B  ']])
    const view = analysisView(input)
    expect(view.segments.map((segment) => [segment.rawText, segment.analysisText])).toEqual([['   ', ''], ['\t', ''], ['  A\t  B  ', 'A B']])
    expect(input.source.pages[0].units).toHaveLength(3)
  })

  it('does not automatically NFKC-normalize, delete controls, or rewrite bullets', () => {
    const view = analysisView(scenario([['ＡＢＣ\u0000●\nB']]))
    expect(view.segments.map((segment) => segment.analysisText)).toEqual(['ＡＢＣ\u0000●', 'B'])
    expect(view.breaks).toHaveLength(1)
  })

  it('does not collapse repeated or terminal authored breaks', () => {
    const view = analysisView(scenario([['A\n\n\n']]))
    expect(view.breaks).toHaveLength(3)
    expect(view.segments.map((segment) => segment.rawText)).toEqual(['A', '', '', ''])
  })

  it('uses UTF-16 source offsets without corrupting supplementary characters', () => {
    const view = analysisView(scenario([['\u{1F680}\nB']]))
    expect(view.segments.map((segment) => [segment.sourceRef.rawStart, segment.sourceRef.rawEnd])).toEqual([[0, 2], [3, 4]])
    expect(view.breaks[0].sourceRef).toMatchObject({ rawStart: 2, rawEnd: 3 })
  })

  it('preserves canonical traversal instead of sorting by text or group identity', () => {
    const view = analysisView(scenario([['Z\nY', 'C'], ['B\nA']]))
    expect(view.segments.map((segment) => [segment.ordinal, segment.rawText, segment.sourceRef.pageNumber, segment.sourceRef.unitIndex]))
      .toEqual([[0, 'Z', 1, 0], [1, 'Y', 1, 0], [2, 'C', 1, 1], [3, 'B', 2, 0], [4, 'A', 2, 0]])
  })

  it('retains empty pages as typed structure without fabricating text', () => {
    const view = analysisView(scenario([['A'], [], ['B']]))
    expect(view.pages.map((page) => page.segmentOrdinals)).toEqual([[0], [], [1]])
    expect(view.events.map((event) => event.kind)).toEqual(['TEXT', 'PAGE_TRANSITION', 'PAGE_TRANSITION', 'TEXT'])
  })

  it('does not fuse CR and LF from unrelated units into CRLF', () => {
    const view = analysisView(scenario([['A\r', '\nB']]))
    expect(view.breaks.map((event) => event.spelling)).toEqual(['\r', '\n'])
    expect(view.events.filter((event) => event.kind === 'UNIT_TRANSITION')).toHaveLength(1)
  })

  it('rejects unknown normalization plans rather than silently applying a rule', () => {
    expect(() => analysisView(scenario([['A']]), undefined, ['UNAPPROVED'])).toThrow('NORMALIZATION_NOT_APPROVED')
  })
})

describe('RP-107 structured domain adaptation and global dependencies (production-backed)', () => {
  it('consumes an actually admitted production source without changing source policy', () => {
    const fixture = admitted(['Skills\nReact TypeScript'])
    const result = analyzeSourceContract({ manifest: fixture.pageManifest, serialized: fixture.serialized, source: fixture.source })
    expect(result.profile.skills).toEqual(['TypeScript', 'React'])
    expect(result.profile.parseMetadata?.detectedSections).toEqual(['skills'])
  })

  it('reuses ordered labeled work rules on source-authored records', () => {
    const result = analyzeSourceContract(scenario([['Experience\nCompany: Orbit Company\nTitle: Frontend Engineer\n2020/01 - 2022/06\nCompany: Beacon Company\nTitle: UI Designer\n2023 - Present']]))
    expect(result.profile.workExperiences).toEqual([
      { company: 'Orbit Company', title: 'Frontend Engineer', startDate: '2020/01', endDate: '2022/06' },
      { company: 'Beacon Company', title: 'UI Designer', startDate: '2023', endDate: 'Present' },
    ])
  })

  it('does not commit or reset supported pending work state at a page transition', () => {
    const result = analyzeSourceContract(scenario([['Experience\nCompany: Orbit Company\nTitle: Frontend Engineer'], ['2020 - 2022']]))
    expect(result.profile.workExperiences).toEqual([{ company: 'Orbit Company', title: 'Frontend Engineer', startDate: '2020', endDate: '2022' }])
  })

  it('preserves trailing incomplete work as an empty domain result, not parser failure', () => {
    const result = analyzeSourceContract(scenario([['Experience\nTitle: Frontend Engineer']]))
    expect(result.profile.workExperiences).toEqual([])
    expect(result.profile.parseMetadata?.warnings).toContain('EXPERIENCE_NOT_DETECTED')
    expect(result).not.toHaveProperty('routingOutcome')
  })

  it('keeps education first-field/status/date-exclusion recognition on source-backed lines', () => {
    const result = analyzeSourceContract(scenario([['Education\nExample University\nComputer Science\n2020 - 2024\nGraduated\nOther University\nAbout Me\nProfile text']]))
    expect(result.profile.education).toEqual({ school: 'Example University', department: 'Computer Science', graduationStatus: '畢業' })
    expect(result.inputs.education?.every((slice) => !slice.rawText.includes('Profile text'))).toBe(true)
  })

  it('preserves same-source combined school/department recognition without new school heuristics', () => {
    const result = analyzeSourceContract(scenario([['Education\nExample University - Computer Science\nStudying']]))
    expect(result.profile.education).toEqual({ school: 'Example University', department: 'Computer Science', graduationStatus: '就讀中' })
  })

  it('adapts labeled project records while retaining name-and-skills admission', () => {
    const result = analyzeSourceContract(scenario([['Projects\nProject name: Atlas Board\nTechnologies: React TypeScript\nDescription: Task board\nProject name: Empty Board']]))
    expect(result.profile.projects).toEqual([{ name: 'Atlas Board', skills: ['TypeScript', 'React'], description: 'Task board' }])
  })

  it('carries a labeled project across units/pages without a page flush or skill-string join', () => {
    const result = analyzeSourceContract(scenario([['Projects', 'Project name: Atlas'], ['Technologies: React']]))
    expect(result.profile.projects).toEqual([{ name: 'Atlas', skills: ['React'] }])
  })

  it('keeps the existing project cap and canonical skill deduplication', () => {
    const result = analyzeSourceContract(scenario([['Projects\nProject name: A\nTechnologies: React React\nProject name: B\nTechnologies: React\nProject name: C\nTechnologies: React\nProject name: D\nTechnologies: React\nProject name: E\nTechnologies: React\nProject name: F\nTechnologies: React']]))
    expect(result.profile.projects.map((project) => [project.name, project.skills])).toEqual([
      ['A', ['React']], ['B', ['React']], ['C', ['React']], ['D', ['React']], ['E', ['React']],
    ])
  })

  it('aggregates global skills in dictionary order with longest-alias priority across units', () => {
    const skills = structuredSkills(scenario([[' React ', ' React.js ', ' TS ']]))
    expect(skills.skills).toEqual(['TypeScript', 'React'])
    expect(skills.aliasMatches).toEqual([{ alias: 'TS', canonical: 'TypeScript' }, { alias: 'React.js', canonical: 'React' }])
  })

  it('retains real source context rather than manufacturing word boundaries at unit edges', () => {
    const skills = structuredSkills(scenario([['Java', 'Script']]))
    expect(skills.skills).toEqual([])
  })

  it('does not manufacture a global skill phrase across units', () => {
    expect(structuredSkills(scenario([['REST', 'API']])).skills).not.toContain('REST API')
    expect(localRuleObservation(scenario([['REST', 'API']]), /REST API/iu))
      .toEqual({ matched: false, references: [] })
  })

  it('does not fabricate a cross-unit career phrase or joined witness', () => {
    expect(localRuleObservation(scenario([['machine', 'learning']]), /machine learning/iu))
      .toEqual({ matched: false, references: [] })
    expect(localRuleObservation(scenario([['machine learning']]), /machine learning/iu)).toMatchObject({ matched: true })
  })

  it('does not fabricate split name/date matches while retaining same-unit whitespace semantics', () => {
    expect(localRuleObservation(scenario([['Avery', 'Stone']]), /Avery\s+Stone/u).matched).toBe(false)
    expect(localRuleObservation(scenario([['2020 -', '2022']]), /2020\s*-\s*2022/u).matched).toBe(false)
    expect(localRuleObservation(scenario([['Avery\nStone']]), /Avery\s+Stone/u)).toMatchObject({ matched: true })
  })

  it('uses whole-unit provenance for length-changing comparison witnesses rather than fake raw offsets', () => {
    const result = localRuleObservation(scenario([[' A\t  B ']]), /A B/u)
    expect(result).toEqual({ matched: true,
      references: [{ pageNumber: 1, unitIndex: 0, groupId: 'anonymous:0', runId: 0, rawStart: 0, rawEnd: 7 }] })
  })

  it('keeps global warnings and traces as structural counts with no separator contribution', () => {
    const input = scenario([['A'], ['B']])
    const result = analyzeSourceContract(input)
    expect(result.nonWhitespaceCount).toBe(2)
    expect(projectStructuredSectionDiagnostic(input, result.view, result.sections)).toMatchObject({ segmentCount: 2, breakCount: 0, authoredLineCount: 0, sectionCount: 0 })
    expect(result.profile.parseMetadata?.warnings).toContain('LOW_TEXT_CONTENT')
  })

  it('preserves literal-space versus authored-newline semantics in skill aliases', () => {
    expect(structuredSkills(scenario([['REST\nAPI']])).skills).not.toContain('REST API')
    expect(structuredSkills(scenario([['REST\t API']])).skills).toContain('REST API')
  })

  it('safely reformulates global career predicates as unit-local witnesses and skill counts', () => {
    const result = analyzeSourceContract(scenario([['Skills\nHTML CSS React Python Django\nbackend data analytics Pandas NumPy']]))
    expect(result.profile.careerDirections).toEqual(['前端開發', '後端開發', '資料應用'])
  })

  it('does not join cross-unit Senior/Engineer to satisfy a legacy title observation', () => {
    const result = analyzeSourceContract(scenario([['Experience', 'Senior', 'Engineer', '2020 - 2022']]))
    expect(result.profile.workExperiences).toEqual([])
  })

  it('does not complete a date regex from unrelated source units', () => {
    const result = analyzeSourceContract(scenario([['Experience', 'Title: Frontend Engineer', '2020 -', '2022']]))
    expect(result.profile.workExperiences).toEqual([])
  })

  it('does not join a split label/value into a supported labeled work observation', () => {
    const result = analyzeSourceContract(scenario([['Experience', 'Title:', 'Frontend Engineer', '2020 - 2022']]))
    expect(result.profile.workExperiences).toEqual([])
  })

  it('does not infer unadapted project shapes through a string bridge', () => {
    const result = analyzeSourceContract(scenario([['Projects', 'Atlas', 'React']]))
    expect(result.profile.projects).toEqual([])
  })

  it('supports education fallback over three authoritative source records', () => {
    const result = analyzeSourceContract(scenario([['Intro\nExample University\nComputer Science\nGraduated']]))
    expect(result.profile.education).toEqual({ school: 'Example University', department: 'Computer Science', graduationStatus: '畢業' })
  })

  it('does not fabricate education fallback when its window would substitute units for lines', () => {
    const result = analyzeSourceContract(scenario([['Example University', 'Computer Science', 'Graduated']]))
    expect(result.profile.education).toEqual({ school: '', department: '', graduationStatus: '' })
  })

  it('preserves existing empty-education-section fallback semantics using referenced records', () => {
    const result = analyzeSourceContract(scenario([['Example University\nComputer Science\nGraduated\nEducation']]))
    expect(result.sections.sections.education).toEqual([])
    expect(result.profile.education.school).toBe('Example University')
  })

  it('supports name extraction within the authoritative first-14-record budget', () => {
    const result = analyzeSourceContract(scenario([['Front End\nAvery Stone\nSkills\nReact']]))
    expect(result.profile.name).toBe('Avery Stone')
  })

  it('does not turn name-window units into legacy lines', () => {
    const result = analyzeSourceContract(scenario([['Intro', 'Avery Stone']]))
    expect(result.profile.name).toBe('')
  })

  it('enforces the name budget without granting a fifteenth source record priority', () => {
    const result = analyzeSourceContract(scenario([['x\nx\nx\nx\nx\nx\nx\nx\nx\nx\nx\nx\nx\nx\nAvery Stone']]))
    expect(result.profile.name).toBe('')
  })

})

describe('RP-107 existing profile schema composition (test-only)', () => {
  it('targets the unchanged production ResumeProfile schema with supported domain parity', () => {
    const text = 'Avery Stone\nSkills\nHTML CSS React\nExperience\nCompany: Orbit Company\nTitle: Frontend Engineer\n2020 - 2022\nEducation\nExample University\nComputer Science\nGraduated\nProjects\nProject name: Atlas\nTechnologies: React'
    const result = analyzeSourceContract(scenario([[text]]))
    const profile: ResumeProfile = result.profile
    const legacy = resumeAnalyzer.analyze({ text, fileName: 'anonymous.pdf', fileType: 'pdf', pageCount: 1, parserMessages: [] }, normalizeResumeText(text))
    expect(profile).toMatchObject({ name: legacy.name, skills: legacy.skills, workExperiences: legacy.workExperiences,
      education: legacy.education, projects: legacy.projects, careerDirections: legacy.careerDirections,
      abilities: legacy.abilities, level: legacy.level })
    expect(Object.keys(profile).sort()).toEqual(Object.keys(legacy).sort())
  })

})

describe('RP-107 domain emptiness and runtime boundaries (production-backed)', () => {
  it('keeps empty domains valid and low-text counts diagnostic rather than routing', () => {
    const result = analyzeSourceContract(scenario([['']]))
    expect(result.profile).toMatchObject({ name: '', skills: [], projects: [], workExperiences: [] })
    expect(result.profile.parseMetadata?.warnings).toContain('LOW_TEXT_CONTENT')
    expect(result).not.toHaveProperty('cause')
    expect(result).not.toHaveProperty('routingOutcome')
  })

  it('keeps MIGRATION_GAP test-only with no parser cause or fallback state', () => {
    const input = scenario([['Example University', 'Computer Science']])
    const view = analysisView(input)
    const sections = structuredSections(input, view)
    const result = { fields: analyzeStructuredProfileFields(input, view, sections),
      education: analyzeStructuredEducation(input, view, sections) }
    expect(result.education).toEqual({ school: '', department: '', graduationStatus: '' })
    expect(result.fields.name).toBe('')
    expect(result).not.toHaveProperty('status')
    expect(result).not.toHaveProperty('gaps')
    expect(result).not.toHaveProperty('cause')
    expect(result).not.toHaveProperty('validity')
    expect(result).not.toHaveProperty('routingOutcome')
  })

})

describe('RP-107 functional text and diagnostic privacy (production-backed)', () => {
  it('projects only safe counts and numeric source references while retaining functional text', () => {
    const input = scenario([['Avery Stone\ncontact@example.invalid\nExperience\nCompany: Orbit Company\nTitle: Frontend Engineer\n2020 - 2022\nEducation\nExample University']])
    const view = analysisView(input)
    const sections = structuredSections(input, view)
    expect(sections.sections.experience?.[0].rawText).toBe('Company: Orbit Company')
    const diagnostic = projectStructuredSectionDiagnostic(input, view, sections)
    expect(diagnostic.code).toBe('SECTION_STRUCTURE_VALID')
    if (diagnostic.code !== 'SECTION_STRUCTURE_VALID') throw new Error('INVALID_DIAGNOSTIC')
    expect(Object.keys(diagnostic).sort()).toEqual(['authoredLineCount', 'breakCount', 'code', 'pageCount', 'references', 'sectionCount', 'segmentCount', 'unitCount'])
    expect(JSON.stringify(diagnostic)).not.toMatch(/Avery|example.invalid|Orbit|University|rawText|analysisText|fileName|message|path/)
    expect(diagnostic.references?.[0]).toEqual({ pageNumber: 1, unitIndex: 0, rawStart: 0, rawEnd: 11, runId: 0 })
  })

})

describe('RP-107 future dual entry (test-only)', () => {
  it('keeps dual entry separate and invokes unchanged DOCX analysis without a PDF source adapter', () => {
    expect(dualEntry.analyzeLegacy).toBe(resumeAnalyzer.analyze)
    expect(dualEntry.analyzeSource).toBe(analyzeSourceContract)
    const text = 'Avery Stone\nSkills\nReact'
    const profile = dualEntry.analyzeLegacy({ text, fileName: 'anonymous.docx', fileType: 'docx', parserMessages: [] }, normalizeResumeText(text))
    expect(profile.name).toBe('Avery Stone')
    expect(profile.skills).toEqual(['React'])
    expect(profile.parseMetadata?.source.fileType).toBe('docx')
  })
})

describe('RP-107 structured sections (production-backed)', () => {
  it('recognizes a source-internal heading and preserves preamble/body refs', () => {
    const sourceInput = scenario([['Intro\nExperience\nItem']])
    const view = analysisView(sourceInput)
    const result = structuredSections(sourceInput, view)
    expect(result.detectedKeys).toEqual(['experience'])
    expect(result.preamble.map((slice) => [slice.rawText, slice.sourceRef.rawStart, slice.sourceRef.rawEnd])).toEqual([['Intro', 0, 5]])
    expect(result.occurrences[0].heading.sourceRef).toMatchObject({ pageNumber: 1, unitIndex: 0, rawStart: 6, rawEnd: 16 })
    expect(result.sections.experience?.map((slice) => [slice.rawText, slice.sourceRef.rawStart, slice.sourceRef.rawEnd])).toEqual([['Item', 17, 21]])
  })

  it('recognizes a whole-unit heading candidate without declaring that unit a line', () => {
    const sourceInput = scenario([['Experience', 'Company: Orbit Company']])
    const view = analysisView(sourceInput)
    const result = structuredSections(sourceInput, view)
    expect(view.segments.map((segment) => segment.authoredLine)).toEqual([false, false])
    expect(result.detectedKeys).toEqual(['experience'])
    expect(result.sections.experience?.[0].sourceRef.unitIndex).toBe(1)
  })

  it('does not fabricate a heading from a split label', () => {
    const result = structuredSections(scenario([['Exper', 'ience', 'Item']]))
    expect(result.detectedKeys).toEqual([])
    expect(result.occurrences).toEqual([])
    expect(result.preamble.map((slice) => slice.rawText)).toEqual(['Exper', 'ience', 'Item'])
  })

  it('does not recognize heading substrings inside unrelated content', () => {
    expect(structuredSections(scenario([['An Experience story\nItem']])).detectedKeys).toEqual([])
  })

  it('retains a section body across pages without a page-triggered occurrence', () => {
    const result = structuredSections(scenario([['Experience\nFirst'], ['Second\nThird']]))
    expect(result.occurrences).toHaveLength(1)
    expect(result.sections.experience?.map((slice) => [slice.rawText, slice.sourceRef.pageNumber])).toEqual([['First', 1], ['Second', 2], ['Third', 2]])
  })

  it.each(['Skills: React, TypeScript', '技能： React, TypeScript'])('preserves supported inline heading slices for %s', (text) => {
    const result = structuredSections(scenario([[text]]))
    const body = result.sections.skills?.[0]
    expect(result.detectedKeys).toEqual(['skills'])
    expect(body?.rawText).toBe('React, TypeScript')
    expect(body?.sourceRef.rawEnd).toBe(text.length)
    expect(text.slice(body!.sourceRef.rawStart, body!.sourceRef.rawEnd)).toBe('React, TypeScript')
    expect(result.occurrences[0].inline).toEqual(body)
  })

  it('keeps raw offsets honest when lexical comparison collapses spaces', () => {
    const text = '  Skills:\t  React  '
    const result = structuredSections(scenario([[text]]))
    expect(result.sections.skills?.[0].sourceRef).toMatchObject({ rawStart: 12, rawEnd: 17 })
    expect(result.sections.skills?.[0].rawText).toBe('React')
  })

  it('preserves first-detection key order instead of enum/alphabetical sorting', () => {
    const result = structuredSections(scenario([['Projects\nAlpha\nEducation\nExample University\nSkills\nReact\nProjects\nBeta']]))
    expect(result.detectedKeys).toEqual(['projects', 'education', 'skills'])
    expect(result.occurrences.map((occurrence) => occurrence.key)).toEqual(['projects', 'education', 'skills', 'projects'])
  })

  it('retains repeated plain-heading occurrences while accumulating compatibility body refs', () => {
    const result = structuredSections(scenario([['Experience\nFirst\nExperience\nSecond']]))
    expect(result.occurrences.map((occurrence) => occurrence.body.map((slice) => slice.rawText))).toEqual([['First'], ['Second']])
    expect(result.sections.experience?.map((slice) => slice.rawText)).toEqual(['First', 'Second'])
  })

  it('preserves legacy direct-inline replacement without deleting historical occurrences', () => {
    const result = structuredSections(scenario([['Skills\nReact\nSkills: TypeScript']]))
    expect(result.sections.skills?.map((slice) => slice.rawText)).toEqual(['TypeScript'])
    expect(result.occurrences.map((occurrence) => occurrence.body.map((slice) => slice.rawText))).toEqual([['React'], ['TypeScript']])
  })

  it('preserves legacy middle-dot inline append and prefix references', () => {
    const text = 'Skills\nReact\nPrefix・Skills: TypeScript・Extra'
    const result = structuredSections(scenario([[text]]))
    expect(result.sections.skills?.map((slice) => slice.rawText)).toEqual(['React', 'Prefix', 'TypeScript', 'Extra'])
    expect(result.occurrences).toHaveLength(2)
    for (const slice of result.sections.skills ?? []) expect(text.slice(slice.sourceRef.rawStart, slice.sourceRef.rawEnd)).toBe(slice.rawText)
  })

  it('does not expand the middle-dot special case when first matched heading is at part zero', () => {
    const result = structuredSections(scenario([['Experience・Item']]))
    expect(result.detectedKeys).toEqual([])
    expect(result.preamble[0].rawText).toBe('Experience・Item')
  })

  it('distinguishes absent sections from present-empty sections and keeps source blanks', () => {
    const sourceInput = scenario([['Experience\n\n']])
    const view = analysisView(sourceInput)
    const result = structuredSections(sourceInput, view)
    expect(result.sections.experience).toEqual([])
    expect(result.sections.projects).toBeUndefined()
    expect(view.segments).toHaveLength(3)
  })

  it('does not require global character offsets or an authoritative joined body', () => {
    const result = structuredSections(scenario([['Experience\nA'], ['B']]))
    expect(Object.keys(result).sort()).toEqual(['detectedKeys', 'occurrences', 'preamble', 'sections'])
    expect(Object.keys(result.occurrences[0]).sort()).toEqual(['body', 'heading', 'key'])
    expect(Object.keys(result.sections.experience![0].sourceRef).sort()).toEqual(['groupId', 'pageNumber', 'rawEnd', 'rawStart', 'runId', 'unitIndex'])
  })

})

describe('RP-107 structured domain inputs and line windows (production-backed)', () => {
  it('adapts all domain inputs as referenced slices and ordered traversal, never section strings', () => {
    const sourceInput = scenario([['Intro\nExperience\nWork\nEducation\nSchool\nProjects\nAtlas\nSkills\nReact']])
    const view = analysisView(sourceInput)
    const input = domainInputs(sourceInput, view, structuredSections(sourceInput, view))
    expect(input.work?.map((slice) => slice.analysisText)).toEqual(['Work'])
    expect(input.education?.map((slice) => slice.analysisText)).toEqual(['School'])
    expect(input.projects?.map((slice) => slice.analysisText)).toEqual(['Atlas'])
    expect(input.skillsSection?.map((slice) => slice.analysisText)).toEqual(['React'])
    expect(input.nameCandidates.map((slice) => slice.rawText)).toEqual(['Intro'])
    expect(input.globalSegments).toHaveLength(9)
  })

  it('supports an authoritative source-line window with stable local refs', () => {
    const input = scenario([['A\nB\nC\nD']])
    const window = authoritativeWindow(input, 1, 3)
    expect(window.map((slice) => [slice.rawText, slice.sourceRef.rawStart])).toEqual([['B', 2], ['C', 4], ['D', 6]])
  })

  it('does not substitute neighboring units for a three-line window', () => {
    const input = scenario([['A', 'B', 'C']])
    expect(authoritativeWindow(input, 0, 3)).toEqual([])
  })

  it('does not call opaque unit-edge fragments complete lines despite an internal break', () => {
    const input = scenario([['A\nB', 'C']])
    const view = analysisView(input)
    expect(view.segments.map((segment) => [segment.authoredLine, segment.completeLine])).toEqual([[true, true], [true, false], [false, false]])
    expect(authoritativeWindow(input, 0, 3)).toEqual([])
  })
})

describe('RP-107 admission, isolation and negative invariants (production-backed)', () => {
  it.each([
    ['wrong source kind', (value: any) => { value.sourceKind = 'DOCX' }],
    ['missing page', (value: any) => { value.pages.pop() }],
    ['duplicate page', (value: any) => { value.pages.push(structuredClone(value.pages[0])) }],
    ['invalid page number', (value: any) => { value.pages[0].pageNumber = 0 }],
    ['missing unit', (value: any) => { value.pages[0].units.pop() }],
    ['duplicate unit', (value: any) => { value.pages[0].units.push(structuredClone(value.pages[0].units[0])) }],
    ['invalid text', (value: any) => { value.pages[0].units[0].text = 1 }],
    ['fabricated text', (value: any) => { value.pages[0].units[0].text = 'Changed' }],
    ['wrong provenance', (value: any) => { value.pages[0].units[0].provenance.pageNumber = 2 }],
    ['missing provenance', (value: any) => { delete value.pages[0].units[0].provenance.runId }],
    ['geometry injection', (value: any) => { value.pages[0].units[0].x = 1 }],
  ] as const)('rejects %s through production source validation before analysis', (_, mutate) => {
    const input = scenario([['Skills\nReact']])
    const invalid = structuredClone(input.source)
    mutate(invalid)
    expect(() => analysisView(input, invalid)).toThrow('INVALID_SOURCE_DOCUMENT')
  })

  it('does not leak a thrown malformed-source accessor into rejection', () => {
    const input = scenario([['A']])
    const invalid = { sourceKind: 'PDF', get pages(): never { throw new Error('private@example.invalid C:\\private\\resume.pdf') } }
    expect(() => analysisView(input, invalid)).toThrow(/^INVALID_SOURCE_DOCUMENT$/)
  })

  it('does not rewrite or drop any UTF-16 source code unit in segment/break coverage', () => {
    const input = scenario([['\u{1F680}\r\n\t A\n\n', '', '●\u0000'], ['B\rC']])
    const view = analysisView(input)
    for (const page of input.source.pages) page.units.forEach((unit, unitIndex) => {
      const coverage = Array.from({ length: unit.text.length }, () => 0)
      const records = [...view.segments, ...view.breaks].filter((record) => record.sourceRef.pageNumber === page.pageNumber && record.sourceRef.unitIndex === unitIndex)
      for (const record of records) {
        const { rawStart, rawEnd, groupId, runId } = record.sourceRef
        expect([groupId, runId]).toEqual([unit.provenance.groupId, unit.provenance.runId])
        expect(unit.text.slice(rawStart, rawEnd)).toBe(record.kind === 'TEXT' ? record.rawText : record.spelling)
        for (let index = rawStart; index < rawEnd; index += 1) coverage[index] += 1
      }
      expect(coverage).toEqual(Array.from({ length: unit.text.length }, () => 1))
    })
  })

  it('has no text flattener fields or geometry on analysis records', () => {
    const view = analysisView(scenario([['A', 'B']]))
    expect(Object.keys(view).sort()).toEqual(['breaks', 'events', 'pages', 'segments'])
    expect(Object.keys(view.segments[0]).sort()).toEqual(['analysisText', 'authoredLine', 'completeLine', 'kind', 'leading', 'ordinal', 'rawText', 'sourceRef', 'trailing'])
    expect(view.segments.map((segment) => segment.rawText)).toEqual(['A', 'B'])
  })

  it('honors disabling comparison operations without changing segmentation', () => {
    const input = scenario([[' A\t B\r\n']])
    const view = analysisView(input, undefined, [])
    expect(view.segments[0].analysisText).toBe(' A\t B')
    expect(view.breaks[0].analysisSpelling).toBe('\r\n')
    expect(input.source.pages[0].units[0].text).toBe(' A\t B\r\n')
  })

  it('does not NFKC-repair a full-width heading automatically', () => {
    expect(structuredSections(scenario([['Ｓｋｉｌｌｓ\nReact']])).detectedKeys).toEqual([])
  })

  it('uses new containers without source mutation even for frozen input', () => {
    const input = scenario([['Avery Stone\nSkills\nReact'], ['Experience', 'Title: Frontend Engineer', '2020 - 2022']])
    const before = structuredClone(input)
    const freeze = (value: unknown) => {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze)
        Object.freeze(value)
      }
    }
    freeze(input)
    const first = analysisView(input)
    const second = analysisView(input)
    const firstSections = structuredSections(input, first)
    const secondSections = structuredSections(input, second)
    expect(input).toEqual(before)
    expect(first.segments).not.toBe(second.segments)
    expect(first.segments[0].sourceRef).not.toBe(input.source.pages[0].units[0].provenance)
    first.segments[0].rawText = 'Changed'
    first.segments[0].sourceRef.pageNumber = 99
    firstSections.preamble[0].rawText = 'Changed'
    expect(input).toEqual(before)
    expect(second.segments[0].rawText).toBe('Avery Stone')
    expect(secondSections.preamble[0].rawText).toBe('Avery Stone')
  })

  it('produces deterministic production derived models and section references', () => {
    const input = scenario([['Experience\nCompany: Orbit Company\nTitle: Frontend Engineer\n2020 - 2022\nSkills\nReact']])
    expect(analysisView(input)).toEqual(analysisView(structuredClone(input)))
    expect(structuredSections(input)).toEqual(structuredSections(structuredClone(input)))
  })

  it('does not leak injected raw diagnostic fields or group identifiers', () => {
    const input = scenario([['Skills\nReact']])
    const view = analysisView(input)
    const sections = structuredSections(input, view)
    const contaminated = { ...view, rawText: 'private@example.invalid', error: new Error('C:\\private\\resume.pdf') }
    contaminated.segments[0].sourceRef.groupId = 'private@example.invalid'
    expect(JSON.stringify(projectStructuredSectionDiagnostic(input, contaminated, sections))).not.toMatch(/private|resume.pdf|groupId|error|rawText/)
  })

  it('rejects diagnostic source references when numeric fields carry private text', () => {
    const input = scenario([['Skills\nReact']])
    const view = analysisView(input)
    const sections = structuredSections(input, view)
    const reference = view.segments[0].sourceRef as unknown as Record<string, unknown>
    reference.unitIndex = 'private@example.invalid'
    expect(projectStructuredSectionDiagnostic(input, view, sections)).toEqual({ code: 'INVALID_SECTION_STRUCTURE' })
  })

  it('does not leak diagnostic accessor exceptions', () => {
    const input = scenario([['Skills\nReact']])
    const view = analysisView(input)
    const sections = structuredSections(input, view)
    const invalid = { ...view, get segments(): never { throw new Error('private@example.invalid C:\\private\\resume.pdf') } }
    expect(projectStructuredSectionDiagnostic(input, invalid, sections)).toEqual({ code: 'INVALID_SECTION_STRUCTURE' })
  })

  it('rejects forged migration metadata in the production diagnostic projection', () => {
    const input = scenario([['Skills\nReact']])
    const view = analysisView(input)
    const sections = structuredSections(input, view)
    const invalid = { ...view, gaps: ['private@example.invalid'] }
    expect(projectStructuredSectionDiagnostic(input, invalid, sections)).toEqual({ code: 'INVALID_SECTION_STRUCTURE' })
  })
})
