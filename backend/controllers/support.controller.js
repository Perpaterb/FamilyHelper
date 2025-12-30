/**
 * Support Controller
 *
 * Handles support-only operations for managing users.
 * All actions are logged to SupportAuditLog for compliance.
 */

const { prisma } = require('../config/database');

// Set subscription end date to 100 years from now (effectively indefinite)
const getIndefiniteDate = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 100);
  return date;
};

/**
 * Middleware to verify user is a support user
 */
const requireSupportUser = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { isSupportUser: true, isLocked: true },
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    if (user.isLocked) {
      return res.status(403).json({ success: false, error: 'Account is locked' });
    }

    if (!user.isSupportUser) {
      return res.status(403).json({ success: false, error: 'Support access required' });
    }

    next();
  } catch (error) {
    console.error('Support auth error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Create a support audit log entry
 */
const createSupportAuditLog = async ({
  performedById,
  performedByEmail,
  targetUserId,
  targetUserEmail,
  action,
  details,
  previousValue,
  newValue,
  ipAddress,
  userAgent,
}) => {
  return prisma.supportAuditLog.create({
    data: {
      performedById,
      performedByEmail,
      targetUserId,
      targetUserEmail,
      action,
      details,
      previousValue,
      newValue,
      ipAddress,
      userAgent,
    },
  });
};

/**
 * GET /support/users
 * List all users with pagination and search
 */
const listUsers = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = (pageNum - 1) * limitNum;

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          userId: true,
          email: true,
          displayName: true,
          memberIcon: true,
          iconColor: true,
          profilePhotoFileId: true,
          isSubscribed: true,
          subscriptionId: true,
          subscriptionEndDate: true,
          renewalDate: true,
          subscriptionManuallyExpired: true,
          storageLimitGb: true,
          isSupportUser: true,
          isLocked: true,
          lockedAt: true,
          lockedReason: true,
          createdAt: true,
          lastLogin: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.user.count({ where }),
    ]);

    return res.json({
      success: true,
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error listing users:', error);
    return res.status(500).json({ success: false, error: 'Failed to list users' });
  }
};

/**
 * PUT /support/users/:userId/subscription
 * Grant or revoke unlimited subscription access
 */
const updateSubscription = async (req, res) => {
  try {
    const { userId } = req.params;
    const { grant } = req.body;
    const supportUser = req.user;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const targetUser = await prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        email: true,
        isSubscribed: true,
        subscriptionId: true,
        subscriptionEndDate: true,
        storageLimitGb: true,
      },
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const previousValue = JSON.stringify({
      isSubscribed: targetUser.isSubscribed,
      subscriptionId: targetUser.subscriptionId,
      subscriptionEndDate: targetUser.subscriptionEndDate,
      storageLimitGb: targetUser.storageLimitGb,
    });

    let updateData;
    let action;
    let newValue;

    if (grant) {
      updateData = {
        isSubscribed: true,
        subscriptionId: 'SUPPORT_GRANTED',
        subscriptionStartDate: new Date(),
        subscriptionEndDate: getIndefiniteDate(),
        storageLimitGb: 100,
      };
      action = 'grant_subscription';
      newValue = JSON.stringify(updateData);
    } else {
      updateData = {
        isSubscribed: false,
        subscriptionId: null,
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        storageLimitGb: 0,
      };
      action = 'revoke_subscription';
      newValue = JSON.stringify(updateData);
    }

    await prisma.user.update({
      where: { userId },
      data: updateData,
    });

    // Create audit log
    await createSupportAuditLog({
      performedById: supportUser.userId,
      performedByEmail: supportUser.email,
      targetUserId: targetUser.userId,
      targetUserEmail: targetUser.email,
      action,
      details: grant
        ? 'Granted unlimited subscription access'
        : 'Revoked subscription access',
      previousValue,
      newValue,
      ipAddress,
      userAgent,
    });

    return res.json({
      success: true,
      message: grant ? 'Subscription granted' : 'Subscription revoked',
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    return res.status(500).json({ success: false, error: 'Failed to update subscription' });
  }
};

/**
 * PUT /support/users/:userId/support-access
 * Grant or revoke support user access
 */
const updateSupportAccess = async (req, res) => {
  try {
    const { userId } = req.params;
    const { grant } = req.body;
    const supportUser = req.user;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Prevent removing your own support access
    if (userId === supportUser.userId && !grant) {
      return res.status(400).json({
        success: false,
        error: 'Cannot remove your own support access',
      });
    }

    const targetUser = await prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        email: true,
        isSupportUser: true,
      },
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const previousValue = JSON.stringify({ isSupportUser: targetUser.isSupportUser });

    await prisma.user.update({
      where: { userId },
      data: { isSupportUser: grant },
    });

    // Create audit log
    await createSupportAuditLog({
      performedById: supportUser.userId,
      performedByEmail: supportUser.email,
      targetUserId: targetUser.userId,
      targetUserEmail: targetUser.email,
      action: grant ? 'grant_support' : 'revoke_support',
      details: grant
        ? 'Granted support user access'
        : 'Revoked support user access',
      previousValue,
      newValue: JSON.stringify({ isSupportUser: grant }),
      ipAddress,
      userAgent,
    });

    return res.json({
      success: true,
      message: grant ? 'Support access granted' : 'Support access revoked',
    });
  } catch (error) {
    console.error('Error updating support access:', error);
    return res.status(500).json({ success: false, error: 'Failed to update support access' });
  }
};

