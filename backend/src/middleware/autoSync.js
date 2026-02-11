/**
 * Auto-sync middleware
 * Triggers sync if last sync was more than 12 hours ago
 * Useful for Render free tier where cron jobs don't run when service is asleep
 */

const { syncYesterday } = require('../services/syncService');
const { query } = require('../config/database');

let lastSyncCheck = null;
let syncInProgress = false;

async function autoSyncMiddleware(req, res, next) {
    try {
        // Only check on dashboard/metrics requests
        if (!req.path.includes('/metrics') && !req.path.includes('/clients')) {
            return next();
        }

        // Only check every 30 minutes to avoid spam
        const now = Date.now();
        if (lastSyncCheck && (now - lastSyncCheck) < 30 * 60 * 1000) {
            return next();
        }

        lastSyncCheck = now;

        // Check for any active clients missing data for yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const result = await query(
            `SELECT c.id, c.name 
       FROM clients c
       LEFT JOIN daily_metrics dm ON c.id = dm.client_id AND dm.date = $1
       WHERE c.is_active = true AND dm.id IS NULL
       LIMIT 1`,
            [yesterdayStr]
        );

        if (result.rows.length > 0) {
            // At least one client is missing yesterday's data - trigger sync!
            console.log(`⏰ Missing data for yesterday (${yesterdayStr}) for client: ${result.rows[0].name}. Triggering sync...`);
            triggerBackgroundSync();
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
