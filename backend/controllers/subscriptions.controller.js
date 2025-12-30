/**
 * Subscriptions Controller
 *
 * Handles subscription status queries for mobile/web apps.
 * Note: Actual subscription management (Stripe) is handled in web-admin app only.
 *
 * @module controllers/subscriptions
 */

const { prisma } = require('../config/database');
const billingService = require('../services/billing.service');
const { emailService } = require('../services/email');

// Base pricing constants (in cents)
const BASE_SUBSCRIPTION_CENTS = 300; // $3.00 USD
const STORAGE_PACK_CENTS = 100; // $1.00 USD per 10GB

/**
 * Create a Stripe Checkout session for a user's billing
 * Returns the checkout URL that goes directly to Stripe's payment page
 *
 * @param {Object} user - User object with userId, email, displayName, stripeCustomerId
 * @param {Object} storageInfo - Storage info from calculateStorageInfo
 * @returns {Promise<string>} Stripe checkout URL
 */
async function createBillingCheckoutSession(user, storageInfo) {
  const { stripe } = require('../config/stripe');

  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  // Calculate totals
  const baseAmount = BASE_SUBSCRIPTION_CENTS;
  const storageChargesCents = storageInfo.storagePacksNeeded * STORAGE_PACK_CENTS;
  const totalAmountCents = baseAmount + storageChargesCents;

  // Build line items
  const lineItems = [
    {
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Family Helper Admin Subscription',
          description: 'Monthly admin subscription with 10GB storage included',
        },
        unit_amount: baseAmount,
      },
      quantity: 1,
    },
  ];

  // Add storage packs if needed
  if (storageInfo.storagePacksNeeded > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Additional Storage Pack',
          description: '10GB additional storage per month',
        },
        unit_amount: STORAGE_PACK_CENTS,
      },
      quantity: storageInfo.storagePacksNeeded,
    });
  }

  // Get or create Stripe customer
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.displayName || undefined,
      metadata: {
        userId: user.userId,
      },
    });
    customerId = customer.id;

    // Save customer ID
    await prisma.user.update({
      where: { userId: user.userId },
      data: { stripeCustomerId: customerId },
    });
  }

  // Success/cancel URLs
  const baseUrl = process.env.WEB_APP_URL || 'https://familyhelperapp.com';
  const successUrl = `${baseUrl}/subscription?success=true`;
  const cancelUrl = `${baseUrl}/subscription?canceled=true`;

  // Create Checkout Session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId: user.userId,
      storagePacksNeeded: storageInfo.storagePacksNeeded.toString(),
      totalAmountCents: totalAmountCents.toString(),
      billingType: 'subscription_payment',
    },
    // Save card for future billing
    payment_intent_data: {
      setup_future_usage: 'off_session',
      metadata: {
        userId: user.userId,
        billingType: 'subscription_payment',
      },
    },
    // Session expires in 24 hours (Stripe max)
    expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
  });

  console.log(`[Billing] Created Checkout session ${session.id} for user ${user.email}, amount: $${(totalAmountCents / 100).toFixed(2)}`);

  return session.url;
}

/**
 * Get current user's subscription status
 * GET /subscriptions/status
 *
 * Returns whether the user has an active subscription
 *
 * @param {Object} req - Express request (with user attached by requireAuth middleware)
 * @param {Object} res - Express response
 */
