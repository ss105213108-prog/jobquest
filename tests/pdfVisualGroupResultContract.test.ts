import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { InternalPageLayoutEvidenceResult } from '../src/parsers/pdfPageLayoutEvidence'
import type { VerticalRelation } from '../src/parsers/pdfRowEvidenceGraph'
import {
  VISUAL_GROUP_STRENGTHENED_AMBIGUITY_SET,
  visualGroupFixtureById,
} from './fixtures/pdfVisualGroupGroundTruth'
import {
  canonicalVisualGroupEvidenceSignature,
  materializeVisualGroupGroundTruth,
  type MaterializedVisualGroupGroundTruth,
} from './helpers/pdfVisualGroupGroundTruthHarness'
import {
  isAvailablePageLayoutEvidence,
  isResolvedVisualGroupResult,
  validateVisualGroupFormationResult,
  type AvailablePageLayoutEvidence,
  type VisualGroupFormationResult,
} from '../src/parsers/pdfVisualGroupResult'

const materialize = (fixtureId: string) => materializeVisualGroupGroundTruth(
  visualGroupFixtureById(fixtureId),
)

const resolvedFromKeys = (
  materialized: MaterializedVisualGroupGroundTruth,
  keyGroups: readonly (readonly string[])[],
): VisualGroupFormationResult => ({
  status: 'RESOLVED',
  pageNumber: materialized.result.pageNumber,
  groups: keyGroups.map((keys, index) => ({
    groupId: `visual:${index}`,
    runIds: keys.map((key) => {
      const runId = materialized.runIdByKey.get(key)
      if (runId === undefined) throw new Error(`Unknown test run key: ${key}`)
      return runId
    }),
  })),
})

const withRelations = (
  evidence: AvailablePageLayoutEvidence,
  relations: readonly VerticalRelation[],
): AvailablePageLayoutEvidence => ({
  ...evidence,
  graph: { ...evidence.graph, relations },
})

const issueCodes = (value: ReturnType<typeof validateVisualGroupFormationResult>) => (
  value.issues.map((issue) => issue.code)
)

