import { resumeSourceDocumentIssues, type ResumeSourceDocument } from './resumeSourceDocument'
import type { PdfPageManifest, SerializedDocument } from './pdfSerialization'

export interface ResumeAnalysisInput {
  readonly manifest: PdfPageManifest
  readonly serialized: SerializedDocument
  readonly source: ResumeSourceDocument
}
export interface SourceRef {
  pageNumber: number
  unitIndex: number
  groupId: string
  runId: number
  rawStart: number
  rawEnd: number
}
export type AnalysisEdge = 'DOCUMENT_EDGE' | 'SOURCE_BREAK' | 'UNIT_EDGE' | 'PAGE_EDGE'
export interface ResumeAnalysisSegment {
  kind: 'TEXT'
  ordinal: number
  sourceRef: SourceRef
  rawText: string
  analysisText: string
  leading: AnalysisEdge
  trailing: AnalysisEdge
  authoredLine: boolean
  completeLine: boolean
}
export type AnalysisLineSlice = ResumeAnalysisSegment
export interface AuthoredBreak {
  kind: 'SOURCE_BREAK'
  spelling: '\n' | '\r\n' | '\r'
  analysisSpelling: string
  sourceRef: SourceRef
}
export interface AnalysisTransition {
  kind: 'UNIT_TRANSITION' | 'PAGE_TRANSITION'
  fromPage: number
  toPage: number
  toUnit: number
}
export interface ResumeAnalysisDocument {
  pages: Array<{ pageNumber: number; segmentOrdinals: number[] }>
  segments: ResumeAnalysisSegment[]
  breaks: AuthoredBreak[]
  events: Array<ResumeAnalysisSegment | AuthoredBreak | AnalysisTransition>
}

export const normalizationOperations = Object.freeze([
  { id: 'NFKC', classification: 'SEMANTIC_OR_LOSSY' },
  { id: 'LINE_ENDINGS', classification: 'SOURCE_SAFE_LEXICAL' },
  { id: 'DELETE_CONTROLS', classification: 'SEMANTIC_OR_LOSSY' },
  { id: 'BULLET_REWRITE', classification: 'SEMANTIC_OR_LOSSY' },
  { id: 'DOCUMENT_LINE_SPLIT', classification: 'STRUCTURAL_FLATTENING' },
  { id: 'HORIZONTAL_SPACE', classification: 'SOURCE_SAFE_LEXICAL' },
  { id: 'LINE_COMPARISON_TRIM', classification: 'SOURCE_SAFE_LEXICAL' },
  { id: 'LINE_JOIN', classification: 'STRUCTURAL_FLATTENING' },
  { id: 'BLANK_LINE_COLLAPSE', classification: 'STRUCTURAL_FLATTENING' },
  { id: 'DOCUMENT_TRIM', classification: 'STRUCTURAL_FLATTENING' },
].map((operation) => Object.freeze(operation)))
const automaticOperations: readonly string[] = Object.freeze(['LINE_ENDINGS', 'HORIZONTAL_SPACE', 'LINE_COMPARISON_TRIM'])

export type ResumeAnalysisIssue = 'INVALID_SOURCE_DOCUMENT' | 'NORMALIZATION_NOT_APPROVED'
  | 'INVALID_ANALYSIS_STRUCTURE' | 'INVALID_SOURCE_REFERENCE'
export class ResumeAnalysisValidationError extends Error {
  constructor(readonly code: ResumeAnalysisIssue) { super(code) }
}

function validateOperations(operations: readonly string[]): void {
  try {
    if (!Array.isArray(operations) || Array.from(operations).some((id) => !automaticOperations.includes(id))) {
      throw new ResumeAnalysisValidationError('NORMALIZATION_NOT_APPROVED')
    }
  } catch { throw new ResumeAnalysisValidationError('NORMALIZATION_NOT_APPROVED') }
}

