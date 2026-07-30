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

## 既有債（clean tree 覆核確認非本輪造成 → 使用者指示一併修掉）

1. `e2e/guide-familiar-regions-payments.spec.ts:103` — 斷言過期（regions 契約是存全名）。
   改期望全名＋加反向斷言鎖「舊短名資料會被正規化升級」。
2. `e2e/i18n-footer-guides.spec.ts:35` — 斷言抓錯元素（`local guides across Taiwan`
   是 `guides.resultCount` 而非 h1 的 `pageTitle`）。h1 改驗 `Meet the Guides`，
   另加 `.tp-result-title` 斷言，兩個文案都真的驗到。
3. `e2e/guide-profile-contact-qa.spec.ts` — hydration flaky。新增 `clickUntilExpanded()`
   helper（以 React 控制的 `aria-expanded` 當信號重試點擊；安全前提＝按鈕只開不 toggle）。

**#1／#2 都是測試本身寫錯，產品程式碼未動。** 長期沒被發現的原因：CI e2e smoke lane
只跑 4 支指定 spec（`issue1294`／`issue1269`／`issue1360`／`issue1365`），這三支都不在其中。

驗證：三支 spec 9 項全 PASS；contact-qa 以 `--repeat-each=4` 跑 12 次全 PASS；
連同申請流程與改名波及共 25 項 e2e 全 PASS。

## 追加變更（owner 指示）

1. **補充說明改選填**（見上方「表單必填最小化」）。
2. **四大優點改 inline SVG 圖示**：個人頁卡片／山景定位／三人群像／$ 循環箭頭，
   `aria-hidden` 隱藏於輔助技術，顏色由 `.lp-apply-perk-icon svg` 的 `stroke` 統一控制。
3. **移除 hero 分潤三格**（嚮導實拿 85%／平台抽成 15%／金流手續費由平台吸收／後台一站式）。
   - 連帶調整 `tests/api/settlement-rules-alignment.test.mjs`：該案例原本同時鎖
     apply page 與 dashboard 兩個 surface，現只鎖 dashboard（分潤條件的權威呈現處）。
   - `tests/ui/guide-apply-single-step.test.mjs` 加一條反向守門，防止這段文案日後
     被誤加回招募頁。
   - **提醒 owner**：申請者在送出前不會再看到分潤比例，要等通過審核、登入嚮導後台
     才看得到。若日後希望招募階段先講清楚條件，可改放在 `/for-guides`（該頁已有
     Beta 定價 NT$0＋15% 區塊），不必動招募頁版面。

## 追加需求：管理者通知 ＋ 後台看得到完整填寫內容（owner 反映沒收到信）

### 新增領域模組 `src/lib/guide-application/`

**為什麼開子資料夾**：architecture ratchet 有兩道天花板 ——
`email.ts` 行數上限 863（原本想把信件內容併進去，一寫就 943 行超標）、
`src/lib` 頂層檔案數上限 179（新增兩個頂層檔就 181 超標）。
兩者都指向同一個做法：新領域另開子資料夾。

| 檔案 | 職責 |
|---|---|
| `summary.ts` | **欄位清單單一來源**：email／Telegram／後台三個介面共用；一律回傳完整欄位並以 `filled` 標記，不做空值過濾 |
| `admin-email.ts` | 管理者通知信（借用 `email.ts` 的 `sendEmailWithContract` 與 `wrapEmail`） |
| `telegram-text.ts` | Telegram 純文字訊息（pure function） |
| `notify.ts` | fan-out orchestrator（best-effort，永不 throw） |

### 三項需求對應

1. **Email 得知所有填寫內容** → 寄給 `ADMIN_EMAIL_ALLOWLIST` 全員，表格列出**所有欄位**
   （未填的標「未填寫」並灰體斜體），頂部加未填欄位數摘要。
2. **Telegram 收到通知** → 走既有 `pushTelegramToAdmin`（`TELEGRAM_ORDER_CHAT_ID`），
   同一份欄位清單的純文字版。
3. **後台點名字看到所有填寫與未填寫** → 詳情頁改用 `buildGuideApplicationFields`，
   **舊行為是「空的就整段不顯示」**（owner 因此看不出申請者缺什麼），現在一律列出，
   並加「未填寫 N 項」徽章（`data-testid="application-unfilled-count"`）。

### 關鍵設計決策

- **不需要新環境變數**：`ADMIN_EMAIL_ALLOWLIST`／`RESEND_API_KEY`／
  `TELEGRAM_BOT_TOKEN`／`TELEGRAM_ORDER_CHAT_ID` 都是既有且已在 `.env.example` 列出。
  兩個管道靠「env 有沒有設」自然 self-skip，沒有額外 feature flag。
- **通知一律 best-effort**：`Promise.allSettled` ＋ 每腿各自 try/catch。申請者已經填完
  表單，不能因為通知寄不出去就讓他看到「申請失敗」（申請其實已進 DB）。
- **在 route 內 `await` 通知**（不 fire-and-forget）：serverless function 在 response
  送出後可能立刻凍結，不 await 會讓通知有機會送不出去。
- **不併進通知矩陣**（`notification-settings`）：該矩陣的 `NOTIFY_EVENTS` 明確只涵蓋
  訂單事件，硬塞會污染 admin 訂單通知 UI 與其斷言。
- **env 走 `getAdminAuthEnv()`**：ratchet 禁止新增直讀 env 的檔案；該 getter 已存在於
  凍結檔 `security-env.mjs`，只讀不改。
- **bio 佔位文案等同未填**：三個介面都把 `BIO_UNFILLED_PLACEHOLDER` 顯示成「未填寫」，
  不讓審核者誤以為申請者真的寫了東西。

### 順手修掉一個真的 XSS 破口

新寫的 escape 測試抓到：`wrapEmail(title, …)` 會把 title 原樣插進 `<title>`，
而通知信 subject 含申請人自填姓名（`/guide/apply` 是**公開端點**）→
`<script>` 會原樣進 email HTML。已在 `admin-email.ts` 對 subject 做 escape。
（其他既有 email 呼叫端也有同樣模式，但 subject 來源多為內部資料，本輪未擴大處理。）

## CI 對照（本輪確認）

`ci.yml` 跑 lint → typecheck → `npm test` → `build` → ISR smoke → preflight；
e2e 另在 `e2e-smoke.yml` 只跑 4 支 spec。本機已驗前四項全綠（`build` 需補
`GUIDE_SESSION_SECRET`／`ADMIN_ACCESS_TOKEN` 才過 startup-env 守衛，CI 由 secrets 提供）。

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
