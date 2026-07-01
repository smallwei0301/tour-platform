# 復原 #1547 並改為「大圖＋可捲動縮圖列」相簿 — QA 驗收

- **驗收時間（Asia/Taipei）**：2026-07-01 13:23 CST
- **環境**：Playwright 管理之 `next dev`（`http://127.0.0.1:3333`，已注入 `NEXT_PUBLIC_SUPABASE_*` 佔位值）
- **base commit**：`526f3bf`（origin/main）
- **分支**：`claude/itinerary-reviews-carousel-9ehj0h`
- **判定**：**PASS**

## 需求

1. **復原本次 merge（#1547）**。
2. **電腦版活動照片**改為：右側小圖（縮圖）可捲動，選擇後左側大圖換成該張（原大圖回到縮圖）。
3. **旅客評價復原後不動**（回到 #1547 前的狀態，不再調整）。

## 變更內容

1. `git revert 228ad43`（#1547 squash-merge）——復原：活動照片相簿回到桌機 grid、旅客評價 `.kkd-review-card` 回到 `min(86%, 340px)`、移除 #1547 的 e2e/QA 檔。旅客評價**自此不再改動**。
2. 於復原後的基礎上，重做電腦版相簿為「大圖 + 可捲動縮圖列」：
   - `apps/web/src/components/activity/ImageCarousel.tsx`：新增 `mainIndex` state；桌機左側顯示 `validImages[mainIndex]` 大圖，右側 `.kkd-gallery-thumbs` 列出**全部**照片為可點選的 `<button>` 縮圖，點選即 `setMainIndex(i)` 把該張切成大圖（`aria-selected` / `active` 標記選中）。`safeMainIndex` 夾住範圍避免載入失敗時越界。手機維持既有左右滑動輪播不變。
   - `apps/web/app/globals.css`：桌機 `.kkd-gallery-desktop` 改為 `grid-template-columns: minmax(0,1fr) 128px`；`.kkd-gallery-main-wrap` 大圖 440px；`.kkd-gallery-thumbs` 垂直排列、`overflow-y: auto`（縮圖列可捲動、細捲軸）；`.kkd-gallery-thumb-btn.active` 以品牌金色框標記選中。
   - `apps/web/messages/{zh-Hant,en}.json`：新增 `imageCarousel.thumbnailsLabel` / `thumbnailItem`（縮圖列與各縮圖的無障礙標籤）。

> 因縮圖列可捲動且列出全部照片，電腦版可瀏覽所有照片（不再受「只顯示前 4 張」限制）。

## 逐條驗證證據（真實 Chromium）

新增 `apps/web/e2e/issue-itinerary-gallery-thumbs.spec.ts`：

| 區塊 | 驗證項目 | 結果 |
|------|---------|------|
| 相簿 | 電腦版顯示 `.kkd-gallery-desktop`（大圖＋縮圖列），手機輪播 `.kkd-carousel-track` 於桌機隱藏 | ✓ PASS |
| 相簿 | 右側 `.kkd-gallery-thumbs` 為 `overflow-y: auto/scroll` 之可捲動容器；縮圖按鈕數 = 照片數（全部可瀏覽） | ✓ PASS |
| 相簿 | 點右側縮圖後，左側大圖 `src` 換成被點那張，且該縮圖 `active` + `aria-selected="true"` | ✓ PASS |
| 相簿 | 手機版仍為左右滑動輪播（`.kkd-carousel-track` `overflow-x`），桌機大圖/縮圖列於手機隱藏 | ✓ PASS |
| 回歸 | `issue-itinerary-reviews-carousel.spec.ts`（4 案例）—— 旅客評價復原後仍綠 | ✓ PASS |
| 回歸 | `activity-image-fallback.spec.ts` —— 優化器失敗退回原圖仍綠 | ✓ PASS |

```
issue-itinerary-gallery-thumbs：3 passed
issue-itinerary-reviews-carousel：4 passed
activity-image-fallback：1 passed
```

### 截圖 smoke

- 初始：左側大圖＝第 1 張，右側縮圖列（全部照片）、第 1 張以金色框標記選中。
- 點第 3 張縮圖後：左側大圖換成該張、第 3 張縮圖金色框標記選中，原第 1 張回到縮圖列（「選擇後左邊大圖變為小圖」）。

（截圖於本機留存，未含密鑰／PII，故不入庫。）

## 回歸

- `npm run typecheck` — 綠燈
- `npm run lint` — 綠燈（僅 eslintrc 既有 deprecation 警告）
