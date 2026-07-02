# 全 Repo 健檢報告與優化指南 v2（2026-07-02）

> 範圍：產品功能（以 KKday 長期使用者視角）＋ 工程全面健檢（架構、程式碼結構、SEO、資安、潛在 bug、技術債）
> 基準 commit：`abcdba7`（main）
> 產出時間：2026-07-02（Asia/Taipei）
> 前次健檢：[repo-health-audit-20260611.md](./repo-health-audit-20260611.md)（基準 `763f48f`）
> 方法：三路全 repo 掃描（產品功能盤點／架構與技術債／SEO 資安）＋ 前次健檢逐項追蹤，高風險主張逐一人工複核原始碼後成文。

---

## 總評

| 面向 | 前次 | 本次 | 一句話結論 |
|---|---|---|---|
| 產品完成度 | ★★★★☆ | ★★★★☆ | 前次 P0/P1 全落地（評論、篩選、促銷、改期、留言串），新缺口移到「憑證核銷／完成鏈路漏單、金流多元化、登入方式」 |
| 系統架構 | ★★★★☆ | ★★★☆☆ | 設計仍成熟，但 `db.mjs` 反向增長 58%、legacy 退役卡關，債務淨值變差 |
| SEO | ★★★★☆ | ★★★☆☆ | 單語系時代的優等生；上了英文站之後 canonical/hreflang/`<html lang>` 全缺，成為最大 SEO 洞 |
| 資安 | ★★★★☆ | ★★★★☆ | 前次 3 個補強點全修；本次深掘出密碼雜湊強度與 timing-safe 比對等新的第二層問題 |
| 潛在 bug 防護 | ★★★★★ | ★★★★☆ | 核心防護不變；扣分來自 source-contract 測試佔比 55% 與 fallback 契約測試仍缺 |
| 技術債 | ★★★☆☆ | ★★★☆☆ | 還了 5 筆（audit-log、faq 雙檔、殭屍套件、console.log、scratch scripts），又借了 2 筆大的（db.mjs、雙訂單頁） |

**規模快照**：`apps/web/src` 計 `.mjs` 101／`.ts` 84／`.tsx` 58；單測 522 個 `.test.mjs`；E2E 137 個 `.spec.ts`；CI workflow 18 個；`db.mjs` 7,155 行。

---

## 第零部分：前次健檢（2026-06-11）追蹤矩陣

前次路線圖切出的 issues **全數結案**（#1373–#1387、#1401、#1408、#1411，GitHub 實查），三週執行力極佳。逐項核實：

| 前次建議 | Issue | 現況（本次原始碼複核） |
|---|---|---|
| login endpoints rate limit | #1373 | ✅ adminLogin/guideLogin limiter 上線（`src/lib/rate-limit.ts`，只計失敗次數） |
| admin cookie `Secure` flag | #1374 | ✅ production 帶 Secure（`src/lib/admin-session.mjs`） |
| HSTS＋CSP report-only | #1375 | ✅ `next.config.mjs:39-47`（HSTS 31536000；CSP Report-Only 試行中） |
| faq-route-helpers 雙檔收斂 | #1376 | ✅ `.ts` 現僅 13 行 re-export，production 與測試指向同一實作 |
| 移除 packages/ui＋scratch scripts | #1377 | ✅ 皆已移除 |
| Product JSON-LD＋動態 OG | #1378 | ✅ `activity-jsonld.mjs`＋`resolveActivityOgImage` |
| 旅客評論撰寫 | #1379 | ✅ 完成訂單可評，星等＋文字＋照片×5（`app/me/orders/[orderId]/`） |
| 日期可訂＋價格區間篩選 | #1380 | ✅ `ActivitiesContent.tsx` |
| Promo code 旅客端曝光 | #1381 | ✅ `PublicPromoBanner`＋公開促銷碼 API |
| 推薦＋最近瀏覽 | #1382 | ✅ `ActivityRecommendations` |
| 訂單改期 | #1383 | ✅ >168h 自助改期，可撤回 |
| fallback 契約測試 | #1384 | ⚠️ issue 已結，但 `services.mjs` 與 `db.mjs` 的建單/付款雙實作仍無系統性契約測試覆蓋（見 D2） |
| db.mjs strangler | #1385 | ⚠️ audit-log 收斂至 `audit-log.mjs`、退款狀態機收斂至 `refund-transition.mjs` ✅，但主體反向增長（見 A1） |
| Legacy 退役時間表 | #1386 | ⚠️ 階段一（凍結）生效；階段二/三（#1406/#1407）`status:blocked` |
| 旅客 profile 編輯 | #1387 | ✅ `app/me/profile/page.tsx` |
| 老客專屬碼 | #1408 | ✅ 掛在評論邀請信 |
| 訂單留言串 | #1411 | ✅ traveler↔guide，付款後～completed+14 天 |

