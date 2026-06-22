# GA4 Multi-Client Analytics Dashboard

A SaaS dashboard for managing multiple Google Analytics 4 properties with automated
daily data sync, secure client logins, and per-client data isolation — built on
**Next.js + Supabase** with no server to run.

## 🏗️ Architecture

**Tech stack:**
- **Frontend**: Next.js 14 (App Router), React, Recharts, `@supabase/supabase-js`
- **Backend**: Supabase — Postgres, Auth, Row Level Security, Edge Functions (Deno), `pg_cron`
- **GA4**: Google Analytics Data API v1, accessed from Edge Functions via a service account
- **Auth & isolation**: Supabase Auth + RLS (admins see all clients; client users see only their own)

There is **no standalone server**. The browser talks directly to Supabase; scheduled
work and GA4 access run in Edge Functions.

```
Next.js (browser) ──► Supabase Postgres (RLS-enforced reads)
                 └──► Edge Function: create-client  (validate GA4 + insert + backfill)
   pg_cron (daily) ──► Edge Function: daily-sync     (fetch GA4 → upsert metrics)
```

## 📊 Metrics collected

Per client, per day: sessions, total users, new users, pageviews, average session
duration, bounce rate, and organic sessions (`sessionDefaultChannelGroup = "Organic Search"`).

## 📁 Project structure

```
.
├── frontend/                 # Next.js app (the entire UI)
│   └── src/
│       ├── app/              # login, dashboard, root
│       ├── lib/              # supabaseClient, auth, api
│       └── utils/
├── supabase/
│   ├── migrations/           # schema, RLS, auth trigger, cron schedule
│   ├── functions/
│   │   ├── _shared/ga4.ts    # GA4 token + Data API client (Deno)
│   │   ├── daily-sync/       # scheduled metric sync
│   │   └── create-client/    # admin "Add Client": validate + insert + backfill
│   └── README.md             # backend setup & how isolation works
├── ADDING_CLIENTS.md         # how to add clients
└── .secrets/                 # local credential backups (gitignored)
```

## 🚀 Running locally

The frontend points at your hosted Supabase project (there's nothing to run locally
besides the UI):

```bash
cd frontend
npm install
# frontend/.env.local:
#   NEXT_PUBLIC_SUPABASE_URL=https://<REF>.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
npm run dev          # http://localhost:3000
```

Or from the repo root: `npm run dev`.

## ☁️ Deploying the Supabase backend

```bash
supabase link --project-ref <REF>
supabase db push                                   # schema + RLS + auth trigger + cron

# secrets (server-side only)
supabase secrets set GA4_SERVICE_ACCOUNT="$(cat .secrets/ga4-key.json)"
supabase secrets set SYNC_SECRET="$(openssl rand -base64 32)"

supabase functions deploy daily-sync   --no-verify-jwt
supabase functions deploy create-client --no-verify-jwt
```

Then create the two Vault secrets used by the cron job (see
`supabase/migrations/*_schedule_sync.sql`) and create your admin user. Full details,
including how RLS enforces isolation, are in [supabase/README.md](supabase/README.md)
and [supabase/functions/README.md](supabase/functions/README.md).

## 👥 Users & clients

- **Admin** — sees and manages every client. Create via Supabase Auth with
  `user_metadata: { role: "admin" }`.
- **Client** — sees only their own property. Create with
  `user_metadata: { role: "client", client_id: <id> }`.
- **Adding a GA4 property** — admins use the dashboard's **Add Client** button (validates
  GA4 access, inserts, and backfills 30 days). See [ADDING_CLIENTS.md](ADDING_CLIENTS.md).

## 🔄 Daily sync

`pg_cron` invokes the `daily-sync` Edge Function at 05:00 UTC. It fetches yesterday's
metrics for every active client and upserts them; each run is recorded in `sync_logs`.
The daily run also keeps the Supabase project active (free tier won't pause).

## 🔐 Security

- Per-user data isolation enforced in the database by **Row Level Security**.
- GA4 service-account key and the sync secret live in Supabase secrets/Vault — never in the browser.
- The browser uses only the **anon key**; what it can read/write is gated by RLS.

## 📝 License

MIT
