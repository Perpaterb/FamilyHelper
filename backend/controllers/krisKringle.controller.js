/**
 * Kris Kringle Controller
 *
 * Handles Kris Kringle / Secret Santa operations.
 */

const { prisma } = require('../config/database');
const { isGroupReadOnly, getReadOnlyErrorResponse } = require('../utils/permissions');
const { emailService } = require('../services/email');
const emailTemplates = require('../services/email/templates');
const crypto = require('crypto');

/**
 * Generate a random 6-character alphanumeric passcode
 * @returns {string} Passcode
 */
function generatePasscode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like 0/O, 1/I
  let passcode = '';
  for (let i = 0; i < 6; i++) {
    passcode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return passcode;
}

/**
 * Generate a random web token (32-character hex string)
 * @returns {string} Web token
 */
function generateWebToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Format date as DD-MMM-YYYY (e.g., 19-Dec-2025)
 * @param {Date|string} date - Date to format
 * @returns {string|null} Formatted date string or null
 */
function formatDate(date) {
  if (!date) return null;
  const d = new Date(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = d.getDate().toString().padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Shuffle array using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generate Kris Kringle matches with exclusion rules
 *
 * Algorithm:
 * 1. Create a derangement (no one draws themselves)
 * 2. Respect exclusion rules (certain pairs can't be matched)
 * 3. Try up to 1000 times to find valid matching
 *
 * @param {Array} participants - Array of participant IDs
 * @param {Array} exclusions - Array of {participant1Id, participant2Id} objects
 * @returns {Array|null} Array of {giverId, receiverId} matches, or null if impossible
 */
function generateMatches(participants, exclusions) {
  const maxAttempts = 1000;

  // Build exclusion map for quick lookup
  const exclusionMap = new Map();
  exclusions.forEach(ex => {
    if (!exclusionMap.has(ex.participant1Id)) {
      exclusionMap.set(ex.participant1Id, new Set());
    }
    if (!exclusionMap.has(ex.participant2Id)) {
      exclusionMap.set(ex.participant2Id, new Set());
    }
    exclusionMap.get(ex.participant1Id).add(ex.participant2Id);
    exclusionMap.get(ex.participant2Id).add(ex.participant1Id);
  });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const receivers = shuffleArray(participants);
    const matches = [];
    let valid = true;

    for (let i = 0; i < participants.length; i++) {
      const giver = participants[i];
      const receiver = receivers[i];

      // Check: Can't draw yourself
      if (giver === receiver) {
        valid = false;
        break;
      }

      // Check: Can't draw someone in exclusion list
      if (exclusionMap.has(giver) && exclusionMap.get(giver).has(receiver)) {
        valid = false;
        break;
      }

      matches.push({ giverId: giver, receiverId: receiver });
    }

    if (valid) {
      return matches;
    }
  }

  // No valid matching found after max attempts
  return null;
}

/**
 * Get all Kris Kringle events for a group
 * GET /groups/:groupId/kris-kringle
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getKrisKringles(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;

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

    // Check admin visibility permissions from group settings
    if (membership.role === 'admin') {
      const groupSettings = await prisma.groupSettings.findUnique({
        where: { groupId },
        select: { secretSantaVisibleToAdmins: true },
      });
      if (groupSettings && !groupSettings.secretSantaVisibleToAdmins) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Secret Santa is not visible to admins in this group',
        });
      }
    }

    // Get all Kris Kringle events for this group
    const krisKringles = await prisma.krisKringle.findMany({
      where: {
        groupId: groupId,
        isHidden: false,
      },
      include: {
        creator: {
          select: {
            groupMemberId: true,
            displayName: true,
          },
        },
        participants: {
          include: {
            groupMember: {
              select: {
                displayName: true,
                iconLetters: true,
                iconColor: true,
              },
            },
          },
        },
        _count: {
          select: {
            participants: true,
            matches: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({
      success: true,
      krisKringles: krisKringles,
    });
  } catch (error) {
    console.error('Get Kris Kringles error:', error);
    res.status(500).json({
      error: 'Failed to get Kris Kringles',
      message: error.message,
    });
  }
}

/**
 * Create a new Kris Kringle event
 * POST /groups/:groupId/kris-kringle
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function createKrisKringle(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;
    const { name, description, occasion, priceLimit, assigningDateTime, exchangeDate, participants, exclusions } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Name is required',
      });
    }

    if (!participants || participants.length < 3) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'At least 3 participants are required for Kris Kringle',
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

    // Check if group is in read-only mode
    const group = await prisma.group.findUnique({
      where: { groupId },
      select: { readOnlyUntil: true, hasActiveAdmin: true },
    });

    if (isGroupReadOnly(group)) {
      return res.status(403).json(getReadOnlyErrorResponse(group));
    }

    // Check admin creatable permissions from group settings
    if (membership.role === 'admin') {
      const groupSettings = await prisma.groupSettings.findUnique({
        where: { groupId },
        select: { secretSantaCreatableByAdmins: true },
      });
      if (groupSettings && !groupSettings.secretSantaCreatableByAdmins) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Admins cannot create Secret Santa events in this group',
        });
      }
    }

    // Create Kris Kringle event (status: draft - matches not generated yet)
    const webToken = generateWebToken();
    const krisKringle = await prisma.krisKringle.create({
      data: {
        groupId: groupId,
        name: name.trim(),
        description: description?.trim() || null,
        occasion: occasion?.trim() || null,
        priceLimit: priceLimit || null,
        assigningDateTime: assigningDateTime ? new Date(assigningDateTime) : new Date(), // Default to now
        exchangeDate: exchangeDate ? new Date(exchangeDate) : null,
        webToken: webToken,
        createdBy: membership.groupMemberId,
        status: 'draft',
        isAssigned: false,
      },
    });

    // Add participants
    const participantRecords = [];
    for (const p of participants) {
      if (p.groupMemberId) {
        // Existing group member
        const member = await prisma.groupMember.findUnique({
          where: { groupMemberId: p.groupMemberId },
          include: {
            user: {
              select: {
                email: true,
                displayName: true,
              },
            },
          },
        });

        if (!member || member.groupId !== groupId) {
          continue; // Skip invalid members
        }

        // Use user's actual email if available, otherwise use member email
        const email = member.user?.email || member.email;
        if (!email) {
          continue; // Skip members without email
        }

        participantRecords.push({
          krisKringleId: krisKringle.krisKringleId,
          groupMemberId: p.groupMemberId,
          email: email,
          name: member.user?.displayName || member.displayName,
          passcode: generatePasscode(),
          hasJoined: true, // Already in group
        });
      } else if (p.email && p.name) {
        // External participant (email invite)
        participantRecords.push({
          krisKringleId: krisKringle.krisKringleId,
          groupMemberId: null,
          email: p.email.trim().toLowerCase(),
          name: p.name.trim(),
          passcode: generatePasscode(),
          hasJoined: false, // Needs to sign up
        });
      }
    }

    await prisma.krisKringleParticipant.createMany({
      data: participantRecords,
    });

    // Send initial emails to all participants
    const createdParticipants = await prisma.krisKringleParticipant.findMany({
      where: { krisKringleId: krisKringle.krisKringleId },
    });

    const appUrl = process.env.APP_URL || 'https://familyhelperapp.com';
    const secretSantaUrl = `${appUrl}/secret-santa/${krisKringle.webToken}`;

    // Send initial emails to all participants
    for (const participant of createdParticipants) {
      if (participant.email) {
        try {
          const emailContent = emailTemplates.secret_santa_added({
            recipientName: participant.name,
            eventName: krisKringle.name,
            occasion: krisKringle.occasion || null,
            exchangeDate: formatDate(krisKringle.exchangeDate),
            priceLimit: krisKringle.priceLimit ? `$${krisKringle.priceLimit}` : null,
            passcode: participant.passcode,
            secretSantaUrl: secretSantaUrl,
            appUrl: appUrl,
          });
          await emailService.sendEmail({
            to: participant.email,
            subject: emailContent.subject,
            text: emailContent.text,
            html: emailContent.html,
          });
          console.log(`[KrisKringle] Invitation email sent to ${participant.email}`);

          // Update email sent timestamp
          await prisma.krisKringleParticipant.update({
            where: { participantId: participant.participantId },
            data: { initialEmailSentAt: new Date() },
          });
        } catch (emailError) {
          console.error(`[KrisKringle] Failed to send email to ${participant.email}:`, emailError.message);
        }
      }
    }

    // Add exclusions (if any)
    if (exclusions && exclusions.length > 0) {
      // Get created participants to map names to IDs
      const createdParticipants = await prisma.krisKringleParticipant.findMany({
        where: { krisKringleId: krisKringle.krisKringleId },
      });

      const exclusionRecords = [];
      for (const ex of exclusions) {
        const p1 = createdParticipants.find(p =>
          p.groupMemberId === ex.participant1Id || p.email === ex.participant1Email
        );
        const p2 = createdParticipants.find(p =>
          p.groupMemberId === ex.participant2Id || p.email === ex.participant2Email
        );

        if (p1 && p2) {
          exclusionRecords.push({
            krisKringleId: krisKringle.krisKringleId,
            participant1Id: p1.participantId,
            participant2Id: p2.participantId,
          });
        }
      }

      if (exclusionRecords.length > 0) {
        await prisma.krisKringleExclusion.createMany({
          data: exclusionRecords,
        });
      }
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'create_kris_kringle',
        actionLocation: 'kris_kringle',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        messageContent: `Created Kris Kringle event "${name}" with ${participantRecords.length} participants`,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Kris Kringle event created successfully',
      krisKringle: {
        ...krisKringle,
        participantCount: participantRecords.length,
      },
    });
  } catch (error) {
    console.error('Create Kris Kringle error:', error);
    res.status(500).json({
      error: 'Failed to create Kris Kringle event',
      message: error.message,
    });
  }
}

/**
 * Generate matches for a Kris Kringle event
 * POST /groups/:groupId/kris-kringle/:krisKringleId/generate-matches
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function generateKrisKringleMatches(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, krisKringleId } = req.params;

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

    // Check if group is in read-only mode
    const group = await prisma.group.findUnique({
      where: { groupId },
      select: { readOnlyUntil: true, hasActiveAdmin: true },
    });

    if (isGroupReadOnly(group)) {
      return res.status(403).json(getReadOnlyErrorResponse(group));
    }

    // Get Kris Kringle event
    const krisKringle = await prisma.krisKringle.findUnique({
      where: { krisKringleId: krisKringleId },
      include: {
        participants: {
          include: {
            groupMember: true,
          },
        },
        exclusions: true,
      },
    });

    if (!krisKringle || krisKringle.groupId !== groupId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Kris Kringle event not found',
      });
    }

    // Only creator can generate matches
    if (krisKringle.createdBy !== membership.groupMemberId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the event creator can generate matches',
      });
    }

    // Check if matches already exist
    const existingMatches = await prisma.krisKringleMatch.findMany({
      where: { krisKringleId: krisKringleId },
    });

    if (existingMatches.length > 0) {
      return res.status(400).json({
        error: 'Matches Already Generated',
        message: 'Matches have already been generated for this event',
      });
    }

    // Generate matches
    const participantIds = krisKringle.participants.map(p => p.participantId);
    const matches = generateMatches(participantIds, krisKringle.exclusions);

    if (!matches) {
      return res.status(400).json({
        error: 'Matching Impossible',
        message: 'Cannot generate valid matches with current exclusion rules. Try removing some exclusions.',
      });
    }

    // Save matches to database
    await prisma.krisKringleMatch.createMany({
      data: matches.map(m => ({
        krisKringleId: krisKringleId,
        giverId: m.giverId,
        receiverId: m.receiverId,
      })),
    });

    // Update status to active and mark as assigned
    await prisma.krisKringle.update({
      where: { krisKringleId: krisKringleId },
      data: {
        status: 'active',
        isAssigned: true,
      },
    });

    // Send match reveal emails to all participants
    const appUrl = process.env.APP_URL || 'https://familyhelperapp.com';
    const secretSantaUrl = `${appUrl}/secret-santa/${krisKringle.webToken}`;
    let emailsSent = 0;

    for (const participant of krisKringle.participants) {
      const match = matches.find(m => m.giverId === participant.participantId);
      const receiver = krisKringle.participants.find(p => p.participantId === match.receiverId);

      if (participant.email) {
        try {
          // Build wishlist URL if receiver has one
          const wishlistUrl = receiver.wishListId
            ? `${appUrl}/wishlists/${receiver.wishListId}`
            : null;

          const emailContent = emailTemplates.secret_santa_match({
            recipientName: participant.name,
            eventName: krisKringle.name,
            matchName: receiver.name,
            exchangeDate: formatDate(krisKringle.exchangeDate),
            priceLimit: krisKringle.priceLimit ? `$${krisKringle.priceLimit}` : null,
            wishlistUrl: wishlistUrl,
            secretSantaUrl: secretSantaUrl,
            appUrl: appUrl,
          });
          await emailService.sendEmail({
            to: participant.email,
            subject: emailContent.subject,
            text: emailContent.text,
            html: emailContent.html,
          });
          emailsSent++;
          console.log(`[KrisKringle] Match email sent to ${participant.email}`);
        } catch (emailError) {
          console.error(`[KrisKringle] Failed to send match email to ${participant.email}:`, emailError.message);
        }
      }
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'generate_kris_kringle_matches',
        actionLocation: 'kris_kringle',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        messageContent: `Generated matches for Kris Kringle event "${krisKringle.name}" and sent ${krisKringle.participants.length} emails`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Matches generated and emails sent successfully',
      matchCount: matches.length,
    });
  } catch (error) {
    console.error('Generate Kris Kringle matches error:', error);
    res.status(500).json({
      error: 'Failed to generate matches',
      message: error.message,
    });
  }
}

/**
 * Get my match (who I'm giving to) for a Kris Kringle event
 * GET /groups/:groupId/kris-kringle/:krisKringleId/my-match
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getMyMatch(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, krisKringleId } = req.params;

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

    // Find participant record for this user
    const participant = await prisma.krisKringleParticipant.findFirst({
      where: {
        krisKringleId: krisKringleId,
        groupMemberId: membership.groupMemberId,
      },
    });

    if (!participant) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'You are not a participant in this Kris Kringle event',
      });
    }

    // Find match
    const match = await prisma.krisKringleMatch.findFirst({
      where: {
        krisKringleId: krisKringleId,
        giverId: participant.participantId,
      },
      include: {
        receiver: {
          include: {
            groupMember: true,
            wishList: {
              include: {
                items: {
                  where: {
                    isHidden: false,
                  },
                  orderBy: [
                    { isPurchased: 'asc' },
                    { priority: 'desc' },
                  ],
                },
              },
            },
          },
        },
      },
    });

    if (!match) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No match found. Matches may not have been generated yet.',
      });
    }

    res.status(200).json({
      success: true,
      recipient: {
        name: match.receiver.name,
        wishList: match.receiver.wishList,
      },
    });
  } catch (error) {
    console.error('Get my match error:', error);
    res.status(500).json({
      error: 'Failed to get match',
      message: error.message,
    });
  }
}

/**
 * Delete Kris Kringle event (soft delete)
 * DELETE /groups/:groupId/kris-kringle/:krisKringleId
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function deleteKrisKringle(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, krisKringleId } = req.params;

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

    // Check if group is in read-only mode
    const group = await prisma.group.findUnique({
      where: { groupId },
      select: { readOnlyUntil: true, hasActiveAdmin: true },
    });

    if (isGroupReadOnly(group)) {
      return res.status(403).json(getReadOnlyErrorResponse(group));
    }

    // Get Kris Kringle event
    const krisKringle = await prisma.krisKringle.findUnique({
      where: { krisKringleId: krisKringleId },
    });

    if (!krisKringle || krisKringle.groupId !== groupId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Kris Kringle event not found',
      });
    }

    // Only creator or admins can delete
    if (krisKringle.createdBy !== membership.groupMemberId && membership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the event creator or admins can delete this event',
      });
    }

    // Soft delete
    await prisma.krisKringle.update({
      where: { krisKringleId: krisKringleId },
      data: { isHidden: true },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'delete_kris_kringle',
        actionLocation: 'kris_kringle',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        messageContent: `Deleted Kris Kringle event "${krisKringle.name}"`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Kris Kringle event deleted successfully',
    });
  } catch (error) {
    console.error('Delete Kris Kringle error:', error);
    res.status(500).json({
      error: 'Failed to delete event',
      message: error.message,
    });
  }
}

/**
 * Get a specific Kris Kringle event details
 * GET /groups/:groupId/kris-kringle/:krisKringleId
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getKrisKringle(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, krisKringleId } = req.params;

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

    // Get Kris Kringle event with details
    const krisKringle = await prisma.krisKringle.findUnique({
      where: { krisKringleId: krisKringleId },
      include: {
        creator: {
          select: {
            groupMemberId: true,
            displayName: true,
            user: {
              select: {
                displayName: true,
              },
            },
          },
        },
        participants: {
          include: {
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
        matches: {
          include: {
            receiver: {
              select: {
                participantId: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            participants: true,
            matches: true,
          },
        },
      },
    });

    if (!krisKringle || krisKringle.groupId !== groupId || krisKringle.isHidden) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Kris Kringle event not found',
      });
    }

    // Check if current user is the creator or admin
    const isCreator = krisKringle.createdBy === membership.groupMemberId;
    const isAdmin = membership.role === 'admin';
    const canManage = isCreator || isAdmin;

    // Build match lookup for participants (only if admin/creator and isAssigned)
    const matchLookup = {};
    if (canManage && krisKringle.isAssigned) {
      krisKringle.matches.forEach(m => {
        matchLookup[m.giverId] = m.receiver;
      });
    }

    res.status(200).json({
      success: true,
      krisKringle: {
        ...krisKringle,
        matches: undefined, // Don't expose raw matches array
        creator: {
          groupMemberId: krisKringle.creator.groupMemberId,
          displayName: krisKringle.creator.user?.displayName || krisKringle.creator.displayName,
        },
        participants: krisKringle.participants.map(p => ({
          participantId: p.participantId,
          name: p.name,
          email: canManage ? p.email : undefined, // Only show emails to creator/admin
          passcode: canManage ? p.passcode : undefined, // Only show passcode to creator/admin
          hasJoined: p.hasJoined,
          hasViewed: p.hasViewed,
          initialEmailSentAt: p.initialEmailSentAt,
          assignmentEmailSentAt: p.assignmentEmailSentAt,
          groupMemberId: p.groupMemberId, // Include the groupMemberId to identify external vs group members
          groupMember: p.groupMember ? {
            displayName: p.groupMember.user?.displayName || p.groupMember.displayName,
            iconLetters: p.groupMember.user?.memberIcon || p.groupMember.iconLetters,
            iconColor: p.groupMember.user?.iconColor || p.groupMember.iconColor,
            profilePhotoUrl: p.groupMember.user?.profilePhotoFileId
              ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${p.groupMember.user.profilePhotoFileId}`
              : null,
          } : null,
          // Include match info for admin/creator when matches are assigned
          match: matchLookup[p.participantId] ? {
            participantId: matchLookup[p.participantId].participantId,
            name: matchLookup[p.participantId].name,
          } : null,
        })),
        canManage: canManage,
        isCreator: isCreator,
      },
    });
  } catch (error) {
    console.error('Get Kris Kringle error:', error);
    res.status(500).json({
      error: 'Failed to get Kris Kringle event',
      message: error.message,
    });
  }
}

/**
 * Resend email to a participant with new passcode
 * POST /groups/:groupId/kris-kringle/:krisKringleId/participants/:participantId/resend
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function resendParticipantEmail(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, krisKringleId, participantId } = req.params;

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

    // Check if group is in read-only mode
    const group = await prisma.group.findUnique({
      where: { groupId },
      select: { readOnlyUntil: true, hasActiveAdmin: true },
    });

    if (isGroupReadOnly(group)) {
      return res.status(403).json(getReadOnlyErrorResponse(group));
    }

    // Get Kris Kringle event
    const krisKringle = await prisma.krisKringle.findUnique({
      where: { krisKringleId: krisKringleId },
    });

    if (!krisKringle || krisKringle.groupId !== groupId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Kris Kringle event not found',
      });
    }

    // Only creator or admins can resend emails
    if (krisKringle.createdBy !== membership.groupMemberId && membership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the event creator or admins can resend emails',
      });
    }

    // Get participant
    const participant = await prisma.krisKringleParticipant.findUnique({
      where: { participantId: participantId },
    });

    if (!participant || participant.krisKringleId !== krisKringleId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Participant not found',
      });
    }

    // Generate new passcode
    const newPasscode = generatePasscode();

    // Update participant with new passcode
    await prisma.krisKringleParticipant.update({
      where: { participantId: participantId },
      data: { passcode: newPasscode },
    });

    // Send email with new access code (reusing the added template)
    const appUrl = process.env.APP_URL || 'https://familyhelperapp.com';
    const secretSantaUrl = `${appUrl}/secret-santa/${krisKringle.webToken}`;

    const emailContent = emailTemplates.secret_santa_added({
      recipientName: participant.name,
      eventName: krisKringle.name,
      occasion: krisKringle.occasion || null,
      exchangeDate: formatDate(krisKringle.exchangeDate),
      priceLimit: krisKringle.priceLimit ? `$${krisKringle.priceLimit}` : null,
      passcode: newPasscode,
      secretSantaUrl: secretSantaUrl,
      appUrl: appUrl,
    });

    // Override subject to indicate this is a resend
    await emailService.sendEmail({
      to: participant.email,
      subject: `🎁 New Access Code - "${krisKringle.name}" Secret Santa`,
      text: emailContent.text,
      html: emailContent.html,
    });
    console.log(`[KrisKringle] Resent email with new passcode to ${participant.email}`);

    // Update email sent timestamp
    await prisma.krisKringleParticipant.update({
      where: { participantId: participantId },
      data: { initialEmailSentAt: new Date() },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'resend_kris_kringle_email',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'kris_kringle',
        messageContent: `Resent Secret Santa assignment email to ${participant.name} for event "${krisKringle.name}"`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Email resent with new access code',
    });
  } catch (error) {
    console.error('Resend participant email error:', error);
    res.status(500).json({
      error: 'Failed to resend email',
      message: error.message,
    });
  }
}

/**
 * Public endpoint to verify email and passcode for external access
 * POST /secret-santa/:webToken/verify
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function verifySecretSantaAccess(req, res) {
  try {
    const { webToken } = req.params;
    const { email, passcode } = req.body;

    if (!email || !passcode) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email and passcode are required',
      });
    }

    // Find Kris Kringle by web token
    const krisKringle = await prisma.krisKringle.findUnique({
      where: { webToken: webToken },
      include: {
        participants: true,
        matches: true,
      },
    });

    if (!krisKringle || krisKringle.isHidden) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Secret Santa event not found',
      });
    }

    // Find participant by email and passcode
    const participant = krisKringle.participants.find(
      p => p.email.toLowerCase() === email.toLowerCase() && p.passcode.toUpperCase() === passcode.toUpperCase()
    );

    if (!participant) {
      return res.status(401).json({
        error: 'Invalid Credentials',
        message: 'Invalid email or access code',
      });
    }

    // Check if assignments have been made
    const now = new Date();
    const assigningTime = new Date(krisKringle.assigningDateTime);
    const isAssigned = krisKringle.isAssigned && krisKringle.matches.length > 0;

    // If not assigned yet, return countdown info
    if (!isAssigned || now < assigningTime) {
      return res.status(200).json({
        success: true,
        eventName: krisKringle.name,
        occasion: krisKringle.occasion,
        exchangeDate: krisKringle.exchangeDate,
        priceLimit: krisKringle.priceLimit,
        assigningDateTime: krisKringle.assigningDateTime,
        isRevealed: false,
        message: 'Your Secret Santa will be revealed soon!',
      });
    }

    // Find who this participant is giving to
    const match = krisKringle.matches.find(m => m.giverId === participant.participantId);

    if (!match) {
      return res.status(404).json({
        error: 'Match Not Found',
        message: 'No match found for this participant',
      });
    }

    // Get receiver details
    const receiver = krisKringle.participants.find(p => p.participantId === match.receiverId);

    // Update hasViewed
    if (!participant.hasViewed) {
      await prisma.krisKringleParticipant.update({
        where: { participantId: participant.participantId },
        data: {
          hasViewed: true,
          viewedAt: new Date(),
        },
      });
    }

    // TODO: Get receiver's gift registry if they have one linked

    res.status(200).json({
      success: true,
      eventName: krisKringle.name,
      occasion: krisKringle.occasion,
      exchangeDate: krisKringle.exchangeDate,
      priceLimit: krisKringle.priceLimit,
      isRevealed: true,
      recipientName: receiver.name,
      // giftRegistryUrl: receiver.giftRegistryId ? `${externalUrl}/registry/${receiver.giftRegistryId}` : null,
    });
  } catch (error) {
    console.error('Verify Secret Santa access error:', error);
    res.status(500).json({
      error: 'Failed to verify access',
      message: error.message,
    });
  }
}

/**
 * Public endpoint to get Secret Santa event info (no auth required)
 * GET /secret-santa/:webToken
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getSecretSantaPublic(req, res) {
  try {
    const { webToken } = req.params;

    // Find Kris Kringle by web token
    const krisKringle = await prisma.krisKringle.findUnique({
      where: { webToken: webToken },
    });

    if (!krisKringle || krisKringle.isHidden) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Secret Santa event not found',
      });
    }

    // Return basic event info (no sensitive data)
    res.status(200).json({
      success: true,
      eventName: krisKringle.name,
      occasion: krisKringle.occasion,
      exchangeDate: krisKringle.exchangeDate,
      assigningDateTime: krisKringle.assigningDateTime,
      priceLimit: krisKringle.priceLimit,
    });
  } catch (error) {
    console.error('Get Secret Santa public error:', error);
    res.status(500).json({
      error: 'Failed to get event info',
      message: error.message,
    });
  }
}

/**
 * Update a Kris Kringle event (before matches are generated)
 * PUT /groups/:groupId/kris-kringle/:krisKringleId
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function updateKrisKringle(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, krisKringleId } = req.params;
    const { name, priceLimit, exchangeDate, occasion } = req.body;

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

    // Check if group is in read-only mode
    const group = await prisma.group.findUnique({
      where: { groupId },
      select: { readOnlyUntil: true, hasActiveAdmin: true },
    });

    if (isGroupReadOnly(group)) {
      return res.status(403).json(getReadOnlyErrorResponse(group));
    }

    // Get Kris Kringle event
    const krisKringle = await prisma.krisKringle.findUnique({
      where: { krisKringleId: krisKringleId },
    });

    if (!krisKringle || krisKringle.groupId !== groupId || krisKringle.isHidden) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Kris Kringle event not found',
      });
    }

    // Only creator or admins can update
    if (krisKringle.createdBy !== membership.groupMemberId && membership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the event creator or admins can update this event',
      });
    }

    // Cannot update after matches are generated
    if (krisKringle.isAssigned) {
      return res.status(400).json({
        error: 'Cannot Update',
        message: 'Cannot update event details after matches have been generated',
      });
    }

    // Update the event
    const updatedKrisKringle = await prisma.krisKringle.update({
      where: { krisKringleId: krisKringleId },
      data: {
        name: name?.trim() || krisKringle.name,
        priceLimit: priceLimit !== undefined ? priceLimit : krisKringle.priceLimit,
        exchangeDate: exchangeDate ? new Date(exchangeDate) : krisKringle.exchangeDate,
        occasion: occasion !== undefined ? occasion : krisKringle.occasion,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Event updated successfully',
      krisKringle: updatedKrisKringle,
    });
  } catch (error) {
    console.error('Update Kris Kringle error:', error);
    res.status(500).json({
      error: 'Failed to update Kris Kringle event',
      message: error.message,
    });
  }
}

/**
 * Add a participant to a Kris Kringle event (before matches are generated)
 * POST /groups/:groupId/kris-kringle/:krisKringleId/participants
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function addParticipant(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, krisKringleId } = req.params;
    const { groupMemberId, name, email } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    if (!name || !email) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Name and email are required',
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

    // Check if group is in read-only mode
    const group = await prisma.group.findUnique({
      where: { groupId },
      select: { readOnlyUntil: true, hasActiveAdmin: true },
    });

    if (isGroupReadOnly(group)) {
      return res.status(403).json(getReadOnlyErrorResponse(group));
    }

    // Get Kris Kringle event
    const krisKringle = await prisma.krisKringle.findUnique({
      where: { krisKringleId: krisKringleId },
      include: { participants: true },
    });

    if (!krisKringle || krisKringle.groupId !== groupId || krisKringle.isHidden) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Kris Kringle event not found',
      });
    }

    // Only creator or admins can add participants
    if (krisKringle.createdBy !== membership.groupMemberId && membership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the event creator or admins can add participants',
      });
    }

    // Cannot add after matches are generated
    if (krisKringle.isAssigned) {
      return res.status(400).json({
        error: 'Cannot Add',
        message: 'Cannot add participants after matches have been generated',
      });
    }

    // Check if email already exists
    if (krisKringle.participants.some(p => p.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({
        error: 'Already Added',
        message: 'A participant with this email already exists',
      });
    }

    // Create participant
    const passcode = generatePasscode();
    const participant = await prisma.krisKringleParticipant.create({
      data: {
        krisKringleId: krisKringleId,
        groupMemberId: groupMemberId || null,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passcode: passcode,
        hasJoined: !!groupMemberId,
      },
    });

    // Send email to the new participant
    const appUrl = process.env.APP_URL || 'https://familyhelperapp.com';
    const secretSantaUrl = `${appUrl}/secret-santa/${krisKringle.webToken}`;

    try {
      const emailContent = emailTemplates.secret_santa_added({
        recipientName: participant.name,
        eventName: krisKringle.name,
        occasion: krisKringle.occasion || null,
        exchangeDate: formatDate(krisKringle.exchangeDate),
        priceLimit: krisKringle.priceLimit ? `$${krisKringle.priceLimit}` : null,
        passcode: participant.passcode,
        secretSantaUrl: secretSantaUrl,
        appUrl: appUrl,
      });
      await emailService.sendEmail({
        to: participant.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      });
      console.log(`[KrisKringle] Invitation email sent to ${participant.email}`);

      // Update email sent timestamp
      await prisma.krisKringleParticipant.update({
        where: { participantId: participant.participantId },
        data: { initialEmailSentAt: new Date() },
      });
    } catch (emailError) {
      console.error(`[KrisKringle] Failed to send email to ${participant.email}:`, emailError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Participant added successfully',
      participant: {
        participantId: participant.participantId,
        name: participant.name,
        email: participant.email,
        groupMemberId: participant.groupMemberId,
      },
    });
  } catch (error) {
    console.error('Add participant error:', error);
    res.status(500).json({
      error: 'Failed to add participant',
      message: error.message,
    });
  }
}

/**
 * Remove a participant from a Kris Kringle event (before matches are generated)
 * DELETE /groups/:groupId/kris-kringle/:krisKringleId/participants/:participantId
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function removeParticipant(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, krisKringleId, participantId } = req.params;

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

    // Check if group is in read-only mode
    const group = await prisma.group.findUnique({
      where: { groupId },
      select: { readOnlyUntil: true, hasActiveAdmin: true },
    });

    if (isGroupReadOnly(group)) {
      return res.status(403).json(getReadOnlyErrorResponse(group));
    }

    // Get Kris Kringle event
    const krisKringle = await prisma.krisKringle.findUnique({
      where: { krisKringleId: krisKringleId },
    });

    if (!krisKringle || krisKringle.groupId !== groupId || krisKringle.isHidden) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Kris Kringle event not found',
      });
    }

    // Only creator or admins can remove participants
    if (krisKringle.createdBy !== membership.groupMemberId && membership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the event creator or admins can remove participants',
      });
    }

    // Cannot remove after matches are generated
    if (krisKringle.isAssigned) {
      return res.status(400).json({
        error: 'Cannot Remove',
        message: 'Cannot remove participants after matches have been generated',
      });
    }

    // Get participant
    const participant = await prisma.krisKringleParticipant.findUnique({
      where: { participantId: participantId },
    });

    if (!participant || participant.krisKringleId !== krisKringleId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Participant not found',
      });
    }

    // Delete participant
    await prisma.krisKringleParticipant.delete({
      where: { participantId: participantId },
    });

    res.status(200).json({
      success: true,
      message: 'Participant removed successfully',
    });
  } catch (error) {
    console.error('Remove participant error:', error);
    res.status(500).json({
      error: 'Failed to remove participant',
      message: error.message,
    });
  }
}

/**
 * Helper function to verify participant access via passcode
 * @param {string} webToken - The SS event web token
 * @param {string} email - Participant email
 * @param {string} passcode - Participant passcode
 * @returns {Object} { krisKringle, participant } or throws error
 */
async function verifyParticipantAccess(webToken, email, passcode) {
  const krisKringle = await prisma.krisKringle.findUnique({
    where: { webToken: webToken },
    include: {
      participants: {
        include: {
          ssGiftRegistry: {
            include: {
              items: {
                orderBy: { displayOrder: 'asc' },
              },
            },
          },
        },
      },
      matches: true,
      giftRegistries: {
        include: {
          items: {
            orderBy: { displayOrder: 'asc' },
          },
        },
      },
    },
  });

  if (!krisKringle || krisKringle.isHidden) {
    const error = new Error('Secret Santa event not found');
    error.status = 404;
    throw error;
  }

  const participant = krisKringle.participants.find(
    p => p.email.toLowerCase() === email.toLowerCase() && p.passcode.toUpperCase() === passcode.toUpperCase()
  );

  if (!participant) {
    const error = new Error('Invalid email or access code');
    error.status = 401;
    throw error;
  }

  return { krisKringle, participant };
}

/**
 * Get full Secret Santa data for authenticated participant
 * POST /secret-santa/:webToken/data
 *
 * Returns event details, all participant registries, and the current participant's match
 */
async function getSecretSantaData(req, res) {
  try {
    const { webToken } = req.params;
    const { email, passcode } = req.body;

    if (!email || !passcode) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email and passcode are required',
      });
    }

    const { krisKringle, participant } = await verifyParticipantAccess(webToken, email, passcode);

    // Get the participant's match (who they're buying for)
    const match = krisKringle.matches.find(m => m.giverId === participant.participantId);
    const receiver = match ? krisKringle.participants.find(p => p.participantId === match.receiverId) : null;

    // Build all gift registries list (from all participants' SS registries)
    // Note: Hide isPurchased from the registry owner so they don't see what's being bought for them
    const giftRegistries = krisKringle.participants
      .filter(p => p.ssGiftRegistry)
      .map(p => {
        const isOwnRegistry = p.participantId === participant.participantId;
        return {
          registryId: p.ssGiftRegistry.registryId,
          participantId: p.participantId,
          participantName: p.name,
          name: p.ssGiftRegistry.name,
          type: 'secret-santa',
          isOwn: isOwnRegistry,
          items: p.ssGiftRegistry.items.map(item => ({
            itemId: item.itemId,
            title: item.title,
            link: item.link,
            photoUrl: item.photoUrl,
            cost: item.cost,
            description: item.description,
            // Hide purchased status from owner
            isPurchased: isOwnRegistry ? false : item.isPurchased,
          })),
        };
      });

    // Get group member IDs for participants who are group members
    const groupMemberIds = krisKringle.participants
      .filter(p => p.groupMemberId)
      .map(p => p.groupMemberId);

    // Fetch group gift registries created by participants who are group members
    const groupGiftRegistries = groupMemberIds.length > 0 ? await prisma.giftRegistry.findMany({
      where: {
        groupId: krisKringle.groupId,
        creatorId: { in: groupMemberIds },
      },
      include: {
        creator: {
          select: {
            groupMemberId: true,
            displayName: true,
          },
        },
        items: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    }) : [];

    // Create a map of groupMemberId to participant for easy lookup
    const groupMemberToParticipant = {};
    krisKringle.participants.forEach(p => {
      if (p.groupMemberId) {
        groupMemberToParticipant[p.groupMemberId] = p;
      }
    });

    // Add group gift registries to the list
    groupGiftRegistries.forEach(registry => {
      const participantInfo = groupMemberToParticipant[registry.creatorId];
      if (participantInfo) {
        const isOwnRegistry = participantInfo.participantId === participant.participantId;
        giftRegistries.push({
          registryId: registry.registryId,
          participantId: participantInfo.participantId,
          participantName: participantInfo.name,
          name: registry.name,
          type: 'group',
          webToken: registry.webToken,
          isOwn: isOwnRegistry,
          items: registry.items.map(item => ({
            itemId: item.itemId,
            title: item.title,
            link: item.link,
            photoUrl: item.photoUrl,
            cost: item.cost,
            description: item.description,
            // Hide purchased status from owner
            isPurchased: isOwnRegistry ? false : item.isPurchased,
          })),
        });
      }
    });

    // Fetch personal gift registries linked to the group by participants who are group members
    const personalRegistryLinks = groupMemberIds.length > 0 ? await prisma.personalGiftRegistryGroupLink.findMany({
      where: {
        groupId: krisKringle.groupId,
        linkedBy: { in: groupMemberIds },
      },
      include: {
        registry: {
          include: {
            items: {
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
        linker: {
          select: {
            groupMemberId: true,
            displayName: true,
          },
        },
      },
    }) : [];

    // Add linked personal gift registries to the list
    personalRegistryLinks.forEach(link => {
      const participantInfo = groupMemberToParticipant[link.linkedBy];
      if (participantInfo && link.registry) {
        const isOwnRegistry = participantInfo.participantId === participant.participantId;
        giftRegistries.push({
          registryId: link.registry.registryId,
          participantId: participantInfo.participantId,
          participantName: participantInfo.name,
          name: link.registry.name,
          type: 'personal',
          webToken: link.registry.webToken,
          isOwn: isOwnRegistry,
          items: link.registry.items.map(item => ({
            itemId: item.itemId,
            title: item.title,
            link: item.link,
            photoUrl: item.photoUrl,
            cost: item.cost,
            description: item.description,
            // Hide purchased status from owner
            isPurchased: isOwnRegistry ? false : item.isPurchased,
          })),
        });
      }
    });

    res.status(200).json({
      success: true,
      event: {
        name: krisKringle.name,
        occasion: krisKringle.occasion,
        exchangeDate: krisKringle.exchangeDate,
        priceLimit: krisKringle.priceLimit,
        isAssigned: krisKringle.isAssigned,
      },
      currentParticipant: {
        participantId: participant.participantId,
        name: participant.name,
        email: participant.email,
        isGroupMember: !!participant.groupMemberId,
        hasGiftRegistry: !!participant.ssGiftRegistry,
        giftRegistryId: participant.ssGiftRegistry?.registryId || null,
      },
      match: match && receiver ? {
        name: receiver.name,
        hasGiftRegistry: !!receiver.ssGiftRegistry,
        giftRegistryId: receiver.ssGiftRegistry?.registryId || null,
      } : null,
      giftRegistries: giftRegistries,
      participants: krisKringle.participants.map(p => ({
        participantId: p.participantId,
        name: p.name,
        hasGiftRegistry: !!p.ssGiftRegistry,
      })),
    });
  } catch (error) {
    console.error('Get Secret Santa data error:', error);
    res.status(error.status || 500).json({
      error: 'Failed to get Secret Santa data',
      message: error.message,
    });
  }
}

/**
 * Create or get a gift registry for a participant
 * POST /secret-santa/:webToken/registry
 */
async function createParticipantRegistry(req, res) {
  try {
    const { webToken } = req.params;
    const { email, passcode, name } = req.body;

    if (!email || !passcode) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email and passcode are required',
      });
    }

    const { krisKringle, participant } = await verifyParticipantAccess(webToken, email, passcode);

    // Check if participant already has a registry
    if (participant.ssGiftRegistry) {
      return res.status(200).json({
        success: true,
        message: 'Registry already exists',
        registry: {
          registryId: participant.ssGiftRegistry.registryId,
          name: participant.ssGiftRegistry.name,
          items: participant.ssGiftRegistry.items,
        },
      });
    }

    // Create new registry
    const registryName = name || `${participant.name}'s Gift Ideas`;
    const registry = await prisma.secretSantaGiftRegistry.create({
      data: {
        krisKringleId: krisKringle.krisKringleId,
        name: registryName,
      },
    });

    // Link registry to participant
    await prisma.krisKringleParticipant.update({
      where: { participantId: participant.participantId },
      data: { ssGiftRegistryId: registry.registryId },
    });

    res.status(201).json({
      success: true,
      message: 'Gift registry created',
      registry: {
        registryId: registry.registryId,
        name: registry.name,
        items: [],
      },
    });
  } catch (error) {
    console.error('Create participant registry error:', error);
    res.status(error.status || 500).json({
      error: 'Failed to create gift registry',
      message: error.message,
    });
  }
}

