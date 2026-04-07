# Sprint 執行日誌

> 最後更新：2026-04-07
> 當前進度：Sprint 9 完成（旅客 Auth + Email 通知 + Login 頁面設計）

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

### Sprint 6 — 導遊儀表板（2026-04-02）

| 功能 | commit | 說明 |
|------|--------|------|
| migration 007：guide auth 欄位 | `29261c0` | invite_token / guide_password_hash / guide_session_version |
| guide-auth.ts（auth library） | `29261c0` | UUID invite token / SHA-256 password / HMAC session cookie |
| Admin 邀請碼 API + UI | `29261c0` | POST /api/admin/guides/[id]/invite + 管理頁按鈕 |
| Guide 登入頁 + session API | `29261c0` | 首次設密碼 / 一般密碼登入 / 登出 |
| middleware 路由保護 | `29261c0` | /guide/* 未登入 redirect，/guide/apply 白名單 |
| Guide Layout + Navbar | `29261c0` | 儀表板/場次/訂單 nav + 登出 |
| Dashboard + API | `29261c0` | 本月訂單 / 近期訂單 / 本週場次 |
| 場次管理 + API | `29261c0` | toggle 開啟/關閉 + 容量修改（含 ownership check） |
| 訂單查看 + API | `29261c0` | 列表 + 詳情 Modal + email masking + 電話顯示 |
| build error 修復 | `9e2ffb7` | workspace binary + TS hoist + SSR document.cookie fix |
| Judy code review 修正 | `078fd04` | /guide/apply 白名單 + Secure cookie + signature check |

---

## 🔖 當前狀態標記（更新：2026-04-02）

**最後 commit：** `078fd04` — fix(guide-auth): address Judy code review suggestions
**Branch：** `feat/guide-dashboard`
**整體完成度：** ~95%

### ✅ 已完成功能（截至 2026-04-02）
- 前台所有頁面（含行動版）
- Admin 後台：登入/登出/安全、訂單管理、退款管理、導遊審核（含邀請碼）、營運追蹤、KPI 設定
- Admin 行程 CRUD（含圖片上傳、方案管理、JSON 匯入匯出）
- ECPay 付款閉環（原子扣位 + 冪等 + trigger 額滿）
- **導遊後台完整：** 登入/登出、儀表板、場次管理、訂單查看、資料隔離
- Booking page 讀 DB（非 fixtures）
- ISR 60 秒快取（行程頁）
- Supabase Storage（activity-images bucket）
- 7 次 DB migration（001–007）

### 🔜 下一步
1. **ECPay 真實串接** — 真實刷卡 + webhook 驗簽
2. **旅客 Auth** — Google / LINE 登入
3. **Storage RLS** — 補 public SELECT policy
4. **Supabase Auth 整合（Phase 8）** — Guide 改用 Supabase Auth，廢除自製 session

---

## 技術債清單

| 編號 | 描述 | 優先 | 狀態 |
|------|------|------|------|
| TD-01 | Storage RLS 政策未設（靠 service role 繞過） | P1 | 🔴 未處理 |
| TD-02 | fn_book_schedule 缺乏超賣壓力測試 | P1 | 🔴 未處理 |
| TD-03 | E2E 測試未覆蓋付款閉環新流程 | P2 | 🟡 待更新 |
| TD-04 | 部分 DB 欄位 region_slug 仍為 null（台北無「市」後綴） | P2 | 🟡 已知問題 |
| TD-05 | Booking page 的 note 欄位未傳入 createOrder | P3 | 🟢 低優先 |

### Sprint 7 — 前台訂單流程完整化（2026-04-03）

| 功能 | commit | 說明 |
|------|--------|------|
| `/order/pay` 付款頁（mock） | `9298932` | 顯示訂單摘要 + 模擬 callback 付款 |
| `/order/success` 更新 | `9298932` | 顯示訂單狀態 badge + 跳轉我的訂單連結 |
| `/me/orders` 訂單列表頁 | `9298932` | Email 查詢訂單、狀態 badge 顏色分類 |
| `/me/orders/[orderId]` 詳情頁 | `9298932` | 完整訂單資訊 + 各狀態說明文字 |
| 取消訂單 UI + API | `9298932` | Dialog 確認 + PATCH /api/me/orders/:id |
| 申請退款 UI | `9298932` | textarea 填理由 + POST refund-requests |
| `cancelOrderDb` | `9298932` | email 所有權驗證 + 釋放 booked_count |
| Navbar「我的訂單」連結 | `9298932` | /me/orders 前台入口 |
| checkout 動態查詢排期 UUID | `ae09304` | 修復 hardcode 假 ID 導致 schedule not found |
| feat/guide-dashboard merge | `2073ea6` | Phase 6 導遊後台正式合入 main |
| feat/frontend-order-flow rebase | `ae09304` | 基於最新 main 建立，無衝突 |

**驗收（Judy E2E 手動測試 8/8 PASS）：**
- ✅ 下單 → 付款 → success 完整流程
- ✅ Email 查訂單列表
- ✅ 訂單詳情（各狀態說明文字）
- ✅ 取消訂單（pending_payment → cancelled_by_user + 席位釋放）
- ✅ 申請退款（paid → refund_pending）
- ✅ 後台狀態與前台一致

### Sprint 8 — 量測地基 + E2E 漏斗測試（2026-04-06）

| 功能 | commit | 說明 |
|------|--------|------|
| migration 008：events 表 | `239c6f1` | 記錄用戶漏斗事件 |
| migration 009：utm_params | `239c6f1` | UTM 參數追蹤 |
| track.ts（事件追蹤庫） | `703f908` | `trackEvent()` 函數封裝 |
| utm.ts（UTM 參數解析） | `703f908` | `getStoredUtm()` / `storeUtm()` |
| events.ts（完整事件定義） | `703f908` | view_activity / add_to_cart / begin_checkout / purchase_intent / purchase |
| /api/events route | `239c6f1` | 接收漏斗事件並存入 DB |
| Checkout 頁 UTM 捕獲 | `295ea4a` | getStoredUtm() + onSubmit 帶入 |
| E2E 漏斗測試骨架 | `703f908` | funnel-booking-payment.spec.ts（253 行，10 個 TC） |
| home-cta-explore testid | `703f908` | 首頁探索行程 CTA |
| activity-card testid | `703f908` | 行程卡片 |
| activity-detail-title testid | `703f908` | 詳情頁標題 |
| begin-checkout-btn testid | `703f908` | 開始預訂按鈕 |
| checkout-schedule-select testid | `703f908` | 預訂頁日期/方案選擇 |
| create-order-btn testid | `703f908` | 建立訂單按鈕 |
| view-orders-btn testid | `703f908` | 我的訂單頁跳轉 |
| orders-email-input testid | `703f908` | 訂單查詢 email 欄位 |
| order-list-item testid | `703f908` | 訂單列表項 |
| **order-id testid** | `03f6167` | **訂單編號（快修 2026-04-06 01:01）** |
| ECPay 回調 API（/api/payments/ecpay/callback） | `239c6f1` | 已就位待真實串接 |
| TP-004 PR 合入 main | `dca4eaf` | 2026-04-06 01:03，commit dca4eaf |

**驗收（Judy E2E 手動測試 10/10 PASS）：**
- ✅ 首頁 CTA → 行程卡片（testid: home-cta-explore / activity-card）
- ✅ 行程詳情 → 標題 + 詳情 Modal（testid: activity-detail-title）
- ✅ 開始預訂 → checkout 日期選擇（testid: begin-checkout-btn / checkout-schedule-select）
- ✅ 建立訂單 → success（testid: create-order-btn）
- ✅ 我的訂單 Email 查詢（testid: view-orders-btn / orders-email-input）
- ✅ 訂單列表 → 詳情（testid: order-list-item）
- ✅ **訂單編號顯示（testid: order-id）** ✅ 10/10 通過

---

### Sprint 9 — 旅客 Auth + Email 通知（2026-04-07）

| 功能 | commit | 說明 |
|------|--------|------|
| migration 008：events 表 | `6640c53` | 事件追蹤表（Supabase 執行） |
| migration 009：utm_params | `6640c53` | UTM 欄位 5 個 |
| migration 010：orders.user_id | `6640c53` | UUID，FK → auth.users |
| migration 011：Storage RLS | `6640c53` | activity-images public read |
| @supabase/ssr + resend 安裝 | `6640c53` | 替代 auth-helpers-nextjs |
| src/lib/supabase/client.ts | `6640c53` | Browser Supabase client |
| src/lib/supabase/server.ts | `6640c53` | Server Supabase client（SSR） |
| /auth/callback/route.ts | `6640c53` | OAuth redirect 處理 |
| /login 頁面 | `6be23da` | 品牌綠 + 飛機 SVG + 山景設計 |
| Navbar 登入/登出狀態 | `6640c53` | 顯示名稱 + 頭像 + 登出按鈕 |
| middleware.ts 加 Supabase refresh | `6640c53` | session cookies 自動更新 |
| /api/me/orders session-based | `6640c53` | 從 Supabase session 取 email |
| /me/orders 移除 email input | `6640c53` | 未登入 → redirect /login |
| /me/orders/[id] session-based | `6640c53` | 取消/退款用 session email |
| src/lib/email.ts | `6640c53` | Resend lazy-init，4 種 email |
| 訂單建立 email（/api/orders） | `6640c53` | fire-and-forget |
| 付款成功 email（/api/payments/ecpay/callback） | `6640c53` | fire-and-forget |
| 取消 email（/api/me/orders/[id]） | `6640c53` | fire-and-forget |
| 退款 email（/api/me/orders/[id]/refund-requests） | `6640c53` | fire-and-forget |
| 登入頁背景改 Unsplash 山景圖 | `b5ac4a2` | Unsplash 免費圖庫 |
| Supabase Auth URL 設定 | 手動 | site_url + uri_allow_list |
| Google OAuth env（Vercel） | API | GOOGLE_CLIENT_ID / SECRET |
| Resend env（Vercel） | API | RESEND_API_KEY / EMAIL_FROM |

**驗收（手動測試 10/10 PASS）：**
- ✅ /login 頁面正確渲染（Google 按鈕 + 品牌設計）
- ✅ Navbar 未登入顯示「登入/註冊」
- ✅ /me/orders 未登入 → client redirect to /login
- ✅ /api/me/orders 未登入 → 401 UNAUTHORIZED
- ✅ /api/me/orders/:id CANCEL 未登入 → 401
- ✅ /api/me/orders/:id/refund-requests 未登入 → 401
- ✅ /auth/callback route 存在（307）
- ✅ DB events 表含 utm 5 欄位
- ✅ DB orders 表含 user_id UUID
- ✅ Email lazy-init 不 crash（無 API key 也能 build）

---

## 🔖 當前狀態標記（更新：2026-04-07）

**最後 commit：** `b5ac4a2` — login page Unsplash mountain（2026-04-07）  
**Branch：** `feat/phase9-auth-notification` → merge to `main`  
**整體完成度：** Phase 9 100% ✅

### ✅ 已完成功能（截至 2026-04-07）
- 前台所有頁面（含行動版）
- **旅客 Google OAuth 登入 / 登出**（Supabase Auth）
- **登入頁全新設計**（品牌綠 + Unsplash 翠綠山景背景）
- **前台訂單完整流程：** 付款頁 / 我的訂單列表 / 詳情頁 / 取消 / 退款申請
- **Session-based 訂單查詢**（取代 email query，未登入自動跳 /login）
- **Email 通知系統**（Resend：訂單建立 / 付款成功 / 取消 / 退款）
- **事件追蹤系統：** track.ts / utm.ts / events.ts / /api/events
- **E2E 漏斗測試基礎：** funnel-booking-payment.spec.ts（10 個 TC）
- Admin 後台：登入/安全/訂單/退款/導遊審核/行程 CRUD/營運追蹤
- 導遊後台：登入/儀表板/場次管理/訂單查看
- ECPay 回調 API 就位
- 11 次 DB migration（001–011）
- Storage RLS public read（activity-images）

### 🔜 下一步（Phase 10）
1. **安全性 Checklist** — OWASP Top 10 + input validation（Phase 10）
2. **API Rate Limiting** — 所有 API route 加速率限制
3. **ECPay 真實串接** — 真實刷卡 + webhook 驗簽（Phase 10）
4. **評價系統** — 行程完成後留評閉環（Phase 12）
5. **Supabase Auth for Guides** — 廢除自製 session，改 Supabase Auth（Phase 12）

