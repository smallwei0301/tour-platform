# QA 驗收報告 — 嚮導申請流程單頁化＋用語改「嚮導」

- **驗收時間**：2026-07-30（Asia/Taipei）
- **Branch**：`claude/guide-application-simplify-0jvs5u`
- **驗收環境**：本機 Next dev（`127.0.0.1:3333`，Playwright webServer 同款環境變數）
- **受測頁面**：`/guide/apply`（線上對應 https://tour-platform-nine.vercel.app/guide/apply）
- **瀏覽器**：Chromium 141.0.7390.37（映像預裝 build 1194）

## 需求對應與逐條證據

| # | 需求 | 結果 | 證據 |
|---|---|---|---|
| 1 | 簡化成單一流程，移除證件驗證 | ✅ PASS | 三步驟 state machine 移除（無 `setStep`／步驟指示列／上一步下一步）；「身分證件核驗」區塊移除。守門測試 `tests/ui/guide-apply-single-step.test.mjs`；真實瀏覽器截圖為單頁表單 |
| 2 | 照片可自由選填（個人照／活動照） | ✅ PASS | 表單三個上傳欄位全標「（選填）」；送出鈕不再被 `!profilePhotoUrl` gating；API 端移除 `profilePhotoUrl is required`。e2e `guide-apply-pipeline.spec.ts:107`「照片完全不上傳也能送出申請」PASS |
| 3 | 第一頁文案與欄位重編、符合海報 | ✅ PASS | 標頭「在地嚮導招募中！」、海報引言、圓章金句「你的在地故事，就是旅人的祕境指南。」、「請填寫以下資訊」、「加入祕島，你可以」四格、揪團尾句全部上架；欄位比照海報（姓名／聯絡方式／居住縣市／熟悉地區／推薦祕境／帶團經驗／旅程類型／方便聯絡時間／其他想分享） |
| 6 | 「其他想分享的內容」改選填（追加需求） | ✅ PASS | 標示「（選填）」、移除 `required`；必填縮為姓名／電話／Email／居住縣市四欄。全空時 `bio` 走佔位文案避開後端非空檢查。e2e「只填必填四欄即可送出」PASS |
| 7 | 四大優點改用 SVG 圖示（追加需求） | ✅ PASS | 新增 4 個 inline SVG（個人頁卡片／山景定位／三人群像／$ 循環箭頭），比照海報 pictogram；`aria-hidden` 隱藏於輔助技術，顏色統一由 CSS `stroke` 控制。真實瀏覽器截圖確認四格 2×2 排版與圖示可辨識 |
| 4 | 全面改用「嚮導」，含 footer 標題 | ✅ PASS | 45 個使用者可見檔案＋`messages/zh-Hant.json` 完成改名；footer 顯示「認識嚮導／成為嚮導／嚮導開店／嚮導後台」（截圖可見）。`導遊證`（官方證照名）刻意保留 |
| 5 | 管理者後台仍能取得申請資訊、流程不變 | ✅ PASS | admin 頁／admin API／`db-guide-applications.mjs`／通知信 **零 diff**；e2e `admin-guide-application-detail.spec.ts` 3 項全 PASS；e2e round-trip 驗證海報新欄位隨 `bio` 落地可讀回 |

## 測試證據

| 項目 | 指令 | 結果 |
|---|---|---|
| 單元／API／UI 全套 | `.claude/hooks/run-checks.sh --all` | **4826 tests / 4823 pass / 0 fail / 3 skipped** ✅ |
| Typecheck | `npm run typecheck` | 0 error ✅ |
| Lint | `npm run lint` | 0 error（1 warning＝既有 `RootDocument.tsx` no-head-element，與本輪無關）✅ |
| e2e 申請流程 | `npx playwright test guide-apply-pipeline guide-apply-photo-compress` | 3 passed ✅ |
| e2e 改名波及＋後台 | `... admin-guide-application-detail for-guides-landing guide-profile-contact-qa issue1565-voucher-qr guide-apply-pipeline` | 12 passed ✅ |

