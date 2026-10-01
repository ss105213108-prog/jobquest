# JOBQUEST REAL 104 TAIWAN REGION SUPPORT DESIGN

2026-09-29 · Observe → Reproduce → Root Cause → Dependency Map → Design → STOP

Recommended next action: **BLOCKED_REGION_MAPPING_EVIDENCE**.

**EXTERNAL_104_REGION_MAPPING_REQUIRED**: repository evidence establishes only
台中市 → `6001008000`. No other city/county code is added or guessed here.
The design is complete; the complete 22-region implementation is not yet
approvable from the available mapping evidence. This is not a Connector repair.

## 1. Observe: dropdown and user symptom

**LOCATION_OPTION_SOURCE**:
`src/components/search/SearchPanel.tsx:38`, four hard-coded JSX option labels.
They are not generated from an enum, preferences schema or the 104 mapping.

**CURRENT_SUPPORTED_OPTIONS** must distinguish selectable UI from supported REAL:

| UI option | REAL 104 search with a nonempty keyword | Mapping |
| --- | --- | --- |
| 全部地區 | blocked | absent |
| 台中市 | URL can be built; existing accepted flow | 6001008000 |
| 台北市 | blocked | absent |
| 新竹市 | blocked | absent |

`SearchPreference.location` is a string (`src/types/index.ts:130`); its type
does not establish REAL search capability. Local Demo separately filters existing
fixture job location strings and treats 全部地區 as no local location filter.
That Demo behavior does not prove REAL regional support.

## 2. Reproduce: exact four-region behavior

A temporary callback probe exercised actual BoardPage SearchPanel.onSearch and
the actual URL builder, with only React state and window.open replaced by
deterministic test ports. This was not a browser test. Nonempty keyword was
前端工程師 for all four cases, isolating the location variable.

**TAICHUNG_PATH**:
SearchPanel submit/quick search → BoardPage.search (`:128`) → open104Search
(`:86`) → build104SearchUrl (`:94`) → mapping hit → normal public URL →
onRealSearch → window.open (`:96`) → explicit onPreferenceChange (`:97`).

**TAIPEI_PATH**, **HSINCHU_PATH**, **ALL_REGION_PATH**:
same path until get104AreaCode returns null → builder throws
`此地區尚未完成 104 Connector 驗證。` → Board catch/setError (`:99`) →
ErrorState (`:147`) renders `任務傳令暫時中斷` plus the thrown message.
No external window opens, no onRealSearch callback occurs and no preference save
callback occurs. Board does set its local preference before the builder; this
failed local selection is not the same as a saved preference.

Empty keyword throws `請輸入 104 職缺關鍵字。` before checking location. Thus
testing a default empty keyword would mask the regional failure.

Existing command: `npx.cmd vitest run tests/job104Integration.test.ts`:
**11 tests PASS**, including an explicit assertion of the Taipei rejection.
PASS confirms the current restriction, not that Taipei works.

The temporary probe additionally observed both exact UI error strings on the
actual Board path for Taipei, Hsinchu and 全部地區. The full investigation run
was **7 files / 114 tests PASS**: temporary probe, existing 104 integration,
preferences repository/controller, REAL104 matching and session regressions.
The probe was copied to the task-specific temporary evidence folder and removed
from tests. No permanent test or production file is changed in this work item.

## 3. Root cause and guard evidence

Investigated hypotheses:

1. JobQuest mapping permits only the previously verified city: **confirmed**.
2. Formal Connector has a city allowlist: **not found; disproved by its guards**.
3. Import search-condition comparison rejects absent mappings: **confirmed as a
   second guard**, but Taipei's search-opening error occurs earlier in hypothesis 1.

**REGION_GUARD_EXISTS = YES**.

**REGION_GUARD_LOCATION**:

- `src/integrations/job104/locationMap.ts:1–14`: get104AreaCode/isSupported104Location
  use own keys of a one-entry map.
- `build104SearchUrl.ts:10–11`: null mapping throws before navigation.
- `build104SearchUrl.ts:20–24`: payloadMatches104Search returns false without a
  mapping; otherwise compares captured source URL keyword and exact area.
- `src/services/connectorJobService.ts:20`: import mismatch fails before
  normalization or Matching. Manually opening Taipei in 104 would not bypass it.

