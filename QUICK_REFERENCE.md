# Quick Reference Guide

## 🚀 Common Commands

### Development

```bash
# Start backend (development mode with auto-reload)
cd backend
npm run dev

# Start frontend (development mode)
cd frontend
npm run dev

# Create admin user
cd backend
npm run create-admin

# Run manual sync
cd backend
node -e "require('./src/jobs/dailySync').runSyncNow()"
```

### Production

```bash
# Start backend (production)
cd backend
npm start

# Build and start frontend
cd frontend
npm run build
npm start
```

---

## 📊 Database Operations

### Connect to Database

```bash
psql ga4_dashboard
```

### Common Queries

```sql
-- View all clients
SELECT id, name, ga_property_id, is_active FROM clients;

-- View all users
SELECT id, email, role, client_id FROM users;

-- Check recent syncs
SELECT * FROM sync_logs ORDER BY created_at DESC LIMIT 10;

-- View metrics for a client
SELECT date, sessions, users, organic_sessions 
FROM daily_metrics 
WHERE client_id = 1 
ORDER BY date DESC 
LIMIT 30;

-- Get sync success rate
SELECT 
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM sync_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY status;
```

### Maintenance

```bash
# Backup database
pg_dump ga4_dashboard > backup_$(date +%Y%m%d).sql

# Restore database
psql ga4_dashboard < backup_20240115.sql

# Vacuum and analyze
psql ga4_dashboard -c "VACUUM ANALYZE;"
```

---

## 🔧 API Testing

### Authentication

```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your_password"
  }'

# Save token from response
export TOKEN="your_jwt_token_here"

# Get current user
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Clients

```bash
# List all clients
curl http://localhost:5000/api/clients \
  -H "Authorization: Bearer $TOKEN"

# Create client
curl -X POST http://localhost:5000/api/clients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "gaPropertyId": "123456789",
    "timezone": "America/New_York"
  }'

# Update client
curl -X PUT http://localhost:5000/api/clients/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corporation",
    "isActive": true
  }'

# Delete client (soft delete)
curl -X DELETE http://localhost:5000/api/clients/1 \
  -H "Authorization: Bearer $TOKEN"
```

### Metrics

```bash
# Get metrics for date range
curl "http://localhost:5000/api/metrics?clientId=1&from=2024-01-01&to=2024-01-31" \
  -H "Authorization: Bearer $TOKEN"

# Get last 30 days
curl "http://localhost:5000/api/metrics/daily?clientId=1&days=30" \
  -H "Authorization: Bearer $TOKEN"

# Get summary
curl "http://localhost:5000/api/metrics/summary?clientId=1&from=2024-01-01&to=2024-01-31" \
  -H "Authorization: Bearer $TOKEN"

# Export CSV
curl "http://localhost:5000/api/metrics/export?clientId=1&from=2024-01-01&to=2024-01-31" \
  -H "Authorization: Bearer $TOKEN" \
  -o analytics.csv

# Manually trigger sync (Admin only)
curl -X POST http://localhost:5000/api/metrics/sync \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🔐 User Management

### Create Admin User (Interactive)

```bash
cd backend
npm run create-admin
```

### Create Client User (SQL)

```sql
-- First, hash the password using bcrypt
-- In Node.js REPL:
-- require('bcrypt').hash('password123', 10).then(console.log)

INSERT INTO users (email, password_hash, role, client_id)
VALUES (
  'client@example.com',
  '$2b$10$...', -- paste bcrypt hash here
  'client',
  1 -- client ID from clients table
);
```

### Reset Password

```sql
-- Generate new hash with bcrypt first
UPDATE users 
SET password_hash = '$2b$10$...' 
WHERE email = 'user@example.com';
```

### Deactivate User

```sql
UPDATE users 
SET is_active = false 
WHERE email = 'user@example.com';
```

---

## 📅 Cron Job Management

### Check Cron Status

```bash
# View backend logs
tail -f backend/logs/app.log

# Check sync logs in database
psql ga4_dashboard -c "
  SELECT client_id, sync_date, status, execution_time_ms, created_at 
  FROM sync_logs 
  ORDER BY created_at DESC 
  LIMIT 20;
"
```

### Manual Sync

```bash
# Sync yesterday's data for all clients
cd backend
node -e "require('./src/jobs/dailySync').runSyncNow()"

# Sync specific date (requires custom script)
node -e "
  const { syncAllClients } = require('./src/services/syncService');
  syncAllClients('2024-01-15').then(console.log);
"
```

### Backfill Historical Data

```javascript
// Create backfill script: backend/scripts/backfill.js
const { backfillClientData } = require('../src/services/syncService');

const clientId = 1;
const startDate = '2024-01-01';
const endDate = '2024-01-31';

backfillClientData(clientId, startDate, endDate)
  .then(result => {
    console.log('Backfill complete:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
```

