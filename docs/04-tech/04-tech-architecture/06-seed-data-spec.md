# Tour Platform MVP Seed Data Spec

> 目的：讓設計、前端、測試、demo 都有真實感，不再靠空畫面。
> 更新日期：2026-03-27

---

## 1. Seed Data 原則

- 資料要足夠支撐 demo，不求一開始完全真實
- 優先建立「可成交感」而不是海量內容
- 每一種重要狀態都至少要有一筆樣本
- 內容要符合台灣在地導遊平台情境

---

## 2. 最低 seed data 規模

### 使用者
- 1 admin
- 6 guides
- 12 travelers

### 導遊申請
- 2 pending
- 1 rejected
- 6 approved（對應已上架導遊）

### 活動
- 12 published activities
- 3 draft activities
- 1 archived activity

### 場次
- 每個 published activity 至少 3 個未來場次
- 至少準備以下狀態：
  - `open`
  - `full`
  - `cancelled`

### 訂單
至少 12 筆，涵蓋：
- `pending_payment`
- `paid`
- `confirmed`
- `completed`
- `cancelled_by_user`
- `cancelled_by_guide`
- `refund_pending`
- `refunded`

### 退款申請
至少 4 筆：
- `requested`
- `approved`
- `processing`
- `refunded`

### 評價
- 至少 8 筆 completed order reviews

---

## 3. 導遊 seed data 規格

每位導遊至少包含：
- 中文姓名 / 英文顯示名（可選）
- 地區
- 語言
- 主題專長
- 自介
- 驗證狀態
- 頭像
- 評分與評價數

### 建議導遊類型
1. 台北文化導覽
2. 台南美食散步
3. 花蓮部落文化
4. 高雄柴山探洞
5. 台東戶外體驗
6. 南投山林慢旅

---

## 4. 活動 seed data 規格

每筆活動至少包含：
- title
- slug
- description
- region
- category
- price_per_person
- min / max participants
- duration_minutes
- meeting_point
- refund_policy_type
- cover_image_url
- image_urls
- status

### 建議活動樣本
1. 大稻埕百年老街深度漫步
2. 台南老城巷弄與小吃散策
3. 花蓮太魯閣在地故事導覽
4. 柴山探洞初階體驗
5. 柴山探洞進階路線
6. 台東日出海岸慢旅
7. 南投茶園與山村半日散策
8. 高雄港都夜色步行導覽
9. 台北夜市文化體驗
10. 花蓮原住民文化餐桌
11. 阿里山晨霧攝影小團
12. 屏東海岸自然觀察

---

## 5. 場次 seed data 規格

每個活動至少 3 個未來場次：
- 1 個 `open`，有剩餘名額
- 1 個 `full`
- 1 個 `cancelled` 或接近滿額

### 範例
#### 柴山探洞初階體驗
- 2026-04-01 09:00–12:00, capacity 10, booked 1, status `open`
- 2026-04-03 09:00–12:00, capacity 10, booked 10, status `full`
- 2026-04-10 09:00–12:00, capacity 10, booked 0, status `open`

---

## 6. 訂單 seed data 規格

每筆訂單至少包含：
- 對應 traveler
- 對應 guide
- 對應 activity / schedule
- participants
- amount breakdown
- contact info
- status
- timestamps

### 必須覆蓋情境
1. 旅客付款成功、名額占用成功
2. 已完成活動、可評論
3. 旅客取消申請退款
4. 導遊取消導致全額退款
5. 付款失敗或未完成付款
6. 場次滿額後新旅客不能再訂

---

## 7. 通知 seed data 規格

至少準備以下 Email template payload demo：
- order_created
- payment_paid
- order_confirmed
- order_cancelled
- refund_requested
- refund_refunded
- review_invited

---

## 8. Demo 帳號建議

### Admin
- `admin@tour-platform.test`

### Guide
- `andy@tour-platform.test`
- `linda@tour-platform.test`
- `ming@tour-platform.test`

### Traveler
- `demo1@tour-platform.test`
- `demo2@tour-platform.test`
- `demo3@tour-platform.test`

---

## 9. 測試重點

seed data 不是只是拿來好看，要能支援以下測試：
- 列表頁篩選
- 日期可售 / 額滿顯示
- 付款後場次名額更新
- 訂單狀態顯示
- 退款進度時間線
- 導遊後台場次管理
- Admin 後台營運介入

---

## 10. 實作提醒

- 所有 demo 資料命名要一致，不要今天 Andy 明天 改成王小明
- 圖片素材先用固定假圖庫或同一批 placeholder，避免 UI 風格混亂
- `full` 場次與 `open` 場次一定要同時存在，否則前台日期選擇體驗測不出來
- 退款與完成訂單一定都要有，不然訂單頁 demo 會很空
