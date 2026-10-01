import { describe, expect, it } from 'vitest'
import {
  calibrationCaseById,
  chainingFixture,
  measureRowPair,
  permutationFixture,
  rowCalibrationCases,
  unsafeGeometryCases,
} from './fixtures/pdfRowCandidateCalibration'

const evidenceByOriginalPair = (runs: readonly (typeof permutationFixture.original)[number][]) => {
  const entries: Array<[string, ReturnType<typeof measureRowPair>]> = []
  for (let firstIndex = 0; firstIndex < runs.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < runs.length; secondIndex += 1) {
      const first = runs[firstIndex]
      const second = runs[secondIndex]
      const key = [first.originalIndex, second.originalIndex].sort((a, b) => a - b).join(':')
      entries.push([key, measureRowPair(first, second)])
    }
  }
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)))
}

describe('RP-018 anonymous RowCandidate calibration corpus', () => {
  it('contains explicit MUST_GROUP, MUST_SEPARATE, and AMBIGUOUS cases', () => {
    const classifications = new Set(rowCalibrationCases.map((item) => item.classification))
    expect(classifications).toEqual(new Set(['MUST_GROUP', 'MUST_SEPARATE', 'AMBIGUOUS']))
  })

  it('records complete normalized evidence for every comparable pair', () => {
    for (const calibrationCase of rowCalibrationCases) {
      expect(calibrationCase.evidence.orientationCompatible, calibrationCase.id).toBe(true)
      expect(calibrationCase.evidence.baselineDifference, calibrationCase.id).not.toBeNull()
      expect(calibrationCase.evidence.normalizedBaselineDifference, calibrationCase.id).not.toBeNull()
      expect(calibrationCase.evidence.heightRatio, calibrationCase.id).not.toBeNull()
      expect(calibrationCase.evidence.verticalOverlapRatio, calibrationCase.id).not.toBeNull()
    }
  })

  it('classifies equal-baseline geometry as MUST_GROUP regardless of X distance', () => {
    const nearby = calibrationCaseById('same-baseline-same-height-base')
    const farApart = calibrationCaseById('same-baseline-far-apart-x')

    expect(nearby.classification).toBe('MUST_GROUP')
    expect(farApart.classification).toBe('MUST_GROUP')
    expect(farApart.evidence).toEqual(nearby.evidence)
  })

  it('keeps MUST_GROUP evidence invariant under uniform page scaling', () => {
    const original = calibrationCaseById('same-baseline-same-height-base')
    const scaled = calibrationCaseById('same-baseline-same-height-scaled')

    expect(scaled.classification).toBe(original.classification)
    expect(scaled.evidence.normalizedBaselineDifference).toBe(original.evidence.normalizedBaselineDifference)
    expect(scaled.evidence.heightRatio).toBe(original.evidence.heightRatio)
    expect(scaled.evidence.verticalOverlapRatio).toBe(original.evidence.verticalOverlapRatio)
  })

  it('keeps MUST_SEPARATE evidence invariant under uniform page scaling', () => {
    const original = calibrationCaseById('clearly-separated-rows-base')
    const scaled = calibrationCaseById('clearly-separated-rows-scaled')

    expect(scaled.classification).toBe('MUST_SEPARATE')
    expect(scaled.evidence.normalizedBaselineDifference).toBe(original.evidence.normalizedBaselineDifference)
    expect(scaled.evidence.heightRatio).toBe(original.evidence.heightRatio)
    expect(scaled.evidence.verticalOverlapRatio).toBe(original.evidence.verticalOverlapRatio)
    expect(scaled.evidence.verticalOverlapRatio).toBe(0)
  })

  it('records exporter-style baseline jitter at multiple scales without forcing membership', () => {
    const original = calibrationCaseById('exporter-jitter-base')
    const scaled = calibrationCaseById('exporter-jitter-scaled')

    expect(original.classification).toBe('AMBIGUOUS')
    expect(scaled.classification).toBe('AMBIGUOUS')
    expect(scaled.evidence.normalizedBaselineDifference).toBeCloseTo(original.evidence.normalizedBaselineDifference ?? -1)
    expect(scaled.evidence.heightRatio).toBe(original.evidence.heightRatio)
    expect(scaled.evidence.verticalOverlapRatio).toBeCloseTo(original.evidence.verticalOverlapRatio ?? -1)
  })

  it('keeps shared-baseline mixed heights in MUST_GROUP calibration', () => {
    const calibrationCase = calibrationCaseById('shared-baseline-mixed-heights')
    expect(calibrationCase.classification).toBe('MUST_GROUP')
    expect(calibrationCase.evidence.baselineDifference).toBe(0)
    expect(calibrationCase.evidence.heightRatio).toBeGreaterThan(1)
    expect(calibrationCase.evidence.verticalOverlapRatio).toBe(1)
  })

  it('leaves superscript and mixed offset-height geometry AMBIGUOUS', () => {
    expect(calibrationCaseById('superscript-small-label').classification).toBe('AMBIGUOUS')
    expect(calibrationCaseById('mixed-height-offset-baseline').classification).toBe('AMBIGUOUS')
  })

  it('exposes the pairwise chaining trap without assigning adjacent membership', () => {
    const [first, middle, last] = chainingFixture.runs
    const firstToMiddle = measureRowPair(first, middle)
    const middleToLast = measureRowPair(middle, last)
    const endpoints = measureRowPair(first, last)

    expect(chainingFixture.classification).toBe('AMBIGUOUS')
    expect(firstToMiddle.normalizedBaselineDifference).toBe(middleToLast.normalizedBaselineDifference)
    expect(endpoints.normalizedBaselineDifference).toBeGreaterThan(firstToMiddle.normalizedBaselineDifference ?? Number.POSITIVE_INFINITY)
    expect(endpoints.verticalOverlapRatio).toBe(0)
  })

  it('keeps pair evidence deterministic under input permutation', () => {
    const permuted = permutationFixture.order.map((index) => permutationFixture.original[index])
    expect(evidenceByOriginalPair(permuted)).toEqual(evidenceByOriginalPair(permutationFixture.original))
  })

  it('marks rotated and non-finite geometry as isolated-unsafe evidence', () => {
    for (const unsafeCase of unsafeGeometryCases) {
      expect(unsafeCase.expected).toBe('isolated-unsafe')
      expect(unsafeCase.run.geometryComparable, unsafeCase.id).toBe(false)
      expect(unsafeCase.run.orientation, unsafeCase.id).toBe('unsupported')
    }
  })

  it('keeps same-Y left and right columns in MUST_GROUP at the RowCandidate layer', () => {
    const calibrationCase = calibrationCaseById('same-y-left-right-columns')
    expect(calibrationCase.classification).toBe('MUST_GROUP')
    expect(calibrationCase.evidence.baselineDifference).toBe(0)
    expect(calibrationCase.evidence.verticalOverlapRatio).toBe(1)
  })
})