```bash
# Run backfill
cd backend
node scripts/backfill.js
```

---

## 🐛 Troubleshooting

### Backend Won't Start

```bash
# Check if port is in use
lsof -i :5000

# Check database connection
psql $DATABASE_URL -c "SELECT NOW();"

# Check environment variables
cd backend
cat .env

# View logs
tail -f logs/error.log
```

### Frontend Won't Build

```bash
# Clear cache
cd frontend
rm -rf .next node_modules
npm install
npm run build
```

### Sync Job Not Running

```bash
# Check if cron is enabled
grep ENABLE_CRON backend/.env

# Check cron schedule
grep SYNC_CRON_SCHEDULE backend/.env

# View sync logs
psql ga4_dashboard -c "
  SELECT * FROM sync_logs 
  WHERE created_at >= NOW() - INTERVAL '7 days'
  ORDER BY created_at DESC;
"
```

### No Data in Dashboard

```bash
# Check if client exists
psql ga4_dashboard -c "SELECT * FROM clients WHERE id = 1;"

# Check if metrics exist
psql ga4_dashboard -c "
  SELECT COUNT(*), MIN(date), MAX(date) 
  FROM daily_metrics 
  WHERE client_id = 1;
"

# Run manual sync
cd backend
node -e "require('./src/jobs/dailySync').runSyncNow()"
```

---

## 📊 Monitoring

### Health Check

```bash
# Backend health
curl http://localhost:5000/health

# Database health
psql $DATABASE_URL -c "SELECT NOW();"
```

### Performance Metrics

```sql
-- Database size
SELECT pg_size_pretty(pg_database_size('ga4_dashboard'));

-- Table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Slow queries (requires pg_stat_statements extension)
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Error Tracking

```bash
# View recent errors in sync logs
psql ga4_dashboard -c "
  SELECT client_id, sync_date, error_message, created_at
  FROM sync_logs
  WHERE status = 'failed'
  ORDER BY created_at DESC
  LIMIT 10;
"
```

---

## 🔄 Updates & Maintenance

### Update Dependencies

```bash
# Backend
cd backend
npm update
npm audit fix

# Frontend
cd frontend
npm update
npm audit fix
```

### Database Migrations

```sql
-- Example: Add new column to daily_metrics
ALTER TABLE daily_metrics 
ADD COLUMN new_metric INTEGER DEFAULT 0;

-- Update existing records
UPDATE daily_metrics 
SET new_metric = 0 
WHERE new_metric IS NULL;
```

### Rotate Service Account Key

1. Create new key in Google Cloud Console
2. Download new JSON file
3. Replace `backend/config/service-account.json`
4. Restart backend
5. Delete old key from Google Cloud Console

---

## 📈 Scaling

### Add Database Read Replica

```bash
# PostgreSQL replication setup
# On primary:
psql -c "CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'password';"

# On replica:
pg_basebackup -h primary_host -D /var/lib/postgresql/data -U replicator -P
```

### Add Backend Instance

```bash
# Use load balancer (nginx, HAProxy, AWS ALB)
# Point to multiple backend instances
# Ensure shared database connection
```

### Enable Redis Caching

```javascript
// backend/src/config/redis.js
const redis = require('redis');
const client = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
});

// Cache metrics
app.get('/api/metrics', async (req, res) => {
  const cacheKey = `metrics:${clientId}:${from}:${to}`;
  
  // Try cache first
  const cached = await client.get(cacheKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }
  
  // Fetch from database
  const data = await fetchMetrics();
  
  // Cache for 1 hour
  await client.setex(cacheKey, 3600, JSON.stringify(data));
  
  res.json(data);
});
```

---

## 🎯 Best Practices

### Security

- ✅ Rotate JWT_SECRET regularly
- ✅ Use strong passwords (12+ characters)
- ✅ Enable 2FA for admin accounts (future enhancement)
- ✅ Regularly update dependencies
- ✅ Monitor for suspicious activity

### Performance

- ✅ Use database indexes
- ✅ Implement caching where appropriate
- ✅ Optimize queries (use EXPLAIN ANALYZE)
- ✅ Monitor slow queries
- ✅ Use connection pooling

### Reliability

- ✅ Set up automated backups
- ✅ Monitor cron job success rate
- ✅ Implement error alerting
- ✅ Test disaster recovery procedures
- ✅ Document runbooks

---

## 📞 Getting Help

1. Check logs: `backend/logs/` and database `sync_logs`
2. Review documentation: `README.md`, `SETUP.md`, `ARCHITECTURE.md`
3. Test API endpoints with curl
4. Check database for data consistency
5. Verify service account permissions in GA4

---

## 🔗 Useful Links

- [Google Analytics Data API Docs](https://developers.google.com/analytics/devguides/reporting/data/v1)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [JWT.io](https://jwt.io/) - JWT debugger