/**
 * Add item to participant's gift registry
 * POST /secret-santa/:webToken/registry/:registryId/items
 */
async function addRegistryItem(req, res) {
  try {
    const { webToken, registryId } = req.params;
    const { email, passcode, title, link, photoUrl, cost, description } = req.body;

    if (!email || !passcode) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email and passcode are required',
      });
    }

    if (!title) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Title is required',
      });
    }

    const { participant } = await verifyParticipantAccess(webToken, email, passcode);

    // Verify the participant owns this registry
    if (participant.ssGiftRegistryId !== registryId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only add items to your own registry',
      });
    }

    // Get current max display order
    const maxOrder = await prisma.secretSantaGiftItem.aggregate({
      where: { registryId: registryId },
      _max: { displayOrder: true },
    });

    const item = await prisma.secretSantaGiftItem.create({
      data: {
        registryId: registryId,
        title: title.trim(),
        link: link?.trim() || null,
        photoUrl: photoUrl?.trim() || null,
        cost: cost ? parseFloat(cost) : null,
        description: description?.trim() || null,
        displayOrder: (maxOrder._max.displayOrder || 0) + 1,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Item added to registry',
      item: item,
    });
  } catch (error) {
    console.error('Add registry item error:', error);
    res.status(error.status || 500).json({
      error: 'Failed to add item',
      message: error.message,
    });
  }
}

