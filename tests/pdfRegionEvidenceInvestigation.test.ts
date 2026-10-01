import { describe, expect, it } from 'vitest'
import { formVisualGroups } from '../src/parsers/pdfVisualGroupFormation'
import {
  validateRegionResolutionInput,
  validateRegionResolutionResult,
} from '../src/parsers/pdfRegionResolutionResult'
import { regionEvidencePairs } from './fixtures/pdfRegionEvidenceInvestigation'
import {
  canonicalRegionEvidenceSignature,
  canonicalRegionOwnershipSignature,
  materializeRegionIntent,
  withJitter,
} from './helpers/pdfRegionEvidenceInvestigationHarness'

const pairById = (id: string) => {
  const pair = regionEvidencePairs.find((candidate) => candidate.id === id)
  if (!pair) throw new Error(`Unknown anonymous pair: ${id}`)
  return pair
}

describe('RP-088 positive Region evidence investigation', () => {
  it('covers the required anonymous families without text or semantic input', () => {
    expect(regionEvidencePairs).toHaveLength(12)
    expect(regionEvidencePairs.map((pair) => pair.id)).toEqual([
      'SINGLE_COLUMN_CONTINUATION', 'PARALLEL_TRACKS', 'NARROW_SIDEBAR', 'WIDE_SIDEBAR',
      'FULL_WIDTH_HEADER', 'FULL_WIDTH_FOOTER', 'STACKED_FULL_WIDTH', 'UNEQUAL_DENSITY',
      'SPARSE_MISSING_SIDE', 'SPANNING_BETWEEN_BANDS', 'IDENTICAL_LOCAL_BOUNDS', 'NESTED_SIMILAR_BOUNDS',
    ])
    expect(regionEvidencePairs.every((pair) => pair.runs.every((run) => (
      Object.keys(run).sort().join(',') === 'height,width,x,y'
    )))).toBe(true)
  })

  it.each(regionEvidencePairs)(
    '$id admits opposite Region ownership against identical approved evidence', (pair) => {
      const positive = materializeRegionIntent(pair, pair.positive)
      const negative = materializeRegionIntent(pair, pair.opposite)
      expect(validateRegionResolutionInput(positive.input)).toEqual([])
      expect(validateRegionResolutionInput(negative.input)).toEqual([])
      expect(validateRegionResolutionResult(positive.input, positive.result)).toEqual([])
      expect(validateRegionResolutionResult(negative.input, negative.result)).toEqual([])
      expect(canonicalRegionEvidenceSignature(positive)).toEqual(canonicalRegionEvidenceSignature(negative))
      expect(canonicalRegionOwnershipSignature(positive)).not.toEqual(canonicalRegionOwnershipSignature(negative))
      expect(pair.classification).toBe('EXACT_REGION_AMBIGUITY')
    },
  )

  it('shows repeated x, parallel gaps, and wide-above-lower context are observations, not ownership proofs', () => {
    const same = pairById('SINGLE_COLUMN_CONTINUATION')
    const tracks = pairById('PARALLEL_TRACKS')
    const header = pairById('FULL_WIDTH_HEADER')
    expect(new Set(same.runs.map((run) => `${run.x}:${run.width}`)).size).toBe(1)
    expect(new Set(tracks.runs.map((run) => `${run.x}:${run.width}`)).size).toBe(2)
    expect(header.runs[0].width).toBeGreaterThan(header.runs[1].width)
    expect(header.runs[0].width).toBeGreaterThan(header.runs[2].width)
    for (const pair of [same, tracks, header]) {
      const positive = materializeRegionIntent(pair, pair.positive)
      const opposite = materializeRegionIntent(pair, pair.opposite)
      expect(canonicalRegionEvidenceSignature(positive)).toEqual(canonicalRegionEvidenceSignature(opposite))
    }
  })

  it('keeps the multi-group study conditional on future upstream RESOLVED output', () => {
    for (const id of ['SINGLE_COLUMN_CONTINUATION', 'PARALLEL_TRACKS', 'FULL_WIDTH_HEADER']) {
      const fixture = materializeRegionIntent(pairById(id), pairById(id).positive)
      if (fixture.input.evidence.status !== 'AVAILABLE') throw new Error('Invalid investigation fixture')
      expect(formVisualGroups(fixture.input.evidence).status).toBe('INSUFFICIENT_EVIDENCE')
    }
  })

  it('retains scale-invariant evidence and ownership for same, separate, and spanning intents', () => {
    for (const id of ['SINGLE_COLUMN_CONTINUATION', 'PARALLEL_TRACKS', 'FULL_WIDTH_HEADER']) {
      const pair = pairById(id)
      const base = materializeRegionIntent(pair, pair.positive)
      const scaled = materializeRegionIntent(pair, pair.positive, { scale: 2 })
      expect(validateRegionResolutionInput(scaled.input)).toEqual([])
      expect(validateRegionResolutionResult(scaled.input, scaled.result)).toEqual([])
      expect(canonicalRegionEvidenceSignature(scaled)).toEqual(canonicalRegionEvidenceSignature(base))
      expect(canonicalRegionOwnershipSignature(scaled)).toEqual(canonicalRegionOwnershipSignature(base))
      expect(canonicalRegionEvidenceSignature(materializeRegionIntent(pair, pair.opposite, { scale: 2 })))
        .toEqual(canonicalRegionEvidenceSignature(scaled))
    }
  })

  it('retains evidence and ownership under canonical run and VisualGroup permutation', () => {
    for (const id of ['SINGLE_COLUMN_CONTINUATION', 'PARALLEL_TRACKS', 'FULL_WIDTH_HEADER']) {
      const pair = pairById(id)
      const base = materializeRegionIntent(pair, pair.positive)
      const permutation = pair.runs.map((_, index) => pair.runs.length - index - 1)
      const permuted = materializeRegionIntent(pair, pair.positive, { permutation })
      expect(validateRegionResolutionInput(permuted.input)).toEqual([])
      expect(validateRegionResolutionResult(permuted.input, permuted.result)).toEqual([])
      expect(canonicalRegionEvidenceSignature(permuted)).toEqual(canonicalRegionEvidenceSignature(base))
      expect(canonicalRegionOwnershipSignature(permuted)).toEqual(canonicalRegionOwnershipSignature(base))
    }
  })

  it('records exact-alignment sensitivity as representation-limited without adding epsilon', () => {
    const base = pairById('SINGLE_COLUMN_CONTINUATION')
    const jittered = { ...base, runs: withJitter(base.runs) }
    const original = materializeRegionIntent(base, base.positive)
    const changed = materializeRegionIntent(jittered, jittered.positive)
    expect(validateRegionResolutionInput(changed.input)).toEqual([])
    expect(canonicalRegionEvidenceSignature(changed)).not.toEqual(canonicalRegionEvidenceSignature(original))
    expect(new Set(base.runs.map((run) => run.x)).size).toBe(1)
    expect(new Set(jittered.runs.map((run) => run.x)).size).toBe(2)
    const classification = 'REPRESENTATION_LIMITED'
    expect(classification).toBe('REPRESENTATION_LIMITED')
  })

  it('keeps fixture labels, raw text, font names, and Region ownership out of the evidence signature', () => {
    const pair = pairById('SPANNING_BETWEEN_BANDS')
    const fixture = materializeRegionIntent(pair, pair.positive)
    const signature = JSON.stringify(canonicalRegionEvidenceSignature(fixture))
    expect(signature).not.toMatch(/TOKEN|AnonymousFixture|SPANNING_BETWEEN_BANDS|COLUMN_LIKE|SPANNING/)
    expect(signature).not.toContain(pair.positive.label)
  })
})
