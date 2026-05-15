-- issue #536 rollback: remove repair indexes only (non-destructive)
-- request_id may predate this repair migration in some environments,
-- so rollback must not drop the column automatically.

DROP INDEX IF EXISTS refund_requests_order_request_id_unique;
DROP INDEX IF EXISTS refund_requests_request_id_idx;
