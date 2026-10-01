import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
  createParseResumeAiHandler, MAX_PDF_BYTES, MAX_MULTIPART_BYTES, MAX_UPSTREAM_BYTES,
  UPSTREAM_TIMEOUT_MS, CONSENT_VERSION, OPENROUTER_ENDPOINT,
} from '../supabase/functions/parse-resume-ai/handler.ts'
import { SCHEMA_VERSION, SELECTED_V1_MODEL, requestContractIssues,
  type ExtractionEnvelope } from '../supabase/functions/_shared/aiResumeExtractionV1.ts'
import { createUserAuthenticator, EXPECTED_SUPABASE_URL } from '../supabase/functions/parse-resume-ai/auth.ts'
import { createPrivacySafeLogger } from '../supabase/functions/parse-resume-ai/privacyLogging.ts'

let pdf: Uint8Array
beforeAll(async () => {
  const document = await PDFDocument.create()
  document.addPage([300, 300])
  document.addPage([300, 300])
  pdf = await document.save()
})
afterEach(() => vi.useRealTimers())
const envelope = (): ExtractionEnvelope => ({ schemaVersion: SCHEMA_VERSION,
  candidate: { name: 'Synthetic Applicant', skills: [], workExperiences: [], projects: [],
    careerDirections: [], education: { school: null, department: null, graduationStatus: null } },
  evidence: [{ field: '/name', pageNumber: 2, excerpt: 'Synthetic Applicant' }],
})
const completion = () => ({ id: 'gen-synthetic', object: 'chat.completion', model: String(SELECTED_V1_MODEL),
  provider: 'Google', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(envelope()) } }],
  usage: { prompt_tokens: 12, completion_tokens: 13, cost: 0.001, privateData: 'PRIVATE' },
})
const makeRequest = (change?: (form: FormData) => void, auth = 'Bearer session-jwt') => {
  const form = new FormData()
  form.set('file', new File([pdf as BlobPart], 'private-name@example.pdf', { type: 'application/pdf' }))
  form.set('consent', 'true')
  form.set('consentVersion', CONSENT_VERSION)
  change?.(form)
  return new Request('https://example.test/parse-resume-ai', {
    method: 'POST', headers: { authorization: auth, origin: 'http://localhost:5173' }, body: form,
  })
}
function setup(response: Response = Response.json(completion())) {
  const authenticate = vi.fn(async (_token: string): Promise<string | null> => 'anonymous-auth-user')
  const upstream = vi.fn<typeof fetch>(async () => response)
  const log = vi.fn()
  const getOpenRouterKey = vi.fn(() => 'synthetic-test-key')
  const handler = createParseResumeAiHandler({ authenticate, fetch: upstream, log, getOpenRouterKey })
  return { handler, authenticate, upstream, log, getOpenRouterKey }
}
async function rejection(request: Request, code: string, status = 'AI_REQUEST_FAILED') {
  const s = setup()
  const response = await s.handler(request)
  const body = await response.json()
  expect(body).toMatchObject({ status, code })
  expect(body).not.toHaveProperty('candidate')
  expect(s.upstream).not.toHaveBeenCalled()
  expect(s.getOpenRouterKey).not.toHaveBeenCalled()
  return { ...s, response, body }
}

