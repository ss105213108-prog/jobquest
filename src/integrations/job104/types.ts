export const JOB104_PAYLOAD_VERSION = 1 as const
export const JOB104_PAYLOAD_TTL_MS = 30 * 60 * 1000
// Legacy REAL session snapshot ceiling only; full-page capture has no count cap.
export const JOB104_MAX_JOBS = 10

export interface Job104Capture {
  externalId: string
  sourceKey: string
  title: string
  company: string
  location: string
  salaryText: string
  experienceText?: string
  snippetText?: string
  canonicalUrl: string
}

export interface Job104Payload {
  version: typeof JOB104_PAYLOAD_VERSION
  source: '104'
  capturedAt: string
  sourceUrl: string
  jobs: Job104Capture[]
}

export type Job104PayloadState = 'ready' | 'no-capture' | 'expired' | 'malformed'

export type Job104ConnectorState =
  | 'checking'
  | 'missing-extension'
  | 'no-capture'
  | 'expired'
  | 'ready'
  | 'malformed'
  | 'error'

export type Job104ConnectorCommand = 'JOBQUEST_104_STATUS' | 'JOBQUEST_104_GET_LATEST' | 'JOBQUEST_104_CLEAR'

export interface Job104ConnectorResponse {
  status: Exclude<Job104ConnectorState, 'checking'>
  payload?: Job104Payload
  message?: string
}
