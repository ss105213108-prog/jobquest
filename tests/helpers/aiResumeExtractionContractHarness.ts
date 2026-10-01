import Ajv from 'ajv'
import {
  factualFields, buildNativeRequest,
  type DomainFields, type ReviewCandidate, type AttemptContext, type ExtractionEnvelope,
} from '../../supabase/functions/_shared/aiResumeExtractionV1.ts'
export * from '../../supabase/functions/_shared/aiResumeExtractionV1.ts'

// Review/matching policy and the independent synthetic factual oracle remain test-only.
const objectSchema = (properties: Record<string, unknown>) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
})
const text = { type: 'string', minLength: 1, maxLength: 2000 }
const strings = { type: 'array', items: text, maxItems: 100 }
const ajv = new Ajv({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false })
const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
)
export const nativeRequestFixture = () => buildNativeRequest('data:application/pdf;base64,JVBERi0=')

const domainText = { type: 'string', maxLength: 2000 }
const domainWorkProperties = { title: text, company: text, location: text, startDate: text,
  endDate: text, durationText: text, description: text }
const validateDomain = ajv.compile<DomainFields>(objectSchema({
  name: domainText, skills: strings, careerDirections: strings,
  education: objectSchema({ school: domainText, department: domainText, graduationStatus: domainText }),
  workExperiences: { type: 'array', maxItems: 20,
    items: { ...objectSchema(domainWorkProperties), required: ['title'] } },
  projects: { type: 'array', maxItems: 20,
    items: { ...objectSchema({ name: text, skills: strings, description: text }), required: ['name', 'skills'] } },
}))
export interface AcceptedCandidate { state: 'ACCEPTED'; fields: DomainFields }
const acceptedByReview = new WeakMap<AcceptedCandidate, DomainFields>()
export function acceptReviewedCandidate(
  candidate: ReviewCandidate, active: AttemptContext, explicitlyConfirmed: boolean,
  edited: unknown = candidate.fields,
): AcceptedCandidate | null {
  if (candidate.state !== 'REVIEW_REQUIRED' || candidate.attemptId !== active.attemptId
    || candidate.documentId !== active.documentId || !explicitlyConfirmed || !validateDomain(edited)
    || !edited.name.trim() || edited.skills.some((value) => !value.trim())
    || edited.careerDirections.some((value) => !value.trim())
    || edited.workExperiences.some((work) => !work.title.trim())
    || edited.projects.some((project) => !project.name.trim() || project.skills.some((value) => !value.trim()))) return null
  const accepted: AcceptedCandidate = { state: 'ACCEPTED', fields: structuredClone(edited) }
  acceptedByReview.set(accepted, structuredClone(edited))
  return accepted
}
export function matchingFields(value: unknown): DomainFields | null {
  if (!record(value) || !acceptedByReview.has(value as AcceptedCandidate)) return null
  if ((value as AcceptedCandidate).state !== 'ACCEPTED') return null
  return structuredClone(acceptedByReview.get(value as AcceptedCandidate)!)
}

export interface AnonymousFact { field: string; value: string; pageNumber: number; excerpt: string }
// This independent anonymous oracle is for evaluation only, never a production factual verifier.
export function compareAnonymousExtraction(envelope: ExtractionEnvelope, expected: readonly AnonymousFact[]): string[] {
  const actual = factualFields(envelope.candidate)
  const truth = new Map(expected.map((fact) => [fact.field, fact]))
  const issues = new Set<string>()
  for (const [field, value] of actual) {
    const source = truth.get(field)
    if (!source || source.value !== value) issues.add('UNSUPPORTED_OR_MISASSOCIATED_FACT')
    if (source && !envelope.evidence.some((evidence) => evidence.field === field
      && evidence.pageNumber === source.pageNumber && evidence.excerpt === source.excerpt)) issues.add('SOURCE_REFERENCE_MISMATCH')
  }
  for (const field of truth.keys()) if (!actual.has(field)) issues.add('REQUIRED_SOURCE_FACT_MISSING')
  return [...issues].sort()
}
