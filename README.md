# Tour Platform — 台灣在地導遊交易平台

> **一句話定位：** 讓旅客可以直接預約真正在地的導遊與特色行程，讓導遊可以管理場次、接單、收款與營運。

---

## 🔖 目前專案狀態（2026-04-02 更新）

```
Phase 1 前台 MVP         ████████████ 100%  ✅
Phase 2 Admin 後台核心   ████████████ 100%  ✅
Phase 3 UI 精修          ████████████ 100%  ✅
Phase 4 行程後台         ████████████ 100%  ✅
Phase 5 付款扣位完整閉環 ████████████ 100%  ✅ 2026-04-01 完成
Phase 6 導遊儀表板       ████████████ 100%  ✅ 2026-04-02 完成
整體完成度：~95%（核心交易閉環 + 導遊後台完整，待正式金流串接）
```

**最新里程碑（2026-04-02）🎉**
- ✅ **導遊後台完整實作**：登入（邀請碼 + 密碼設定）、儀表板、場次管理、訂單查看
- ✅ **Admin 產生登入碼**：管理員可對已審核導遊一鍵產生 24 小時邀請連結
- ✅ **資料隔離**：場次/訂單 API 均有 `guide_id` ownership 驗證，403 防護
- ✅ **Email 隱碼保護**：旅客 Email 在導遊端自動 masking（j\*\*\*@gmail.com）
- ✅ **Production Secure cookie**：session cookie 在正式環境自動加 `Secure` 旗標
- ✅ **Judy Code Review 通過**：14/14 unit tests PASS + build 成功（詳見 Phase 6 report）

**前一週里程碑（2026-04-01）**
- ✅ 付款 → 訂位扣量完整閉環：`fn_book_schedule` 原子 RPC + booking page 讀 DB + ISR 即時更新
- ✅ E2E 測試 8/8 ALL PASS（見 `docs/04-tech/03-dev-timeline/e2e-test-report-2026-04-01.md`）

---

## ✅ 完整功能清單

### 前台（旅客端）

| 功能 | 狀態 |
|------|------|
| 首頁（Hero、精選行程、導遊 Spotlight、FAQ） | ✅ |
| 行程列表頁（篩選、排序、地區分類） | ✅ |
| 行程詳情頁（KKday 風格雙欄 layout） | ✅ |
| 圖片 Carousel（手機 swipe / 桌機 grid） | ✅ |
| 方案選擇（DatePlanSection：日期 × 方案 × 剩餘名額） | ✅ |
| 方案詳情 Modal（7 tabs，含地圖連結） | ✅ |
| 行程時間軸（itinerary timeline） | ✅ |
| 旅客評價顯示 | ✅ |
| 導遊列表 / 個人頁 | ✅ |
| 3-step 預訂流程（選場次 → 填資料 → 付款） | ✅ |
| 預訂頁讀取 DB 資料（非 hardcode fixtures） | ✅ 2026-04-01 |
| 訂單詳情 / 退款申請 | ✅ |
| 主題 landing page（Cave / River） | ✅ |
| Blog、About、Contact、法律頁（共 20+ 頁面） | ✅ |
| 行動版 RWD | ✅ |

### Admin 後台（管理端）

| 功能 | 狀態 |
|------|------|
| 登入 / 登出 / Session 管理 | ✅ |
| Token 輪替 + 強制登出所有 Session | ✅ |
| 訂單管理（列表 + 詳情 + 備註 + 例外 + audit log） | ✅ |
| 退款管理 | ✅ |
| 導遊審核 | ✅ |
| **導遊產生邀請碼（一鍵生成 24h 邀請連結）** | ✅ 2026-04-02 |
| 營運追蹤（contribution margin + CSV） | ✅ |
| KPI 可配置設定（版本控制 + rollback） | ✅ |
| 行程列表 + 新增 + 刪除 | ✅ |
| 行程編輯（所有欄位可後台編輯） | ✅ |
| 導遊搜尋（GuideSearch） | ✅ |
| 圖片上傳（封面 + Gallery，Supabase Storage） | ✅ |
| 方案管理（PlanEditor，含完整方案詳情欄位） | ✅ |
| 排程管理（批次日期 × 方案開關 + 容量） | ✅ |
| JSON 行程匯入（含驗證 + diff 預覽） | ✅ |
| JSON 樣板下載（豐富版柴山秘境範例） | ✅ |
| 查看前台連結（後台直達行程前台） | ✅ |

### 導遊後台（Guide Dashboard）