另兩項工程衛生也已改善：production `console.log` 從多處收斂到 `src/lib` 剩 5 處；全 `apps/web/src` 真實 TODO/FIXME/HACK 為 0。

**惡化項（本次新增紅字）**：`db.mjs` 4,527 → **7,155 行（+58%）**——strangler 抽出的量遠小於新塞進去的量（KPI 設定、營運追蹤、出款結算、admin dashboard 等新職責全進了同一檔）。

---

## 第一部分：KKday 長期使用者視角的功能優化建議（v2）

### 先肯定：三週內補齊的體驗
評論撰寫（含照片）、日期可訂／價格篩選、促銷碼曝光、同類推薦＋最近瀏覽、自助改期、訂單留言串、老客回購碼——前次 P0/P1 清單全數上線。加上原有的三種預約模式（instant/request/scheduled）、退款試算、Q&A、LINE 綁定＋訂單查詢＋導購續接，**訂購漏斗與售後在同規模產品中已屬前段班**。

### P0 — 轉換與合規（KKday 使用者最有感的新落差）

#### 1. 電子憑證 QR code（核銷體驗缺席）＋ 完成鏈路漏單風險（本輪重大發現）
- **現況**：活動頁的「電子憑證」只是信任徽章文字（`policyEvoucher`）；全 repo 無任何 QR 產生（grep `QRCode/toDataURL/qr_code` 僅命中一支無關 e2e）。旅客出示方式停留在「打開訂單頁給導遊看」。
- **🔴 連帶發現（已複核）— 訂單「完成」目前純人工，無任何自動化**：
  - `booking-state.ts` 的 `complete()` 方法在 `app/`／`src/` **無任何 production 呼叫者**（僅測試呼叫）。
  - 4 個 cron sweep（`unpaid-expiry`／`pre-tour-reminder`／`review-invitation`／`settlement`）**沒有一個會把 `confirmed` 轉 `completed`**。
  - `settlement/sweep` 只結算「已是 completed」的訂單（`app/api/internal/settlement/sweep/route.ts:92` `.eq('status','completed')`）。
  - 唯一推進 `completed` 的路徑＝**admin 後台手動改狀態**（`app/api/admin/orders/[orderId]/route.ts` → `updateAdminOrderDb`）。
  - **後果**：只要沒人手動按完成，訂單永遠卡在 `confirmed` → 導遊帶完團卻結算不到款、completed 才觸發的評論邀請也不會發。這是**現存**漏單風險，非 QR 上線後才有。
- **KKday 視角**：付款完成 → 拿到帶 QR 的憑證（可存手機、可離線）是 OTA 的基本安心感；導遊掃碼核銷同時解決「completed 缺明確觸發者」。

