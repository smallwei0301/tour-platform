# 前端效能反模式 SOP（global leak / 全站洩漏類）

> 本文檔由 #1345 / #1344 連續多輪 CLS / LCP 修復事後彙整。每一條都是踩過的雷，**前端 PR 提交前請先掃一次本清單**。

最後更新：2026-06-10（PR #1357 全站 preload 洩漏修復後）

---

## 1. 「全站洩漏」反模式總則

凡是放進以下任一檔案的「副作用標籤」（preload / preconnect / inline script / inline style / 第三方 SDK / 字體載入），**會對全站每一頁生效**：

- `apps/web/app/layout.tsx`（Root Layout — 影響整個網站）
- 任何 `apps/web/app/<segment>/layout.tsx`（Segment Layout — 影響該 segment 與其子樹）
- `<Navbar />` / `<Footer />` 等被 Root Layout 引入的元件
- `next.config.mjs` 的 `headers()` / `experimental.preloadEntriesOnStart`

**判斷一條 hint 該放哪裡，問自己一個問題：**

> 「這個資源，**不在這個頁面**的訪客**也應該下載**嗎？」

- 答 ✅ 是 → 可以放 Root Layout（例：unsplash preconnect、字體 woff2、Sentry SDK）
- 答 ❌ 否 → **必須放對應的 page.tsx**（例：首頁 hero 大圖、區頁 region map、訂單詳情頁的 ECPay SDK）

---

## 2. 已知雷區：preload as="image"

### 教訓案例（#1357）

Root layout 曾經有：

```tsx
{/* Preload hero background image to improve homepage LCP */}
<link rel="preload" as="image"
      href="https://images.unsplash.com/photo-1528164344705-…?w=1600&q=80"
      fetchPriority="high" />
```

註解寫 "homepage LCP"，**位置卻是 Root Layout** → 每個訪客每一頁（`/login` / `/guides` / `/blog` / `/activities` / `/activities/kaohsiung` …）都先下載這張 ~數百 KB 的首頁專用大圖，slow-4G 上**直接跟當頁 LCP 圖搶頻寬**，是 `/activities` mobile LCP 8.8s 的元兇之一。

### 規則

- ❌ 不可以在 Root Layout / 共用 Layout 寫 `<link rel="preload" as="image" …>`
- ✅ 頁面特定圖在 **該 page.tsx** 寫 preload（React 19 會自動 hoist 到 `<head>`）
- ✅ 若該圖也是 `next/image` 的 LCP 元素，可在 server page 用 `imageSrcSet` + `imageSizes` 跟 client `<Image>` 的 srcset / sizes 一致，避免 double download（範例：`apps/web/app/activities/page.tsx` 的 `firstCover` preload 與 `apps/web/app/activities/cover-image.ts` 共用模組）

### Source-contract 鎖（已落地）

`apps/web/tests/ui/issue1344-no-global-hero-preload.test.mjs`：

```js
assert.doesNotMatch(
  src,
  /rel=["']preload["'][\s\S]{0,200}?as=["']image["']/,
  'root layout 不可有任何 <link rel="preload" as="image">'
);
```

PR 一動 root layout 就會被 CI 攔下。

---

## 3. 已知雷區：CJK font-display swap

### 教訓案例（#1345 part 2）

`next/font/google` 的 `Noto_Sans_TC` 預設 `display: 'swap'`。CJK 字體單一 weight 數 MB，mobile 連線下載慢，swap 進來時頁面已渲染，瀏覽器把 sans-serif fallback 換成 Noto Sans TC，**每一行 line-height 都跳** → CLS 巨大。

`next/font` 自動產 metric-matched fallback **只對拉丁字體有效**，CJK 字體一律會跳。

### 規則

- ✅ CJK 字體（中日韓）必須用 `display: 'optional'`
- ✅ 拉丁字體（Inter / Roboto / Open Sans …）保留 `display: 'swap'`（next/font 已自動配對 fallback metric）
- 變數命名跟 CSS variable 不變，只動 `display`

### Source-contract 鎖（已落地）

`apps/web/tests/ui/issue1345-cls-font-display-optional.test.mjs`

---

## 4. 已知雷區：Suspense fallback 高度不對

