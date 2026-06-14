# 活動詳情頁：旅客評價星等顯示修正 + 載入效能優化驗收

- **日期（Asia/Taipei）**：2026-06-14
- **分支**：`claude/rating-display-performance-xfxvlj`
- **驗證頁面**：`/activities/kaohsiung/kaohsiung-chaishan-cave-experience`
- **環境**：本地 production build（`npm run build` + `npm run start`，in-memory fixture fallback），Lighthouse 13.4.0 + Chromium 1194/1208 headless

---

## 一、旅客評價星等顯示修正

### 問題
前台旅客評價的星等用 `'★'.repeat(rating)` 渲染，4 顆星的評價就只畫 4 顆星，缺少第 5 顆，視覺上看不出「滿分 5 顆中得 4 顆」。

### 修正
`app/activities/[region]/[slug]/page.tsx` 新增 `StarRating` 元件，固定渲染 5 顆星：

- 達標星數 → 品牌金色（`.kkd-stars-on`，`#f5a623`）
- 未達標星數 → 灰色（`.kkd-stars-off`，`rgba(238, 230, 205, 0.28)`）
- 加上 `role="img"` 與 `aria-label="{n} 顆星，滿分 5 顆"` 的無障礙標註

真實評論卡片與後台社群口碑語錄共用同一元件。`globals.css` 將 `.kkd-stars` 的顏色拆到 `.kkd-stars-on` / `.kkd-stars-off` 兩個子層級。

### 證據
- 既有 E2E `e2e/issue-social-proof-reviews.spec.ts` 依新契約更新並 **3 passed**：
  - 5 星（陳小姐）→ `.kkd-stars-on` = `★★★★★`、`.kkd-stars-off` 不存在
  - 4 星（日本旅客 Yuki）→ `.kkd-stars` 共 `★★★★★`、`.kkd-stars-on` = `★★★★`、`.kkd-stars-off` = `★`
- 真實瀏覽器截圖確認 4 星評價呈現「4 金 + 1 灰」。

---

## 二、載入效能優化（Lighthouse）

### 根因
`app/layout.tsx` 載入 3 個字型家族共 10 種字重（Noto Sans TC 400/500/700/900、Inter 400/500/700、Noto Serif TC 600/700/900）。Noto Sans/Serif TC 為 CJK 家族，`next/font` 會為**每個字重**切出約 105 個 unicode-range 子檔；中文 body 文字會跨字重觸發下載，實測一頁就抓 **30 個子檔、約 2.1MB 字型**（佔總下載 2.7MB 的 78%）。在 Lighthouse 模擬 slow-4G 下，光是把這些位元組下載完就要 ~14s，是 FCP/LCP 過久的主因。

### 對策（分三輪，逐步量測）

**Round 1 — 字重精簡 + preload:false（已驗證為「必要但不充分」）**
- Noto Sans TC → 400/700、Inter → 400/700、Noto Serif TC → 700/900（10 字重 → 6 字重）。`@font-face` 768 → 443。
- 兩個 CJK 家族 `preload: false`。
- ⚠️ 重要修正：第一次量到的「手機 93 / 字型 51kB」事後證實是 **Lighthouse 模擬節流的離群值**（Chrome 偶發跳過 optional 字型下載）。連跑 3 次的**穩定值仍是 55 / 2128kB**，且**真實套用節流（devtools throttling）實測 FCP 3.8s / LCP 4.4s** —— 證明 `display:'optional'` 只是「不阻塞 render / 不 swap」，**不會阻止背景下載**，字重精簡無法根治。

**Round 2 — hero 圖重複 preload 去除**
- `ImageCarousel` 桌面 gallery 主圖原本 `sizes="(min-width:768px) 75vw, 100vw"`，在手機（gallery 為 `display:none`）仍算成 100vw → 多 preload／下載一張隱藏主圖與輪播首圖搶頻寬。改 `0vw`（與縮圖一致），手機只 preload 真正可見的輪播首圖。

**Round 3 — 內文改系統字 + 標題襯線 optional（owner 拍板，根治）**
- 內文（body）不再引用 Noto Sans TC webfont，改系統中文字（PingFang TC／微軟正黑／Noto Sans CJK）：整組 211 條 `@font-face` 不再產生，手機端省 ~1.2MB，render-blocking CSS 大幅縮小。系統字本來就是 #1345 `display:'optional'` 後首訪實際看到的字，視覺一致。
- 品牌標題襯線 Noto Serif TC 維持載入但改 `display:'optional'`：首訪用系統襯線（不阻塞、無 swap-shift CLS），回訪用快取的品牌字。

### 量測結果（before → 最終 Round 3）

| 量測情境 | 指標 | Baseline | Round 3 |
|---|---|---|---|
| 手機（模擬 4G） | Performance | 55 | **58** |
| 手機（模擬 4G） | FCP | 14.7s | **7.5s** |
| 手機（模擬 4G） | LCP | 18.9s | **9.6s** |
| 手機（**真實套用節流**） | Performance | 38 | **56** |
| 手機（**真實套用節流**） | FCP | 3.8s | **2.7s** |
| 手機（**真實套用節流**） | LCP | 4.4s | **3.2s** |
| 手機 | 字型下載 | 2128kB / 30 檔 | **996kB / 13 檔** |
| 手機 | 總下載 | 2731kB | **1428kB** |
| 桌面 | Performance | 82 | **95** |
| 桌面 | LCP | 3.0s | **1.3s** |

### 剩餘機會（未在本輪處理）
- 剩餘 996kB 字型為**標題的 Noto Serif TC**（依 owner 決策保留品牌襯線）。`optional` 不阻塞 render 但仍背景下載並與 LCP 圖搶頻寬，這是手機模擬分數仍受限的主因；**回訪**則用快取的品牌字、零額外下載。若日後願意讓標題也用系統襯線，手機可再往 90+。
- 「Reduce unused JavaScript」剩餘 chunk 多為框架／全站共用 vendor（React/Next runtime），page-specific 僅 16kB，動態載入 ROI 低、風險高，本輪未動。

---

## 三、回歸驗證

- `npm run typecheck`：通過
- `npm run lint`：通過（僅 eslintrc deprecation warning）
- `npm test`：3339 tests，**0 fail**（含更新後的 `tests/ui/issue1345-cls-font-display-optional.test.mjs`，依新字型策略改寫並 3 pass）
- `npm run build`：成功（`@font-face` 443 → 232，notoSans 整組移除）
- E2E `issue-social-proof-reviews.spec.ts`：3 passed（dev webServer，帶 Supabase env）
- 真實瀏覽器截圖：系統字內文 + 4 星「4 金 + 1 灰」呈現正常

> 備註：用無 `NEXT_PUBLIC_SUPABASE_*` 的本地 production build 跑 E2E 會因 client Supabase 初始化拋錯觸發 error boundary（環境問題，非程式碼回歸；SSR HTML 內容完整）；E2E 應走 Playwright 內建 dev webServer（已注入 dummy Supabase env）。

## 判定：PASS
