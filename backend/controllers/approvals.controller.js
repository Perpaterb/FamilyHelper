/**
 * Approvals Controller
 *
 * Handles approval workflow logic for admin actions that require multi-admin approval.
 */

const { prisma } = require('../config/database');
const { emailService } = require('../services/email');
const emailTemplates = require('../services/email/templates');

/**
 * Execute the action for an approved approval
 * @param {Object} approval - The approval object with approvalData
 */
async function executeApprovedAction(approval) {
  try {
    console.log(`[executeApprovedAction] Executing ${approval.approvalType} for approval ${approval.approvalId}`);

    // Parse approval data
    let data = {};
    try {
      data = typeof approval.approvalData === 'string'
        ? JSON.parse(approval.approvalData)
        : approval.approvalData;
    } catch (err) {
      console.error('[executeApprovedAction] Failed to parse approvalData:', err);
      return;
    }

    switch (approval.approvalType) {
      case 'add_member':
        // Add member to group
        if (data.targetEmail && data.targetRole) {
          // Check if user exists
          let targetUserId = data.targetUserId || null;
          if (!targetUserId) {
            const existingUser = await prisma.user.findUnique({
              where: { email: data.targetEmail.toLowerCase() },
            });
            targetUserId = existingUser?.userId || null;
          }

          // Create the group member
          const newMember = await prisma.groupMember.create({
            data: {
              groupId: approval.groupId,
              displayName: data.targetDisplayName,
              iconLetters: data.targetIconLetters,
              iconColor: data.targetIconColor || '#6200ee',
              role: data.targetRole,
              email: data.targetEmail.toLowerCase(),
              isRegistered: data.targetIsRegistered !== undefined ? data.targetIsRegistered : false,
              userId: targetUserId,
            },
          });

          console.log(`[executeApprovedAction] Added member ${newMember.groupMemberId} (${data.targetEmail}) to group ${approval.groupId}`);

          // Create audit log for the member addition
          await prisma.auditLog.create({
            data: {
              groupId: approval.groupId,
              action: 'add_member',
              performedBy: approval.requestedBy,
              performedByName: 'Approved by admins',
              performedByEmail: 'N/A',
              actionLocation: 'group_settings',
              messageContent: `Added ${data.targetDisplayName} (${data.targetEmail}) as ${data.targetRole} via approval workflow`,
            },
          });

          // Send invitation email to registered users only (skip placeholder accounts)
          if (targetUserId && !data.isPlaceholderAccount) {
            try {
              // Get group name and requester info for the email
              const group = await prisma.group.findUnique({
                where: { groupId: approval.groupId },
                select: { name: true },
              });
              const requester = await prisma.groupMember.findUnique({
                where: { groupMemberId: approval.requestedBy },
                select: { displayName: true },
              });

              const appUrl = process.env.APP_URL || 'https://familyhelperapp.com';
              const emailContent = emailTemplates.group_invitation({
                recipientName: data.targetDisplayName,
                groupName: group?.name || 'Unknown Group',
                inviterName: requester?.displayName || 'A group admin',
                role: data.targetRole,
                appUrl: appUrl,
              });
              await emailService.sendEmail({
                to: data.targetEmail.toLowerCase(),
                subject: emailContent.subject,
                text: emailContent.text,
                html: emailContent.html,
              });
              console.log(`[executeApprovedAction] Invitation email sent to ${data.targetEmail}`);
            } catch (emailError) {
              console.error(`[executeApprovedAction] Failed to send invitation email to ${data.targetEmail}:`, emailError.message);
            }
          } else if (data.isPlaceholderAccount) {
            console.log(`[executeApprovedAction] Skipping invitation email for placeholder account: ${data.targetEmail}`);
          }
        }
        break;

      case 'change_role_to_admin':
      case 'change_role_from_admin':
        // Change member role
        if (data.targetGroupMemberId && data.newRole) {
          await prisma.groupMember.update({
            where: { groupMemberId: data.targetGroupMemberId },
            data: { role: data.newRole },
          });
          console.log(`[executeApprovedAction] Updated role for ${data.targetGroupMemberId} to ${data.newRole}`);
        }
        break;

      case 'remove_member':
        // Remove member from group
        if (data.targetGroupMemberId) {
          await prisma.groupMember.delete({
            where: { groupMemberId: data.targetGroupMemberId },
          });
          console.log(`[executeApprovedAction] Removed member ${data.targetGroupMemberId}`);
        }
        break;

      case 'delete_group':
        // Delete group (soft delete by hiding it)
        if (approval.groupId) {
          await prisma.group.update({
            where: { groupId: approval.groupId },
            data: { isHidden: true },
          });
          console.log(`[executeApprovedAction] Deleted (hidden) group ${approval.groupId}`);
        }
        break;

      case 'delete_file':
        // Hard delete file data from storage, soft delete in database
        // Keeps DB record so "Deleted by Admin" placeholder shows file name
        if (approval.relatedEntityId) {
          const storageService = require('../services/storage');
          const mediaId = approval.relatedEntityId;

          // Get file info before deleting
          const media = await prisma.messageMedia.findUnique({
            where: { mediaId: mediaId },
          });

          if (media) {
            // Extract filename
            const s3KeyParts = media.s3Key ? media.s3Key.split('/') : [];
            const fileName = s3KeyParts.length > 0 ? s3KeyParts[s3KeyParts.length - 1] : (data.fileName || 'Unknown');
            const fileSizeBytes = Number(media.fileSizeBytes);

            // Get requester info for audit log
            const requester = await prisma.groupMember.findUnique({
              where: { groupMemberId: approval.requestedBy },
              include: {
                user: { select: { email: true, displayName: true } },
              },
            });

            // Hard delete from file storage (actual file data)
            try {
              if (media.url) {
                await storageService.hardDeleteFile(media.url);
                console.log(`[executeApprovedAction] Hard deleted file from storage: ${media.url}`);
              }
            } catch (storageError) {
              console.error(`[executeApprovedAction] Storage deletion error (continuing): ${storageError.message}`);
            }

            // Mark as deleted in database - keep record for "Deleted by Admin" placeholder
            await prisma.messageMedia.update({
              where: { mediaId: mediaId },
              data: {
                isHidden: true,
                hiddenAt: new Date(),
                hiddenBy: approval.requestedBy,
              },
            });

            // Decrement storage usage for all admins in the group
            const admins = await prisma.groupMember.findMany({
              where: {
                groupId: approval.groupId,
                role: 'admin',
              },
              select: { userId: true },
            });

            // Determine media type
            let mediaTypeForStorage = 'document';
            if (media.mediaType === 'image' || media.mediaType?.startsWith('image/')) {
              mediaTypeForStorage = 'image';
            } else if (media.mediaType === 'video' || media.mediaType?.startsWith('video/')) {
              mediaTypeForStorage = 'video';
            }

            // Decrement storage for each admin
            for (const admin of admins) {
              if (!admin.userId) continue;

              await prisma.storageUsage.updateMany({
                where: {
                  userId: admin.userId,
                  groupId: approval.groupId,
                  mediaType: mediaTypeForStorage,
                },
                data: {
                  fileCount: { decrement: 1 },
                  totalBytes: { decrement: BigInt(fileSizeBytes) },
                  lastCalculatedAt: new Date(),
                },
              });

              await prisma.user.update({
                where: { userId: admin.userId },
                data: {
                  storageUsedBytes: { decrement: BigInt(fileSizeBytes) },
                },
              });
            }

            console.log(`[executeApprovedAction] Decremented storage by ${fileSizeBytes} bytes for ${admins.length} admin(s)`);

            // Format file size for audit log
            const formatSize = (bytes) => {
              if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
              if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
              return `${bytes} bytes`;
            };

            // Create audit log
            await prisma.auditLog.create({
              data: {
                groupId: approval.groupId,
                action: 'delete_file',
                performedBy: approval.requestedBy,
                performedByName: requester?.user?.displayName || requester?.displayName || 'Admin',
                performedByEmail: requester?.user?.email || 'N/A',
                actionLocation: 'storage',
                messageContent: `File deleted: "${fileName}" (${formatSize(fileSizeBytes)}). Storage freed for ${admins.length} admin(s).`,
              },
            });

            console.log(`[executeApprovedAction] Deleted file: ${fileName} (${mediaId})`);
          } else {
            console.log(`[executeApprovedAction] File ${mediaId} already deleted or not found`);
          }
        }
        break;

      case 'delete_log_export':
        // Soft delete log export
        if (approval.relatedEntityId) {
          await prisma.logExport.update({
            where: { exportId: approval.relatedEntityId },
            data: { isHidden: true },
          });
          console.log(`[executeApprovedAction] Soft-deleted log export ${approval.relatedEntityId}`);
        }
        break;

      case 'change_recording_settings':
        // Update call recording settings for the group
        {
          const settingsUpdate = {};
          if (data.recordPhoneCalls !== undefined) {
            settingsUpdate.recordPhoneCalls = data.recordPhoneCalls;
          }
          if (data.recordVideoCalls !== undefined) {
            settingsUpdate.recordVideoCalls = data.recordVideoCalls;
          }

          if (Object.keys(settingsUpdate).length > 0) {
            await prisma.groupSettings.upsert({
              where: { groupId: approval.groupId },
              update: settingsUpdate,
              create: {
                groupId: approval.groupId,
                ...settingsUpdate,
              },
            });

            // Get requester info for audit log
            const requester = await prisma.groupMember.findUnique({
              where: { groupMemberId: approval.requestedBy },
              include: {
                user: { select: { email: true, displayName: true } },
              },
            });

            const changesDesc = [];
            if (data.recordPhoneCalls !== undefined) {
              changesDesc.push(`Phone call recording: ${data.recordPhoneCalls ? 'ON' : 'OFF'}`);
            }
            if (data.recordVideoCalls !== undefined) {
              changesDesc.push(`Video call recording: ${data.recordVideoCalls ? 'ON' : 'OFF'}`);
            }

            // Create audit log
            await prisma.auditLog.create({
              data: {
                groupId: approval.groupId,
                action: 'change_recording_settings',
                performedBy: approval.requestedBy,
                performedByName: requester?.user?.displayName || requester?.displayName || 'Admin',
                performedByEmail: requester?.user?.email || 'N/A',
                actionLocation: 'group_settings',
                messageContent: `Recording settings updated via approval: ${changesDesc.join(', ')}`,
              },
            });

            console.log(`[executeApprovedAction] Updated recording settings for group ${approval.groupId}: ${changesDesc.join(', ')}`);
          }
        }
        break;

      default:
        console.log(`[executeApprovedAction] Unknown approval type: ${approval.approvalType}`);
    }
  } catch (error) {
    console.error('[executeApprovedAction] Error executing action:', error);
    // Don't throw - we don't want to block the approval from being marked as approved
  }
}

