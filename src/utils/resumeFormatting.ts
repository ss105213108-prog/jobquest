import { detectSkills } from '../data/skillDictionary'
import type { ResumeEducation, ResumeProject, WorkExperience } from '../types'

const dateRangePattern = /((?:19|20)\d{2}(?:[/.\-]\d{1,2})?)\s*(?:-|–|—|~|～|至)\s*((?:19|20)\d{2}(?:[/.\-]\d{1,2})?|至今|present|current|now)/iu

export const formatResumeEducation = (education: ResumeEducation) =>
  [education.school, education.department, education.graduationStatus].filter(Boolean).join('｜')

export function parseResumeEducation(value: string): ResumeEducation {
  const [school = '', department = '', graduationStatus = ''] = value.split(/[｜|]/).map((part) => part.trim())
  return { school, department, graduationStatus }
}

export function formatWorkExperience(item: WorkExperience): string {
  const dates = item.startDate || item.endDate ? [item.startDate, item.endDate].filter(Boolean).join('～') : ''
  return [item.company, item.title, item.location, dates, item.durationText, item.description].filter(Boolean).join('｜')
}

export function parseWorkExperienceLine(value: string): WorkExperience | null {
  const parts = value.split(/[｜|]/).map((part) => part.trim()).filter(Boolean)
  if (!parts.length) return null
  const dateIndex = parts.findIndex((part) => dateRangePattern.test(part))
  const beforeDate = dateIndex >= 0 ? parts.slice(0, dateIndex) : parts
  const dateMatch = dateIndex >= 0 ? parts[dateIndex].match(dateRangePattern) : null
  const afterDate = dateIndex >= 0 ? parts.slice(dateIndex + 1) : []
  const durationText = afterDate.find((part) => /\d+\s*(?:年|個月|months?|years?)/iu.test(part))
  const description = afterDate.filter((part) => part !== durationText).join(' ').trim() || undefined
  const title = beforeDate.length >= 2 ? beforeDate[1] : beforeDate[0]
  if (!title) return null
  return {
    ...(beforeDate.length >= 2 ? { company: beforeDate[0] } : {}),
    title,
    ...(beforeDate.length >= 3 ? { location: beforeDate.slice(2).join(' ') } : {}),
    ...(dateMatch?.[1] ? { startDate: dateMatch[1] } : {}),
    ...(dateMatch?.[2] ? { endDate: dateMatch[2] } : {}),
    ...(durationText ? { durationText } : {}),
    ...(description ? { description } : {}),
  }
}

export function formatResumeProject(project: ResumeProject): string {
  return [project.name, project.skills.join(' / '), project.description].filter(Boolean).join('｜')
}

export function parseResumeProjectLine(value: string): ResumeProject | null {
  const [name = '', skillText = '', ...descriptionParts] = value.split(/[｜|]/).map((part) => part.trim())
  if (!name) return null
  return { name, skills: detectSkills(skillText).skills, ...(descriptionParts.length ? { description: descriptionParts.join(' ') } : {}) }
}
