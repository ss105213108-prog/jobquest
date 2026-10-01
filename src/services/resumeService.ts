import { resumeAnalyzer } from '../analyzers/resumeAnalyzer'
import { normalizeResumeText } from '../parsers/normalizeResumeText'
import { parseResumeFile, validateResumeFile } from '../parsers/resumeFileParser'
import { resumeRepository } from '../repositories/resumeRepository'
import type { ResumeProfile } from '../types'

export type ResumeAnalysisStage = 'reading' | 'normalizing' | 'analyzing' | 'complete'

export const resumeService = {
  validateFile: validateResumeFile,
  async analyzeResume(file: File, onProgress?: (stage: ResumeAnalysisStage) => void): Promise<ResumeProfile> {
    onProgress?.('reading')
    const parsed = await parseResumeFile(file)
    onProgress?.('normalizing')
    const normalizedText = normalizeResumeText(parsed.text)
    onProgress?.('analyzing')
    const profile = resumeAnalyzer.analyze(parsed, normalizedText, { traceWorkExperience: import.meta.env.DEV })
    onProgress?.('complete')
    return profile
  },
  loadSaved: () => resumeRepository.getCurrent(),
  save: (userId: string, profile: ResumeProfile) => resumeRepository.upsert(userId, profile),
}
