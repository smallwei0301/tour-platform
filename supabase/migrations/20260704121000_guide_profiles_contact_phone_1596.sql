-- Issue #1596 — 行前 24h 導遊聯絡：guide_profiles 增聯絡電話＋揭露同意欄位。
-- canonical 導遊表為 guide_profiles（bookings.guide_id → guide_profiles.id）。
-- 電話僅在「出發前 24 小時內、confirmed 訂單、且導遊同意揭露」時對該旅客顯示（route 端把關）。
-- 預設不揭露（contact_phone_visible = false），導遊需自行於後台開啟。

ALTER TABLE guide_profiles
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_phone_visible boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN guide_profiles.contact_phone IS '#1596 導遊行前聯絡電話（僅出發前 24h 對該旅客顯示）';
COMMENT ON COLUMN guide_profiles.contact_phone_visible IS '#1596 導遊是否同意在行前 24h 對旅客揭露電話（預設 false）';
