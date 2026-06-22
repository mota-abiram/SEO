-- ============================================================
-- GA4 Multi-Client Dashboard — Row Level Security (migration 0002)
-- ============================================================
-- This file is the security core. It replaces the Express middleware
-- (authenticateToken / requireAdmin / requireClientAccess) with policies
-- enforced inside Postgres for the `authenticated` and `anon` roles.
--
-- Roles recap (Supabase):
--   anon          -> not logged in. Gets NOTHING here.
--   authenticated -> a logged-in user. Filtered by the policies below.
--   service_role  -> the daily sync Edge Function. BYPASSES RLS entirely,
--                    so it can write metrics without per-row policies.
-- ============================================================

-- ------------------------------------------------------------
-- Helper functions
-- ------------------------------------------------------------
-- SECURITY DEFINER means these run as the function owner and bypass RLS.
-- That is essential: a policy ON profiles that calls is_admin() must not
-- re-trigger profiles' own policies (infinite recursion). Running as
-- definer reads profiles directly and breaks the cycle.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid()
          and role = 'admin'
          and is_active
    );
$$;

create or replace function public.current_client_id()
returns integer
language sql
stable
security definer
set search_path = public
as $$
    select client_id
    from public.profiles
    where id = auth.uid()
      and is_active;
$$;

comment on function public.is_admin() is
    'True if the current auth user is an active admin. SECURITY DEFINER to avoid RLS recursion.';
comment on function public.current_client_id() is
    'The client_id of the current auth user (NULL for admins). SECURITY DEFINER.';

-- ------------------------------------------------------------
-- Enable RLS on every table (deny-by-default once enabled)
-- ------------------------------------------------------------
alter table public.clients       enable row level security;
alter table public.profiles      enable row level security;
alter table public.daily_metrics enable row level security;
alter table public.sync_logs     enable row level security;

-- Force RLS even for the table owner, so nothing slips through except
-- service_role (which has BYPASSRLS).
alter table public.clients       force row level security;
alter table public.profiles      force row level security;
alter table public.daily_metrics force row level security;
alter table public.sync_logs     force row level security;

-- ------------------------------------------------------------
-- Base privilege grants (RLS then narrows these per-row)
-- ------------------------------------------------------------
revoke all on public.clients, public.profiles, public.daily_metrics, public.sync_logs from anon;

grant select, insert, update, delete on public.clients  to authenticated;
grant select, update                 on public.profiles to authenticated;
grant select                         on public.daily_metrics to authenticated;
grant select                         on public.sync_logs to authenticated;
grant select on public.v_recent_metrics, public.v_client_summary to authenticated;

-- ============================================================
-- clients policies
-- ============================================================
-- Admins: full control. Clients: read ONLY their own client row.

drop policy if exists clients_admin_all on public.clients;
create policy clients_admin_all on public.clients
    for all
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

drop policy if exists clients_client_select_own on public.clients;
create policy clients_client_select_own on public.clients
    for select
    to authenticated
    using (id = public.current_client_id());

-- ============================================================
-- profiles policies
-- ============================================================
-- A user can read/update their own profile. Admins can read/manage all.
-- Note: role/client_id changes are best done via admin tooling; we allow
-- self-update here for fields like email, but admins govern role assignment.

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
    for select
    to authenticated
    using (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
    for update
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
    for all
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- ============================================================
-- daily_metrics policies
-- ============================================================
-- Admins read everything. Clients read ONLY their own client's rows.
-- No INSERT/UPDATE/DELETE policies for authenticated: writes happen only
-- through the sync Edge Function (service_role), which bypasses RLS.

drop policy if exists metrics_admin_select on public.daily_metrics;
create policy metrics_admin_select on public.daily_metrics
    for select
    to authenticated
    using (public.is_admin());

drop policy if exists metrics_client_select_own on public.daily_metrics;
create policy metrics_client_select_own on public.daily_metrics
    for select
    to authenticated
    using (client_id = public.current_client_id());

-- ============================================================
-- sync_logs policies
-- ============================================================
-- Operational data: admins only. Clients have no access.

drop policy if exists sync_logs_admin_select on public.sync_logs;
create policy sync_logs_admin_select on public.sync_logs
    for select
    to authenticated
    using (public.is_admin());
