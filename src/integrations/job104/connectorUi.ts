import type { Job104ConnectorResponse, Job104ConnectorState } from './types'

export function connectorStateFromResponse(response: Job104ConnectorResponse): Job104ConnectorState {
  return response.status
}

export function get104ConnectorMessage(state: Job104ConnectorState, count = 0): string {
  if (state === 'checking') return '正在檢查 Job Quest 104 Connector……'
  if (state === 'missing-extension') return '尚未偵測到 Job Quest 104 Connector。'
  if (state === 'no-capture') return '尚未擷取 104 職缺。請先開啟 104 搜尋結果並使用 Connector。'
  if (state === 'expired') return '104 職缺資料已過期，請重新擷取。'
  if (state === 'malformed') return '104 職缺資料格式不正確，請重新擷取。'
  if (state === 'ready') return `已擷取 ${count} 筆 104 公開職缺，可匯入並配對。`
  return 'Connector 暫時無法使用，請稍後再試。'
}
