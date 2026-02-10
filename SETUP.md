# GA4 Multi-Client Dashboard - Setup Guide

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js** 18+ installed
- **PostgreSQL** 14+ installed and running
- **Google Cloud Project** with Analytics Data API enabled
- **Service Account** with Viewer access to GA4 properties

## 🚀 Step-by-Step Setup

### 1. Clone Repository

```bash
cd /Users/apple/Downloads/seo
```

### 2. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 3. Database Setup

#### Create Database

```bash
# Using psql
createdb ga4_dashboard

# Or using PostgreSQL client
psql -U postgres
CREATE DATABASE ga4_dashboard;
\q
```

#### Run Schema

```bash
psql ga4_dashboard < backend/database/schema.sql
```

#### Verify Tables

```bash
psql ga4_dashboard
\dt
# Should show: clients, users, daily_metrics, sync_logs
\q
```

### 4. Google Cloud Setup

#### Create Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project
3. Navigate to **IAM & Admin** → **Service Accounts**
4. Click **Create Service Account**
5. Name: `ga4-dashboard-service`
6. Click **Create and Continue**
7. Skip role assignment (we'll add at property level)
8. Click **Done**

#### Generate JSON Key

1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **Add Key** → **Create new key**
4. Select **JSON**
5. Click **Create**
6. Save the downloaded JSON file as `backend/config/service-account.json`

#### Enable Analytics Data API

1. Go to **APIs & Services** → **Library**
2. Search for "Google Analytics Data API"
3. Click **Enable**

#### Add Service Account to GA4 Properties

For EACH GA4 property you want to track:

1. Open [Google Analytics](https://analytics.google.com)
2. Go to **Admin** (bottom left)
3. Select your property
4. Click **Property Access Management**
5. Click **+** (Add users)
6. Enter your service account email (e.g., `ga4-dashboard-service@your-project.iam.gserviceaccount.com`)
7. Select role: **Viewer**
8. Click **Add**

### 5. Backend Configuration

#### Create .env File

```bash
cd backend
cp .env.example .env
```

#### Edit .env

```bash
nano .env
```

Update these values:

```env
# Database (update with your credentials)
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ga4_dashboard

# JWT Secret (generate a strong secret)
JWT_SECRET=$(openssl rand -base64 64)

# Service Account Path
GOOGLE_APPLICATION_CREDENTIALS=./config/service-account.json

# Cron Schedule (5 AM daily)
SYNC_CRON_SCHEDULE=0 5 * * *
SYNC_TIMEZONE=America/New_York
```

#### Create Admin User

```bash
npm run create-admin
```

Follow the prompts:
- Email: `admin@example.com`
- Password: `your_secure_password`

### 6. Frontend Configuration

```bash
cd ../frontend
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### 7. Start Application

#### Terminal 1 - Backend

```bash
cd backend
npm run dev
```

You should see:
```
✅ Database connected successfully
✅ GA4 API client initialized
⏰ Daily sync job scheduled: 0 5 * * *
✅ Server running on port 5000
```

#### Terminal 2 - Frontend

```bash
cd frontend
npm run dev
```

You should see:
```
ready - started server on 0.0.0.0:3000, url: http://localhost:3000
```

### 8. Access Dashboard

1. Open browser: `http://localhost:3000`
2. Login with admin credentials
3. Add your first client:
   - Click **Clients** (if admin panel exists) or use API
   - Enter client name
   - Enter GA4 Property ID (numeric, e.g., `123456789`)
   - Select timezone

### 9. Add Client via API (Alternative)

```bash
# Get auth token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your_password"}'

# Copy the token from response

# Create client
curl -X POST http://localhost:5000/api/clients \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "name": "Acme Corp",
    "gaPropertyId": "123456789",
    "timezone": "America/New_York"
  }'
```

### 10. Trigger Manual Sync (Optional)

To sync data immediately instead of waiting for cron:

```bash
cd backend
node -e "require('./src/jobs/dailySync').runSyncNow()"
```

### 11. Create Client Users (Optional)

To create a user that can only see one client:

```bash
psql ga4_dashboard

INSERT INTO users (email, password_hash, role, client_id)
VALUES (
  'client@example.com',
  '$2b$10$...',  -- Use bcrypt to hash password
  'client',
  1  -- Client ID from clients table
);
```

## 🔍 Verification Checklist

- [ ] Database tables created successfully
- [ ] Service account JSON key in correct location
- [ ] Backend starts without errors
- [ ] Frontend starts without errors
- [ ] Can login to dashboard
- [ ] Can add a client
- [ ] Cron job scheduled (check backend logs)
- [ ] Manual sync works
- [ ] Dashboard displays data

## 🐛 Troubleshooting

### Database Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution**: Ensure PostgreSQL is running
```bash
# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

### GA4 Permission Denied

```
Error: Permission denied for property 123456789
```

**Solution**: 
1. Verify service account email is added to GA4 property
2. Ensure role is **Viewer** or higher
3. Wait 5-10 minutes for permissions to propagate

### JWT Token Invalid

```
Error: Invalid token
```

**Solution**: 
1. Check `JWT_SECRET` is set in `.env`
2. Clear browser localStorage
3. Login again

### No Data in Dashboard

**Possible causes**:
1. Sync hasn't run yet → Run manual sync
2. No data in GA4 for yesterday → Check GA4 directly
3. Wrong property ID → Verify in GA4 Admin

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::5000
```

**Solution**:
```bash
# Find process using port
lsof -i :5000

# Kill process
kill -9 <PID>

# Or change port in .env
PORT=5001
```

## 📚 Next Steps

1. **Add More Clients**: Use the clients API or admin panel
2. **Backfill Historical Data**: Use the backfill script (see Advanced Usage)
3. **Set Up Production**: See DEPLOYMENT.md
4. **Configure Monitoring**: Set up error tracking and alerts
5. **Customize Dashboard**: Modify frontend components as needed

## 🔐 Security Checklist

- [ ] Change default admin password
- [ ] Use strong JWT_SECRET (64+ characters)
- [ ] Never commit service-account.json to git
- [ ] Use environment variables for all secrets
- [ ] Enable HTTPS in production
- [ ] Set up database backups
- [ ] Implement rate limiting (production)
- [ ] Use SSL for database connection (production)

## 📞 Support

For issues or questions:
1. Check troubleshooting section above
2. Review backend logs: `backend/logs/`
3. Check database sync_logs table for errors
4. Verify GA4 property access in Google Analytics

## 🎉 Success!

If you see data in your dashboard, congratulations! Your GA4 multi-client dashboard is now operational.

The cron job will automatically sync yesterday's data every day at the configured time.
