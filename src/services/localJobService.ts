import { mockJobs } from '../data/mockJobs'
import type { Job, SearchPreference } from '../types'

// Explicit local fixture mode, never a fallback for the production 104 connector.
export async function searchLocalJobs(input: SearchPreference): Promise<Job[]> {
  const keyword = input.keyword.trim().toLocaleLowerCase('zh-Hant')
  return mockJobs.filter(job => job.status === 'active' && job.source === input.source)
    .filter(job => input.location === '全部地區' || job.location === input.location)
    .filter(job => !keyword || [job.title, job.description, ...job.requiredSkills].join(' ')
      .toLocaleLowerCase('zh-Hant').includes(keyword)).map(job => structuredClone(job))
}