async function getSubscriptionStatus(req, res) {
  try {
    // Get user from database to ensure fresh data
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      select: {
        userId: true,
        email: true,
        isSubscribed: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found',
      });
    }

    res.status(200).json({
      success: true,
      subscription: {
        isActive: user.isSubscribed,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({
      error: 'Failed to get subscription status',
      message: error.message,
    });
  }
}

/**
 * Get pricing plans
 * GET /subscriptions/pricing
 *
 * Returns available subscription plans
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getPricing(req, res) {
  try {
    // Pricing structure for web-admin Subscription.jsx
    // Updated: Nov 2025 - Competitive pricing model
    const pricing = {
      adminSubscription: {
        priceId: 'price_admin_subscription', // TODO: Replace with actual Stripe price ID
        name: 'Admin Subscription',
        amount: 300, // $3.00 USD in cents - half price of competitors
        currency: 'usd',
        interval: 'month',
        description: 'Required for group admins. Includes 10GB storage for logs, images, and videos. Only $3/month per admin.',
        features: [
          '10GB storage included',
          'Full admin features',
          '20-day free trial',
          'All group members free (only admins pay)',
        ],
      },
      additionalStorage: {
        priceId: 'price_storage_metered', // TODO: Replace with actual Stripe metered price ID
        name: 'Additional Storage',
        amount: 100, // $1.00 USD per 10GB in cents
        currency: 'usd',
        interval: 'month',
        unit: '10GB',
        description: 'Additional storage beyond the included 10GB. $1 USD per 10GB automatically charged.',
        billingType: 'metered', // Automatically charged based on usage
      },
    };

    res.status(200).json({
      success: true,
      pricing: pricing,
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
 * Get current user's subscription details
 * GET /subscriptions/current
 *
 * Returns detailed subscription information for the current user
 *
 * @param {Object} req - Express request (with user attached by requireAuth middleware)
 * @param {Object} res - Express response
 */
async function getCurrentSubscription(req, res) {
  try {
    // Get user from database to ensure fresh data
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      select: {
        userId: true,
        email: true,
        isSubscribed: true,
        createdAt: true,
        subscriptionStartDate: true,
        subscriptionEndDate: true,
        subscriptionManuallyExpired: true,
        isSupportUser: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found',
      });
    }

    // Calculate storage used by user (files in groups where they are admin)
    // Get all groups where user is admin
    const adminGroups = await prisma.groupMember.findMany({
      where: {
        userId: req.user.userId,
        role: 'admin',
      },
      select: {
        groupId: true,
      },
    });

    const adminGroupIds = adminGroups.map(g => g.groupId);

    // Sum all file sizes from MessageMedia in those groups
    let storageUsedBytes = BigInt(0);

    if (adminGroupIds.length > 0) {
      const mediaResult = await prisma.messageMedia.aggregate({
        where: {
          message: {
            messageGroup: {
              groupId: {
                in: adminGroupIds,
              },
            },
          },
        },
        _sum: {
          fileSizeBytes: true,
        },
      });

      storageUsedBytes = mediaResult._sum.fileSizeBytes || BigInt(0);
    }

    // Convert bytes to GB (divide by 1024^3)
    const storageUsedGb = (Number(storageUsedBytes) / (1024 * 1024 * 1024)).toFixed(2);

    // TODO: Replace with actual subscription data from Stripe
    // For now, return trial/subscription info based on isSubscribed flag
    if (user.isSubscribed) {
      // Check if this is a permanent subscription (support users, etc.)
      const isPermanent = isPermanentSubscription(user);

      // Check if subscription is scheduled for cancellation (only for non-permanent)
      // Permanent subscriptions with far-future endDate are NOT "canceling"
      const hasScheduledCancellation = !isPermanent && user.subscriptionEndDate && new Date(user.subscriptionEndDate) > new Date();
      const periodEnd = user.subscriptionEndDate
        ? user.subscriptionEndDate
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      res.status(200).json({
        success: true,
        subscription: {
          isActive: true,
          isSubscribed: true, // Frontend expects this field
          isPermanent: isPermanent, // Flag for permanent subscriptions
          plan: 'Pro', // TODO: Get from Stripe
          price: 19.99,
          interval: 'month',
          status: 'active', // Always show as active (permanent is just a flag)
          currentPeriodEnd: new Date(periodEnd).toISOString(),
          cancelAtPeriodEnd: hasScheduledCancellation,
          createdAt: user.createdAt, // For frontend trial calculation
          // Frontend compatibility fields
          startDate: user.subscriptionStartDate || user.createdAt, // Fallback to account creation if not set
          endDate: hasScheduledCancellation ? user.subscriptionEndDate : null, // Only set if canceling (NOT for permanent)
          storageUsedGb: storageUsedGb,
          stripe: {
            currentPeriodEnd: new Date(periodEnd).toISOString(),
          },
        },
      });
    } else {
      // Check if subscription was manually expired by support
      if (user.subscriptionManuallyExpired) {
        res.status(200).json({
          success: true,
          subscription: {
            isActive: false,
            isSubscribed: false,
            subscriptionManuallyExpired: true,
            plan: 'None',
            status: 'manually_expired',
            endDate: user.subscriptionEndDate,
            createdAt: user.createdAt,
            storageUsedGb: storageUsedGb,
          },
        });
      } else {
        // Calculate trial days remaining (20 days from account creation)
        const accountAge = Date.now() - new Date(user.createdAt).getTime();
        const daysElapsed = Math.floor(accountAge / (24 * 60 * 60 * 1000));
        const daysRemaining = Math.max(0, 20 - daysElapsed);

        res.status(200).json({
          success: true,
          subscription: {
            isActive: false,
            isSubscribed: false, // Frontend expects this field
            plan: 'Free Trial',
            status: 'trial',
            daysRemaining: daysRemaining,
            trialEndsAt: new Date(new Date(user.createdAt).getTime() + 20 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: user.createdAt, // For frontend trial calculation
            storageUsedGb: storageUsedGb,
          },
        });
      }
    }
  } catch (error) {
    console.error('Get current subscription error:', error);
    res.status(500).json({
      error: 'Failed to get current subscription',
      message: error.message,
    });
  }
}

