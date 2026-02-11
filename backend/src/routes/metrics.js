/**
 * Metrics Routes
 * Fetch analytics data from database (NOT from GA4 API)
 * Enforces client access control
 */

const express = require('express');
const { query: validationQuery, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken, requireClientAccess } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/metrics
 * Get metrics for a date range
 * Query params: clientId, from (YYYY-MM-DD), to (YYYY-MM-DD)
 */
router.get('/',
    [
        validationQuery('clientId').isInt(),
        validationQuery('from').isDate(),
        validationQuery('to').isDate()
    ],
    requireClientAccess,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Invalid input',
                    details: errors.array()
                });
            }

            const { from, to } = req.query;
            const clientId = req.clientId; // Set by requireClientAccess middleware

            // Fetch metrics from database
            const result = await query(
                `SELECT 
          date,
          sessions,
          users,
          new_users,
          pageviews,
          avg_session_duration,
          bounce_rate,
          organic_sessions,
          synced_at
         FROM daily_metrics
         WHERE client_id = $1 
           AND date >= $2 
           AND date <= $3
         ORDER BY date ASC`,
                [clientId, from, to]
            );

            // Calculate summary statistics
            const metrics = result.rows;
            const summary = calculateSummary(metrics);

            res.json({
                success: true,
                clientId,
                dateRange: { from, to },
                summary,
                data: metrics
            });

        } catch (error) {
            console.error('Get metrics error:', error);
            res.status(500).json({
                error: 'Failed to fetch metrics'
            });
        }
    }
);

/**
 * GET /api/metrics/daily
 * Get last 30 days of metrics (convenience endpoint)
 */
router.get('/daily',
    [validationQuery('clientId').isInt()],
    requireClientAccess,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Invalid input',
                    details: errors.array()
                });
            }

            const clientId = req.clientId;
            const days = parseInt(req.query.days) || 30;

            // Fetch last N days
            const result = await query(
                `SELECT 
          date,
          sessions,
          users,
          new_users,
          pageviews,
          avg_session_duration,
          bounce_rate,
          organic_sessions,
          synced_at
         FROM daily_metrics
         WHERE client_id = $1 
           AND date >= CURRENT_DATE - INTERVAL '${days} days'
         ORDER BY date DESC`,
                [clientId]
            );

            res.json({
                success: true,
                clientId,
                days,
                data: result.rows
            });

        } catch (error) {
            console.error('Get daily metrics error:', error);
            res.status(500).json({
                error: 'Failed to fetch daily metrics'
            });
        }
    }
);

/**
 * GET /api/metrics/summary
 * Get aggregated summary for a date range
 */
router.get('/summary',
    [
        validationQuery('clientId').isInt(),
        validationQuery('from').isDate(),
        validationQuery('to').isDate()
    ],
    requireClientAccess,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Invalid input',
                    details: errors.array()
                });
            }

            const { from, to } = req.query;
            const clientId = req.clientId;

            // Aggregate metrics
            const result = await query(
                `SELECT 
          COUNT(*) as total_days,
          SUM(sessions) as total_sessions,
          SUM(users) as total_users,
          SUM(new_users) as total_new_users,
          SUM(pageviews) as total_pageviews,
          AVG(avg_session_duration) as avg_session_duration,
          AVG(bounce_rate) as avg_bounce_rate,
          SUM(organic_sessions) as total_organic_sessions,
          MIN(date) as first_date,
          MAX(date) as last_date
         FROM daily_metrics
         WHERE client_id = $1 
           AND date >= $2 
           AND date <= $3`,
                [clientId, from, to]
            );

            const summary = result.rows[0];

            // Calculate derived metrics
            const organicPercentage = summary.total_sessions > 0
                ? (summary.total_organic_sessions / summary.total_sessions * 100).toFixed(2)
                : 0;

            res.json({
                success: true,
                clientId,
                dateRange: { from, to },
                summary: {
                    totalDays: parseInt(summary.total_days),
                    totalSessions: parseInt(summary.total_sessions) || 0,
                    totalUsers: parseInt(summary.total_users) || 0,
                    totalNewUsers: parseInt(summary.total_new_users) || 0,
                    totalPageviews: parseInt(summary.total_pageviews) || 0,
                    avgSessionDuration: parseFloat(summary.avg_session_duration) || 0,
                    avgBounceRate: parseFloat(summary.avg_bounce_rate) || 0,
                    totalOrganicSessions: parseInt(summary.total_organic_sessions) || 0,
                    organicPercentage: parseFloat(organicPercentage),
                    firstDate: summary.first_date,
                    lastDate: summary.last_date
                }
            });

        } catch (error) {
            console.error('Get summary error:', error);
            res.status(500).json({
                error: 'Failed to fetch summary'
            });
        }
    }
);

/**
 * GET /api/metrics/export
 * Export metrics as CSV
 */
