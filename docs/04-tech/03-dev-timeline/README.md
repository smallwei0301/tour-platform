# 03. 開發時程計劃

> 最後更新：2026-03-31

## 總覽

| Phase | 時間 | 目標 | 狀態 |
|-------|------|------|------|
| Phase 0 | Sprint 0 | 環境建置 + 基礎架構 | ✅ 完成 |
| Phase 1 | Sprint 1.0–1.9 | 前台 MVP（UI + 預約 + 金流 API） | ✅ 完成 |
| Phase 2 | Sprint 2.0–2.9 | Admin 後台深化（訂單、退款、導遊、營運追蹤、KPI） | ✅ 完成 |
| Phase 3 | Sprint 3.0–3.3 | Admin 安全 + UI 精修（RBAC、KKday 重設計） | ✅ 完成 |
| **Phase 4** | Sprint 4.0–4.2 | **行程後台 CRUD + Supabase 接線 + 正式上線** | ✅ **已完成** |
| Phase 5 | 未排期 | 導遊自主後台 + 評價系統 + 通知 + 結算 | 🔜 待開始 |
| Phase 6 | 未排期 | 成長功能（LINE Pay、SEO、搜尋、促銷） | 🔜 待開始 |

---

## ✅ Phase 0 — 環境建置（已完成）

- [x] GitHub repo + monorepo（apps/web, packages/ui, packages/config）
- [x] Next.js App Router 初始化
- [x] Supabase 專案建立 + migration / seed
- [x] Vercel 部署設定
- [x] GitHub Actions CI
- [x] Tailwind CSS + 元件庫

---

## ✅ Phase 1 — 前台 MVP UI + API（已完成）

### 前台頁面
- [x] 首頁（Hero、精選行程、導遊 Spotlight、FAQ、主題 CTA）
- [x] 活動列表 `/activities`（篩選 + 排序）
- [x] 活動詳情 `/activities/[region]/[slug]`（日期選擇器 + 預訂 bar）
- [x] 導遊列表 `/guides` + 導遊詳情 `/guides/[slug]`
- [x] 預訂流程 `/booking/[activityId]` → `/checkout` → `/order/success`
- [x] 訂單頁 `/orders` + `/orders/[orderId]`
- [x] 主題頁 `/theme/cave-exploration` + `/theme/river-trekking`
- [x] 導遊申請 `/guide/apply`
- [x] About / Why Choose Us / Blog / Contact
- [x] 法律頁面（隱私政策、服務條款、退款規則）

### API
- [x] `GET /api/experiences`
- [x] `POST /api/orders`
- [x] `POST /api/payments/ecpay/callback`
- [x] `GET /api/me/orders`
- [x] `POST /api/me/orders/[orderId]/refund-requests`
- [x] `POST /api/guide-applications`

---

## ✅ Phase 2 — Admin 後台深化（已完成）

- [x] Admin 訂單管理（列表 + 詳情 + 手動備註 + 例外 + audit log）
- [x] Admin 退款管理（審核 / 拒絕 / 處理中 / 完成）
- [x] Admin 導遊審核（申請列表 + 核准 / 退件 / 暫停）
- [x] Admin 營運追蹤（contribution margin + 人工成本 + 健康度 + CSV 匯出）
- [x] Admin Dashboard（KPI 摘要 + 趨勢圖）
- [x] KPI 可配置 + 版本控制 + 一鍵 rollback

---

## ✅ Phase 3 — Admin 安全 + UI 精修（已完成）

- [x] Admin RBAC 最小保護
- [x] Admin 登入（email + token → cookie session）
- [x] 登出 + session 過期提示
- [x] Token 輪替 + 強制登出所有 session
- [x] KKday 風格 UI/UX 全站重設計
- [x] Andy Lee 資料整合（fixture 版 + 本地圖片）
- [x] 行動版 layout 全面修正
- [x] 日期選擇器、月曆、activity badges 優化

---

## ✅ Phase 4 — 行程後台 CRUD + 正式上線（Sprint 4.0–4.2，已完成）

> **核心目標：** 讓 Admin 可在後台直接管理行程，前台從 DB 讀取真實資料，不需動 code 即可上線新行程。

