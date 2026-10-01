# JOBQUEST AUTH UX / ACCOUNT UPGRADE DESIGN

日期：2026-09-29。範圍：調查與架構設計，沒有實作 Auth／UI、改設定、修改資料或執行 A–J 驗收。

**Recommended next action: BLOCKED_AUTH_IDENTITY_DESIGN**。官方與已安裝 SDK 有保留 UID 的 email 升級能力，指定專案的 anonymous／email／email confirmation 也已直接確認；但 manual linking、Site URL／redirect allowlist、SMTP 與實際部署版本尚未確認。不能把公開 server source 或方法存在視為目標部署已通過升級驗證。先補齊只讀設定證據，再審核下列 Auth foundation 範圍；本文件不是實作授權。

## 1. Observe → Current Auth State

| 報告欄位 | 目前實際行為 |
|---|---|
| CURRENT_AUTH_INIT | `authService.initialize()` 先 `getSession()`；有效 session 直接沿用；無 session 才 `signInAnonymously()`。讀取失敗會拋錯，不建立新匿名帳號。 |
| AUTO_ANONYMOUS_CREATION | YES，現在啟動時沒有 session 就自動建立，不等使用者選 Guest。這是未來需要明確變更的 Auth 邊界。 |
| SESSION_REUSE | YES，既有 session 的 user 原樣沿用，沒有匿名／永久分類。 |
| LOGOUT_BEHAVIOR | 尚無產品登出 API 包裝或介面；設定頁「清除本次資料」只清除本機狀態，不是 `signOut`、不刪雲端資料。 |
| AUTH_UI_EXISTS | NO，沒有 Login／Register／OAuth／Upgrade／AuthLanding。 |
| Auth subscription | `onAuthStateChange` 把 session.user 或 null 交给 `useAuth`；目前丟棄 event 類型。 |
| App gate | `authenticated = Boolean(user)`；App 沒有登入 landing gate，以確認／還原履歷控制進入既有產品。Auth 失敗仍有本機內容與重試。 |
| Session storage | `createClient` 明確開啟 `persistSession`、`autoRefreshToken`、`detectSessionInUrl`；未指定 custom Auth storage，已安裝 SDK 使用瀏覽器可用的 localStorage，無法使用時的保存能力不可保證。REAL104 工作清單另用 sessionStorage，兩者不同。 |

直接程式證據：`src/services/authService.ts`、`src/hooks/useAuth.ts`、`src/lib/supabase.ts`、`src/App.tsx`、`src/hooks/useLocalAcceptance.ts`、`tests/anonymousAuthReuse.test.ts`。

**初始化生命週期風險**：`initializationPromise` 成功後一直快取，只有失敗才清空。未來不能只加 login／logout 按鈕：必須防止舊初始化結果在 SIGNED_OUT／帳號切換後寫回舊 user，並讓成功快取失效。`useAuth` 同時等待 initialize 與接收 subscription，也需要 generation／operation 邊界。這次只指出風險，沒有改現行程式。

## 2. Supabase Capability Verification

### 唯一目標與實際設定

只讀 `get_project(neqwkiruqfevlchiajor)` 確認專案 **JobQuest**、ACTIVE_HEALTHY、ap-northeast-1；再依該回覆的唯一 organization ID 讀取組織，確認名稱 **JobQuest**。沒有列舉專案或組織，沒有接觸其他專案。

使用 `.env.local` 原有 publishable key 作 HTTP header，只讀 `GET https://neqwkiruqfevlchiajor.supabase.co/auth/v1/settings`。先驗證 URL 正是本目標；沒有輸出 key、token、session 或私人使用者資料。

