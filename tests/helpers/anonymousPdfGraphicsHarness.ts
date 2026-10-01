import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { adaptPdfPageGeometry } from '../../src/parsers/pdfPageGeometry'
import { constructPageLayoutEvidence } from '../../src/parsers/pdfPageLayoutEvidence'
import { canonicalVisualGroupEvidenceSignature, type MaterializedVisualGroupGroundTruth } from './pdfVisualGroupGroundTruthHarness'
import type { VisualGroupGroundTruthFixture } from '../fixtures/pdfVisualGroupGroundTruth'

export interface AnonymousPageFrame {
  readonly minX: number
  readonly minY: number
  readonly scale: number
}

export interface AnonymousGraphicsPdfSpec {
  readonly fixture: VisualGroupGroundTruthFixture
  readonly drawings: readonly string[]
  readonly page?: AnonymousPageFrame
  readonly drawingPlacement?: 'before-text' | 'after-text'
}

export interface AnonymousGraphicPath {
  readonly kind: 'stroke' | 'fill' | 'clip'
  readonly points: readonly (readonly [number, number])[]
  readonly closed: boolean
  readonly color?: string
  readonly normalizedLineWidth?: number
}

const escapePdfText = (value: string) => value.replace(/([\\()])/g, '\\$1')

export function anonymousGraphicsPdfBytes(spec: AnonymousGraphicsPdfSpec): Uint8Array {
  const frame = spec.page ?? { minX: 0, minY: 0, scale: 1 }
  const width = 600 * frame.scale
  const height = 800 * frame.scale
  const text = spec.fixture.runs.map(({ item }) => {
    const x = frame.minX + item.transform[4] * frame.scale
    const y = frame.minY + item.transform[5] * frame.scale
    return `BT /F1 ${10 * frame.scale} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(item.str)}) Tj ET`
  }).join('\n')
  const drawings = spec.drawings.length === 0
    ? ''
    : `q ${frame.scale} 0 0 ${frame.scale} ${frame.minX} ${frame.minY} cm\n${spec.drawings.join('\n')}\nQ`
  const content = (spec.drawingPlacement === 'after-text'
    ? [text, drawings]
    : [drawings, text]).filter(Boolean).join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [${frame.minX} ${frame.minY} ${frame.minX + width} ${frame.minY + height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return new TextEncoder().encode(pdf)
}

type Matrix = readonly [number, number, number, number, number, number]
const identity: Matrix = [1, 0, 0, 1, 0, 0]
const multiply = (left: Matrix, right: Matrix): Matrix => [
  left[0] * right[0] + left[2] * right[1],
  left[1] * right[0] + left[3] * right[1],
  left[0] * right[2] + left[2] * right[3],
  left[1] * right[2] + left[3] * right[3],
  left[0] * right[4] + left[2] * right[5] + left[4],
  left[1] * right[4] + left[3] * right[5] + left[5],
]

const pathPoints = (encoded: readonly number[], matrix: Matrix, view: readonly number[]) => {
  const points: [number, number][] = []
  let closed = false
  for (let index = 0; index < encoded.length;) {
    const operation = encoded[index++]
    if (operation === 4) {
      closed = true
      continue
    }
    const coordinatePairs = operation === 0 || operation === 1 ? 1
      : operation === 2 ? 3
        : operation === 3 ? 2
          : 0
    if (coordinatePairs === 0) throw new Error(`Unsupported anonymous path operation: ${operation}`)
    for (let pair = 0; pair < coordinatePairs; pair += 1) {
      const x = encoded[index++]
      const y = encoded[index++]
      const pageX = matrix[0] * x + matrix[2] * y + matrix[4]
      const pageY = matrix[1] * x + matrix[3] * y + matrix[5]
      points.push([(pageX - view[0]) / (view[2] - view[0]), (pageY - view[1]) / (view[3] - view[1])])
    }
  }
  return { points, closed }
}

export function canonicalGraphicsSignature(
  operators: { readonly fnArray: readonly number[]; readonly argsArray: readonly unknown[] },
  view: readonly number[],
): readonly AnonymousGraphicPath[] {
  let matrix: Matrix = identity
  let strokeColor = '#000000'
  let fillColor = '#000000'
  let lineWidth = 1
  let clipping = false
  const stack: Array<{ matrix: Matrix; strokeColor: string; fillColor: string; lineWidth: number }> = []
  const paths: AnonymousGraphicPath[] = []

  operators.fnArray.forEach((operation, index) => {
    const args = operators.argsArray[index] as readonly unknown[] | null
    if (operation === OPS.save) {
      stack.push({ matrix, strokeColor, fillColor, lineWidth })
    } else if (operation === OPS.restore) {
      const previous = stack.pop()
      if (!previous) throw new Error('Unbalanced anonymous graphics state')
      ({ matrix, strokeColor, fillColor, lineWidth } = previous)
    } else if (operation === OPS.transform) {
      matrix = multiply(matrix, args as Matrix)
    } else if (operation === OPS.setStrokeRGBColor) {
      strokeColor = String(args?.[0])
    } else if (operation === OPS.setFillRGBColor) {
      fillColor = String(args?.[0])
    } else if (operation === OPS.setLineWidth) {
      lineWidth = Number(args?.[0])
    } else if (operation === OPS.clip || operation === OPS.eoClip) {
      clipping = true
    } else if (operation === OPS.constructPath) {
      const paint = Number(args?.[0])
      const encoded = Array.from((args?.[1] as readonly ArrayLike<number>[])[0])
      const geometry = pathPoints(encoded, matrix, view)
      if (clipping && paint === OPS.endPath) {
        paths.push({ kind: 'clip', ...geometry })
        clipping = false
      } else if (paint === OPS.stroke || paint === OPS.closeStroke) {
        const scale = Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]))
        paths.push({ kind: 'stroke', ...geometry, color: strokeColor,
          normalizedLineWidth: lineWidth * scale / (view[2] - view[0]) })
      } else if (paint === OPS.fill || paint === OPS.eoFill) {
        paths.push({ kind: 'fill', ...geometry, color: fillColor })
      }
    }
  })

  return paths.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

export async function observeAnonymousGraphicsPdf(spec: AnonymousGraphicsPdfSpec) {
  const loadingTask = getDocument({
    data: anonymousGraphicsPdfBytes(spec),
    useSystemFonts: true,
    disableFontFace: true,
  })
  try {
    const document = await loadingTask.promise
    const page = await document.getPage(1)
    try {
      const admission = adaptPdfPageGeometry({ view: page.view, rotate: page.rotate })
      if (!admission.ok) throw new Error(`Anonymous page admission failed: ${admission.code}`)
      const textContent = await page.getTextContent()
      const layout = constructPageLayoutEvidence({
        items: textContent.items.filter((item) => 'str' in item),
        pageBounds: admission.pageBounds,
        pageNumber: 1,
      })
      if (layout.status !== 'AVAILABLE') {
        throw new Error(`Anonymous layout unavailable: ${layout.status} ${layout.code} ${JSON.stringify(layout.status === 'FAILED' ? layout.issues?.map((issue) => issue.code) : [])}`)
      }
      const operators = await page.getOperatorList()
      return {
        textSignature: canonicalVisualGroupEvidenceSignature({ result: layout } as MaterializedVisualGroupGroundTruth),
        graphicsSignature: canonicalGraphicsSignature(operators, page.view),
        rawOperatorKinds: operators.fnArray,
      }
    } finally {
      page.cleanup()
    }
  } finally {
    await loadingTask.destroy()
  }
}