/**
 * Cancel subscription at end of billing period
 * POST /subscriptions/cancel
 *
 * Cancels the user's subscription, but keeps access until end of current period
 *
 * @param {Object} req - Express request (with user attached by requireAuth middleware)
 * @param {Object} res - Express response
 */
async function cancelSubscription(req, res) {
  try {
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      select: {
        userId: true,
        email: true,
        isSubscribed: true,
        subscriptionId: true,
        subscriptionEndDate: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found',
      });
    }

    // Check if user has active subscription
    if (!user.isSubscribed) {
      return res.status(400).json({
        error: 'No active subscription',
        message: 'You don\'t have an active subscription to cancel',
      });
    }

    // Check if already scheduled for cancellation
    if (user.subscriptionEndDate && new Date(user.subscriptionEndDate) > new Date()) {
      return res.status(400).json({
        error: 'Already scheduled for cancellation',
        message: `Subscription is already scheduled to end on ${new Date(user.subscriptionEndDate).toLocaleDateString()}`,
      });
    }

    // TODO: Integrate with Stripe to get actual billing period end date
    // For now, set end date to 30 days from now
    const cancelAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Update database to set subscription end date
    await prisma.user.update({
      where: { userId: req.user.userId },
      data: {
        subscriptionEndDate: cancelAt,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Subscription will be canceled at end of billing period',
      cancelAt: cancelAt.toISOString(),
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
 * Reactivate a canceled subscription
 * POST /subscriptions/reactivate
 *
 * Reactivates a subscription that was canceled but still active until period end
 *
 * @param {Object} req - Express request (with user attached by requireAuth middleware)
 * @param {Object} res - Express response
 */
async function reactivateSubscription(req, res) {
  try {
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      select: {
        userId: true,
        email: true,
        isSubscribed: true,
        subscriptionId: true,
        subscriptionEndDate: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found',
      });
    }

    // Check if user has active subscription
    if (!user.isSubscribed) {
      return res.status(400).json({
        error: 'Cannot reactivate',
        message: 'You don\'t have an active subscription',
      });
    }

    // Check if subscription is actually scheduled for cancellation
    if (!user.subscriptionEndDate || new Date(user.subscriptionEndDate) <= new Date()) {
      return res.status(400).json({
        error: 'Cannot reactivate',
        message: 'Subscription is not scheduled for cancellation',
      });
    }

    // TODO: Integrate with Stripe to reactivate subscription
    // For now, clear the subscription end date
    await prisma.user.update({
      where: { userId: req.user.userId },
      data: {
        subscriptionEndDate: null,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Subscription reactivated successfully',
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
 * Helper: Format date as DD-MMM-YYYY
 * @param {Date} date - Date to format
 * @returns {string} Formatted date
 */
function formatDateDDMMMYYYY(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Helper: Check if user has a permanent subscription
 * Permanent subscriptions have subscriptionEndDate > 5 years in the future
 * or are support users
 *
 * @param {Object} user - User object with subscriptionEndDate and isSupportUser
 * @returns {boolean} True if permanent subscription
 */
function isPermanentSubscription(user) {
  // Support users have permanent subscriptions
  if (user.isSupportUser) {
    return true;
  }

  // Check if subscriptionEndDate is more than 5 years in the future
  if (user.subscriptionEndDate) {
    const fiveYearsFromNow = new Date();
    fiveYearsFromNow.setFullYear(fiveYearsFromNow.getFullYear() + 5);
    return new Date(user.subscriptionEndDate) > fiveYearsFromNow;
  }

  return false;
}

/**
 * Helper: Calculate user's due date
 *
 * The next billing date is the LATEST of:
 * - Current subscription end date (renewalDate)
 * - Current date (can't bill for the past)
 * - Trial end date (createdAt + 20 days)
 *
 * This means trial users who subscribe could get up to 20 + 31 days
 * before their first payment.
 *
 * Returns null for permanent subscriptions (they don't pay).
 *
 * @param {Object} user - User object
 * @returns {Date|null} Due date, or null if permanent subscription
 */
function calculateDueDate(user) {
  // Permanent subscriptions don't have due dates
  if (isPermanentSubscription(user)) {
    return null;
  }

  // If user has been expired (subscriptionEndDate in the past), use that date
  if (user.subscriptionEndDate) {
    const endDate = new Date(user.subscriptionEndDate);
    if (endDate < new Date()) {
      return endDate; // Already expired, show the expiry date
    }
  }

  const now = new Date();
  const candidates = [];

  // Add current date as minimum (can't bill for the past)
  candidates.push(now);

  // Add trial end date (20 days from account creation) - only if not subscribed
  if (!user.isSubscribed) {
    const trialEnd = new Date(user.createdAt);
    trialEnd.setDate(trialEnd.getDate() + 20);
    candidates.push(trialEnd);
  }

  // Add renewal date if has one
  if (user.renewalDate) {
    candidates.push(new Date(user.renewalDate));
  }

  // Return the latest date
  return new Date(Math.max(...candidates.map(d => d.getTime())));
}

/**
 * Helper: Calculate storage used and required packs
 * @param {string} userId - User ID
 * @returns {Object} Storage info
 */
async function calculateStorageInfo(userId) {
  // Get all groups where user is admin
  const adminGroups = await prisma.groupMember.findMany({
    where: {
      userId: userId,
      role: 'admin',
    },
    select: { groupId: true },
  });

  const adminGroupIds = adminGroups.map(g => g.groupId);

  // Sum all file sizes from MessageMedia in those groups
  let storageUsedBytes = BigInt(0);

  if (adminGroupIds.length > 0) {
    const mediaResult = await prisma.messageMedia.aggregate({
      where: {
        message: {
          messageGroup: {
            groupId: { in: adminGroupIds },
          },
        },
      },
      _sum: { fileSizeBytes: true },
    });
    storageUsedBytes = mediaResult._sum.fileSizeBytes || BigInt(0);
  }

  // Convert bytes to GB
  const storageUsedGb = Number(storageUsedBytes) / (1024 * 1024 * 1024);

  // Calculate storage packs needed (base is 10GB)
  const baseStorageGb = 10;
  const additionalGbNeeded = Math.max(0, storageUsedGb - baseStorageGb);
  const storagePacksNeeded = Math.ceil(additionalGbNeeded / 10); // Each pack is 10GB

  return {
    storageUsedBytes: Number(storageUsedBytes),
    storageUsedGb: storageUsedGb.toFixed(2),
    baseStorageGb,
    storagePacksNeeded,
    storageCharges: (storagePacksNeeded * STORAGE_PACK_CENTS / 100).toFixed(2),
  };
}

/**
 * Get current user's invoice/bill breakdown
 * GET /subscriptions/invoice
 *
 * Returns the current billing breakdown with costs and due date
 *
 * @param {Object} req - Express request (with user attached by requireAuth middleware)
 * @param {Object} res - Express response
 */
async function getInvoice(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      select: {
        userId: true,
        email: true,
        displayName: true,
        isSubscribed: true,
        createdAt: true,
        renewalDate: true,
        additionalStoragePacks: true,
        lastBillingReminderSent: true,
        isSupportUser: true,
        subscriptionEndDate: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found',
      });
    }

    // Check for permanent subscription (support users, etc.)
    const isPermanent = isPermanentSubscription(user);

    // Calculate due date - for permanent users, use their subscriptionEndDate or far-future default
    let dueDate;
    if (isPermanent) {
      if (user.subscriptionEndDate) {
        dueDate = new Date(user.subscriptionEndDate);
      } else {
        // Permanent users without subscriptionEndDate get a far-future date (100 years)
        dueDate = new Date();
        dueDate.setFullYear(dueDate.getFullYear() + 100);
      }
    } else {
      dueDate = calculateDueDate(user);
    }

    if (!dueDate) {
      return res.status(400).json({
        error: 'No billing date',
        message: 'Unable to determine billing date',
      });
    }

    // Calculate days until due
    const now = new Date();
    const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

    // Calculate storage info
    const storageInfo = await calculateStorageInfo(user.userId);

    // Calculate totals
    const baseAmount = BASE_SUBSCRIPTION_CENTS / 100; // $3.00
    const storageCharges = parseFloat(storageInfo.storageCharges);
    const totalAmount = (baseAmount + storageCharges).toFixed(2);

    // User can generate bill email if within 7 days OR on trial (but NOT permanent)
    const isOnTrial = !user.isSubscribed;
    const canGenerateBillEmail = !isPermanent && (daysUntilDue <= 7 || isOnTrial);

    res.status(200).json({
      success: true,
      invoice: {
        baseAmount: baseAmount.toFixed(2),
        storageUsedGb: storageInfo.storageUsedGb,
        storagePacksNeeded: storageInfo.storagePacksNeeded,
        storageCharges: storageInfo.storageCharges,
        totalAmount: totalAmount,
        dueDate: formatDateDDMMMYYYY(dueDate),
        dueDateRaw: dueDate.toISOString(),
        daysUntilDue: daysUntilDue,
        canPayNow: !isPermanent && daysUntilDue <= 7, // Keep for backward compatibility
        canGenerateBillEmail: canGenerateBillEmail,
        lastBillingEmailSent: user.lastBillingReminderSent ? true : false,
        isPermanentSubscription: isPermanent,
        currency: 'USD',
      },
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({
      error: 'Failed to get invoice',
      message: error.message,
    });
  }
}

/**
 * Pay bill now (early payment)
 * POST /subscriptions/pay-now
 *
 * Allows user to pay their bill early (within 7 days of due date)
 *
 * @param {Object} req - Express request (with user attached by requireAuth middleware)
 * @param {Object} res - Express response
 */
async function payNow(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      select: {
        userId: true,
        email: true,
        displayName: true,
        isSubscribed: true,
        createdAt: true,
        renewalDate: true,
        stripeCustomerId: true,
        defaultPaymentMethodId: true,
        additionalStoragePacks: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found',
      });
    }

    // Calculate due date
    const dueDate = calculateDueDate(user);
    if (!dueDate) {
      return res.status(400).json({
        error: 'No billing date',
        message: 'Unable to determine billing date',
      });
    }

    // Check if within 7 days
    const now = new Date();
    const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntilDue > 7) {
      return res.status(400).json({
        error: 'Too early to pay',
        message: `You can only pay your bill within 7 days of the due date. Current: ${daysUntilDue} days remaining.`,
      });
    }

    // Check if user has payment method
    if (!user.stripeCustomerId || !user.defaultPaymentMethodId) {
      return res.status(400).json({
        error: 'No payment method',
        message: 'Please add a payment method first',
      });
    }

    // Calculate storage info for accurate billing
    const storageInfo = await calculateStorageInfo(user.userId);

    // Use billing service to charge user
    try {
      const result = await billingService.chargeUser({
        ...user,
        additionalStoragePacks: storageInfo.storagePacksNeeded,
      });

      // Clear any subscriptionEndDate (reactivation)
      await prisma.user.update({
        where: { userId: user.userId },
        data: {
          isSubscribed: true,
          subscriptionEndDate: null,
        },
      });

      res.status(200).json({
        success: true,
        message: 'Payment successful',
        paymentIntentId: result.paymentIntentId,
        amount: result.amount,
        renewalDate: formatDateDDMMMYYYY(result.renewalDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
      });
    } catch (chargeError) {
      console.error('Payment failed:', chargeError);
      return res.status(400).json({
        error: 'Payment failed',
        message: chargeError.message,
      });
    }
  } catch (error) {
    console.error('Pay now error:', error);
    res.status(500).json({
      error: 'Failed to process payment',
      message: error.message,
    });
  }
}

/**
 * Regenerate bill and send new billing reminder email
 * POST /subscriptions/regenerate-bill
 *
 * Recalculates storage costs and sends a new billing email
 *
 * @param {Object} req - Express request (with user attached by requireAuth middleware)
 * @param {Object} res - Express response
 */
async function regenerateBill(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      select: {
        userId: true,
        email: true,
        displayName: true,
        isSubscribed: true,
        createdAt: true,
        renewalDate: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found',
      });
    }

    // Calculate due date
    const dueDate = calculateDueDate(user);
    if (!dueDate) {
      return res.status(400).json({
        error: 'No billing date',
        message: 'Unable to determine billing date',
      });
    }

    // Calculate days until due
    const now = new Date();
    const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

    // Calculate storage info
    const storageInfo = await calculateStorageInfo(user.userId);

    // Calculate totals
    const baseAmount = BASE_SUBSCRIPTION_CENTS / 100;
    const storageCharges = parseFloat(storageInfo.storageCharges);
    const totalAmount = (baseAmount + storageCharges).toFixed(2);

    // Get full user for Stripe checkout (need stripeCustomerId)
    const fullUser = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      select: {
        userId: true,
        email: true,
        displayName: true,
        stripeCustomerId: true,
      },
    });

    // Create Stripe Checkout session for the Pay Now link
    let payNowUrl;
    try {
      payNowUrl = await createBillingCheckoutSession(fullUser, storageInfo);
    } catch (stripeError) {
      console.error(`[Billing] Failed to create Stripe checkout for ${user.email}:`, stripeError.message);
      // Fallback to subscription page if Stripe fails
      payNowUrl = `${process.env.WEB_APP_URL || 'https://familyhelperapp.com'}/subscription`;
    }

    // Prepare email data
    const emailData = {
      userName: user.displayName || user.email,
      daysUntilDue: Math.max(1, daysUntilDue), // At least 1 day
      dueDate: formatDateDDMMMYYYY(dueDate),
      storageUsedGb: storageInfo.storageUsedGb,
      storagePacks: storageInfo.storagePacksNeeded,
      storageCharges: storageInfo.storageCharges,
      totalAmount: totalAmount,
      payNowUrl: payNowUrl,
    };

    // Send billing reminder email
    try {
      await emailService.sendTemplate('billing_reminder', user.email, emailData);
      console.log(`[Billing] Regenerated bill email sent to ${user.email}`);
    } catch (emailError) {
      console.error('Failed to send billing reminder email:', emailError);
      // Continue even if email fails
    }

    // Update lastBillingReminderSent
    await prisma.user.update({
      where: { userId: user.userId },
      data: { lastBillingReminderSent: now },
    });

    res.status(200).json({
      success: true,
      message: 'Bill regenerated and email sent',
      invoice: {
        baseAmount: baseAmount.toFixed(2),
        storageUsedGb: storageInfo.storageUsedGb,
        storagePacksNeeded: storageInfo.storagePacksNeeded,
        storageCharges: storageInfo.storageCharges,
        totalAmount: totalAmount,
        dueDate: formatDateDDMMMYYYY(dueDate),
        daysUntilDue: daysUntilDue,
        canPayNow: daysUntilDue <= 7,
        currency: 'USD',
      },
    });
  } catch (error) {
    console.error('Regenerate bill error:', error);
    res.status(500).json({
      error: 'Failed to regenerate bill',
      message: error.message,
    });
  }
}

