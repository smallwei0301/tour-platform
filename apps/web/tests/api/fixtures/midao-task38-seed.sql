-- Issue #1759 Package 4 Task 38: disposable-DB seed fixture for
-- apps/web/tests/api/midao-inquiry-convert-rpc.test.mjs
--
-- 僅供本機／容器內的一次性測試資料庫使用（PLAN_DOC §9）。
-- 禁止對生產或 staging 執行。不含任何真實個資或密鑰；所有 uuid 為固定測試值。

BEGIN;

-- idempotency 殘留必須以「scope」清乾淨，不能只靠 actor_id：
--   conversion 的 actor_id 是 'task38-actor'，但 accept 的 actor_id 是旅客 uuid，
--   只清 actor_id 會讓 accept 的列跨測試累積，使 A／I 的「恰一列／零列」斷言失真。
--   本區塊必須在刪 bookings／guide_inquiries 之前執行，子查詢才找得到 scope_id。
DELETE FROM public.midao_idempotency_records
  WHERE actor_id LIKE 'task38-%'
     OR idempotency_key LIKE 'task38-%'
     OR (scope_type = 'inquiry' AND scope_id IN (
          SELECT id FROM public.guide_inquiries
           WHERE guide_id = '22222222-0000-0000-0000-000000000001'::uuid))
     OR (scope_type = 'booking' AND scope_id IN (
          SELECT id FROM public.bookings
           WHERE guide_id = '22222222-0000-0000-0000-000000000001'::uuid));

-- 清空本 fixture 會重建的資料（只針對固定測試 uuid，不觸及其他資料）
DELETE FROM public.midao_notification_outbox
  WHERE aggregate_type = 'booking'
    AND aggregate_id IN (SELECT id::text FROM public.bookings WHERE guide_id = '22222222-0000-0000-0000-000000000001'::uuid);
DELETE FROM public.booking_status_logs
  WHERE booking_id IN (SELECT id FROM public.bookings WHERE guide_id = '22222222-0000-0000-0000-000000000001'::uuid);
DELETE FROM public.booking_confirmation_tokens
  WHERE booking_id IN (SELECT id FROM public.bookings WHERE guide_id = '22222222-0000-0000-0000-000000000001'::uuid);
DELETE FROM public.booking_intake_responses
  WHERE booking_id IN (SELECT id FROM public.bookings WHERE guide_id = '22222222-0000-0000-0000-000000000001'::uuid);
DELETE FROM public.booking_pricing_snapshots
  WHERE booking_id IN (SELECT id FROM public.bookings WHERE guide_id = '22222222-0000-0000-0000-000000000001'::uuid);
UPDATE public.guide_inquiries SET converted_booking_id = NULL
  WHERE guide_id = '22222222-0000-0000-0000-000000000001'::uuid;
UPDATE public.orders SET booking_id = NULL
  WHERE booking_id IN (SELECT id FROM public.bookings WHERE guide_id = '22222222-0000-0000-0000-000000000001'::uuid);
DELETE FROM public.bookings WHERE guide_id = '22222222-0000-0000-0000-000000000001'::uuid;
DELETE FROM public.orders WHERE activity_id = '33333333-0000-0000-0000-000000000001'::uuid;
DELETE FROM public.guide_inquiries WHERE guide_id = '22222222-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
  IF to_regclass('public.midao_booking_capacity_locks') IS NOT NULL THEN
    -- 本表由 Task 38 migration 建立；未套用 migration 時（RED 階段）跳過清理。
    EXECUTE $cleanup$DELETE FROM public.midao_booking_capacity_locks
      WHERE guide_id = '22222222-0000-0000-0000-000000000001'::uuid$cleanup$;
  END IF;
END $$;
DELETE FROM public.activity_plans WHERE activity_id = '33333333-0000-0000-0000-000000000001'::uuid;
DELETE FROM public.activities WHERE id = '33333333-0000-0000-0000-000000000001'::uuid;
DELETE FROM public.guide_profiles WHERE id = '22222222-0000-0000-0000-000000000001'::uuid;
DELETE FROM public.users WHERE id IN (
  '11111111-0000-0000-0000-000000000001'::uuid,  -- guide user
  '11111111-0000-0000-0000-000000000002'::uuid,  -- traveler A
  '11111111-0000-0000-0000-000000000003'::uuid   -- traveler B
);
DELETE FROM auth.users WHERE id IN (
  '11111111-0000-0000-0000-000000000001'::uuid,
  '11111111-0000-0000-0000-000000000002'::uuid,
  '11111111-0000-0000-0000-000000000003'::uuid,
  '11111111-0000-0000-0000-0000000000ff'::uuid   -- T-K4: auth only, no public.users row
);

-- auth.users（Supabase 託管 schema；disposable DB 內為最小替身）
INSERT INTO auth.users (id) VALUES
  ('11111111-0000-0000-0000-000000000001'::uuid),
  ('11111111-0000-0000-0000-000000000002'::uuid),
  ('11111111-0000-0000-0000-000000000003'::uuid),
  ('11111111-0000-0000-0000-0000000000ff'::uuid);  -- ★ T-K4：故意不建 public.users 對應列

-- public.users（注意：0000ff 這個 traveler 刻意缺席，用來驗證 N5 守門）
INSERT INTO public.users (id, role, email, name) VALUES
  ('11111111-0000-0000-0000-000000000001'::uuid, 'guide',    'task38-guide@example.test',     'Task38 Guide'),
  ('11111111-0000-0000-0000-000000000002'::uuid, 'traveler', 'task38-traveler-a@example.test','Task38 Traveler A'),
  ('11111111-0000-0000-0000-000000000003'::uuid, 'traveler', 'task38-traveler-b@example.test','Task38 Traveler B');

