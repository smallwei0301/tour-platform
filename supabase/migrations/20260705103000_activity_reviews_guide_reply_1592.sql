-- Issue #1592 — 評論互動強化：導遊回覆評論。
-- 在既有 activity_reviews 上加兩欄；一則評論最多一則導遊回覆（覆寫即更新）。
-- 不改既有欄位、不動 RLS 主體，僅追加欄位（schema-drift guard 於讀取端 fail-soft）。

ALTER TABLE activity_reviews
  ADD COLUMN IF NOT EXISTS guide_reply_text text,
  ADD COLUMN IF NOT EXISTS guide_reply_at timestamptz;

COMMENT ON COLUMN activity_reviews.guide_reply_text IS '#1592 導遊對此評論的公開回覆（最多 1000 字，null=尚未回覆）';
COMMENT ON COLUMN activity_reviews.guide_reply_at IS '#1592 導遊回覆時間（最後一次覆寫時間）';
