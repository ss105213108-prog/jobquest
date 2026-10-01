import { detectSkills, skillDictionary } from '../data/skillDictionary'
import type { ParsedResumeFile } from '../parsers/resumeParserTypes'
import type { ResumeEducation, ResumeParseWarningCode, ResumeProfile, ResumeProject, WorkExperience } from '../types'
import { detectResumeSections } from './sectionDetector'

const contactPattern = /@|https?:|www\.|github|linkedin|\b(?:email|phone|tel|mobile|address)\b|(?:\+?\d[\d\s()-]{7,})/iu
export const dateRangePattern = /((?:19|20)\d{2}(?:[/.\-]\d{1,2})?)\s*(?:-|–|—|~|～|至)\s*((?:19|20)\d{2}(?:[/.\-]\d{1,2})?|present|current|now|至今)/iu
const obviousNonNamePattern = /(?:front\s*-?\s*end|frontend|back\s*-?\s*end|backend|full\s*-?\s*stack|fullstack|developer|engineer|software|portfolio|resume|curriculum|\bcv\b|個人履歷|求職履歷|履歷|作品集|職涯方向|技能|前端|後端|全端|工程師|開發者|設計師)/iu
export const workTitleSignalPattern = /工程師|開發|助理|人員|服務生|實習生|專員|經理|設計師|developer|engineer|designer|manager|intern/iu
const workDurationSignalPattern = /\d+\s*(?:年|個月|months?|years?)/iu

// Shared bounded recognition only; legacy sequence/flattening behavior stays in this analyzer.
export const workCompanySignalPattern = /公司|有限公司|股份有限公司|工作室|企業|商店|餐飲/iu
export const educationFallbackPattern = /大學|科技大學|學院|university|college|institute/iu
export const workLabelPatterns = {
  company: /^(?:公司|公司名稱|company)\s*[:：]\s*(.+)$/iu,
  title: /^(?:職稱|title|position)\s*[:：]\s*(.+)$/iu,
  location: /^(?:地點|地區|location)\s*[:：]\s*(.+)$/iu,
}
export const projectLabelPatterns = {
  name: /^(?:專案名稱|作品名稱|網站名稱|project name)\s*[:：]\s*(.+)$/iu,
  tech: /^(?:使用技術|技術棧|技術|tech stack|technologies)\s*[:：]\s*(.+)$/iu,
  description: /^(?:專案功能|專案描述|功能描述|description)\s*[:：]\s*(.+)$/iu,
}

type WorkTraceReason = 'NO_SECTION' | 'EMPTY_SECTION' | 'NO_TITLE' | 'NO_DATE' | 'INVALID_TITLE'

interface WorkTraceCandidate {
  candidate: number
  titleFound: boolean
  dateFound: boolean
  added: boolean
  reason?: WorkTraceReason
}

interface WorkParserTrace {
  inputExists: boolean
  inputLineCount: number
  candidates: WorkTraceCandidate[]
  preFilterCount: number
  filteredOutCount: number
  outputCount: number
  reason?: WorkTraceReason
}

export function detectName(preamble: string[]): string {
  for (const rawLine of preamble.slice(0, 14)) {
    const candidate = rawLine.split(/[|｜·]/)[0].trim()
    if (!candidate || contactPattern.test(candidate) || obviousNonNamePattern.test(candidate)) continue
    if (/^[\p{Script=Han}]{2,4}$/u.test(candidate)) return candidate
    if (/^[A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+){1,3}$/.test(candidate) && candidate.length <= 60) return candidate
  }
  return ''
}

function fallbackEducationText(text: string): string {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const index = lines.findIndex((line) => educationFallbackPattern.test(line))
  return index < 0 ? '' : lines.slice(index, index + 3).join('\n')
}

function parseEducation(value: string | undefined): ResumeEducation {
  if (!value) return parseEducationLines([])
  const lines = value.split('\n').flatMap((line) => line.split('・')).map((line) => line.trim()).filter(Boolean)
  return parseEducationLines(lines)
}

