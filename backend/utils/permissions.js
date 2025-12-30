/**
 * Permission utility functions
 *
 * Handles permission checks for users, including trial users who should have
 * the same access level as admins during their 20-day trial period.
 */

/**
 * Check if a group is in read-only mode
 *
 * A group is read-only when:
 * - hasActiveAdmin is false (no admin with active subscription), OR
 * - readOnlyUntil is set AND in the future (legacy 30-day grace period)
 *
 * This happens when all admins have unsubscribed or their subscriptions expired.
 *
 * @param {Object} group - The Group object
 * @param {boolean} [group.hasActiveAdmin] - Whether group has an active admin
 * @param {Date|null} [group.readOnlyUntil] - The date until which the group is read-only
 * @returns {boolean} True if group is currently in read-only mode
 */
function isGroupReadOnly(group) {
  if (!group) {
    return false;
  }

  // Check if no active admin (new system)
  if (group.hasActiveAdmin === false) {
    return true;
  }

  // Check legacy readOnlyUntil field
  if (group.readOnlyUntil) {
    const readOnlyUntil = new Date(group.readOnlyUntil);
    const now = new Date();
    if (now < readOnlyUntil) {
      return true;
    }
  }

  return false;
}

/**
 * Get read-only error response for a group
 *
 * @param {Object} group - The Group object
 * @returns {Object} Error response object with status and message
 */
function getReadOnlyErrorResponse(group) {
  // Check if it's due to no active admin
  if (group && group.hasActiveAdmin === false) {
    return {
      error: 'Group is read-only',
      message: 'This group has no active admin with a valid subscription. All modifications are disabled until an admin subscribes.',
      code: 'GROUP_NO_ACTIVE_ADMIN',
    };
  }

  // Legacy readOnlyUntil message
  if (group && group.readOnlyUntil) {
    const readOnlyUntil = new Date(group.readOnlyUntil);
    const formattedDate = readOnlyUntil.toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return {
      error: 'Group is read-only',
      message: `This group is in read-only mode until ${formattedDate}. No new content can be added. An admin needs to resubscribe to restore full access.`,
      code: 'GROUP_READ_ONLY_UNTIL',
    };
  }

  return {
    error: 'Group is read-only',
    message: 'This group is in read-only mode. No new content can be added.',
    code: 'GROUP_READ_ONLY',
  };
}

/**
 * Check if a user has admin-level permissions
 *
 * This includes:
 * - Members with role === 'admin'
 * - Users on 20-day trial (account created within last 20 days and not subscribed)
 *
 * @param {Object} groupMember - The GroupMember object
 * @param {string} groupMember.role - The member's role in the group
 * @param {Object} [groupMember.user] - The linked User object (optional)
 * @param {boolean} [groupMember.user.isSubscribed] - User's subscription status
 * @param {Date} [groupMember.user.createdAt] - User's account creation date
 * @returns {boolean} True if user has admin-level permissions
 */
function hasAdminPermissions(groupMember) {
  if (!groupMember) {
    return false;
  }

  // Check if they're an admin
  if (groupMember.role === 'admin') {
    return true;
  }

  // Check if they're on trial (account created within last 20 days and not subscribed)
  if (groupMember.user && !groupMember.user.isSubscribed) {
    const daysSinceCreation = (Date.now() - new Date(groupMember.user.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreation <= 20) {
      return true;
    }
  }

  return false;
}

module.exports = {
  hasAdminPermissions,
  isGroupReadOnly,
  getReadOnlyErrorResponse,
};
