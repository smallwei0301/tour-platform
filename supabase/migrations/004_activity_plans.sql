-- =============================================================
-- 004_activity_plans.sql
-- 新增 plans JSONB 欄位，讓後台可編輯 activities 頁面的方案文案
-- =============================================================

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS plans jsonb DEFAULT NULL;

COMMENT ON COLUMN activities.plans IS '行程方案設定（JSON 陣列）。若為 NULL，前端使用預設方案。
  結構範例:
  [
    {
      "id": "half-day",
      "label": "A. 半日行程",
      "duration": "約 4 小時",
      "priceMultiplier": 1,
      "highlights": ["最早出發前 1 天可預訂", "免費取消（72 小時前）"],
      "detailsLinkText": "查看方案詳情 ›",
      "bookingBtnText": "立即預約"
    }
  ]
';
