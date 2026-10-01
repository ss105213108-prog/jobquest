# RP-112 AI Edge Function Foundation

This implements ADR 0011/0012 without switching the browser's existing PDF route.
The RP-111 extraction schema, unknown projection, evidence validation, response admission,
request policy and diagnostic allowlist now live in the shared production module.
The RP-111 harness only retains fixtures, the independent anonymous factual oracle and
future review/matching test policy. No review or matching API was productionized.

## Invocation

Only JobQuest project `neqwkiruqfevlchiajor` is permitted. Function: `parse-resume-ai`.
Gateway `verify_jwt = true` and handler-side Supabase `auth.getUser(userJWT)` are both
required. The authenticated role includes anonymous-auth sessions. A publishable/anon
API key alone is not an authenticated user. Authentication uses only the public
`SUPABASE_ANON_KEY`; no service-role key, database query or persistence is used.

POST multipart fields must be exactly `file`, `consent=true`, and
`consentVersion=AI_PDF_CONSENT_V1`. Duplicate/extra fields are rejected, including
client URLs, model, prompt, provider, schema and key overrides. Each invocation
generates fresh attempt/document identifiers; consent is not stored or reused.
Only `http://localhost:5173` is allowed by default. Before an approved deployment
origin is enabled, set the server-owned comma-separated `RESUME_AI_ALLOWED_ORIGINS`.
Non-browser invocations still require user authentication and consent.

The inherited operational ceiling is 10 MiB, with 64 KiB multipart framing allowance.
Actual streamed bytes are capped even without a trustworthy Content-Length. Admission
requires PDF MIME, nonempty bytes, a PDF header, and a structurally loadable nonencrypted
PDF with at least one page. Pinned pdf-lib 1.17.1 loads only document structure/page count
for evidence bounds. It does not read text, reconstruct layout or call the frozen parser.
This is not semantic acceptance or proof of source factual correctness. Blank, image-only,
sparse and rotated pages have no text/layout threshold.

## Upstream Contract

The only inference secret is server environment `OPENROUTER_API_KEY`.
One original whole PDF becomes one inline base64 `resume.pdf` file part, one POST to
OpenRouter chat completions, with redirects disallowed and zero retries.
The latest authorized secondary-route continuation selects
`google/gemini-3-flash-preview`, `provider.only/order=[google-vertex]`, `allow_fallbacks=false`,
`require_parameters=true`, `zdr=true`, `data_collection=deny` and explicit
`file-parser/pdf.engine=native` are fixed. No healing, tools, web or alternate plugins.
The completion ceiling remains 8192 tokens, using Vertex's advertised `max_tokens`
request field. Its OpenRouter response provider display name is `Google`. The
original GPT-5 Mini/Azure route remains historical and closed for RP-112. This
secondary configuration is local only until the verification/deployment gates pass.
The strict json_schema response uses exactly the shared AI_RESUME_EXTRACTION_V1 schema.
Ajv 8.20.0 is the sole JSON Schema validator, configured without coercion/defaulting.

The AbortController deadline is **120 seconds**, covering fetch and response-body reads,
below Supabase's documented 150-second request-idle ceiling. Auth requests have an
8-second deadline. The upstream response byte ceiling is 256 KiB; assistant content
retains RP-111's 64 KiB bound. These are operational limits, not resume semantics.
Timeout does not prove the provider did not execute; no exactly-once billing guarantee.

Failure states remain INVALID_FILE, AI_REQUEST_FAILED, AI_RESPONSE_INVALID,
AI_SCHEMA_INVALID and AI_EXTRACTION_COMPLETED. Network/HTTP/timeout failures are request
failures; malformed completion/JSON is response-invalid; schema/domain/evidence failures
are schema-invalid. All upstream bodies and exception text stay private. No deterministic
PARSE_FAILED/SCANNED_PDF collapse. Provider/model mismatch fails response admission.
In a future single allowed smoke, a route rejecting these restrictions is
SELECTED_ROUTE_NOT_RUNTIME_COMPATIBLE; restrictions must not be relaxed.

