# Issue #210 — Booking/Cancel Verification Pack Checklist

> Updated: 2026-04-24  
> Scope: 僅 booking/cancel verification slice（不含 callback/payment-init/#178/#170/#197/PR #196/整體 #171 rewrite）

## 1) 執行入口（單一命令）

```bash
cd /root/tour-platform
npm run regression:issue-210:booking-cancel
```

對應檔案：
- Script: `scripts/phase12/run-issue-210-booking-cancel-verification-pack.sh`
- SQL: `supabase/scripts/phase12/issue-210-booking-cancel-verification.sql`
- Report template: `reports/issue-210/report-template.md`

## 2) 必備前置條件

- [ ] 已設定 `DATABASE_URL`（或 `PGHOST/PG*`）
- [ ] 可在 repo root 執行 `npm`
- [ ] 目前 DB schema 含 `bookings`, `orders`, `payments`

## 3) Gate metrics（關鍵）

以下任一不為 0 => **HOLD / STOP**：
- [ ] `cancelled_status_missing_cancelled_at_count = 0`
- [ ] `non_cancelled_with_cancelled_at_count = 0`
- [ ] `cancelled_bookings_missing_order_count = 0`

以下若 > 0 => **需人工判讀 + 附 sample evidence**：
- [ ] `cancelled_booking_order_status_not_cancelled_count`
- [ ] `cancelled_booking_paid_payment_count`

## 4) 證據輸出

每次執行會建立：
- `reports/issue-210/<timestamp>/booking-cancel-verification-sql-output.txt`
- `reports/issue-210/<timestamp>/booking-cancel-contract-tests.txt`
- `reports/issue-210/<timestamp>/summary.md`

## 5) PR / Issue 附件要求

- [ ] 附上 `summary.md`
- [ ] 附上 SQL raw output
- [ ] 附上 contract tests raw output
- [ ] 用 `reports/issue-210/report-template.md` 填寫 GO/HOLD/STOP decision