INSERT INTO public.guide_profiles (id, user_id, slug, display_name, verification_status, is_published)
VALUES ('22222222-0000-0000-0000-000000000001'::uuid,
        '11111111-0000-0000-0000-000000000001'::uuid,
        'task38-guide', 'Task38 Guide', 'approved', true);

INSERT INTO public.activities (
  id, guide_id, guide_slug, title, slug, price_twd,
  min_participants, max_participants, duration_minutes, status
) VALUES (
  '33333333-0000-0000-0000-000000000001'::uuid,
  '22222222-0000-0000-0000-000000000001'::uuid,
  'task38-guide', 'Task38 Request Activity', 'task38-request-activity', 3000,
  1, 8, 240, 'published'
);

-- 主要 request 型方案（max_participants 由測試依案例動態調整）
INSERT INTO public.activity_plans (
  id, activity_id, name, slug, duration_minutes, price_type, base_price,
  min_participants, max_participants, booking_type, status
) VALUES (
  '44444444-0000-0000-0000-000000000001'::uuid,
  '33333333-0000-0000-0000-000000000001'::uuid,
  'Task38 Request Plan', 'task38-request-plan', 240, 'per_person', 3000,
  1, 8, 'request', 'active'
);

-- 非 request 型方案（D8 負向案例）
INSERT INTO public.activity_plans (
  id, activity_id, name, slug, duration_minutes, price_type, base_price,
  min_participants, max_participants, booking_type, status
) VALUES (
  '44444444-0000-0000-0000-000000000002'::uuid,
  '33333333-0000-0000-0000-000000000001'::uuid,
  'Task38 Instant Plan', 'task38-instant-plan', 240, 'per_person', 3000,
  1, 8, 'instant', 'active'
);

-- guide_inquiries：status='replied'，questionnaire_snapshot／answers 皆為 object
INSERT INTO public.guide_inquiries (
  id, inquiry_no, traveler_user_id, guide_id, activity_id, activity_plan_id,
  status, party_size, questionnaire_snapshot, answers
) VALUES
  ('55555555-0000-0000-0000-000000000001'::uuid, 'TASK38-INQ-001',
   '11111111-0000-0000-0000-000000000002'::uuid,
   '22222222-0000-0000-0000-000000000001'::uuid,
   '33333333-0000-0000-0000-000000000001'::uuid,
   '44444444-0000-0000-0000-000000000001'::uuid,
   'replied', 2, '{"version":1,"questions":[]}'::jsonb, '{"note":"seed-a"}'::jsonb),
  ('55555555-0000-0000-0000-000000000002'::uuid, 'TASK38-INQ-002',
   '11111111-0000-0000-0000-000000000003'::uuid,
   '22222222-0000-0000-0000-000000000001'::uuid,
   '33333333-0000-0000-0000-000000000001'::uuid,
   '44444444-0000-0000-0000-000000000001'::uuid,
   'replied', 2, '{"version":1,"questions":[]}'::jsonb, '{"note":"seed-b"}'::jsonb),
  ('55555555-0000-0000-0000-000000000003'::uuid, 'TASK38-INQ-003',
   '11111111-0000-0000-0000-000000000002'::uuid,
   '22222222-0000-0000-0000-000000000001'::uuid,
   '33333333-0000-0000-0000-000000000001'::uuid,
   '44444444-0000-0000-0000-000000000001'::uuid,
   'replied', 1, '{"version":1,"questions":[]}'::jsonb, '{"note":"seed-c"}'::jsonb),
  ('55555555-0000-0000-0000-000000000004'::uuid, 'TASK38-INQ-004',
   '11111111-0000-0000-0000-000000000003'::uuid,
   '22222222-0000-0000-0000-000000000001'::uuid,
   '33333333-0000-0000-0000-000000000001'::uuid,
   '44444444-0000-0000-0000-000000000001'::uuid,
   'replied', 1, '{"version":1,"questions":[]}'::jsonb, '{"note":"seed-d"}'::jsonb),
  ('55555555-0000-0000-0000-000000000005'::uuid, 'TASK38-INQ-005',
   '11111111-0000-0000-0000-000000000002'::uuid,
   '22222222-0000-0000-0000-000000000001'::uuid,
   '33333333-0000-0000-0000-000000000001'::uuid,
   '44444444-0000-0000-0000-000000000001'::uuid,
   'replied', 1, '{"version":1,"questions":[]}'::jsonb, '{"note":"seed-e"}'::jsonb),
  ('55555555-0000-0000-0000-000000000006'::uuid, 'TASK38-INQ-006',
   '11111111-0000-0000-0000-000000000003'::uuid,
   '22222222-0000-0000-0000-000000000001'::uuid,
   '33333333-0000-0000-0000-000000000001'::uuid,
   '44444444-0000-0000-0000-000000000001'::uuid,
   'replied', 1, '{"version":1,"questions":[]}'::jsonb, '{"note":"seed-f"}'::jsonb),
  -- ★ T-K4：traveler 只有 auth.users、沒有 public.users
  ('55555555-0000-0000-0000-0000000000ff'::uuid, 'TASK38-INQ-0FF',
   '11111111-0000-0000-0000-0000000000ff'::uuid,
   '22222222-0000-0000-0000-000000000001'::uuid,
   '33333333-0000-0000-0000-000000000001'::uuid,
   '44444444-0000-0000-0000-000000000001'::uuid,
   'replied', 1, '{"version":1,"questions":[]}'::jsonb, '{"note":"seed-orphan"}'::jsonb);

COMMIT;
