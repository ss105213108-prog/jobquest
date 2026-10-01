# Job Quest 104 Connector

正式的 Phase 6C Manifest V3 Extension。它只在使用者主動操作時讀取目前 104 Search Result DOM，依頁面順序擷取所有已載入且通過既有驗證的有效公開職缺，並以 `chrome.storage.session` 暫存最近一次 payload，期限 30 分鐘。擷取筆數依目前頁面而定；不自動翻頁或捲動。

## Development 安裝

1. 開啟 Desktop Chrome／Chromium 的 Extensions 頁面。
2. 開啟 Developer Mode。
3. 選擇 **Load unpacked**。
4. 選擇此資料夾：`browser-extension/jobquest-104-connector/`。
5. 開啟正式站 `https://jobquest-snowy.vercel.app`，或以 `npm run dev` 在 `http://localhost:5173` 開啟 Job Quest。
6. 在 Job Quest 選擇 104、輸入關鍵字與已支援地區，按「前往 104 搜尋」。
7. 在 104 搜尋結果頁按 Connector，選擇「擷取目前職缺」。
8. 回到 Job Quest，按「匯入並配對」。

## 權限

- `activeTab`：只在使用者按下 Connector 時暫時讀取目前 104 分頁。
- `scripting`：注入套件內的 `capture-jobs.js`，只讀取已顯示 DOM。
- `storage`：只使用 `chrome.storage.session` 保存最近一次 payload；不使用 `storage.local`。
- App bridge 僅注入 `http://localhost:5173/*` 與 `https://jobquest-snowy.vercel.app/*`。頁面、訊息及 background sender 都核對這兩個明確 origin；其他網站及 Vercel preview 網址不允許。

更新檔案後，在 `chrome://extensions`（或 `edge://extensions`）重新載入此 Extension，再重新整理 Job Quest 分頁，讓新 bridge 注入。無痕使用需由使用者在 Extension 詳細資料開啟「允許在無痕模式中執行」。

Extension 不申請 `cookies`、`history`、`tabs`、`downloads`、`webRequest`、`<all_urls>` 或 104 永久 host permission。它不讀履歷、不碰 Gmail、不呼叫 104 private API、不自動翻頁、不開 Detail、不保存 raw DOM。
