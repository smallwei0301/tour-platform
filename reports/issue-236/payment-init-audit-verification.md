# Issue #236 — LINE/LIFF payment-init audit verification artifact

## Scope (bounded)
Only verifies:
1. `POST /api/v2/bookings/draft`
2. `POST /api/v2/bookings/:bookingId/checkout`

Out of scope (intentionally untouched): callback / refund / admin-manual sibling paths.

---

## Expected audit contract

### Draft step
`booking_status_logs` should include metadata:
- `sourceChannel` (truthful retained value, e.g. `line`)
- `correlationId` (single id for downstream reuse)
- `auditSignal = "line_liff_draft_entry"`

### Checkout payment-init step
`payment_events` (`event_type=initiated`) payload should include:
- `sourceChannel` (same as draft booking/order channel)
- `correlationId` (same id from draft metadata, not regenerated)
- `auditSignal = "line_liff_payment_init"`

`booking_status_logs` (`reason='Checkout initiated'`) metadata should include the same `sourceChannel` and `correlationId`.

---

## QA verification SQL

```sql
-- 1) Find latest LINE booking draft
WITH latest_line_draft AS (
  SELECT b.id AS booking_id, b.order_id, b.source_channel
  FROM bookings b
  WHERE b.source_channel = 'line'
  ORDER BY b.created_at DESC
  LIMIT 1
),
draft_log AS (
  SELECT
    l.booking_id,
    (l.metadata->>'sourceChannel') AS draft_source_channel,
    (l.metadata->>'correlationId') AS draft_correlation_id,
    (l.metadata->>'auditSignal') AS draft_audit_signal,
    l.created_at AS draft_log_at
  FROM booking_status_logs l
  JOIN latest_line_draft d ON d.booking_id = l.booking_id
  WHERE l.reason = 'Booking draft created'
  ORDER BY l.created_at ASC
  LIMIT 1
),
checkout_log AS (
  SELECT
    l.booking_id,
    (l.metadata->>'sourceChannel') AS checkout_source_channel,
    (l.metadata->>'correlationId') AS checkout_correlation_id,
    (l.metadata->>'auditSignal') AS checkout_audit_signal,
    l.created_at AS checkout_log_at
  FROM booking_status_logs l
  JOIN latest_line_draft d ON d.booking_id = l.booking_id
  WHERE l.reason = 'Checkout initiated'
  ORDER BY l.created_at DESC
  LIMIT 1
),
payment_init AS (
  SELECT
    p.order_id,
    pe.id AS payment_event_id,
    pe.event_type,
    (pe.payload->>'sourceChannel') AS payment_source_channel,
    (pe.payload->>'correlationId') AS payment_correlation_id,
    (pe.payload->>'auditSignal') AS payment_audit_signal,
    pe.created_at AS payment_event_at
  FROM latest_line_draft d
  JOIN payments p ON p.order_id = d.order_id
  JOIN payment_events pe ON pe.payment_id = p.id
  WHERE pe.event_type = 'initiated'
  ORDER BY pe.created_at DESC
  LIMIT 1
)
SELECT
  d.booking_id,
  d.source_channel AS booking_source_channel,
  dl.draft_source_channel,
  cl.checkout_source_channel,
  pi.payment_source_channel,
  dl.draft_correlation_id,
  cl.checkout_correlation_id,
  pi.payment_correlation_id,
  dl.draft_audit_signal,
  cl.checkout_audit_signal,
  pi.payment_audit_signal,
  (dl.draft_source_channel = d.source_channel) AS draft_source_match,
  (cl.checkout_source_channel = d.source_channel) AS checkout_source_match,
  (pi.payment_source_channel = d.source_channel) AS payment_source_match,
  (dl.draft_correlation_id = cl.checkout_correlation_id) AS corr_draft_checkout_match,
  (dl.draft_correlation_id = pi.payment_correlation_id) AS corr_draft_payment_match
FROM latest_line_draft d
LEFT JOIN draft_log dl ON dl.booking_id = d.booking_id
LEFT JOIN checkout_log cl ON cl.booking_id = d.booking_id
LEFT JOIN payment_init pi ON pi.order_id = d.order_id;
```

---

## Pass criteria
- `draft_source_match = true`
- `checkout_source_match = true`
- `payment_source_match = true`
- `corr_draft_checkout_match = true`
- `corr_draft_payment_match = true`
- `draft_audit_signal = line_liff_draft_entry`
- `checkout_audit_signal = line_liff_payment_init`
- `payment_audit_signal = line_liff_payment_init`
