-- #1475 導遊不公開匯款資訊（手動查帳付款用）
-- 這些欄位僅於旅客選擇「自行匯款」付款時，透過受權限保護的
-- GET /api/v2/bookings/[bookingId]/transfer-info 揭露給該筆預約的下單者；
-- 公開導遊頁與公開查詢（getGuideBySlugDb 等）一律不回傳這些欄位。

ALTER TABLE guide_profiles ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE guide_profiles ADD COLUMN IF NOT EXISTS account_name text;
ALTER TABLE guide_profiles ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE guide_profiles ADD COLUMN IF NOT EXISTS transfer_note text;

COMMENT ON COLUMN guide_profiles.bank_name IS '#1475 匯款銀行名稱（不公開，僅付款步驟揭露）';
COMMENT ON COLUMN guide_profiles.account_name IS '#1475 匯款戶名（不公開）';
COMMENT ON COLUMN guide_profiles.account_number IS '#1475 匯款帳號（不公開）';
COMMENT ON COLUMN guide_profiles.transfer_note IS '#1475 匯款備註／說明（不公開）';
