-- issue #536 rollback: remove repair indexes/column

DROP INDEX IF EXISTS refund_requests_order_request_id_unique;
DROP INDEX IF EXISTS refund_requests_request_id_idx;
ALTER TABLE refund_requests
  DROP COLUMN IF EXISTS request_id;
