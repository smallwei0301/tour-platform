# Tour Platform MVP API Spec

> 目的：定義 MVP 階段真正要做的 API，而不是未來所有可能性。
> 更新日期：2026-03-27

---

## 0. 共用規則

### Base Path
- App Router Server Actions 或 Route Handlers 可內部實作
- 對外文件統一視為 REST 風格：`/api/*`

### Response Format
成功：
```json
{
  "success": true,
  "data": {}
}
```

失敗：
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

### Auth
- 未登入旅客：可瀏覽公開內容
- 登入旅客：Bearer session / cookie session
- 導遊：需 `role=guide`
- Admin：需 `role=admin`

### Common Error Codes
- `UNAUTHORIZED`
- `FORBIDDEN`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `PAYMENT_FAILED`
- `INTERNAL_ERROR`

---

## 1. Public APIs

### 1.1 List Activities
`GET /api/activities`

#### Query Params
- `region`
- `category`
- `language`
- `date`
- `page`
- `pageSize`
- `sort`

#### Response
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "act_123",
        "title": "大稻埕百年老街深度漫步",
        "region": "taipei",
        "priceFrom": 1500,
        "rating": 4.9,
        "reviewCount": 12,
        "guide": {
          "id": "guide_123",
          "displayName": "陳建志",
          "verified": true
        }
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 12,
      "total": 120
    }
  }
}
```

### 1.2 Get Activity Detail
`GET /api/activities/:activityId`

回傳：
- 活動基本資料
- 導遊摘要
- 可預約場次摘要
- 退款政策
- 評價摘要

### 1.3 Get Guide Detail
`GET /api/guides/:guideId`

回傳：
- 導遊基本資訊
- 驗證狀態
- 語言 / 專長
- 活動列表
- 評價摘要

---

## 2. Booking & Orders APIs

### 2.1 Create Pending Order
`POST /api/orders`

#### Auth
- 旅客登入

#### Request
```json
{
  "activityId": "act_123",
  "scheduleId": "sch_123",
  "participants": 2,
  "contactName": "王小明",
  "contactPhone": "0912345678",
  "contactEmail": "test@example.com",
  "note": "希望多介紹在地美食",
  "agreedRefundPolicy": true,
  "agreedTerms": true
}
```

#### Behavior
- 驗證場次存在且可售
- 驗證名額足夠
- 建立 `pending_payment` 訂單
- 計算金額快照

#### Response
```json
{
  "success": true,
  "data": {
    "orderId": "ord_123",
    "status": "pending_payment",
    "amount": 3000
  }
}
```

### 2.2 Create Payment Session
`POST /api/orders/:orderId/payment`

#### Auth
- 訂單擁有者

#### Behavior
- 檢查訂單狀態為 `pending_payment`
- 建立 ECPay 交易資料
- 回傳付款導轉資訊

#### Response
```json
{
  "success": true,
  "data": {
    "provider": "ecpay",
    "paymentFormHtml": "<form>...</form>",
    "merchantTradeNo": "TP202603270001"
  }
}
```

### 2.3 Payment Callback
`POST /api/payments/ecpay/callback`

#### Auth
- provider callback only

#### Behavior
- 驗證 callback hash
- 更新付款紀錄
- 若成功，將訂單改為 `paid`
- 寄送通知

#### Response
- 依 ECPay 規格回應 `1|OK`

### 2.4 Get My Orders
`GET /api/me/orders`

#### Auth
- 旅客登入

#### Response
回傳目前使用者自己的訂單列表。

### 2.5 Get Order Detail
`GET /api/me/orders/:orderId`

#### Auth
- 訂單擁有者

#### Response
回傳：
- 訂單資料
- 活動摘要
- 導遊摘要
- 付款資訊
- 退款資訊

---

## 3. Refund APIs

### 3.1 Create Refund Request
`POST /api/me/orders/:orderId/refund-requests`

#### Auth
- 訂單擁有者

#### Request
```json
{
  "reason": "行程衝突",
  "detail": "臨時無法出席"
}
```

#### Behavior
- 檢查訂單是否可申請退款
- 建立退款申請
- 訂單標記為 `refund_pending`

### 3.2 Get Refund Detail
`GET /api/me/orders/:orderId/refund`

#### Auth
- 訂單擁有者

#### Response
回傳退款狀態時間線。

---

## 4. Guide Application APIs

### 4.1 Submit Guide Application
`POST /api/guide-applications`

#### Auth
- 登入使用者

#### Request
使用 multipart/form-data：
- `displayName`
- `bio`
- `region`
- `languages[]`
- `bankAccountName`
- `bankCode`
- `bankAccountNumber`
- `profilePhoto`
- `idDocumentFront`
- `idDocumentBack`
- `guideLicenseDocument` (optional for MVP, but recommended)

#### Behavior
- 建立 guide_application
- 上傳檔案到私有 storage
- 狀態設為 `pending`

### 4.2 Get My Guide Application
`GET /api/me/guide-application`

#### Auth
- 登入使用者

#### Response
回傳目前申請狀態與補件需求。

---

## 5. Guide Auth APIs（2026-04-02 實作完成）

### 5.0 Guide Session
`GET /api/guide/auth/session` — 確認目前 session 狀態
`POST /api/guide/auth/session` — 登入（邀請碼首次設密碼 / 一般密碼登入）
`DELETE /api/guide/auth/session` — 登出

#### POST Request（首次設密碼）
```json
{ "token": "uuid-invite-token", "password": "min6chars" }
```

#### POST Request（一般登入）
```json
{ "guideId": "uuid", "password": "password" }
```

#### Auth Notes
- Session cookie: `guide_token` (HttpOnly, SameSite=Lax, 7天, production 加 Secure)
- Token 格式: `guideId:sessionVersion:hmacSig`（HMAC-SHA256）
- 首次登入後 invite_token 立即清除，不可重複使用

---

## 6. Guide Dashboard APIs（2026-04-02 實作完成）

> **Auth：** 所有路由需帶 `guide_token` HttpOnly cookie（middleware 保護）

### 6.1 Get Dashboard Summary
`GET /api/guide/dashboard`

#### Response
```json
{
  "ok": true,
  "data": {
    "monthlyBookings": 12,
    "pendingBookings": [
      { "id": "uuid", "guestName": "王小明", "partySize": 2, "status": "confirmed",
        "createdAt": "2026-04-01T10:00:00Z", "tourTitle": "柴山探洞半日遊" }
    ],
    "upcomingSchedules": [
      { "id": "uuid", "tourTitle": "...", "date": "2026-04-05T09:00:00Z",
        "planId": "half-day", "bookedCount": 4, "maxCapacity": 8, "status": "open" }
    ]
  }
}
```

### 6.2 List Guide Schedules
`GET /api/guide/schedules`

回傳導遊所有行程的場次列表（含 planName、bookedCount、capacity、status）

### 6.3 Update Schedule
`PATCH /api/guide/schedules/:scheduleId`

#### Auth
- 必須是該場次行程的 guide_id（ownership 驗證，否則 403）

#### Request（可組合使用）
```json
{
  "isActive": false,          // toggle 開啟/關閉
  "maxCapacity": 10,          // 修改容量（不得低於 bookedCount）
  "guideNote": "當天有特別活動"  // 備註
}
```

### 6.4 List Guide Bookings
`GET /api/guide/bookings`

回傳導遊行程的所有訂單。**Email 已 masking**（j\*\*\*@gmail.com），電話不顯示。

### 6.5 Get Booking Detail
`GET /api/guide/bookings/:bookingId`

#### Auth
- 必須是該訂單行程的 guide_id（ownership 驗證，否則 403）

#### Response
包含**完整電話號碼**（僅此 API 顯示，讓導遊可聯絡旅客）

---

## 7. Admin Guide Invite API（2026-04-02）

### 7.1 Generate Invite Token
`POST /api/admin/guides/:guideId/invite`

#### Auth
- Admin session

#### Notes
- 僅對 `verification_status = 'approved'` 的導遊有效
- Token 有效期 24 小時
- 每次呼叫會覆蓋舊 token

#### Response
```json
{
  "ok": true,
  "data": {
    "inviteUrl": "/guide/login?token=xxxx-xxxx-xxxx",
    "token": "uuid",
    "expiresAt": "2026-04-03T05:00:00Z",
    "guideName": "Andy Lee"
  }
}
```

#### Auth
- 場次擁有導遊

#### Behavior
- 可手動調整 `capacity`
- 可手動關閉或重開場次
- 若 `booked_count >= capacity`，系統需阻止設成小於已售名額的非法值，或要求 admin 介入

### 5.9 Manual Order Note / Exception Flag
`PATCH /api/guide/orders/:orderId`

#### Auth
- 訂單擁有導遊或 admin

#### Behavior
- 僅允許補充備註、標記例外，不允許任意改付款狀態
- 供 MVP 人工營運使用

---

## 6. Review APIs

### 6.1 Create Review
`POST /api/me/orders/:orderId/reviews`

#### Auth
- 訂單擁有者

#### Request
```json
{
  "rating": 5,
  "comment": "導遊很專業，節奏很好。"
}
```

#### Rules
- 只有 `completed` 訂單可評論
- 每筆訂單限一次

---

## 7. Admin APIs

### 7.1 List Guide Applications
`GET /api/admin/guide-applications`

#### Auth
- `role=admin`

### 7.2 Approve Guide Application
`POST /api/admin/guide-applications/:applicationId/approve`

#### Behavior
- guide_application -> `approved`
- 建立 / 更新對應 guide profile
- 將 user role 更新為 `guide`

### 7.3 Reject Guide Application
`POST /api/admin/guide-applications/:applicationId/reject`

#### Request
```json
{
  "reason": "身分證件不清楚，請重新上傳"
}
```

### 7.4 List Orders
`GET /api/admin/orders`

#### Query Params
- `status`
- `paymentStatus`
- `guideId`
- `dateFrom`
- `dateTo`

### 7.5 List Refund Requests
`GET /api/admin/refund-requests`

### 7.6 Approve Refund
`POST /api/admin/refund-requests/:refundRequestId/approve`

#### Request
```json
{
  "approvedAmount": 3000,
  "note": "符合 7 天前取消規則"
}
```

### 7.7 Mark Refund Processing
`POST /api/admin/refund-requests/:refundRequestId/process`

### 7.8 Mark Refund Complete
`POST /api/admin/refund-requests/:refundRequestId/complete`

### 7.9 Suspend Guide
`POST /api/admin/guides/:guideId/suspend`

#### Request
```json
{
  "reason": "多次臨時取消訂單"
}
```

---

## 8. MVP 不做的 API

以下不進 MVP：
- 站內聊天 API
- 推薦排序 API
- 導遊提款 API
- 自動分潤 API
- 多語內容 API
- 優惠碼 API
- LINE Pay API
- 即時客服工單 API

---

## 9. 實作提醒

- 所有金額欄位統一以整數儲存（TWD cents 或元，需專案內統一）
- 付款 callback 一律冪等處理
- 所有狀態改變要保留 audit trail
- Admin 與 Guide 的寫操作都要檢查 role 與 resource ownership
