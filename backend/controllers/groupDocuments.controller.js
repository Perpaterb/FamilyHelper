/**
 * Group Documents Controller
 *
 * Handles secure document storage for groups.
 * Features: upload, download, list, hide/unhide documents.
 */

const { prisma } = require('../config/database');
const { isGroupReadOnly, getReadOnlyErrorResponse } = require('../utils/permissions');

/**
 * Get all documents for a group
 * GET /groups/:groupId/documents
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getDocuments(req, res) {
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

    const userRole = membership.role;
    const isAdmin = userRole === 'admin';

    // Get group settings to check documents visibility permissions
    const groupSettings = await prisma.groupSettings.findUnique({
      where: { groupId: groupId },
      select: {
        documentsVisibleToAdmins: true,
        documentsVisibleToParents: true,
        documentsVisibleToAdults: true,
        documentsVisibleToCaregivers: true,
        documentsVisibleToChildren: true,
      },
    });

    // Check if user has permission to view documents
    let hasAccess = false;

    if (userRole === 'admin' && groupSettings?.documentsVisibleToAdmins) {
      hasAccess = true;
    } else if (userRole === 'parent' && groupSettings?.documentsVisibleToParents) {
      hasAccess = true;
    } else if (userRole === 'adult' && groupSettings?.documentsVisibleToAdults) {
      hasAccess = true;
    } else if (userRole === 'caregiver' && groupSettings?.documentsVisibleToCaregivers) {
      hasAccess = true;
    } else if (userRole === 'child' && groupSettings?.documentsVisibleToChildren) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to view documents',
      });
    }

    // Get documents (admins with visibility can see hidden documents)
    const canSeeHidden = isAdmin && groupSettings?.documentsVisibleToAdmins;
    const documents = await prisma.groupDocument.findMany({
      where: {
        groupId: groupId,
        ...(canSeeHidden ? {} : { isHidden: false }),
      },
      include: {
        uploader: {
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
        hider: {
          select: {
            displayName: true,
          },
        },
      },
      orderBy: {
        uploadedAt: 'desc',
      },
    });

    // Format response with user profile data
    const formattedDocuments = documents.map(doc => ({
      documentId: doc.documentId,
      fileName: doc.fileName,
      fileId: doc.fileId,
      fileSizeBytes: Number(doc.fileSizeBytes),
      mimeType: doc.mimeType,
      uploadedAt: doc.uploadedAt,
      isHidden: doc.isHidden,
      hiddenAt: doc.hiddenAt,
      hiddenByName: doc.hider?.displayName || null,
      uploader: {
        groupMemberId: doc.uploader.groupMemberId,
        displayName: doc.uploader.user?.displayName || doc.uploader.displayName,
        iconLetters: doc.uploader.user?.memberIcon || doc.uploader.iconLetters,
        iconColor: doc.uploader.user?.iconColor || doc.uploader.iconColor,
        profilePhotoUrl: doc.uploader.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${doc.uploader.user.profilePhotoFileId}`
          : null,
      },
    }));

    res.status(200).json({
      success: true,
      documents: formattedDocuments,
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      error: 'Failed to get documents',
      message: error.message,
    });
  }
}

/**
 * Upload a document to a group
 * POST /groups/:groupId/documents
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function uploadDocument(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;
    const { fileName, fileId, fileSizeBytes, mimeType } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Validate required fields
    if (!fileName || !fileId || !fileSizeBytes || !mimeType) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'fileName, fileId, fileSizeBytes, and mimeType are required',
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

    // Supervisors cannot upload documents
    if (membership.role === 'supervisor') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Supervisors cannot upload documents',
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

    // Create the document record
    const document = await prisma.groupDocument.create({
      data: {
        groupId: groupId,
        fileName: fileName,
        fileId: fileId,
        fileSizeBytes: BigInt(fileSizeBytes),
        mimeType: mimeType,
        uploadedBy: membership.groupMemberId,
      },
      include: {
        uploader: {
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
        action: 'upload_document',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'documents',
        messageContent: `Uploaded document "${fileName}" (${(fileSizeBytes / 1024).toFixed(1)} KB)`,
      },
    });

    res.status(201).json({
      success: true,
      document: {
        documentId: document.documentId,
        fileName: document.fileName,
        fileId: document.fileId,
        fileSizeBytes: Number(document.fileSizeBytes),
        mimeType: document.mimeType,
        uploadedAt: document.uploadedAt,
        isHidden: document.isHidden,
        uploader: {
          groupMemberId: document.uploader.groupMemberId,
          displayName: document.uploader.user?.displayName || document.uploader.displayName,
          iconLetters: document.uploader.user?.memberIcon || document.uploader.iconLetters,
          iconColor: document.uploader.user?.iconColor || document.uploader.iconColor,
          profilePhotoUrl: document.uploader.user?.profilePhotoFileId
            ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${document.uploader.user.profilePhotoFileId}`
            : null,
        },
      },
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({
      error: 'Failed to upload document',
      message: error.message,
    });
  }
}

/**
 * Download a document (returns file info for client to fetch)
 * GET /groups/:groupId/documents/:documentId
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getDocument(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, documentId } = req.params;

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

    const isAdmin = membership.role === 'admin';

    // Get the document
    const document = await prisma.groupDocument.findUnique({
      where: {
        documentId: documentId,
      },
      include: {
        uploader: {
          select: {
            displayName: true,
          },
        },
      },
    });

    if (!document) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Document not found',
      });
    }

    // Check if document belongs to this group
    if (document.groupId !== groupId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Document does not belong to this group',
      });
    }

    // Non-admins cannot access hidden documents
    if (document.isHidden && !isAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This document is hidden',
      });
    }

    // Create audit log for download
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'download_document',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'documents',
        messageContent: `Downloaded document "${document.fileName}"`,
      },
    });

    // Construct download URL from fileId
    const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const downloadUrl = `${baseUrl}/files/${document.fileId}`;

    res.status(200).json({
      success: true,
      document: {
        documentId: document.documentId,
        fileName: document.fileName,
        fileId: document.fileId,
        fileSizeBytes: Number(document.fileSizeBytes),
        mimeType: document.mimeType,
        uploadedAt: document.uploadedAt,
        uploaderName: document.uploader.displayName,
        downloadUrl: downloadUrl,
      },
    });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({
      error: 'Failed to get document',
      message: error.message,
    });
  }
}

/**
 * Hide a document (admin only)
 * PUT /groups/:groupId/documents/:documentId/hide
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function hideDocument(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, documentId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is an admin of this group
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

    if (membership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admins can hide documents',
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

    // Get the document
    const document = await prisma.groupDocument.findUnique({
      where: {
        documentId: documentId,
      },
    });

    if (!document) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Document not found',
      });
    }

    // Check if document belongs to this group
    if (document.groupId !== groupId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Document does not belong to this group',
      });
    }

    // Hide the document
    await prisma.groupDocument.update({
      where: {
        documentId: documentId,
      },
      data: {
        isHidden: true,
        hiddenAt: new Date(),
        hiddenBy: membership.groupMemberId,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'hide_document',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'documents',
        messageContent: `Hidden document "${document.fileName}"`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Document hidden successfully',
    });
  } catch (error) {
    console.error('Hide document error:', error);
    res.status(500).json({
      error: 'Failed to hide document',
      message: error.message,
    });
  }
}

/**
 * Unhide a document (admin only)
 * PUT /groups/:groupId/documents/:documentId/unhide
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function unhideDocument(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, documentId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is an admin of this group
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

    if (membership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admins can unhide documents',
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

    // Get the document
    const document = await prisma.groupDocument.findUnique({
      where: {
        documentId: documentId,
      },
    });

    if (!document) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Document not found',
      });
    }

    // Check if document belongs to this group
    if (document.groupId !== groupId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Document does not belong to this group',
      });
    }

    // Unhide the document
    await prisma.groupDocument.update({
      where: {
        documentId: documentId,
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
        action: 'unhide_document',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'documents',
        messageContent: `Unhidden document "${document.fileName}"`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Document unhidden successfully',
    });
  } catch (error) {
    console.error('Unhide document error:', error);
    res.status(500).json({
      error: 'Failed to unhide document',
      message: error.message,
    });
  }
}

/**
 * Delete a document (admin only)
 * DELETE /groups/:groupId/documents/:documentId
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function deleteDocument(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, documentId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is an admin of this group
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

    if (membership.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admins can delete documents',
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

    // Get the document
    const document = await prisma.groupDocument.findUnique({
      where: {
        documentId: documentId,
      },
    });

    if (!document) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Document not found',
      });
    }

    // Check if document belongs to this group
    if (document.groupId !== groupId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Document does not belong to this group',
      });
    }

    // Delete the document
    await prisma.groupDocument.delete({
      where: {
        documentId: documentId,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'delete_document',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'documents',
        messageContent: `Deleted document "${document.fileName}"`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      error: 'Failed to delete document',
      message: error.message,
    });
  }
}

module.exports = {
  getDocuments,
  uploadDocument,
  getDocument,
  hideDocument,
  unhideDocument,
  deleteDocument,
};