export function parseEducationLines(lines: readonly string[]): ResumeEducation {
  const result: ResumeEducation = { school: '', department: '', graduationStatus: '' }
  const schoolPattern = /大學|科技大學|學院|專科|高中|高職|university|college|institute|school/iu
  const departmentPattern = /學系|系所|研究所|學程|(?:^|\s)系$|科$|department|major|computer science|information engineering/iu

  for (const line of lines) {
    const status = line.match(/畢業|肄業|就讀中|在學|graduated|graduating|enrolled|studying/iu)?.[0]
    if (status && !result.graduationStatus) {
      result.graduationStatus = /肄業/iu.test(status) ? '肄業' : /就讀中|在學|enrolled|studying|graduating/iu.test(status) ? '就讀中' : '畢業'
    }
    const inline = line.split(/\s+[–—-]\s+/).map((part) => part.trim()).filter(Boolean)
    if (inline.length >= 2 && schoolPattern.test(inline[0])) {
      if (!result.school) result.school = inline[0]
      const department = inline.slice(1).find((part) => departmentPattern.test(part))
      if (!result.department && department) result.department = department
      continue
    }
    const combined = line.match(/^(.+?(?:大學|學院|專科|高中|高職|university|college|institute|school))\s+(.+?(?:學系|系所|研究所|學程|系|科|department|major|computer science|information engineering))$/iu)
    if (combined) {
      if (!result.school) result.school = combined[1]
      if (!result.department) result.department = combined[2]
      continue
    }
    if (dateRangePattern.test(line)) continue
    const withoutStatus = line.replace(/畢業|肄業|就讀中|在學|graduated|graduating|enrolled|studying/giu, '').trim()
    if (!withoutStatus) continue
    if (!result.school && schoolPattern.test(withoutStatus)) result.school = withoutStatus
    else if (!result.department && departmentPattern.test(withoutStatus)) result.department = withoutStatus
  }
  return result
}

function parseDateRange(value: string) {
  const match = value.match(dateRangePattern)
  return match ? { startDate: match[1], endDate: match[2] } : {}
}

function parseWorkHeader(value: string): Pick<WorkExperience, 'company' | 'title'> {
  const dashParts = value.split(/\s+[–—-]\s+/).map((part) => part.trim()).filter(Boolean)
  if (dashParts.length >= 2) return { company: dashParts[0], title: dashParts.slice(1).join(' - ') }
  const chinese = value.match(/^(.+?(?:公司|工作室|企業|商店|餐飲))\s+(.+?(?:工程師|開發|助理|人員|服務生|實習生|專員|經理))$/u)
  return chinese ? { company: chinese[1], title: chinese[2] } : { title: value }
}

function appendDescription(item: WorkExperience, value: string) {
  const description = value.replace(/^(?:工作內容|description)\s*[:：]\s*/iu, '').trim()
  if (description) item.description = [item.description, description].filter(Boolean).join(' ')
}

