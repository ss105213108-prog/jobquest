import { describe, expect, it } from 'vitest'
import {
  calibrationRun,
  equalHeightPairFamily,
  uniformlyScaledCalibrationFamily,
  validCalibrationFamily,
} from './fixtures/pdfVerticalCalibrationContract'
import {
  calibrateVerticalEvidence as calibrateVerticalEvidenceContract,
  observeNormalizedVerticalPair,
  type VerticalCalibrationResult as VerticalCalibrationContractResult,
  type VerticalCalibrationSnapshot,
} from '../src/parsers/pdfVerticalCalibration'

const expectSuccess = (result: VerticalCalibrationContractResult): VerticalCalibrationSnapshot => {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`Expected calibration success, received ${result.code}`)
  return result.value
}

const expectFailure = (
  result: VerticalCalibrationContractResult,
  code: 'INSUFFICIENT_CALIBRATION' | 'INVALID_GEOMETRY_CONTEXT',
) => {
  expect(result).toMatchObject({ ok: false, code })
  expect(result).not.toHaveProperty('value')
}

const collectNumericValues = (value: unknown): number[] => {
  if (typeof value === 'number') return [value]
  if (Array.isArray(value)) return value.flatMap(collectNumericValues)
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectNumericValues)
  return []
}

const collectKeys = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(collectKeys)
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, nested]) => [key, ...collectKeys(nested)])
}

const normalizedSemantics = (snapshot: VerticalCalibrationSnapshot) => ({
  schemaVersion: snapshot.schemaVersion,
  scope: snapshot.scope,
  sample: snapshot.sample,
  normalization: {
    lowerQuartileHeightRatio: snapshot.normalization.lowerQuartileHeightRatio,
    upperQuartileHeightRatio: snapshot.normalization.upperQuartileHeightRatio,
    heightDispersionRatio: snapshot.normalization.heightDispersionRatio,
  },
  runs: snapshot.runs,
})

