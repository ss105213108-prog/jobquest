(() => {
  const ALLOWED_APP_ORIGINS = new Set(['http://localhost:5173', 'https://jobquest-snowy.vercel.app'])
  const APP_ORIGIN = window.location.origin
  const REQUEST_CHANNEL = 'JOBQUEST_104_BRIDGE_REQUEST'
  const RESPONSE_CHANNEL = 'JOBQUEST_104_BRIDGE_RESPONSE'
  const ALLOWED_COMMANDS = new Set(['JOBQUEST_104_STATUS', 'JOBQUEST_104_GET_LATEST', 'JOBQUEST_104_CLEAR'])

  if (!ALLOWED_APP_ORIGINS.has(APP_ORIGIN)) return

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== APP_ORIGIN) return
    const message = event.data
    if (!message || typeof message !== 'object' || message.channel !== REQUEST_CHANNEL) return
    if (!ALLOWED_COMMANDS.has(message.type) || typeof message.requestId !== 'string' || message.requestId.length < 8 || message.requestId.length > 100) return

    chrome.runtime.sendMessage({ type: message.type })
      .then((response) => {
        window.postMessage({ channel: RESPONSE_CHANNEL, requestId: message.requestId, response }, APP_ORIGIN)
      })
      .catch(() => {
        window.postMessage({ channel: RESPONSE_CHANNEL, requestId: message.requestId, response: { status: 'error', message: 'Connector bridge 無法回應。' } }, APP_ORIGIN)
      })
  })
})()
