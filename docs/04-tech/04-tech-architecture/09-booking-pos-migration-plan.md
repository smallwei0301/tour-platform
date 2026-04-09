# Tour Platform Booking + POS Migration Plan

> 目的：將現有 MVP schema 平滑升級為支援 Availability-driven Booking、POS Lite、LINE/LIFF 渠道的結構。
> 
> 原則：**增量遷移、雙軌相容、先加不拆、最後切流量。**
> 
> 更新日期：2026-04-09

---

## 0. 遷移策略總覽

### 原則
1. **先加新表，不先砍舊表**
2. **先讓新 API 可跑，再逐步把舊 flow 導過來**
3. **舊的 `activity_schedules` 暫時保留，作為 fallback / migration bridge**
4. **先建立 `bookings`，再把 `orders` 從 booking 實體分離**
5. **所有狀態轉移必須記錄 audit / status logs**

### 遷移順序
1. 新增 booking / availability / POS 相關資料表
2. 回填既有資料（plans / bookings / order items）
3. 實作 API v2（不移除舊版）
4. 新前端與 LIFF 改接 v2
5. 完成切流後，再決定是否降級 `activity_schedules` 角色

---

## 1. Migration 分期

## Phase A — Schema Foundation

### A1. 建立 `activity_plans`
目的：把活動抽象為可售方案。

```sql
create table if not exists activity_plans (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  name text not null,
  slug text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  price_type text not null check (price_type in ('per_person', 'per_group')),
  base_price integer not null check (base_price >= 0),
  min_participants integer not null default 1 check (min_participants > 0),
  max_participants integer not null check (max_participants >= min_participants),
  booking_type text not null default 'instant' check (booking_type in ('scheduled', 'request', 'instant')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(activity_id, slug)
);

create index if not exists idx_activity_plans_activity_id on activity_plans(activity_id);
create index if not exists idx_activity_plans_status on activity_plans(status);
```

### A2. 建立 `guide_availability_rules`

```sql
create table if not exists guide_availability_rules (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guide_profiles(id) on delete cascade,
  activity_plan_id uuid references activity_plans(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time_local time not null,
  end_time_local time not null,
  timezone text not null default 'Asia/Taipei',
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes > 0),
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  effective_from date,
  effective_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time_local > start_time_local),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create index if not exists idx_guide_availability_rules_guide_id on guide_availability_rules(guide_id);
create index if not exists idx_guide_availability_rules_plan_id on guide_availability_rules(activity_plan_id);
create index if not exists idx_guide_availability_rules_active on guide_availability_rules(is_active);
```

### A3. 建立 `guide_blackout_dates`

```sql
create table if not exists guide_blackout_dates (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guide_profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  source text not null default 'manual' check (source in ('manual', 'system')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists idx_guide_blackout_dates_guide_id on guide_blackout_dates(guide_id);
create index if not exists idx_guide_blackout_dates_starts_at on guide_blackout_dates(starts_at);
```

### A4. 建立 `bookings`

```sql
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  booking_no text not null unique,
  traveler_id uuid references users(id),
  guide_id uuid not null references guide_profiles(id),
  activity_id uuid not null references activities(id),
  activity_plan_id uuid references activity_plans(id),
  source_channel text not null default 'web' check (source_channel in ('web', 'line', 'admin_pos')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null default 'Asia/Taipei',
  participants integer not null check (participants > 0),
  status text not null default 'draft' check (status in ('draft', 'pending_confirmation', 'confirmed', 'completed', 'cancelled', 'no_show', 'reschedule_requested')),
  order_id uuid,
  customer_note text,
  internal_note text,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index if not exists idx_bookings_traveler_id on bookings(traveler_id);
create index if not exists idx_bookings_guide_id on bookings(guide_id);
create index if not exists idx_bookings_activity_id on bookings(activity_id);
create index if not exists idx_bookings_plan_id on bookings(activity_plan_id);
create index if not exists idx_bookings_status on bookings(status);
create index if not exists idx_bookings_start_at on bookings(start_at);
```

### A5. 建立 `booking_status_logs`

```sql
create table if not exists booking_status_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_id uuid references users(id),
  actor_role text not null check (actor_role in ('traveler', 'guide', 'admin', 'system')),
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_booking_status_logs_booking_id on booking_status_logs(booking_id);
create index if not exists idx_booking_status_logs_created_at on booking_status_logs(created_at desc);
```

### A6. 擴充 `orders`

```sql
alter table orders add column if not exists booking_id uuid references bookings(id);
alter table orders add column if not exists source_channel text default 'web' check (source_channel in ('web', 'line', 'admin_pos'));
alter table orders add column if not exists handled_by uuid references users(id);
alter table orders add column if not exists discount_amount integer not null default 0;
alter table orders add column if not exists payment_status text default 'pending' check (payment_status in ('pending', 'partially_paid', 'paid', 'failed', 'refunded', 'partially_refunded'));

create index if not exists idx_orders_booking_id on orders(booking_id);
create index if not exists idx_orders_source_channel on orders(source_channel);
create index if not exists idx_orders_payment_status on orders(payment_status);
```

