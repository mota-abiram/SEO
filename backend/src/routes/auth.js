/**
 * Authentication Routes
 * Handles user login, logout, and token management
 */

const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login',
    // Validation
    [
        body('email').isEmail().normalizeEmail(),
        body('password').notEmpty()
    ],
    async (req, res) => {
        try {
            // Check validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Invalid input',
                    details: errors.array()
                });
            }

            const { email, password } = req.body;

            // Find user by email
            const result = await query(
                `SELECT id, email, password_hash, role, client_id, is_active 
         FROM users 
         WHERE email = $1`,
                [email]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({
                    error: 'Invalid email or password'
                });
            }

            const user = result.rows[0];

            // Check if account is active
            if (!user.is_active) {
                return res.status(403).json({
                    error: 'Account is disabled'
                });
            }

            // Verify password
            const isValidPassword = await bcrypt.compare(password, user.password_hash);

            if (!isValidPassword) {
                return res.status(401).json({
                    error: 'Invalid email or password'
                });
            }

            // Update last login
            await query(
                'UPDATE users SET last_login = NOW() WHERE id = $1',
                [user.id]
            );

            // Generate JWT token
            const token = generateToken(user);

            // Return user info and token
            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    clientId: user.client_id
                }
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                error: 'Login failed'
            });
        }
    }
);

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me', authenticateToken, async (req, res) => {
    try {
        // Fetch full user details
        const result = await query(
            `SELECT u.id, u.email, u.role, u.client_id, u.last_login,
              c.name as client_name
       FROM users u
       LEFT JOIN clients c ON u.client_id = c.id
       WHERE u.id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        const user = result.rows[0];

        res.json({
            id: user.id,
            email: user.email,
            role: user.role,
            clientId: user.client_id,
            clientName: user.client_name,
            lastLogin: user.last_login
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            error: 'Failed to fetch user information'
        });
    }
});

/**
 * POST /api/auth/logout
 * Logout user (client-side should delete token)
 */
router.post('/logout', authenticateToken, (req, res) => {
    // With JWT, logout is handled client-side by deleting the token
    // This endpoint exists for consistency and future enhancements
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password',
    authenticateToken,
    [
        body('currentPassword').notEmpty(),
        body('newPassword').isLength({ min: 8 })
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Invalid input',
                    details: errors.array()
                });
            }

            const { currentPassword, newPassword } = req.body;

            // Get current password hash
            const result = await query(
                'SELECT password_hash FROM users WHERE id = $1',
                [req.user.id]
            );

            const user = result.rows[0];

            // Verify current password
            const isValid = await bcrypt.compare(currentPassword, user.password_hash);

            if (!isValid) {
                return res.status(401).json({
                    error: 'Current password is incorrect'
                });
            }

            // Hash new password
            const newHash = await bcrypt.hash(newPassword, 10);

            // Update password
            await query(
                'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
                [newHash, req.user.id]
            );

            res.json({
                success: true,
                message: 'Password changed successfully'
            });

        } catch (error) {
            console.error('Change password error:', error);
            res.status(500).json({
                error: 'Failed to change password'
            });
        }
    }
);

module.exports = router;
