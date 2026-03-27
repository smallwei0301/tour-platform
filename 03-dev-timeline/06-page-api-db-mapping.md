# Tour Platform MVP Page / API / DB Mapping

> 目的：避免 Tracy 做頁面時不知道該接哪個 API、該吃哪張表。
> 更新日期：2026-03-27

---

## 1. 首頁 `/`

### 目的
- 建立信任
- 導流到活動列表 / 活動詳情

### 主要資料
- featured activities
- categories / regions
- testimonials

### API / Query
- `GET /api/activities`（精選模式可擴充）
- reviews summary query

### DB Tables
- `activities`
- `guide_profiles`
- `reviews`

---

## 2. 活動列表頁 `/activities`

### 目的
- 篩選可交易的活動

### API
- `GET /api/activities`

### DB Tables
- `activities`
- `guide_profiles`
- `activity_schedules`（若需顯示最近可售日）

---

## 3. 活動詳情頁 `/activities/[id]`

### 目的
- 顯示活動、導遊、可預約日期、退款政策

### API
- `GET /api/activities/:activityId`

### DB Tables
- `activities`
- `guide_profiles`
- `activity_schedules`
- `reviews`

### 關鍵 UI
- 日期選擇器
- 可售 / 額滿狀態
- 名額資訊

---

## 4. 預約流程 `/booking/[activityId]`

### 目的
- 建立訂單
- 導向付款

### API
- `POST /api/orders`
- `POST /api/orders/:orderId/payment`

### DB Tables
- `orders`
- `activity_schedules`
- `payments`

---

## 5. 我的訂單 `/orders`

### API
- `GET /api/me/orders`

### DB Tables
- `orders`
- `activities`
- `guide_profiles`

---

## 6. 訂單詳情 `/orders/[id]`

### API
- `GET /api/me/orders/:orderId`
- `POST /api/me/orders/:orderId/refund-requests`
- `GET /api/me/orders/:orderId/refund`
- `POST /api/me/orders/:orderId/reviews`

### DB Tables
- `orders`
- `payments`
- `refund_requests`
- `reviews`

---

## 7. 導遊申請頁 `/guide/apply`

### API
- `POST /api/guide-applications`
- `GET /api/me/guide-application`

### DB Tables
- `guide_applications`
- `users`

---

## 8. 導遊後台首頁 `/guide/dashboard`

### API
- `GET /api/guide/dashboard`

### DB Tables
- `guide_profiles`
- `activities`
- `activity_schedules`
- `orders`

---

## 9. 導遊活動管理 `/guide/dashboard/activities`

### API
- `GET /api/guide/activities`
- `POST /api/guide/activities`
- `PATCH /api/guide/activities/:activityId`

### DB Tables
- `activities`

---

## 10. 導遊場次管理 `/guide/dashboard/schedules`

### API
- `POST /api/guide/activities/:activityId/schedules`
- `PATCH /api/guide/schedules/:scheduleId`

### DB Tables
- `activity_schedules`
- `activities`

### 關鍵功能
- 開日期
- 設定 capacity
- 手動關閉 / 重開
- 顯示 booked_count

---

## 11. 導遊訂單列表 `/guide/dashboard/orders`

### API
- `GET /api/guide/orders`
- `PATCH /api/guide/orders/:orderId`

### DB Tables
- `orders`
- `activities`
- `activity_schedules`

---

## 12. Admin 導遊審核 `/admin/guides`

### API
- `GET /api/admin/guide-applications`
- `POST /api/admin/guide-applications/:applicationId/approve`
- `POST /api/admin/guide-applications/:applicationId/reject`
- `POST /api/admin/guides/:guideId/suspend`

### DB Tables
- `guide_applications`
- `guide_profiles`
- `users`

---

## 13. Admin 訂單管理 `/admin/orders`

### API
- `GET /api/admin/orders`

### DB Tables
- `orders`
- `payments`
- `activities`
- `guide_profiles`

---

## 14. Admin 退款管理 `/admin/refunds`

### API
- `GET /api/admin/refund-requests`
- `POST /api/admin/refund-requests/:refundRequestId/approve`
- `POST /api/admin/refund-requests/:refundRequestId/process`
- `POST /api/admin/refund-requests/:refundRequestId/complete`

### DB Tables
- `refund_requests`
- `orders`
- `payments`

---

## 15. 系統層資料

### 通知
- table: `notifications`
- 作用：保留 Email / 後續人工補發紀錄

### 稽核
- table: `audit_logs`
- 作用：追蹤訂單、退款、審核等關鍵狀態變更

---

## 16. 最重要提醒

頁面開發順序，請優先對應：
1. `activities`
2. `activity_schedules`
3. `orders`
4. `guide_applications`
5. `refund_requests`

因為這五塊就是整個 MVP 的交易骨架。
