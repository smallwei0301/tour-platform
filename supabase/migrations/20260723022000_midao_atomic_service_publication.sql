-- #1758 S6 · Task 27 — atomic 「一鍵發布服務」 command.
--
-- 目的（白話）：把「發布服務草稿」變成資料庫裡的單一原子操作。整支函式在呼叫端的
-- statement transaction 內執行，要嘛全部成功、要嘛整包 rollback，不會把服務發布到一半
-- 就壞掉（例如 slug 衝突、FK 違反 → 全數退回，草稿與舊 canonical 資料維持不變）。
--
-- 沿用 midao_decide_booking_request / midao_switch_guide_backend_mode 的 atomic RPC 慣例：
--   * SECURITY DEFINER + 固定 search_path = pg_catalog，所有物件 schema-qualify。
--   * 只增不改：本檔為新的時間戳 migration，不動 S1–S5 與既有 Package 2 migration。
--   * 權限：REVOKE FROM PUBLIC/anon/authenticated，只 GRANT EXECUTE TO service_role。
--
-- 交易流程（單一 transaction）：
--   1. FOR UPDATE 鎖定 activity；不存在 → 例外（ACTIVITY_NOT_FOUND）。
--   2. FOR UPDATE 鎖定該 activity 的 active guide_service_drafts row。
--      找不到 active 草稿時分兩種語意：
--        - 已有發布版本紀錄（前一次成功發布已刪草稿）→ idempotent no-op 成功，不重寫。
--        - 從未有過發布版本 → DRAFT_NOT_FOUND（呼叫端映射 404）。
--   3. 擁有權比對（guide_id）：不符 → 回結構化 OWNERSHIP_MISMATCH（不 raise，呼叫端 403）。
--   4. 版本比對（expected_revision，CAS）：不符 → 回 REVISION_CONFLICT + currentRevision
--      （不 raise，呼叫端 409 讓前端重讀）。
--   5. Upsert canonical activities（依草稿內容，status='published'）。
--   6. 非破壞式重建 activity_plans：先整批 deactivate，再依草稿 plans upsert（ON CONFLICT
--      (activity_id, slug) DO UPDATE）；不 DELETE plans 以保全 orders/bookings 的 FK 歷史。
--   7. 重建 activity_intake_questions（DELETE 舊題 → 依草稿問卷重新 INSERT）。
--   8. 插入下一版 service_publication_versions（version = 前版+1，immutable 快照）。
--   9. 刪除該 active 草稿（發布完成即清除）。
--  10. 寫入 midao_notification_outbox（service.published 事件，沿用既有 outbox）。
--
-- 刻意不含 EXCEPTION handler 與 COMMIT/ROLLBACK/SAVEPOINT：任一步驟失敗即由呼叫端交易
-- 整體回滾，維持 all-or-nothing 語意，不留部分寫入。

