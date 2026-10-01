# JOBQUEST REAL104 BATCH STORAGE ADAPTER

**Final status: REAL104_BATCH_STORAGE_ADAPTER = PASS**

此工作項只加入真正的 browser `window.sessionStorage` Adapter，供已完成的 Batch Foundation 的 `Real104BatchStoragePort` 使用；尚未接 App、UI、Connector 或 concrete Matching。新 Adapter 不解讀或修改批次 JSON，版本、owner UID、fingerprint、current/seen、批號及最早 `capturedAt` 的 30 分鐘絕對 TTL 仍由既有 Foundation 保存與驗證。

## 實作與資料邊界

Files changed:

- `src/services/real104BatchSessionStorage.ts`：新增 `createReal104BatchSessionStorage()`。預設以 lazy getter 存取 `window.sessionStorage`，實作 `getItem`、`setItem`、`removeItem`，且只允許 Foundation 的 `jobQuest.real104Batch.v1` key。讀寫錯誤不被吞掉，以便 Foundation 回報 typed storage failure。
- `tests/real104BatchSessionStorage.test.ts`：新增使用 browser-shaped `window.sessionStorage` fake、真實 Foundation 與假 Matcher 的 Adapter 契約測試。
- `docs/jobquest-real104-batch-storage-adapter.md`：本報告。

Adapter 不接觸 `jobQuest.real104Session.v1`。舊 REAL session 的 schema、read/write/restore hook 及已驗收流程完全未改。批次 JSON 只寫在獨立版本 key；其 owner、TTL、corrupt/version 驗證都透過 Foundation 的 `restore(uid, now)` 執行，沒有在 Adapter 複製第二套規則。`removeItem` 目前僅提供 Port 所需能力，尚未接 Auth 或 App 清理流程。

| 測試契約 | 結果 |
| --- | --- |
| 正常 round-trip：版本、UID、fingerprint、current job、capturedAt | PASS |
| Partial 27 筆保存與同 tab 新 instance 還原 | PASS |
| Presented current、批號及前批 seen history 還原 | PASS |
| UID A/B 隔離 | PASS |
| 原始 `capturedAt` 恰好 30 分鐘有效、超過 1 ms 過期 | PASS |
| 後續 capture／下一批不延長最早時間的 TTL | PASS |
| corrupt JSON 與不支援版本安全拒絕，保留原 storage bytes | PASS |
| 舊 REAL key 共存且不被 Adapter 讀寫或清除 | PASS |
| storage 讀取／寫入失敗映射 typed error，舊有效 batch 不被覆寫 | PASS |

Verification（按工作項順序）：

1. 新 Storage tests：**10 PASS / 0 FAIL**。
2. Batch Foundation tests：**40 PASS / 0 FAIL**。
3. 舊 REAL session restore regressions：**68 PASS / 0 FAIL**。
4. 其餘相關 REAL 104、Matching、snapshot/action regressions：**301 PASS / 0 FAIL**。
5. Typecheck：**PASS**（production `npm run typecheck`；新增測試另作 TypeScript 檢查）。
6. Production build：**PASS**（既有 Vite chunk-size 警告）。
7. Full suite：**2239 PASS / 5 FAIL**。五項失敗的測試名稱與完整錯誤訊息均與既有 PDF reconstruction 基線 JSON 相同；**新回歸 NONE**。

Production code outside Storage Adapter changed: **NO**。Batch Foundation behavior changed: **NO**。App/UI changed: **NO**。Connector changed: **NO**。Concrete Matching changed: **NO**。Legacy REAL session restore changed: **NO**。Database/RLS/Auth changed: **NO**。

測試以 fake `window.sessionStorage` 驗證 Adapter 接口及 Foundation round-trip；真正 App 接線、同 tab 瀏覽器 F5 與使用者產品驗收仍屬後續整合工作，這裡不宣稱完成。

STOP.