/**
 * Update item in participant's gift registry
 * PUT /secret-santa/:webToken/registry/:registryId/items/:itemId
 */
async function updateRegistryItem(req, res) {
  try {
    const { webToken, registryId, itemId } = req.params;
    const { email, passcode, title, link, photoUrl, cost, description } = req.body;

    if (!email || !passcode) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email and passcode are required',
      });
    }

    const { participant } = await verifyParticipantAccess(webToken, email, passcode);

    // Verify the participant owns this registry
    if (participant.ssGiftRegistryId !== registryId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only update items in your own registry',
      });
    }

    // Verify item exists and belongs to this registry
    const existingItem = await prisma.secretSantaGiftItem.findUnique({
      where: { itemId: itemId },
    });

    if (!existingItem || existingItem.registryId !== registryId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Item not found',
      });
    }

    const item = await prisma.secretSantaGiftItem.update({
      where: { itemId: itemId },
      data: {
        title: title?.trim() || existingItem.title,
        link: link !== undefined ? (link?.trim() || null) : existingItem.link,
        photoUrl: photoUrl !== undefined ? (photoUrl?.trim() || null) : existingItem.photoUrl,
        cost: cost !== undefined ? (cost ? parseFloat(cost) : null) : existingItem.cost,
        description: description !== undefined ? (description?.trim() || null) : existingItem.description,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Item updated',
      item: item,
    });
  } catch (error) {
    console.error('Update registry item error:', error);
    res.status(error.status || 500).json({
      error: 'Failed to update item',
      message: error.message,
    });
  }
}

