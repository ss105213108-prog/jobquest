# JOBQUEST ANONYMOUS → PSEUDONYMOUS ACCOUNT SAME-UID VERIFICATION

日期：2026-09-29。類型：ISOLATED VERIFICATION。唯一 project：`neqwkiruqfevlchiajor`。

**FINAL STATUS: APPROVE_AUTH_FOUNDATION_IMPLEMENTATION**

正常 public SDK 的匿名 → synthetic identity → password → logout/login → 真正 browser reload，已實測保留相同 UID。碰撞回傳 `email_exists`／HTTP 422，原 temporary Guest 的 UID、匿名狀態及空 identities 不變。這解除 [production design](jobquest-username-password-auth-design.md) 的 same-UID 能力 blocker；不代表 production Auth 已實作、既有業務資料的瀏覽器驗收已 PASS，亦不啟動 implementation。

## 必要結果

| Report field | Actual result |
|---|---|
| Anonymous UID | `4815d880-5b41-4815-bcf5-11ecbfbd3ab0` |
| Anonymous before | **YES**，fresh getUser：is_anonymous=true，valid session，identities=[] |
| TEMP_USERNAME | `jq_up_07521f37dbe107` |
| SYNTHETIC_IDENTIFIER | `u1.jq_up_07521f37dbe107@jobquest.invalid`，僅 diagnostic evidence |
| Synthetic identity link | **PASS**，原 session 正常 updateUser(email)，未呼叫 signUp |
| UID after identity link | `4815d880-5b41-4815-bcf5-11ecbfbd3ab0` |
| UID preserved after identity link | **YES** |
| Synthetic identity confirmed without real email | **YES**，fresh server user email_confirmed_at 存在、new_email 不存在；無收信／OTP／confirmation click |
| Password set | **PASS**，正常 updateUser(password)，沒有 reauthentication nonce／寄信／admin bypass |
| Permanent after upgrade | **YES**，fresh getUser is_anonymous=false；再以 username/password 登入同 UID |
| Final UID | `4815d880-5b41-4815-bcf5-11ecbfbd3ab0` |
| Final email confirmed state | **CONFIRMED** |
| Final providers | identities 的 provider 為 **email**；app_metadata.providers 實際仍為 **[]**，沒有猜成其他值 |
| Logout/login | **PASS**，local signOut 後 getSession=null；uppercase／trim username 正規化後登入 |
| Login UID | `4815d880-5b41-4815-bcf5-11ecbfbd3ab0` |
| getSession / getUser after login | **PASS / PASS** |
| Reload/session restore | **PASS**，實際 browser page reload、重新建立 SDK instance，再 getSession／getUser 核對 |
| Restored UID | `4815d880-5b41-4815-bcf5-11ecbfbd3ab0` |
| Same UID end-to-end | **VERIFIED** |
| Existing-owner rows require migration | **NO**，限 auth.uid() owner predicate 的架構結論；本次沒有讀／寫既有履歷、偏好、saved jobs 或 actions |
| Existing-account collision behavior | **PASS_REJECTED**：email_exists，HTTP 422，data.user=null；temporary Guest 保持原 UID／匿名／無 email identity，永久 test owner 不變 |
| Real personal data used | **NONE** |
| SMTP used | **NO**，此次成功流程無收信／SMTP prerequisite，Auth confirmation／email-change sent timestamps 均為 null；不宣稱查核所有 mailer hooks 或服務端傳輸 logs |
| Production code changed | **NO** |
| Auth configuration changed | **NO**，Manual linking ON／Custom SMTP OFF 是使用者確認的既有設定，本次沒有切換 |
| Database schema changed | **NO** |
| RLS changed | **NO** |
| JobQuest business data changed | **NO**，harness 無產品 DB 呼叫；正常 Auth API 有意建立／更新兩個 temporary Auth users／identity／sessions，不宣稱 Auth storage 零寫入 |
| Temporary account cleanup | **兩個 test sessions 已 local signOut，getSession=null；兩個 Auth users 未刪除，列於人工清理表；test server 已停止** |
| FINAL STATUS | **APPROVE_AUTH_FOUNDATION_IMPLEMENTATION** |

## 1. 前置設定與證據分層

本次直接 GET 唯一目標 `/auth/v1/settings`（2026-09-29 13:45:12 UTC）：HTTP 200、external.email=true、external.anonymous_users=true、mailer_autoconfirm=true、disable_signup=false。Confirm email 因而是 OFF。

Public settings **未暴露** manual linking 或 SMTP 欄位。精確 project Dashboard provider 頁面導向管理介面 sign-in；未登入、未掃描其他專案或尋找其他 credentials。使用者隨後明確回覆：「已確認：Manual linking ON、Custom SMTP OFF」。直到收到此答覆才啟動 test server／建立第一個 temporary user。這兩個值是 **USER_CONFIRMED**，不是冒稱 agent 讀到了 Dashboard 實值。

