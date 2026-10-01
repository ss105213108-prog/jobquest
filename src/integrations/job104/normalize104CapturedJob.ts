import { detectCanonicalSkills } from '../../matching/skillMatcher'
import type { Job } from '../../types'
import { build104CanonicalUrl } from './schema'
import type { Job104Capture } from './types'

export function normalize104CapturedJob(capture: Job104Capture, capturedAt: string): Job {
  const description = capture.snippetText?.trim() ?? ''
  return {
    id: capture.sourceKey,
    externalId: capture.externalId,
    source: '104',
    title: capture.title,
    company: capture.company,
    location: capture.location,
    salary: capture.salaryText,
    experience: capture.experienceText?.trim() || '未提供',
    category: '104 公開職缺',
    description,
    requiredSkills: detectCanonicalSkills(`${capture.title}\n${description}`),
    url: build104CanonicalUrl(capture.externalId),
    publishedAt: capturedAt,
    collectedAt: capturedAt,
    status: 'active',
  }
}
