# Edge Functions

Server-side functions that replace the Express backend's GA4 sync. They run on
Deno with the `service_role` key, so their database writes bypass RLS.

| Path | Replaces | Purpose |
|---|---|---|
| `_shared/ga4.ts` | `backend/src/services/ga4Service.js` + `config/ga4.js` | Mints a Google token from the service-account key and queries the GA4 Data API over REST |
| `_shared/cors.ts` | — | Shared CORS headers for browser-invoked functions |
| `daily-sync/index.ts` | `backend/src/jobs/dailySync.js` + `services/syncService.js` | Syncs metrics for all active clients (or one client / a date range) |
| `create-client/index.ts` | `POST /api/clients` in `routes/clients.js` | Admin-only, browser-invoked: validates GA4 access, inserts the client, backfills 30 days |

## Secrets

Set these once (they're stored encrypted by Supabase, never shipped to the browser):

```bash
# The full service-account JSON, as a single secret
supabase secrets set GA4_SERVICE_ACCOUNT="$(cat /path/to/ga4-key.json)"

# A shared secret that gates who can invoke the function (any strong random string)
supabase secrets set SYNC_SECRET="$(openssl rand -base64 32)"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — don't set them.

> The service-account key must have **Viewer** access on every GA4 property you sync.

## Deploy

```bash
supabase functions deploy daily-sync
```

## Invoke

```bash
# Sync yesterday for all active clients
curl -X POST "https://<REF>.supabase.co/functions/v1/daily-sync" \
  -H "Authorization: Bearer $SYNC_SECRET" \
  -H "Content-Type: application/json" -d '{}'

# Backfill a date range for one client (used when a client is first added)
curl -X POST "https://<REF>.supabase.co/functions/v1/daily-sync" \
  -H "Authorization: Bearer $SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"clientId":1,"startDate":"2026-05-23","endDate":"2026-06-21"}'
```

Response is a JSON summary with per-client `recordsSynced` / `error`, and every
run is recorded in the `sync_logs` table.

## Schedule

The daily trigger is set up in `migrations/20260622000004_schedule_sync.sql` (pg_cron + pg_net),
running at 05:00 UTC daily. The job reads the function URL and `SYNC_SECRET` from
**Supabase Vault** at runtime, so create those two secrets once (values never live
in a committed file):

```sql
select vault.create_secret('https://<REF>.supabase.co/functions/v1', 'ga4_functions_url');
select vault.create_secret('<SYNC_SECRET>',                          'ga4_sync_secret');
```

Check runs with: `select * from cron.job_run_details order by start_time desc limit 10;`

## Local run (optional)

```bash
supabase functions serve daily-sync --env-file ./supabase/.env.local
# then POST to http://localhost:54321/functions/v1/daily-sync
```

## Notes / differences from the old Node sync

- Backfill fetches a **whole date range in 2 API calls** (totals + organic),
  versus 2 calls per day in the old per-day loop — fewer calls, less quota.
- Days with no GA4 data are simply skipped (no zero-row written).
- Auth uses a JWT signed with Web Crypto, not the `@google-analytics/data` SDK,
  so there are no Node-only dependencies.