## 設計決策（供審閱）

- **不新增 DB 欄位**：海報新增的推薦祕境／帶團經驗／其他旅程類型／LINE ID／方便聯絡時間，以
  `標籤：值` 逐行組進既有 `bio`。因此免 migration（免 `SQL-OVERRIDE`、免 ledger），
  `guide_applications` schema 與後台讀取流程完全不動 —— 這是需求 5 的實作方式。
- **必填最小化**：`createGuideApplicationDb` 硬要求 `fullName`／`phone`／`email`／`city`／`bio`，
  故僅這五項必填，其餘（含全部照片）選填。
- **旅程類型**＝平台四大分類（`CATEGORY_OPTIONS` 同源，避免與行程 badge／主題篩選標籤漂移）
  ＋「其他想帶的旅程類型」自由填寫欄承接海報的美食／攝影／親子／在地生活（使用者拍板）。
- **改名範圍**＝旅客與嚮導可見面向＋footer（使用者拍板）。`admin/**` 頁面、交易通知信、
  `db.mjs` 等內部訊息維持「導遊」；官方證照名「導遊證」不改。

## 既有債（先以 clean tree 確認非本輪造成，後續一併修掉）

三項都是既有紅燈／flaky（在未套用本輪變更的乾淨工作樹上同樣重現），使用者指示一併處理：

| # | 問題 | 根因 | 修法 |
|---|---|---|---|
| 1 | `guide-familiar-regions-payments.spec.ts:103` 期望 `['高雄','屏東','台南']`，實際 PATCH 送全名 | **斷言過期**，非產品 bug。熟悉區域統一存全名是既有契約（`normalizeRegionToDbValue`），mock 的 GET 回舊短名資料，頁面載入時正規化成全名 | 改期望全名，並加一條「不得殘留未正規化短名」的反向斷言 —— 順帶把「舊短名資料會被升級」這個原本沒測到的契約鎖住 |
| 2 | `i18n-footer-guides.spec.ts:35` 期望英文 h1 含 `local guides across Taiwan`，實際 `Meet the Guides` | **斷言抓錯元素**。該字串是 `guides.resultCount`（`{n} local guides across Taiwan`），渲染在 `.tp-result-title`；h1 是 `guides.pageTitle` | h1 改斷言 `Meet the Guides`，另加一條對 `.tp-result-title` 的斷言 —— 兩個文案都真的驗到，比原本只驗一個更嚴 |
| 3 | `guide-profile-contact-qa.spec.ts` CTA 點擊偶發 flaky | `goto()` 後立刻 `click()` 落在 hydration 前，onClick 未掛上 → 點了等於沒點（與 `fillFormHydrated` 同源問題） | 新增 `clickUntilExpanded()` helper：用 React 控制的 `aria-expanded` 當成功信號並重試點擊。安全前提＝該按鈕 `setOpen(true)` 只開不 toggle（已確認） |

**驗證**：三支 spec 9 項全 PASS；`guide-profile-contact-qa` 另以 `--repeat-each=4`
跑 12 次全 PASS 確認 flaky 已消除；連同申請流程與改名波及共 25 項 e2e 全 PASS。

> 註：#1 與 #2 都是**測試本身寫錯**而非產品行為錯誤 —— 修的是斷言，產品程式碼未動。
> 這兩條長期紅燈之所以沒被發現，是因為 CI 的 e2e smoke lane 只跑 4 支指定 spec，
> 這三支都不在其中。

## 未於本輪驗證

- **生產環境實測**：`NOT_VERIFIED-live`。blocker＝本 session 無生產部署權限，且冷啟動環境
  不宜灌入測試申請資料。建議 merge 後由 owner 在 preview／production 各送一筆測試申請，
  確認 admin 後台「嚮導申請」列表與詳情頁顯示完整（含 `bio` 內的補充欄位）。
