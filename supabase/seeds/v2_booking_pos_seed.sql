-- TP-BP-001: V2 Booking + POS Seed Data
-- Purpose: Provide minimal test data for the v2 booking/POS schema
-- Date: 2026-04-09
--
-- Prerequisites: Run after 20260409000000_v2_booking_pos_foundation.sql
-- =============================================================

-- Only run if we have activities but no activity_plans yet
DO $$
DECLARE
  plan_count integer;
  activity_count integer;
BEGIN
  SELECT COUNT(*) INTO plan_count FROM activity_plans;
  SELECT COUNT(*) INTO activity_count FROM activities;

  IF plan_count = 0 AND activity_count > 0 THEN
    -- Create default plans for existing activities
    INSERT INTO activity_plans (
      activity_id, name, slug, duration_minutes, price_type, base_price,
      min_participants, max_participants, booking_type, status
    )
    SELECT
      a.id,
      'Default Plan',
      'default',
      COALESCE(a.duration_minutes, 240),
      'per_person',
      COALESCE(a.price_twd, 0),
      COALESCE(a.min_participants, 1),
      COALESCE(a.max_participants, 10),
      'instant',
      CASE WHEN a.status = 'published' THEN 'active' ELSE 'inactive' END
    FROM activities a
    WHERE NOT EXISTS (
      SELECT 1 FROM activity_plans ap WHERE ap.activity_id = a.id
    );

    RAISE NOTICE 'Created default plans for % activities', activity_count;
  ELSE
    RAISE NOTICE 'Skipping: plan_count=%, activity_count=%', plan_count, activity_count;
  END IF;
END $$;

-- =============================================================
-- Sample Guide Availability Rules (for testing)
-- Only insert if we have guide_profiles and activity_plans
-- =============================================================
DO $$
DECLARE
  guide_id_sample uuid;
  plan_id_sample uuid;
BEGIN
  -- Get a sample guide
  SELECT id INTO guide_id_sample FROM guide_profiles LIMIT 1;
  -- Get a sample plan
  SELECT id INTO plan_id_sample FROM activity_plans LIMIT 1;

  IF guide_id_sample IS NOT NULL AND plan_id_sample IS NOT NULL THEN
    -- Check if rules already exist
    IF NOT EXISTS (SELECT 1 FROM guide_availability_rules WHERE guide_id = guide_id_sample) THEN
      -- Create sample weekday rules (Mon-Fri 09:00-17:00)
      INSERT INTO guide_availability_rules (
        guide_id, activity_plan_id, weekday, start_time_local, end_time_local,
        timezone, slot_interval_minutes, buffer_before_minutes, buffer_after_minutes,
        effective_from, is_active
      )
      SELECT
        guide_id_sample,
        plan_id_sample,
        wd,
        '09:00'::time,
        '17:00'::time,
        'Asia/Taipei',
        30,
        0,
        30,
        CURRENT_DATE,
        true
      FROM unnest(ARRAY[1, 2, 3, 4, 5]) AS wd;  -- Mon-Fri

      -- Create sample weekend rule (Sat-Sun 10:00-16:00)
      INSERT INTO guide_availability_rules (
        guide_id, activity_plan_id, weekday, start_time_local, end_time_local,
        timezone, slot_interval_minutes, buffer_before_minutes, buffer_after_minutes,
        effective_from, is_active
      )
      SELECT
        guide_id_sample,
        plan_id_sample,
        wd,
        '10:00'::time,
        '16:00'::time,
        'Asia/Taipei',
        30,
        0,
        30,
        CURRENT_DATE,
        true
      FROM unnest(ARRAY[0, 6]) AS wd;  -- Sun, Sat

      RAISE NOTICE 'Created sample availability rules for guide %', guide_id_sample;
    END IF;
  END IF;
END $$;

-- =============================================================
-- Summary
-- =============================================================
DO $$
DECLARE
  cnt_plans integer;
  cnt_rules integer;
  cnt_blackouts integer;
  cnt_bookings integer;
BEGIN
  SELECT COUNT(*) INTO cnt_plans FROM activity_plans;
  SELECT COUNT(*) INTO cnt_rules FROM guide_availability_rules;
  SELECT COUNT(*) INTO cnt_blackouts FROM guide_blackout_dates;
  SELECT COUNT(*) INTO cnt_bookings FROM bookings;

  RAISE NOTICE 'V2 Seed Data Summary:';
  RAISE NOTICE '  activity_plans: %', cnt_plans;
  RAISE NOTICE '  guide_availability_rules: %', cnt_rules;
  RAISE NOTICE '  guide_blackout_dates: %', cnt_blackouts;
  RAISE NOTICE '  bookings: %', cnt_bookings;
END $$;
