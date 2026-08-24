-- Issue #1861 P2-C: one-time request claims and request-to-inquiry bridge.
-- Additive only. This migration is for disposable local verification; never apply
-- to Production without the separately approved rollout gate.

CREATE TABLE public.midao_request_claims (
  source_request_id uuid PRIMARY KEY REFERENCES public.midao_requests(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  claimed_at timestamptz,
  claimed_by_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT midao_request_claims_expiry_check CHECK (expires_at > issued_at),
  CONSTRAINT midao_request_claims_claimant_time_check CHECK (
    (claimed_by_user_id IS NULL AND claimed_at IS NULL)
    OR (claimed_by_user_id IS NOT NULL AND claimed_at IS NOT NULL)
  )
);

CREATE TABLE public.midao_request_inquiry_mappings (
  source_request_id uuid NOT NULL UNIQUE REFERENCES public.midao_requests(id) ON DELETE RESTRICT,
  guide_inquiry_id uuid NOT NULL UNIQUE REFERENCES public.guide_inquiries(id) ON DELETE RESTRICT,
  claimed_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (source_request_id)
);

ALTER TABLE public.midao_request_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midao_request_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE public.midao_request_inquiry_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midao_request_inquiry_mappings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.midao_request_claims, public.midao_request_inquiry_mappings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.midao_request_claims, public.midao_request_inquiry_mappings TO service_role;

CREATE OR REPLACE FUNCTION public.midao_issue_request_with_claim(
  p_request_no text,
  p_guide_id uuid,
  p_activity_id uuid,
  p_activity_title text,
  p_traveler_name text,
  p_traveler_line_id text,
  p_traveler_email text,
  p_preferred_date date,
  p_backup_date date,
  p_preferred_period text,
  p_start_time time,
  p_end_time time,
  p_participants_count integer,
  p_participants_note text,
  p_language text,
  p_need_pickup boolean,
  p_special_note text,
  p_answers jsonb,
  p_claim_token_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $midao$
DECLARE
  v_request public.midao_requests%ROWTYPE;
  v_token_hash text := pg_catalog.lower(pg_catalog.btrim(p_claim_token_hash));
  v_request_no text := pg_catalog.btrim(p_request_no);
  v_now timestamptz := pg_catalog.now();
BEGIN
  IF v_request_no IS NULL OR pg_catalog.octet_length(v_request_no) > 128
    OR p_guide_id IS NULL OR p_traveler_name IS NULL OR p_preferred_date IS NULL
    OR p_participants_count IS NULL OR p_participants_count < 1
    OR v_token_hash IS NULL OR v_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MIDAO_REQUEST_CLAIM_INPUT_INVALID';
  END IF;

  INSERT INTO public.midao_requests (
    request_no, guide_id, activity_id, activity_title_snapshot, traveler_name,
    traveler_line_id, traveler_email, preferred_date, backup_date, preferred_period,
    start_time, end_time, participants_count, participants_note, language, need_pickup,
    special_note, answers, status, source, created_at, updated_at, status_changed_at
  ) VALUES (
    v_request_no, p_guide_id, p_activity_id, p_activity_title, p_traveler_name,
    NULLIF(pg_catalog.btrim(p_traveler_line_id), ''), NULLIF(pg_catalog.btrim(p_traveler_email), ''),
    p_preferred_date, p_backup_date, p_preferred_period, p_start_time, p_end_time,
    p_participants_count, NULLIF(pg_catalog.btrim(p_participants_note), ''),
    NULLIF(pg_catalog.btrim(p_language), ''), COALESCE(p_need_pickup, false),
    NULLIF(pg_catalog.btrim(p_special_note), ''), COALESCE(p_answers, '[]'::jsonb),
    'new', 'public_page', v_now, v_now, v_now
  ) RETURNING * INTO v_request;

  INSERT INTO public.midao_request_claims (source_request_id, token_hash, issued_at, expires_at)
  VALUES (v_request.id, v_token_hash, v_now, v_now + INTERVAL '24 hours');

  RETURN pg_catalog.jsonb_build_object('request_id', v_request.id, 'request_no', v_request.request_no);
END;
$midao$;

CREATE OR REPLACE FUNCTION public.midao_bridge_request_claim(
  p_claim_token_hash text,
  p_traveler_user_id uuid,
  p_idempotency_key text,
  p_request_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $midao$
DECLARE
  v_token_hash text := pg_catalog.lower(pg_catalog.btrim(p_claim_token_hash));
  v_request_hash text := pg_catalog.lower(pg_catalog.btrim(p_request_hash));
  v_idempotency_key text := pg_catalog.btrim(p_idempotency_key);
  v_source_id uuid;
  v_idempotency_id uuid;
  v_claimed_idempotency boolean := false;
  v_idempotency_state text;
  v_stored_hash text;
  v_replay jsonb;
  v_claim public.midao_request_claims%ROWTYPE;
  v_request public.midao_requests%ROWTYPE;
  v_mapping public.midao_request_inquiry_mappings%ROWTYPE;
  v_inquiry_id uuid;
  v_inquiry_no text;
  v_now timestamptz := pg_catalog.now();
BEGIN
  IF p_traveler_user_id IS NULL OR v_token_hash IS NULL OR v_token_hash !~ '^[0-9a-f]{64}$'
    OR v_request_hash IS NULL OR v_request_hash !~ '^[0-9a-f]{64}$'
    OR v_idempotency_key IS NULL OR v_idempotency_key = '' OR pg_catalog.octet_length(v_idempotency_key) > 128 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT source_request_id INTO v_source_id
  FROM public.midao_request_claims
  WHERE token_hash = v_token_hash;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unavailable');
  END IF;

  INSERT INTO public.midao_idempotency_records (
    actor_type, actor_id, command_name, scope_type, scope_id, idempotency_key,
    request_hash, state, expires_at
  ) VALUES (
    'traveler', p_traveler_user_id::text, 'bridge_request_claim', 'midao_request', v_source_id,
    v_idempotency_key, v_request_hash, 'processing', v_now + INTERVAL '1 day'
  ) ON CONFLICT (scope_type, scope_id, command_name, idempotency_key) DO NOTHING
  RETURNING id INTO v_idempotency_id;
  v_claimed_idempotency := FOUND;

  IF NOT v_claimed_idempotency THEN
    SELECT id, state, request_hash, response_body INTO v_idempotency_id, v_idempotency_state, v_stored_hash, v_replay
    FROM public.midao_idempotency_records
    WHERE scope_type = 'midao_request' AND scope_id = v_source_id
      AND command_name = 'bridge_request_claim' AND idempotency_key = v_idempotency_key
    FOR UPDATE;
    IF NOT FOUND OR v_stored_hash IS DISTINCT FROM v_request_hash
      OR v_idempotency_state <> 'completed' OR v_replay IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('status', 'unavailable');
    END IF;
  END IF;

  SELECT * INTO v_claim FROM public.midao_request_claims
  WHERE source_request_id = v_source_id FOR UPDATE;
  SELECT * INTO v_request FROM public.midao_requests
  WHERE id = v_source_id FOR UPDATE;
  IF NOT FOUND OR v_claim.revoked_at IS NOT NULL OR v_claim.expires_at <= v_now THEN
    IF v_claimed_idempotency THEN
      DELETE FROM public.midao_idempotency_records
      WHERE id = v_idempotency_id AND state = 'processing';
    END IF;
    RETURN pg_catalog.jsonb_build_object('status', 'unavailable');
  END IF;

  IF v_claim.claimed_by_user_id IS NULL THEN
    UPDATE public.midao_request_claims
    SET claimed_by_user_id = p_traveler_user_id, claimed_at = v_now
    WHERE source_request_id = v_source_id AND claimed_by_user_id IS NULL;
  ELSIF v_claim.claimed_by_user_id IS DISTINCT FROM p_traveler_user_id THEN
    IF v_claimed_idempotency THEN
      DELETE FROM public.midao_idempotency_records
      WHERE id = v_idempotency_id AND state = 'processing';
    END IF;
    RETURN pg_catalog.jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT * INTO v_mapping FROM public.midao_request_inquiry_mappings
  WHERE source_request_id = v_source_id FOR UPDATE;
  IF FOUND THEN
    IF v_mapping.claimed_by_user_id IS DISTINCT FROM p_traveler_user_id THEN
      IF v_claimed_idempotency THEN
        DELETE FROM public.midao_idempotency_records
        WHERE id = v_idempotency_id AND state = 'processing';
      END IF;
      RETURN pg_catalog.jsonb_build_object('status', 'unavailable');
    END IF;
    v_replay := pg_catalog.jsonb_build_object('status', 'ok', 'inquiry_id', v_mapping.guide_inquiry_id, 'created', false);
    UPDATE public.midao_idempotency_records
    SET state = 'completed', response_status = 200, response_body = v_replay,
      resource_type = 'guide_inquiry', resource_id = v_mapping.guide_inquiry_id::text,
      locked_at = v_now, completed_at = v_now
    WHERE id = v_idempotency_id AND state = 'processing';
    RETURN v_replay;
  END IF;

  IF v_request.activity_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_traveler_user_id) THEN
    IF v_claimed_idempotency THEN
      DELETE FROM public.midao_idempotency_records
      WHERE id = v_idempotency_id AND state = 'processing';
    END IF;
    RETURN pg_catalog.jsonb_build_object('status', 'unavailable');
  END IF;

  v_inquiry_no := 'INQ-' || v_request.request_no;
  INSERT INTO public.guide_inquiries (
    inquiry_no, traveler_user_id, guide_id, activity_id, activity_plan_id, status,
    preferred_date, backup_date, start_time_local, party_size, language, pickup_required,
    traveler_note, questionnaire_snapshot, answers, created_at, updated_at
  ) VALUES (
    v_inquiry_no, p_traveler_user_id, v_request.guide_id, v_request.activity_id, NULL, 'new',
    v_request.preferred_date, v_request.backup_date, v_request.start_time, v_request.participants_count,
    v_request.language, v_request.need_pickup, v_request.special_note,
    pg_catalog.jsonb_build_object('source', 'midao_request'),
    pg_catalog.jsonb_build_object('request_answers', v_request.answers), v_now, v_now
  ) RETURNING id INTO v_inquiry_id;

  INSERT INTO public.midao_request_inquiry_mappings (
    source_request_id, guide_inquiry_id, claimed_by_user_id, payload_hash
  ) VALUES (v_source_id, v_inquiry_id, p_traveler_user_id, v_request_hash);

  INSERT INTO public.midao_audit_events (
    actor_type, actor_id, guide_id, action, resource_type, resource_id, request_id, metadata, created_at
  ) VALUES (
    'traveler', p_traveler_user_id::text, v_request.guide_id, 'midao_request_claim_bridged',
    'guide_inquiry', v_inquiry_id::text, v_idempotency_id,
    pg_catalog.jsonb_build_object('source', 'midao_request'), v_now
  );

  v_replay := pg_catalog.jsonb_build_object('status', 'ok', 'inquiry_id', v_inquiry_id, 'created', true);
  UPDATE public.midao_idempotency_records
  SET state = 'completed', response_status = 201, response_body = v_replay,
    resource_type = 'guide_inquiry', resource_id = v_inquiry_id::text,
    locked_at = v_now, completed_at = v_now
  WHERE id = v_idempotency_id AND state = 'processing';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
  END IF;
  RETURN v_replay;
END;
$midao$;

REVOKE ALL ON FUNCTION public.midao_issue_request_with_claim(text, uuid, uuid, text, text, text, text, date, date, text, time, time, integer, text, text, boolean, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.midao_bridge_request_claim(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.midao_issue_request_with_claim(text, uuid, uuid, text, text, text, text, date, date, text, time, time, integer, text, text, boolean, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.midao_bridge_request_claim(text, uuid, text, text) TO service_role;
