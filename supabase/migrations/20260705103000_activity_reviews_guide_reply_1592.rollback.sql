-- Rollback #1592
ALTER TABLE activity_reviews
  DROP COLUMN IF EXISTS guide_reply_text,
  DROP COLUMN IF EXISTS guide_reply_at;
