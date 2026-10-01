import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { observeHorizontalLayout } from '../src/parsers/pdfHorizontalLayoutEvidence'
import {
  constructPageLayoutEvidence,
  type InternalPageLayoutEvidenceResult,
  type PageLayoutEvidenceConstructionStage,
} from '../src/parsers/pdfPageLayoutEvidence'
import { normalizeTextRunGeometry } from '../src/parsers/pdfTextGeometry'
import {
  availableEvidenceFixtures,
  invalidGeometryFixture,
  unavailableCalibrationFixture,
} from './fixtures/pdfPageLayoutEvidenceConstructionContract'

const available = (
  result: InternalPageLayoutEvidenceResult,
): Extract<InternalPageLayoutEvidenceResult, { status: 'AVAILABLE' }> => {
  expect(result.status).toBe('AVAILABLE')
  if (result.status !== 'AVAILABLE') throw new Error(`Expected AVAILABLE, received ${result.status}`)
  return result
}

const fixtureById = (id: string) => {
  const fixture = availableEvidenceFixtures.find((candidate) => candidate.id === id)
  if (!fixture) throw new Error(`Unknown evidence fixture: ${id}`)
  return fixture
}

describe('RP-056 internal PageLayoutEvidence composer AVAILABLE contract', () => {
  it.each(availableEvidenceFixtures)('$id preserves the full graph and HLE without layout policy', (fixture) => {
    const result = available(constructPageLayoutEvidence({ ...fixture, pageNumber: 1 }))

    expect(result.pageNumber).toBe(1)
    expect(result.graph.runs).toHaveLength(fixture.items.length)
    expect(result.graph.runs.map((run) => run.text)).toEqual(fixture.items.map((item) => item.str))
    expect(result.horizontalEvidence).toMatchObject({ schemaVersion: 1, scope: 'page' })
    expect(result).not.toHaveProperty('shouldMerge')
    expect(result).not.toHaveProperty('shouldSplit')
    expect(result).not.toHaveProperty('column')
    expect(result).not.toHaveProperty('sufficientForGrouping')
  })

  it('returns the same graph instance supplied to horizontal observation', () => {
    const fixture = fixtureById('SAME_Y_SEPARATE_COLUMNS')
    let graphObservedByHorizontal: unknown
    const result = available(constructPageLayoutEvidence({ ...fixture, pageNumber: 1 }, {
      horizontal: (input) => {
        graphObservedByHorizontal = input.graph
        return observeHorizontalLayout(input)
      },
    }))

    expect(result.graph).toBe(graphObservedByHorizontal)
  })

  it('executes every stage exactly once and in approved order', () => {
    const callOrder: PageLayoutEvidenceConstructionStage[] = []
    available(constructPageLayoutEvidence({
      ...fixtureById('TWO_COLUMN_50_50'),
      pageNumber: 1,
    }, { observeStage: (stage) => callOrder.push(stage) }))

    const approvedOrder: PageLayoutEvidenceConstructionStage[] = [
      'geometry',
      'vertical-calibration',
      'candidate-proposal',
      'relation-classification',
      'row-evidence-graph',
      'horizontal-observation',
    ]
    expect(callOrder).toEqual(approvedOrder)
    expect(Object.fromEntries(approvedOrder.map((stage) => [
      stage,
      callOrder.filter((observed) => observed === stage).length,
    ]))).toEqual({
      geometry: 1,
      'vertical-calibration': 1,
      'candidate-proposal': 1,
      'relation-classification': 1,
      'row-evidence-graph': 1,
      'horizontal-observation': 1,
    })
  })

  it('keeps unsafe runs and sparse evidence AVAILABLE when production stages succeed', () => {
    const mixed = available(constructPageLayoutEvidence({
      ...fixtureById('MIXED_SAFE_UNSAFE'),
      pageNumber: 3,
    }))
    expect(mixed.graph.runs.filter((run) => !run.geometryComparable).map((run) => run.originalIndex)).toEqual([1])
    expect(mixed.horizontalEvidence.availability.excludedUnsafeRunIds).toEqual([1])

    const sparse = available(constructPageLayoutEvidence({
      ...fixtureById('SPARSE_PAGE'),
      pageNumber: 1,
    }))
    expect(sparse.horizontalEvidence.availability.verticalContext).toBe('SINGLE_SLICE')
  })

  it('keeps HLE safeRunState NONE AVAILABLE when a valid unsafe-only graph reaches the observer', () => {
    const fixture = fixtureById('MIXED_SAFE_UNSAFE')
    const unsafeRun = normalizeTextRunGeometry({
      ...fixture.items[1],
      str: 'anonymous-unsafe-only',
    }, 0)
    const result = available(constructPageLayoutEvidence({
      items: [fixture.items[1]],
      pageBounds: fixture.pageBounds,
      pageNumber: 1,
    }, {
      graph: () => ({
        ok: true,
        graph: {
          runs: [unsafeRun],
          candidates: [{ id: 'unsafe:0', runIds: [0], geometryStatus: 'isolated-unsafe' }],
          relations: [],
        },
      }),
    }))
    expect(result.horizontalEvidence.availability.safeRunState).toBe('NONE')
    expect(result.horizontalEvidence.runIntervals).toEqual([])
  })

  it('keeps pageNumber as diagnostic identity without changing evidence semantics', () => {
    const fixture = fixtureById('NONZERO_PAGE_MIN_X')
    const pageOne = available(constructPageLayoutEvidence({ ...fixture, pageNumber: 1 }))
    const pageSeven = available(constructPageLayoutEvidence({ ...fixture, pageNumber: 7 }))

    expect(pageOne.pageNumber).toBe(1)
    expect(pageSeven.pageNumber).toBe(7)
    expect(pageSeven.graph).toEqual(pageOne.graph)
    expect(pageSeven.horizontalEvidence).toEqual(pageOne.horizontalEvidence)
  })
})