### 教訓案例（#1345 part 3 + 5）

兩個常見 fallback 反模式：

**(a) fallback 是「載入中⋯」一行字**
- 真內容串流進來時 main-content 從 ~60px 暴增到 ~1500px → CLS 0.9+

**(b) fallback 是 `null`（什麼都不渲染）**
- 同 (a)，但更隱蔽

### 規則

- ✅ Fallback 必須是 **same-footprint skeleton**，跟真內容用同一個 grid container 跟同高度 placeholder（卡片要 `min-height` ≈ 真實量測值）
- ✅ Skeleton 元件加 `aria-hidden="true"` 不汙染 SEO / a11y
- ✅ Async page 的 `await` 在 JSX return 之前時，**page JSX 內的 `<Suspense fallback>` 在 dynamic rendering 下不會渲染**——外層 fallback 是 **`loading.tsx`**，沒有就是空白 shell

### 規則應用範例

```
app/activities/
  page.tsx             ← async page (await listPublishedActivitiesDb)
  loading.tsx          ← page-level fallback (必須有)
  ActivitiesSkeleton.tsx ← 共用 skeleton 元件
  ActivitiesContent.tsx
  [region]/
    page.tsx
    loading.tsx        ← 同上
```

### Source-contract 鎖（已落地）

`apps/web/tests/ui/issue1345-cls-suspense-skeleton.test.mjs`

---

## 5. 已知雷區：client component re-fetch 蓋掉 SSR 資料

### 教訓案例（#1345 part 1）

Server page SSR 給了 `initialActivities`，但 client component mount 後仍跑 `useEffect` 再 fetch 一次 `/api/activities`，回來 `setActivities()` 把 SSR 資料替換掉 → 整批卡片重排 → CLS 0.4。

### 規則

- ✅ 如果 `initialActivities` 存在，mount 時的第一次 fetch 必須跳過
- ✅ 用 `useRef(initialActivities !== undefined)` 做 one-shot flag，第一次跑 effect 就消費並 return
- ✅ Filter / search 等真實 user 互動的 fetch 不受影響

### Source-contract 鎖（已落地）

`apps/web/tests/ui/issue1345-cls-skip-initial-refetch.test.mjs`

---

## 6. 診斷工具

當 Lighthouse 的 `layout-shift-elements` audit 是空的時候（常見），**改用 Playwright + PerformanceObserver `sources` 欄位**抓真實 shifter：

```js
// scripts/diagnose-cls.mjs（示意）
await page.addInitScript(() => {
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__shifts.push({
        value: e.value,
        time: e.startTime,
        sources: (e.sources || []).map(s => ({
          tag: s.node?.tagName,
          id: s.node?.id,
          class: s.node?.className,
        })),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
});
```

LCP element 同樣可用 `'largest-contentful-paint'` PerformanceObserver。

#1345 part 3 / part 5 兩刀就是靠這招才**確切**找到 `<div id="main-content">` 跟 `<footer>` 才是真正在跳的元素，不再瞎猜。

---

## 7. 提交 PR 前自我檢查

| 你動了什麼 | 該檢查 |
|---|---|
| `app/layout.tsx` | 沒新增 page-specific 的 `<link rel="preload">`、`<script>` |
| 任何 `app/<segment>/layout.tsx` | 同上 |
| `<Navbar />` / `<Footer />` | 沒引入頁面特定 SDK / 大型資源 |
| `next/font/google` 設定 | CJK 字體 `display: 'optional'`、拉丁字體 `display: 'swap'` |
| 新增 `<Suspense>` | fallback 是 same-footprint skeleton，不是字串或 `null` |
| 新增 async server page | 同目錄有 `loading.tsx`（fallback 為相同 skeleton） |
| Client component 接收 SSR `initial*` props | mount-time fetch 有 `useRef` skip 邏輯 |

---

## 相關 PR / Issue

- #1345 — Universal CLS > 0.25 — 五刀 (#1347, #1349, #1350, #1351, #1354) close
- #1344 — Mobile LCP 12s → < 4s — 多刀進行中 (#1348, #1357, #1358)
- #1357 — 移除全站 preload 洩漏（本文檔的直接動因）
- #1317 — Owner production smoke 聚合（Round 4 Lighthouse 報告）
