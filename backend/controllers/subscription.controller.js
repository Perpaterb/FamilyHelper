/**
 * Subscription Controller
 *
 * Handles Stripe subscription operations using manual billing (Option B).
 * You control when and how much to charge customers.
 */

const { stripe } = require('../config/stripe');
const billingService = require('../services/billing.service');

/**
 * Create SetupIntent for saving payment method
 * POST /subscriptions/setup-intent
 *
 * This creates a Stripe SetupIntent that allows the frontend to
 * securely collect card details and save them for future billing.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function createSetupIntent(req, res) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    const result = await billingService.createSetupIntent(userId);

    res.status(200).json({
      success: true,
      clientSecret: result.clientSecret,
      customerId: result.customerId,
    });
  } catch (error) {
    console.error('Create setup intent error:', error);
    res.status(500).json({
      error: 'Failed to create setup intent',
      message: error.message,
    });
  }
}

/**
 * Save payment method after successful setup
 * POST /subscriptions/save-payment-method
 *
 * Call this after the user successfully completes the SetupIntent
 * in the frontend using Stripe Elements.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function savePaymentMethod(req, res) {
  try {
    const userId = req.user?.userId;
    const { paymentMethodId } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    if (!paymentMethodId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'paymentMethodId is required',
      });
    }

    await billingService.savePaymentMethod(userId, paymentMethodId);

    res.status(200).json({
      success: true,
      message: 'Payment method saved successfully',
    });
  } catch (error) {
    console.error('Save payment method error:', error);
    res.status(500).json({
      error: 'Failed to save payment method',
      message: error.message,
    });
  }
}

/**
 * Start a new subscription
 * POST /subscriptions/subscribe
 *
 * Charges the user's saved payment method and activates their subscription.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function subscribe(req, res) {
  try {
    const userId = req.user?.userId;
    const { storagePacks = 0 } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    const result = await billingService.startSubscription(userId, storagePacks);

    res.status(200).json({
      success: true,
      message: 'Subscription activated',
      paymentIntentId: result.paymentIntentId,
      amount: result.amount,
      amountFormatted: `$${(result.amount / 100).toFixed(2)} AUD`,
      renewalDate: result.renewalDate,
    });
  } catch (error) {
    console.error('Subscribe error:', error);

    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return res.status(400).json({
        error: 'Payment Failed',
        message: error.message,
        code: error.code,
      });
    }

    res.status(500).json({
      error: 'Subscription failed',
      message: error.message,
    });
  }
}

/**
 * Update storage packs
 * PUT /subscriptions/storage-packs
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function updateStoragePacks(req, res) {
  try {
    const userId = req.user?.userId;
    const { storagePacks } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    if (typeof storagePacks !== 'number' || storagePacks < 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'storagePacks must be a non-negative number',
      });
    }

    const result = await billingService.updateStoragePacks(userId, storagePacks);

    res.status(200).json({
      success: true,
      message: 'Storage packs updated',
      storagePacks: result.storagePacks,
      storageLimitGb: result.storageLimitGb,
      note: 'New pricing takes effect on next billing cycle',
    });
  } catch (error) {
    console.error('Update storage packs error:', error);
    res.status(500).json({
      error: 'Failed to update storage packs',
      message: error.message,
    });
  }
}

/**
 * Get subscription pricing information
 * GET /subscriptions/pricing
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getPricing(req, res) {
  try {
    const pricing = billingService.getPricing();

    res.status(200).json({
      success: true,
      pricing,
    });
  } catch (error) {
    console.error('Get pricing error:', error);
    res.status(500).json({
      error: 'Failed to get pricing',
      message: error.message,
    });
  }
}

/**
 * Handle Stripe webhook events
 * POST /subscriptions/webhook
 *
 * Handles payment_intent events for manual billing.
 *
 * @param {Object} req - Express request (raw body)
 * @param {Object} res - Express response
 */
