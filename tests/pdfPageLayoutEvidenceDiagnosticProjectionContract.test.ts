import { describe, expect, it } from 'vitest'
import {
  constructPageLayoutEvidence,
  projectPageLayoutEvidenceDiagnostic,
  type InternalPageLayoutEvidenceResult,
  type PageLayoutEvidenceConstructionStage,
  type PageLayoutEvidenceDiagnostic,
} from '../src/parsers/pdfPageLayoutEvidence'
import {
  availableEvidenceFixtures,
} from './fixtures/pdfPageLayoutEvidenceConstructionContract'

const fixtureById = (id: string) => {
  const fixture = availableEvidenceFixtures.find((candidate) => candidate.id === id)
  if (!fixture) throw new Error(`Unknown evidence fixture: ${id}`)
  return fixture
}

const availableInternal = (
  result: InternalPageLayoutEvidenceResult,
): Extract<InternalPageLayoutEvidenceResult, { status: 'AVAILABLE' }> => {
  expect(result.status).toBe('AVAILABLE')
  if (result.status !== 'AVAILABLE') throw new Error(`Expected AVAILABLE, received ${result.status}`)
  return result
}

const availableDiagnostic = (
  result: PageLayoutEvidenceDiagnostic,
): Extract<PageLayoutEvidenceDiagnostic, { status: 'AVAILABLE' }> => {
  expect(result.status).toBe('AVAILABLE')
  if (result.status !== 'AVAILABLE') throw new Error(`Expected AVAILABLE, received ${result.status}`)
  return result
}

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

const collectKeys = (value: unknown, keys = new Set<string>()): Set<string> => {
  if (!value || typeof value !== 'object') return keys
  for (const [key, child] of Object.entries(value)) {
    keys.add(key)
    collectKeys(child, keys)
  }
  return keys
}

