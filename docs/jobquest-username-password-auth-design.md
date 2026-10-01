# JOBQUEST USERNAME/PASSWORD AUTH — PRODUCTION DESIGN

日期：2026-09-29。類型：ARCHITECTURE DESIGN。唯一目標專案：`neqwkiruqfevlchiajor`。

**Final status: APPROVE_AUTH_FOUNDATION_IMPLEMENTATION**

本文件完成 username/password 的 production 契約。原先的 **BLOCKED_AUTH_DESIGN** 已由 2026-09-29 的 [獨立 same-UID verification](jobquest-anonymous-upgrade-same-uid-verification.md) 解除：正常匿名 updateUser(email)／password、logout/login、實際 reload 均同 UID，collision 明確拒絕。這份批准只允許後續規劃的 Auth foundation implementation，並未開始實作，也不是 production 資料保存／UI acceptance PASS。

原 architecture design 工作只有文件，沒有帳號異動；本次狀態更新根據另外授權的 isolated Auth verification，其兩個 temporary Auth users 的操作與 cleanup 詳見上列報告。沒有 Login／Register UI、startup Auth、Auth 設定、schema、RLS 或產品資料修改。本文的模組名稱、UI 文案、密碼政策與 acceptance cases 都是未實作契約，不能當成 production PASS。

## 證據與適用範圍

