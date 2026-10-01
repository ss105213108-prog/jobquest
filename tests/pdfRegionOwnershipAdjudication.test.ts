import { describe, expect, it } from 'vitest'
import html from '../docs/investigations/rp-089-blinded-layouts.html?raw'
import { regionEvidencePairs } from './fixtures/pdfRegionEvidenceInvestigation'

interface BlindLayout {
  readonly code: string
  readonly runs: readonly (readonly [number, number, number])[]
}

const data = html.match(/<script type="application\/json" id="layout-data">([\s\S]*?)<\/script>/)?.[1]
const layouts = JSON.parse(data ?? 'null') as BlindLayout[] | null
const geometryKey = (runs: BlindLayout['runs']) => JSON.stringify(runs)

describe('RP-089 blind Region adjudication stimulus', () => {
  it('contains every RP-088 geometry once without fixture names or ownership labels', () => {
    expect(layouts).not.toBeNull()
    expect(layouts).toHaveLength(regionEvidencePairs.length)
    expect(layouts?.map((layout) => layout.code)).toEqual(
      Array.from({ length: 12 }, (_, index) => `B${String(index + 1).padStart(2, '0')}`),
    )
    expect(layouts?.map((layout) => geometryKey(layout.runs)).sort()).toEqual(
      regionEvidencePairs.map((pair) => geometryKey(pair.runs.map(({ x, y, width }) => [x, y, width]))).sort(),
    )
    for (const layout of layouts ?? []) {
      expect(Object.keys(layout).sort()).toEqual(['code', 'runs'])
      for (const run of layout.runs) {
        expect(run).toHaveLength(3)
        expect(run.every((value) => Number.isFinite(value))).toBe(true)
      }
    }
    for (const pair of regionEvidencePairs) expect(html).not.toContain(pair.id)
    expect(JSON.stringify(layouts)).not.toMatch(/positive|opposite|intent|regions|role|classification/i)
  })

  it('shows each matched opposite pair as one identical observable stimulus', () => {
    const keys = new Set((layouts ?? []).map((layout) => geometryKey(layout.runs)))
    expect(keys.size).toBe(12)
    for (const pair of regionEvidencePairs) {
      const key = geometryKey(pair.runs.map(({ x, y, width }) => [x, y, width]))
      expect(keys.has(key)).toBe(true)
      expect(pair.positive.regions).not.toEqual(pair.opposite.regions)
    }
  })
})
