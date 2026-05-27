-- GH-841 follow-up: preserve legacy plans[].planItinerary step structure in formal schema
-- additive only; keeps existing plan_itinerary_image_url compatibility column.

ALTER TABLE activity_plans
  ADD COLUMN IF NOT EXISTS plan_itinerary JSONB;

COMMENT ON COLUMN activity_plans.plan_itinerary IS 'legacy activities.plans[].planItinerary step array: [{ text, imageUrl? }]';
