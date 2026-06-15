-- Rollback for 20260615_line302c_telegram_binding
BEGIN;

DROP TABLE IF EXISTS telegram_webhook_events;
DROP TABLE IF EXISTS telegram_bind_code;
DROP TABLE IF EXISTS telegram_chat_mapping;

COMMIT;