describe('RP-056 internal PageLayoutEvidence composer unavailable and failure contract', () => {
  it('maps insufficient calibration to UNAVAILABLE and skips downstream policy and observation', () => {
    const callOrder: PageLayoutEvidenceConstructionStage[] = []
    const candidate = vi.fn()
    const relation = vi.fn()
    const horizontal = vi.fn()
    const result = constructPageLayoutEvidence({
      ...unavailableCalibrationFixture,
      pageNumber: 2,
    }, { observeStage: (stage) => callOrder.push(stage), candidate, relation, horizontal })

    expect(result).toEqual({
      status: 'UNAVAILABLE',
      pageNumber: 2,
      stage: 'vertical-calibration',
      code: 'INSUFFICIENT_CALIBRATION',
    })
    expect(callOrder).toEqual(['geometry', 'vertical-calibration'])
    expect(candidate).not.toHaveBeenCalled()
    expect(relation).not.toHaveBeenCalled()
    expect(horizontal).not.toHaveBeenCalled()
  })

  it('maps INVALID_GEOMETRY_CONTEXT to FAILED vertical-calibration', () => {
    expect(constructPageLayoutEvidence({
      ...invalidGeometryFixture,
      pageNumber: 1,
    })).toMatchObject({
      status: 'FAILED',
      stage: 'vertical-calibration',
      code: 'INVALID_GEOMETRY_CONTEXT',
    })
  })

  it('preserves candidate-proposal failure and stops relation and HLE', () => {
    const relation = vi.fn()
    const horizontal = vi.fn()
    const result = constructPageLayoutEvidence({
      ...fixtureById('SINGLE_COLUMN'),
      pageNumber: 1,
    }, {
      candidate: () => ({ ok: false, code: 'CALIBRATION_RUN_SET_MISMATCH' }),
      relation,
      horizontal,
    })
    expect(result).toMatchObject({
      status: 'FAILED',
      stage: 'candidate-proposal',
      code: 'CALIBRATION_RUN_SET_MISMATCH',
    })
    expect(relation).not.toHaveBeenCalled()
    expect(horizontal).not.toHaveBeenCalled()
  })

  it('preserves relation-classification failure without partial evidence', () => {
    const horizontal = vi.fn()
    const result = constructPageLayoutEvidence({
      ...fixtureById('SINGLE_COLUMN'),
      pageNumber: 1,
    }, {
      relation: () => ({ ok: false, code: 'RUN_WITHOUT_PRIMARY_CANDIDATE' }),
      horizontal,
    })
    expect(result).toMatchObject({
      status: 'FAILED',
      stage: 'relation-classification',
      code: 'RUN_WITHOUT_PRIMARY_CANDIDATE',
    })
    expect(result).not.toHaveProperty('graph')
    expect(result).not.toHaveProperty('horizontalEvidence')
    expect(horizontal).not.toHaveBeenCalled()
  })

  it('maps graph validation failure without exposing a partial graph', () => {
    const result = constructPageLayoutEvidence({
      ...fixtureById('SINGLE_COLUMN'),
      pageNumber: 1,
    }, {
      graph: () => ({
        ok: false,
        stage: 'validation',
        issues: [{ code: 'RUN_WITHOUT_PRIMARY_CANDIDATE', runIds: [2, 1] }],
      }),
    })
    expect(result).toEqual({
      status: 'FAILED',
      pageNumber: 1,
      stage: 'row-evidence-graph',
      code: 'RUN_WITHOUT_PRIMARY_CANDIDATE',
      issues: [{ code: 'RUN_WITHOUT_PRIMARY_CANDIDATE', runIds: [1, 2] }],
    })
    expect(result).not.toHaveProperty('graph')
    expect(result).not.toHaveProperty('horizontalEvidence')
  })

  it('maps production HLE INVALID_LAYOUT_CONTEXT to horizontal-observation', () => {
    const fixture = fixtureById('SINGLE_COLUMN')
    expect(constructPageLayoutEvidence({
      items: fixture.items,
      pageNumber: 1,
      pageBounds: { ...fixture.pageBounds, width: 999 },
    })).toMatchObject({
      status: 'FAILED',
      stage: 'horizontal-observation',
      code: 'INVALID_LAYOUT_CONTEXT',
    })
  })
})

