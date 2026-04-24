-- Issue #197 evidence (BEFORE replay)
-- Expect mismatch sample: payments.status='paid' but orders.payment_status='pending'

SELECT
  o.id AS order_id,
  o.status AS order_status,
  o.payment_status AS order_payment_status,
  p.status AS payment_row_status,
  o.paid_at AS order_paid_at,
  p.paid_at AS payment_paid_at,
  p.trade_no,
  o.updated_at AS order_updated_at,
  p.updated_at AS payment_updated_at
FROM orders o
JOIN payments p ON p.order_id = o.id
WHERE p.status = 'paid'
  AND coalesce(o.payment_status, 'pending') <> 'paid'
ORDER BY o.updated_at DESC
LIMIT 20;