- **建議（憑證＋漏單備援一併設計，核心原則：憑證永不是唯一證據，DB 訂單才是 source of truth）**：

  **第一層 — 憑證出示/掃描失效仍能核對**
  1. 同一份簽章資料多重呈現：QR 只是「訂單簽章 token（訂單號＋HMAC，複用 `guide-auth.ts` 簽章）」的一種畫法，訂單頁同時顯示人類可讀短碼＋姓名＋活動＋時間。
  2. 導遊當日出團名冊為權威 fallback：憑證系統整組失效，導遊仍可用短碼/姓名比對名冊放行。
  3. 離線可用：token 自帶簽章、不依賴掃描當下連線；截圖可出示。驗證失敗只擋「自動核銷」，不擋「人工放行」。

  **第二層 — 完成狀態備援（三道防線，皆冪等、共用同一 `complete` 轉移，重複處理為 no-op）**
  1. **自動完成 sweep（新 cron，仿 `unpaid-expiry-sweep`）**：`confirmed` 且 `scheduleEndAt < now − 寬限期`（建議 24–48h）且無 pending refund → 自動轉 `completed`。掃碼核銷＝提前、明確路徑；此 sweep 為兜底，確保結算/評論不靜默卡死。
  2. **漏單對帳告警**：查詢「出團結束超過寬限期仍停 `confirmed`」的訂單 → 經既有 `recordIncident`（`src/lib/incidents.ts`，含 PII 遮罩＋Telegram/email）通知營運。自動完成 cron 本身出錯時人也會被 ping。
  3. **admin 手動覆寫**：保留為終極人工 fallback。

  優先序：**掃碼核銷（最佳）→ 自動完成 sweep（兜底）→ 對帳告警（保險）→ admin 手動（終極）**，任一層失效由下一層接住。

#### 2. 登入方式單一（只有 Google OAuth）
- **現況**：`app/login/page.tsx` 僅 `signInWithOAuth({ provider: 'google' })`。無 Email/密碼、無 LINE Login、無 Apple。
- **KKday 視角**：長輩客群與公司信箱使用者直接卡在門口；LINE 重度整合的產品（綁定、查詢、導購都做了）卻不能用 LINE 登入，動線斷裂。
- **建議**：最小成本先開 Supabase Email OTP（magic link，免密碼管理）；LINE Login 已有 decision issue **#1526**，建議升優先——它能把 LINE 綁定與登入身分統一。

#### 3. 金流只有 ECPay 信用卡
- **現況**：旅客端僅信用卡（`/api/payments/ecpay/create` 跳轉）；匯款（transfer）受 `NEXT_PUBLIC_TRANSFER_PAYMENT_ENABLED` 控制且預設關閉。
- **KKday 視角**：LINE Pay／Apple Pay／超商代碼／ATM 是台灣 OTA 標配；高單價深度行程（數千～上萬）沒有分期，會直接掉單。
- **建議**：ECPay 本身支援 ATM/超商/分期，屬同一金流商的 ChoosePayment 參數擴充，邊際成本低——優先開 ATM＋超商代碼；LINE Pay 第二波。

> ~~電子發票欄位~~：**已由 owner 於 2026-07-02 拍板取消**——平台目前不經手發票，故不列為缺口，後續路線圖亦不實作。

### P1 — 體驗完整度

5. **加購／選配（add-on）缺席**：商品模型只有「方案」，無接送、餐食、器材租借等單品加購（`src/components` 無 addon 實作）。深度體驗（溯溪、探洞）的裝備加購是天然需求，也是客單價槓桿。
6. **列表頁無分頁／無限捲動＋無地圖**：`ActivitiesContent.tsx` 對 `filtered` 一次全渲染；排序僅推薦／價格二向，無「評價最高／最熱門」。活動數成長後體感會明顯變差。建議：先加無限捲動（IntersectionObserver）＋「評價」排序；地圖檢視待活動密度夠再做。
7. **評論互動陽春**：無評分分佈長條（5-4-3-2-1）、無「附照片」篩選、無導遊公開回覆。評分分佈是低成本高信任感的第一優先。
8. **無站內通知中心**：後端通知很完整（email／LINE／Telegram），但站內無鈴鐺；改期審核結果、留言回覆這類站內事件目前只能靠外部推播兜底。

### P2 — 成長基礎

9. **點數／會員等級**：目前優惠僅促銷碼（#1408 老客碼是好的起步），回購黏著仍缺結構性機制。
10. **ja/ko 開站**：locale 已 config（`src/i18n/routing.ts` 四語系）但 `VISIBLE_LOCALES` 只露出 zh-Hant/en；翻譯到位前先把 SEO 基建修好（見第三部分）。
11. **即時客服 widget**：現有客服動線＝訂單留言串＋Q&A，行前臨時狀況（找不到集合點）無即時通道；可先用「訂單頁顯示導遊行前聯絡電話（出發前 24h 內）」低成本頂上。

