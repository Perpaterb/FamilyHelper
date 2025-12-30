/**
 * Gift Registry Controller
 *
 * Handles CRUD operations for gift registries and items.
 * Gift registries are shareable wishlists for birthdays, holidays, etc.
 */

const { prisma } = require('../config/database');
const { isGroupReadOnly, getReadOnlyErrorResponse } = require('../utils/permissions');
const crypto = require('crypto');

/**
 * Generate a cryptographically random web token for shareable URLs
 * @returns {string} 32-character random token
 */
function generateWebToken() {
  return crypto.randomBytes(16).toString('hex'); // 16 bytes = 32 hex chars
}

/**
 * Generate a random 6-digit passcode
 * @returns {string} 6-digit passcode
 */
function generatePasscode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Get all gift registries for a group (both group-owned and linked personal registries)
 * GET /groups/:groupId/gift-registries
 */
async function getGiftRegistries(req, res) {
  try {
    const { groupId } = req.params;

    // Verify user is a member of this group
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: req.user.userId,
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a member of this group',
      });
    }

    // Check admin visibility permissions from group settings
    if (membership.role === 'admin') {
      const groupSettings = await prisma.groupSettings.findUnique({
        where: { groupId },
        select: { giftRegistryVisibleToAdmins: true },
      });
      if (groupSettings && !groupSettings.giftRegistryVisibleToAdmins) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Gift registries are not visible to admins in this group',
        });
      }
    }

    // Get group-owned gift registries
    const groupRegistries = await prisma.giftRegistry.findMany({
      where: {
        groupId: groupId,
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
        items: {
          select: {
            itemId: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get linked personal gift registries
    const linkedRegistries = await prisma.personalGiftRegistryGroupLink.findMany({
      where: {
        groupId: groupId,
      },
      include: {
        registry: {
          include: {
            user: {
              select: {
                userId: true,
                displayName: true,
                memberIcon: true,
                iconColor: true,
                profilePhotoFileId: true,
              },
            },
            items: {
              select: {
                itemId: true,
              },
            },
          },
        },
        linker: {
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
      },
      orderBy: {
        linkedAt: 'desc',
      },
    });

    // Format group registries
    const formattedGroupRegistries = groupRegistries.map(registry => ({
      registryId: registry.registryId,
      type: 'group',
      name: registry.name,
      sharingType: registry.sharingType,
      webToken: registry.webToken,
      itemCount: registry.items.length,
      creatorId: registry.creatorId, // Include creatorId for permission checks
      creator: {
        groupMemberId: registry.creator.groupMemberId,
        // Use User profile name if available, otherwise fall back to GroupMember name
        displayName: registry.creator.user?.displayName || registry.creator.displayName,
        iconLetters: registry.creator.user?.memberIcon || registry.creator.iconLetters,
        iconColor: registry.creator.user?.iconColor || registry.creator.iconColor,
        profilePhotoUrl: registry.creator.user?.profilePhotoFileId
          ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${registry.creator.user.profilePhotoFileId}`
          : null,
      },
      isOwner: registry.creatorId === membership.groupMemberId,
      createdAt: registry.createdAt,
      updatedAt: registry.updatedAt,
    }));

    // Format linked personal registries
    const formattedLinkedRegistries = linkedRegistries.map(link => ({
      registryId: link.registry.registryId,
      type: 'personal_linked',
      name: link.registry.name,
      sharingType: link.registry.sharingType,
      webToken: link.registry.webToken,
      itemCount: link.registry.items.length,
      owner: {
        userId: link.registry.user.userId,
        displayName: link.registry.user.displayName,
        memberIcon: link.registry.user.memberIcon,
        iconColor: link.registry.user.iconColor,
      },
      isOwner: link.registry.userId === req.user.userId,
      // Use User profile name if available, otherwise fall back to GroupMember name
      linkedBy: link.linker.user?.displayName || link.linker.displayName,
      linkedAt: link.linkedAt,
    }));

    // Combine and return
    res.status(200).json({
      success: true,
      registries: {
        group: formattedGroupRegistries,
        linked: formattedLinkedRegistries,
      },
    });
  } catch (error) {
    console.error('Get gift registries error:', error);
    res.status(500).json({
      error: 'Failed to get gift registries',
      message: error.message,
    });
  }
}

/**
 * Get a single gift registry with all items
 * GET /groups/:groupId/gift-registries/:registryId
 */
async function getGiftRegistry(req, res) {
  try {
    const { groupId, registryId } = req.params;

    // Verify user is a member of this group
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: req.user.userId,
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a member of this group',
      });
    }

    // Try to find as group registry first
    const groupRegistry = await prisma.giftRegistry.findFirst({
      where: {
        registryId: registryId,
        groupId: groupId,
      },
      include: {
        creator: {
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
        items: {
          include: {
            purchaser: {
              select: {
                groupMemberId: true,
                displayName: true,
              },
            },
          },
          orderBy: {
            displayOrder: 'asc',
          },
        },
      },
    });

    if (groupRegistry) {
      // Check if user is the owner
      const isOwner = groupRegistry.creatorId === membership.groupMemberId;

      // Filter items based on user role:
      // - Owner: Hide purchased items (to maintain surprise)
      // - Non-owner: Show all items with purchase status
      const filteredItems = isOwner
        ? groupRegistry.items.filter(item => !item.isPurchased)
        : groupRegistry.items;

      return res.status(200).json({
        success: true,
        registry: {
          ...groupRegistry,
          type: 'group',
          creator: {
            groupMemberId: groupRegistry.creator.groupMemberId,
            // Use User profile name if available, otherwise fall back to GroupMember name
            displayName: groupRegistry.creator.user?.displayName || groupRegistry.creator.displayName,
            iconLetters: groupRegistry.creator.user?.memberIcon || groupRegistry.creator.iconLetters,
            iconColor: groupRegistry.creator.user?.iconColor || groupRegistry.creator.iconColor,
            profilePhotoUrl: groupRegistry.creator.user?.profilePhotoFileId
              ? `${process.env.API_BASE_URL || 'http://localhost:3000'}/files/${groupRegistry.creator.user.profilePhotoFileId}`
              : null,
            role: groupRegistry.creator.role,
          },
          items: filteredItems,
          isOwner: isOwner,
          hasPasscode: !!groupRegistry.passcode,
        },
      });
    }

    // Try to find as linked personal registry
    const linkedRegistry = await prisma.personalGiftRegistryGroupLink.findFirst({
      where: {
        registryId: registryId,
        groupId: groupId,
      },
      include: {
        registry: {
          include: {
            user: {
              select: {
                userId: true,
                displayName: true,
                memberIcon: true,
                iconColor: true,
                profilePhotoFileId: true,
              },
            },
            items: {
              orderBy: {
                displayOrder: 'asc',
              },
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
    });

    if (linkedRegistry) {
      // Check if user is the owner
      const isOwner = linkedRegistry.registry.userId === req.user.userId;

      // Filter items based on user role:
      // - Owner: Hide purchased items (to maintain surprise)
      // - Non-owner: Show all items with purchase status
      const filteredItems = isOwner
        ? linkedRegistry.registry.items.filter(item => !item.isPurchased)
        : linkedRegistry.registry.items;

      return res.status(200).json({
        success: true,
        registry: {
          ...linkedRegistry.registry,
          type: 'personal_linked',
          items: filteredItems,
          owner: linkedRegistry.registry.user,
          linkedBy: linkedRegistry.linker.displayName,
          linkedAt: linkedRegistry.linkedAt,
          isOwner: isOwner,
        },
      });
    }

    return res.status(404).json({
      error: 'Not found',
      message: 'Gift registry not found in this group',
    });
  } catch (error) {
    console.error('Get gift registry error:', error);
    res.status(500).json({
      error: 'Failed to get gift registry',
      message: error.message,
    });
  }
}

/**
 * Create a new gift registry
 * POST /groups/:groupId/gift-registries
 * Body: { name, sharingType }
 */
async function createGiftRegistry(req, res) {
  try {
    const { groupId } = req.params;
    const { name, sharingType } = req.body;

    // Validate input
    if (!name || !name.trim()) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Registry name is required',
      });
    }

    if (!['public', 'passcode', 'group_only'].includes(sharingType)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Sharing type must be: public, passcode, or group_only',
      });
    }

    // Verify user is a member of this group
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: req.user.userId,
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
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
        select: { giftRegistryCreatableByAdmins: true },
      });
      if (groupSettings && !groupSettings.giftRegistryCreatableByAdmins) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Admins cannot create gift registries in this group',
        });
      }
    }

    // Generate web token and passcode if needed
    // Only generate webToken for public or passcode sharing types (not for group_only)
    const webToken = (sharingType === 'public' || sharingType === 'passcode') ? generateWebToken() : null;
    const passcode = sharingType === 'passcode' ? generatePasscode() : null;

    // Create registry
    const registry = await prisma.giftRegistry.create({
      data: {
        groupId: groupId,
        creatorId: membership.groupMemberId,
        name: name.trim(),
        sharingType: sharingType,
        webToken: webToken,
        passcode: passcode,
      },
      include: {
        creator: {
          select: {
            groupMemberId: true,
            displayName: true,
            iconLetters: true,
            iconColor: true,
          },
        },
      },
    });

    // Audit log for creating gift registry
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'create_gift_registry',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'gift_registry',
        messageContent: `Created gift registry "${name.trim()}" with sharing type "${sharingType}"`,
      },
    });

    res.status(201).json({
      success: true,
      registry: {
        ...registry,
        itemCount: 0,
      },
    });
  } catch (error) {
    console.error('Create gift registry error:', error);
    res.status(500).json({
      error: 'Failed to create gift registry',
      message: error.message,
    });
  }
}

/**
 * Update a gift registry
 * PUT /groups/:groupId/gift-registries/:registryId
 * Body: { name }
 */
async function updateGiftRegistry(req, res) {
  try {
    const { groupId, registryId } = req.params;
    const { name } = req.body;

    // Validate input
    if (!name || !name.trim()) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Registry name is required',
      });
    }

    // Get registry
    const registry = await prisma.giftRegistry.findUnique({
      where: {
        registryId: registryId,
      },
    });

    if (!registry) {
      return res.status(404).json({
        error: 'Registry not found',
        message: 'Gift registry not found',
      });
    }

    // Verify registry belongs to this group
    if (registry.groupId !== groupId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Registry does not belong to this group',
      });
    }

    // Verify user can edit (creator or admin)
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: req.user.userId,
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
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

    const canEdit = registry.creatorId === membership.groupMemberId || membership.role === 'admin';

    if (!canEdit) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the creator or admins can edit this registry',
      });
    }

    // Store old name for audit log
    const oldName = registry.name;

    // Update registry
    const updatedRegistry = await prisma.giftRegistry.update({
      where: {
        registryId: registryId,
      },
      data: {
        name: name.trim(),
      },
      include: {
        creator: {
          select: {
            groupMemberId: true,
            displayName: true,
            iconLetters: true,
            iconColor: true,
          },
        },
      },
    });

    // Audit log for updating gift registry
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'update_gift_registry',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'gift_registry',
        messageContent: `Updated gift registry name from "${oldName}" to "${name.trim()}"`,
      },
    });

    res.status(200).json({
      success: true,
      registry: updatedRegistry,
    });
  } catch (error) {
    console.error('Update gift registry error:', error);
    res.status(500).json({
      error: 'Failed to update gift registry',
      message: error.message,
    });
  }
}

/**
 * Delete a gift registry
 * DELETE /groups/:groupId/gift-registries/:registryId
 */
async function deleteGiftRegistry(req, res) {
  try {
    const { groupId, registryId } = req.params;

    // Get registry
    const registry = await prisma.giftRegistry.findUnique({
      where: {
        registryId: registryId,
      },
    });

    if (!registry) {
      return res.status(404).json({
        error: 'Registry not found',
        message: 'Gift registry not found',
      });
    }

    // Verify registry belongs to this group
    if (registry.groupId !== groupId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Registry does not belong to this group',
      });
    }

    // Verify user can delete (creator or admin)
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: req.user.userId,
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
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

    const canDelete = registry.creatorId === membership.groupMemberId || membership.role === 'admin';

    if (!canDelete) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the creator or admins can delete this registry',
      });
    }

    // Store registry name for audit log
    const registryName = registry.name;

    // Delete registry (items will cascade delete)
    await prisma.giftRegistry.delete({
      where: {
        registryId: registryId,
      },
    });

    // Audit log for deleting gift registry
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'delete_gift_registry',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'gift_registry',
        messageContent: `Deleted gift registry "${registryName}"`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Gift registry deleted successfully',
    });
  } catch (error) {
    console.error('Delete gift registry error:', error);
    res.status(500).json({
      error: 'Failed to delete gift registry',
      message: error.message,
    });
  }
}

/**
 * Reset passcode for a registry
 * POST /groups/:groupId/gift-registries/:registryId/reset-passcode
 */
async function resetPasscode(req, res) {
  try {
    const { groupId, registryId } = req.params;

    // Get registry
    const registry = await prisma.giftRegistry.findUnique({
      where: {
        registryId: registryId,
      },
    });

    if (!registry) {
      return res.status(404).json({
        error: 'Registry not found',
        message: 'Gift registry not found',
      });
    }

    // Verify registry belongs to this group
    if (registry.groupId !== groupId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Registry does not belong to this group',
      });
    }

    // Verify registry uses passcode
    if (registry.sharingType !== 'passcode') {
      return res.status(400).json({
        error: 'Invalid operation',
        message: 'Registry does not use passcode sharing',
      });
    }

    // Verify user can edit (creator or admin)
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: req.user.userId,
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a member of this group',
      });
    }

    const canEdit = registry.creatorId === membership.groupMemberId || membership.role === 'admin';

    if (!canEdit) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the creator or admins can reset the passcode',
      });
    }

    // Generate new passcode
    const newPasscode = generatePasscode();

    // Update registry
    await prisma.giftRegistry.update({
      where: {
        registryId: registryId,
      },
      data: {
        passcode: newPasscode,
      },
    });

    // Audit log for resetting passcode
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'reset_passcode',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'gift_registry',
        messageContent: `Reset passcode for gift registry "${registry.name}"`,
      },
    });

    res.status(200).json({
      success: true,
      passcode: newPasscode,
      message: 'Passcode reset successfully',
    });
  } catch (error) {
    console.error('Reset passcode error:', error);
    res.status(500).json({
      error: 'Failed to reset passcode',
      message: error.message,
    });
  }
}

/**
 * Add an item to a registry
 * POST /groups/:groupId/gift-registries/:registryId/items
 * Body: { title, link, photoUrl, cost, description }
 */
async function addGiftItem(req, res) {
  try {
    const { groupId, registryId } = req.params;
    const { title, link, photoUrl, cost, description } = req.body;

    // Validate input
    if (!title || !title.trim()) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Item title is required',
      });
    }

    // Get registry
    const registry = await prisma.giftRegistry.findUnique({
      where: {
        registryId: registryId,
      },
    });

    if (!registry) {
      return res.status(404).json({
        error: 'Registry not found',
        message: 'Gift registry not found',
      });
    }

    // Verify registry belongs to this group
    if (registry.groupId !== groupId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Registry does not belong to this group',
      });
    }

    // Verify user can edit (creator or admin)
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: req.user.userId,
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
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

    const canEdit = registry.creatorId === membership.groupMemberId || membership.role === 'admin';

    if (!canEdit) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the creator or admins can add items to this registry',
      });
    }

    // Get current max display order
    const maxOrder = await prisma.giftItem.aggregate({
      where: {
        registryId: registryId,
      },
      _max: {
        displayOrder: true,
      },
    });

    const nextOrder = (maxOrder._max.displayOrder || 0) + 1;

    // Create item
    const item = await prisma.giftItem.create({
      data: {
        registryId: registryId,
        title: title.trim(),
        link: link?.trim() || null,
        photoUrl: photoUrl?.trim() || null,
        cost: cost ? parseFloat(cost) : null,
        description: description?.trim() || null,
        displayOrder: nextOrder,
      },
    });

    // Audit log for adding gift item
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'add_gift_item',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'gift_registry',
        messageContent: `Added gift item "${title.trim()}" to registry "${registry.name}"`,
      },
    });

    res.status(201).json({
      success: true,
      item: item,
    });
  } catch (error) {
    console.error('Add gift item error:', error);
    res.status(500).json({
      error: 'Failed to add gift item',
      message: error.message,
    });
  }
}

/**
 * Update a gift item
 * PUT /groups/:groupId/gift-registries/:registryId/items/:itemId
 * Body: { title, link, photoUrl, cost, description }
 */
async function updateGiftItem(req, res) {
  try {
    const { groupId, registryId, itemId } = req.params;
    const { title, link, photoUrl, cost, description } = req.body;

    // Validate input
    if (!title || !title.trim()) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Item title is required',
      });
    }

    // Get item with registry
    const item = await prisma.giftItem.findUnique({
      where: {
        itemId: itemId,
      },
      include: {
        registry: true,
      },
    });

    if (!item) {
      return res.status(404).json({
        error: 'Item not found',
        message: 'Gift item not found',
      });
    }

    // Verify item belongs to this registry and group
    if (item.registryId !== registryId || item.registry.groupId !== groupId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Item does not belong to this registry',
      });
    }

    // Verify user can edit (creator or admin)
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: req.user.userId,
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
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

    const canEdit = item.registry.creatorId === membership.groupMemberId || membership.role === 'admin';

    if (!canEdit) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the creator or admins can edit items in this registry',
      });
    }

    // Store old title for audit log
    const oldTitle = item.title;

    // Update item
    const updatedItem = await prisma.giftItem.update({
      where: {
        itemId: itemId,
      },
      data: {
        title: title.trim(),
        link: link?.trim() || null,
        photoUrl: photoUrl?.trim() || null,
        cost: cost ? parseFloat(cost) : null,
        description: description?.trim() || null,
      },
    });

    // Audit log for updating gift item
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'update_gift_item',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'gift_registry',
        messageContent: oldTitle !== title.trim()
          ? `Updated gift item from "${oldTitle}" to "${title.trim()}" in registry "${item.registry.name}"`
          : `Updated gift item "${title.trim()}" in registry "${item.registry.name}"`,
      },
    });

    res.status(200).json({
      success: true,
      item: updatedItem,
    });
  } catch (error) {
    console.error('Update gift item error:', error);
    res.status(500).json({
      error: 'Failed to update gift item',
      message: error.message,
    });
  }
}

/**
 * Delete a gift item
 * DELETE /groups/:groupId/gift-registries/:registryId/items/:itemId
 */
async function deleteGiftItem(req, res) {
  try {
    const { groupId, registryId, itemId } = req.params;

    // Get item with registry
    const item = await prisma.giftItem.findUnique({
      where: {
        itemId: itemId,
      },
      include: {
        registry: true,
      },
    });

    if (!item) {
      return res.status(404).json({
        error: 'Item not found',
        message: 'Gift item not found',
      });
    }

    // Verify item belongs to this registry and group
    if (item.registryId !== registryId || item.registry.groupId !== groupId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Item does not belong to this registry',
      });
    }

    // Verify user can delete (creator or admin)
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: req.user.userId,
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
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

    const canDelete = item.registry.creatorId === membership.groupMemberId || membership.role === 'admin';

    if (!canDelete) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the creator or admins can delete items from this registry',
      });
    }

    // Store item details for audit log
    const itemTitle = item.title;
    const registryName = item.registry.name;

    // Delete item
    await prisma.giftItem.delete({
      where: {
        itemId: itemId,
      },
    });

    // Audit log for deleting gift item
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'delete_gift_item',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'gift_registry',
        messageContent: `Deleted gift item "${itemTitle}" from registry "${registryName}"`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Gift item deleted successfully',
    });
  } catch (error) {
    console.error('Delete gift item error:', error);
    res.status(500).json({
      error: 'Failed to delete gift item',
      message: error.message,
    });
  }
}

/**
 * Link personal gift registry to group
 * POST /groups/:groupId/gift-registries/:registryId/link
 */
async function linkPersonalRegistry(req, res) {
  try {
    const { groupId, registryId } = req.params;

    // Verify user is a member of this group
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: req.user.userId,
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
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

    // Verify personal registry exists and belongs to user
    const personalRegistry = await prisma.personalGiftRegistry.findUnique({
      where: {
        registryId: registryId,
      },
    });

    if (!personalRegistry) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Personal registry not found',
      });
    }

    if (personalRegistry.userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only link your own personal registries',
      });
    }

    // Check if already linked
    const existingLink = await prisma.personalGiftRegistryGroupLink.findFirst({
      where: {
        registryId: registryId,
        groupId: groupId,
      },
    });

    if (existingLink) {
      return res.status(400).json({
        error: 'Already linked',
        message: 'This registry is already linked to this group',
      });
    }

    // Create link
    await prisma.personalGiftRegistryGroupLink.create({
      data: {
        registryId: registryId,
        groupId: groupId,
        linkedBy: membership.groupMemberId,
      },
    });

    // Audit log for linking personal registry
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'link_personal_registry',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'gift_registry',
        messageContent: `Linked personal registry "${personalRegistry.name}" to group`,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Personal registry linked to group successfully',
    });
  } catch (error) {
    console.error('Link personal registry error:', error);
    res.status(500).json({
      error: 'Failed to link personal registry',
      message: error.message,
    });
  }
}

/**
 * Unlink personal gift registry from group
 * DELETE /groups/:groupId/gift-registries/:registryId/unlink
 */
async function unlinkPersonalRegistry(req, res) {
  try {
    const { groupId, registryId } = req.params;

    // Verify user is a member of this group
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: req.user.userId,
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
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

    // Verify link exists
    const link = await prisma.personalGiftRegistryGroupLink.findFirst({
      where: {
        registryId: registryId,
        groupId: groupId,
      },
      include: {
        registry: true,
      },
    });

    if (!link) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Registry link not found',
      });
    }

    // Only the owner or group admins can unlink
    const canUnlink = link.registry.userId === req.user.userId || membership.role === 'admin';

    if (!canUnlink) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the owner or group admins can unlink this registry',
      });
    }

    // Store registry name for audit log
    const registryName = link.registry.name;

    // Delete link
    await prisma.personalGiftRegistryGroupLink.delete({
      where: {
        linkId: link.linkId,
      },
    });

    // Audit log for unlinking personal registry
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'unlink_personal_registry',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'gift_registry',
        messageContent: `Unlinked personal registry "${registryName}" from group`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Personal registry unlinked from group successfully',
    });
  } catch (error) {
    console.error('Unlink personal registry error:', error);
    res.status(500).json({
      error: 'Failed to unlink personal registry',
      message: error.message,
    });
  }
}

/**
 * Mark a gift item as purchased
 * POST /groups/:groupId/gift-registries/:registryId/items/:itemId/mark-purchased
 */
async function markItemAsPurchased(req, res) {
  try {
    const { groupId, registryId, itemId } = req.params;

    // Verify user is a member of this group
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: req.user.userId,
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
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

    // Get item with registry
    const item = await prisma.giftItem.findUnique({
      where: {
        itemId: itemId,
      },
      include: {
        registry: true,
      },
    });

    if (!item) {
      return res.status(404).json({
        error: 'Item not found',
        message: 'Gift item not found',
      });
    }

    // Verify item belongs to this registry and group
    if (item.registryId !== registryId || item.registry.groupId !== groupId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Item does not belong to this registry',
      });
    }

    // Prevent owner from marking their own items as purchased
    if (item.registry.creatorId === membership.groupMemberId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Registry owner cannot mark items as purchased',
      });
    }

    // Check if already purchased
    if (item.isPurchased) {
      return res.status(400).json({
        error: 'Already purchased',
        message: 'This item has already been marked as purchased',
      });
    }

    // Mark as purchased
    const updatedItem = await prisma.giftItem.update({
      where: {
        itemId: itemId,
      },
      data: {
        isPurchased: true,
        purchasedBy: membership.groupMemberId,
        purchasedAt: new Date(),
      },
    });

    // Audit log for marking item as purchased
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'mark_gift_purchased',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'gift_registry',
        messageContent: `Marked gift item "${item.title}" as purchased in registry "${item.registry.name}"`,
      },
    });

    res.status(200).json({
      success: true,
      item: updatedItem,
      message: 'Item marked as purchased successfully',
    });
  } catch (error) {
    console.error('Mark item as purchased error:', error);
    res.status(500).json({
      error: 'Failed to mark item as purchased',
      message: error.message,
    });
  }
}

/**
 * Get public gift registry by webToken
 * GET /public/gift-registry/:webToken
 * No authentication required
 */
async function getPublicGiftRegistry(req, res) {
  try {
    const { webToken } = req.params;

    if (!webToken) {
      return res.status(400).json({
        error: 'Missing webToken',
        message: 'Registry token is required',
      });
    }

    // Try to find in group gift registries first
    let registry = await prisma.giftRegistry.findFirst({
      where: {
        webToken: webToken,
      },
      include: {
        items: {
          orderBy: {
            displayOrder: 'asc',
          },
        },
      },
    });

    let isPersonal = false;

    // If not found, try personal gift registries
    if (!registry) {
      registry = await prisma.personalGiftRegistry.findFirst({
        where: {
          webToken: webToken,
        },
        include: {
          items: {
            orderBy: {
              displayOrder: 'asc',
            },
          },
        },
      });
      isPersonal = true;
    }

    if (!registry) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Registry not found or link has expired',
      });
    }

    // Check if registry is accessible (not group_only)
    if (registry.sharingType === 'group_only') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'This registry is only visible to group members',
      });
    }

    // If passcode protected, require passcode verification
    // Note: Group registries use 'passcode', personal registries use 'external_link_passcode'
    if (registry.sharingType === 'passcode' || registry.sharingType === 'external_link_passcode') {
      return res.status(401).json({
        requiresPasscode: true,
        name: registry.name,
        message: 'This registry requires a passcode',
      });
    }

    // Public registry - return full data including purchaser info
    res.status(200).json({
      success: true,
      registry: {
        registryId: registry.registryId,
        name: registry.name,
        type: isPersonal ? 'personal' : 'group',
        items: registry.items.map(item => ({
          itemId: item.itemId,
          title: item.title,
          link: item.link,
          photoUrl: item.photoUrl,
          cost: item.cost,
          description: item.description,
          isPurchased: item.isPurchased,
          purchasedByName: item.purchasedByName,
          purchasedAt: item.purchasedAt,
        })),
      },
    });
  } catch (error) {
    console.error('Get public gift registry error:', error);
    res.status(500).json({
      error: 'Failed to get registry',
      message: error.message,
    });
  }
}

/**
 * Verify passcode and get gift registry
 * POST /public/gift-registry/:webToken
 * Body: { passcode }
 * No authentication required
 */
async function verifyGiftRegistryPasscode(req, res) {
  try {
    const { webToken } = req.params;
    const { passcode } = req.body;

    if (!webToken) {
      return res.status(400).json({
        error: 'Missing webToken',
        message: 'Registry token is required',
      });
    }

    if (!passcode) {
      return res.status(400).json({
        error: 'Missing passcode',
        message: 'Passcode is required',
      });
    }

    // Try to find in group gift registries first
    let registry = await prisma.giftRegistry.findFirst({
      where: {
        webToken: webToken,
      },
      include: {
        items: {
          orderBy: {
            displayOrder: 'asc',
          },
        },
      },
    });

    let isPersonal = false;

    // If not found, try personal gift registries
    if (!registry) {
      registry = await prisma.personalGiftRegistry.findFirst({
        where: {
          webToken: webToken,
        },
        include: {
          items: {
            orderBy: {
              displayOrder: 'asc',
            },
          },
        },
      });
      isPersonal = true;
    }

    if (!registry) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Registry not found or link has expired',
      });
    }

    // Check if registry is accessible (not group_only)
    if (registry.sharingType === 'group_only') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'This registry is only visible to group members',
      });
    }

    // If not passcode protected, just return the data
    // Note: Group registries use 'passcode', personal registries use 'external_link_passcode'
    const requiresPasscode = registry.sharingType === 'passcode' || registry.sharingType === 'external_link_passcode';
    if (!requiresPasscode) {
      return res.status(200).json({
        success: true,
        registry: {
          registryId: registry.registryId,
          name: registry.name,
          type: isPersonal ? 'personal' : 'group',
          items: registry.items.map(item => ({
            itemId: item.itemId,
            title: item.title,
            link: item.link,
            photoUrl: item.photoUrl,
            cost: item.cost,
            description: item.description,
            isPurchased: item.isPurchased,
            purchasedByName: item.purchasedByName,
            purchasedAt: item.purchasedAt,
          })),
        },
      });
    }

    // Verify passcode
    if (registry.passcode !== passcode.trim().toUpperCase() && registry.passcode !== passcode.trim()) {
      return res.status(401).json({
        error: 'Invalid passcode',
        message: 'The passcode you entered is incorrect',
      });
    }

    // Passcode correct - return full data
    res.status(200).json({
      success: true,
      registry: {
        registryId: registry.registryId,
        name: registry.name,
        type: isPersonal ? 'personal' : 'group',
        items: registry.items.map(item => ({
          itemId: item.itemId,
          title: item.title,
          link: item.link,
          photoUrl: item.photoUrl,
          cost: item.cost,
          description: item.description,
          isPurchased: item.isPurchased,
          purchasedByName: item.purchasedByName,
          purchasedAt: item.purchasedAt,
        })),
      },
    });
  } catch (error) {
    console.error('Verify gift registry passcode error:', error);
    res.status(500).json({
      error: 'Failed to verify passcode',
      message: error.message,
    });
  }
}

/**
 * Mark item as purchased from public page
 * POST /public/gift-registry/:webToken/items/:itemId/purchase
 * Body: { purchaserName }
 * No authentication required
 */
async function markItemPurchasedPublic(req, res) {
  try {
    const { webToken, itemId } = req.params;
    const { purchaserName } = req.body;

    if (!webToken) {
      return res.status(400).json({
        error: 'Missing webToken',
        message: 'Registry token is required',
      });
    }

    if (!itemId) {
      return res.status(400).json({
        error: 'Missing itemId',
        message: 'Item ID is required',
      });
    }

    if (!purchaserName || !purchaserName.trim()) {
      return res.status(400).json({
        error: 'Missing purchaserName',
        message: 'Purchaser name is required',
      });
    }

    // Try to find in group gift registries first
    let registry = await prisma.giftRegistry.findFirst({
      where: {
        webToken: webToken,
      },
    });

    let isPersonal = false;

    // If not found, try personal gift registries
    if (!registry) {
      registry = await prisma.personalGiftRegistry.findFirst({
        where: {
          webToken: webToken,
        },
      });
      isPersonal = true;
    }

    if (!registry) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Registry not found or link has expired',
      });
    }

    // Check if registry is accessible (not group_only)
    if (registry.sharingType === 'group_only') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'This registry is only visible to group members',
      });
    }

    // Find and update the item
    if (isPersonal) {
      const item = await prisma.personalGiftItem.findFirst({
        where: {
          itemId: itemId,
          registryId: registry.registryId,
        },
      });

      if (!item) {
        return res.status(404).json({
          error: 'Not found',
          message: 'Item not found in this registry',
        });
      }

      if (item.isPurchased) {
        return res.status(400).json({
          error: 'Already purchased',
          message: 'This item has already been marked as purchased',
        });
      }

      await prisma.personalGiftItem.update({
        where: {
          itemId: itemId,
        },
        data: {
          isPurchased: true,
          purchasedByName: purchaserName.trim(),
          purchasedAt: new Date(),
        },
      });
    } else {
      const item = await prisma.giftItem.findFirst({
        where: {
          itemId: itemId,
          registryId: registry.registryId,
        },
      });

      if (!item) {
        return res.status(404).json({
          error: 'Not found',
          message: 'Item not found in this registry',
        });
      }

      if (item.isPurchased) {
        return res.status(400).json({
          error: 'Already purchased',
          message: 'This item has already been marked as purchased',
        });
      }

      await prisma.giftItem.update({
        where: {
          itemId: itemId,
        },
        data: {
          isPurchased: true,
          purchasedByName: purchaserName.trim(),
          purchasedAt: new Date(),
        },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Item marked as purchased successfully',
    });
  } catch (error) {
    console.error('Mark item purchased public error:', error);
    res.status(500).json({
      error: 'Failed to mark item as purchased',
      message: error.message,
    });
  }
}

module.exports = {
  getGiftRegistries,
  getGiftRegistry,
  createGiftRegistry,
  updateGiftRegistry,
  deleteGiftRegistry,
  resetPasscode,
  addGiftItem,
  updateGiftItem,
  deleteGiftItem,
  linkPersonalRegistry,
  unlinkPersonalRegistry,
  markItemAsPurchased,
  getPublicGiftRegistry,
  verifyGiftRegistryPasscode,
  markItemPurchasedPublic,
};