describe('RP-063 RESOLVED complete-partition contract', () => {
  it('accepts a complete authoritative partition with direct pair permission', () => {
    const materialized = materialize('SINGLE_LATIN_FRAGMENTS')
    const result = resolvedFromKeys(materialized, [['latin-a', 'latin-b']])
    expect(validateVisualGroupFormationResult({ evidence: materialized.result, result }))
      .toEqual({ valid: true, issues: [] })
    expect(validateVisualGroupFormationResult({
      evidence: materialized.result,
      result: { ...result, pageNumber: 999 },
    }).valid).toBe(true)
    expect(validateVisualGroupFormationResult({
      evidence: materialized.result,
      result: {
        ...result,
        groups: result.status === 'RESOLVED'
          ? result.groups.map((group) => ({ ...group, confidence: 1 }))
          : [],
      },
    }).valid).toBe(false)
  })

  it.each([
    {
      name: 'missing run',
      result: (fixture: MaterializedVisualGroupGroundTruth) => resolvedFromKeys(fixture, [['latin-a']]),
      code: 'MISSING_FINAL_MEMBERSHIP',
    },
    {
      name: 'duplicate membership',
      result: (fixture: MaterializedVisualGroupGroundTruth) => ({
        status: 'RESOLVED',
        pageNumber: fixture.result.pageNumber,
        groups: [
          { groupId: 'visual:a', runIds: [fixture.runIdByKey.get('latin-a')] },
          { groupId: 'visual:b', runIds: [fixture.runIdByKey.get('latin-a'), fixture.runIdByKey.get('latin-b')] },
        ],
      }),
      code: 'DUPLICATE_FINAL_MEMBERSHIP',
    },
    {
      name: 'unknown run',
      result: () => ({
        status: 'RESOLVED', pageNumber: 1, groups: [{ groupId: 'visual:a', runIds: [0, 1, 999] }],
      }),
      code: 'UNKNOWN_GROUP_RUN_ID',
    },
  ])('rejects $name in a purported final partition', ({ result, code }) => {
    const materialized = materialize('SINGLE_LATIN_FRAGMENTS')
    const validation = validateVisualGroupFormationResult({
      evidence: materialized.result,
      result: result(materialized),
    })
    expect(validation.valid).toBe(false)
    expect(issueCodes(validation)).toContain(code)
  })

  it('accepts unsafe geometry only when it is an exactly-once singleton', () => {
    const materialized = materialize('UNSAFE_SINGLETON')
    const valid = resolvedFromKeys(materialized, [
      ['unsafe-safe-left'], ['unsafe-run'], ['unsafe-safe-right'],
    ])
    expect(validateVisualGroupFormationResult({ evidence: materialized.result, result: valid }).valid).toBe(true)

    const invalid = resolvedFromKeys(materialized, [
      ['unsafe-safe-left', 'unsafe-run'], ['unsafe-safe-right'],
    ])
    const validation = validateVisualGroupFormationResult({ evidence: materialized.result, result: invalid })
    expect(validation.valid).toBe(false)
    expect(issueCodes(validation)).toContain('UNSAFE_RUN_NOT_SINGLETON')
  })

  it('accepts a direct DEFERRED relation as pairwise permission', () => {
    const materialized = materialize('CROSS_CANDIDATE_RECOVERY')
    const result = resolvedFromKeys(materialized, [['recovery-left', 'recovery-right']])
    expect(materialized.result.graph.relations[0]?.state).toBe('DEFERRED')
    expect(validateVisualGroupFormationResult({ evidence: materialized.result, result }).valid).toBe(true)
  })

  it.each([
    { name: 'MISSING', relationState: null },
    { name: 'REJECTED', relationState: 'REJECTED' as const },
  ])('rejects a multi-run group with a direct $name pair without turning it into a split policy', ({ relationState }) => {
    const materialized = materialize('SINGLE_LATIN_FRAGMENTS')
    const relations = relationState === null
      ? []
      : materialized.result.graph.relations.map((relation) => ({ ...relation, state: relationState }))
    const evidence = withRelations(materialized.result, relations)
    const result = resolvedFromKeys(materialized, [['latin-a', 'latin-b']])
    const validation = validateVisualGroupFormationResult({ evidence, result })
    expect(validation.valid).toBe(false)
    expect(issueCodes(validation)).toContain('DIRECT_PAIR_PERMISSION_REQUIRED')
  })

  it('rejects a transitive-only three-run group', () => {
    const materialized = materialize('LATIN_STRONG_SAME')
    const first = materialized.runIdByKey.get('strong-latin-1') as number
    const third = materialized.runIdByKey.get('strong-latin-3') as number
    const evidence = withRelations(materialized.result, materialized.result.graph.relations.filter((relation) => !(
      relation.leftRunId === Math.min(first, third)
      && relation.rightRunId === Math.max(first, third)
    )))
    const result = resolvedFromKeys(materialized, [
      ['strong-latin-1', 'strong-latin-2', 'strong-latin-3'],
      ['strong-latin-context-left'],
      ['strong-latin-context-right'],
    ])
    const validation = validateVisualGroupFormationResult({ evidence, result })
    expect(validation.valid).toBe(false)
    expect(validation.issues).toContainEqual(expect.objectContaining({
      code: 'DIRECT_PAIR_PERMISSION_REQUIRED',
      runIds: [Math.min(first, third), Math.max(first, third)],
    }))
  })
})