---

## 第二部分：資安健檢（v2）

前次 3 個補強點（rate limit、Secure flag、HSTS/CSP）全數修復 ✅。本次深掘出第二層問題，皆已人工複核原始碼：

### 需補強（依嚴重度）

#### 🟡 HIGH — S1. guide 密碼雜湊為單輪 SHA-256
- `src/lib/guide-auth.ts:58-62`：`hashPassword` = `SHA-256(salt + plain)` 單輪快雜湊。若 DB 外洩，離線暴力破解成本極低（GPU 每秒數十億次）。
- **建議**：改用 Node 內建 `crypto.scrypt`（零新依賴）；遷移策略——新格式加版本前綴（`scrypt$...`），登入成功時對舊格式透明升級（verify 舊雜湊 → 立刻以 scrypt 重存），無須強制重設密碼。

#### 🟡 MED — S2. token/簽章比對非 timing-safe
- `src/lib/admin-auth.mjs:20`：`token !== requiredToken`；`src/lib/guide-auth.ts:164`：`sig !== expected`。皆為短路字串比較。同 repo 的 `verifyPassword` 已示範常數時間比較（`guide-auth.ts:65-77`），標準不一致。
- **建議**：統一改 `crypto.timingSafeEqual`（長度不等時先比長度雜湊或直接 false）。半天內可完成。

#### 🟡 MED — S3. `x-admin-token` header 認證跳過 session 檢查
- `middleware.ts:361,371`：`requireSession: !hasHeaderToken`——帶 header token 的請求不驗 session_version 與到期時間。後果：`forceLogoutAllSessions`／token rotation 提升 session_version 後，**header-token 呼叫依然有效**（只有換掉 token 本身才失效）。
- **建議**：確認這是否為 automation 的刻意設計。若是，寫入 `docs/operations/credential-rotation-runbook.md`（「強制登出 ≠ 撤銷 header token，撤銷需 rotate ADMIN_ACCESS_TOKEN」）並讓 #1121 輪替 SOP 涵蓋；若否，header 認證也套 session 檢查。

#### 🟡 MED — S4. `/api/orders` 的 middleware CSRF gating 落空
- `middleware.ts` `shouldRequireCsrf`：前綴白名單含 `/api/orders`（`:122`），但底下的 cookie-gating 分支（`:137-142`）只處理 admin/guide/me/reviews，`/api/orders` 落到最後 `return false`——**mutation 實際不經 middleware CSRF**。
- 緩解：legacy `/api/orders` 已被 `BOOKING_V2_PRIMARY` 410 gate 擋主流量。但白名單寫了卻沒生效是明確的 code 與意圖不一致，且 `?mode=legacy` opt-in 路徑仍可達。
- **建議**：補上 `if (pathname.startsWith('/api/orders')) return hasTravelerAuthCookie(req);`（與 me/reviews 同型），並加 middleware 單測鎖定。

#### 🔵 LOW — S5. 縱深項
- **Rate limiter 為記憶體 Map**（`src/lib/rate-limit.ts:24`）：Vercel serverless 各實例獨立、冷啟重置，對分散式暴力破解防護有限。量級起來後改共享儲存（Upstash Redis）。
- **CSP 仍 Report-Only** 且 `script-src` 含 `unsafe-inline unsafe-eval`（`next.config.mjs:27,46`）：屬刻意漸進（避免誤擋 ECPay），建議訂 enforce 時程（收 report 4 週 → nonce 化 → enforce）；HSTS 可加 `preload`。
- **無 schema validation 庫**（zod 全 repo 0 命中）：全手寫驗證，品質不一。建議 v2 route 先行導入 zod，legacy 凍結不回補。

#### 🔴 既有 blocker — S6. #1121 git 歷史憑證輪替仍 open
- service_role JWT ×7、sbp_ PAT ×5、admin token ×10、anon JWT ×4 曾入 git 歷史，issue 標記「正式上線前執行」但 `status:needs-decision`。**這是本報告資安面的第一優先**——上述 S1-S5 都是「加深防線」，這條是「已知外洩面」。