### A7. 建立 `order_items`

```sql
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_type text not null check (item_type in ('activity_booking', 'adjustment', 'fee', 'discount')),
  ref_id uuid,
  title text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price integer not null,
  subtotal_amount integer not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order_id on order_items(order_id);
create index if not exists idx_order_items_item_type on order_items(item_type);
```

### A8. 建立 `payment_events`

```sql
create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  event_type text not null check (event_type in ('initiated', 'callback_received', 'authorized', 'paid', 'failed', 'refunded', 'cancelled')),
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_events_payment_id on payment_events(payment_id);
create index if not exists idx_payment_events_created_at on payment_events(created_at desc);
```

---

## Phase B — Backfill Data

### B1. 回填 `activity_plans`
策略：每個既有 `activities` 預設生成一筆 `default` plan。

```sql
insert into activity_plans (
  activity_id, name, slug, duration_minutes, price_type, base_price,
  min_participants, max_participants, booking_type, status
)
select
  a.id,
  'Default Plan',
  'default',
  a.duration_minutes,
  'per_person',
  a.price_per_person,
  a.min_participants,
  a.max_participants,
  'instant',
  case when a.status in ('published') then 'active' else 'inactive' end
from activities a
where not exists (
  select 1 from activity_plans ap where ap.activity_id = a.id
);
```

### B2. 由 `activity_schedules` 回填 `bookings`
策略：
- 既有 `orders` 若有 `schedule_id`，就補建 booking
- booking.start_at / end_at 來自 schedule
- booking.status 由 order.status 映射

#### 狀態映射建議
- `pending_payment` -> `draft`
- `paid` -> `pending_confirmation`
- `confirmed` -> `confirmed`
- `completed` -> `completed`
- `cancelled_by_user` / `cancelled_by_guide` -> `cancelled`
- `refund_pending` -> `cancelled`
- `refunded` -> `cancelled`

### B3. 由 `orders` 回填 `order_items`
每筆既有 order 至少建立一筆 `activity_booking` item。

### B4. 由 `payments.raw_callback_payload` 補 `payment_events`
至少補一筆：
- `initiated`
- 若已 paid -> `paid`

---

## 2. 相容策略（Migration Bridge）

## 2.1 `activity_schedules` 暫不刪除
短期內角色改為：
- 舊 flow 的資料來源
- 或作為 cache / published slots 的鏡像

### Bridge 方案
- 舊活動頁仍可讀 `activity_schedules`
- 新 booking flow 改讀 `available-slots` API
- 後續再決定要不要把 `activity_schedules` 降級成 materialized projection

## 2.2 `orders.schedule_id` 暫時保留
避免舊報表與舊頁面立刻壞掉。

## 2.3 v1 / v2 API 並行
- v1: 現有 `/api/orders` 流程
- v2: 新 `/api/bookings/*` 流程

直到：
- Web 前台切完
- Guide dashboard 切完
- LIFF 切完
- Admin POS 上線

才考慮 deprecate v1。

---

## 3. RLS / 權限規則補充

### bookings
- traveler：只能讀自己的 booking
- guide：只能讀自己的 booking
- admin：全部

### booking_status_logs
- traveler：只能讀自己 booking 相關 log（必要時過濾）
- guide：admin/guide 可讀自己範圍內
- traveler 不可直接寫

### order_items / payment_events
- traveler 原則只讀與自己 order 相關摘要
- 完整 payload 僅 admin/service_role 可讀

---

## 4. 驗收清單

### Schema 驗收
- [ ] 新表 migration 全數可重跑（idempotent）
- [ ] 舊資料可回填
- [ ] `orders` 與 `bookings` 關聯可追溯

### Data 驗收
- [ ] 既有 published activities 都有 default plan
- [ ] 既有 orders 都能對應 booking
- [ ] 既有 payments 都有 payment events

### Compatibility 驗收
- [ ] 舊前台不壞
- [ ] 舊 guide dashboard 不壞
- [ ] 新 API 可獨立測試

---

## 5. 風險與處理

### 風險 1：回填 booking 狀態映射不精確
處理：
- 先跑 dry-run SQL 報表
- 人工抽樣驗證 20 筆 order

### 風險 2：slots 與舊 schedule 不一致
處理：
- 切流前先讓新舊結果雙寫 / 對照
- 以 admin 報表比較差異

### 風險 3：前端切換造成 funnel 中斷
處理：
- 先上 hidden feature flag
- 內部測試後再逐步釋放

---

## 6. Tracy 的具體落地順序

1. 寫 migration SQL（A1~A8）
2. 寫 backfill script（B1~B4）
3. 補 schema docs
4. 建 API v2
5. 寫 feature flag
6. 切 web booking
7. 切 LIFF
8. 補 admin POS
