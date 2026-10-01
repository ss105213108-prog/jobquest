import { resumeSourceDocumentIssues, type ResumeSourceDocument } from '../../src/parsers/resumeSourceDocument'
import type { PdfPageManifest, SerializedDocument } from '../../src/parsers/pdfSerialization'
import { createResumeAnalysisView as analysisView } from '../../src/parsers/resumeStructuredAnalysis'
import { detectStructuredResumeSections as structuredSections } from '../../src/parsers/structuredResumeSections'
import { analyzeStructuredWork, analyzeStructuredEducation, analyzeStructuredProjects, analyzeStructuredProfileFields,
  analyzeStructuredSkills, findStructuredUnitMatches, structuredLineWindow, structuredDomainWarnings,
  getStructuredDomainInputs } from '../../src/parsers/structuredResumeDomains'
import { resumeAnalyzer } from '../../src/analyzers/resumeAnalyzer'
import type { ResumeProfile } from '../../src/types'

// Fixtures and test-only profile composition; all domain recognition comes from production.
export interface Scenario {
  manifest: PdfPageManifest
  serialized: SerializedDocument
  source: ResumeSourceDocument
}

export function scenario(pages: readonly (readonly string[])[]): Scenario {
  const manifest = { pageCount: pages.length, canonicalPageNumbers: pages.map((_, index) => index + 1) }
  const serialized = { pages: pages.map((texts, index) => ({
    pageNumber: index + 1,
    orderedUnits: texts.map((text, runId) => ({ groupId: `anonymous:${runId}`, runId, text })),
  })) }
  const source: ResumeSourceDocument = { sourceKind: 'PDF', pages: serialized.pages.map((page) => ({
    pageNumber: page.pageNumber, units: page.orderedUnits.map((unit) => ({
      text: unit.text, provenance: { pageNumber: page.pageNumber, groupId: unit.groupId, runId: unit.runId },
    })),
  })) }
  if (resumeSourceDocumentIssues(manifest, serialized, source).length) throw new Error('INVALID_FIXTURE')
  return { manifest, serialized, source }
}

export const domainInputs = getStructuredDomainInputs

function context(input: Scenario) {
  const view = analysisView(input)
  return { view, sections: structuredSections(input, view) }
}

export function authoritativeWindow(input: Scenario, start: number, count: number) {
  const { view, sections } = context(input)
  return structuredLineWindow(input, view, sections, start, count)
}

export function structuredSkills(input: Scenario) {
  const { view, sections } = context(input)
  return analyzeStructuredSkills(input, view, sections)
}

export function localRuleObservation(input: Scenario, pattern: RegExp) {
  const { view, sections } = context(input)
  return findStructuredUnitMatches(input, view, sections, pattern)
}

// RP-110 profile orchestration is not implemented in production. This fixture only checks existing schema compatibility.
export function analyzeSourceContract(input: Scenario, candidate: unknown = input.source) {
  const view = analysisView(input, candidate)
  const sections = structuredSections(input, view)
  const inputs = domainInputs(input, view, sections)
  const fields = analyzeStructuredProfileFields(input, view, sections)
  const workExperiences = analyzeStructuredWork(input, view, sections)
  const education = analyzeStructuredEducation(input, view, sections)
  const projects = analyzeStructuredProjects(input, view, sections)
  const profile: ResumeProfile = {
    id: 'resume-contract', updatedAt: '2000-01-01T00:00:00.000Z',
    name: fields.name, skills: fields.skills, careerDirections: fields.careerDirections,
    abilities: fields.abilities, level: fields.level, workExperiences, education, projects,
    parseMetadata: { parserVersion: 1, source: { fileName: 'anonymous.pdf', fileType: 'pdf', pageCount: input.source.pages.length },
      detectedSections: [...sections.detectedKeys], skillAliasesMatched: fields.aliasMatches,
      warnings: structuredDomainWarnings(input, view, sections) },
  }
  return { view, sections, inputs, profile, nonWhitespaceCount: fields.nonWhitespaceCount }
}

// Test-only entry inventory. No production caller, switch or dual run is introduced.
export const dualEntry = { analyzeLegacy: resumeAnalyzer.analyze, analyzeSource: analyzeSourceContract }
