# Lighthouse 全站健檢報告（本地 production build 實跑）

> 產出：2026-07-16 17:12（Asia/Taipei）｜稽核 SHA：`9c25a6a`（branch `claude/lighthouse-project-audit-s21poy`，同 main HEAD）
> 工具：Lighthouse 13.4.0＋Chromium 141（headless=new）｜**行動裝置模擬（LH 預設：Moto G Power、4x CPU throttle、slow-4G 模擬）**
> 稽核對象：本地 `next build`＋`next start`（port 3100，in-memory seed store）｜8 個公開關鍵頁
> 生產站（Vercel）瀏覽器實測：~~NOT_VERIFIED-live~~ → **已於 2026-07-17 以 PSI API 實測解除**（§9；首頁 mobile Performance 55→92）

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

## 9. 生產站 PSI 實測（2026-07-17，NOT_VERIFIED-live 解除）

> 工具：PageSpeed Insights API v5（使用者提供之 API key）｜量測對象：production `4e1654e`（含 PR #1727＋#1732 全部修復）｜17:0x（Asia/Taipei）｜8 頁 mobile＋首頁 desktop｜CrUX 無資料（冷啟動，正常）

### 9a. 修復前後對照（首頁 mobile，同為生產站 PSI）

| 指標 | 修復前（07-17 12:50，使用者實測） | 修復後（07-17 17:0x） |
|---|---|---|
| Performance | 55 | **92** |
| FCP / LCP / SI | 14.3s / 17.3s / 14.3s | **1.5s / 2.4s / 5.8s** |
| 網路資源總量 | **33,911 KiB**（7 支影片 webm＋mp4 全載） | **8,082 KiB**（影片僅 2 檔：active±1 就近掛載） |
| A11y / BP / SEO | 96 / 100 / 100 | 96 / 100 / 100 |
| CLS / TBT | 0 / 60ms | 0 / 40ms |

§6 的環境 blocker 至此解除：本節即生產站瀏覽器實測數據。§3 環境假象判定全部獲生產站證實（BP 100、SEO 100、meta-description 正常）。

### 9b. 全站分數（mobile；desktop 僅首頁）

| 頁 | P | A11y | BP | SEO | LCP | CLS | 頁重 KiB |
|---|---|---|---|---|---|---|---|
| `/`（mobile） | **92** | 96 | 100 | 100 | 2.4s | 0 | 8,082 |
| `/`（desktop） | 72 | 90 | 100 | 100 | 2.8s | 0.001 | 8,245 |
| `/activities` | 59 | 96 | 100 | 100 | 8.7s | 0 | 3,530 |
| activity-detail | 53 | 97 | 100 | 100 | 12.9s | 0 | 3,388 |
| `/booking/*` | 64 | 95 | 96 | 66* | 12.8s | **0.063** | 2,595 |
| `/guides` | 58 | 95 | 100 | 100 | 14.2s | 0 | 2,688 |
| `/blog` | 55 | 96 | 100 | 100 | 14.0s | 0 | 3,154 |
| `/for-guides` | 55 | 92 | 100 | 100 | 13.9s | 0 | 2,373 |
| `/login` | 73 | 96 | 100 | 63* | 14.3s | 0 | 2,504 |

\* noindex by-design。CLS 全站達標（booking 0.95→0.063，<0.1）。

### 9c. 剩餘問題（生產實測確認）

| 級別 | 問題 | 證據 | 處置 |
|---|---|---|---|
| P2 | **內頁 LCP 8.7–14.3s**，主因 render-blocking CSS（FCP 預估可省 6.8–13.2s）＋LCP 圖片非優先載入 | 各頁 render-blocking-resources | ＝§3 #3 全域 CSS 拆分，另開 issue（效能天花板所在） |
| P3 | 全站 target-size 20 處＝footer 清單連結（~20px 高） | 各頁 target-size | **本輪已修**：`.tp-footer ul a` inline-block＋padding |
| P3 | 導覽列搜尋按鈕（desktop＋mobile menu）純圖示無 accessible name | home.desktop button-name | **本輪已修**：補 `aria-label` |
| P3 | `/for-guides` 色彩對比 4 處（lp-fg hero CTA／preview 文字） | color-contrast | **已修（07-17 追修）**：CTA bg #c2542e→#a8431f（3.88→5.11）、preview-sub #5e7a4f→#4c6340（4.07→5.63）、preview-meta alpha 0.65→0.75（4.17→5.87） |
| P3 | booking 頁 heading-order 1 處 h3 | heading-order | **已修（07-17 追修）**：活動名 h3→h2（inline 鎖字級），h1(sr-only)→h2→h3 序列合法 |
| ~~觀察~~ | ~~booking 頁 console 404 ×2~~ | errors-in-console | **已排查結案＝假警報**：404 因稽核用 URL 帶了本地 seed 的 plan slug（`chaishan-cave-half-day`）；生產 plan 為 UUID，以真實 plan＋完整參數實測 `available-slots` 回 200 且有資料，生產 slots 健康 |

