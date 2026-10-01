// TEMPORARY operator harness; JWT stays in this process and is never printed.
import { createInterface } from 'node:readline'

const base = 'https://neqwkiruqfevlchiajor.supabase.co'
const publicKey = process.argv[2]
const lines = createInterface({ input: process.stdin })
try {
  const auth = await fetch(`${base}/auth/v1/signup`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { apikey: publicKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: {} }),
  })
  const session = await auth.json()
  if (auth.status !== 200 || !session.access_token || session.user?.is_anonymous !== true) {
    console.log(JSON.stringify({ stage: 'AUTH_FAILED', http: auth.status }))
    process.exitCode = 1
  } else {
    console.log(JSON.stringify({ stage: 'READY', authHttp: auth.status, userId: session.user.id }))
    for await (const line of lines) {
      if (line !== 'RUN_ONCE') break
      const startedUtc = new Date().toISOString()
      const response = await fetch(`${base}/functions/v1/rp112-openrouter-diagnostic`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(95_000),
        headers: { apikey: publicKey, Authorization: `Bearer ${session.access_token}` },
      })
      const body = await response.json()
      // Only the isolated helper's finite safe result contract may leave memory.
      const safe = {}
      for (const field of ['keyProbeHttp', 'keyProbeResult', 'secretAuthPath', 'keyError',
        'minimalTextExecuted', 'inferenceCalls', 'minimalTextHttp', 'minimalTextResult',
        'textError', 'classification', 'automaticRetries', 'providerFallback']) {
        if (Object.hasOwn(body, field)) safe[field] = body[field]
      }
      console.log(JSON.stringify({ stage: 'RETURNED', functionHttp: response.status,
        startedUtc, endedUtc: new Date().toISOString(), result: safe }))
      break
    }
    await fetch(`${base}/auth/v1/logout`, { method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(8_000),
      headers: { apikey: publicKey, Authorization: `Bearer ${session.access_token}` },
    }).then(response => response.body?.cancel()).catch(() => {})
  }
} catch {
  console.log(JSON.stringify({ stage: 'NETWORK_OR_RESPONSE_FAILED_NO_RETRY' }))
  process.exitCode = 1
} finally { lines.close() }
