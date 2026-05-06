# Tour Platform API Spec V2 — Booking + POS

> 目的：定義 Tour Platform 下一階段的預約與 POS API。V2 與現有 MVP API 並行存在，直到切流完成。
> 
> 設計重點：
> - Booking / Order / Payment 分層
> - Availability-driven slots
> - 支援 Web / LINE / Admin POS 三種渠道
> 
> 更新日期：2026-04-09

---

## 0. 共用規則

### Base Path
`/api/v2/*`

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

### Common Error Codes
- `UNAUTHORIZED`
- `FORBIDDEN`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `SLOT_UNAVAILABLE`
- `CAPACITY_EXCEEDED`
- `PAYMENT_FAILED`
- `INVALID_STATE_TRANSITION`
- `INTERNAL_ERROR`

### Channel
可接受：
- `web`
- `line`
- `admin_pos`

### Timezone Rule
- DB 一律存 UTC
- Request / Response 可帶 timezone
- 所有 slot 計算都必須明確指定 timezone

---

## 1. Catalog APIs

### 1.1 List Activity Plans
`GET /api/v2/activities/:activityId/plans`

#### Response
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "plan_123",
        "name": "半日遊",
        "slug": "half-day",
        "durationMinutes": 240,
        "priceType": "per_group",
        "basePrice": 4800,
        "minParticipants": 1,
        "maxParticipants": 4,
        "bookingType": "instant",
        "status": "active"
      }
    ]
  }
}
```

---

## 2. Availability APIs

### 2.1 Get Available Slots
`GET /api/v2/activities/:activityId/available-slots`

#### Query Params
- `planId` (required)
- `dateFrom` (required, YYYY-MM-DD)
- `dateTo` (required, YYYY-MM-DD)
- `timezone` (required)
- `participants` (optional)

#### Behavior
- 讀取 availability rules
- 讀取 blackout dates
- 讀取 existing bookings
- 依 duration + interval 生成 slots
- 回傳已序列化好的 client-ready slots

#### Response
> `capacityLeft` 語意：剩餘可預約名額（remaining participants），計算為 `maxParticipants - participants`，最小值為 `0`。此欄位應與前端 UI 文案「剩餘」一致。

```json
{
  "success": true,
  "data": {
    "timezone": "Asia/Taipei",
    "activityId": "act_123",
    "planId": "plan_123",
    "slots": [
      {
        "startAt": "2026-04-20T09:00:00+08:00",
        "endAt": "2026-04-20T13:00:00+08:00",
        "capacityLeft": 2,
        "bookingType": "instant",
        "isAvailable": true
      }
    ]
  }
}
```

---

## 3. Booking APIs

### 3.1 Create Booking Draft
`POST /api/v2/bookings/draft`

#### Auth
- 旅客登入，或 line session，或 admin_pos

#### Request
```json
{
  "activityId": "act_123",
  "planId": "plan_123",
  "startAt": "2026-04-20T09:00:00+08:00",
  "timezone": "Asia/Taipei",
  "participants": 2,
  "sourceChannel": "web",
  "contactName": "王小明",
  "contactPhone": "0912345678",
  "contactEmail": "test@example.com",
  "customerNote": "有長輩同行"
}
```

#### Behavior
- 驗證 plan 存在且可售
- server 端重算 slot 是否可用
- 建立 booking `draft`
- 建立 order `draft` 或 `pending_payment`
- 建立 order item

#### Response
```json
{
  "success": true,
  "data": {
    "bookingId": "bk_123",
    "bookingStatus": "draft",
    "orderId": "ord_123",
    "orderStatus": "pending_payment",
    "amount": 4800,
    "currency": "TWD"
  }
}
```

---

### 3.2 Get Booking Detail
`GET /api/v2/bookings/:bookingId`

#### Response
```json
{
  "success": true,
  "data": {
    "id": "bk_123",
    "bookingNo": "BK202604200001",
    "status": "confirmed",
    "sourceChannel": "line",
    "startAt": "2026-04-20T09:00:00Z",
    "endAt": "2026-04-20T13:00:00Z",
    "timezone": "Asia/Taipei",
    "participants": 2,
    "activity": {
      "id": "act_123",
      "title": "大稻埕深度漫步"
    },
    "plan": {
      "id": "plan_123",
      "name": "半日遊"
    },
    "order": {
      "id": "ord_123",
      "status": "paid",
      "paymentStatus": "paid"
    }
  }
}
```

---

### 3.3 Checkout Booking
`POST /api/v2/bookings/:bookingId/checkout`

#### Request
```json
{
  "provider": "ecpay"
}
```

#### Behavior
- booking 必須為 `draft`
- order 必須為 `pending_payment`
- 建立 payment + payment event
- 回傳支付資訊

#### Response
```json
{
  "success": true,
  "data": {
    "provider": "ecpay",
    "paymentId": "pay_123",
    "merchantTradeNo": "TP202604200001",
    "paymentFormHtml": "<form>...</form>"
  }
}
```

---

### 3.4 Confirm Booking
`POST /api/v2/bookings/:bookingId/confirm`

#### Auth
- guide / admin / system

#### Behavior
- booking status: `pending_confirmation` -> `confirmed`
- 寫 `booking_status_logs`
- 發送通知

---

### 3.5 Complete Booking
`POST /api/v2/bookings/:bookingId/complete`

#### Auth
- guide / admin / system

#### Behavior
- `confirmed` -> `completed`
- 寫 logs
- 可觸發 review invite

---

### 3.6 Cancel Booking
`POST /api/v2/bookings/:bookingId/cancel`

#### Request
```json
{
  "reason": "旅客臨時取消"
}
```

#### Behavior
- 合法狀態下取消 booking
- 視情況同步更新 order / refund flow
- 寫 logs

---

### 3.7 Request Reschedule
`POST /api/v2/bookings/:bookingId/reschedule-request`

#### Request
```json
{
  "requestedStartAt": "2026-04-22T09:00:00+08:00",
  "timezone": "Asia/Taipei",
  "reason": "旅客改期"
}
```

#### Behavior
- booking -> `reschedule_requested`
- 不直接覆蓋原時間
- 後續由 guide / admin 決定 accept/reject

---

## 4. Payment APIs

### 4.1 Payment Callback (ECPay)
`POST /api/v2/payments/ecpay/callback`

#### Behavior
- hash 驗證
- payment event: `callback_received`
- 若成功：
  - payment.status -> `paid`
  - order.payment_status -> `paid`
  - order.status -> `paid`
  - booking 若為 instant 類型，可進 `confirmed` 或 `pending_confirmation`

#### Response
- `1|OK`

---

### 4.2 Get Order Payments
`GET /api/v2/orders/:orderId/payments`

#### Response
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "pay_123",
        "provider": "ecpay",
        "amount": 4800,
        "status": "paid",
        "paidAt": "2026-04-20T01:10:00Z"
      }
    ]
  }
}
```

