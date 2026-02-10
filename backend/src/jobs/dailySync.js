/**
 * Daily Sync Cron Job
 * Automatically fetches yesterday's GA4 data for all clients
 * Runs daily at configured time (default: 5:00 AM)
 */

const cron = require('node-cron');
const { syncYesterday } = require('../services/syncService');
require('dotenv').config();

/**
 * Initialize and start the daily sync cron job
 */
function startDailySyncJob() {
    // Get cron schedule from environment or use default (5 AM daily)
    const schedule = process.env.SYNC_CRON_SCHEDULE || '0 5 * * *';

    console.log(`⏰ Daily sync job scheduled: ${schedule}`);
    console.log(`   Timezone: ${process.env.SYNC_TIMEZONE || 'System default'}`);

    // Validate cron expression
    if (!cron.validate(schedule)) {
        console.error('❌ Invalid cron schedule:', schedule);
        return null;
    }

    // Schedule the job
    const job = cron.schedule(schedule, async () => {
        console.log('\n⏰ Cron job triggered - Starting daily sync...');

        try {
            const result = await syncYesterday();

            if (result.success) {
                console.log('✅ Daily sync completed successfully');
            } else {
                console.error('⚠️ Daily sync completed with errors');
            }
        } catch (error) {
            console.error('❌ Daily sync failed:', error);
        }
    }, {
        scheduled: true,
        timezone: process.env.SYNC_TIMEZONE || 'UTC'
    });

    console.log('✅ Daily sync job started successfully\n');

    return job;
}

/**
 * Run sync immediately (for testing/manual trigger)
 */
async function runSyncNow() {
    console.log('🚀 Running sync manually...\n');

    try {
        const result = await syncYesterday();
        return result;
    } catch (error) {
        console.error('❌ Manual sync failed:', error);
        throw error;
    }
}

module.exports = {
    startDailySyncJob,
    runSyncNow
};
