# Tracy Product Spec — Tour Platform MVP

> 目的：把既有 Tour Platform repo 裡已拍板的商業、流程、資料結構，整理成 Tracy 可以直接開工的單一產品規格。
> 更新日期：2026-03-27
> 狀態：可直接作為 MVP 開發依據

---

## 1. 這份 spec 解決什麼問題

Tracy 在開發前，不該再自己拼湊：
- 哪些資料已經有
- 哪些規則已拍板
- MVP 只做哪幾頁
- 前後台各自最小範圍是什麼

這份文件就是把 repo 內已存在資訊收斂成 **單一可執行規格**。

---

## 2. 我們已經有的資料（不是待討論，是已存在）

### 2.1 商業決策已存在
已明確寫在既有文件：
- 平台代收款
- 平台抽成 15%
- MVP 統一每人計價（per person）
- 導遊先建立可預約日期 / 場次
- 付款成功即占位
- 滿額自動停售
- 通知先做 Email
- 退款先人工主導
- Admin 後台只做最小營運能力

### 2.2 主流程已存在
已定義完成：
- 旅客瀏覽 → 下單 → 付款
- 導遊建立活動 → 建場次 → 開賣
- 旅客取消 / 退款申請
- 導遊申請 / KYC / 審核
- 活動完成後可評價
- Admin 最小營運流

### 2.3 DB schema 已存在
已定義核心資料表：
- `users`
- `guide_profiles`
- `guide_applications`
- `activities`
- `activity_schedules`
- `orders`
- `payments`
- `refund_requests`
- `reviews`
- `notifications`
- `audit_logs`

### 2.4 頁面 / API / DB mapping 已存在
已對應：
- 頁面
- API 路徑
- DB tables
- 核心功能

### 2.5 第一位導遊素材已存在
Andy Lee content pack 已完成初版，已有：
- 導遊定位
- 活動文案
- 信任敘事
- FAQ / 活動欄位候選
- 但部分欄位仍為 `[MOCK]`

---

## 3. MVP 範圍：Tracy 現在只做什麼

### 3.1 P0：必做
1. 前台活動列表頁
2. 前台活動詳情頁
3. 預約頁 / 下單頁
4. ECPay 付款串接骨架
5. 訂單成立 / 訂單詳情頁
6. 導遊申請頁
7. 導遊後台：活動管理
8. 導遊後台：場次管理
9. Admin 後台：導遊審核
10. Admin 後台：訂單管理
11. Admin 後台：退款管理

### 3.2 P1：可延後
- 評價系統簡版
- Email 模板整理
- 基本 dashboard summary

### 3.3 P2：先不要做
- 站內聊天
- 推薦系統
- 多語 UI
- 優惠碼
- 複雜 RBAC
- 自動分潤
- 多幣別
- 提款系統

---

## 4. 單一成功指標（MVP DoD）

MVP 完成的最低定義不是畫面做完，而是以下流程可走通：

### DoD-1：導遊可申請加入
- 可提交申請表
- 可上傳 KYC 必要欄位
- Admin 可審核狀態

### DoD-2：導遊可建立一個可賣活動
- 建立活動基本資料
- 建立至少 1 個 open schedule
- 前台能看到並選取可售日期

### DoD-3：旅客可完成一次有效下單
- 選日期
- 選人數
- 填聯絡資料
- 付款成功
- 訂單進入 `paid`
- 場次 `booked_count` 正確增加

### DoD-4：Admin 可人工救火
- 能看全部訂單
- 能看退款申請
- 能修改退款狀態
- 能停用或審核導遊

只要以上四件事能跑，MVP 就成立。

---

## 5. 頁面清單（Tracy 實作順序）

### 前台
1. `/`
2. `/activities`
3. `/activities/[id]`
4. `/booking/[activityId]`
5. `/orders`
6. `/orders/[id]`

### 導遊端
7. `/guide/apply`
8. `/guide/dashboard`
9. `/guide/dashboard/activities`
10. `/guide/dashboard/schedules`
11. `/guide/dashboard/orders`

### Admin
12. `/admin/guides`
13. `/admin/orders`
14. `/admin/refunds`

---

