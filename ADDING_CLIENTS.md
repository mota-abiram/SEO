# Adding Clients to the GA4 Dashboard

A **client** = one **GA4 property** whose daily metrics are synced and shown on the
dashboard. This covers adding a client, the prerequisites, and giving a client their
own login.

> **Who can do this:** only **admin** users. Client logins can't add clients or see other clients' data.

---

## Prerequisites (per property)

1. **The service account has Viewer access on the property.** In Google Analytics →
   **Admin → Property Access Management**, add the service-account email as **Viewer**:
   ```
   seo-google@seo-486910.iam.gserviceaccount.com
   ```
   The Add Client flow checks this and refuses if access is missing.

2. **The numeric GA4 Property ID** (e.g. `123456789`) — Google Analytics → **Admin →
   Property details → Property ID** (top-right).
   ⚠️ Use the **numeric Property ID**, not the `G-XXXXXXXXXX` Measurement ID.

---

## Method 1 — Dashboard (recommended)

1. Sign in as an **admin** at the dashboard (`/login`).
2. Click **➕ Add Client** (top-right).
3. Fill in:

   | Field | Example | Notes |
   |---|---|---|
   | **Client Name** | `Acme Corp` | Display name. Required. |
   | **GA4 Property ID** | `123456789` | Numeric, required, unique. |
   | **Timezone** | `America/New_York` | Defaults to `UTC`. |

4. **Save Client.**

Behind the scenes the `create-client` Edge Function validates GA4 access, inserts the
client, and **backfills the last 30 days** — so data appears immediately. If the service
account lacks access, you get an error naming the exact email to grant Viewer to.

## Method 2 — API (optional)

Invoke the Edge Function directly with an admin's access token:

```bash
curl -X POST "https://<REF>.supabase.co/functions/v1/create-client" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Corp","gaPropertyId":"123456789","timezone":"America/New_York"}'
```

Returns `{ client, backfill: { recordsSynced } }`.

---

## Giving a client their own login

Client logins are created through **Supabase Auth** with metadata that scopes them to
one client (the auth trigger creates their profile automatically). Create the client
**row first**, then:

```bash
curl -X POST "https://<REF>.supabase.co/auth/v1/admin/users" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"client@acme.com","password":"...","email_confirm":true,
       "user_metadata":{"role":"client","client_id":1}}'
```

That user can sign in and will see **only** client #1's data (enforced by RLS).
You can also do this from the Supabase Dashboard → Authentication → Add user (set the
user metadata).

---

## Managing clients

| Action | How |
|---|---|
| List / switch | Dashboard client selector |
| Delete (with all its data) | Dashboard 🗑️ button next to the client selector |
| Deactivate (stop syncing, keep data) | set `is_active = false` on the `clients` row |

---

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| "Permission denied … Grant the service account Viewer access" | Add the service-account email as Viewer on that property. |
| "This GA4 property is already registered" | A client with that Property ID already exists. |
| "Admin access required" | You're signed in as a client, not an admin. |
| New client shows but no data | Backfill failed (check `sync_logs`); the daily sync will retry. |
| Used the `G-XXXX` ID | Use the **numeric** Property ID instead. |
