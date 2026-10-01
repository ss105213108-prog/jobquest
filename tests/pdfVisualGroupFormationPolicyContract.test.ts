import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { constructPageLayoutEvidence, type InternalPageLayoutEvidenceResult } from '../src/parsers/pdfPageLayoutEvidence'
import { observeHorizontalLayout } from '../src/parsers/pdfHorizontalLayoutEvidence'
import type { RowEvidenceGraph, VerticalRelation } from '../src/parsers/pdfRowEvidenceGraph'
import { formVisualGroups } from '../src/parsers/pdfVisualGroupFormation'
import {
  validateVisualGroupFormationResult,
  type AvailablePageLayoutEvidence,
  type VisualGroupFormationResult,
} from '../src/parsers/pdfVisualGroupResult'
import {
  VISUAL_GROUP_STRENGTHENED_AMBIGUITY_SET,
  visualGroupFixtureById,
  type VisualGroupGroundTruthFixture,
} from './fixtures/pdfVisualGroupGroundTruth'
import {
  canonicalVisualGroupEvidenceSignature,
  materializeVisualGroupGroundTruth,
} from './helpers/pdfVisualGroupGroundTruthHarness'
import {
  auditPositiveRuleAdmission,
  executeVisualGroupPolicyForAvailableEvidence,
  type PositiveRuleAdmissionRecord,
  type VisualGroupPolicyClass,
} from './helpers/pdfVisualGroupFormationPolicyContractHarness'

const materialize = (fixtureId: string) => materializeVisualGroupGroundTruth(
  visualGroupFixtureById(fixtureId),
)

const exactOppositePairs = VISUAL_GROUP_STRENGTHENED_AMBIGUITY_SET.filter(
  (pair) => pair.evidenceExpectation === 'EXPECTED_AMBIGUOUS',
)

const outcomeClass = (result: VisualGroupFormationResult) => result.status

const withRelations = (
  evidence: AvailablePageLayoutEvidence,
  relations: readonly VerticalRelation[],
): AvailablePageLayoutEvidence => ({
  ...evidence,
  graph: { ...evidence.graph, relations },
})

const isolateRun = (
  evidence: AvailablePageLayoutEvidence,
  runId: number,
): AvailablePageLayoutEvidence => {
  const run = evidence.graph.runs.find((candidate) => candidate.originalIndex === runId)
  if (!run) throw new Error(`Unknown anonymous run: ${runId}`)
  const graph: RowEvidenceGraph = {
    runs: [run],
    candidates: [{
      id: 'candidate:contract-singleton',
      runIds: [runId],
      geometryStatus: run.geometryComparable ? 'comparable' : 'isolated-unsafe',
    }],
    relations: [],
  }
  const horizontal = observeHorizontalLayout({
    graph,
    pageBounds: evidence.horizontalEvidence.pageGeometry.physical,
  })
  if (!horizontal.ok) throw new Error(`Unable to isolate anonymous run: ${horizontal.code}`)
  return { ...evidence, graph, horizontalEvidence: horizontal.value }
}

const reverseEvidenceOrder = (
  evidence: AvailablePageLayoutEvidence,
): AvailablePageLayoutEvidence => ({
  ...evidence,
  graph: {
    runs: [...evidence.graph.runs].reverse(),
    candidates: [...evidence.graph.candidates].reverse().map((candidate) => ({
      ...candidate,
      runIds: [...candidate.runIds].reverse(),
    })),
    relations: [...evidence.graph.relations].reverse(),
  },
  horizontalEvidence: {
    ...evidence.horizontalEvidence,
    runIntervals: [...evidence.horizontalEvidence.runIntervals].reverse(),
    slices: [...evidence.horizontalEvidence.slices].reverse().map((slice) => ({
      ...slice,
      runIds: [...slice.runIds].reverse(),
      orderedIntervalIds: [...slice.orderedIntervalIds].reverse(),
    })),
    sliceGaps: [...evidence.horizontalEvidence.sliceGaps].reverse(),
    segments: [...evidence.horizontalEvidence.segments].reverse().map((segment) => ({
      ...segment,
      occupiedByRunIds: [...segment.occupiedByRunIds].reverse(),
      occupiedInSliceIds: [...segment.occupiedInSliceIds].reverse(),
      emptyInSliceIds: [...segment.emptyInSliceIds].reverse(),
    })),
  },
})

