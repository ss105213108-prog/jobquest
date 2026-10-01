export interface PhysicalPageBounds {
  readonly minX: number
  readonly maxX: number
  readonly width: number
  readonly source: 'pdf-page-view'
}

export interface PdfPageGeometryMetadata {
  readonly view: readonly number[]
  readonly rotate: number
}

export type PdfPageGeometryAdapterFailureCode =
  | 'INVALID_PDF_PAGE_VIEW'
  | 'UNSUPPORTED_PAGE_ROTATION'
  | 'INVALID_PAGE_GEOMETRY_METADATA'

export interface PdfPageGeometryAdapterIssue {
  readonly code: string
}

export type PdfPageGeometryAdapterResult =
  | {
      readonly ok: true
      readonly pageBounds: PhysicalPageBounds
    }
  | {
      readonly ok: false
      readonly code: PdfPageGeometryAdapterFailureCode
      readonly issues: readonly PdfPageGeometryAdapterIssue[]
    }

const failure = (
  code: PdfPageGeometryAdapterFailureCode,
  issueCodes: readonly string[],
): PdfPageGeometryAdapterResult => ({
  ok: false,
  code,
  issues: [...new Set(issueCodes)]
    .sort()
    .map((issueCode) => ({ code: issueCode })),
})

const pageViewIssues = (view: unknown): string[] => {
  if (!Array.isArray(view) || view.length !== 4) return ['VIEW_MUST_HAVE_EXACTLY_FOUR_COORDINATES']

  const issues: string[] = []
  for (let index = 0; index < view.length; index += 1) {
    const coordinate = view[index]
    if (typeof coordinate !== 'number') issues.push(`VIEW_COORDINATE_${index}_NOT_NUMBER`)
    else if (!Number.isFinite(coordinate)) issues.push(`VIEW_COORDINATE_${index}_NOT_FINITE`)
  }
  if (issues.length > 0) return issues

  const [minX, , maxX] = view as number[]
  if (maxX <= minX) issues.push('VIEW_HORIZONTAL_BOUNDS_NOT_INCREASING')
  const width = maxX - minX
  if (!Number.isFinite(width) || width <= 0) issues.push('VIEW_DERIVED_WIDTH_INVALID')
  return issues
}

export function adaptPdfPageGeometry(
  metadata: PdfPageGeometryMetadata,
): PdfPageGeometryAdapterResult {
  const rotate = (metadata as { readonly rotate?: unknown }).rotate
  if (typeof rotate !== 'number'
    || !Number.isFinite(rotate)
    || !Number.isInteger(rotate)
    || ![0, 90, 180, 270].includes(rotate)) {
    return failure('INVALID_PAGE_GEOMETRY_METADATA', ['INVALID_ROTATION_METADATA'])
  }
  if (rotate !== 0) {
    return failure('UNSUPPORTED_PAGE_ROTATION', [`ROTATION_${rotate}_NOT_SUPPORTED`])
  }

  const view = (metadata as { readonly view?: unknown }).view
  const issues = pageViewIssues(view)
  if (issues.length > 0) return failure('INVALID_PDF_PAGE_VIEW', issues)

  const [minX, , maxX] = view as number[]
  return {
    ok: true,
    pageBounds: {
      minX,
      maxX,
      width: maxX - minX,
      source: 'pdf-page-view',
    },
  }
}

