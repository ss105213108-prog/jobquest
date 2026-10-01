# JOBQUEST PSEUDONYMOUS USERNAME/PASSWORD AUTH POC

日期：2026-09-29。唯一 Supabase project：`neqwkiruqfevlchiajor`。本次只做調查與 isolated POC，沒有實作 production Login／Register UI。

**Recommended next step: APPROVE_USERNAME_PASSWORD_AUTH_DESIGN**。

已用正常 public Supabase Auth client **2.116.0** 證明候選識別碼可註冊、取得 session、實際頁面重新整理還原、登出後重新登入同 UID；重複正規化帳號與錯誤密碼都被拒絕。這是新 pseudonymous account 的 POC，**不是匿名舊帳號升級／資料保留驗收**，不取代未完成的同 UID upgrade 工作。

## 結果

| 報告欄位 | 實際結果 |
|---|---|
| Synthetic identifier strategy | `u1.<normalized_username>@jobquest.invalid`，固定 version／保留 `.invalid` namespace，直接一對一映射，不加隱藏亂數 |
| Supabase accepts identifier | **YES**，本專案正常 signUp 成功，不使用 service-role 或 admin API |
| Real email required | **NO**，只有程式生成的 pseudonymous username，沒有真實信箱／inbox |
| SMTP required | **NO**，此次 signUp／session／login 不需收信、OTP 或 SMTP；confirm email 實際 OFF |
| Registration | **PASS**，user 與 session 立即回傳，is_anonymous=false |
| Register UID | `38457620-173b-439f-a47e-5306d436560c` |
| getSession / getUser | **PASS / PASS**，均是本次新建 UID |
| Session restore | **PASS**，實際 localhost browser page reload，新 SDK instance 從測試專用 sessionStorage 還原，再 getUser 核對服務端 |
| Restored UID | `38457620-173b-439f-a47e-5306d436560c` |
| Sign-out | **PASS**，scope local，getSession 變 null |
| Login | **PASS**，從包含空白／大寫的同帳號輸入重新推導 identifier，以測試 password 正常登入 |
| Login UID | `38457620-173b-439f-a47e-5306d436560c` |
| Same UID | **PASS**，REGISTER_UID == RESTORED_UID == LOGIN_UID |
| Duplicate username behavior | **PASS_REJECTED**，同一 normalized username 的 signUp 回 `user_already_exists`，HTTP 422，沒有新 session |
| Wrong password behavior | **PASS_REJECTED**，`invalid_credentials`，HTTP 400，沒有 session |
| Negative test owner isolation | **PASS**，兩個負面測試使用獨立 clients，主 test user 仍是原 UID |
| Real personal data collected | **NONE**，未詢問／輸入真實 email、phone、name 或 OAuth identity；password／username 都是此次臨時生成 |
| Production code changed | **NO** |
| Database changed | **NO — 指 schema、RLS 與產品業務資料。** 正常 Auth 註冊有意新增一個 temporary Auth user／identity／Auth logs，不宣稱 Auth DB 零寫入。 |
| Temporary account cleanup | **NOT_PERFORMED**，沒有已可用的安全 Auth-delete 工具；保留上述唯一 temporary UID，不用破壞性 SQL。測試 session 已 local signOut，測試 server 已停止，生成 password 未輸出／寫入檔案。 |
| Recommended next step | **APPROVE_USERNAME_PASSWORD_AUTH_DESIGN**，批准設計階段，非 production implementation 或 freeze PASS |

## 1. 精確 username normalization contract

1. Input 必須是 string。
2. 只移除前後 whitespace：JavaScript `trim()`；不刪中間字元。
3. Trim 後長度 **3–32 個 ASCII 字元**。
4. Trim 後先驗證 `^[A-Za-z][A-Za-z0-9_]{2,31}$`：第一字元是 ASCII 英文字母，其他只允許英文字母、數字、底線。
5. 通過後 `toLowerCase()`，因輸入已限 ASCII，沒有 locale／Unicode case-fold 差異。
6. 空字串、短於 3、長於 32、含 @／空白／連字號／中文／其他 Unicode、數字開頭，明確拒絕。
7. 不做 Unicode normalization、transliteration、private-data inference、alias、username search、random suffix 或 username rename。

