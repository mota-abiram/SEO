-- ============================================================
-- GA4 Multi-Client Dashboard — Auth → profile linkage (migration 0003)
-- ============================================================
-- When a Supabase Auth user is created, automatically create their
-- public.profiles row from the metadata supplied at creation time.
--
-- Expected user_metadata when an admin provisions a user:
--   role      : 'admin' | 'client'   (defaults to 'client' if absent)
--   client_id : integer              (required when role = 'client')
--
-- Example (admin API / dashboard "Add user"):
--   role=client, client_id=1   -> a client login scoped to client #1
--   role=admin                 -> an admin login (no client_id)
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role      text;
    v_client_id integer;
begin
    v_role := coalesce(new.raw_user_meta_data->>'role', 'client');

    v_client_id := nullif(new.raw_user_meta_data->>'client_id', '')::integer;

    -- Keep the role/client_id invariant consistent with the table CHECK.
    if v_role = 'admin' then
        v_client_id := null;
    end if;

    insert into public.profiles (id, email, role, client_id)
    values (new.id, new.email, v_role, v_client_id);

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

comment on function public.handle_new_user() is
    'Creates a public.profiles row from auth user_metadata (role, client_id) on signup.';