describe('RP-112 production Edge Function', () => {
  it('blocks dependency console output without touching the real test console', () => {
    const sink = vi.fn()
    const target = { log: sink, info: sink, warn: sink, error: sink, debug: sink,
      trace: sink, dir: sink, dirxml: sink, table: sink, assert: sink }
    createPrivacySafeLogger(target)
    for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'dirxml', 'table', 'assert'] as const) {
      target[method]('PRIVATE filename PDF bytes key or dependency exception')
    }
    expect(sink).not.toHaveBeenCalled()
  })
  it('projects even logger-direct inputs through the production allowlist', () => {
    const sink = vi.fn()
    const target = { log: sink, info: sink, warn: sink, error: sink, debug: sink,
      trace: sink, dir: sink, dirxml: sink, table: sink, assert: sink }
    const log = createPrivacySafeLogger(target)
    log({ status: 'AI_REQUEST_FAILED', code: 'UPSTREAM_TIMEOUT', fileBytes: 42,
      upstreamStatus: 504, pdf: 'PRIVATE', candidate: 'PRIVATE', OPENROUTER_API_KEY: 'PRIVATE' })
    expect(sink).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ status: 'AI_REQUEST_FAILED',
      code: 'UPSTREAM_TIMEOUT', fileBytes: 42, upstreamStatus: 504 }))
  })
  it('authenticates anonymous-auth sessions using Supabase getUser, not an API-key privilege', async () => {
    const authFetch = vi.fn<typeof fetch>(async () => Response.json({ id: 'synthetic-user',
      role: 'authenticated', is_anonymous: true, aud: 'authenticated', app_metadata: {}, user_metadata: {} }))
    expect(await createUserAuthenticator(EXPECTED_SUPABASE_URL, 'synthetic-public-key', authFetch)('user-jwt')).toBe('synthetic-user')
    expect(authFetch).toHaveBeenCalledTimes(1)
    const [url, init] = authFetch.mock.calls[0]
    expect(String(url)).toBe(`${EXPECTED_SUPABASE_URL}/auth/v1/user`)
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer user-jwt')
    expect(new Headers(init?.headers).get('apikey')).toBe('synthetic-public-key')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })
  it.each(['anon', 'service_role', '', 'admin'])('rejects non-user auth role %s', async (role) => {
    const authFetch = vi.fn<typeof fetch>(async () => Response.json({ id: 'synthetic', role }))
    expect(await createUserAuthenticator(EXPECTED_SUPABASE_URL, 'synthetic-public-key', authFetch)('jwt')).toBeNull()
  })
  it.each(['wrongProject', 'missingUrl', 'missingKey', 'invalidJwt', 'network'])('auth fails closed for %s', async (kind) => {
    const authFetch = vi.fn<typeof fetch>(async () => kind === 'invalidJwt'
      ? Response.json({ message: 'PRIVATE invalid token' }, { status: 401 }) : Response.json({ id: 'user', role: 'authenticated' }))
    if (kind === 'network') authFetch.mockRejectedValue(new Error('PRIVATE JWT'))
    const url = kind === 'wrongProject' ? 'https://other.supabase.co' : kind === 'missingUrl' ? undefined : EXPECTED_SUPABASE_URL
    const key = kind === 'missingKey' ? undefined : 'synthetic-public-key'
    expect(await createUserAuthenticator(url, key, authFetch)('jwt')).toBeNull()
    if (['wrongProject', 'missingUrl', 'missingKey'].includes(kind)) expect(authFetch).not.toHaveBeenCalled()
  })
  it.each(['', 'Basic secret', 'Bearer', 'Bearer token extra', 'Bearer token\tother'])('rejects malformed auth %s', async (auth) => {
    const s = await rejection(makeRequest(undefined, auth), 'AUTH_REQUIRED')
    expect(s.response.status).toBe(401)
    expect(s.authenticate).not.toHaveBeenCalled()
  })
  it('rejects invalid user JWT before file processing or secret access', async () => {
    const s = setup()
    s.authenticate.mockResolvedValue(null)
    const response = await s.handler(makeRequest())
    expect(response.status).toBe(401)
    expect(s.upstream).not.toHaveBeenCalled()
    expect(s.getOpenRouterKey).not.toHaveBeenCalled()
  })
  it('does not echo auth exceptions', async () => {
    const s = setup()
    s.authenticate.mockRejectedValue(new Error('PRIVATE JWT'))
    expect(await (await s.handler(makeRequest())).text()).not.toContain('PRIVATE')
    expect(s.upstream).not.toHaveBeenCalled()
  })
  it.each(['missing', 'false', 'True', '1', 'duplicate', 'wrongVersion', 'missingVersion', 'duplicateVersion'])('rejects consent %s', async (kind) => {
    await rejection(makeRequest((f) => {
      if (kind === 'missing') f.delete('consent')
      else if (kind === 'duplicate') f.append('consent', 'true')
      else if (kind === 'wrongVersion') f.set('consentVersion', 'V2')
      else if (kind === 'missingVersion') f.delete('consentVersion')
      else if (kind === 'duplicateVersion') f.append('consentVersion', CONSENT_VERSION)
      else f.set('consent', kind)
    }), 'CONSENT_REQUIRED')
  })
  it.each(['url', 'model', 'prompt', 'schema', 'apiKey', 'provider'])('rejects client override %s', async (key) => {
    await rejection(makeRequest((f) => f.set(key, 'not-approved')), 'INVALID_REQUEST_FIELDS')
  })
  it.each(['missing', 'text', 'duplicate'])('rejects file field %s', async (kind) => {
    await rejection(makeRequest((f) => {
      if (kind === 'missing') f.delete('file')
      if (kind === 'text') f.set('file', 'https://private.example/resume.pdf')
      if (kind === 'duplicate') f.append('file', new Blob([pdf as BlobPart], { type: 'application/pdf' }))
    }), 'FILE_REQUIRED', 'INVALID_FILE')
  })
  it('rejects wrong MIME despite PDF filename/header', async () => {
    await rejection(makeRequest((f) => f.set('file', new File([pdf as BlobPart], 'resume.pdf', { type: 'text/plain' }))),
      'PDF_MIME_REQUIRED', 'INVALID_FILE')
  })
  it('rejects an empty PDF', async () => {
    await rejection(makeRequest((f) => f.set('file', new Blob([], { type: 'application/pdf' }))), 'EMPTY_FILE', 'INVALID_FILE')
  })
  it.each(['not-pdf', '%PDF-1.7\nnot a document'])('rejects invalid PDF %s', async (bytes) => {
    await rejection(makeRequest((f) => f.set('file', new Blob([bytes], { type: 'application/pdf' }))), 'INVALID_PDF', 'INVALID_FILE')
  })
  it('rejects page-less PDFs', async () => {
    const document = await PDFDocument.create()
    const bytes = await document.save({ addDefaultPage: false })
    await rejection(makeRequest((f) => f.set('file', new Blob([bytes as BlobPart], { type: 'application/pdf' }))), 'INVALID_PDF', 'INVALID_FILE')
  })
  it('rejects oversized PDF before document load', async () => {
    await rejection(makeRequest((f) => f.set('file', new Blob([new Uint8Array(MAX_PDF_BYTES + 1)], { type: 'application/pdf' }))),
      'FILE_TOO_LARGE', 'INVALID_FILE')
  })
  it('bounds declared multipart size', async () => {
    const request = makeRequest()
    request.headers.set('content-length', String(MAX_MULTIPART_BYTES + 1))
    await rejection(request, 'BODY_TOO_LARGE', 'INVALID_FILE')
  })
  it('bounds actual multipart bytes without trusting Content-Length', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(MAX_MULTIPART_BYTES + 1))
      controller.close()
    } })
    await rejection(new Request('https://example.test', { method: 'POST', headers: {
      authorization: 'Bearer session', 'content-type': 'multipart/form-data; boundary=synthetic' },
      body: stream, duplex: 'half' } as RequestInit), 'BODY_TOO_LARGE', 'INVALID_FILE')
  })
  it.each(['application/json', 'multipart/form-data; boundary=broken'])('rejects invalid multipart %s', async (contentType) => {
    await rejection(new Request('https://example.test', { method: 'POST', headers: {
      authorization: 'Bearer session', 'content-type': contentType }, body: '{}' }), 'INVALID_MULTIPART', 'INVALID_FILE')
  })
  it('rejects unapproved origin without wildcard headers', async () => {
    const request = makeRequest()
    request.headers.set('origin', 'https://evil.example')
    const s = await rejection(request, 'ORIGIN_NOT_ALLOWED')
    expect(s.response.headers.has('Access-Control-Allow-Origin')).toBe(false)
  })
  it('permits only the expected preflight without invoking auth or upstream', async () => {
    const s = setup()
    const response = await s.handler(new Request('https://example.test', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } }))
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
    expect(s.authenticate).not.toHaveBeenCalled()
    expect(s.upstream).not.toHaveBeenCalled()
  })
  it('rejects GET', async () => {
    await rejection(new Request('https://example.test'), 'METHOD_NOT_ALLOWED')
  })
  it('fails closed when server secret is absent', async () => {
    const s = setup()
    s.getOpenRouterKey.mockReturnValue('')
    expect(await (await s.handler(makeRequest())).json()).toMatchObject({ status: 'AI_REQUEST_FAILED', code: 'SECRET_NOT_CONFIGURED' })
    expect(s.upstream).not.toHaveBeenCalled()
  })
  it('sends exactly the original PDF in one strict native Vertex request; accepts sparse/blank pages', async () => {
    const s = setup()
    const response = await s.handler(makeRequest())
    expect(response.status).toBe(200)
    expect(s.authenticate).toHaveBeenCalledWith('session-jwt')
    expect(s.upstream).toHaveBeenCalledTimes(1)
    const [url, init] = s.upstream.mock.calls[0]
    expect(url).toBe(OPENROUTER_ENDPOINT)
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: {
      Authorization: 'Bearer synthetic-test-key', 'Content-Type': 'application/json' } })
    const request = JSON.parse(init!.body as string)
    expect(request.model).toBe('google/gemini-3-flash-preview')
    expect(request.provider).toEqual({ only: ['google-vertex'], order: ['google-vertex'],
      allow_fallbacks: false, require_parameters: true, zdr: true, data_collection: 'deny' })
    expect(request).toHaveProperty('max_tokens', 8192)
    expect(request).not.toHaveProperty('max_completion_tokens')
    expect(requestContractIssues(request)).toEqual([])
    const part = request.messages[1].content[1].file
    expect(part.filename).toBe('resume.pdf')
    expect(Uint8Array.from(atob(part.file_data.split(',')[1]), (char) => char.charCodeAt(0))).toEqual(pdf)
    expect(init!.signal).toBeInstanceOf(AbortSignal)
  })
  it('returns only an unaccepted candidate with safe metadata', async () => {
    const s = setup()
    const response = await s.handler(makeRequest())
    const body = await response.json()
    expect(body).toMatchObject({ status: 'AI_EXTRACTION_COMPLETED', schemaVersion: SCHEMA_VERSION,
      model: SELECTED_V1_MODEL, provider: 'Google', reviewRequired: true, candidate: {
        state: 'REVIEW_REQUIRED', evidenceVerification: 'UNVERIFIED', fields: { name: 'Synthetic Applicant' },
      }, usage: { promptTokens: 12, completionTokens: 13, costUsd: 0.001 } })
    expect(body.attemptId).toBe(body.candidate.attemptId)
    expect(body.candidate.evidence).toEqual(envelope().evidence)
    expect(body).not.toHaveProperty('accepted')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(JSON.stringify(s.log.mock.calls)).not.toMatch(/Synthetic Applicant|excerpt|private-name|synthetic-test-key|PRIVATE|JVBER/)
    expect(JSON.stringify(body)).not.toContain('PRIVATE')
  })
  it('does not let telemetry failure change valid success', async () => {
    const s = setup()
    s.log.mockImplementation(() => { throw new Error('logger broken') })
    expect((await s.handler(makeRequest())).status).toBe(200)
  })
  it.each([400, 401, 404, 429, 500, 503])('maps upstream %s without body echo or retry', async (status) => {
    const s = setup(new Response('PRIVATE upstream secret and resume', { status }))
    const response = await s.handler(makeRequest())
    expect(await response.json()).toMatchObject({ status: 'AI_REQUEST_FAILED', code: 'PROVIDER_REQUEST_FAILED', upstreamStatus: status })
    expect(s.upstream).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(s.log.mock.calls)).not.toContain('PRIVATE')
  })
  it('maps network failure without retry or raw error', async () => {
    const s = setup()
    s.upstream.mockRejectedValue(new Error('PRIVATE URL key'))
    expect(await (await s.handler(makeRequest())).json()).toMatchObject({ status: 'AI_REQUEST_FAILED', code: 'UPSTREAM_NETWORK_ERROR' })
    expect(s.upstream).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(s.log.mock.calls)).not.toContain('PRIVATE')
  })
  it('aborts at the explicit upstream timeout without retry', async () => {
    vi.useFakeTimers()
    const s = setup()
    let signal: AbortSignal | undefined
    s.upstream.mockImplementation(async (_url, init) => {
      signal = init!.signal as AbortSignal
      return await new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('PRIVATE')), { once: true }))
    })
    const pending = s.handler(makeRequest())
    await vi.waitUntil(() => s.upstream.mock.calls.length === 1)
    await vi.advanceTimersByTimeAsync(UPSTREAM_TIMEOUT_MS)
    expect(await (await pending).json()).toMatchObject({ status: 'AI_REQUEST_FAILED', code: 'UPSTREAM_TIMEOUT' })
    expect(signal?.aborted).toBe(true)
    expect(s.upstream).toHaveBeenCalledTimes(1)
    expect(UPSTREAM_TIMEOUT_MS).toBeLessThan(150_000)
  })
  it.each(['not JSON', '{}', 'null'])('rejects malformed envelope %s', async (body) => {
    const s = setup(new Response(body))
    expect(await (await s.handler(makeRequest())).json()).toMatchObject({ status: 'AI_RESPONSE_INVALID' })
    expect(s.upstream).toHaveBeenCalledTimes(1)
  })
  it.each(['json', 'schema', 'evidence', 'missingEvidence', 'page', 'provider', 'model', 'refusal', 'truncated', 'annotations'])('rejects output %s without healing', async (kind) => {
    const body = completion()
    const wire = envelope()
    if (kind === 'schema') (wire as unknown as Record<string, unknown>).extra = 'forbidden'
    if (kind === 'evidence') wire.evidence[0].field = '/skills/0'
    if (kind === 'missingEvidence') wire.evidence = []
    if (kind === 'page') wire.evidence[0].pageNumber = 3
    body.choices[0].message.content = kind === 'json' ? '```json\n{}\n```' : JSON.stringify(wire)
    if (kind === 'provider') body.provider = 'OpenAI'
    if (kind === 'model') body.model = 'google/gemini'
    if (kind === 'truncated') body.choices[0].finish_reason = 'length'
    if (kind === 'refusal') Object.assign(body.choices[0].message, { refusal: 'Refused' })
    if (kind === 'annotations') Object.assign(body.choices[0].message, { annotations: [{ type: 'file', private: 'PRIVATE' }] })
    const s = setup(Response.json(body))
    const response = await s.handler(makeRequest())
    expect((await response.json()).status).toBe(['schema', 'evidence', 'missingEvidence', 'page'].includes(kind)
      ? 'AI_SCHEMA_INVALID' : 'AI_RESPONSE_INVALID')
    expect(s.upstream).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(s.log.mock.calls)).not.toContain('PRIVATE')
  })
  it('bounds upstream payload size', async () => {
    const s = setup(new Response('x'.repeat(MAX_UPSTREAM_BYTES + 1)))
    expect(await (await s.handler(makeRequest())).json()).toMatchObject({ status: 'AI_RESPONSE_INVALID' })
    expect(s.upstream).toHaveBeenCalledTimes(1)
  })
  it('keeps a broken response transport distinct from malformed completion content', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('PRIVATE transport')) } })
    const s = setup(new Response(stream))
    expect(await (await s.handler(makeRequest())).json()).toMatchObject({ status: 'AI_REQUEST_FAILED', code: 'UPSTREAM_NETWORK_ERROR' })
    expect(s.upstream).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(s.log.mock.calls)).not.toContain('PRIVATE')
  })
  it('drops malformed and private usage metadata', async () => {
    const body = completion()
    Object.assign(body.usage, { prompt_tokens: 'PRIVATE', completion_tokens: -1, cost: Infinity })
    const s = setup(Response.json(body))
    expect((await (await s.handler(makeRequest())).json()).usage).toEqual({})
    expect(JSON.stringify(s.log.mock.calls)).not.toContain('PRIVATE')
  })
})
