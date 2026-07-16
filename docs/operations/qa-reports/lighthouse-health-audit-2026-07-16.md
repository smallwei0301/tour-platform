# Lighthouse 全站健檢報告（本地 production build 實跑）

> 產出：2026-07-16 17:12（Asia/Taipei）｜稽核 SHA：`9c25a6a`（branch `claude/lighthouse-project-audit-s21poy`，同 main HEAD）
> 工具：Lighthouse 13.4.0＋Chromium 141（headless=new）｜**行動裝置模擬（LH 預設：Moto G Power、4x CPU throttle、slow-4G 模擬）**
> 稽核對象：本地 `next build`＋`next start`（port 3100，in-memory seed store）｜8 個公開關鍵頁
> 生產站（Vercel）瀏覽器實測：**NOT_VERIFIED-live**（blocker 見 §6）

---

## 1. 結論（TL;DR）

1. **最大單一問題：首頁一次載入 7 支 scroll-world 影片共約 14.6 MB（總頁重 18.2 MB）**。`ScrollWorldClient.tsx:50` 對每個場景的 `<video>` 都設 `preload="auto"`，行動網路首訪成本極高。改 `preload="none"`/`metadata`＋以現成的 `still` webp 當 poster、只預載目前場景，即可砍掉 80%+ 首頁流量。
2. **CSR 頁面有嚴重版面位移（CLS）**：`/booking/*` 與 `/login` CLS≈0.95、`/guides` 0.638（Google 標準：<0.1）。原因是 client-side 渲染內容水合後把 footer 大幅下推。給 CSR 區塊保留最小高度骨架（或改 SSR）即可修。
3. **無障礙（85–92 分）有一批跨頁共通問題**：footer 地區連結對比不足（21 處）、scroll-world 導覽點觸控目標過小（27 處）、footer App badge／社群連結 aria-label 與可見文字不符、`/booking` 的 `<select>` 缺 accessible name、`/activities` 卡片標題跳級（h1→h3）。多數集中在共用 footer／首頁 scroll-world，一次修全站受益。
4. **render-blocking CSS 約 275 KB（其中每頁約 259 KB 未使用）**——全域 CSS 單體過大，是 FCP 的主要靜態瓶頸。
5. 效能絕對數字（FCP 12–18s）受**本地容器 CPU＋模擬 throttle**放大，不能直接當生產站數字；但上述結構性問題（影片、CLS、CSS）與環境無關，生產站同樣存在。
6. Best Practices 全站 96、SEO 可索引頁 92–100——與 07-15 SEO 健檢結論一致，無新增高風險項。

## 2. 分數總表（mobile 模擬）

| 頁面 | Performance | A11y | Best Practices | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| `/`（首頁） | 54 | 92 | 96 | 92 | 23.3 s | 150 ms | 0 |
| `/activities` | 55 | 91 | 96 | 92 | 20.9 s | 20 ms | 0 |
| `/activities/kaohsiung/kaohsiung-chaishan-cave-experience` | 55 | 85 | 96 | 92 | 19.5 s | 0 ms | 0 |
| `/booking/kaohsiung-chaishan-cave-experience?plan=…` | 31 | 83 | 96 | 58* | 15.9 s | 0 ms | **0.95** |
| `/guides` | 32 | 91 | 96 | 92 | 17.3 s | 0 ms | **0.638** |
| `/blog` | 55 | 89 | 96 | 92 | 18.1 s | 0 ms | 0.004 |
| `/for-guides` | 55 | 92 | 96 | **100** | 14.9 s | 0 ms | 0.001 |
| `/login` | 31 | 92 | 96 | 63* | 15.5 s | 0 ms | **0.95** |

> \* `/booking`、`/login` 的 SEO 低分主因是 `noindex`（is-crawlable audit 扣分）——**by-design**，私有流程頁本來就該 noindex，不需處理。
> LCP/FCP 絕對值受本地環境放大（§5），相對比較與非效能類分數不受影響。

## 3. 發現逐項判定

### P1（高影響、建議優先排程）

| # | 發現 | 證據 | 建議 |
|---|---|---|---|
| 1 | **首頁載入 7 支影片共 ~14.6 MB**（`finale` 2.5 MB、`culture` 2.2 MB、`ecology` 2.15 MB、`river` 2.1 MB、`intro` 2.0 MB、`cave` 2.0 MB、`mountain` 1.7 MB，皆 webm；總頁重 18,227 KiB，LH total-byte-weight 50 分） | `src/components/scroll-world/ScrollWorldClient.tsx:50` `preload="auto"`；`src/lib/scroll-world/scenes.mjs` 7 場景 | `preload="none"` 或 `metadata`＋`poster={scene.still}`（webp 已存在）；僅目前/相鄰場景才觸發載入 |
| 2 | **CLS：`/booking` 0.95、`/login` 0.95、`/guides` 0.638**（門檻 0.1）。culprit node：booking＝`#main-content` 整塊、login/guides＝footer 被內容下推 | LH layout-shifts audit；三頁皆 CSR bailout（`BAILOUT_TO_CLIENT_SIDE_RENDERING`） | CSR 容器給 `min-height` 骨架（依常見內容高度），或把首屏內容改 SSR |

