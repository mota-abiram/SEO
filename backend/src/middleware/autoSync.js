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

        // Check when last sync happened
        const result = await query(
            `SELECT MAX(created_at) as last_sync 
       FROM sync_logs 
       WHERE status = 'success'`
        );

        const lastSync = result.rows[0]?.last_sync;

        if (!lastSync) {
            // No sync ever - trigger one
            console.log('🔄 No previous sync found. Triggering initial sync...');
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
