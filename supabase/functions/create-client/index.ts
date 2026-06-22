// ============================================================
// create-client Edge Function
// ============================================================
// Browser-invoked by an admin from the dashboard "Add Client" form.
// Steps:
//   1. Verify the caller is an authenticated admin (their Supabase JWT).
//   2. Validate the service account can actually read the GA4 property.
//   3. Insert the client row.
//   4. Backfill the last 30 days of metrics immediately.
//
// Deployed with --no-verify-jwt so it can answer CORS preflight and do its own
// admin check; the JWT is still validated via auth.getUser().
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  fetchMetricsRange,
  getAccessToken,
  loadServiceAccount,
  validatePropertyAccess,
} from "../_shared/ga4.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // --- 1. authenticate the caller and require admin ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Authentication required" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "Invalid session" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") {
    return json({ error: "Admin access required" }, 403);
  }

  // --- 2. validate input ---
  const body = await req.json().catch(() => ({}));
  const name: string = (body.name ?? "").trim();
  const gaPropertyId: string = String(body.gaPropertyId ?? "").trim();
  const timezone: string = (body.timezone ?? "UTC").trim() || "UTC";

  if (!name) return json({ error: "Client name is required" }, 400);
  if (!/^\d+$/.test(gaPropertyId)) {
    return json({ error: "GA4 Property ID must be numeric (e.g. 123456789)" }, 400);
  }

  // duplicate check
  const { data: existing } = await admin
    .from("clients")
    .select("id")
    .eq("ga_property_id", gaPropertyId)
    .maybeSingle();
  if (existing) {
    return json({ error: "This GA4 property is already registered" }, 400);
  }

  // --- 3. validate GA4 access ---
  let token: string;
  try {
    token = await getAccessToken(loadServiceAccount());
  } catch (e) {
    return json({ error: `GA4 auth failed: ${(e as Error).message}` }, 500);
  }

  const access = await validatePropertyAccess(token, gaPropertyId);
  if (!access.ok) {
    const sa = loadServiceAccount();
    return json({
      error: access.error,
      serviceAccountEmail: sa.client_email,
      hint: `Grant ${sa.client_email} "Viewer" access on this GA4 property.`,
    }, 400);
  }

  // --- 4. insert the client ---
  const { data: client, error: insertErr } = await admin
    .from("clients")
    .insert({ name, ga_property_id: gaPropertyId, timezone })
    .select()
    .single();
  if (insertErr || !client) {
    return json({ error: insertErr?.message ?? "Failed to create client" }, 500);
  }

  // --- 5. backfill last 30 days (through yesterday) ---
  const startDate = isoDaysAgo(30);
  const endDate = isoDaysAgo(1);
  const startedAt = Date.now();
  let recordsSynced = 0;
  let backfillError: string | null = null;

  try {
    const metrics = await fetchMetricsRange(token, gaPropertyId, startDate, endDate);
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
      const { error: upsertErr } = await admin
        .from("daily_metrics")
        .upsert(rows, { onConflict: "client_id,date" });
      if (upsertErr) throw new Error(upsertErr.message);
      recordsSynced = rows.length;
    }
    await admin.from("sync_logs").insert({
      client_id: client.id,
      sync_date: endDate,
      status: "success",
      records_synced: recordsSynced,
      execution_time_ms: Date.now() - startedAt,
    });
  } catch (e) {
    // Client is created; the daily cron will retry the backfill. Surface the note.
    backfillError = (e as Error).message;
    await admin.from("sync_logs").insert({
      client_id: client.id,
      sync_date: endDate,
      status: "failed",
      records_synced: 0,
      error_message: backfillError,
      execution_time_ms: Date.now() - startedAt,
    });
  }

  return json({
    client,
    backfill: { recordsSynced, startDate, endDate, error: backfillError },
  });
});
