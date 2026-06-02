-- GH-1067 follow-up: allow anonymous availability reads of season gates for public booking flows
create policy if not exists "Activity plan seasons read for anonymous"
  on public.activity_plan_seasons
  for select
  to anon
  using (is_active);
