-- Deterministic local-only Midao API real-auth fixture.
-- This file is consumed only by the full-service GoTrue lanes after capture +
-- expected-terminal verification and Task 9 materialization.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values (
  '88888888-8888-4888-8888-888888888888',
  'authenticated',
  'authenticated',
  'midao-e2e@example.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Midao E2E Guide","role":"guide"}'::jsonb
)
on conflict (id) do nothing;

insert into public.users (id, role)
values ('88888888-8888-4888-8888-888888888888', 'guide')
on conflict (id) do nothing;

insert into public.guide_profiles (
  id, user_id, slug, display_name, guide_email, guide_password_hash,
  verification_status, backend_mode, guide_session_version
)
values (
  '99999999-9999-4999-8999-999999999999',
  '88888888-8888-4888-8888-888888888888',
  'midao-e2e-guide',
  'Midao E2E Guide',
  'midao-e2e@example.invalid',
  'midao-e2e-local-salt-20260724:' || encode(
    digest('midao-e2e-local-salt-20260724' || 'midao-e2e-only-password', 'sha256'),
    'hex'
  ),
  'approved',
  'midao',
  1
)
on conflict (id) do update set
  slug = excluded.slug,
  display_name = excluded.display_name,
  guide_email = excluded.guide_email,
  guide_password_hash = excluded.guide_password_hash,
  verification_status = 'approved',
  backend_mode = 'midao',
  guide_session_version = 1;

-- Package 4 real-auth conversion fixture. This file executes only with full
-- GoTrue services, so GoTrue-only columns are intentionally direct SQL.
-- Note: pinned GoTrue v2.188.1's auth.users derives the read-only generated
-- confirmed_at column from email_confirmed_at/phone_confirmed_at
-- (GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED);
-- writes must target email_confirmed_at, never confirmed_at directly.
-- instance_id must be the zero UUID: GoTrue's FindUserByEmailAndAudience
-- filters "instance_id = uuid.Nil"; a NULL instance_id never matches, so the
-- password-grant lookup would 400 invalid_credentials even with a correct
-- password hash.
-- confirmation_token/recovery_token/email_change/email_change_token_new must
-- be '' not NULL: GoTrue's user row scanner errors with "500 Database error
-- querying schema" (converting NULL to string is unsupported) if any of
-- these token/change string columns are left NULL. This pinned GoTrue
-- version's users table carries additional string columns beyond the four
-- historically documented ones (email_change_token_current,
-- reauthentication_token, phone_change, phone_change_token), so all known
-- nullable text columns are set explicitly to avoid re-hitting the same
-- opaque 500 on a different column.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, reauthentication_token, phone, phone_change,
  phone_change_token,
  raw_app_meta_data, raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-000000000000',
  '55555555-5555-4555-8555-555555555555',
  'authenticated',
  'authenticated',
  'midao-e2e-traveler@example.invalid',
  crypt('midao-e2e-traveler-local-only', gen_salt('bf', 10)),
  now(),
  '', '', '', '',
  '', '', '', '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Midao E2E Traveler","role":"traveler"}'::jsonb
)
on conflict (id) do update set
  instance_id = excluded.instance_id,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  confirmation_token = excluded.confirmation_token,
  recovery_token = excluded.recovery_token,
  email_change = excluded.email_change,
  email_change_token_new = excluded.email_change_token_new,
  email_change_token_current = excluded.email_change_token_current,
  reauthentication_token = excluded.reauthentication_token,
  phone = excluded.phone,
  phone_change = excluded.phone_change,
  phone_change_token = excluded.phone_change_token,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data;

