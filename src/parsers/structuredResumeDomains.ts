import { dateRangePattern, workLabelPatterns, workTitleSignalPattern, workCompanySignalPattern,
  educationFallbackPattern, parseEducationLines, projectLabelPatterns, detectName,
  careerDirectionsFromSignals, abilities } from '../analyzers/resumeAnalyzer'
import { detectSkills, skillDictionary, skillAliasPattern } from '../data/skillDictionary'
import type { WorkExperience, ResumeEducation, ResumeProject, ResumeParseWarningCode } from '../types'
import { localAnalysisText, type ResumeAnalysisInput, type ResumeAnalysisDocument, type AnalysisLineSlice,
  type SourceRef } from './resumeStructuredAnalysis'
import { projectStructuredSectionDiagnostic } from './structuredResumeSections'
import { structuredSectionIssues, type StructuredResumeSections } from './structuredResumeSections'

export class StructuredDomainValidationError extends Error {
  readonly code = 'INVALID_STRUCTURED_DOMAIN_INPUT'
  constructor() { super('INVALID_STRUCTURED_DOMAIN_INPUT') }
}

function validateInput(input: ResumeAnalysisInput, view: ResumeAnalysisDocument, sections: StructuredResumeSections): void {
  if (structuredSectionIssues(input, view, sections).length) throw new StructuredDomainValidationError()
}

export function getStructuredDomainInputs(input: ResumeAnalysisInput, view: ResumeAnalysisDocument, sections: StructuredResumeSections) {
  validateInput(input, view, sections)
  return {
    work: sections.sections.experience?.map((record) => structuredClone(record)),
    education: sections.sections.education?.map((record) => structuredClone(record)),
    projects: sections.sections.projects?.map((record) => structuredClone(record)),
    skillsSection: sections.sections.skills?.map((record) => structuredClone(record)),
    nameCandidates: [...sections.preamble, ...(sections.sections.basicInfo ?? [])].map((record) => structuredClone(record)),
    globalSegments: view.segments.map((record) => structuredClone(record)),
  }
}

function lineWindow(records: readonly AnalysisLineSlice[], start: number, count: number): AnalysisLineSlice[] {
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(count) || count < 1) return []
  const window = records.slice(start, start + count)
  if (!window.length || window.some((record) => !record.completeLine)
    || window.some((record) => record.sourceRef.pageNumber !== window[0].sourceRef.pageNumber
      || record.sourceRef.unitIndex !== window[0].sourceRef.unitIndex)) return []
  return window.map((record) => structuredClone(record))
}

export function structuredLineWindow(input: ResumeAnalysisInput, view: ResumeAnalysisDocument,
  sections: StructuredResumeSections, start: number, count: number): AnalysisLineSlice[] {
  validateInput(input, view, sections)
  return lineWindow(view.segments, start, count)
}

export function analyzeStructuredWork(input: ResumeAnalysisInput, view: ResumeAnalysisDocument,
  sections: StructuredResumeSections): WorkExperience[] {
  validateInput(input, view, sections)
  const output: WorkExperience[] = []
  let pending: Partial<WorkExperience> = {}
  for (const record of sections.sections.experience ?? []) {
    const text = record.analysisText.replace(/^[-•]\s*/, '').trim()
    const company = text.match(workLabelPatterns.company)
    const title = text.match(workLabelPatterns.title)
    const location = text.match(workLabelPatterns.location)
    if (company) { pending.company = company[1]; continue }
    if (title) { pending.title = title[1]; continue }
    if (location) { pending.location = location[1]; continue }
    const dates = text.match(dateRangePattern)
    if (dates && dates[0] === text) {
      if (pending.title && pending.title !== '未辨識職稱') output.push({ ...pending, title: pending.title, startDate: dates[1], endDate: dates[2] })
      pending = {}
      continue
    }
    if (!record.completeLine) continue
    if (!pending.company && workCompanySignalPattern.test(text) && !workTitleSignalPattern.test(text)) pending.company = text
    else if (!pending.title && workTitleSignalPattern.test(text)) pending.title = text
  }
  return output
}

