/**
 * Messages Controller
 *
 * Handles messaging operations within groups.
 * All message content is encrypted at rest using AES-256-GCM.
 */

const { prisma } = require('../config/database');
const encryptionService = require('../services/encryption.service');
const storageService = require('../services/storage');
const { isGroupReadOnly, getReadOnlyErrorResponse } = require('../utils/permissions');
const pushNotificationService = require('../services/pushNotification.service');

/**
 * Get messages for a group
 * GET /groups/:groupId/messages
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getMessages(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;
    const { limit = 50, before } = req.query;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is a member of this group
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // TODO: Implement message groups
    // For now, return empty messages list
    // In the future, we need to either:
    // 1. Create a default message group for each group, OR
    // 2. Simplify the schema to have messages directly on groups

    res.status(200).json({
      success: true,
      messages: [],
      hasMore: false,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      error: 'Failed to get messages',
      message: error.message,
    });
  }
}

/**
 * Send a message to a group
 * POST /groups/:groupId/messages
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function sendMessage(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;
    const { content, mentions } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Validate content
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Message content cannot be empty',
      });
    }

    // Check if user is a member of this group
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Supervisors cannot send messages (per appplan.md line 91)
    if (membership.role === 'supervisor') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Supervisors cannot send messages',
      });
    }

    // TODO: Implement message groups
    // For now, sending messages is disabled
    return res.status(501).json({
      error: 'Not Implemented',
      message: 'Messaging feature coming soon. Message groups need to be implemented.',
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      error: 'Failed to send message',
      message: error.message,
    });
  }
}

/**
 * Get messages for a message group
 * GET /groups/:groupId/message-groups/:messageGroupId/messages
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getMessageGroupMessages(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId } = req.params;
    const { limit = 50, before } = req.query;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is a member of this group
    const groupMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Check if user is a member of this message group
    // Admins can view messages even if not a member (read-only)
    const messageGroupMembership = await prisma.messageGroupMember.findFirst({
      where: {
        messageGroupId: messageGroupId,
        groupMemberId: groupMembership.groupMemberId,
      },
    });

    if (!messageGroupMembership && groupMembership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this message group',
      });
    }

    // Build query options
    const queryOptions = {
      where: {
        messageGroupId: messageGroupId,
        // Only hide hidden messages from non-admins
        ...(groupMembership.role !== 'admin' && { isHidden: false }),
      },
      orderBy: {
        createdAt: 'asc', // Oldest first
      },
      take: parseInt(limit),
      include: {
        sender: {
          select: {
            groupMemberId: true,
            displayName: true,
            iconLetters: true,
            iconColor: true,
            role: true,
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
        readReceipts: {
          select: {
            groupMemberId: true,
            readAt: true,
            groupMember: {
              select: {
                displayName: true,
                iconLetters: true,
                iconColor: true,
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
        media: {
          select: {
            mediaId: true,
            mediaType: true,
            mimeType: true,
            url: true,
            thumbnailUrl: true,
            fileSizeBytes: true,
            durationMs: true,
            uploadedAt: true,
            isHidden: true,
            hiddenAt: true,
            hiddenBy: true,
            s3Key: true,
            hider: {
              select: {
                displayName: true,
                iconLetters: true,
                iconColor: true,
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
        reactions: {
          select: {
            reactionId: true,
            emoji: true,
            createdAt: true,
            reactor: {
              select: {
                groupMemberId: true,
                displayName: true,
                iconLetters: true,
                iconColor: true,
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
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    };

    // If 'before' timestamp provided, get messages before that time
    if (before) {
      queryOptions.where.createdAt = {
        lt: new Date(before),
      };
    }

    const messages = await prisma.message.findMany(queryOptions);

    // Decrypt and merge User profile data with GroupMember data (prioritize User profile)
    const messagesWithLatestProfile = messages.map(message => {
      // Decrypt message content
      let decryptedContent;
      try {
        decryptedContent = encryptionService.decrypt(message.content);
      } catch (error) {
        // If decryption fails (old unencrypted message or corrupted data), use original
        console.warn(`Failed to decrypt message ${message.messageId}:`, error.message);
        decryptedContent = message.content;
      }

      return {
        ...message,
        content: decryptedContent, // Return decrypted content
        sender: {
          groupMemberId: message.sender.groupMemberId,
          displayName: message.sender.user?.displayName || message.sender.displayName,
          iconLetters: message.sender.user?.memberIcon || message.sender.iconLetters,
          iconColor: message.sender.user?.iconColor || message.sender.iconColor,
          profilePhotoUrl: message.sender.user?.profilePhotoFileId
            ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${message.sender.user.profilePhotoFileId}`
            : null,
          role: message.sender.role,
        },
        readReceipts: message.readReceipts.map(receipt => ({
          groupMemberId: receipt.groupMemberId,
          readAt: receipt.readAt,
          displayName: receipt.groupMember.user?.displayName || receipt.groupMember.displayName,
          iconLetters: receipt.groupMember.user?.memberIcon || receipt.groupMember.iconLetters,
          iconColor: receipt.groupMember.user?.iconColor || receipt.groupMember.iconColor,
          profilePhotoUrl: receipt.groupMember.user?.profilePhotoFileId
            ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${receipt.groupMember.user.profilePhotoFileId}`
            : null,
        })),
        // Format reactions with reactor profile data
        reactions: message.reactions?.map(reaction => ({
          reactionId: reaction.reactionId,
          emoji: reaction.emoji,
          createdAt: reaction.createdAt,
          reactor: {
            groupMemberId: reaction.reactor.groupMemberId,
            displayName: reaction.reactor.user?.displayName || reaction.reactor.displayName,
            iconLetters: reaction.reactor.user?.memberIcon || reaction.reactor.iconLetters,
            iconColor: reaction.reactor.user?.iconColor || reaction.reactor.iconColor,
            profilePhotoUrl: reaction.reactor.user?.profilePhotoFileId
              ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${reaction.reactor.user.profilePhotoFileId}`
              : null,
          },
        })) || [],
        // Convert BigInt fileSizeBytes to Number for JSON serialization
        // Include isHidden flag and deleted info for media
        media: message.media?.map(m => {
          // Extract filename from s3Key
          const s3KeyParts = m.s3Key ? m.s3Key.split('/') : [];
          const fileName = s3KeyParts.length > 0 ? s3KeyParts[s3KeyParts.length - 1] : 'Deleted file';

          return {
            mediaId: m.mediaId,
            mediaType: m.mediaType,
            mimeType: m.mimeType || null, // Full MIME type for format detection
            // Don't send URL for hidden/deleted files - they can't be viewed
            url: m.isHidden ? null : m.url,
            thumbnailUrl: m.isHidden ? null : m.thumbnailUrl,
            fileSizeBytes: m.fileSizeBytes ? Number(m.fileSizeBytes) : 0,
            durationMs: m.durationMs || null, // Duration in ms for audio/video
            uploadedAt: m.uploadedAt,
            // Deletion info
            isDeleted: m.isHidden || false,
            deletedAt: m.hiddenAt,
            fileName: fileName,
            deletedBy: m.isHidden && m.hider ? {
              displayName: m.hider.user?.displayName || m.hider.displayName,
              iconLetters: m.hider.user?.memberIcon || m.hider.iconLetters,
              iconColor: m.hider.user?.iconColor || m.hider.iconColor,
            } : null,
          };
        }),
      };
    });

    res.status(200).json({
      success: true,
      messages: messagesWithLatestProfile,
      hasMore: messages.length === parseInt(limit),
    });
  } catch (error) {
    console.error('Get message group messages error:', error);
    res.status(500).json({
      error: 'Failed to get messages',
      message: error.message,
    });
  }
}

/**
 * Send a message to a message group
 * POST /groups/:groupId/message-groups/:messageGroupId/messages
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function sendMessageGroupMessage(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId } = req.params;
    const { content, mentions, mediaFiles: mediaFilesInput } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Validate content (allow empty if media files are provided)
    if ((!content || content.trim().length === 0) && (!mediaFilesInput || mediaFilesInput.length === 0)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Message must have content or media attachments',
      });
    }

    // Check if user is a member of this group
    const groupMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Supervisors cannot send messages (per appplan.md line 91)
    if (groupMembership.role === 'supervisor') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Supervisors cannot send messages',
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

    // Check if user is a member of this message group
    const messageGroupMembership = await prisma.messageGroupMember.findFirst({
      where: {
        messageGroupId: messageGroupId,
        groupMemberId: groupMembership.groupMemberId,
      },
    });

    if (!messageGroupMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this message group',
      });
    }

    // Validate mentions if provided
    let validMentions = [];
    if (mentions && Array.isArray(mentions) && mentions.length > 0) {
      // Verify all mentioned members are in the message group
      const messageGroupMembers = await prisma.messageGroupMember.findMany({
        where: {
          messageGroupId: messageGroupId,
          groupMemberId: {
            in: mentions,
          },
        },
        select: {
          groupMemberId: true,
        },
      });

      validMentions = messageGroupMembers.map(m => m.groupMemberId);
    }

    // Validate media files if provided
    let mediaFiles = [];
    if (mediaFilesInput && Array.isArray(mediaFilesInput) && mediaFilesInput.length > 0) {
      // Use media file info provided by client (includes mimeType, fileSizeBytes, durationMs)
      mediaFiles = mediaFilesInput.map(file => ({
        fileId: file.fileId,
        mimeType: file.mimeType,
        s3Key: file.fileId,
        fileSizeBytes: file.fileSizeBytes || 0, // Use file size from upload response
        durationMs: file.durationMs ? parseInt(file.durationMs, 10) : null, // Duration in ms for audio/video
      }));
    }

    // Encrypt message content before storing (use space if content is empty)
    const messageContent = content && content.trim().length > 0 ? content.trim() : ' ';
    const encryptedContent = encryptionService.encrypt(messageContent);

    // Create the message with media
    const message = await prisma.message.create({
      data: {
        messageGroup: {
          connect: {
            messageGroupId: messageGroupId,
          },
        },
        sender: {
          connect: {
            groupMemberId: groupMembership.groupMemberId,
          },
        },
        content: encryptedContent, // Store encrypted content
        mentions: validMentions,
        media: {
          create: mediaFiles.map(file => {
            // Determine media type - default to 'image' for unknown types
            let mediaType = 'image'; // Default to image
            if (file.mimeType) {
              if (file.mimeType.startsWith('audio/')) {
                mediaType = 'audio';
              } else if (file.mimeType.startsWith('video/')) {
                mediaType = 'video';
              } else if (file.mimeType.startsWith('image/')) {
                mediaType = 'image';
              }
              // For other mimeTypes (e.g., application/octet-stream), keep default 'image'
            }
            return {
              mediaType: mediaType,
              mimeType: file.mimeType || null, // Full MIME type (e.g., audio/webm)
              s3Key: file.s3Key,
              url: file.fileId, // Store fileId as URL for retrieval
              fileSizeBytes: file.fileSizeBytes,
              durationMs: file.durationMs, // Duration for audio/video files
            };
          }),
        },
      },
      include: {
        sender: {
          select: {
            groupMemberId: true,
            displayName: true,
            iconLetters: true,
            iconColor: true,
            role: true,
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
        media: {
          select: {
            mediaId: true,
            mediaType: true,
            mimeType: true,
            url: true,
            thumbnailUrl: true,
            fileSizeBytes: true,
            durationMs: true,
            uploadedAt: true,
          },
        },
      },
    });

    // Decrypt message content before sending to client
    const decryptedContent = encryptionService.decrypt(message.content);

    // Merge User profile data with GroupMember data (prioritize User profile)
    const messageWithLatestProfile = {
      ...message,
      content: decryptedContent, // Return decrypted content to client
      sender: {
        groupMemberId: message.sender.groupMemberId,
        displayName: message.sender.user?.displayName || message.sender.displayName,
        iconLetters: message.sender.user?.memberIcon || message.sender.iconLetters,
        iconColor: message.sender.user?.iconColor || message.sender.iconColor,
        profilePhotoUrl: message.sender.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${message.sender.user.profilePhotoFileId}`
          : null,
        role: message.sender.role,
      },
      // Convert BigInt fileSizeBytes to Number for JSON serialization
      media: message.media?.map(m => ({
        ...m,
        fileSizeBytes: m.fileSizeBytes ? Number(m.fileSizeBytes) : 0,
      })),
    };

    // Update lastMessageAt on the message group and get message group name for audit log
    const messageGroup = await prisma.messageGroup.update({
      where: {
        messageGroupId: messageGroupId,
      },
      data: {
        lastMessageAt: new Date(),
      },
      select: {
        name: true,
      },
    });

    // Create audit log for sent message with complete details
    let auditLogContent = `Message Group: "${messageGroup.name}" (ID: ${messageGroupId})\n`;
    auditLogContent += `Message ID: ${message.messageId}\n`;
    auditLogContent += `Content: "${messageContent}"\n`;

    if (message.media && message.media.length > 0) {
      auditLogContent += `Media Files (${message.media.length}):\n`;
      message.media.forEach((media, index) => {
        auditLogContent += `  ${index + 1}. ${media.mediaType} - Media ID: ${media.mediaId}\n`;
      });
    }

    if (validMentions.length > 0) {
      auditLogContent += `Mentions: ${validMentions.length} member(s)`;
    }

    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'send_message',
        performedBy: groupMembership.groupMemberId,
        performedByName: groupMembership.displayName,
        performedByEmail: groupMembership.email || 'N/A',
        actionLocation: 'messages',
        messageContent: auditLogContent,
      },
    });

    // Send push notifications to other message group members
    // Fire and forget - don't block the response
    (async () => {
      try {
        // Get all members of this message group except the sender
        const messageGroupMembers = await prisma.messageGroupMember.findMany({
          where: {
            messageGroupId: messageGroupId,
            groupMemberId: { not: groupMembership.groupMemberId },
          },
          select: {
            groupMemberId: true,
          },
        });

        const memberIds = messageGroupMembers.map(m => m.groupMemberId);

        if (memberIds.length > 0) {
          // Get sender display name
          const senderName = messageWithLatestProfile.sender.displayName;
          const truncatedContent = messageContent.length > 100
            ? messageContent.substring(0, 100) + '...'
            : messageContent;

          // Determine notification type based on mentions
          const notificationType = validMentions.length > 0 ? 'mention' : 'message';

          // Send to members who have notifications enabled for this type
          await pushNotificationService.sendToGroupMembersWithPreferences(
            memberIds,
            notificationType,
            `${senderName} in ${messageGroup.name}`,
            truncatedContent,
            {
              type: 'new_message',
              groupId: groupId,
              messageGroupId: messageGroupId,
              messageId: message.messageId,
            }
          );
        }
      } catch (notificationError) {
        console.error('[Messages] Failed to send push notifications:', notificationError);
        // Don't fail the request if notifications fail
      }
    })();

    res.status(201).json({
      success: true,
      message: messageWithLatestProfile,
    });
  } catch (error) {
    console.error('Send message group message error:', error);
    res.status(500).json({
      error: 'Failed to send message',
      message: error.message,
    });
  }
}

/**
 * Mark message group as read
 * PUT /groups/:groupId/message-groups/:messageGroupId/mark-read
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function markMessageGroupAsRead(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId} = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is a member of this group
    const groupMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Get current lastReadAt to find unread messages
    const messageGroupMember = await prisma.messageGroupMember.findUnique({
      where: {
        messageGroupId_groupMemberId: {
          messageGroupId: messageGroupId,
          groupMemberId: groupMembership.groupMemberId,
        },
      },
    });

    // If user is not a member (admin viewing), just return success without marking as read
    // Non-member admins should never have unread counts anyway
    if (!messageGroupMember) {
      return res.json({
        success: true,
        message: 'No action needed - not a member',
        markedAsRead: 0,
      });
    }

    // Find all unread messages (messages created after lastReadAt that user hasn't read yet)
    const unreadMessages = await prisma.message.findMany({
      where: {
        messageGroupId: messageGroupId,
        isHidden: false,
        senderId: {
          not: groupMembership.groupMemberId, // Don't create read receipts for own messages
        },
        createdAt: {
          gt: messageGroupMember?.lastReadAt || new Date(0),
        },
        // Only get messages that don't already have a read receipt from this user
        readReceipts: {
          none: {
            groupMemberId: groupMembership.groupMemberId,
          },
        },
      },
      select: {
        messageId: true,
        content: true,
        senderId: true,
      },
    });

    const now = new Date();

    // Create read receipts for all unread messages
    if (unreadMessages.length > 0) {
      await prisma.messageReadReceipt.createMany({
        data: unreadMessages.map(msg => ({
          messageId: msg.messageId,
          groupMemberId: groupMembership.groupMemberId,
          readAt: now,
        })),
        skipDuplicates: true, // Skip if read receipt already exists
      });

      // Get message group name for audit log
      const messageGroup = await prisma.messageGroup.findUnique({
        where: { messageGroupId: messageGroupId },
        select: { name: true },
      });

      // Create individual audit log for each message read
      for (const msg of unreadMessages) {
        try {
          const decryptedContent = encryptionService.decrypt(msg.content);

          let auditLogContent = `Message Group: "${messageGroup?.name || 'Unknown'}" (ID: ${messageGroupId})\n`;
          auditLogContent += `Message ID: ${msg.messageId}\n`;
          auditLogContent += `Content: "${decryptedContent}"`;

          await prisma.auditLog.create({
            data: {
              groupId: groupId,
              action: 'read_messages',
              performedBy: groupMembership.groupMemberId,
              performedByName: groupMembership.displayName,
              performedByEmail: groupMembership.email || 'N/A',
              actionLocation: 'messages',
              messageContent: auditLogContent,
            },
          });
        } catch (err) {
          console.error('Failed to decrypt message for audit log:', err);

          // Still log it even if decryption fails
          let auditLogContent = `Message Group: "${messageGroup?.name || 'Unknown'}" (ID: ${messageGroupId})\n`;
          auditLogContent += `Message ID: ${msg.messageId}\n`;
          auditLogContent += `Content: [Failed to decrypt]`;

          await prisma.auditLog.create({
            data: {
              groupId: groupId,
              action: 'read_messages',
              performedBy: groupMembership.groupMemberId,
              performedByName: groupMembership.displayName,
              performedByEmail: groupMembership.email || 'N/A',
              actionLocation: 'messages',
              messageContent: auditLogContent,
            },
          });
        }
      }
    }

    // Update lastReadAt for this message group member
    await prisma.messageGroupMember.update({
      where: {
        messageGroupId_groupMemberId: {
          messageGroupId: messageGroupId,
          groupMemberId: groupMembership.groupMemberId,
        },
      },
      data: {
        lastReadAt: now,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Marked as read',
      messagesRead: unreadMessages.length,
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      error: 'Failed to mark as read',
      message: error.message,
    });
  }
}

/**
 * Hide a message
 * PUT /groups/:groupId/message-groups/:messageGroupId/messages/:messageId/hide
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function hideMessage(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId, messageId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is a member of this group
    const groupMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Get the message
    const message = await prisma.message.findUnique({
      where: {
        messageId: messageId,
      },
      include: {
        messageGroup: true,
      },
    });

    if (!message) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Message not found',
      });
    }

    // Check if message belongs to this message group
    if (message.messageGroupId !== messageGroupId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Message does not belong to this message group',
      });
    }

    // Check permissions
    const isAdmin = groupMembership.role === 'admin';
    const isOwnMessage = message.senderId === groupMembership.groupMemberId;
    const canDeleteOwnMessages = message.messageGroup.usersCanDeleteOwnMessages;

    if (!isAdmin && !isOwnMessage) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only hide your own messages',
      });
    }

    if (!isAdmin && isOwnMessage && !canDeleteOwnMessages) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Users cannot delete their own messages in this message group',
      });
    }

    // Hide the message
    await prisma.message.update({
      where: {
        messageId: messageId,
      },
      data: {
        isHidden: true,
        hiddenAt: new Date(),
        hiddenBy: groupMembership.groupMemberId,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'hide_message',
        performedBy: groupMembership.groupMemberId,
        performedByName: groupMembership.displayName,
        performedByEmail: groupMembership.email || 'N/A',
        actionLocation: 'messages',
        messageContent: `Hidden message: "${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}" (Message ID: ${messageId})`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Message hidden successfully',
    });
  } catch (error) {
    console.error('Hide message error:', error);
    res.status(500).json({
      error: 'Failed to hide message',
      message: error.message,
    });
  }
}

/**
 * Unhide a message (admin only)
 * PUT /groups/:groupId/message-groups/:messageGroupId/messages/:messageId/unhide
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function unhideMessage(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId, messageId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is an admin of this group
    const groupMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    if (groupMembership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admins can unhide messages',
      });
    }

    // Get the message
    const message = await prisma.message.findUnique({
      where: {
        messageId: messageId,
      },
    });

    if (!message) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Message not found',
      });
    }

    // Check if message belongs to this message group
    if (message.messageGroupId !== messageGroupId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Message does not belong to this message group',
      });
    }

    // Unhide the message
    await prisma.message.update({
      where: {
        messageId: messageId,
      },
      data: {
        isHidden: false,
        hiddenAt: null,
        hiddenBy: null,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'unhide_message',
        performedBy: groupMembership.groupMemberId,
        performedByName: groupMembership.displayName,
        performedByEmail: groupMembership.email || 'N/A',
        actionLocation: 'messages',
        messageContent: `Unhidden message: "${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}" (Message ID: ${messageId})`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Message unhidden successfully',
    });
  } catch (error) {
    console.error('Unhide message error:', error);
    res.status(500).json({
      error: 'Failed to unhide message',
      message: error.message,
    });
  }
}

/**
 * Add a reaction to a message
 * POST /groups/:groupId/message-groups/:messageGroupId/messages/:messageId/reactions
 */
