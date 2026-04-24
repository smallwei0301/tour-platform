-- Issue #197 replay command (for mismatch sample)
-- Replace :order_id with mismatch sample id from sql-evidence-before.sql

SELECT *
FROM fn_process_payment_callback_atomic(
  :order_id::uuid,
  'ISSUE197-REPLAY',
  NULL,
  jsonb_build_object('source', 'issue-197-verification-pack', 'kind', 'mismatch-replay')
);
