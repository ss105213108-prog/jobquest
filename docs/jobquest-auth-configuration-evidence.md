# JOBQUEST AUTH CONFIGURATION EVIDENCE

日期：2026-09-29。唯一目標：JobQuest / `neqwkiruqfevlchiajor`。流程：Configuration Evidence → Capability Evidence → Isolated Auth Experiment（前置條件未滿足，未執行）→ Architecture Decision → STOP。

**Recommended next action: BLOCKED_AUTH_IDENTITY_DESIGN**。

不是 same-UID 實驗 FAIL：本次未能讀取完整 Dashboard 設定，也沒有可驗證且經指定的臨時收信地址，因此沒有建立任何 Auth test user、更新身分、寄信、設定密碼或執行碰撞測試。下方保留可直接操作的只讀查核清單與隔離實驗契約。未實作產品登入／註冊 UI。

## 1. 本次直接證據

重新只讀 `GET https://neqwkiruqfevlchiajor.supabase.co/auth/v1/settings`，用現有 publishable key 作 header，先確認 URL 為唯一目標。只輸出以下欄位，沒有輸出 key 或 session：

```json
{
  "external_email": true,
  "external_anonymous_users": true,
  "mailer_autoconfirm": false,
  "disable_signup": false
}
```

此 endpoint 回覆欄位是 `external, disable_signup, mailer_autoconfirm, phone_autoconfirm, sms_provider, saml_enabled, saml_private_key_next_configured, passkeys_enabled`。**沒有 manual linking、Site URL、redirect allowlist 或 SMTP 欄位**。不能由欄位不存在推定設定關閉或沿用預設。

瀏覽器直接開精確目標的 `/dashboard/project/neqwkiruqfevlchiajor/auth/providers`，載入後轉到 Supabase 管理介面 sign-in，returnTo 仍指向該專案。初始未載入完整設定的頁面只有 headings，不是設定值證據。沒有登入、列舉／掃描專案，沒有嘗試其他專案。現有 Supabase connector 沒有 Auth-config read 方法；環境的 `SUPABASE_ACCESS_TOKEN` 不存在，沒有搜尋其他憑證或取得 service-role。

## 2. 必要報告欄位

| 欄位 | 結果 |
|---|---|
| Anonymous enabled | **YES**，本次目標 public settings 直接確認 |
| Email/password enabled | **YES**，`external.email = true`，installed SDK 支援 password 方法；未登入 |
| Email confirmation required | **YES**，`mailer_autoconfirm = false`；實際確認完成另列未驗證 |
| Manual/identity linking requirement | 官方匿名升級文件總述要求啟用 manual linking。Email 使用 updateUser，不是 OAuth linkIdentity。公開 server source 與總述的 guard 適用範圍差異不能取代本部署證據。 |
| Manual/identity linking verified | **NO（NOT VERIFIED）**，不表示已證明 disabled／不支援 |
| Site URL | **NOT VERIFIED**，沒有讀取實值；不猜 `localhost:3000` 或 `5173` |
| Development redirect verified | **NO（NOT VERIFIED）**；所需契約為 `http://localhost:5173/`，尚未核對 allowlist 或實際確認後返回 |
| Production redirect ready | **NOT_APPLICABLE**，本 Work Item 沒有已指定／確認的正式部署 origin；不宣稱任意網域已就緒、不建立虛構網域設定 |
| SMTP/custom email configuration | **NOT VERIFIED**，無法確認 custom SMTP、default SMTP 或 Send Email hook 哪個實際生效 |
| Confirmation email delivery | **NOT_VERIFIED**；沒有寄信、收信、開 link 或確認成功的實驗證據 |
| Installed SDK upgrade mechanism | `updateUser({email}, {emailRedirectTo})` → email 確認 → 原 UID 核對 → `updateUser({password})` |
| Anonymous UID before | **NOT_CREATED / NOT_TESTED**；沒有 TEST_UID_A |
| Permanent UID after | **NOT_TESTED**；沒有 TEST_UID_B |
| Same UID preserved | **NOT_TESTED**，不能把官方預期寫為 VERIFIED |
| Existing-email collision behavior | 官方預期明確錯誤，保留 anonymous owner，提供登入路徑；**目標 runtime NOT VERIFIED** |
| Database migration required | **UNKNOWN（部署路徑尚未通過驗證）**；首選同 UID 架構預期 NO，現在沒有依據啟動 migration |
| RLS change required | **UNKNOWN（部署路徑尚未通過驗證）**；首選同 UID 路徑依既有 owner policies 預期 NO，沒有變更需求被證明 |
| Production code changed | **NO** |
| Auth configuration changed | **NO** |
| Database/RLS/owner rows changed | **NO** |
| Isolated experiment status | **BLOCKED / NOT_EXECUTED** |
| Cleanup status | **NOT_APPLICABLE — no temporary test identities created** |
| Recommended next action | **BLOCKED_AUTH_IDENTITY_DESIGN** |