| 功能 | 狀態 |
|------|------|
| 導遊登入（邀請碼首次設密碼 / 一般密碼登入） | ✅ 2026-04-02 |
| 導遊登出 + Session 管理（7 天 cookie） | ✅ 2026-04-02 |
| 儀表板（本月訂單數 / 近期訂單 / 本週場次） | ✅ 2026-04-02 |
| 場次管理（開啟/關閉 toggle + 容量調整） | ✅ 2026-04-02 |
| 訂單查看（列表 + 詳情 Modal + 狀態篩選） | ✅ 2026-04-02 |
| 旅客 Email 隱碼保護（j\*\*\*@gmail.com） | ✅ 2026-04-02 |
| 旅客電話顯示（完整號碼，僅導遊可見） | ✅ 2026-04-02 |
| 資料隔離（guide_id ownership 驗證，403 防護） | ✅ 2026-04-02 |
| 路由保護（middleware 攔截未登入存取） | ✅ 2026-04-02 |

### 付款與訂位

| 功能 | 狀態 |
|------|------|
| 建立訂單（POST /api/orders） | ✅ |
| 付款 callback（ECPay 模擬） | ✅ |
| 原子扣位（`fn_book_schedule` RPC，SELECT FOR UPDATE） | ✅ 2026-04-01 |
| 冪等付款處理（重複 callback 不重複扣位） | ✅ 2026-04-01 |
| Trigger 自動標記額滿（`trg_auto_full_status`） | ✅ |
| 付款失敗 409 Conflict 保護 | ✅ 2026-04-01 |
| ISR 60 秒快取（行程頁 booked_count 即時反映） | ✅ 2026-04-01 |
| **E2E 測試驗證（8/8 PASS）** | ✅ 2026-04-01 |

### DB（Supabase PostgreSQL）

| Table / 功能 | 狀態 |
|------|------|
| users, guide_profiles, activities, activity_schedules | ✅ |
| orders, payments, refund_requests, audit_logs | ✅ |
| operations_tracking, kpi_settings, activity_reviews | ✅ |
| `plans` JSONB 欄位（migration 004） | ✅ |
| `plan_id`, `min_participants`, `guide_note`（migration 005） | ✅ |
| `itinerary`, `social_proof_quotes` JSONB（migration 006） | ✅ |
| `guide_password_hash`, `invite_token`, `guide_session_version`（migration 007） | ✅ 2026-04-02 |
| `fn_book_schedule` / `fn_cancel_booking` atomic RPC | ✅ |
| `trg_auto_full_status` trigger | ✅ |
| Supabase Storage bucket `activity-images` | ✅ |

---

## 🔜 後續開發計劃（Phase 6+）

### ✅ Phase 6 完成：導遊儀表板（2026-04-02）

| 任務 | 說明 | 狀態 |
|------|------|------|
| 導遊登入（邀請碼 + 密碼設定） | 管理員發邀請碼，導遊首次登入設密碼 | ✅ |
| 導遊場次管理 | toggle 開啟/關閉 + 容量調整 | ✅ |
| 導遊訂單查看 | 自己場次的報名狀況，含旅客聯絡資訊 | ✅ |
| 資料隔離 + 路由保護 | ownership check + middleware | ✅ |

### Phase 7：正式金流

| 任務 | 說明 | 優先 |
|------|------|------|
| ECPay 真實串接 | 真實信用卡刷卡 + webhook 驗簽 | P0 |
| LINE Pay 串接 | 台灣主流行動支付 | P1 |
| ATM 虛擬帳號 | 備用付款方式 | P2 |
| 導遊分潤撥款 | 抽成後自動撥款給導遊 | P1 |

### Phase 8：旅客 / 導遊 Auth

| 任務 | 說明 | 優先 |
|------|------|------|
| Google 登入 | 旅客 OAuth | P0 |
| LINE 登入 | 台灣旅客首選 | P0 |
| 旅客個人頁 | 訂單歷史 + 偏好 | P1 |
| 評價系統 | 付款後可留評 | P1 |

### 技術債 / 優化

| 任務 | 說明 |
|------|------|
| Storage RLS 政策 | 目前靠 service role 繞過，需補 public SELECT policy |
| 超賣壓力測試 | concurrent 場景測試 fn_book_schedule 鎖定機制 |
| E2E 測試更新 | 覆蓋付款閉環新流程 |
| SEO meta 優化 | 行程詳情頁 og:image + structured data |

---

## 已拍板策略

