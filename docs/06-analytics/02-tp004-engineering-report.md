# TP-004 工程回報：量測地基 + 漏斗測試骨架

> 作者：Tracy｜日期：2026-04-04｜Branch：feat/tp004-measurement-testids

---

## 一、實際改動檔案

### 新增

| 檔案 | 說明 |
|------|------|
| `apps/web/src/lib/utm.ts` | UTM 參數擷取 / sessionStorage 快取 / checkout 帶入 helper |
| `supabase/migrations/009_events_utm.sql` | events table 補 UTM 5 個欄位 + 索引 |
| `apps/web/e2e/funnel-booking-payment.spec.ts` | 完整漏斗 E2E 測試骨架（7 個步驟 + 5 個 smoke tests） |
| `docs/06-analytics/02-tp004-engineering-report.md` | 本文件 |

### 修改

| 檔案 | 改動 |
|------|------|
| `apps/web/app/layout.tsx` | 加入 `<Analytics />` + `<SpeedInsights />`（Vercel） |
| `apps/web/package.json` | 新增 `@vercel/analytics` + `@vercel/speed-insights` |
| `apps/web/src/components/home/HeroSection.tsx` | 補 `data-testid="home-cta-explore"` / `"home-cta-guides"` |
| `apps/web/app/activities/ActivitiesContent.tsx` | 補 `data-testid="activity-card"` / `"activity-card-link"` |
| `apps/web/app/activities/[region]/[slug]/page.tsx` | 補 `data-testid="activity-detail-title"` / `"begin-checkout-btn"`；`/booking/:slug` → `/checkout?slug=:slug` |
| `apps/web/app/checkout/page.tsx` | 補 `data-testid="checkout-schedule-select"` / `"create-order-btn"` |
| `apps/web/app/order/success/page.tsx` | 補 `data-testid="order-id"` / `"view-orders-btn"` |
| `apps/web/app/me/orders/page.tsx` | 補 `data-testid="orders-email-input"` / `"order-list-item"` |

Cherry-pick（來自 feat/event-tracking）：

| 檔案 | 說明 |
|------|------|
| `supabase/migrations/008_events.sql` | events table 基礎 schema |
| `apps/web/app/api/events/route.ts` | `POST /api/events` API route |
| `apps/web/src/lib/events.ts` | 事件型別定義 |
| `apps/web/src/lib/track.ts` | track() / trackServer() helper |
| `apps/web/app/api/payments/ecpay/callback/route.ts` | 補 payment_callback_received / payment_succeeded 打點 |

---

## 二、已落地項目

### Task 1：量測地基

| 項目 | 狀態 | 說明 |
|------|------|------|
| Vercel Analytics | ✅ 已落地 | layout.tsx 加入 `<Analytics />`，部署後自動啟用 |
| Vercel Speed Insights | ✅ 已落地 | layout.tsx 加入 `<SpeedInsights />`，Core Web Vitals 監控 |
| UTM 存 sessionStorage | ✅ 已落地 | `utm.ts`：captureUtm() / getStoredUtm() / clearUtm() |
| UTM 欄位進 events DB | ✅ Migration 已建 | `009_events_utm.sql`，需人工在 Supabase 執行 |
| events table 漏斗骨架 | ✅ 已落地（cherry-pick） | `008_events.sql` + `/api/events` + `track.ts` |

### Task 2：data-testid 標準

| Selector | 所在頁面 | 狀態 |
|----------|---------|------|
| `home-cta-explore` | 首頁 Hero | ✅ |
| `home-cta-guides` | 首頁 Hero | ✅ |
| `activity-card` | 活動列表 | ✅ |
| `activity-card-link` | 活動列表卡片 | ✅ |
| `activity-detail-title` | 活動詳情 h1 | ✅ |
| `begin-checkout-btn` | 活動詳情 CTA | ✅ |
| `checkout-schedule-select` | Checkout 排期選單 | ✅ |
| `create-order-btn` | Checkout 建立訂單 | ✅ |
| `order-id` | 訂單成功頁 | ✅ |
| `view-orders-btn` | 訂單成功頁 | ✅ |
| `orders-email-input` | 我的訂單查詢 | ✅ |
| `order-list-item` | 我的訂單列表項 | ✅ |