已讀 [官方 Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous#convert-an-anonymous-user-to-a-permanent-user)：以目前匿名 session 的 updateUser 連 email identity，verified identity 才設定 password。依 skill 先檢查 changelog；markdown endpoint 無法讀取，改讀 [HTML changelog](https://supabase.com/changelog)。官方機制只決定測試方法，下面結果来自指定 project 的實際執行，沒有以文件推論代替測試。

## 2. 隔離、adapter 與執行順序

Installed `@supabase/supabase-js`／`@supabase/auth-js`：**2.116.0**。全部 harness files 位於 workspace 外：

`C:\Users\user\AppData\Local\Temp\jobquest-anon-upgrade-e3f90b24`

不 import production App、authService、產品 hooks 或 repositories；使用現有 exact target URL 與 publishable key，不使用 service-role/admin。Browser client storageKey 為 `jobquest-anon-upgrade-e3f90b24:main`，storage adapter 只允許该 namespace 的 sessionStorage keys；collision client 是獨立 memory-only storage。auto refresh 與 URL session detection 關閉，沒有讀寫 production SDK storage。

帳號沿用 [已通過 POC](jobquest-pseudonymous-auth-poc.md) 的 exact adapter：string → trim → 3–32 ASCII，`^[A-Za-z][A-Za-z0-9_]{2,31}$` → lowercase → 固定 `u1.<canonical_username>@jobquest.invalid`。沒有新策略、alias、截斷或 identifier 隱藏後綴。隨機 suffix 僅用來選擇此次全新 temporary username。

Password 由 temporary Node server 的 crypto.randomBytes 生成，僅存在 process／request／client 短期 memory；未輸出、未入 evidence、未寫檔、未加入 UI。只有安全 UID／booleans／provider／safe error code 與使用者要求的 diagnostic identifier 記錄於 result.json／測試證據畫面。這不是 production 顯示 synthetic email 的範例；正式 UI 仍只能顯示 username。

實際順序：

1. 確認隔離 client 無 session，再 signInAnonymously；fresh getUser 核對 A 與 is_anonymous=true。
2. 原 client updateUser({email: derivedIdentifier})，立刻檢查回覆與 fresh getUser 的 UID、identity 與 confirmed state。
3. 只有 identity 已 confirmed、無 pending new_email 且 UID=A 才 updateUser({password})；成功後 fresh getUser 確認永久身份。
4. local signOut，只結束 test identity；getSession=null。
5. 從含大寫／前後空白的同 username 重新推導 identifier，以 password 正常登入，getSession／getUser 均=A。
6. 透過測試頁面的 reload 按鈕執行真正 location.reload；新的 SDK instance 從專用 sessionStorage 還原，再向 server getUser，仍=A。沒有用同一 instance 的 getSession 冒充 reload。
7. 另建 temporary anonymous Guest G；對已屬於 A 的同 identifier 嘗試 updateUser(email)，記錄碰撞與兩個身份的最後狀態，然後停止測試、登出兩個 test clients。

第一個 Guest 建立於 **13:47:57.154 UTC**；碰撞證據完成於 **13:48:18.638 UTC**。沒有 signUp、verifyOtp、resend、resetPasswordForEmail、OAuth linking 或任何 business table API。

## 3. Identity 的精確 runtime state

| Stage | UID | is_anonymous | email confirmed | identities | app_metadata.providers |
|---|---|---|---|---|---|
| Before link | `4815d880-5b41-4815-bcf5-11ecbfbd3ab0` | true | false | [] | [] |
| Immediately after update email / fresh getUser | 相同 A | **false** | **true** | 一個 email identity | [] |
| After password / fresh getUser | 相同 A | false | true | 同一 email identity | [] |
| Reload / fresh getUser | 相同 A | false | true | 同一 email identity | [] |
| After collision / permanent owner getUser | 相同 A | false | true | 同一 email identity | [] |

Email identity ID：`6919a730-e84a-4c87-942a-88f7e77fce92`，identity.user_id=A。實際 `app_metadata.providers=[]`，所以本次以 identities[].provider 記錄 email provider，沒有修改 metadata 来「修正」畫面。

**email link 完成時、password 還沒設定前，就已 is_anonymous=false。** 這直接證實 production design 需要分開「有效永久 session」與「credential 已可重新登入」，不能單看 non-anonymous flag 宣稱帳號建立完成。此次 password 的明確成功與其後正常 password login 才形成完整證據。

本次停止 Auth 測試後，只對兩個 exact temporary UIDs 做只讀 auth.users／auth.identities boolean/count 查核；沒有讀出 password hash、token、其他 users 或產品 rows：

| Read-only state | Upgraded A | Collision Guest G |
|---|---|---|
| is_anonymous | false | true |
| email matches test identifier | true | null（沒有 email） |
| email_confirmed_at exists | true | false |
| confirmation_sent_at is null | true | true |
| email_change_sent_at is null | true | true |
| no pending email change | true | true |
| no phone | true | true |
| password hash exists（僅 boolean） | true | false |
| identity count | 1 | 0 |

確認 timestamps 與無 OTP／收信操作，支持此次流程不需真實 email verification delivery／SMTP。沒有由 admin 假確認，也沒有修改 confirmation policy。

## 4. Negative collision test

Existing permanent test account 是步驟 1–7 剛升級且已成功 password login／reload 的 A，非真實 user、非先前 POC 帳號。新的 collision Guest UID：`580ad21f-c8da-4ac0-9e64-e84a16c1c727`。

`updateUser({email: 'u1.jq_up_07521f37dbe107@jobquest.invalid'})` 的實際結果：

- error.code：**email_exists**；HTTP **422**。
- data.user：**null**，沒有 misleading success。
- G 前後 UID 相同，仍 is_anonymous=true、無 email／new_email、identities=[]；其 getSession 仍指向 G。
- A 的 server user 仍原 UID、非匿名、同一 confirmed email identity；未被 G 替代。
- 最後 auth.users exact-UID 查核兩個 user 都仍存在，G 仍沒有 identity／password。

這證明本次沒有靜默身份合併、替換或刪除 Guest user，也沒有 client-side row migration／delete 呼叫。**測試禁止插入業務資料，因此沒有以真實 guest rows 來做刪除／合併回歸驗收**；不能把無業務資料的 collision test 擴張為所有產品 row-preservation cases PASS。

## 5. Ownership impact — architectural conclusion only

本次讀取現有 schema migration 與 repositories：三張業務表使用 user_id，owner policy 是 `(select auth.uid()) = user_id`；repository 依 owner UID 讀寫。已驗證 A 在整條成功流程不變。

因此**已有相同 A 為 user_id 的 rows，仍指向相同 owner；不需要 owner-row migration**，username 不進入 ownership predicate。無需為這個轉換新增 schema 或 RLS；`job_snapshot` 仍沿用 user_job_actions 的原接點。這是 UID／policy 相容性的架構結論，不是本次讀取／還原既有履歷、偏好或 saved jobs 的 live acceptance。

沒有查詢產品 rows、插入 fixtures、搬 user_id、merge accounts，沒有改 Resume、Matching、104 Connector、normalization、preferences 或資料庫模型。

## 6. Cleanup / preservation

成功流程測試 local logout **PASS**；最終 cleanup 的 main 與 collision client 均 `signOut({scope:'local'})` 成功且 getSession=null。隔離 test server 已停止，temporary credential 不再由其提供；Auth user deletion **NOT PERFORMED**。正常 public SDK 沒有用於本次安全刪除 Auth users 的能力，本次不使用 admin／destructive SQL。

人工 Dashboard cleanup 清單（只限 [此 project Auth Users](https://supabase.com/dashboard/project/neqwkiruqfevlchiajor/auth/users)）：

| Temporary account | Exact UID | Diagnostic identifier |
|---|---|---|
| Upgraded account A | `4815d880-5b41-4815-bcf5-11ecbfbd3ab0` | `u1.jq_up_07521f37dbe107@jobquest.invalid` |
| Collision anonymous Guest G | `580ad21f-c8da-4ac0-9e64-e84a16c1c727` | **NONE**；嘗試使用 A 的 identifier 被拒絕，不能按 email 找到 G，須按 exact UID 核對 |

核對 exact UID 與 temporary test 身份後，由使用者在驗證完成後人工清理。不能刪除名稱相似的真實 user／全部 Guest。先前 standalone POC account 的清理另沿用原報告，不將其混入本次兩個帳號。

調查前後 SHA-256：`src`、`tests`、`browser-extension`、`supabase`、`scripts`、`experiments` 共 256 檔，以及 8 個現有根目錄 package／env／設定檔，**264 檔內容變更／移除 0，受保護目錄新增 0**。僅新增本 verification report、更新相關 design 的 blocker 狀態及 workspace 外的 temporary harness／證據。沒有 production build／unit tests 的必要（正式程式未改）；此處 PASS 是明確執行的 isolated Auth runtime flow。

非秘密原始證據：temporary directory 的 `result.json`。Browser screenshot：

![Isolated same-UID and collision evidence](C:/Users/user/.codex/visualizations/2026/09/29/01a0eb07-2eb1-7013-9686-e1339b2534ac/jobquest-anonymous-upgrade-same-uid.png)

## 7. Approval limits / STOP

**APPROVE_AUTH_FOUNDATION_IMPLEMENTATION**：已證明指定設定下的同 UID Auth primitive，production design 的核心 capability blocker 已解除。

尚未執行 production Landing/Login/Register、owner boundary、資料保存／跨帳號隔離、partial network failures／F5 interrupted upgrade、長期 refresh lifecycle、跨裝置業務資料還原與 frozen product regression。實作前的 read-only password-policy 核對、最小 Auth boundary 範圍與設計中的 acceptance plan 仍有效；不得把這次批准標為 production acceptance 或 freeze PASS。

沒有啟動 production implementation。**STOP**。
