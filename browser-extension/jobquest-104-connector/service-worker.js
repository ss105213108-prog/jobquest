const STORAGE_KEY = 'jobQuest104.latestPayload'
const PAYLOAD_VERSION = 1
const TTL_MS = 30 * 60 * 1000
const ALLOWED_APP_ORIGINS = new Set(['http://localhost:5173', 'https://jobquest-snowy.vercel.app'])
const ALLOWED_BRIDGE_COMMANDS = new Set(['JOBQUEST_104_STATUS', 'JOBQUEST_104_GET_LATEST', 'JOBQUEST_104_CLEAR'])

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0

function isCanonicalJob(job) {
  if (!isRecord(job)) return false
  if (![job.externalId, job.sourceKey, job.title, job.company, job.location, job.salaryText, job.canonicalUrl].every(isNonEmptyString)) return false
  const id = job.externalId.toLowerCase()
  return /^[a-z0-9]+$/.test(id) && job.sourceKey === `104:${id}` && job.canonicalUrl === `https://www.104.com.tw/job/${id}` &&
    (job.experienceText === undefined || typeof job.experienceText === 'string') &&
    (job.snippetText === undefined || typeof job.snippetText === 'string')
}

function isPayload(value) {
  if (!isRecord(value) || value.version !== PAYLOAD_VERSION || value.source !== '104') return false
  if (!isNonEmptyString(value.capturedAt) || !Number.isFinite(Date.parse(value.capturedAt))) return false
  if (!isNonEmptyString(value.sourceUrl) || !Array.isArray(value.jobs) || value.jobs.length < 1) return false
  try {
    const url = new URL(value.sourceUrl)
    if (url.protocol !== 'https:' || url.hostname !== 'www.104.com.tw' || url.pathname !== '/jobs/search/') return false
  } catch {
    return false
  }
  return value.jobs.every(isCanonicalJob) && new Set(value.jobs.map((job) => job.sourceKey)).size === value.jobs.length
}

async function payloadResponse() {
  const stored = await chrome.storage.session.get(STORAGE_KEY)
  const payload = stored[STORAGE_KEY]
  if (payload === undefined) return { status: 'no-capture' }
  if (!isPayload(payload)) return { status: 'malformed' }
  if (Date.now() - Date.parse(payload.capturedAt) > TTL_MS) return { status: 'expired', payload }
  return { status: 'ready', payload }
}

function isAppBridgeSender(sender) {
  if (!sender?.url) return false
  try {
    return ALLOWED_APP_ORIGINS.has(new URL(sender.url).origin)
  } catch {
    return false
  }
}

function isExtensionPopupSender(sender) {
  return sender?.url === chrome.runtime.getURL('popup.html')
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isRecord(message) || typeof message.type !== 'string') return false

  if (message.type === 'JOBQUEST_104_STORE_CAPTURE') {
    if (!isExtensionPopupSender(sender)) return false
    const payloadPassed = isPayload(message.payload)
    if (!payloadPassed) {
      sendResponse({ status: 'malformed', message: '擷取資料格式不正確。' })
      return false
    }
    chrome.storage.session.set({ [STORAGE_KEY]: message.payload })
      .then(() => sendResponse({ status: 'ready', payload: message.payload }))
      .catch(() => sendResponse({ status: 'error', message: '暫時無法保存擷取結果。' }))
    return true
  }

  if (!ALLOWED_BRIDGE_COMMANDS.has(message.type) || !isAppBridgeSender(sender)) return false

  if (message.type === 'JOBQUEST_104_CLEAR') {
    chrome.storage.session.remove(STORAGE_KEY)
      .then(() => sendResponse({ status: 'no-capture' }))
      .catch(() => sendResponse({ status: 'error', message: '暫時無法清除擷取結果。' }))
    return true
  }

  payloadResponse()
    .then((response) => sendResponse(response))
    .catch(() => sendResponse({ status: 'error', message: '暫時無法讀取擷取結果。' }))
  return true
})