### 已到位／已排除的疑慮
- 三層 auth 設計、CSRF double-submit、ECPay CheckMacValue、付款冪等 atomic RPC、RLS（37 個 migration 檔啟用、129 條 policy、payment_events 已硬化）、service-role key 零前端外洩、trusted-ip 不信任裸 `x-forwarded-for`。
- **XSS**：`serialiseJsonLd` 有轉義 `<`（`activity-jsonld.mjs:34`），28 處 `dangerouslySetInnerHTML` 皆為 JSON-LD 或靜態字串，無使用者輸入直注。

---

## 第三部分：SEO 健檢（v2）

### 已到位（維持強項）
全頁 metadata／generateMetadata（活動頁含動態 OG）、動態 sitemap（每小時 revalidate）＋robots、JSON-LD 四件套（BreadcrumbList／TouristAttraction／Product+Offer+AggregateRating／FAQPage）、活動頁 on-demand ISR（`revalidate = 60`，SSR HTML 完整）、next/image AVIF/WebP＋LCP preload、GA4 已接（#1522）。

### 本輪新發現：多語系 SEO 基建全缺（🔴 最大缺口）

英文站已透過 next-intl 上線（`/en` 前綴，`src/i18n/routing.ts`），但配套 SEO 三件全missing（皆已 grep 複核）：

1. **零 canonical／hreflang**：全 `apps/web/app` 無任何 `alternates` metadata。zh 與 en 版互為重複內容卻沒有告訴搜尋引擎對應關係——會分散權重、且可能索引錯語系。
2. **`<html lang>` 硬編 `zh-Hant`**（`app/layout.tsx:73`）：`/en` 頁面 lang 仍是 zh-Hant，`app/[locale]/layout.tsx:14-15` 註解已自承此缺陷（待 root layout 重構）。影響 SEO 語系判定與螢幕閱讀器。
3. **sitemap 只列 zh-Hant URL**（`app/sitemap.ts`）：無 `/en` 變體、無 sitemap alternates。

**建議（一個 PR 可完成大半）**：
- 各頁 `generateMetadata` 補 `alternates: { canonical, languages: { 'zh-Hant': ..., 'en': ... } }`——集中寫一個 `buildAlternates(path, locale)` helper 全站複用。
- sitemap entries 加 `alternates.languages`（Next.js sitemap 原生支援）。
- `<html lang>` 修正需依 next-intl 官方 pattern 把 `<html>` 移入 `[locale]/layout.tsx`（中型重構，可後行；先讓 canonical/hreflang 上線）。

### 次要
- 排序／篩選參數頁面（`?sort=`、`?region=`）目前靠 client render 天然不產生重複索引，canonical 上線後一併指向乾淨 URL 即可。
- ja/ko 開站前，`VISIBLE_LOCALES` 之外的 locale 應確保回 404 或 noindex（避免半成品被收錄）。

---

## 第四部分：架構、程式碼結構與技術債（v2）

### 🔴 A1. `db.mjs` 反向增長：4,527 → 7,155 行（+58%）
- strangler（#1385）抽出了 audit-log 與 refund-transition ✅，但同期塞入 KPI 設定（`getKpiConfigDb:1733`）、營運追蹤（`operationsTrackingSummaryDb:2004`）、admin dashboard（`adminDashboardSummaryDb:2228`）、結算出款（`getSettlementRulesDb:1621`）等新職責，單函式 200–500 行者眾（`updateAdminOrderDb:1107`、`getActivityBySlugDb:3027`）。
- **建議：從「順手抽」升級為硬規則**——(1) **新函式禁入 `db.mjs`**：新資料存取一律開領域檔（`db-settlement.mjs`、`db-kpi.mjs`…），CI 加 source-contract 測試鎖行數上限（現成測試風格正好擅長這件事）；(2) 每季訂淨減目標（如 -1,000 行）；(3) CLAUDE.md 的 strangler 準則同步更新為硬規則。

