import { describe, expect, it, vi } from 'vitest'
import { constructPageLayoutEvidence } from '../src/parsers/pdfPageLayoutEvidence'
import { validateRowEvidenceGraph } from '../src/parsers/pdfRowEvidenceGraph'
import {
  isAvailablePageLayoutEvidence,
  validateVisualGroupFormationResult,
  type VisualGroupFormationResult,
} from '../src/parsers/pdfVisualGroupResult'
import {
  VISUAL_GROUP_STRENGTHENED_AMBIGUITY_SET,
  visualGroupFixtureById,
} from './fixtures/pdfVisualGroupGroundTruth'
import { materializeVisualGroupGroundTruth } from './helpers/pdfVisualGroupGroundTruthHarness'
import {
  emptyRowEvidenceGraph,
  executeIfVisualGroupAdmitted,
  fabricatedEmptyAvailableEvidence,
  fabricatedSingleRunAvailableEvidence,
} from './helpers/pdfVisualGroupAdmissionContractHarness'

const materialize = (fixtureId: string) => materializeVisualGroupGroundTruth(
  visualGroupFixtureById(fixtureId),
)

const zeroRunResolved = (pageNumber: number): VisualGroupFormationResult => ({
  status: 'RESOLVED',
  pageNumber,
  groups: [],
})

const zeroRunInsufficient = (pageNumber: number): VisualGroupFormationResult => ({
  status: 'INSUFFICIENT_EVIDENCE',
  pageNumber,
  diagnostic: { reasonCode: 'INSUFFICIENT_CONTEXT', counts: { runCount: 0 } },
})

const zeroRunFailed = (pageNumber: number): VisualGroupFormationResult => ({
  status: 'FAILED',
  pageNumber,
  code: 'INVALID_INPUT_STRUCTURE',
  issues: [{ code: 'ZERO_RUN_AVAILABLE_NOT_ADMISSIBLE', count: 0 }],
})

describe('RP-069 upstream zero-run lifecycle and low-level graph scope', () => {
  it('keeps real zero-run construction upstream as UNAVAILABLE and never executes VisualGroup', () => {
    const result = constructPageLayoutEvidence({
      items: [],
      pageBounds: { minX: 0, maxX: 600, width: 600, source: 'pdf-page-view' },
      pageNumber: 1,
    })
    const formation = vi.fn()

    expect(result).toEqual({
      status: 'UNAVAILABLE',
      pageNumber: 1,
      stage: 'vertical-calibration',
      code: 'INSUFFICIENT_CALIBRATION',
    })
    expect(isAvailablePageLayoutEvidence(result)).toBe(false)
    expect(executeIfVisualGroupAdmitted(result, formation)).toEqual({ executed: false })
    expect(formation).not.toHaveBeenCalled()
  })

  it('keeps an empty RowEvidenceGraph valid at the low-level foundation seam', () => {
    expect(validateRowEvidenceGraph(emptyRowEvidenceGraph())).toEqual({ valid: true, issues: [] })
  })
})

describe('RP-069 non-empty VisualGroup admission invariant', () => {
  it('rejects fabricated AVAILABLE evidence with an empty canonical graph at runtime', () => {
    const pageOne = fabricatedEmptyAvailableEvidence(1)
    const pageNine = fabricatedEmptyAvailableEvidence(9)

    expect(pageOne.status).toBe('AVAILABLE')
    expect(pageNine.status).toBe('AVAILABLE')
    expect([
      isAvailablePageLayoutEvidence(pageOne),
      isAvailablePageLayoutEvidence(pageNine),
    ]).toEqual([false, false])
  })

  it('does not mutate or rewrite a fabricated empty AVAILABLE object while checking admission', () => {
    const evidence = fabricatedEmptyAvailableEvidence()
    const before = JSON.stringify(evidence)
    isAvailablePageLayoutEvidence(evidence)
    expect(JSON.stringify(evidence)).toBe(before)
    expect(evidence.status).toBe('AVAILABLE')
  })

  it('admits an AVAILABLE page containing exactly one safe canonical run', () => {
    expect(isAvailablePageLayoutEvidence(fabricatedSingleRunAvailableEvidence('safe'))).toBe(true)
  })

  it('admits a contract-valid AVAILABLE page containing exactly one isolated unsafe run', () => {
    const evidence = fabricatedSingleRunAvailableEvidence('unsafe')
    expect(evidence.horizontalEvidence.availability).toMatchObject({
      safeRunState: 'NONE',
      verticalContext: 'NONE',
      excludedUnsafeRunIds: [0],
    })
    expect(isAvailablePageLayoutEvidence(evidence)).toBe(true)
  })

  it('admits valid multi-run AVAILABLE evidence without declaring membership sufficient', () => {
    const evidence = materialize('SPARSE_INLINE_EXACT').result
    expect(evidence.graph.runs.length).toBeGreaterThan(1)
    expect(isAvailablePageLayoutEvidence(evidence)).toBe(true)
    expect(validateVisualGroupFormationResult({
      evidence,
      result: {
        status: 'INSUFFICIENT_EVIDENCE',
        pageNumber: evidence.pageNumber,
        diagnostic: { reasonCode: 'AMBIGUOUS_STRUCTURAL_EVIDENCE' },
      },
    })).toEqual({ valid: true, issues: [] })
  })

  it('preserves non-empty admission for exact-opposite and representation-limited evidence', () => {
    const fixtureIds = [
      ...VISUAL_GROUP_STRENGTHENED_AMBIGUITY_SET
        .filter((pair) => pair.evidenceExpectation === 'EXPECTED_AMBIGUOUS')
        .flatMap((pair) => [pair.groupedFixtureId, pair.splitFixtureId]),
      'REPEATED_INLINE_TINY_JITTER',
      'TWO_COLUMN_MIXED_WIDTH_JITTER',
    ]
    expect(fixtureIds).toHaveLength(14)
    for (const fixtureId of fixtureIds) {
      expect(isAvailablePageLayoutEvidence(materialize(fixtureId).result)).toBe(true)
    }
  })
})

