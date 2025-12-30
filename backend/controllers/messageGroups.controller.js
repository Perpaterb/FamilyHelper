/**
 * Message Groups Controller
 *
 * Handles message group operations within groups.
 * Message groups are subsets of group members who can communicate together.
 */

const { prisma } = require('../config/database');
const { isGroupReadOnly, getReadOnlyErrorResponse } = require('../utils/permissions');

/**
 * Get all message groups for a group
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getMessageGroups(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is a member of the group
    const userMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!userMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Check admin visibility permissions from group settings
    const userRole = userMembership.role;
    if (userRole === 'admin') {
      const groupSettings = await prisma.groupSettings.findUnique({
        where: { groupId },
        select: { messageGroupsVisibleToAdmins: true },
      });
      if (groupSettings && !groupSettings.messageGroupsVisibleToAdmins) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Message groups are not visible to admins in this group',
        });
      }
    }

    // Get message groups based on role:
    // - Admins: ALL message groups in the group (even if not a member)
    // - Non-admins: Only message groups they're a member of AND not hidden
    const messageGroups = await prisma.messageGroup.findMany({
      where: {
        groupId: groupId,
        // Non-admins: must be a member AND message group must not be hidden
        ...(userMembership.role !== 'admin' && {
          members: {
            some: {
              groupMemberId: userMembership.groupMemberId,
            },
          },
          isHidden: false,
        }),
        // Admins: no restrictions, see everything
      },
      include: {
        members: {
          select: {
            groupMemberId: true, // Include for React key and identification
            groupMember: {
              select: {
                displayName: true,
                iconLetters: true,
                iconColor: true,
                isRegistered: true,
                user: {
                  select: {
                    displayName: true,
                    memberIcon: true,
                    iconColor: true,
                    profilePhotoFileId: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            messages: true,
            members: true,
          },
        },
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
    });

    // Calculate unread count for each message group and merge profile data
    const messageGroupsWithUnreadCount = await Promise.all(
      messageGroups.map(async (messageGroup) => {
        // Find current user's membership to get their lastReadAt
        const currentUserMembership = await prisma.messageGroupMember.findUnique({
          where: {
            messageGroupId_groupMemberId: {
              messageGroupId: messageGroup.messageGroupId,
              groupMemberId: userMembership.groupMemberId,
            },
          },
        });

        // Count unread messages (messages created after lastReadAt)
        // Non-members (admin viewing) should always have 0 unread
        // Exclude user's own messages from unread count
        // If message group is muted, return 0 (no badges shown)
        const unreadCount = currentUserMembership && !currentUserMembership.isMuted
          ? await prisma.message.count({
              where: {
                messageGroupId: messageGroup.messageGroupId,
                isHidden: false,
                senderId: { not: userMembership.groupMemberId },
                createdAt: {
                  gt: currentUserMembership.lastReadAt || new Date(0),
                },
              },
            })
          : 0;

        // Count unread mentions (messages mentioning user created after lastReadAt)
        // Non-members (admin viewing) should always have 0 unread mentions
        // Exclude user's own messages from unread mentions count
        // If message group is muted, return 0 (no badges shown)
        const unreadMentionsCount = currentUserMembership && !currentUserMembership.isMuted
          ? await prisma.message.count({
              where: {
                messageGroupId: messageGroup.messageGroupId,
                isHidden: false,
                senderId: { not: userMembership.groupMemberId },
                mentions: {
                  has: userMembership.groupMemberId,
                },
                createdAt: {
                  gt: currentUserMembership.lastReadAt || new Date(0),
                },
              },
            })
          : 0;

        // Merge User profile data with GroupMember data (prioritize User profile)
        return {
          ...messageGroup,
          unreadCount,
          unreadMentionsCount,
          isMember: !!currentUserMembership, // Flag indicating if current user is a member
          isMuted: currentUserMembership?.isMuted || false, // Mute status for this message group
          isPinned: currentUserMembership?.isPinned || false, // Pin status for this message group
          members: messageGroup.members.map(member => ({
            groupMemberId: member.groupMemberId,
            groupMember: {
              displayName: member.groupMember.user?.displayName || member.groupMember.displayName,
              iconLetters: member.groupMember.user?.memberIcon || member.groupMember.iconLetters,
              iconColor: member.groupMember.user?.iconColor || member.groupMember.iconColor,
              profilePhotoUrl: member.groupMember.user?.profilePhotoFileId
                ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${member.groupMember.user.profilePhotoFileId}`
                : null,
              isRegistered: member.groupMember.isRegistered,
            },
          })),
        };
      })
    );

    res.json({
      success: true,
      messageGroups: messageGroupsWithUnreadCount,
    });
  } catch (error) {
    console.error('Get message groups error:', error);
    res.status(500).json({
      error: 'Failed to get message groups',
      message: error.message,
    });
  }
}

/**
 * Create a new message group
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function createMessageGroup(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;
    const { name, memberIds } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Validate required fields
    if (!name || !memberIds || !Array.isArray(memberIds)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Name and memberIds (array) are required',
      });
    }

    if (memberIds.length < 2) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Message group must have at least 2 members',
      });
    }

    // Check if user is a member of the group
    const userMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!userMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // CRITICAL: Supervisors cannot create message groups (view-only role)
    if (userMembership.role === 'supervisor') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Supervisors cannot create message groups',
      });
    }

    // Check permissions based on group settings
    const groupSettings = await prisma.groupSettings.findUnique({
      where: { groupId: groupId },
    });

    const canCreateMessageGroup =
      (userMembership.role === 'admin' && groupSettings?.messageGroupsCreatableByAdmins !== false) ||
      (userMembership.role === 'parent' && groupSettings?.messageGroupsCreatableByParents) ||
      (userMembership.role === 'adult' && groupSettings?.messageGroupsCreatableByAdults) ||
      (userMembership.role === 'child' && groupSettings?.messageGroupsCreatableByChildren) ||
      (userMembership.role === 'caregiver' && groupSettings?.messageGroupsCreatableByCaregivers);

    if (!canCreateMessageGroup) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to create message groups',
      });
    }

    // Check if group is in read-only mode (all admins unsubscribed)
    const group = await prisma.group.findUnique({
      where: { groupId: groupId },
      select: { readOnlyUntil: true, hasActiveAdmin: true },
    });

    if (isGroupReadOnly(group)) {
      return res.status(403).json(getReadOnlyErrorResponse(group));
    }

    // Verify all member IDs are valid group members
    const validMembers = await prisma.groupMember.findMany({
      where: {
        groupMemberId: {
          in: memberIds,
        },
        groupId: groupId,
      },
    });

    if (validMembers.length !== memberIds.length) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Some member IDs are invalid or not in this group',
      });
    }

    // Ensure creator is included in memberIds
    if (!memberIds.includes(userMembership.groupMemberId)) {
      memberIds.push(userMembership.groupMemberId);
    }

    // Create message group
    const messageGroup = await prisma.messageGroup.create({
      data: {
        groupId: groupId,
        name: name.trim(),
        createdBy: userMembership.groupMemberId,
        members: {
          create: memberIds.map(memberId => ({
            groupMemberId: memberId,
          })),
        },
      },
      include: {
        members: {
          select: {
            groupMemberId: true, // Include for React key and identification
            groupMember: {
              select: {
                displayName: true,
                iconLetters: true,
                iconColor: true,
                isRegistered: true,
                user: {
                  select: {
                    displayName: true,
                    memberIcon: true,
                    iconColor: true,
                    profilePhotoFileId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'create_message_group',
        performedBy: userMembership.groupMemberId,
        performedByName: userMembership.displayName,
        performedByEmail: userMembership.email,
        actionLocation: 'message_groups',
        messageContent: `Created message group "${name}" with ${memberIds.length} members`,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Message group created successfully',
      messageGroup: messageGroup,
    });
  } catch (error) {
    console.error('Create message group error:', error);
    res.status(500).json({
      error: 'Failed to create message group',
      message: error.message,
    });
  }
}

/**
 * Get a specific message group
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getMessageGroupById(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is a member of the group
    const userMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!userMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Get message group
    const messageGroup = await prisma.messageGroup.findUnique({
      where: {
        messageGroupId: messageGroupId,
      },
      include: {
        members: {
          include: {
            groupMember: {
              select: {
                groupMemberId: true,
                displayName: true,
                iconLetters: true,
                iconColor: true,
                role: true,
                isRegistered: true,
                user: {
                  select: {
                    displayName: true,
                    memberIcon: true,
                    iconColor: true,
                    profilePhotoFileId: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    if (!messageGroup) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Message group not found',
      });
    }

    // Verify message group belongs to the group
    if (messageGroup.groupId !== groupId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Message group does not belong to this group',
      });
    }

    // Verify user is a member of the message group
    // Admins can view settings even if not a member
    const isMember = messageGroup.members.some(
      m => m.groupMemberId === userMembership.groupMemberId
    );

    if (!isMember && userMembership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this message group',
      });
    }

    // Merge User profile data with GroupMember data (prioritize User profile)
    const messageGroupWithMergedProfiles = {
      ...messageGroup,
      members: messageGroup.members.map(member => ({
        ...member,
        groupMember: {
          groupMemberId: member.groupMember.groupMemberId,
          displayName: member.groupMember.user?.displayName || member.groupMember.displayName,
          iconLetters: member.groupMember.user?.memberIcon || member.groupMember.iconLetters,
          iconColor: member.groupMember.user?.iconColor || member.groupMember.iconColor,
          profilePhotoUrl: member.groupMember.user?.profilePhotoFileId
            ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${member.groupMember.user.profilePhotoFileId}`
            : null,
          role: member.groupMember.role,
          isRegistered: member.groupMember.isRegistered,
        },
      })),
    };

    res.json({
      success: true,
      messageGroup: messageGroupWithMergedProfiles,
      userRole: userMembership.role, // Include user's role for frontend to check permissions
      currentGroupMemberId: userMembership.groupMemberId, // Include current user's group member ID for message alignment
    });
  } catch (error) {
    console.error('Get message group error:', error);
    res.status(500).json({
      error: 'Failed to get message group',
      message: error.message,
    });
  }
}

/**
 * Update message group name
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function updateMessageGroup(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId } = req.params;
    const { name, usersCanDeleteOwnMessages } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // At least one field must be provided
    if (!name && usersCanDeleteOwnMessages === undefined) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'At least one field (name or usersCanDeleteOwnMessages) is required',
      });
    }

    // Check if user is a member of the group
    const userMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!userMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Get message group
    const messageGroup = await prisma.messageGroup.findUnique({
      where: {
        messageGroupId: messageGroupId,
      },
    });

    if (!messageGroup) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Message group not found',
      });
    }

    // Verify message group belongs to the group
    if (messageGroup.groupId !== groupId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Message group does not belong to this group',
      });
    }

    // Only creator or admin can update
    if (messageGroup.createdBy !== userMembership.groupMemberId && userMembership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the creator or an admin can update the message group',
      });
    }

    // Build update data object
    const updateData = {};
    if (name) {
      updateData.name = name.trim();
    }
    if (usersCanDeleteOwnMessages !== undefined) {
      updateData.usersCanDeleteOwnMessages = usersCanDeleteOwnMessages;
    }

    // Update message group
    const updatedMessageGroup = await prisma.messageGroup.update({
      where: {
        messageGroupId: messageGroupId,
      },
      data: updateData,
    });

    // Create audit log
    const changes = [];
    if (name) changes.push(`name to "${name}"`);
    if (usersCanDeleteOwnMessages !== undefined) {
      changes.push(`users can delete own messages to ${usersCanDeleteOwnMessages ? 'enabled' : 'disabled'}`);
    }

    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'update_message_group',
        performedBy: userMembership.groupMemberId,
        performedByName: userMembership.displayName,
        performedByEmail: userMembership.email,
        actionLocation: 'message_groups',
        messageContent: `Updated message group: ${changes.join(', ')}`,
      },
    });

    res.json({
      success: true,
      message: 'Message group updated successfully',
      messageGroup: updatedMessageGroup,
    });
  } catch (error) {
    console.error('Update message group error:', error);
    res.status(500).json({
      error: 'Failed to update message group',
      message: error.message,
    });
  }
}

/**
 * Delete message group (soft delete - sets isHidden to true)
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function deleteMessageGroup(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is a member of the group
    const userMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!userMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Get message group
    const messageGroup = await prisma.messageGroup.findUnique({
      where: {
        messageGroupId: messageGroupId,
      },
    });

    if (!messageGroup) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Message group not found',
      });
    }

    // Verify message group belongs to the group
    if (messageGroup.groupId !== groupId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Message group does not belong to this group',
      });
    }

    // Only admin can delete (soft delete)
    if (userMembership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admins can delete message groups',
      });
    }

    // Soft delete: Set isHidden to true (makes it read-only)
    await prisma.messageGroup.update({
      where: {
        messageGroupId: messageGroupId,
      },
      data: {
        isHidden: true,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'hide_message_group',
        performedBy: userMembership.groupMemberId,
        performedByName: userMembership.displayName,
        performedByEmail: userMembership.email,
        actionLocation: 'message_groups',
        messageContent: `Soft deleted (hidden) message group "${messageGroup.name}"`,
      },
    });

    res.json({
      success: true,
      message: 'Message group deleted successfully',
    });
  } catch (error) {
    console.error('Delete message group error:', error);
    res.status(500).json({
      error: 'Failed to delete message group',
      message: error.message,
    });
  }
}

/**
 * Undelete message group (sets isHidden to false)
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function undeleteMessageGroup(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is a member of the group
    const userMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!userMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Only admin can undelete
    if (userMembership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admins can restore message groups',
      });
    }

    // Get message group
    const messageGroup = await prisma.messageGroup.findUnique({
      where: {
        messageGroupId: messageGroupId,
      },
    });

    if (!messageGroup) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Message group not found',
      });
    }

    // Verify message group belongs to the group
    if (messageGroup.groupId !== groupId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Message group does not belong to this group',
      });
    }

    // Undelete: Set isHidden to false
    await prisma.messageGroup.update({
      where: {
        messageGroupId: messageGroupId,
      },
      data: {
        isHidden: false,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'restore_message_group',
        performedBy: userMembership.groupMemberId,
        performedByName: userMembership.displayName,
        performedByEmail: userMembership.email,
        actionLocation: 'message_groups',
        messageContent: `Restored message group "${messageGroup.name}"`,
      },
    });

    res.json({
      success: true,
      message: 'Message group restored successfully',
    });
  } catch (error) {
    console.error('Undelete message group error:', error);
    res.status(500).json({
      error: 'Failed to restore message group',
      message: error.message,
    });
  }
}

/**
 * Add members to message group
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function addMembersToMessageGroup(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId } = req.params;
    const { memberIds } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'memberIds array is required and must not be empty',
      });
    }

    // Check if user is a member of the group
    const userMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!userMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Only admin can add members
    if (userMembership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admins can add members to message groups',
      });
    }

    // Get message group
    const messageGroup = await prisma.messageGroup.findUnique({
      where: {
        messageGroupId: messageGroupId,
      },
    });

    if (!messageGroup) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Message group not found',
      });
    }

    // Verify message group belongs to the group
    if (messageGroup.groupId !== groupId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Message group does not belong to this group',
      });
    }

    // Verify all member IDs are valid group members
    const validMembers = await prisma.groupMember.findMany({
      where: {
        groupMemberId: {
          in: memberIds,
        },
        groupId: groupId,
      },
    });

    if (validMembers.length !== memberIds.length) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Some member IDs are invalid or not in this group',
      });
    }

    // Add members to message group
    await prisma.messageGroupMember.createMany({
      data: memberIds.map(memberId => ({
        messageGroupId: messageGroupId,
        groupMemberId: memberId,
      })),
      skipDuplicates: true,
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'add_message_group_members',
        performedBy: userMembership.groupMemberId,
        performedByName: userMembership.displayName,
        performedByEmail: userMembership.email,
        actionLocation: 'message_groups',
        messageContent: `Added ${memberIds.length} member(s) to message group "${messageGroup.name}"`,
      },
    });

    res.json({
      success: true,
      message: 'Members added successfully',
    });
  } catch (error) {
    console.error('Add members error:', error);
    res.status(500).json({
      error: 'Failed to add members',
      message: error.message,
    });
  }
}

/**
 * Remove member from message group
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function removeMemberFromMessageGroup(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId, memberId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is a member of the group
    const userMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!userMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Only admin can remove members
    if (userMembership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admins can remove members from message groups',
      });
    }

    // Get message group
    const messageGroup = await prisma.messageGroup.findUnique({
      where: {
        messageGroupId: messageGroupId,
      },
      include: {
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    if (!messageGroup) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Message group not found',
      });
    }

    // Verify message group belongs to the group
    if (messageGroup.groupId !== groupId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Message group does not belong to this group',
      });
    }

    // Prevent removing last member
    if (messageGroup._count.members <= 1) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Cannot remove the last member from a message group',
      });
    }

    // Remove member from message group
    await prisma.messageGroupMember.delete({
      where: {
        messageGroupId_groupMemberId: {
          messageGroupId: messageGroupId,
          groupMemberId: memberId,
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'remove_message_group_member',
        performedBy: userMembership.groupMemberId,
        performedByName: userMembership.displayName,
        performedByEmail: userMembership.email,
        actionLocation: 'message_groups',
        messageContent: `Removed member from message group "${messageGroup.name}"`,
      },
    });

    res.json({
      success: true,
      message: 'Member removed successfully',
    });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({
      error: 'Failed to remove member',
      message: error.message,
    });
  }
}

/**
 * Mute a message group for the current user
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function muteMessageGroup(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is a member of the main group
    const userMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!userMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Check if user is a member of the message group
    const messageGroupMembership = await prisma.messageGroupMember.findUnique({
      where: {
        messageGroupId_groupMemberId: {
          messageGroupId: messageGroupId,
          groupMemberId: userMembership.groupMemberId,
        },
      },
    });

    if (!messageGroupMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this message group',
      });
    }

    // Mute the message group
    await prisma.messageGroupMember.update({
      where: {
        messageGroupId_groupMemberId: {
          messageGroupId: messageGroupId,
          groupMemberId: userMembership.groupMemberId,
        },
      },
      data: {
        isMuted: true,
      },
    });

    res.json({
      success: true,
      message: 'Message group muted successfully',
    });
  } catch (error) {
    console.error('Mute message group error:', error);
    res.status(500).json({
      error: 'Failed to mute message group',
      message: error.message,
    });
  }
}

/**
 * Unmute a message group for the current user
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function unmuteMessageGroup(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is a member of the main group
    const userMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!userMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Check if user is a member of the message group
    const messageGroupMembership = await prisma.messageGroupMember.findUnique({
      where: {
        messageGroupId_groupMemberId: {
          messageGroupId: messageGroupId,
          groupMemberId: userMembership.groupMemberId,
        },
      },
    });

    if (!messageGroupMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this message group',
      });
    }

    // Unmute the message group
    await prisma.messageGroupMember.update({
      where: {
        messageGroupId_groupMemberId: {
          messageGroupId: messageGroupId,
          groupMemberId: userMembership.groupMemberId,
        },
      },
      data: {
        isMuted: false,
      },
    });

    res.json({
      success: true,
      message: 'Message group unmuted successfully',
    });
  } catch (error) {
    console.error('Unmute message group error:', error);
    res.status(500).json({
      error: 'Failed to unmute message group',
      message: error.message,
    });
  }
}

module.exports = {
  getMessageGroups,
  createMessageGroup,
  getMessageGroupById,
  updateMessageGroup,
  deleteMessageGroup,
  undeleteMessageGroup,
  addMembersToMessageGroup,
  removeMemberFromMessageGroup,
  muteMessageGroup,
  unmuteMessageGroup,
};
