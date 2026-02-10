const { backfillClientData } = require('./src/services/syncService');

async function runBackfill() {
    try {
        const clientId = 2; // ID of 'amara deevyashakti' fetched from earlier command output

        // Calculate date range for the last 30 days
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 1); // Yesterday
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30); // 30 days ago

        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        console.log(`Starting backfill for client ID ${clientId} from ${startStr} to ${endStr}...`);

        const result = await backfillClientData(clientId, startStr, endStr);

        console.log('Backfill results:');
        console.log(`- Success: ${result.successCount}`);
        console.log(`- Failed: ${result.failureCount}`);

        process.exit(0);
    } catch (error) {
        console.error('Backfill failed:', error);
        process.exit(1);
    }
}

runBackfill();
