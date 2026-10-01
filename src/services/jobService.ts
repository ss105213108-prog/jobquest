import { mockJobs } from '../data/mockJobs'
import type { Job, SearchPreference } from '../types'
import { ServiceError, shouldMockFail, wait } from './serviceSupport'

type SearchInput = Pick<SearchPreference, 'source' | 'keyword' | 'location'>
const normalize = (value: string) => value.trim().toLocaleLowerCase('zh-Hant')

export const jobService = {
  async searchJobs(input: SearchInput): Promise<Job[]> {
    if (input.source === '104') {
      throw new ServiceError('JOB_SEARCH_FAILED', '104 正式職缺不使用 Mock fallback，請由 Job Quest 104 Connector 匯入。')
    }
    await wait(450)
    if (shouldMockFail('jobs')) {
      throw new ServiceError('JOB_SEARCH_FAILED', '目前無法取得職缺資料，請稍後再試。')
    }

    const keyword = normalize(input.keyword)
    return mockJobs
      .filter((job) => job.status === 'active')
      .filter((job) => job.source === input.source)
      .filter((job) => input.location === '全部地區' || job.location === input.location)
      .filter((job) => {
        if (!keyword) return true
        return normalize([job.title, job.description, ...job.requiredSkills].join(' ')).includes(keyword)
      })
      .map((job) => structuredClone(job))
  },
}
