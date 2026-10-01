import type { JobSource } from '../types'

// REAL 104 retains Connector sourceKey; Demo retains its stable fixture ID.
export function jobActionSource(jobKey: string): JobSource | null {
  if (/^104:[a-z0-9]+$/.test(jobKey) || /^104-\d+$/.test(jobKey)) return '104'
  if (/^1111-\d+$/.test(jobKey)) return '1111'
  return null
}

export function isJobActionInScope(jobKey: string, source: JobSource, localDemo: boolean): boolean {
  return jobActionSource(jobKey) === source && (localDemo ? jobKey.startsWith(`${source}-`) : jobKey.startsWith('104:'))
}