Success returns the unaccepted REVIEW_REQUIRED candidate, unverified source excerpts,
reviewRequired=true, schema version, fixed model/validated provider, attempt ID and
allowlisted numeric usage/cost only. No accepted=true, persistence, matching or full
upstream response. Responses use Cache-Control:no-store. Logs are emitted only through
the shared strict allowlist: safe codes/UUID, status, latency, bytes, upstream status,
schema state, fixed model/provider and numeric usage. No PDF, filename, factual content,
candidate, excerpts, raw provider/error text, auth tokens or key are logged.
At worker bootstrap, dependency console output is disabled once; the sole retained
application diagnostic sink reprojects every input through the shared allowlist.
This prevents pdf-lib numeric warnings and SDK exception logs bypassing redaction,
without per-request console replacement or concurrent-request restoration races.

ZDR applies to inference routing, not an absolute assurance that no vendor buffers,
plugin data, billing/security records or implicit memory caches exist. Account-level
content settings and actual native Azure compatibility still need live verification.
Nothing in mocked tests certifies extraction quality or truthful model evidence.

## Deployment and Smoke Boundaries

Deploy only this function to the pinned project; no migrations, tables, RLS or unrelated
functions. Never upload `C:/Users/user/Downloads/前端.pdf` or any private resume in RP-112.
Only one anonymous synthetic whole-PDF live smoke is allowed, and only after tests pass
and the secret is confirmed securely configured. Do not ask for a key in chat or source.
If unavailable, configure OPENROUTER_API_KEY through Supabase Edge Function secrets;
deployment/auth/native/schema/provider runtime acceptance remains explicitly NOT_VERIFIED.
ResumeReview, private per-attempt consent, persistence and the runtime switch are RP-113.

## Verification Record

2026-09-28: RP-111 146/146 PASS through shared production policies where applicable;
Edge/auth focused tests 77/77 PASS; combined 223/223 PASS. Independent strict test
TypeScript, Deno 2.7.5 check and an in-memory Deno mocked-handler execution PASS.
App TypeScript and build PASS (existing large-chunk warning unchanged).
Full suite: 1545 PASS / 5 frozen reconstruction FAIL, exactly two-column, sidebar,
same-Y separate columns, split CJK heading and public PDF parser reproduction.
Hash comparison: no src/ or preexisting deterministic tests changed.

Only parse-resume-ai was deployed to the approved JobQuest project: ACTIVE v2,
verify_jwt=true. A remote unauthenticated empty POST returned 401 with no PDF transfer
or inference. This negative auth check is not a live AI smoke.
No local OPENROUTER_API_KEY is configured. The user confirmed that remote configuration
is absent or uncertain and explicitly requested skipping live smoke. No secret value
was read. Live anonymous smoke: BLOCKED_SECRET_NOT_CONFIGURED, zero inference calls;
actual served provider/native/structured-output runtime acceptance NOT_VERIFIED.
No real private resume was accessed or transmitted.

## Authorized Live Smoke Continuation

2026-09-28: The user confirmed OPENROUTER_API_KEY was securely configured in the
JobQuest Edge Function secrets and authorized exactly one anonymous synthetic-PDF
live smoke. The earlier BLOCKED_SECRET_NOT_CONFIGURED record above is historical.
No secret values were fetched, read, printed or returned to Codex. Only the project's
publishable client key was used to obtain an anonymous-auth session.

The function was ACTIVE v3 with verify_jwt=true and unchanged bundle SHA256
934f893756d675d0e2356426cf42afd0db4155209f89852219e5d4aec8c163d6.
RP-111 plus Edge/auth contracts were rerun immediately before the smoke: 223/223 PASS.
No production source, tests, deployment configuration or runtime route was changed.

One in-memory, entirely fictional, one-page PDF (1248 bytes) was admitted through
an authenticated anonymous session with consent=true and AI_PDF_CONSENT_V1.
Exactly one function invocation was made, with no automatic retry or redirect.
Attempt ID: 3699c6ea-bfc5-44fd-87ca-81ff9a52f3fb.
Call window: 2026-09-28T08:26:19.645Z to 2026-09-28T08:26:22.923Z.
Measured client latency: 3276 ms.

Live anonymous smoke: FAILED.
Function HTTP: 502.
Preserved status/code: AI_REQUEST_FAILED / PROVIDER_REQUEST_FAILED.
OpenRouter upstream HTTP: 403.
Served model/provider: NOT_VERIFIED.
Native PDF acceptance: NOT_VERIFIED.
Strict structured-output acceptance: NOT_VERIFIED.
No candidate was returned, accepted, persisted or matched.

