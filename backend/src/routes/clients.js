/**
 * Clients Routes
 * Manage GA4 client properties (Admin only)
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validatePropertyAccess } = require('../services/ga4Service');

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/clients
 * List all clients
 */
router.get('/', async (req, res) => {
    try {
        const result = await query(
            `SELECT 
        c.id, 
        c.name, 
        c.ga_property_id, 
        c.timezone, 
        c.is_active,
        c.created_at,
        COUNT(dm.id) as total_records,
        MAX(dm.date) as latest_sync_date
       FROM clients c
       LEFT JOIN daily_metrics dm ON c.id = dm.client_id
       GROUP BY c.id
       ORDER BY c.name`
        );

        res.json({
            success: true,
            clients: result.rows
        });

    } catch (error) {
        console.error('List clients error:', error);
        res.status(500).json({
            error: 'Failed to fetch clients'
        });
    }
});

/**
 * GET /api/clients/:id
 * Get single client details
 */
router.get('/:id', async (req, res) => {
    try {
        const clientId = parseInt(req.params.id);

        const result = await query(
            `SELECT 
        c.*,
        COUNT(dm.id) as total_records,
        MIN(dm.date) as earliest_date,
        MAX(dm.date) as latest_date,
        SUM(dm.sessions) as total_sessions
       FROM clients c
       LEFT JOIN daily_metrics dm ON c.id = dm.client_id
       WHERE c.id = $1
       GROUP BY c.id`,
            [clientId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Client not found'
            });
        }

        res.json({
            success: true,
            client: result.rows[0]
        });

    } catch (error) {
        console.error('Get client error:', error);
        res.status(500).json({
            error: 'Failed to fetch client'
        });
    }
});

/**
 * POST /api/clients
 * Create new client
 */
router.post('/',
    [
        body('name').trim().notEmpty(),
        body('gaPropertyId').trim().notEmpty().isNumeric(),
        body('timezone').optional().trim()
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

            const { name, gaPropertyId, timezone = 'UTC' } = req.body;

            // Validate GA4 property access
            console.log(`🔍 Validating GA4 property access: ${gaPropertyId}`);
            const hasAccess = await validatePropertyAccess(gaPropertyId);

            if (!hasAccess) {
                const { getServiceAccountEmail } = require('../config/ga4');
                const email = await getServiceAccountEmail();
                return res.status(400).json({
                    error: 'Cannot access GA4 property',
                    message: `Please ensure the service account email has "Viewer" access in GA4.`,
                    serviceAccountEmail: email,
                    propertyId: gaPropertyId
                });
            }

            // Check if property already exists
            const existingResult = await query(
                'SELECT id FROM clients WHERE ga_property_id = $1',
                [gaPropertyId]
            );

            if (existingResult.rows.length > 0) {
                return res.status(400).json({
                    error: 'This GA4 property is already registered'
                });
            }

            // Create client
            const result = await query(
                `INSERT INTO clients (name, ga_property_id, timezone)
         VALUES ($1, $2, $3)
         RETURNING *`,
                [name, gaPropertyId, timezone]
            );

            const client = result.rows[0];

            console.log(`✅ Created client: ${client.name} (ID: ${client.id})`);

            // Trigger background backfill for the last 30 days
            const { backfillClientData } = require('../services/syncService');
            const endDate = new Date();
            endDate.setDate(endDate.getDate() - 1); // Yesterday
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30); // 30 days ago

            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            // Run in background (don't await)
            backfillClientData(client.id, startStr, endStr)
                .then(result => console.log(`🌊 Background backfill finished for ${client.name}: ${result.successCount} days`))
                .catch(err => console.error(`❌ Background backfill failed for ${client.name}:`, err.message));

            res.status(201).json({
                success: true,
                message: 'Client created successfully. Data is being synced in the background.',
                client
            });

        } catch (error) {
            console.error('Create client error:', error);
            res.status(500).json({
                error: 'Failed to create client'
            });
        }
    }
);

/**
 * PUT /api/clients/:id
 * Update client
 */
router.put('/:id',
    [
        body('name').optional().trim().notEmpty(),
        body('timezone').optional().trim(),
        body('isActive').optional().isBoolean()
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

            const clientId = parseInt(req.params.id);
            const { name, timezone, isActive } = req.body;

            // Build update query dynamically
            const updates = [];
            const values = [];
            let paramCount = 1;

            if (name !== undefined) {
                updates.push(`name = $${paramCount++}`);
                values.push(name);
            }
            if (timezone !== undefined) {
                updates.push(`timezone = $${paramCount++}`);
                values.push(timezone);
            }
            if (isActive !== undefined) {
                updates.push(`is_active = $${paramCount++}`);
                values.push(isActive);
            }

            if (updates.length === 0) {
                return res.status(400).json({
                    error: 'No fields to update'
                });
            }

            updates.push(`updated_at = NOW()`);
            values.push(clientId);

            const result = await query(
                `UPDATE clients 
         SET ${updates.join(', ')}
         WHERE id = $${paramCount}
         RETURNING *`,
                values
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Client not found'
                });
            }

            res.json({
                success: true,
                message: 'Client updated successfully',
                client: result.rows[0]
            });

        } catch (error) {
            console.error('Update client error:', error);
            res.status(500).json({
                error: 'Failed to update client'
            });
        }
    }
);

/**
 * DELETE /api/clients/:id
 * Delete client (soft delete by default)
 */
router.delete('/:id', async (req, res) => {
    try {
        const clientId = parseInt(req.params.id);
        const hardDelete = req.query.hard === 'true';

        if (hardDelete) {
            // Hard delete (also deletes all related data due to CASCADE)
            const result = await query(
                'DELETE FROM clients WHERE id = $1 RETURNING *',
                [clientId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Client not found'
                });
            }

            console.log(`🗑️ Hard deleted client: ${result.rows[0].name}`);

            res.json({
                success: true,
                message: 'Client permanently deleted'
            });
        } else {
            // Soft delete (set is_active = false)
            const result = await query(
                `UPDATE clients 
         SET is_active = false, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
                [clientId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Client not found'
                });
            }

            console.log(`🔒 Deactivated client: ${result.rows[0].name}`);

            res.json({
                success: true,
                message: 'Client deactivated successfully'
            });
        }

    } catch (error) {
        console.error('Delete client error:', error);
        res.status(500).json({
            error: 'Failed to delete client'
        });
    }
});

module.exports = router;
