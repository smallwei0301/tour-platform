-- GH #178 verification query: inspect LINE/LIFF audit chain across draft, checkout/payment-init, and callback/status transition.
-- Safe/read-only. Provide :booking_id in psql or replace the placeholder manually.
WITH target_booking AS (
  SELECT b.id AS booking_id, b.order_id, b.source_channel
  FROM bookings b
  WHERE b.id = :'booking_id'::uuid
), booking_audit AS (
  SELECT
    'booking_status_logs' AS source,
    bsl.created_at,
    bsl.from_status,
    bsl.to_status,
    bsl.actor_role,
    bsl.metadata->>'sourceChannel' AS source_channel,
    bsl.metadata->>'originSourceChannel' AS origin_source_channel,
    bsl.metadata->>'correlationId' AS correlation_id,
    bsl.metadata->>'auditSignal' AS audit_signal,
    bsl.metadata
  FROM booking_status_logs bsl
  JOIN target_booking tb ON tb.booking_id = bsl.booking_id
), payment_audit AS (
  SELECT
    'payment_events' AS source,
    pe.created_at,
    NULL::text AS from_status,
    pe.event_type AS to_status,
    NULL::text AS actor_role,
    pe.payload->>'sourceChannel' AS source_channel,
    pe.payload->>'originSourceChannel' AS origin_source_channel,
    pe.payload->>'correlationId' AS correlation_id,
    pe.payload->>'auditSignal' AS audit_signal,
    pe.payload AS metadata
  FROM payments pay
  JOIN payment_events pe ON pe.payment_id = pay.id
  JOIN target_booking tb ON tb.order_id = pay.order_id
)
SELECT *
FROM booking_audit
UNION ALL
SELECT *
FROM payment_audit
ORDER BY created_at ASC;
