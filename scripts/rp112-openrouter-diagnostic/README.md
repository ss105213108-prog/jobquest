# Temporary RP-112 Common-Layer Diagnostic

Diagnostic-only code; not imported by any resume parsing path. Remote diagnostic
was deployed as v1 for one invocation and then replaced by a disabled v2 handler.

`handler.ts` accepts an exact authenticated operator user ID and short absolute
expiry supplied only for a future authorized deployment. It calls the key endpoint
once and cancels a successful key response without parsing account/usage data.
Only HTTP 200 permits one anonymous text control on the existing Gemini model.
The control has no file, PDF, schema, tools, provider pin or fallback list. ZDR,
data collection denial and disabled fallback remain enabled.

Response bodies are bounded at 8192 bytes. Error projection allows only bounded
HTTP-like numeric codes, fixed generic code/message literals, and a body-format
marker. Arbitrary text, account data, routing metadata and exception text are
omitted rather than echoed. No raw prompt, key or response-content logging.

The consumed flag is worker-local, not durable or a global exactly-once guarantee.
The intended operator sends only one invocation; a deployment must be limited to
that user/short expiry and immediately replaced with a disabled handler afterward.
Do not deploy this as a general-purpose API or attach it to parse-resume-ai.

`invoke.mjs` holds the anonymous session JWT only in process memory. It initially
authenticates and waits on stdin; RUN_ONCE dispatches the sole helper invocation.
It never retries. No OPENROUTER_API_KEY is read by the local harness.

Final runtime status (2026-09-28): direct probe/control and temporary deployment/
disable authorization received. Key probe HTTP 200; one minimal text request
HTTP 403 with safe error code 403. Classification:
GENERIC_OPENROUTER_INFERENCE_403. Error message was not returned by the safe
allowlist projection. No retry or additional inference was performed.

Remote v2 contains only a fixed HTTP 410 RP112_DIAGNOSTIC_DISABLED handler and an
empty deno.json: no secret/environment access, imports or upstream requests.
Readback confirmed the disabled source and unchanged production parse-resume-ai
v4 source/bundle. The operator exited 0. Do not reactivate for another attempt.
Earlier execution/deployment approval failures are historical, not auth failures.
