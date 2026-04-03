# 里程碑追蹤表

> 最後更新：2026-04-03

---

## Phase 1 — MVP 前台 ✅ 完成

| 里程碑 | 完成標準 | 狀態 |
|--------|---------|------|
| 首頁 UI | Hero + 精選行程 + 導遊 Spotlight + FAQ | ✅ 完成 |
| 活動頁 | 列表 + 詳情 + 日期選擇器 + 預訂 bar | ✅ 完成 |
| 預訂流程 | booking → checkout → success | ✅ 完成 |
| 訂單管理 | 我的訂單列表 + 詳情 + 退款申請 | ✅ 完成 |
| 導遊頁面 | 列表 + 個人頁 + 申請頁 | ✅ 完成 |
| 法律頁面 | 隱私政策 + 服務條款 + 退款規則 | ✅ 完成 |
| 行動版優化 | 所有頁面 RWD | ✅ 完成 |

---

## Phase 2 — Admin 後台核心 ✅ 完成

| 里程碑 | 完成標準 | 狀態 |
|--------|---------|------|
| Admin 登入 / 登出 | email + token → cookie session | ✅ 完成 |
| Session 安全 | 過期提示 + Token 輪替 + 強制登出 | ✅ 完成 |
| 訂單管理 | 列表 + 詳情 + 備註 + 例外 + audit log | ✅ 完成 |
| 退款管理 | 審核 / 拒絕 / 處理中 / 完成 | ✅ 完成 |
| 導遊審核 | 申請列表 + 核准 / 退件 / 暫停 | ✅ 完成 |
| 營運追蹤 | contribution margin + 健康度 + CSV | ✅ 完成 |
| KPI 設定 | 可配置 + 版本控制 + rollback | ✅ 完成 |

---

## Phase 3 — UI 精修 ✅ 完成

| 里程碑 | 完成標準 | 狀態 |
|--------|---------|------|
| KKday 風格重設計 | 全站 UI 對齊 KKday 設計語言 | ✅ 完成 |
| Andy Lee 資料整合 | 導遊頁 + 活動頁用真實資料 | ✅ 完成 |
| 行動版修正 | hamburger、overflow、layout 問題 | ✅ 完成 |

---

## Phase 4 — 行程後台 + 付款閉環 ✅ 完成（2026-04-01）

| 里程碑 | 完成標準 | 狀態 | 完成日期 |
|--------|---------|------|---------|
| Admin 行程管理頁 | `/admin/activities` 列表 + 狀態 | ✅ 完成 | 2026-03-31 |
| Admin 行程 CRUD | 新增 / 編輯 / 發佈 / 下架 / 刪除 | ✅ 完成 | 2026-03-31 |
| Supabase 正式接線 | 前台從 fixture 切換到 DB | ✅ 完成 | 2026-03-31 |
| Admin 場次管理 | 新增場次、容量、開關、方案綁定 | ✅ 完成 | 2026-03-31 |
| 行程圖片上傳 | Supabase Storage，Canvas WebP 壓縮 | ✅ 完成 | 2026-04-01 |
| 方案管理系統 | PlanEditor + PlanDetailModal 7 tabs | ✅ 完成 | 2026-04-01 |
| JSON 行程匯入 | 驗證 + diff 預覽 + 樣本下載 | ✅ 完成 | 2026-04-01 |
| 圖片 Carousel | 手機 swipe + 桌機 grid | ✅ 完成 | 2026-04-01 |
| **付款 → 原子扣位** | fn_book_schedule RPC + 冪等 + trigger | ✅ 完成 | **2026-04-01** |
| **Booking page 讀 DB** | 移除 fixtures，讀 `/api/activities/[slug]` | ✅ 完成 | **2026-04-01** |
| **ISR + 即時反映** | booked_count 60 秒內反映至前台 | ✅ 完成 | **2026-04-01** |
| Vercel Production 部署 | env vars + API 驗收 | ✅ 完成 | 2026-03-31 |

### Phase 4 Go/No-Go 條件
- [x] Admin 可在後台新增行程並發佈
- [x] 前台從 DB 讀取行程（不再用 fixture）
- [x] 旅客評價從 DB 讀取、實時同步
- [x] Admin 可管理場次（含方案綁定）
- [x] 圖片可上傳至 Supabase Storage
- [x] JSON 可匯入，含驗證與 diff 預覽
- [x] 付款成功後 booked_count 正確更新（原子 RPC）
- [x] 額滿後 trigger 自動標記 full，前台顯示額滿
- [x] Booking page 讀 DB（非 hardcode fixtures）
- [x] Vercel Production API 可正常存取

---

## Phase 5 — 導遊儀表板 🔜 待開始