### Task 3：E2E 測試骨架

| 測試 | 覆蓋範圍 | 狀態 |
|------|---------|------|
| Step 1: 首頁 → 活動列表 | home-cta-explore + URL 跳轉 | ✅ 已建 |
| Step 2: 活動卡片可見 | activity-card count > 0 | ✅ 已建 |
| Step 3: 活動詳情頁 | title + begin-checkout-btn | ✅ 已建 |
| Step 4: Checkout 頁 | 排期選單 + 建立訂單按鈕 | ✅ 已建 |
| Step 5: 建立訂單 | redirect + orderId 取得 | ✅ 已建 |
| Step 6: Mock 付款 | ecpay/callback + 驗證 ok:true | ✅ 已建 |
| Step 7: 訂單列表 | email 查詢 + order-list-item | ✅ 已建 |
| Smoke tests x5 | 各頁 testid 完整性驗證 | ✅ 已建 |

---

## 三、暫未完成（Blocker 說明）

| 項目 | Blocker | 建議下一步 |
|------|---------|-----------|
| UTM 寫入 events（checkout submit 時） | checkout/page.tsx 目前未呼叫 `getStoredUtm()` | 在 `onSubmit` 中呼叫 `getStoredUtm()` 並帶入 track() |
| E2E 測試實際執行 | 需要 DB 有活動資料 + 可用排期 | 補 seed 資料或用 `TEST_ACTIVITY_SLUG` env 指定 |
| Vercel Analytics Dashboard | 需要部署到 Vercel 後才能看到資料 | merge 後部署即啟用 |
| events table 008/009 migration | 需人工在 Supabase Dashboard 執行 | 見下方驗收步驟 |
| 活動詳情頁 CTA redirect | 舊版指向 `/booking/:slug`，已改為 `/checkout?slug=:slug` | 確認 `/booking/` route 是否有其他用途 |

---

## 四、下一步最小可交付

1. **立刻可做**（< 30 min）：
   - Supabase Dashboard 執行 `008_events.sql` + `009_events_utm.sql`
   - merge 本 branch → 部署 Vercel，Analytics 自動啟動

2. **本週內**（P1）：
   - `checkout/page.tsx` 的 `onSubmit` 補 `begin_checkout` + `purchase_intent` track()
   - `ActivitiesContent.tsx` 補 `view_item_list` + `select_item` track()

3. **下週**（P2）：
   - E2E 測試補 seed 資料（或用 fixture）確保 CI 可執行
   - 管理後台補漏斗查詢頁（`SELECT event_name, COUNT(*) FROM events GROUP BY event_name`）

---

## 五、驗收方式

```bash
# 1. TypeScript 型別驗證（無錯誤）
cd apps/web && npx tsc --noEmit

# 2. E2E smoke tests（需 dev server 跑在 localhost:3333）
npx playwright test e2e/funnel-booking-payment.spec.ts --grep "Smoke"

# 3. 完整漏斗測試（需 DB 有資料 + 可用排期）
TEST_ACTIVITY_SLUG=xxx npx playwright test e2e/funnel-booking-payment.spec.ts

# 4. Vercel Analytics 確認
# 部署後至 https://vercel.com/[team]/[project]/analytics 查看
```

```sql
-- 5. Supabase 執行 migration 驗收
SELECT column_name FROM information_schema.columns
WHERE table_name = 'events'
ORDER BY ordinal_position;
-- 應包含：utm_source, utm_medium, utm_campaign, utm_content, utm_term

-- 6. 漏斗基本查詢
SELECT event_name, COUNT(*) as cnt
FROM events
GROUP BY event_name
ORDER BY cnt DESC;
```
