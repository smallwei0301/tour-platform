-- Rollback for #1475 導遊不公開匯款資訊
ALTER TABLE guide_profiles DROP COLUMN IF EXISTS bank_name;
ALTER TABLE guide_profiles DROP COLUMN IF EXISTS account_name;
ALTER TABLE guide_profiles DROP COLUMN IF EXISTS account_number;
ALTER TABLE guide_profiles DROP COLUMN IF EXISTS transfer_note;