export function analyzeStructuredEducation(input: ResumeAnalysisInput, view: ResumeAnalysisDocument,
  sections: StructuredResumeSections): ResumeEducation {
  validateInput(input, view, sections)
  let records = sections.sections.education ?? []
  if (!records.length) {
    const candidates = view.segments.filter((record) => record.analysisText)
    const start = candidates.findIndex((record) => educationFallbackPattern.test(record.analysisText))
    records = start < 0 ? [] : lineWindow(candidates, start, 3)
  }
  const lines = records.filter((record) => record.completeLine)
    .flatMap((record) => record.analysisText.split('・').map((part) => part.trim()).filter(Boolean))
  return parseEducationLines(lines)
}

export function analyzeStructuredProjects(input: ResumeAnalysisInput, view: ResumeAnalysisDocument,
  sections: StructuredResumeSections): ResumeProject[] {
  validateInput(input, view, sections)
  const output: ResumeProject[] = []
  let current: ResumeProject | undefined
  const flush = () => {
    if (current?.name.trim() && current.skills.length) output.push({ ...current, skills: [...new Set(current.skills)] })
    current = undefined
  }
  for (const record of sections.sections.projects ?? []) {
    const text = record.analysisText.replace(/^[-•]\s*/, '').trim()
    const name = text.match(projectLabelPatterns.name)
    if (name) { flush(); current = { name: name[1].trim(), skills: [] }; continue }
    const tech = text.match(projectLabelPatterns.tech)
    if (tech) { if (current) current.skills = detectSkills(tech[1]).skills; continue }
    const description = text.match(projectLabelPatterns.description)
    if (description && current) {
      // Format interpreted output only; never reuse it as source, line context or search input.
      current.description = current.description ? `${current.description} ${description[1].trim()}` : description[1].trim()
    }
  }
  flush()
  return output.slice(0, 5)
}

const unitComparison = (raw: string) => localAnalysisText(raw, ['LINE_ENDINGS', 'HORIZONTAL_SPACE'])

function supportedTokenEdge(input: ResumeAnalysisInput, pageIndex: number, unitIndex: number,
  start: number, end: number, length: number): boolean {
  const documentStart = pageIndex === 0 && unitIndex === 0
  const documentEnd = pageIndex === input.source.pages.length - 1
    && unitIndex === input.source.pages[pageIndex].units.length - 1
  return (start > 0 || documentStart) && (end < length || documentEnd)
}

function skillsFold(input: ResumeAnalysisInput) {
  const skills: string[] = []
  const aliasMatches: Array<{ alias: string; canonical: string }> = []
  for (const definition of skillDictionary) {
    const alias = [...definition.aliases].sort((a, b) => b.length - a.length).find((candidate) =>
      input.source.pages.some((page, pageIndex) => page.units.some((unit, unitIndex) => {
        const text = unitComparison(unit.text)
        return [...text.matchAll(skillAliasPattern(candidate, true))].some((match) =>
          supportedTokenEdge(input, pageIndex, unitIndex, match.index, match.index + match[0].length, text.length))
      })))
    if (!alias) continue
    skills.push(definition.canonical)
    if (alias.toLocaleLowerCase() !== definition.canonical.toLocaleLowerCase()) aliasMatches.push({ alias, canonical: definition.canonical })
  }
  return { skills, aliasMatches }
}

export function analyzeStructuredSkills(input: ResumeAnalysisInput, view: ResumeAnalysisDocument, sections: StructuredResumeSections) {
  validateInput(input, view, sections)
  return skillsFold(input)
}