The safe failure does not expose the raw upstream error body. Therefore this evidence
does not establish whether the 403 was an account/access restriction or the selected
Azure route rejecting a required capability/privacy parameter. It is not sufficient
to assert SELECTED_ROUTE_NOT_RUNTIME_COMPATIBLE as a diagnosed cause. Runtime acceptance
is BLOCKED; do not relax any restriction or claim extraction quality from this smoke.

A bounded, project/function-scoped log query returned only aggregate metadata:
one function_edge_logs entry and two function_logs entries, zero matches for the
synthetic name, transport filename or base64 prefix in log_attributes. No raw log
messages or secret values were retrieved. The diagnostic attempt was not visible in
that projection; the follow-up log-schema query was unavailable. Consequently full
attempt-correlated log-content verification remains NOT_VERIFIED, not a blanket
claim that every platform log was inspected.

No private resume was accessed or transmitted. No additional inference call,
provider fallback, request repair, production fix or RP-113 work was undertaken.
Only this documentation record changed during the continuation.

## Historical Course-Key Blocker (Superseded)

The authorization interpretation and next action in this historical record are
superseded by the teacher-confirmed conditions and bounded audit below. Lack of
dashboard control is not a usage-authorization blocker.

2026-09-28: The user confirmed that the configured OPENROUTER_API_KEY is a shared
course-provided key supplied by the instructor. The user does not control the
corresponding OpenRouter account and cannot inspect failed-request metadata,
provider/router reasons, key status, budget/credit, privacy/guardrails or Azure
route restrictions. These account facts remain UNKNOWN. Do not request dashboard
metadata from the user or make another inference call with this course key.

RP-112 403 Investigation: BLOCKED.
Root-cause classification: INSUFFICIENT_EVIDENCE.
Blocking reason: COURSE_PROVIDED_OPENROUTER_KEY_WITHOUT_ACCOUNT_CONTROL.
Code change required: NO.
Privacy requirement relaxation required: NO.
Additional inference calls during the investigation and this closure: 0.

The missing account control is an evidence-access blocker, not proof of what caused
the upstream 403. No request-builder bug, account-policy cause or Azure capability
conflict has been established. The original single failed smoke remains the only
live inference attempt; runtime acceptance remains NOT_VERIFIED.

Recommended next action: Use an OpenRouter account/API key owned and manageable by
the user, then perform one additional RP-112 anonymous synthetic-PDF live smoke.
This is a future action only: no secret replacement or smoke is performed here.
Keep the existing model, Azure-only pin, no fallback, ZDR, data_collection=deny,
native PDF and strict structured-output requirements unchanged. Do not modify the
Edge Function, reopen deterministic PDF work or begin RP-113. Stop at this record.

Only this documentation record changed. Production code, tests, deployment and
account settings were not changed. No private resume or secret value was read,
used or exposed during this closure.

## Teacher-Confirmed Shared-Key Conditions and Mechanical Audit

2026-09-28: The user relayed the instructor's explicit authorization to use the
shared class key for course projects, with no specified model or provider
restriction. All students consume the same token/credit budget; service stops
when that budget is exhausted. These are user/instructor-confirmed conditions,
not a live inspection of account policy or remaining credits.

```text
COURSE_SHARED_KEY_USAGE_AUTHORIZED = YES
MODEL_RESTRICTION = NONE_KNOWN
PROVIDER_RESTRICTION = NONE_KNOWN
BUDGET = SHARED_COURSE_BUDGET
ACCOUNT_DASHBOARD_CONTROL = UNAVAILABLE
```

COURSE_PROVIDED_OPENROUTER_KEY_WITHOUT_ACCOUNT_CONTROL is not an authorization
blocker. No dashboard metadata is requested from the user. Key active status,
remaining credits and the exact failed-attempt reason remain UNKNOWN; the earlier
upstream HTTP 403 remains an independent technical failure, not proof of exhausted
budget or a parser defect.

Observe / reproduce from existing evidence: retain the original single smoke's
HTTP 502, AI_REQUEST_FAILED / PROVIDER_REQUEST_FAILED, upstream HTTP 403 and
3276 ms latency. No inference replay was made. The existing handler cancels the
non-success upstream response body, so the specific router/provider reason was
not preserved. Local mock success cannot establish the cause of that live 403.

Inspect request contract: an offline import of the current production builder,
with network fetch forbidden, validated its JSON-serialized structural output.
No prompt, PDF payload, schema contents or secret value was printed. Independent
structural assertions PASS; requestContractIssues returned an empty list.

