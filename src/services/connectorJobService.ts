import { payloadMatches104Search } from '../integrations/job104/build104SearchUrl'
import { normalize104CapturedJob } from '../integrations/job104/normalize104CapturedJob'
import { get104PayloadState } from '../integrations/job104/schema'
import type { Job104ConnectorResponse } from '../integrations/job104/types'
import type { JobWithMatch, ResumeProfile, SearchPreference } from '../types'
import { matchingService } from './matchingService'

export async function matchCaptured104Jobs(
  response: Job104ConnectorResponse, preference: SearchPreference, confirmedResume: ResumeProfile,
): Promise<JobWithMatch[]> {
  if (preference.source !== '104') throw new Error('Connector 僅支援 104 職缺。')
  if (response.status === 'missing-extension') throw new Error('尚未偵測到 Job Quest 104 Connector。')
  if (response.status === 'no-capture') throw new Error('尚未擷取 104 職缺。請先開啟 104 搜尋結果並使用 Connector。')
  if (response.status === 'expired') throw new Error('104 職缺資料已過期，請重新擷取。')
  if (response.status === 'malformed') throw new Error('104 職缺資料格式不正確，請重新擷取。')
  if (response.status !== 'ready') throw new Error(response.message || 'Connector 暫時無法使用。')
  const { state, payload } = get104PayloadState(response.payload)
  if (state === 'expired') throw new Error('104 職缺資料已過期，請重新擷取。')
  if (state !== 'ready' || !payload) throw new Error('104 職缺資料格式不正確，請重新擷取。')
  if (!payloadMatches104Search(payload, preference.keyword, preference.location)) {
    throw new Error('最近一次擷取與目前關鍵字或地區不一致，請重新前往 104 搜尋並擷取。')
  }
  const jobs = payload.jobs.map(job => normalize104CapturedJob(job, payload.capturedAt))
  return matchingService.matchJobs(confirmedResume, jobs)
}