describe('RP-063 whole-result abstention and mutually exclusive outcomes', () => {
  it('accepts a privacy-safe insufficient result with no authoritative groups', () => {
    const materialized = materialize('SPARSE_INLINE_EXACT')
    const result: VisualGroupFormationResult = {
      status: 'INSUFFICIENT_EVIDENCE',
      pageNumber: materialized.result.pageNumber,
      diagnostic: {
        reasonCode: 'AMBIGUOUS_STRUCTURAL_EVIDENCE',
        runIds: [0, 1],
        candidateIds: materialized.result.graph.candidates.map((candidate) => candidate.id),
        counts: { ambiguousRunCount: 2 },
        numericEvidence: { observedGap: 140 },
      },
    }
    expect(validateVisualGroupFormationResult({ evidence: materialized.result, result }))
      .toEqual({ valid: true, issues: [] })
  })

  it.each([
    { status: 'INSUFFICIENT_EVIDENCE', pageNumber: 1, groups: [{ groupId: 'partial', runIds: [0] }] },
    { status: 'INSUFFICIENT_EVIDENCE', pageNumber: 1, candidates: [{ runIds: [0, 1] }] },
    { status: 'INSUFFICIENT_EVIDENCE', pageNumber: 1, partial: true, unresolvedRunIds: [1] },
    {
      status: 'RESOLVED', pageNumber: 1, groups: [{ groupId: 'partial', runIds: [0, 1] }], unresolvedRunIds: [2],
    },
    {
      status: 'FAILED',
      pageNumber: 1,
      code: 'INTERNAL_FORMATION_CONSISTENCY_FAILURE',
      issues: [],
      groups: [{ groupId: 'partial', runIds: [0] }],
    },
  ])('rejects mixed or partial result schema %#', (result) => {
    const materialized = materialize('UNSAFE_SINGLETON')
    const validation = validateVisualGroupFormationResult({ evidence: materialized.result, result })
    expect(validation.valid).toBe(false)
    expect(issueCodes(validation).some((code) => code.endsWith('SCHEMA_CONFLICT'))).toBe(true)
  })

  it('abstains over the whole page when safe ambiguity coexists with an unsafe run', () => {
    const materialized = materialize('UNSAFE_SINGLETON')
    const result: VisualGroupFormationResult = {
      status: 'INSUFFICIENT_EVIDENCE',
      pageNumber: materialized.result.pageNumber,
      diagnostic: { reasonCode: 'AMBIGUOUS_STRUCTURAL_EVIDENCE', runIds: [0, 2] },
    }
    expect(validateVisualGroupFormationResult({ evidence: materialized.result, result }).valid).toBe(true)
    expect(result).not.toHaveProperty('groups')
  })
})

describe('RP-063 FAILED semantics and Graph/HLE input pairing', () => {
  it('accepts an implementation or contract failure but rejects ambiguity disguised as failure', () => {
    const materialized = materialize('SINGLE_LATIN_FRAGMENTS')
    const failed: VisualGroupFormationResult = {
      status: 'FAILED',
      pageNumber: materialized.result.pageNumber,
      code: 'INTERNAL_FORMATION_CONSISTENCY_FAILURE',
      issues: [{ code: 'INTERNAL_STATE_CONFLICT', count: 1 }],
    }
    expect(validateVisualGroupFormationResult({ evidence: materialized.result, result: failed }).valid).toBe(true)

    const ambiguityAsFailure = {
      status: 'FAILED',
      pageNumber: materialized.result.pageNumber,
      code: 'INSUFFICIENT_CONTEXT',
      issues: [],
    }
    const validation = validateVisualGroupFormationResult({
      evidence: materialized.result,
      result: ambiguityAsFailure,
    })
    expect(validation.valid).toBe(false)
    expect(issueCodes(validation)).toContain('INVALID_VISUALGROUP_FAILURE_CODE')
  })

  it('rejects RESOLVED on a Graph/HLE run-set mismatch and permits an explicit FAILED result', () => {
    const materialized = materialize('SINGLE_LATIN_FRAGMENTS')
    const invalidEvidence: AvailablePageLayoutEvidence = {
      ...materialized.result,
      horizontalEvidence: {
        ...materialized.result.horizontalEvidence,
        runIntervals: materialized.result.horizontalEvidence.runIntervals.slice(1),
      },
    }
    const resolved = resolvedFromKeys(materialized, [['latin-a', 'latin-b']])
    const invalidResolved = validateVisualGroupFormationResult({ evidence: invalidEvidence, result: resolved })
    expect(invalidResolved.valid).toBe(false)
    expect(issueCodes(invalidResolved)).toContain('GRAPH_HLE_RUN_SET_MISMATCH')

    const failed: VisualGroupFormationResult = {
      status: 'FAILED',
      pageNumber: materialized.result.pageNumber,
      code: 'INVALID_GRAPH_HLE_PAIRING',
      issues: [{ code: 'GRAPH_HLE_RUN_SET_MISMATCH' }],
    }
    expect(validateVisualGroupFormationResult({ evidence: invalidEvidence, result: failed }).valid).toBe(true)
  })

  it('rejects an HLE unknown run reference for non-FAILED outcomes', () => {
    const materialized = materialize('SINGLE_LATIN_FRAGMENTS')
    const invalidEvidence: AvailablePageLayoutEvidence = {
      ...materialized.result,
      horizontalEvidence: {
        ...materialized.result.horizontalEvidence,
        availability: {
          ...materialized.result.horizontalEvidence.availability,
          excludedUnsafeRunIds: [999],
        },
      },
    }
    const insufficient: VisualGroupFormationResult = {
      status: 'INSUFFICIENT_EVIDENCE', pageNumber: materialized.result.pageNumber,
    }
    const validation = validateVisualGroupFormationResult({ evidence: invalidEvidence, result: insufficient })
    expect(validation.valid).toBe(false)
    expect(issueCodes(validation)).toContain('HLE_UNKNOWN_RUN_REFERENCE')
  })
})

