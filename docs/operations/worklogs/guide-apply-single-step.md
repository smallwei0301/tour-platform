# Worklog — 嚮導申請流程單頁化（`/guide/apply`）

- **Branch**：`claude/guide-application-simplify-0jvs5u`
- **開始時間**：2026-07-30（Asia/Taipei）
- **需求來源**：使用者對話 + 招募文宣海報（`在地嚮導招募中！`）

## 需求（使用者原話摘要）

1. 簡化成只有一個流程，不需要目前就提證件驗證等。
2. 可自由選填是否上傳照片，如個人照或活動照。
3. 第一頁的文案和選填內容重新編輯，符合文宣海報內容。
4. 不要使用導遊字眼，全面改成嚮導，包括 footer 標題也是。
5. 完成後管理者後台一樣要能得知嚮導申請資訊，維持目前一樣的功能與後台流程。

## 使用者拍板決策（2026-07-30 對話）

- **改名範圍**＝「旅客可見面向 + footer」：`/guide/apply` 全頁、Footer／Navbar 標題、
  `messages/zh-Hant.json` 旅客可見文案與 SEO metadata。**Admin 後台頁與交易通知信維持現狀**
  （全站共 179 檔／703 處，136 個測試檔有斷言，全掃風險過高）。
- **旅程類型**＝「平台四大分類（山徑／野溪／文化／生態）+ 海報補充」：`specialties` 維持
  與 `category-tags.mjs` 同源避免標籤漂移，另加「其他想帶的旅程類型」自由填寫欄承接海報的
  美食／攝影／親子／在地生活。

## 設計決策

### 不動 schema（關鍵，對應需求 5）

海報新增的欄位（推薦祕境、帶團經驗、方便聯絡時間、LINE ID、其他旅程類型）**不新增 DB 欄位**，
而是在送出前組合進既有的 `bio` 欄（每行一個 `標籤：值`）。理由：

- `guide_applications` 既有欄位（`full_name` / `phone` / `email` / `city` / `bio` /
  `specialties` / `languages` / `regions` / `payment_methods` / `profile_photo_url` /
  `gallery_urls`）已足夠承載，管理者後台讀 `bio` 就看得到全部補充資訊。
- 免 migration ⇒ 免 `SQL-OVERRIDE`、免 apply ledger，後台流程零改動（鐵律 2、4）。
- `db-guide-applications.mjs` 的三層 schema-drift fallback 完全不必動。

### 表單必填最小化

必填只留「聯絡得上人」所需的四欄：`fullName` / `phone` / `email` / `city`。
其餘（含全部照片與補充說明）皆選填。

**注意**：DB 層 `createGuideApplicationDb` 額外硬要求 `bio` 非空。補充說明改選填後，
若使用者全部留空，組出來的 `bio` 會是空字串而被後端 400 擋掉；故 bio 組裝加上
fallback 佔位文案「（申請者未填寫補充說明，請於聯繫時確認）」。這樣既不動 DB 契約，
管理者後台也看得出來這筆是「沒填補充說明」而不是資料掉了。
e2e `guide-apply-pipeline.spec.ts`「只填必填四欄即可送出」鎖住此行為。

## 變更清單

| 檔案 | 變更 |
|---|---|
| `apps/web/app/(non-locale)/guide/apply/page.tsx` | 三步驟 → 單頁；文案改用海報內容；照片全選填 |
| `apps/web/app/(non-locale)/guide/apply/layout.tsx` | metadata 導遊 → 嚮導 |
| `apps/web/app/api/guide-applications/route.ts` | 移除 `profilePhotoUrl` 必填檢查 |
| `apps/web/messages/zh-Hant.json` | 旅客可見文案 導遊 → 嚮導 |
| 其餘旅客可見頁／元件 | 導遊 → 嚮導（見 commit diff） |
| 測試 | 更新受影響 API／UI／e2e，新增單頁流程守門測試 |

## 進度

- [x] 讀 CLAUDE.md ＋ harness 00
- [x] hooks 煙霧測試（見下方「hooks 驗證」）
- [x] 盤點現況（page/API/db/admin/tests）
- [x] 使用者拍板兩項設計決策
- [x] 實作（單頁化＋照片選填＋海報文案＋改名 45 檔）
- [x] `run-checks.sh --all` 綠燈：4826 tests / 0 fail
- [x] typecheck 0 error、lint 0 error
- [x] e2e 真瀏覽器驗證（申請流程 3 passed；改名波及＋後台 12 passed）
- [x] QA 報告：`docs/operations/qa-reports/guide-apply-single-step-2026-07-30.md`
- [x] commit / push

## 實作結果

