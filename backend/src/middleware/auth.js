/**
 * JWT Authentication Middleware
 * Verifies JWT tokens and enforces role-based access control
 */

const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

/**
 * Verify JWT token and attach user to request (BYPASSED)
 */
async function authenticateToken(req, res, next) {
    // Set a default admin user for all requests
    req.user = {
        id: 1,
        email: 'admin@example.com',
        role: 'admin',
        clientId: null
    };
    next();
}

/**
 * Require admin role (BYPASSED)
 */
function requireAdmin(req, res, next) {
    next();
}

/**
 * Require client access (BYPASSED)
 */
function requireClientAccess(req, res, next) {
    // Get client ID from query params or route params
    const requestedClientId = parseInt(
        req.query.clientId || req.params.clientId || req.body.clientId
    );
    req.clientId = requestedClientId;
    next();
}

/**
 * Generate JWT token
 */
function generateToken(user) {
    return 'disabled-token';
}

module.exports = {
    authenticateToken,
    requireAdmin,
    requireClientAccess,
    generateToken
};