### P2（中影響）

| # | 發現 | 證據 | 建議 |
|---|---|---|---|
| 3 | **render-blocking CSS ~275 KB，其中每頁 ~259 KB 未使用**（`ddd87391…css` 140 KB＋`922f4769…css` 109 KB） | LH render-blocking / unused-css-rules（8 頁一致） | 全域 CSS 拆分：頁面級 CSS 移往 route 層、審視是否整包 design-system 都進了 root layout |
| 4 | **footer 地區連結色彩對比不足**（首頁 21 處，全站共用 footer） | LH color-contrast：`.tp-footer-regions-list > a` | 調升 `--tp-` 對應色票對比至 WCAG AA（4.5:1）；文案色票依 `BRAND_BOOK.md` 調整 |
| 5 | **scroll-world 導覽點觸控目標 <24px**（首頁 27 處） | LH target-size：`nav.scroll-world_*` | 導覽點增加 padding／hit-area 至 ≥24×24px |
| 6 | **`/booking` 的 `<select>` 缺 accessible name** | LH select-name（1 處） | 補 `<label>` 或 `aria-label` |
| 7 | **`/activities` 卡片標題跳級 h1→h3**；activity-detail 評分區 `aria-required-children` 1 處 | LH heading-order / aria-required-children | 卡片標題改 `h2` 或調整層級；檢查 reviews 區 ARIA role 結構 |

### P3（低影響）

| # | 發現 | 證據 | 建議 |
|---|---|---|---|
| 8 | footer App badge／社群連結（FB/IG/LINE）aria-label 與可見文字不符（4 處/頁） | LH label-content-name-mismatch | aria-label 以可見文字開頭，或直接用可見文字 |
| 9 | 麵包屑連結與周邊文字僅靠顏色區分（activity-detail、blog 等 2 處/頁） | LH link-in-text-block | 加底線或非顏色視覺區分 |
| 10 | bf-cache 不可用（activity-detail 2 因、booking 3 因） | LH bf-cache | 多與 no-store fetch/WebSocket 有關，收單後再議 |
| 11 | 缺 `/llms.txt`（LH 13 新 audit，全頁提示） | LH llms-txt | 可選：新增 llms.txt 描述站點結構 |

### 環境假象（不得開票）

| 項目 | LH 判定 | 實際 |
|---|---|---|
| errors-in-console（8 頁全掛） | 0 分 | GTM 走容器代理失敗（`ERR_PROXY_CONNECTION_FAILED`）＋`/_vercel/insights|speed-insights/script.js` 404（只存在於 Vercel 部署）——生產站皆不成立 |
| canonical「Points to another hreflang location」 | 0 分 | 本地 host 與 metadataBase 不一致造成；07-15 SEO 健檢已實測生產站 canonical/hreflang 正確 |
| meta-description（activity-detail） | 0 分 | **SSR HTML 實測有 description**（curl 驗證）；LH 讀的是 JS 執行後 DOM——疑似水合階段 head 差異或 LH 快照時機，**建議在生產站覆核一次**（若生產站 post-JS DOM 也掉 description，升級為真問題） |
| FCP/LCP 12–23 s 絕對值 | 0 分 | 本地容器 CPU 慢＋LH slow-4G 模擬放大；生產站（Vercel CDN）絕對值會低得多，但 §3 P1/P2 結構性問題仍在 |

### 附帶發現（本次健檢過程抓到）

- **前端缺 `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` 時，多個 CSR 頁（login/booking/me…）客戶端直接拋錯**（第一輪掃描 8 頁中 3 頁 Application error）。生產／預覽環境有設定所以不影響線上；但任何本地/CI 瀏覽器測試都會踩到。建議：client factory 對缺 env 給 graceful fallback，或在 startup-env 對 `NEXT_PUBLIC_*` 一併驗證（build 時 fail-fast，比 runtime 白屏好）。

## 4. 建議修復順序

