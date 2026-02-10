/**
 * Google Analytics 4 Configuration
 * Initializes GA4 Data API client with Workload Identity Federation
 * 
 * Authentication Methods (in order of precedence):
 * 1. Workload Identity Federation (Production - GCP/AWS/Azure)
 * 2. Application Default Credentials (Local development with gcloud auth)
 * 3. Service Account Impersonation (if GOOGLE_IMPERSONATE_SERVICE_ACCOUNT is set)
 * 
 * NO SERVICE ACCOUNT JSON KEYS REQUIRED!
 */

const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config();

/**
 * Initialize Google Auth with Application Default Credentials
 * This automatically uses:
 * - Workload Identity Federation in GCP (Cloud Run, GKE, etc.)
 * - IAM roles in AWS (via Workload Identity Federation)
 * - Managed Identity in Azure (via Workload Identity Federation)
 * - gcloud auth application-default login (local development)
 */
const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    // Use key file if explicitly provided in environment
    ...(process.env.GOOGLE_APPLICATION_CREDENTIALS && {
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS
    }),
    // Optional: Impersonate a service account if needed
    ...(process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT && {
        impersonatedServiceAccount: process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT
    })
});

/**
 * Initialize GA4 client with Workload Identity Federation
 * The workload identity or authenticated user must have:
 * - roles/analytics.viewer on GA4 properties
 * - Or service account impersonation permissions
 */
const analyticsDataClient = new BetaAnalyticsDataClient({
    authClient: auth
});

/**
 * Verify GA4 client initialization and authentication
 */
async function verifyGA4Connection() {
    try {
        // Get the authenticated credentials
        const client = await auth.getClient();
        const projectId = await auth.getProjectId().catch(() => 'N/A');

        console.log('✅ GA4 Data API client initialized');
        console.log(`   Authentication method: ${getAuthMethod()}`);
        console.log(`   Project ID: ${projectId}`);

        if (process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT) {
            console.log(`   Impersonating: ${process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT}`);
        }

        return true;
    } catch (error) {
        console.error('❌ Failed to initialize GA4 client:', error.message);
        console.error('\n💡 Troubleshooting:');
        console.error('   Local development: Run `gcloud auth application-default login`');
        console.error('   GCP Cloud Run: Ensure Workload Identity is configured');
        console.error('   GKE: Ensure Workload Identity binding is set up');
        console.error('   AWS/Azure: Ensure Workload Identity Federation is configured');
        return false;
    }
}

/**
 * Detect which authentication method is being used
 */
function getAuthMethod() {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        return 'Service Account JSON (Legacy - Not Recommended)';
    }

    if (process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT) {
        return 'Service Account Impersonation';
    }

    // Check if running in GCP
    if (process.env.K_SERVICE || process.env.FUNCTION_NAME || process.env.GCP_PROJECT) {
        return 'Workload Identity Federation (GCP)';
    }

    // Check if running in AWS
    if (process.env.AWS_REGION || process.env.AWS_EXECUTION_ENV) {
        return 'Workload Identity Federation (AWS)';
    }

    // Check if running in Azure
    if (process.env.AZURE_CLIENT_ID || process.env.IDENTITY_ENDPOINT) {
        return 'Workload Identity Federation (Azure)';
    }

    // Local development
    return 'Application Default Credentials (gcloud auth)';
}

/**
 * Get the service account email being used (for logging/debugging)
 */
async function getServiceAccountEmail() {
    try {
        const client = await auth.getClient();
        if (client.email) {
            return client.email;
        }
        return 'Unknown (using Workload Identity)';
    } catch (error) {
        return 'Error retrieving service account';
    }
}

module.exports = {
    analyticsDataClient,
    verifyGA4Connection,
    getAuthMethod,
    getServiceAccountEmail
};
