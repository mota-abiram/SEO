const { backfillClientData } = require('./src/services/syncService');
const { query } = require('./src/config/database');
require('dotenv').config();

async function backfillAllMissing() {
    try {
        // Fetch all active clients
        const result = await query('SELECT id, name FROM clients WHERE is_active = true');
        const clients = result.rows;

        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 1); // Yesterday
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30); // 30 days ago

        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        console.log(`Starting bulk backfill from ${startStr} to ${endStr}...`);

        for (const client of clients) {
            console.log(`\n>>> Processing ${client.name} (ID: ${client.id})`);

            try {
                const result = await backfillClientData(client.id, startStr, endStr);
                console.log(`- Finished ${client.name}: ${result.successCount} success, ${result.failureCount} failed.`);
            } catch (err) {
                console.error(`- Error processing ${client.name}:`, err.message);
            }
        }

        console.log('\n✅ All clients processed.');
        process.exit(0);
    } catch (error) {
        console.error('Bulk backfill failed:', error);
        process.exit(1);
    }
}

backfillAllMissing();
