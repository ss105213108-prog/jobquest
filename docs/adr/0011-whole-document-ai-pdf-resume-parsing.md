# Whole-document AI PDF resume parsing

Status: Accepted architecture; implementation deferred (replacement RP-109, 2026-09-28).

Freeze deterministic PDF coverage at RP-108. Select whole-document, server-side AI as the primary future PDF semantic extraction path, with OpenRouter as the provider gateway and the model deferred. A validated extraction is an editable candidate, not truth: only explicit ResumeReview confirmation permits an accepted ResumeProfile to reach persistence and matching.

## Authority and scope

This replacement RP-109 supersedes the preceding RP-109 structured-domain implementation request and its planned RP-110 deterministic analyzer integration. It supersedes ADR 0001's deterministic-first product strategy and ADR 0010's downstream deterministic migration sequence. Their historical evidence, immutable source rules, privacy obligations and non-fabrication principles are retained. ADRs 0002/0003 remain applicable to observed deterministic causes; this decision does not change their runtime types or invent AI causes.

RP-001 through RP-108 are retained, not deleted. Freeze PageLayout Evidence, VisualGroup, spatial graph, Reading Order V1, Serialization V1, ResumeSourceDocument, structured analysis and structured sections. They may support validation, diagnostics, provenance or a separately approved future cheap fast path; they are not a prerequisite for shipping AI PDF extraction.

Do not reopen region ownership, columns/tracks, left/right reading order, PDF item-order heuristics, graphics, MCID, metadata research or cross-unit deterministic joins. A later concrete production bug may justify only a separately scoped fix. Preserve NO_PRODUCTION_SHADOW: no parallel deterministic/AI comparison run in the production parser.

The current PDF runtime is still `resumeService -> parseResumeFile -> parsePdfResume -> legacy reconstruction -> normalizeResumeText -> resumeAnalyzer`. No switch happens in this ADR. DOCX remains on that format's existing deterministic path. Matching, Ranking, Job Quest UI, 104 and 1111 remain unchanged.

Interrupted domain-adaptation edits already present in the working tree are unaccepted work from the superseded request, not an extension of the frozen RP-108 baseline. This architecture neither continues nor silently reverts those edits. They must not be treated as approved production coverage or a dependency of the AI route.

## Existing product contracts

Repository evidence:

- [Domain types](../../src/types/index.ts): ResumeProfile, WorkExperience, ResumeEducation and ResumeProject are the accepted output types.
- [Resume service](../../src/services/resumeService.ts): analysis and save are separate calls; preserve that separation.
- [ResumeStep](../../src/components/onboarding/ResumeStep.tsx) and [ResumeReview](../../src/components/onboarding/ResumeReview.tsx): a draft reaches the editable review before confirmation, and confirmation currently requires a nonempty name.
- [Authentication](../../src/services/authService.ts): the app reuses a session or creates a Supabase anonymous authenticated user. That identity is not permission for unlimited paid inference.
- [Repository](../../src/repositories/resumeRepository.ts) and [RLS migration](../../supabase/migrations/20260919114039_create_job_quest_user_data.sql): accepted profiles are scoped to the authenticated owner.
- [File admission](../../src/parsers/resumeFileParser.ts): the current upload ceiling is 10 * 1024 * 1024 bytes. Extension/MIME admission alone does not prove a valid PDF container.

## Practical routing

AI PDF role: **PRIMARY**, not a page-level hybrid and not dependent on finishing structured domain adapters.

Target flow:

```text
PDF selected locally
  -> explicit external-transmission disclosure and consent
  -> authenticated, authorized server invocation
  -> bounded file/document admission and capability checks
  -> one whole-document OpenRouter extraction request
  -> response/schema/domain/provenance validation
  -> ResumeProfile-compatible draft + separate review evidence
  -> ResumeReview: user corrects and explicitly confirms
  -> accepted existing ResumeProfile
  -> existing persistence and matching
```

Server admission is separate from legacy semantic extraction. Do not require `parseResumeFile` to succeed before attempting the primary AI route: its low-text check rejects documents that a visual route may legitimately read. Validate actual bytes, readable PDF structure and all pages required by the selected input capability instead. Exact libraries and executable validity contracts are RP-110/future implementation work, not a new layout investigation.

Preserve three-way reasoning for a future optional deterministic fast path:

