/**
 * Subscription Routes
 *
 * Routes for Stripe subscription management.
 */

const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { requireAuth } = require('../middleware/auth.middleware');

/**
 * GET /subscriptions/pricing
 * Get subscription pricing information
 *
 * Response:
 * - 200: Pricing information returned
 * - 500: Server error
 */
router.get('/pricing', subscriptionController.getPricing);

/**
 * GET /subscriptions/current
 * Get current user's subscription status
 *
 * Requires authentication
 *
 * Response:
 * - 200: Subscription details returned
 * - 401: Not authenticated
 * - 404: User not found
 * - 500: Server error
 */
router.get('/current', requireAuth, subscriptionController.getCurrentSubscription);

/**
 * POST /subscriptions/checkout
 * Create Stripe checkout session for subscription
 *
 * Requires authentication
 *
 * Request body:
 * - priceId: Stripe price ID
 * - successUrl: URL to redirect on success
 * - cancelUrl: URL to redirect on cancel
 *
 * Response:
 * - 200: Checkout session created
 * - 400: Validation error
 * - 401: Not authenticated
 * - 500: Server error
 */
router.post('/checkout', requireAuth, subscriptionController.createCheckoutSession);

/**
 * POST /subscriptions/cancel
 * Cancel current subscription (at period end)
 *
 * Requires authentication
 *
 * Response:
 * - 200: Subscription canceled successfully
 * - 400: No active subscription
 * - 401: Not authenticated
 * - 500: Server error
 */
router.post('/cancel', requireAuth, subscriptionController.cancelSubscription);

/**
 * POST /subscriptions/reactivate
 * Reactivate a canceled subscription (before end date)
 *
 * Requires authentication
 *
 * Response:
 * - 200: Subscription reactivated successfully
 * - 400: No subscription or not canceled or already ended
 * - 401: Not authenticated
 * - 500: Server error
 */
router.post('/reactivate', requireAuth, subscriptionController.reactivateSubscription);

/**
 * POST /subscriptions/webhook
 * Handle Stripe webhook events
 *
 * Note: Raw body parser is configured in server.js (must be before express.json())
 *
 * Response:
 * - 200: Event processed
 * - 400: Invalid signature or processing error
 */
router.post('/webhook', subscriptionController.handleWebhook);

module.exports = router;