## 3. USER ACTION CHECKLIST — 只讀，不儲存設定

請用有管理權限的已登入瀏覽器，只開以下唯一專案頁，記錄畫面設定實值。可提供文字值或遮掉秘密的畫面；不提供密碼、SMTP credentials、API key、session、email link／OTP。此清單不是要求修改設定。

| 頁面 | 要查核的設定／證據 | 現在狀態 |
|---|---|---|
| [Authentication → Sign In / Providers](https://supabase.com/dashboard/project/neqwkiruqfevlchiajor/auth/providers) | Anonymous sign-ins；Email provider／password sign-in；Confirm email；User Signups 的 manual identity linking 開關（依實際畫面標籤記值）。另記 email/password 強度與最低長度，以及 relevant secure email change 設定。若看不到 linking 開關，回報看不到，不能猜。 | 前三项有 public API 證據；Dashboard／linking 未驗證 |
| [Authentication → URL Configuration](https://supabase.com/dashboard/project/neqwkiruqfevlchiajor/auth/url-configuration) | **完整 Site URL 與 Redirect URLs**。核對是否精確包含或依官方規則涵蓋 `http://localhost:5173/`；記錄是 exact entry 還是 wildcard。不要新增網址或按 Save。沒有正式部署 origin 就記未部署／尚未指定。 | NOT VERIFIED |
| [Authentication → SMTP Settings](https://supabase.com/dashboard/project/neqwkiruqfevlchiajor/auth/smtp) | Custom SMTP enable 狀態、sender configuration 是否完成、可見測試／收件者限制。只記非秘密摘要，SMTP username/password 等不要提供。 | NOT VERIFIED |
| [Authentication → Emails](https://supabase.com/dashboard/project/neqwkiruqfevlchiajor/auth/templates) | 只讀 Change Email 與 Confirm Signup template：link 是否使用 Supabase ConfirmationURL／正確 RedirectTo，是否寫死其他 origin、是否有自訂 token-hash handler。不要用 production API 生成 link 作設定探測。 | NOT VERIFIED |
| [Authentication → Auth Hooks](https://supabase.com/dashboard/project/neqwkiruqfevlchiajor/auth/hooks) | 若 SMTP 未啟用，仍須查 Send Email hook 是否啟用並接管寄信；只記 enable 狀態與發信模式，不讀 secrets。不從 custom SMTP off 直接推定 default SMTP。 | NOT VERIFIED |
| [Authentication → Rate Limits](https://supabase.com/dashboard/project/neqwkiruqfevlchiajor/auth/rate-limits) | 記目前 email sending／相關 Auth 測試限額；不修改數值。 | NOT VERIFIED |

前三個頁面的路徑由官方 Anonymous／Redirect／SMTP 文件連結核對；Emails／Hooks／Rate Limits 是 Dashboard 已觀察的 Authentication 導覽項目。不是猜測 API routes。

若發信模式確實是 default SMTP 且沒有覆寫，官方目前限制只寄給 project organization team 的預授權地址，並列出 **2 messages/hour**、best-effort、非 production delivery。這是**官方服務規則，不是本專案模式或剩餘配額的實測**。使用者需確認一個本人控制、可收信、在此模式下被允許、且尚未屬於此專案其他 Auth user 的測試地址；不能假定 plus alias、throwaway email 或 org member address 都可用。不得為了這次實驗新增 team member、配置 SMTP 或关闭 email confirmation。[官方 SMTP 說明](https://supabase.com/docs/guides/auth/auth-smtp)

補齊後若現有設定不支持目標 redirect 或收信，先回報設定 blocker，另行審核設定變更；本次不自動修改。

## 4. SDK / Current Code Capability

本次重新讀取 package manifests：`@supabase/supabase-js` **2.116.0**、`@supabase/auth-js` **2.116.0**。

- **PROPOSED_UPGRADE_API:** 在臨時 anonymous session 上 `supabase.auth.updateUser({ email: testEmail }, { emailRedirectTo: 'http://localhost:5173/' })`；email confirmation 完成且 current user 核對後，才 `supabase.auth.updateUser({ password: testPassword })`。
- **EXPECTED_UID_BEHAVIOR:** 同一 JWT 所代表的 user 更新，預期 UID 不變。必須實測 A == B 才標 SAME_UID VERIFIED。
- **DIRECTLY_SUPPORTED_BY_INSTALLED_SDK: YES**，本地 `GoTrueClient.ts:3402–3460` 接受 `UserAttributes` 與 `emailRedirectTo`，使用現有 session JWT 發 `PUT /user`，保存回傳 user、發 `USER_UPDATED`；`types.ts:535–565` 定義 email/password。SDK 方法能力不代表目標 hosted configuration 已確認。

官方 [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous#convert-an-anonymous-user-to-a-permanent-user) 要求先驗證 email，再設 password。不要把 `signUp()` 成功或 `updateUser(email)` 成功視為完成，也不用 signUp 另建永久 UID 来冒充升級。

Email 確認時就可能把 is_anonymous 轉成 false；User 型別沒有 has_password。因此完成標準含 password 設定成功、同 UID 的後續新 client password sign-in，不單看 non-anonymous。前次詳細官方 source 的差異與限制沿用 [能力證據文件](./jobquest-auth-upgrade-capability-evidence.md)，沒有新增「目標部署必然如此」的主張。

本次依 Supabase 技能重讀 current docs，`changelog.md` 讀取失敗後改看 [HTML changelog](https://supabase.com/changelog)。與此次配置查核直接相關的事項包括 default email provider 限制及新 Free/default-SMTP 專案的 template customization 限制；它們不是已確認的本專案 SMTP／template 狀態。

## 5. Exact Redirect Contract

`vite.config.ts` 明確 `host: localhost`、`port: 5173`、`strictPort: true`。`index.html` → `src/main.tsx` 的實際入口是根頁 `/`。目前沒有 `AuthLanding`／`/auth/callback`／`/auth/confirm`／recovery handler 的實作，前次 approved design 也沒有指定這些新 pathname。

因此本次收斂的 development callback 契約是 **`http://localhost:5173/`（包含 trailing slash）**，沿用真實入口、不聲稱已有未實作的 callback route。未來 Auth foundation 要在根頁先處理 SDK callback，再決定 landing／app，避免現行 startup 自動 anonymous creation 吞掉 callback。現有 client `detectSessionInUrl: true`；SDK 預設 flowType 是 implicit，未在 app 覆寫。此次沒有變更 flowType。

`emailRedirectTo`／password reset redirect 必須符合已讀取的實際 allowlist；若 template 寫死別處或需要 token-hash route，根頁契約仍不具備執行條件，必須先對齊設計。最後返回 localhost 並不證明 email 確認成功，仍要讀取 server user 的 email-confirmed 狀態與同 UID。[官方 Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

**Production requirement（未配置）**：日後有真实部署 JobQuest origin，再指定 HTTPS 根頁／實際 Auth callback 路徑、Site URL／精確 redirect entries 與 template 路由，驗證 hosting 能返回 app entry。此 Work Item 不建立或配置不存在／尚未提供的 production domain，也不把 localhost 成功當 production readiness。

## 6. Isolated Same-UID Experiment Protocol（設計完成，未執行）

### 執行前門檻

1. 上述 settings 實值可讀，沒有忽略 manual linking 的 docs/source 差異；設定支持實驗，或已取得適用部署的直接能力證據。
2. `http://localhost:5173/` 目前 allowlist 支持且 templates 能完成此 callback；發信模式與可用測試收件者已確認。
3. 使用者提供／選定一個本人控制的臨時測試 email、可收信與驗證，並自行輸入臨時 password。不要向聊天貼 password、OTP 或整條 verification URL。
4. 專用 browser/profile 與臨時 harness 可隔離目前產品 session；5173 沒有其他工作依賴。若 port 被占用，不自動終止使用者服務、不換成未批准的 callback。
5. 只讀取唯一目標 publishable key；沒有 service-role、無產品 API writes、無 app/authService import。

### 隔離方式

後續只在 temporary directory 建立獨立 harness，由 localhost:5173 根頁提供，使用本地已安裝 SDK 2.116.0。不能透過正式 App 根頁執行實驗，因它會執行現行 hooks 與自動 anonymous startup；獨立 harness 只證明同一 development origin 的 callback contract，不是產品 Auth UI 驗收。

Test client 明確使用 `persistSession: false`、`autoRefreshToken: false`、唯一 test storageKey、`detectSessionInUrl: true`，可指定目前契約的 `flowType: 'implicit'`。不用 production default storageKey、不讀寫 production localStorage／sessionStorage、不觸碰 current user。測試的 refresh/access tokens 只在記憶體；callback page 從 SDK 驗證後的 session 取得身份，另用非秘密 run ID／TEST_UID_A 做一致性比較，不持久化 token 或 password。只有 callback 含可驗證 session 時才繼續；callback 與 client 的真實行為仍是待測，不預填 PASS。

### 實驗步驟／證據

| 順序 | 動作 | 需要的非秘密證據 |
|---|---|---|
| 1 | 專用 client `signInAnonymously()`，再 `getUser()` | TEST_UID_A、is_anonymous=true；確認不同於任何 production session，沒有讀取其憑證 |
| 2 | 在該 test client 呼叫 updateUser(email, emailRedirectTo) | request success/error code、預期 email 的遮罩摘要；不能標 email delivery VERIFIED |
| 3 | 使用者在自己的測試信箱確認收件，打開此次 email-change confirmation link 到專用 harness | received/link-opened/returned 三個獨立結果；只記 sanitized origin/path、時間，不記 token、fragment／link全文 |
| 4 | callback SDK 完成後 `getUser()` | 原 UID、確認後 email、一致的 email_confirmed_at、非匿名狀態；不依 query 的自稱 success |
| 5 | 使用者自行输入临時密碼／確認，updateUser(password) | 明確 password response success；此時才記 TEST_UID_B，檢查 A == B |
| 6 | 第二個獨立、無保存 session 的 client 使用本人測試 email/password 登入，getUser | 可重新登入、其 UID == A == B；原 client 不借 existing session 假裝 password 登入成功 |
| 7 | 僅對此次確定建立的 UID 查核三張產品表是否沒有新增業務 rows（若需要） | 隔離副作用證據；不創 Resume／Preferences／Actions fixture，不讀 real user rows |
| 8 | revoke/signOut 此次 test sessions，依既有安全 Auth deletion 工具清理明確 allowlisted test UID | session ended、account removed 分開記；沒有 safe deletion tooling 就保留並明示待清理，不能假裝 signOut 刪了帳號 |

如 UID 不同：**FAIL，停止，不開始 UI，不搬資料**。如 email delivery／callback／設定／密碼等任何前置條件未完成：**BLOCKED 或 NOT_VERIFIED**，不能報 SAME_UID VERIFIED。第一次不可判斷的 network 結果先核對 test user，禁止重建另一永久 owner 掩蓋失敗。

cleanup 只能使用已可用且安全的 Auth-admin／Dashboard 流程，範圍精確到此次新建 TEST_UID；不取得 service-role 来造成功，不用 SQL 直接 DELETE auth.users，不碰 real users。瀏覽器不可逆刪除要在動作時確認；如果沒有工具，記錄待清理 UID 與已結束的 test sessions。此回合沒有建立 identities，所以沒有 cleanup debt。

## 7. Isolated Existing-email Collision Protocol（未執行）

若主實驗已成功，先保留此次新建的 temporary permanent account A 作唯一碰撞目標，再用另一獨立 memory-only client 新建 temporary anonymous C。這避免使用真實既有帳號，也不需另寄一封新帳號註冊信來準備 fixture。

記 C UID → updateUser({email: A 的本人測試 email}) → 記 sanitized error code 與 server user state。預期明確 collision，不更改 A／C UID，不切換 session、不搬 owner，不執行 signIn 或 merge；實際 error code／是否寄信以本部署結果為準，沒有明確證據就 NOT VERIFIED。若 unexpected success，不繼續 password step，停止並記錄兩個 test users 状態。

完成後只清理 A、C 的明確 test UID；若主實驗被阻擋，collision runtime **NOT VERIFIED**，不以文件預期替代實驗。產品規則仍是保留 guest、可換 email 或明確選擇登入既有帳號；任何登入是獨立的使用者選擇。

## 8. Architecture Decision / Preservation / STOP

| 實作 gate | 本次 |
|---|---|
| ANON_IN_PLACE_UPGRADE | NOT_VERIFIED，官方／SDK 能力已確認，目標 runtime 未測 |
| SAME_UID | NOT_TESTED |
| EMAIL_CONFIRMATION | NOT_VERIFIED，requirement YES 與 completion VERIFIED 是不同事實 |
| EMAIL_DELIVERY | NOT_VERIFIED |
| REDIRECT | NOT_VERIFIED |

因此 **BLOCKED_AUTH_IDENTITY_DESIGN**。沒有 evidence 顯示同 UID 不可能，不啟動 ownership-migration 設計，也沒有實作 Auth UI 的批准條件。下一步是補只讀配置值與可用臨時收信地址，再執行上述已授權範圍的隔離實驗；如需改配置，另行報告而不自行改。

本次只新增這份文件。調查前後以 SHA-256 比對 `src`、`tests`、`browser-extension`、`supabase`、`scripts`、`experiments` 的 256 個受保護檔案：變更／移除 0、新增 0。沒有修改 packages／env、Auth 配置／startup／logout、database／RLS／owner rows；沒有建立 test identities、登入、寄信、呼叫 upgrade 或最終產品 acceptance。**STOP**。