| 決策 | 內容 |
|------|------|
| Beachhead Market | 高雄柴山探洞 / 戶外特色導覽 |
| 第一位導遊 | Andy Lee（李衍錫）— 先跑順單一導遊模型 |
| 平台抽成 | 15% |
| 定價模式 | per person |
| 場次規則 | 導遊開放日期 × 方案 → 旅客付款占位 → 滿額停售 |
| 原子扣位策略 | fn_book_schedule RPC（FOR UPDATE 鎖），防止超賣 |
| 圖片儲存 | Supabase Storage（免費，CDN backed，WebP 壓縮） |
| 法規原則 | 聚焦在地導覽/體驗、不碰住宿交通打包、保險由導遊負責 |

---

## Repo 結構

```text
tour-platform/
├── apps/web/                    Next.js MVP Web（前台、API、Admin 後台）
│   ├── app/
│   │   ├── activities/          前台行程頁
│   │   ├── booking/             預訂頁（讀 DB + URL query params）
│   │   ├── admin/               Admin 後台
│   │   └── api/                 API routes
│   ├── src/
│   │   ├── lib/db.mjs           DB 查詢層（含 fn_book_schedule RPC）
│   │   ├── lib/client-api.ts    前端 API 呼叫層
│   │   └── components/
│   │       ├── activity/        行程相關元件
│   │       │   ├── DatePlanSection.tsx
│   │       │   ├── ImageCarousel.tsx
│   │       │   └── PlanDetailModal.tsx
│   │       └── admin/           Admin 元件
│   └── public/
│       └── activity-chaishan-sample.json  行程匯入樣本
├── supabase/
│   └── migrations/              004/005/006 新欄位 + RPC + trigger
├── docs/                        策略、產品、技術、商業文件
└── README.md                    本文件
```

---

## 🔑 重要文件索引

### 開發者必讀
| 文件 | 用途 |
|------|------|
| [`docs/04-tech/03-dev-timeline/01-sprint-log.md`](./docs/04-tech/03-dev-timeline/01-sprint-log.md) | Sprint 歷史 + 當前狀態 |
| [`docs/04-tech/04-tech-architecture/02-database-schema.md`](./docs/04-tech/04-tech-architecture/02-database-schema.md) | DB schema |
| [`docs/04-tech/04-tech-architecture/03-api-spec.md`](./docs/04-tech/04-tech-architecture/03-api-spec.md) | API 規格 |

### CEO / 方向判斷
| 文件 | 用途 |
|------|------|
| [`docs/01-strategy/01-project-plan/02-milestone-tracker.md`](./docs/01-strategy/01-project-plan/02-milestone-tracker.md) | 里程碑追蹤 |
| [`docs/05-business/02-investor-deck/01-executive-summary.md`](./docs/05-business/02-investor-deck/01-executive-summary.md) | 投資人摘要 |
| **`docs/05-business/02-investor-deck/05-progress-report-2026-04.md`** | **📊 最新進度報告（2026-04-01）** |

---

## MVP 成功定義

MVP 的成功，不是頁面做完，而是：
- ✅ Andy Lee 可以成功上架活動（在 Admin 後台操作）
- ✅ 旅客可以看到可預約日期並完成付款
- ✅ 付款後名額即時更新（原子扣位）
- ✅ Admin 可在後台處理退款與營運追蹤
- 🔜 團隊能用真實訂單數據回頭修正營運與抽成模型

---

## 技術決策記錄

| 決策 | 選擇 | 原因 |
|------|------|------|
| DB | Supabase PostgreSQL | 免費 starter、RLS、即時訂閱 |
| 圖片儲存 | Supabase Storage | 已整合、免費、CDN backed |
| 原子扣位 | PostgreSQL RPC + FOR UPDATE | 防止 concurrent 超賣 |
| 圖片壓縮 | Canvas-based WebP（瀏覽器端） | 無 server overhead，最大 1200px |
| 行程匯入格式 | JSON（非 MD） | 結構化欄位、支援巢狀、可程式驗證 |
| Booking page | 讀 DB（非 fixtures） | 2026-04-01 遷移完成 |
| ISR 策略 | 60 秒 revalidate | 兼顧即時性與效能 |
| 場次鎖定 | fn_book_schedule（FOR UPDATE） | 同時多人下單不超賣 |

---

## 目前 Vercel 部署資訊

- **Branch（最新）：** `feat/guide-dashboard`
- **Latest commit：** `078fd04`
- **Admin 測試帳號：** `smallwei0301@gmail.com`
- **Supabase project：** `pyoderxmpeyqjwkeliiu`
