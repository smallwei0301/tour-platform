-- issue #64: refund request idempotency via explicit request IDs

ALTER TABLE refund_requests
  ADD COLUMN IF NOT EXISTS request_id text;

-- Explicit idempotency scope: (order_id, request_id)
CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_order_request_id_unique
  ON refund_requests(order_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS refund_requests_request_id_idx
  ON refund_requests(request_id)
  WHERE request_id IS NOT NULL;
