REVOKE ALL ON TABLE public.midao_notification_outbox FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.midao_notification_outbox TO service_role;

REVOKE ALL ON TABLE public.midao_idempotency_records FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.midao_idempotency_records TO service_role;

REVOKE ALL ON TABLE public.midao_audit_events FROM service_role;
GRANT SELECT, INSERT ON TABLE public.midao_audit_events TO service_role;
