-- Issue #197 evidence (AFTER replay)
-- Expect synced sample: order_payment_status='paid' and payment_row_status='paid'

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
WHERE o.id = :order_id;
