import type { ResumeFileType, ResumeProfile } from '../types'

export type FallbackReason = 'INSUFFICIENT_STRUCTURE' | 'UNSUPPORTED_VALID_REPRESENTATION' | 'NO_USABLE_TEXT'
export type HardFailureReason = 'INPUT_REJECTED' | 'DOCUMENT_UNREADABLE' | 'PARSER_FAILURE'
export type RetryClass = 'TRANSIENT' | 'NOT_RETRYABLE' | 'UNCLASSIFIED'
export type SafeDiagnosticStage = 'file-admission' | 'extraction' | 'layout' | 'visual-group'
  | 'serialization' | 'domain-parsing' | 'docx-conversion'

export interface SafeDiagnostic {
  readonly format: ResumeFileType
  readonly stage: SafeDiagnosticStage
  readonly internalCode: string
  readonly pageNumber?: number
  readonly counts?: Readonly<Record<string, number>>
}

export type CandidateProvenance = {
  readonly source: 'DETERMINISTIC' | 'AI_FALLBACK'
  readonly parserVersion: string
}

export interface CandidateEnvelope {
  readonly profile: ResumeProfile
  readonly provenance: CandidateProvenance
}

export type ResumeParseOutcome =
  | { readonly status: 'DETERMINISTIC_SUCCESS'; readonly candidate: CandidateEnvelope; readonly safeDiagnostics?: readonly SafeDiagnostic[] }
  | { readonly status: 'FALLBACK_ELIGIBLE'; readonly reason: FallbackReason; readonly deterministicAttemptProvenance: CandidateProvenance; readonly safeDiagnostics?: readonly SafeDiagnostic[] }
  | { readonly status: 'HARD_FAILURE'; readonly reason: HardFailureReason; readonly retryClass: RetryClass; readonly deterministicAttemptProvenance: CandidateProvenance; readonly safeDiagnostics?: readonly SafeDiagnostic[] }

export type ClassifiedStage =
  | { readonly status: 'SUCCESS'; readonly format: ResumeFileType; readonly stage: SafeDiagnosticStage; readonly pageNumber?: number; readonly diagnostic?: Readonly<Record<string, unknown>> }
  | { readonly status: 'FALLBACK_ELIGIBLE'; readonly format: ResumeFileType; readonly stage: SafeDiagnosticStage; readonly pageNumber?: number; readonly reason: FallbackReason; readonly diagnostic?: Readonly<Record<string, unknown>> }
  | { readonly status: 'HARD_FAILURE'; readonly format: ResumeFileType; readonly stage: SafeDiagnosticStage; readonly pageNumber?: number; readonly reason: HardFailureReason; readonly retryClass?: RetryClass; readonly diagnostic?: Readonly<Record<string, unknown>> }

export type StageAggregate =
  | { readonly status: 'SUCCESS'; readonly safeDiagnostics?: readonly SafeDiagnostic[] }
  | { readonly status: 'FALLBACK_ELIGIBLE'; readonly reason: FallbackReason; readonly safeDiagnostics?: readonly SafeDiagnostic[] }
  | { readonly status: 'HARD_FAILURE'; readonly reason: HardFailureReason; readonly retryClass: RetryClass; readonly safeDiagnostics?: readonly SafeDiagnostic[] }

export interface RequiredStageCompletion {
  readonly extraction: boolean
  readonly structure: boolean
  readonly serialization: boolean
  readonly domainParsing: boolean
}

export class RoutingClassificationRequired extends Error {
  constructor() {
    super('A classified stage, complete deterministic stages, and a valid profile are required.')
  }
}

