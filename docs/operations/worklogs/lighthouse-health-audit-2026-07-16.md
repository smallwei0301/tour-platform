# Worklog — Lighthouse 全站健檢（2026-07-16）

> Branch：`claude/lighthouse-project-audit-s21poy`
> 任務：使用者要求「針對專案內容進行 lighthouse 的健檢」。
> 性質：唯讀稽核＋產出報告文件；**不改動任何生產程式碼**。

## 環境與方法

- 雲端 fresh container，Node v22.22.2、npm 10.9.7。
- **hooks 探針結果：未武裝**（Edit 探針只回一般 string-not-found，無 `⛔ HARNESS BLOCK`）——依 harness/00 §0，本 session 不觸碰生產碼，僅產出 docs。
- `npm install --ignore-scripts` → `next build`（production）→ `next start -p 3100`。
- 建置需要的 `GUIDE_SESSION_SECRET`／`ADMIN_ACCESS_TOKEN` 以**本地臨時假值**經環境變數提供（不落檔、不 commit、不弱化 guard）。
- 無 Supabase env → `hasSupabaseEnv()` fallback 到 in-memory seed store（測試 seam），頁面資料為種子資料。
- Lighthouse 12（npx 安裝於 scratchpad），Chromium（Playwright 內建 /opt/pw-browsers/chromium），headless=new，**行動裝置模擬（預設 config）**；`--proxy-server` 指向容器代理，外部資源（GTM、Unsplash/Pexels 圖）可正常載入，LCP 貼近真實。
- 稽核對象：本地 production build（非 Vercel 生產站）；8 個公開關鍵頁。

## 時間線

- 07:30（UTC）開機順序完成、hooks 探針判定未武裝。
- 07:32 build 第一次失敗：`STARTUP_ENV_INVALID`（production profile 需密鑰）→ 補本地假密鑰後綠燈。
- 07:34 `next start -p 3100` 起服務，8 頁 curl 全 200。
- 07:36 Lighthouse 批次開跑（home / activities / activity-detail / booking / guides / blog / for-guides / login）。
- 第一輪本地批次發現 3 頁客戶端拋錯（缺 `NEXT_PUBLIC_SUPABASE_*`）→ 以 stub 前端 env 重建重跑（附帶發現記入 QA 報告 §3）。
- 生產站批次嘗試：Chromium 不信任代理 MITM CA → 全數 interstitial 失敗；把 CA 加入 NSS 的操作被權限分類器判定超出健檢範圍 → **已復原（NSS store 清空）**，生產站標 `NOT_VERIFIED-live`。
- 第二輪本地批次 8 頁全數完成（Lighthouse 13.4.0、Chromium 141、mobile 模擬），無 runtimeError。
- 17:12（Asia/Taipei）QA 報告完稿。

## 結果摘要（詳見 QA 報告）

- P1：首頁 7 支影片 `preload="auto"` 共 ~14.6 MB（`ScrollWorldClient.tsx:50`）；booking/login CLS 0.95、guides 0.638（CSR 水合下推 footer）。
- P2：render-blocking CSS ~275 KB（~259 KB 未使用）；footer 對比、scroll-world 觸控目標、select 缺名、heading 跳級。
- 環境假象（不得開票）：console errors（GTM 代理＋`/_vercel/*` 404）、canonical/hreflang host 不一致、FCP/LCP 絕對值放大；meta-description（detail 頁）SSR 有、LH post-JS DOM 讀不到 → 待生產站覆核。
- 本 session hooks 未武裝 → 僅產出 docs，未動任何生產碼。

## 第三階段：PSI 生產實測追修（2026-07-17，PR #1732）

PR #1727 merge＋production 部署後，使用者以 PSI 實測首頁（mobile）：效能 55／A11y 96／BP 100／SEO 100、CLS 0——但「避免耗用大量網路資源」達 **33,911 KiB**，明細顯示 7 支影片 **webm＋mp4 雙格式全被抓滿**（檔案大小與 repo 逐一吻合）。「雙 `<source>`＋preload=metadata＋scrub seek」在 Chrome 上不可靠。

追修（PR #1732，branch 依 harness/08 §3 merge 回收重啟，無 force-push）：
- runtime `canPlayType` 挑單一格式（webm 優先），`<video src>` 單來源
- 僅 active±1 場景掛 `<video>`，SSR 0 個 video 標籤（preview 實測確認）
- footer 地區膠囊 padding 3px→5px（target-size）

實證：Playwright 初載 2 支/單 webm/影片流量 ~0、捲動換掛正常；本地 LH 首頁總頁重 3,917 KiB、零影片項。

**鐵律 6 CI 證據（head `0e1b8d2`，全綠）**：
- test：https://github.com/smallwei0301/tour-platform/actions/runs/29557678928/job/87813279618（success，05:38:11Z）
- scan：https://github.com/smallwei0301/tour-platform/actions/runs/29557678919/job/87813279506（success）
- Vercel Preview：success（DEPLOYED）

## 第四階段：生產站 PSI 實測收尾（2026-07-17 17:0x）