export function localAnalysisText(raw: string, operations: readonly string[] = automaticOperations): string {
  validateOperations(operations)
  const endings = operations.includes('LINE_ENDINGS') ? raw.replace(/\r\n?/g, '\n') : raw
  const horizontal = operations.includes('HORIZONTAL_SPACE') ? endings.replace(/[\t ]+/g, ' ') : endings
  return operations.includes('LINE_COMPARISON_TRIM') ? horizontal.trim() : horizontal
}

export function createResumeAnalysisView(input: ResumeAnalysisInput, candidate?: unknown,
  operations: readonly string[] = automaticOperations): ResumeAnalysisDocument {
  validateOperations(operations)
  try {
    const sourceCandidate = candidate === undefined ? input.source : candidate
    if (resumeSourceDocumentIssues(input.manifest, input.serialized, sourceCandidate).length) {
      throw new ResumeAnalysisValidationError('INVALID_SOURCE_DOCUMENT')
    }
    const source = sourceCandidate as ResumeSourceDocument
    const view: ResumeAnalysisDocument = { pages: [], segments: [], breaks: [], events: [] }
    source.pages.forEach((page, pageIndex) => {
      const pageView = { pageNumber: page.pageNumber, segmentOrdinals: [] as number[] }
      view.pages.push(pageView)
      if (pageIndex) view.events.push({ kind: 'PAGE_TRANSITION', fromPage: source.pages[pageIndex - 1].pageNumber,
        toPage: page.pageNumber, toUnit: 0 })
      page.units.forEach((unit, unitIndex) => {
        if (unitIndex) view.events.push({ kind: 'UNIT_TRANSITION', fromPage: page.pageNumber, toPage: page.pageNumber, toUnit: unitIndex })
        const makeRef = (rawStart: number, rawEnd: number): SourceRef => ({
          pageNumber: page.pageNumber, unitIndex, groupId: unit.provenance.groupId, runId: unit.provenance.runId, rawStart, rawEnd,
        })
        let start = 0
        let leading: AnalysisEdge = pageIndex === 0 && unitIndex === 0 ? 'DOCUMENT_EDGE' : unitIndex ? 'UNIT_EDGE' : 'PAGE_EDGE'
        const emit = (end: number, trailing: AnalysisEdge) => {
          const rawText = unit.text.slice(start, end)
          const authoredLine = leading === 'SOURCE_BREAK' || trailing === 'SOURCE_BREAK'
          const completeLine = authoredLine && ![leading, trailing].some((edge) => edge === 'UNIT_EDGE' || edge === 'PAGE_EDGE')
          const segment: ResumeAnalysisSegment = { kind: 'TEXT', ordinal: view.segments.length, sourceRef: makeRef(start, end),
            rawText, analysisText: localAnalysisText(rawText, operations), leading, trailing, authoredLine, completeLine }
          view.segments.push(segment)
          pageView.segmentOrdinals.push(segment.ordinal)
          view.events.push(segment)
        }
        for (const match of unit.text.matchAll(/\r\n|\r|\n/g)) {
          emit(match.index, 'SOURCE_BREAK')
          const event: AuthoredBreak = { kind: 'SOURCE_BREAK', spelling: match[0] as AuthoredBreak['spelling'],
            analysisSpelling: operations.includes('LINE_ENDINGS') ? '\n' : match[0],
            sourceRef: makeRef(match.index, match.index + match[0].length) }
          view.breaks.push(event)
          view.events.push(event)
          start = match.index + match[0].length
          leading = 'SOURCE_BREAK'
        }
        emit(unit.text.length, pageIndex === source.pages.length - 1 && unitIndex === page.units.length - 1
          ? 'DOCUMENT_EDGE' : unitIndex < page.units.length - 1 ? 'UNIT_EDGE' : 'PAGE_EDGE')
      })
    })
    return view
  } catch {
    throw new ResumeAnalysisValidationError('INVALID_SOURCE_DOCUMENT')
  }
}