describe('RP-063 upstream and downstream admission seams', () => {
  it('admits AVAILABLE evidence without implying RESOLVED', () => {
    const materialized = materialize('SPARSE_INLINE_EXACT')
    expect(isAvailablePageLayoutEvidence(materialized.result)).toBe(true)
    expect(validateVisualGroupFormationResult({
      evidence: materialized.result,
      result: { status: 'INSUFFICIENT_EVIDENCE', pageNumber: materialized.result.pageNumber },
    }).valid).toBe(true)
  })

  it.each([
    {
      status: 'UNAVAILABLE' as const,
      pageNumber: 1,
      stage: 'vertical-calibration' as const,
      code: 'INSUFFICIENT_CALIBRATION' as const,
    },
    {
      status: 'FAILED' as const,
      pageNumber: 1,
      stage: 'horizontal-observation' as const,
      code: 'INVALID_LAYOUT_CONTEXT',
    },
  ])('blocks upstream $status without mapping it to VisualGroup insufficiency', (evidence) => {
    const upstream = evidence as InternalPageLayoutEvidenceResult
    expect(isAvailablePageLayoutEvidence(upstream)).toBe(false)
    expect(upstream.status).toBe(evidence.status)
  })

  it.each(['REGION_COLUMN', 'READING_ORDER', 'SERIALIZATION'] as const)(
    'admits only RESOLVED groups to %s',
    (downstream) => {
      const materialized = materialize('SINGLE_LATIN_FRAGMENTS')
      const resolved = resolvedFromKeys(materialized, [['latin-a', 'latin-b']])
      const insufficient: VisualGroupFormationResult = {
        status: 'INSUFFICIENT_EVIDENCE', pageNumber: materialized.result.pageNumber,
      }
      const failed: VisualGroupFormationResult = {
        status: 'FAILED',
        pageNumber: materialized.result.pageNumber,
        code: 'INTERNAL_FORMATION_CONSISTENCY_FAILURE',
        issues: [],
      }
      expect(downstream).toMatch(/REGION_COLUMN|READING_ORDER|SERIALIZATION/)
      expect(isResolvedVisualGroupResult(resolved)).toBe(true)
      expect(isResolvedVisualGroupResult(insufficient)).toBe(false)
      expect(isResolvedVisualGroupResult(failed)).toBe(false)
      expect(insufficient).not.toHaveProperty('groups')
    },
  )
})

