import type { InternalPageLayoutEvidenceResult } from '../../src/parsers/pdfPageLayoutEvidence'
import {
  isAvailablePageLayoutEvidence,
  type AvailablePageLayoutEvidence,
  type VisualGroupFormationResult,
} from '../../src/parsers/pdfVisualGroupResult'

export type VisualGroupPolicyClass =
  | 'MUST_ABSTAIN'
  | 'ELIGIBLE_FOR_RESOLUTION_ANALYSIS'
  | 'REPRESENTATION_LIMITED'
  | 'TRIVIALLY_RESOLVABLE_BY_INVARIANT'

export interface PositiveRuleAdmissionRecord {
  readonly structuralHypothesis: string
  readonly anonymousPositiveFixtureIds: readonly string[]
  readonly matchedNegativeFixtureIds: readonly string[]
  readonly exactEquivalenceSafetyAudit: 'PASS'
  readonly scaleInvariance: 'PASS'
  readonly permutationInvariance: 'PASS'
  readonly syntheticGlyphControl: 'EQUAL_LENGTH_TOKENS' | 'CANONICAL_COMPARATOR'
  readonly exporterNoiseDependency: 'INDEPENDENT' | 'REPRESENTATION_LIMITED'
}

export type PositiveRuleAdmissionIssue =
  | 'NAMED_STRUCTURAL_HYPOTHESIS_REQUIRED'
  | 'ANONYMOUS_POSITIVE_FIXTURE_REQUIRED'
  | 'MATCHED_NEGATIVE_FIXTURE_REQUIRED'
  | 'EXACT_EQUIVALENCE_SAFETY_AUDIT_REQUIRED'
  | 'SCALE_INVARIANCE_REQUIRED'
  | 'PERMUTATION_INVARIANCE_REQUIRED'
  | 'SYNTHETIC_GLYPH_CONTROL_REQUIRED'
  | 'EXPORTER_NOISE_CLASSIFICATION_REQUIRED'

export function executeVisualGroupPolicyForAvailableEvidence(
  evidence: InternalPageLayoutEvidenceResult,
  policy: (input: AvailablePageLayoutEvidence) => VisualGroupFormationResult,
): { readonly executed: false } | { readonly executed: true; readonly result: VisualGroupFormationResult } {
  if (!isAvailablePageLayoutEvidence(evidence)) return { executed: false }
  return { executed: true, result: policy(evidence) }
}

export function auditPositiveRuleAdmission(
  record: Partial<PositiveRuleAdmissionRecord>,
): readonly PositiveRuleAdmissionIssue[] {
  const issues: PositiveRuleAdmissionIssue[] = []
  if (typeof record.structuralHypothesis !== 'string' || record.structuralHypothesis.trim().length === 0) {
    issues.push('NAMED_STRUCTURAL_HYPOTHESIS_REQUIRED')
  }
  if (!Array.isArray(record.anonymousPositiveFixtureIds) || record.anonymousPositiveFixtureIds.length === 0) {
    issues.push('ANONYMOUS_POSITIVE_FIXTURE_REQUIRED')
  }
  if (!Array.isArray(record.matchedNegativeFixtureIds) || record.matchedNegativeFixtureIds.length === 0) {
    issues.push('MATCHED_NEGATIVE_FIXTURE_REQUIRED')
  }
  if (record.exactEquivalenceSafetyAudit !== 'PASS') {
    issues.push('EXACT_EQUIVALENCE_SAFETY_AUDIT_REQUIRED')
  }
  if (record.scaleInvariance !== 'PASS') issues.push('SCALE_INVARIANCE_REQUIRED')
  if (record.permutationInvariance !== 'PASS') issues.push('PERMUTATION_INVARIANCE_REQUIRED')
  if (record.syntheticGlyphControl !== 'EQUAL_LENGTH_TOKENS'
    && record.syntheticGlyphControl !== 'CANONICAL_COMPARATOR') {
    issues.push('SYNTHETIC_GLYPH_CONTROL_REQUIRED')
  }
  if (record.exporterNoiseDependency !== 'INDEPENDENT'
    && record.exporterNoiseDependency !== 'REPRESENTATION_LIMITED') {
    issues.push('EXPORTER_NOISE_CLASSIFICATION_REQUIRED')
  }
  return issues.sort()
}
