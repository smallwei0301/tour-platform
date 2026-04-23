-- Issue #169
-- Integrity regression pack (schema-truth aligned, rerunnable, evidence-producing)
--
-- Canonical assumptions:
-- 1) bookings.order_id is the booking->order core relation.
-- 2) payments.order_id must be validated.
-- 3) payments.booking_id may be absent; never assume it exists.

\set ON_ERROR_STOP on
\timing on

set lock_timeout = '5s';
set statement_timeout = '120s';
set idle_in_transaction_session_timeout = '120s';
set search_path = public;

begin;
set transaction read only;

select
  now() as executed_at,
  current_database() as db_name,
  current_user as db_user,
  current_setting('server_version') as pg_version;

with presence as (
  select
    to_regclass('public.orders') is not null as has_orders,
    to_regclass('public.bookings') is not null as has_bookings,
    to_regclass('public.payments') is not null as has_payments,
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='bookings' and column_name='order_id'
    ) as has_bookings_order_id,
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='payments' and column_name='order_id'
    ) as has_payments_order_id,
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='payments' and column_name='booking_id'
    ) as has_payments_booking_id
)
select * from presence;

create temp table if not exists issue_169_metrics (
  metric text primary key,
  value_text text,
  notes text
) on commit drop;

truncate table issue_169_metrics;

do $$
declare
  has_orders boolean;
  has_bookings boolean;
  has_payments boolean;
  has_bookings_order_id boolean;
  has_payments_order_id boolean;
  has_payments_booking_id boolean;
begin
  select
    to_regclass('public.orders') is not null,
    to_regclass('public.bookings') is not null,
    to_regclass('public.payments') is not null,
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='bookings' and column_name='order_id'
    ),
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='payments' and column_name='order_id'
    ),
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='payments' and column_name='booking_id'
    )
  into
    has_orders,
    has_bookings,
    has_payments,
    has_bookings_order_id,
    has_payments_order_id,
    has_payments_booking_id;

  if has_bookings then
    execute 'insert into issue_169_metrics(metric, value_text, notes)
             select ''total_bookings'', count(*)::text, null from public.bookings';
  else
    insert into issue_169_metrics values ('total_bookings', null, 'SKIPPED: public.bookings missing');
  end if;

  if has_bookings and has_bookings_order_id then
    execute 'insert into issue_169_metrics(metric, value_text, notes)
             select ''bookings_order_id_null_count'',
                    count(*) filter (where order_id is null)::text,
                    null
             from public.bookings';
  else
    insert into issue_169_metrics values ('bookings_order_id_null_count', null, 'SKIPPED: bookings.order_id missing');
  end if;

  if has_bookings and has_orders and has_bookings_order_id then
    execute 'insert into issue_169_metrics(metric, value_text, notes)
             select ''bookings_order_id_orphan_count'',
                    count(*)::text,
                    null
             from public.bookings b
             left join public.orders o on o.id = b.order_id
             where b.order_id is not null and o.id is null';
  else
    insert into issue_169_metrics values ('bookings_order_id_orphan_count', null, 'SKIPPED: required table/column missing');
  end if;

  if has_payments then
    execute 'insert into issue_169_metrics(metric, value_text, notes)
             select ''total_payments'', count(*)::text, null from public.payments';
  else
    insert into issue_169_metrics values ('total_payments', null, 'SKIPPED: public.payments missing');
  end if;

  if has_payments and has_payments_order_id then
    execute 'insert into issue_169_metrics(metric, value_text, notes)
             select ''payments_order_id_null_count'',
                    count(*) filter (where order_id is null)::text,
                    null
             from public.payments';
  else
    insert into issue_169_metrics values ('payments_order_id_null_count', null, 'SKIPPED: payments.order_id missing');
  end if;

  if has_payments and has_orders and has_payments_order_id then
    execute 'insert into issue_169_metrics(metric, value_text, notes)
             select ''payments_order_id_orphan_count'',
                    count(*)::text,
                    null
             from public.payments p
             left join public.orders o on o.id = p.order_id
             where p.order_id is not null and o.id is null';
  else
    insert into issue_169_metrics values ('payments_order_id_orphan_count', null, 'SKIPPED: required table/column missing');
  end if;

  if has_payments and has_bookings and has_payments_order_id and has_bookings_order_id then
    execute 'insert into issue_169_metrics(metric, value_text, notes)
             select ''payments_order_to_booking_mismatch_count'',
                    count(*)::text,
                    null
             from public.payments p
             left join public.bookings b on b.order_id = p.order_id
             where p.order_id is not null and b.id is null';
  else
    insert into issue_169_metrics values ('payments_order_to_booking_mismatch_count', null, 'SKIPPED: required table/column missing');
  end if;

  if has_bookings and has_bookings_order_id then
    execute 'insert into issue_169_metrics(metric, value_text, notes)
             select ''recent_24h_bookings_missing_order_id'',
                    count(*)::text,
                    ''write-path verification''
             from public.bookings
             where created_at >= now() - interval ''24 hours''
               and order_id is null';
  else
    insert into issue_169_metrics values ('recent_24h_bookings_missing_order_id', null, 'SKIPPED: bookings.order_id missing');
  end if;

  if has_payments and has_payments_order_id then
    execute 'insert into issue_169_metrics(metric, value_text, notes)
             select ''recent_24h_payments_missing_order_id'',
                    count(*)::text,
                    ''write-path verification''
             from public.payments
             where created_at >= now() - interval ''24 hours''
               and order_id is null';
  else
    insert into issue_169_metrics values ('recent_24h_payments_missing_order_id', null, 'SKIPPED: payments.order_id missing');
  end if;

  insert into issue_169_metrics(metric, value_text, notes)
  values ('payments_booking_id_column_present', has_payments_booking_id::text, 'schema truth snapshot');