### 🔴 A2. Booking V2/legacy 雙軌退役卡關
- 階段一凍結生效；階段二（#1406 移除 fallback UI）、三（#1407 刪 legacy routes）皆 blocked。V2 開關語意散在 3 個環境變數（`NEXT_PUBLIC_BOOKING_V2_ENABLED`／`BOOKING_V2`／`BOOKING_V2_PRIMARY`），需人工保持一致。
- 前台也有雙軌殘留：`/orders`＋`/orders/[orderId]` 與 `/me/orders` 兩套訂單頁、`app/checkout` 舊結帳頁並存。
- **建議**：先解 #1406/#1407 的 blocker（觀察窗 #642 收斂條件），未退役前至少把 3 個 flag 收斂為單一來源（`feature-flags.mjs` 統一導出、其餘兩個標 deprecated）；前台 `/orders` → `/me/orders` 301 redirect 是低風險先手棋。

### 🟡 A3. 101 個 `.mjs` 檔不受 TypeScript 檢查
- `tsconfig.json` `strict: true` 但 `allowJs: true`——**整個資料層與付款層（db.mjs 7,155 行、admin.mjs、services.mjs）在型別檢查之外**。這比 issue #68 追的 `.ts` strict 缺口更根本：最關鍵的錢流程式碼是型別盲區。
- **建議**：不必大遷移；對 `.mjs` 核心檔頂部加 `// @ts-check`＋JSDoc 型別註解即可讓 `tsc --noEmit` 納管（逐檔漸進，與 strangler 拆檔同時做）。

### 🟡 A4. source-contract 測試佔 55%（289/522 用 `readFileSync`）
- regex 斷言原始碼字串的測試對重構脆弱、不驗 runtime 行為；`services.mjs`（fallback）與 `db.mjs`（Supabase）的建單/付款/退款雙實作仍缺系統性「同輸入同輸出」契約測試（#1384 已建範本 `tests/api/issue1384-flow-contract.test.mjs`，但覆蓋面窄；#1401 的 fallback 分歧 bug 即為實證）。
- **建議**：訂測試金字塔目標——新測試優先寫行為測試（跑 in-memory seam）；source-contract 保留給 route wiring 鎖定；針對 createOrder／paymentCallback／refund 三鏈路補雙實作契約測試各一套。

### 🟡 A5. 可觀測性與 API 一致性
- Sentry 上報收斂在 `src/lib/incidents.ts` 的 `recordIncident`（含 PII 遮罩，設計好），但全 repo 僅 4 處 `captureException`——未呼叫 `recordIncident` 的流程出錯即靜默。建議：v2 route 的 catch-all 統一過 `recordIncident`。
- API 錯誤 shape 兩套並存：legacy `fail(code,message)`（123 route）vs V2 `errorV2`（28/31 route 遵循）。隨 legacy 退役自然收斂，V2 新 route 維持 100% `errorV2` 即可。

### 🟢 A6. Quick wins（各 <1 小時）
| 項目 | 位置 | 動作 |
|---|---|---|
| TS 版本不一致（前次已列，仍未修） | app `typescript@6.0.2` vs root `^5.9.3` | 對齊單一版本 |
| `packages/config` 名不符實 | 只剩 README，宣稱的 3 個 config 檔不存在 | 補檔或刪包 |
| `@types/node@25` vs `engines >=22` | `apps/web/package.json` | 降到 `@types/node@22` |
| 剩餘 5 處 console.log | `src/lib` | 收斂進 logger/移除 |

---

## 第五部分：優化路線圖（v2）

> 按可直接開票的粒度撰寫；是否開 GitHub issues 待 owner 決定。既有追蹤不重複開：#1121（輪替）、#1526（LINE Login）、#1406/#1407（legacy 退役）、#68（TS strict）、#1344（mobile LCP）、#1365（出款排程）、#1336（internal cron）。

### 立即（quick wins，各 ≤1 天）— **✅ 全數已於 2026-07-02 實作**
1. ✅ 【資安】admin token／guide HMAC 改常數時間比較（S2）— `src/lib/constant-time.mjs`＋`tests/security/timing-safe-compare.test.mjs`
2. ✅ 【資安】修 `/api/orders` CSRF gating 落空＋middleware 單測（S4）— 含 `client-api.ts` createOrder 補 csrf header
3. ✅ 【SEO】全站 canonical＋hreflang helper＋sitemap 語系變體（SEO-1/3）— `src/lib/seo-alternates.ts`，六個核心頁＋sitemap 已接
4. ✅ 【資安】guide 密碼雜湊改 scrypt＋透明升級遷移（S1）— 舊格式相容、登入時無感升級、admin route 重複實作一併收斂
5. ✅ 【債】TS 版本對齊（root 6.0.2）＋`@types/node` ^22＋`packages/config` 移除（A6）