| 設定／能力 | 結果 | 直接證據與限制 |
|---|---|---|
| Anonymous auth | **ENABLED** | 目標 `/settings`: `external.anonymous_users = true` |
| Email/password auth | **ENABLED** | 目標 `/settings`: `external.email = true`；SDK 支援 password sign-in。未執行登入。 |
| Email confirmation | **REQUIRED** | `mailer_autoconfirm = false`。註冊／新增 email 不能以寄信成功代替驗證完成。 |
| New signups | ENABLED | `disable_signup = false` |
| Installed Supabase client version | **2.116.0** | 本地 `@supabase/supabase-js/package.json` |
| Installed Auth client version | **2.116.0** | 本地 `@supabase/auth-js/package.json` |
| Manual identity linking | **NOT VERIFIED** | 公開 settings 沒有這個欄位；欄位不存在不等於 false。 |
| Site URL／redirect allowlist | **NOT VERIFIED** | 公開 settings 未暴露；Dashboard 讀取精確目標的 providers 頁後轉到管理介面登入頁，未登入、未操作設定。 |
| SMTP／寄信到驗收信箱能力 | **NOT VERIFIED** | provider enabled 不等於 email 可送達。未寄信或讀秘密。 |
| 密碼長度／強度限制 | **NOT VERIFIED** | 尚未取得實際 hosted 設定；未硬編碼猜測的限制。 |
| Deployed Auth server version | **NOT VERIFIED** | 專案 metadata 的 PostgreSQL 版本不是 Auth server 版本。 |

官方 [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) 要求 callback 符合允許清單，未指定時使用 Site URL。正式產品 origin、升級／註冊 callback、password recovery callback 必須逐一核對；不把臨時 Vite URL 或任意 origin 當正式設定。沒有更改任何配置。

### 帳號升級能力與界限

| 報告欄位 | 結論 |
|---|---|
| ANON_IN_PLACE_UPGRADE_SUPPORTED | **YES，官方平台／已安裝 SDK 能力；指定部署完整適用性 NOT VERIFIED。** 不將設定缺口寫成已證明不支援。 |
| Same user_id preserved | **YES，官方同使用者更新機制；目標端對端結果 UNKNOWN。** |
| Exact preferred mechanism | 原匿名 session 的 `updateUser({ email }, { emailRedirectTo })` → email 確認 → 服務端核對原 UID／已確認 email → `updateUser({ password })`。 |
| Email verification implications | 待驗證與待密碼設定是不同狀態；正式可用 email/password 登入的完成門檻是密碼設定成功。 |

