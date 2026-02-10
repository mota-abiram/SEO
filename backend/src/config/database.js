/**
 * Database Configuration
 * PostgreSQL connection pool with production-ready settings
 */

const { Pool } = require('pg');
require('dotenv').config();

// Create connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Production settings
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection cannot be established
    // SSL configuration (enable for production)
    ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false // Set to true with proper certificates in production
    } : false
});

// Test connection on startup
pool.on('connect', () => {
    console.log('✅ Database connected');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
    process.exit(-1);
});

/**
 * Execute a query with error handling
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;

        // Log slow queries (> 1 second)
        if (duration > 1000) {
            console.warn(`⚠️ Slow query (${duration}ms):`, text.substring(0, 100));
        }

        return res;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} Database client
 */
async function getClient() {
    const client = await pool.connect();
    const query = client.query;
    const release = client.release;

    // Set a timeout of 5 seconds, after which we will log this client's last query
    const timeout = setTimeout(() => {
        console.error('⚠️ A client has been checked out for more than 5 seconds!');
    }, 5000);

    // Monkey patch the query method to keep track of the last query executed
    client.query = (...args) => {
        client.lastQuery = args;
        return query.apply(client, args);
    };

    // Monkey patch the release method to clear our timeout
    client.release = () => {
        clearTimeout(timeout);
        // Set the methods back to their old un-monkey-patched version
        client.query = query;
        client.release = release;
        return release.apply(client);
    };

    return client;
}

/**
 * Execute a transaction
 * @param {Function} callback - Async function that receives client
 * @returns {Promise<any>} Result of callback
 */
async function transaction(callback) {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    query,
    getClient,
    transaction,
    pool
};
