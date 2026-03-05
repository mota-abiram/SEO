# System Architecture Documentation

## 📐 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER                           │
│                     (Next.js Frontend)                          │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS + JWT
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    EXPRESS.JS BACKEND                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Auth Routes  │  │Client Routes │  │Metrics Routes│           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                  │                  │                 │
│  ┌──────▼──────────────────▼──────────────────▼───────┐         │
│  │         JWT Middleware & RBAC                      │         │
│  └──────┬──────────────────┬──────────────────┬───────┘         │
│         │                  │                  │                 │
│  ┌──────▼───────┐   ┌──────▼───────┐   ┌─────▼────────┐         │
│  │ Auth Service │   │ Client Svc   │   │ Metrics Svc  │         │
│  └──────────────┘   └──────────────┘   └──────────────┘         │ 
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐       │
│  │              GA4 Sync Service                        │       │
│  │  ┌────────────────────────────────────────────┐      │       │
│  │  │  Daily Cron Job (5 AM)                     │      │       │
│  │  │  - Fetch all active clients                │      │       │
│  │  │  - For each client:                        │      │       │
│  │  │    • Call GA4 Data API                     │      │       │
│  │  │    • Apply organic filter                  │      │       │
│  │  │    • Store in daily_metrics table          │      │       │
│  │  │    • Log to sync_logs                      │      │       │
│  │  └────────────────────────────────────────────┘      │       │
│  └──────────────────────────────────────────────────────┘       │
└────────────┬───────────────────────────┬────────────────────────┘
             │                           │
             │ PostgreSQL                │ GA4 Data API
             │                           │ (Service Account)
┌────────────▼──────────┐    ┌───────────▼──────────────────────┐
│   PostgreSQL DB       │    │  Google Analytics 4              │
│  ┌─────────────────┐  │    │  ┌────────────────────────────┐  │
│  │ clients         │  │    │  │ Property 1 (Client A)      │  │
│  │ users           │  │    │  │ Property 2 (Client B)      │  │
│  │ daily_metrics   │  │    │  │ Property N (Client N)      │  │
│  │ sync_logs       │  │    │  └────────────────────────────┘  │
│  └─────────────────┘  │    │                                  │
└───────────────────────┘    └──────────────────────────────────┘
```

---

## 🔄 Data Flow

### 1. User Authentication Flow

```
User → Login Page → POST /api/auth/login
                    ↓
            Verify credentials (bcrypt)
                    ↓
            Generate JWT token
                    ↓
            Return token + user info
                    ↓
            Store in localStorage
                    ↓
            Redirect to dashboard
```

### 2. Dashboard Data Retrieval Flow

```
Dashboard Page → Check localStorage for JWT
                 ↓
         Authenticated? → No → Redirect to login
                 ↓ Yes
         GET /api/metrics?clientId=X&from=Y&to=Z
                 ↓
         JWT Middleware validates token
                 ↓
         requireClientAccess checks permissions
                 ↓
         Query daily_metrics table (NOT GA4 API)
                 ↓
         Return aggregated data
                 ↓
         Render charts and tables
```

### 3. Daily Sync Flow

```
Cron Trigger (5 AM) → dailySync.js
                      ↓
              syncYesterday()
                      ↓
              Query active clients from DB
                      ↓
              For each client:
                      ↓
              ga4Service.fetchDailyMetrics()
                      ↓
              ┌─────────────────────────────┐
              │ GA4 Data API Request        │
              │ - Property: client.ga_id    │
              │ - Date: yesterday           │
              │ - Metrics: sessions, users, │
              │   pageviews, bounce, etc.   │
              │ - Filter: Organic Search    │
              └─────────────────────────────┘
                      ↓
              Parse and normalize response
                      ↓
              UPSERT into daily_metrics table
                      ↓
              Log success/failure to sync_logs
                      ↓
              Continue to next client
```

---

## 🗄️ Database Schema Design

### Entity Relationship Diagram

```
┌─────────────────┐
│     clients     │
│─────────────────│
│ id (PK)         │◄─────┐
│ name            │      │
│ ga_property_id  │      │ 1:N
│ timezone        │      │
│ is_active       │      │
└─────────────────┘      │
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        │                │                │
┌───────▼──────┐  ┌──────▼──────┐  ┌─────▼────────┐   
│    users     │  │daily_metrics│  │  sync_logs   │
│──────────────│  │─────────────│  │──────────────│
│ id (PK)      │  │ id (PK)     │  │ id (PK)      │
│ email        │  │ client_id FK│  │ client_id FK │
│ password_hash│  │ date        │  │ sync_date    │
│ role         │  │ sessions    │  │ status       │
│ client_id FK │  │ users       │  │ error_msg    │
│ is_active    │  │ pageviews   │  │ exec_time_ms │
└──────────────┘  │ bounce_rate │  └──────────────┘
                  │ organic_sess│
                  └─────────────┘
