create table if not exists users (id uuid primary key, role text not null, created_at timestamptz default now());
create table if not exists guide_profiles (id uuid primary key, user_id uuid references users(id), slug text unique not null, display_name text not null);
create table if not exists experiences (id uuid primary key, guide_id uuid references guide_profiles(id), slug text unique not null, title text not null, price_twd int not null);
create table if not exists orders (id uuid primary key, experience_id uuid references experiences(id), customer_name text not null, status text not null, total_twd int not null, created_at timestamptz default now());
create table if not exists payments (id uuid primary key, order_id uuid references orders(id), provider text not null, status text not null, paid_at timestamptz);
create table if not exists order_events (id bigserial primary key, order_id uuid references orders(id), event_type text not null, payload jsonb, created_at timestamptz default now());