**CURRENT_ALLOWLIST = 台中市 only**.
**WHY_TAICHUNG_WORKS**: verified mapping exists, supported by Phase 6A/6B public
search audit and Phase 6C/mainline integration evidence.
**WHY_TAIPEI_BLOCKS**: no mapping entry, despite the UI offering Taipei.
The error mentions Connector verification but is thrown by application code,
before the formal Connector captures anything. It is not an observed network outage.

## 4. URL builder and mapping provenance

**SEARCH_URL_BUILDER = src/integrations/job104/build104SearchUrl.ts:6–16**.
It trims/requires keyword, resolves a city label to area code, constructs
`https://www.104.com.tw/jobs/search/`, and uses URLSearchParams for `area` and
`keyword`. It does not send the city display name as area or use city route segments.

**REGION_MAPPING_SOURCE = src/integrations/job104/locationMap.ts**.
**CURRENT_REGION_MAPPING = { 台中市: '6001008000' }**.

Evidence provenance:

- `docs/phase-6a-104-technical-audit.md:46–54`: public search URL, area/display-name
  relation; explicitly warns against using display text as the request value.
- `docs/phase-6b-104-browser-connector-audit.md:18`: only audited search was
  前端工程師/台中市.
- `docs/phase-6c-104-browser-connector-integration.md:25`: only Taichung verified.
- `tests/job104Integration.test.ts:47–50`: one-entry map and rejection of Taipei.
- `docs/jobquest-real-104-manual-integration.md:104–123`: official extension path
  and current supported/unsupported search contract.

Targeted repository search over src, browser-extension, experiments, docs and tests
found no proven additional city/county mappings. Mock job location labels and
normalization fixtures are not area-code evidence. No external 104 lookup, browser
inspection, private API access or invented enumeration was performed.

**EXTERNAL_MAPPING_REQUIRED = YES**. Before implementation, obtain authoritative
104 public region-selection evidence for each missing city/county: exact displayed
label, actual resulting search URL/area value, provenance/date, and confirmation
that the selection is the whole city/county rather than a district or composite
filter. Use public 104 UI/official material; do not derive codes from ordering,
arithmetic patterns, scraped third-party lists or unlabeled numeric values.
The unrestricted-search URL semantics also need public evidence.

## 5. Connector dependency: official extension versus old experiment

**CONNECTOR_REGION_DEPENDENCY = A**, reads the active public search page; no
JobQuest region metadata is passed to the extension.
**CONNECTOR_CHANGE_REQUIRED = NO** based on inspected formal source.

Official accepted extension: `browser-extension/jobquest-104-connector/`.

| Boundary | Actual check |
| --- | --- |
| popup.js:5–11 | HTTPS, www.104.com.tw, /jobs/search/; no keyword/area allowlist |
| capture-jobs.js:74–93 | same host/path, captures current sourceUrl and visible cards |
| capture-jobs.js:52–59 | finds each card's location link by the presence of an area query parameter, reads its text; no city code comparison |
| service-worker.js:20–30 | payload version/source, public search host/path, bounded jobs, canonical IDs/URLs; no selected-city metadata |
| manifest.json/app-bridge.js | activeTab/scripting/storage and existing localhost bridge origin; no city restriction |
| app connectorClient.ts/schema.ts | bridge/schema/TTL/identity validation, no city allowlist |

VM probes on the unmodified popup and worker accept a structurally valid public
search URL with keyword but no area. This proves absence of their regional guard;
it does not prove what the live 104 unrestricted results page means.

`experiments/104-browser-connector/popup.js:6–8` DOES contain fixed audit keyword
and EXPECTED_AREA. That early Phase 6B experiment is not the formal extension
loaded by the documented accepted mainline. Do not change it to fix this issue.
Installed-user extension identity was not inspected live in this work item; the
source diagnosis targets the documented formal extension. No extension reload,
permission, capture, bridge, payload version, limit or TTL change is proposed.

## 6. Normalization, Matching, preferences and restore dependencies

**NORMALIZATION_REGION_DEPENDENCY = NO**.
**NORMALIZATION_CHANGE_REQUIRED = NO**.