/**
 * Delete item from participant's gift registry
 * DELETE /secret-santa/:webToken/registry/:registryId/items/:itemId
 */
async function deleteRegistryItem(req, res) {
  try {
    const { webToken, registryId, itemId } = req.params;
    const { email, passcode } = req.body;

    if (!email || !passcode) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email and passcode are required',
      });
    }

    const { participant } = await verifyParticipantAccess(webToken, email, passcode);

    // Verify the participant owns this registry
    if (participant.ssGiftRegistryId !== registryId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only delete items from your own registry',
      });
    }

    // Verify item exists and belongs to this registry
    const existingItem = await prisma.secretSantaGiftItem.findUnique({
      where: { itemId: itemId },
    });

    if (!existingItem || existingItem.registryId !== registryId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Item not found',
      });
    }

    await prisma.secretSantaGiftItem.delete({
      where: { itemId: itemId },
    });

    res.status(200).json({
      success: true,
      message: 'Item deleted',
    });
  } catch (error) {
    console.error('Delete registry item error:', error);
    res.status(error.status || 500).json({
      error: 'Failed to delete item',
      message: error.message,
    });
  }
}

/**
 * Mark an item as purchased (by another participant)
 * POST /secret-santa/:webToken/registry/:registryId/items/:itemId/purchase
 */
