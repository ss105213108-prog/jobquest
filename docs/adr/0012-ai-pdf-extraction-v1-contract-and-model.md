# AI PDF extraction V1 contract and model selection

Status: Frozen RP-111 contract and documentation-based model selection (2026-09-28). Production implementation and live extraction acceptance are not performed here.

## Decision and authority

`SELECTED_V1_MODEL = openai/gpt-5-mini`. Use the OpenRouter Azure provider route (`provider.only = ["azure"]`, `order = ["azure"]`), not first-party OpenAI, for V1. This is one selected model, not a runtime model fallback list. Gemini is not an automatic alternative.

RP-110 established `MOVE_TO_AI`: a valid real PDF reached PageLayoutEvidence `AVAILABLE` but VisualGroup legally abstained, preventing reliable source representation. Deterministic PDF coverage is frozen. No further deterministic repair, grouping, Reading Order, geometry or semantic migration is authorized. This ADR extends [ADR 0011](0011-whole-document-ai-pdf-resume-parsing.md); RP-110's actual acceptance and RP-111 replace that ADR's historical next-ticket numbering. Historical ADRs remain unchanged.

RP-111 expressly permits official capability evidence plus provider-independent fixtures when no secure live evaluation path is available. There is no OpenRouter client/evaluator in the inspected `src/` or `scripts/` paths. No key was requested, read or wired. Only anonymous local fixtures and unauthenticated public metadata GETs were used. No inference POST, private PDF access/upload, Edge Function, UI, production client or runtime switch occurred.

The executable specification is [the contract harness](../../tests/helpers/aiResumeExtractionContractHarness.ts), exercised by [the contract suite](../../tests/aiResumeExtractionContract.test.ts). It is test-only: passing these tests does not mean production implements these gates, or that an actual model generated the fixture responses. Ajv 8.20.0 is a pinned development dependency, never imported by production.

## Bounded provider evaluation

Only the two ticket candidates were checked. The public model endpoint responses report file/image/text input for both and structured-output parameter support. The current ZDR catalog includes Azure GPT-5 Mini and Google Vertex Gemini 3 Flash endpoints, but not the corresponding first-party OpenAI/AI Studio routes. Their parameter sets support the required response format. This supplies documentation-based route viability, not proof of an authenticated request or the exact native-PDF adapter's live operation. [GPT-5 Mini endpoint metadata](https://openrouter.ai/api/v1/models/openai/gpt-5-mini/endpoints), [Gemini endpoint metadata](https://openrouter.ai/api/v1/models/google/gemini-3-flash-preview/endpoints), [ZDR endpoint catalog](https://openrouter.ai/api/v1/endpoints/zdr).

| Requirement / observation | GPT-5 Mini | Gemini 3 Flash Preview |
| --- | --- | --- |
| Model ID | `openai/gpt-5-mini` | `google/gemini-3-flash-preview` |
| Native file capability | File input advertised; explicitly require native engine | File input advertised; explicitly require native engine |
| JSON schema parameters | Azure advertises `response_format`, `structured_outputs` | Vertex advertises the same |
| Privacy-compatible route | Azure entries appear in ZDR catalog | Vertex entries appear in ZDR catalog |
| Documentation qualification | PASS; selected V1 target | PASS for capability screen; extraction benchmark NOT_NEEDED |
| Traditional Chinese / employer-title-date / education / project accuracy | NOT_MEASURED by inference | NOT_MEASURED by inference |
| Skill false positives / hallucination / evidence accuracy | NOT_MEASURED by inference | NOT_MEASURED by inference |
| Actual extraction latency / token use / cost | NOT_MEASURED | NOT_MEASURED |