- 無 key PSI 匿名配額確認長期飽和（重置後仍 429）→ 使用者建立專屬 API key（已限制僅 PSI API）→ 批測成功（8 頁 mobile＋首頁 desktop；key 僅存於 session 環境變數，未落檔）。
- **首頁 mobile：Performance 55→92、LCP 17.3s→2.4s、頁重 33,911→8,082 KiB**；CLS 全站達標（booking 0.063）；BP/SEO 全站 100（noindex 頁除外）。§6 NOT_VERIFIED-live 解除，§3 環境假象全數獲生產站證實。
- 生產實測揪出的小尾巴本輪即修：footer 清單連結 target-size（全站 20 處）、導覽列搜尋按鈕缺 aria-label（desktop＋mobile menu）。
- 剩餘另案：全域 CSS 拆分（內頁 LCP 8.7–14.3s 的主因，FCP 預估可省 6.8–13.2s）、for-guides 對比 4 處、booking heading-order 1 處、booking `available-slots` 404 ×2（生產 slots 資料面，非本輪引入）。
- 詳細數據：QA 報告 §9。

## 產出

- QA 報告：`docs/operations/qa-reports/lighthouse-health-audit-2026-07-16.md`

## 第二階段：修復實作（使用者回覆「開工」授權）

防線狀態更新：bash-guard **實測有武裝**（曾攔截無證據 commit）；file-guard 對 Edit 未攔截（harness/00 §0 探針對凍結路徑 `middleware.ts` 無 HARNESS BLOCK）。已向使用者報告防線狀態後獲「開工」指示——本階段**人工自我執行凍結清單**，所有觸碰檔案均不在凍結區。

### 修改清單（依 QA 報告 §4 順序）

1. **P1 影片 preload**：`src/components/scroll-world/ScrollWorldClient.tsx` `preload="auto"`→`"metadata"`（scrub 引擎只需 readyState>=1；幀資料改 seek 時漸進抓取，poster 補位）。
2. **P1 CLS 佔位**（Playwright 實測水合後 `#main-content` 高度，412px/1350px 兩寬）：
   - `/login`：兩寬皆 980px → fallback `minHeight: 980`
   - `/booking/[activityId]`：1936px/1298px → `clamp(1250px, 2216px - 68vw, 1950px)`（線性內插）
   - `/guides`：1362px/589px → `clamp(560px, 1701px - 82vw, 1380px)`
3. **P2/P3 a11y**：
   - `globals.css`：`.tp-footer-region-link` alpha 0.5→0.6（對比 4.45→5.79）、`.tp-footer-copy` 0.45→0.6（3.87→5.79）；`.tp-breadcrumb a` 補 underline（link-in-text-block）
   - `scroll-world.module.css`：railDot 觸控目標 24×24（視覺圓點移 `::before`，gap 調整維持原視覺節奏）
   - `Footer.tsx`：App badge／FB／IG aria-label 改為包含可見文字
   - booking page：日期 `<select>` 改 `label htmlFor` 關聯（select-name）
   - `activities/ActivityCard.tsx`＋`ActivitiesContent.tsx`：卡片 h3→h2、篩選 h3→h2（heading-order；inline 鎖字級不動視覺）
   - `ActivityReviewsPanel.tsx`：評分分布 `role="table"`→`role="group"`（aria-required-children）

### PR #1727 CI 紅燈修復（2026-07-17）

首輪 CI `test` job 2 fail，皆為 booking 頁修改引起：(1) issue1069 測試 regex 依賴 `<select` 後緊跟 `data-testid`，被插入的 `id` 打斷 → 屬性序還原；(2) 架構 ratchet：檔案 1117 行 > 天花板 1111 → 精簡註解回 1111 行（未放寬天花板）。修復 commit `faf3578`，本地全套件 4680 tests 0 fail。

**鐵律 6 CI 證據（head `faf3578`，全綠）**：
- test：https://github.com/smallwei0301/tour-platform/actions/runs/29554473551/job/87803656099（success，04:20:30Z）
- scan：https://github.com/smallwei0301/tour-platform/actions/runs/29554473557/job/87803655847（success）
- Vercel Preview：success（preview DEPLOYED）

### 驗證

- lint 0 errors（剩 1 個既有 warning：RootDocument no-head-element，非本次引入）；typecheck 綠燈。
- `.claude/hooks/run-checks.sh apps/web/tests/unit/scroll-world-camera.test.mjs apps/web/tests/unit/scroll-world-scenes.test.mjs` 綠燈。
- 修復後 Lighthouse 對照（同環境、同設定重跑）：

| 頁 | Performance | A11y | CLS | 總頁重 |
|---|---|---|---|---|
| home | 54→55 | 92→**96** | 0→0 | **18,227→4,045 KiB** |
| activities | 55→55 | 91→**96** | 0→0 | – |
| activity-detail | 55→55 | 85→**97** | 0→0 | – |
| booking | 31→**55** | 83→**95** | 0.95→**0.025** | – |
| guides | 32→**55** | 91→**95** | 0.638→**0** | – |
| blog | 55→55 | 89→**96** | – | – |
| login | 31→**55** | 92→**96** | 0.95→**0** | – |

- booking 第一輪對照 CLS 仍 0.95：外層 Suspense fallback 只蓋水合前，`!activity`（fetch 活動資料中）的內層 loading `<main>` 仍是矮的 → 對該狀態補同款 clamp 佔位後單頁重測，CLS 0.95→0.025 ✅。
- 視覺抽查（Playwright 412px 截圖）：首頁 hero／導軌圓點、footer 地區連結、booking step1 表單皆正常。
- **既有問題備查（非本次引入）**：本地 seed 環境 booking 頁有「Invalid activityId」警示 banner（修改前批次截圖同樣存在），疑為 availability API 對 slug/uuid 的處理，建議另開 issue 追。
- 測試證據：scroll-world 單元測試綠、v2-booking-draft-checkout＋v2-route-contract-smoke 綠（run-checks.sh）、lint 0 errors、typecheck 綠。
