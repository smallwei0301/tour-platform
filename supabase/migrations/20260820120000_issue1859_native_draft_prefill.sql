-- #1859 Task A — native ensure 草稿預填既有方案與問卷。
-- Forward-only：本檔僅以 CREATE OR REPLACE 重寫 public.midao_ensure_native_service_draft，
-- 不修改任何既有 migration 檔（鐵律 4），也不改寫 S6 midao_publish_service_draft 的全量替換語意。
--
-- 行為變更（規格 docs/plans/2026-08-20-issue1859-draft-prefill.md D2/D3/D4/D5）：
--   1. 建立 native 草稿時，payload 的 plans / questions 依來源資料表預填，不再硬寫空白佔位方案。
--   2. 既有 active 草稿若確定為「舊版 ensure 留下的空方案草稿」，做一次性自我修復並回傳 REUSED_REPAIRED。
--
-- 不變量：唯一寫入目標仍是 public.guide_service_drafts；簽章、SECURITY DEFINER、
-- search_path、activity 白名單、既有回傳碼語意一律不變；權限語句原樣重述、不放寬。
-- 注意（#1855）：NULLIF / COALESCE / CASE 為 SQL 語法特殊形式，不得加 pg_catalog. 前綴。

CREATE OR REPLACE FUNCTION public.midao_ensure_native_service_draft(
  p_activity_id uuid,
  p_guide_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ensure$
DECLARE
  v_activity public.activities%ROWTYPE;
  v_draft public.guide_service_drafts%ROWTYPE;
  v_name text;
  v_description text;
  v_plans jsonb;
  v_questions jsonb;
  v_payload jsonb;
  v_inserted_draft_id uuid;
  v_has_active_plan boolean;
  v_draft_plans jsonb;
  v_draft_plans_blank boolean;
  v_should_repair boolean;
BEGIN
  IF p_activity_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTIVITY_ID';
  END IF;
  IF p_guide_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_GUIDE_ID';
  END IF;

  SELECT * INTO v_activity FROM public.activities WHERE id = p_activity_id FOR UPDATE;
  IF NOT FOUND OR v_activity.guide_id IS DISTINCT FROM p_guide_id
    OR v_activity.status IS DISTINCT FROM 'published'
    OR p_activity_id NOT IN (
      'c0000003-0000-0000-0000-000000000001'::uuid,
      'c0000003-0000-0000-0000-000000000002'::uuid,
      'c0000003-0000-0000-0000-000000000003'::uuid
    ) THEN
    RETURN pg_catalog.jsonb_build_object('code', 'ACTIVITY_NOT_FOUND_OR_OWNERSHIP_MISMATCH');
  END IF;

  -- D4：只取目前仍上架（status = 'active'）的方案，依建立順序帶回。
  -- slug 原樣帶回：它是 S6 upsert 的 (activity_id, slug) 身分鍵，不帶會另建新列並讓舊列永停 inactive。
  SELECT COALESCE(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'slug', p.slug,
               'name', p.name,
               'booking_type', p.booking_type,
               'duration_minutes', p.duration_minutes,
               'price_type', p.price_type,
               'base_price', p.base_price,
               'min_participants', p.min_participants,
               'max_participants', p.max_participants
             )
             ORDER BY p.created_at ASC, p.id ASC
           ),
           '[]'::jsonb
         )
    INTO v_plans
    FROM public.activity_plans AS p
   WHERE p.activity_id = p_activity_id
     AND p.status = 'active';

  v_has_active_plan := pg_catalog.jsonb_array_length(v_plans) > 0;

  -- D3/D4：問卷沿用現有形狀，依 sort_order 帶回；空集合為 '[]'::jsonb。
  SELECT COALESCE(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'question_key', q.question_key,
               'label', q.label,
               'type', q.type,
               'options', q.options,
               'required', q.required,
               'sort_order', q.sort_order
             )
             ORDER BY q.sort_order ASC, q.id ASC
           ),
           '[]'::jsonb
         )
    INTO v_questions
    FROM public.activity_intake_questions AS q
   WHERE q.activity_id = p_activity_id;

  -- 沒有任何上架方案 → 沿用現行單一空白佔位方案，新服務體驗不變。
  IF NOT v_has_active_plan THEN
    v_plans := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('name', '', 'booking_type', 'scheduled'));
  END IF;

  SELECT * INTO v_draft FROM public.guide_service_drafts
   WHERE activity_id = p_activity_id AND status = 'active' FOR UPDATE;
  IF FOUND THEN
    -- D5：舊版 ensure 可能留下「只有空白佔位方案」的草稿。四條件全部成立才做一次性修復。
    v_draft_plans := COALESCE(v_draft.payload->'plans', '[]'::jsonb);
    v_draft_plans_blank := pg_catalog.jsonb_typeof(v_draft_plans) IS DISTINCT FROM 'array'
      OR pg_catalog.jsonb_array_length(v_draft_plans) = 0
      OR (
        pg_catalog.jsonb_array_length(v_draft_plans) = 1
        AND pg_catalog.btrim(COALESCE(v_draft_plans->0->>'name', '')) = ''
      );

    v_should_repair := v_draft.materialization_origin = 'native'
      AND v_draft.revision = 1
      AND v_draft_plans_blank
      AND v_has_active_plan;

    IF v_should_repair THEN
      -- 只覆寫 plans / questions；名稱與說明維持草稿現值，revision 不動（不視為嚮導編輯）。
      v_payload := COALESCE(v_draft.payload, '{}'::jsonb)
        || pg_catalog.jsonb_build_object('plans', v_plans, 'questions', v_questions);

      UPDATE public.guide_service_drafts
         SET payload = v_payload,
             updated_at = pg_catalog.now()
       WHERE id = v_draft.id;

      RETURN pg_catalog.jsonb_build_object(
        'code', 'REUSED_REPAIRED',
        'activityId', p_activity_id, 'draftId', v_draft.id, 'revision', v_draft.revision
      );
    END IF;

    RETURN pg_catalog.jsonb_build_object('code', 'REUSED', 'activityId', p_activity_id, 'draftId', v_draft.id, 'revision', v_draft.revision);
  END IF;

  v_name := pg_catalog.btrim(v_activity.title);
  IF v_name = '' THEN
    RETURN pg_catalog.jsonb_build_object('code', 'NATIVE_DRAFT_SOURCE_INVALID');
  END IF;
  v_description := COALESCE(v_activity.description, '');
  v_payload := pg_catalog.jsonb_build_object(
    'name', v_name,
    'description', v_description,
    'descriptions', pg_catalog.jsonb_build_array(v_description),
    'plans', v_plans,
    'questions', v_questions
  );

  INSERT INTO public.guide_service_drafts (activity_id, guide_id, revision, status, payload, materialization_origin, materialization_review_state)
  VALUES (p_activity_id, p_guide_id, 1, 'active', v_payload, 'native', NULL)
  ON CONFLICT (activity_id) WHERE status = 'active' DO NOTHING
  RETURNING id INTO v_inserted_draft_id;

  SELECT * INTO v_draft FROM public.guide_service_drafts
   WHERE activity_id = p_activity_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_NATIVE_DRAFT_NOT_FOUND'; END IF;
  RETURN pg_catalog.jsonb_build_object(
    'code', CASE WHEN v_inserted_draft_id IS NULL THEN 'REUSED' ELSE 'CREATED' END,
    'activityId', p_activity_id, 'draftId', v_draft.id, 'revision', v_draft.revision
  );
END;
$ensure$;

REVOKE ALL ON FUNCTION public.midao_ensure_native_service_draft(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.midao_ensure_native_service_draft(uuid, uuid)
  TO service_role;