function parseWorkExperiences(value: string | undefined, trace?: WorkParserTrace): WorkExperience[] {
  if (!value) {
    if (trace) trace.reason = value === undefined ? 'NO_SECTION' : 'EMPTY_SECTION'
    return []
  }
  const lines = value.split('\n').map((line) => line.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
  if (trace) trace.inputLineCount = lines.length
  const entries: WorkExperience[] = []
  let pending: Partial<WorkExperience> = {}
  const companyPattern = workCompanySignalPattern
  const titlePattern = workTitleSignalPattern
  const locationPattern = /(?:台|臺)[北中南東]?市|新北市|桃園市|新竹[市縣]|嘉義[市縣]|彰化縣|遠端|remote/iu

  const pushPending = (dateText = '', tail: string[] = []) => {
    const titleFound = Boolean(pending.title)
    const dateFound = dateRangePattern.test(dateText)
    if (!pending.title) {
      trace?.candidates.push({ candidate: trace.candidates.length + 1, titleFound, dateFound, added: false, reason: 'NO_TITLE' })
      return
    }
    const { startDate, endDate } = parseDateRange(dateText)
    const durationText = tail.find((part) => /\d+\s*(?:年|個月|months?|years?)/iu.test(part)) ?? pending.durationText
    const tailDescription = tail.filter((part) => part !== durationText).join(' ').trim()
    entries.push({
      ...(pending.company ? { company: pending.company } : {}),
      title: pending.title,
      ...(pending.location ? { location: pending.location } : {}),
      ...(startDate ? { startDate } : pending.startDate ? { startDate: pending.startDate } : {}),
      ...(endDate ? { endDate } : pending.endDate ? { endDate: pending.endDate } : {}),
      ...(durationText ? { durationText } : {}),
      ...((pending.description || tailDescription) ? { description: [pending.description, tailDescription].filter(Boolean).join(' ') } : {}),
    })
    trace?.candidates.push({ candidate: trace.candidates.length + 1, titleFound, dateFound, added: true })
    pending = {}
  }

  for (const line of lines) {
    const segments = line.split(/[|｜]|•|\s+·\s+/).map((part) => part.trim()).filter(Boolean)
    const dateIndex = segments.findIndex((segment) => dateRangePattern.test(segment))
    if (dateIndex >= 0) {
      const beforeDate = segments.slice(0, dateIndex)
      const afterDate = segments.slice(dateIndex + 1)
      if (beforeDate.length) {
        const parsedHeader = beforeDate.length >= 2 ? { company: beforeDate[0], title: beforeDate[1] } : parseWorkHeader(beforeDate[0])
        pending = {
          ...pending,
          ...parsedHeader,
          ...(beforeDate.length >= 3 ? { location: beforeDate.slice(2).join(' ') } : {}),
        }
      }
      pushPending(segments[dateIndex], afterDate)
      continue
    }
    const companyLabel = line.match(workLabelPatterns.company)
    if (companyLabel) {
      pending.company = companyLabel[1]
      continue
    }
    const titleLabel = line.match(workLabelPatterns.title)
    if (titleLabel) {
      pending.title = titleLabel[1]
      continue
    }
    const locationLabel = line.match(workLabelPatterns.location)
    if (locationLabel) {
      pending.location = locationLabel[1]
      continue
    }
    if (/^(?:工作內容|description)\s*[:：]/iu.test(line)) {
      if (pending.title) pending.description = [pending.description, line.replace(/^[^:：]+[:：]\s*/, '')].filter(Boolean).join(' ')
      else if (entries.length) appendDescription(entries[entries.length - 1], line)
      continue
    }
    if (entries.length && /^(?:年資|期間|duration)?\s*[:：]?\s*\d+\s*(?:年|個月|months?|years?)/iu.test(line)) {
      entries[entries.length - 1].durationText = line.replace(/^(?:年資|期間|duration)\s*[:：]\s*/iu, '')
      continue
    }
    if (!pending.company && companyPattern.test(line) && !titlePattern.test(line)) pending.company = line
    else if (!pending.title && titlePattern.test(line)) pending.title = line
    else if (!pending.location && locationPattern.test(line) && line.length <= 30) pending.location = line
    else if (entries.length && !Object.keys(pending).length) appendDescription(entries[entries.length - 1], line)
    else {
      const header = parseWorkHeader(line)
      pending = { ...pending, ...header }
    }
  }
  if (trace && Object.keys(pending).length) {
    trace.candidates.push({
      candidate: trace.candidates.length + 1,
      titleFound: Boolean(pending.title),
      dateFound: false,
      added: false,
      reason: pending.title ? 'NO_DATE' : 'NO_TITLE',
    })
  }
  const output = entries.filter((entry) => entry.title && entry.title !== '未辨識職稱')
  if (trace) {
    trace.preFilterCount = entries.length
    trace.filteredOutCount = entries.length - output.length
    trace.outputCount = output.length
    if (trace.filteredOutCount && !trace.reason) trace.reason = 'INVALID_TITLE'
  }
  return output
}

function parseProjects(value: string | undefined): ResumeProject[] {
  if (!value) return []
  const lines = value.split('\n').map((line) => line.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
  const projects: ResumeProject[] = []
  let current: ResumeProject | null = null
  const flush = () => {
    if (current?.name.trim() && current.skills.length) projects.push({ ...current, skills: [...new Set(current.skills)] })
    current = null
  }

  for (const line of lines) {
    const nameMatch = line.match(projectLabelPatterns.name)
    if (nameMatch) {
      flush()
      current = { name: nameMatch[1].trim(), skills: [] }
      continue
    }
    const techMatch = line.match(projectLabelPatterns.tech)
    if (techMatch) {
      if (current) current.skills = detectSkills(techMatch[1]).skills
      continue
    }
    const descriptionMatch = line.match(projectLabelPatterns.description)
    if (descriptionMatch) {
      if (current) current.description = [current.description, descriptionMatch[1].trim()].filter(Boolean).join(' ')
      continue
    }
    const dashParts = line.split(/\s+[–—-]\s+/).map((part) => part.trim()).filter(Boolean)
    const lineSkills = detectSkills(line).skills
    if (dashParts.length >= 2 && lineSkills.length) {
      flush()
      current = { name: dashParts[0], skills: detectSkills(dashParts.slice(1).join(' ')).skills }
      continue
    }
    if (!current) current = { name: line, skills: lineSkills }
    else if (!current.skills.length && lineSkills.length) current.skills = lineSkills
    else current.description = [current.description, line].filter(Boolean).join(' ')
  }
  flush()
  return projects.slice(0, 5)
}

export function careerDirectionsFromSignals(skills: string[], seen: (pattern: RegExp) => boolean): string[] {
  const has = (...values: string[]) => values.some((value) => skills.includes(value))
  const frontend = skills.filter((skill) => skillDictionary.find((item) => item.canonical === skill)?.group === 'frontend').length
  const backend = skills.filter((skill) => skillDictionary.find((item) => item.canonical === skill)?.group === 'backend').length
  const directions: string[] = []
  if (frontend >= 3) directions.push('前端開發')
  if (backend >= 2 && (has('REST API', 'GraphQL') || seen(/後端|backend|server/iu))) directions.push('後端開發')
  if (frontend >= 2 && backend >= 2 && has('MySQL', 'PostgreSQL', 'MongoDB', 'Supabase')) directions.push('全端開發')
  if (has('Python') && has('Pandas', 'NumPy') && seen(/資料|data|分析|analytics/iu)) directions.push('資料應用')
  if (has('AI', 'LLM', 'OpenAI API') && seen(/人工智慧|生成式|machine learning|\bAI\b|\bLLM\b/iu)) directions.push('AI 應用開發')
  return directions
}

function careerDirections(skills: string[], text: string): string[] {
  return careerDirectionsFromSignals(skills, (pattern) => pattern.test(text))
}

export function abilities(skills: string[]) {
  const score = (group: 'frontend' | 'backend' | 'database' | 'cloud' | 'tools') => Math.min(95, 28 + skills.filter((skill) => skillDictionary.find((item) => item.canonical === skill)?.group === group).length * 11)
  return [
    { label: '前端開發', value: score('frontend') },
    { label: '後端開發', value: score('backend') },
    { label: '資料庫', value: score('database') },
    { label: 'API / 雲端', value: score('cloud') },
    { label: '工具協作', value: score('tools') },
  ]
}

export const resumeAnalyzer = {
  analyze(parsed: ParsedResumeFile, normalizedText: string, options: { traceWorkExperience?: boolean } = {}): ResumeProfile {
    const { sections, preamble, detectedSections } = detectResumeSections(normalizedText)
    const { skills, aliasMatches } = detectSkills(normalizedText)
    const name = detectName([...preamble, ...(sections.basicInfo?.split('\n') ?? [])])
    const education = parseEducation(sections.education || fallbackEducationText(normalizedText))
    const workTrace: WorkParserTrace | undefined = options.traceWorkExperience ? {
      inputExists: sections.experience !== undefined,
      inputLineCount: 0,
      candidates: [],
      preFilterCount: 0,
      filteredOutCount: 0,
      outputCount: 0,
    } : undefined
    if (workTrace) {
      const normalizedLines = normalizedText.split('\n').filter((line) => line.trim())
      console.info('[RP-002][normalized]', {
        lineCount: normalizedLines.length,
        nonWhitespaceLength: normalizedText.replace(/\s/g, '').length,
        workTitleSignalCount: normalizedLines.filter((line) => workTitleSignalPattern.test(line)).length,
        dateRangeSignalCount: normalizedLines.filter((line) => dateRangePattern.test(line)).length,
        durationSignalCount: normalizedLines.filter((line) => workDurationSignalPattern.test(line)).length,
      })
      console.info('[RP-002][sections]', {
        experienceExists: sections.experience !== undefined,
        experienceLineCount: sections.experience?.split('\n').filter((line) => line.trim()).length ?? 0,
        experienceLength: sections.experience?.length ?? 0,
      })
    }
    const workExperiences = parseWorkExperiences(sections.experience, workTrace)
    if (workTrace) console.info('[RP-002][parser]', workTrace)
    if (workTrace) console.info('[RP-002][analyzer]', { workExperiencesCount: workExperiences.length })
    const projects = parseProjects(sections.projects)
    const directions = careerDirections(skills, normalizedText)
    const warnings: ResumeParseWarningCode[] = []
    if (normalizedText.replace(/\s/g, '').length < 120) warnings.push('LOW_TEXT_CONTENT')
    if (!name) warnings.push('NAME_NOT_FOUND')
    if (!education.school && !education.department) warnings.push('EDUCATION_NOT_DETECTED')
    if (!workExperiences.length) warnings.push('EXPERIENCE_NOT_DETECTED')
    if (!projects.length) warnings.push('PROJECTS_NOT_DETECTED')
    if (!skills.length) warnings.push('NO_SKILLS_FOUND')
    if (parsed.parserMessages.length) warnings.push('DOCX_PARSER_WARNING')

    return {
      id: `resume-${crypto.randomUUID()}`,
      name,
      skills,
      projects,
      workExperiences,
      education,
      careerDirections: directions,
      updatedAt: new Date().toISOString(),
      level: Math.max(1, Math.min(10, Math.ceil(skills.length / 3))),
      abilities: abilities(skills),
      parseMetadata: {
        parserVersion: 1,
        source: { fileName: parsed.fileName, fileType: parsed.fileType, ...(parsed.pageCount ? { pageCount: parsed.pageCount } : {}) },
        detectedSections,
        skillAliasesMatched: aliasMatches,
        warnings: [...new Set(warnings)],
      },
    }
  },
}