const constructAvailable = (fixture: VisualGroupGroundTruthFixture): AvailablePageLayoutEvidence => {
  const result = constructPageLayoutEvidence({
    items: fixture.runs.map((run) => run.item),
    pageBounds: fixture.pageBounds,
    pageNumber: 1,
  })
  if (result.status !== 'AVAILABLE') throw new Error(`Expected AVAILABLE, received ${result.status}`)
  return result
}

describe('RP-066 trivial invariant resolution', () => {
  it('resolves a page containing exactly one safe run as one singleton group', () => {
    const source = materialize('SPARSE_INLINE_EXACT')
    const runId = source.runIdByKey.get('sparse-opposite-left') as number
    const evidence = isolateRun(source.result, runId)
    const result = formVisualGroups(evidence)

    expect(result).toEqual({
      status: 'RESOLVED',
      pageNumber: evidence.pageNumber,
      groups: [{ groupId: `visual:singleton:${runId}`, runIds: [runId] }],
    })
    expect(validateVisualGroupFormationResult({ evidence, result })).toEqual({ valid: true, issues: [] })
  })

  it('resolves a page containing only one unsafe run as one singleton group', () => {
    const source = materialize('UNSAFE_SINGLETON')
    const unsafe = source.result.graph.runs.find((run) => !run.geometryComparable)
    expect(unsafe).toBeDefined()
    const evidence = isolateRun(source.result, unsafe!.originalIndex)
    const result = formVisualGroups(evidence)

    expect(result.status).toBe('RESOLVED')
    expect(result).toMatchObject({ groups: [{ runIds: [unsafe!.originalIndex] }] })
    expect(validateVisualGroupFormationResult({ evidence, result }).valid).toBe(true)
  })

  it('does not treat a multi-run page with one admissible hard-constraint partition as trivial', () => {
    const source = materialize('SINGLE_LATIN_FRAGMENTS')
    const rejected = withRelations(source.result, source.result.graph.relations.map((relation) => ({
      ...relation,
      state: 'REJECTED' as const,
    })))
    expect(formVisualGroups(rejected).status).toBe('INSUFFICIENT_EVIDENCE')
  })
})

describe('RP-066 mandatory exact-equivalent abstention', () => {
  it('locks the corpus to exactly six exact-evidence opposite classes', () => {
    expect(exactOppositePairs).toHaveLength(6)
  })

  it.each(exactOppositePairs)('$id returns the same conservative abstention for both ground truths', (pair) => {
    const grouped = materialize(pair.groupedFixtureId)
    const split = materialize(pair.splitFixtureId)
    expect(canonicalVisualGroupEvidenceSignature(grouped))
      .toEqual(canonicalVisualGroupEvidenceSignature(split))

    const groupedResult = formVisualGroups(grouped.result)
    const splitResult = formVisualGroups(split.result)
    expect(groupedResult.status).toBe('INSUFFICIENT_EVIDENCE')
    expect(splitResult.status).toBe('INSUFFICIENT_EVIDENCE')
    expect(outcomeClass(groupedResult)).toBe(outcomeClass(splitResult))
  })

  it('keeps fixture identity, authored grouping, and raw semantic fields outside the policy harness', () => {
    const source = readFileSync(
      resolve('src/parsers/pdfVisualGroupFormation.ts'),
      'utf8',
    )
    for (const forbidden of [
      'pdfVisualGroupGroundTruth', 'expectedGroups', 'fixtureId', '.text', '.fontName',
      'CJK_STRONG', 'LATIN_STRONG', 'shouldMerge', 'shouldSplit',
    ]) expect(source).not.toContain(forbidden)
  })
})