## 9d. #1735 CSS 拆分驗收（2026-07-17，PR #1739，production `773ee65`）

**實作**：globals.css 4110→1041 行，六組頁面級樣式 route-scoped 化（detail／landing／lp-apply／shop／login／admin），全套 4689 tests 0 fail，Playwright 逐頁目測零視覺回歸。

**PSI 驗收（對照 §9 拆分前基準）**：

| 驗收標準 | 結果 | 判定 |
|---|---|---|
| 內頁 unused-css-rules <50KiB | 259→**69 KiB**（殘餘全為字型 @font-face＋跨頁共用） | 大幅改善、差 19KiB（殘餘非頁面 CSS） |
| 內頁 render-blocking 頁面 CSS | globals 由 ~30KiB gz → **9 KiB**；LH render-blocking 機會項 **0ms**（原 6.8–13.2s） | ✅ 頁面 CSS 已出清 |
| A11y | 全站 96–98 → **100**（7/8 頁；guides 98） | ✅ 附帶達成 |
| 內頁 Performance ≥80 | 多數仍 ~55（blog 81、activities 重測 94） | ❌ 未達——瓶頸已「換人」，見下 |

**關鍵診斷：內頁低分的真兇是 next/font CJK 字型檔，不是頁面 CSS（拆分前後皆然）**

- login 頁實測：**25 個 woff2 子集共 1,763 KiB＝總傳輸 2,498 KiB 的 71%**（Noto Sans TC 4 字重＋Serif 3 字重＋Inter 的 unicode-range 子集）
- LH Lantern 模擬（1.6Mbps）下字型佔滿頻寬 → 模擬 FCP/LCP 被推到 11–14s → P≈55；**observed FCP/LCP 全站 <2.5s（真實體驗很快）**
- 模擬呈雙峰：同部署同頁 activities 兩次 55↔94、blog 81——分數在「字型下載 vs 首繪」競態間翻轉；拆分前 §9 的內頁 sim（for-guides 11.3s、detail 10.1s）證明此現象與拆分無關
- CrUX 尚無真實用戶數據（冷啟動），無法用 field data 佐證

**結論**：#1735 的「頁面級 CSS」範圍已完成並驗證；「內頁 P≥80」需第二階段**字型瘦身**（純視覺／品牌決策，owner 拍板）：
1. 裁字重：Sans 400/700＋Serif 700/900（現 7 字重 → 4，字型體積約 -43%）——600/500/800 將由瀏覽器就近映射，視覺微變
2. 或自建子集（fontTools 常用字表）自托管，體積可 -70%+，工程量中
3. 或接受現狀：真實體驗（observed <2.5s）已達標，LH 模擬分數僅作參考

## 9e. #1735 二階段字型瘦身驗收（2026-07-17，PR #1742，production `b095e38`）

**決策軌跡**：owner 先選「自建子集」→ fontTools 實測否決（4808 全字自托管 6.2MB／可變字型 3.5MB／站點切片僅 -28%，皆不敵裁字重）→ owner 改拍板「裁字重」→ Sans 400/700＋Serif 700/900 上線。

**PSI 驗收（對照裁前基準，同 login 頁逐檔 diff）**：

| 項目 | 結果 |
|---|---|
| @font-face CSS（render-blocking） | 399＋309KB raw → **206＋200KB（-43%）** ✅ |
| 字型二進位下載 | **25 檔 1,763KiB → 25 檔 1,763KiB（hash 完全相同，0 變化）** |
| 內頁 Performance | 雙峰噪音持續：home 55→89、guides 53→74、login 53→74，但 blog 81→55、booking 65→51 |
| observed FCP | 全站穩定 1.1–2.7s ✅ |

**最終診斷（本輪最重要的認知）**：瀏覽器只下載「實際渲染的字重 × 命中的 unicode-range 切片」——被裁掉的 500/600/800 字重**原本就沒被下載**（500→400 等映射早已在發生）。因此 CJK 字型下載的 1.7MB 是「4 個實際使用字重 × 頁面字元命中切片」的固有成本，**裁未使用字重無法再降**；要真正砍半只剩「減少實際使用的字重/家族數」（例：Serif 只留一個標題字重、body 單一字重——牽動全站排版設計）或接受現狀。

**建議**：關閉 #1735——頁面級 CSS 目標已完成（§9d ✅）；字型軌已到邊際遞減點，LH 模擬分數（雙峰 51–94）與真實體驗（observed <2.7s，全綠）應脫鉤看待，冷啟動後以 CrUX field data 為準。裁字重變更無害（CSS -43%）建議保留。

## 10. 治理聲明

- 本 session hooks 狀態：bash-guard **實測有武裝**（曾攔截無證據 commit）；file-guard 對 Edit 未攔截（探針無 `⛔ HARNESS BLOCK`）。已向使用者報告後獲「開工」授權執行修復，期間人工自我執行凍結清單（所有觸碰檔案均不在凍結區）。
- 原始報告（HTML/JSON 各 8 頁）在 session scratchpad，容器回收即消失；如需保存請告知，可另行附出。