const formats = new Set(['pdf', 'docx'])
const diagnosticStages = new Set<SafeDiagnosticStage>([
  'file-admission', 'extraction', 'layout', 'visual-group', 'serialization', 'domain-parsing', 'docx-conversion',
])
const fallbackReasons = new Set<FallbackReason>([
  'INSUFFICIENT_STRUCTURE', 'UNSUPPORTED_VALID_REPRESENTATION', 'NO_USABLE_TEXT',
])
const hardReasons = new Set<HardFailureReason>(['INPUT_REJECTED', 'DOCUMENT_UNREADABLE', 'PARSER_FAILURE'])
const retryClasses = new Set<RetryClass>(['TRANSIENT', 'NOT_RETRYABLE', 'UNCLASSIFIED'])
const safeInternalCodes = new Set([
  'INSUFFICIENT_EVIDENCE', 'CONTRACT_VIOLATION', 'INSUFFICIENT_CALIBRATION', 'RUNTIME_FAILURE',
  'INVALID_INTERNAL_STATE', 'UNSUPPORTED_LAYOUT', 'UNSUPPORTED_VALID_REPRESENTATION', 'NO_USABLE_TEXT',
])
const safeCountKeys = new Set(['PAGE_COUNT', 'RUN_COUNT', 'ISSUE_COUNT'])
const forbiddenProfileKeys = ['parserStatus', 'fallbackReason', 'provider', 'model', 'aiGenerated', 'aiFlags']
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const keysAllowed = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every((key) => allowed.includes(key))
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const isPage = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0
const validation = (issues: string[]) => ({ valid: issues.length === 0, issues: issues as readonly string[] })

export function projectSafeDiagnostic(value: Readonly<Record<string, unknown>> | undefined, format: ResumeFileType): SafeDiagnostic | undefined {
  if (!value || !formats.has(format) || !diagnosticStages.has(value.stage as SafeDiagnosticStage)
    || !safeInternalCodes.has(value.internalCode as string)) return undefined
  const counts: Record<string, number> = {}
  if (isRecord(value.counts)) {
    for (const [key, count] of Object.entries(value.counts)) {
      if (safeCountKeys.has(key) && isCount(count)) counts[key] = count
    }
  }
  return {
    format, stage: value.stage as SafeDiagnosticStage, internalCode: value.internalCode as string,
    ...(isPage(value.pageNumber) ? { pageNumber: value.pageNumber as number } : {}),
    ...(Object.keys(counts).length ? { counts: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) } : {}),
  }
}

const validDiagnostic = (value: unknown) => isRecord(value)
  && keysAllowed(value, ['format', 'stage', 'internalCode', 'pageNumber', 'counts'])
  && formats.has(value.format as string)
  && diagnosticStages.has(value.stage as SafeDiagnosticStage)
  && safeInternalCodes.has(value.internalCode as string)
  && (value.pageNumber === undefined || isPage(value.pageNumber))
  && (value.counts === undefined || (isRecord(value.counts)
    && Object.entries(value.counts).every(([key, count]) => safeCountKeys.has(key) && isCount(count))))

const validProvenance = (value: unknown, deterministicOnly = false) => isRecord(value)
  && keysAllowed(value, ['source', 'parserVersion'])
  && (deterministicOnly ? value.source === 'DETERMINISTIC' : ['DETERMINISTIC', 'AI_FALLBACK'].includes(value.source as string))
  && typeof value.parserVersion === 'string' && value.parserVersion.trim().length > 0

export function validateCandidateEnvelope(value: unknown): { readonly valid: boolean; readonly issues: readonly string[] } {
  const issues: string[] = []
  if (!isRecord(value) || !keysAllowed(value, ['profile', 'provenance'])) return validation(['INVALID_ENVELOPE'])
  const profile = value.profile
  if (!isRecord(profile)
    || typeof profile.id !== 'string' || typeof profile.name !== 'string'
    || !Array.isArray(profile.skills) || profile.skills.some((item) => typeof item !== 'string')
    || !Array.isArray(profile.projects) || profile.projects.some((item) => !isRecord(item)
      || typeof item.name !== 'string' || !Array.isArray(item.skills) || item.skills.some((skill) => typeof skill !== 'string'))
    || !Array.isArray(profile.workExperiences) || profile.workExperiences.some((item) => !isRecord(item) || typeof item.title !== 'string')
    || !isRecord(profile.education) || typeof profile.education.school !== 'string'
    || typeof profile.education.department !== 'string' || typeof profile.education.graduationStatus !== 'string'
    || !Array.isArray(profile.careerDirections) || profile.careerDirections.some((item) => typeof item !== 'string')
    || typeof profile.updatedAt !== 'string' || typeof profile.level !== 'number' || !Number.isFinite(profile.level)
    || !Array.isArray(profile.abilities) || profile.abilities.some((item) => !isRecord(item)
      || typeof item.label !== 'string' || typeof item.value !== 'number' || !Number.isFinite(item.value))) issues.push('INVALID_PROFILE')
  if (isRecord(profile) && (forbiddenProfileKeys.some((key) => key in profile)
    || (isRecord(profile.parseMetadata) && forbiddenProfileKeys.some((key) => key in (profile.parseMetadata as Record<string, unknown>))))) {
    issues.push('ROUTING_DATA_IN_PROFILE')
  }
  if (!validProvenance(value.provenance)) issues.push('INVALID_PROVENANCE')
  return validation(issues)
}

