import { detectResumeSections, type ResumeSectionKey } from '../analyzers/sectionDetector'
import { createResumeAnalysisView, localAnalysisText, resumeAnalysisIssues, sameAnalysisStructure,
  projectResumeAnalysisDiagnostic, type AnalysisLineSlice, type ResumeAnalysisDocument,
  type ResumeAnalysisInput, type ResumeAnalysisSegment } from './resumeStructuredAnalysis'

export interface SectionOccurrence {
  key: ResumeSectionKey
  heading: AnalysisLineSlice
  inline?: AnalysisLineSlice
  body: AnalysisLineSlice[]
}
export interface StructuredResumeSections {
  occurrences: SectionOccurrence[]
  sections: Partial<Record<ResumeSectionKey, AnalysisLineSlice[]>>
  preamble: AnalysisLineSlice[]
  detectedKeys: ResumeSectionKey[]
}
export type StructuredSectionIssue = 'INVALID_ANALYSIS_STRUCTURE' | 'INVALID_SECTION_STRUCTURE'
export class StructuredSectionValidationError extends Error {
  constructor(readonly code: StructuredSectionIssue) { super(code) }
}

function sourceSlice(segment: ResumeAnalysisSegment, start = 0, end = segment.rawText.length): AnalysisLineSlice {
  const raw = segment.rawText.slice(start, end)
  const trimStart = raw.length - raw.trimStart().length
  const trimEnd = raw.trimEnd().length
  const rawText = raw.slice(trimStart, Math.max(trimStart, trimEnd))
  return { ...segment, sourceRef: { ...segment.sourceRef,
    rawStart: segment.sourceRef.rawStart + start + trimStart,
    rawEnd: segment.sourceRef.rawStart + start + Math.max(trimStart, trimEnd),
  }, rawText, analysisText: localAnalysisText(rawText),
  completeLine: segment.completeLine && rawText === segment.rawText.trim() }
}

// Reuse the legacy alias predicate on one bounded fragment only; never give it joined units or pages.
function heading(candidate: AnalysisLineSlice): { key: ResumeSectionKey; inline?: AnalysisLineSlice } | undefined {
  const recognized = detectResumeSections(candidate.analysisText)
  if (recognized.preamble.length || recognized.detectedSections.length !== 1) return undefined
  const key = recognized.detectedSections[0]
  const colon = candidate.rawText.search(/[:：]/)
  const inline = colon >= 0 && recognized.sections[key] ? sourceSlice(candidate, colon + 1) : undefined
  return { key, ...(inline ? { inline } : {}) }
}

export function detectStructuredResumeSections(input: ResumeAnalysisInput, candidate?: unknown): StructuredResumeSections {
  try {
    const view = candidate === undefined ? createResumeAnalysisView(input) : candidate
    if (resumeAnalysisIssues(input, view).length) throw new StructuredSectionValidationError('INVALID_ANALYSIS_STRUCTURE')
    const result: StructuredResumeSections = { occurrences: [], sections: {}, preamble: [], detectedKeys: [] }
    let current: SectionOccurrence | undefined
    const addBody = (body: AnalysisLineSlice) => {
      if (!body.analysisText) return
      if (!current) result.preamble.push(body)
      else { current.body.push(body); result.sections[current.key]!.push(body) }
    }
    const begin = (slice: AnalysisLineSlice, match: NonNullable<ReturnType<typeof heading>>, replace: boolean) => {
      if (!(match.key in result.sections)) { result.sections[match.key] = []; result.detectedKeys.push(match.key) }
      current = { key: match.key, heading: slice, ...(match.inline ? { inline: match.inline } : {}), body: [] }
      result.occurrences.push(current)
      if (match.inline) {
        if (replace) result.sections[match.key] = []
        addBody(match.inline)
      }
    }
    for (const segment of (view as ResumeAnalysisDocument).segments) {
      const slice = sourceSlice(segment)
      // An opaque authored-line edge is not whole-line equality evidence. A whole-unit candidate is distinct.
      if (segment.authoredLine && !segment.completeLine) { addBody(slice); continue }
      const direct = heading(slice)
      if (direct) { begin(slice, direct, true); continue }
      if (!slice.analysisText) continue
      const parts = [...slice.rawText.matchAll(/[^・]+/g)]
        .map((match) => sourceSlice(slice, match.index, match.index + match[0].length)).filter((part) => part.analysisText)
      const firstHeading = parts.findIndex((part) => heading(part))
      if (firstHeading > 0) {
        const prefixEnd = parts[firstHeading - 1].sourceRef.rawEnd - slice.sourceRef.rawStart
        addBody(sourceSlice(slice, 0, prefixEnd))
        for (const part of parts.slice(firstHeading)) {
          const match = heading(part)
          if (match) begin(part, match, false)
          else addBody(part)
        }
      } else addBody(slice)
    }
    return result
  } catch { throw new StructuredSectionValidationError('INVALID_ANALYSIS_STRUCTURE') }
}

export function structuredSectionIssues(input: ResumeAnalysisInput, view: unknown, candidate: unknown): readonly StructuredSectionIssue[] {
  try {
    if (resumeAnalysisIssues(input, view).length) return ['INVALID_ANALYSIS_STRUCTURE']
    return sameAnalysisStructure(candidate, detectStructuredResumeSections(input, view)) ? [] : ['INVALID_SECTION_STRUCTURE']
  } catch { return ['INVALID_SECTION_STRUCTURE'] }
}

export function projectStructuredSectionDiagnostic(input: ResumeAnalysisInput, view: unknown, candidate: unknown) {
  try {
    if (structuredSectionIssues(input, view, candidate).length) return { code: 'INVALID_SECTION_STRUCTURE' as const }
    const analysis = projectResumeAnalysisDiagnostic(input, view)
    if (analysis.code !== 'ANALYSIS_STRUCTURE_VALID') return { code: 'INVALID_SECTION_STRUCTURE' as const }
    return { ...analysis, code: 'SECTION_STRUCTURE_VALID' as const,
      sectionCount: (candidate as StructuredResumeSections).occurrences.length }
  } catch { return { code: 'INVALID_SECTION_STRUCTURE' as const } }
}
