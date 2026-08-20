-- #1859 Task A rollback companion — 還原 public.midao_ensure_native_service_draft
-- 至 20260819002727_issue1825_native_service_draft_ensure.sql 的完整定義（含權限語句）。
--
-- 本檔只以 CREATE OR REPLACE 覆寫該函式；該函式唯一寫入目標是 public.guide_service_drafts，
-- 因此回滾不影響 activities / activity_plans / 問卷資料 / 訂單資料，也不需要資料補償。
-- 回滾後 ensure 行為回到「硬寫單一空白佔位方案」，僅回傳 CREATED / REUSED /
-- ACTIVITY_NOT_FOUND_OR_OWNERSHIP_MISMATCH / NATIVE_DRAFT_SOURCE_INVALID。
-- 注意（#1855）：COALESCE / CASE 為 SQL 語法特殊形式，不得加 pg_catalog. 前綴。

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
  v_payload jsonb;
  v_inserted_draft_id uuid;
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

  SELECT * INTO v_draft FROM public.guide_service_drafts
   WHERE activity_id = p_activity_id AND status = 'active' FOR UPDATE;
  IF FOUND THEN
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
    'plans', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('name', '', 'booking_type', 'scheduled')),
    'questions', '[]'::jsonb
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
