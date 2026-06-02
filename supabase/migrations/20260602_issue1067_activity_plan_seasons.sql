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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_plan_seasons'
      AND policyname = 'Activity plan seasons read for authenticated'
  ) THEN
    CREATE POLICY "Activity plan seasons read for authenticated"
      ON public.activity_plan_seasons
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_plan_seasons'
      AND policyname = 'Activity plan seasons mutate for service role'
  ) THEN
    CREATE POLICY "Activity plan seasons mutate for service role"
      ON public.activity_plan_seasons
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
