# CSP `unsafe-inline` 移除評估與決策（#1601）

> 狀態：**Decision — 暫不移除（維持現狀 D），未來走選項 C（混合 nonce）**。
> 關聯：#1568（CSP enforce）、#1344（mobile LCP／ISR 效能）、鐵律 3（`middleware.ts` 凍結區）。

## 背景

#1568 已把 CSP 由 Report-Only 轉 enforce，並於 production 移除 `'unsafe-eval'`。目前 `script-src`
仍保留 `'unsafe-inline'`：

```
script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://www.googletagmanager.com
```

`'unsafe-inline'` 存在時，XSS 注入的 inline `<script>` 不會被 CSP 擋，是目前 CSP 防護的最大殘口。
#1601 目標為移除它。

## 選項評估（含實測證據）

| 選項 | 作法 | 結論 |
|---|---|---|
| **A. hash-based** | 對所有 inline script 計 sha256 加入白名單 | ❌ **不可行** |
| **B. nonce-based** | middleware 產生 per-request nonce | ❌ **雙重阻擋** |
| **C. 混合** | 高風險頁 nonce＋dynamic，行銷/活動頁維持 SSG | 🟡 未來路徑（複雜、暫緩） |
| **D. 維持現狀** | 保留 `unsafe-inline`，靠既有 XSS 防線 | ✅ **本次採用** |

### A（hash）為何不可行 — 實測

Next.js 15 App Router 在**每一頁**（含 SSG 靜態頁）注入大量 framework inline script，特別是
RSC flight data：

```
$ grep -oE "<script>[^<]{0,60}" .next/server/app/_not-found.html
<script>(function(){try{var p=location.pathname; ...   ← 本站自有（可 hash）
<script>(self.__next_f=self.__next_f||[]).push([0])     ← Next flight data（不可靜態 hash）
<script>self.__next_f.push([1,"1:\"$Sreact.fragment\"…  ← 每頁不同、每次 build 不同
```

`self.__next_f.push([...])` 的內容是**該頁的 RSC payload**——每頁不同、每次 build 不同、數量眾多。
靜態 hash 白名單無法涵蓋（要 hash 數百個逐頁變動的字串，且每次 build 全部失效）。故 A 對 Next
App Router SSG 不可行。

### B（nonce）為何雙重阻擋

1. **效能**：nonce-based CSP 需 per-request 產生 nonce → 頁面必須 dynamic rendering，直接回歸
   #1344 辛苦拿到的 ISR/SSG（`●`/`○`）效能（mobile LCP 曾達 8.8s）。
2. **凍結區**：nonce 需在 `middleware.ts` 注入（唯一能在 per-request 改 header 的前門），但
   `middleware.ts` 屬**鐵律 3 凍結區**，不可改。`next.config.mjs` 的 `headers()` 只能設靜態值、
   無法產生 per-request nonce。

故 B 在本 codebase 的架構約束下被雙重阻擋。

## 決策：D（現狀）＋ 記錄殘餘風險

**保留 `'unsafe-inline'`**。理由：A 不可行、B 傷效能且撞凍結區；強行實作只會壞站或壞效能。

**殘餘風險的緩解（已在位）**：
- enforce CSP（#1568）已提供 `object-src 'none'`、`base-uri 'self'`、`frame-ancestors 'self'`、
  `form-action` 白名單（僅 ECPay）、`connect-src`／`img-src` 白名單、production 無 `unsafe-eval`。
- **無 inline-script 注入面**：`serialiseJsonLd` 有轉義 `<`（`activity-jsonld.mjs`），28 處
  `dangerouslySetInnerHTML` 皆為 JSON-LD 或靜態字串，無使用者輸入直注（見健檢報告資安「已排除」段）。
- 即：`unsafe-inline` 的實際可利用性極低——要利用它得先有一個 inline-script 注入點，而目前沒有。

## 未來路徑（選項 C，觸發條件）

當下列任一成立時，重啟評估以選項 C 落地：
1. Next.js 提供對 App Router 更友善的 CSP（如官方 nonce middleware pattern 且不強制全站 dynamic）；
2. `middleware.ts` 凍結解除，且願為 `/admin/*`、`/checkout`、登入頁承擔 dynamic rendering 的效能成本
   （這些頁本就非 SSG 快取重點）；
3. 出現真實 inline-script 注入面（屆時風險升級，值得付效能代價）。

C 的形狀：middleware 對高風險 route 群產生 nonce＋`strict-dynamic`、移除該群的 `unsafe-inline`；
行銷/活動頁維持 SSG＋`unsafe-inline`。CSP header 依 route 分組（next.config `headers()` 的 `source`
分段或 middleware 動態組裝）。

## 守門

`tests/api/issue1601-csp-unsafe-inline-decision.test.mjs` 鎖定：
- `unsafe-inline` 的保留是**有意識決策**（next.config 註解指向本決策文件），非無聲漂移；
- 本決策文件存在且記錄選項 A/B 的不可行證據；
- 若未來 `script-src` 真的移除 `unsafe-inline`（達成 C），需同步更新本文件與測試。