describe('RP-063 evidence identity, privacy, and validation invariance', () => {
  it.each(VISUAL_GROUP_STRENGTHENED_AMBIGUITY_SET.filter(
    (pair) => pair.evidenceExpectation === 'EXPECTED_AMBIGUOUS',
  ))('$id remains the same structural input despite opposite authored ground truth', (pair) => {
    expect(canonicalVisualGroupEvidenceSignature(materialize(pair.groupedFixtureId)))
      .toEqual(canonicalVisualGroupEvidenceSignature(materialize(pair.splitFixtureId)))
  })

  it('does not expose private diagnostic payload in validation output', () => {
    const materialized = materialize('SPARSE_INLINE_EXACT')
    const privateMarker = 'private-name@example.invalid'
    const result = {
      status: 'INSUFFICIENT_EVIDENCE',
      pageNumber: materialized.result.pageNumber,
      diagnostic: {
        reasonCode: 'AMBIGUOUS_STRUCTURAL_EVIDENCE',
        rawText: privateMarker,
        fontName: 'PrivateFont',
      },
    }
    const validation = validateVisualGroupFormationResult({ evidence: materialized.result, result })
    expect(validation.valid).toBe(false)
    expect(issueCodes(validation)).toContain('PRIVATE_OR_UNSUPPORTED_DIAGNOSTIC_FIELD')
    expect(JSON.stringify(validation)).not.toContain(privateMarker)
    expect(JSON.stringify(validation)).not.toContain('PrivateFont')

    const failedValidation = validateVisualGroupFormationResult({
      evidence: materialized.result,
      result: {
        status: 'FAILED',
        pageNumber: materialized.result.pageNumber,
        code: 'INVALID_INPUT_STRUCTURE',
        issues: [{ code: 'PRIVATE_FAILURE_DETAIL', rawText: privateMarker }],
      },
    })
    expect(failedValidation.valid).toBe(false)
    expect(issueCodes(failedValidation)).toContain('INVALID_VISUALGROUP_FAILURE_ISSUE')
    expect(JSON.stringify(failedValidation)).not.toContain(privateMarker)
  })

  it('is deterministic under group and member permutation', () => {
    const materialized = materialize('DENSE_INLINE_ROWS')
    const first = resolvedFromKeys(materialized, [
      ['dense-a1', 'dense-a2'], ['dense-b1', 'dense-b2'],
      ['dense-c1', 'dense-c2'], ['dense-d1', 'dense-d2'],
    ])
    const second = resolvedFromKeys(materialized, [
      ['dense-d2', 'dense-d1'], ['dense-b2', 'dense-b1'],
      ['dense-a2', 'dense-a1'], ['dense-c2', 'dense-c1'],
    ])
    const evidenceBefore = JSON.stringify(materialized.result)
    const firstBefore = JSON.stringify(first)
    const firstValidation = validateVisualGroupFormationResult({ evidence: materialized.result, result: first })
    const secondValidation = validateVisualGroupFormationResult({ evidence: materialized.result, result: second })
    expect(firstValidation).toEqual(secondValidation)
    expect(JSON.stringify(materialized.result)).toBe(evidenceBefore)
    expect(JSON.stringify(first)).toBe(firstBefore)
  })

  it.each([
    ['SPARSE_INLINE_EXACT', 'SPARSE_INLINE_EXACT_SCALE_2X', [['sparse-opposite-left', 'sparse-opposite-right']]],
    ['SPARSE_INLINE_EXACT', 'SPARSE_INLINE_EXACT_PERMUTED', [['sparse-opposite-left', 'sparse-opposite-right']]],
    ['CJK_STRONG_SAME', 'CJK_STRONG_SAME_SCALE_HALF', [
      ['strong-cjk-1', 'strong-cjk-2', 'strong-cjk-3', 'strong-cjk-4'],
      ['strong-cjk-context-left'], ['strong-cjk-context-right'],
    ]],
    ['CJK_STRONG_SAME', 'CJK_STRONG_SAME_PERMUTED', [
      ['strong-cjk-1', 'strong-cjk-2', 'strong-cjk-3', 'strong-cjk-4'],
      ['strong-cjk-context-left'], ['strong-cjk-context-right'],
    ]],
  ] as const)('preserves validation under %s → %s scale/permutation variants', (baseId, variantId, groups) => {
    const base = materialize(baseId)
    const variant = materialize(variantId)
    expect(validateVisualGroupFormationResult({
      evidence: base.result,
      result: resolvedFromKeys(base, groups),
    }).valid).toBe(true)
    expect(validateVisualGroupFormationResult({
      evidence: variant.result,
      result: resolvedFromKeys(variant, groups),
    }).valid).toBe(true)
  })

  it('keeps expected ground truth and sufficiency policy outside the contract harness', () => {
    const source = readFileSync(resolve('src/parsers/pdfVisualGroupResult.ts'), 'utf8')
    for (const forbidden of [
      'expectedGroups', 'confidence', 'threshold', 'shouldMerge', 'shouldSplit',
      'persistence >=', 'rows >=', 'gap >',
    ]) expect(source).not.toContain(forbidden)
  })

  it('keeps the production parser isolated from the production VisualGroup result contract', () => {
    const productionSources = [
      'src/parsers/pdfResumeParser.ts',
      'src/parsers/pdfPageReconstructor.ts',
      'src/parsers/pdfLineReconstructor.ts',
    ].map((path) => readFileSync(resolve(path), 'utf8')).join('\n')
    expect(productionSources).not.toContain('pdfVisualGroupResult')
    expect(productionSources).not.toContain('validateVisualGroupFormationResult')
  })
})