| Check | Observed configuration / evidence | Mechanical issue |
| --- | --- | --- |
| Model identifier | openai/gpt-5-mini; current public endpoint metadata uses this ID | NOT_FOUND |
| Provider pin / identifier | provider.only=[azure], order=[azure]; lowercase azure is the documented slug | NOT_FOUND |
| Routing combination | Matching only/order, allow_fallbacks=false, require_parameters=true, zdr=true, data_collection=deny | NOT_FOUND |
| Native PDF shape | One file content part, neutral resume.pdf filename, inline application/pdf data URL; file-parser/pdf.engine=native | NOT_FOUND |
| Structured output | response_format.type=json_schema, named schema, strict=true; all six object schemas require every property and reject additional properties | NOT_FOUND |
| Completion settings | stream=false, max_completion_tokens=8192; Azure advertises this parameter and a larger completion ceiling | NOT_FOUND |

Official routing documentation supports only, order, disabled fallbacks and these
parameter/privacy filters; there is no demonstrated field-combination conflict.
Fresh unauthenticated public metadata lists azure and azure/swedencentral for the
selected model, with response_format, structured_outputs and max_completion_tokens.
Model-level file input does not establish endpoint-level native PDF compatibility.
The simultaneous native PDF / strict schema / privacy / account intersection is
still UNKNOWN; no capability conflict or request bug is proved by this audit.

Verification: RP-111 extraction contracts plus Edge/auth contracts rerun offline,
223/223 PASS. This is mocked contract evidence, not live runtime acceptance.

RP-112 403 Investigation: BLOCKED (technical root cause unresolved).
Root-cause classification: INSUFFICIENT_EVIDENCE.
Code change required: NO (no proven mechanical bug).
Privacy requirement relaxation required: NO.
Additional inference calls: 0.
Final anonymous smoke: NOT_RUN; the proven-mechanical-fix prerequisite was not met.
Recommended next action: STOP_INSUFFICIENT_EVIDENCE.

Only if a mechanical request/configuration bug is subsequently proved may RP-112
receive one minimal fix and the single final anonymous synthetic-PDF smoke. Keep
the selected model, Azure-only pin, no fallback, ZDR, data_collection=deny, native
PDF and strict structured output unchanged. If that permitted final smoke has
direct evidence of shared-budget exhaustion, report COURSE_SHARED_BUDGET_EXHAUSTED
as runtime availability, not a parser bug. Do not infer exhaustion from HTTP 403.

Only this documentation record changed; production code, tests, deployment and
account settings are unchanged. No key value or real resume was read or exposed.
No deterministic PDF work, alternate model trial, new RP or RP-113 was started.
Stop here.

## Authorized Existing Secondary Route: Offline Verification Blocked

2026-09-28: The user explicitly authorized activating only the already evaluated
RP-111 secondary candidate, without broad model research or any relaxation. This
supersedes the prior STOP_INSUFFICIENT_EVIDENCE next action for the primary route;
it does not reopen GPT-5 Mini/Azure diagnosis or authorize testing other models.

RP-111 SECONDARY ROUTE REVIEW:

- Primary: openai/gpt-5-mini / Azure; closed for RP-112 after the single HTTP 403.
- Secondary: google/gemini-3-flash-preview / Google Vertex.
- Routing slug: google-vertex; current response provider name: Google.
- Why secondary: RP-111 passed its document-based file/schema/privacy capability
  screen, but selected GPT first under its cost rule; no paired extraction benchmark.
- Already evaluated/approved candidate: YES; activation explicitly authorized here.
- Hard requirements supported: YES at documentation qualification level; exact
  authenticated OpenRouter/native-PDF/strict-output runtime remains NOT_VERIFIED.

Fresh public metadata for only this existing model lists google-vertex/global,
with response_format, structured_outputs and max_tokens (not max_completion_tokens).
Its completion ceiling is 65536. The ZDR catalog includes the Vertex global route.
The official Google model specification lists application/pdf and structured
output support. These are capability evidence, not a live acceptance claim.

Local production changes are confined to _shared/aiResumeExtractionV1.ts:
selected model/provider, only/order route, the equivalent 8192 max_tokens ceiling,
and the matching request-schema/capability gate. The extraction schema, prompt,
PDF transport, privacy flags, consent, authentication, failure mapping, response
admission, evidence/provenance and zero retry/fallback policies are unchanged.
Focused test fixtures/expectations were updated to the selected route; two added
cases reject the closed Azure pin. One old negative-model fixture was changed
from the now-approved Gemini model to the closed GPT model. No unrelated tests
or deterministic parser files were edited.

