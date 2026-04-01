# Sprint 執行日誌

> 最後更新：2026-04-01
> 當前進度：Sprint 4.5 完成（付款閉環 + 行程後台全面翻新）

---

## 已完成 Sprint 總覽

### Sprint 0 — 基礎架構
- monorepo 架構（apps/web, packages/ui, packages/config）
- Next.js App Router scaffold
- Vercel 部署設定
- GitHub Actions CI
- Supabase adapter（含 fallback）
- 煙霧測試腳本

### Sprint 1 — 前台 MVP UI
- 首頁（Hero、精選行程、導遊 Spotlight、FAQ、主題 CTA）
- 活動列表頁（篩選側欄、排序）
- 活動詳情頁（sticky booking sidebar、時間軸）
- 導遊列表頁、導遊個人頁
- 3-step 預訂流程（booking → checkout → success）
- 訂單列表 / 訂單詳情（含退款進度 UI）
- Cave / River 主題 landing page
- Blog、Contact、About、Why Choose Us
- 法律頁（隱私政策、退款規則、服務條款）
- 導遊申請頁

### Sprint 1.5–1.9 — 後台基礎 + 金流
- ECPay 金流 callback API
- Order create + seat occupancy API
- Payment callback flow
- `/api/experiences` — Supabase 接線
- `/api/orders` — 建立訂單
- `/api/me/orders` — 我的訂單 + 退款申請
- Admin refund panel MVP

### Sprint 2.0–2.9 — Admin 後台深化
- Sprint 2.0：Admin 訂單 2.0 + 導遊審核 1.0
- Sprint 2.1：訂單詳情 + 手動備註 + admin note
- Sprint 2.2：例外處理 + audit log skeleton
- Sprint 2.3：營運追蹤 MVP（contribution margin、人工成本、健康度、CSV 匯出）
- Sprint 2.4：admin dashboard 首頁整合
- Sprint 2.5–2.6：dashboard UX + 互動優化 + 行動版
- Sprint 2.7：KPI 定義校準 + 說明面板
- Sprint 2.8：可配置 KPI 計算器（admin settings）
- Sprint 2.9：KPI audit/versioning + 一鍵 rollback

### Sprint 3.0–3.3 — Admin 安全 + UI 精修
- Sprint 3.0：Admin RBAC 最小保護
- Sprint 3.1：Admin 登入（email + token → cookie session）
- Sprint 3.2：登出 + session 過期提示
- Sprint 3.3：Token 輪替 + 強制登出所有 session
- KKday 風格 UI/UX 重設計
- 行動版 layout 修正（hamburger、overflow、avatar crop）
- Andy Lee 資料整合（本地圖片資產、guide profile page）
- 日期選擇器 30 天捲軸、月曆 modal header 修正
- Activity badges / policy row 優化

### Sprint 4.0 — Supabase 正式接線
- Admin 行程 CRUD UI（列表、新增、編輯、發佈/下架）
- 前台從 fixture → DB 遷移完成（3 筆行程、9 筆評價實時同步）
- DatePlanSection 日期選擇（半日/全日方案、價格計算）
- KKday 雙欄 layout 恢復（sidebar 預約卡片、全部 section）
- 旅客評價系統（8 筆 seed 評價 + 實時同步驗證）
- E2E Playwright 測試（7 項測試涵蓋行程/價格/評價/admin）

### Sprint 4.2 — Admin 場次管理
- Admin 場次 CRUD（新增/編輯/刪除 + CONFLICT guard 409）
- Haiku 功能測試：6/6 全通過（Sprint 4.0–4.2 全面驗收）
- Vercel Production 上線：SSO 關閉 + env vars + API 全通

### Sprint 4.3 — 行程後台全面翻新（2026-04-01）

**核心目標：Activities 頁面所有欄位可由後台編輯，並建立方案管理系統**

