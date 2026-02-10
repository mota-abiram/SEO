/**
 * Sync Service
 * Coordinates daily GA4 data synchronization for all clients
 * Handles database operations and error logging
 */

const { query, transaction } = require('../config/database');
const { fetchDailyMetrics } = require('./ga4Service');

/**
 * Sync metrics for a single client and date
 * @param {Object} client - Client object with id, name, ga_property_id
 * @param {string} date - Date to sync (YYYY-MM-DD)
 * @returns {Promise<Object>} Sync result
 */
async function syncClientMetrics(client, date) {
    const startTime = Date.now();

    try {
        console.log(`🔄 Syncing client: ${client.name} (${client.ga_property_id}) for ${date}`);

        // Fetch metrics from GA4
        const metrics = await fetchDailyMetrics(client.ga_property_id, date);

        // Store in database (upsert: insert or update if exists)
        await query(
            `INSERT INTO daily_metrics (
        client_id, date, sessions, users, new_users, pageviews,
        avg_session_duration, bounce_rate, organic_sessions, synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (client_id, date) 
      DO UPDATE SET
        sessions = EXCLUDED.sessions,
        users = EXCLUDED.users,
        new_users = EXCLUDED.new_users,
        pageviews = EXCLUDED.pageviews,
        avg_session_duration = EXCLUDED.avg_session_duration,
        bounce_rate = EXCLUDED.bounce_rate,
        organic_sessions = EXCLUDED.organic_sessions,
        synced_at = NOW()`,
            [
                client.id,
                date,
                metrics.sessions,
                metrics.users,
                metrics.newUsers,
                metrics.pageviews,
                metrics.avgSessionDuration,
                metrics.bounceRate,
                metrics.organicSessions
            ]
        );

        const executionTime = Date.now() - startTime;

        // Log success
        await logSync(client.id, date, 'success', 1, null, executionTime);

        console.log(`✅ Successfully synced ${client.name} for ${date} (${executionTime}ms)`);

        return {
            success: true,
            clientId: client.id,
            clientName: client.name,
            date,
            metrics,
            executionTime
        };

    } catch (error) {
        const executionTime = Date.now() - startTime;

        // Log failure
        await logSync(client.id, date, 'failed', 0, error.message, executionTime);

        console.error(`❌ Failed to sync ${client.name} for ${date}:`, error.message);

        return {
            success: false,
            clientId: client.id,
            clientName: client.name,
            date,
            error: error.message,
            executionTime
        };
    }
}

/**
 * Sync all active clients for a specific date
 * @param {string} date - Date to sync (YYYY-MM-DD)
 * @returns {Promise<Object>} Summary of sync results
 */
async function syncAllClients(date) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Starting daily sync for ${date}`);
    console.log(`${'='.repeat(60)}\n`);

    const startTime = Date.now();

    try {
        // Fetch all active clients
        const result = await query(
            `SELECT id, name, ga_property_id, timezone 
       FROM clients 
       WHERE is_active = true 
       ORDER BY name`
        );

        const clients = result.rows;

        if (clients.length === 0) {
            console.log('⚠️ No active clients found. Nothing to sync.');
            return {
                success: true,
                totalClients: 0,
                successCount: 0,
                failureCount: 0,
                results: []
            };
        }

        console.log(`📋 Found ${clients.length} active client(s) to sync\n`);

        // Sync each client sequentially to avoid rate limits
        const results = [];
        for (const client of clients) {
            const result = await syncClientMetrics(client, date);
            results.push(result);

            // Small delay between clients to be respectful of API limits
            await sleep(500);
        }

        // Calculate summary
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;
        const totalTime = Date.now() - startTime;

        console.log(`\n${'='.repeat(60)}`);
        console.log(`✅ Sync completed for ${date}`);
        console.log(`   Total clients: ${clients.length}`);
        console.log(`   Successful: ${successCount}`);
        console.log(`   Failed: ${failureCount}`);
        console.log(`   Total time: ${totalTime}ms`);
        console.log(`${'='.repeat(60)}\n`);

        return {
            success: failureCount === 0,
            date,
            totalClients: clients.length,
            successCount,
            failureCount,
            totalTime,
            results
        };

    } catch (error) {
        console.error('❌ Fatal error during sync:', error);
        throw error;
    }
}

/**
 * Sync yesterday's data for all clients
 * This is the main function called by the cron job
 * @returns {Promise<Object>} Sync summary
 */
async function syncYesterday() {
    const yesterday = getYesterdayDate();
    return await syncAllClients(yesterday);
}

/**
 * Backfill historical data for a client
 * @param {number} clientId - Client ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Backfill summary
 */
async function backfillClientData(clientId, startDate, endDate) {
    console.log(`🔄 Starting backfill for client ${clientId}: ${startDate} to ${endDate}`);

    try {
        // Get client info
        const clientResult = await query(
            'SELECT id, name, ga_property_id FROM clients WHERE id = $1',
            [clientId]
        );

        if (clientResult.rows.length === 0) {
            throw new Error(`Client ${clientId} not found`);
        }

        const client = clientResult.rows[0];

        // Generate date range
        const dates = generateDateRange(startDate, endDate);
        console.log(`📅 Backfilling ${dates.length} days`);

        // Sync each date
        const results = [];
        for (const date of dates) {
            const result = await syncClientMetrics(client, date);
            results.push(result);

            // Delay to respect API limits
            await sleep(1000);
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        console.log(`✅ Backfill completed: ${successCount} success, ${failureCount} failed`);

        return {
            success: true,
            clientId,
            startDate,
            endDate,
            totalDays: dates.length,
            successCount,
            failureCount,
            results
        };

    } catch (error) {
        console.error('❌ Backfill error:', error);
        throw error;
    }
}

/**
 * Log sync execution to database
 * @param {number} clientId - Client ID
 * @param {string} syncDate - Date being synced
 * @param {string} status - 'success' | 'failed' | 'partial'
 * @param {number} recordsSynced - Number of records synced
 * @param {string} errorMessage - Error message if failed
 * @param {number} executionTime - Execution time in ms
 */
async function logSync(clientId, syncDate, status, recordsSynced, errorMessage, executionTime) {
    try {
        await query(
            `INSERT INTO sync_logs (
        client_id, sync_date, status, records_synced, 
        error_message, execution_time_ms
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [clientId, syncDate, status, recordsSynced, errorMessage, executionTime]
        );
    } catch (error) {
        console.error('Failed to log sync:', error);
    }
}

/**
 * Get yesterday's date in YYYY-MM-DD format
 * @returns {string} Yesterday's date
 */
function getYesterdayDate() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
}

/**
 * Generate array of dates between start and end (inclusive)
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Array<string>} Array of dates
 */
function generateDateRange(startDate, endDate) {
    const dates = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
    }

    return dates;
}

/**
 * Sleep helper
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    syncClientMetrics,
    syncAllClients,
    syncYesterday,
    backfillClientData
};