/**
 * GET /groups/:groupId/approvals
 * Get all approvals for a group (filtered by user's involvement)
 */
async function getApprovals(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;

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

    const isAdmin = groupMembership.role === 'admin';

    // Get all admins in the group for calculating votes
    const allAdmins = await prisma.groupMember.findMany({
      where: {
        groupId: groupId,
        role: 'admin',
      },
      select: {
        groupMemberId: true,
        displayName: true,
        iconLetters: true,
        iconColor: true,
      },
    });

    // Get approvals based on user role
    // ADMINS: See ALL approvals in the group (pending, approved, rejected, canceled)
    // NON-ADMINS: Only see approvals they requested
    const approvals = await prisma.approval.findMany({
      where: isAdmin
        ? { groupId: groupId } // Admins see everything
        : {
            groupId: groupId,
            requestedBy: groupMembership.groupMemberId, // Non-admins only see their own
          },
      include: {
        requester: {
          select: {
            groupMemberId: true,
            displayName: true,
            iconLetters: true,
            iconColor: true,
            role: true,
            user: {
              select: {
                email: true,
                displayName: true,
              },
            },
          },
        },
        votes: {
          include: {
            admin: {
              select: {
                groupMemberId: true,
                displayName: true,
                iconLetters: true,
                iconColor: true,
              },
            },
          },
        },
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    // Calculate voting status for each approval
    const approvalsWithStatus = approvals.map(approval => {
      const totalAdmins = allAdmins.length;
      const approveVotes = approval.votes.filter(v => v.vote === 'approve').length;
      const rejectVotes = approval.votes.filter(v => v.vote === 'reject').length;
      const userVote = approval.votes.find(v => v.adminId === groupMembership.groupMemberId);

      // Check if user has already voted
      const hasUserVoted = !!userVote;

      // Parse approvalData if it's a string (Prisma stores JSON as string)
      let data = {};
      try {
        data = typeof approval.approvalData === 'string'
          ? JSON.parse(approval.approvalData)
          : approval.approvalData;
      } catch (err) {
        console.error('[ERROR getApprovals] Failed to parse approvalData:', err);
        data = {};
      }

      // Generate human-readable description from approvalData
      let description = '';
      const requesterName = approval.requester?.user?.email || approval.requester?.displayName || 'Unknown';

      switch (approval.approvalType) {
        case 'change_role_to_admin': {
          // Try to get target info from approvalData, or fall back to looking up by targetGroupMemberId
          let targetName = data.targetEmail || data.targetDisplayName;

          // If old approval without target info, try to look it up (backward compatibility)
          if (!targetName && data.targetGroupMemberId) {
            // This is a fallback for old approvals - won't work if member was deleted
            targetName = 'a member';
          }

          description = `${requesterName} requested to promote ${targetName || 'a member'} to admin`;
          break;
        }
        case 'change_role_from_admin':
          description = `${requesterName} requested to demote ${data.targetEmail || data.targetDisplayName || 'a member'} from admin to ${data.newRole}`;
          break;
        case 'add_member':
          description = `${requesterName} requested to add ${data.targetEmail || data.targetDisplayName || 'a member'} as ${data.targetRole || 'member'}`;
          break;
        case 'remove_member':
          description = `${requesterName} requested to remove ${data.targetDisplayName || 'a member'} from the group`;
          break;
        case 'delete_group':
          description = `${requesterName} requested to delete the group "${data.groupName || 'this group'}"`;
          break;
        case 'delete_file':
          description = `${requesterName} requested to delete file "${data.fileName || 'unknown file'}"`;
          break;
        case 'delete_call_recording':
          description = `${requesterName} requested to delete ${data.callType || 'call'} recording "${data.fileName || 'unknown'}"`;
          break;
        case 'delete_log_export':
          description = `${requesterName} requested to delete log export "${data.fileName || 'unknown'}"`;
          break;
        default:
          description = `${requesterName} requested approval for ${approval.approvalType.replace(/_/g, ' ')}`;
      }

      // Build complete admin vote status list using snapshot from approvalData
      let allAdminStatuses = [];

      // Get the snapshot of admin IDs from approval creation time
      const snapshotAdminIds = data.allAdminIds || [];

      if (snapshotAdminIds.length > 0) {
        // Use the snapshot from approvalData (correct approach)
        allAdminStatuses = snapshotAdminIds.map(adminId => {
          const voteRecord = approval.votes.find(v => v.adminId === adminId);

          if (voteRecord) {
            // Admin has voted
            return {
              groupMemberId: voteRecord.admin.groupMemberId,
              displayName: voteRecord.admin.displayName,
              iconLetters: voteRecord.admin.iconLetters,
              iconColor: voteRecord.admin.iconColor,
              voteStatus: voteRecord.vote, // 'approve' or 'reject'
              isAutoApproved: voteRecord.isAutoApproved || false,
            };
          } else {
            // Admin hasn't voted yet - look them up from allAdmins
            const adminInfo = allAdmins.find(a => a.groupMemberId === adminId);
            if (adminInfo) {
              return {
                groupMemberId: adminInfo.groupMemberId,
                displayName: adminInfo.displayName,
                iconLetters: adminInfo.iconLetters,
                iconColor: adminInfo.iconColor,
                voteStatus: 'pending',
                isAutoApproved: false,
              };
            } else {
              // Admin was removed from group - still show them as pending
              return {
                groupMemberId: adminId,
                displayName: 'Former Admin',
                iconLetters: 'FA',
                iconColor: '#9e9e9e',
                voteStatus: 'pending',
                isAutoApproved: false,
              };
            }
          }
        });
      } else {
        // Backwards compatibility: old approvals without allAdminIds snapshot
        // Fall back to using current admins list
        allAdminStatuses = allAdmins.map(admin => {
          const voteRecord = approval.votes.find(v => v.adminId === admin.groupMemberId);

          if (voteRecord) {
            return {
              groupMemberId: voteRecord.admin.groupMemberId,
              displayName: voteRecord.admin.displayName,
              iconLetters: voteRecord.admin.iconLetters,
              iconColor: voteRecord.admin.iconColor,
              voteStatus: voteRecord.vote,
              isAutoApproved: voteRecord.isAutoApproved || false,
            };
          } else {
            return {
              groupMemberId: admin.groupMemberId,
              displayName: admin.displayName,
              iconLetters: admin.iconLetters,
              iconColor: admin.iconColor,
              voteStatus: 'pending',
              isAutoApproved: false,
            };
          }
        });
      }

      return {
        ...approval,
        description,
        totalAdmins,
        approveVotes,
        rejectVotes,
        hasUserVoted,
        userVote: userVote?.vote || null,
        allAdminStatuses, // NEW: List of all admins with their vote status
      };
    });

    // Categorize approvals into 3 lists
    const awaitingYourAction = approvalsWithStatus.filter(
      a => a.status === 'pending' && isAdmin && !a.hasUserVoted
    );

    const awaitingOthers = approvalsWithStatus.filter(
      a => a.requestedBy === groupMembership.groupMemberId && a.status === 'pending'
    );

    const completed = approvalsWithStatus.filter(
      a => a.status !== 'pending' || (a.requestedBy === groupMembership.groupMemberId && a.status === 'pending')
    ).filter(a => !awaitingOthers.includes(a)); // Avoid duplicates

    res.json({
      success: true,
      approvals: {
        awaitingYourAction,
        awaitingOthers,
        completed,
      },
      userRole: groupMembership.role,
    });
  } catch (error) {
    console.error('Get approvals error:', error);
    res.status(500).json({ error: 'Failed to get approvals', message: error.message });
  }
}

/**
 * POST /groups/:groupId/approvals/:approvalId/vote
 * Vote on an approval (approve or reject)
 */
async function voteOnApproval(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, approvalId } = req.params;
    const { vote } = req.body; // 'approve' or 'reject'

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!vote || !['approve', 'reject'].includes(vote)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Vote must be either "approve" or "reject"',
      });
    }

    // Verify user is an admin of the group (or trial user with admin permissions)
    const groupMembership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        user: { userId: userId },
      },
      include: {
        user: {
          select: {
            isSubscribed: true,
            createdAt: true,
          },
        },
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Check if user is admin or on trial (20-day trial)
    const daysSinceCreation = groupMembership.user ? (Date.now() - new Date(groupMembership.user.createdAt).getTime()) / (1000 * 60 * 60 * 24) : Infinity;
    const isOnTrial = groupMembership.user && !groupMembership.user.isSubscribed && daysSinceCreation <= 20;
    const hasAdminPermissions = groupMembership.role === 'admin' || isOnTrial;

    if (!hasAdminPermissions) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admins can vote on approvals',
      });
    }

    // Get the approval
    const approval = await prisma.approval.findUnique({
      where: { approvalId: approvalId },
      include: {
        votes: true,
        requester: true,
      },
    });

    if (!approval) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Approval not found',
      });
    }

    if (approval.groupId !== groupId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Approval does not belong to this group',
      });
    }

    if (approval.status !== 'pending') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Approval is no longer pending',
      });
    }

    // Check if user has already voted
    const existingVote = approval.votes.find(v => v.adminId === groupMembership.groupMemberId);
    if (existingVote) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'You have already voted on this approval',
      });
    }

    // Create the vote
    await prisma.approvalVote.create({
      data: {
        approvalId: approvalId,
        adminId: groupMembership.groupMemberId,
        vote: vote,
      },
    });

    // Create audit log for the vote immediately
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'vote_on_approval',
        performedBy: groupMembership.groupMemberId,
        performedByName: groupMembership.displayName,
        performedByEmail: groupMembership.email || req.user.email || 'N/A',
        actionLocation: 'approvals',
        messageContent: `Voted "${vote}" on ${approval.approvalType.replace(/_/g, ' ')} request`,
        logData: {
          approvalId: approvalId,
          approvalType: approval.approvalType,
          vote: vote,
        },
      },
    });

    // Get all admins to calculate if approval threshold is met
    const allAdmins = await prisma.groupMember.findMany({
      where: {
        groupId: groupId,
        role: 'admin',
      },
    });

    const totalAdmins = allAdmins.length;

    // Get updated votes
    const updatedApproval = await prisma.approval.findUnique({
      where: { approvalId: approvalId },
      include: { votes: true },
    });

    const approveVotes = updatedApproval.votes.filter(v => v.vote === 'approve').length;
    const rejectVotes = updatedApproval.votes.filter(v => v.vote === 'reject').length;

    let newStatus = 'pending';

    // Check if approval threshold is met
    if (approval.requiresAllAdmins) {
      // Requires 100% approval
      if (approveVotes >= totalAdmins) {
        newStatus = 'approved';
      } else if (rejectVotes > 0) {
        // Any rejection means the approval fails
        newStatus = 'rejected';
      }
    } else {
      // Requires more than the threshold percentage (default 50%)
      // Note: Using > instead of >= means a tie goes to rejection (status quo)
      const requiredPercentage = parseFloat(approval.requiredApprovalPercentage);
      const approvePercentage = (approveVotes / totalAdmins) * 100;
      const rejectPercentage = (rejectVotes / totalAdmins) * 100;

      // Check rejection first - if enough votes to block, reject immediately
      if (rejectPercentage >= (100 - requiredPercentage)) {
        // Rejection threshold met - e.g., with 50% required, 50%+ rejection blocks
        newStatus = 'rejected';
      } else if (approvePercentage > requiredPercentage) {
        // Approval requires strictly more than threshold (ties go to rejection)
        newStatus = 'approved';
      } else if (approvePercentage === 100) {
        // Special case: unanimous approval always passes
        newStatus = 'approved';
      }
    }

    // Update approval status if it changed
    if (newStatus !== 'pending') {
      await prisma.approval.update({
        where: { approvalId: approvalId },
        data: {
          status: newStatus,
          completedAt: new Date(),
        },
      });

      // Parse approval data for better audit log message
      let data = {};
      try {
        data = typeof approval.approvalData === 'string'
          ? JSON.parse(approval.approvalData)
          : approval.approvalData || {};
      } catch (err) {
        data = {};
      }

      // Build descriptive message based on approval type
      let actionDescription = approval.approvalType.replace(/_/g, ' ');
      if (approval.approvalType === 'delete_file' && data.fileName) {
        actionDescription = `delete file "${data.fileName}"`;
      }

      // Create audit log for approval completion (threshold reached)
      await prisma.auditLog.create({
        data: {
          groupId: groupId,
          action: newStatus === 'approved' ? 'approval_completed' : 'approval_rejected',
          performedBy: null,
          performedByName: 'System',
          performedByEmail: null,
          actionLocation: 'approvals',
          messageContent: `Approval ${newStatus}: ${actionDescription}. Final vote: ${approveVotes} approve, ${rejectVotes} reject (${totalAdmins} total admins)`,
          logData: {
            approvalId: approvalId,
            approvalType: approval.approvalType,
            finalStatus: newStatus,
            approveVotes: approveVotes,
            rejectVotes: rejectVotes,
            totalAdmins: totalAdmins,
            lastVoteBy: groupMembership.groupMemberId,
          },
        },
      });

      // Execute the approved action if status is approved
      if (newStatus === 'approved') {
        await executeApprovedAction(approval);
      }
    }
    // Note: Vote audit log is already created above right after the vote is recorded

    res.json({
      success: true,
      message: 'Vote recorded successfully',
      approval: {
        approvalId: approval.approvalId,
        status: newStatus,
        approveVotes,
        rejectVotes,
        totalAdmins,
      },
    });
  } catch (error) {
    console.error('Vote on approval error:', error);
    res.status(500).json({ error: 'Failed to record vote', message: error.message });
  }
}