/**
 * PUT /support/users/:userId/lock
 * Lock or unlock a user account
 */
const updateLockStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { lock, reason } = req.body;
    const supportUser = req.user;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Prevent locking yourself
    if (userId === supportUser.userId && lock) {
      return res.status(400).json({
        success: false,
        error: 'Cannot lock your own account',
      });
    }

    const targetUser = await prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        email: true,
        isLocked: true,
        lockedAt: true,
        lockedReason: true,
      },
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const previousValue = JSON.stringify({
      isLocked: targetUser.isLocked,
      lockedAt: targetUser.lockedAt,
      lockedReason: targetUser.lockedReason,
    });

    let updateData;
    if (lock) {
      updateData = {
        isLocked: true,
        lockedAt: new Date(),
        lockedReason: reason || 'Locked by support',
      };
    } else {
      updateData = {
        isLocked: false,
        lockedAt: null,
        lockedReason: null,
      };
    }

    await prisma.user.update({
      where: { userId },
      data: updateData,
    });

    // Create audit log
    await createSupportAuditLog({
      performedById: supportUser.userId,
      performedByEmail: supportUser.email,
      targetUserId: targetUser.userId,
      targetUserEmail: targetUser.email,
      action: lock ? 'lock_user' : 'unlock_user',
      details: lock
        ? `Account locked. Reason: ${reason || 'No reason provided'}`
        : 'Account unlocked',
      previousValue,
      newValue: JSON.stringify(updateData),
      ipAddress,
      userAgent,
    });

    return res.json({
      success: true,
      message: lock ? 'User account locked' : 'User account unlocked',
    });
  } catch (error) {
    console.error('Error updating lock status:', error);
    return res.status(500).json({ success: false, error: 'Failed to update lock status' });
  }
};

/**
 * GET /support/audit-logs
 * Get support audit logs with pagination and filtering
 */
