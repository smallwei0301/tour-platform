# GA4（gtag.js）安裝與橋接設定

> 日期：2026-06-30｜評估 ID：`G-26EYTQJ9RC`｜實作分支：`claude/ga4-code-integration-7dws4p`

本文件記錄 Google Analytics 4（GA4，gtag.js）在 tour-platform 的安裝方式、設定變數與驗證步驟。
事件層級的追蹤設計另見 `01-event-tracking-design.md`（TP-001）。

---

## 一、安裝方式（為什麼是這樣裝）

Google 安裝指引要求：**把 gtag 代碼緊接在每一頁 `<head>` 之後，且每頁只能有一份**。

在 Next.js 15 App Router 下，`apps/web/app/layout.tsx` 是**唯一**包住全站所有頁面的
root layout（其餘 `app/**/layout.tsx` 都嵌在它底下）。因此只要在 root layout 的
`<head>` 內、最前面掛載一次 GA 元件，就同時滿足兩個要求：

- 「每頁緊接 `<head>` 之後都有」——所有頁面都繼承同一個 root layout 的 `<head>`。
- 「每頁只有一份」——只掛載一處，不會重複注入。

實作元件：`apps/web/src/components/analytics/GoogleAnalytics.tsx`。
它用 **`next/script`**（`strategy="afterInteractive"`）載入 `gtag.js`，而非手寫
`<script>`：

- Next.js 負責 script 的 **async 載入與去重**，避免 App Router hydration 期間
  重複注入或執行順序錯亂。
- `afterInteractive` 讓 gtag.js 在頁面可互動後盡早載入，不阻擋首屏繪製。

掛載點（`app/layout.tsx`）：

```tsx
<head>
  {/* Google Analytics 4 — 緊接 <head> 之後，全站僅此一份 */}
  <GoogleAnalytics />
  {/* …其餘 head 內容… */}
</head>
```

元件產出的等效標籤（與 Google 提供的原始 snippet 一致）：

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-26EYTQJ9RC"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-26EYTQJ9RC');
</script>
```

---

## 二、設定變數

| 變數名稱 | Secret | 預設 | 說明 |
|----------|--------|------|------|
| `NEXT_PUBLIC_GA_ID` | ❌ | `G-26EYTQJ9RC` | GA4 評估 ID。**未設定**時程式碼預設用正式帳號 `G-26EYTQJ9RC`；**設為空字串**即停用（元件回傳 `null`，完全不注入任何 script）；設為其他 ID 則覆寫。 |

各環境建議：

| 環境 | 建議值 | 理由 |
|------|--------|------|
| Local（`.env.local`） | 空字串停用 | 本機開發不要污染正式報表 |
| Preview（Vercel） | 空字串停用 | Preview 流量不應計入正式數據 |
| Production（Vercel） | `G-26EYTQJ9RC`（或留空走預設） | 正式流量分析 |

> 設定位置：Vercel Dashboard → Settings → Environment Variables。
> 因為是 `NEXT_PUBLIC_` 前綴（build-time 內嵌至前端 bundle），**改值後需重新部署**才生效。

### 在 Vercel 建置 `NEXT_PUBLIC_GA_ID`（逐步）

> **先釐清：這個變數不是必填。** 程式碼已內建預設值 `G-26EYTQJ9RC`，就算 Vercel 完全不設這個變數，正式站一樣會用 `G-26EYTQJ9RC` 上報。它的用途是**覆寫**（換 GA 帳號）或**停用**（某環境不想上報時設空字串）。

操作步驟：

1. 進 Vercel → 選到本專案 → 上方 **Settings**。
2. 左側選 **Environment Variables**。
3. 新增一筆：
   - **Key**：`NEXT_PUBLIC_GA_ID`
   - **Value**：要分析就填 `G-26EYTQJ9RC`；要停用就**留空字串**。
   - **Environments**：勾選此值要套用的環境（Production / Preview / Development 可分別給不同值——例如 Production 填 ID、Preview 與 Development 留空停用）。
4. 按 **Save**。
5. **重新部署**才生效：Deployments → 最新一筆 → ⋯ → **Redeploy**（`NEXT_PUBLIC_` 變數在 build 時內嵌進 bundle，不 redeploy 不會換值）。

**最省事做法：** Production 不用建變數、直接走預設 `G-26EYTQJ9RC`；只在 Preview / Development 建一筆空字串來停用測試流量。

> ⚠️ 因為預設值已內建，**部署上 production 即開始上報**。若尚未要開始收集資料，需在 Production 也把 `NEXT_PUBLIC_GA_ID` 設為空字串來暫時關閉。

---

## 三、CSP（Content-Security-Policy）白名單

`apps/web/next.config.mjs` 目前以 **Report-Only** 模式試行 CSP（違規只回報不阻擋）。
為確保 GA 乾淨運作、且未來切換到 enforce 不會被擋，已將 GA4 來源加入白名單：

| Directive | 新增來源 | 用途 |
|-----------|----------|------|
| `script-src` | `https://www.googletagmanager.com` | 載入 `gtag.js` |
| `img-src` | `https://www.googletagmanager.com`、`https://www.google-analytics.com` | GA pixel/beacon |
| `connect-src` | `https://www.google-analytics.com`、`https://*.google-analytics.com`、`https://*.analytics.google.com`、`https://www.googletagmanager.com` | GA 事件回傳（fetch/beacon） |

---

## 四、驗證步驟

### 自動化測試

| 層級 | 檔案 | 驗證內容 |
|------|------|----------|
| source-contract | `apps/web/tests/ui/ga4-integration.test.mjs` | 元件用 next/script 載入 gtag.js、帶正確 GA ID、root layout 在 `<head>` 內掛載、CSP 白名單涵蓋 GA 來源 |
| E2E（真實瀏覽器） | `apps/web/e2e/ga4-integration.spec.ts` | 首頁注入帶正確 ID 的 gtag.js（恰 1 份），`window.gtag` 就緒、`dataLayer` 帶 `js` + `config G-26EYTQJ9RC` |

執行：

```bash
# source-contract（在 apps/web 下）
node --test tests/ui/ga4-integration.test.mjs

# E2E（需先 npm run dev 起 dev server）
npm run test:e2e -w @tour/web -- e2e/ga4-integration.spec.ts
```

### 手動驗證（部署後）

1. **GA4 即時報表**：GA4 後台 → 報表 → 即時，開站操作應看到活躍使用者。
2. **DebugView**：安裝 [GA Debugger 擴充] 或在網址加 `?_gl=1`，於 GA4 後台 → 管理 → DebugView 觀察事件。
3. **瀏覽器 DevTools**：Network 面板過濾 `google-analytics.com/g/collect`，應見 `200` 的 beacon 請求；Console 執行 `window.dataLayer` 應含 `js` 與 `config` 兩筆。

---

## 五、停用 / 換站

- **暫時停用**：把 `NEXT_PUBLIC_GA_ID` 設為空字串後重新部署 → 不再注入任何 GA script。
- **換 GA 帳號**：把 `NEXT_PUBLIC_GA_ID` 改成新的 `G-XXXX` 後重新部署。

兩者皆**不需改程式碼**。
