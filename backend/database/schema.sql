-- ============================================
-- GA4 Multi-Client Dashboard - Database Schema
-- ============================================
-- PostgreSQL 14+
-- Production-ready schema with indexes, constraints, and audit fields

-- Enable UUID extension (optional, for future use)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: clients
-- ============================================
-- Stores GA4 property information for each client
CREATE TABLE clients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    ga_property_id VARCHAR(50) NOT NULL UNIQUE, -- GA4 Property ID (e.g., "123456789")
    timezone VARCHAR(50) DEFAULT 'UTC', -- IANA timezone (e.g., "America/New_York")
    is_active BOOLEAN DEFAULT true, -- Soft delete flag
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for active clients lookup (used by cron job)
CREATE INDEX idx_clients_active ON clients(is_active) WHERE is_active = true;

-- ============================================
-- TABLE: users
-- ============================================
-- Stores user accounts with role-based access
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL, -- bcrypt hash
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'client')),
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE, -- NULL for admins
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint: client users must have client_id, admins must not
    CONSTRAINT check_client_role CHECK (
        (role = 'admin' AND client_id IS NULL) OR
        (role = 'client' AND client_id IS NOT NULL)
    )
);

-- Indexes for auth lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_client_id ON users(client_id) WHERE client_id IS NOT NULL;

-- ============================================
-- TABLE: daily_metrics
-- ============================================
-- Stores daily GA4 metrics for each client
CREATE TABLE daily_metrics (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    date DATE NOT NULL, -- The date the metrics represent
    
    -- Core GA4 Metrics
    sessions INTEGER DEFAULT 0,
    users INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    pageviews INTEGER DEFAULT 0,
    avg_session_duration DECIMAL(10, 2) DEFAULT 0, -- in seconds
    bounce_rate DECIMAL(5, 2) DEFAULT 0, -- percentage (0-100)
    
    -- Organic-specific metrics
    organic_sessions INTEGER DEFAULT 0, -- Sessions from Organic Search channel
    
    -- Audit fields
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- When data was fetched
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: one record per client per date
    CONSTRAINT unique_client_date UNIQUE (client_id, date)
);

-- Indexes for efficient querying
CREATE INDEX idx_daily_metrics_client_date ON daily_metrics(client_id, date DESC);
CREATE INDEX idx_daily_metrics_date ON daily_metrics(date DESC);

-- ============================================
-- TABLE: sync_logs
-- ============================================
-- Tracks cron job execution and errors
CREATE TABLE sync_logs (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    sync_date DATE NOT NULL, -- The date being synced
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
    records_synced INTEGER DEFAULT 0,
    error_message TEXT,
    execution_time_ms INTEGER, -- Time taken in milliseconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for monitoring recent sync jobs
CREATE INDEX idx_sync_logs_created_at ON sync_logs(created_at DESC);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);

-- ============================================
-- TRIGGERS: Auto-update updated_at timestamps
-- ============================================

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to clients table
CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to users table
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA (Optional - for development)
-- ============================================

-- Example client (replace with real GA4 property ID)
-- INSERT INTO clients (name, ga_property_id, timezone) VALUES
-- ('Acme Corp', '123456789', 'America/New_York'),
-- ('Beta Inc', '987654321', 'America/Los_Angeles');

-- Example admin user (password: 'admin123' - CHANGE IN PRODUCTION)
-- Password hash generated with: bcrypt.hash('admin123', 10)
-- INSERT INTO users (email, password_hash, role) VALUES
-- ('admin@example.com', '$2b$10$rKvVXZJKZJKZJKZJKZJKZeXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 'admin');

-- ============================================
-- VIEWS (Optional - for reporting)
-- ============================================

-- View: Latest metrics for each client (last 30 days)
CREATE OR REPLACE VIEW v_recent_metrics AS
SELECT 
    c.id AS client_id,
    c.name AS client_name,
    dm.date,
    dm.sessions,
    dm.users,
    dm.new_users,
    dm.pageviews,
    dm.avg_session_duration,
    dm.bounce_rate,
    dm.organic_sessions,
    dm.synced_at
FROM daily_metrics dm
JOIN clients c ON dm.client_id = c.id
WHERE dm.date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY c.name, dm.date DESC;

-- View: Client summary statistics
CREATE OR REPLACE VIEW v_client_summary AS
SELECT 
    c.id,
    c.name,
    c.ga_property_id,
    COUNT(dm.id) AS total_records,
    MIN(dm.date) AS earliest_date,
    MAX(dm.date) AS latest_date,
    SUM(dm.sessions) AS total_sessions,
    SUM(dm.organic_sessions) AS total_organic_sessions,
    AVG(dm.bounce_rate) AS avg_bounce_rate
FROM clients c
LEFT JOIN daily_metrics dm ON c.id = dm.client_id
WHERE c.is_active = true
GROUP BY c.id, c.name, c.ga_property_id;

-- ============================================
-- GRANTS (Adjust based on your DB user)
-- ============================================

-- Example: Grant permissions to application user
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ga4_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ga4_app_user;

-- ============================================
-- COMMENTS (Documentation)
-- ============================================

COMMENT ON TABLE clients IS 'Stores Google Analytics 4 property information for each client';
COMMENT ON TABLE users IS 'User accounts with role-based access (admin or client)';
COMMENT ON TABLE daily_metrics IS 'Daily GA4 metrics synced from Google Analytics Data API';
COMMENT ON TABLE sync_logs IS 'Audit log for cron job executions';

COMMENT ON COLUMN clients.ga_property_id IS 'GA4 Property ID from Google Analytics (numeric string)';
COMMENT ON COLUMN clients.timezone IS 'IANA timezone identifier for date calculations';
COMMENT ON COLUMN users.role IS 'User role: admin (all clients) or client (single client)';
COMMENT ON COLUMN daily_metrics.organic_sessions IS 'Sessions filtered by sessionDefaultChannelGroup = Organic Search';
COMMENT ON COLUMN daily_metrics.avg_session_duration IS 'Average session duration in seconds';
COMMENT ON COLUMN daily_metrics.bounce_rate IS 'Bounce rate as percentage (0-100)';

-- ============================================
-- MAINTENANCE QUERIES
-- ============================================

-- Check database size
-- SELECT pg_size_pretty(pg_database_size('ga4_dashboard'));

-- Check table sizes
-- SELECT 
--     schemaname,
--     tablename,
--     pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Vacuum and analyze (run periodically)
-- VACUUM ANALYZE;