const getAuditLogs = async (req, res) => {
  try {
    const { search = '', action = '', page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 100);
    const skip = (pageNum - 1) * limitNum;

    const where = {};

    if (search) {
      where.OR = [
        { targetUserEmail: { contains: search, mode: 'insensitive' } },
        { performedByEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (action) {
      where.action = action;
    }

    const [logs, total] = await Promise.all([
      prisma.supportAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.supportAuditLog.count({ where }),
    ]);

    return res.json({
      success: true,
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error getting audit logs:', error);
    return res.status(500).json({ success: false, error: 'Failed to get audit logs' });
  }
};

/**
 * PUT /support/users/:userId/subscription-end-date
 * Set a specific subscription end date for a user
 * Date must be in the future to activate subscription
 */
const updateSubscriptionEndDate = async (req, res) => {
  try {
    const { userId } = req.params;
    const { subscriptionEndDate } = req.body;
    const supportUser = req.user;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    if (!subscriptionEndDate) {
      return res.status(400).json({
        success: false,
        error: 'Subscription end date is required',
      });
    }

    const newEndDate = new Date(subscriptionEndDate);

    // Validate date is in the future
    if (newEndDate <= new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Subscription end date must be in the future',
      });
    }

    const targetUser = await prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        email: true,
        isSubscribed: true,
        subscriptionId: true,
        subscriptionStartDate: true,
        subscriptionEndDate: true,
        storageLimitGb: true,
      },
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const previousValue = JSON.stringify({
      isSubscribed: targetUser.isSubscribed,
      subscriptionId: targetUser.subscriptionId,
      subscriptionStartDate: targetUser.subscriptionStartDate,
      subscriptionEndDate: targetUser.subscriptionEndDate,
      storageLimitGb: targetUser.storageLimitGb,
    });

    // Setting a future date activates subscription
    const updateData = {
      isSubscribed: true,
      subscriptionId: targetUser.subscriptionId || 'SUPPORT_GRANTED',
      subscriptionStartDate: targetUser.subscriptionStartDate || new Date(),
      subscriptionEndDate: newEndDate,
      storageLimitGb: targetUser.storageLimitGb || 10, // Default 10GB if not set
    };

    await prisma.user.update({
      where: { userId },
      data: updateData,
    });

    // Create audit log
    await createSupportAuditLog({
      performedById: supportUser.userId,
      performedByEmail: supportUser.email,
      targetUserId: targetUser.userId,
      targetUserEmail: targetUser.email,
      action: 'update_subscription_end_date',
      details: `Set subscription end date to ${newEndDate.toISOString()}`,
      previousValue,
      newValue: JSON.stringify(updateData),
      ipAddress,
      userAgent,
    });

    return res.json({
      success: true,
      message: 'Subscription end date updated',
      subscriptionEndDate: newEndDate,
    });
  } catch (error) {
    console.error('Error updating subscription end date:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update subscription end date',
    });
  }
};

/**
 * PUT /support/users/:userId/expire-subscription
 * Expire a user's subscription by setting the end date to yesterday
 * This also handles the group admin expiry logic:
 * - Groups where they're the only admin: group becomes read-only (hasActiveAdmin = false)
 * - Groups with other admins: their role changes from admin to adult
 */
const expireSubscription = async (req, res) => {
  try {
    const { userId } = req.params;
    const supportUser = req.user;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const targetUser = await prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        email: true,
        isSubscribed: true,
        subscriptionId: true,
        subscriptionStartDate: true,
        subscriptionEndDate: true,
        subscriptionManuallyExpired: true,
        storageLimitGb: true,
      },
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const previousValue = JSON.stringify({
      isSubscribed: targetUser.isSubscribed,
      subscriptionId: targetUser.subscriptionId,
      subscriptionStartDate: targetUser.subscriptionStartDate,
      subscriptionEndDate: targetUser.subscriptionEndDate,
      subscriptionManuallyExpired: targetUser.subscriptionManuallyExpired,
      storageLimitGb: targetUser.storageLimitGb,
    });

    // Set subscription end date to yesterday to expire it
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const updateData = {
      isSubscribed: false,
      subscriptionEndDate: yesterday,
      subscriptionManuallyExpired: true,
    };

    await prisma.user.update({
      where: { userId },
      data: updateData,
    });

    // Handle group admin expiry logic
    const groupMemberships = await prisma.groupMember.findMany({
      where: {
        userId: userId,
        role: 'admin',
      },
      include: {
        group: {
          include: {
            members: {
              where: {
                role: 'admin',
                userId: { not: userId },
              },
              include: {
                user: {
                  select: {
                    isSubscribed: true,
                    subscriptionEndDate: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const groupsUpdated = [];
    const rolesChanged = [];

    for (const membership of groupMemberships) {
      const group = membership.group;

      // Check if there are other admins with active subscriptions
      const otherActiveAdmins = group.members.filter(m => {
        if (!m.user) return false;
        if (!m.user.isSubscribed) return false;
        if (m.user.subscriptionEndDate && new Date(m.user.subscriptionEndDate) <= new Date()) {
          return false;
        }
        return true;
      });

      if (otherActiveAdmins.length > 0) {
        // There are other active admins - change this user's role to adult
        await prisma.groupMember.update({
          where: { groupMemberId: membership.groupMemberId },
          data: { role: 'adult' },
        });
        rolesChanged.push({
          groupId: group.groupId,
          groupName: group.name,
          previousRole: 'admin',
          newRole: 'adult',
        });
      } else {
        // No other active admins - mark group as having no active admin
        await prisma.group.update({
          where: { groupId: group.groupId },
          data: { hasActiveAdmin: false },
        });
        groupsUpdated.push({
          groupId: group.groupId,
          groupName: group.name,
          status: 'read-only',
        });
      }
    }

    // Create audit log
    await createSupportAuditLog({
      performedById: supportUser.userId,
      performedByEmail: supportUser.email,
      targetUserId: targetUser.userId,
      targetUserEmail: targetUser.email,
      action: 'expire_subscription',
      details: `Expired subscription. Groups affected: ${groupsUpdated.length} now read-only, ${rolesChanged.length} role changes.`,
      previousValue,
      newValue: JSON.stringify({
        ...updateData,
        groupsReadOnly: groupsUpdated,
        rolesChanged: rolesChanged,
      }),
      ipAddress,
      userAgent,
    });

    return res.json({
      success: true,
      message: 'Subscription expired',
      subscriptionEndDate: yesterday,
      groupsAffected: {
        readOnly: groupsUpdated,
        roleChanges: rolesChanged,
      },
    });
  } catch (error) {
    console.error('Error expiring subscription:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to expire subscription',
    });
  }
};

/**
 * GET /support/check-access
 * Check if current user has support access
 */
const checkAccess = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.json({ success: true, isSupportUser: false });
    }

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { isSupportUser: true },
    });

    return res.json({
      success: true,
      isSupportUser: user?.isSupportUser || false,
    });
  } catch (error) {
    console.error('Error checking support access:', error);
    return res.status(500).json({ success: false, error: 'Failed to check access' });
  }
};

/**
 * PUT /support/users/:userId/renewal-date
 * Set a specific renewal date for a user's subscription
 * This is the "due date" - when the next payment is due
 */
const updateRenewalDate = async (req, res) => {
  try {
    const { userId } = req.params;
    const { renewalDate } = req.body;
    const supportUser = req.user;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    if (!renewalDate) {
      return res.status(400).json({
        success: false,
        error: 'Renewal date is required',
      });
    }

    const newRenewalDate = new Date(renewalDate);

    const targetUser = await prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        email: true,
        isSubscribed: true,
        renewalDate: true,
      },
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const previousValue = JSON.stringify({
      renewalDate: targetUser.renewalDate,
    });

    await prisma.user.update({
      where: { userId },
      data: { renewalDate: newRenewalDate },
    });

    // Create audit log
    await createSupportAuditLog({
      performedById: supportUser.userId,
      performedByEmail: supportUser.email,
      targetUserId: targetUser.userId,
      targetUserEmail: targetUser.email,
      action: 'update_renewal_date',
      details: `Set renewal date to ${newRenewalDate.toISOString()}`,
      previousValue,
      newValue: JSON.stringify({ renewalDate: newRenewalDate }),
      ipAddress,
      userAgent,
    });

    return res.json({
      success: true,
      message: 'Renewal date updated',
      renewalDate: newRenewalDate,
    });
  } catch (error) {
    console.error('Error updating renewal date:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update renewal date',
    });
  }
};

module.exports = {
  requireSupportUser,
  listUsers,
  updateSubscription,
  updateSubscriptionEndDate,
  updateRenewalDate,
  expireSubscription,
  updateSupportAccess,
  updateLockStatus,
  getAuditLogs,
  checkAccess,
};
