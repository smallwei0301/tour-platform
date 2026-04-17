# Issue #96 — Phase B1: Booking V2 Contract Compatibility

目的：在切換 `booking/[activityId]` 新流程前，先凍結並驗證 V2 API contract，避免前端改版造成隱性破壞。

## Scope (B1)

- `/api/v2/activities/:activityId/available-slots`
- `/api/v2/bookings/draft`
- `/api/v2/bookings/:bookingId/checkout`

## Contract Baseline

### 1) GET available-slots

必填查詢參數：
- `planId` (uuid)
- `dateFrom` (YYYY-MM-DD)
- `dateTo` (YYYY-MM-DD, <= 31 days range)
- `timezone` (IANA tz)

可選：
- `participants` (positive integer, default 1)

錯誤：
- `VALIDATION_ERROR`

### 2) POST bookings/draft

Body 最小需求：
- `activityId`
- `planId`
- `startAt`
- `timezone`
- `participants`
- `contactName`
- `contactPhone`
- `contactEmail`

預期：
- 成功回傳 draft/booking id 與可用於 checkout 的 reference
- 驗證錯誤回 `VALIDATION_ERROR`

### 3) POST bookings/:bookingId/checkout

Body 最小需求：
- `paymentProvider`

預期：
- 成功回傳 checkout payload
- 非法 bookingId 回 `VALIDATION_ERROR`

## Existing Coverage

目前已有測試：
- `apps/web/tests/api/v2-available-slots.test.mjs`
- `apps/web/tests/api/v2-booking-draft-checkout.test.mjs`

## Gaps to Close in B1

1. **Route-level contract test**（目前偏 validation-logic mirroring）
   - 需補 route handler 級別的 response shape smoke tests（success/error）
2. **Error code consistency matrix**
   - 三條 API 錯誤碼與 message key 統一（前端可依 code 決策）
3. **Versioned contract note**
   - 新增 `v2` contract change log（避免 B2/B3 漸進改版時意外破壞）

## Acceptance Criteria (B1 Done)

- [ ] 三條 API 的 request/response contract 文字化並固定
- [ ] 至少一組 route-level smoke 測試覆蓋 success/error shape
- [ ] 錯誤碼矩陣對齊（`VALIDATION_ERROR`、`UNAUTHORIZED`、`NOT_FOUND` 等）
- [ ] B2 只能在 B1 完成後啟動