```

### Key Design Decisions

1. **Multi-tenancy via client_id**: All data isolated by client
2. **Soft deletes**: `is_active` flag instead of hard deletes
3. **Audit trails**: `created_at`, `updated_at`, `synced_at` timestamps
4. **Unique constraints**: Prevent duplicate data (client_id, date)
5. **Indexes**: Optimized for date range queries

---

## 🔐 Security Architecture

### Authentication & Authorization

```
┌──────────────────────────────────────────────────────────┐
│                    Security Layers                       │
├──────────────────────────────────────────────────────────┤
│ 1. HTTPS (Transport Layer)                               │
│    - TLS 1.2+                                            │
│    - Certificate validation                              │
├──────────────────────────────────────────────────────────┤
│ 2. JWT Authentication (Application Layer)                │
│    - Signed with HS256                                   │
│    - 7-day expiration                                    │
│    - Stateless validation                                │
├──────────────────────────────────────────────────────────┤
│ 3. Role-Based Access Control (Business Logic)            │
│    - Admin: All clients                                  │
│    - Client: Own data only                               │
├──────────────────────────────────────────────────────────┤
│ 4. Input Validation (Data Layer)                         │
│    - express-validator                                   │
│    - SQL injection prevention (parameterized queries)    │
│    - XSS protection (helmet.js)                          │
├──────────────────────────────────────────────────────────┤
│ 5. Service Account Isolation (External API)              │
│    - Read-only GA4 access                                │
│    - Credentials stored server-side only                 │
│    - Never exposed to frontend                           │
└──────────────────────────────────────────────────────────┘
```

### Data Access Patterns

```javascript
// Admin accessing any client
if (user.role === 'admin') {
  // Can access any clientId
  return true;
}

// Client accessing own data
if (user.role === 'client' && user.clientId === requestedClientId) {
  // Can only access their own clientId
  return true;
}

// Deny all other access
return false;
```

---

## 📊 API Design

### RESTful Endpoints

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/api/auth/login` | ❌ | - | User login |
| GET | `/api/auth/me` | ✅ | All | Get current user |
| POST | `/api/auth/logout` | ✅ | All | User logout |
| GET | `/api/clients` | ✅ | Admin | List all clients |
| POST | `/api/clients` | ✅ | Admin | Create client |
| PUT | `/api/clients/:id` | ✅ | Admin | Update client |
| DELETE | `/api/clients/:id` | ✅ | Admin | Delete client |
| GET | `/api/metrics` | ✅ | All* | Get metrics range |
| GET | `/api/metrics/daily` | ✅ | All* | Get last N days |
| GET | `/api/metrics/summary` | ✅ | All* | Get aggregated summary |
| GET | `/api/metrics/export` | ✅ | All* | Export CSV |

*With client access control