async function markItemPurchased(req, res) {
  try {
    const { webToken, registryId, itemId } = req.params;
    const { email, passcode, isPurchased } = req.body;

    if (!email || !passcode) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email and passcode are required',
      });
    }

    const { participant } = await verifyParticipantAccess(webToken, email, passcode);

    // Verify item exists
    const existingItem = await prisma.secretSantaGiftItem.findUnique({
      where: { itemId: itemId },
      include: {
        registry: true,
      },
    });

    if (!existingItem || existingItem.registryId !== registryId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Item not found',
      });
    }

    // Don't allow marking your own items as purchased
    if (participant.ssGiftRegistryId === registryId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You cannot mark your own items as purchased',
      });
    }

    const item = await prisma.secretSantaGiftItem.update({
      where: { itemId: itemId },
      data: {
        isPurchased: isPurchased !== false,
        purchasedAt: isPurchased !== false ? new Date() : null,
      },
    });

    res.status(200).json({
      success: true,
      message: isPurchased !== false ? 'Item marked as purchased' : 'Purchase removed',
      item: item,
    });
  } catch (error) {
    console.error('Mark item purchased error:', error);
    res.status(error.status || 500).json({
      error: 'Failed to update item',
      message: error.message,
    });
  }
}

module.exports = {
  getKrisKringles,
  getKrisKringle,
  createKrisKringle,
  updateKrisKringle,
  generateKrisKringleMatches,
  getMyMatch,
  deleteKrisKringle,
  addParticipant,
  removeParticipant,
  resendParticipantEmail,
  verifySecretSantaAccess,
  getSecretSantaPublic,
  // Public Secret Santa site endpoints
  getSecretSantaData,
  createParticipantRegistry,
  addRegistryItem,
  updateRegistryItem,
  deleteRegistryItem,
  markItemPurchased,
};