`normalize104CapturedJob.ts:14` copies capture.location. Its other fields use
the same canonical ID/URL and title/snippet skill logic regardless of region.
App capture schema requires nonempty location text, without city membership.
Synthetic Taipei, county, eastern and offshore location text probes produce the
same normalized job except the location field. They do not prove live DOM capture
for those cities. Actual search-page/card availability stays a future manual gate.

Matching receives these existing normalized Jobs and the confirmed ResumeProfile;
no selected-region scoring rule is added. Different search results can naturally
have different scores. Regression must compare identical job/resume inputs rather
than require scores from different city searches to be equal.

**JOB_PREFERENCES_SCHEMA_CHANGE_REQUIRED = NO**.
**DATABASE_MIGRATION_REQUIRED = NO**.

`SearchPreference.location: string`, DB `location text not null default ''`
(`supabase/migrations/20260919114039_create_job_quest_user_data.sql:21`), and
generated database types already accept string display labels. Repository
upsert/getCurrent (`preferenceRepository.ts:10,17`) writes/reads the label;
empty stored text retains its existing 全部地區 fallback. No location enum/code
or four-city DB check exists in inspected migrations. Persistence source/owner,
save triggers, ordering, restore, error/retry and no-navigation-on-restore stay intact.
No cloud schema drift or user rows were queried; those live facts are NOT VERIFIED.

**Indirect frozen session dependency**: `real104Session.ts:56` calls the URL
builder when validating a normalized snapshot. Enlarging builder support affects
which region snapshots can restore even if session code remains byte-for-byte
unchanged. Add new-region/unrestricted session tests alongside unchanged TTL,
10-job limit, version, corrupt handling, Real/Demo selection and explicit actions.
Do not change session storage semantics, shape or validator implementation.

## 7. 全部地區: current versus proposed meaning

**CURRENT SEMANTICS**:

- UI/default/preferences: a string display value, restored as the existing fallback.
- Demo/database-backed job search: no location filter on that existing data source.
- REAL104: no mapping; a nonempty-keyword search is blocked, and an unrestricted
  captured payload cannot match this preference. It currently performs no
  all-Taiwan scrape, page visits or bulk crawling.

**PROPOSED V1 SEMANTICS = 不限地區搜尋條件**.
One explicit action opens the ordinary public 104 keyword search with no location
restriction. Candidate representation: omit area entirely, subject to verification
of actual 104 public behavior before enabling it. Do not use area='全部地區',
reuse Taichung's code, guess a nationwide code, or simulate 22 requests.

The label means no regional filter, not guaranteed results from every county or
guaranteed Taiwan-only results. Do not add hidden domestic/overseas filtering.
Normal Connector still captures only the current visible page, at most 10 jobs,
and only on user action. No automatic navigation, capture, pagination or accumulation.

Future payload comparison must distinguish unrestricted from a selected area.
Initially require the verified no-area URL shape; reject a captured area-restricted
page for 全部地區, reject unrestricted capture for a specific city, and preserve
keyword matching. Do not wildcard-accept arbitrary area payloads. Accept empty
area or other equivalent encodings only if authoritative evidence proves them;
otherwise fail explicitly. This shared comparison is separate from card location text.

## 8. Canonical region configuration and capability design

Keep one canonical configuration inside existing
`src/integrations/job104/locationMap.ts`, with all 23 labels. Existing string labels
remain stable option values and persistence values, avoiding an unnecessary domain
ID/enum migration. Existing get104AreaCode/isSupported104Location exports can remain
compatibility helpers, but unrestricted support requires a mapping-aware resolver:
null area alone cannot distinguish unsupported from a valid unrestricted search.

Conceptual shape (design only):

```ts
type SearchMapping = { kind: 'area'; areaCode: string } | { kind: 'unrestricted' }
type RegionOption =
  | { label: string; capability: 'verified'; searchMapping: SearchMapping }
  | { label: string; capability: 'pending-evidence'; searchMapping?: SearchMapping }
```

`supported` is derived from capability, not another independently mutable flag.
Known numeric mapping alone is not a claim of live Connector/manual acceptance.
Provenance belongs in the mapping evidence document/tests, not in visible product
controls. The builder and payload comparator resolve the same entry; SearchPanel
uses that list instead of its own hard-coded names. Board supplies REAL104
capability context so Demo/1111 behavior is not mistakenly governed by REAL104
verification. Do not redesign other-source search behavior in this work item.

