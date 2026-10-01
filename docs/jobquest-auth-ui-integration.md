# AUTH UI INTEGRATION

2026-09-29 — **BLOCKED_AUTH_UI_INTEGRATION — STOP**

Auth startup and visible account flows are implemented. Focused automated verification passes, but the full suite has one new failure. The user's `Any NEW failure: STOP` rule was applied immediately after identifying it: no correction, further implementation, or browser acceptance was performed. This report does not declare final product acceptance.

## Files changed

Existing files:

- `src/main.tsx`: places the product inside the Auth gateway.
- `src/hooks/useAuth.ts`: supplies the existing persistence seams with the gateway's single Auth context.
- `src/services/authService.ts`: restores session plus fresh server user without creating Guest, shares only in-flight reads, invalidates reads on Auth events, and provides explicit Guest entry/exit and checked partial-upgrade continuation.
- `tests/anonymousAuthReuse.test.ts`: updates startup expectations to the approved no-auto-Guest contract; retains reuse/error/retry/subscription coverage and adds stale-read/identity guards.

New files:

- `src/components/auth/AuthGateway.tsx`: Landing, login/register/upgrade forms, account indicator, switch/exit confirmation, and an owner-keyed product boundary.
- `src/components/auth/auth.css`: account UI in the existing guild colors and parchment style.
- `src/services/authIntegration.ts`: serialized account actions, safe user projection, input confirmation, Auth event reconciliation, and same-UID upgrade handling.
- `src/services/authIntegrationStorage.ts`: owner-scoped working cache sidecar and a pending-upgrade marker containing only version, UID and canonical username.
- `tests/authUiIntegration.test.tsx`: 34 focused automated integration/UI cases using mocked normal Auth SDK methods and static React rendering.
- `docs/jobquest-auth-ui-integration.md`: this report.

## Automated flow results

These PASS labels mean focused automated checks, not live service or browser acceptance.

| Requirement | Result | Evidence |
|---|---|---|
| Auth Landing | PASS | No session renders 登入 / 註冊 / 先以訪客試用; no anonymous mutation occurs on startup. |
| Permanent-session startup | PASS | Valid session plus fresh server user enters the product. |
| Anonymous-session startup | PASS | Existing Guest UID enters the product without creating another Guest. |
| Register | PASS | Foundation registration, format/password/confirmation checks, product entry. |
| Login | PASS | Foundation login, neutral invalid-credentials error, successful product entry. |
| Guest entry | PASS | Explicit button invokes anonymous sign-in; Guest indicator is shown. |
| Guest → account upgrade | PASS | Calls existing foundation; identity-link event alone does not display completed upgrade. |
| Same UID preserved | PASS | UID and React product key remain equal; same-owner working snapshot is retained. |
| Duplicate username | PASS | Original Guest UID, product key and cache retained; no login, signout, merge or deletion. |
| Existing-account login warning | PASS | Explicit warning and confirmation are required before Guest session replacement; failed credentials retain Guest. |
| Logout behavior | PASS | Guest requires confirmation; permanent logout returns Landing; no automatic Guest creation. |
| Synthetic identifier hidden | PASS | UI renders safe username/Guest projection; identifiers, UID and raw provider errors are not rendered. |
| Real PII requested | NO | Auth forms request only 帳號 / 密碼 / 確認密碼. Existing resume fields were not changed. |
| Schema changed | NO | No migration or remote schema action. |
| RLS changed | NO | No policy or authorization model change. |

## Ownership and partial outcomes

Same-UID upgrades keep the product subtree mounted. A different UID remounts the product so Guest drafts, preferences, statuses and view state cannot be carried into the existing account. Account forms and busy actions make the product inert; Auth events remove access to an old owner immediately, and additional SDK reads run outside the event callback. Already submitted persistence requests cannot be retroactively cancelled; they are never replayed under a new UID. Exit and switch warnings explicitly tell users that in-flight save results may still be unconfirmed and that drafts are not automatically saved.

The unchanged REAL 104 working snapshot format has no owner field. The integration adds a separate UID sidecar. Same-owner F5 and upgrade retain the snapshot. UID change, logout, or an existing snapshot with no ownership sidecar clears only `jobQuest.real104Session.v1`; unrelated storage and cloud rows remain intact. The UI explains that the public working list must be reimported. This conservative initial handling does not infer ownership of legacy cache data.

A marker is written before upgrade and survives F5 without storing a password or token. A partially linked identity is displayed as pending; the user must reenter the password. Continuation uses normal SDK password update only after fresh session/server checks prove the original UID, exact foundation-derived identity, confirmation and no pending identity change. Mismatched-owner markers cannot authorize password updates. Credential readiness after an ordinary restored permanent session remains unknown; the UI does not promise account recovery or claim a fresh password login was verified.

