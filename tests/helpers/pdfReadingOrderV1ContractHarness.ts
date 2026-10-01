import { formSpatialFactsV1 } from '../../src/parsers/pdfSpatialFactFormation'
import {
  bindSpatialInput,
  type SpatialStructureInput,
  type SpatialStructureResult,
} from '../../src/parsers/pdfSpatialStructureGraph'
import type { ValidityClaim } from '../../src/parsers/resumeParserCause'
import { makeSpatialEvidence, singletonSpatialGroups } from './pdfSpatialStructureGraphContractHarness'

export interface AnonymousBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height?: number
}

export function readingOrderFixture(
  boxes: readonly AnonymousBox[],
  pageNumber = 1,
  groupOrder?: readonly number[],
): { readonly input: SpatialStructureInput; readonly spatial: SpatialStructureResult } {
  const evidence = makeSpatialEvidence(boxes, pageNumber)
  const groups = singletonSpatialGroups(evidence)
  if (groups.status !== 'RESOLVED') throw new Error('Invalid anonymous fixture')
  const ordered = groupOrder === undefined ? groups : {
    ...groups, groups: groupOrder.map((index) => groups.groups[index]),
  }
  const input = bindSpatialInput(evidence, ordered)
  return { input, spatial: formSpatialFactsV1(input) }
}

export function oneMultiRunGroupFixture(boxes: readonly AnonymousBox[]): {
  readonly input: SpatialStructureInput; readonly spatial: SpatialStructureResult
} {
  const evidence = makeSpatialEvidence(boxes)
  const input = bindSpatialInput(evidence, {
    status: 'RESOLVED', pageNumber: evidence.pageNumber,
    groups: [{ groupId: 'visual:whole', runIds: evidence.graph.runs.map((run) => run.originalIndex).sort((a, b) => a - b) }],
  })
  return { input, spatial: formSpatialFactsV1(input) }
}

export function validPdfClaims(pageNumber: number): readonly ValidityClaim[] {
  return [
    { scope: 'FILE', predicate: 'ADMISSION_ACCEPTED', state: 'CONFIRMED_VALID' },
    { scope: 'DOCUMENT', predicate: 'CONTAINER_PARSEABLE', state: 'CONFIRMED_VALID' },
    { scope: 'PAGE', predicate: 'PAGE_STRUCTURE_VALID', state: 'CONFIRMED_VALID', pageNumber },
    { scope: 'CONTENT', predicate: 'SUBSTANTIVE_CONTENT_PRESENT', state: 'CONFIRMED_VALID' },
  ]
}
