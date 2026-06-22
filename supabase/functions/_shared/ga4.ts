// ============================================================
// Shared GA4 Data API client for Supabase Edge Functions (Deno)
// ============================================================
// Ports backend/src/services/ga4Service.js to a server-side Deno module.
//
// Auth: instead of the Node @google-analytics/data SDK, we mint a Google
// OAuth access token directly from the service-account key using a signed
// JWT (RS256 via Web Crypto), then call the GA4 Data API over REST. The
// service-account JSON is read from the GA4_SERVICE_ACCOUNT secret and never
// leaves the server.
// ============================================================

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  // other fields (project_id, etc.) ignored
}

export interface DailyMetric {
  date: string; // YYYY-MM-DD
  sessions: number;
  users: number;
  newUsers: number;
  pageviews: number;
  avgSessionDuration: number; // seconds
  bounceRate: number; // percentage 0-100
  organicSessions: number;
}

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";

// ---------- service account loading ----------

export function loadServiceAccount(): ServiceAccount {
  const raw = Deno.env.get("GA4_SERVICE_ACCOUNT");
  if (!raw) {
    throw new Error("GA4_SERVICE_ACCOUNT secret is not set");
  }
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error("GA4_SERVICE_ACCOUNT is not valid JSON");
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error("GA4_SERVICE_ACCOUNT missing client_email/private_key");
  }
  return sa;
}

// ---------- base64url + JWT signing ----------

function base64UrlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlFromString(input: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(input));
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// Token cache, scoped to the function instance (reused across clients in one run).
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) {
    return cachedToken.value;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: GA4_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64UrlFromString(JSON.stringify(header))}.${base64UrlFromString(JSON.stringify(claim))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );

  const jwt = `${unsigned}.${base64UrlFromBytes(new Uint8Array(signature))}`;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    // invalid_grant here usually means the key is revoked or the clock is skewed.
    throw new Error(`Google token error: ${data.error ?? ""} ${data.error_description ?? JSON.stringify(data)}`);
  }
  cachedToken = { value: data.access_token, expiresAt: now + (data.expires_in ?? 3600) };
  return cachedToken.value;
}

// ---------- GA4 Data API ----------

// deno-lint-ignore no-explicit-any
async function runReport(token: string, propertyId: string, body: any): Promise<any> {
  const res = await fetch(`${DATA_API}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const status = data?.error?.status ?? res.status;
    const message = data?.error?.message ?? "GA4 API error";
    const err = new Error(message) as Error & { status?: string | number };
    err.status = status;
    throw err;
  }
  return data;
}

function ga4DateToISO(ga4Date: string): string {
  // "20260621" -> "2026-06-21"
  return `${ga4Date.slice(0, 4)}-${ga4Date.slice(4, 6)}-${ga4Date.slice(6, 8)}`;
}

/**
 * Fetch daily metrics for a property across [startDate, endDate] (inclusive).
 * Two API calls total (totals + organic-filtered), merged by date — far fewer
 * calls than per-day fetching for backfills. Days with no GA4 data are omitted.
 */
export async function fetchMetricsRange(
  token: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<DailyMetric[]> {
  const dateDim = [{ name: "date" }];
  const orderByDate = [{ dimension: { dimensionName: "date" } }];

  // Totals (all traffic)
  const totals = await runReport(token, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: dateDim,
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "newUsers" },
      { name: "screenPageViews" },
      { name: "averageSessionDuration" },
      { name: "bounceRate" },
    ],
    orderBys: orderByDate,
  });

  // Organic Search sessions only
  const organic = await runReport(token, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: dateDim,
    metrics: [{ name: "sessions" }],
    dimensionFilter: {
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: "Organic Search" },
      },
    },
    orderBys: orderByDate,
  });

  const organicByDate = new Map<string, number>();
  for (const row of organic.rows ?? []) {
    const d = ga4DateToISO(row.dimensionValues[0].value);
    organicByDate.set(d, parseInt(row.metricValues[0].value) || 0);
  }

  const result: DailyMetric[] = [];
  for (const row of totals.rows ?? []) {
    const date = ga4DateToISO(row.dimensionValues[0].value);
    const m = row.metricValues;
    result.push({
      date,
      sessions: parseInt(m[0].value) || 0,
      users: parseInt(m[1].value) || 0,
      newUsers: parseInt(m[2].value) || 0,
      pageviews: parseInt(m[3].value) || 0,
      avgSessionDuration: parseFloat(m[4].value) || 0,
      bounceRate: (parseFloat(m[5].value) || 0) * 100, // ratio -> percentage
      organicSessions: organicByDate.get(date) ?? 0,
    });
  }
  return result;
}

/**
 * Lightweight access check used before registering a new client.
 * Returns { ok, error? }.
 */
export async function validatePropertyAccess(
  token: string,
  propertyId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${DATA_API}/properties/${propertyId}/metadata`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) return { ok: true };

  const data = await res.json().catch(() => ({}));
  const status = data?.error?.status ?? res.status;
  let error = data?.error?.message ?? "Cannot access GA4 property";
  if (status === "PERMISSION_DENIED") {
    error = 'Permission denied. Grant the service account "Viewer" access to this GA4 property.';
  } else if (status === "NOT_FOUND") {
    error = "GA4 property not found. Check the numeric Property ID.";
  }
  return { ok: false, error };
}