// Exact structured correspondence also checks holes, extra fields, event order and duplicated/dropped ranges.
export function sameAnalysisStructure(actual: unknown, expected: unknown): boolean {
  if (actual === null || expected === null || typeof actual !== 'object' || typeof expected !== 'object') return actual === expected
  if (Array.isArray(actual) !== Array.isArray(expected)) return false
  const keys = Reflect.ownKeys(expected)
  if (Reflect.ownKeys(actual).length !== keys.length) return false
  return keys.every((key) => Object.hasOwn(actual, key)
    && sameAnalysisStructure((actual as Record<PropertyKey, unknown>)[key], (expected as Record<PropertyKey, unknown>)[key]))
}

export function sourceReferenceIssues(input: ResumeAnalysisInput, value: unknown): readonly ResumeAnalysisIssue[] {
  try {
    if (resumeSourceDocumentIssues(input.manifest, input.serialized, input.source).length) return ['INVALID_SOURCE_DOCUMENT']
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ['INVALID_SOURCE_REFERENCE']
    const ref = value as SourceRef
    const keys = ['pageNumber', 'unitIndex', 'groupId', 'runId', 'rawStart', 'rawEnd']
    if (Reflect.ownKeys(ref).length !== keys.length || !keys.every((key) => Object.hasOwn(ref, key))
      || ![ref.pageNumber, ref.unitIndex, ref.runId, ref.rawStart, ref.rawEnd].every(Number.isSafeInteger)
      || ref.pageNumber < 1 || ref.unitIndex < 0 || ref.runId < 0 || ref.rawStart < 0 || ref.rawEnd < ref.rawStart) return ['INVALID_SOURCE_REFERENCE']
    const unit = input.source.pages.find((page) => page.pageNumber === ref.pageNumber)?.units[ref.unitIndex]
    if (!unit || ref.groupId !== unit.provenance.groupId || ref.runId !== unit.provenance.runId || ref.rawEnd > unit.text.length) return ['INVALID_SOURCE_REFERENCE']
    const insideCrLf = (offset: number) => offset > 0 && unit.text[offset - 1] === '\r' && unit.text[offset] === '\n'
    if (insideCrLf(ref.rawStart) || insideCrLf(ref.rawEnd)) return ['INVALID_SOURCE_REFERENCE']
    return []
  } catch { return ['INVALID_SOURCE_REFERENCE'] }
}

export function resumeAnalysisIssues(input: ResumeAnalysisInput, candidate: unknown,
  operations: readonly string[] = automaticOperations): readonly ResumeAnalysisIssue[] {
  try {
    const expected = createResumeAnalysisView(input, input.source, operations)
    return sameAnalysisStructure(candidate, expected) ? [] : ['INVALID_ANALYSIS_STRUCTURE']
  } catch (error) {
    return [error instanceof ResumeAnalysisValidationError ? error.code : 'INVALID_ANALYSIS_STRUCTURE']
  }
}

export function projectResumeAnalysisDiagnostic(input: ResumeAnalysisInput, candidate: unknown) {
  try {
    if (resumeAnalysisIssues(input, candidate).length) return { code: 'INVALID_ANALYSIS_STRUCTURE' as const }
    const view = candidate as ResumeAnalysisDocument
    return { code: 'ANALYSIS_STRUCTURE_VALID' as const, pageCount: view.pages.length,
      unitCount: input.source.pages.reduce((count, page) => count + page.units.length, 0),
      segmentCount: view.segments.length, breakCount: view.breaks.length,
      authoredLineCount: view.segments.filter((segment) => segment.authoredLine).length,
      references: view.segments.map(({ sourceRef }) => ({ pageNumber: sourceRef.pageNumber, unitIndex: sourceRef.unitIndex,
        rawStart: sourceRef.rawStart, rawEnd: sourceRef.rawEnd, runId: sourceRef.runId })) }
  } catch { return { code: 'INVALID_ANALYSIS_STRUCTURE' as const } }
}
