/**
 * Google Analytics 4 Service
 * Handles all interactions with GA4 Data API
 * Fetches metrics for specified date ranges and applies filters
 */

const { analyticsDataClient } = require('../config/ga4');

/**
 * Fetch daily metrics from GA4 for a specific date
 * @param {string} propertyId - GA4 Property ID (e.g., "123456789")
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} Metrics object
 */
async function fetchDailyMetrics(propertyId, date) {
    try {
        console.log(`📊 Fetching GA4 data for property ${propertyId}, date: ${date}`);

        // Construct the property path
        const property = `properties/${propertyId}`;

        // Define metrics to fetch
        const metrics = [
            { name: 'sessions' },
            { name: 'totalUsers' },
            { name: 'newUsers' },
            { name: 'screenPageViews' }, // GA4 uses screenPageViews instead of pageviews
            { name: 'averageSessionDuration' },
            { name: 'bounceRate' }
        ];

        // Define dimensions (we need date even though we're querying a single day)
        const dimensions = [
            { name: 'date' }
        ];

        // Fetch total metrics (all traffic)
        const [totalResponse] = await analyticsDataClient.runReport({
            property,
            dateRanges: [
                {
                    startDate: date,
                    endDate: date
                }
            ],
            dimensions,
            metrics
        });

        // Fetch organic search metrics (filtered)
        const [organicResponse] = await analyticsDataClient.runReport({
            property,
            dateRanges: [
                {
                    startDate: date,
                    endDate: date
                }
            ],
            dimensions,
            metrics: [
                { name: 'sessions' }
            ],
            // Filter for Organic Search channel
            dimensionFilter: {
                filter: {
                    fieldName: 'sessionDefaultChannelGroup',
                    stringFilter: {
                        matchType: 'EXACT',
                        value: 'Organic Search'
                    }
                }
            }
        });

        // Parse total metrics
        const totalMetrics = parseMetricsResponse(totalResponse);

        // Parse organic sessions
        const organicSessions = parseOrganicSessions(organicResponse);

        // Combine results
        const result = {
            date,
            sessions: totalMetrics.sessions,
            users: totalMetrics.users,
            newUsers: totalMetrics.newUsers,
            pageviews: totalMetrics.pageviews,
            avgSessionDuration: totalMetrics.avgSessionDuration,
            bounceRate: totalMetrics.bounceRate,
            organicSessions
        };

        console.log(`✅ Successfully fetched metrics for ${date}:`, result);
        return result;

    } catch (error) {
        console.error(`❌ Error fetching GA4 data for property ${propertyId}:`, error.message);

        // Handle specific GA4 API errors
        if (error.code === 'PERMISSION_DENIED') {
            throw new Error(`Permission denied for property ${propertyId}. Ensure service account has Viewer access.`);
        }
        if (error.code === 'INVALID_ARGUMENT') {
            throw new Error(`Invalid property ID or date format: ${propertyId}, ${date}`);
        }
        if (error.code === 'RESOURCE_EXHAUSTED') {
            throw new Error('GA4 API quota exceeded. Please try again later.');
        }

        if (error.message.includes('invalid_rapt')) {
            throw new Error('Google Cloud session expired. Please run "gcloud auth application-default login" to re-authenticate.');
        }

        throw error;
    }
}

/**
 * Parse GA4 API response for total metrics
 * @param {Object} response - GA4 API response
 * @returns {Object} Parsed metrics
 */
function parseMetricsResponse(response) {
    // Handle empty response
    if (!response.rows || response.rows.length === 0) {
        return {
            sessions: 0,
            users: 0,
            newUsers: 0,
            pageviews: 0,
            avgSessionDuration: 0,
            bounceRate: 0
        };
    }

    // GA4 returns data in rows, we expect only one row for a single date
    const row = response.rows[0];
    const metricValues = row.metricValues;

    return {
        sessions: parseInt(metricValues[0].value) || 0,
        users: parseInt(metricValues[1].value) || 0,
        newUsers: parseInt(metricValues[2].value) || 0,
        pageviews: parseInt(metricValues[3].value) || 0,
        avgSessionDuration: parseFloat(metricValues[4].value) || 0,
        bounceRate: parseFloat(metricValues[5].value) * 100 || 0 // Convert to percentage
    };
}

