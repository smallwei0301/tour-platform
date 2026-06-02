-- GH-1067 first slice: canonical activity plan season gate source of truth

create table if not exists public.activity_plan_seasons (
  id uuid primary key default gen_random_uuid(),
  activity_plan_id uuid not null references public.activity_plans(id) on delete cascade,
  start_month int not null check (start_month between 1 and 12),
  start_day int not null check (start_day between 1 and 31),
  end_month int not null check (end_month between 1 and 12),
  end_day int not null check (end_day between 1 and 31),
  timezone text not null default 'Asia/Taipei',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_activity_plan_seasons_plan_id
  on public.activity_plan_seasons(activity_plan_id);

create index if not exists idx_activity_plan_seasons_plan_active
  on public.activity_plan_seasons(activity_plan_id, is_active);

alter table public.activity_plan_seasons enable row level security;

create policy if not exists "Activity plan seasons read for authenticated"
  on public.activity_plan_seasons
  for select
  to authenticated
  using (true);

create policy if not exists "Activity plan seasons mutate for service role"
  on public.activity_plan_seasons
  for all
  to service_role
  using (true)
  with check (true);