async function handleWebhook(req, res) {
  const sig = req.headers['stripe-signature'];

  try {
    // Verify webhook signature
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log(`[Webhook] Received: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'setup_intent.succeeded':
        await handleSetupSucceeded(event.data.object);
        break;

      case 'customer.deleted':
        await handleCustomerDeleted(event.data.object);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    res.status(400).json({
      error: 'Webhook handler failed',
      message: error.message,
    });
  }
}

/**
 * Handle successful checkout session
 * This is triggered when a user completes payment via Stripe Checkout
 * @param {Object} session - Stripe Checkout Session object
 */
async function handleCheckoutSessionCompleted(session) {
  const { prisma } = require('../config/database');

  console.log(`[Webhook] Checkout session completed: ${session.id}`);
  console.log(`[Webhook] Payment status: ${session.payment_status}`);

  // Only process if payment was successful
  if (session.payment_status !== 'paid') {
    console.log(`[Webhook] Skipping - payment status is ${session.payment_status}`);
    return;
  }

  // Get user ID from metadata
  const userId = session.metadata?.userId;
  if (!userId) {
    console.error('[Webhook] No userId in session metadata');
    return;
  }

  // Check if this is a subscription payment (vs other checkout types)
  const billingType = session.metadata?.billingType;
  if (billingType !== 'subscription_payment') {
    console.log(`[Webhook] Not a subscription payment (type: ${billingType})`);
    return;
  }

  try {
    // Get user
    const user = await prisma.user.findUnique({
      where: { userId: userId },
    });

    if (!user) {
      console.error(`[Webhook] User not found: ${userId}`);
      return;
    }

    // Calculate renewal date (1 month from now + remaining trial days if on trial)
    const now = new Date();
    const renewalDate = new Date(now);
    renewalDate.setMonth(renewalDate.getMonth() + 1);

    // If user is on trial, add remaining trial days to the renewal date
    if (!user.isSubscribed) {
      const trialEndDate = new Date(user.createdAt);
      trialEndDate.setDate(trialEndDate.getDate() + 20);

      if (trialEndDate > now) {
        // User is still on trial - add remaining days
        const remainingTrialDays = Math.ceil((trialEndDate - now) / (1000 * 60 * 60 * 24));
        renewalDate.setDate(renewalDate.getDate() + remainingTrialDays);
        console.log(`[Webhook] Trial user subscribing - adding ${remainingTrialDays} remaining trial days`);
      }
    }

    // Get storage packs from metadata
    const storagePacksNeeded = parseInt(session.metadata?.storagePacksNeeded || '0', 10);
    const storageLimitGb = 10 + storagePacksNeeded * 10;
    const totalAmountCents = parseInt(session.metadata?.totalAmountCents || session.amount_total, 10);

    // Save payment method for future billing (from the PaymentIntent)
    let defaultPaymentMethodId = user.defaultPaymentMethodId;
    if (session.payment_intent) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
        if (paymentIntent.payment_method) {
          defaultPaymentMethodId = paymentIntent.payment_method;

          // Set as default on Stripe customer
          if (session.customer) {
            await stripe.customers.update(session.customer, {
              invoice_settings: {
                default_payment_method: defaultPaymentMethodId,
              },
            });
          }
        }
      } catch (piError) {
        console.error('[Webhook] Error getting payment method:', piError.message);
      }
    }

    // Update user to activate subscription
    await prisma.user.update({
      where: { userId: userId },
      data: {
        isSubscribed: true,
        subscriptionStartDate: user.subscriptionStartDate || now,
        subscriptionEndDate: null, // Clear any cancellation
        subscriptionManuallyExpired: false, // Clear manual expiry flag
        renewalDate: renewalDate,
        additionalStoragePacks: storagePacksNeeded,
        storageLimitGb: storageLimitGb,
        billingFailureCount: 0,
        lastBillingAttempt: now,
        defaultPaymentMethodId: defaultPaymentMethodId,
        stripeCustomerId: session.customer || user.stripeCustomerId,
      },
    });

    // Restore read-only groups where this user is admin
    // Find groups where user is admin and group is in read-only mode
    const adminMemberships = await prisma.groupMember.findMany({
      where: {
        userId: userId,
        role: 'admin',
      },
      include: {
        group: {
          select: {
            groupId: true,
            name: true,
            hasActiveAdmin: true,
          },
        },
      },
    });

    const groupsRestored = [];
    for (const membership of adminMemberships) {
      if (!membership.group.hasActiveAdmin) {
        await prisma.group.update({
          where: { groupId: membership.group.groupId },
          data: { hasActiveAdmin: true },
        });
        groupsRestored.push(membership.group.name);
      }
    }

    if (groupsRestored.length > 0) {
      console.log(`[Webhook] Restored ${groupsRestored.length} group(s) from read-only: ${groupsRestored.join(', ')}`);
    }

    // Create billing history record
    await prisma.billingHistory.create({
      data: {
        userId: userId,
        amount: totalAmountCents,
        currency: 'usd',
        status: 'succeeded',
        description: `Family Helper - Subscription${storagePacksNeeded > 0 ? ` + ${storagePacksNeeded} storage packs` : ''}`,
        baseSubscriptionAmount: 300, // $3.00 in cents
        storagePacks: storagePacksNeeded,
        storagePackAmount: 100, // $1.00 per pack in cents
        periodStart: now,
        periodEnd: renewalDate,
        stripePaymentIntentId: session.payment_intent,
      },
    });

    console.log(`[Webhook] Successfully activated subscription for user ${user.email}`);
    console.log(`[Webhook] Renewal date: ${renewalDate.toISOString()}`);
    console.log(`[Webhook] Storage packs: ${storagePacksNeeded}, Limit: ${storageLimitGb}GB`);
  } catch (error) {
    console.error('[Webhook] Error processing checkout session:', error);
    throw error; // Re-throw to trigger webhook retry
  }
}

/**
 * Handle successful payment
 * @param {Object} paymentIntent - Stripe PaymentIntent object
 */
async function handlePaymentSucceeded(paymentIntent) {
  const { prisma } = require('../config/database');
  const billingId = paymentIntent.metadata?.billingId;

  console.log(`[Webhook] Payment succeeded: ${paymentIntent.id}`);

  if (billingId) {
    // Update billing record if we have one
    await prisma.billingHistory.update({
      where: { billingId },
      data: {
        status: 'succeeded',
        stripePaymentIntentId: paymentIntent.id,
      },
    });
  }
}

/**
 * Handle failed payment
 * @param {Object} paymentIntent - Stripe PaymentIntent object
 */
async function handlePaymentFailed(paymentIntent) {
  const { prisma } = require('../config/database');
  const billingId = paymentIntent.metadata?.billingId;
  const userId = paymentIntent.metadata?.userId;

  console.log(`[Webhook] Payment failed: ${paymentIntent.id}`);
  console.log(`[Webhook] Failure reason: ${paymentIntent.last_payment_error?.message}`);

  if (billingId) {
    // Update billing record
    await prisma.billingHistory.update({
      where: { billingId },
      data: {
        status: 'failed',
        failureReason: paymentIntent.last_payment_error?.message || 'Payment failed',
      },
    });
  }

  if (userId) {
    // Increment failure count
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { billingFailureCount: true, email: true },
    });

    if (user) {
      await prisma.user.update({
        where: { userId },
        data: {
          billingFailureCount: (user.billingFailureCount || 0) + 1,
          lastBillingAttempt: new Date(),
        },
      });

      console.log(`[Webhook] User ${user.email} billing failure count: ${(user.billingFailureCount || 0) + 1}`);
    }
  }
}

/**
 * Handle successful SetupIntent
 * @param {Object} setupIntent - Stripe SetupIntent object
 */
async function handleSetupSucceeded(setupIntent) {
  const { prisma } = require('../config/database');
  const userId = setupIntent.metadata?.userId;

  console.log(`[Webhook] Setup succeeded: ${setupIntent.id}`);

  if (userId && setupIntent.payment_method) {
    // Auto-save the payment method
    await prisma.user.update({
      where: { userId },
      data: { defaultPaymentMethodId: setupIntent.payment_method },
    });

    console.log(`[Webhook] Saved payment method ${setupIntent.payment_method} for user ${userId}`);
  }
}

/**
 * Handle customer deletion
 * @param {Object} customer - Stripe Customer object
 */
async function handleCustomerDeleted(customer) {
  const { prisma } = require('../config/database');

  console.log(`[Webhook] Customer deleted: ${customer.id}`);

  // Clear Stripe customer ID from user
  await prisma.user.updateMany({
    where: { stripeCustomerId: customer.id },
    data: {
      stripeCustomerId: null,
      defaultPaymentMethodId: null,
    },
  });
}

/**
 * Get current subscription status
 * GET /subscriptions/current
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getCurrentSubscription(req, res) {
  try {
    const { prisma } = require('../config/database');
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Get user with subscription details
    const user = await prisma.user.findUnique({
      where: { userId: userId },
      select: {
        userId: true,
        email: true,
        isSubscribed: true,
        subscriptionStartDate: true,
        subscriptionEndDate: true,
        renewalDate: true,
        storageLimitGb: true,
        storageUsedBytes: true,
        additionalStoragePacks: true,
        stripeCustomerId: true,
        defaultPaymentMethodId: true,
        billingFailureCount: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    // Get payment method details if exists
    let paymentMethod = null;
    if (user.defaultPaymentMethodId) {
      try {
        const pm = await stripe.paymentMethods.retrieve(user.defaultPaymentMethodId);
        paymentMethod = {
          id: pm.id,
          type: pm.type,
          card: pm.card ? {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
          } : null,
        };
      } catch (error) {
        console.error('[Get Subscription] Failed to retrieve payment method:', error.message);
      }
    }

    // Convert BigInt to Number for JSON serialization
    const storageUsedBytes = Number(user.storageUsedBytes);
    const storageLimitBytes = user.storageLimitGb * 1024 * 1024 * 1024;

    // Calculate next billing amount
    const pricing = billingService.getPricing();
    const nextBillingAmount = pricing.adminSubscription.amount +
      (user.additionalStoragePacks * pricing.additionalStorage.amount);

    res.status(200).json({
      success: true,
      subscription: {
        isSubscribed: user.isSubscribed,
        startDate: user.subscriptionStartDate,
        endDate: user.subscriptionEndDate,
        renewalDate: user.renewalDate,
        createdAt: user.createdAt,
        storageLimitGb: user.storageLimitGb,
        storageUsedBytes: storageUsedBytes,
        storageUsedGb: (storageUsedBytes / (1024 * 1024 * 1024)).toFixed(2),
        storageUsedPercentage: user.storageLimitGb > 0
          ? ((storageUsedBytes / storageLimitBytes) * 100).toFixed(1)
          : 0,
        additionalStoragePacks: user.additionalStoragePacks,
        hasPaymentMethod: !!user.defaultPaymentMethodId,
        paymentMethod: paymentMethod,
        billingFailureCount: user.billingFailureCount,
        nextBillingAmount: nextBillingAmount,
        nextBillingAmountFormatted: `$${(nextBillingAmount / 100).toFixed(2)} AUD`,
      },
    });
  } catch (error) {
    console.error('Get current subscription error:', error);
    res.status(500).json({
      error: 'Failed to get subscription',
      message: error.message,
    });
  }
}

/**
 * Cancel subscription
 * POST /subscriptions/cancel
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function cancelSubscription(req, res) {
  try {
    const { prisma } = require('../config/database');
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { userId: userId },
      select: {
        userId: true,
        email: true,
        isSubscribed: true,
        renewalDate: true,
      },
    });

    if (!user || !user.isSubscribed) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No active subscription found',
      });
    }

    // Set subscription to end at renewal date
    const cancelAt = user.renewalDate || new Date();

    await prisma.user.update({
      where: { userId: userId },
      data: {
        subscriptionEndDate: cancelAt,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Subscription will be canceled at end of billing period',
      cancelAt: cancelAt,
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      error: 'Failed to cancel subscription',
      message: error.message,
    });
  }
}

/**
 * Reactivate canceled subscription
 * POST /subscriptions/reactivate
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function reactivateSubscription(req, res) {
  try {
    const { prisma } = require('../config/database');
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { userId: userId },
      select: {
        userId: true,
        isSubscribed: true,
        subscriptionEndDate: true,
      },
    });

    if (!user || !user.isSubscribed) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No active subscription found',
      });
    }

    if (!user.subscriptionEndDate) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Subscription is not canceled',
      });
    }

    if (new Date(user.subscriptionEndDate) < new Date()) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Subscription has already ended. Please subscribe again.',
      });
    }

    // Remove end date to reactivate
    await prisma.user.update({
      where: { userId: userId },
      data: {
        subscriptionEndDate: null,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Subscription reactivated',
    });
  } catch (error) {
    console.error('Reactivate subscription error:', error);
    res.status(500).json({
      error: 'Failed to reactivate subscription',
      message: error.message,
    });
  }
}

/**
 * Get billing history
 * GET /subscriptions/billing-history
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getBillingHistory(req, res) {
  try {
    const userId = req.user?.userId;
    const limit = parseInt(req.query.limit) || 12;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    const history = await billingService.getBillingHistory(userId, limit);

    res.status(200).json({
      success: true,
      billingHistory: history.map((record) => ({
        billingId: record.billingId,
        amount: record.amount,
        amountFormatted: `$${(record.amount / 100).toFixed(2)} ${record.currency.toUpperCase()}`,
        status: record.status,
        description: record.description,
        periodStart: record.periodStart,
        periodEnd: record.periodEnd,
        createdAt: record.createdAt,
        failureReason: record.failureReason,
      })),
    });
  } catch (error) {
    console.error('Get billing history error:', error);
    res.status(500).json({
      error: 'Failed to get billing history',
      message: error.message,
    });
  }
}

/**
 * Process renewals (called by scheduled job)
 * POST /subscriptions/process-renewals
 *
 * This endpoint should be protected and only called by EventBridge/Lambda scheduler.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function processRenewals(req, res) {
  try {
    // Verify this is called from Lambda scheduler (check for API key or internal call)
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.BILLING_API_KEY;

    if (expectedKey && apiKey !== expectedKey) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key',
      });
    }

    const results = await billingService.processRenewals();

    res.status(200).json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Process renewals error:', error);
    res.status(500).json({
      error: 'Failed to process renewals',
      message: error.message,
    });
  }
}

module.exports = {
  createSetupIntent,
  savePaymentMethod,
  subscribe,
  updateStoragePacks,
  getPricing,
  handleWebhook,
  getCurrentSubscription,
  cancelSubscription,
  reactivateSubscription,
  getBillingHistory,
  processRenewals,
};