// Comparison positions are not raw positions: a witness refers to the entire authoritative unit.
export function findStructuredUnitMatches(input: ResumeAnalysisInput, view: ResumeAnalysisDocument,
  sections: StructuredResumeSections, pattern: RegExp): { matched: boolean; references: SourceRef[] } {
  validateInput(input, view, sections)
  try {
    const references: SourceRef[] = []
    input.source.pages.forEach((page) => page.units.forEach((unit, unitIndex) => {
      if (new RegExp(pattern.source, pattern.flags).test(unitComparison(unit.text))) references.push({
        pageNumber: page.pageNumber, unitIndex, groupId: unit.provenance.groupId, runId: unit.provenance.runId,
        rawStart: 0, rawEnd: unit.text.length,
      })
    }))
    return { matched: references.length > 0, references }
  } catch { throw new StructuredDomainValidationError() }
}

export function analyzeStructuredProfileFields(input: ResumeAnalysisInput, view: ResumeAnalysisDocument,
  sections: StructuredResumeSections) {
  validateInput(input, view, sections)
  const detected = skillsFold(input)
  let name = ''
  const candidates = [...sections.preamble, ...(sections.sections.basicInfo ?? [])]
  for (const record of candidates.slice(0, 14)) {
    if (!record.completeLine) break
    name = detectName([record.analysisText])
    if (name) break
  }
  const seen = (pattern: RegExp) => input.source.pages.some((page, pageIndex) => page.units.some((unit, unitIndex) => {
    const text = unitComparison(unit.text)
    for (const match of text.matchAll(new RegExp(pattern.source, 'giu'))) {
      const needsEdges = /^(?:AI|LLM)$/iu.test(match[0])
      if (!needsEdges || supportedTokenEdge(input, pageIndex, unitIndex, match.index, match.index + match[0].length, text.length)) return true
    }
    return false
  }))
  return { name, ...detected, careerDirections: careerDirectionsFromSignals(detected.skills, seen),
    abilities: abilities(detected.skills), level: Math.max(1, Math.min(10, Math.ceil(detected.skills.length / 3))),
    nonWhitespaceCount: view.segments.reduce((count, segment) => count + segment.analysisText.replace(/\s/g, '').length, 0) }
}

export function structuredDomainWarnings(input: ResumeAnalysisInput, view: ResumeAnalysisDocument,
  sections: StructuredResumeSections): ResumeParseWarningCode[] {
  const fields = analyzeStructuredProfileFields(input, view, sections)
  const education = analyzeStructuredEducation(input, view, sections)
  const warnings: ResumeParseWarningCode[] = []
  if (fields.nonWhitespaceCount < 120) warnings.push('LOW_TEXT_CONTENT')
  if (!fields.name) warnings.push('NAME_NOT_FOUND')
  if (!education.school && !education.department) warnings.push('EDUCATION_NOT_DETECTED')
  if (!analyzeStructuredWork(input, view, sections).length) warnings.push('EXPERIENCE_NOT_DETECTED')
  if (!analyzeStructuredProjects(input, view, sections).length) warnings.push('PROJECTS_NOT_DETECTED')
  if (!fields.skills.length) warnings.push('NO_SKILLS_FOUND')
  return warnings
}

export function projectStructuredDomainDiagnostic(input: ResumeAnalysisInput, view: ResumeAnalysisDocument,
  sections: StructuredResumeSections) {
  try {
    const fields = analyzeStructuredProfileFields(input, view, sections)
    const education = analyzeStructuredEducation(input, view, sections)
    const structure = projectStructuredSectionDiagnostic(input, view, sections)
    if (structure.code !== 'SECTION_STRUCTURE_VALID') return { code: 'INVALID_STRUCTURED_DOMAIN_INPUT' as const }
    return { ...structure, code: 'STRUCTURED_DOMAINS_VALID' as const,
      nameCount: fields.name ? 1 : 0, skillCount: fields.skills.length,
      workCount: analyzeStructuredWork(input, view, sections).length,
      educationFieldCount: Object.values(education).filter(Boolean).length,
      projectCount: analyzeStructuredProjects(input, view, sections).length,
      nonWhitespaceCount: fields.nonWhitespaceCount, warnings: structuredDomainWarnings(input, view, sections) }
  } catch { return { code: 'INVALID_STRUCTURED_DOMAIN_INPUT' as const } }
}
