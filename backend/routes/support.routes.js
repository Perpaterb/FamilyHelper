/**
 * Support Routes
 *
 * Routes for support-only operations for managing users.
 * All routes require support user access.
 *
 * @module routes/support
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth.middleware');
const supportController = require('../controllers/support.controller');

/**
 * GET /support/check-access
 * Check if current user has support access
 *
 * Response:
 * - 200: { success: true, isSupportUser: boolean }
 */
router.get('/check-access', requireAuth, supportController.checkAccess);

/**
 * GET /support/users
 * List all users with pagination and search
 *
 * Query Parameters:
 * - search: Search by email or display name
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 *
 * Response:
 * - 200: { success: true, users: [...], pagination: {...} }
 * - 403: Support access required
 */
router.get(
  '/users',
  requireAuth,
  supportController.requireSupportUser,
  supportController.listUsers
);

/**
 * PUT /support/users/:userId/subscription
 * Grant or revoke unlimited subscription access
 *
 * Request Body:
 * - grant: boolean (true to grant, false to revoke)
 *
 * Response:
 * - 200: { success: true, message: string }
 * - 403: Support access required
 * - 404: User not found
 */
router.put(
  '/users/:userId/subscription',
  requireAuth,
  supportController.requireSupportUser,
  supportController.updateSubscription
);

/**
 * PUT /support/users/:userId/support-access
 * Grant or revoke support user access
 *
 * Request Body:
 * - grant: boolean (true to grant, false to revoke)
 *
 * Response:
 * - 200: { success: true, message: string }
 * - 400: Cannot remove own support access
 * - 403: Support access required
 * - 404: User not found
 */
router.put(
  '/users/:userId/support-access',
  requireAuth,
  supportController.requireSupportUser,
  supportController.updateSupportAccess
);

/**
 * PUT /support/users/:userId/lock
 * Lock or unlock a user account
 *
 * Request Body:
 * - lock: boolean (true to lock, false to unlock)
 * - reason: string (optional, reason for locking)
 *
 * Response:
 * - 200: { success: true, message: string }
 * - 400: Cannot lock own account
 * - 403: Support access required
 * - 404: User not found
 */
router.put(
  '/users/:userId/lock',
  requireAuth,
  supportController.requireSupportUser,
  supportController.updateLockStatus
);

/**
 * PUT /support/users/:userId/subscription-end-date
 * Set a specific subscription end date for a user
 *
 * Request Body:
 * - subscriptionEndDate: ISO date string (must be in the future)
 *
 * Response:
 * - 200: { success: true, message: string, subscriptionEndDate: date }
 * - 400: Date must be in the future
 * - 403: Support access required
 * - 404: User not found
 */
router.put(
  '/users/:userId/subscription-end-date',
  requireAuth,
  supportController.requireSupportUser,
  supportController.updateSubscriptionEndDate
);

/**
 * PUT /support/users/:userId/expire-subscription
 * Expire a user's subscription (set end date to yesterday)
 * Also handles group admin expiry logic:
 * - Groups where they're the only admin: group becomes read-only
 * - Groups with other admins: their role changes from admin to adult
 *
 * Response:
 * - 200: { success: true, message: string, groupsAffected: {...} }
 * - 403: Support access required
 * - 404: User not found
 */
router.put(
  '/users/:userId/expire-subscription',
  requireAuth,
  supportController.requireSupportUser,
  supportController.expireSubscription
);

/**
 * GET /support/audit-logs
 * Get support audit logs with pagination and filtering
 *
 * Query Parameters:
 * - search: Search by email
 * - action: Filter by action type
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 *
 * Response:
 * - 200: { success: true, logs: [...], pagination: {...} }
 * - 403: Support access required
 */
router.get(
  '/audit-logs',
  requireAuth,
  supportController.requireSupportUser,
  supportController.getAuditLogs
);

module.exports = router;