export function validateResumeParseOutcome(value: unknown): { readonly valid: boolean; readonly issues: readonly string[] } {
  if (!isRecord(value)) return validation(['INVALID_OUTCOME'])
  const issues: string[] = []
  if (value.safeDiagnostics !== undefined && (!Array.isArray(value.safeDiagnostics)
    || value.safeDiagnostics.some((item) => !validDiagnostic(item)))) issues.push('INVALID_SAFE_DIAGNOSTICS')
  if (value.status === 'DETERMINISTIC_SUCCESS') {
    if (!keysAllowed(value, ['status', 'candidate', 'safeDiagnostics'])) issues.push('SUCCESS_SCHEMA_CONFLICT')
    issues.push(...validateCandidateEnvelope(value.candidate).issues)
    if (isRecord(value.candidate) && !validProvenance(value.candidate.provenance, true)) issues.push('SUCCESS_PROVENANCE_MUST_BE_DETERMINISTIC')
  } else if (value.status === 'FALLBACK_ELIGIBLE') {
    if (!keysAllowed(value, ['status', 'reason', 'deterministicAttemptProvenance', 'safeDiagnostics'])) issues.push('FALLBACK_SCHEMA_CONFLICT')
    if (!fallbackReasons.has(value.reason as FallbackReason)) issues.push('INVALID_FALLBACK_REASON')
  } else if (value.status === 'HARD_FAILURE') {
    if (!keysAllowed(value, ['status', 'reason', 'retryClass', 'deterministicAttemptProvenance', 'safeDiagnostics'])) issues.push('HARD_FAILURE_SCHEMA_CONFLICT')
    if (!hardReasons.has(value.reason as HardFailureReason)) issues.push('INVALID_HARD_REASON')
    if (!retryClasses.has(value.retryClass as RetryClass)) issues.push('INVALID_RETRY_CLASS')
  } else issues.push('INVALID_STATUS')
  if (value.status === 'FALLBACK_ELIGIBLE' || value.status === 'HARD_FAILURE') {
    if (!validProvenance(value.deterministicAttemptProvenance, true)) issues.push('INVALID_ATTEMPT_PROVENANCE')
  }
  return validation(issues)
}

const diagnosticsOf = (stages: readonly ClassifiedStage[]) => stages
  .map((item) => projectSafeDiagnostic(item.diagnostic, item.format))
  .filter((item): item is SafeDiagnostic => item !== undefined)
  .sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0)
    || a.stage.localeCompare(b.stage) || a.internalCode.localeCompare(b.internalCode))

export function aggregateClassifiedStages(stages: readonly ClassifiedStage[]): StageAggregate {
  if (!Array.isArray(stages) || !stages.length) throw new RoutingClassificationRequired()
  const seen = new Set<string>()
  const documentFormat = stages[0]?.format
  for (const item of stages) {
    if (!isRecord(item) || !['SUCCESS', 'FALLBACK_ELIGIBLE', 'HARD_FAILURE'].includes(item.status as string)
      || !formats.has(item.format as string) || item.format !== documentFormat
      || !diagnosticStages.has(item.stage as SafeDiagnosticStage)
      || (item.pageNumber !== undefined && !isPage(item.pageNumber))
      || (item.status === 'SUCCESS' && !keysAllowed(item, ['status', 'format', 'stage', 'pageNumber', 'diagnostic']))
      || (item.status === 'FALLBACK_ELIGIBLE' && (!keysAllowed(item, ['status', 'format', 'stage', 'pageNumber', 'reason', 'diagnostic'])
        || !fallbackReasons.has(item.reason as FallbackReason)))
      || (item.status === 'HARD_FAILURE' && (!keysAllowed(item, ['status', 'format', 'stage', 'pageNumber', 'reason', 'retryClass', 'diagnostic'])
        || !hardReasons.has(item.reason as HardFailureReason)
        || (item.retryClass !== undefined && !retryClasses.has(item.retryClass as RetryClass))))
      || (item.diagnostic !== undefined && !isRecord(item.diagnostic))) throw new RoutingClassificationRequired()
    const key = `${item.format}:${item.stage}:${item.pageNumber ?? 'document'}`
    if (seen.has(key)) throw new RoutingClassificationRequired()
    seen.add(key)
  }
  const diagnostics = diagnosticsOf(stages)
  const safeDiagnostics = diagnostics.length ? { safeDiagnostics: diagnostics } : {}
  const order = (a: ClassifiedStage, b: ClassifiedStage) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0)
    || a.stage.localeCompare(b.stage)
    || ('reason' in a ? a.reason : '').localeCompare('reason' in b ? b.reason : '')
  const hard = stages.filter((item) => item.status === 'HARD_FAILURE').sort(order)[0]
  if (hard?.status === 'HARD_FAILURE') return { status: 'HARD_FAILURE', reason: hard.reason, retryClass: hard.retryClass ?? 'UNCLASSIFIED', ...safeDiagnostics }
  const fallback = stages.filter((item) => item.status === 'FALLBACK_ELIGIBLE').sort(order)[0]
  if (fallback?.status === 'FALLBACK_ELIGIBLE') return { status: 'FALLBACK_ELIGIBLE', reason: fallback.reason, ...safeDiagnostics }
  return { status: 'SUCCESS', ...safeDiagnostics }
}

