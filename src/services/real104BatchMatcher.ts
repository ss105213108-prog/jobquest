import { matchingService } from './matchingService'
import type { Real104BatchDependencies } from './real104BatchWorkingSet'

// The caller supplies its current confirmed profile; the Foundation supplies
// only the current batch. Matching owns scoring, grading and result ordering.
export const matchReal104BatchJobs: Real104BatchDependencies['matchJobs'] =
  (resume, currentJobs) => matchingService.matchJobs(resume, currentJobs)
