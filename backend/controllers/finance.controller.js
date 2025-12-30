/**
 * Finance Controller
 *
 * Handles finance matter operations including creation, retrieval, and payments.
 */

const { prisma } = require('../config/database');
const { isGroupReadOnly, getReadOnlyErrorResponse } = require('../utils/permissions');
const { emailService } = require('../services/email');
const emailTemplates = require('../services/email/templates');
const pushNotificationService = require('../services/pushNotification.service');

/**
 * Get all finance matters for a group
 *
 * Returns:
 * - All finance matters if user is admin
 * - Only finance matters where user is a member OR
 * - Finance matters visible based on role permissions
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
async function getFinanceMatters(req, res) {
  try {
    const { groupId } = req.params;
    const userId = req.user.userId;

    // Get user's group membership
    const groupMembership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
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
        success: false,
        message: 'You are not a member of this group',
      });
    }

    const userRole = groupMembership.role;
    const isAdmin = userRole === 'admin';

    // Get group settings to check finance visibility permissions
    const groupSettings = await prisma.groupSettings.findUnique({
      where: { groupId: groupId },
      select: {
        financeVisibleToAdmins: true,
        financeVisibleToParents: true,
        financeVisibleToAdults: true,
        financeVisibleToCaregivers: true,
        financeVisibleToChildren: true,
      },
    });

    // Check if user has permission to view finance section at all
    let hasAccess = false;

    if (userRole === 'admin' && groupSettings?.financeVisibleToAdmins) {
      hasAccess = true;
    } else if (userRole === 'parent' && groupSettings?.financeVisibleToParents) {
      hasAccess = true;
    } else if (userRole === 'adult' && groupSettings?.financeVisibleToAdults) {
      hasAccess = true;
    } else if (userRole === 'caregiver' && groupSettings?.financeVisibleToCaregivers) {
      hasAccess = true;
    } else if (userRole === 'child' && groupSettings?.financeVisibleToChildren) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view finance matters',
      });
    }

    // Build query based on user role
    let whereClause = { groupId: groupId };

    // Non-admins with visibility restrictions only see finance matters where they are members
    if (!isAdmin || !groupSettings?.financeVisibleToAdmins) {
      whereClause = {
        groupId: groupId,
        members: {
          some: {
            groupMemberId: groupMembership.groupMemberId,
          },
        },
      };
    }

    // Fetch finance matters
    const financeMatters = await prisma.financeMatter.findMany({
      where: whereClause,
      include: {
        members: {
          include: {
            groupMember: {
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
        },
        creator: {
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
      orderBy: [
        { isSettled: 'asc' }, // Unsettled first
        { createdAt: 'desc' }, // Most recent first
      ],
    });

    // Merge user profile data with group member data for each member
    const formattedFinanceMatters = financeMatters.map((matter) => ({
      ...matter,
      members: matter.members.map((member) => ({
        ...member,
        groupMember: {
          ...member.groupMember,
          displayName: member.groupMember.user?.displayName || member.groupMember.displayName,
          iconLetters: member.groupMember.user?.memberIcon || member.groupMember.iconLetters,
          iconColor: member.groupMember.user?.iconColor || member.groupMember.iconColor,
          profilePhotoUrl: member.groupMember.user?.profilePhotoFileId
            ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${member.groupMember.user.profilePhotoFileId}`
            : null,
        },
      })),
      creator: {
        ...matter.creator,
        displayName: matter.creator.user?.displayName || matter.creator.displayName,
        iconLetters: matter.creator.user?.memberIcon || matter.creator.iconLetters,
        iconColor: matter.creator.user?.iconColor || matter.creator.iconColor,
        profilePhotoUrl: matter.creator.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${matter.creator.user.profilePhotoFileId}`
          : null,
      },
    }));

    return res.status(200).json({
      success: true,
      financeMatters: formattedFinanceMatters,
    });
  } catch (error) {
    console.error('Get finance matters error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load finance matters',
      error: error.message,
    });
  }
}

/**
 * Create a new finance matter
 *
 * Request body:
 * - name: string (required)
 * - description: string (optional)
 * - totalAmount: number (required)
 * - currency: string (required, 3-letter currency code)
 * - dueDate: ISO date string (optional)
 * - members: array of objects with groupMemberId, expectedPercentage, expectedAmount
 *
 * Permissions:
 * - Admins can always create
 * - Other roles based on group settings (financeCreatableByParents, etc.)
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
async function createFinanceMatter(req, res) {
  try {
    const { groupId } = req.params;
    const userId = req.user.userId;
    const { name, description, totalAmount, currency, dueDate, members } = req.body;

    // Validate required fields
    if (!name || !totalAmount || !currency || !members || members.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, totalAmount, currency, and at least one member',
      });
    }

    // Validate currency format (3-letter code)
    if (currency.length !== 3) {
      return res.status(400).json({
        success: false,
        message: 'Currency must be a 3-letter code (e.g., USD, EUR, GBP)',
      });
    }

    // Validate totalAmount is positive
    if (parseFloat(totalAmount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Total amount must be greater than 0',
      });
    }

    // Validate member allocations are between 99% and 100% (not above 100%)
    const totalPercentage = members.reduce((sum, member) => {
      return sum + parseFloat(member.expectedPercentage || 0);
    }, 0);

    if (totalPercentage > 100) {
      return res.status(400).json({
        success: false,
        message: `Member allocations cannot exceed 100% (currently ${totalPercentage.toFixed(2)}%)`,
      });
    }

    if (totalPercentage < 99) {
      return res.status(400).json({
        success: false,
        message: `Member allocations must be at least 99% (currently ${totalPercentage.toFixed(2)}%)`,
      });
    }

    // TEMPORARY: For now, require all finance matters to be fully paid upfront
    // This prevents creating finance matters with outstanding balances
    const totalPaid = members.reduce((sum, member) => {
      return sum + parseFloat(member.paidAmount || 0);
    }, 0);

    if (totalPaid > parseFloat(totalAmount)) {
      return res.status(400).json({
        success: false,
        message: `Total paid amounts (${currency} ${totalPaid.toFixed(2)}) cannot exceed the total amount (${currency} ${parseFloat(totalAmount).toFixed(2)})`,
      });
    }

    // TEMPORARY RESTRICTION: Require finance matters to be 100% paid upfront
    // Allow small tolerance (0.01) for rounding errors
    const tolerance = 0.01;
    if (Math.abs(totalPaid - parseFloat(totalAmount)) > tolerance) {
      return res.status(400).json({
        success: false,
        message: `Currently, finance matters must be fully paid when created. Total paid (${currency} ${totalPaid.toFixed(2)}) must equal total amount (${currency} ${parseFloat(totalAmount).toFixed(2)}). This restriction is temporary.`,
      });
    }

    // Get user's group membership
    const groupMembership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
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
        success: false,
        message: 'You are not a member of this group',
      });
    }

    const userRole = groupMembership.role;
    const isAdmin = userRole === 'admin';

    // CRITICAL: Supervisors cannot create finance matters (view-only role)
    if (userRole === 'supervisor') {
      return res.status(403).json({
        success: false,
        message: 'Supervisors cannot create finance matters',
      });
    }

    // Get group settings to check finance creation and visibility permissions
    const groupSettings = await prisma.groupSettings.findUnique({
      where: { groupId: groupId },
      select: {
        financeCreatableByAdmins: true,
        financeCreatableByParents: true,
        financeCreatableByAdults: true,
        financeCreatableByCaregivers: true,
        financeCreatableByChildren: true,
        financeVisibleToAdmins: true,
        financeVisibleToParents: true,
        financeVisibleToAdults: true,
        financeVisibleToCaregivers: true,
        financeVisibleToChildren: true,
      },
    });

    // Check if user has permission to create finance matters
    let canCreate = false;

    if (userRole === 'admin' && groupSettings?.financeCreatableByAdmins) {
      canCreate = true;
    } else if (userRole === 'parent' && groupSettings?.financeCreatableByParents) {
      canCreate = true;
    } else if (userRole === 'adult' && groupSettings?.financeCreatableByAdults) {
      canCreate = true;
    } else if (userRole === 'caregiver' && groupSettings?.financeCreatableByCaregivers) {
      canCreate = true;
    } else if (userRole === 'child' && groupSettings?.financeCreatableByChildren) {
      canCreate = true;
    }

    if (!canCreate) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create finance matters',
      });
    }

    // Check if group is in read-only mode (all admins unsubscribed)
    const group = await prisma.group.findUnique({
      where: { groupId: groupId },
      select: { name: true, readOnlyUntil: true, hasActiveAdmin: true },
    });

    if (isGroupReadOnly(group)) {
      return res.status(403).json(getReadOnlyErrorResponse(group));
    }

    // Verify all member IDs exist in the group
    const memberIds = members.map((m) => m.groupMemberId);
    const existingMembers = await prisma.groupMember.findMany({
      where: {
        groupId: groupId,
        groupMemberId: {
          in: memberIds,
        },
      },
    });

    if (existingMembers.length !== memberIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more member IDs are invalid or not in this group',
      });
    }

    // CRITICAL: Verify all members have permission to view finance
    // Members who can't see finance shouldn't be added to finance matters
    const membersWithoutFinanceAccess = existingMembers.filter((member) => {
      const memberRole = member.role;
      // Admins always have access
      if (memberRole === 'admin') return false;
      // Supervisors have view access (can be added but have read-only)
      if (memberRole === 'supervisor') return false;
      // Check role-based visibility permissions
      if (memberRole === 'parent') {
        return groupSettings?.financeVisibleToParents !== true;
      }
      if (memberRole === 'adult') {
        return groupSettings?.financeVisibleToAdults !== true;
      }
      if (memberRole === 'caregiver') {
        return groupSettings?.financeVisibleToCaregivers !== true;
      }
      if (memberRole === 'child') {
        return groupSettings?.financeVisibleToChildren !== true;
      }
      return true; // Unknown roles don't have access
    });

    if (membersWithoutFinanceAccess.length > 0) {
      const memberNames = membersWithoutFinanceAccess.map((m) => m.displayName).join(', ');
      return res.status(400).json({
        success: false,
        message: `The following members cannot be added because they don't have permission to view finance: ${memberNames}`,
      });
    }

    // Create finance matter with members in a transaction
    const financeMatter = await prisma.$transaction(async (tx) => {
      // Create finance matter
      const matter = await tx.financeMatter.create({
        data: {
          groupId: groupId,
          name: name.trim(),
          description: description?.trim() || null,
          totalAmount: parseFloat(totalAmount),
          currency: currency.toUpperCase(),
          dueDate: dueDate ? new Date(dueDate) : null,
          createdBy: groupMembership.groupMemberId,
        },
      });

      // Create finance matter members
      const memberData = members.map((member) => ({
        financeMatterId: matter.financeMatterId,
        groupMemberId: member.groupMemberId,
        expectedPercentage: parseFloat(member.expectedPercentage),
        expectedAmount: parseFloat(member.expectedAmount),
        paidAmount: parseFloat(member.paidAmount || 0),
      }));

      await tx.financeMatterMember.createMany({
        data: memberData,
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          groupId: groupId,
          action: 'create_finance_matter',
          performedBy: groupMembership.groupMemberId,
          performedByName: groupMembership.displayName,
          performedByEmail: groupMembership.email || 'N/A',
          actionLocation: 'finance',
          messageContent: `Created finance matter "${name}" with total amount ${currency} ${totalAmount}`,
        },
      });

      return matter;
    });

    // Fetch the complete finance matter with members for response
    const completeFinanceMatter = await prisma.financeMatter.findUnique({
      where: { financeMatterId: financeMatter.financeMatterId },
      include: {
        members: {
          include: {
            groupMember: {
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
        },
        creator: {
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

    // Merge user profile data
    const formattedFinanceMatter = {
      ...completeFinanceMatter,
      members: completeFinanceMatter.members.map((member) => ({
        ...member,
        groupMember: {
          ...member.groupMember,
          displayName: member.groupMember.user?.displayName || member.groupMember.displayName,
          iconLetters: member.groupMember.user?.memberIcon || member.groupMember.iconLetters,
          iconColor: member.groupMember.user?.iconColor || member.groupMember.iconColor,
          profilePhotoUrl: member.groupMember.user?.profilePhotoFileId
            ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${member.groupMember.user.profilePhotoFileId}`
            : null,
        },
      })),
      creator: {
        ...completeFinanceMatter.creator,
        displayName: completeFinanceMatter.creator.user?.displayName || completeFinanceMatter.creator.displayName,
        iconLetters: completeFinanceMatter.creator.user?.memberIcon || completeFinanceMatter.creator.iconLetters,
        iconColor: completeFinanceMatter.creator.user?.iconColor || completeFinanceMatter.creator.iconColor,
        profilePhotoUrl: completeFinanceMatter.creator.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${completeFinanceMatter.creator.user.profilePhotoFileId}`
          : null,
      },
    };

    // Send email notifications to all members with email addresses (excluding the creator)
    // This includes both registered users AND placeholder members (who haven't logged in yet)
    try {
      const appUrl = process.env.APP_URL || 'https://familyhelperapp.com';
      const creatorDisplayName = groupMembership.displayName;

      // Get all members (excluding the creator) with their email addresses
      const otherMemberIds = memberIds.filter(id => id !== groupMembership.groupMemberId);

      if (otherMemberIds.length === 0) {
        console.log('[Finance] No other members to notify (only creator is a member)');
      } else {
        const membersToNotify = await prisma.groupMember.findMany({
          where: {
            groupMemberId: { in: otherMemberIds },
            email: { not: null }, // Must have an email address
          },
          include: {
            user: {
              select: {
                email: true,
                displayName: true,
              },
            },
          },
        });

        if (membersToNotify.length === 0) {
          console.log('[Finance] No members with email addresses to notify');
        } else {
          console.log(`[Finance] Sending notifications to ${membersToNotify.length} member(s)`);

          // Format amount with currency
          const formattedAmount = `${currency.toUpperCase()} ${parseFloat(totalAmount).toFixed(2)}`;

          for (const member of membersToNotify) {
            // Use user email if registered, otherwise use the GroupMember email
            const recipientEmail = member.user?.email || member.email;
            const recipientName = member.user?.displayName || member.displayName;

            if (recipientEmail) {
              try {
                const emailContent = emailTemplates.finance_matter_added({
                  recipientName: recipientName,
                  groupName: group.name,
                  matterTitle: name.trim(),
                  matterType: 'Shared Expense',
                  amount: formattedAmount,
                  createdBy: creatorDisplayName,
                  appUrl: appUrl,
                });
                await emailService.sendEmail({
                  to: recipientEmail,
                  subject: emailContent.subject,
                  text: emailContent.text,
                  html: emailContent.html,
                });
                console.log(`[Finance] Notification email sent to ${recipientEmail}`);
              } catch (emailError) {
                // Don't fail the request if email fails
                console.error(`[Finance] Failed to send email to ${recipientEmail}:`, emailError.message);
              }
            }
          }
        }
      }
    } catch (emailError) {
      console.error('[Finance] Error sending notification emails:', emailError.message);
    }

    // Send push notifications to members (excluding creator) - fire and forget
    const otherMemberIds = memberIds.filter(id => id !== groupMembership.groupMemberId);
    if (otherMemberIds.length > 0) {
      const formattedAmount = `${currency.toUpperCase()} ${parseFloat(totalAmount).toFixed(2)}`;
      pushNotificationService.sendToGroupMembersWithPreferences(
        otherMemberIds,
        'finance',
        `New Finance: ${name.trim()}`,
        `${groupMembership.displayName} added a ${formattedAmount} expense`,
        {
          type: 'new_finance_matter',
          groupId: groupId,
          financeMatterId: financeMatter.financeMatterId,
        }
      ).catch(err => console.error('[Finance] Failed to send push notifications:', err));
    }

    return res.status(201).json({
      success: true,
      message: 'Finance matter created successfully',
      financeMatter: formattedFinanceMatter,
    });
  } catch (error) {
    console.error('Create finance matter error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create finance matter',
      error: error.message,
    });
  }
}

/**
 * Get a single finance matter by ID
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
async function getFinanceMatterById(req, res) {
  try {
    const { groupId, financeMatterId } = req.params;
    const userId = req.user.userId;

    // Get user's group membership
    const groupMembership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group',
      });
    }

    const userRole = groupMembership.role;
    const isAdmin = userRole === 'admin';

    // Get group settings to check finance visibility permissions
    const groupSettings = await prisma.groupSettings.findUnique({
      where: { groupId: groupId },
      select: {
        financeVisibleToAdmins: true,
        financeVisibleToParents: true,
        financeVisibleToAdults: true,
        financeVisibleToCaregivers: true,
        financeVisibleToChildren: true,
      },
    });

    // Check if user has permission to view finance section at all
    let hasAccess = false;

    if (userRole === 'admin' && groupSettings?.financeVisibleToAdmins) {
      hasAccess = true;
    } else if (userRole === 'parent' && groupSettings?.financeVisibleToParents) {
      hasAccess = true;
    } else if (userRole === 'adult' && groupSettings?.financeVisibleToAdults) {
      hasAccess = true;
    } else if (userRole === 'caregiver' && groupSettings?.financeVisibleToCaregivers) {
      hasAccess = true;
    } else if (userRole === 'child' && groupSettings?.financeVisibleToChildren) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view finance matters',
      });
    }

    // Fetch finance matter with members
    const financeMatter = await prisma.financeMatter.findUnique({
      where: { financeMatterId: financeMatterId },
      include: {
        members: {
          include: {
            groupMember: {
              select: {
                groupMemberId: true,
                displayName: true,
                iconLetters: true,
                iconColor: true,
                email: true,
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
        creator: {
          select: {
            groupMemberId: true,
            displayName: true,
            email: true,
            user: {
              select: {
                displayName: true,
                profilePhotoFileId: true,
              },
            },
          },
        },
      },
    });

    if (!financeMatter) {
      return res.status(404).json({
        success: false,
        message: 'Finance matter not found',
      });
    }

    // Check if finance matter belongs to this group
    if (financeMatter.groupId !== groupId) {
      return res.status(403).json({
        success: false,
        message: 'Finance matter does not belong to this group',
      });
    }

    // Non-admins can only view finance matters where they are members
    if (!isAdmin) {
      const isMember = financeMatter.members.some(
        (m) => m.groupMemberId === groupMembership.groupMemberId
      );

      if (!isMember) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this finance matter',
        });
      }
    }

    // Fetch pending payments for this finance matter
    const pendingPayments = await prisma.financePayment.findMany({
      where: {
        financeMatterId: financeMatterId,
        isConfirmed: false,
      },
      include: {
        fromMember: {
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
        toMember: {
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
        reportedAt: 'desc',
      },
    });

    // Format pending payments with merged user data
    const formattedPendingPayments = pendingPayments.map((payment) => ({
      paymentId: payment.paymentId,
      amount: parseFloat(payment.amount),
      reportedAt: payment.reportedAt,
      receiptImageUrl: payment.receiptImageUrl,
      from: {
        groupMemberId: payment.fromMember.groupMemberId,
        displayName: payment.fromMember.user?.displayName || payment.fromMember.displayName,
        iconLetters: payment.fromMember.user?.memberIcon || payment.fromMember.iconLetters,
        iconColor: payment.fromMember.user?.iconColor || payment.fromMember.iconColor,
        profilePhotoUrl: payment.fromMember.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${payment.fromMember.user.profilePhotoFileId}`
          : null,
      },
      to: {
        groupMemberId: payment.toMember.groupMemberId,
        displayName: payment.toMember.user?.displayName || payment.toMember.displayName,
        iconLetters: payment.toMember.user?.memberIcon || payment.toMember.iconLetters,
        iconColor: payment.toMember.user?.iconColor || payment.toMember.iconColor,
        profilePhotoUrl: payment.toMember.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${payment.toMember.user.profilePhotoFileId}`
          : null,
      },
    }));

    // Merge user profile data
    const formattedFinanceMatter = {
      ...financeMatter,
      members: financeMatter.members.map((member) => ({
        ...member,
        groupMember: {
          ...member.groupMember,
          displayName: member.groupMember.user?.displayName || member.groupMember.displayName,
          iconLetters: member.groupMember.user?.memberIcon || member.groupMember.iconLetters,
          iconColor: member.groupMember.user?.iconColor || member.groupMember.iconColor,
          profilePhotoUrl: member.groupMember.user?.profilePhotoFileId
            ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${member.groupMember.user.profilePhotoFileId}`
            : null,
        },
      })),
      creator: {
        ...financeMatter.creator,
        displayName: financeMatter.creator.user?.displayName || financeMatter.creator.displayName,
        profilePhotoUrl: financeMatter.creator.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${financeMatter.creator.user.profilePhotoFileId}`
          : null,
      },
    };

    return res.status(200).json({
      success: true,
      financeMatter: formattedFinanceMatter,
      userRole: userRole,
      currentGroupMemberId: groupMembership.groupMemberId,
      pendingPayments: formattedPendingPayments,
    });
  } catch (error) {
    console.error('Get finance matter by ID error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load finance matter',
      error: error.message,
    });
  }
}

/**
 * Mark a finance matter as settled (admin only)
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
async function settleFinanceMatter(req, res) {
  try {
    const { groupId, financeMatterId } = req.params;
    const userId = req.user.userId;

    // Get user's group membership
    const groupMembership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group',
      });
    }

    // Only admins can mark as settled
    if (groupMembership.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can mark finance matters as settled',
      });
    }

    // Check if finance matter exists and belongs to this group
    const financeMatter = await prisma.financeMatter.findUnique({
      where: { financeMatterId: financeMatterId },
    });

    if (!financeMatter) {
      return res.status(404).json({
        success: false,
        message: 'Finance matter not found',
      });
    }

    if (financeMatter.groupId !== groupId) {
      return res.status(403).json({
        success: false,
        message: 'Finance matter does not belong to this group',
      });
    }

    if (financeMatter.isSettled) {
      return res.status(400).json({
        success: false,
        message: 'Finance matter is already settled',
      });
    }

    // Update finance matter to settled
    await prisma.$transaction(async (tx) => {
      await tx.financeMatter.update({
        where: { financeMatterId: financeMatterId },
        data: {
          isSettled: true,
          settledAt: new Date(),
          settledBy: groupMembership.groupMemberId,
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          groupId: groupId,
          action: 'settle_finance_matter',
          performedBy: groupMembership.groupMemberId,
          performedByName: groupMembership.displayName,
          performedByEmail: groupMembership.email || 'N/A',
          actionLocation: 'finance',
          messageContent: `Marked finance matter "${financeMatter.name}" as settled`,
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Finance matter marked as settled',
    });
  } catch (error) {
    console.error('Settle finance matter error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to settle finance matter',
      error: error.message,
    });
  }
}

/**
 * Get messages for a finance matter
 * GET /groups/:groupId/finance-matters/:financeMatterId/messages
 */
