# 方案卡片響應式多欄並排 — QA 驗收

- **驗收時間（Asia/Taipei）**：2026-07-02 09:28 CST
- **環境**：Playwright 管理之 `next dev`（`http://127.0.0.1:3333`，已注入 `NEXT_PUBLIC_SUPABASE_*` 佔位值）
- **base commit**：`1e3784e`（origin/main）
- **分支**：`claude/itinerary-reviews-carousel-9ehj0h`
- **判定**：**PASS**

## 需求

非手機模式下，讓「選擇方案」卡片依螢幕寬度多欄並排顯示（而非大螢幕仍單欄、卡片右側大片留白、且只顯示 2 個）。

## 根因

- `.kkd-plans-list` 原為 `display: grid`（未設 `grid-template-columns`）＝單欄，所有方案卡在桌機仍一張一列、右側大片留白。
- `DatePlanSection` 以 `PLANS.slice(0, 2)` 只 render 前 2 個方案，桌機也僅能看到 2 個。

## 變更內容

1. `apps/web/src/components/activity/DatePlanSection.tsx` — 改為 render 全部 `PLANS`（移除 `slice(0, 2)`）；`.kkd-plans-list` 依 `showAllPlans` 加上 `show-all` class（手機收合改由 CSS 控制）；「查看更多方案」切換鈕包進 `.kkd-plans-more-btn-wrap`。
2. `apps/web/app/globals.css`
   - 非手機（`min-width: 768px`）：`.kkd-plans-list` → `grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))`、`align-items: start`，依螢幕寬度多欄並排；窄欄卡片 `.kkd-plan-footer` 改直排、CTA 滿版；`.kkd-plans-more-btn-wrap` 隱藏（非手機全部方案直接顯示，不需展開）。
   - 手機（`max-width: 767.98px`）：`.kkd-plans-list:not(.show-all) > .kkd-plan-card:nth-child(n+3) { display: none }` — 收合時只顯示前 2 個，維持既有「查看更多方案」體驗。

> 手機版行為不變；桌機首圖 LCP／選取邏輯不受影響。

## 逐條驗證證據（真實 Chromium + 真實編譯 CSS）

> dev（無 Supabase）無 V2 `activity_plans` 種子資料，詳情頁顯示「尚無方案」訊息、不渲染方案卡（`NOT_AUTOMATABLE`：本機無法產生真實 V2 方案卡）。故新增 `e2e/issue-itinerary-plans-grid.spec.ts` 先載入詳情頁取得**實際編譯後的 globals.css**，再注入與元件同 class 結構的方案卡 DOM，對真實樣式規則量測；元件行為另由 source-contract 鎖定。

| 層級 | 驗證項目 | 結果 |
|------|---------|------|
| CSS（e2e） | 桌機（1280）`.kkd-plans-list` `grid-template-columns` 為多欄（track 數 > 1）、6 張卡全可見、`.kkd-plan-footer` 直排、切換鈕隱藏 | ✓ PASS |
| CSS（e2e） | 手機（390）單欄、收合時第 3 張以後隱藏（只顯示 2 張）、切換鈕可見 | ✓ PASS |
| CSS（e2e） | 手機（390）加 `show-all` → 6 張全可見 | ✓ PASS |
| 元件（source-contract） | render 全部 `PLANS`（無 `slice(0,2)`）、`show-all` class 切換、切換鈕包 `.kkd-plans-more-btn-wrap`、CSS 含多欄/收合/直排/隱藏規則 | ✓ PASS（4/4） |
| 回歸 | 全套 `node --test`：4096 pass / 0 fail / 3 skipped | ✓ PASS |

### 截圖 smoke（注入真實 class DOM，套用真實編譯 CSS）

- **桌機（主內容欄 816px）**：3 欄並排（實測 `grid-template-columns = 262.66px × 3`）、6 個方案填滿寬度、卡片右側不再留白；每張卡價格上、CTA 滿版按鈕下。
- **手機（390px）**：單欄、只顯示前 2 個方案（其餘由「查看更多方案」展開）。

（截圖於本機留存，未含密鑰／PII，故不入庫。）

## 回歸

- `npm run typecheck` — 綠燈
- `npm run lint` — 綠燈（僅 eslintrc 既有 deprecation 警告）
