import { PDFDocument } from 'pdf-lib'
import {
  buildNativeRequest, validateExtractionResponse, safeDiagnostics,
  SCHEMA_VERSION, SELECTED_V1_MODEL, SELECTED_PROVIDER, type ExtractionStatus,
} from '../_shared/aiResumeExtractionV1.ts'

export const MAX_PDF_BYTES = 10 * 1024 * 1024
export const MAX_MULTIPART_BYTES = MAX_PDF_BYTES + 64 * 1024
export const UPSTREAM_TIMEOUT_MS = 120_000
export const MAX_UPSTREAM_BYTES = 256 * 1024
export const CONSENT_VERSION = 'AI_PDF_CONSENT_V1'
export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
export const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173'] as const

export interface HandlerDependencies {
  authenticate: (token: string) => Promise<string | null>
  getOpenRouterKey: () => string | undefined
  fetch: typeof fetch
  log: (diagnostics: Record<string, unknown>) => void
  allowedOrigins?: readonly string[]
}

// Bound actual streamed bytes, including chunked requests without Content-Length.
class ByteLimitError extends Error {}
async function readBounded(stream: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array> {
  if (!stream) return new Uint8Array()
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > max) {
        try { await reader.cancel() } finally { throw new ByteLimitError() }
      }
      chunks.push(next.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

function pdfDataUrl(bytes: Uint8Array): string {
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)))
  }
  return `data:application/pdf;base64,${btoa(chunks.join(''))}`
}

