# AUTH FOUNDATION IMPLEMENTATION

日期：2026-09-29。Scope：IMPLEMENTATION - FOUNDATION ONLY。

**Recommended next step: BLOCKED_AUTH_FOUNDATION**

Auth core 與 63 項 targeted tests 已完成，typecheck／production build PASS。完整 automated suite 未全綠：2152 PASS／5 FAIL，失敗集中在既有 `pdfLineReconstruction.test.ts`。排除新增 Auth tests 的原套件比對仍是相同 5 FAIL（2089 PASS），且所有 269 個原有受保護檔案 SHA-256 未變。因此沒有 Auth 引入的既有檔案修改，但本 ticket 要求的 full-suite PASS gate 尚未達成，不能標 APPROVE_AUTH_UI_INTEGRATION。

沒有修改或接入現有可見產品流程，沒有 browser acceptance。依本 ticket 停在 foundation，不修正 scope 外的 PDF／履歷模組，不移除或跳過失敗測試來假造全套 PASS。

## Files changed

僅新增四個檔案：

- `src/services/authIdentity.ts`：固定 username normalization／internal synthetic mapping；嚴格 canonical reverse decoder；安全 validation error。
- `src/services/usernameAuthService.ts`：production functions、typed domain results、SDK error allowlist、原 UID 保護與單一 foundation mutation 防重複執行。
- `tests/usernameAuthFoundation.test.ts`：63 項 generic fixtures／mock SDK contract tests，不使用真實 user 或 live Auth mutation。
- `docs/jobquest-auth-foundation-implementation.md`：本 implementation／verification report。

`App.tsx`、`useAuth.ts`、既有 `authService.ts`、`src/lib/supabase.ts`、UI、Resume／preferences／actions persistence、Matching、REAL 104／region mapping／session restore／snapshot／saved-job 模組完全未改。原有產品程式沒有 import 新 core。

## Required results

| Report field | Result |
|---|---|
| Username normalization | **PASS** |
| Synthetic identifier adapter | **PASS** |
| Registration foundation | **PASS**，targeted mocked SDK contract／typecheck |
| Login foundation | **PASS**，targeted mocked SDK contract／typecheck |
| Anonymous upgrade foundation | **PASS**，targeted two-update sequence／failure branches |
| Same-UID invariant protected | **PASS**，session/server/response UID mismatch 均 hard failure，不繼續 password mutation 或做 migration |
| Collision handling | **PASS**，ACCOUNT_CONFLICT typed error；確認 Guest 身份未變後才回該結果；不自動 login／signup／signOut／merge |
| Synthetic identity hidden | **PASS**，一般成功／失敗回覆無 raw User／email／metadata／tokens／backend message／password |
| Schema changed | **NO** |
| RLS changed | **NO** |
| Existing startup behavior changed | **NO**，保留現有 automatic anonymous startup 與 restore 行為 |
| Targeted Auth tests | **PASS — 63/63** |
| Existing full automated suite | **FAIL — 2152 PASS / 5 FAIL，75 files：74 PASS / 1 FAIL** |
| Original-suite comparison, excluding only the added Auth test file | **相同既有 5 FAIL — 2089 PASS / 5 FAIL，74 files：73 PASS / 1 FAIL** |
| Typecheck | **PASS**，src tsconfig.app.json；另新 test file 的 strict TypeScript check 也 PASS |
| Production build | **PASS**，tsc noEmit + Vite；既有 >500 kB bundle warning 保留，未擴 scope 改 bundling |
| Browser acceptance | **NOT PERFORMED**，使用者明確排除 |
| Auth settings / live accounts / business rows changed this ticket | **NO**，本次只有程式／mocked tests／build，沒有遠端帳號實驗 |
| Recommended next step | **BLOCKED_AUTH_FOUNDATION**，完整套件 gate 未全綠；未開始 UI integration |

## Production API contract

六個要求的 named functions 均可從 `src/services/usernameAuthService.ts` import；pure helpers 也可直接從 `authIdentity.ts` import。

