import { get104AreaCode, isSupported104Location } from './locationMap'
import type { Job104Payload } from './types'

const JOB104_SEARCH_URL = 'https://www.104.com.tw/jobs/search/'

export function build104SearchUrl(keyword: string, location: string): string {
  const normalizedKeyword = keyword.trim()
  if (!normalizedKeyword) throw new Error('請輸入 104 職缺關鍵字。')

  if (!isSupported104Location(location)) throw new Error('此地區尚未完成 104 Connector 驗證。')
  const areaCode = get104AreaCode(location)

  const url = new URL(JOB104_SEARCH_URL)
  if (areaCode !== null) url.searchParams.set('area', areaCode)
  url.searchParams.set('keyword', normalizedKeyword)
  return url.toString()
}

export function payloadMatches104Search(payload: Job104Payload, keyword: string, location: string): boolean {
  if (!isSupported104Location(location)) return false
  const areaCode = get104AreaCode(location)
  try {
    const url = new URL(payload.sourceUrl)
    const matchesLocation = areaCode === null ? !url.searchParams.has('area') : url.searchParams.get('area') === areaCode
    return matchesLocation && url.searchParams.get('keyword')?.trim() === keyword.trim()
  } catch {
    return false
  }
}
