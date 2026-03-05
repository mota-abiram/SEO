/**
 * Express Server
 * Main application entry point
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Import configurations
const { pool } = require('./config/database');
const { verifyGA4Connection } = require('./config/ga4');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const clientsRoutes = require('./routes/clients');
const metricsRoutes = require('./routes/metrics');

// Import jobs
const { startDailySyncJob } = require('./jobs/dailySync');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// Middleware
// ============================================

// Security headers
app.use(helmet());

// CORS configuration
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(u => u.trim().replace(/\/$/, '')) : [])
];

console.log('🔓 Allowed CORS origins:', allowedOrigins);

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Auto-sync middleware (for Render free tier)
// Triggers sync if last sync was more than 12 hours ago
const autoSyncMiddleware = require('./middleware/autoSync');
app.use(autoSyncMiddleware);

// ============================================
// Routes
// ============================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/metrics', metricsRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// ============================================
// Server Initialization
// ============================================

async function startServer() {
    try {
        console.log('\n' + '='.repeat(60));
        console.log('🚀 Starting GA4 Multi-Client Dashboard Server');
        console.log('='.repeat(60) + '\n');

        // Test database connection
        console.log('📊 Testing database connection...');
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected successfully\n');

        // Verify GA4 connection
        console.log('🔍 Verifying GA4 API access...');
        await verifyGA4Connection();
        console.log('✅ GA4 API client initialized\n');

        // Start cron job for daily sync
        if (process.env.ENABLE_CRON !== 'false') {
            console.log('⏰ Starting daily sync cron job...');
            startDailySyncJob();
        } else {
            console.log('⚠️ Cron job disabled (ENABLE_CRON=false)\n');
        }

        // Start Express server
        app.listen(PORT, () => {
            console.log('='.repeat(60));
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`   API: http://localhost:${PORT}/api`);
            console.log(`   Health: http://localhost:${PORT}/health`);
            console.log('='.repeat(60) + '\n');
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// ============================================
// Graceful Shutdown
// ============================================

process.on('SIGTERM', async () => {
    console.log('\n⚠️ SIGTERM received, shutting down gracefully...');

    try {
        await pool.end();
        console.log('✅ Database connections closed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGINT', async () => {
    console.log('\n⚠️ SIGINT received, shutting down gracefully...');

    try {
        await pool.end();
        console.log('✅ Database connections closed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
});

// ============================================
// Start Server
// ============================================

startServer();

module.exports = app;
