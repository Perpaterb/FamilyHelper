/**
 * Logs Controller
 *
 * Handles audit log export operations.
 * When exporting messages, all encrypted content must be decrypted for admin review.
 */

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const encryptionService = require('../services/encryption.service');
const pdfService = require('../services/pdf.service');
const { prisma } = require('../config/database');
const pushNotificationService = require('../services/pushNotification.service');

/**
 * Get audit logs for a group
 * GET /logs/groups/:groupId
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getAuditLogs(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Filter parameters
    const { actions, users, fromDate, toDate } = req.query;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is admin of this group
    const groupMember = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
        role: 'admin',
      },
    });

    if (!groupMember) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You must be an admin of this group to view audit logs',
      });
    }

    // Build where clause with filters
    const whereClause = { groupId: groupId };

    // Filter by actions (comma-separated string)
    if (actions && actions.trim()) {
      const actionsList = actions.split(',').map(a => a.trim()).filter(Boolean);
      if (actionsList.length > 0) {
        whereClause.action = { in: actionsList };
      }
    }

    // Filter by users (comma-separated emails)
    if (users && users.trim()) {
      const usersList = users.split(',').map(u => u.trim()).filter(Boolean);
      if (usersList.length > 0) {
        whereClause.performedByEmail = { in: usersList };
      }
    }

    // Filter by date range
    if (fromDate || toDate) {
      whereClause.performedAt = {};
      if (fromDate) {
        whereClause.performedAt.gte = new Date(fromDate);
      }
      if (toDate) {
        // Add 1 day to toDate to include the entire day
        const endDate = new Date(toDate);
        endDate.setDate(endDate.getDate() + 1);
        whereClause.performedAt.lt = endDate;
      }
    }

    // Get total count for pagination (with filters)
    const totalLogs = await prisma.auditLog.count({
      where: whereClause,
    });

    // Get logs with pagination and filters
    const logs = await prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { performedAt: 'desc' },
      skip: skip,
      take: limit,
      select: {
        logId: true,
        action: true,
        actionLocation: true,
        performedByName: true,
        performedByEmail: true,
        performedAt: true,
        messageContent: true,
        mediaLinks: true,
      },
    });

    // Map the response to match frontend expectations
    // Decrypt message content if it contains encrypted messages
    const formattedLogs = logs.map(log => {
      let messageContent = log.messageContent || '';

      // Check if this is a message-related action that might contain encrypted content
      if (log.action === 'send_message' || log.action === 'edit_message') {
        // Try to find and decrypt encrypted message content
        // Format: 'Sent message: "encrypted_text"' or 'Edited message from "old" to "new"'
        const messageMatch = messageContent.match(/"([^"]+)"/g);
        if (messageMatch) {
          messageMatch.forEach(encryptedMsg => {
            const encrypted = encryptedMsg.slice(1, -1); // Remove quotes
            if (encryptionService.isEncrypted(encrypted)) {
              try {
                const decrypted = encryptionService.decrypt(encrypted);
                messageContent = messageContent.replace(encryptedMsg, `"${decrypted}"`);
              } catch (err) {
                console.error('Failed to decrypt message in audit log:', err);
                // Keep original if decryption fails
              }
            }
          });
        }
      } else if (log.action === 'read_messages') {
        // For read_messages, the format is: 'Read message: "encrypted"' or 'Read X messages. Message IDs: ...'
        // Only decrypt if it contains actual message content
        const messageMatch = messageContent.match(/Read message: "([^"]+)"/);
        if (messageMatch && messageMatch[1]) {
          const encrypted = messageMatch[1];
          if (encryptionService.isEncrypted(encrypted)) {
            try {
              const decrypted = encryptionService.decrypt(encrypted);
              messageContent = messageContent.replace(`"${encrypted}"`, `"${decrypted}"`);
            } catch (err) {
              console.error('Failed to decrypt message in audit log:', err);
            }
          }
        }
      }

      return {
        logId: log.logId,
        action: log.action,
        actionLocation: log.actionLocation || 'Unknown',
        performedByName: log.performedByName || 'Unknown',
        performedByEmail: log.performedByEmail,
        createdAt: log.performedAt,
        messageContent: messageContent,
        mediaLinks: log.mediaLinks || [],
      };
    });

    res.status(200).json({
      success: true,
      logs: formattedLogs,
      pagination: {
        page: page,
        limit: limit,
        total: totalLogs,
        totalPages: Math.ceil(totalLogs / limit),
      },
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      error: 'Failed to get audit logs',
      message: error.message,
    });
  }
}

/**
 * Request a new log export
 * POST /logs/exports
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function requestExport(req, res) {
  try {
    const { prisma } = require('../config/database');
    const userId = req.user?.userId;
    const { groupId, password } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Validate required fields
    if (!groupId || !password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'groupId and password are required',
      });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Password must be at least 8 characters',
      });
    }

    // Check if user is admin of this group
    const groupMember = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
        role: 'admin',
      },
      include: {
        group: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!groupMember) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You must be an admin of this group to export logs',
      });
    }

    // Create export request
    // For now, we'll store this in a simple JSON file
    // In production, this would be in a database table
    const exportId = uuidv4();
    const exportRequest = {
      exportId: exportId,
      groupId: groupId,
      groupName: groupMember.group.name,
      userId: userId,
      requestedAt: new Date().toISOString(),
      status: 'pending', // pending, processing, completed, failed
      password: password, // In production, this should be hashed
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    };

    // Store export request (simplified for local development)
    const exportsDir = path.join(__dirname, '../uploads/exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const exportFilePath = path.join(exportsDir, `${exportId}.json`);
    fs.writeFileSync(exportFilePath, JSON.stringify(exportRequest, null, 2));

    // In production, trigger background job to process export
    // IMPORTANT: When exporting messages, use encryptionService.decrypt() to decrypt
    // all message content so admins can read them in the export ZIP file
    // For now, we'll just mark it as completed immediately for testing
    setTimeout(() => {
      try {
        const request = JSON.parse(fs.readFileSync(exportFilePath, 'utf8'));
        request.status = 'completed';
        fs.writeFileSync(exportFilePath, JSON.stringify(request, null, 2));
      } catch (err) {
        console.error('Failed to update export status:', err);
      }
    }, 2000); // Simulate processing delay

    res.status(201).json({
      success: true,
      exportId: exportId,
      message: 'Export request created. You will receive an email when it is ready.',
    });
  } catch (error) {
    console.error('Request export error:', error);
    res.status(500).json({
      error: 'Failed to request export',
      message: error.message,
    });
  }
}

/**
 * Get all export requests for the user
 * GET /logs/exports
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getExports(req, res) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Read all export requests for this user
    const exportsDir = path.join(__dirname, '../uploads/exports');

    if (!fs.existsSync(exportsDir)) {
      return res.status(200).json({
        success: true,
        exports: [],
      });
    }

    const files = fs.readdirSync(exportsDir);
    const exports = files
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(exportsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
      })
      .filter(exp => exp.userId === userId)
      .map(exp => ({
        exportId: exp.exportId,
        groupName: exp.groupName,
        requestedAt: exp.requestedAt,
        status: exp.status,
        expiresAt: exp.expiresAt,
      }))
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

    res.status(200).json({
      success: true,
      exports: exports,
    });
  } catch (error) {
    console.error('Get exports error:', error);
    res.status(500).json({
      error: 'Failed to get exports',
      message: error.message,
    });
  }
}

/**
 * Download a completed export
 * GET /logs/exports/:id/download
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function downloadExport(req, res) {
  try {
    const userId = req.user?.userId;
    const exportId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Read export request
    const exportFilePath = path.join(__dirname, '../uploads/exports', `${exportId}.json`);

    if (!fs.existsSync(exportFilePath)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Export not found',
      });
    }

    const exportRequest = JSON.parse(fs.readFileSync(exportFilePath, 'utf8'));

    // Check if user owns this export
    if (exportRequest.userId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to download this export',
      });
    }

    // Check if export is completed
    if (exportRequest.status !== 'completed') {
      return res.status(404).json({
        error: 'Not Found',
        message: `Export is ${exportRequest.status}. Please wait for it to complete.`,
      });
    }

    // Check if export has expired
    if (new Date(exportRequest.expiresAt) < new Date()) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Export has expired',
      });
    }

    // For local development, create a dummy ZIP file
    // In production, this would be a real password-protected ZIP with audit logs
    const dummyZipContent = Buffer.from(`Audit logs for ${exportRequest.groupName}\nRequested at: ${exportRequest.requestedAt}\nPassword protected with: ${exportRequest.password}`);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${exportId}.zip"`);
    res.send(dummyZipContent);
  } catch (error) {
    console.error('Download export error:', error);
    res.status(500).json({
      error: 'Failed to download export',
      message: error.message,
    });
  }
}

/**
 * Export audit logs as PDF
 * POST /logs/:groupId/export
 *
 * Generates a PDF export of audit logs with applied filters
 * and stores the export metadata in the database.
 *
 * @param {Object} req - Express request
 * @param {Object} req.body.filters - Filter parameters
 * @param {Date} [req.body.filters.dateFrom] - Start date filter
 * @param {Date} [req.body.filters.dateTo] - End date filter
 * @param {string[]} [req.body.filters.actionTypes] - Array of action types
 * @param {string[]} [req.body.filters.userIds] - Array of group member IDs
 * @param {Object} res - Express response
 */