Test-first route assertion initially RED on the old selected model, then GREEN
after the minimal route change and corresponding fixture updates. Final focused
contracts: 225/225 PASS (148 extraction contracts, 77 Edge/auth contracts).
App TypeScript: PASS. Production build: PASS, existing large-chunk warning unchanged.

An additional independent all-tests TypeScript probe failed. The initial CLI
invocation required --ignoreConfig; the corrected invocation then reported errors
in non-AI tests and their type environment, including ImportMeta.env / worker URL
declarations, node types, anonymousPdfGraphicsHarness, PDF geometry fixtures and
resumeDocumentOutcomeContract fixtures. This probe is not evidence of a secondary
route runtime failure. It is nevertheless an automated verification FAIL, so the
ticket's strict stop gate applies. No out-of-scope typing/parser repair was made.

RP-112 SECONDARY ROUTE RESULT: BLOCKED.
Exact blocking reason: AUTOMATED_VERIFICATION_FAILED_ALL_TESTS_TYPESCRIPT_PROBE.
Edge Function secondary deployment: NO. Remote function remains ACTIVE v3,
verify_jwt=true with the historical primary bundle. No remote setting was changed.
Live smoke executed: NO. Live inference count in this continuation: 0.
Function HTTP / OpenRouter HTTP: NOT_CALLED.
Served model / provider: NOT_VERIFIED.
Native PDF / strict structured output: NOT_VERIFIED.
AI_RESUME_EXTRACTION_V1 / domain / evidence live validation: NOT_REACHED.
Automatic retries: 0. Provider fallback: 0. Privacy requirements relaxed: NO.
Private resume used: NO. Secret value read/output: NO. Candidate persisted: NO.
Matching executed: NO. Recommended next step: STOP_RUNTIME_BLOCKED.

Only one production shared module, the two focused test files and this verification
document changed. No deployment, schema/migration/table work, private PDF access,
additional model, deterministic PDF work, new RP or RP-113 was undertaken. Stop here.