/**
 * Parse organic sessions from filtered response
 * @param {Object} response - GA4 API response
 * @returns {number} Organic sessions count
 */
function parseOrganicSessions(response) {
    if (!response.rows || response.rows.length === 0) {
        return 0;
    }

    const row = response.rows[0];
    return parseInt(row.metricValues[0].value) || 0;
}

/**
 * Fetch metrics for a date range
 * @param {string} propertyId - GA4 Property ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of daily metrics
 */
async function fetchMetricsRange(propertyId, startDate, endDate) {
    try {
        console.log(`📊 Fetching GA4 data range for property ${propertyId}: ${startDate} to ${endDate}`);

        const property = `properties/${propertyId}`;

        // Fetch data with date dimension to get daily breakdown
        const [response] = await analyticsDataClient.runReport({
            property,
            dateRanges: [
                {
                    startDate,
                    endDate
                }
            ],
            dimensions: [
                { name: 'date' }
            ],
            metrics: [
                { name: 'sessions' },
                { name: 'totalUsers' },
                { name: 'newUsers' },
                { name: 'screenPageViews' },
                { name: 'averageSessionDuration' },
                { name: 'bounceRate' }
            ],
            orderBys: [
                {
                    dimension: {
                        dimensionName: 'date'
                    }
                }
            ]
        });

        // Parse each row as a daily metric
        const dailyMetrics = response.rows.map(row => {
            const date = formatGA4Date(row.dimensionValues[0].value);
            const metricValues = row.metricValues;

            return {
                date,
                sessions: parseInt(metricValues[0].value) || 0,
                users: parseInt(metricValues[1].value) || 0,
                newUsers: parseInt(metricValues[2].value) || 0,
                pageviews: parseInt(metricValues[3].value) || 0,
                avgSessionDuration: parseFloat(metricValues[4].value) || 0,
                bounceRate: parseFloat(metricValues[5].value) * 100 || 0
            };
        });

        console.log(`✅ Fetched ${dailyMetrics.length} days of data`);
        return dailyMetrics;

    } catch (error) {
        if (error.message.includes('invalid_rapt')) {
            throw new Error('Google Cloud session expired. Please run "gcloud auth application-default login" to re-authenticate.');
        }
        throw error;
    }
}

/**
 * Format GA4 date (YYYYMMDD) to SQL date (YYYY-MM-DD)
 * @param {string} ga4Date - Date in YYYYMMDD format
 * @returns {string} Date in YYYY-MM-DD format
 */
function formatGA4Date(ga4Date) {
    const year = ga4Date.substring(0, 4);
    const month = ga4Date.substring(4, 6);
    const day = ga4Date.substring(6, 8);
    return `${year}-${month}-${day}`;
}

/**
 * Validate GA4 property access
 * @param {string} propertyId - GA4 Property ID
 * @returns {Promise<boolean>} True if accessible
 */
async function validatePropertyAccess(propertyId) {
    try {
        const property = `properties/${propertyId}`;

        // Try to fetch metadata (lightweight request)
        await analyticsDataClient.getMetadata({
            name: `${property}/metadata`
        });

        return true;
    } catch (error) {
        console.error(`❌ Cannot access property ${propertyId}:`, error.message);
        if (error.message.includes('invalid_rapt')) {
            console.error('💡 Hint: Run "gcloud auth application-default login" to re-authenticate.');
        }
        return false;
    }
}

module.exports = {
    fetchDailyMetrics,
    fetchMetricsRange,
    validatePropertyAccess
};