describe('RP-056 internal composer safety and isolation', () => {
  it('does not mutate frozen items, transforms, or page bounds', () => {
    const fixture = fixtureById('SINGLE_COLUMN')
    const items = Object.freeze(fixture.items.map((item) => Object.freeze({
      ...item,
      transform: Object.freeze([...item.transform]),
    })))
    const pageBounds = Object.freeze({ ...fixture.pageBounds })
    const before = JSON.stringify({ items, pageBounds })
    available(constructPageLayoutEvidence({ items, pageBounds, pageNumber: 1 }))
    expect(JSON.stringify({ items, pageBounds })).toBe(before)
  })

  it('is deterministic for the same semantic input', () => {
    const fixture = fixtureById('TWO_COLUMN_30_70')
    const first = constructPageLayoutEvidence({ ...fixture, pageNumber: 4 })
    const second = constructPageLayoutEvidence({ ...fixture, pageNumber: 4 })
    expect(second).toEqual(first)
  })

  it('remains absent from the production parser and page reconstructor', () => {
    const parserSource = readFileSync(resolve('src/parsers/pdfResumeParser.ts'), 'utf8')
    const reconstructorSource = readFileSync(resolve('src/parsers/pdfPageReconstructor.ts'), 'utf8')
    const productionSource = `${parserSource}\n${reconstructorSource}`
    expect(productionSource).not.toContain('constructPageLayoutEvidence')
    expect(productionSource).not.toContain('pdfPageLayoutEvidence')
    expect(productionSource).not.toContain('buildRowEvidenceGraph')
    expect(productionSource).not.toContain('observeHorizontalLayout')
  })
})