-- Since GoTrue's 2022 account-linking change, password login requires a
-- matching auth.identities row (provider='email'); auth.users alone is not
-- sufficient. provider_id is the user's own id cast to text for the email
-- provider, matching what supabase.auth.admin.createUser() writes.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
values (
  '55555555-5555-4555-8555-555555555555',
  '55555555-5555-4555-8555-555555555555',
  '55555555-5555-4555-8555-555555555555',
  jsonb_build_object(
    'sub', '55555555-5555-4555-8555-555555555555',
    'email', 'midao-e2e-traveler@example.invalid',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
)
on conflict (provider_id, provider) do update set
  identity_data = excluded.identity_data,
  last_sign_in_at = excluded.last_sign_in_at,
  updated_at = excluded.updated_at;

insert into public.users (id, role)
values ('55555555-5555-4555-8555-555555555555', 'traveler')
on conflict (id) do update set role = excluded.role;

insert into public.activities (
  id, guide_id, guide_slug, title, slug, price_twd, min_participants,
  max_participants, duration_minutes, status, midao_status, midao_deal_mode,
  inquiry_enabled
)
values (
  '66666666-6666-4666-8666-666666666666',
  '99999999-9999-4999-8999-999999999999',
  'midao-e2e-guide',
  'Midao E2E 詢問轉單行程',
  'midao-e2e-inquiry-conversion',
  3600, 1, 6, 240, 'published', 'published', 'confirm_first', true
)
on conflict (id) do update set
  guide_id = excluded.guide_id,
  guide_slug = excluded.guide_slug,
  status = 'published',
  midao_status = 'published',
  midao_deal_mode = 'confirm_first',
  inquiry_enabled = true;

insert into public.activity_plans (
  id, activity_id, name, slug, duration_minutes, price_type, base_price,
  min_participants, max_participants, booking_type, status, is_year_round
)
values (
  '88888888-8888-4888-8888-888888888888',
  '66666666-6666-4666-8666-666666666666',
  'E2E 詢問方案', 'midao-e2e-request', 240, 'per_person', 1800,
  1, 6, 'request', 'active', true
)
on conflict (id) do update set
  activity_id = excluded.activity_id,
  status = 'active',
  booking_type = 'request',
  is_year_round = true;

insert into public.service_publication_versions (
  activity_id, version, snapshot, published_by, published_at
)
values (
  '66666666-6666-4666-8666-666666666666',
  1,
  jsonb_build_object(
    'activityId', '66666666-6666-4666-8666-666666666666',
    'version', 1,
    'guideId', '99999999-9999-4999-8999-999999999999',
    'payload', jsonb_build_object(
      'questions', jsonb_build_array(jsonb_build_object(
        'question_key', 'experience_level', 'label', '旅遊經驗',
        'type', 'single_choice', 'options', jsonb_build_array('beginner', 'experienced'),
        'required', true
      ))
    )
  ),
  '99999999-9999-4999-8999-999999999999', now()
)
on conflict (activity_id, version) do update set
  snapshot = excluded.snapshot,
  published_by = excluded.published_by,
  published_at = excluded.published_at;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values (
  '77777777-7777-4777-8777-777777777777',
  'authenticated',
  'authenticated',
  'legacy-e2e@example.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Legacy E2E Guide","role":"guide"}'::jsonb
)
on conflict (id) do nothing;

insert into public.users (id, role)
values ('77777777-7777-4777-8777-777777777777', 'guide')
on conflict (id) do nothing;

insert into public.guide_profiles (
  id, user_id, slug, display_name, guide_email, guide_password_hash,
  verification_status, backend_mode, guide_session_version
)
values (
  '00000000-0000-4000-8000-000000000001',
  '77777777-7777-4777-8777-777777777777',
  'legacy-e2e-guide',
  'Legacy E2E Guide',
  'legacy-e2e@example.invalid',
  'legacy-e2e-local-salt-20260727:' || encode(
    digest('legacy-e2e-local-salt-20260727' || 'legacy-e2e-only-password', 'sha256'),
    'hex'
  ),
  'approved',
  'legacy',
  1
)
on conflict (id) do update set
  slug = excluded.slug,
  display_name = excluded.display_name,
  guide_email = excluded.guide_email,
  guide_password_hash = excluded.guide_password_hash,
  verification_status = 'approved',
  backend_mode = 'legacy',
  guide_session_version = 1;