router.get('/export',
    [
        validationQuery('clientId').isInt(),
        validationQuery('from').isDate(),
        validationQuery('to').isDate()
    ],
    requireClientAccess,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Invalid input',
                    details: errors.array()
                });
            }

            const { from, to } = req.query;
            const clientId = req.clientId;

            // Fetch data
            const result = await query(
                `SELECT 
          date,
          sessions,
          users,
          new_users,
          pageviews,
          avg_session_duration,
          bounce_rate,
          organic_sessions
         FROM daily_metrics
         WHERE client_id = $1 
           AND date >= $2 
           AND date <= $3
         ORDER BY date ASC`,
                [clientId, from, to]
            );

            // Convert to CSV
            const csv = convertToCSV(result.rows);

            // Set headers for file download
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="analytics_${from}_to_${to}.csv"`);
            res.send(csv);

        } catch (error) {
            console.error('Export metrics error:', error);
            res.status(500).json({
                error: 'Failed to export metrics'
            });
        }
    }
);

/**
 * GET /api/metrics/compare
 * Compare two date ranges
 */
router.get('/compare',
    [
        validationQuery('clientId').isInt(),
        validationQuery('from1').isDate(),
        validationQuery('to1').isDate(),
        validationQuery('from2').isDate(),
        validationQuery('to2').isDate()
    ],
    requireClientAccess,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Invalid input',
                    details: errors.array()
                });
            }

            const { from1, to1, from2, to2 } = req.query;
            const clientId = req.clientId;

            // Fetch both periods
            const [period1, period2] = await Promise.all([
                query(
                    `SELECT 
            SUM(sessions) as total_sessions,
            SUM(users) as total_users,
            SUM(organic_sessions) as total_organic_sessions,
            AVG(bounce_rate) as avg_bounce_rate
           FROM daily_metrics
           WHERE client_id = $1 AND date >= $2 AND date <= $3`,
                    [clientId, from1, to1]
                ),
                query(
                    `SELECT 
            SUM(sessions) as total_sessions,
            SUM(users) as total_users,
            SUM(organic_sessions) as total_organic_sessions,
            AVG(bounce_rate) as avg_bounce_rate
           FROM daily_metrics
           WHERE client_id = $1 AND date >= $2 AND date <= $3`,
                    [clientId, from2, to2]
                )
            ]);

            const p1 = period1.rows[0];
            const p2 = period2.rows[0];

            // Calculate percentage changes
            const comparison = {
                sessions: calculateChange(p1.total_sessions, p2.total_sessions),
                users: calculateChange(p1.total_users, p2.total_users),
                organicSessions: calculateChange(p1.total_organic_sessions, p2.total_organic_sessions),
                bounceRate: calculateChange(p1.avg_bounce_rate, p2.avg_bounce_rate)
            };

            res.json({
                success: true,
                clientId,
                period1: { from: from1, to: to1, data: p1 },
                period2: { from: from2, to: to2, data: p2 },
                comparison
            });

        } catch (error) {
            console.error('Compare metrics error:', error);
            res.status(500).json({
                error: 'Failed to compare metrics'
            });
        }
    }
);

/**
 * POST /api/metrics/sync
 * Manually trigger sync of yesterday's data for all clients (Admin only)
 */
router.post('/sync',
    async (req, res) => {
        try {
            // Check if user is admin
            if (req.user.role !== 'admin') {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Only admins can trigger manual sync'
                });
            }

            const { syncYesterday } = require('../services/syncService');

            // Trigger sync in background
            syncYesterday()
                .then(result => {
                    console.log(`✅ Manual sync completed: ${result.successCount}/${result.totalClients} successful`);
                })
                .catch(err => {
                    console.error(`❌ Manual sync failed:`, err);
                });

            res.json({
                success: true,
                message: 'Sync started in background. Check sync_logs table for results.'
            });

        } catch (error) {
            console.error('Trigger sync error:', error);
            res.status(500).json({
                error: 'Failed to trigger sync'
            });
        }
    }
);

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate summary statistics from metrics array
 */
function calculateSummary(metrics) {
    if (metrics.length === 0) {
        return {
            totalSessions: 0,
            totalUsers: 0,
            totalOrganicSessions: 0,
            avgBounceRate: 0,
            totalDays: 0
        };
    }

    const summary = metrics.reduce((acc, m) => ({
        totalSessions: acc.totalSessions + parseInt(m.sessions),
        totalUsers: acc.totalUsers + parseInt(m.users),
        totalOrganicSessions: acc.totalOrganicSessions + parseInt(m.organic_sessions),
        totalBounceRate: acc.totalBounceRate + parseFloat(m.bounce_rate)
    }), {
        totalSessions: 0,
        totalUsers: 0,
        totalOrganicSessions: 0,
        totalBounceRate: 0
    });

    return {
        totalSessions: summary.totalSessions,
        totalUsers: summary.totalUsers,
        totalOrganicSessions: summary.totalOrganicSessions,
        avgBounceRate: (summary.totalBounceRate / metrics.length).toFixed(2),
        totalDays: metrics.length
    };
}

/**
 * Convert data to CSV format
 */
function convertToCSV(data) {
    if (data.length === 0) {
        return 'No data available';
    }

    // Headers
    const headers = Object.keys(data[0]).join(',');

    // Rows
    const rows = data.map(row =>
        Object.values(row).map(val =>
            typeof val === 'string' ? `"${val}"` : val
        ).join(',')
    );

    return [headers, ...rows].join('\n');
}

/**
 * Calculate percentage change
 */
function calculateChange(current, previous) {
    if (!previous || previous === 0) {
        return { change: 0, percentage: 0 };
    }

    const change = current - previous;
    const percentage = ((change / previous) * 100).toFixed(2);

    return {
        current: parseFloat(current) || 0,
        previous: parseFloat(previous) || 0,
        change: parseFloat(change) || 0,
        percentage: parseFloat(percentage)
    };
}

module.exports = router;
