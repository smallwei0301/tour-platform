ALTER TABLE refund_requests DROP COLUMN IF EXISTS retry_count;
ALTER TABLE refund_requests DROP COLUMN IF EXISTS last_error;
