import { analyzeJobRequirements } from '../matching/jobRequirementAnalyzer'
import { calculateJobMatch, createConservativeMatch, prepareResumeForMatching } from '../matching/scoreCalculator'
import type { Job, JobWithMatch, ResumeProfile } from '../types'
import { ServiceError, shouldMockFail, wait } from './serviceSupport'

export function sortMatchedJobs(items: JobWithMatch[]): JobWithMatch[] {
  return [...items].sort((left, right) => {
    const scoreDifference = right.match.matchScore - left.match.matchScore
    if (scoreDifference) return scoreDifference
    const dateDifference = new Date(right.job.publishedAt).getTime() - new Date(left.job.publishedAt).getTime()
    return dateDifference || left.job.id.localeCompare(right.job.id)
  })
}

export const matchingService = {
  async matchJobs(resume: ResumeProfile | null, jobs: Job[]): Promise<JobWithMatch[]> {
    if (!resume) throw new ServiceError('MATCHING_FAILED', '請先登錄履歷，才能進行職缺匹配。')
    await wait(350)
    if (shouldMockFail('matching')) {
      throw new ServiceError('MATCHING_FAILED', '目前無法完成職缺匹配，請稍後再試。')
    }
    const preparedResume = prepareResumeForMatching(resume)
    const matchedJobs = jobs
      .map((job) => {
        try {
          return { job, match: calculateJobMatch(preparedResume, analyzeJobRequirements(job)) }
        } catch {
          return { job, match: createConservativeMatch(job.id) }
        }
      })
    return sortMatchedJobs(matchedJobs)
  },
}