describe('RP-069 zero-run result-validation and bypass contract', () => {
  it('rejects RESOLVED with an empty partition for fabricated zero-run AVAILABLE evidence', () => {
    const evidence = fabricatedEmptyAvailableEvidence()
    const validation = validateVisualGroupFormationResult({
      evidence,
      result: zeroRunResolved(evidence.pageNumber),
    })

    expect(validation.valid).toBe(false)
    expect(validation.issues).toContainEqual({ code: 'ZERO_RUN_AVAILABLE_NOT_ADMISSIBLE' })
  })

  it('rejects INSUFFICIENT_EVIDENCE for fabricated zero-run AVAILABLE evidence', () => {
    const evidence = fabricatedEmptyAvailableEvidence()
    const validation = validateVisualGroupFormationResult({
      evidence,
      result: zeroRunInsufficient(evidence.pageNumber),
    })

    expect(validation.valid).toBe(false)
    expect(validation.issues).toContainEqual({ code: 'ZERO_RUN_AVAILABLE_NOT_ADMISSIBLE' })
  })

  it('accepts only explicit invalid-input FAILED semantics for an admission-bypassed empty input', () => {
    const evidence = fabricatedEmptyAvailableEvidence()
    const failed = zeroRunFailed(evidence.pageNumber)

    expect(validateVisualGroupFormationResult({ evidence, result: failed }))
      .toEqual({ valid: true, issues: [] })
    expect(failed).toEqual({
      status: 'FAILED',
      pageNumber: 1,
      code: 'INVALID_INPUT_STRUCTURE',
      issues: [{ code: 'ZERO_RUN_AVAILABLE_NOT_ADMISSIBLE', count: 0 }],
    })
  })

  it('keeps admission and validator outcomes deterministic without mutating evidence', () => {
    const evidence = fabricatedEmptyAvailableEvidence(27)
    const before = JSON.stringify(evidence)
    const firstAdmission = isAvailablePageLayoutEvidence(evidence)
    const secondAdmission = isAvailablePageLayoutEvidence(evidence)
    const firstValidation = validateVisualGroupFormationResult({
      evidence,
      result: zeroRunResolved(evidence.pageNumber),
    })
    const secondValidation = validateVisualGroupFormationResult({
      evidence,
      result: zeroRunResolved(evidence.pageNumber),
    })

    expect(secondAdmission).toBe(firstAdmission)
    expect(secondValidation).toEqual(firstValidation)
    expect(JSON.stringify(evidence)).toBe(before)
    expect([...firstValidation.issues].map((issue) => issue.code))
      .toEqual([...firstValidation.issues].map((issue) => issue.code).sort())
  })

  it('keeps the bypass failure payload privacy-safe', () => {
    const serialized = JSON.stringify(zeroRunFailed(1))
    expect(serialized).toContain('ZERO_RUN_AVAILABLE_NOT_ADMISSIBLE')
    for (const forbidden of [
      'rawText', 'fontName', 'heading', 'email', 'phone', 'company', 'school', 'resume',
    ]) expect(serialized).not.toContain(forbidden)
  })
})

describe('RP-069 keeps upstream, admission, and bypass failure as distinct paths', () => {
  it('does not collapse the three lifecycle states into one outcome', () => {
    const upstream = constructPageLayoutEvidence({
      items: [],
      pageBounds: { minX: 0, maxX: 600, width: 600, source: 'pdf-page-view' },
      pageNumber: 1,
    })
    const nonEmpty = fabricatedSingleRunAvailableEvidence('safe')
    const fabricatedEmpty = fabricatedEmptyAvailableEvidence()

    expect(upstream.status).toBe('UNAVAILABLE')
    expect(isAvailablePageLayoutEvidence(nonEmpty)).toBe(true)
    expect(fabricatedEmpty.status).toBe('AVAILABLE')
    expect(zeroRunFailed(1).status).toBe('FAILED')
  })
})
