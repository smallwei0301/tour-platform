-- Ensure admin orders query can read payment trade number without runtime 500.
-- Safe for repeated deploys across environments.

alter table public.orders
add column if not exists trade_no text;
