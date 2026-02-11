# GA4 Multi-Client Dashboard
This dashboard provides a centralized view of Google Analytics 4 (GA4) data for multiple clients. It is designed to be simple, fast, and does not require a login.

## 🚀 Getting Started
Access the live dashboard here: **[https://seo-beta-beige.vercel.app](https://seo-beta-beige.vercel.app)**

---



### ⚠️ Critical Step: Permissions
For the dashboard to see the data, you **MUST** invite the system's service account to the GA4 property:
1. Copy the Service Account Email (seo-google@seo-486910.iam.gserviceaccount.com).
2. In Google Analytics, go to **Admin** → **Property Property Access Management**.
3. Click the **"+"** icon → **Add users**.
4. Paste the email and assign the **Viewer** role.

## ➕ Adding a New Client
To start tracking a new property:
1. Click the **"➕ Add Client"** button in the top right.
2. Enter the **Client Name** (e.g., Acme Corp).
3. Enter the **GA4 Property ID**.
   * *Where to find it:* In Google Analytics, go to **Admin** → **Property Settings** → **Property Details**. It is a 9 or 10-digit number.
4. Select the **Timezone** for the client.
5. Click **Save**.


---

## 📈 Viewing Analytics
* **Client Selector**: Use the dropdown at the top to switch between different clients.
* **Date Range**: Choose from presets (Last 7 Days, 30 Days, etc.) or set a **Custom Range**.
* **KPI Cards**: See high-level totals for Sessions, Users, Organic Traffic, and Bounce Rate.
* **Daily Trend**: View the interactive chart to see how traffic changed over time.
* **Breakdown Table**: Scroll down to see the exact numbers for every single day.

---

## 📥 Exporting Data
To get the data into Excel or Google Sheets:
1. Select the client and date range you want.
2. Click the **"📥 Export CSV"** button.
3. A file will download immediately containing all daily metrics shown in the table.

---

## 🗑️ Removing a Client
If you no longer need to track a property:
1. Select the client from the dropdown.
2. Click the **trash icon (🗑️)** next to the selector.
3. Confirm the deletion. *Warning: This permanently removes all historical data for that client from our database.*

---

## 🕒 Important Notes on Data
* **Initial Sync**: When you add a new client, it takes about **2-3 minutes** to fetch the last 30 days of history from Google.
* **Daily Updates**: The dashboard automatically syncs new data from Google every night at **5:00 AM**.
* **Freshness**: Google Analytics data usually has a 24-48 hour delay before it is "finalized."

