-- issue #536: repair refund_requests idempotency key schema in environments missing issue #64 migration

ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS request_id text;

-- Explicit idempotency scope remains (order_id, request_id)
CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_order_request_id_unique
  ON public.refund_requests(order_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS refund_requests_request_id_idx
  ON public.refund_requests(request_id)
  WHERE request_id IS NOT NULL;