async function addReaction(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId, messageId } = req.params;
    const { emoji } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }

    // Verify user is a member of the group
    const groupMembership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        user: { userId: userId },
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Verify user is a member of the message group
    const messageGroupMembership = await prisma.messageGroupMember.findFirst({
      where: {
        messageGroupId: messageGroupId,
        groupMemberId: groupMembership.groupMemberId,
      },
    });

    if (!messageGroupMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this message group',
      });
    }

    // Verify the message exists
    const message = await prisma.message.findUnique({
      where: { messageId: messageId },
    });

    if (!message || message.messageGroupId !== messageGroupId) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Create or update the reaction (upsert)
    const reaction = await prisma.messageReaction.upsert({
      where: {
        messageId_reactorId_emoji: {
          messageId: messageId,
          reactorId: groupMembership.groupMemberId,
          emoji: emoji,
        },
      },
      update: {}, // No update needed, just skip if exists
      create: {
        messageId: messageId,
        reactorId: groupMembership.groupMemberId,
        emoji: emoji,
      },
      include: {
        reactor: {
          select: {
            groupMemberId: true,
            displayName: true,
            iconLetters: true,
            iconColor: true,
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
    });

    // Format the response
    const formattedReaction = {
      reactionId: reaction.reactionId,
      emoji: reaction.emoji,
      createdAt: reaction.createdAt,
      reactor: {
        groupMemberId: reaction.reactor.groupMemberId,
        displayName: reaction.reactor.user?.displayName || reaction.reactor.displayName,
        iconLetters: reaction.reactor.user?.memberIcon || reaction.reactor.iconLetters,
        iconColor: reaction.reactor.user?.iconColor || reaction.reactor.iconColor,
        profilePhotoUrl: reaction.reactor.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${reaction.reactor.user.profilePhotoFileId}`
          : null,
      },
    };

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'add_reaction',
        performedBy: groupMembership.groupMemberId,
        performedByName: groupMembership.displayName,
        performedByEmail: groupMembership.email || 'N/A',
        actionLocation: 'messages',
        messageContent: `Added reaction "${emoji}" to message (Message ID: ${messageId})`,
      },
    });

    res.status(201).json({
      success: true,
      reaction: formattedReaction,
    });
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({
      error: 'Failed to add reaction',
      message: error.message,
    });
  }
}

/**
 * Remove a reaction from a message
 * DELETE /groups/:groupId/message-groups/:messageGroupId/messages/:messageId/reactions/:emoji
 */
async function removeReaction(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId, messageId, emoji } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify user is a member of the group
    const groupMembership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        user: { userId: userId },
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Delete the reaction
    const decodedEmoji = decodeURIComponent(emoji);
    await prisma.messageReaction.deleteMany({
      where: {
        messageId: messageId,
        reactorId: groupMembership.groupMemberId,
        emoji: decodedEmoji,
      },
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'remove_reaction',
        performedBy: groupMembership.groupMemberId,
        performedByName: groupMembership.displayName,
        performedByEmail: groupMembership.email || 'N/A',
        actionLocation: 'messages',
        messageContent: `Removed reaction "${decodedEmoji}" from message (Message ID: ${messageId})`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Reaction removed successfully',
    });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({
      error: 'Failed to remove reaction',
      message: error.message,
    });
  }
}

/**
 * Get reactions for a message
 * GET /groups/:groupId/message-groups/:messageGroupId/messages/:messageId/reactions
 */
async function getReactions(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, messageGroupId, messageId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify user is a member of the group
    const groupMembership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        user: { userId: userId },
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Get all reactions for the message
    const reactions = await prisma.messageReaction.findMany({
      where: { messageId: messageId },
      include: {
        reactor: {
          select: {
            groupMemberId: true,
            displayName: true,
            iconLetters: true,
            iconColor: true,
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
      orderBy: { createdAt: 'asc' },
    });

    // Format the reactions
    const formattedReactions = reactions.map(reaction => ({
      reactionId: reaction.reactionId,
      emoji: reaction.emoji,
      createdAt: reaction.createdAt,
      reactor: {
        groupMemberId: reaction.reactor.groupMemberId,
        displayName: reaction.reactor.user?.displayName || reaction.reactor.displayName,
        iconLetters: reaction.reactor.user?.memberIcon || reaction.reactor.iconLetters,
        iconColor: reaction.reactor.user?.iconColor || reaction.reactor.iconColor,
        profilePhotoUrl: reaction.reactor.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${reaction.reactor.user.profilePhotoFileId}`
          : null,
      },
    }));

    res.status(200).json({
      success: true,
      reactions: formattedReactions,
    });
  } catch (error) {
    console.error('Get reactions error:', error);
    res.status(500).json({
      error: 'Failed to get reactions',
      message: error.message,
    });
  }
}

module.exports = {
  getMessages,
  sendMessage,
  getMessageGroupMessages,
  sendMessageGroupMessage,
  markMessageGroupAsRead,
  hideMessage,
  unhideMessage,
  addReaction,
  removeReaction,
  getReactions,
};
