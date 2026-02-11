# Data Sync Issue - Troubleshooting Guide

## 🔍 Issue Description

**Problem**: When adding a new client today, it shows data till Feb 10, but clients added yesterday only show data till Feb 09.

## 🎯 Root Cause

The issue occurs due to the timing of the **daily cron job** and **client backfill process**:

1. **Daily Cron Job**: Runs at **5:00 AM** every day and syncs **yesterday's data** for all active clients
2. **Client Backfill**: When a new client is created, it immediately backfills data up to **yesterday**
3. **Timing Gap**: If the cron job hasn't run yet (or the backend server is not running), old clients won't have the latest data

### Example Timeline

```
Feb 10, 10:00 AM - Client A added
  ↓ Backfills data from Jan 11 to Feb 09 (yesterday)
  ↓ Client A has data till Feb 09

Feb 11, 5:00 AM - Cron job should run
  ↓ BUT: Backend server is not running
  ↓ Cron job doesn't execute
  ↓ Client A still has data till Feb 09

Feb 11, 11:00 AM - Client B added
  ↓ Backfills data from Jan 12 to Feb 10 (yesterday)
  ↓ Client B has data till Feb 10
  
RESULT: Client B (newer) has data till Feb 10
        Client A (older) has data till Feb 09
```

## ✅ Solutions Implemented

### 1. Manual Sync (Immediate Fix)

I've already run a manual sync to update all clients with Feb 10's data:

```bash
cd backend
node -e "require('./src/jobs/dailySync').runSyncNow()"
```

**Result**: All clients now have data up to Feb 10 ✅

### 2. Auto-Sync on Client Creation (Permanent Fix)

Modified `/backend/src/routes/clients.js` to automatically sync yesterday's data for **all clients** when a new client is added.

**Before**:
- New client added → Only new client gets backfilled
- Old clients remain outdated until cron runs

**After**:
- New client added → New client gets backfilled
- Then → All clients (including old ones) get synced with yesterday's data
- Result → All clients stay in sync

### 3. Ensure Backend Server is Running

The cron job **only runs when the backend server is running**. Make sure to:

```bash
# Check if backend is running
ps aux | grep "node.*server.js" | grep -v grep

# If not running, start it
cd backend
npm start

# Or for development with auto-reload
npm run dev
```

## 🔧 Manual Sync Commands

### Sync Yesterday's Data for All Clients

```bash
cd backend
node -e "require('./src/jobs/dailySync').runSyncNow()"
```

### Sync Specific Date for All Clients

```bash
cd backend
node -e "
  const { syncAllClients } = require('./src/services/syncService');
  syncAllClients('2026-02-10').then(console.log).catch(console.error);
"
```

### Backfill Historical Data for a Client

```bash
cd backend
node -e "
  const { backfillClientData } = require('./src/services/syncService');
  const clientId = 1;
  const startDate = '2026-01-01';
  const endDate = '2026-02-10';
  backfillClientData(clientId, startDate, endDate)
    .then(console.log)
    .catch(console.error);
"
```

## 📊 Verify Data Sync Status

### Check Latest Data Date for Each Client

```bash
psql postgresql://apple@localhost:5432/ga4_dashboard -c "
  SELECT 
    c.id, 
    c.name, 
    c.created_at::date as created_date, 
    MAX(dm.date) as latest_data_date,
    COUNT(dm.id) as total_records
  FROM clients c
  LEFT JOIN daily_metrics dm ON c.id = dm.client_id
  GROUP BY c.id, c.created_at::date
  ORDER BY c.created_at DESC;
"
```

### Check Recent Sync Logs

```bash
psql postgresql://apple@localhost:5432/ga4_dashboard -c "
  SELECT 
    client_id, 
    sync_date, 
    status, 
    execution_time_ms,
    created_at 
  FROM sync_logs 
  ORDER BY created_at DESC 
  LIMIT 20;
"
```

## 🚨 Prevention Checklist

To prevent this issue in the future:

- ✅ **Keep backend server running** 24/7 (use PM2, systemd, or similar)
- ✅ **Monitor cron job execution** - Check sync_logs table daily
- ✅ **Set up alerts** for failed syncs
- ✅ **Use the auto-sync feature** - Already implemented when creating new clients

## 🔄 Recommended Setup for Production

### Option 1: PM2 (Process Manager)

```bash
# Install PM2
npm install -g pm2

# Start backend with PM2
cd backend
pm2 start src/server.js --name "ga4-backend"

# Save PM2 configuration
pm2 save

# Set PM2 to start on system boot
pm2 startup
```

### Option 2: systemd (Linux)

Create `/etc/systemd/system/ga4-backend.service`:

```ini
[Unit]
Description=GA4 Analytics Backend
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/seo/backend
ExecStart=/usr/bin/node src/server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl enable ga4-backend
sudo systemctl start ga4-backend
sudo systemctl status ga4-backend
```

## 📈 Monitoring

### Daily Health Check Script

Create `backend/scripts/healthCheck.js`:

```javascript
const { query } = require('../src/config/database');

async function healthCheck() {
  try {
    // Check if yesterday's data exists for all active clients
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const result = await query(`
      SELECT 
        c.id,
        c.name,
        CASE 
          WHEN dm.date IS NULL THEN 'MISSING'
          ELSE 'OK'
        END as status
      FROM clients c
      LEFT JOIN daily_metrics dm 
        ON c.id = dm.client_id 
        AND dm.date = $1
      WHERE c.is_active = true
    `, [yesterdayStr]);

    const missing = result.rows.filter(r => r.status === 'MISSING');

    if (missing.length > 0) {
      console.error('⚠️ Missing data for yesterday:', missing);
      process.exit(1);
    } else {
      console.log('✅ All clients have yesterday\'s data');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Health check failed:', error);
    process.exit(1);
  }
}

healthCheck();
```

Run daily:

```bash
cd backend
node scripts/healthCheck.js
```

## 🎯 Summary

**Issue**: Data sync discrepancy between old and new clients

**Root Cause**: Cron job not running (backend server was down)

**Immediate Fix**: Manual sync completed ✅

**Permanent Fix**: Auto-sync on client creation implemented ✅

**Prevention**: Keep backend server running 24/7

---

**Current Status**: All clients now have data up to Feb 10 ✅
