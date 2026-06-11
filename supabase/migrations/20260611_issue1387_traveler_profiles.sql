-- Issue #1387 — 旅客 profile（最小版）：顯示名稱、聯絡電話、行銷通知偏好。
-- email 由 Supabase auth 管理，不入此表。Safety: idempotent DDL。

CREATE TABLE IF NOT EXISTS public.traveler_profiles (
  user_id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name            text NOT NULL DEFAULT '',
  phone                   text NOT NULL DEFAULT '',
  marketing_email_opt_in  boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.traveler_profiles ENABLE ROW LEVEL SECURITY;

-- 本人可讀寫自己的 profile；service_role 全權（後台/伺服器用途）
DROP POLICY IF EXISTS traveler_profiles_select_own ON public.traveler_profiles;
CREATE POLICY traveler_profiles_select_own ON public.traveler_profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS traveler_profiles_upsert_own ON public.traveler_profiles;
CREATE POLICY traveler_profiles_upsert_own ON public.traveler_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS traveler_profiles_update_own ON public.traveler_profiles;
CREATE POLICY traveler_profiles_update_own ON public.traveler_profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS traveler_profiles_service_all ON public.traveler_profiles;
CREATE POLICY traveler_profiles_service_all ON public.traveler_profiles
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
