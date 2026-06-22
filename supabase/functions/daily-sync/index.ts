// ============================================================
// daily-sync Edge Function
// ============================================================
// Replaces the Node cron job (backend/src/jobs/dailySync.js) +
// syncService.js. Runs server-side with the service_role key, so its writes
// bypass RLS. Invoked on a schedule by pg_cron (see migration 0004), or
// manually for backfills.
//
// Request body (all optional):
//   { "clientId": 1,                      // limit to one client (else all active)
//     "startDate": "2026-05-23",          // backfill window start (else yesterday)
//     "endDate":   "2026-06-21" }         // backfill window end   (else yesterday)
//
// Auth: requires header  Authorization: Bearer <SYNC_SECRET>
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchMetricsRange,
  getAccessToken,
  loadServiceAccount,
  type DailyMetric,
} from "../_shared/ga4.ts";

interface Client {
  id: number;
  name: string;
  ga_property_id: string;
}

function yesterdayISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // --- authorize the invocation ---
  const syncSecret = Deno.env.get("SYNC_SECRET");
  if (!syncSecret) return json({ error: "SYNC_SECRET not configured" }, 500);
  if (req.headers.get("Authorization") !== `Bearer ${syncSecret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // --- parse options ---
  let opts: { clientId?: number; startDate?: string; endDate?: string } = {};
  if (req.method === "POST") {
    opts = await req.json().catch(() => ({}));
  }
  const startDate = opts.startDate ?? yesterdayISO();
  const endDate = opts.endDate ?? yesterdayISO();

  // --- which clients? ---
  let clientQuery = supabase
    .from("clients")
    .select("id, name, ga_property_id")
    .eq("is_active", true);
  if (opts.clientId) clientQuery = clientQuery.eq("id", opts.clientId);

  const { data: clients, error: clientsErr } = await clientQuery;
  if (clientsErr) return json({ error: clientsErr.message }, 500);
  if (!clients || clients.length === 0) {
    return json({ success: true, message: "No active clients to sync", results: [] });
  }

  // --- GA4 token (once, reused across clients) ---
  let token: string;
  try {
    token = await getAccessToken(loadServiceAccount());
  } catch (e) {
    return json({ error: `GA4 auth failed: ${(e as Error).message}` }, 500);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const client of clients as Client[]) {
    const startedAt = Date.now();
    try {
      const metrics: DailyMetric[] = await fetchMetricsRange(
        token,
        client.ga_property_id,
        startDate,
        endDate,
      );

      if (metrics.length > 0) {
        const rows = metrics.map((m) => ({
          client_id: client.id,
          date: m.date,
          sessions: m.sessions,
          users: m.users,
          new_users: m.newUsers,
          pageviews: m.pageviews,
          avg_session_duration: m.avgSessionDuration,
          bounce_rate: m.bounceRate,
          organic_sessions: m.organicSessions,
          synced_at: new Date().toISOString(),
        }));

        const { error: upsertErr } = await supabase
          .from("daily_metrics")
          .upsert(rows, { onConflict: "client_id,date" });
        if (upsertErr) throw new Error(upsertErr.message);
      }

      const execMs = Date.now() - startedAt;
      await supabase.from("sync_logs").insert({
        client_id: client.id,
        sync_date: endDate,
        status: "success",
        records_synced: metrics.length,
        execution_time_ms: execMs,
      });

      results.push({
        clientId: client.id,
        name: client.name,
        success: true,
        recordsSynced: metrics.length,
        execMs,
      });
    } catch (e) {
      const execMs = Date.now() - startedAt;
      const message = (e as Error).message;
      await supabase.from("sync_logs").insert({
        client_id: client.id,
        sync_date: endDate,
        status: "failed",
        records_synced: 0,
        error_message: message,
        execution_time_ms: execMs,
      });
      results.push({ clientId: client.id, name: client.name, success: false, error: message });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  return json({
    success: results.every((r) => r.success),
    range: { startDate, endDate },
    totalClients: clients.length,
    successCount,
    failureCount: clients.length - successCount,
    results,
  });
});