官方 [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous#convert-an-anonymous-user-to-a-permanent-user) 指出先加 email、驗證，再加 password。`updateUser` 是在目前 JWT 的 user 上更新，**不能用新 `signUp` 代替 guest 升級**。已安裝 SDK 的相關方法包括 `getSession`、`getUser`、`signInAnonymously`、`signUp`、`signInWithPassword`、`updateUser`、`verifyOtp`、`resetPasswordForEmail`、`signOut`、`onAuthStateChange`；方法存在不是 live 驗收。

重要證據差異：官方匿名文件總述要求 manual linking；公開 Auth server `master` 的 email `PUT /user` handler 沒有該 guard，guard 出現在 OAuth identities 子路由。不能從這個差異推斷目標專案是否需要該開關。OAuth `linkIdentity` 不適用 email/password，也不在 V1 範圍。公開 source 未固定 commit、不是已知部署版本；詳細 SDK 行號、官方來源與限制見 [能力證據](./jobquest-auth-upgrade-capability-evidence.md)。

官方 source 在 email-change 確認交易內已將 `is_anonymous` 改為 false，使用原 user.ID，不是等到設定 password 後才轉變。SDK User 型別沒有 `has_password`。因此 `is_anonymous === false` 只能證明身分類別，**不能證明剛才的密碼設定已完成**。[官方 verify.go](https://github.com/supabase/auth/blob/master/internal/api/verify.go#L512-L602)

## 3. Data Ownership Analysis

透過唯一目標的只讀系統 catalog 查詢確認實際 table columns、constraints、RLS／policies；沒有讀取履歷、email、偏好值或職缺操作業務 rows。

| 報告欄位 | 實際 owner／key |
|---|---|
| RESUME_OWNER_KEY | `public.resume_profiles.user_id`，PRIMARY KEY，FK → `auth.users(id)`，ON DELETE CASCADE |
| PREFERENCES_OWNER_KEY | `public.job_preferences.user_id`，PRIMARY KEY，同樣 FK |
| JOB_ACTION_OWNER_KEY | `public.user_job_actions.user_id`；PRIMARY KEY `(user_id, job_key)`，同樣 FK；`job_snapshot` 是 nullable jsonb，與 action row 同 owner |
| RLS | 三表均啟用。SELECT／DELETE 的 USING、INSERT 的 WITH CHECK、UPDATE 的兩者皆限制 `auth.uid() = user_id`；適用 authenticated role，沒有排除 anonymous user 的條件。 |
| SAME_UID_UPGRADE_PRESERVES_DATA | **YES，依已確認 owner／RLS 結構。** 同一 UID 可继续存取原 rows，不需改 row／key；這是結構結論，不是本次 live 升級驗收。 |
| Database ownership migration required | **NO，首選同 UID 路徑。** |
| Database schema migration required | **NO，首選同 UID 路徑。** |
| RLS change required | **NO，首選同 UID 路徑。** |
| DATABASE_MIGRATION_REQUIRED | **NO，首選契約；部署升級流程前置條件仍需確認。** |

現有 repositories 以 current owner 讀／寫；Resume／Preferences 的 `getCurrent` 由 RLS 篩選，Actions 另加 user_id 條件。仍沿用這些 seams，不加 UI direct SQL、並行資料模型或 owner 重寫。

**Step 5 fallback：未觸發。** 目前没有證明同 UID 升級不可能，設定未能讀取也不是「不支援」。因此不設計或啟動資料搬移。若後續直接證據證明同 UID 不可行，另立 Work Item 才分析可信的雙身分驗證、privileged backend、單一 transaction、重試冪等性、PK 衝突、既有資料選擇及 rollback。現有 UPDATE WITH CHECK 不允許 client 把 owner 改成另一 UID；禁止放寬 RLS 或在瀏覽器使用 service-role 解決。

## 4. UX State Design

### Auth landing／啟動狀態機

未來 Auth 初始化只恢復 session，不創建身分；先處理可識別且經驗證的 Auth callback，再選一般入口。初次 session 載入顯示短暫 loading，錯誤顯示重試，不能把讀取錯誤當作無 session。

| 狀態／事件 | 顯示／動作 | Owner 規則 |
|---|---|---|
| 有有效 permanent session | 進 JobQuest；由現有 seams 還原資料 | 沿用 UID |
| 有有效 anonymous session | 還原 Guest Mode，進 JobQuest，顯示建立帳號 | 沿用 UID，不再匿名登入 |
| 無 session | AuthLanding：登入／註冊／先以訪客試用 | 不寫產品表、不自動匿名登入 |
| Guest 按鈕 | 單次 `signInAnonymously`；成功後進 app，失敗留 landing 可重試 | 建立一個匿名 UID；重複點擊去重 |
| REGISTER，無 session | 新帳號註冊／待驗證流程 | 新 UID；不是搬 guest 資料 |
| UPGRADE，現有 guest | email 待驗證／設定密碼流程 | 全程要求原 UID |
| Email callback／recovery | 先讓 SDK 處理，核對 current user、event、flow／UID，再顯示相應畫面 | 不由 startup 建立另一匿名身分 |
| Session 失效／SIGNED_OUT | 遮蔽並卸載 owner 資料區，回 landing | 不自動建立匿名 session |
| 暫時網路錯誤且 session 狀態不明 | 顯示重新確認狀態，暫停帳號切換／寫入 | 不宣告登出或新身分 |

Auth 的身分狀態、升級進度、資料還原狀態分開管理。使用 subscription event 驅動核對，不能把 TOKEN_REFRESHED／USER_UPDATED 一律當新帳號重置。same UID 轉永久時不清除資料、不卸載履歷、不重設 REAL104 清單。

### 最小介面契約

維持 Job Quest Guild／求職公會原本視覺語言與 shell。

| 介面 | 最小內容與行為 |
|---|---|
| AuthLanding | 品牌、登入、註冊、先以訪客試用。載入中／提交中禁重複提交，錯誤可重試。 |
| Guest indicator | 小型「訪客模式」與「建立帳號」入口，位於 auth account 區，onboarding 也可看見。說明：訪客資料依賴目前瀏覽器身分；建立帳號後可用同一帳號跨裝置還原已保存資料。 |
| Login | Email、Password、登入、忘記密碼、返回入口；不收履歷個人資料。 |
| Register | Email、Password、Confirm password；符合實際專案密碼規則、兩次輸入一致。不新增 name、phone、birthday、address。 |
| Guest upgrade | 明確「將目前訪客建立為正式帳號，保留現有資料」。同樣三欄；第一階段只送 email，password 只保留短期記憶體、驗證後重新輸入／確認再送。不可持久化密碼、確認碼或 token 到 flow marker。 |
| Pending verification | 提示檢查信箱；提供受 rate limit 的再次寄信／變更 email。單純關閉畫面仍可使用原身分；pending 流程可再次開啟，不另建帳號。 |
| Password setup | email 已確認且 UID 核對後設定密碼；成功才顯示完成。尚未完成時可保留同 UID 的 app 資料存取，顯示繼續建立密碼提示。 |
| Recovery | 提交 email 後統一回覆；只在 SDK 的有效 recovery callback／session 流程中進入重設密碼。完成後清除 recovery UI 進度，再進 app／登入入口。 |

**無 session 註冊**使用 `signUp({ email, password, options: { emailRedirectTo: approvedCallbackUrl } })`，成功但無 session 時留待驗證；不呼叫產品 repositories。沒有 error 不能證明 email 未被占用，因官方有防枚舉回應。[Password-based Auth](https://supabase.com/docs/guides/auth/passwords)

**有 guest 註冊**使用本文件的 `updateUser(email)` → 驗證 → `updateUser(password)`，不呼叫 signUp，不切換 UID。callback 若 user.id 与記錄原 UID 不同，停止升級，不套用舊資料；顯示身分已變更，重新確認流程。驗證信在其他瀏覽器打開時，只有能取得有效驗證後 session 且核對原 UID 才繼續；不能承諾未驗證的跨瀏覽器 callback 可靠性。可設計同原瀏覽器輸入 email-change OTP 作續作選項，但須依官方 `verifyOtp` 契約與實際信件 template／專案設定另核對，不自行猜 code 或 callback API。

### Guest 登入既有帳號：V1 明確不合併

顯示切換前確認：「登入後將顯示該帳號的資料。目前訪客資料不會自動轉移；離開訪客身分後可能無法再取回。想保留目前資料，請先以尚未使用的 email 建立帳號。」選項：取消／返回建立帳號／仍要登入。

只有使用者明確選擇切換後才 `signInWithPassword`。不先 signOut guest；登入失敗要重新確認目前 session，仍是 guest 才恢復 Guest UI，不能假設所有失敗都保留 session。成功若 UID 不同，切换到該 permanent owner 的既有資料。guest rows 保留原 UID，沒有 delete／merge／owner rewrite；舊匿名 refresh token 被瀏覽器新 session 取代後，V1 沒有可靠回到它的入口，也不備份其憑證。

### Logout／Guest exit

Permanent：提交期間遮蔽敏感 app 操作，以 SDK 已支援 `signOut({scope:'local'})` 結束目前 session，不要求其他裝置一併登出。收到結果並重新確認 session；成功回 AuthLanding，清除此次 owner 的本機顯示狀態，不刪雲端資料、不再匿名登入。失敗顯示未完成並重試；不寫「已登出」。SDK shared storage 下同一瀏覽器 profile 的其他分頁也可能收到 SIGNED_OUT，它們也必須回 landing。

Guest：一般返回／收起 account 面板不等於退出 guest。明確退出 guest 才顯示不可取回風險、取消／先建立帳號／仍退出，確認後才 signOut local。雲端 rows 不刪，身分不被產品刪除；但不能保證失去 session 後能再取回。未完成密碼設定的已驗證身分也要警告沒有已確認的重新登入途徑。

### Cross-device／復原範圍

Guest 只期望在同 origin、同瀏覽器 profile 的仍有效 Auth storage context 中還原；不同 profile／裝置不跟隨，清除保存的 session 或退出身分後不保證恢復。這不是 sessionStorage 的永久資料承諾。

Permanent 登入同一帳號可由現有 owner repositories 還原已保存的 Resume／Preferences／Actions／有效 saved job_snapshot。Resume 草稿、未提交偏好、未保存操作、整份 REAL104 sessionStorage 工作清單不屬跨裝置雲端同步；Match 仍依既有履歷／職缺計算，不保存或跨裝置承諾原分數與排序結果。空帳號正常進原 onboarding，不複製訪客資料。各 restore error 各自可重試，不把讀取失敗當作空帳號覆寫雲端。

**Password reset required for V1: YES**，因 email/password 產品需讓失去密碼的使用者恢复自己的同 UID 帳號。`resetPasswordForEmail(email,{redirectTo})` → SDK recovery callback → `updateUser({password})`；顯示「若帳號存在，將寄出重設信」而不枚舉 email。寄信、callback allowlist 与 recovery UI 可用性必須與 V1 一起驗證。[官方 reset reference](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)

## 5. Failure / Edge Case Design

| 案例 | V1 明確規則 |
|---|---|
| 1. Guest 使用 NEW email | 開始原 UID 升級；保留三表 owner。寄信成功≠完成；email 與 password 兩階段完成後才宣告。 |
| 2. Guest 使用既有 email | 明確收到 collision 才顯示已占用；保留 guest session／rows，提供其他 email 或帶風險確認的既有帳號登入。不自動 link／merge。 |
| 3. Guest 選 Login | 按前述切換確認；成功讀取永久 owner，舊 guest rows 不動且可能無法再访问。取消不切換。 |
| 4. Permanent logout→login | 登出回 landing，不創匿名；重登入恢復同一 owner。密碼錯誤保留入口，無覆寫。 |
| 5. Email verification required | 目標已證明需要驗證。過期／失效 link／email 不符保持未完成；重發有明確 loading/error。一般登入若 email 尚未確認，提示確認信箱，不重新建立帳號。 |
| 6. Upgrade 網路失敗 | 結果不明先 `getSession`／`getUser` 核對 UID、email／confirmed_at 與仍待變更的 email；不另 signUp、不搬 rows。email 已確認即可續作密碼。password 回應不明時不能由 User 欄位判斷成功；保留待確認提示，可在有效原 session 由本人重新設定，或之後明確嘗試登入／recovery。 |
| 7. Auth 成功但 UI 前 F5 | 以真實 session/user 還原，不依 toast。UID 相同仍讀原 rows；upgrade marker 只記 UID、預期 email、非秘密步驟，用作 UX 續作提示，不作授權依據。即使 marker 遺失，也不以 is_anonymous=false 宣告密碼已設定。提供「若尚未完成，繼續設定密碼」或明確登入驗證途徑，不憑猜測重建 owner。 |

Email 確認後非匿名但 password 未設定，是需要設計的中間狀態。marker 在首次請求前寫入，僅在明確 password 成功後記流程完成／清除 pending；若 success→marker 更新前刷新，仍以「待確認」處理而不是重做資料搬移。不能儲存 password、OTP、refresh token 或 callback fragment。callback 處理須完成 SDK 驗證並去除敏感 URL 內容後才作一般導航，過期 flow marker 不覆蓋目前帳號。

碰撞保留規則：從不把 network、SMTP、rate-limit 錯誤分類成 email_exists；新帳號 signUp 的模糊回覆不拿來判斷 email 存在與否。所有案例都沒有暗中刪除、猜測合併或重複 ownership migration。

## 6. Frozen Dependency Conflict / 未來實作邊界

**Frozen dependency conflict: YES，僅表示需要明確審核的 Auth／帳號生命週期接點；本次零變更。**

已接受的 persistence controllers 有 owner／epoch guards，Auth→無 owner→新 owner 的未來切換仍不能讓 ownerless confirmed snapshot 被另一帳號自動保存。最小設計是外層 Auth coordinator 管理 owner transition，登入／登出時暫停可寫 UI，卸載舊 owner 的產品 subtree，原 persistence cleanup 作 stale guards；成功後以新 UID mount 原產品。沒有 UID 改變的 guest upgrade 不重設 subtree。

REAL104 storage key `jobQuest.real104Session.v1` 沒有 owner 欄位；`useReal104Session` 也沒收到 auth owner。只 key-remount App 仍會從同一 sessionStorage 讀到前一 owner 的搜尋條件、清單，影響新帳號畫面。這是 Auth 切換新增情境的依賴，不是既有單 owner session restore 已失效。

建議下一階段只在明確 UID 改變／登出時，由 Auth boundary 清除舊 owner 的**本機工作清單**並重設 in-memory drafts／preferences／results；不修改 REAL104 envelope、TTL、Connector、Matching、雲端 rows 或保存契約。使用獨立非秘密 owner sidecar 辨識此分頁工作清單屬誰，外部 tab session 改變／F5 也須比較；sidecar 只管理本機 UX，不能當 RLS 授權。既有無 owner stamp 的 legacy 工作清單不能猜屬於新登入者：設計一次明確告知並讓使用者清除／重新匯入，不能靜默宣稱同 owner。正常同 UID F5 與升級則保留已能確認歸屬的清單。這個窄邊界必須在實作 scope 被明確批准，並以 J 驗證原單 owner 流程。

每個持久化請求仍帶原 owner、遵守現有 RLS。正在執行的 request 無法假裝完全撤回；不能自動以新 UID 重試舊操作。需驗證登入途中 Auth token 更新與舊 queue 的交錯；任何 failure 留給原 owner 的可見狀態，不搬給新 owner。切換前如存在未保存資料，確認文案要明示其可能丟失；不得偷偷補存草稿。

### Expected implementation files（提案，未建立／修改）

| 檔案 | 最小角色 |
|---|---|
| `src/services/authService.ts` | 拆開恢復與顯式 Guest creation；薄層 Auth 方法、可失效初始化 promise、保留 event／錯誤；無產品 SQL。 |
| `src/hooks/useAuth.ts` | 明確身分／pending action／callback 狀態、generation guard、操作結果與 subscription reconciliation。 |
| 新 `src/services/authFlow.ts`（或等價單一模組） | upgrade/recovery 非秘密 flow marker、UID 一致性、collision state；不搬 rows。 |
| 新 `src/components/auth/AuthLanding.tsx`、`LoginForm.tsx`、`RegisterForm.tsx`、`GuestUpgrade.tsx`、`PasswordRecovery.tsx` | 最小入口／表單與 confirmation、可及性／錯誤／loading。可依實作合併，避免過多層。 |
| 新 `src/components/auth/AuthBoundary.tsx`／`GuestAccountNotice.tsx` | account 區、owner transition 與外層 gate，保留公會 shell。 |
| `src/App.tsx` | 僅 Auth outer gate／owner-scoped subtree 接線；沿用既有履歷、偏好、Actions hook 及產品頁，不重做業務。 |
| `src/lib/supabase.ts` | 優先沿用；只有 callback 架構確實需要時審核微調，仍保持唯一 project guard／原 session 持久化。 |
| 新 Auth foundation tests；更新 `tests/anonymousAuthReuse.test.ts` | 覆蓋新 explicit-guest 契約、stale init、same UID upgrade、collision、回復／登出與 account boundary；保留既有 data-flow regression。 |

不改 Resume editor、preferences service/repository、jobAction/job_snapshot、Matching、Quest Board、region mapping、URL builder、Connector／extension、AI 或 database migrations。若 owner transition 無法在上述 boundary 內正確隔離，先報告新的窄依賴需求，不能偷偷修改 frozen services。

## 7. Future Manual Acceptance Contract（NOT EXECUTED）

| Case | 後續使用者驗收與通過證據 |
|---|---|
| A | 新 profile 無 session：看見 Login／Register／Guest；選 Guest 前未建立匿名 user、未寫產品 rows。 |
| B | Guest 明確進 app；顯示訪客身份；原 onboarding／產品流程正常。 |
| C | Guest 明確確認履歷／提交偏好／標記職缺，F5 仍是同 UID，保存值／snapshot 還原。草稿不 auto-save。 |
| D | 既有 guest NEW email upgrade，驗證與 password 都完成；before/after UID 相同，履歷／偏好／actions／snapshot 不消失、沒有 migration／delete。 |
| E | 升級後 F5 仍是永久身份、資料仍在；另驗 email-confirmed/password-pending 以及 server success→UI refresh 時不錯誤顯示完成。 |
| F | Permanent local logout 回 landing，未自動匿名登入；guest exit 顯示風險並可取消；同 profile 他分頁也遮蔽舊資料。 |
| G | 同帳號重登入恢復同 UID／三表資料，空資料／讀取失敗有正確不同處理。 |
| H | 另一 browser/profile 登入同帳號還原雲端 Resume／Preferences／Actions／可還原 saved jobs；不聲稱同步 sessionStorage 清單／草稿。 |
| I | Guest existing-email upgrade 安全停止；取消保留 guest。選登入既有帳號先有警告，成功顯示該 owner，guest rows 不刪／不合併，舊本機資料不混入。 |
| J | 同 UID 原 REAL104 匯入／F5 session restore、Taiwan regions、Matching、Quest Board、Resume／tools、saved-job recovery 與 Actions 全部維持手動接受契約；same UID upgrade 不清理 REAL 清單。實際換 owner 時本機隔離依明確新增契約驗收。 |

另驗忘記密碼全流程、寄信失敗／rate limit、過期 callback、guest session 丟失、network 中斷、stale 初始化／舊 restore／舊 write、重複點擊与跨分頁 UID 變化。這些是未來 acceptance 設計，不是現在的 PASS。

## 8. Decision / STOP

首選：同 UID email identity upgrade，三表 ownership／schema／RLS 不動，訪客登入既有帳號明確切換且不合併。Password recovery 納入 V1。無 session 才 landing，顯式 Guest 才匿名建立，permanent logout 不重建匿名身份。

**BLOCKED_AUTH_IDENTITY_DESIGN** 的剩餘證據：指定專案 manual linking 實值與該部署 email-upgrade 的適用性、正式 Site URL／callback allowlist、寄信設定與驗收地址可用性、密碼要求。Dashboard 當前要求管理介面登入；現有 connector 沒有 Auth-config read 方法，環境沒有可用 Management access token。本次沒有登入 Dashboard 或取得其他憑證來繞過此限制。補證據可由已登入者只讀指定設定頁，或提供不含秘密的設定值；沒有要求立即改任何設定。

本次只讀 metadata／public settings／系統 catalog 與本地程式、官方文件，新增兩份設計證據文件。調查前後比對 `src`、`tests`、`browser-extension`、`supabase`、`scripts`、`experiments` 共 **256 個檔案**的 SHA-256：變更／移除 **0**、新增 **0**。沒有以 docs-only 調查宣稱 build、產品測試或使用者驗收 PASS。

不執行任何登入／註冊／email-update／寄信／OTP／signOut，不改 Auth config、資料表／RLS、正式程式／測試，不執行 final browser acceptance。**STOP**。
