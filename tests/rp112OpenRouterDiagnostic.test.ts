import { describe, expect, it, vi } from 'vitest'
import { buildTextControl, createDiagnosticHandler, safeErrorMetadata,
  KEY_ENDPOINT, CHAT_ENDPOINT, CONTROL_MODEL } from '../scripts/rp112-openrouter-diagnostic/handler.ts'

const request = () => new Request('https://example.test/diagnostic', {
  method: 'POST', headers: { authorization: 'Bearer synthetic-session' },
})
const success = () => Response.json({ model: CONTROL_MODEL,
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'OK' } }] })
function setup(responses: Response[]) {
  const upstream = vi.fn<typeof fetch>(async () => {
    const response = responses.shift()
    if (!response) throw new Error('unexpected request')
    return response
  })
  const authenticate = vi.fn(async () => 'synthetic-user')
  const getOpenRouterKey = vi.fn(() => 'synthetic-key')
  const handler = createDiagnosticHandler({ fetch: upstream, authenticate, getOpenRouterKey,
    now: () => 100 }, { userId: 'synthetic-user', expiresAt: 200 })
  return { upstream, authenticate, getOpenRouterKey, handler }
}

describe('RP-112 isolated common-layer diagnostic', () => {
  it('has only anonymous text, selected model and retained privacy/zero-fallback flags', () => {
    expect(buildTextControl()).toEqual({ model: CONTROL_MODEL, stream: false, max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      provider: { zdr: true, data_collection: 'deny', allow_fallbacks: false } })
  })
  it.each([401, 403])('stops after key HTTP %i without inference', async status => {
    const s = setup([Response.json({ error: { code: status, message: 'Forbidden' } }, { status })])
    expect(await (await s.handler(request())).json()).toMatchObject({ keyProbeHttp: status,
      secretAuthPath: 'FAILED', inferenceCalls: 0, minimalTextExecuted: false,
      classification: 'OPENROUTER_AUTH_PATH_FAILURE', keyError: { code: status, message: 'Forbidden' } })
    expect(s.upstream).toHaveBeenCalledTimes(1)
  })
  it.each([302, 429, 500])('stops UNKNOWN on key HTTP %i', async status => {
    const s = setup([new Response('untrusted body', { status })])
    expect(await (await s.handler(request())).json()).toMatchObject({ secretAuthPath: 'UNKNOWN',
      inferenceCalls: 0, classification: 'INSUFFICIENT_EVIDENCE' })
    expect(s.upstream).toHaveBeenCalledTimes(1)
  })
  it('classifies generic 403 after successful key auth and omits all account data', async () => {
    const s = setup([Response.json({ data: { label: 'PRIVATE_KEY', usage: 'PRIVATE_USAGE' } }),
      Response.json({ error: { code: 403, message: 'Forbidden' } }, { status: 403 })])
    const body = await (await s.handler(request())).json()
    expect(body).toMatchObject({ keyProbeResult: 'PASS', secretAuthPath: 'VERIFIED',
      inferenceCalls: 1, minimalTextHttp: 403, classification: 'GENERIC_OPENROUTER_INFERENCE_403' })
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE|synthetic-key|Reply with/)
    expect(s.upstream).toHaveBeenCalledTimes(2)
    expect(s.upstream.mock.calls[0]?.[0]).toBe(KEY_ENDPOINT)
    expect(s.upstream.mock.calls[1]?.[0]).toBe(CHAT_ENDPOINT)
    for (const [, init] of s.upstream.mock.calls) {
      expect(init?.redirect).toBe('error')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer synthetic-key' })
    }
  })
  it('verifies the generic path only for a complete exact OK result', async () => {
    const s = setup([Response.json({ data: {} }), success()])
    expect(await (await s.handler(request())).json()).toMatchObject({ minimalTextResult: 'PASS',
      inferenceCalls: 1, classification: 'BASE_OPENROUTER_PATH_VERIFIED' })
    expect((await s.handler(request())).status).toBe(410)
    expect(s.upstream).toHaveBeenCalledTimes(2)
  })
  it('does not infer success from a malformed HTTP 200 completion', async () => {
    const s = setup([Response.json({ data: {} }), Response.json({ choices: [] })])
    expect(await (await s.handler(request())).json()).toMatchObject({ minimalTextResult: 'FAIL',
      classification: 'INSUFFICIENT_EVIDENCE' })
  })
  it('does not retry a thrown control fetch', async () => {
    const s = setup([Response.json({ data: {} })])
    expect(await (await s.handler(request())).json()).toMatchObject({ inferenceCalls: 1,
      minimalTextResult: 'FAIL', classification: 'INSUFFICIENT_EVIDENCE' })
    expect(s.upstream).toHaveBeenCalledTimes(2)
  })
  it('does not retry a thrown key fetch', async () => {
    const s = setup([])
    expect(await (await s.handler(request())).json()).toMatchObject({ inferenceCalls: 0,
      secretAuthPath: 'UNKNOWN', classification: 'INSUFFICIENT_EVIDENCE' })
    expect(s.upstream).toHaveBeenCalledTimes(1)
  })
  it('rejects wrong authenticated users before reading the server secret', async () => {
    const s = setup([])
    s.authenticate.mockResolvedValue('other-user')
    expect((await s.handler(request())).status).toBe(401)
    expect(s.getOpenRouterKey).not.toHaveBeenCalled()
    expect(s.upstream).not.toHaveBeenCalled()
  })
  it('rejects expired instrumentation', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const handler = createDiagnosticHandler({ fetch: fetcher, authenticate: async () => 'user',
      getOpenRouterKey: () => 'key', now: () => 200 }, { userId: 'user', expiresAt: 200 })
    expect((await handler(request())).status).toBe(410)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('omits arbitrary error text, secret-shaped codes, nested routing/raw/account data', () => {
    expect(safeErrorMetadata({ error: { code: 'sk-or-private',
      message: 'Authorization Bearer secret user@example.test PDF prompt schema',
      metadata: { raw: 'PRIVATE' } }, data: { usage: 123 } })).toEqual({
      code: 'NOT_RETURNED_OR_OMITTED', message: 'NOT_RETURNED_OR_OMITTED', errorEnvelope: 'JSON_ERROR' })
  })
  it('bounds untrusted upstream bodies without output or subsequent inference', async () => {
    const s = setup([new Response('x'.repeat(8193), { status: 403 })])
    expect(await (await s.handler(request())).json()).toMatchObject({ inferenceCalls: 0,
      keyError: { errorEnvelope: 'NO_SAFE_JSON_ERROR' } })
  })
})