async function exportLogsAsPDF(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;
    const { filters = {} } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is admin of this group
    const groupMember = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
        role: 'admin',
      },
      include: {
        group: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!groupMember) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You must be an admin of this group to export logs',
      });
    }

    const groupName = groupMember.group.name;

    // Build filter conditions for Prisma query
    const whereConditions = {
      groupId: groupId,
    };

    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      whereConditions.performedAt = {};
      if (filters.dateFrom) {
        whereConditions.performedAt.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        whereConditions.performedAt.lte = new Date(filters.dateTo);
      }
    }

    // Action types filter
    if (filters.actionTypes && filters.actionTypes.length > 0) {
      whereConditions.action = {
        in: filters.actionTypes,
      };
    }

    // Users filter
    if (filters.userIds && filters.userIds.length > 0) {
      whereConditions.performedBy = {
        in: filters.userIds,
      };
    }

    // Fetch filtered audit logs
    const logs = await prisma.auditLog.findMany({
      where: whereConditions,
      orderBy: {
        performedAt: 'desc',
      },
      include: {
        performer: {
          select: {
            displayName: true,
            email: true,
          },
        },
      },
    });

    // Get user names for filter display
    let userNames = [];
    if (filters.userIds && filters.userIds.length > 0) {
      const users = await prisma.groupMember.findMany({
        where: {
          groupMemberId: {
            in: filters.userIds,
          },
        },
        select: {
          displayName: true,
        },
      });
      userNames = users.map(u => u.displayName);
    }

    // Generate PDF using the PDF service
    const pdfBuffer = pdfService.generateAuditLogPDF({
      groupName,
      filters: {
        ...filters,
        userNames,
      },
      logs,
      createdAt: new Date(),
    });

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `AuditLog_${groupName.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.pdf`;

    // Save PDF to storage (local for now, S3 in production)
    const uploadsDir = path.join(__dirname, '../uploads/log-exports');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, pdfBuffer);

    // Store export metadata in database
    const logExport = await prisma.logExport.create({
      data: {
        groupId: groupId,
        createdBy: groupMember.groupMemberId,
        filters: filters,
        filePath: `uploads/log-exports/${fileName}`,
        fileName: fileName,
        fileSizeBytes: BigInt(pdfBuffer.length),
      },
    });

    // Create audit log entry for this export
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'export_logs',
        actionLocation: 'logs',
        performedBy: groupMember.groupMemberId,
        performedByName: groupMember.displayName,
        performedByEmail: groupMember.email || 'N/A',
        messageContent: `Exported ${logs.length} audit log entries to PDF`,
        mediaLinks: [],
        logData: filters,
      },
    });

    // Return the PDF file for download with metadata in headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('X-Export-Id', logExport.exportId);
    res.setHeader('X-Export-Filename', fileName);
    res.setHeader('X-Export-Size', pdfBuffer.length.toString());
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Export logs as PDF error:', error);
    res.status(500).json({
      error: 'Failed to export logs',
      message: error.message,
    });
  }
}