### 改名範圍（使用者拍板：旅客可見面向 + footer）

45 個使用者可見檔案＋`messages/zh-Hant.json`（115 處）完成 導遊 → 嚮導：
`app/(non-locale)/{guide,for-guides,guides,login,me}/**`、`app/[locale]/**`、
`src/components/**`（admin 元件除外）、`src/lib/seo/site-metadata.ts`。

**刻意不動**：`app/(non-locale)/admin/**`、`app/api/**`（除公開申請 route）、
`src/lib/email.ts`、`db*.mjs` 等內部訊息 —— 使用者選項明確排除管理者後台與交易信件。
**刻意保留字面**：`導遊證`（官方證照名，改成「嚮導證」會是錯的），出現在
`for-guides` FAQ 與 `guide/profile` placeholder。

### 測試調整（皆為刻意行為變更，非遷就實作）

| 測試 | 調整原因 |
|---|---|
| `tests/api/guide-application-photos.test.mjs` | 個人照片必填 → 全選填；補「無照片也能建立申請」行為斷言 |
| `tests/ui/issue1093-guide-apply-file-accept.test.mjs` | 導遊後台 → 嚮導後台；措辭隨選填調整 |
| `tests/api/guide-application-profile-pipeline.test.mjs` | 改鎖新的送出後審核聯繫說明文案 |
| `tests/api/settlement-rules-alignment.test.mjs` | 嚮導實拿 85%（admin KPI 頁仍為導遊，未動） |
| `tests/ui/booking-page-shell-flag.test.mjs` | `bookingFlow.noteLabel` 文案隨品牌用語更新（仍鎖同一 messages key） |
| `tests/ui/guide-profile-contact-qa.test.mjs`、`issue619-admin-schedules-legacy-label.test.mjs` | 嚮導後台／嚮導頁面／嚮導可售時段規則 |
| `e2e/guide-apply-pipeline.spec.ts` | 重寫為單頁流程＋新增「完全不上傳照片」案例 |
| `e2e/{guide-apply-photo-compress,guide-familiar-regions-payments,for-guides-landing,guide-profile-contact-qa,i18n-blog-legal,i18n-footer-guides,issue1565-voucher-qr}.spec.ts` | 移除步驟導覽／同步改名後的可見文案 |
| **新增** `tests/ui/guide-apply-single-step.test.mjs` | 守門：不得回退多步驟、照片不得再 gating、海報文案與 bio 組裝、頁面不得殘留「導遊」 |

### e2e 共用 helper（新）

`e2e/helpers.ts` 新增 `fillFormHydrated()`：Next dev 下 hydration 前的 `fill()` 會被 React
初始 state 抹掉（詳見 `lessons.md` 2026-07-30 條）。新寫表單 spec 一律用它起頭。

## 既有債（clean tree 覆核確認非本輪造成）

1. `e2e/guide-familiar-regions-payments.spec.ts:103` regions 期望短名、實際存全名（spec 期望過期）。
2. `e2e/i18n-footer-guides.spec.ts:35` 英文 h1 期望值與 `messages/en.json` 不符。
3. `e2e/guide-profile-contact-qa.spec.ts` CTA 點擊偶發 hydration flaky。

三項皆在乾淨工作樹重現，本輪未處理（超出需求範圍），已記入 QA 報告。

## 環境備註（不進 repo）

映像預裝 Chromium build 1194，`@playwright/test` 1.58.2 要 1208 → 在 `/opt/pw-browsers/`
建 1208→1194 symlink 橋接（含把 `headless_shell` 改名成 `chrome-headless-shell`）即可跑，
不需要 `playwright install`。`playwright.config.ts` 的 `PW_EXECUTABLE_PATH` 在本環境沒生效
（headless shell 解析路徑不吃 `launchOptions.executablePath`），symlink 才是可行解。

## hooks 驗證（2026-07-30）

harness 00 步驟 0 的探針（Edit `CLAUDE.md` 填不存在字串）在本版 Claude Code **會出現假陰性**：
Edit 工具先做 `old_string` 比對驗證才觸發 PreToolUse hook，所以拿到的是一般「string not found」
錯誤而非 `HARNESS BLOCK`。改用兩個真陽性探針確認防線已武裝：

- `bash-guard`：`echo "probe: git push --force"` → `⛔ HARNESS BLOCK [bash-guard]` ✅
- `file-guard`：`Write .claude/hooks/__probe__.sh`（不存在的新檔，無覆蓋風險）→
  `⛔ HARNESS BLOCK [file-guard]` ✅

> 建議把這個假陰性寫進 `.cursor/harness/lessons.md`（本 session 稍後補）。