### Sprint 4.0 — Supabase 正式接線（P0）
- [ ] `activities` table 確認（schema 已設計於 `02-database-schema.md`）
- [ ] `activity_schedules` table 確認
- [ ] `guide_profiles` table seed（Andy Lee 真實資料）
- [ ] 前台 `/activities`、`/activities/[region]/[slug]` 改接 Supabase
- [ ] 前台 `/guides`、`/guides/[slug]` 改接 Supabase
- [ ] 移除 `src/fixtures/andy-lee.ts` 和 `src/fixtures/data.ts` 硬編碼依賴

### Sprint 4.1 — Admin 行程管理（P0）
- [ ] `/admin/activities` — 行程列表頁（含狀態篩選：draft / published / archived）
- [ ] `/admin/activities/new` — 新增行程表單
- [ ] `/admin/activities/[id]/edit` — 編輯行程表單
- [ ] 表單欄位：標題、描述、地區、類別、價格、時長、人數限制、集合地點（含地圖 URL）、包含/不包含項目、注意事項、取消政策、封面圖、圖片
- [ ] 發佈 / 下架 / 封存狀態切換
- [ ] API：`GET/POST /api/admin/activities` + `GET/PUT /api/admin/activities/[id]`

### Sprint 4.2 — Admin 場次管理（P1）
- [ ] `/admin/activities/[id]/slots` — 場次列表
- [ ] 新增場次（日期、時間、容量）
- [ ] 開關場次（停售 / 重開）
- [ ] 顯示 booked_count / capacity
- [ ] API：`GET/POST /api/admin/activities/[id]/schedules`

### Sprint 4.3 — 圖片上傳（P1）
- [ ] Supabase Storage 或 Cloudinary 設定
- [ ] Admin 後台行程圖片上傳（封面圖 + gallery）
- [ ] 導遊照片上傳

### Sprint 4.4 — 上線準備（P0）
- [ ] Vercel Production 環境變數設定
- [ ] Supabase Production instance 設定
- [ ] Andy Lee Tour 1 + Tour 2 在後台新增並發佈
- [ ] 預訂流程 end-to-end 測試（含 ECPay sandbox）
- [ ] Release checklist 全項通過

### Sprint 4 Go/No-Go 條件
- [ ] Admin 可在後台新增行程並成功發佈
- [ ] 前台可從 DB 讀取行程並顯示
- [ ] 旅客可完成預訂 + 付款流程
- [ ] 付款後名額即時更新
- [ ] Vercel production URL 可正常存取

---

## 🔜 Phase 5 — 導遊自主後台 + 評價 + 通知（未排期）

### 導遊後台
- [ ] 導遊儀表板 `/guide/dashboard`
- [ ] 導遊行事曆 + 接受/拒絕預約
- [ ] 收益報表 `/guide/earnings`
- [ ] 提款申請 + 銀行帳號綁定
- [ ] 自動結算（活動完成後 T+7）

### 評價系統
- [ ] 行程結束後 Email 邀請評價
- [ ] 消費者評價表單
- [ ] 導遊評分顯示（星等 + 評論）
- [ ] 惡意評價檢舉

### 通知系統
- [ ] Email 通知（訂單確認、行程提醒、評價邀請）
- [ ] LINE Notify 串接（導遊接案通知）
- [ ] 後台通知中心

### Auth 完善
- [ ] 旅客帳號（Google / LINE 登入）
- [ ] 導遊帳號權限分離

---

## 🔜 Phase 6 — 成長功能（未排期）

- [ ] LINE Pay 串接
- [ ] SEO 優化（sitemap、meta、結構化資料）
- [ ] GA4 + 轉換追蹤
- [ ] 全文搜尋
- [ ] 促銷碼 / 折扣系統
- [ ] 企業包團詢價（B2B）
- [ ] PWA 支援

---

## 分支策略

```
main          ← 生產環境，只接受 PR
  └─ feat/kkday-ui-redesign  ← 目前開發主幹（Sprint 3.3 最新）
       └─ feature/*          ← Sprint 4 功能分支
```

## Sprint 規則

- Sprint 長度：2 週
- Code Review：PR 制
- Deploy to Production：每個 Sprint 結束後