/**
 * Get all previous exports for a group
 * GET /logs/:groupId/exports
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function getPreviousExports(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is admin of this group
    const groupMember = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
        role: 'admin',
      },
    });

    if (!groupMember) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You must be an admin of this group to view exports',
      });
    }

    // Fetch all non-hidden exports for this group
    const exports = await prisma.logExport.findMany({
      where: {
        groupId: groupId,
        isHidden: false,
      },
      include: {
        creator: {
          select: {
            displayName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({
      success: true,
      exports: exports.map(exp => ({
        exportId: exp.exportId,
        createdAt: exp.createdAt,
        createdBy: exp.creator.displayName,
        createdByEmail: exp.creator.email,
        fileName: exp.fileName,
        fileSizeBytes: exp.fileSizeBytes.toString(),
        filters: exp.filters,
      })),
    });
  } catch (error) {
    console.error('Get previous exports error:', error);
    res.status(500).json({
      error: 'Failed to get exports',
      message: error.message,
    });
  }
}

/**
 * Download a previous export
 * GET /logs/:groupId/exports/:exportId/download
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function downloadPreviousExport(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, exportId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is admin of this group
    const groupMember = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
        role: 'admin',
      },
    });

    if (!groupMember) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You must be an admin of this group to download exports',
      });
    }

    // Fetch the export
    const logExport = await prisma.logExport.findUnique({
      where: {
        exportId: exportId,
      },
    });

    if (!logExport) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Export not found',
      });
    }

    // Verify export belongs to this group
    if (logExport.groupId !== groupId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This export does not belong to the specified group',
      });
    }

    // Check if export is hidden
    if (logExport.isHidden) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Export has been deleted',
      });
    }

    // Read the PDF file
    const fullPath = path.join(__dirname, '..', logExport.filePath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Export file not found on server',
      });
    }

    const pdfBuffer = fs.readFileSync(fullPath);

    // Return the PDF file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${logExport.fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Download previous export error:', error);
    res.status(500).json({
      error: 'Failed to download export',
      message: error.message,
    });
  }
}

/**
 * Request deletion of a log export (requires admin approval)
 * DELETE /logs/:groupId/exports/:exportId
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function requestDeleteExport(req, res) {
  try {
    const userId = req.user?.userId;
    const { groupId, exportId } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    // Check if user is admin of this group
    const groupMember = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
        role: 'admin',
      },
    });

    if (!groupMember) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You must be an admin of this group to delete exports',
      });
    }

    // Check if export exists and belongs to this group
    const logExport = await prisma.logExport.findFirst({
      where: {
        exportId: exportId,
        groupId: groupId,
        isHidden: false,
      },
    });

    if (!logExport) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Export not found or already deleted',
      });
    }

    // Check if there's already a pending approval for this export deletion
    const existingApproval = await prisma.approval.findFirst({
      where: {
        groupId: groupId,
        approvalType: 'delete_log_export',
        relatedEntityId: exportId,
        status: 'pending',
      },
    });

    if (existingApproval) {
      return res.status(400).json({
        error: 'Approval Pending',
        message: 'There is already a pending approval request to delete this export',
      });
    }

    // Create approval request
    const approval = await prisma.approval.create({
      data: {
        groupId: groupId,
        approvalType: 'delete_log_export',
        requestedBy: groupMember.groupMemberId,
        relatedEntityType: 'log_export',
        relatedEntityId: exportId,
        approvalData: {
          fileName: logExport.fileName,
          createdAt: logExport.createdAt,
          fileSizeBytes: logExport.fileSizeBytes.toString(),
        },
        requiresAllAdmins: false,
        requiredApprovalPercentage: 50.0,
      },
    });

    // Auto-approve for the requester
    await prisma.approvalVote.create({
      data: {
        approvalId: approval.approvalId,
        adminId: groupMember.groupMemberId,
        vote: 'approve',
        isAutoApproved: true,
      },
    });

    // Check if approval threshold is met
    const totalAdmins = await prisma.groupMember.count({
      where: {
        groupId: groupId,
        role: 'admin',
      },
    });

    const approvedVotes = 1; // Just the requester so far

    if ((approvedVotes / totalAdmins) * 100 >= 50) {
      // Threshold met, soft delete the export
      await prisma.logExport.update({
        where: {
          exportId: exportId,
        },
        data: {
          isHidden: true,
        },
      });

      // Update approval status
      await prisma.approval.update({
        where: {
          approvalId: approval.approvalId,
        },
        data: {
          status: 'approved',
          completedAt: new Date(),
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          groupId: groupId,
          action: 'delete_log_export',
          actionLocation: 'logs',
          performedBy: groupMember.groupMemberId,
          performedByName: groupMember.displayName,
          performedByEmail: groupMember.email || 'N/A',
          messageContent: `Deleted log export: ${logExport.fileName}`,
          mediaLinks: [],
          logData: {
            exportId: exportId,
            fileName: logExport.fileName,
            approvalId: approval.approvalId,
          },
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Export deleted successfully',
        approvalId: approval.approvalId,
      });
    }

    // Send push notification to other admins (fire and forget)
    pushNotificationService.sendApprovalNotification(
      groupId,
      groupMember.groupMemberId,
      'delete_log_export',
      `${groupMember.displayName} wants to delete log export: "${logExport.fileName}"`,
      approval.approvalId
    ).catch(err => console.error('[Logs] Failed to send approval notification:', err));

    // Threshold not met yet, return pending approval
    res.status(200).json({
      success: true,
      message: 'Delete request created. Waiting for admin approvals.',
      approvalId: approval.approvalId,
      status: 'pending',
      requiredVotes: Math.ceil(totalAdmins * 0.5),
      currentVotes: approvedVotes,
    });
  } catch (error) {
    console.error('Request delete export error:', error);
    res.status(500).json({
      error: 'Failed to request export deletion',
      message: error.message,
    });
  }
}

module.exports = {
  getAuditLogs,
  requestExport,
  getExports,
  downloadExport,
  exportLogsAsPDF,
  getPreviousExports,
  downloadPreviousExport,
  requestDeleteExport,
};