| Function | Contract |
|---|---|
| `normalizeUsername(input: unknown)` | string → JS trim → `^[A-Za-z][A-Za-z0-9_]{2,31}$` → ASCII lowercase，3–32 字元；invalid input 丟安全 UsernameValidationError，不附原輸入 |
| `deriveSyntheticIdentifier(input: unknown)` | 固定 `u1.<canonical_username>@jobquest.invalid`；只有 Auth 內部使用，不可拿來當 profile/email UI copy |
| `registerWithUsername(username, password)` | 無 session 才正常 signUp；既有 Guest／permanent session 回 SESSION_ALREADY_PRESENT，不能建立第二 UID 替代訪客 |
| `signInWithUsername(username, password, options?)` | 正常 signInWithPassword；unknown／wrong password 使用同一 INVALID_CREDENTIALS。現有 session 預設拒絕被替換；future integration 在完成警告與 owner boundary 後，才可顯式傳 `{ allowSessionSwitch: true }` |
| `upgradeAnonymousToUsernamePassword(username, password)` | 先 current session + fresh server anonymous user，同 UID；updateUser(email) → fresh confirmed identity／UID → updateUser(password) → fresh final session／user／UID；沒有 signUp 或資料搬移 fallback |
| `signOutPermanentSession()` | fresh server non-anonymous identity 才正常 local signOut，再 getSession=null 確認；不提供未警告的 Guest logout、不立即创建 anonymous identity |

正常 Auth functions 回 `UsernameAuthResult<T>`：成功為 `{ ok:true, data }`；失敗為 `{ ok:false, error:{code,message,operation,step}, upgradeProgress? }`。`UsernameAccount` 僅有 uid、canonical username、kind，以及必要的固定 WEAK_PASSWORD warning；沒有 synthetic email、raw SDK response、token、metadata 或 Error cause。wrong/unknown credentials 的 error object／文案一致。

`deriveSyntheticIdentifier` 是明確要求的**內部 adapter string**，因此會返回 identifier；它不是正常 UI-facing account result。reverse decoder 只接受嚴格 version／domain／grammar 與 round-trip，不把 metadata username／任意 email 當授權身份。

production facade 經既有 `requireSupabase().auth` 取得 exact-project guarded client；不新增 createClient／storage／username table／DB queries。可測 factory `createUsernameAuthService(getAuth)` 僅提供同樣功能的 SDK dependency seam。沒有修改現有 initialization promise、subscription 或 `useAuth` state machine；这些属于 integration。

## Safety and incomplete upgrade behavior

新註冊／升級密碼沿用設計的 8 Unicode code points minimum，不 trim／normalize password；login 僅檢查非空，讓後端判定既有較短 credential。實際 hosted minimum／強度設定本次仍未從 Dashboard 獨立讀取；後端 weak_password 拒絕映射為安全 domain error。UI integration 前仍需依 design 只讀核對並對齊文案，不修改設定或宣稱所有八字元密碼在此 deployment 都可用。確認密碼是未來表單的一致性檢查，core 不存第二份 password。

每個 same-UID 邊界都明確檢查：最初 getSession user UID 與 getUser UID；identity-link response UID；link 後 fresh session／user UID；password-update response UID；最後 fresh session／user UID。任何 mismatch 回 UID_MISMATCH，當下停止；沒有 owner-row repair、第二帳號 signup、自動 signIn 或清除 Guest rows。

碰撞的 email_exists／user_already_exists 只映射安全 ACCOUNT_CONFLICT。upgrade collision 後重新檢查 server/session UID、匿名狀態、email／pending email 與 identities 保持原值；不符合時回 hard identity／UID error，不假稱 Guest 已安全保留。

link 成功、password 失敗／timeout 或最後確認失敗，回 safe `upgradeProgress`（originalUid、username、identity-linked／password-set phase），**不回成功**。它只描述該次 API 的已知進度，不是授權或恢復的證明，不包含 credential、不自行存入 local/sessionStorage。current user 可能已非匿名，因此此 entry point 再次呼叫會拒絕 non-anonymous；不得以重試呼叫或新的 signUp 掩蓋部分完成。pending marker、reload 續作、future owner boundary 與使用者文案依原 design 留在後續 integration，不在 foundation 自動處理。

foundation facade 拒絕重疊 mutation，完成或失敗後釋放 lock；不保存待執行密碼／command queue。此 lock 不取代未來 App coordinator 的 Auth events、其他 tab、SDK 外部操作或原 startup promise 競態處理。UID hard failure／結果不明時，UI integration 必須隔離產品 state 並 reconciliation，不能直接把舊 draft 寫入新 UID。