No live users were created or changed for this work. These are mocked automated checks; actual same-UID data preservation and browser behavior remain USER acceptance items.

## Verification

Bundled Node runtime was used. No dependencies, project settings or Auth configuration were changed.

| Check | Result |
|---|---|
| Focused Auth/UI + existing Auth | **107/107 PASS**: UI integration 34, startup reuse 10, foundation 63. |
| Relevant regressions | **189/189 PASS** across 9 files: confirmed resume, preferences, actions, snapshots, REAL 104 session and regression, ghost saved-job regression, 104 integration, Matching. |
| Full suite | **2188 PASS / 6 FAIL**, 76 files (74 passed / 2 failed). |
| Known PDF baseline failures | **SAME**: all five names and complete failure messages exactly match the documented baseline JSON. |
| New regressions | **1**, detailed below. |
| Source typecheck | **PASS**. |
| Strict typecheck of new/updated Auth tests and imported modules | **PASS**. |
| Production build | **PASS**; existing >500 kB bundle warning remains. |
| Browser / final product acceptance | **NOT VERIFIED**; reserved for USER as instructed. |

Commands:

```text
node node_modules/vitest/vitest.mjs run tests/authUiIntegration.test.tsx tests/anonymousAuthReuse.test.ts tests/usernameAuthFoundation.test.ts --reporter=json --outputFile <targeted-report>
node node_modules/vitest/vitest.mjs run tests/confirmedResumePersistence.test.ts tests/jobPreferencePersistence.test.ts tests/jobActionPersistence.test.ts tests/jobSnapshotPersistence.test.ts tests/real104Session.test.ts tests/real104SessionRegression.test.tsx tests/ghostSavedJobRegression.test.tsx tests/job104Integration.test.ts tests/matchingEngine.test.ts --reporter=json --outputFile <regression-report>
node node_modules/vitest/vitest.mjs run --reporter=json --outputFile <full-report>
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json --pretty false
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --module ESNext --moduleResolution Bundler --target ES2022 --jsx react-jsx --lib ES2022,DOM --skipLibCheck src/vite-env.d.ts tests/authUiIntegration.test.tsx tests/anonymousAuthReuse.test.ts
node node_modules/vite/bin/vite.js build
```

JSON reports:

- `C:\Users\user\AppData\Local\Temp\jobquest-auth-ui-targeted-tests.json`
- `C:\Users\user\AppData\Local\Temp\jobquest-auth-ui-regression-tests.json`
- `C:\Users\user\AppData\Local\Temp\jobquest-auth-ui-full-tests.json`
- Comparison baseline: `C:\Users\user\AppData\Local\Temp\jobquest-auth-foundation-baseline-tests.json`

### New failure and STOP

File: `tests/manualAcceptanceFlow.test.tsx`.

Test: `manual acceptance local adapters and confirmation state keeps matching gated until explicit confirmation`.

Failure: `Error: JobQuest requires its Auth boundary.` at `src/hooks/useAuth.ts:9`, called by `src/App.tsx:25`.

Read-only investigation confirms that this existing test statically renders `<App />` directly without the newly required Auth provider. It fails before reaching its assertions about explicit resume confirmation. The production entry now supplies that provider, but this is still a new full-suite regression and cannot be waived or described as green.

No correction was attempted after discovery. A follow-up correction would need to make this existing test exercise the approved Auth boundary or a controlled provider while preserving its original no-auto-confirmation/no-network assertions, then rerun affected checks and the full baseline comparison. That work is not started here.

### Unchanged PDF failures

All in `tests/pdfLineReconstruction.test.ts`:

1. `RP-014 approved reconstruction behavior keeps two-column sections in their own reading-order regions`
2. `RP-014 approved reconstruction behavior does not interleave sidebar content with the main experience region`
3. `RP-014 approved reconstruction behavior separates same-Y text that belongs to different columns`
4. `RP-014 approved reconstruction behavior rejoins contiguous CJK heading fragments without inserting spaces`
5. `RP-014 public PDF parser reproduction does not merge same-Y anonymous PDF fragments from separate columns`

## Preservation

SHA-256 comparison against 272 preexisting source/test/extension/Supabase/script/experiment/root files found exactly four changed files, listed above, and zero removals; the other 268 are unchanged. Both foundation modules and their original 63-case test are unchanged. App, Resume, Matching, REAL 104 connector/session modules, regions, snapshots, PDF reconstruction, database/RLS files and configuration are unchanged. Build/cache output is verification output. No row migration, account merge, password recovery, SMTP, OAuth or 40-job import was added.

Auth event handling follows the [official SDK callback guidance](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) and [documented async callback deadlock warning](https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0): the callback synchronously isolates changed owners and schedules SDK reconciliation later.

**Next: BLOCKED_AUTH_UI_INTEGRATION. STOP.**