| 里程碑 | 完成標準 | 狀態 | 優先 |
|--------|---------|------|------|
| 導遊登入（JWT / 邀請碼） | 導遊可自助登入後台 | 🔜 未開始 | P0 |
| 導遊場次管理 | 導遊可開啟/關閉特定日期的方案 | 🔜 未開始 | P0 |
| 導遊訂單查看 | 看到自己場次的報名狀況與旅客資訊 | 🔜 未開始 | P0 |
| 場次容量自定義 | 導遊可調整每場人數上限 | 🔜 未開始 | P1 |
| 導遊收入查看 | 查看分潤明細 | 🔜 未開始 | P2 |

### Phase 5 Go/No-Go 條件
- [ ] Andy Lee 可在導遊後台自主開啟場次
- [ ] 導遊可看到已報名旅客清單
- [ ] 場次額滿時導遊收到通知

---

## Phase 6 — 導遊儀表板 ✅ 完成（2026-04-03 merge to main）

| 里程碑 | 完成標準 | 狀態 |
|--------|---------|------|
| 導遊 Email 登入 | 邀請碼 + 密碼設定 + session cookie | ✅ 完成 |
| 導遊儀表板 | 本月訂單 / 近期訂單 / 本週場次 | ✅ 完成 |
| 場次管理 | toggle 開啟/關閉 + 容量修改 + ownership check | ✅ 完成 |
| 訂單查看 | 列表 + 詳情 Modal + email masking | ✅ 完成 |
| Admin 邀請碼 | 一鍵生成 24h 邀請連結 | ✅ 完成 |
| 資料隔離 | guide_id ownership 驗證 + 403 防護 | ✅ 完成 |
| migration 007 | guide auth 欄位（invite_token / hash / session） | ✅ 完成 |

---

## Phase 7 — 前台訂單流程完整化 ✅ 完成（2026-04-03）

| 里程碑 | 完成標準 | 狀態 |
|--------|---------|------|
| 付款頁（mock） | `/order/pay`：訂單摘要 + 模擬付款 callback | ✅ 完成 |
| 我的訂單列表 | `/me/orders`：Email 查詢 + 狀態 badge 顏色 | ✅ 完成 |
| 訂單詳情頁 | `/me/orders/:id`：完整資訊 + 各狀態說明 | ✅ 完成 |
| 取消訂單 | Dialog 確認 + API + 席位自動釋放 | ✅ 完成 |
| 退款申請 | textarea 理由 + POST refund-requests | ✅ 完成 |
| checkout 修復 | 動態查詢真實 schedule UUID，不再 hardcode | ✅ 完成 |
| Navbar 入口 | 頂部「我的訂單」連結 | ✅ 完成 |
| E2E 手動驗收 | Judy 8/8 PASS | ✅ 完成 |

### Phase 7 技術說明
- Auth 策略：MVP 採 Email 查詢（類航空公司查訂單），待 Phase 8 換 Google OAuth
- cancelOrderDb 驗證 contactEmail 所有權，防止惡意取消他人訂單

---

## Phase 8 — 旅客 Auth ⏳ 下一步

| 里程碑 | 完成標準 | 狀態 | 優先 |
|--------|---------|------|------|
| Google OAuth 登入 | Supabase Auth + Google Provider | 🔜 未開始 | P0 |
| LINE 登入 | 台灣旅客首選行動登入 | 🔜 未開始 | P1 |
| 旅客個人頁整合 | OAuth session 取代 email query | 🔜 未開始 | P0 |
| 付款後留評 | 行程完成後評價系統 | 🔜 未開始 | P2 |

### Phase 8 Go/No-Go 條件
- [ ] Google OAuth 登入可正常取得 user session
- [ ] `/me/orders` 改用 session 識別，移除 email query param
- [ ] 現有訂單資料可綁定 user_id

---

## Phase 9 — 正式金流 ⏳ 待開始

| 里程碑 | 完成標準 | 狀態 | 優先 |
|--------|---------|------|------|
| ECPay 真實串接 | 真實信用卡 + webhook 驗簽 | 🔜 未開始 | P0 |
| LINE Pay 串接 | 台灣主流行動支付 | 🔜 未開始 | P1 |
| 導遊分潤撥款 | 抽成後自動撥款 | 🔜 未開始 | P1 |

### Phase 9 Go/No-Go 條件
- [ ] 完成一筆真實信用卡交易（非模擬）
- [ ] 導遊收到正確分潤金額

---

## 整體完成度估計（2026-04-03）

| Phase | 完成度 | 更新 |
|-------|--------|------|
| Phase 1 前台 MVP | 100% | |
| Phase 2 Admin 後台核心 | 100% | |
| Phase 3 UI 精修 | 100% | |
| Phase 4 行程後台 + 付款閉環 | 100% | |
| Phase 5 導遊申請 + 排程管理 | 100% | |
| Phase 6 導遊儀表板 | 100% | ✅ 2026-04-03 merge |
| Phase 7 前台訂單流程 | 100% | ✅ 2026-04-03 新增 |
| Phase 8 旅客 Auth | 0% | 🔜 下一步 |
| Phase 9 正式金流 | 0% | 🔜 待開始 |
| **整體（核心交易閉環）** | **~97%** | |
| **整體（含 Auth + 正式金流）** | **~70%** | |
