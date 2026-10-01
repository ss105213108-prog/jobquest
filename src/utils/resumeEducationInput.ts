import type { ResumeEducation } from '../types'
import { formatResumeEducation } from './resumeFormatting'

export interface ResumeEducationInput {
  original: ResumeEducation
  initialText: string
}

export function createResumeEducationInput(education: ResumeEducation): ResumeEducationInput {
  return { original: structuredClone(education), initialText: formatResumeEducation(education) }
}

/** An explicit opaque replacement, never a parser for institution/department/status. */
export function resolveResumeEducationInput(input: ResumeEducationInput, text: string): ResumeEducation {
  return text === input.initialText ? structuredClone(input.original)
    : { school: text, department: '', graduationStatus: '' }
}

export function replacesStructuredEducation(input: ResumeEducationInput, text: string): boolean {
  return text !== input.initialText && Boolean(input.original.department || input.original.graduationStatus)
}
