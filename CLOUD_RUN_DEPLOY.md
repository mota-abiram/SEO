# 🚀 Google Cloud Run Deployment Checklist

Follow these steps to move your GA4 Dashboard from your local Mac to a production-ready Google Cloud environment using **Workload Identity** (no JSON keys needed!).

---

## 1️⃣ Enable Google Cloud APIs
Run this command or enable them in the [Google Cloud Console](https://console.cloud.google.com/):

```bash
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    sqladmin.googleapis.com \
    analyticsdata.googleapis.com
```

---

## 2️⃣ Setup the Database (Cloud SQL)
Cloud Run is "ephemeral" (it forgets everything when it restarts). You need a permanent database.
1.  **Create Instance:** Create a PostgreSQL instance in Google Cloud SQL.
2.  **Database Name:** Create a database named `ga4_dashboard`.
3.  **Connection:** Use the "Connection Name" (e.g., `project:region:instance`) in your `DATABASE_URL`.

---

## 3️⃣ The "Identity" Handshake (Workload Identity)
This replaces the need for `gcloud login` or JSON keys.

1.  **Create Service Account:**
    ```bash
    gcloud iam service-accounts create ga4-dashboard-runner
    ```
2.  **Grant GA4 Access:**
    *   Go to **Google Analytics Admin** ➔ **Property Access Management**.
    *   Add `ga4-dashboard-runner@[PROJECT_ID].iam.gserviceaccount.com` as a **Viewer**.
3.  **Grant SQL Access:**
    ```bash
    gcloud projects add-iam-policy-binding [PROJECT_ID] \
        --member="serviceAccount:ga4-dashboard-runner@[PROJECT_ID].iam.gserviceaccount.com" \
        --role="roles/cloudsql.client"
    ```

---

## 4️⃣ Deployment Commands

### **Step A: Deploy Backend**
```bash
cd backend
gcloud run deploy ga4-backend \
    --source . \
    --service-account ga4-dashboard-runner@[PROJECT_ID].iam.gserviceaccount.com \
    --update-env-vars DATABASE_URL="postgresql://user:pass@/ga4_dashboard?host=/cloudsql/[CONNECTION_NAME]" \
    --update-env-vars JWT_SECRET="your_random_secret_string" \
    --allow-unauthenticated
```
*(Copy the URL from the output, e.g., `https://ga4-backend-xyz.a.run.app`)*

### **Step B: Deploy Frontend**
```bash
cd ../frontend
gcloud run deploy ga4-frontend \
    --source . \
    --set-build-env-vars NEXT_PUBLIC_API_URL="https://ga4-backend-xyz.a.run.app/api" \
    --allow-unauthenticated
```

---

## 💡 Important: The Data Sync
In production, you don't need to run manual syncs! The code already contains a cron job (`backend/src/jobs/dailySync.js`). 
*   **Cloud Run Note:** Because Cloud Run "sleeps" to save money, it might miss the 5 AM cron job. 
*   **Fix:** In the Google Cloud Console, go to **Cloud Scheduler** and create a job that hits `https://your-backend.run.app/api/sync/manual` once a day. (I can add this route for you if you plan to use Cloud Scheduler!)
