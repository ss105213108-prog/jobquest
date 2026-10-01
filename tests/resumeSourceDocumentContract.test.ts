import { describe, expect, it } from 'vitest'
import { serializePageV1, type SerializedDocument } from '../src/parsers/pdfSerialization'
import { validateCause } from '../src/parsers/resumeParserCause'
import type { ParsedResumeFile } from '../src/parsers/resumeParserTypes'
import { pageFixture } from './helpers/pdfSerializationV1ContractHarness'
import {
  toResumeSourceDocument as adaptResumeSourceDocument, InvalidSerializedDocument, projectSourceDocumentDiagnostic,
  resumeSourceDocumentIssues, type ResumeSourceDocument,
} from '../src/parsers/resumeSourceDocument'
import { admitted, manifest } from './helpers/resumeSourceDocumentContractHarness'

describe('RP-104 ResumeSourceDocument structure (production)', () => {
  it('projects one admitted page and unit without changing source text or provenance', () => {
    const { pageManifest, serialized, source } = admitted(['hello'])
    expect(source).toEqual({ sourceKind: 'PDF', pages: [{ pageNumber: 1,
      units: [{ text: 'hello', provenance: { pageNumber: 1, groupId: 'visual:whole', runId: 0 } }] }] })
    expect(resumeSourceDocumentIssues(pageManifest, serialized, source)).toEqual([])
  })

  it.each(['hello', ' hello ', 'hello  world', '', ' ', '   ', '\t', '\nfoo', '\tfoo',
    'ＡＢＣ', 'Cafe\u0301', 'a\r\nb', '•  item'])
  ('preserves the exact JavaScript string %j', (text) => {
    const { serialized, source } = admitted([text])
    expect(source.pages[0]?.units[0]?.text).toBe(text)
    expect(source.pages[0]?.units[0]?.text).toBe(serialized.pages[0]?.orderedUnits[0]?.text)
    expect(source.pages[0]?.units).toHaveLength(1)
  })

  it('preserves a source-embedded newline but never creates one between pages', () => {
    const { source } = admitted(['foo\nbar', 'baz'])
    expect(source.pages[0]?.units[0]?.text).toBe('foo\nbar')
    expect(source.pages[1]?.units[0]?.text).toBe('baz')
    expect(source.pages).toHaveLength(2)
    expect(source).not.toHaveProperty('text')
    expect(JSON.stringify(source)).not.toContain('foo\\nbar\\nbaz')
  })

  it('retains typed page and unit boundaries in canonical document order', () => {
    const { pageManifest, serialized, source } = admitted(['z', 'a', 'm'])
    expect(source.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3])
    expect(source.pages.map((page) => page.units.map((unit) => unit.text))).toEqual([['z'], ['a'], ['m']])
    expect(resumeSourceDocumentIssues(pageManifest, serialized, source)).toEqual([])
  })

  it('supports traversal in canonical page/unit order without flattening', () => {
    const { source } = admitted(['first', 'second'])
    const visited: Array<[number, number, string]> = []
    for (const page of source.pages) {
      for (const unit of page.units) visited.push([page.pageNumber, unit.provenance.runId, unit.text])
    }
    expect(visited).toEqual([[1, 0, 'first'], [2, 0, 'second']])
  })

  it('can represent multiple ordered units without claiming current V1 can produce them', () => {
    const serialized: SerializedDocument = { pages: [{ pageNumber: 1, orderedUnits: [
      { groupId: 'group:a', runId: 0, text: 'A' },
      { groupId: 'group:b', runId: 1, text: 'B' },
    ] }] }
    const source: ResumeSourceDocument = { sourceKind: 'PDF', pages: [{ pageNumber: 1, units: [
      { text: 'A', provenance: { pageNumber: 1, groupId: 'group:a', runId: 0 } },
      { text: 'B', provenance: { pageNumber: 1, groupId: 'group:b', runId: 1 } },
    ] }] }
    expect(resumeSourceDocumentIssues(manifest(1), serialized, source)).toEqual([])
    expect(source.pages[0]?.units.map((unit) => unit.text)).toEqual(['A', 'B'])
    expect(source.pages[0]?.units).toHaveLength(2)
    expect(resumeSourceDocumentIssues(manifest(1), serialized,
      { ...source, pages: [{ ...source.pages[0], units: [...source.pages[0].units].reverse() }] })).not.toEqual([])
  })

  it('does not mistake a typed page break for a new semantic section', () => {
    const { source } = admitted(['part one', 'part two'])
    expect(source.pages).toHaveLength(2)
    expect(source.pages[1]).not.toHaveProperty('sectionType')
    expect(source.pages[1]).not.toHaveProperty('sectionStart')
    expect(source.pages[1]?.units[0]).not.toHaveProperty('isHeading')
  })

  it.each(['documentText', 'flatText', 'normalizedText', 'legacyText', 'sectionMap'])
  ('rejects the unapproved %s convenience field', (field) => {
    const { pageManifest, serialized, source } = admitted(['one', 'two'])
    expect(resumeSourceDocumentIssues(pageManifest, serialized, { ...source, [field]: 'one\ntwo' })).not.toEqual([])
  })

  it.each(['x', 'y', 'width', 'height', 'baseline', 'sectionType', 'isHeading', 'normalizedText'])
  ('does not need %s in a source unit', (field) => {
    const { pageManifest, serialized, source } = admitted(['text'])
    const unit = source.pages[0]?.units[0]
    if (!unit) throw new Error('Invalid fixture')
    expect(unit).not.toHaveProperty(field)
    const forged = { ...source, pages: [{ ...source.pages[0], units: [{ ...unit, [field]: 'inferred' }] }] }
    expect(resumeSourceDocumentIssues(pageManifest, serialized, forged)).not.toEqual([])
  })

  it('rejects a reordered page, duplicate page, and missing page', () => {
    const { pageManifest, serialized, source } = admitted(['one', 'two'])
    for (const pages of [
      [...source.pages].reverse(),
      [source.pages[0], source.pages[0]],
      [source.pages[0]],
    ]) expect(resumeSourceDocumentIssues(pageManifest, serialized, { ...source, pages })).not.toEqual([])
  })

  it('rejects wrong page provenance and a forged page number', () => {
    const { pageManifest, serialized, source } = admitted(['one', 'two'])
    const first = source.pages[0]
    const unit = first?.units[0]
    if (!first || !unit) throw new Error('Invalid fixture')
    const wrongProvenance = { ...first, units: [{ ...unit, provenance: { ...unit.provenance, pageNumber: 2 } }] }
    expect(resumeSourceDocumentIssues(pageManifest, serialized,
      { ...source, pages: [wrongProvenance, source.pages[1]] })).not.toEqual([])
    expect(resumeSourceDocumentIssues(pageManifest, serialized,
      { ...source, pages: [{ ...first, pageNumber: 3 }, source.pages[1]] })).not.toEqual([])
  })

  it('rejects wrong group/run provenance, forged text, and invalid text types', () => {
    const { pageManifest, serialized, source } = admitted(['private@example.invalid'])
    const page = source.pages[0]
    const unit = page?.units[0]
    if (!page || !unit) throw new Error('Invalid fixture')
    for (const changed of [
      { ...unit, provenance: { ...unit.provenance, groupId: 'foreign' } },
      { ...unit, provenance: { ...unit.provenance, runId: 99 } },
      { ...unit, text: 'forged' },
      { ...unit, text: null },
      { ...unit, text: undefined },
    ]) expect(resumeSourceDocumentIssues(pageManifest, serialized,
      { ...source, pages: [{ ...page, units: [changed] }] })).not.toEqual([])
  })

  it('rejects a duplicate, missing, or fabricated unit against a complete source', () => {
    const serialized: SerializedDocument = { pages: [{ pageNumber: 1, orderedUnits: [
      { groupId: 'a', runId: 0, text: 'A' }, { groupId: 'b', runId: 1, text: 'B' },
    ] }] }
    const one = { text: 'A', provenance: { pageNumber: 1, groupId: 'a', runId: 0 } }
    const two = { text: 'B', provenance: { pageNumber: 1, groupId: 'b', runId: 1 } }
    for (const units of [[one], [one, one], [one, two, two], [one, { ...two, provenance: { ...two.provenance, runId: 99 } }]]) {
      expect(resumeSourceDocumentIssues(manifest(1), serialized,
        { sourceKind: 'PDF', pages: [{ pageNumber: 1, units }] })).not.toEqual([])
    }
    expect(resumeSourceDocumentIssues(manifest(1), { pages: [{ pageNumber: 1,
      orderedUnits: [serialized.pages[0]?.orderedUnits[0], serialized.pages[0]?.orderedUnits[0]] }] },
    { sourceKind: 'PDF', pages: [{ pageNumber: 1, units: [one, one] }] })).toContain('DUPLICATE_SERIALIZED_UNIT')
  })

  it('rejects malformed page identity or source kind without repairing them', () => {
    const { pageManifest, serialized, source } = admitted(['text'])
    expect(resumeSourceDocumentIssues(pageManifest, serialized, { ...source, sourceKind: 'DOCX' })).not.toEqual([])
    expect(resumeSourceDocumentIssues({ pageCount: 1, canonicalPageNumbers: [0] }, serialized, source)).not.toEqual([])
    expect(resumeSourceDocumentIssues(pageManifest, serialized,
      { ...source, pages: [{ ...source.pages[0], pageNumber: 0 }] })).not.toEqual([])
  })
})

