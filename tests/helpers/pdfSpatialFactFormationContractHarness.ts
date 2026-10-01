// Anonymous RP-094 fixture transformations; formation policy lives in production.
import {
  bindSpatialInput,
  type SpatialStructureInput,
} from '../../src/parsers/pdfSpatialStructureGraph'
import {
  makeSpatialEvidence,
  singletonSpatialGroups,
} from './pdfSpatialStructureGraphContractHarness'

export interface AnonymousBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height?: number
  readonly dir?: string
}

export function spatialFactInput(
  boxes: readonly AnonymousBox[],
  options: {
    readonly scale?: number
    readonly shiftX?: number
    readonly shiftY?: number
    readonly groupOrder?: readonly number[]
  } = {},
): SpatialStructureInput {
  const geometry = boxes.map((box) => ({
    ...box, x: box.x + (options.shiftX ?? 0), y: box.y + (options.shiftY ?? 0),
  }))
  const evidence = makeSpatialEvidence(geometry, 1, options.scale ?? 1)
  const groups = singletonSpatialGroups(evidence)
  if (groups.status !== 'RESOLVED') throw new Error('Invalid anonymous fixture')
  const ordered = options.groupOrder ? {
    ...groups, groups: options.groupOrder.map((index) => groups.groups[index]),
  } : groups
  return bindSpatialInput(evidence, ordered)
}