Secondary capability references checked 2026-09-28:
[existing Gemini endpoint metadata](https://openrouter.ai/api/v1/models/google/gemini-3-flash-preview/endpoints),
[ZDR endpoint catalog](https://openrouter.ai/api/v1/endpoints/zdr),
[official Gemini 3 Flash specification](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-flash).

## TypeScript Probe Blocker Reclassification

2026-09-28: The read-only follow-up reproduced the exact all-tests probe and
compared an isolated, hash-verified pre-secondary baseline. Both returned exit 1
and the same 44 errors, with complete output byte-for-byte identical. All 18
failing files match the pre-secondary SHA-256 snapshot; none is one of the three
RP-112 route-modified production/test files.

Classification: MIXED, 16 PRE_EXISTING_OR_UNRELATED_TEST_ERROR and 28
TEST_TYPECHECK_ENVIRONMENT_MISMATCH; zero introduced or insufficient-evidence cases.
RP112_SECONDARY_ROUTE_CAUSED_TS_FAILURE = NO. This extra --ignoreConfig all-tests
probe is not an existing repository release gate. The preceding offline blocker
is superseded; these failures must not be promoted into an RP-112 runtime blocker.
Production behavior change required: NO. Unrelated frozen tests require change: NO.

Recommended next action: PROCEED_TO_EXISTING_RP112_VERIFICATION_AND_ONE_LIVE_SMOKE.
This investigation does not deploy or execute that action. Existing focused-test,
app-TypeScript, build, auth/consent and privacy gates remain mandatory; runtime
acceptance remains NOT_VERIFIED. Inference calls: 0. Private resume used: NO.

See [the full error inventory, exact command and baseline evidence](investigations/rp-112-typescript-probe-classification.md).
Only investigation documentation changed; no production/test/config repair,
deployment, secret access, parser work or RP-113 was performed. Stop here.

## Final Secondary Deployment and Single Live Smoke

2026-09-28: The user authorized final offline verification, deployment of only
parse-resume-ai to JobQuest (neqwkiruqfevlchiajor), and exactly one authenticated
anonymous synthetic-PDF smoke. The unrelated all-tests TypeScript probe was not
rerun or treated as a blocking release gate. No unrelated typing repair was made.

Final legitimate offline gates:

- Focused extraction/request-builder/provider-routing and Edge/auth tests:
  225/225 PASS (148 extraction contracts and 77 Edge/auth contracts).
- App TypeScript: PASS.
- Production build: PASS; existing large-chunk warning unchanged.

Only parse-resume-ai was deployed, returning ACTIVE version 4 with verify_jwt=true.
Bundle SHA-256: 54650cba6c4060657281b4cdfc4025660d9de34a79969605c7cebe4a88d3f43f.
Remote readback matched all six returned source/config files to the submitted
local files after line-ending normalization. The remote request configuration
contains google/gemini-3-flash-preview and Google Vertex (google-vertex only/order),
with provider fallback disabled, require_parameters=true, zdr=true,
data_collection=deny, native PDF and strict JSON-schema output preserved.
This confirms deployed configuration, not a model/provider serving claim.
No projects were listed and no other function, database, schema or migration
was changed.

The single smoke used an in-memory, two-page, 1322-byte PDF containing only
fictional applicant/organization/project text and no contact information.
Anonymous Supabase authentication returned HTTP 200 and an authenticated session.
One function POST was made, with one upstream inference request, no automatic
retry and no provider fallback. No real resume was accessed.

Directly observed result:

- UTC window: 2026-09-28T10:08:42.834Z to 2026-09-28T10:08:46.127Z.
- Latency: 3292 ms.
- Attempt ID: 4f722b03-5b05-49d8-92d0-0a72f3c76864.
- Function HTTP: 502.
- Application status: AI_REQUEST_FAILED.
- Application code: PROVIDER_REQUEST_FAILED.
- OpenRouter HTTP: 403.
- Served model/provider: NOT_VERIFIED.
- Native PDF acceptance: NOT_VERIFIED.
- Strict structured output acceptance: NOT_VERIFIED.
- AI_RESUME_EXTRACTION_V1 schema: NOT_REACHED.
- Domain validation: NOT_REACHED.
- Evidence validation: NOT_REACHED.

HTTP 403 alone does not establish its underlying cause, course-budget exhaustion,
provider capability incompatibility or account restrictions. No retry, further
inference, log/root-cause investigation, model change or privacy relaxation was
performed after this result. The authorized single-smoke budget is consumed.

RP-112 RESULT: BLOCKED.
AI runtime foundation: NOT_VERIFIED.
Exact observed reason: AI_REQUEST_FAILED / PROVIDER_REQUEST_FAILED with upstream
HTTP 403, surfaced as Function HTTP 502.
Recommended next step: STOP_RUNTIME_BLOCKED.

Private resume used: NO. Secret value read/output: NO. Candidate persisted: NO.
Matching executed: NO. Automatic retries: 0. Provider fallback: 0.
Only this documentation record changed locally in this final continuation;
production source, tests and configuration were not edited. No deterministic
parser work, third model, new RP or RP-113 was started. Stop here.

## Common-Layer Diagnostic: Execution Authorization Blocked

2026-09-28: The latest pasted continuation requested one non-inference key probe
from the same project's Edge runtime, followed only on HTTP 200 by one anonymous
minimal text control on the existing approved model. No production extraction
contract change, third model, real resume, parser repair or RP-113 was requested.

Prepared isolated temporary code under scripts/rp112-openrouter-diagnostic and
15 new focused diagnostic tests. The handler has exact-user authentication,
short-expiry and worker-local consumption guards, no retries, bounded bodies and
fixed allowlisted safe error projection. Successful key-probe account/usage data
is not parsed or emitted. The text control retains ZDR, data deny and disabled
fallback without a provider pin/list, PDF, file, tools or structured-output schema.
It is not part of the production resume path and was NOT DEPLOYED.

Offline verification:

- Diagnostic tests: 15/15 PASS.
- Existing focused AI tests: 225/225 PASS; combined 240/240 PASS.
- Independent strict TypeScript check of diagnostic handler: PASS.
- App TypeScript: PASS.
- Production build: PASS; existing large-chunk warning unchanged.
- Unrelated all-tests TypeScript probe: NOT_RUN.

The environment's safety review rejected operator startup before process creation,
citing the earlier shared-key inference prohibition. A second review was supplied
with exact latest-ticket authorization excerpts and again rejected it, stating
that pasted attachment instructions were insufficient to override that restriction.
These were execution-approval failures, not HTTP responses or inference retries.
No indirect execution, alternate tool, deployment or other workaround followed.

RP-112 COMMON-LAYER DIAGNOSTIC: BLOCKED.
Non-inference key probe: NOT_RUN.
Key probe HTTP: NOT_CALLED.
OPENROUTER_SECRET_AUTH_PATH: UNKNOWN.
Minimal text control executed: NO.
Inference calls: 0. OpenRouter key-probe calls: 0.
Minimal text HTTP: NOT_CALLED. Minimal text result: NOT_RUN.
Safe upstream error code/message: NOT_REACHED.
Classification: INSUFFICIENT_EVIDENCE.
Exact execution blocker: SAFETY_REVIEW_REQUIRES_DIRECT_RUNTIME_REAUTHORIZATION.
Production resume behavior changed: NO. Private resume used: NO.
Secret exposed: NO. Remote parse-resume-ai remains unchanged ACTIVE v4.
Recommended next step: obtain explicit direct-message authorization for one key
probe and, only after HTTP 200, at most one anonymous text control, then resume
this same diagnostic. No new OpenRouter technical cause is established here.

Only isolated diagnostic code/tests and this documentation were added/updated;
existing production source and existing tests/configuration remain unchanged.
No database, account secret, model selection, privacy contract or remote function
was changed. Stop here; do not start fixes or RP-113.

## Common-Layer Diagnostic: Temporary Deployment Authorization Blocked

2026-09-28: The user directly reauthorized one key probe and a conditional single
anonymous text control after key HTTP 200. This supersedes the preceding runtime
reauthorization requirement; it does not establish any OpenRouter technical result.

The operator authenticated anonymously (HTTP 200), but its first plain-pipe runner
ended while awaiting stdin without dispatching the diagnostic. A PTY runner then
authenticated successfully and stayed ready. These authentication/runner operations
did not call either OpenRouter endpoint or consume the authorized inference budget.

An isolated helper deployment was submitted to only JobQuest
(neqwkiruqfevlchiajor), with verify_jwt=true, an exact authenticated operator ID,
a ten-minute expiry, existing pinned Supabase dependency and no resume path change.
Safety review rejected deployment: explicit permission to create a new remote
Edge Function with server-secret access and subsequently disable it was required.
The tool returned isError=true; no successful deployment was reported.

No alternate deployment, production-function branch or indirect execution followed.
The ready operator received CANCEL, completed its session cleanup and exited 0.
No active diagnostic runner remains. No new offline code change required a test
rerun; the preceding 15/15 diagnostic and 225/225 existing focused results remain
the verified results for unchanged code.

RP-112 COMMON-LAYER DIAGNOSTIC: BLOCKED.
Non-inference key probe: NOT_RUN. Key probe HTTP: NOT_CALLED.
OPENROUTER_SECRET_AUTH_PATH: UNKNOWN.
Minimal text control executed: NO. Inference calls: 0. Key-probe calls: 0.
Minimal text HTTP: NOT_CALLED. Minimal text result: NOT_RUN.
Safe upstream error code/message: NOT_REACHED.
Classification: INSUFFICIENT_EVIDENCE.
Exact execution blocker: SAFETY_REVIEW_REQUIRES_TEMPORARY_FUNCTION_DEPLOYMENT_AUTHORIZATION.
Production resume behavior changed: NO. Private resume used: NO. Secret exposed: NO.
No successful remote mutation, model change, production security relaxation,
database work, parser work, repeated inference or RP-113 occurred.

Recommended next step: obtain explicit permission to deploy the isolated temporary
rp112-openrouter-diagnostic function in JobQuest for this short-lived authenticated
operator, then immediately replace it with a disabled handler after the already
authorized single diagnostic. This is a deployment approval issue, not an observed
OpenRouter 401/403. Stop here.

## Common-Layer Diagnostic: Final Single Runtime Result

2026-09-28: The user directly authorized both the single key probe/conditional
anonymous text control and deployment of the temporary isolated helper followed
by immediate deployment of a disabled version. This supersedes the preceding
approval blockers, without changing the production resume extraction contract.

Focused tests were rerun: 240/240 PASS (15 diagnostic and 225 existing AI tests).
No diagnostic, extraction or test code change was required. The preceding app
TypeScript, production build and strict diagnostic-handler TypeScript checks
remain PASS for unchanged code; the unrelated all-tests probe was not rerun.

Only rp112-openrouter-diagnostic was deployed in JobQuest
(neqwkiruqfevlchiajor), initially ACTIVE v1, verify_jwt=true. Remote readback
matched all four submitted source/config files. Runtime authorization was bound
to an exact anonymous authenticated session and a ten-minute expiry. No project
listing, real resume, third model, database/schema or production-function change
was made. The agent did not retrieve, print or log any OPENROUTER_API_KEY value;
the server used the existing secret only as the upstream authorization credential.
Console output was disabled in the isolated diagnostic worker.

One function invocation executed one GET /api/v1/key from Edge runtime. Only
after its HTTP 200 did the helper send one minimal text POST /chat/completions
on the existing google/gemini-3-flash-preview model. No PDF, file, resume, schema,
ResumeProfile, tools, provider pin or provider fallback list was included. ZDR,
data_collection=deny and allow_fallbacks=false remained enabled. Consequently
this control does not establish compatibility of all possible routing/privacy
combinations, nor isolate which privacy/account/inference constraint produced 403.

Direct observations:

- UTC invocation window: 2026-09-28T10:31:22.080Z to 2026-09-28T10:31:24.828Z.
- Diagnostic Function HTTP: 200 (safe diagnostic envelope, not inference success).
- Non-inference key probe: PASS. Key probe HTTP: 200.
- OPENROUTER_SECRET_AUTH_PATH: VERIFIED.
- Minimal text control executed: YES. Inference calls: 1.
- Minimal text HTTP: 403. Minimal text result: FAIL.
- Safe upstream error code: 403. Error envelope: JSON_ERROR.
- Safe upstream error message: NOT_RETURNED_OR_OMITTED.
- Classification: GENERIC_OPENROUTER_INFERENCE_403.
- Automatic retries: 0. Provider fallback: 0.
- Production resume behavior changed: NO. Private resume used: NO.
- Secret exposed: NO. Candidate persisted: NO. Matching executed: NO.

Successful key-probe account/usage data was cancelled without parsing or reporting.
The text-error body was bounded and projected through fixed safe code/message
allowlists; arbitrary error text and nested raw/routing data were not emitted.
The omitted message is not evidence that the upstream returned no message.

Under the ticket's decision matrix, auth/key access from the Edge runtime is
verified, while the generic text control still fails 403 without PDF/schema/pin.
This rules out those excluded request components as necessary to reproduce this
403, but does not identify its root cause, establish budget exhaustion or prove
that every earlier 403 had an identical upstream reason. No further diagnosis,
provider/model trial, inference, production fix or RP-113 followed.

Immediately after receiving the result, a disabled deployment was attempted.
The platform retained the old import-map path and rejected the first deployment;
supplying an explicit empty deno.json fixed only that deployment configuration.
This did not invoke any model. Successful disabled deployment is ACTIVE v2,
verify_jwt=true, bundle SHA-256
9edecba3a46f386bda276748de962156c5bb7572e1c80039f2d88200cb8e4dd0.
Readback confirmed a fixed HTTP 410 RP112_DIAGNOSTIC_DISABLED response, an empty
configuration and no imports, secret/environment access or upstream requests.
No HTTP invocation was made to test the disabled handler; confirmation is source
readback. The operator completed session cleanup and exited 0.

Production parse-resume-ai remains ACTIVE v4; pre/post readback confirms unchanged
bundle hash and exact source files, with verify_jwt=true. The diagnostic helper
must not be reactivated; the authorized one-inference budget is consumed.

RP-112 COMMON-LAYER DIAGNOSTIC: COMPLETE.
RP-112 production AI runtime acceptance remains BLOCKED.
Recommended next step: request OpenRouter support investigation of the generic
Edge-runtime chat/completions HTTP 403 using this privacy-safe evidence, without
sharing the key, account/usage data or private documents. Stop here.

## Official References

Verified 2026-09-28: [Supabase auth headers](https://supabase.com/docs/guides/functions/auth-headers),
[user authentication](https://supabase.com/docs/guides/functions/auth-legacy-jwt),
[npm dependencies](https://supabase.com/docs/guides/functions/dependencies),
[platform limits](https://supabase.com/docs/guides/functions/limits),
[OpenRouter PDF input](https://openrouter.ai/docs/guides/overview/multimodal/pdfs),
[routing restrictions](https://openrouter.ai/docs/guides/routing/provider-selection),
[structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs),
[pdf-lib document loading](https://pdf-lib.js.org/docs/api/classes/pdfdocument#load).
