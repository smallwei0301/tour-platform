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

### 對策（單一聚焦修正）
1. **字重砍到實際需要的**：Noto Sans TC → 400/700、Inter → 400/700、Noto Serif TC → 700/900（10 字重 → 6 字重；500/600 由瀏覽器就近對應）。`@font-face` 規則 768 → 443。
2. **`preload: false`**（兩個 CJK 家族）：不再於 `<head>` 注入高優先 preload，改為隨 CSS 用到才低優先下載，不與當頁 LCP 圖／關鍵 CSS 搶頻寬。Noto Sans TC 維持 `display: 'optional'`（首訪用系統 fallback，無 CLS swap）。

### 量測結果（before → after）

| 裝置 | 指標 | Baseline | 優化後 |
|---|---|---|---|
| 手機 | Performance | 55 | **93** |
| 手機 | FCP | 14.7s | **1.2s** |
| 手機 | LCP | 18.9s | **3.1s** |
| 手機 | Speed Index | 14.7s | **2.3s** |
| 手機 | 字型下載 | 2128kB / 30 檔 | **51kB / 3 檔** |
| 手機 | 總下載 | 2731kB | **399kB** |
| 桌面 | Performance | 82 | **100** |
| 桌面 | LCP | 3.0s | **0.7s** |

> 副作用紅利：CSS 從 261kB 降到 16kB —— 原本巨大的 CSS 幾乎都是 CJK 字型的 `@font-face` unicode-range 宣告。

### 剩餘機會（未在本輪處理）
- 手機 LCP 3.1s 主要為 hero 圖下載本身（已使用 `next/image` + `priority`，無快速可改項）。
- 「Reduce unused JavaScript ~770ms」需對 client component 做動態載入／程式碼分割，屬較具侵入性的後續優化，本輪未動以維持改動聚焦與低風險。

---

## 三、回歸驗證

- `npm run typecheck`：通過
- `npm run lint`：通過（僅 eslintrc deprecation warning）
- `npm test`：3339 tests，**0 fail**
- `npm run build`：成功
- E2E `issue-social-proof-reviews.spec.ts`：3 passed

## 判定：PASS