CREATE OR REPLACE FUNCTION public.midao_publish_service_draft(
  p_activity_id uuid,
  p_expected_revision integer,
  p_guide_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $midao$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_activity public.activities%ROWTYPE;
  v_draft public.guide_service_drafts%ROWTYPE;
  v_payload jsonb;
  v_name text;
  v_description text;
  v_prev_version integer;
  v_next_version integer;
  v_snapshot jsonb;
  v_response jsonb;
BEGIN
  IF p_activity_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTIVITY_ID';
  END IF;
  IF p_guide_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_GUIDE_ID';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_EXPECTED_REVISION';
  END IF;

  -- 1. 鎖定 canonical activity（先鎖 activity，再鎖草稿，避免與其他寫入者交錯死鎖）。
  SELECT *
    INTO v_activity
    FROM public.activities
   WHERE id = p_activity_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ACTIVITY_NOT_FOUND';
  END IF;

  -- 2. 鎖定該 activity 的 active 草稿。
  SELECT *
    INTO v_draft
    FROM public.guide_service_drafts
   WHERE activity_id = p_activity_id AND status = 'active'
   FOR UPDATE;

  IF NOT FOUND THEN
    -- 沒有 active 草稿：用是否已有發布版本區分 idempotent 重放 vs 從未發布。
    SELECT COALESCE(max(version), 0)
      INTO v_prev_version
      FROM public.service_publication_versions
     WHERE activity_id = p_activity_id;

    IF v_prev_version >= 1 THEN
      -- 前一次成功發布已刪除草稿 → 視為 idempotent no-op 成功，不重複寫入。
      RETURN pg_catalog.jsonb_build_object(
        'published', true,
        'idempotent', true,
        'code', 'IDEMPOTENT_NO_OP',
        'activityId', p_activity_id,
        'version', v_prev_version
      );
    END IF;

    -- 從未有過草稿可發布。
    RETURN pg_catalog.jsonb_build_object(
      'published', false,
      'idempotent', false,
      'code', 'DRAFT_NOT_FOUND',
      'activityId', p_activity_id
    );
  END IF;

  -- 3. 擁有權比對（不 raise，回結構化訊號讓呼叫端映射 403）。
  IF v_draft.guide_id IS DISTINCT FROM p_guide_id THEN
    RETURN pg_catalog.jsonb_build_object(
      'published', false,
      'idempotent', false,
      'code', 'OWNERSHIP_MISMATCH',
      'activityId', p_activity_id
    );
  END IF;

  -- 4. 版本 CAS 比對（不 raise，回目前版本讓呼叫端 409 重讀）。
  IF v_draft.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN pg_catalog.jsonb_build_object(
      'published', false,
      'idempotent', false,
      'code', 'REVISION_CONFLICT',
      'activityId', p_activity_id,
      'currentRevision', v_draft.revision
    );
  END IF;

  v_payload := COALESCE(v_draft.payload, '{}'::jsonb);

  -- 說明文字：優先 description 字串，否則彙整 descriptions[] 非空段落。
  v_name := pg_catalog.nullif(pg_catalog.btrim(v_payload->>'name'), '');
  v_description := pg_catalog.nullif(pg_catalog.btrim(v_payload->>'description'), '');
  IF v_description IS NULL THEN
    SELECT pg_catalog.string_agg(pg_catalog.btrim(elem), E'\n\n')
      INTO v_description
      FROM pg_catalog.jsonb_array_elements_text(COALESCE(v_payload->'descriptions', '[]'::jsonb)) AS elem
     WHERE pg_catalog.btrim(elem) <> '';
  END IF;

  -- 5. Upsert canonical activities（缺欄位保留既有值，避免草稿未帶欄位就抹掉正式資料）。
  UPDATE public.activities
     SET title = COALESCE(v_name, title),
         description = COALESCE(v_description, description),
         inquiry_enabled = COALESCE((v_payload->>'inquiry_enabled')::boolean, inquiry_enabled),
         status = 'published',
         published_at = COALESCE(published_at, v_now),
         updated_at = v_now
   WHERE id = p_activity_id;

  -- 6. 非破壞式重建 activity_plans：先全數 deactivate，再依草稿 plans upsert。
  UPDATE public.activity_plans
     SET status = 'inactive',
         updated_at = v_now
   WHERE activity_id = p_activity_id;

  INSERT INTO public.activity_plans (
    activity_id,
    name,
    slug,
    duration_minutes,
    price_type,
    base_price,
    min_participants,
    max_participants,
    booking_type,
    status,
    updated_at
  )
  SELECT
    p_activity_id,
    COALESCE(pg_catalog.nullif(pg_catalog.btrim(plan.elem->>'name'), ''), 'Plan ' || plan.ord::text),
    COALESCE(
      pg_catalog.nullif(pg_catalog.btrim(plan.elem->>'slug'), ''),
      'plan-' || pg_catalog.md5(COALESCE(plan.elem->>'name', '') || '-' || plan.ord::text)
    ),
    COALESCE((plan.elem->>'duration_minutes')::integer, 60),
    COALESCE(pg_catalog.nullif(pg_catalog.btrim(plan.elem->>'price_type'), ''), 'per_person'),
    COALESCE((plan.elem->>'base_price')::integer, 0),
    COALESCE((plan.elem->>'min_participants')::integer, 1),
    COALESCE((plan.elem->>'max_participants')::integer, 10),
    COALESCE(pg_catalog.nullif(pg_catalog.btrim(plan.elem->>'booking_type'), ''), 'instant'),
    'active',
    v_now
  FROM pg_catalog.jsonb_array_elements(COALESCE(v_payload->'plans', '[]'::jsonb))
    WITH ORDINALITY AS plan(elem, ord)
  ON CONFLICT (activity_id, slug) DO UPDATE
    SET name = EXCLUDED.name,
        duration_minutes = EXCLUDED.duration_minutes,
        price_type = EXCLUDED.price_type,
        base_price = EXCLUDED.base_price,
        min_participants = EXCLUDED.min_participants,
        max_participants = EXCLUDED.max_participants,
        booking_type = EXCLUDED.booking_type,
        status = 'active',
        updated_at = EXCLUDED.updated_at;

  -- 7. 重建 activity_intake_questions（先刪舊題，再依草稿問卷重新 INSERT）。
  DELETE FROM public.activity_intake_questions
   WHERE activity_id = p_activity_id;

  INSERT INTO public.activity_intake_questions (
    activity_id,
    question_key,
    label,
    type,
    options,
    required,
    sort_order
  )
  SELECT
    p_activity_id,
    q.elem->>'question_key',
    COALESCE(pg_catalog.nullif(pg_catalog.btrim(q.elem->>'label'), ''), q.elem->>'question_key'),
    q.elem->>'type',
    COALESCE(q.elem->'options', '[]'::jsonb),
    COALESCE((q.elem->>'required')::boolean, false),
    COALESCE((q.elem->>'sort_order')::integer, (q.ord - 1)::integer)
  FROM pg_catalog.jsonb_array_elements(COALESCE(v_payload->'questions', '[]'::jsonb))
    WITH ORDINALITY AS q(elem, ord);

  -- 8. 插入下一版 immutable 快照（version = 前版 + 1）。
  SELECT COALESCE(max(version), 0)
    INTO v_prev_version
    FROM public.service_publication_versions
   WHERE activity_id = p_activity_id;
  v_next_version := v_prev_version + 1;

  v_snapshot := pg_catalog.jsonb_build_object(
    'activityId', p_activity_id,
    'version', v_next_version,
    'guideId', p_guide_id,
    'draftRevision', v_draft.revision,
    'publishedAt', v_now,
    'payload', v_payload
  );

  INSERT INTO public.service_publication_versions (
    activity_id,
    version,
    snapshot,
    published_by,
    published_at
  ) VALUES (
    p_activity_id,
    v_next_version,
    v_snapshot,
    p_guide_id,
    v_now
  );

  -- 9. 刪除已發布的 active 草稿。
  DELETE FROM public.guide_service_drafts
   WHERE id = v_draft.id AND status = 'active';

  IF NOT FOUND THEN
    -- 理論上不可能（同交易內已 FOR UPDATE 鎖住），保底防資料異常。
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_SERVICE_DRAFT_RELATION_INVALID';
  END IF;

  -- 10. 寫入 notification outbox（沿用既有 outbox；payload 僅放最小事件資料）。
  INSERT INTO public.midao_notification_outbox (
    event_name,
    aggregate_type,
    aggregate_id,
    payload
  ) VALUES (
    'service.published',
    'activity',
    p_activity_id::text,
    pg_catalog.jsonb_build_object(
      'activityId', p_activity_id,
      'guideId', p_guide_id,
      'version', v_next_version,
      'draftRevision', v_draft.revision,
      'publishedAt', v_now
    )
  );

  v_response := pg_catalog.jsonb_build_object(
    'published', true,
    'idempotent', false,
    'code', 'PUBLISHED',
    'activityId', p_activity_id,
    'version', v_next_version,
    'draftRevision', v_draft.revision,
    'status', 'published'
  );

  RETURN v_response;
END;
$midao$;

REVOKE ALL ON FUNCTION public.midao_publish_service_draft(uuid, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.midao_publish_service_draft(uuid, integer, uuid)
  TO service_role;