/**
 * Send billing reminders to users due soon (scheduled job)
 * POST /subscriptions/send-billing-reminders
 *
 * Called daily by AWS EventBridge to send reminders at 5 days and 1 day before due
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function sendBillingReminders(req, res) {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Calculate target dates for reminders (5 days and 1 day before)
    const fiveDaysFromNow = new Date(today);
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);
    const oneDayFromNow = new Date(today);
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

    // Helper to check if date matches target (same day)
    const isSameDay = (d1, d2) => {
      return d1.getFullYear() === d2.getFullYear() &&
             d1.getMonth() === d2.getMonth() &&
             d1.getDate() === d2.getDate();
    };

    // Find subscribed users due in 5 days or 1 day
    const subscribedUsers = await prisma.user.findMany({
      where: {
        isSubscribed: true,
        renewalDate: { not: null },
      },
      select: {
        userId: true,
        email: true,
        displayName: true,
        isSubscribed: true,
        createdAt: true,
        renewalDate: true,
        lastBillingReminderSent: true,
      },
    });

    // Find trial users (not subscribed) whose trial ends in 5 or 1 days
    const trialUsers = await prisma.user.findMany({
      where: {
        isSubscribed: false,
      },
      select: {
        userId: true,
        email: true,
        displayName: true,
        isSubscribed: true,
        createdAt: true,
        renewalDate: true,
        lastBillingReminderSent: true,
      },
    });

    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: [],
    };

    const allUsers = [...subscribedUsers, ...trialUsers];

    for (const user of allUsers) {
      try {
        // Skip users who are already paid up
        // A subscribed user is paid up if their renewalDate is more than 7 days in the future
        // (we only send reminders at 5 days and 1 day before due)
        if (user.isSubscribed && user.renewalDate) {
          const renewalDate = new Date(user.renewalDate);
          const daysUntilRenewal = Math.ceil((renewalDate - today) / (1000 * 60 * 60 * 24));
          // If renewal is more than 7 days away, they're paid up - skip
          if (daysUntilRenewal > 7) {
            results.skipped++;
            continue;
          }
        }

        const dueDate = calculateDueDate(user);
        if (!dueDate) {
          results.skipped++;
          continue;
        }

        const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

        // Check if this is a reminder day (5 or 1 day before)
        const shouldSend = daysUntilDue === 5 || daysUntilDue === 1;

        if (!shouldSend) {
          results.skipped++;
          continue;
        }

        // Check if we already sent a reminder today
        if (user.lastBillingReminderSent) {
          const lastSent = new Date(user.lastBillingReminderSent);
          if (isSameDay(lastSent, today)) {
            results.skipped++;
            continue;
          }
        }

        // Calculate storage info
        const storageInfo = await calculateStorageInfo(user.userId);

        // Calculate totals
        const baseAmount = BASE_SUBSCRIPTION_CENTS / 100;
        const storageCharges = parseFloat(storageInfo.storageCharges);
        const totalAmount = (baseAmount + storageCharges).toFixed(2);

        // Create Stripe Checkout session for this user
        // The URL goes directly to Stripe's payment page
        let payNowUrl;
        try {
          payNowUrl = await createBillingCheckoutSession(user, storageInfo);
        } catch (stripeError) {
          console.error(`[Billing] Failed to create Stripe checkout for ${user.email}:`, stripeError.message);
          // Fallback to subscription page if Stripe fails
          payNowUrl = `${process.env.WEB_APP_URL || 'https://familyhelperapp.com'}/subscription`;
        }

        // Prepare email data
        const emailData = {
          userName: user.displayName || user.email,
          daysUntilDue: daysUntilDue,
          dueDate: formatDateDDMMMYYYY(dueDate),
          storageUsedGb: storageInfo.storageUsedGb,
          storagePacks: storageInfo.storagePacksNeeded,
          storageCharges: storageInfo.storageCharges,
          totalAmount: totalAmount,
          payNowUrl: payNowUrl,
        };

        // Send email
        await emailService.sendTemplate('billing_reminder', user.email, emailData);

        // Update lastBillingReminderSent
        await prisma.user.update({
          where: { userId: user.userId },
          data: { lastBillingReminderSent: now },
        });

        console.log(`[Billing] Sent ${daysUntilDue}-day reminder to ${user.email}`);
        results.sent++;
        results.processed++;
      } catch (error) {
        console.error(`[Billing] Failed to process user ${user.email}:`, error.message);
        results.errors.push({
          userId: user.userId,
          email: user.email,
          error: error.message,
        });
        results.processed++;
      }
    }

    console.log(`[Billing] Reminders complete: ${results.sent} sent, ${results.skipped} skipped, ${results.errors.length} errors`);

    res.status(200).json({
      success: true,
      results: results,
    });
  } catch (error) {
    console.error('Send billing reminders error:', error);
    res.status(500).json({
      error: 'Failed to send billing reminders',
      message: error.message,
    });
  }
}

module.exports = {
  getSubscriptionStatus,
  getPricing,
  getCurrentSubscription,
  cancelSubscription,
  reactivateSubscription,
  getInvoice,
  payNow,
  regenerateBill,
  sendBillingReminders,
};
