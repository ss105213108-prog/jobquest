import { constructPageLayoutEvidence } from '../../src/parsers/pdfPageLayoutEvidence'
import { resolveReadingOrderV1 } from '../../src/parsers/pdfReadingOrder'
import type { PdfSerializationInput } from '../../src/parsers/pdfSerialization'
import { formSpatialFactsV1 } from '../../src/parsers/pdfSpatialFactFormation'
import { bindSpatialInput } from '../../src/parsers/pdfSpatialStructureGraph'

export function pageFixture(texts: readonly string[], options: {
  readonly pageNumber?: number
  readonly positions?: readonly { readonly x: number; readonly y: number }[]
  readonly scale?: number
  readonly groupId?: string
} = {}): PdfSerializationInput {
  const pageNumber = options.pageNumber ?? 1
  const scale = options.scale ?? 1
  const evidence = constructPageLayoutEvidence({
    pageNumber,
    pageBounds: { minX: 0, maxX: 600 * scale, width: 600 * scale, source: 'pdf-page-view' },
    items: texts.map((str, index) => ({
      str, transform: [1, 0, 0, 1, (options.positions?.[index]?.x ?? 20 + index * 40) * scale,
        (options.positions?.[index]?.y ?? 700) * scale],
      width: 20 * scale, height: 10 * scale, dir: 'ltr', fontName: 'AnonymousFixture', hasEOL: false,
    })),
  })
  if (evidence.status !== 'AVAILABLE') throw new Error('Invalid anonymous page fixture')
  const visualGroups = {
    status: 'RESOLVED' as const, pageNumber,
    groups: [{ groupId: options.groupId ?? 'visual:whole', runIds: evidence.graph.runs.map((run) => run.originalIndex) }],
  }
  const input = bindSpatialInput(evidence, visualGroups)
  const spatial = formSpatialFactsV1(input)
  const order = resolveReadingOrderV1(input, spatial)
  return { input, spatial, order }
}
