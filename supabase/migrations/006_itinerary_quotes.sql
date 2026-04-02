-- 006_itinerary_quotes.sql
-- 新增 itinerary（行程時間表）與 social_proof_quotes（口碑語錄）欄位

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS itinerary jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS social_proof_quotes jsonb NOT NULL DEFAULT '[]';

COMMENT ON COLUMN activities.itinerary IS
'行程時間表（陣列）。每個步驟格式：
[{"step":1,"title":"佛國寺","description":"參觀世界遺產佛國寺","duration":"60分鐘","icon":"🛕"}]';

COMMENT ON COLUMN activities.social_proof_quotes IS
'社群口碑語錄（字串陣列）。例如：["超值！下次還要來","導遊很親切"]';
