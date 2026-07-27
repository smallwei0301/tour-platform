-- Deterministic local-only Midao E2E guide fixture.
-- This file is consumed only after capture + expected-terminal verification and Task 9 materialization.
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