/**
 * POST /groups/:groupId/approvals/:approvalId/cancel
 * Cancel an approval (only by the requester)
 */
async function cancelApproval(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, approvalId } = req.params;

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

    // Get the approval
    const approval = await prisma.approval.findUnique({
      where: { approvalId: approvalId },
    });

    if (!approval) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Approval not found',
      });
    }

    if (approval.groupId !== groupId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Approval does not belong to this group',
      });
    }

    if (approval.requestedBy !== groupMembership.groupMemberId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the requester can cancel an approval',
      });
    }

    if (approval.status !== 'pending') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Can only cancel pending approvals',
      });
    }

    // Update approval status to canceled
    await prisma.approval.update({
      where: { approvalId: approvalId },
      data: {
        status: 'canceled',
        completedAt: new Date(),
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'cancel_approval',
        performedBy: groupMembership.groupMemberId,
        performedByName: groupMembership.displayName,
        performedByEmail: groupMembership.email || 'N/A',
        actionLocation: 'approvals',
        messageContent: `Canceled ${approval.approvalType} request`,
      },
    });

    res.json({
      success: true,
      message: 'Approval canceled successfully',
    });
  } catch (error) {
    console.error('Cancel approval error:', error);
    res.status(500).json({ error: 'Failed to cancel approval', message: error.message });
  }
}

module.exports = {
  getApprovals,
  voteOnApproval,
  cancelApproval,
};