export function createDocumentOutcome(input: {
  readonly aggregate: StageAggregate
  readonly parserVersion: string
  readonly profile?: ResumeProfile
  readonly completedStages?: RequiredStageCompletion
}): ResumeParseOutcome {
  if (!isRecord(input) || !isRecord(input.aggregate) || typeof input.parserVersion !== 'string' || !input.parserVersion.trim()) throw new RoutingClassificationRequired()
  const aggregate = input.aggregate
  if ((aggregate.status === 'SUCCESS' && !keysAllowed(aggregate, ['status', 'safeDiagnostics']))
    || (aggregate.status === 'FALLBACK_ELIGIBLE' && (!keysAllowed(aggregate, ['status', 'reason', 'safeDiagnostics'])
      || !fallbackReasons.has(aggregate.reason as FallbackReason)))
    || (aggregate.status === 'HARD_FAILURE' && (!keysAllowed(aggregate, ['status', 'reason', 'retryClass', 'safeDiagnostics'])
      || !hardReasons.has(aggregate.reason as HardFailureReason) || !retryClasses.has(aggregate.retryClass as RetryClass)))
    || (aggregate.safeDiagnostics !== undefined && (!Array.isArray(aggregate.safeDiagnostics)
      || aggregate.safeDiagnostics.some((item) => !validDiagnostic(item))))) throw new RoutingClassificationRequired()
  const safeDiagnostics = aggregate.safeDiagnostics === undefined ? {} : { safeDiagnostics: structuredClone(aggregate.safeDiagnostics) }
  const provenance: CandidateProvenance = { source: 'DETERMINISTIC', parserVersion: input.parserVersion }
  let outcome: ResumeParseOutcome
  if (aggregate.status === 'HARD_FAILURE') {
    if (input.profile !== undefined || input.completedStages !== undefined) throw new RoutingClassificationRequired()
    outcome = { status: 'HARD_FAILURE', reason: aggregate.reason as HardFailureReason, retryClass: aggregate.retryClass as RetryClass, deterministicAttemptProvenance: provenance, ...safeDiagnostics }
  } else if (aggregate.status === 'FALLBACK_ELIGIBLE') {
    if (input.profile !== undefined || input.completedStages !== undefined) throw new RoutingClassificationRequired()
    outcome = { status: 'FALLBACK_ELIGIBLE', reason: aggregate.reason as FallbackReason, deterministicAttemptProvenance: provenance, ...safeDiagnostics }
  } else if (aggregate.status === 'SUCCESS') {
    if (!isRecord(input.completedStages) || !['extraction', 'structure', 'serialization', 'domainParsing'].every((key) => input.completedStages?.[key as keyof RequiredStageCompletion] === true)
      || !validateCandidateEnvelope({ profile: input.profile, provenance }).valid) throw new RoutingClassificationRequired()
    outcome = { status: 'DETERMINISTIC_SUCCESS', candidate: { profile: structuredClone(input.profile) as ResumeProfile, provenance }, ...safeDiagnostics }
  } else throw new RoutingClassificationRequired()
  if (!validateResumeParseOutcome(outcome).valid) throw new RoutingClassificationRequired()
  return outcome
}
