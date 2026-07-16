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

## 產出

- QA 報告：`docs/operations/qa-reports/lighthouse-health-audit-2026-07-16.md`
