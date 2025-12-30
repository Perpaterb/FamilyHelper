/**
 * Wiki Controller
 *
 * Handles wiki document CRUD operations within groups.
 */

const { prisma } = require('../config/database');
const { isGroupReadOnly, getReadOnlyErrorResponse } = require('../utils/permissions');

/**
 * Get all wiki documents for a group
 * GET /groups/:groupId/wiki-documents
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getWikiDocuments(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;
    const { search } = req.query;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check membership
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId,
        userId,
        isRegistered: true,
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    const userRole = membership.role;

    // Get group settings to check wiki visibility permissions
    const groupSettings = await prisma.groupSettings.findUnique({
      where: { groupId: groupId },
      select: {
        wikiVisibleToAdmins: true,
        wikiVisibleToParents: true,
        wikiVisibleToAdults: true,
        wikiVisibleToCaregivers: true,
        wikiVisibleToChildren: true,
      },
    });

    // Check if user has permission to view wiki
    let hasAccess = false;

    if (userRole === 'admin' && groupSettings?.wikiVisibleToAdmins) {
      hasAccess = true;
    } else if (userRole === 'parent' && groupSettings?.wikiVisibleToParents) {
      hasAccess = true;
    } else if (userRole === 'adult' && groupSettings?.wikiVisibleToAdults) {
      hasAccess = true;
    } else if (userRole === 'caregiver' && groupSettings?.wikiVisibleToCaregivers) {
      hasAccess = true;
    } else if (userRole === 'child' && groupSettings?.wikiVisibleToChildren) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to view wiki',
      });
    }

    // Build where clause
    const whereClause = {
      groupId,
      isHidden: false,
    };

    // Add search filter if provided
    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Fetch documents
    const documents = await prisma.wikiDocument.findMany({
      where: whereClause,
      include: {
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
      orderBy: { updatedAt: 'desc' },
    });

    // Merge user profile data with group member data
    const formattedDocuments = documents.map(doc => ({
      documentId: doc.documentId,
      title: doc.title,
      content: doc.content,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      creator: {
        groupMemberId: doc.creator.groupMemberId,
        displayName: doc.creator.user?.displayName || doc.creator.displayName,
        iconLetters: doc.creator.user?.memberIcon || doc.creator.iconLetters,
        iconColor: doc.creator.user?.iconColor || doc.creator.iconColor,
        profilePhotoUrl: doc.creator.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${doc.creator.user.profilePhotoFileId}`
          : null,
      },
    }));

    res.status(200).json({
      success: true,
      documents: formattedDocuments,
    });
  } catch (error) {
    console.error('Get wiki documents error:', error);
    res.status(500).json({
      error: 'Failed to get wiki documents',
      message: error.message,
    });
  }
}

/**
 * Get a specific wiki document
 * GET /groups/:groupId/wiki-documents/:documentId
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getWikiDocument(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, documentId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check membership
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId,
        userId,
        isRegistered: true,
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Fetch document
    const document = await prisma.wikiDocument.findFirst({
      where: {
        documentId,
        groupId,
        isHidden: false,
      },
      include: {
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
        revisions: {
          include: {
            editor: {
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
          orderBy: { editedAt: 'desc' },
          take: 10, // Last 10 revisions
        },
      },
    });

    if (!document) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Wiki document not found',
      });
    }

    // Format response
    const formattedDocument = {
      documentId: document.documentId,
      title: document.title,
      content: document.content,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      creator: {
        groupMemberId: document.creator.groupMemberId,
        displayName: document.creator.user?.displayName || document.creator.displayName,
        iconLetters: document.creator.user?.memberIcon || document.creator.iconLetters,
        iconColor: document.creator.user?.iconColor || document.creator.iconColor,
        profilePhotoUrl: document.creator.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${document.creator.user.profilePhotoFileId}`
          : null,
      },
      revisions: document.revisions.map(rev => ({
        revisionId: rev.revisionId,
        title: rev.title,
        editedAt: rev.editedAt,
        changeNote: rev.changeNote,
        editor: {
          groupMemberId: rev.editor.groupMemberId,
          displayName: rev.editor.user?.displayName || rev.editor.displayName,
          iconLetters: rev.editor.user?.memberIcon || rev.editor.iconLetters,
          iconColor: rev.editor.user?.iconColor || rev.editor.iconColor,
          profilePhotoUrl: rev.editor.user?.profilePhotoFileId
            ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${rev.editor.user.profilePhotoFileId}`
            : null,
        },
      })),
    };

    res.status(200).json({
      success: true,
      document: formattedDocument,
    });
  } catch (error) {
    console.error('Get wiki document error:', error);
    res.status(500).json({
      error: 'Failed to get wiki document',
      message: error.message,
    });
  }
}

/**
 * Create a new wiki document
 * POST /groups/:groupId/wiki-documents
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function createWikiDocument(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;
    const { title, content } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Validate input
    if (!title || title.trim() === '') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Title is required',
      });
    }

    // Check membership
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId,
        userId,
        isRegistered: true,
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

    // Create document
    const document = await prisma.wikiDocument.create({
      data: {
        groupId,
        title: title.trim(),
        content: content || '',
        createdBy: membership.groupMemberId,
      },
      include: {
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

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId,
        action: 'create_wiki_document',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'wiki',
        messageContent: `Created wiki document: ${title}`,
      },
    });

    const formattedDocument = {
      documentId: document.documentId,
      title: document.title,
      content: document.content,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      creator: {
        groupMemberId: document.creator.groupMemberId,
        displayName: document.creator.user?.displayName || document.creator.displayName,
        iconLetters: document.creator.user?.memberIcon || document.creator.iconLetters,
        iconColor: document.creator.user?.iconColor || document.creator.iconColor,
        profilePhotoUrl: document.creator.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${document.creator.user.profilePhotoFileId}`
          : null,
      },
    };

    res.status(201).json({
      success: true,
      document: formattedDocument,
    });
  } catch (error) {
    console.error('Create wiki document error:', error);
    res.status(500).json({
      error: 'Failed to create wiki document',
      message: error.message,
    });
  }
}

/**
 * Update a wiki document
 * PUT /groups/:groupId/wiki-documents/:documentId
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function updateWikiDocument(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, documentId } = req.params;
    const { title, content, changeNote } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Validate input
    if (!title || title.trim() === '') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Title is required',
      });
    }

    // Check membership
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId,
        userId,
        isRegistered: true,
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

    // Check document exists
    const existingDocument = await prisma.wikiDocument.findFirst({
      where: {
        documentId,
        groupId,
        isHidden: false,
      },
    });

    if (!existingDocument) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Wiki document not found',
      });
    }

    // Create revision of old content before updating
    await prisma.wikiRevision.create({
      data: {
        documentId,
        title: existingDocument.title,
        content: existingDocument.content,
        editedBy: membership.groupMemberId,
        changeNote: changeNote || null,
      },
    });

    // Update document
    const document = await prisma.wikiDocument.update({
      where: { documentId },
      data: {
        title: title.trim(),
        content: content || '',
      },
      include: {
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

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId,
        action: 'update_wiki_document',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'wiki',
        messageContent: `Updated wiki document: ${title}`,
      },
    });

    const formattedDocument = {
      documentId: document.documentId,
      title: document.title,
      content: document.content,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      creator: {
        groupMemberId: document.creator.groupMemberId,
        displayName: document.creator.user?.displayName || document.creator.displayName,
        iconLetters: document.creator.user?.memberIcon || document.creator.iconLetters,
        iconColor: document.creator.user?.iconColor || document.creator.iconColor,
        profilePhotoUrl: document.creator.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${document.creator.user.profilePhotoFileId}`
          : null,
      },
    };

    res.status(200).json({
      success: true,
      document: formattedDocument,
    });
  } catch (error) {
    console.error('Update wiki document error:', error);
    res.status(500).json({
      error: 'Failed to update wiki document',
      message: error.message,
    });
  }
}

/**
 * Delete a wiki document (soft delete)
 * DELETE /groups/:groupId/wiki-documents/:documentId
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function deleteWikiDocument(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, documentId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check membership
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId,
        userId,
        isRegistered: true,
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

    // Check document exists
    const document = await prisma.wikiDocument.findFirst({
      where: {
        documentId,
        groupId,
        isHidden: false,
      },
    });

    if (!document) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Wiki document not found',
      });
    }

    // Only creator or admin can delete
    const isCreator = document.createdBy === membership.groupMemberId;
    const isAdmin = membership.role === 'admin';

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the creator or an admin can delete this document',
      });
    }

    // Soft delete
    await prisma.wikiDocument.update({
      where: { documentId },
      data: { isHidden: true },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId,
        action: 'delete_wiki_document',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'wiki',
        messageContent: `Deleted wiki document: ${document.title}`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Wiki document deleted successfully',
    });
  } catch (error) {
    console.error('Delete wiki document error:', error);
    res.status(500).json({
      error: 'Failed to delete wiki document',
      message: error.message,
    });
  }
}

/**
 * Search wiki documents
 * GET /groups/:groupId/wiki-documents/search
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function searchWikiDocuments(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;
    const { q } = req.query;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    if (!q || q.trim() === '') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Search query is required',
      });
    }

    // Check membership
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId,
        userId,
        isRegistered: true,
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not a member of this group',
      });
    }

    // Search in title and content
    const documents = await prisma.wikiDocument.findMany({
      where: {
        groupId,
        isHidden: false,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { content: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: {
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
      orderBy: { updatedAt: 'desc' },
    });

    const formattedDocuments = documents.map(doc => ({
      documentId: doc.documentId,
      title: doc.title,
      content: doc.content,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      creator: {
        groupMemberId: doc.creator.groupMemberId,
        displayName: doc.creator.user?.displayName || doc.creator.displayName,
        iconLetters: doc.creator.user?.memberIcon || doc.creator.iconLetters,
        iconColor: doc.creator.user?.iconColor || doc.creator.iconColor,
        profilePhotoUrl: doc.creator.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${doc.creator.user.profilePhotoFileId}`
          : null,
      },
    }));

    res.status(200).json({
      success: true,
      documents: formattedDocuments,
      query: q,
    });
  } catch (error) {
    console.error('Search wiki documents error:', error);
    res.status(500).json({
      error: 'Failed to search wiki documents',
      message: error.message,
    });
  }
}

module.exports = {
  getWikiDocuments,
  getWikiDocument,
  createWikiDocument,
  updateWikiDocument,
  deleteWikiDocument,
  searchWikiDocuments,
};
