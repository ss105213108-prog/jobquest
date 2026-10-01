import { parse104Payload } from './schema'
import type { Job104ConnectorCommand, Job104ConnectorResponse } from './types'

const REQUEST_CHANNEL = 'JOBQUEST_104_BRIDGE_REQUEST'
const RESPONSE_CHANNEL = 'JOBQUEST_104_BRIDGE_RESPONSE'
const REQUEST_TIMEOUT_MS = 1500

interface BridgeRequest {
  channel: typeof REQUEST_CHANNEL
  type: Job104ConnectorCommand
  requestId: string
}

interface BridgeResponseEnvelope {
  channel: typeof RESPONSE_CHANNEL
  requestId: string
  response: Job104ConnectorResponse
}

export type Job104BridgeTransport = (command: Job104ConnectorCommand) => Promise<Job104ConnectorResponse | null>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function isResponseEnvelope(value: unknown, requestId: string): value is BridgeResponseEnvelope {
  return isRecord(value) && value.channel === RESPONSE_CHANNEL && value.requestId === requestId && isRecord(value.response)
}

export const browser104BridgeTransport: Job104BridgeTransport = (command) => new Promise((resolve) => {
  const requestId = crypto.randomUUID()
  const request: BridgeRequest = { channel: REQUEST_CHANNEL, type: command, requestId }
  let settled = false

  const finish = (response: Job104ConnectorResponse | null) => {
    if (settled) return
    settled = true
    window.removeEventListener('message', onMessage)
    window.clearTimeout(timeoutId)
    resolve(response)
  }

  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== window || event.origin !== window.location.origin || !isResponseEnvelope(event.data, requestId)) return
    finish(event.data.response)
  }

  const timeoutId = window.setTimeout(() => finish(null), REQUEST_TIMEOUT_MS)
  window.addEventListener('message', onMessage)
  window.postMessage(request, window.location.origin)
})

export function create104ConnectorClient(transport: Job104BridgeTransport = browser104BridgeTransport) {
  const request = async (command: Job104ConnectorCommand): Promise<Job104ConnectorResponse> => {
    const response = await transport(command)
    if (!response) return { status: 'missing-extension', message: '尚未偵測到 Job Quest 104 Connector。' }
    if (!['ready', 'no-capture', 'expired', 'malformed', 'error'].includes(response.status)) return { status: 'malformed', message: 'Connector 回應格式不正確。' }
    if (response.payload && !parse104Payload(response.payload)) return { status: 'malformed', message: '104 職缺資料格式不正確，請重新擷取。' }
    return response
  }

  return {
    status: () => request('JOBQUEST_104_STATUS'),
    getLatest: () => request('JOBQUEST_104_GET_LATEST'),
    clear: () => request('JOBQUEST_104_CLEAR'),
  }
}

export const job104Connector = create104ConnectorClient()
