import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resumeAnalyzer } from '../src/analyzers/resumeAnalyzer'
import { normalizeResumeText } from '../src/parsers/normalizeResumeText'
import type { ParsedResumeFile } from '../src/parsers/resumeParserTypes'

const text = readFileSync(resolve('tests/fixtures/resume-structured-anonymized.txt'), 'utf8')
const parsed: ParsedResumeFile = {
  text,
  fileName: 'structured-anonymous.pdf',
  fileType: 'pdf',
  pageCount: 1,
  parserMessages: [],
}
const profile = resumeAnalyzer.analyze(parsed, normalizeResumeText(text))
const structured = profile as unknown as {
  name: string
  education: { school: string; department: string; graduationStatus: string }
  workExperiences: Array<{ company?: string; title: string; location?: string; startDate?: string; endDate?: string; durationText?: string; description?: string }>
  projects: Array<{ name: string; description?: string; skills: string[] }>
  skills: string[]
  careerDirections: string[]
}

describe('Phase 4.2 structured resume extraction', () => {
  it('recognizes a valid Chinese name below a role heading', () => {
    expect(structured.name).toBe('林小安')
  })

  it('does not use Front End as the name', () => {
    expect(structured.name).not.toBe('Front End')
  })

  it('does not leave the name blank when the resume contains one', () => {
    expect(structured.name).not.toBe('')
  })

  it('can find a name inside a Basic Info section', () => {
    const basicText = '個人基本資料\n陳小美\n技能\nHTML CSS JavaScript'
    const basicParsed = { ...parsed, text: basicText }
    expect(resumeAnalyzer.analyze(basicParsed, normalizeResumeText(basicText)).name).toBe('陳小美')
  })

  it('returns structured Education only', () => {
    expect(structured.education).toEqual({ school: '範例科技大學', department: '資訊工程學系', graduationStatus: '畢業' })
  })

  it('does not include Education dates', () => {
    expect(JSON.stringify(structured.education)).not.toMatch(/2016|2022/)
  })

  it('does not include 自傳 in Education', () => {
    expect(JSON.stringify(structured.education)).not.toContain('自傳')
  })

  it('does not include 關於我 in Education', () => {
    expect(JSON.stringify(structured.education)).not.toContain('關於我')
  })

  it('extracts all three Work Experience entries', () => {
    expect(structured.workExperiences).toHaveLength(3)
  })

  it('preserves Work Experience order', () => {
    expect(structured.workExperiences.map((item) => item.title)).toEqual(['餐飲服務生', '門市人員', '前端開發助理'])
  })

  it('does not classify a Project as Work Experience', () => {
    expect(JSON.stringify(structured.workExperiences)).not.toContain('VTuber 購物網站')
  })

  it('extracts Project names', () => {
    expect(structured.projects.map((item) => item.name)).toEqual(['VTuber 購物網站', '公會任務看板', 'AI 文字工具'])
  })

  it('extracts Project technologies through the existing dictionary', () => {
    expect(structured.projects[0].skills).toEqual(['HTML', 'CSS', 'JavaScript', 'Bootstrap', 'PHP', 'MySQL'])
    expect(structured.projects[1].skills).toEqual(expect.arrayContaining(['TypeScript', 'React', 'Supabase', 'Vite']))
  })

  it('only exposes Projects with a name and skills', () => {
    expect(structured.projects.every((item) => item.name.trim() && item.skills.length > 0)).toBe(true)
  })

  it('keeps global Skills intact', () => {
    expect(structured.skills).toEqual(expect.arrayContaining(['HTML', 'CSS', 'SCSS', 'JavaScript', 'TypeScript', 'jQuery', 'Bootstrap', 'PHP', 'MySQL', 'PostgreSQL', 'Supabase', 'Cloudflare', 'Git', 'GitHub', 'Vite', 'AI', 'OpenAI API']))
  })

  it('keeps Career Directions intact', () => {
    expect(structured.careerDirections).toEqual(expect.arrayContaining(['前端開發', 'AI 應用開發']))
  })
})