| 功能 | commit | 說明 |
|------|--------|------|
| migration 004：`plans` JSONB 欄位 | `c1c3cb8d` | activities table 新增 plans 欄位 |
| migration 005：schedule plan_id | `c1c3cb8d` | 場次綁定方案 + fn_book_schedule + trg_auto_full_status |
| migration 006：itinerary + social_proof | `c1c3cb8d` | 新增 JSONB 欄位 |
| Admin GuideSearch（導遊搜尋） | `5698fb8` | 搜尋導遊並綁定行程 |
| Admin ImageUpload（圖片上傳） | `c1c3cb8d` | Supabase Storage，Canvas WebP 壓縮 |
| Admin savePlans（方案獨立儲存） | `c1c3cb8d` | 方案管理區塊 |
| Admin 批次排程（月曆 + 方案下拉） | `c1c3cb8d` | 批次開放日期場次 |
| GuideSearch click bug 修復 | `5698fb8` | label/onMouseDown 問題修復 |
| tagline 前台顯示修復 | `907a7b0` | h1 下方加 tagline |
| PlanDetailModal（7 tabs） | `91e8f98` | 方案詳情完整 Modal |
| PlanConfig 擴充（15+ 欄位） | `91e8f98` | language/price/itinerary/地點/須知/退款 |
| 新增行程直接建 DB 記錄 | `d4a0df4` | 移除雙步驟表單 |
| 刪除行程功能 | `d4a0df4` | 含 Storage 圖片清理 |
| Storage slug 亂碼修復 | `4bd2fd7` | 非 ASCII 字元過濾 |
| Itinerary 圖片上傳 | `ec41773` | 方案行程項目可傳圖 |
| Frontend 404 修復（region_slug） | `b495a50` | 8 地區 slug map |
| PlanDetailModal 置中 | `6ca8dd0` | 改為 transform: translate(-50%, -50%) |
| 方案卡片摺疊（顯示 2 個 + 展開） | `6ca8dd0` | showAllPlans 狀態 |
| JSON 匯入/匯出 | `6ca8dd0` + `991f89c` | 含驗證 + diff 預覽 |
| Gallery URL 縮圖預覽 | `991f89c` | 96×64 縮圖 + 移除按鈕 |
| 樣本 JSON 完整版 | `f52d10d` + `6aa6d80` | 柴山秘境之旅豐富版 |
| 後台下載 JSON 改為豐富版 | `a795158` | downloadTemplate() 同步更新 |

### Sprint 4.4 — ImageCarousel + 行程頁改版（2026-04-01）

| 功能 | commit | 說明 |
|------|--------|------|
| ImageCarousel（手機 swipe） | `3b1f290`內 | scroll-snap + Intersection Observer |
| itinerary timeline section | 同上 | 行程時間軸前台顯示 |
| db.mjs JSON.stringify 雙重編碼修復 | `3057c84` | faq/itinerary JSONB 欄位 |

### Sprint 4.5 — 付款閉環（2026-04-01）

| 功能 | commit | 說明 |
|------|--------|------|
| processPaymentCallbackDb 改用 fn_book_schedule RPC | `9761b4f` | SELECT FOR UPDATE 原子扣位 |
| 付款冪等處理 | `9761b4f` | 重複 callback 不重複扣位 |
| 付款回調 API HTTP status 修正 | `9761b4f` | 409/404 正確對應 |
| fetchActivityBySlug client API | `9761b4f` | booking page 從 DB 讀取行程 |
| Booking page 讀 DB（移除 fixtures） | `9761b4f` | 移除 hardcoded chaishanMap |
| Booking page 讀 URL query params | `9761b4f` | scheduleId/plan/date from DatePlanSection |
| Activity page ISR 60s revalidate | `9761b4f` | booked_count 60 秒內反映 |
| router.refresh() after payment | `9761b4f` | 付款後強制 revalidate |

---

## 🔖 當前狀態標記（更新：2026-04-01）

**最後 commit：** `9761b4f` — feat: 付款→訂位扣量流程完整實作
**Branch：** `feat/guide-pages-step2`
**整體完成度：** ~90%

### ✅ 已完成功能（截至 2026-04-01）
- 前台所有頁面（含行動版）
- Admin 後台：登入/登出/安全、訂單管理、退款管理、導遊審核、營運追蹤、KPI 設定
- Admin 行程 CRUD（含圖片上傳、方案管理、JSON 匯入匯出）
- ECPay 付款閉環（原子扣位 + 冪等 + trigger 額滿）
- Booking page 讀 DB（非 fixtures）
- DatePlanSection × 方案 × 剩餘名額即時顯示
- ISR 60 秒快取（行程頁）
- Supabase Storage（activity-images bucket）
- 6 次 DB migration（001–006）

### 🔜 下一步
1. **導遊儀表板** — 導遊可登入並自主管理場次開關
2. **ECPay 真實串接** — 真實刷卡 + webhook 驗簽
3. **旅客 Auth** — Google / LINE 登入
4. **Storage RLS** — 補 public SELECT policy
5. **E2E 測試更新** — 覆蓋付款閉環新流程

---

## 技術債清單

| 編號 | 描述 | 優先 | 狀態 |
|------|------|------|------|
| TD-01 | Storage RLS 政策未設（靠 service role 繞過） | P1 | 🔴 未處理 |
| TD-02 | fn_book_schedule 缺乏超賣壓力測試 | P1 | 🔴 未處理 |
| TD-03 | E2E 測試未覆蓋付款閉環新流程 | P2 | 🟡 待更新 |
| TD-04 | 部分 DB 欄位 region_slug 仍為 null（台北無「市」後綴） | P2 | 🟡 已知問題 |
| TD-05 | Booking page 的 note 欄位未傳入 createOrder | P3 | 🟢 低優先 |