describe('RP-056 privacy-safe PageLayoutEvidence diagnostic projection', () => {
  it('preserves the minimum structural graph facts and the same HLE instance', () => {
    const internal = availableInternal(constructPageLayoutEvidence({
      ...fixtureById('MIXED_SAFE_UNSAFE'),
      pageNumber: 6,
    }))
    const diagnostic = availableDiagnostic(projectPageLayoutEvidenceDiagnostic(internal))

    expect(diagnostic.pageNumber).toBe(6)
    expect(diagnostic).not.toHaveProperty('graph')
    expect(diagnostic.horizontalEvidence).toBe(internal.horizontalEvidence)
    expect(diagnostic.graphSummary).toEqual({
      runIds: internal.graph.runs.map((run) => run.originalIndex),
      unsafeRunIds: internal.graph.runs
        .filter((run) => !run.geometryComparable)
        .map((run) => run.originalIndex),
      candidates: internal.graph.candidates,
      relations: internal.graph.relations,
    })
    expect(Object.keys(diagnostic.graphSummary).sort()).toEqual([
      'candidates',
      'relations',
      'runIds',
      'unsafeRunIds',
    ])
  })

  it('keeps anonymous raw text and font sentinels internal', () => {
    const fixture = fixtureById('SINGLE_COLUMN')
    const sentinels = ['PRIVATE_SENTINEL_ALPHA', 'PRIVATE_SENTINEL_BETA']
    const items = fixture.items.map((item, index) => ({
      ...item,
      str: sentinels[index] ?? `anonymous-${index}`,
      fontName: `PRIVATE_FONT_SENTINEL_${index}`,
    }))
    const internal = availableInternal(constructPageLayoutEvidence({
      items,
      pageBounds: fixture.pageBounds,
      pageNumber: 1,
    }))
    expect(internal.graph.runs.map((run) => run.text)).toEqual(items.map((item) => item.str))

    const diagnostic = availableDiagnostic(projectPageLayoutEvidenceDiagnostic(internal))
    const serialized = JSON.stringify(diagnostic)
    for (const item of items) {
      expect(serialized).not.toContain(item.str)
      expect(serialized).not.toContain(item.fontName)
    }
    expect(serialized).not.toContain('filename')
  })

  it('audits current HLE as numeric and structural rather than textual or semantic', () => {
    const internal = availableInternal(constructPageLayoutEvidence({
      ...fixtureById('ENGLISH_LATIN'),
      pageNumber: 1,
    }))
    const diagnostic = availableDiagnostic(projectPageLayoutEvidenceDiagnostic(internal))
    const keys = collectKeys(diagnostic.horizontalEvidence)

    for (const forbidden of [
      'text',
      'str',
      'fontName',
      'heading',
      'section',
      'sectionName',
      'filename',
      'name',
      'company',
      'school',
      'email',
      'phone',
      'hasEOL',
    ]) {
      expect(keys.has(forbidden)).toBe(false)
    }
  })

  it('executes zero construction stages for one or repeated projections', () => {
    const callOrder: PageLayoutEvidenceConstructionStage[] = []
    const internal = constructPageLayoutEvidence({
      ...fixtureById('TWO_COLUMN_30_70'),
      pageNumber: 2,
    }, { observeStage: (stage) => callOrder.push(stage) })
    const callsAfterConstruction = [...callOrder]

    const first = projectPageLayoutEvidenceDiagnostic(internal)
    const second = projectPageLayoutEvidenceDiagnostic(internal)

    expect(callOrder).toEqual(callsAfterConstruction)
    expect(callOrder).toHaveLength(6)
    expect(second).toEqual(first)
  })

  it('is pure and does not mutate the internal result, graph, HLE, or issues', () => {
    const internal = deepFreeze(availableInternal(constructPageLayoutEvidence({
      ...fixtureById('SAME_Y_SEPARATE_COLUMNS'),
      pageNumber: 1,
    })))
    const before = JSON.stringify(internal)
    const first = projectPageLayoutEvidenceDiagnostic(internal)
    const second = projectPageLayoutEvidenceDiagnostic(internal)

    expect(first).toEqual(second)
    expect(JSON.stringify(internal)).toBe(before)
  })

  it('preserves UNAVAILABLE identity without adding graph or HLE', () => {
    const internal: InternalPageLayoutEvidenceResult = {
      status: 'UNAVAILABLE',
      pageNumber: 7,
      stage: 'vertical-calibration',
      code: 'INSUFFICIENT_CALIBRATION',
    }
    expect(projectPageLayoutEvidenceDiagnostic(internal)).toEqual(internal)
    expect(projectPageLayoutEvidenceDiagnostic(internal)).not.toHaveProperty('graphSummary')
    expect(projectPageLayoutEvidenceDiagnostic(internal)).not.toHaveProperty('horizontalEvidence')
  })

  it('preserves safe FAILED identity while removing private issue detail', () => {
    const internal = {
      status: 'FAILED',
      pageNumber: 4,
      stage: 'row-evidence-graph',
      code: 'RUN_WITHOUT_PRIMARY_CANDIDATE',
      issues: [{
        code: 'RUN_WITHOUT_PRIMARY_CANDIDATE',
        runIds: [2],
        candidateIds: ['candidate:2'],
        count: 1,
        privateDetail: 'PRIVATE_SENTINEL_ALPHA',
      }],
    } as unknown as InternalPageLayoutEvidenceResult
    const before = JSON.stringify(internal)
    const diagnostic = projectPageLayoutEvidenceDiagnostic(deepFreeze(internal))

    expect(diagnostic).toEqual({
      status: 'FAILED',
      pageNumber: 4,
      stage: 'row-evidence-graph',
      code: 'RUN_WITHOUT_PRIMARY_CANDIDATE',
      issues: [{
        code: 'RUN_WITHOUT_PRIMARY_CANDIDATE',
        runIds: [2],
        candidateIds: ['candidate:2'],
        count: 1,
      }],
    })
    expect(JSON.stringify(diagnostic)).not.toContain('PRIVATE_SENTINEL_ALPHA')
    expect(JSON.stringify(internal)).toBe(before)
  })
})
