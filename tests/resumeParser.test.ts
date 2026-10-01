import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { resumeAnalyzer } from '../src/analyzers/resumeAnalyzer'
import { detectResumeSections } from '../src/analyzers/sectionDetector'
import { detectSkills } from '../src/data/skillDictionary'
import { normalizeResumeText } from '../src/parsers/normalizeResumeText'
import { MAX_RESUME_FILE_SIZE, parseResumeFile, validateResumeFile } from '../src/parsers/resumeFileParser'

GlobalWorkerOptions.workerSrc = pathToFileURL(resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs')).href

const fixture = (name: string, type: string) => {
  const bytes = readFileSync(resolve('tests/fixtures', name))
  return new File([bytes], name, { type })
}

describe('resume parser', () => {
  it('extracts and analyzes a text PDF', async () => {
    const parsed = await parseResumeFile(fixture('resume-text.pdf', 'application/pdf'))
    const profile = resumeAnalyzer.analyze(parsed, normalizeResumeText(parsed.text))

    expect(parsed.pageCount).toBe(1)
    expect(profile.name).toBe('Avery Lin')
    expect(profile.skills).toEqual(expect.arrayContaining(['JavaScript', 'TypeScript', 'React', 'PostgreSQL']))
    expect(profile.parseMetadata?.source.fileType).toBe('pdf')
  })

  it('extracts every page from a multi-page PDF', async () => {
    const parsed = await parseResumeFile(fixture('resume-multipage.pdf', 'application/pdf'))

    expect(parsed.pageCount).toBe(2)
    expect(parsed.text).toContain('Jordan Chen')
    expect(parsed.text).toContain('Projects')
  })

  it('extracts and analyzes a DOCX with Chinese headings and aliases', async () => {
    const parsed = await parseResumeFile(fixture('resume-text.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
    const profile = resumeAnalyzer.analyze(parsed, normalizeResumeText(parsed.text))

    expect(profile.name).toBe('林怡君')
    expect(profile.skills).toEqual(expect.arrayContaining(['TypeScript', 'React', 'PostgreSQL']))
    expect(profile.parseMetadata?.skillAliasesMatched).toEqual(expect.arrayContaining([
      { alias: 'React.js', canonical: 'React' },
      { alias: 'RESTful API', canonical: 'REST API' },
    ]))
  })

  it('rejects an image-only scanned PDF with an actionable error', async () => {
    await expect(parseResumeFile(fixture('resume-scanned.pdf', 'application/pdf'))).rejects.toMatchObject({ code: 'SCANNED_PDF' })
  })

  it('rejects unsupported and oversized files', () => {
    expect(() => validateResumeFile(new File(['hello'], 'resume.txt', { type: 'text/plain' }))).toThrow('目前僅支援 PDF 與 DOCX')
    expect(() => validateResumeFile(new File([new Uint8Array(MAX_RESUME_FILE_SIZE + 1)], 'huge.pdf', { type: 'application/pdf' }))).toThrow('10 MB 以下')
  })

  it('normalizes full-width text, bullets, spaces, and blank lines', () => {
    expect(normalizeResumeText('ＡＢＣ\t  React\r\n●  TypeScript\r\n\r\n\r\n')).toBe('ABC React\n• TypeScript')
  })

  it('does not confuse JavaScript with Java', () => {
    expect(detectSkills('JavaScript TypeScript').skills).toContain('JavaScript')
    expect(detectSkills('JavaScript TypeScript').skills).not.toContain('Java')
    expect(detectSkills('Java Spring Boot').skills).toEqual(expect.arrayContaining(['Java', 'Spring']))
  })

  it('normalizes common skill aliases', () => {
    const result = detectSkills('TS, ReactJS, Postgres')
    expect(result.skills).toEqual(expect.arrayContaining(['TypeScript', 'React', 'PostgreSQL']))
    expect(result.aliasMatches).toEqual(expect.arrayContaining([
      { alias: 'TS', canonical: 'TypeScript' },
      { alias: 'ReactJS', canonical: 'React' },
      { alias: 'Postgres', canonical: 'PostgreSQL' },
    ]))
  })

  it('supports inline English and Chinese section headings', () => {
    const result = detectResumeSections('Avery Lin\nSkills: React, TypeScript\n工作經驗：前端工程師\nEducation\nExample University')

    expect(result.sections.skills).toBe('React, TypeScript')
    expect(result.sections.experience).toBe('前端工程師')
    expect(result.sections.education).toBe('Example University')
  })
})