### 短期（1–2 週，轉換率與合規優先）
6. 【產品 P0＋🔴 修漏單】電子憑證 QR＋導遊掃碼核銷（P0-1 主體）；**✅ 自動完成 sweep cron＋漏單對帳告警已實作（#1554，2026-07-02）**— `db-auto-complete.mjs`＋`/api/internal/bookings/auto-complete-sweep`＋每日 workflow
7. 【產品 P0】Supabase Email OTP 登入（P0-2 前半；LINE Login 走 #1526）
9. 【產品 P1】活動列表無限捲動＋「評價最高」排序（P1-6）
10. 【資安】S3 header-token session 政策決策＋文件化；**#1121 憑證輪替排期執行**
11. 【SEO】`<html lang>` 隨 locale 修正（root layout 重構）

### 中期（1–2 月）
12. 【產品】ECPay 付款方式擴充：ATM＋超商代碼（P0-3 第一波）；分期與 LINE Pay 評估
13. 【產品】加購（add-on）資料模型＋結帳整合（P1-5）
14. 【產品】評分分佈＋照片篩選＋導遊回覆（P1-7）
15. 【債】db.mjs strangler 硬規則：新函式禁入＋行數上限 CI 鎖＋首批領域檔拆分（A1）
16. 【債】三鏈路雙實作契約測試（createOrder/paymentCallback/refund）（A4）
17. 【債】`.mjs` 核心檔 `@ts-check` 漸進納管（A3）
18. 【資安】CSP enforce 時程（report 收斂→nonce→enforce）；rate limiter 共享儲存評估（S5）
19. 【債】V2 flag 三變數收斂＋`/orders`→`/me/orders` redirect（A2 先手棋）

### 長期（成長基礎，接 #1388）
20. 站內通知中心（P1-8）
21. 點數／會員等級（P2-9）
22. ja/ko 開站（先確保未開 locale noindex）（P2-10）
23. 即時客服（先做出發前 24h 導遊聯絡資訊）（P2-11）

---

## 附錄：關鍵檔案索引（本次新發現）

| 主題 | 檔案 |
|---|---|
| 密碼雜湊／HMAC 比對 | `apps/web/src/lib/guide-auth.ts:58-62,164` |
| admin token 比對／header 繞過 | `apps/web/src/lib/admin-auth.mjs:20`、`apps/web/middleware.ts:361-372` |
| CSRF gating 落空 | `apps/web/middleware.ts:111-144`（`/api/orders`） |
| canonical/hreflang 缺口 | `apps/web/app/layout.tsx:73`、`apps/web/app/sitemap.ts`、`apps/web/src/i18n/routing.ts` |
| db.mjs 單體（7,155 行） | `apps/web/src/lib/db.mjs` |
| fallback 雙實作 | `apps/web/src/lib/{store,services,admin}.mjs` |
| V2 flag 三變數 | `apps/web/src/config/feature-flags.mjs`、`app/api/orders/route.ts:23-50` |
| 登入單一方式 | `apps/web/app/login/page.tsx` |
| 憑證徽章（無 QR） | 活動頁 `policyEvoucher` 文案（`app/[locale]/activities/[region]/[slug]/page.tsx`） |
| 完成狀態純人工（漏單源） | `booking-state.ts:332`（`complete()` 無 production 呼叫者）、`app/api/admin/orders/[orderId]/route.ts`（唯一觸發）、`app/api/internal/settlement/sweep/route.ts:92`（只結算已 completed） |
| guide 密碼強度下限偏低 | `app/api/guide/auth/session/route.ts:94`（`password.length < 6`） |
| Rate limiter | `apps/web/src/lib/rate-limit.ts` |
| 事故上報單點 | `apps/web/src/lib/incidents.ts` |