describe('RP-028 Vertical Calibration Evidence contract', () => {
  it('produces a complete finite page-local snapshot from anonymous safe geometry', () => {
    const snapshot = expectSuccess(calibrateVerticalEvidenceContract(validCalibrationFamily()))

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      scope: 'page',
      sample: {
        comparableRunCount: 3,
        usableHeightCount: 3,
        unusableHeightCount: 0,
        usablePairCount: 3,
      },
      normalization: { representativeHeight: 12 },
    })
    expect(snapshot.runs.map((run) => run.runId)).toEqual([0, 1, 2])
  })

  it('returns a deep-equal snapshot for input permutations', () => {
    const runs = validCalibrationFamily()
    const forward = expectSuccess(calibrateVerticalEvidenceContract(runs))
    const permuted = expectSuccess(calibrateVerticalEvidenceContract([runs[1], runs[2], runs[0]]))
    expect(permuted).toEqual(forward)
  })

  it('preserves normalized semantics under uniform scaling', () => {
    const base = expectSuccess(calibrateVerticalEvidenceContract(uniformlyScaledCalibrationFamily(1)))
    const scaled = expectSuccess(calibrateVerticalEvidenceContract(uniformlyScaledCalibrationFamily(4)))

    expect(scaled.normalization.representativeHeight).toBe(base.normalization.representativeHeight * 4)
    expect(normalizedSemantics(scaled)).toEqual(normalizedSemantics(base))
  })

  it('does not use resume text', () => {
    const baseRuns = validCalibrationFamily()
    const changedText = baseRuns.map((run) => ({ ...run, text: `private-looking-but-fake-${run.originalIndex}` }))
    expect(expectSuccess(calibrateVerticalEvidenceContract(changedText))).toEqual(
      expectSuccess(calibrateVerticalEvidenceContract(baseRuns)),
    )
  })

  it('does not use font metadata', () => {
    const baseRuns = validCalibrationFamily()
    const changedFonts = baseRuns.map((run) => ({ ...run, fontName: `UnrelatedFont${run.originalIndex}` }))
    expect(expectSuccess(calibrateVerticalEvidenceContract(changedFonts))).toEqual(
      expectSuccess(calibrateVerticalEvidenceContract(baseRuns)),
    )
  })

  it('does not use horizontal geometry', () => {
    const baseRuns = validCalibrationFamily()
    const changedHorizontalGeometry = baseRuns.map((run, index) => ({
      ...run,
      x: 900 - index * 300,
      width: 200 + index * 40,
      endX: 1100 - index * 260,
    }))
    expect(expectSuccess(calibrateVerticalEvidenceContract(changedHorizontalGeometry))).toEqual(
      expectSuccess(calibrateVerticalEvidenceContract(baseRuns)),
    )
  })

  it('does not use hasEOL', () => {
    const baseRuns = validCalibrationFamily()
    const changedEndMarkers = baseRuns.map((run) => ({ ...run, hasEOL: !run.hasEOL }))
    expect(expectSuccess(calibrateVerticalEvidenceContract(changedEndMarkers))).toEqual(
      expectSuccess(calibrateVerticalEvidenceContract(baseRuns)),
    )
  })

  it('orders run evidence by canonical run ID rather than input order', () => {
    const snapshot = expectSuccess(calibrateVerticalEvidenceContract([
      calibrationRun(20, 100, 10),
      calibrationRun(3, 100, 10),
      calibrationRun(11, 100, 10),
    ]))
    expect(snapshot.runs.map((run) => run.runId)).toEqual([3, 11, 20])
  })

  it('requires a finite positive representative height on success', () => {
    const representativeHeight = expectSuccess(
      calibrateVerticalEvidenceContract(validCalibrationFamily()),
    ).normalization.representativeHeight
    expect(Number.isFinite(representativeHeight)).toBe(true)
    expect(representativeHeight).toBeGreaterThan(0)
  })

  it('never exposes NaN or infinite numbers in a successful snapshot', () => {
    const snapshot = expectSuccess(calibrateVerticalEvidenceContract(validCalibrationFamily()))
    expect(collectNumericValues(snapshot).every(Number.isFinite)).toBe(true)
  })

  it('records zero-height runs as unusable without using them as a denominator', () => {
    const snapshot = expectSuccess(calibrateVerticalEvidenceContract([
      calibrationRun(0, 100, 0),
      calibrationRun(1, 110, 10),
    ]))

    expect(snapshot.sample).toMatchObject({ usableHeightCount: 1, unusableHeightCount: 1, usablePairCount: 0 })
    expect(snapshot.normalization.representativeHeight).toBe(10)
    expect(snapshot.runs).toEqual([
      { runId: 0, heightToRepresentativeRatio: null },
      { runId: 1, heightToRepresentativeRatio: 1 },
    ])
  })

  it('returns INSUFFICIENT_CALIBRATION when no usable positive height exists', () => {
    const result = calibrateVerticalEvidenceContract([
      calibrationRun(0, 100, 0),
      calibrationRun(1, 110, 0),
    ])
    expectFailure(result, 'INSUFFICIENT_CALIBRATION')
  })

  it('rejects unsafe input as INVALID_GEOMETRY_CONTEXT', () => {
    const unsafe = calibrationRun(0, 100, 10, { transform: [0, 1, -1, 0, 20, 100] })
    expectFailure(calibrateVerticalEvidenceContract([unsafe]), 'INVALID_GEOMETRY_CONTEXT')
  })

  it('rejects non-finite required vertical geometry', () => {
    const malformed = { ...calibrationRun(4, 100, 10), baseline: Number.NaN }
    const result = calibrateVerticalEvidenceContract([malformed])
    expectFailure(result, 'INVALID_GEOMETRY_CONTEXT')
    if (!result.ok) expect(result.runIds).toEqual([4])
  })

  it('rejects duplicate canonical run identity', () => {
    const result = calibrateVerticalEvidenceContract([
      calibrationRun(7, 100, 10),
      calibrationRun(7, 120, 12),
    ])
    expectFailure(result, 'INVALID_GEOMETRY_CONTEXT')
    if (!result.ok) expect(result.runIds).toEqual([7])
  })

  it('allows a sparse one-run page when a normalization scale exists', () => {
    const snapshot = expectSuccess(calibrateVerticalEvidenceContract([calibrationRun(0, 100, 11)]))
    expect(snapshot.sample).toEqual({
      comparableRunCount: 1,
      usableHeightCount: 1,
      unusableHeightCount: 0,
      usablePairCount: 0,
    })
    expect(snapshot.runs).toEqual([{ runId: 0, heightToRepresentativeRatio: 1 }])
  })

  it('does not treat a same-height distribution as degenerate', () => {
    const snapshot = expectSuccess(calibrateVerticalEvidenceContract([
      calibrationRun(0, 100, 10),
      calibrationRun(1, 112, 10),
      calibrationRun(2, 124, 10),
    ]))
    expect(snapshot.normalization).toEqual({
      representativeHeight: 10,
      lowerQuartileHeightRatio: 1,
      upperQuartileHeightRatio: 1,
      heightDispersionRatio: 0,
    })
  })

  it('never returns a partial snapshot with a calibration failure', () => {
    const insufficient = calibrateVerticalEvidenceContract([calibrationRun(0, 100, 0)])
    const invalid = calibrateVerticalEvidenceContract([
      calibrationRun(1, 100, 10, { transform: [0, 1, -1, 0, 20, 100] }),
    ])
    expectFailure(insufficient, 'INSUFFICIENT_CALIBRATION')
    expectFailure(invalid, 'INVALID_GEOMETRY_CONTEXT')
  })

  it('keeps private and semantic fields outside the snapshot schema', () => {
    const snapshot = expectSuccess(calibrateVerticalEvidenceContract(validCalibrationFamily()))
    const forbiddenKeys = [
      'text', 'fontName', 'filename', 'name', 'company', 'email', 'phone', 'address',
      'heading', 'section', 'sectionAlias',
    ]
    expect(collectKeys(snapshot)).not.toEqual(expect.arrayContaining(forbiddenKeys))
    expect(JSON.stringify(snapshot)).not.toContain('anonymous-calibration')
  })

  it('keeps membership and relation policy fields outside the snapshot schema', () => {
    const snapshot = expectSuccess(calibrateVerticalEvidenceContract(validCalibrationFamily()))
    const forbiddenKeys = [
      'sameRowTolerance', 'supportedThreshold', 'rejectedThreshold', 'deferredRange',
      'likelySameRow', 'relationState', 'candidateId', 'candidateIds', 'rowBand', 'columnId',
    ]
    expect(collectKeys(snapshot)).not.toEqual(expect.arrayContaining(forbiddenKeys))
  })

  it('keeps normalized pair observations scale invariant without classification', () => {
    const basePair = equalHeightPairFamily(1)
    const scaledPair = equalHeightPairFamily(3)
    const baseCalibration = expectSuccess(calibrateVerticalEvidenceContract(basePair))
    const scaledCalibration = expectSuccess(calibrateVerticalEvidenceContract(scaledPair))
    const base = observeNormalizedVerticalPair(basePair[0], basePair[1], baseCalibration)
    const scaled = observeNormalizedVerticalPair(scaledPair[0], scaledPair[1], scaledCalibration)

    expect(base).toEqual({
      baselineDifferenceToRepresentativeHeight: 0.5,
      baselineDifferenceToPairHeight: 0.5,
      verticalOverlapRatio: 0.5,
      heightRatio: 1,
    })
    expect(scaled).toEqual(base)
    expect(collectKeys(base)).not.toEqual(expect.arrayContaining(['state', 'relationState', 'likelySameRow']))
  })

  it('defines normalized pair observations as symmetric', () => {
    const pair = equalHeightPairFamily()
    const calibration = expectSuccess(calibrateVerticalEvidenceContract(pair))
    expect(observeNormalizedVerticalPair(pair[0], pair[1], calibration)).toEqual(
      observeNormalizedVerticalPair(pair[1], pair[0], calibration),
    )
  })

  it('does not mutate inputs and returns a recursively frozen snapshot', () => {
    const runs = validCalibrationFamily()
    const snapshotBefore = structuredClone(runs)
    const snapshot = expectSuccess(calibrateVerticalEvidenceContract(runs))

    expect(runs).toEqual(snapshotBefore)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.sample)).toBe(true)
    expect(Object.isFrozen(snapshot.normalization)).toBe(true)
    expect(Object.isFrozen(snapshot.runs)).toBe(true)
    expect(snapshot.runs.every(Object.isFrozen)).toBe(true)
  })

  it('returns deterministic failure codes and related run IDs for malformed permutations', () => {
    const unsafe = calibrationRun(9, 100, 10, { transform: [0, 1, -1, 0, 20, 100] })
    const malformed = { ...calibrationRun(2, 100, 10), baseline: Number.POSITIVE_INFINITY }
    const forward = calibrateVerticalEvidenceContract([unsafe, malformed])
    const reversed = calibrateVerticalEvidenceContract([malformed, unsafe])
    expect(reversed).toEqual(forward)
    expect(forward).toEqual({ ok: false, code: 'INVALID_GEOMETRY_CONTEXT', runIds: [2, 9] })
  })
})
