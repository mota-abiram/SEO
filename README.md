# GA4 Multi-Client Analytics Dashboard

A production-ready SaaS application for managing multiple Google Analytics 4 properties with automated daily data sync and secure client dashboards.

## 🏗️ Architecture

**Tech Stack:**
- **Backend**: Node.js, Express.js, PostgreSQL, node-cron
- **Frontend**: Next.js 14 (App Router), React, Recharts
- **Auth**: JWT with role-based access control
- **GA4 Integration**: Google Analytics Data API v1 with Service Account
- **Database**: PostgreSQL with connection pooling

**Key Features:**
- ✅ Multi-client support (each client = separate GA4 property)
- ✅ Automated daily data sync via cron job
- ✅ Historical data storage (no live GA4 queries from dashboard)
- ✅ Role-based access (Admin sees all, Client sees only their data)
- ✅ Secure JWT authentication
- ✅ Production-ready deployment configuration

## 📊 Metrics Collected

For each client, daily:
- Sessions (total and organic)
- Total Users
- New Users
- Pageviews
- Average Session Duration
- Bounce Rate
- **Organic Sessions** (filtered by sessionDefaultChannelGroup = "Organic Search")

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Google Cloud Project with Analytics Data API enabled
- Service Account JSON key with Viewer access to GA4 properties

### 1. Clone and Install
```bash
git clone <repo-url>
cd seo
npm install
cd frontend && npm install && cd ..
```

### 2. Database Setup
```bash
# Create database
createdb ga4_dashboard

# Run migrations
psql ga4_dashboard < backend/database/schema.sql
```

### 3. Environment Configuration

**Backend** (`backend/.env`):
```env
# Server
PORT=5000
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ga4_dashboard

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Google Analytics
GOOGLE_APPLICATION_CREDENTIALS=./config/service-account.json

# Cron
SYNC_CRON_SCHEDULE=0 5 * * *
SYNC_TIMEZONE=America/New_York
```

**Frontend** (`frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### 4. Google Cloud Authentication Setup (Workload Identity)
**NO SERVICE ACCOUNT JSON KEYS REQUIRED!**

**For Local Development:**
```bash
# Install Google Cloud SDK
brew install --cask google-cloud-sdk  # macOS

# Authenticate
gcloud auth application-default login

# Set project
gcloud config set project YOUR_PROJECT_ID
```

**For Production:**
- Use Workload Identity Federation (GCP Cloud Run/GKE)
- See `WORKLOAD_IDENTITY_SETUP.md` for detailed instructions

**Grant GA4 Access:**
1. Go to Google Analytics → Admin → Property Access Management
2. Add your Google account (local) or service account email (production)
3. Grant **Viewer** role

### 5. Create Admin User
```bash
cd backend
npm run create-admin
# Follow prompts to create first admin user
```

### 6. Run Application

**Development:**
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

**Production:**
```bash
# Backend
cd backend
npm start

# Frontend
cd frontend
npm run build
npm start
```

## 📁 Project Structure

```
seo/
├── backend/
│   ├── config/
│   │   └── service-account.json (gitignored)
│   ├── database/
│   │   └── schema.sql
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js
│   │   │   └── ga4.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── clients.js
│   │   │   └── metrics.js
│   │   ├── services/
│   │   │   ├── ga4Service.js
│   │   │   └── syncService.js
│   │   ├── jobs/
│   │   │   └── dailySync.js
│   │   └── server.js
│   ├── scripts/
│   │   └── createAdmin.js
│   ├── .env
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── login/
│   │   │   ├── dashboard/
│   │   │   └── layout.js
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   └── ui/
│   │   ├── lib/
│   │   │   ├── api.js
│   │   │   └── auth.js
│   │   └── utils/
│   ├── .env.local
│   └── package.json
└── README.md
```

## 🔐 Security Features

- ✅ JWT-based authentication with HTTP-only cookies
- ✅ Role-based access control (Admin/Client)
- ✅ Client data isolation (users can only see their own data)
- ✅ Service Account credentials stored server-side only
- ✅ Input validation and SQL injection prevention
- ✅ HTTPS-ready (use reverse proxy like nginx)
- ✅ Environment variable management
- ✅ Password hashing with bcrypt

## 🔄 Daily Sync Process

1. **Cron job runs at 5 AM** (configurable timezone)
2. **Fetches all active clients** from database
3. **For each client:**
   - Connects to GA4 property using Service Account
   - Fetches yesterday's metrics
   - Applies organic search filter
   - Normalizes and validates data
   - Inserts into `daily_metrics` table
4. **Error handling:** Logs failures, continues with next client
5. **Rate limiting:** Respects GA4 API quotas

## 📈 API Endpoints

### Authentication
- `POST /api/auth/login` - User login (returns JWT)
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Clients (Admin only)
- `GET /api/clients` - List all clients
- `POST /api/clients` - Create new client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

### Metrics
- `GET /api/metrics?clientId=X&from=YYYY-MM-DD&to=YYYY-MM-DD` - Get metrics range
- `GET /api/metrics/daily?clientId=X` - Get last 30 days
- `GET /api/metrics/export?clientId=X&from=YYYY-MM-DD&to=YYYY-MM-DD` - CSV export

## 🎨 Dashboard Features

- **KPI Cards**: Sessions, Users, Organic Sessions, Bounce Rate
- **Line Chart**: Daily trend visualization
- **Data Table**: Detailed daily breakdown
- **Date Range Picker**: Custom date filtering
- **Client Selector**: Admin can switch between clients
- **CSV Export**: Download data for external analysis
- **Responsive Design**: Mobile-friendly interface

## 🚢 Deployment

### Railway / Render
1. Connect GitHub repo
2. Add environment variables
3. Deploy backend and frontend separately
4. Set up PostgreSQL addon

### AWS / GCP
1. Deploy backend to EC2 / Cloud Run
2. Deploy frontend to S3+CloudFront / Cloud Storage+CDN
3. Use RDS / Cloud SQL for PostgreSQL
4. Set up environment variables in secrets manager

### Docker (Optional)
```bash
# Build and run with Docker Compose
docker-compose up -d
```

## 📝 License

MIT

## 🤝 Support

For issues or questions, contact your development team.