Selection rationale: under the ticket's explicitly allowed non-live evaluation mode, GPT-5 Mini has documented file/schema capability and a current privacy-compatible Azure target, with no observed hard disqualification. Preserve the ticket's GPT-first cost rule. Do not select Gemini without a concrete material GPT required-case failure that Gemini demonstrably fixes. No such paired live evidence exists. This is an inference from documentation, **not** an empirical finding that GPT passes all resume-extraction cases. [Official OpenAI model capability](https://developers.openai.com/api/docs/models/gpt-5-mini).

Public pricing snapshot, USD per one million tokens, fetched 2026-09-28:

| Route | Input | Output |
| --- | ---: | ---: |
| GPT-5 Mini / Azure standard | 0.25 | 2.00 |
| GPT-5 Mini / Azure Sweden Central | 0.275 | 2.20 |
| Gemini 3 Flash / Vertex standard | 0.50 | 3.00 |
| Gemini 3 Flash / Vertex flex | 0.25 | 1.50 |

GPT's first-party OpenAI flex listing (0.125 / 1.00) is not the selected ZDR target. Gemini flex can be cheaper than Azure for some token mixes; do not claim GPT is universally cheapest. Provider variants, image/PDF tokens, reasoning, gateway charges and account terms affect totals. Standard Azure's illustrative 5,000 input + 1,000 output tokens cost $0.00325 in model tokens; this is arithmetic, not a measured PDF bill. Listed latency metrics were null and are not converted into zero or guessed timings. Recheck route metadata/pricing before launch. [GPT pricing source](https://openrouter.ai/api/v1/models/openai/gpt-5-mini/endpoints), [Gemini pricing source](https://openrouter.ai/api/v1/models/google/gemini-3-flash-preview/endpoints).

## Whole-document request contract

One attempt carries one admitted original PDF, all required pages, in one extraction request. No page/section/field calls, deterministic shadow, page merging, alternate model, automatic retry or repair prompt. This is one application invocation; exactly-once provider execution is not promised after a network timeout.

Use the OpenRouter chat-completions endpoint, non-streaming, neutral transport filename `resume.pdf`, and a private `data:application/pdf;base64,...` file part. No arbitrary URLs or extracted-text substitution. The schema and system instructions are server-owned. Never accept a client's model, provider, schema, prompt, tool list or secret override.

Required settings:

```json
{
  "model": "openai/gpt-5-mini",
  "stream": false,
  "max_completion_tokens": 8192,
  "provider": {
    "only": ["azure"],
    "order": ["azure"],
    "allow_fallbacks": false,
    "require_parameters": true,
    "zdr": true,
    "data_collection": "deny"
  },
  "plugins": [{"id": "file-parser", "pdf": {"engine": "native"}}]
}
```

Add the harness's exact `response_format: {type: "json_schema", json_schema: {name: "ai_resume_extraction_v1", strict: true, schema: ...}}` and its single system/user pair. No other tools/plugins or prompt transforms. OpenRouter documents explicit native processing and a default parser substitution if no engine is specified, so an omitted/default engine is forbidden. A native route unavailable at call time must fail closed, never switch to OCR/text. [Native PDF configuration](https://openrouter.ai/docs/guides/overview/multimodal/pdfs).

`require_parameters`, `zdr`, data denial and disabled provider fallbacks are mandatory, not soft preferences. Verify the exact usable endpoint supports the entire request, including `max_completion_tokens`; the selected Azure metadata advertises that parameter. [Routing controls](https://openrouter.ai/docs/guides/routing/provider-selection), [completion token parameter](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion), [structured output routing](https://openrouter.ai/docs/guides/features/structured-outputs).

No request gate may bypass actual-byte PDF admission merely because a data URL has the right prefix. The transport fixture is deliberately not a real admission implementation. Preserve the existing 10 MiB ceiling; verify readable PDF structure, server-owned page count, all-page capability, context/output feasibility, deadline, quota and concurrency before transmission. RP-112 must implement these operational gates, not infer them from a model's echoed page count. Reject over-budget whole documents rather than splitting, cropping or dropping pages.

## Versioned extraction and existing domain projection

Envelope: exactly `schemaVersion`, `candidate`, `evidence`. Version: `AI_RESUME_EXTRACTION_V1`. Every object rejects additional properties and requires all its wire keys. No coercion, default insertion, prose stripping, JSON repair or partial salvage. The schema is executable through Ajv with those permissive options disabled.

Candidate has exactly the existing six domain fields from [ResumeProfile](../../src/types/index.ts):

| Field | Wire unknown | Existing-domain projection |
| --- | --- | --- |
| `name` | null | Empty string; user must supply a name before confirmation |
| `skills` | [] | Existing string array; preserve supported source spelling |
| `workExperiences` | [] | Existing work array; required supported nonblank title; nullable company/location/startDate/endDate/durationText/description become omitted optional properties |
| `education` | Each school/department/graduationStatus null | Existing single object; null becomes empty string |
| `projects` | [] | Existing project array; supported nonblank name and skills array; null description omitted |
| `careerDirections` | [] | Only explicit supported directions, never inferred suitability |

Education is not changed to an array. Multiple source entries are a required evaluation case: select the most recent only when chronology is explicit, otherwise the first source-supported entry. Do not merge schools/departments or invent a degree. Model unknowns must be explicit null/[]; missing keys, null collections and unsupported required item identifiers are invalid. An unsupported work/project entry must be omitted at extraction, not salvaged after validation.

Keep original date precision, including year-only or open-ended dates. Do not calculate an unstated duration, infer certification, enrich skills or guess a career fact. IDs, timestamps, levels, abilities and parser metadata are application-owned and forbidden in the model schema. `ResumeProfileV2` is not created. The projection is a typed `Pick<ResumeProfile, ...>`; application-owned fields remain separate.

V1 output limits: factual strings 2,000 Unicode characters under JSON Schema validation; each string collection at most 100 items; work and project arrays at most 20 each; evidence at most 300 entries; excerpt at most 240 Unicode characters; field path at most 128; complete response content at most 65,536 UTF-8 bytes. Oversize or output truncation is failure, never partial acceptance. These are transport/security bounds, not new PDF/layout heuristics.

## Evidence, hallucination and validation

Every non-null factual leaf needs evidence `{field, pageNumber, excerpt}`. `field` is an allowlisted JSON Pointer to that exact candidate leaf, including each array index. Pages must be positive integers within the server-bound document page count; excerpts must be nonblank and short. Reject dangling paths, evidence for unknown/null fields, unsupported fields, duplicate identical witnesses and incomplete fact coverage. More than one page may support a field. No chain-of-thought, hidden reasoning or confidence score.

Evidence is unverified review support. Structural validation cannot detect a fabricated but plausible excerpt. Tests explicitly distinguish: unbacked facts fail missing-evidence validation; fabricated factual values/references fail the independent anonymous ground-truth oracle; plausible self-authored evidence alone does not certify truth and cannot bypass ResumeReview. The oracle is evaluation-only and is not a proposed deterministic verifier for private resumes.

Validation order:

1. Approved file/attempt admission and provider HTTP/in-band error classification.
2. OpenRouter envelope: bound model/provider, one assistant choice, complete `stop` finish, string content, no refusal, tools or parsed-file annotations. Reject incomplete, multipart or truncated results.
3. Parse exactly one bounded JSON object, then validate the strict schema.
4. Domain invariants and existing-field projection.
5. Evidence/page/field coverage against the server-owned attempt/document context.
6. Emit only an unaccepted, evidence-unverified review candidate.

Server response association is owned by the active request context, not model-provided identity. A response for a replaced attempt cannot be reviewed/accepted into the new attempt. Production must preserve this binding in RP-112.

Distinct statuses: `INVALID_FILE`, `AI_REQUEST_FAILED`, `AI_RESPONSE_INVALID`, `AI_SCHEMA_INVALID`, `AI_EXTRACTION_COMPLETED`. Unknown admission is not an invalid-file assertion. DOCX is not an AI input. Preserve safe phase/reason codes; do not use `PARSE_FAILED`, deterministic causes, vendor error text or a cleanup error to overwrite the primary cause.

## Privacy and confirmation

Before transmission, require explicit affirmative consent bound to this attempt, document and disclosure version `AI_PDF_CONSENT_V1`. Authentication is not consent. Validate exact native-PDF route, all-page capability and account logging opt-outs. Missing/unknown privacy capability blocks transmission. No client-side `OPENROUTER_API_KEY`; future server-only secret handling belongs to RP-112.

Use `provider.zdr=true` and `provider.data_collection="deny"`. ZDR applies to inference endpoint routing, not all enabled plugins/tools; even ZDR can permit in-memory implicit caching. Native-only file transport and no additional plugins avoid intentional OCR vendors, but these controls are not a blanket guarantee covering every transit/subprocessor. Verify native transport retention and exact account/endpoint terms before launch; no absolute "nothing retained anywhere" claim. [ZDR scope and caching](https://openrouter.ai/docs/guides/features/zdr).

Application prompts, PDF bytes, response payloads and evidence remain active-attempt memory only, never logs, analytics, localStorage, Storage, queues or a result cache. Explicitly keep OpenRouter private content logging and input/output-use opt-ins disabled; account settings were not accessed or verified in RP-111. Retain only necessary allowlisted operational metadata. [OpenRouter logging/use defaults](https://openrouter.ai/docs/guides/privacy/data-collection).

Diagnostics permit opaque attempt ID, allowlisted status/code, approved model/provider ID, finite nonnegative latency/cost, safe integer token/page counts and schema status. Never include PDF bytes, raw text, field values, excerpts, filenames, document hashes or exception messages. Evidence belongs only in active review.

Extraction completion is not acceptance. User review/correction plus explicit confirmation produces the accepted existing domain snapshot; only that snapshot may enter persistence/matching. A nonempty name, mounted review or successful schema does not count as confirmation. Revalidate edits; reject stale attempts. Clear attempt payloads on cancel/replacement/accept and leave an existing accepted profile unchanged if the new attempt fails. Existing DOCX, matching, runtime parser, 104 and 1111 are unchanged.

## Verification, limits and next action

The anonymous corpus covers full bilingual extraction, unknowns, multiple work/education cases, projects, source precision, employer/title/date association, unsupported facts, evidence bounds, malformed/provider errors, schema rejection, consent/routing downgrades, request/retry/privacy policy and explicit review-to-matching boundaries. Fixture responses are manually authored, not inference results. No model accuracy, false-positive rate, latency or real cost is claimed from their PASS count.

Verification: RP-111 146/146 PASS; independent strict test-only TypeScript compile PASS; app TypeScript and production build PASS. Full suite: 1,468 PASS / 5 unchanged known reconstruction FAIL (Two-column, Sidebar, Same-Y separate columns, Split CJK heading, Public PDF parser reproduction). Existing production source and existing tests are preserved; only the new test/harness/ADR and pinned Ajv development dependency/lock entries change in RP-111. The build retains its existing large-chunk warning.

The selected model is frozen for V1 under the approved documentation-based evaluation mode. Empirical Traditional Chinese quality, all-page native ingestion, exact Azure/OpenRouter adapter operation, account eligibility, live schema enforcement, latency and cost remain **NOT_MEASURED**. They are mandatory enablement checks for RP-112's first securely integrated anonymous call, not grounds to invent PASS evidence or expand deterministic research. No unverified route may process a private resume.

Next work item: **RP-112 - Supabase Edge Function OpenRouter AI PDF Resume Parser**. Implement only after explicit authorization. Keep the one-model choice and fail-closed privacy/review contract; do not silently introduce Gemini or deterministic fallback. Resume Parsing freezes no later than RP-114. Stop RP-111 here; no Edge Function, upload UI, consent UI, review wiring or provider integration is implemented.