## 6. 每頁最小欄位需求

### 6.1 活動列表頁 `/activities`
每張卡至少顯示：
- cover image
- title
- region
- guide display name
- price per person
- duration
- 最近可售日期（若有）
- CTA: 查看詳情

### 6.2 活動詳情頁 `/activities/[id]`
至少顯示：
- 活動名稱
- 封面圖 / 圖庫
- 短描述 / 長描述
- 導遊資訊
- 地區
- 語言
- duration
- meeting point
- price per person
- min/max participants
- inclusions / exclusions
- 注意事項
- 退款規則
- FAQ
- schedule selector
- CTA: 查看可預約日期 / 立即預約

### 6.3 預約頁 `/booking/[activityId]`
至少包含：
- activity snapshot
- selected schedule
- participants
- contact_name
- contact_phone
- contact_email
- note
- refund policy checkbox
- terms checkbox
- total amount
- pay CTA

### 6.4 導遊申請頁 `/guide/apply`
至少包含：
- display_name
- bio
- region
- languages
- specialties
- profile photo
- 身份文件
- 銀行資訊
- submit CTA

### 6.5 導遊活動管理 `/guide/dashboard/activities`
至少包含：
- activity list
- create activity form
- edit activity form
- status draft/published

### 6.6 導遊場次管理 `/guide/dashboard/schedules`
至少包含：
- activity selector
- date / time
- capacity
- booked_count
- status
- open / close toggle

### 6.7 Admin 導遊審核 `/admin/guides`
至少包含：
- application list
- applicant info
- docs links
- approve / reject / suspend actions

### 6.8 Admin 訂單管理 `/admin/orders`
至少包含：
- order_no
- traveler
- guide
- activity
- schedule
- participants
- amount
- status
- created_at

### 6.9 Admin 退款管理 `/admin/refunds`
至少包含：
- order reference
- requester
- requested_amount
- approved_amount
- status timeline
- admin note
- approve / process / complete / reject

---

## 7. Andy Lee 這份資料目前已經能支撐哪些頁

### 已經足夠支撐
- 導遊頁 hero 區塊
- 活動詳情頁主文案
- 信任區塊
- FAQ 初版
- SEO 標題初版

### 尚未完全真實化
以下欄位目前仍應標註 `[MOCK]`：
- `price_per_person = 2000`
- `duration_minutes`
- `meeting_point`
- `min_participants`
- `max_participants`
- `inclusions`
- `exclusions`
- `safety_notice`
- `refund_policy_detail`
- `insurance_notice`

### 決策
MVP 可以先用 mock data，但 UI / seed / CMS 都要顯式標記 `is_mock=true` 或內容加 `[MOCK]`。

---

## 8. Tracy 實作時不可自行改的規則

以下屬已拍板，不要在開發時擅改：
- 平台抽成固定 15%
- per person pricing
- 付款成功即占位
- 場次滿額自動停售
- 通知先做 Email
- 退款人工主導
- Admin 必須保留手動修正能力

---

## 9. 目前 repo 還缺什麼

雖然大框架齊了，但這幾項仍未完全補齊：

### 缺 1：單一導遊可直接 seed 的結構化資料
現有多為文案文件，缺可直接餵前端 / DB / CMS 的單一 JSON。

### 缺 2：Andy Lee 活動真實值
可先用 mock，但正式上線前必補。

### 缺 3：圖片資產對應表
目前知道有內容包，但還缺 hero / gallery / avatar 的固定檔名或 URL mapping。

### 缺 4：Email template payload 實例
seed spec 提到需要，但還沒整理成單一 demo payload 檔。

---

## 10. Tracy 立刻可用的開發順序

### Sprint 1
- activities list/detail
- booking page
- order create/payment skeleton

### Sprint 2
- guide apply
- guide activities
- guide schedules

### Sprint 3
- admin guides
- admin orders
- admin refunds

### Sprint 4
- review / email polish / seed cleanup

---

## 11. 最終一句話

**這個 repo 已經不是「沒有規格」，而是規格分散。現在已經收斂成可開工狀態。Tracy 不需要再等策略，只需要照 spec 把交易骨架做出來。**
