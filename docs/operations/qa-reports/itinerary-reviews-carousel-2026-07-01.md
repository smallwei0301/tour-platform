# 行程頁「旅客評價」改為左右滑動輪播 — QA 驗收

- **驗收時間（Asia/Taipei）**：2026-07-01 00:23 CST
- **環境**：本機 `next dev`（Playwright 管理之 webServer，`http://127.0.0.1:3333`，已注入 `NEXT_PUBLIC_SUPABASE_*` 佔位值）
- **base commit**：`b050992`（origin/main）
- **分支**：`claude/itinerary-reviews-carousel-9ehj0h`
- **判定**：**PASS**

## 需求

行程詳情頁（`/activities/[region]/[slug]` 的「旅客評價」section）原本評價卡片以垂直堆疊（`display: grid`）呈現，需改成**左右滑動**的卡片瀏覽方式。

## 變更內容

1. `apps/web/app/globals.css` — `.kkd-review-list` 由 `display: grid` 改為橫向 `flex` + `overflow-x: auto` + `scroll-snap-type: x mandatory`（沿用本頁評價照片既有的 scroll-snap 樣式慣例），並加上細捲軸樣式；`.kkd-review-card` 改為 `flex: 0 0 auto; width: min(86%, 340px); scroll-snap-align: start`，使卡片固定寬度並排、可左右滑動，手機下露出下一張卡片邊緣作為「可滑動」提示。
2. `apps/web/app/[locale]/activities/[region]/[slug]/page.tsx` — 評價清單容器加上 `role="region"`、`aria-label`、`tabIndex={0}`，讓鍵盤使用者也能聚焦並捲動該橫向區域（無障礙）。

> 純 CSS + server component 屬性調整，未引入 client JS；手機觸控滑動、桌機觸控板／捲軸皆可左右瀏覽。

## 逐條驗證證據

以 in-memory fixture `kaohsiung-chaishan-cave-experience`（4 真實評論 + 4 口碑語錄 = 共 8 則）為對象，新增 `apps/web/e2e/issue-itinerary-reviews-carousel.spec.ts`，於真實 Chromium 跑通：

| # | 驗證項目 | 結果 |
|---|---------|------|
| 1 | 評價清單為橫向卷軸（`overflow-x: auto/scroll`、`display: flex`、`scroll-snap-type` 含 `x`），非垂直堆疊 | ✓ PASS |
| 2 | 評價卡並排於同一列（前兩張 `y` 相同、第二張 `x` 較大），且 `scrollWidth > clientWidth`（內容溢出可滑動） | ✓ PASS |
| 3 | 程式化設定 `scrollLeft = scrollWidth` 後位置確實前移（可左右滑動） | ✓ PASS |
| 4 | 手機視窗（390px）下輪播不溢出版面、仍為橫向卷軸 | ✓ PASS |

```
4 passed (37.2s)
```

### 真實瀏覽器 smoke（截圖證據）

- **手機（430px）**：第一張「小美（台北）」卡片約佔 86% 寬，右側露出下一張「David K.」卡片邊緣 → 明確的可左右滑動提示。
- **桌機（1280px）**：將 `scrollLeft` 右移 380px 後，可視卡片由開頭切換為「David K.／阿翔／陳老師」 → 橫向捲動生效。

（截圖於本機留存，未含密鑰／PII，故不入庫。）

## 回歸

- `npm run typecheck` — 綠燈
- `npm run lint` — 綠燈（僅 eslintrc 既有 deprecation 警告，無 error）
- 既有評價照片橫向滑動測試（`issue-itinerary-favorites-reviews.spec.ts` 中評價相關案例）— 仍通過。
- 同檔另兩個案例（地區列表頁的收藏愛心、導遊認證標章色）失敗，但已於 base commit `b050992`（未含本變更）同樣失敗，確認為既有環境問題、與本變更無關。

## 備註

- 本機手動啟動的 `next dev` 若未注入 `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`，client 端 `@supabase/ssr` 會丟錯而觸發錯誤邊界；正式驗證改用 Playwright 內建 webServer（已帶佔位 env）即正常。此為環境設定，非程式缺陷。
