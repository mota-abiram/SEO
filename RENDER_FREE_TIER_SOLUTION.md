# Render Free Tier - Data Sync Solutions

## 🚨 The Problem

Render's free plan:
- **Spins down** after 15 minutes of inactivity
- **Cold start** takes 30-60 seconds to wake up
- **Cron jobs don't run** when service is asleep
- **Result**: Daily sync at 5 AM doesn't execute

## ✅ Solutions for Free Tier

### **Solution 1: External Keep-Alive Service** ⭐ (Recommended)

Use a free external service to ping your backend every 14 minutes.

#### Option A: UptimeRobot (Easiest)

1. **Sign up**: Go to [uptimerobot.com](https://uptimerobot.com) (Free, 50 monitors)

2. **Add Monitor**:
   - Monitor Type: `HTTP(s)`
   - Friendly Name: `GA4 Backend Keep-Alive`
   - URL: `https://your-app.onrender.com/health`
   - Monitoring Interval: `5 minutes`
   - Monitor Timeout: `30 seconds`

3. **Done!** Your service will stay awake 24/7

**Pros**:
- ✅ Completely free
- ✅ No code changes needed
- ✅ Email alerts if service goes down
- ✅ Uptime statistics

**Cons**:
- ⚠️ Uses your Render free tier hours (750 hours/month = enough for 24/7)

#### Option B: Cron-job.org

1. **Sign up**: Go to [cron-job.org](https://cron-job.org)

2. **Create Cron Job**:
   - Title: `Keep GA4 Backend Alive`
   - Address: `https://your-app.onrender.com/health`
   - Schedule: `*/14 * * * *` (every 14 minutes)
   - Enabled: ✅

3. **Done!**

#### Option C: GitHub Actions (If using GitHub)

Create `.github/workflows/keep-alive.yml`:

```yaml
name: Keep Render Service Alive

on:
  schedule:
    # Run every 14 minutes (GitHub Actions runs every 5 min minimum in practice)
    - cron: '*/14 * * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  keep-alive:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Render Service
        run: |
          echo "Pinging Render service..."
          response=$(curl -s -o /dev/null -w "%{http_code}" https://your-app.onrender.com/health)
          echo "Response code: $response"
          if [ $response -eq 200 ]; then
            echo "✅ Service is alive"
          else
            echo "⚠️ Service returned $response"
          fi
```

**Note**: Replace `your-app.onrender.com` with your actual Render URL.

---

### **Solution 2: Smart Sync on User Login** 🎯

Trigger data sync when users access the dashboard (no external service needed).

#### Implementation

**Backend**: Add auto-sync middleware:

Create `backend/src/middleware/autoSync.js`:

```javascript
/**
 * Auto-sync middleware
 * Triggers sync if last sync was more than 12 hours ago
 */

const { syncYesterday } = require('../services/syncService');
const { query } = require('../config/database');

let lastSyncCheck = null;
let syncInProgress = false;

async function autoSyncMiddleware(req, res, next) {
  try {
    // Only check on dashboard/metrics requests
    if (!req.path.includes('/metrics') && !req.path.includes('/dashboard')) {
      return next();
    }

    // Only check every 30 minutes to avoid spam
    const now = Date.now();
    if (lastSyncCheck && (now - lastSyncCheck) < 30 * 60 * 1000) {
      return next();
    }

    lastSyncCheck = now;

    // Check when last sync happened
    const result = await query(
      `SELECT MAX(created_at) as last_sync 
       FROM sync_logs 
       WHERE status = 'success'`
    );

    const lastSync = result.rows[0]?.last_sync;
    
    if (!lastSync) {
      // No sync ever - trigger one
      triggerBackgroundSync();
    } else {
      const hoursSinceSync = (now - new Date(lastSync).getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceSync > 12) {
        // Last sync was more than 12 hours ago
        console.log(`⏰ Last sync was ${hoursSinceSync.toFixed(1)} hours ago. Triggering sync...`);
        triggerBackgroundSync();
      }
    }

    next();

  } catch (error) {
    console.error('Auto-sync check error:', error);
    next(); // Don't block the request
  }
}

function triggerBackgroundSync() {
  if (syncInProgress) {
    console.log('⏭️ Sync already in progress, skipping...');
    return;
  }

  syncInProgress = true;
  
  syncYesterday()
    .then(result => {
      console.log(`✅ Auto-sync completed: ${result.successCount}/${result.totalClients} successful`);
      syncInProgress = false;
    })
    .catch(err => {
      console.error(`❌ Auto-sync failed:`, err.message);
      syncInProgress = false;
    });
}

module.exports = autoSyncMiddleware;
```

**Add to server.js**:

```javascript
// Add after other middleware, before routes
const autoSyncMiddleware = require('./middleware/autoSync');
app.use(autoSyncMiddleware);
```

**Pros**:
- ✅ No external dependencies
- ✅ No keep-alive needed
- ✅ Syncs when actually needed

**Cons**:
- ⚠️ Requires user to access dashboard
- ⚠️ First user of the day experiences cold start

---

### **Solution 3: Hybrid Approach** 🚀 (Best of Both Worlds)

Combine both solutions:

1. **UptimeRobot**: Pings `/health` every 14 minutes (keeps service alive)
2. **Auto-sync**: Triggers sync when users access dashboard (ensures data freshness)

**Setup**:

1. Add health endpoint to `backend/src/server.js`:

```javascript
// Health check endpoint (for UptimeRobot)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

2. Set up UptimeRobot to ping `/health` every 5 minutes

3. Add auto-sync middleware (from Solution 2)

**Result**:
- ✅ Service stays awake 24/7
- ✅ Data syncs automatically when users log in
- ✅ Backup sync at 5 AM still works (cron job)
- ✅ Triple redundancy!

---

### **Solution 4: Scheduled Webhook** (Alternative)

Use a free webhook service to trigger sync at specific times.

#### Using EasyCron (Free tier: 1 cron job)

1. **Sign up**: [easycron.com](https://www.easycron.com)

2. **Create Cron Job**:
   - URL: `https://your-app.onrender.com/api/metrics/sync`
   - Cron Expression: `0 5 * * *` (5 AM daily)
   - HTTP Method: `POST`
   - HTTP Headers: `Authorization: Bearer YOUR_ADMIN_JWT_TOKEN`

**Pros**:
- ✅ Triggers sync at exact time
- ✅ No code changes needed

**Cons**:
- ⚠️ Service still sleeps between syncs
- ⚠️ Need to manage JWT token expiration

---

## 📊 Comparison Table

| Solution | Cost | Complexity | Reliability | Service Uptime |
|----------|------|------------|-------------|----------------|
| **UptimeRobot** | Free | ⭐ Easy | ⭐⭐⭐⭐⭐ | 24/7 |
| **Auto-sync on Login** | Free | ⭐⭐ Medium | ⭐⭐⭐ | On-demand |
| **Hybrid** | Free | ⭐⭐ Medium | ⭐⭐⭐⭐⭐ | 24/7 |
| **GitHub Actions** | Free | ⭐⭐⭐ Advanced | ⭐⭐⭐⭐ | 24/7 |
| **EasyCron** | Free | ⭐⭐ Medium | ⭐⭐⭐ | On-demand |

---

## 🎯 My Recommendation

### **For Your Use Case: Hybrid Approach**

1. **Set up UptimeRobot** (5 minutes):
   - Keeps service alive 24/7
   - Free uptime monitoring
   - Email alerts if service goes down

2. **Add auto-sync middleware** (10 minutes):
   - Ensures data is fresh when users log in
   - Backup in case UptimeRobot fails
   - No external dependencies

3. **Keep the cron job** (already implemented):
   - Runs at 5 AM if service is awake
   - Third layer of redundancy

### **Quick Setup Steps**

1. **Add health endpoint** (if not exists):

```javascript
// In backend/src/server.js
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  });
});
```

2. **Deploy to Render**

3. **Set up UptimeRobot**:
   - URL: `https://your-render-url.onrender.com/health`
   - Interval: 5 minutes

4. **Test**: Wait 20 minutes, check if service is still responsive

---

## 🔍 Monitoring

### Check if service is alive:

```bash
curl https://your-app.onrender.com/health
```

### Check last sync time:

```bash
psql $DATABASE_URL -c "
  SELECT 
    client_id, 
    sync_date, 
    status, 
    created_at 
  FROM sync_logs 
  ORDER BY created_at DESC 
  LIMIT 5;
"
```

### Check UptimeRobot dashboard:
- View uptime percentage
- See response times
- Get downtime alerts

---

## 💡 Additional Tips

### Optimize Cold Starts

Add to `backend/src/server.js`:

```javascript
// Warm up database connection on startup
const { query } = require('./config/database');
query('SELECT 1').then(() => {
  console.log('✅ Database connection warmed up');
});
```

### Reduce Wake-up Time

In `render.yaml` (if using):

```yaml
services:
  - type: web
    name: ga4-backend
    env: node
    buildCommand: npm install
    startCommand: npm start
    healthCheckPath: /health
```

---

## 🚀 Next Steps

1. Choose your solution (I recommend Hybrid)
2. Implement the changes
3. Deploy to Render
4. Set up UptimeRobot
5. Monitor for 24 hours
6. Verify data is syncing correctly

---

**Questions?** Check the logs or sync_logs table to verify everything is working!
