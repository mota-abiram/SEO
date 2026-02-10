/**
 * JWT Authentication Middleware
 * Verifies JWT tokens and enforces role-based access control
 */

const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

/**
 * Verify JWT token and attach user to request
 */
async function authenticateToken(req, res, next) {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                error: 'Access denied. No token provided.'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Fetch fresh user data from database
        const result = await query(
            `SELECT id, email, role, client_id, is_active 
       FROM users 
       WHERE id = $1`,
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                error: 'Invalid token. User not found.'
            });
        }

        const user = result.rows[0];

        // Check if user is active
        if (!user.is_active) {
            return res.status(403).json({
                error: 'Account is disabled.'
            });
        }

        // Attach user to request
        req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            clientId: user.client_id
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Invalid token.'
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired.'
            });
        }

        console.error('Auth middleware error:', error);
        res.status(500).json({
            error: 'Authentication failed.'
        });
    }
}

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Access denied. Admin privileges required.'
        });
    }
    next();
}

/**
 * Require client access (admin or specific client)
 * Validates that user can access the requested client's data
 */
function requireClientAccess(req, res, next) {
    // Get client ID from query params or route params
    const requestedClientId = parseInt(
        req.query.clientId || req.params.clientId || req.body.clientId
    );

    if (!requestedClientId) {
        return res.status(400).json({
            error: 'Client ID is required.'
        });
    }

    // Admins can access any client
    if (req.user.role === 'admin') {
        req.clientId = requestedClientId;
        return next();
    }

    // Client users can only access their own data
    if (req.user.role === 'client' && req.user.clientId === requestedClientId) {
        req.clientId = requestedClientId;
        return next();
    }

    // Access denied
    return res.status(403).json({
        error: 'Access denied. You do not have permission to access this client.'
    });
}

/**
 * Generate JWT token
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
function generateToken(user) {
    const payload = {
        userId: user.id,
        email: user.email,
        role: user.role
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });
}

module.exports = {
    authenticateToken,
    requireAdmin,
    requireClientAccess,
    generateToken
};