Evidence state TODAY (not an implemented configuration):

| Label | Mapping evidence | REAL capability |
| --- | --- | --- |
| 全部地區 | unrestricted semantics pending public verification | pending-evidence |
| 台北市 | missing | pending-evidence |
| 新北市 | missing | pending-evidence |
| 桃園市 | missing | pending-evidence |
| 台中市 | 6001008000 | verified existing flow |
| 台南市 | missing | pending-evidence |
| 高雄市 | missing | pending-evidence |
| 基隆市 | missing | pending-evidence |
| 新竹市 | missing | pending-evidence |
| 嘉義市 | missing | pending-evidence |
| 新竹縣 | missing | pending-evidence |
| 苗栗縣 | missing | pending-evidence |
| 彰化縣 | missing | pending-evidence |
| 南投縣 | missing | pending-evidence |
| 雲林縣 | missing | pending-evidence |
| 嘉義縣 | missing | pending-evidence |
| 屏東縣 | missing | pending-evidence |
| 宜蘭縣 | missing | pending-evidence |
| 花蓮縣 | missing | pending-evidence |
| 台東縣 | missing | pending-evidence |
| 澎湖縣 | missing | pending-evidence |
| 金門縣 | missing | pending-evidence |
| 連江縣 | missing | pending-evidence |

Do not release a selectable 22-city UI claiming complete support with this evidence
state. If an explicitly approved interim UI ever shows the complete list, pending
entries must be visibly labeled 待驗證 and unavailable for REAL104 submission.
Show an explanatory capability message before navigation/import, not a fake
connector outage. A restored pending/unknown location must retain its exact value
and be shown as unavailable; never silently change it to Taichung/全部地區 or
rewrite the saved preference. Disable/guard both submit and quick search for it.
Keep builder/import checks as defense in depth against stale or bypassed UI state.

Complete V1 is ready only after all 22 mappings plus unrestricted semantics have
evidence and the representative user browser gates pass. Pending options are an
honest capability state, not completion of the requested complete support.

## 9. Target flow, future tests and approval boundary

User selection → canonical verified search mapping → explicit normal 104 public
navigation → unchanged formal Connector active-page capture → existing payload
validation → shared keyword/location comparison → unchanged normalizer → unchanged
Matching → existing Board and original canonical job links.

No city-specific branches outside the shared mapping unless new reproducible
evidence shows them necessary. Do not weaken URL host/path, identity, origin,
TTL, job limit, keyword matching or Real/Demo isolation.

Expected implementation files, only after evidence and dedicated approval:

| File | Scope |
| --- | --- |
| src/integrations/job104/locationMap.ts | single complete evidenced config, capability and compatible resolver helpers |
| src/integrations/job104/build104SearchUrl.ts | verified area/unrestricted URLs and matching comparison using same resolver |
| src/components/search/SearchPanel.tsx | shared option list and explicit REAL capability feedback; preserve submit/quick-search patterns |
| src/pages/BoardPage.tsx | narrow search capability preflight/context only, no scoring/import lifecycle refactor |
| focused region/104/preference/session tests | all mapping rows, unrestricted mismatch matrix, pending options, preserved restore semantics |
| docs region evidence/design implementation report | mapping provenance and manual acceptance status |

Files that must remain unchanged: formal browser-extension capture/popup/worker/
bridge/manifest, normalization/schema/DTO, Matching, preferences repository/service/
controller/hooks/schema, real104Session implementation, Resume/Project tools and
confirmed persistence, Auth, job actions/snapshots, AI and PDF.

**FROZEN_DEPENDENCY_CONFLICT = YES, narrow application integration boundary**:
the accepted single-city app mapping, URL builder and payload-search comparison
need an explicitly authorized extension, plus search UI/preflight. This dedicated
design does not authorize production edits. Formal Connector internals are not
the blocker, so no Connector freeze exception is justified or proposed. Session
behavior is an indirect shared-builder dependency to test, not a request to edit
its frozen implementation. Preferences persistence semantics need no exception.