| Situation | Decision |
| --- | --- |
| Proven complete, safe deterministic extraction candidate | `DETERMINISTIC_SUCCESS`; review candidate, no AI needed. This future fast path is not enabled here. |
| Valid document, correct operation, explicitly supported deterministic coverage limitation | `FALLBACK_ELIGIBLE`; a consented whole-document AI attempt can be made without developing more deterministic coverage. |
| Validation/contract defect, unreadable/corrupt supported input, unexpected runtime exception or infrastructure/configuration failure | `HARD_FAILURE`; no AI call to disguise the problem. Preserve the primary safe cause. |
| Ordinary PDF on the selected primary AI route | Apply admission, authorization, consent and AI-capability gates directly; do not manufacture a deterministic success/fallback result from stages that were never run. |

The primary AI route does not run a failing deterministic parser merely to earn fallback eligibility. If a required admission/validation operation throws, it remains a hard failure even if the original file might be valid. Unknown validity at a required admission scope blocks transmission; it is not converted into eligibility.

`SCANNED_PDF` and `PARSE_FAILED` are not direct routing predicates. Low extracted-text thresholds have **NONE** as their AI routing role. Missing optional fields do not mean structural failure. No page result or nonempty flat string alone certifies a safe complete profile.

Consent declined, feature disabled or capability unavailable means no external transmission and an explicit manual-entry/replacement-file path. Do not fall back silently to a misleading legacy profile. Successful AI extraction may legitimately contain unknown/empty fields; the user supplies corrections in review.

## Input package decision

Select **A: the original PDF**, passed privately through the server to an explicitly verified native visual-PDF endpoint. The file is the minimum representation that preserves its authored layout without adding our own extraction/rendering pipeline. This is an architectural selection, not a claim that an available model has already met it.

| Option | Layout / reliability | Compatibility / cost trade-off | Decision |
| --- | --- | --- | --- |
| A: original PDF | Retains the document and all authored page layouts when consumed visually and completely. | Requires verified native visual PDF support; token cost and limits depend on the endpoint. Avoids a second application-side representation. | Selected target; capability evaluation is mandatory. |
| B: all page renderings/images | Makes page layout explicit, including visual-only resumes. | Image count/resolution/context limits and rendering resources must be measured; potentially greater payload and cost. | Evaluation alternative if A fails RP-110 gates, not an automatic second inference attempt. |
| C: PDF + extracted text | Keeps PDF layout but duplicates content with potentially misleading text order. | Adds payload, precedence questions and extractor dependency. | Not the V1 default. |
| D: renderings + extracted text | Can combine visual layout and searchable hints. | Adds both rendering and extraction complexity; text must not override visual evidence. | Not the V1 default. |

Flattened text alone is rejected. No page/section AI calls, page-by-page AI merge, or deterministic-page + AI-page merge. B, if later explicitly selected, still means all pages in one ordered input package and one extraction outcome.

