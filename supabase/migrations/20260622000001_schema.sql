-- ============================================================
-- GA4 Multi-Client Dashboard — Supabase schema (migration 0001)
-- ============================================================
-- Ported from backend/database/schema.sql.
--
-- Key differences vs. the old self-hosted schema:
--   * The custom `users` table (with bcrypt password_hash + JWT) is GONE.
--     Authentication is handled by Supabase Auth (auth.users). We keep a
--     `profiles` table that links each auth user to a role and a client.
--   * Row Level Security (RLS) — defined in 0002_rls.sql — replaces the
--     Express `requireClientAccess` / `requireAdmin` middleware. Isolation
--     is now enforced by the database itself.
-- ============================================================

-- ------------------------------------------------------------
-- clients : one row per GA4 property
-- ------------------------------------------------------------
create table if not exists public.clients (
    id              integer generated always as identity primary key,
    name            varchar(255) not null,
    ga_property_id  varchar(50) not null unique,           -- numeric GA4 Property ID, e.g. "123456789"
    timezone        varchar(50) default 'UTC',             -- IANA timezone
    is_active       boolean default true,                  -- soft-delete flag
    created_at      timestamptz default now(),
    updated_at      timestamptz default now()
);

create index if not exists idx_clients_active
    on public.clients (is_active) where is_active = true;

comment on table public.clients is 'Google Analytics 4 property per client';
comment on column public.clients.ga_property_id is 'Numeric GA4 Property ID';

-- ------------------------------------------------------------
-- profiles : app metadata for each Supabase Auth user
-- ------------------------------------------------------------
-- id matches auth.users.id. Email/password live in auth.users — never here.
create table if not exists public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    email       text,                                       -- mirrored from auth for convenience
    role        text not null check (role in ('admin', 'client')),
    client_id   integer references public.clients(id) on delete cascade,  -- NULL for admins
    is_active   boolean default true,
    created_at  timestamptz default now(),
    updated_at  timestamptz default now(),

    -- admins have no client; clients must be tied to exactly one client
    constraint check_client_role check (
        (role = 'admin'  and client_id is null) or
        (role = 'client' and client_id is not null)
    )
);

create index if not exists idx_profiles_client_id
    on public.profiles (client_id) where client_id is not null;

comment on table public.profiles is 'Links a Supabase Auth user to a role and (for clients) a client_id';

-- ------------------------------------------------------------
-- daily_metrics : synced GA4 metrics, one row per client per day
-- ------------------------------------------------------------
create table if not exists public.daily_metrics (
    id                    integer generated always as identity primary key,
    client_id             integer not null references public.clients(id) on delete cascade,
    date                  date not null,

    -- core GA4 metrics
    sessions              integer default 0,
    users                 integer default 0,
    new_users             integer default 0,
    pageviews             integer default 0,
    avg_session_duration  numeric(10,2) default 0,          -- seconds
    bounce_rate           numeric(5,2) default 0,           -- percentage 0-100

    -- organic-specific
    organic_sessions      integer default 0,                -- Organic Search channel

    -- audit
    synced_at             timestamptz default now(),
    created_at            timestamptz default now(),

    constraint unique_client_date unique (client_id, date)
);

create index if not exists idx_daily_metrics_client_date
    on public.daily_metrics (client_id, date desc);
create index if not exists idx_daily_metrics_date
    on public.daily_metrics (date desc);

comment on column public.daily_metrics.organic_sessions is
    'Sessions where sessionDefaultChannelGroup = Organic Search';

-- ------------------------------------------------------------
-- sync_logs : audit trail for the daily sync function
-- ------------------------------------------------------------
create table if not exists public.sync_logs (
    id                 integer generated always as identity primary key,
    client_id          integer references public.clients(id) on delete set null,
    sync_date          date not null,
    status             varchar(20) not null check (status in ('success', 'failed', 'partial')),
    records_synced     integer default 0,
    error_message      text,
    execution_time_ms  integer,
    created_at         timestamptz default now()
);

create index if not exists idx_sync_logs_created_at on public.sync_logs (created_at desc);
create index if not exists idx_sync_logs_status     on public.sync_logs (status);

-- ------------------------------------------------------------
-- updated_at trigger
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at
    before update on public.clients
    for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
    before update on public.profiles
    for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Reporting views (security_invoker = on so RLS of the querying
-- user is enforced through the view, not the view owner's).
-- ------------------------------------------------------------
create or replace view public.v_recent_metrics
with (security_invoker = on) as
    select
        c.id   as client_id,
        c.name as client_name,
        dm.date,
        dm.sessions,
        dm.users,
        dm.new_users,
        dm.pageviews,
        dm.avg_session_duration,
        dm.bounce_rate,
        dm.organic_sessions,
        dm.synced_at
    from public.daily_metrics dm
    join public.clients c on c.id = dm.client_id
    where dm.date >= current_date - interval '30 days'
    order by c.name, dm.date desc;

create or replace view public.v_client_summary
with (security_invoker = on) as
    select
        c.id,
        c.name,
        c.ga_property_id,
        count(dm.id)                 as total_records,
        min(dm.date)                 as earliest_date,
        max(dm.date)                 as latest_date,
        sum(dm.sessions)             as total_sessions,
        sum(dm.organic_sessions)     as total_organic_sessions,
        avg(dm.bounce_rate)          as avg_bounce_rate
    from public.clients c
    left join public.daily_metrics dm on dm.client_id = c.id
    where c.is_active = true
    group by c.id, c.name, c.ga_property_id;
