# Midao for Guides — 導遊開店 SaaS 化 Roadmap（第 2–6 週）

> 狀態：規劃中（owner 2026-07-03 拍板方向）。
> 第 1 週（銷售漏斗＋shop 轉換改版）已實作：`/for-guides` 開店 landing、商店首頁公開方案卡＋信任列＋分享/QR、預約精靈延後登入、`shop_view`／`shop_begin_booking`／`shop_share` 事件埋點。
> 本文件記錄後續階段的範圍、既有基礎與收費前必修風險，供 follow-up issues 引用。

## 產品定位（第一階段）

不先賣「平台流量」，先賣「導遊自己的接單頁、預約系統、收款與營運工具」：

> 一個連結，讓旅客直接預約你的在地導覽。
> Midao 祕島幫導遊建立個人頁、行程頁、可預約時段、收款與訂單管理。

Beta 定價：月費 NT$0＋成交抽成 15%（既有導遊儀表板已顯示「平台抽成 15%，導遊實拿 85%」）。訂閱月費方案（Solo／Pro／Studio）留到第 4–6 週、有第一批實際接單導遊後再推。

## 第 2–3 週：降低預約阻力＋匯款 beta

### ① 商店 FAQ／取消／付款政策區塊擴充

- 商店首頁已有「付款與取消」靜態區塊（`data-testid="shop-policy"`）；擴充為緊湊 FAQ（`<details>` 摺疊）：如何預約／付款方式／取消與退款（連 `/legal/refund`）／如何聯絡導遊。
- 只動 `apps/web/app/guides/[slug]/shop/page.tsx`（可修改頁），同步擴充 `tests/ui/shop-landing-contract.test.mjs`。

### ② 匯款付款 beta

**後端已完整，剩文案與營運**（2026-07-03 盤點）：

- `POST /api/v2/bookings/[bookingId]/checkout` 已支援 `provider='transfer'`（flag 閘控）：建 `provider='transfer', status='pending'` 付款記錄、order 維持 `pending_payment`、booking 維持 draft，等後台以既有 manual-payment 流程人工核帳（`checkout/route.ts:249–307`）。
- `transfer-info` API、orders 頁 `?paid=transfer` 導向、`tests/api/issue1475-transfer-payment.test.mjs` 都已存在。
- 開啟＝Vercel env `NEXT_PUBLIC_TRANSFER_PAYMENT_ENABLED=1`（預設 OFF）。

剩餘工作：

1. book 頁 step 3 匯款文案強化：「匯款後由祕島人工對帳，1–2 個工作天內確認並通知你」。
2. `/shop/orders` 頁匯款 pending 訂單顯示「等待對帳確認」提示。
3. NEW `docs/operations/transfer-payment-beta-sop.md`：人工核帳 SOP（去哪看 pending transfer、如何用 manual-payment 標記入帳、對帳頻率承諾、逾時未匯處理）。
4. 風險：人工核帳容量——單量放大前不廣推；SOP 須明定對帳頻率。

### ③ 導遊後台「開店進度」新頁

- NEW `apps/web/app/guide/store-progress/page.tsx`（套 guide layout 自動有後台框架）＋ `guide/layout.tsx` `NAV_ITEMS` 加一項（注意：行動版底部 tab 已 8 項，若溢出退而只加桌面/下拉選單）。
- Checklist 5 項，client-side 組合**既有** guide API（零新後端）：
  - 上傳頭像、填寫介紹 → `GET /api/guide/profile`
  - 建立第一個行程＋方案 → `GET /api/guide/activities-with-plans`
  - 設定可預約時間 → `GET /api/guide/availability-rules`
  - 複製商店連結分享 → 頁內複製按鈕（複用 profile 頁 ShopLinkCard 的 clipboard pattern＋發 `shop_share`），完成寫 localStorage 標記。
- 頁內放商店連結卡＋QR（抽用商店首頁的 `ShopShareBar`，必要時搬到 `src/components/shop/` 共用）。
- e2e：`setGuideSession`＋`page.route` mock 上述 API。

### ④「本月商店表現」（顯示在開店進度頁，不動 dashboard）

- 依賴第 1 週埋的三事件（`shop_view`／`shop_begin_booking`／`shop_share`，properties 帶 `guide_slug`）。
- NEW domain 檔 `src/lib/db-shop-events.mjs`（**strangler 硬規則：不進 db.mjs**）：`getGuideShopStatsDb(guideSlug, {from, to})` — Supabase 分支查 `events` 表聚合，回 `{ views, beginBookings, shares, conversionRate }`；in-memory fallback 回零值 shape（events 只寫 Supabase）。附兩分支契約測試（範本 `tests/api/issue1384-flow-contract.test.mjs`）。
- NEW `apps/web/app/api/guide/shop-stats/route.ts`：`verifyGuideSession()` 驗證後回本月統計。
- 成效速查 SQL：`select event_name, count(*) from events where event_name in ('shop_view','shop_begin_booking','shop_share') group by 1;`

## 第 4–6 週：SaaS 訂閱化（方向性規劃，實作前需 owner 拍板定價）

- Migration：`guide_plan_tier`／`subscription_status`／`trial_ends_at`（目前 codebase 完全沒有訂閱概念——`activity_plan_tiers` 是票種定價、`refund_policies.tiers` 是退款級距，皆無關）。
- Admin 可手動調整導遊方案；Free／Solo／Pro 功能 gating；導遊後台顯示目前方案與升級 CTA；pricing page。
- 定價草案（未拍板）：Free NT$0＋15%；Solo NT$390–590＋10–12%；Pro NT$990–1,490＋6–8%；Studio NT$2,990+＋5–8%。
- 策略：先免費開店＋成交抽成，導遊有訂單後再升級低抽成月費方案；不先主打月費。

## 收費前必修風險（依 repo 健檢報告）

1. **confirmed → completed 靠 admin 手動**：沒人手動完成會影響導遊結算與評論邀請——導遊最在意「帶完團何時拿到錢」，收月費前必須自動化或建立明確 SLA。
2. **guide 密碼雜湊仍為單輪 SHA-256**：應改 `crypto.scrypt`；開始收費、承載更多導遊資料前優先修。
3. **SEO／多語系**：canonical／hreflang／`html lang` 缺口，`/guides` 無 JS 環境只見「載入中⋯」——賣「面向外國旅客的導遊」前要補。
4. **匯款人工核帳容量**：見上方 ②-4。

## 部署開關備忘

| Flag | 預設 | 用途 |
|---|---|---|
| `NEXT_PUBLIC_GUIDE_SHOP_ENABLED` | OFF | 商店三頁＋`/api/guides/[slug]/shop`；beta 對外前在 Vercel 開 `=1` |
| `NEXT_PUBLIC_TRANSFER_PAYMENT_ENABLED` | OFF | 匯款付款選項＋`provider='transfer'` checkout 分支；第 2–3 週 ② 完成後再開 |

`/for-guides` 與 Navbar／Footer／sitemap 入口無 flag，merge 即生效。
