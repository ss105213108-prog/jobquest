import type { ResumeFileType } from '../types'

export interface ParsedResumeFile {
  text: string
  fileName: string
  fileType: ResumeFileType
  pageCount?: number
  parserMessages: string[]
}
