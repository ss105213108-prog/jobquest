import { describe, expect, it } from 'vitest'
import { validateRowEvidenceGraph, type RowEvidenceCandidate } from '../src/parsers/pdfRowEvidenceGraph'
import { buildRowEvidenceGraph, type VerticalPairDecision } from '../src/parsers/pdfRowEvidenceGraphBuilder'
import { proposeRowCandidates } from '../src/parsers/pdfRowCandidateProposal'
import { classifyVerticalRelations } from '../src/parsers/pdfVerticalRelationClassifier'
import {
  calibrateVerticalEvidence,
  type VerticalCalibrationSnapshot,
} from '../src/parsers/pdfVerticalCalibration'
import {
  classifierRun,
  oneCandidate,
  scaleClassifierRuns,
  singletonCandidates,
} from './fixtures/pdfVerticalRelationClassifierContract'

const calibrationFor = (runs: Parameters<typeof calibrateVerticalEvidence>[0]): VerticalCalibrationSnapshot => {
  const result = calibrateVerticalEvidence(runs)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`Expected calibration success, received ${result.code}`)
  return result.value
}

const classify = (
  runs: Parameters<typeof calibrateVerticalEvidence>[0],
  candidates: readonly RowEvidenceCandidate[] = singletonCandidates(runs),
  calibration = calibrationFor(runs),
): readonly VerticalPairDecision[] => {
  const result = classifyVerticalRelations({ runs, candidates, calibration })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`Expected classifier success, received ${result.code}`)
  return result.value
}

const decisionSemantics = (decisions: readonly VerticalPairDecision[]) => decisions.map((decision) => ({
  outcome: decision.outcome,
  leftRunId: decision.leftRunId,
  rightRunId: decision.rightRunId,
  ...(decision.outcome === 'RELATION' ? { state: decision.state } : { reason: decision.reason }),
}))

const expectFailure = (
  result: ReturnType<typeof classifyVerticalRelations>,
  code: string,
) => {
  expect(result).toEqual({ ok: false, code })
}

