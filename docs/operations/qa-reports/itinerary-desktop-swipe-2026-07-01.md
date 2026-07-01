# 行程頁電腦版套用手機版「左右滑動」樣式 — QA 驗收

- **驗收時間（Asia/Taipei）**：2026-07-01 09:55 CST
- **環境**：Playwright 管理之 `next dev`（`http://127.0.0.1:3333`，已注入 `NEXT_PUBLIC_SUPABASE_*` 佔位值）
- **base commit**：`de5db8b`（origin/main）
- **分支**：`claude/itinerary-reviews-carousel-9ehj0h`
- **判定**：**PASS**

## 需求

1. 電腦版的「左右滑動滑桿」套用手機版樣式設計 —— 涵蓋兩個區塊：
   - 上方**活動照片相簿**：電腦版改用手機的左右滑動輪播。
   - **旅客評價**卡片：電腦版與手機一致，一次一張大卡＋露出下一張。
2. 行程頁的活動照片在電腦上**無法滑到其他更多照片** —— 修正之。

## 根因

- `ImageCarousel` 元件在桌機（`@media min-width:768px`）把手機的滑動輪播 `display:none`，改渲染 `.kkd-gallery-desktop` 的 3:1 grid，且只取 `validImages.slice(1,4)` = **主圖 + 3 張縮圖 = 最多 4 張**，第 5 張以後在電腦上完全無法瀏覽。
- 旅客評價卡片 `.kkd-review-card` 寬度為 `min(86%, 340px)`，桌機因 340px 上限一次擠出多張窄卡，與手機「一次一張＋露出下一張」的樣式不一致。

## 變更內容

1. `apps/web/src/components/activity/ImageCarousel.tsx` — 移除桌機專用 3:1 grid 區塊，手機與桌機統一使用同一個左右滑動輪播（scroll-snap track + 圓點指示），所有照片各為一個 slide，桌機亦可滑覽全部。
2. `apps/web/app/globals.css`
   - 移除 `.kkd-gallery-desktop / -main / -grid / -thumb` 及桌機 grid 的 media query；桌機改讓 `.kkd-carousel-slide` 高度加大為 `440px` 作為主視覺。
   - `.kkd-review-card` 由 `width: min(86%, 340px)` 改為 `width: 86%`（拿掉桌機 340px 上限），桌機與手機皆一次一張大卡＋露出下一張。
3. `apps/web/app/[locale]/activities/[region]/[slug]/page.tsx` — `ImageCarousel` 的 `sizes` 由 `(min-width: 768px) 0vw, 100vw` 改為 `(min-width: 1200px) 1168px, 100vw`（桌機輪播不再隱藏，需給正確載入尺寸）。

> 純 CSS + 元件結構調整，未新增 client 邏輯；LCP 首圖仍由輪播第一張 `priority` 預載。

## 逐條驗證證據（真實 Chromium）

新增 `apps/web/e2e/issue-itinerary-desktop-swipe.spec.ts`，並回歸既有 spec：

| 區塊 | 驗證項目 | 結果 |
|------|---------|------|
| 相簿 | 電腦版 `.kkd-carousel-track` 可見且 `display: flex`；`.kkd-gallery-desktop` 已移除（count 0） | ✓ PASS |
| 相簿 | 每張照片皆為一個 slide（>1）、`scrollWidth > clientWidth`、程式化捲到尾端位置前移（可滑到更多照片） | ✓ PASS |
| 相簿 | 圓點指示（dots）電腦版可見 | ✓ PASS |
| 評價 | 電腦版單張評價卡寬 / 容器寬 > 0.7（≈86%，一次一張大卡＋露出下一張，非多張窄卡），且可左右滑動 | ✓ PASS |
| 回歸 | `issue-itinerary-reviews-carousel.spec.ts`（4 案例）仍全綠 | ✓ PASS |
| 回歸 | `activity-image-fallback.spec.ts`（優化器失敗退回原圖，查 `.kkd-carousel-wrap img`）仍綠 | ✓ PASS |

```
issue-itinerary-desktop-swipe + issue-itinerary-reviews-carousel：9 passed
activity-image-fallback：1 passed
```

### 截圖 smoke

- **電腦版相簿**：全寬單張主視覺（440px 高）＋底部圓點；程式化右捲可切換到下一張照片 → 可滑覽全部。
- **電腦版旅客評價**：單張大卡「小美（台北）」約佔 86% 寬，右側露出下一張「David K.」→ 與手機一致的一次一張＋露出下一張。

（截圖於本機留存，未含密鑰／PII，故不入庫。）

## 回歸

- `npm run typecheck` — 綠燈
- `npm run lint` — 綠燈（僅 eslintrc 既有 deprecation 警告）