POC 實際 username：`jq_poc_user_f6c10b6a42f1`。suffix 僅用來挑選**這次測試的新 username**，不是 adapter 在識別碼尾端偷偷加亂數。`  JQ_POC_USER_F6C10B6A42F1  ` 與小寫輸入得到同一 canonical username；duplicate 測試即使用此前後空白／大寫形式。

隔離腳本檢查上述 invalid inputs 的拒絕，以及 whitespace／case normalization，均 PASS。它們是輔助契約檢查；Supabase signUp／session／login 結果是真實遠端證據。

## 2. Identifier design

固定規則：`u1.` + canonical username + `@jobquest.invalid`。本次 generated username 不含真實個資。local part 最長 35 字元；此 allowed alphabet 不含分隔符 @ 或 dot，兩個不同 canonical usernames 不會因拼接／截斷／hash collision 映射到同一 identifier。只有設計上定義為相同的大小寫／trim aliases 會合併。

`.invalid` 是 [IANA Special-Use Domain](https://www.iana.org/assignments/special-use-domain-names)，保留用途也適用其子網域。保留 namespace 只證明沒有需要的真實 inbox，**不自行證明 Auth validator 接受**；本次正常 public signUp 已另外證明它被指定部署接受。沒有測其他 TLD，沒有使用可寄給真實第三方的 domain。

`u1` 與 normalization 必須作為穩定身份契約，未來不能任意換 domain／version／大小寫規則或把舊 username 自動改名，否則會得到不同 Auth identity。此階段不加 username table。

## 3. Configuration evidence / 隔離

本次 public `GET /auth/v1/settings` 直接確認：`external.email=true`、`external.anonymous_users=true`、`mailer_autoconfirm=true`、`disable_signup=false`。`mailer_autoconfirm=true` 表示 confirm email OFF，與前次 email 升級工作不同；沒有由程式切換設定。

Manual linking OFF、custom SMTP OFF、Site URL `http://localhost:5173`、allowlist `http://localhost:5173/**` 是此次 user-supplied assumptions；public settings 不暴露這些值，本次不假裝已從 Dashboard讀取。這次 signup/login 不用 identity linking 或 email redirect，沒有以這些尚未獨立讀取的設定值冒充 pass 證據。

本次 Auth 資料只由正常 SDK `signUp({email: derivedIdentifier,password})`、`getSession()`、`getUser()`、`signOut({scope:'local'})`、`signInWithPassword({email: derivedIdentifier,password})` 操作。沒有 guest upgrade、service-role、admin createUser 或 fake response。[官方 Password Auth](https://supabase.com/docs/guides/auth/passwords)

全部 harness files 在 Windows temporary directory：`C:\Users\user\AppData\Local\Temp\jobquest-pseudonymous-05ecd542`。它不 import App／authService／產品 hooks。SDK 用明確的專用 sessionStorage adapter 與 `jobquest-pseudonymous-poc-05ecd542:*` storage keys，沒有讀寫 production Auth key，auto-refresh／URL-session detection 關閉。重複註冊與錯密碼使用另外 memory-only clients。

Temporary password 由 server 的 cryptographic randomBytes 生成，只存在短期 process／request／client memory；未顯示、記錄或寫入 evidence。頁面只呈現測試 username、UID 與非秘密 booleans／error codes，**沒有呈現 synthetic email**。每次 reload 不重新 signUp，完成 marker 防止重複執行。

## 4. 不需要寄信的直接證據

signUp 在 confirm email OFF 下立即取得 valid session 與已確認的 email identity。僅對新 test UID 的只讀 `auth.users` 查核得到：`is_anonymous=false`、`email_confirmed_at` 存在、**`confirmation_sent_at IS NULL`**、phone 為空。SDK 只呼叫 signup/login/session/logout，沒有 resend、verifyOtp、resetPasswordForEmail、invite 或 update-email。

此外，filtered external Auth audit logs 的六個 test events 中，`user_confirmation_requested` **0**、`user_recovery_requested` **0**。這與 confirmation_sent_at 為空及立即有效的 session 一致。

這證明此次 flow 不需 confirmation delivery／SMTP；不是以 signup 成功回覆假裝「真實信件已送達」。沒有真實信件，沒有停用 SMTP／confirmation 的程式設定動作。未來 adapter 也必須限定 username/password flows，不呼叫 email OTP／recovery／invitation／update-email；其「不寄信」契約不能靠 UI 隱藏 email 欄位達成。未測的 mailer notification／Auth hook 或未來設定變更不在這次 PASS 範圍。

## 5. Privacy / UX contract

未來 Register 只收：帳號、密碼、確認密碼；Login 只收：帳號、密碼。Confirm password 是本機輸入一致性檢查，只有一份 password 傳 Auth；不新增個人檔案欄位或恢復系統。此次沒有收真實身份；它不阻止使用者自行把真實姓名當 username，因此產品应引導選擇代稱，不能宣稱 anonymous／不可追蹤。

UI 使用 normalized username 顯示帳號，禁止直接 render `user.email`／metadata.email／identity.email。Duplicate error 映射為「此帳號已被使用，請登入或換一個帳號」；wrong credentials／未知帳號使用同一「帳號或密碼不正確」。不把 SDK error.message、synthetic identifier、JWT、內部 URLs 複製到使用者文案。Username availability 是否可被枚舉，是這個公開註冊產品既有的設計取捨，不新增 username lookup endpoint。

**Supabase metadata contains synthetic identifier: YES**，直接 user response／只讀查核確認 top-level email、user_metadata.email、identity_data.email 都含 synthetic identifier。

**Supabase logs contain synthetic identifier: YES，已直接證明。** 對唯一 test UID／username，限定 2026-09-29 13:12–13:20 UTC 的 filtered aggregate logs：

| source | 相符事件 | 含 synthetic namespace 的事件 |
|---|---:|---:|
| auth_audit_logs | 6 | 6 |
| auth_logs | 7 | 5 |
| edge_logs | 5 | 0 |

只回傳 counts，沒有讀取／輸出其他 user 的 logs、email、IP 或敏感 headers。`auth.audit_log_entries` 的同 test actor 查詢為空，**不代表沒有 Auth logs**，外部 log storage 已有上述證據。[官方 Audit Logs](https://supabase.com/docs/guides/auth/audit-logs)

Pseudonymous 不等於沒有 service telemetry：Supabase 仍有 UID／合成識別碼與正常 Auth logging。沒有 email recovery 的 V1，丟失 password 後沒有此次架構提供的取回途徑；這項產品規則須在後续設計明確呈現，本次不新增 recovery。

## 6. Production preservation / limits / STOP

僅對 test UID 查三張業務表：`resume_profiles=0`、`job_preferences=0`、`user_job_actions=0`。沒有插入或修改履歷／偏好／saved jobs／actions，也沒有 database schema、RLS、username table 或 owner migration。

調查前後 SHA-256 比對 `src`、`tests`、`browser-extension`、`supabase`、`scripts`、`experiments` 共 **256 個受保護檔案**：變更／移除 **0**、新增 **0**。只有本文件與 workspace 外的临時 harness／證據 screenshot；沒有改 packages／env 或正式 Auth startup、logout、Resume、Matching、Connector。

結果可支持 **APPROVE_USERNAME_PASSWORD_AUTH_DESIGN**。未證明 guest 同 UID 升級、跨装置產品資料還原、長期 refresh-token lifecycle、全 username 長度／其他 deployment 版本相容性或 production Auth UI。不能把新註冊→同帳號登入的 SAME_UID PASS 寫成匿名舊資料保存 PASS。

temporary Auth account 仍保留上述 UID，因沒有安全 Auth deletion tooling，未用 SQL 刪帳號。local signOut 結束測試 session 不等於刪除 Auth user，也不立刻使已發出的 access token 失效；測試 server 已停止、臨時 credential 沒有輸出。**STOP**。
