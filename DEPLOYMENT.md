# 🚀 Deployment Guide: Render (Backend) & Vercel (Frontend)

This guide explains how to deploy the GA4 Multi-Client Dashboard to production.

---

## 🏗️ 1. Prepare Your Repository
Ensure your project is in a GitHub repository. Your structure should look like this:
- `/backend`
- `/frontend`

---

## 🐘 2. Backend Deployment (Render.com)

### A. Create a PostgreSQL Database
1. Log in to [Render](https://dashboard.render.com).
2. Click **New** > **Database**.
3. Name it `ga4_dashboard_db`.
4. After creation, copy the **Internal Database URL**.

### B. Create the Web Service
1. Click **New** > **Web Service**.
2. Connect your GitHub repository.
3. Set the following:
   - **Name**: `ga4-dashboard-api`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### C. Environment Variables (Secret!)
Go to the **Environment** tab in your Render service and add:
- `NODE_ENV`: `production`
- `DATABASE_URL`: (Paste the Internal Database URL from Step A)
- `JWT_SECRET`: (Generate one using `openssl rand -base64 64`)
- `FRONTEND_URL`: (You will get this after Step 3)
- `ENABLE_CRON`: `true`
- `SYNC_CRON_SCHEDULE`: `0 5 * * *`
- `LOG_LEVEL`: `info`

### D. The Service Account Key (Secret File)
Instead of uploading `ga4-key.json` to GitHub (WHICH IS DANGEROUS), do this:
1. In Render, go to **Environment** > **Secret Files**.
2. Click **Add Secret File**.
3. **Filename**: `ga4-key.json`
4. **Contents**: Paste the entire contents of your local `ga4-key.json`.
5. In your **Environment Variables**, set:
   - `GOOGLE_APPLICATION_CREDENTIALS`: `/opt/render/project/src/backend/ga4-key.json` (Render's internal path).

---

## 🎨 3. Frontend Deployment (Vercel)

1. Log in to [Vercel](https://vercel.com).
2. Click **Add New** > **Project**.
3. Select your GitHub repository.
4. Set the following:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite` (or `Next.js` depending on your setup)
5. **Environment Variables**:
   - `VITE_API_URL`: (Paste your Render Web Service URL, e.g., `https://ga4-dashboard-api.onrender.com`)
6. Click **Deploy**.


---

## 🔗 4. Final Connection

1. Copy your Vercel URL (e.g., `https://ga4-dashboard.vercel.app`).
2. Go back to your **Render Web Service** > **Environment**.
3. Update the `FRONTEND_URL` variable with your Vercel URL.
4. Redeploy both services.

---

## ✅ Post-Deployment Checklist
1. **Database Schema**: Connect to your Render DB using a tool like TablePlus or CLI and run the contents of `backend/database/schema.sql`.
2. **Admin User**: Run the `create-admin` script on Render (via the "Shell" tab) or manually insert an admin into the `users` table.
3. **GA4 Access**: Ensure your Service Account email is added as a **Viewer** to all client properties.

---