---

## 5. Guide Availability APIs

### 5.1 List Availability Rules
`GET /api/v2/guide/availability-rules`

### 5.2 Create Availability Rule
`POST /api/v2/guide/availability-rules`

#### Request
```json
{
  "activityPlanId": "plan_123",
  "weekday": 2,
  "startTimeLocal": "09:00",
  "endTimeLocal": "17:00",
  "timezone": "Asia/Taipei",
  "slotIntervalMinutes": 30,
  "bufferBeforeMinutes": 0,
  "bufferAfterMinutes": 30,
  "effectiveFrom": "2026-04-10",
  "effectiveTo": "2026-06-30"
}
```

### 5.3 Update Availability Rule
`PATCH /api/v2/guide/availability-rules/:ruleId`

### 5.4 Create Blackout Date
`POST /api/v2/guide/blackout-dates`

#### Request
```json
{
  "startsAt": "2026-04-25T09:00:00+08:00",
  "endsAt": "2026-04-25T18:00:00+08:00",
  "reason": "私人包團"
}
```

### 5.5 Delete Blackout Date
`DELETE /api/v2/guide/blackout-dates/:id`

---

## 6. Admin POS APIs

### 6.1 Create POS Order
`POST /api/v2/admin/pos/orders`

#### Auth
- admin only

#### Request
```json
{
  "sourceChannel": "admin_pos",
  "customer": {
    "name": "王小明",
    "phone": "0912345678",
    "email": "test@example.com"
  },
  "items": [
    {
      "itemType": "activity_booking",
      "activityId": "act_123",
      "planId": "plan_123",
      "bookingStartAt": "2026-04-20T09:00:00+08:00",
      "participants": 2,
      "quantity": 1,
      "unitPrice": 4800
    }
  ],
  "discountAmount": 300,
  "note": "LINE 談成，客服代建單"
}
```

#### Behavior
- 建 booking
- 建 order
- 建 order items
- 可選擇是否立即加 payment

---

### 6.2 Add POS Payment
`POST /api/v2/admin/pos/orders/:orderId/payments`

#### Request
```json
{
  "provider": "manual",
  "method": "cash",
  "amount": 4500,
  "referenceNo": "CASH-20260420-001",
  "paidAt": "2026-04-20T10:00:00+08:00"
}
```

#### Behavior
- 建 payments
- 建 payment_events
- 更新 order.payment_status

---

### 6.3 Get POS Order Detail
`GET /api/v2/admin/pos/orders/:orderId`

#### Response
需包含：
- order header
- items
- payments
- booking
- timeline

---

### 6.4 POS Refund
`POST /api/v2/admin/pos/orders/:orderId/refund`

#### Request
```json
{
  "amount": 2000,
  "reason": "部分退款"
}
```

---

## 7. LINE / LIFF APIs

### 7.1 LIFF Auth
`POST /api/v2/line/auth`

### 7.2 LINE Booking Draft
`POST /api/v2/line/bookings/draft`

本質上可包裝 `/api/v2/bookings/draft`，但加入 line context：
- sourceChannel = `line`
- 自動映射 line user

### 7.3 LINE Webhook
`POST /api/v2/line/webhook`

用途：
- 觸發 LIFF booking link
- 回覆 booking summary
- 發送 status update

---

## 8. 狀態轉移規則

## BookingStatus
- `draft`
- `pending_confirmation`
- `confirmed`
- `completed`
- `cancelled`
- `no_show`
- `reschedule_requested`

### Allowed Transitions
- `draft` -> `pending_confirmation`
- `draft` -> `confirmed`
- `draft` -> `cancelled`
- `pending_confirmation` -> `confirmed`
- `pending_confirmation` -> `cancelled`
- `confirmed` -> `completed`
- `confirmed` -> `cancelled`
- `confirmed` -> `no_show`
- `confirmed` -> `reschedule_requested`
- `reschedule_requested` -> `confirmed`
- `reschedule_requested` -> `cancelled`

## OrderStatus
- `draft`
- `pending_payment`
- `paid`
- `cancelled`
- `refunded`
- `partially_refunded`

## PaymentStatus
- `created`
- `pending`
- `paid`
- `failed`
- `cancelled`
- `refunded`

---

## 9. 實作提醒

1. `available-slots` API 必須 server-side 重算，不可信任 client。
2. payment callback 必須冪等。
3. booking / order / payment 三者分開管理狀態，不可再塞進單一欄位。
4. admin_pos 與 line 都只是 channel，不應改變核心 booking engine。
5. 所有寫操作都要有 audit trail。