| 依據 | 已證明／已觀察 | 不可推論 |
|---|---|---|
| [Pseudonymous POC](jobquest-pseudonymous-auth-poc.md) | 正常 public SDK 接受固定 identifier；新註冊立即取得 session；實際 reload 還原；local logout／login 同 UID；duplicate 與錯誤密碼被拒絕 | 匿名升級同 UID、跨裝置產品資料還原、production UI 或長期 session lifecycle 已 PASS |
| POC 的 public Auth settings | email／anonymous provider 開啟、signup 開啟、`mailer_autoconfirm=true`，confirm email OFF | manual linking、SMTP、密碼政策等未公開設定都已由 Dashboard 核實 |
| POC privacy 證據 | synthetic identifier 出現在 Supabase User／identity metadata 與 Auth logs | 服務端沒有身份資料或 telemetry；所有未來 Auth flow 都不會寄信 |
| 獨立 anonymous upgrade same-UID verification | 指定 project、使用者確認 manual linking ON／SMTP OFF 下，identity 已 confirmed、password 可登入、真 reload 同 UID；collision email_exists/422 且 Guest 不變 | interrupted upgrade、既有业务資料保存、長期 refresh、production owner boundary 已驗收 |
| 本次現有程式讀取 | `authService.initialize()` 無 session 時自動匿名登入；成功的 initialization promise 長期快取；`useAuth` 只以有無 user 分類 | 加一個表單就能安全處理 logout、owner 切換與競態 |
| 現有 persistence 接點 | controller 有 owner／epoch 隔離；REAL 104 的本機 session envelope 沒有 owner | 重新掛載 App 即可保證所有本機資料不跨帳號 |
| [先前能力調查](jobquest-auth-upgrade-capability-evidence.md) 與 [官方匿名文件](https://supabase.com/docs/guides/auth/auth-anonymous#convert-an-anonymous-user-to-a-permanent-user) | 官方有 updateUser 連結身份／設定密碼能力 | 指定部署在目前設定下能用不可收信 identifier 完成匿名升級 |

本設計取代先前 real-email Auth UX 方案的產品入口與身份契約；舊文件保留為能力／限制證據，不沿用收信、SMTP、email callback 或 password reset 的產品流程。

## 1. Auth state machine

Auth coordinator 位於產品 App 外層。startup 只還原／確認 session，不能在 render、effect、restore error 或 logout 後自動呼叫 `signInAnonymously()`。

| 狀態 | 意義與畫面 | 允許的下一步 |
|---|---|---|
| `RESTORING` | 載入 Auth，產品 owner subtree 尚未啟動 | 無 session → `NO_SESSION`；有效匿名 → `GUEST_READY`；有效 canonical 非匿名 → `ACCOUNT_READY`；讀取失敗 → `AUTH_UNAVAILABLE` |
| `NO_SESSION` | Auth Landing：登入／註冊／訪客試用 | 使用者明確選擇其中一項；開啟表單不建立帳號 |
| `ENTERING_GUEST` | 使用者已按「訪客試用」，單次建立匿名身份 | 成功 → `GUEST_READY`；失敗 → Landing error，不自行重試建立 |
| `GUEST_READY(uid)` | Guest App，顯示「訪客」 | 原 owner 工作；建立帳號 → 升級 gate；登入既有帳號 → 切換警告；離開 → 登出警告 |
| `REGISTERING` | 只有 `NO_SESSION` 的新帳號註冊 | 成功且有效 user/session → `ACCOUNT_READY`；失敗／不完整回覆 → 表單 error／狀態重新確認 |
| `LOGGING_IN` | Landing 上的帳號登入 | 成功 → `ACCOUNT_READY`；已知 credentials failure → 表單；結果不明 → `RECONCILING` |
| `ACCOUNT_READY(uid, username)` | Permanent pseudonymous session → App | 原 owner 工作或 logout；同 UID token refresh 保留產品 state |
| `SWITCH_CONFIRM` | Guest 要登入既有帳號，尚未改變身份 | 取消 → 原 Guest；明確同意 → `SWITCHING_ACCOUNT` |
| `SWITCHING_ACCOUNT` | 提交登入，隔離／暂停原 owner UI 與寫入 | 成功 → 新 UID subtree；失敗依重新確認結果回原 Guest／安全錯誤畫面 |
| `SIGNING_OUT` | 已確認離開，阻止新產品写入 | SDK local logout 確認無 session → `NO_SESSION`；結果不明 → `RECONCILING` |
| `RECONCILING` | SDK 回覆／Auth event／網路結果不一致 | 重新讀 session／server user，依實際 UID 分類；不得自動 signup／匿名登入 |
| `AUTH_UNAVAILABLE` | 設定錯誤或還原暫不可確認 | 顯示安全錯誤／重試讀取，不當成沒有帳號 |
| `UNSUPPORTED_IDENTITY` | 有效非匿名 session，但不是本版 canonical pseudonymous identity | 顯示「此登入方式尚未支援」，可明確登出；不顯示 email、不轉換、不刪帳號 |
| `UPGRADE_BLOCKED` | 實作前／runtime 前置條件不符已驗證設定，或功能尚未開放 | 保留 Guest；告知「帳號升級尚未開放」，不改呼叫 signUp |
| `UPGRADE_PENDING` | 未來 production implementation 的部分完成狀態 | 同 UID 續作／重新確認；未證明 password 可登入前不得顯示升級完成 |

還原順序：訂閱 Auth events → 開始一次可失效的 restore operation → `getSession()` → 有 session 時以 `getUser()` 核對身份 → 發布 owner-ready state。Network error 保留未決狀態，不把保存中的身份刪除或替換成新 Guest。確定 session 已失效／不存在才回 Landing；若原本是 Guest，提示目前無法還原該訪客身份，不能保證資料可再取得。

coordinator 保留 Auth event 種類，以 operation generation／owner epoch 排除晚到的 restore、登入與 load response。`SIGNED_OUT` 回 Landing；`TOKEN_REFRESHED` 同 UID 不重置產品；`USER_UPDATED` 不代表密碼已建立；外部 tab 的身份變更也走同樣 owner 邊界。事件 callback 只排程狀態處理，需要額外 async SDK 查核時在 callback 外執行。

改造時必須移除現有成功 initialization promise 跨身份的快取語義，改成「本次 restore 的去重」；所有身份 mutation 序列化，防重複提交。不能讓舊 promise 在 logout 後重新發布舊 user。session flags 只用於 UX 分類，資料授權仍由 Supabase RLS 決定。

`ACCOUNT_READY` 只表示有效非匿名 session 可進 App，不等於已證明 password 可重新登入。credential readiness 另行區分本次已完成註冊／password login、已知 upgrade pending、restore 後未知；未知不阻止有效 session 使用原 owner 資料，也不顯示「升級已完成／可找回帳號」承諾。沒有 pending marker 不能反向證明從未發生部分升級。

## 2. Registration contract

### 輸入與 normalization

註冊必填只有「帳號」、「密碼」、「確認密碼」。帳號旁提示「請使用代稱，不需真實姓名或電子郵件」。無其他身份欄位，V1 無 username rename。

固定沿用 POC 的順序：

1. username input 必須是 string。
2. JavaScript `trim()` 移除前後 whitespace，不移除中間字元。
3. trimmed input 限 **3–32 個 ASCII 字元**。
4. 驗證 `^[A-Za-z][A-Za-z0-9_]{2,31}$`：英文字母開頭，其後只允許英文字母、數字、底線。
5. 通過後 ASCII `toLowerCase()`，形成 canonical username。
6. 不做 Unicode normalization、全形轉半形、中文轉寫、截斷、別名、隨機後綴或自動改名。

例如 `  Job_User01  ` → `job_user01`；`ab`、`1user`、`user-name`、`user name`、`user@x`、中文或全形英文字母皆拒絕。大小寫與前後空白是同一帳號，不是兩個可分別註冊的名稱。

internal identifier 精確為：`u1.<canonical_username>@jobquest.invalid`。相異 canonical username 直接一對一映射；永不變更 version／domain／normalization 以「修正」duplicate。它只供 Auth adapter 使用，不是用户需填寫、記憶或收信的 email。正常 UI 僅顯示 canonical username。

### 密碼政策

**產品提案：新註冊／未來升級密碼最少 8 個 Unicode code points**，例如以 `Array.from(password).length` 計數；不是 bytes，也不是視覺字形數。password 保留使用者原字串，不 trim、不改大小寫、不作 Unicode normalization；確認密碼必須逐字完全相同。只有一份 password 傳給 Supabase，confirmation 不送出。建議使用較長、獨特的密碼。

8 字元是本設計的最低政策，**不是本次已讀取的 hosted password minimum**。[官方 Password Security](https://supabase.com/docs/guides/auth/password-security) 支援部署的長度／強度政策；指定專案實值尚未核實，實作前需只讀核對。部署若要求更長或額外強度，必須明確對齊文案及驗證；不得偷偷降低 Auth 設定，或用 POC 的隨機強密碼成功證明所有 8 字元輸入可用。不自訂猜測的密碼上限／字元組合規則，後端的合法性限制仍是最後判定。

確認註冊前持續顯示：「本版沒有密碼找回功能。請妥善保存帳號與密碼；遺失後無法透過電子郵件重設。」不加入額外身份欄位或 recovery code。

### 提交與成功

只有 `NO_SESSION` 可以走 `signUp({email: derivedIdentifier, password})`。Guest 的「建立帳號」一定路由至原 UID 升級，未通 gate 時 BLOCKED，不能直接套新註冊。

成功需 SDK 無 error、user 與 session 均存在、UID 一致、server user 非匿名、identifier 嚴格符合本次 canonical username。無 session／需要收信／身份不符，視為配置或不完整結果，不顯示「去收信」、不自動 resend、不用 admin 確認。結果不明先查核，不反覆註冊。

| 狀況 | 文案／行為 |
|---|---|
| 空帳號 | 「請輸入帳號。」 |
| 不符 username 規則 | 「帳號需為 3–32 個字元，以英文字母開頭，只能使用英文字母、數字與底線。」 |
| 空密碼／未確認 | 「請輸入密碼。」／「請再次輸入密碼。」 |
| 少於產品 minimum | 「密碼至少需要 8 個字元。」；若政策對齊後更長，文案同步更新 |
| 確認不一致 | 「兩次輸入的密碼不同。」 |
| 明確 duplicate，例如 POC 的 `user_already_exists` | 「此帳號已被使用，請登入或換一個帳號。」；保留帳號，不自動 login／改名 |
| Auth 強度拒絕 | 「密碼不符合安全要求，請使用較長、較難猜測的密碼。」；不直接 render backend message |
| 不完整註冊／需要驗證 | 「目前無法完成帳號建立，請稍後重試。」並保持安全的 reconciliation state |

註冊的 duplicate 提示是刻意的產品取捨，可能揭示該名稱已被使用；不額外做 username availability lookup／搜尋 API，不透過一般登入區分帳號是否存在。

## 3. Login contract

必填只有「帳號」、「密碼」。沿用同一 normalization／identifier；提交 `signInWithPassword({email: derivedIdentifier, password})`，不收 email、不採用 metadata 作登入查找，不要求先 signUp。

malformed username 在本機回第 2 節的格式提示，不送 Auth。空 password 回「請輸入密碼」。**登入不套用新帳號的 8 字元 minimum**，也不 trim password，以免擋住後端仍允許登入的既有 credential。

unknown username 與 wrong password 一律「帳號或密碼不正確。」不提供帳號存在／不存在訊息；不承諾後端時間差完全不可枚舉。rate limit 與 network outage 可用獨立安全文案，但不得帶 identifier、raw SDK message 或 token。

成功需有效 session、server user 與 session UID 一致且可分類；空 session 即使沒有 error 也不是成功。SDK 若回有效 session 加 `data.weakPassword` 警示，不能把已登入狀態誤當 invalid credentials；V1 不因此啟動收信或密碼重設。[本地 SDK types 與實作](../node_modules/@supabase/auth-js/src/GoTrueClient.ts) 已有此回覆形狀。

密碼送出後／成功、失敗、取消或離開表單時清空表單密碼 state。禁止記住密碼、持久化 credential 或無限制自動重試；可以由使用者重新輸入再提交。

## 4. Logout contract

永久帳號「登出」：暫停產品新寫入 → 執行正常 SDK `signOut({scope:'local'})` → 查核本機 session 為 null → 卸載 owner subtree 並清除其本機工作 state → Landing。沒有緊接著建立 anonymous identity；不刪 cloud rows。scope local 代表目前 client 的 session scope，不承諾其他裝置同時登出或立即撤銷既有 access token。

Guest「離開訪客」需先顯示：「離開後，可能無法再找回此訪客身份與其資料。雲端資料不會自動刪除，但你可能無法再存取。尚未確認的編輯及本機工作清單會離開目前畫面。」按鈕為「繼續使用訪客」／「確認離開」。只有後者才 logout；不靠關閉 warning、關閉表單或無 session error 觸發登出。

兩種 logout 都不把 draft 自動確認／保存。需等目前已授權的保存結果完成，或明確告知保存結果未確認後再讓使用者離開；不能以 logout 為由把任何 draft 寫入 DB。已送出的舊 owner 請求不能假裝能取消，也不能在新 owner 下重試。

logout error／timeout：先核對目前 session；若已 null，完成 Landing；若仍原 UID，顯示失敗，可重試；若無法確認，遮蔽產品並停留 reconciliation，不自動清除雲端資料、不發布過期 user、不登入 Guest。

## 5. Guest behavior

只有明確按「訪客試用」才呼叫 anonymous sign-in。既有 valid anonymous session startup 直接繼續 Guest App，不能另建身份。Guest 標籤不包含 UID／synthetic identifier；提示「訪客資料綁定目前登入狀態，清除瀏覽器資料、離開訪客或換裝置後可能無法找回」。[官方匿名登入限制](https://supabase.com/docs/guides/auth/auth-anonymous) 說明匿名身份的 session 遺失限制；它仍使用 authenticated role，不等於 public unauthenticated user。

Guest 繼續使用現有 confirmed resume／preferences／actions 保存流程。只存使用者明確確認的 ResumeProfile；draft、raw extraction、暫存編輯不是 cloud data。沒有「Guest 資料自動暫存到任一新帳號」契約。

Guest 提供兩條不同意圖：「建立帳號並保留訪客資料」是同 UID 升級（Auth primitive 已 PASS，產品功能未實作）；「登入既有帳號」是切換資料範圍（第 7 節）。不要用同一個 signUp 操作混合兩者。V1 無密碼找回，recovery code 為 **FUTURE / OUT OF SCOPE**，本文件不設計其機制。

## 6. Anonymous → permanent upgrade design

### 現在的結論：SAME_UID VERIFIED；production 未實作

原 standalone POC 是新 user 註冊→logout→login，不是 anonymous `A`→permanent `A`。後續 [獨立驗證](jobquest-anonymous-upgrade-same-uid-verification.md) 已直接證明指定 deployment 在目前設定下可用 synthetic email 原地 upgrade：A=`4815d880-5b41-4815-bcf5-11ecbfbd3ab0`，email confirmed、不需真實收信、password update 成功、password re-login 與真正 reload 均 A。不能將這次有條件的 runtime PASS 推廣到不同設定／其他 project。

目標 invariant：`GUEST_UID == UPDATED_UID == RESTORED_UID == PASSWORD_LOGIN_UID`。原 `resume_profiles`、`job_preferences`、`user_job_actions` 的 user_id 不變；不搬 rows、不 merge、不插入另一 UID。

### 驗證支持的流程：待 production implementation

1. 在有效原 Guest session 記錄 owner UID，驗證輸入並 freeze owner transition；不先登出。建立不含密碼／token 的本機 pending marker（version、UID、canonical username、phase），且僅對該 owner 有效。
2. 使用同一 session 的 `updateUser({email: derivedIdentifier})`，**不是 signUp**，也不是 OAuth `linkIdentity`。不假設 email+password 單一 update 等價於官方分階段流程。
3. 以 server user 確認 UID 未變、identity 是預期值、email 已 confirmed。若需要 confirmation delivery、old-email confirmation、OTP、SMTP、manual-linking 設定變更或真實信箱，立即停止並保留 BLOCKED；V1 沒有該 inbox。
4. 前一步確實成立才 `updateUser({password})`。若要求 email reauthentication nonce，停止為 BLOCKED，不嘗試發信、admin bypass 或降低設定。
5. 密碼 update 明確成功、fresh user/session UID 仍相同，才進入「credential 已設定」階段；獨立驗證已 local logout 並確認 session=null，再以正常 password login 證明可重新登入同 UID。不能僅因 `is_anonymous=false`／email confirmed／`USER_UPDATED` 判定升級完成。
6. 同 UID 轉換保持產品 owner subtree 及 cloud rows，不將原 Guest 的資料以另一 owner 重存。對使用者只顯示 username。

pending state 是流程提示，不是授權依據，也不能把它當成服務端 has-password 欄位。installed SDK User 沒有可靠 `has_password`。email 已成功、password 失敗／timeout／F5：保持原 UID，重新核對，要求重新輸入 password 才續作；不保存 password。reload 優先讀 owner-matched pending marker，避免僅靠非匿名 flag 顯示可找回的永久帳號。若已知升級嘗試但 marker 遺失／結果不可確認，顯示「登入狀態仍有效，帳號建立是否完成尚未確認」，由 credential verification／明確續作確認，不建立替代帳號。全新 browser 沒有 marker 時，僅靠公開 User flags 無法偵測過去是否部分升級；此時只能把 credential readiness 視為未知，不能假装能判斷。這項 crash／partial-state 行為也必須在獨立 gate 被驗證，不能當成目前已解決。

collision 明確回覆時保留原 session／UID，讓使用者換 username，或另走第 7 節登入既有帳號；不能把任意 timeout 分類為 duplicate。任何 UID 不一致：停止使用新 owner 的產品資料，回安全 reconciliation；絕不遷移原 rows 來掩飾。

### Separate isolated verification — 已完成指定 work item

使用者已另行授權且完成獨立 work item；正常 publishable client、專用 storage keys／隔離 browser context，沒有讀寫 production Auth storage、真實 Guest 或業務資料。public settings 確認 providers 與 confirm email OFF；manual linking ON／SMTP OFF 是使用者明確確認，agent 未假稱讀到 Dashboard。精確步驟及 temporary cleanup 以新報告為準；以下保留 gate 設計與未測部分的邊界。

| 步驟 | 必須蒐集的證據／停止條件 |
|---|---|
| V0 配置 | 只讀核對 anonymous／email provider、confirm email、manual linking 與 password／reauthentication 要求；無法核實的值寫 NOT VERIFIED。不能列舉其他 projects 或更改設定 |
| V1 新建 test Guest | 正常 signInAnonymously，記錄 temp UID A，server is_anonymous=true；不得用 production Guest |
| V2 link synthetic | 對 A updateUser email，檢查 server UID B、confirmed identity／state；若需收信或 B!=A，STOP BLOCKED |
| V3 password | 對同 session 正常 updateUser password，記錄成功及 fresh UID；若 nonce／email delivery／guard 阻擋，STOP BLOCKED |
| V4 reload／重新登入 | 隔離 client local logout 後確認 session=null，正常 username/password 登入同 UID，再真正 browser reload 還原 A；測試 logout 不污染 production |
| V5 partial failure／collision | 同 UID 流程可在 password 失敗／F5 後明確續作；collision 保留原 guest；沒有「第二 UID fallback」；需要額外 temp accounts 時另記帳號，不能觸碰真實帳號 |
| V6 保護／清理 | 不寫業務 tables；password 不輸出、不入檔、不入 logs；只回 UID／safe codes／必要 booleans；測試結束 local signOut，temporary accounts 僅列手動清理清單 |

本次 primitive gate PASS，支持 `APPROVE_AUTH_FOUNDATION_IMPLEMENTATION`。V5 的 collision 已測且原 Guest 不變；password 拒絕／網路結果不明／中途 F5 與 pending marker 續作未測，仍是 implementation acceptance 的必要項目，不冒稱 PASS。真正已有履歷／偏好／actions 的同 UID 保存驗收也仍未執行。未來設定若不符或 runtime primitive 不成立，回 BLOCKED，另開產品／配置決策；本文件不選資料遷移或新增 UID 作替代。

## 7. Existing-account login while guest

警告文案：「登入既有帳號後，將顯示該帳號的資料。訪客資料不會合併、刪除或覆寫帳號資料；切換後，你可能無法再回到目前訪客身份。尚未確認的編輯及本機工作清單不會帶入帳號。」按鈕「留在訪客」／「繼續登入」。既存 cloud Guest rows 留在原 UID，但不承諾日後可找回。

明確同意後才允許 guest-context login submission。不要先 signOut Guest；否則 wrong password 也可能讓使用者失去訪客身份。單一正常 client 成功登入將替換該 client 的 session，因此替換前必須完成警告、阻擋新寫入、處理已提交保存結果。

| 實際結果 | 契約 |
|---|---|
| 取消／關閉登入表單，未提交 | 原 UID、原 App state 保留；無 Auth mutation |
| 明確 credentials failure，session 仍原 Guest UID | 「帳號或密碼不正確」，留在 Guest；不能清空 guest cloud rows |
| 有效永久 session，UID 是既有 account | 切換 owner 邊界，丟棄原 subtree 的本機 drafts／view state，清除旧 owner 工作快取，再載入永久 account 原資料 |
| network timeout／結果不明 | 遮蔽產品，先查 session／user；不得假定 Guest 保留，也不得把原 Guest 資料重存到新 UID |
| event 顯示身份已切換但表單還沒收回覆 | 同樣隔離旧 owner，以 event＋reconciliation 處理；不等待晚到 response 繼續使用旧產品 subtree |
| 不支援身份／無 session | 安全阻擋或 Landing，說明結果；不自动建立新 Guest |

舊 guest rows 不 delete；永久 account 的 confirmed resume／preferences／saved jobs／actions 只從新 UID 還原。沒有 merge、copy、ownership reassignment 或 overwrite。產品無資料時沿用既有 defaults/no-row behavior，不能用 Guest state 填補。

跨 tab 由共享 SDK storage 傳來的 owner change 也須立即停用旧 subtree 並提示「登入帳號已變更」。不能承諾每個 tab 都能預先攔截另一 tab 的身份切換；安全依據是 event 後阻止跨 owner 顯示／寫入。

## 8. Privacy/data contract

| 資料 | 存放／用途 | UI 與禁止事項 |
|---|---|---|
| Canonical username | 可從固定 internal identifier 嚴格反解；V1 無新增 username table／metadata 權威來源 | 正常 account UI 僅 username，提示使用代稱；不宣稱可阻止使用者自願輸入個人姓名 |
| Synthetic identifier | Supabase Auth email identity；POC 已證明存在 User、metadata、identity 與 Auth logs | 不顯示為 email，不出現在 profile、errors、resume、matching、job cards |
| Password／confirmation | 暫時存在表單與正常 Auth request memory；hash／credential 管理由 Supabase Auth 負責 | JobQuest 不存 plaintext、不自行 hash 到產品 DB、不寫 storage、檔案、console、analytics 或 error reports；confirmation 不送出 |
| SDK session tokens／UID | 既有 SDK persisted session 與 auto refresh；UID 供 owner 邊界／auth.uid() 使用 | 不顯示 token、不輸出 raw session／user payload；不能把 UID 當找回密碼憑證 |
| 已確認履歷／偏好／actions／job snapshots | 完全沿用現有模型與資料生命週期 | Auth 表單不加入這些欄位、不把 username／identifier 寫入履歷或工作內容 |
| Upgrade pending marker（未來候選） | 本機 owner-scoped version／UID／username／phase，無 credential | 只控制續作 UX，不能用作 RLS 授權或完成證明 |

internal adapter 嚴格檢查 `u1.` prefix、`@jobquest.invalid` suffix、canonical username grammar，再 round-trip 比對。任意 email、`new_email`、metadata username 或相似 domain 不能當本產品帳號。不將 raw `User` 注入一般產品 UI；安全 AccountView 只含顯示 username／guest label，owner UID 留在 coordinator/persistence seam。

JobQuest 自有 telemetry 只保留必要的 operation kind、safe error code、時間與 request correlation；不記錄 credentials、identifier、raw SDK message、Auth request/response body 或 session payload。Supabase 的 synthetic metadata/logging 已存在，不能承諾其不記錄；pseudonymous 不等於不可追蹤或沒有服務端資料。註冊／登入不收 real email、phone、real name、OAuth、birthday、address。既有履歷的使用者自願內容不因 Auth 設計自動刪改。

V1 無 email recovery、SMTP recovery、reset email 或客服 owner-row 搬移。忘記密碼時僅說明「本版未提供密碼找回；無法透過電子郵件重設」，不嘗試收 email／phone，也不自動建立替代帳號。recovery codes 是 **FUTURE / OUT OF SCOPE**，不設計。

## 9. Error states

採取 allowlist 的錯誤分類；未識別錯誤用安全一般訊息。不能直接輸出 backend error.message，因其中可能包含 internal identity。下列 code 是已觀察或候選分類，未經實際部署確認不能把任意 error 猜成它。

| 類型 | 文案／狀態處理 |
|---|---|
| Field validation | 依第 2／3 節，未送 request |
| `user_already_exists`（POC 已觀察）；upgrade collision 候選 `email_exists` | 註冊 duplicate 提示；upgrade 保留 guest／重新確認原 UID |
| `invalid_credentials`（POC 已觀察）／unknown account | 同一「帳號或密碼不正確」 |
| Weak-password rejection | 安全強度提示；不混淆 login 的成功 session＋warning |
| Rate limit | 「嘗試次數較多，請稍後再試。」；無無限重試／availability 探測 |
| Network／timeout | 「目前無法確認登入狀態，請稍後重試。」；先 reconciliation，不重複建立帳號 |
| Session expired／已確認無 session | Landing；原 Guest 有身份可能無法找回的說明；无自动匿名登入 |
| Config mismatch／signup disabled／意外需收信 | 安全提示「目前無法使用此帳號功能」；開發診斷 safe code，維持 BLOCKED，不改 project／settings |
| UID mismatch／unsupported identity | 封鎖產品 owner subtree，重新確認／明確 logout；不 rename／merge／migration |
| Upgrade email 成功但 password 未完成 | 同 UID pending；「帳號建立尚未完成」，不回退新 signup、不宣稱完成 |
| Logout failure | 查核 session 後依第 4 節處理，不假設遠端或本機狀態 |
| 原 owner load/save 晚到 | generation／epoch 排除 UI publish；不對新 owner replay；必要時安全保存狀態提示 |

## 10. DB/RLS impact

**預期 NO schema change / NO RLS change。** ownership 仍是 `auth.uid()`，username 不是 user_id，也不是授權 claim。anonymous 與 permanent session 都沿用原 owner policies；不加入以 email／metadata 判斷授權的 policy。

| 既有資料 | 本設計影響 |
|---|---|
| `resume_profiles` | 保留 user_id／confirmed ResumeProfile 契約；同 UID 升級不更新 row ownership |
| `job_preferences` | 保留現有 load/save 與 no-row defaults；切帳號只讀新 owner，不能將旧偏好自動寫入 |
| `user_job_actions` | 保留 user_id、saved/status semantics；不批次轉移或 merge |
| `job_snapshot` | 仍透過原 actions/snapshot 接點還原；不新增第二套 personal saved-job store 或搬 shared snapshot |
| RLS／repositories／services | 使用既有 owner auth client，無 UI 直接查表、service-role、admin 或 schema migration |

現有 RLS 的 PASS/FROZEN 是既有 acceptance 邊界；本次僅設計相容性，未重新跑 live data／RLS acceptance。若後續實作發現新規則需要改 policy／table，必須停止另提設計，不默默擴 scope。

需要改的是**未來 Auth 邊界的本機生命週期**：

- existing confirmedResume／preference controller 會在特定 ownerless edit→owner-ready 時保存待存輸入。Auth transition 不能讓旧 owner state 留在 ownerless interval 再流入新 owner；用外層 owner subtree lifetime 隔離，避免改 controller 的保存契約。
- actual UID change／logout 先 suspend writes，卸載旧 subtree，再建立新 subtree；舊 async response 不 publish 到新 owner。即使有请求已送出，也不能把其資料重試到新 UID。
- 同 UID refresh／成功原地升級不 remount、不 clear，保持原 cloud 與本機資料。
- `jobQuest.real104Session.v1` 的 version-1 sessionStorage 沒有 owner。僅重掛 App 會重新讀到旧清單；候選方案在外層 Auth boundary 以獨立 owner sidecar 管理該已知 key，actual UID change／logout 清除本機工作清單，不改 REAL envelope、TTL、normalization、Connector 或 Matching。
- Legacy 無 sidecar 的工作清單不能在首次新 owner 上自動標成「已知是此 owner」。需告知本機清單無法確認帳號歸屬，明確選擇清除／重新匯入；在決定前不拿來展示／寫入另一 account。cloud saved rows 保留，這不是資料庫刪除。舊 anon cloud owner 仍從 SDK UID 還原。

上述外層整合需要 future implementation scope 明確包含 Auth boundary 接點與手動 regression；不是藉本文件允許重寫 frozen 模組。若不允許處理本機 owner boundary，帳號切換功能也不能聲稱安全。

## 11. Implementation boundaries

候選最小分工（尚未建立／修改）：

| 層 | 唯一責任 |
|---|---|
| Pure identity adapter，例如 `authIdentity.ts` | normalize／validate、derive internal identifier、嚴格反解 display username；無 SDK/storage/DB |
| 既有 `authService` | 使用現有 client，分離 restore、explicit Guest、new registration、login、local logout；將 SDK errors 映射 safe result；upgrade 需 gate PASS |
| 既有 `useAuth`／coordinator | state machine、事件、operation generation、單次 mutation、reconciliation；不進行 row migration |
| 外層 Auth boundary／Auth forms | Landing／最小三欄與兩欄表單、警告／安全文案；owner subtree 與本機工作 state lifecycle |
| 既有產品 App／persistences | 沿用確認、保存、還原與 current owner 參數；不增加 Auth 查表／credential 邏輯 |

保留 `src/lib/supabase.ts` 的 exact target guard、現有 publishable client／SDK session persistence／auto refresh。V1 不靠 URL callback 登入；目前 `detectSessionInUrl` 的設定沒有因設計而變更，也不新增 OAuth／recovery callback，未知 callback 不能自動被視為 username/password 完成證據。

**本次未執行且不隨驗證批准自動啟動**：production code edits、Auth settings changes、DB/RLS、Login/Register implementation。後續 foundation scope 仍禁止 Resume／Matching redesign、104 Connector／normalization／40-job import、recovery／codes／OAuth、real identity collection、new owner fallback、account merge／row migration、自動 destructive cleanup。

### POC manual cleanup

已完成的新帳號 POC 留下的 temporary Auth user（依 POC evidence，並非本次重新查詢）：

- Username：`jq_poc_user_f6c10b6a42f1`
- Exact UID：`38457620-173b-439f-a47e-5306d436560c`
- Project：只限 `neqwkiruqfevlchiajor`
- POC 時業務 rows counts：resume_profiles=0、job_preferences=0、user_job_actions=0；當時已 local signOut／停止 test server。

在 [指定專案 Auth Users](https://supabase.com/dashboard/project/neqwkiruqfevlchiajor/auth/users) 人工核對 exact UID 與 test account，再由使用者於驗證完成後手動刪除該 temporary Auth account。若目前有非測試資料或 UID 不符，停止核對；不要按相近名稱猜刪。禁止 SQL DELETE、批次清理、service-role script 或自動帳號刪除。本次清理 **NOT PERFORMED**；session logout 不等於刪除 user。後續獨立 upgrade POC 的每個 temporary UID 也須各自列入人工清單，不能泛稱刪除所有 anonymous users。

## 12. Manual acceptance plan

本表是未來 implementation acceptance，**全部 NOT EXECUTED / NOT VERIFIED**。現有 POC 的有限 PASS 只列在上方證據表，不替這些 product cases 勾 PASS。使用指定測試帳號與隔離 browser profiles，不使用實際使用者資料。

| Case | 操作 | PASS 必要證據 |
|---|---|---|
| A 新訪客前入口 | 無 session 開頁、reload、開 Login/Register 再取消 | 均 Landing；沒有新 anonymous user；只有明確 Guest click 建立一次 |
| B 既有 Guest restore | 有資料的匿名 test session reload／重開同 browser profile | 同 UID Guest；原 confirmed resume／preferences／saved/actions 還原；不另建 UID |
| C 新註冊 | 三欄提交；case／trim aliases、3/32 邊界、invalid chars、password minimum／confirmation | 只有必要欄位；唯一 canonical account；synthetic 不露 UI；正常成功 session；no email／OTP／SMTP |
| D 登入／restore | local logout 後不同大小寫輸入 login；F5、同 profile 重開；另一測試 browser 登入 | 同 permanent UID；該帳號原 cloud data 還原；無 Guest 创建；長期 refresh 需實際等待可觀察週期另留證據 |
| E 負面登入／duplicate | unknown、wrong password、malformed、duplicate alias、rate-limit安全呈現 | unknown/wrong 文案一致；malformed 不 request；duplicate 不 signIn／rename；無 rawidentifier/token |
| F 匿名 upgrade gate | 先完成第 6 節 isolated primitive gate，再做有 confirmed resume/preferences/saved/actions 的 test Guest upgrade | 全過程同 UID；可 password re-login；原 rows／owner與内容不變；無第二 UID、migration 或merge；gate未過不得實作此 case |
| G upgrade partial states | collision、email後password拒絕、網路結果不明、F5／marker狀態未明 | 同 UID pending可確認／續作；不因is_anonymous=false誤宣告完成；不得啟動收信／admin bypass |
| H Guest→既有帳號 | 取消warning、wrong password、成功登入已有不同資料帳號 | 取消仍Guest；failed login查核原UID；成功只還原永久owner；Guest rows未刪未搬，永久rows未覆寫 |
| I logout／guest exit | permanent logout；Guest取消／確認離開；logout timeout | 明確warning；Landing無自动匿名；cloud rows保留；timeout不發布stale owner；guest身份可能無法回復有告知 |
| J owner races／tabs | 延遲restore/load/save時切帳號；另一tab login/logout；sameUID refresh | 跨owner舊response不publish不replay；无ownerless旧draft autosave；sameUID不丢原state |
| K frozen產品回歸 | 相同UID F5、sameUIDupgrade、differentUID switch；REAL清單含舊sidecar／legacy無sidecar | 原Resume confirmation／preferences no-row／actions snapshot維持；REAL不跨owner；同UID清單／TTL不被改壞；Connector/Matching既有規則保留 |
| L privacy | 檢視所有Auth畫面、profile、errors、resume、matches、job cards、自有console/telemetry/storage | 只顯示username/Guest；无synthetic/rawpayload/secret；無password persisted；Supabase預期internalmetadata/logs與自有UI隔離 |
| M recovery／配置阻擋 | 忘記密碼說明；signup需要confirmation／upgrade nonce／unsupportedidentity | 無新增identity欄位/寄信/reset/codes/OAuth；安全BLOCKED而非假PASS／改設定 |
| N manual cleanup | 核對每個 isolated POC exactUID後人工刪除 | 只處理確認的temporary帳號；記錄人工結果；本次沒有自動刪除 |

implementation 後依實際範圍執行適當 focused checks、TypeScript／build 與 browser visual／interaction QA；checks PASS 不等於 manual acceptance、live RLS 或 freeze PASS。每個手動 case 都要留 UID／safe state／結果，不記錄 password/token/internal email 的使用者畫面。未能證明一律 NOT VERIFIED。

原文件工作核對：以上 12 項設計章節與未執行驗收計畫皆已列入；SHA-256 比對 `src`、`tests`、`browser-extension`、`supabase`、`scripts`、`experiments` 共 256 檔，新增／移除／內容異動皆 0，另外 8 個既有根目錄 package／環境／設定檔內容異動 0。原設計工作沒有執行 build、產品測試或 Auth 實驗；後續 isolated verification 也確認相同 264 檔未改。這項 preservation 只確認正式檔案未改，不能替代 production acceptance。

## 決策與 STOP

**APPROVE_AUTH_FOUNDATION_IMPLEMENTATION**。新帳號 POC 與獨立 anonymous upgrade same-UID verification 均有直接 runtime 證據，原 capability blocker 已解除。

後續 implementation 必須依既有設計限制與明確 Auth boundary 接點範圍執行，並完成第 12 節 production manual acceptance；不因此取得配置修改、資料遷移或 frozen 模組重寫的 scope。本次不啟動下一項。

**STOP — evidence + architecture design only.**
