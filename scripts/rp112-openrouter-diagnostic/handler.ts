// TEMPORARY RP-112 diagnostic only. Never imported by the resume extraction path.
export const KEY_ENDPOINT = 'https://openrouter.ai/api/v1/key'
export const CHAT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
export const CONTROL_MODEL = 'google/gemini-3-flash-preview'
const MAX_BODY_BYTES = 8192
const SAFE_MESSAGES = new Set([
  'Forbidden', 'Forbidden.', 'Unauthorized', 'Unauthorized.', 'Permission denied',
  'Permission denied.', 'Invalid API key', 'Invalid API key.', 'User not found.',
  'Missing Authentication header', 'Internal Server Error', 'Insufficient credits',
  'Insufficient credits.', 'API key is disabled', 'API key is disabled.',
  'Key limit exceeded (total limit).', 'No endpoints found that match your data policy.',
  'No endpoints found that support the requested parameters.', 'Rate limit exceeded',
])
const SAFE_CODES = new Set(['unauthorized', 'forbidden', 'invalid_api_key',
  'insufficient_credits', 'rate_limit_exceeded', 'permission_denied'])

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) return null
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) return null
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch { return null }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export function safeErrorMetadata(body: unknown) {
  const error = record(record(body)?.error)
  const code = error?.code
  const message = error?.message
  return {
    code: typeof code === 'number' && Number.isSafeInteger(code) && code >= 100 && code <= 599
      ? code : typeof code === 'string' && SAFE_CODES.has(code) ? code : 'NOT_RETURNED_OR_OMITTED',
    message: typeof message === 'string' && SAFE_MESSAGES.has(message)
      ? message : 'NOT_RETURNED_OR_OMITTED',
    errorEnvelope: error ? 'JSON_ERROR' : 'NO_SAFE_JSON_ERROR',
  }
}

export function buildTextControl() {
  return {
    model: CONTROL_MODEL, stream: false, max_tokens: 16,
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    provider: { zdr: true, data_collection: 'deny', allow_fallbacks: false },
  }
}

type Dependencies = {
  authenticate: (token: string) => Promise<string | null>
  getOpenRouterKey: () => string | undefined
  fetch: typeof fetch
  now?: () => number
}
type Configuration = { userId: string; expiresAt: number }

export function createDiagnosticHandler(deps: Dependencies, config: Configuration) {
  let consumed = false
  const now = deps.now ?? Date.now
  const reply = (body: unknown, status = 200) => Response.json(body, {
    status, headers: { 'Cache-Control': 'no-store' },
  })
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return reply({ code: 'METHOD_NOT_ALLOWED' }, 405)
    if (now() >= config.expiresAt || !config.userId) return reply({ code: 'DIAGNOSTIC_EXPIRED' }, 410)
    const token = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
    if (!token) return reply({ code: 'UNAUTHORIZED' }, 401)
    let userId: string | null = null
    try { userId = await deps.authenticate(token) } catch { /* No exception text. */ }
    if (userId !== config.userId) return reply({ code: 'UNAUTHORIZED' }, 401)
    if (consumed || now() >= config.expiresAt) return reply({ code: 'DIAGNOSTIC_CONSUMED' }, 410)
    consumed = true
    const result = {
      keyProbeHttp: null as number | null, keyProbeResult: 'FAIL',
      secretAuthPath: 'UNKNOWN', keyError: safeErrorMetadata(null),
      minimalTextExecuted: false, inferenceCalls: 0, minimalTextHttp: null as number | null,
      minimalTextResult: 'NOT_RUN', textError: safeErrorMetadata(null),
      classification: 'INSUFFICIENT_EVIDENCE', automaticRetries: 0, providerFallback: 0,
    }
    const key = deps.getOpenRouterKey()
    if (!key) return reply(result)
    const headers = { Authorization: `Bearer ${key}` }
    try {
      const auth = await deps.fetch(KEY_ENDPOINT, {
        method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(15_000),
      })
      result.keyProbeHttp = auth.status
      if (auth.status !== 200) {
        result.keyError = safeErrorMetadata(await boundedJson(auth))
        if (auth.status === 401 || auth.status === 403) {
          result.secretAuthPath = 'FAILED'
          result.classification = 'OPENROUTER_AUTH_PATH_FAILURE'
        }
        return reply(result)
      }
      // Do not parse, retain or return account/key/usage data from a successful probe.
      await auth.body?.cancel().catch(() => {})
      result.keyProbeResult = 'PASS'
      result.secretAuthPath = 'VERIFIED'
    } catch { return reply(result) }
    result.minimalTextExecuted = true
    result.inferenceCalls = 1
    result.minimalTextResult = 'FAIL'
    try {
      const text = await deps.fetch(CHAT_ENDPOINT, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildTextControl()), redirect: 'error',
        signal: AbortSignal.timeout(60_000),
      })
      result.minimalTextHttp = text.status
      const body = await boundedJson(text)
      const root = record(body)
      if (!text.ok || root?.error) {
        result.textError = safeErrorMetadata(body)
        if (text.status === 403) result.classification = 'GENERIC_OPENROUTER_INFERENCE_403'
        return reply(result)
      }
      const choices = root?.choices
      const choice = Array.isArray(choices) && choices.length === 1 ? record(choices[0]) : null
      const message = record(choice?.message)
      if (root?.model === CONTROL_MODEL && choice?.finish_reason === 'stop'
        && message?.role === 'assistant' && message.content === 'OK' && !message.tool_calls) {
        result.minimalTextResult = 'PASS'
        result.classification = 'BASE_OPENROUTER_PATH_VERIFIED'
      }
    } catch { /* Request timeout/network errors are UNKNOWN, never retried. */ }
    return reply(result)
  }
}