describe('RP-066 whole-page atomic abstention', () => {
  it('does not expose a trivially determined unsafe singleton beside an unresolved exact-geometry component', () => {
    const sparse = visualGroupFixtureById('SPARSE_INLINE_EXACT')
    const mixed: VisualGroupGroundTruthFixture = {
      ...sparse,
      id: 'ANONYMOUS_MIXED_ATOMIC_PAGE',
      runs: [
        ...sparse.runs,
        {
          key: 'isolated-unsafe-token',
          item: {
            str: 'TOKEN222',
            transform: [0, 1, -1, 0, 500, 620],
            width: 50,
            height: 12,
            dir: 'ltr',
            fontName: 'SyntheticBody',
            hasEOL: false,
          },
        },
      ],
      expectedGroups: [],
    }
    const evidence = constructAvailable(mixed)
    expect(evidence.graph.runs.some((run) => !run.geometryComparable)).toBe(true)
    const result = formVisualGroups(evidence)

    expect(result.status).toBe('INSUFFICIENT_EVIDENCE')
    expect(result).not.toHaveProperty('groups')
    expect(result).not.toHaveProperty('partialGroups')
    expect(result).not.toHaveProperty('unresolvedRunIds')
  })
})

describe('RP-066 hard constraints are not positive proof', () => {
  it.each(['SUPPORTED', 'DEFERRED'] as const)(
    'does not treat direct %s permission as merge proof',
    (state) => {
      const source = materialize('SPARSE_INLINE_EXACT')
      const evidence = withRelations(source.result, source.result.graph.relations.map((relation) => ({
        ...relation,
        state,
      })))
      expect(formVisualGroups(evidence).status).toBe('INSUFFICIENT_EVIDENCE')
    },
  )

  it('does not treat a MISSING pair as complete positive separation proof', () => {
    const source = materialize('SINGLE_LATIN_FRAGMENTS')
    const evidence = withRelations(source.result, [])
    expect(formVisualGroups(evidence).status).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('does not treat a REJECTED pair as a complete-resolution shortcut', () => {
    const source = materialize('SINGLE_LATIN_FRAGMENTS')
    const evidence = withRelations(source.result, source.result.graph.relations.map((relation) => ({
      ...relation,
      state: 'REJECTED' as const,
    })))
    expect(formVisualGroups(evidence).status).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('requires both cohesion and separation/completeness proof for every non-trivial result', () => {
    const cohesionLooking = materialize('SINGLE_LATIN_FRAGMENTS').result
    const separationLooking = materialize('TWO_COLUMN_50_50').result
    expect(formVisualGroups(cohesionLooking).status).toBe('INSUFFICIENT_EVIDENCE')
    expect(formVisualGroups(separationLooking).status).toBe('INSUFFICIENT_EVIDENCE')
  })
})

describe('RP-066 candidates remain provisional', () => {
  it('does not preserve a multi-run candidate as a final group by default', () => {
    const evidence = materialize('SINGLE_LATIN_FRAGMENTS').result
    expect(evidence.graph.candidates.some((candidate) => candidate.runIds.length > 1)).toBe(true)
    expect(formVisualGroups(evidence).status).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('does not turn separate candidates into a resolved split by default', () => {
    const source = materialize('CROSS_CANDIDATE_RECOVERY')
    const evidence = withRelations(source.result, [])
    expect(evidence.graph.candidates).toHaveLength(2)
    expect(formVisualGroups(evidence).status).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('does not turn cross-candidate DEFERRED permission into merge proof', () => {
    const evidence = materialize('CROSS_CANDIDATE_RECOVERY').result
    expect(evidence.graph.relations.some((relation) => relation.state === 'DEFERRED')).toBe(true)
    expect(formVisualGroups(evidence).status).toBe('INSUFFICIENT_EVIDENCE')
  })
})

describe('RP-066 eligible-analysis and future-rule admission boundary', () => {
  const eligibleScenarios: readonly {
    fixtureId: string
    expectedGroundTruth: readonly (readonly string[])[]
    structuralEvidence: readonly string[]
    policyClass: VisualGroupPolicyClass
  }[] = [
    {
      fixtureId: 'CANDIDATE_SPLIT_WITH_CONTEXT',
      expectedGroundTruth: visualGroupFixtureById('CANDIDATE_SPLIT_WITH_CONTEXT').expectedGroups,
      structuralEvidence: ['candidate context differs from its matched opposite'],
      policyClass: 'ELIGIBLE_FOR_RESOLUTION_ANALYSIS',
    },
    {
      fixtureId: 'CANDIDATE_REMAIN_WITH_CONTEXT',
      expectedGroundTruth: visualGroupFixtureById('CANDIDATE_REMAIN_WITH_CONTEXT').expectedGroups,
      structuralEvidence: ['candidate context differs from its matched opposite'],
      policyClass: 'ELIGIBLE_FOR_RESOLUTION_ANALYSIS',
    },
    {
      fixtureId: 'CROSS_CANDIDATE_RECOVERY',
      expectedGroundTruth: visualGroupFixtureById('CROSS_CANDIDATE_RECOVERY').expectedGroups,
      structuralEvidence: ['direct cross-candidate permission is available for later study'],
      policyClass: 'ELIGIBLE_FOR_RESOLUTION_ANALYSIS',
    },
  ]

  it.each(eligibleScenarios)(
    '$fixtureId records research metadata without forcing RESOLVED',
    (scenario) => {
      expect(scenario.policyClass).toBe('ELIGIBLE_FOR_RESOLUTION_ANALYSIS')
      expect(scenario.expectedGroundTruth.length).toBeGreaterThan(0)
      expect(scenario.structuralEvidence.length).toBeGreaterThan(0)
      expect(formVisualGroups(materialize(scenario.fixtureId).result).status)
        .toBe('INSUFFICIENT_EVIDENCE')
    },
  )

  it('shows the candidate-context pair is structurally distinguishable but still unapproved', () => {
    const grouped = materialize('CANDIDATE_REMAIN_WITH_CONTEXT')
    const split = materialize('CANDIDATE_SPLIT_WITH_CONTEXT')
    expect(canonicalVisualGroupEvidenceSignature(grouped))
      .not.toEqual(canonicalVisualGroupEvidenceSignature(split))
    expect(formVisualGroups(grouped.result).status).toBe('INSUFFICIENT_EVIDENCE')
    expect(formVisualGroups(split.result).status).toBe('INSUFFICIENT_EVIDENCE')
  })

  const admissibleRecord: PositiveRuleAdmissionRecord = {
    structuralHypothesis: 'anonymous contextual structure supports one partition family',
    anonymousPositiveFixtureIds: ['ANON_POSITIVE_TOKEN_000'],
    matchedNegativeFixtureIds: ['ANON_NEGATIVE_TOKEN_111'],
    exactEquivalenceSafetyAudit: 'PASS',
    scaleInvariance: 'PASS',
    permutationInvariance: 'PASS',
    syntheticGlyphControl: 'EQUAL_LENGTH_TOKENS',
    exporterNoiseDependency: 'INDEPENDENT',
  }

  it('admits test contribution metadata only when every approved proof obligation is present', () => {
    expect(auditPositiveRuleAdmission(admissibleRecord)).toEqual([])
  })

  it.each([
    ['structuralHypothesis', 'NAMED_STRUCTURAL_HYPOTHESIS_REQUIRED'],
    ['anonymousPositiveFixtureIds', 'ANONYMOUS_POSITIVE_FIXTURE_REQUIRED'],
    ['matchedNegativeFixtureIds', 'MATCHED_NEGATIVE_FIXTURE_REQUIRED'],
    ['exactEquivalenceSafetyAudit', 'EXACT_EQUIVALENCE_SAFETY_AUDIT_REQUIRED'],
    ['scaleInvariance', 'SCALE_INVARIANCE_REQUIRED'],
    ['permutationInvariance', 'PERMUTATION_INVARIANCE_REQUIRED'],
    ['syntheticGlyphControl', 'SYNTHETIC_GLYPH_CONTROL_REQUIRED'],
    ['exporterNoiseDependency', 'EXPORTER_NOISE_CLASSIFICATION_REQUIRED'],
  ] as const)('rejects future positive-rule metadata missing %s', (field, issue) => {
    const incomplete = { ...admissibleRecord, [field]: undefined }
    expect(auditPositiveRuleAdmission(incomplete)).toContain(issue)
  })
})

describe('RP-066 representation and failure boundaries', () => {
  it.each([
    'REPEATED_INLINE_TINY_JITTER',
    'REPEATED_LABEL_VALUE_TINY_JITTER',
    'TWO_COLUMN_MIXED_WIDTH_JITTER',
    'SIDEBAR_ROW_SPECIFIC_JITTER',
    'REPEATED_INLINE_BASELINE_JITTER',
  ])('%s remains representation-limited and abstains without coordinate tolerance', (fixtureId) => {
    expect(formVisualGroups(materialize(fixtureId).result).status)
      .toBe('INSUFFICIENT_EVIDENCE')
  })

  it('maps invalid Graph/HLE identity to FAILED', () => {
    const source = materialize('SPARSE_INLINE_EXACT').result
    const invalid: AvailablePageLayoutEvidence = {
      ...source,
      graph: { ...source.graph, runs: [...source.graph.runs, source.graph.runs[0]] },
    }
    expect(formVisualGroups(invalid)).toMatchObject({
      status: 'FAILED',
      code: 'INVALID_INPUT_STRUCTURE',
    })
  })

  it('returns privacy-safe FAILED for structurally malformed bypass input', () => {
    const malformed = {
      status: 'AVAILABLE',
      pageNumber: 7,
    } as unknown as AvailablePageLayoutEvidence
    expect(formVisualGroups(malformed)).toEqual({
      status: 'FAILED',
      pageNumber: 7,
      code: 'INVALID_INPUT_STRUCTURE',
      issues: [{ code: 'INVALID_INPUT_STRUCTURE' }],
    })
  })

  it('maps an admission-bypassed zero-run input to invalid-input FAILED semantics', () => {
    const source = materialize('SPARSE_INLINE_EXACT').result
    const invalid: AvailablePageLayoutEvidence = {
      ...source,
      graph: { runs: [], candidates: [], relations: [] },
      horizontalEvidence: {
        ...source.horizontalEvidence,
        runIntervals: [], slices: [], sliceGaps: [], segments: [],
        pageGeometry: { ...source.horizontalEvidence.pageGeometry, occupied: null },
        availability: {
          safeRunState: 'NONE', verticalContext: 'NONE',
          physicalPageNormalization: 'AVAILABLE', excludedUnsafeRunIds: [],
        },
      },
    }
    const result = formVisualGroups(invalid)
    expect(result).toMatchObject({
      status: 'FAILED',
      code: 'INVALID_INPUT_STRUCTURE',
      issues: [{ code: 'ZERO_RUN_AVAILABLE_NOT_ADMISSIBLE' }],
    })
    expect(validateVisualGroupFormationResult({ evidence: invalid, result }).valid).toBe(true)
  })

  it.each([
    ['sparse valid evidence', materialize('SPARSE_INLINE_EXACT').result],
    ['representation-limited evidence', materialize('TWO_COLUMN_MIXED_WIDTH_JITTER').result],
  ] as const)('keeps $0 uncertainty on INSUFFICIENT rather than FAILED', (_name, evidence) => {
    expect(formVisualGroups(evidence).status).toBe('INSUFFICIENT_EVIDENCE')
  })
})

describe('RP-066 upstream admission boundary', () => {
  it.each([
    {
      status: 'UNAVAILABLE', pageNumber: 1, stage: 'vertical-calibration', code: 'INSUFFICIENT_CALIBRATION',
    },
    {
      status: 'FAILED', pageNumber: 1, stage: 'geometry', code: 'INVALID_GEOMETRY', issues: [],
    },
  ] as const)('does not execute policy for upstream $status', (upstream) => {
    const policy = vi.fn(formVisualGroups)
    const execution = executeVisualGroupPolicyForAvailableEvidence(
      upstream as InternalPageLayoutEvidenceResult,
      policy,
    )
    expect(execution).toEqual({ executed: false })
    expect(policy).not.toHaveBeenCalled()
  })

  it('executes only for AVAILABLE evidence without wrapping the upstream state', () => {
    const evidence = materialize('SPARSE_INLINE_EXACT').result
    const policy = vi.fn(formVisualGroups)
    const execution = executeVisualGroupPolicyForAvailableEvidence(evidence, policy)
    expect(execution.executed).toBe(true)
    expect(policy).toHaveBeenCalledOnce()
    if (execution.executed) expect(execution.result.status).toBe('INSUFFICIENT_EVIDENCE')
  })
})

describe('RP-066 scale, permutation, and synthetic-data invariance', () => {
  it('preserves the trivial singleton outcome under uniform scale', () => {
    const base = materialize('SPARSE_INLINE_EXACT')
    const scaled = materialize('SPARSE_INLINE_EXACT_SCALE_2X')
    const baseEvidence = isolateRun(base.result, base.runIdByKey.get('sparse-opposite-left') as number)
    const scaledEvidence = isolateRun(scaled.result, scaled.runIdByKey.get('sparse-opposite-left') as number)
    expect(outcomeClass(formVisualGroups(baseEvidence)))
      .toBe(outcomeClass(formVisualGroups(scaledEvidence)))
    expect(formVisualGroups(baseEvidence).status).toBe('RESOLVED')
  })

  it('preserves mandatory abstention under scale and permutation variants', () => {
    for (const fixtureId of [
      'SPARSE_INLINE_EXACT',
      'SPARSE_INLINE_EXACT_SCALE_2X',
      'SPARSE_INLINE_EXACT_PERMUTED',
    ]) {
      expect(formVisualGroups(materialize(fixtureId).result).status)
        .toBe('INSUFFICIENT_EVIDENCE')
    }
  })

  it('is invariant to graph and observation ordering for eligible analysis evidence', () => {
    const evidence = materialize('CANDIDATE_SPLIT_WITH_CONTEXT').result
    const before = structuredClone(evidence)
    expect(outcomeClass(formVisualGroups(reverseEvidenceOrder(evidence))))
      .toBe(outcomeClass(formVisualGroups(evidence)))
    expect(evidence).toEqual(before)
  })

  it('keeps the singleton decision invariant under the only possible run permutation', () => {
    const source = materialize('SPARSE_INLINE_EXACT')
    const evidence = isolateRun(source.result, source.runIdByKey.get('sparse-opposite-left') as number)
    expect(formVisualGroups(reverseEvidenceOrder(evidence)))
      .toEqual(formVisualGroups(evidence))
  })

  it('uses equal-length anonymous tokens or the canonical comparator for matched evidence', () => {
    for (const pair of exactOppositePairs) {
      expect(canonicalVisualGroupEvidenceSignature(materialize(pair.groupedFixtureId)))
        .toEqual(canonicalVisualGroupEvidenceSignature(materialize(pair.splitFixtureId)))
    }
    expect(auditPositiveRuleAdmission({
      structuralHypothesis: 'matched anonymous structural hypothesis',
      anonymousPositiveFixtureIds: ['TOKEN000'],
      matchedNegativeFixtureIds: ['TOKEN111'],
      exactEquivalenceSafetyAudit: 'PASS',
      scaleInvariance: 'PASS',
      permutationInvariance: 'PASS',
      syntheticGlyphControl: 'EQUAL_LENGTH_TOKENS',
      exporterNoiseDependency: 'INDEPENDENT',
    })).toEqual([])
  })

  it('contains no threshold, approximate alignment, or merge/split heuristic', () => {
    const helper = readFileSync(
      resolve('src/parsers/pdfVisualGroupFormation.ts'),
      'utf8',
    )
    for (const forbidden of [
      'confidence', 'weightedRuleSet', 'rules[]', 'epsilon', 'Math.round',
      'shouldMerge', 'shouldSplit', 'gap >', 'rows >=', 'persistence',
    ]) expect(helper).not.toContain(forbidden)
  })
})
