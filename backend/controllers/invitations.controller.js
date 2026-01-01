/**
 * Invitations Controller
 *
 * Handles group invitation operations.
 */

const { prisma } = require('../config/database');

/**
 * Get pending invitations for the current user
 * GET /invitations
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getInvitations(req, res) {
  try {
    const userId = req.user?.userId;
    const userEmail = req.user?.email;

    if (!userId || !userEmail) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Find all group memberships where:
    // 1. Email matches user's email
    // 2. Group is not deleted (isHidden = false)
    // 3. EITHER:
    //    a) isRegistered is false (normal pending invitation), OR
    //    b) isRegistered is true AND userId is null (placeholder created before user registered)
    const pendingInvitations = await prisma.groupMember.findMany({
      where: {
        email: userEmail.toLowerCase(),
        group: { isHidden: false }, // Exclude deleted groups
        OR: [
          { isRegistered: false }, // Normal invitation
          { isRegistered: true, userId: null }, // Placeholder from before user registered
        ],
      },
      include: {
        group: {
          select: {
            groupId: true,
            name: true,
            icon: true,
            backgroundColor: true,
          },
        },
      },
    });

    // Transform the data to include group information
    const invitations = pendingInvitations.map((invitation) => ({
      groupMemberId: invitation.groupMemberId,
      groupId: invitation.group.groupId,
      groupName: invitation.group.name,
      groupIcon: invitation.group.icon,
      groupBackgroundColor: invitation.group.backgroundColor,
      role: invitation.role,
      invitedByName: invitation.displayName,
      joinedAt: invitation.joinedAt,
    }));

    res.status(200).json({
      success: true,
      invitations: invitations,
    });
  } catch (error) {
    console.error('Get invitations error:', error);
    res.status(500).json({
      error: 'Failed to get invitations',
      message: error.message,
    });
  }
}

/**
 * Get count of pending invitations for the current user
 * GET /invitations/count
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getInvitationCount(req, res) {
  try {
    const userId = req.user?.userId;
    const userEmail = req.user?.email;

    if (!userId || !userEmail) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Count pending invitations (including placeholders created before user registered)
    // Exclude invitations for deleted groups
    const count = await prisma.groupMember.count({
      where: {
        email: userEmail.toLowerCase(),
        group: { isHidden: false }, // Exclude deleted groups
        OR: [
          { isRegistered: false }, // Normal invitation
          { isRegistered: true, userId: null }, // Placeholder from before user registered
        ],
      },
    });

    res.status(200).json({
      success: true,
      count: count,
    });
  } catch (error) {
    console.error('Get invitation count error:', error);
    res.status(500).json({
      error: 'Failed to get invitation count',
      message: error.message,
    });
  }
}

/**
 * Accept a group invitation
 * POST /invitations/:groupMemberId/accept
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function acceptInvitation(req, res) {
  try {
    const userId = req.user?.userId;
    const userEmail = req.user?.email;
    const { groupMemberId } = req.params;

    if (!userId || !userEmail) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Find the invitation
    const invitation = await prisma.groupMember.findUnique({
      where: { groupMemberId: groupMemberId },
      include: {
        group: {
          select: {
            groupId: true,
            name: true,
          },
        },
      },
    });

    if (!invitation) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Invitation not found',
      });
    }

    // Verify the invitation is for this user
    if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This invitation is not for you',
      });
    }

    // Verify it's still pending
    // Two valid cases:
    // 1. Normal invitation: isRegistered = false, userId can be set or null
    // 2. Placeholder: isRegistered = true, userId = null (created before user registered)
    // Invalid case: isRegistered = true AND userId is set (already accepted)
    if (invitation.isRegistered && invitation.userId !== null) {
      return res.status(400).json({
        error: 'Already Accepted',
        message: 'This invitation has already been accepted',
      });
    }

    // Update the invitation to mark it as accepted
    // Set the userId and isRegistered to true
    await prisma.groupMember.update({
      where: { groupMemberId: groupMemberId },
      data: {
        userId: userId,
        isRegistered: true,
        joinedAt: new Date(),
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: invitation.group.groupId,
        action: 'accept_invitation',
        performedBy: groupMemberId,
        performedByName: req.user.given_name || userEmail,
        performedByEmail: userEmail,
        actionLocation: 'invitations',
        messageContent: `${userEmail} accepted invitation to join as ${invitation.role}`,
      },
    });

    res.status(200).json({
      success: true,
      message: `You've joined ${invitation.group.name}`,
      groupId: invitation.group.groupId,
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({
      error: 'Failed to accept invitation',
      message: error.message,
    });
  }
}

/**
 * Decline a group invitation
 * POST /invitations/:groupMemberId/decline
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function declineInvitation(req, res) {
  try {
    const userId = req.user?.userId;
    const userEmail = req.user?.email;
    const { groupMemberId } = req.params;

    if (!userId || !userEmail) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Find the invitation
    const invitation = await prisma.groupMember.findUnique({
      where: { groupMemberId: groupMemberId },
      include: {
        group: {
          select: {
            groupId: true,
            name: true,
          },
        },
      },
    });

    if (!invitation) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Invitation not found',
      });
    }

    // Verify the invitation is for this user
    if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This invitation is not for you',
      });
    }

    // Verify it's still pending
    // Two valid cases:
    // 1. Normal invitation: isRegistered = false, userId can be set or null
    // 2. Placeholder: isRegistered = true, userId = null (created before user registered)
    // Invalid case: isRegistered = true AND userId is set (already accepted)
    if (invitation.isRegistered && invitation.userId !== null) {
      return res.status(400).json({
        error: 'Already Accepted',
        message: 'This invitation has already been accepted',
      });
    }

    // Delete the invitation
    await prisma.groupMember.delete({
      where: { groupMemberId: groupMemberId },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: invitation.group.groupId,
        action: 'decline_invitation',
        performedBy: groupMemberId,
        performedByName: req.user.given_name || userEmail,
        performedByEmail: userEmail,
        actionLocation: 'invitations',
        messageContent: `${userEmail} declined invitation to join as ${invitation.role}`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Invitation declined',
    });
  } catch (error) {
    console.error('Decline invitation error:', error);
    res.status(500).json({
      error: 'Failed to decline invitation',
      message: error.message,
    });
  }
}

module.exports = {
  getInvitations,
  getInvitationCount,
  acceptInvitation,
  declineInvitation,
};
