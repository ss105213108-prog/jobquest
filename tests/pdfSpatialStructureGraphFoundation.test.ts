import { describe, expect, it } from 'vitest'
import {
  bindSpatialInput, projectSpatialDiagnostic, spatialInputIssues, spatialResultIssues,
  type SpatialStructureInput,
} from '../src/parsers/pdfSpatialStructureGraph'
import {
  makeSpatialEvidence, resolvedSpatialResult, singletonSpatialGroups,
} from './helpers/pdfSpatialStructureGraphContractHarness'

describe('RP-092 production spatial diagnostic projection', () => {
  it('projects only allowlisted structural fields for a valid zero-fact graph', () => {
    const evidence = makeSpatialEvidence([{ x: 30, y: 700, width: 100 }])
    const input = bindSpatialInput(evidence, singletonSpatialGroups(evidence))
    const result = resolvedSpatialResult(input)
    expect(spatialResultIssues(input, result)).toEqual([])
    expect(projectSpatialDiagnostic(input, result)).toEqual({
      pageNumber: 1, status: 'RESOLVED', nodeCount: 1, factCount: 0,
    })
  })

  it('rejects unsafe payloads instead of projecting their private fields', () => {
    const evidence = makeSpatialEvidence([{ x: 30, y: 700, width: 100 }])
    const input = bindSpatialInput(evidence, singletonSpatialGroups(evidence))
    const result = resolvedSpatialResult(input)
    expect(projectSpatialDiagnostic(input, { ...result, message: 'private resume text' })).toBeNull()
    expect(projectSpatialDiagnostic(input, {
      status: 'FAILED', pageNumber: 1, code: 'INVALID_SPATIAL_GRAPH', path: 'private.pdf',
    })).toBeNull()
    expect(projectSpatialDiagnostic(input, { status: 'FAILED', pageNumber: 1, code: 'INVALID_SPATIAL_GRAPH' }))
      .toEqual({ pageNumber: 1, status: 'FAILED', code: 'INVALID_SPATIAL_GRAPH' })
  })

  it('preserves a safe insufficiency cause without raw input details', () => {
    const evidence = makeSpatialEvidence([
      { x: 30, y: 740, width: 100 }, { x: 260, y: 740, width: 220, dir: 'rtl' },
      { x: 30, y: 680, width: 100 }, { x: 260, y: 680, width: 220 },
    ])
    const input = bindSpatialInput(evidence, singletonSpatialGroups(evidence))
    const result = { status: 'INSUFFICIENT_EVIDENCE', pageNumber: 1,
      diagnostic: { code: 'NODE_GEOMETRY_UNAVAILABLE', nodeCount: 4 } }
    expect(spatialResultIssues(input, result)).toEqual([])
    expect(projectSpatialDiagnostic(input, result)).toEqual({
      pageNumber: 1, status: 'INSUFFICIENT_EVIDENCE', code: 'NODE_GEOMETRY_UNAVAILABLE', nodeCount: 4,
    })
  })

  it('validates malformed runtime input, node, fact, and graph payloads', () => {
    const evidence = makeSpatialEvidence([
      { x: 30, y: 700, width: 100 }, { x: 260, y: 700, width: 100 },
    ])
    const input = bindSpatialInput(evidence, singletonSpatialGroups(evidence))
    const result = resolvedSpatialResult(input)
    if (result.status !== 'RESOLVED') throw new Error('Invalid fixture')
    expect(spatialInputIssues(null as unknown as SpatialStructureInput)).toContain('INVALID_INPUT_STRUCTURE')
    expect(spatialResultIssues(input, { ...result, graph: null })).toContain('INVALID_RESOLVED_SCHEMA')
    expect(spatialResultIssues(input, { ...result, graph: { ...result.graph, nodes: [null] } }))
      .toContain('INVALID_NODE_SCHEMA')
    expect(spatialResultIssues(input, { ...result, graph: { ...result.graph, facts: [null] } }))
      .toContain('INVALID_FACT_SCHEMA')
  })
})
