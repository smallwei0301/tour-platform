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

## 既有問題（非本輪造成，已用 clean tree 覆核）

以下兩項在**未套用本輪變更**的乾淨工作樹上同樣失敗，屬既有債，本輪未處理：

1. `e2e/guide-familiar-regions-payments.spec.ts:103` — 期望 `['高雄','屏東','台南']`，
   實際 PATCH 送出全名 `['高雄市','屏東縣','台南市']`。頁面載入時以
   `normalizeRegionToDbValue` 正規化為全名是既有設計，spec 期望值過期。
2. `e2e/i18n-footer-guides.spec.ts:35` — 期望英文 h1 含 `local guides across Taiwan`，
   實際為 `Meet the Guides`（`messages/en.json` 未在本輪改名範圍內）。

另：`e2e/guide-profile-contact-qa.spec.ts` 的 CTA 點擊偶發 flaky（goto 後立即 click 撞
hydration，見 `lessons.md` 2026-07-30 條）——clean tree 亦可重現，本輪未改該 spec 邏輯。

## 未於本輪驗證

- **生產環境實測**：`NOT_VERIFIED-live`。blocker＝本 session 無生產部署權限，且冷啟動環境
  不宜灌入測試申請資料。建議 merge 後由 owner 在 preview／production 各送一筆測試申請，
  確認 admin 後台「嚮導申請」列表與詳情頁顯示完整（含 `bio` 內的補充欄位）。
