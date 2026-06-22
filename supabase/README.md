# Supabase Backend (scaffold)

This directory is the serverless replacement for the Express `backend/`. It moves
the database, authentication, and **data isolation** onto Supabase so there's no
server to run. Daily GA4 sync (Edge Function) and the frontend migration come in
later steps — this scaffold is **schema + auth + RLS** only.

## What's here

| File | Purpose |
|---|---|
| `migrations/20260622000001_schema.sql` | Tables (`clients`, `profiles`, `daily_metrics`, `sync_logs`), triggers, reporting views |
| `migrations/20260622000002_rls.sql` | **Row Level Security** — replaces the `requireAdmin` / `requireClientAccess` middleware |
| `migrations/20260622000003_auth_trigger.sql` | Auto-creates a `profiles` row from auth metadata on signup |
| `migrations/20260622000004_schedule_sync.sql` | pg_cron schedule that triggers the `daily-sync` function |

## How isolation works now

Instead of app code checking `req.user`, the **database** enforces access for the
`authenticated` role:

- **Admins** (`profiles.role = 'admin'`) — full read/write on clients, read on all metrics.
- **Clients** (`profiles.role = 'client'`) — can read **only** their own `client_id`'s
  clients/metrics row. Cannot see other clients. Cannot write metrics.
- **anon** (logged out) — no access to anything.
- **service_role** (the sync Edge Function) — bypasses RLS to write metrics.

This was verified locally: admins see all, each client sees only their own rows,
anon is denied, and clients cannot insert metrics.

## Applying it

**Option A — Supabase CLI (recommended)**
```bash
supabase init                 # if not already initialised
supabase link --project-ref <your-project-ref>
supabase db push              # applies everything in migrations/
```

**Option B — SQL editor**
Paste the contents of `20260622000001 → 000002 → 000003` (in that order) into the Supabase
dashboard SQL editor and run each.

> The migrations depend on Supabase-provided objects (`auth.users`, `auth.uid()`,
> the `anon`/`authenticated`/`service_role` roles), so they run on Supabase but not
> on a plain local Postgres without stubs.

## Provisioning users

Users are created through **Supabase Auth**, and the trigger fills in their profile
from `user_metadata`. Create them via the Admin API (or the dashboard's
Authentication → Add user, setting the user metadata):

```bash
# Admin user
curl -X POST "https://<ref>.supabase.co/auth/v1/admin/users" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@you.com","password":"...","email_confirm":true,
       "user_metadata":{"role":"admin"}}'

# Client user scoped to client #1
curl -X POST "https://<ref>.supabase.co/auth/v1/admin/users" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"client@acme.com","password":"...","email_confirm":true,
       "user_metadata":{"role":"client","client_id":1}}'
```

The `client_id` must reference an existing `public.clients.id`, so **create the
client row before its client login**.

## Verifying isolation yourself

In the SQL editor, impersonate a user:
```sql
set role authenticated;
select set_config('request.jwt.claim.sub', '<that user''s auth uid>', false);
select * from clients;        -- admin: all; client: only theirs
select * from daily_metrics;  -- same
reset role;
```

## Status

- [x] Schema + auth + RLS (this scaffold)
- [x] **Daily sync Edge Function** — see `functions/daily-sync` + `functions/README.md`,
      scheduled via `migrations/20260622000004_schedule_sync.sql`. GA4 logic validated
      against the live API.
- [x] **Client creation flow** — `functions/create-client` validates GA4 access,
      inserts the client, and backfills 30 days. Admin-only; browser-invoked.
- [x] **Frontend swap** — `frontend/src/lib/api.js` (→ `supabase-js`) and
      `lib/auth.js` (→ Supabase Auth) now talk directly to Supabase.
- [ ] **Decommission** the Express `backend/` — no longer used by the app.