Future automated design:

1. Exactly 22 county/city labels plus 全部地區; no duplicates or unproven codes.
2. Every evidenced city maps to its proven area, with keyword encoding preserved;
   unrestricted omits area only under its proven contract.
3. Correct keyword/area matches; wrong city/keyword, unknown/pending selections,
   restricted-versus-unrestricted and unverified alternate shapes fail explicitly.
4. REAL option capability is visible and enforced for submit and quick search;
   persisted unavailable values are preserved without autosave/navigation/import.
5. Label preferences round-trip for all 23 choices through unchanged mapping,
   owner lifecycle and fresh controller; no code/enum migration.
6. Region/unrestricted snapshots restore via unchanged session code and retain
   TTL/version/limit/corruption behavior; no auto external navigation/capture.
7. Synthetic varied location text passes unchanged capture schema/normalizer;
   canonical original links and same-job/same-resume Matching results remain equal.
8. Existing accepted Taichung and no-fallback Real/Demo paths regress unchanged.
9. TypeScript/build and frozen source preservation checks after future implementation.

## 10. Future user manual acceptance — NOT PERFORMED

| Gate | User check after implementation approval |
| --- | --- |
| A | 台北市 public search selection/URL correct → formal Connector captures → import/match works |
| B | 新北市 same flow |
| C | 桃園市 same flow |
| D | 台中市 existing accepted flow remains functional |
| E | 台南市 same flow |
| F | 高雄市 same flow |
| G | 彰化縣 or 新竹縣 county flow, no district/code confusion |
| H | 花蓮縣 / 台東縣 / 金門縣 eastern/offshore example |
| I | 全部地區 truly has no location restriction under the evidenced public search contract; one page/user capture only |
| J | explicit preference save → F5 shows exact selected label; restore does not open 104 or import automatically |
| K | unchanged Matching behavior for identical confirmed resume/job inputs; ordinary different-job score differences allowed |
| L | original 104 links retain each captured externalId and canonical job URL |

A–H are representative flow gates, not proof of missing region mappings. All 22
mapping evidence entries remain required; verify the actual public region selection
for each entry, and record live regional capture results honestly. Empty job results
are not a wrong mapping or proof of capture success; choose a suitable public
keyword manually where needed. No automatic multi-region test crawler is proposed.

## Required report

| Item | Result |
| --- | --- |
| Current location options source | hard-coded SearchPanel.tsx:38, four UI labels |
| Current region guard | locationMap plus URL builder / captured-search comparison |
| Why Taichung works | only verified mapping 6001008000 |
| Why Taipei blocks | absent map → local builder throws before Connector/navigation |
| 104 search URL builder | build104SearchUrl.ts, public /jobs/search/ + area + keyword |
| Region mapping source | locationMap.ts; backed only by Taichung audit/fixture evidence |
| External mapping required | YES — EXTERNAL_104_REGION_MAPPING_REQUIRED |
| Connector region dependency | active public page capture; no selected-city allowlist in formal extension |
| Connector change required | NO |
| Normalization change required | NO |
| Job Preferences schema change required | NO |
| Database migration required | NO |
| 全部地區 current semantics | UI/default text; unrestricted in Demo, blocked in REAL104 |
| 全部地區 proposed semantics | 不限地區搜尋條件; one normal public search, no crawling |
| Can all 22 regions be supported safely | NO with current evidence; architecture can extend after evidence/approval |
| Canonical region config proposal | stable label + verified/pending capability + area/unrestricted mapping |
| Expected implementation files | existing mapping/builder/search UI/Board preflight; focused tests/docs only |
| Frozen dependency conflict | YES, app mapping/search-validation boundary only; no Connector-internal exception |
| Recommended next action | BLOCKED_REGION_MAPPING_EVIDENCE |

Verification: 114 investigation/regression tests PASS. No TypeScript/build rerun
is needed for a documentation-only result. SHA-256 scope comparison confirms no
existing production/test/config/document changes, only this design added.
Temporary probe/evidence retained outside the workspace under
`%TEMP%\jobquest-taiwan-region-design-fea071f8\`.

**STOP — design only; no production or Connector edits, no codes guessed, no
final browser acceptance, login/register, 40-job import or freeze.**