export function createParseResumeAiHandler(deps: HandlerDependencies) {
  return async (req: Request): Promise<Response> => {
    const attemptId = crypto.randomUUID()
    const started = performance.now()
    const origin = req.headers.get('origin')
    const allowed = !origin || (deps.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS).includes(origin)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      ...(origin && allowed ? { 'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
        'Access-Control-Allow-Methods': 'POST, OPTIONS' } : {}),
    }
    let fileBytes: number | undefined
    let upstreamStatus: number | undefined
    const send = (payload: Record<string, unknown>, httpStatus: number, extra: Record<string, unknown> = {}) => {
      const diagnostic = safeDiagnostics({ attemptId, latencyMs: performance.now() - started,
        fileBytes, upstreamStatus, status: payload.status, code: payload.code, ...extra })
      try { deps.log(diagnostic) } catch { /* Telemetry cannot change the attempt outcome. */ }
      return new Response(JSON.stringify({ ...payload, attemptId }), { status: httpStatus, headers })
    }
    const fail = (status: Exclude<ExtractionStatus, 'AI_EXTRACTION_COMPLETED'>, code: string, httpStatus: number) => (
      send({ status, code, ...(upstreamStatus ? { upstreamStatus } : {}) }, httpStatus)
    )
    if (!allowed) return fail('AI_REQUEST_FAILED', 'ORIGIN_NOT_ALLOWED', 403)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return fail('AI_REQUEST_FAILED', 'METHOD_NOT_ALLOWED', 405)
    try {
      const bearer = /^Bearer ([^\s]+)$/i.exec(req.headers.get('authorization') ?? '')
      if (!bearer || !await deps.authenticate(bearer[1])) return fail('AI_REQUEST_FAILED', 'AUTH_REQUIRED', 401)
      const contentType = req.headers.get('content-type') ?? ''
      if (!/^multipart\/form-data\s*;/i.test(contentType)) return fail('INVALID_FILE', 'INVALID_MULTIPART', 400)
      const declaredSize = req.headers.get('content-length')
      if (declaredSize !== null && (!/^\d+$/.test(declaredSize)
        || Number(declaredSize) > MAX_MULTIPART_BYTES)) return fail('INVALID_FILE', 'BODY_TOO_LARGE', 413)
      let bodyBytes: Uint8Array
      try { bodyBytes = await readBounded(req.body, MAX_MULTIPART_BYTES) }
      catch { return fail('INVALID_FILE', 'BODY_TOO_LARGE', 413) }
      let form: FormData
      try {
        form = await new Response(bodyBytes as BodyInit, { headers: { 'Content-Type': contentType } }).formData()
      } catch { return fail('INVALID_FILE', 'INVALID_MULTIPART', 400) }
      if (form.getAll('consent').length !== 1 || form.get('consent') !== 'true'
        || form.getAll('consentVersion').length !== 1 || form.get('consentVersion') !== CONSENT_VERSION) {
        return fail('AI_REQUEST_FAILED', 'CONSENT_REQUIRED', 403)
      }
      if ([...form.keys()].some((key) => !['file', 'consent', 'consentVersion'].includes(key))) {
        return fail('AI_REQUEST_FAILED', 'INVALID_REQUEST_FIELDS', 400)
      }
      const file = form.get('file')
      if (!(file instanceof File) || form.getAll('file').length !== 1) return fail('INVALID_FILE', 'FILE_REQUIRED', 400)
      fileBytes = file.size
      if (file.type !== 'application/pdf') return fail('INVALID_FILE', 'PDF_MIME_REQUIRED', 400)
      if (file.size === 0) return fail('INVALID_FILE', 'EMPTY_FILE', 400)
      if (file.size > MAX_PDF_BYTES) return fail('INVALID_FILE', 'FILE_TOO_LARGE', 413)
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r\n|\r|\n)/.test(new TextDecoder().decode(bytes.subarray(0, 16)))) {
        return fail('INVALID_FILE', 'INVALID_PDF', 400)
      }
      let pageCount: number
      try {
        // Structural admission only: no text, layout, semantics, or deterministic parser calls.
        const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true })
        pageCount = pdf.getPageCount()
        if (!Number.isSafeInteger(pageCount) || pageCount <= 0) throw new Error('INVALID_PDF')
      } catch { return fail('INVALID_FILE', 'INVALID_PDF', 400) }
      const key = deps.getOpenRouterKey()
      if (!key?.trim()) return fail('AI_REQUEST_FAILED', 'SECRET_NOT_CONFIGURED', 503)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
      let response: unknown
      try {
        const upstream = await deps.fetch(OPENROUTER_ENDPOINT, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(buildNativeRequest(pdfDataUrl(bytes))),
        })
        upstreamStatus = upstream.status
        if (!upstream.ok) {
          await upstream.body?.cancel()
          return fail('AI_REQUEST_FAILED', 'PROVIDER_REQUEST_FAILED', 502)
        }
        let responseBytes: Uint8Array
        try { responseBytes = await readBounded(upstream.body, MAX_UPSTREAM_BYTES) }
        catch (error) {
          if (controller.signal.aborted) throw new Error('TIMEOUT')
          if (error instanceof ByteLimitError) return fail('AI_RESPONSE_INVALID', 'INVALID_COMPLETION', 502)
          throw error
        }
        try { response = JSON.parse(new TextDecoder().decode(responseBytes)) }
        catch { return fail('AI_RESPONSE_INVALID', 'INVALID_COMPLETION', 502) }
      } catch {
        return fail('AI_REQUEST_FAILED', controller.signal.aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK_ERROR', 502)
      } finally { clearTimeout(timeout) }
      const result = validateExtractionResponse(response, {
        format: 'pdf', fileValidity: 'VALID', attemptId, documentId: crypto.randomUUID(), pageCount,
      }, upstreamStatus)
      if (result.status !== 'AI_EXTRACTION_COMPLETED') return send(result, 502, { schemaValid: false })
      const usage = (response as { usage?: Record<string, unknown> }).usage
      const metadata = safeDiagnostics({ promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens,
        costUsd: usage?.cost })
      return send({ ...result, schemaVersion: SCHEMA_VERSION, reviewRequired: true,
        model: SELECTED_V1_MODEL, provider: SELECTED_PROVIDER, usage: metadata }, 200, {
        ...metadata, modelId: SELECTED_V1_MODEL, providerId: SELECTED_PROVIDER, schemaValid: true,
      })
    } catch { return fail('AI_REQUEST_FAILED', 'INTERNAL_ERROR', 500) }
  }
}
