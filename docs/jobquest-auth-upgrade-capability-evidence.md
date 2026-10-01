# JOBQUEST Auth 升級能力證據

調查日期：2026-09-29。範圍是官方 SDK／文件／公開 Auth server source；沒有呼叫登入、註冊、更新帳號、寄信、驗證或資料搬移 API。正式程式及 Auth 設定未修改。

## 證據分層

| 證據 | 結果 | 限制 |
|---|---|---|
| 已安裝 `@supabase/supabase-js` | 2.116.0 | 本地 package.json，不代表部署 Auth server 版本 |
| 已安裝 `@supabase/auth-js` | 2.116.0 | 本地 source 與 types |
| 官方匿名轉換文件 | 支援更新目前匿名使用者的 email，驗證後設定 password | 不能當成指定專案的實際設定或端對端 PASS |
| 官方 Auth server `master` | 同一 user.ID 的 email identity 更新／確認能力 | 公開 source 檢視；未固定 commit、未證明指定專案部署該版 |
| `neqwkiruqfevlchiajor` 的 live 設定 | 本研究子項 NOT VERIFIED | 由主調查在指定專案直接核對；未列舉或掃描專案 |

官方 [changelog](https://supabase.com/changelog) 已檢查。`changelog.md` 在 web 工具回報 unsupported content-type，改讀 HTML index。此筆研究未發現匿名 email 升級被撤除的訊息；不是對所有歷史版本的相容性保證。終端 HTTP 受沙箱限制，改用 web 工具讀官方公開來源。

## Email 升級精確順序

官方 [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous#convert-an-anonymous-user-to-a-permanent-user) 指定 email／phone identity 以 `updateUser` 連到現有匿名使用者，先驗證地址，再加 password。設計建議：

1. 在仍有效的原匿名 session 上確認目標 user ID，保留它作此次升級的一致性檢查。
2. `supabase.auth.updateUser({ email }, { emailRedirectTo: approvedCallbackUrl })`。
3. 寄信成功只表示待驗證；不表示升級完成。Email link 或 email-change OTP 完成驗證，依現有 client flow 處理 callback。
4. 取得已驗證的服務端 user／恢復的 session，確認 `user.id` 仍是原 ID、email 已確認。
5. `supabase.auth.updateUser({ password })`；成功後才把「可用 email/password 登入」流程標成完成。
6. 網路結果不明時先重新讀取權威 user／session 狀態再決定重試，不建立第二個帳號、不搬 owner rows。

這是待實作的順序契約，沒有執行。不要用新的 `signUp({email,password})` 代替原 session 的 in-place upgrade，也不要默認一次 `updateUser({email,password})` 與文件建議的兩階段流程等價。

本地證據：`node_modules/@supabase/auth-js/src/GoTrueClient.ts:3402–3460`：`updateUser` 接受 `UserAttributes`／`emailRedirectTo`，要求現有 session，使用該 session JWT 發 `PUT /user`，把回傳 user 寫回 session，發 `USER_UPDATED`。`src/lib/types.ts:535–565` 含 email、password、nonce、current_password；`510–528` 含 email_confirmed_at、new_email、is_anonymous。這些型別不包含可供 UI 直接判斷的 `has_password`。

## 同 UID 與完成邊界

官方公開 [user.go](https://github.com/supabase/auth/blob/master/internal/api/user.go#L75-L127) 更新目前驗證的 user，不建立新 user；同一地址已由另一 user 使用時回報 `email_exists`。其 [email 更新分支](https://github.com/supabase/auth/blob/master/internal/api/user.go#L228-L252) 在匿名且 mailer autoconfirm 時立即進入 email-change 驗證，否則寄確認信。專案 confirm-email 設定因此決定有沒有待驗證階段。

官方 [verify.go emailChangeVerify](https://github.com/supabase/auth/blob/master/internal/api/verify.go#L512-L602) 使用原 `user.ID` 建立 email identity；在確認交易內把 `is_anonymous` 改為 false，再確認 email。這發生在 password 設定之前。不能只靠 `is_anonymous === false` 顯示「密碼已建立」。既有 JWT/user 快取須隨驗證 callback／session 更新重新核對。舊 email 非空且 secure email change 啟用時才走雙地址確認分支；沒有舊 email 的匿名使用者不能被要求點擊不存在的舊信箱。

官方 [models/user.go ConfirmEmailChange](https://github.com/supabase/auth/blob/master/internal/models/user.go#L527-L572) 更新 email，必要時 `Confirm` 設 email-confirmed timestamp；沒有改 user ID。結論是官方能力支持同 UID 路徑，不能據此聲稱指定專案端對端已驗證。

## Manual linking 與 OAuth 邊界

官方 [匿名文件](https://supabase.com/docs/guides/auth/auth-anonymous#convert-an-anonymous-user-to-a-permanent-user) 在轉換總述要求啟用 manual linking。官方 [Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking#manual-linking-beta) 對 OAuth 說明 `linkIdentity({ provider })` 與 manual-linking 設定；email 不是 `linkIdentity` provider 參數。

本地 `GoTrueClient.ts:4574–4588,4617–4637` 的 `linkIdentity` 是 OAuth／ID-token 能力，OAuth 發到 `/user/identities/authorize`；與 email `PUT /user` 是不同端點。官方 [api.go:261–268](https://github.com/supabase/auth/blob/master/internal/api/api.go#L261-L268) 在 `/user/identities` 子路由使用 `requireManualLinkingEnabled`，`PUT /user` 路由本身沒有這項 guard。上述 `UserUpdate` 完整 handler 也未見 manual-linking guard。

因此官方文件总述與這版 source 的適用範圍存在差異：不要推導「manual linking false 就一定不能 email upgrade」，也不要反向推導「SDK 有 updateUser 所以指定部署必定可升級」。應記錄目標專案 anonymous／email provider／confirm email／manual linking 的實值及可確認部署版本；必要時把未執行的升級驗證保留為後續 gate。本 Work Item 不更改設定、不做實驗性 Auth mutation。OAuth 不屬 V1 此次範圍。

## 既有 email 與復原

[官方錯誤碼](https://supabase.com/docs/guides/auth/debugging/error-codes) 提供 `email_exists`、`email_not_confirmed`、`email_address_not_authorized` 等可區分錯誤。Email 被占用時停止原升級流程，保留目前 guest session／rows，提供「登入既有帳號」及改用其他 email；不要宣稱會自動合併或自動轉移資料。只有收到明確 collision error 才如此分類，不能將任意 network／寄信失敗當作 email collision。

匿名資料與已有永久帳號資料的衝突需要產品另定規則；普通 identity linking 不等於應用資料合併。[官方 Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking) 的同 email 自動 linking 是 OAuth 身分情境，不是兩個 JobQuest user ID 的雲端 rows merge 契約。未驗證 email 的 `signUp` 結果可能被混淆以防枚舉，不能把沒有 error 當成既有帳號不存在的證據。

## Password reset

[Password-based Auth](https://supabase.com/docs/guides/auth/passwords#resetting-a-password) 說明 `resetPasswordForEmail(email,{redirectTo})` 寄重設連結，回到受驗證的改密碼流程後用 `updateUser({password})`。重設請求不揭露 email 是否存在；UI 應回覆一致的「若帳號存在，將寄出重設信」。SMTP、確認信及 allowlist callback 設定是實際可用性 gate，官方預設不代表目標專案實值。

[resetPasswordForEmail reference](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail) 說明 recovery callback 產生 `PASSWORD_RECOVERY`。本地 `GoTrueClient.ts:4466–4498` 使用 `POST /recover`，`730,2088,2514` 依流程發 recovery 事件；`208` 預設 `detectSessionInUrl:true`，但應核對 app createClient 是否覆寫。不要把任何一般登入／匿名 session 當成已完成 recovery 的授權。

[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) 要求 callback 與專案允許清單匹配，未指定時 fallback Site URL。設計應明確選 email-upgrade／recovery callback，而非從臨時 dev URL 猜測；callback URL 不得記錄 token／fragment 敏感內容。與目前 JobQuest app gate 的整合由主調查定義，本研究不修改路由或 startup。

## 後續實作驗收需要證明

- 唯一目標專案的 Auth 配置與 callback allowlist 可行，SMTP 可以向實際驗收地址寄信。
- Guest 有既存 Resume／Preferences／Actions，email 及 password 完成前後 user ID 相同；F5 後原 owner rows 可讀。
- email 已確認但 password 還未設定／網路結果不明時，UI 不錯誤宣告完成，且可安全續作。
- collision 不改變 guest owner、不刪 rows、不暗中 merge；選擇登入其他帳號須明確告知切换資料範圍。
- recovery session callback 不被 startup 自動匿名建立或一般 app redirect 吞掉。

以上僅為未執行的未來 gate。本次沒有證明 live upgrade、寄信、跨裝置登入或資料保存的端對端結果。
