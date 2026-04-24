-- Issue #210
-- Booking/Cancel verification pack (bounded slice only)
-- Scope: booking status + cancellation consistency + order/payment alignment for cancelled bookings
-- Out of scope: callback mapping, payment-init, #178/#170/#197, PR #196, full #171 rewrite

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

create temp table if not exists issue_210_metrics (
  metric text primary key,
  value_text text,
  notes text
) on commit drop;

truncate table issue_210_metrics;

do $$
declare
  has_bookings boolean;
  has_orders boolean;
  has_payments boolean;
  has_cancelled_at boolean;
  has_order_id boolean;
  has_payment_order_id boolean;
begin
  select
    to_regclass('public.bookings') is not null,
    to_regclass('public.orders') is not null,
    to_regclass('public.payments') is not null,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'bookings' and column_name = 'cancelled_at'
    ),
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'bookings' and column_name = 'order_id'
    ),
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'payments' and column_name = 'order_id'
    )
  into
    has_bookings,
    has_orders,
    has_payments,
    has_cancelled_at,
    has_order_id,
    has_payment_order_id;

  if has_bookings then
    execute 'insert into issue_210_metrics(metric, value_text, notes)
             select ''total_bookings'', count(*)::text, null from public.bookings';

    execute 'insert into issue_210_metrics(metric, value_text, notes)
             select ''booking_status_cancelled_count'',
                    count(*) filter (where status = ''cancelled'')::text,
                    ''booking flow''
             from public.bookings';

    execute 'insert into issue_210_metrics(metric, value_text, notes)
             select ''recent_30d_cancelled_bookings'',
                    count(*)::text,
                    ''booking flow''
             from public.bookings
             where status = ''cancelled''
               and created_at >= now() - interval ''30 days''';
  else
    insert into issue_210_metrics values ('total_bookings', null, 'SKIPPED: public.bookings missing');
    insert into issue_210_metrics values ('booking_status_cancelled_count', null, 'SKIPPED: public.bookings missing');
    insert into issue_210_metrics values ('recent_30d_cancelled_bookings', null, 'SKIPPED: public.bookings missing');
  end if;

  if has_bookings and has_cancelled_at then
    execute 'insert into issue_210_metrics(metric, value_text, notes)
             select ''cancelled_status_missing_cancelled_at_count'',
                    count(*)::text,
                    ''must be 0''
             from public.bookings
             where status = ''cancelled'' and cancelled_at is null';

    execute 'insert into issue_210_metrics(metric, value_text, notes)
             select ''non_cancelled_with_cancelled_at_count'',
                    count(*)::text,
                    ''must be 0''
             from public.bookings
             where status <> ''cancelled'' and cancelled_at is not null';
  else
    insert into issue_210_metrics values ('cancelled_status_missing_cancelled_at_count', null, 'SKIPPED: bookings.cancelled_at missing');
    insert into issue_210_metrics values ('non_cancelled_with_cancelled_at_count', null, 'SKIPPED: bookings.cancelled_at missing');
  end if;

  if has_bookings and has_orders and has_order_id then
    execute 'insert into issue_210_metrics(metric, value_text, notes)
             select ''cancelled_bookings_missing_order_count'',
                    count(*)::text,
                    ''must be 0 for stable booking/cancel flow''
             from public.bookings b
             left join public.orders o on o.id = b.order_id
             where b.status = ''cancelled''
               and (b.order_id is null or o.id is null)';
  else
    insert into issue_210_metrics values ('cancelled_bookings_missing_order_count', null, 'SKIPPED: required table/column missing');
  end if;

  if has_bookings and has_orders and has_order_id then
    execute 'insert into issue_210_metrics(metric, value_text, notes)
             select ''cancelled_booking_order_status_not_cancelled_count'',
                    count(*)::text,
                    ''recommended 0''
             from public.bookings b
             join public.orders o on o.id = b.order_id
             where b.status = ''cancelled''
               and o.status not in (''cancelled'', ''refunded'', ''partially_refunded'')';
  else
    insert into issue_210_metrics values ('cancelled_booking_order_status_not_cancelled_count', null, 'SKIPPED: required table/column missing');
  end if;

  if has_bookings and has_payments and has_order_id and has_payment_order_id then
    execute 'insert into issue_210_metrics(metric, value_text, notes)
             select ''cancelled_booking_paid_payment_count'',
                    count(*)::text,
                    ''investigate if > 0''
             from public.bookings b
             join public.payments p on p.order_id = b.order_id
             where b.status = ''cancelled''
               and p.status = ''paid''';
  else
    insert into issue_210_metrics values ('cancelled_booking_paid_payment_count', null, 'SKIPPED: required table/column missing');
  end if;