describe('RP-104 adapter admission, privacy, and migration boundary (production)', () => {
  it('uses the production document guard and rejects unresolved or malformed input', () => {
    const { pageManifest, entries, serialized } = admitted(['text'])
    expect(adaptResumeSourceDocument(pageManifest, entries, serialized).pages).toHaveLength(1)
    expect(() => adaptResumeSourceDocument(pageManifest, entries, { pages: [] })).toThrow(InvalidSerializedDocument)
    expect(() => adaptResumeSourceDocument(pageManifest, entries,
      { pages: [{ pageNumber: 1, orderedUnits: [] }] })).toThrow(InvalidSerializedDocument)
    expect(() => adaptResumeSourceDocument({ pageCount: 1, canonicalPageNumbers: [2] }, entries, serialized))
      .toThrow(InvalidSerializedDocument)
  })

  it('does not relabel upstream non-resolved Serialization as an adapter result', () => {
    const fixture = pageFixture(['a', 'b'])
    const result = serializePageV1(fixture)
    if (!result) throw new Error('Invalid fixture')
    expect(result.status).toBe('INSUFFICIENT_EVIDENCE')
    const entries = [{ source: fixture, result }]
    expect(() => adaptResumeSourceDocument(manifest(1), entries,
      { pages: [{ pageNumber: 1, orderedUnits: [] }] })).toThrow(InvalidSerializedDocument)
    expect(validateCause({ format: 'pdf', code: 'PDF_ADAPTER_INSUFFICIENT', pageNumber: 1 })).toBe(false)
  })

  it('allows functional raw text but never projects it to diagnostics', () => {
    const secret = 'Name name@example.invalid +886-900-000-000 Company School'
    const { pageManifest, serialized, source } = admitted([secret])
    expect(source.pages[0]?.units[0]?.text).toBe(secret)
    const diagnostic = projectSourceDocumentDiagnostic(pageManifest, serialized, source)
    expect(diagnostic).toEqual({ code: 'SOURCE_DOCUMENT_VALID', pageCount: 1, unitCount: 1 })
    expect(JSON.stringify(diagnostic)).not.toContain(secret)
    expect(projectSourceDocumentDiagnostic(pageManifest, serialized,
      { ...source, errorMessage: 'C:\\private\\resume.pdf' })).toEqual({ code: 'INVALID_SOURCE_DOCUMENT' })
  })

  it('does not mutate source arrays and is deterministic on the same admitted document', () => {
    const { pageManifest, entries, serialized } = admitted([' first ', '\tsecond'])
    const before = structuredClone({ serialized, entries })
    const first = adaptResumeSourceDocument(pageManifest, entries, serialized)
    const second = adaptResumeSourceDocument(pageManifest, entries, serialized)
    expect(first).toEqual(second)
    expect({ serialized, entries }).toEqual(before)
    expect(first.pages[0]).not.toBe(serialized.pages[0])
    expect(first.pages[0]?.units[0]).not.toBe(serialized.pages[0]?.orderedUnits[0])
  })

  it('keeps the existing DOCX string contract separate from the PDF-only source model', () => {
    const legacyDocx: ParsedResumeFile = {
      text: 'existing DOCX text', fileName: 'anonymous.docx', fileType: 'docx', parserMessages: [],
    }
    expect(legacyDocx.text).toBe('existing DOCX text')
    expect(admitted(['pdf text']).source.sourceKind).toBe('PDF')
  })
})