### Response Format

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "version": "1.0.0"
  }
}
```

### Error Format

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

---

## ⚙️ Technology Stack Rationale

### Backend: Node.js + Express

**Why?**
- Fast, non-blocking I/O for API requests
- Large ecosystem (npm packages)
- Easy integration with Google APIs
- Horizontal scaling capability

**Alternatives Considered:**
- Python/Django: Slower for I/O-heavy tasks
- Go: Steeper learning curve
- Ruby/Rails: Slower performance

### Database: PostgreSQL

**Why?**
- ACID compliance for data integrity
- Excellent date/time handling
- JSON support for flexible schemas
- Mature, battle-tested
- Free and open-source

**Alternatives Considered:**
- MySQL: Less advanced date functions
- MongoDB: Overkill for structured data
- SQLite: Not suitable for production

### Frontend: Next.js

**Why?**
- React-based (component reusability)
- Built-in routing
- Server-side rendering (SEO)
- API routes (if needed)
- Excellent developer experience

**Alternatives Considered:**
- Create React App: No SSR
- Vue/Nuxt: Smaller ecosystem
- Angular: Heavier framework

### Charts: Recharts

**Why?**
- React-native (composable)
- Responsive out of the box
- Good documentation
- Active maintenance

**Alternatives Considered:**
- Chart.js: Imperative API
- D3.js: Too low-level
- Highcharts: Commercial license

---

## 🔧 Configuration Management

### Environment Variables

```
┌─────────────────────────────────────────────┐
│ Environment Variable Hierarchy              │
├─────────────────────────────────────────────┤
│ 1. System Environment (highest priority)    │
│    - Set by hosting platform                │
│    - Override all other sources             │
├─────────────────────────────────────────────┤
│ 2. .env file (local development)            │
│    - Loaded by dotenv                       │
│    - Gitignored for security                │
├─────────────────────────────────────────────┤
│ 3. Default values (lowest priority)         │
│    - Hardcoded in config files              │
│    - Used if no override exists             │
└─────────────────────────────────────────────┘
```

---

## 📈 Performance Considerations

### Database Optimization

1. **Connection Pooling**: Max 20 connections
2. **Indexes**: On (client_id, date) for fast queries
3. **Query Optimization**: Use aggregations in DB, not app
4. **Pagination**: Limit result sets

### API Optimization

1. **Caching**: Store metrics in DB (not live GA4 calls)
2. **Compression**: gzip responses
3. **Rate Limiting**: Prevent abuse
4. **Async Operations**: Non-blocking I/O

### Frontend Optimization

1. **Code Splitting**: Next.js automatic
2. **Lazy Loading**: Charts load on demand
3. **Memoization**: React.memo for expensive components
4. **CDN**: Static assets served from CDN

---

## 🚨 Error Handling Strategy

### Backend

```javascript
// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  
  // Log to monitoring service (Sentry, etc.)
  logError(err);
  
  // Return sanitized error to client
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal server error'
  });
});
```

### Frontend

```javascript
// API error handling
try {
  const data = await api.get('/metrics');
} catch (error) {
  if (error.response?.status === 401) {
    // Redirect to login
    router.push('/login');
  } else {
    // Show error message
    setError(getErrorMessage(error));
  }
}
```

### Cron Job

```javascript
// Sync error handling
try {
  await syncClientMetrics(client, date);
} catch (error) {
  // Log to database
  await logSync(client.id, date, 'failed', 0, error.message);
  
  // Continue with next client (don't fail entire job)
  console.error(`Failed to sync ${client.name}:`, error);
}
```

---

## 📊 Monitoring & Observability

### Key Metrics

1. **Application Metrics**
   - Request rate (req/min)
   - Response time (p50, p95, p99)
   - Error rate (%)
   - Active connections

2. **Business Metrics**
   - Clients synced daily
   - Sync success rate
   - Data freshness (last sync time)
   - User logins per day

3. **Infrastructure Metrics**
   - CPU usage
   - Memory usage
   - Disk I/O
   - Network bandwidth

### Logging Strategy

```
┌──────────────────────────────────────┐
│ Log Levels                           │
├──────────────────────────────────────┤
│ ERROR: Failures requiring attention  │
│ WARN:  Potential issues              │
│ INFO:  Important events              │
│ DEBUG: Detailed diagnostic info      │
└──────────────────────────────────────┘
```

---

## 🔄 Scalability Path

### Current Capacity

- **Clients**: Up to 100
- **Requests**: 1000/min
- **Data**: 10M records

### Scaling Triggers

1. **Database**: > 80% CPU or slow queries
2. **Backend**: > 80% CPU or high response times
3. **Cron Job**: > 30 min execution time

### Scaling Options

1. **Vertical**: Upgrade instance size
2. **Horizontal**: Add more backend instances
3. **Database**: Read replicas
4. **Caching**: Redis layer
5. **CDN**: Static asset delivery

---

## ✅ Design Principles

1. **Separation of Concerns**: Clear boundaries between layers
2. **Single Responsibility**: Each module has one job
3. **DRY (Don't Repeat Yourself)**: Reusable functions
4. **Security First**: Defense in depth
5. **Fail Gracefully**: Errors don't cascade
6. **Observable**: Comprehensive logging
7. **Testable**: Modular, mockable code
8. **Documented**: Clear comments and docs

---

This architecture is designed to be:
- ✅ **Production-ready**: Handles real-world loads
- ✅ **Secure**: Multiple security layers
- ✅ **Scalable**: Can grow with demand
- ✅ **Maintainable**: Clear structure and documentation
- ✅ **Cost-effective**: Efficient resource usage