end
$$;

select metric, value_text, notes
from issue_210_metrics
order by metric;

-- Evidence samples
create temp table if not exists issue_210_cancelled_without_cancelled_at_sample (
  booking_id text,
  status text,
  cancelled_at timestamptz,
  updated_at timestamptz
) on commit drop;

create temp table if not exists issue_210_cancelled_order_status_mismatch_sample (
  booking_id text,
  order_id text,
  booking_status text,
  order_status text,
  updated_at timestamptz
) on commit drop;

create temp table if not exists issue_210_cancelled_paid_payment_sample (
  booking_id text,
  order_id text,
  payment_id text,
  payment_status text,
  payment_updated_at timestamptz
) on commit drop;

truncate table issue_210_cancelled_without_cancelled_at_sample;
truncate table issue_210_cancelled_order_status_mismatch_sample;
truncate table issue_210_cancelled_paid_payment_sample;

do $$
declare
  has_bookings boolean;
  has_orders boolean;
  has_payments boolean;
  has_cancelled_at boolean;
  has_order_id boolean;
  has_payment_order_id boolean;
begin
  select
    to_regclass('public.bookings') is not null,
    to_regclass('public.orders') is not null,
    to_regclass('public.payments') is not null,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'bookings' and column_name = 'cancelled_at'
    ),
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'bookings' and column_name = 'order_id'
    ),
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'payments' and column_name = 'order_id'
    )
  into
    has_bookings,
    has_orders,
    has_payments,
    has_cancelled_at,
    has_order_id,
    has_payment_order_id;

  if has_bookings and has_cancelled_at then
    execute $q$
      insert into issue_210_cancelled_without_cancelled_at_sample (booking_id, status, cancelled_at, updated_at)
      select id::text, status, cancelled_at, updated_at
      from public.bookings
      where status = 'cancelled' and cancelled_at is null
      order by updated_at desc nulls last
      limit 50
    $q$;
  end if;

  if has_bookings and has_orders and has_order_id then
    execute $q$
      insert into issue_210_cancelled_order_status_mismatch_sample (booking_id, order_id, booking_status, order_status, updated_at)
      select b.id::text, b.order_id::text, b.status, o.status, greatest(b.updated_at, o.updated_at)
      from public.bookings b
      join public.orders o on o.id = b.order_id
      where b.status = 'cancelled'
        and o.status not in ('cancelled', 'refunded', 'partially_refunded')
      order by greatest(b.updated_at, o.updated_at) desc nulls last
      limit 50
    $q$;
  end if;

  if has_bookings and has_payments and has_order_id and has_payment_order_id then
    execute $q$
      insert into issue_210_cancelled_paid_payment_sample (booking_id, order_id, payment_id, payment_status, payment_updated_at)
      select b.id::text, b.order_id::text, p.id::text, p.status, p.updated_at
      from public.bookings b
      join public.payments p on p.order_id = b.order_id
      where b.status = 'cancelled'
        and p.status = 'paid'
      order by p.updated_at desc nulls last
      limit 50
    $q$;
  end if;
end
$$;

select * from issue_210_cancelled_without_cancelled_at_sample;
select * from issue_210_cancelled_order_status_mismatch_sample;
select * from issue_210_cancelled_paid_payment_sample;

rollback;