Supabase 處理 password credential storage；本 core 無 plaintext persistence／console logging／error body dumping。一般 SDK 錯誤與 thrown exceptions 都走 safe allowlist，不反射 backend message。未新增 recovery、codes、OAuth、SMTP、confirmation flow、admin／service-role、merge、migration 或 40-job import。

## Automated verification

使用 bundled Node：`C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`。無 package/env/config 修改。

1. Targeted：`node node_modules/vitest/vitest.mjs run tests/usernameAuthFoundation.test.ts` → **63/63 PASS**。
2. Full：`node node_modules/vitest/vitest.mjs run` → **2152 PASS / 5 FAIL**。
3. Baseline comparison：`node node_modules/vitest/vitest.mjs run --exclude tests/usernameAuthFoundation.test.ts --reporter=json --outputFile <temporary-report>` → **2089 PASS / 同一 5 FAIL**。這只用於辨認 failure provenance，不替代 full suite 或取消 gate。
4. Source typecheck：`node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json --pretty false` → **PASS**。
5. 新 test file strict typecheck（ignoreConfig、Bundler/ESNext/ES2022、DOM、skipLibCheck，並含 src/vite-env.d.ts）→ **PASS**。
6. Production build：tsc noEmit + `node node_modules/vite/bin/vite.js build` → **PASS**。

targeted tests 覆蓋 normalization／合法與非法輸入／3、32 邊界／deterministic mapping／canonical decoder、register/login adapter／duplicate/credentials、安全回覆、weak-password 成功警告、原 session guard、upgrade two-stage sequence／各個 UID guard、未 confirmed 停止、partial password failure／transport failure、Guest collision preservation／misleading collision rejection、local logout／Guest拒絕／未完成logout、concurrent submission／lock釋放。

新 Auth tests 使用 mocked SDK callbacks，**不是新增 live production runtime acceptance**；live capability 證據沿用 [standalone POC](jobquest-pseudonymous-auth-poc.md) 與 [isolated same-UID verification](jobquest-anonymous-upgrade-same-uid-verification.md)。

完整套件與原套件比對都失敗的五項：

- RP-014：keeps two-column sections in their own reading-order regions。
- RP-014：does not interleave sidebar content with the main experience region。
- RP-014：separates same-Y text that belongs to different columns。
- RP-014：rejoins contiguous CJK heading fragments without inserting spaces。
- RP-014 public PDF parser reproduction：does not merge same-Y anonymous PDF fragments from separate columns。

它們全部位於 `tests/pdfLineReconstruction.test.ts`，imports 為既有 parser/analyzer/fixtures，未引用新 Auth modules。原 source/tests/dependencies/config 都未改，原套件獨立執行仍相同五個 failures；不能把它們算成這次新增 Auth tests 的 failure，也不能把它們隱藏。

主要 frozen regression files 在 full 與 baseline 都 PASS：

| File | Cases |
|---|---:|
| confirmedResumePersistence.test.ts | 20 |
| jobPreferencePersistence.test.ts | 20 |
| jobActionPersistence.test.ts | 24 |
| jobSnapshotPersistence.test.ts | 17 |
| real104Session.test.ts | 48 |
| real104SessionRegression.test.tsx | 20 |
| job104Integration.test.ts | 11 |
| matchingEngine.test.ts | 13 |

完整 baseline JSON：`C:\Users\user\AppData\Local\Temp\jobquest-auth-foundation-baseline-tests.json`。JSON 的 numTotalTestSuites 包含 describe groups；本報告的 file counts 使用 testResults 檔案數，不混用 suite group counts。

## Preservation and gate

269 個原有 source/tests/browser-extension/supabase/scripts/experiments 與根目錄檔案 SHA-256 變更／移除 **0**，原 src/tests 只新增上述 3 檔。本次没有改 App startup、visible product flow、schema/RLS、frozen modules、dependencies、Auth settings 或任何遠端 user/row。build 的 dist 與 test cache 是驗證輸出，不是可見產品 flow 變更。

Auth foundation 本身已具備可 review 的實作與 focused verification，但「完整自動套件全綠」門檻未滿足。需另行處理既有 PDF test failures，或由使用者明確重新決定這項 gate 的適用範圍；本 ticket 不擅自放寬要求、不修改 scope 外模組，也不啟動 UI integration。

**BLOCKED_AUTH_FOUNDATION — STOP.**