end
$$;

select metric, value_text, notes
from issue_169_metrics
order by metric;

-- sample rows for evidence attachment
create temp table if not exists issue_169_booking_orphan_sample (
  booking_id text,
  order_id text,
  created_at timestamptz,
  updated_at timestamptz
) on commit drop;

create temp table if not exists issue_169_payment_order_orphan_sample (
  payment_id text,
  order_id text,
  created_at timestamptz,
  updated_at timestamptz
) on commit drop;

create temp table if not exists issue_169_payment_order_without_booking_sample (
  payment_id text,
  order_id text,
  created_at timestamptz,
  updated_at timestamptz
) on commit drop;

truncate table issue_169_booking_orphan_sample;
truncate table issue_169_payment_order_orphan_sample;
truncate table issue_169_payment_order_without_booking_sample;

do $$
declare
  has_orders boolean;
  has_bookings boolean;
  has_payments boolean;
  has_bookings_order_id boolean;
  has_payments_order_id boolean;
begin
  select
    to_regclass('public.orders') is not null,
    to_regclass('public.bookings') is not null,
    to_regclass('public.payments') is not null,
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='bookings' and column_name='order_id'
    ),
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='payments' and column_name='order_id'
    )
  into
    has_orders,
    has_bookings,
    has_payments,
    has_bookings_order_id,
    has_payments_order_id;

  if has_bookings and has_orders and has_bookings_order_id then
    execute $q$
      insert into issue_169_booking_orphan_sample (booking_id, order_id, created_at, updated_at)
      select b.id::text, b.order_id::text, b.created_at, b.updated_at
      from public.bookings b
      left join public.orders o on o.id = b.order_id
      where b.order_id is not null and o.id is null
      order by b.updated_at desc nulls last
      limit 50
    $q$;
  end if;

  if has_payments and has_orders and has_payments_order_id then
    execute $q$
      insert into issue_169_payment_order_orphan_sample (payment_id, order_id, created_at, updated_at)
      select p.id::text, p.order_id::text, p.created_at, p.updated_at
      from public.payments p
      left join public.orders o on o.id = p.order_id
      where p.order_id is not null and o.id is null
      order by p.updated_at desc nulls last
      limit 50
    $q$;
  end if;

  if has_payments and has_bookings and has_payments_order_id and has_bookings_order_id then
    execute $q$
      insert into issue_169_payment_order_without_booking_sample (payment_id, order_id, created_at, updated_at)
      select p.id::text, p.order_id::text, p.created_at, p.updated_at
      from public.payments p
      left join public.bookings b on b.order_id = p.order_id
      where p.order_id is not null and b.id is null
      order by p.updated_at desc nulls last
      limit 50
    $q$;
  end if;
end
$$;

select * from issue_169_booking_orphan_sample;
select * from issue_169_payment_order_orphan_sample;
select * from issue_169_payment_order_without_booking_sample;

rollback;