async function getFinanceMatterMessages(req, res) {
  try {
    const { groupId, financeMatterId } = req.params;
    const userId = req.user.userId;

    // Get user's group membership
    const groupMembership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group',
      });
    }

    // Check if finance matter exists and belongs to this group
    const financeMatter = await prisma.financeMatter.findUnique({
      where: { financeMatterId: financeMatterId },
      include: {
        members: {
          select: {
            groupMemberId: true,
          },
        },
      },
    });

    if (!financeMatter) {
      return res.status(404).json({
        success: false,
        message: 'Finance matter not found',
      });
    }

    if (financeMatter.groupId !== groupId) {
      return res.status(403).json({
        success: false,
        message: 'Finance matter does not belong to this group',
      });
    }

    // Check if user has permission to view finance section at all
    const userRole = groupMembership.role;
    const isAdmin = userRole === 'admin';

    // Get group settings to check finance visibility permissions
    const groupSettings = await prisma.groupSettings.findUnique({
      where: { groupId: groupId },
      select: {
        financeVisibleToAdmins: true,
        financeVisibleToParents: true,
        financeVisibleToAdults: true,
        financeVisibleToCaregivers: true,
        financeVisibleToChildren: true,
      },
    });

    let hasAccess = false;

    if (userRole === 'admin' && groupSettings?.financeVisibleToAdmins) {
      hasAccess = true;
    } else if (userRole === 'parent' && groupSettings?.financeVisibleToParents) {
      hasAccess = true;
    } else if (userRole === 'adult' && groupSettings?.financeVisibleToAdults) {
      hasAccess = true;
    } else if (userRole === 'caregiver' && groupSettings?.financeVisibleToCaregivers) {
      hasAccess = true;
    } else if (userRole === 'child' && groupSettings?.financeVisibleToChildren) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view finance matter messages',
      });
    }

    // Check if user is a member of this finance matter (or admin with visibility)
    const isMember = financeMatter.members.some(
      (m) => m.groupMemberId === groupMembership.groupMemberId
    );

    if (!(isAdmin && groupSettings?.financeVisibleToAdmins) && !isMember) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view messages for this finance matter',
      });
    }

    // Fetch messages
    const messages = await prisma.financeMatterMessage.findMany({
      where: {
        financeMatterId: financeMatterId,
        isHidden: false,
      },
      include: {
        sender: {
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
    });

    // Merge user profile data
    const formattedMessages = messages.map((message) => ({
      ...message,
      sender: {
        ...message.sender,
        displayName: message.sender.user?.displayName || message.sender.displayName,
        iconLetters: message.sender.user?.memberIcon || message.sender.iconLetters,
        iconColor: message.sender.user?.iconColor || message.sender.iconColor,
        profilePhotoUrl: message.sender.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${message.sender.user.profilePhotoFileId}`
          : null,
      },
    }));

    return res.status(200).json({
      success: true,
      messages: formattedMessages,
    });
  } catch (error) {
    console.error('Get finance matter messages error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load messages',
      error: error.message,
    });
  }
}

/**
 * Send a message to a finance matter
 * POST /groups/:groupId/finance-matters/:financeMatterId/messages
 */
async function sendFinanceMatterMessage(req, res) {
  try {
    const { groupId, financeMatterId } = req.params;
    const { content } = req.body;
    const userId = req.user.userId;

    // Validate content
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required',
      });
    }

    // Get user's group membership
    const groupMembership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group',
      });
    }

    // Check if finance matter exists and belongs to this group
    const financeMatter = await prisma.financeMatter.findUnique({
      where: { financeMatterId: financeMatterId },
      include: {
        members: {
          select: {
            groupMemberId: true,
          },
        },
      },
    });

    if (!financeMatter) {
      return res.status(404).json({
        success: false,
        message: 'Finance matter not found',
      });
    }

    if (financeMatter.groupId !== groupId) {
      return res.status(403).json({
        success: false,
        message: 'Finance matter does not belong to this group',
      });
    }

    // Check if user has permission to access finance section at all
    const userRole = groupMembership.role;
    const isAdmin = userRole === 'admin';

    // CRITICAL: Supervisors cannot send finance messages (view-only role)
    if (userRole === 'supervisor') {
      return res.status(403).json({
        success: false,
        message: 'Supervisors cannot send finance matter messages',
      });
    }

    // Get group settings to check finance visibility permissions
    const groupSettings = await prisma.groupSettings.findUnique({
      where: { groupId: groupId },
      select: {
        financeVisibleToAdmins: true,
        financeVisibleToParents: true,
        financeVisibleToAdults: true,
        financeVisibleToCaregivers: true,
        financeVisibleToChildren: true,
      },
    });

    let hasAccess = false;

    if (userRole === 'admin' && groupSettings?.financeVisibleToAdmins) {
      hasAccess = true;
    } else if (userRole === 'parent' && groupSettings?.financeVisibleToParents) {
      hasAccess = true;
    } else if (userRole === 'adult' && groupSettings?.financeVisibleToAdults) {
      hasAccess = true;
    } else if (userRole === 'caregiver' && groupSettings?.financeVisibleToCaregivers) {
      hasAccess = true;
    } else if (userRole === 'child' && groupSettings?.financeVisibleToChildren) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to send finance matter messages',
      });
    }

    // Check if user is a member of this finance matter (or admin with visibility)
    const isMember = financeMatter.members.some(
      (m) => m.groupMemberId === groupMembership.groupMemberId
    );

    if (!(isAdmin && groupSettings?.financeVisibleToAdmins) && !isMember) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to send messages for this finance matter',
      });
    }

    // Create message
    const message = await prisma.financeMatterMessage.create({
      data: {
        financeMatterId: financeMatterId,
        senderId: groupMembership.groupMemberId,
        content: content.trim(),
      },
      include: {
        sender: {
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

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'send_finance_message',
        performedBy: groupMembership.groupMemberId,
        performedByName: groupMembership.displayName,
        performedByEmail: groupMembership.email || 'N/A',
        actionLocation: 'finance',
        messageContent: `Sent message on finance matter "${financeMatter.description}": "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`,
      },
    });

    // Merge user profile data
    const formattedMessage = {
      ...message,
      sender: {
        ...message.sender,
        displayName: message.sender.user?.displayName || message.sender.displayName,
        iconLetters: message.sender.user?.memberIcon || message.sender.iconLetters,
        iconColor: message.sender.user?.iconColor || message.sender.iconColor,
        profilePhotoUrl: message.sender.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${message.sender.user.profilePhotoFileId}`
          : null,
      },
    };

    return res.status(201).json({
      success: true,
      message: formattedMessage,
    });
  } catch (error) {
    console.error('Send finance matter message error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message,
    });
  }
}

/**
 * PUT /groups/:groupId/finance-matters/:financeMatterId/record-payment
 */
async function recordPayment(req, res) {
  try {
    const { groupId, financeMatterId } = req.params;
    const { groupMemberId, amount, toMemberId } = req.body;
    const userId = req.user.userId;

    // Validate input
    if (!groupMemberId) {
      return res.status(400).json({
        success: false,
        message: 'Group member ID is required',
      });
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid payment amount is required',
      });
    }

    if (!toMemberId) {
      return res.status(400).json({
        success: false,
        message: 'Payment recipient (toMemberId) is required',
      });
    }

    // Get user's group membership
    const groupMembership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group',
      });
    }

    // Check if finance matter exists and belongs to this group
    const financeMatter = await prisma.financeMatter.findUnique({
      where: { financeMatterId: financeMatterId },
      include: {
        members: {
          include: {
            groupMember: {
              select: {
                groupMemberId: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (!financeMatter) {
      return res.status(404).json({
        success: false,
        message: 'Finance matter not found',
      });
    }

    if (financeMatter.groupId !== groupId) {
      return res.status(403).json({
        success: false,
        message: 'Finance matter does not belong to this group',
      });
    }

    // Check if matter is settled
    if (financeMatter.isSettled) {
      return res.status(400).json({
        success: false,
        message: 'Cannot record payment for a settled finance matter',
      });
    }

    // Check if user has permission to access finance section at all
    const userRole = groupMembership.role;
    const isAdmin = userRole === 'admin';

    // CRITICAL: Supervisors cannot record payments (view-only role)
    if (userRole === 'supervisor') {
      return res.status(403).json({
        success: false,
        message: 'Supervisors cannot record payments',
      });
    }

    // Get group settings to check finance visibility permissions
    const groupSettings = await prisma.groupSettings.findUnique({
      where: { groupId: groupId },
      select: {
        financeVisibleToAdmins: true,
        financeVisibleToParents: true,
        financeVisibleToAdults: true,
        financeVisibleToCaregivers: true,
        financeVisibleToChildren: true,
      },
    });

    let hasAccess = false;

    if (userRole === 'admin' && groupSettings?.financeVisibleToAdmins) {
      hasAccess = true;
    } else if (userRole === 'parent' && groupSettings?.financeVisibleToParents) {
      hasAccess = true;
    } else if (userRole === 'adult' && groupSettings?.financeVisibleToAdults) {
      hasAccess = true;
    } else if (userRole === 'caregiver' && groupSettings?.financeVisibleToCaregivers) {
      hasAccess = true;
    } else if (userRole === 'child' && groupSettings?.financeVisibleToChildren) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to record payments',
      });
    }

    // Check permission (admins with visibility or the member themselves can record)
    const isSelf = groupMembership.groupMemberId === groupMemberId;

    if (!(isAdmin && groupSettings?.financeVisibleToAdmins) && !isSelf) {
      return res.status(403).json({
        success: false,
        message: 'You can only record payments for yourself',
      });
    }

    // Find the member in this finance matter
    const financeMatterMember = financeMatter.members.find(
      (m) => m.groupMemberId === groupMemberId
    );

    if (!financeMatterMember) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in this finance matter',
      });
    }

    // Find the recipient member
    const recipientMember = financeMatter.members.find(
      (m) => m.groupMemberId === toMemberId
    );

    if (!recipientMember) {
      return res.status(404).json({
        success: false,
        message: 'Payment recipient not found in this finance matter',
      });
    }

    // Calculate current debt (what they should have paid so far)
    const paymentAmount = parseFloat(amount);
    const expectedAmount = parseFloat(financeMatterMember.expectedAmount);
    const currentPaid = parseFloat(financeMatterMember.paidAmount);
    const remainingDebt = expectedAmount - currentPaid;

    // Check if payment would exceed remaining debt
    if (paymentAmount > remainingDebt + 0.01) { // Allow small rounding error
      return res.status(400).json({
        success: false,
        message: `Payment would exceed remaining debt. Maximum payment: ${remainingDebt.toFixed(2)}`,
      });
    }

    // Create pending FinancePayment record (awaiting confirmation)
    const financePayment = await prisma.financePayment.create({
      data: {
        financeMatterId: financeMatterId,
        fromMemberId: groupMemberId,
        toMemberId: toMemberId,
        amount: paymentAmount,
        isConfirmed: false,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'report_payment',
        performedBy: groupMembership.groupMemberId,
        performedByName: groupMembership.displayName,
        performedByEmail: groupMembership.email || 'N/A',
        actionLocation: 'finance',
        messageContent: `Reported payment of ${paymentAmount.toFixed(2)} from ${financeMatterMember.groupMember.displayName} to ${recipientMember.groupMember.displayName} in finance matter "${financeMatter.title}". Awaiting confirmation.`,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Payment reported successfully. Awaiting confirmation from recipient.',
      payment: {
        paymentId: financePayment.paymentId,
        amount: parseFloat(financePayment.amount),
        fromMemberId: financePayment.fromMemberId,
        toMemberId: financePayment.toMemberId,
        isConfirmed: financePayment.isConfirmed,
        reportedAt: financePayment.reportedAt,
      },
    });
  } catch (error) {
    console.error('Record payment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to record payment',
      error: error.message,
    });
  }
}

/**
 * POST /groups/:groupId/finance-matters/:financeMatterId/payments/:paymentId/confirm
 * Confirm a payment (recipient only)
 */
async function confirmPayment(req, res) {
  try {
    const { groupId, financeMatterId, paymentId } = req.params;
    const userId = req.user.userId;

    // Get user's group membership
    const groupMembership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group',
      });
    }

    // CRITICAL: Supervisors cannot confirm payments (view-only role)
    if (groupMembership.role === 'supervisor') {
      return res.status(403).json({
        success: false,
        message: 'Supervisors cannot confirm payments',
      });
    }

    // Get the payment
    const payment = await prisma.financePayment.findUnique({
      where: { paymentId: paymentId },
      include: {
        financeMatter: {
          include: {
            members: {
              include: {
                groupMember: {
                  select: {
                    groupMemberId: true,
                    displayName: true,
                  },
                },
              },
            },
          },
        },
        fromMember: {
          select: {
            groupMemberId: true,
            displayName: true,
          },
        },
        toMember: {
          select: {
            groupMemberId: true,
            displayName: true,
          },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    if (payment.financeMatterId !== financeMatterId) {
      return res.status(403).json({
        success: false,
        message: 'Payment does not belong to this finance matter',
      });
    }

    if (payment.financeMatter.groupId !== groupId) {
      return res.status(403).json({
        success: false,
        message: 'Finance matter does not belong to this group',
      });
    }

    // Check if payment is already confirmed
    if (payment.isConfirmed) {
      return res.status(400).json({
        success: false,
        message: 'Payment has already been confirmed',
      });
    }

    // Only the recipient can confirm
    if (payment.toMemberId !== groupMembership.groupMemberId) {
      return res.status(403).json({
        success: false,
        message: 'Only the payment recipient can confirm this payment',
      });
    }

    // Update payment to confirmed and update paidAmount
    const paymentAmount = parseFloat(payment.amount);

    await prisma.$transaction(async (tx) => {
      // Mark payment as confirmed
      await tx.financePayment.update({
        where: { paymentId: paymentId },
        data: {
          isConfirmed: true,
          confirmedAt: new Date(),
        },
      });

      // Update the paidAmount for the fromMember (increase)
      const fromMember = payment.financeMatter.members.find(
        (m) => m.groupMemberId === payment.fromMemberId
      );

      if (fromMember) {
        const currentPaid = parseFloat(fromMember.paidAmount);
        const newPaidAmount = currentPaid + paymentAmount;

        await tx.financeMatterMember.update({
          where: {
            financeMatterId_groupMemberId: {
              financeMatterId: financeMatterId,
              groupMemberId: payment.fromMemberId,
            },
          },
          data: {
            paidAmount: newPaidAmount,
          },
        });
      }

      // Update the paidAmount for the toMember (decrease)
      const toMember = payment.financeMatter.members.find(
        (m) => m.groupMemberId === payment.toMemberId
      );

      if (toMember) {
        const currentPaid = parseFloat(toMember.paidAmount);
        const newPaidAmount = currentPaid - paymentAmount;

        await tx.financeMatterMember.update({
          where: {
            financeMatterId_groupMemberId: {
              financeMatterId: financeMatterId,
              groupMemberId: payment.toMemberId,
            },
          },
          data: {
            paidAmount: newPaidAmount,
          },
        });
      }

      // Create audit log for confirmation
      await tx.auditLog.create({
        data: {
          groupId: groupId,
          action: 'confirm_payment',
          performedBy: groupMembership.groupMemberId,
          performedByName: groupMembership.displayName,
          performedByEmail: groupMembership.email || 'N/A',
          actionLocation: 'finance',
          messageContent: `Confirmed payment of ${paymentAmount.toFixed(2)} from ${payment.fromMember.displayName} to ${payment.toMember.displayName} in finance matter "${payment.financeMatter.title}".`,
        },
      });

      // Check if finance matter should be auto-settled
      // Get updated member data
      const updatedMembers = await tx.financeMatterMember.findMany({
        where: { financeMatterId: financeMatterId },
      });

      // Check if all members have paid their share
      const allMembersPaid = updatedMembers.every((member) => {
        const paid = parseFloat(member.paidAmount);
        const expected = parseFloat(member.expectedAmount);
        return paid >= expected - 0.01; // Allow small rounding error
      });

      // Check if all payments are confirmed
      const pendingPayments = await tx.financePayment.findMany({
        where: {
          financeMatterId: financeMatterId,
          isConfirmed: false,
        },
      });

      const allPaymentsConfirmed = pendingPayments.length === 0;

      // Auto-settle if both conditions are met
      if (allMembersPaid && allPaymentsConfirmed && !payment.financeMatter.isSettled) {
        await tx.financeMatter.update({
          where: { financeMatterId: financeMatterId },
          data: {
            isSettled: true,
            settledAt: new Date(),
          },
        });

        // Create audit log for auto-settle
        await tx.auditLog.create({
          data: {
            groupId: groupId,
            action: 'auto_settle',
            performedBy: groupMembership.groupMemberId,
            performedByName: groupMembership.displayName,
            performedByEmail: groupMembership.email || 'N/A',
            actionLocation: 'finance',
            messageContent: `Finance matter "${payment.financeMatter.title}" auto-settled after all payments were confirmed.`,
          },
        });
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Payment confirmed successfully',
    });
  } catch (error) {
    console.error('Confirm payment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to confirm payment',
      error: error.message,
    });
  }
}

/**
 * POST /groups/:groupId/finance-matters/:financeMatterId/payments/:paymentId/reject
 * Reject a payment (recipient only)
 */
async function rejectPayment(req, res) {
  try {
    const { groupId, financeMatterId, paymentId } = req.params;
    const userId = req.user.userId;

    // Get user's group membership
    const groupMembership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group',
      });
    }

    // CRITICAL: Supervisors cannot reject payments (view-only role)
    if (groupMembership.role === 'supervisor') {
      return res.status(403).json({
        success: false,
        message: 'Supervisors cannot reject payments',
      });
    }

    // Get the payment
    const payment = await prisma.financePayment.findUnique({
      where: { paymentId: paymentId },
      include: {
        financeMatter: {
          select: {
            financeMatterId: true,
            groupId: true,
            title: true,
          },
        },
        fromMember: {
          select: {
            groupMemberId: true,
            displayName: true,
          },
        },
        toMember: {
          select: {
            groupMemberId: true,
            displayName: true,
          },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    if (payment.financeMatterId !== financeMatterId) {
      return res.status(403).json({
        success: false,
        message: 'Payment does not belong to this finance matter',
      });
    }

    if (payment.financeMatter.groupId !== groupId) {
      return res.status(403).json({
        success: false,
        message: 'Finance matter does not belong to this group',
      });
    }

    // Check if payment is already confirmed
    if (payment.isConfirmed) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reject a payment that has already been confirmed',
      });
    }

    // Only the recipient can reject
    if (payment.toMemberId !== groupMembership.groupMemberId) {
      return res.status(403).json({
        success: false,
        message: 'Only the payment recipient can reject this payment',
      });
    }

    const paymentAmount = parseFloat(payment.amount);

    await prisma.$transaction(async (tx) => {
      // Delete the payment record
      await tx.financePayment.delete({
        where: { paymentId: paymentId },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          groupId: groupId,
          action: 'reject_payment',
          performedBy: groupMembership.groupMemberId,
          performedByName: groupMembership.displayName,
          performedByEmail: groupMembership.email || 'N/A',
          actionLocation: 'finance',
          messageContent: `Rejected payment of ${paymentAmount.toFixed(2)} from ${payment.fromMember.displayName} to ${payment.toMember.displayName} in finance matter "${payment.financeMatter.title}".`,
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Payment rejected successfully',
    });
  } catch (error) {
    console.error('Reject payment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject payment',
      error: error.message,
    });
  }
}

/**
 * Cancel a finance matter (admin or creator only)
 */
async function cancelFinanceMatter(req, res) {
  try {
    const userId = req.user.userId;
    const { groupId, financeMatterId } = req.params;

    // Get user's group membership
    const groupMembership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
      },
    });

    if (!groupMembership) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group',
      });
    }

    // Get the finance matter
    const financeMatter = await prisma.financeMatter.findUnique({
      where: { financeMatterId: financeMatterId },
      include: {
        creator: {
          select: {
            groupMemberId: true,
            displayName: true,
          },
        },
      },
    });

    if (!financeMatter) {
      return res.status(404).json({
        success: false,
        message: 'Finance matter not found',
      });
    }

    if (financeMatter.groupId !== groupId) {
      return res.status(403).json({
        success: false,
        message: 'Finance matter does not belong to this group',
      });
    }

    // Check if already canceled
    if (financeMatter.isCanceled) {
      return res.status(400).json({
        success: false,
        message: 'Finance matter is already canceled',
      });
    }

    // Check if already settled
    if (financeMatter.isSettled) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a settled finance matter',
      });
    }

    // Check if user is admin or creator
    const isAdmin = groupMembership.role === 'admin';
    const isCreator = financeMatter.createdBy === groupMembership.groupMemberId;

    if (!isAdmin && !isCreator) {
      return res.status(403).json({
        success: false,
        message: 'Only admins or the creator can cancel a finance matter',
      });
    }

    // Cancel the finance matter
    await prisma.$transaction(async (tx) => {
      await tx.financeMatter.update({
        where: { financeMatterId: financeMatterId },
        data: {
          isCanceled: true,
          canceledAt: new Date(),
          canceledBy: groupMembership.groupMemberId,
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          groupId: groupId,
          action: 'cancel_finance_matter',
          performedBy: groupMembership.groupMemberId,
          performedByName: groupMembership.displayName,
          performedByEmail: groupMembership.email || 'N/A',
          actionLocation: 'finance',
          messageContent: `Canceled finance matter "${financeMatter.title}".`,
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Finance matter canceled successfully',
    });
  } catch (error) {
    console.error('Cancel finance matter error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel finance matter',
      error: error.message,
    });
  }
}

module.exports = {
  getFinanceMatters,
  createFinanceMatter,
  getFinanceMatterById,
  settleFinanceMatter,
  getFinanceMatterMessages,
  sendFinanceMatterMessage,
  recordPayment,
  confirmPayment,
  rejectPayment,
  cancelFinanceMatter,
};
