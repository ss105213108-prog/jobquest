import { composeSerializedDocument, serializePageV1, type PdfPageManifest,
  type PdfSerializedPageEntry, type SerializedDocument } from '../../src/parsers/pdfSerialization'
import { toResumeSourceDocument, type ResumeSourceDocument } from '../../src/parsers/resumeSourceDocument'
import { pageFixture } from './pdfSerializationV1ContractHarness'

export const manifest = (pageCount: number): PdfPageManifest => ({
  pageCount, canonicalPageNumbers: Array.from({ length: pageCount }, (_, index) => index + 1),
})

export function admitted(texts: readonly string[]): {
  readonly pageManifest: PdfPageManifest
  readonly entries: readonly PdfSerializedPageEntry[]
  readonly serialized: SerializedDocument
  readonly source: ResumeSourceDocument
} {
  const pageManifest = manifest(texts.length)
  const entries = texts.map((text, index) => {
    const input = pageFixture([text], { pageNumber: index + 1 })
    const result = serializePageV1(input)
    if (!result) throw new Error('Invalid fixture')
    return { source: input, result }
  })
  const serialized = composeSerializedDocument(pageManifest, entries)
  if (!serialized) throw new Error('Invalid fixture')
  return { pageManifest, entries, serialized,
    source: toResumeSourceDocument(pageManifest, entries, serialized) }
}