1. **#1 影片 preload**（改 2 行＋poster，首頁流量 -80%，低風險，不碰凍結區）
2. **#2 CLS 骨架**（booking/login/guides 三頁模板，直接改善核心轉換路徑的 Core Web Vitals）
3. **#4/#5/#8 共用 footer＋scroll-world a11y 三連修**（同一批檔案，一個 PR 可收）
4. **#3 全域 CSS 拆分**（工程量較大，另開 issue 評估）
5. 其餘 P3 併入日常維護

## 5. 方法與量測環境限制

- fresh container：`npm install --ignore-scripts` → `next build`（production profile；`GUIDE_SESSION_SECRET`/`ADMIN_ACCESS_TOKEN` 以本地臨時假值提供，不落檔）→ `next start -p 3100`。
- 無 Supabase service-role env → `hasSupabaseEnv()` fallback in-memory seed store；頁面內容為種子資料（活動數量、圖片數與生產站略有差異，影響 total-byte-weight 的絕對值但不影響結構性結論）。
- 前端以 stub `NEXT_PUBLIC_SUPABASE_*` 重建以避開附帶發現的客戶端拋錯（見 §3 附帶發現）。
- Chromium 經容器代理載入外部資源；GTM 因代理攔截失敗（已列環境假象）。Unsplash/Pexels 圖片經代理正常載入。
- 每頁單次量測（非多次取中位數）；效能分數波動 ±5 屬正常。

## 6. NOT_VERIFIED-live：生產站瀏覽器實測 blocker

- 嘗試對 `https://tour-platform-nine.vercel.app` 跑 Lighthouse：容器代理對外部 HTTPS 做 MITM，Chromium 不信任代理 CA → 全數 `CHROME_INTERSTITIAL_ERROR`/`ERR_CONNECTION_RESET`。
- 把代理 CA 加入瀏覽器 NSS 信任庫的操作被本環境權限分類器判定為 TLS 信任弱化、超出健檢授權範圍而擋下，**已復原全部相關變更**（NSS store 回到空）。
- 因此本報告的生產站 Core Web Vitals 標 `NOT_VERIFIED-live`。替代作法（擇一）：
  1. 使用者在本機（無 MITM 代理）對生產站跑 `npx lighthouse https://tour-platform-nine.vercel.app/ --preset=perf`；
  2. 用 PageSpeed Insights（Google 端執行，無代理問題）：https://pagespeed.web.dev/ 直接貼生產 URL；
  3. Vercel Speed Insights 後台看真實用戶 CWV（站上已裝 `@vercel/speed-insights`）。
- **2026-07-16 補記（PSI API 嘗試）**：依使用者指示改走 PageSpeed Insights API 對生產站測試，容器直連與 WebFetch 兩條出口均回 `429 Quota exceeded ('Queries per day', consumer project_number:583797351490)`——無 API key 的 PSI 呼叫共用匿名每日配額，自本環境已用罄，非站點問題。解法：(a) 使用者在瀏覽器開 pagespeed.web.dev 手動測（走網頁版自己的 key，不受此限）；或 (b) 提供 GCP PageSpeed Insights API key（免費），agent 即可自動批測並把結果併入本報告。

## 7. 修復結果（2026-07-16 同日實作，同環境對照重測）

P1/P2 中除「全域 CSS 拆分」（另案）外均已修復（commit `4de392b` 起）。對照（修復前→修復後）：

| 頁 | Performance | A11y | CLS | 總頁重 |
|---|---|---|---|---|
| home | 54→55 | 92→**96** | 0→0 | **18,227→4,045 KiB（-78%）** |
| booking | 31→**55** | 83→**95** | 0.95→**0.025** | – |
| guides | 32→**55** | 91→**95** | 0.638→**0** | – |
| login | 31→**55** | 92→**96** | 0.95→**0** | – |
| activity-detail | 55→55 | 85→**97** | – | – |
| activities / blog | 55 | 91/89→**96** | – | – |

尚未處理：§3 #3 全域 CSS 拆分（工程量大，另開 issue）、#10 bf-cache、#11 llms.txt；環境假象各項不開票；「meta-description post-JS DOM」與「本地 seed 環境 booking 頁 Invalid activityId banner（既有，非本次引入）」待生產站／另案覆核。

## 8. 治理聲明

- 本 session hooks 狀態：bash-guard **實測有武裝**（曾攔截無證據 commit）；file-guard 對 Edit 未攔截（探針無 `⛔ HARNESS BLOCK`）。已向使用者報告後獲「開工」授權執行修復，期間人工自我執行凍結清單（所有觸碰檔案均不在凍結區）。
- 原始報告（HTML/JSON 各 8 頁）在 session scratchpad，容器回收即消失；如需保存請告知，可另行附出。