describe('RP-037 VerticalRelationClassifier minimal policy contract', () => {
  it('classifies an exact-baseline same-candidate pair as SUPPORTED', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 100)]
    expect(decisionSemantics(classify(runs, oneCandidate(runs)))).toEqual([
      { outcome: 'RELATION', leftRunId: 0, rightRunId: 1, state: 'SUPPORTED' },
    ])
  })

  it('classifies an exact-baseline cross-candidate pair as SUPPORTED', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 100)]
    expect(decisionSemantics(classify(runs, singletonCandidates(runs)))).toEqual([
      { outcome: 'RELATION', leftRunId: 0, rightRunId: 1, state: 'SUPPORTED' },
    ])
  })

  it('keeps same-Y separate columns SUPPORTED because horizontal layout is out of scope', () => {
    const runs = [classifierRun(0, 100, { x: 10 }), classifierRun(1, 100, { x: 1000 })]
    expect(decisionSemantics(classify(runs))[0]).toMatchObject({ outcome: 'RELATION', state: 'SUPPORTED' })
  })

  it('classifies tiny nonzero exporter jitter with positive overlap as DEFERRED', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 100 + 1e-9)]
    expect(decisionSemantics(classify(runs))[0]).toMatchObject({ outcome: 'RELATION', state: 'DEFERRED' })
  })

  it('classifies a larger nonzero offset with positive overlap as DEFERRED rather than REJECTED', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 104)]
    expect(decisionSemantics(classify(runs))[0]).toMatchObject({ outcome: 'RELATION', state: 'DEFERRED' })
  })

  it('classifies exact-baseline split CJK heading fragments as SUPPORTED', () => {
    const runs = [classifierRun(0, 100, { text: '工' }), classifierRun(1, 100, { text: '作' })]
    expect(decisionSemantics(classify(runs))[0]).toMatchObject({ state: 'SUPPORTED' })
  })

  it('classifies jittered split CJK heading fragments as DEFERRED', () => {
    const runs = [classifierRun(0, 100, { text: '工' }), classifierRun(1, 100.001, { text: '作' })]
    expect(decisionSemantics(classify(runs))[0]).toMatchObject({ state: 'DEFERRED' })
  })

  it('classifies exact-baseline split Latin fragments as SUPPORTED', () => {
    const runs = [classifierRun(0, 100, { text: 'Software' }), classifierRun(1, 100, { text: 'Engineer' })]
    expect(decisionSemantics(classify(runs))[0]).toMatchObject({ state: 'SUPPORTED' })
  })

  it('classifies jittered split Latin fragments as DEFERRED', () => {
    const runs = [classifierRun(0, 100, { text: 'Software' }), classifierRun(1, 100.001, { text: 'Engineer' })]
    expect(decisionSemantics(classify(runs))[0]).toMatchObject({ state: 'DEFERRED' })
  })

  it('classifies mixed-height exact-baseline runs as SUPPORTED', () => {
    const runs = [classifierRun(0, 100, { height: 7 }), classifierRun(1, 100, { height: 18 })]
    expect(decisionSemantics(classify(runs))[0]).toMatchObject({ state: 'SUPPORTED' })
  })

  it('classifies mixed-height offset runs with positive overlap as DEFERRED', () => {
    const runs = [classifierRun(0, 100, { height: 18 }), classifierRun(1, 105, { height: 8 })]
    expect(decisionSemantics(classify(runs))[0]).toMatchObject({ state: 'DEFERRED' })
  })

  it('classifies a superscript-like positive-overlap pair as DEFERRED', () => {
    const runs = [classifierRun(0, 100, { height: 12 }), classifierRun(1, 107, { height: 5 })]
    expect(decisionSemantics(classify(runs))[0]).toMatchObject({ state: 'DEFERRED' })
  })

  it('classifies adjacent zero-overlap rows as explicit NO_VERTICAL_OVERLAP MISSING', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 90)]
    expect(decisionSemantics(classify(runs))[0]).toEqual({
      outcome: 'MISSING', leftRunId: 0, rightRunId: 1, reason: 'NO_VERTICAL_OVERLAP',
    })
  })

  it('classifies distant zero-overlap rows as MISSING rather than REJECTED', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 40)]
    expect(decisionSemantics(classify(runs))[0]).toEqual({
      outcome: 'MISSING', leftRunId: 0, rightRunId: 1, reason: 'NO_VERTICAL_OVERLAP',
    })
  })

  it('classifies unusable pair evidence as explicit UNUSABLE_VERTICAL_EVIDENCE MISSING', () => {
    const runs = [classifierRun(0, 100, { height: 0 }), classifierRun(1, 100, { height: 10 })]
    expect(decisionSemantics(classify(runs))[0]).toEqual({
      outcome: 'MISSING', leftRunId: 0, rightRunId: 1, reason: 'UNUSABLE_VERTICAL_EVIDENCE',
    })
  })

  it.each([
    { name: 'SUPPORTED', runs: [classifierRun(0, 100), classifierRun(1, 100)] },
    { name: 'DEFERRED', runs: [classifierRun(0, 100), classifierRun(1, 104)] },
    { name: 'MISSING', runs: [classifierRun(0, 100), classifierRun(1, 90)] },
  ])('keeps $name decisions independent of candidate boundaries', ({ runs }) => {
    expect(classify(runs, oneCandidate(runs))).toEqual(classify(runs, singletonCandidates(runs)))
  })

  it('classifies each pair from its own evidence without transitive inference', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 104), classifierRun(2, 110)]
    expect(decisionSemantics(classify(runs))).toEqual([
      { outcome: 'RELATION', leftRunId: 0, rightRunId: 1, state: 'DEFERRED' },
      { outcome: 'MISSING', leftRunId: 0, rightRunId: 2, reason: 'NO_VERTICAL_OVERLAP' },
      { outcome: 'RELATION', leftRunId: 1, rightRunId: 2, state: 'DEFERRED' },
    ])
  })

  it('returns zero decisions for zero runs', () => {
    const seed = calibrationFor([classifierRun(9, 100)])
    const emptyCalibration = { ...seed, runs: [] }
    expect(classify([], [], emptyCalibration)).toEqual([])
  })

  it('returns zero decisions for one run', () => {
    const runs = [classifierRun(0, 100)]
    expect(classify(runs)).toEqual([])
  })

  it('returns one canonical decision for two runs', () => {
    const runs = [classifierRun(7, 100), classifierRun(2, 100)]
    expect(classify(runs)).toHaveLength(1)
    expect(classify(runs)[0]).toMatchObject({ leftRunId: 2, rightRunId: 7 })
  })

  it('returns all six canonical decisions for four runs', () => {
    const runs = [classifierRun(3, 100), classifierRun(0, 100), classifierRun(2, 90), classifierRun(1, 104)]
    const pairs = classify(runs).map((decision) => [decision.leftRunId, decision.rightRunId])
    expect(pairs).toEqual([[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]])
  })

  it('emits every pair exactly once', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 104), classifierRun(2, 90), classifierRun(3, 70)]
    const keys = classify(runs).map((decision) => `${decision.leftRunId}:${decision.rightRunId}`)
    expect(keys).toHaveLength(6)
    expect(new Set(keys).size).toBe(6)
  })

  it('never emits REJECTED under the approved minimal policy', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 104), classifierRun(2, 90), classifierRun(3, 30)]
    expect(classify(runs).some((decision) => decision.outcome === 'RELATION' && decision.state === 'REJECTED')).toBe(false)
  })

  it('keeps MISSING as a successful complete decision without a relation state', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 90)]
    const result = classifyVerticalRelations({
      runs,
      candidates: singletonCandidates(runs),
      calibration: calibrationFor(runs),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value[0]).toMatchObject({ outcome: 'MISSING', reason: 'NO_VERTICAL_OVERLAP' })
      expect(result.value[0]).not.toHaveProperty('state')
    }

    const integration = buildRowEvidenceGraph(runs, {
      calibrationPolicy: calibrateVerticalEvidence,
      candidateProposer: proposeRowCandidates,
      relationClassifier: classifyVerticalRelations,
    })
    expect(integration.ok).toBe(true)
    if (integration.ok) {
      expect(integration.graph.relations).toEqual([])
      expect(validateRowEvidenceGraph(integration.graph)).toEqual({ valid: true, issues: [] })
    }
  })

  it('uses only the approved MISSING reasons', () => {
    const runs = [
      classifierRun(0, 100, { height: 0 }),
      classifierRun(1, 100),
      classifierRun(2, 80),
    ]
    const reasons = classify(runs)
      .filter((decision): decision is Extract<VerticalPairDecision, { outcome: 'MISSING' }> => decision.outcome === 'MISSING')
      .map((decision) => decision.reason)
    expect(new Set(reasons)).toEqual(new Set(['UNUSABLE_VERTICAL_EVIDENCE', 'NO_VERTICAL_OVERLAP']))
  })

  it('keeps RELATION evidence limited to the existing VerticalEvidence fields', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 100)]
    const decision = classify(runs)[0]
    expect(decision.outcome).toBe('RELATION')
    if (decision.outcome === 'RELATION') {
      expect(Object.keys(decision.evidence).sort()).toEqual([
        'baselineDifference', 'geometryComparable', 'heightRatio', 'verticalOverlapRatio',
      ])
    }
  })

  it('fails on duplicate canonical run identity', () => {
    const calibration = calibrationFor([classifierRun(0, 100)])
    const runs = [classifierRun(0, 100), classifierRun(0, 100)]
    expectFailure(classifyVerticalRelations({ runs, candidates: oneCandidate(runs), calibration }), 'DUPLICATE_CANONICAL_RUN_ID')
  })

  it('fails when unsafe geometry leaks into the classifier', () => {
    const safeRuns = [classifierRun(0, 100)]
    const runs = [classifierRun(0, 100, { geometryComparable: false })]
    expectFailure(classifyVerticalRelations({ runs, candidates: oneCandidate(runs), calibration: calibrationFor(safeRuns) }), 'UNSAFE_CLASSIFIER_INPUT')
  })

  it('fails on calibration run-set mismatch', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 100)]
    const calibration = calibrationFor([classifierRun(0, 100), classifierRun(9, 100)])
    expectFailure(classifyVerticalRelations({ runs, candidates: oneCandidate(runs), calibration }), 'CALIBRATION_RUN_SET_MISMATCH')
  })

  it('fails on missing calibration evidence', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 100)]
    const calibration = calibrationFor(runs)
    expectFailure(classifyVerticalRelations({
      runs,
      candidates: oneCandidate(runs),
      calibration: { ...calibration, runs: calibration.runs.slice(0, 1) },
    }), 'CALIBRATION_RUN_SET_MISMATCH')
  })

  it('fails on unknown calibration run evidence', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 100)]
    const calibration = calibrationFor(runs)
    expectFailure(classifyVerticalRelations({
      runs,
      candidates: oneCandidate(runs),
      calibration: { ...calibration, runs: [...calibration.runs, { runId: 99, heightToRepresentativeRatio: 1 }] },
    }), 'CALIBRATION_RUN_SET_MISMATCH')
  })

  it('fails on duplicate calibration run evidence', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 100)]
    const calibration = calibrationFor(runs)
    expectFailure(classifyVerticalRelations({
      runs,
      candidates: oneCandidate(runs),
      calibration: { ...calibration, runs: [...calibration.runs, calibration.runs[0]] },
    }), 'DUPLICATE_CALIBRATION_RUN_EVIDENCE')
  })

  it('fails on invalid representative height', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 100)]
    const calibration = calibrationFor(runs)
    expectFailure(classifyVerticalRelations({
      runs,
      candidates: oneCandidate(runs),
      calibration: { ...calibration, normalization: { ...calibration.normalization, representativeHeight: 0 } },
    }), 'INVALID_CALIBRATION_SNAPSHOT')
  })

  it('fails when a candidate references an unknown run', () => {
    const runs = [classifierRun(0, 100)]
    const candidates: readonly RowEvidenceCandidate[] = [{ id: 'candidate:bad', runIds: [0, 99], geometryStatus: 'comparable' }]
    expectFailure(classifyVerticalRelations({ runs, candidates, calibration: calibrationFor(runs) }), 'UNKNOWN_CANDIDATE_RUN_ID')
  })

  it('fails when a run has no primary candidate owner', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 100)]
    const candidates: readonly RowEvidenceCandidate[] = [{ id: 'candidate:0', runIds: [0], geometryStatus: 'comparable' }]
    expectFailure(classifyVerticalRelations({ runs, candidates, calibration: calibrationFor(runs) }), 'RUN_WITHOUT_PRIMARY_CANDIDATE')
  })

  it('fails when a run has multiple primary candidate owners', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 100)]
    const candidates: readonly RowEvidenceCandidate[] = [
      { id: 'candidate:a', runIds: [0, 1], geometryStatus: 'comparable' },
      { id: 'candidate:b', runIds: [1], geometryStatus: 'comparable' },
    ]
    expectFailure(classifyVerticalRelations({ runs, candidates, calibration: calibrationFor(runs) }), 'RUN_WITH_MULTIPLE_PRIMARY_CANDIDATES')
  })

  it('is deterministic across run, candidate, member, and calibration-evidence permutations', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 104), classifierRun(2, 90)]
    const calibration = calibrationFor(runs)
    const firstCandidates = [{ id: 'candidate:all', runIds: [2, 0, 1], geometryStatus: 'comparable' as const }]
    const secondCandidates = [{ id: 'candidate:all', runIds: [1, 2, 0], geometryStatus: 'comparable' as const }]
    const permutedCalibration = { ...calibration, runs: [...calibration.runs].reverse() }
    const before = structuredClone({ runs, firstCandidates, secondCandidates, calibration, permutedCalibration })
    expect(classify([...runs].reverse(), firstCandidates, permutedCalibration)).toEqual(
      classify(runs, secondCandidates, calibration),
    )
    expect({ runs, firstCandidates, secondCandidates, calibration, permutedCalibration }).toEqual(before)
  })

  it('preserves relation semantics under uniform scaling', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 104), classifierRun(2, 90)]
    const scaled = scaleClassifierRuns(runs, 5)
    expect(decisionSemantics(classify(scaled))).toEqual(decisionSemantics(classify(runs)))
  })

  it('is independent of text, font, horizontal geometry, and hasEOL metadata', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 104)]
    const changed = [
      classifierRun(0, 100, { text: '完全不同', fontName: 'OtherA', x: 900, width: 300, hasEOL: true }),
      classifierRun(1, 104, { text: 'Unrelated', fontName: 'OtherB', x: 10, width: 1, hasEOL: true }),
    ]
    expect(classify(changed)).toEqual(classify(runs))
  })

  it('does not assign final VisualGroup membership in SUPPORTED, DEFERRED, or MISSING decisions', () => {
    const runs = [classifierRun(0, 100), classifierRun(1, 104), classifierRun(2, 90)]
    const serialized = JSON.stringify(classify(runs))
    for (const field of ['visualGroup', 'finalMembership', 'column', 'readingOrder', 'serialization']) {
      expect(serialized).not.toContain(field)
    }
  })
})