OpenRouter documents that native file support passes the PDF to the model, while other routes parse it before inference. Therefore an accepted PDF parameter alone is not proof of visual layout understanding. The selected route must prohibit silent text-only/OCR substitution and unapproved parser plugins. All pages must fit the validated endpoint capability; no cropping, hidden page dropping or truncation to make a request succeed. [OpenRouter PDF input documentation](https://openrouter.ai/docs/guides/overview/multimodal/pdfs).

Do not upload a public resume URL or allow arbitrary client URLs/server fetches. Prefer the private original bytes in the attempt, using a neutral transport filename. Server-owned document identity/page count and capability checks must bind the returned evidence to this exact input. Merely asking the model to repeat a page count does not prove complete ingestion.

## Server interface and security

Preferred server module: **Supabase Edge Function -> OpenRouter**. The client supplies its session identity, consent version/attempt identity and bounded PDF bytes. The server owns the request configuration, schema/policy versions, provider permissions, limits and future model identifier; clients cannot substitute a model, endpoint, system instructions, tool list or arbitrary schema.

Store the credential as an **OPENROUTER_API_KEY Edge Function secret**. No `VITE_*` secret, client-side OpenRouter key, service-role key, browser/extension storage, response echo or committed secret file. The function does not need privileged profile writes merely to extract a candidate. Accepted profile saves retain the existing owner-scoped path and RLS. [Supabase secret management](https://supabase.com/docs/guides/functions/secrets).

Require a verified user JWT and server authorization before allocating paid work. Derive identity from verified claims, never a caller-supplied user ID or user-editable metadata. A publishable/anon project key alone is not user authentication. Because current users may be anonymous authenticated sessions, add server-enforced per-identity and global budgets, concurrency limits and abuse controls before enabling the feature; creating more anonymous users must not create unlimited credits. CORS origin checks complement, but do not replace, authentication and authorization. [Supabase function authentication](https://supabase.com/docs/guides/functions/auth).

Admission requires allowlisted format, actual-byte checks, nonempty content, the existing **10 MiB** file ceiling, a readable unencrypted/supported PDF container and required page validity. Distinguish policy rejection from internal parser failure. Reject protected/unreadable inputs safely rather than asking the model to bypass protection. Input is untrusted: do not execute embedded PDF scripts, follow embedded links or obey instructions inside a resume. Inference is extraction-only, with no tools, browsing or actions.

Before deployment, RP-110 must set finite page/context/output limits, request deadline, concurrency and spend quotas appropriate to a measured endpoint. Admission must reject over-budget whole documents instead of splitting them. Resource feasibility is a release gate: Supabase currently documents constrained CPU, memory and request duration; forwarding plus validation must fit those limits. Do not assume a heavy PDF renderer can run in the Edge Function. If A cannot fit, revisit deployment/input design explicitly, not through a hidden worker/rendering implementation here. [Supabase runtime limits](https://supabase.com/docs/guides/functions/limits).

## Fixed extraction candidate, not a second profile

Use a versioned transport envelope with exactly the six existing domain fields and separate evidence. RP-110 will freeze its executable JSON Schema; this ADR does not create a runtime schema or prompt implementation.

| Wire field | Shape and unknown rule | Existing-domain projection |
| --- | --- | --- |
| `name` | Supported string or null. | Null -> existing empty string; require user-supplied name before current confirmation can succeed. |
| `skills` | Array of explicitly supported skill strings; unknown -> []. | Existing string array; any canonical alias mapping must preserve evidence, not add guessed skills. |
| `workExperiences` | Array with supported nonempty title; company/location/dates/duration/description are supported strings or null. | Existing WorkExperience; null optional properties are omitted. Unsupported required title means omit the entry, never invent a role. |
| `education` | School/department/graduationStatus are supported strings or null. | Existing ResumeEducation strings, null -> ''. No invented degree field. |
| `projects` | Supported nonempty name, explicit skills array and nullable description. | Existing ResumeProject; omit null optional description; do not infer missing technologies. |
| `careerDirections` | Explicitly supported stated directions or []. | Existing string array; no speculative career scoring by the model. |

All keys have fixed types; reject additional properties. Nullability is a transport representation, not a change to ResumeProfile. A null collection is invalid; collection absence is represented by []. Missing mandatory envelope/field keys are schema errors, not silently defaulted values. Preserve source spelling, including original date precision; never complete a missing year, employer, degree, skill or project detail. Education remains the existing single-object shape: select an explicitly most-recent supported education only when source chronology establishes it; otherwise use the first source-supported entry. Do not invent rankings or combine unrelated schools/departments.

The application, not the model, owns `id`, `updatedAt`, `level`, `abilities` and parser metadata. Derived display/game values use the existing product rules, not model guesses about professional seniority. Provenance belongs in a separate review envelope, not matching semantics. Existing metadata must not receive fabricated deterministic stages, aliases or section claims simply to fill a field; AI provenance needs its own future approved contract. No database or ResumeProfile schema change is authorized here.

## Evidence and hallucination policy

Require lightweight evidence for every nonempty factual value: an allowlisted field path (including array index), one-based page number and a short source excerpt when available. Page identity is relative to the exact admitted document; reject invalid indices, dangling paths, evidence for nonexistent items and unsupported field paths. Bound evidence counts/excerpt lengths in RP-110.

Evidence is functional personal data for review, not safe diagnostic text. A model-authored excerpt/page claim is a locator to inspect, not independently verified truth. Mark it as unverified unless exact correspondence can be checked against an already available trustworthy source; otherwise the user verifies it against the original page in review. Do not add deterministic reconstruction research to verify it. No hidden reasoning, chain of thought or generic confidence score is requested, persisted or displayed.

Prohibit invented employers/dates, inferred degrees, guessed skills and invented project details. Source instructions such as "ignore the schema" are document data, not authority. Neither JSON validity nor a confident model explanation proves factual accuracy. Unknown/ambiguous facts remain null/[]; absence alone never triggers repeated model calls to fill the gaps.

## Validation and extraction outcomes

Validate in order on the server, with the future client draft adapter validating its input again:

1. Response completeness and provider envelope: successful response, supported content form, no refusal or incomplete/truncated result. Never accept a streaming partial object.
2. JSON and exact versioned schema: one bounded object, fixed keys, strict types, null rules, array limits and no additional properties. No permissive prose stripping, coercion, repair call or partial-profile salvage.
3. Domain projection: required work title/project name, approved empty semantics, bounded strings/arrays and safe mapping to the existing types. Do not enrich unsupported dates or career claims.
4. Structural/evidence correspondence: known document binding, valid pages, valid field paths and complete required evidence coverage. Evidence verification status must remain honest.
5. Produce only an unaccepted candidate plus separate review evidence. No automatic save, matching or automatic confirmation.

OpenRouter's JSON-schema feature is endpoint-dependent and strict enforcement can differ. It does not replace application validation or factual review. Require a proven structured-output endpoint; do not silently route to one without the required capability. [Structured output documentation](https://openrouter.ai/docs/guides/features/structured-outputs).

These are **design-level AI extraction statuses**, not additions to resumeParserCause or ResumeDocumentOutcome in RP-109:

| Status | Meaning / action |
| --- | --- |
| `INVALID_FILE` | Positive admission policy rejection or verified invalid/unreadable supported input; no inference. An unknown internal validation exception is not mislabeled as invalid user data. |
| `AI_REQUEST_FAILED` | Provider/network/deadline/capacity failure; no candidate. Configuration/secret/auth infrastructure faults remain hard failures, not an excuse to call another route. |
| `AI_RESPONSE_INVALID` | Missing/refused/truncated/non-JSON completion or malformed provider envelope; no candidate. |
| `AI_SCHEMA_INVALID` | Parseable response violates schema, domain projection or source/evidence constraints; no candidate. |
| `AI_EXTRACTION_COMPLETED` | All validation passed; candidate is ready for review, not accepted and not proof that every field is present. |

Consent and authorization refusal gate the attempt before these extraction outcomes. Preserve distinguishable safe phase/reason metadata; do not collapse outcomes into PARSE_FAILED or forward vendor error bodies/Error.message. Unexpected application validation defects are HARD_FAILURE even for an otherwise valid PDF. Later cleanup errors cannot overwrite the primary failure; lifecycle handling will need explicit contracts before implementation.

## Review and matching acceptance

Two separate decisions are required: consent to external transmission **before upload**, and confirmation/correction of the candidate **after extraction**. Neither implies the other.

ResumeReview remains mandatory. The unaccepted draft stays in the active client attempt; cancellation/file replacement invalidates it. Bind completion to the active attempt so an older delayed response cannot replace the newly selected resume. The future acceptance interface must distinguish an unaccepted candidate from an accepted profile even though their domain fields use existing types. Revalidate user edits before save.

Only the explicit confirm action invokes the existing accepted-profile persistence flow; only that accepted profile enters matching/ranking. Do not infer confirmation from mounting a review, successful inference, a populated name or a provider completion. Keep any existing accepted profile unchanged when a new attempt fails or is cancelled. Matching and 104/1111 never receive raw files, evidence excerpts, confidence claims or provider-specific fields.

## Privacy, retention and observability

Before any file leaves the browser, disclose that the original PDF (including names, contact information, employment and education) will be sent to the application's server, OpenRouter and the approved downstream inference endpoint. Explain purpose, retention constraints, possible cross-region processing, the cost/retry policy and the manual alternative. Consent must be an affirmative action scoped to that file/attempt and disclosure version; no prechecked permission or reuse from unrelated uploads. Retain only a minimal consent receipt if needed, not document contents.

Current copy requires changes before enabling AI: ResumeStep says parsing stays in the browser and the original file never leaves it; ResumeReview says raw files/full text will not upload; SettingsPage says parsing executes locally. The no-unnecessary-storage promise can remain only with accurate wording distinguishing temporary external processing from accepted-profile persistence. **Privacy copy update required: YES.** No UI copy or interaction is changed here.

Application retention policy:

- PDF bytes, temporary representations, raw model response and evidence remain attempt-local/in-memory only. Do not create a resume Storage bucket, public link, durable queue payload or request/response archive for V1. Release references on completion/cancellation/failure; do not claim secure erasure of vendor memory or runtime buffers.
- The browser may retain the original file and candidate evidence only for the active review. Clear them on replacement/cancel/accept; do not persist them in localStorage or analytics.
- Persist only the user-confirmed existing ResumeProfile through the current product flow. Do not add raw evidence to parsed_data.
- Safe operational telemetry may retain an opaque attempt ID, status/phase/code, schema/policy version, later approved model/endpoint ID, latency and returned usage/cost metadata. No names, contact details, companies/schools, filenames, file hashes, raw text, images, prompts, responses, evidence excerpts or exception messages. Define a short telemetry TTL and access policy before release; billing/security records are separate and disclosed.

OpenRouter's own content logging/use settings and downstream endpoint retention are separate. Its docs describe opt-in content logging, per-endpoint data policies and ZDR routing controls; plugins are outside inference ZDR, and implicit in-memory caching can still occur under ZDR. Therefore **no absolute "nothing is retained anywhere" promise** is made. Require opt-outs from content logging/product use/training and a verified no-training/ZDR inference route before launch; verify file processing, subprocessors, regional handling, deletion/abuse exceptions and cache behavior for that exact route. Unknown policy or no compliant endpoint means the feature remains disabled, not a silent privacy downgrade. [Data collection](https://openrouter.ai/docs/guides/privacy/data-collection), [provider policies](https://openrouter.ai/docs/guides/privacy/provider-logging), [ZDR scope and caching](https://openrouter.ai/docs/guides/features/zdr).

This review used public documentation, not live account settings or legal/vendor agreements. Actual settings, contractual retention and endpoint eligibility still require verification in RP-110 before sending private resumes.

## Cost, retry and caching

One resume analysis attempt permits **one whole-document extraction request**, with **zero automatic application retries** by default. No request per page/field/section, hidden agents, self-repair chain or automatic alternate-model fallback. Future OpenRouter/provider configuration must also bound internal fallback attempts; one application request does not itself prove one upstream invocation. Do not claim exactly-once processing when a timeout leaves provider completion unknown.

Use a server-bound attempt ID to coalesce duplicate clicks/concurrent invocation and track a minimal in-flight admission record without storing the PDF. A duplicate must not issue another paid request; an expired attempt is not automatically resumed. A deliberate retry is a new user-visible, bounded attempt after classifying the failure and checking budget/consent. Never retry schema/domain failures automatically. Numeric caps and retry UX are future contracts.

Content-hash result caching: **not selected for V1**. It would persist sensitive candidates/evidence and needs demonstrated savings, owner isolation, model/schema/policy-version invalidation, consent semantics and deletion/TTL controls. No cross-user cache or content-hash telemetry. In-flight duplicate suppression is not persistent result caching. Provider-side prompt caching remains a separate retention/billing question to verify.

## Follow-up and completion boundary

Recommended next work item: **RP-110 - AI Resume Extraction Contract and Provider Evaluation**.

RP-110 must lock the candidate/evidence and failure contracts, acceptance distinction, admission/consent/privacy gates, exact bounded costs/resources and private-data handling. Evaluate only anonymized or explicitly consented documents, including Traditional Chinese, multi-column/sidebar, sparse text, scanned pages, rotated pages, cross-page chronology, unknown fields and malicious document instructions. Compare original-PDF native visual ingestion against the all-pages-image alternative for completeness, structured JSON reliability, unsupported-fact rate, latency, actual OpenRouter price and usable endpoint availability. This is AI capability evaluation, not renewed deterministic layout research. Do not choose a model in RP-109 or claim a production endpoint has been verified.

Completion of this architecture requires the frozen scope, selected whole-document input/route, server-side secret, fixed existing-domain mapping, validation/non-fabrication rules, review/confirmation, consent/retention and unchanged DOCX/matching boundaries. Those decisions are recorded above. Implementation readiness is separately gated by RP-110 and later explicit authorization.

RP-109 changes documentation only. No new PDF heuristics, domain migration, runtime cause, OpenRouter call, prompt, model choice, Edge Function implementation/deployment, parser switch, UI, matching or job-provider change is authorized. Stop here.
