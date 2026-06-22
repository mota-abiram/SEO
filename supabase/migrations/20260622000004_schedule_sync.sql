-- ============================================================
-- Schedule the daily GA4 sync (migration 0004)
-- ============================================================
-- Replaces node-cron. pg_cron fires daily and pg_net POSTs to the daily-sync
-- Edge Function. Keeps the Supabase project active so the free tier won't pause.
--
-- The function URL and the SYNC_SECRET are read from Supabase Vault at runtime,
-- so no secret is stored in this file. Create them ONCE before the first run
-- (values are encrypted at rest; never commit the actual values):
--
--   select vault.create_secret('https://<REF>.supabase.co/functions/v1', 'ga4_functions_url');
--   select vault.create_secret('<SYNC_SECRET>',                          'ga4_sync_secret');
--
-- (Supabase blocks `alter database ... set app.settings.*`, which is why we use
--  Vault instead of GUC settings.)
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-runnable: drop any prior definition first.
select cron.unschedule('daily-ga4-sync')
where exists (select 1 from cron.job where jobname = 'daily-ga4-sync');

-- Run at 05:00 UTC daily.
select cron.schedule(
  'daily-ga4-sync',
  '0 5 * * *',
  $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'ga4_functions_url') || '/daily-sync',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'ga4_sync_secret')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $job$
);

-- ------------------------------------------------------------
-- Inspect / manage:
--   select * from cron.job;                                               -- list jobs
--   select * from cron.job_run_details order by start_time desc limit 20; -- run history
--   select status_code, content from net._http_response order by id desc; -- last HTTP results
--   select cron.unschedule('daily-ga4-sync');                             -- remove
-- ------------------------------------------------------------
