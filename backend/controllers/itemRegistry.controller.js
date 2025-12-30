/**
 * Item Registry Controller (Group-Level)
 *
 * Handles CRUD operations for group item registries (books, tools, equipment).
 * Different from gift registries - tracks storage, category, borrowed status, replacement value.
 * Members can also link their personal item registries to the group.
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
 * Get all item registries for a group (both group-owned and linked personal registries)
 * GET /groups/:groupId/item-registries
 */
async function getItemRegistries(req, res) {
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

    const userRole = membership.role;

    // Get group settings to check item registry visibility permissions
    const groupSettings = await prisma.groupSettings.findUnique({
      where: { groupId: groupId },
      select: {
        itemRegistryVisibleToAdmins: true,
        itemRegistryVisibleToParents: true,
        itemRegistryVisibleToAdults: true,
        itemRegistryVisibleToCaregivers: true,
        itemRegistryVisibleToChildren: true,
      },
    });

    // Check if user has permission to view item registry
    let hasAccess = false;

    if (userRole === 'admin' && groupSettings?.itemRegistryVisibleToAdmins) {
      hasAccess = true;
    } else if (userRole === 'parent' && groupSettings?.itemRegistryVisibleToParents) {
      hasAccess = true;
    } else if (userRole === 'adult' && groupSettings?.itemRegistryVisibleToAdults) {
      hasAccess = true;
    } else if (userRole === 'caregiver' && groupSettings?.itemRegistryVisibleToCaregivers) {
      hasAccess = true;
    } else if (userRole === 'child' && groupSettings?.itemRegistryVisibleToChildren) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to view item registries',
      });
    }

    // Get group-owned item registries
    const groupRegistries = await prisma.itemRegistry.findMany({
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

    // Get linked personal item registries
    const linkedRegistries = await prisma.personalItemRegistryGroupLink.findMany({
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
      creatorId: registry.creatorId,
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
    console.error('Get item registries error:', error);
    res.status(500).json({
      error: 'Failed to get item registries',
      message: error.message,
    });
  }
}

/**
 * Get a specific item registry by ID
 * GET /groups/:groupId/item-registries/:registryId
 */
async function getItemRegistryById(req, res) {
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
    const groupRegistry = await prisma.itemRegistry.findFirst({
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
          orderBy: {
            displayOrder: 'asc',
          },
        },
      },
    });

    if (groupRegistry) {
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
          },
          isOwner: groupRegistry.creatorId === membership.groupMemberId,
        },
      });
    }

    // Try to find as linked personal registry
    const linkedRegistry = await prisma.personalItemRegistryGroupLink.findFirst({
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
      return res.status(200).json({
        success: true,
        registry: {
          ...linkedRegistry.registry,
          type: 'personal_linked',
          owner: linkedRegistry.registry.user,
          linkedBy: linkedRegistry.linker.displayName,
          linkedAt: linkedRegistry.linkedAt,
          isOwner: linkedRegistry.registry.userId === req.user.userId,
        },
      });
    }

    return res.status(404).json({
      error: 'Not found',
      message: 'Item registry not found in this group',
    });
  } catch (error) {
    console.error('Get item registry by ID error:', error);
    res.status(500).json({
      error: 'Failed to get item registry',
      message: error.message,
    });
  }
}

/**
 * Create a new group item registry
 * POST /groups/:groupId/item-registries
 */
async function createItemRegistry(req, res) {
  try {
    const { groupId } = req.params;
    const { name, sharingType } = req.body;

    // Validate input
    if (!name || !sharingType) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Name and sharingType are required',
      });
    }

    if (!['group_only', 'external_link', 'external_link_passcode'].includes(sharingType)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Invalid sharingType. Must be group_only, external_link, or external_link_passcode',
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

    // Generate web token and passcode if needed
    const webToken = sharingType !== 'group_only' ? generateWebToken() : null;
    const passcode = sharingType === 'external_link_passcode' ? generatePasscode() : null;

    // Create registry
    const registry = await prisma.itemRegistry.create({
      data: {
        groupId: groupId,
        creatorId: membership.groupMemberId,
        name: name,
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

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'create_item_registry',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'item_registry',
        messageContent: `Created item registry "${name}" with sharing type "${sharingType}"`,
      },
    });

    res.status(201).json({
      success: true,
      registry: {
        ...registry,
        type: 'group',
      },
    });
  } catch (error) {
    console.error('Create item registry error:', error);
    res.status(500).json({
      error: 'Failed to create item registry',
      message: error.message,
    });
  }
}

/**
 * Update an item registry
 * PUT /groups/:groupId/item-registries/:registryId
 */
async function updateItemRegistry(req, res) {
  try {
    const { groupId, registryId } = req.params;
    const { name, sharingType } = req.body;

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

    // Find registry
    const registry = await prisma.itemRegistry.findFirst({
      where: {
        registryId: registryId,
        groupId: groupId,
      },
    });

    if (!registry) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Item registry not found',
      });
    }

    // Verify user is the creator
    if (registry.creatorId !== membership.groupMemberId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the creator can update this registry',
      });
    }

    // Build update data
    const updateData = {};
    if (name) updateData.name = name;
    if (sharingType) {
      if (!['group_only', 'external_link', 'external_link_passcode'].includes(sharingType)) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Invalid sharingType',
        });
      }
      updateData.sharingType = sharingType;

      // Generate webToken if changing to external sharing
      if (sharingType !== 'group_only' && !registry.webToken) {
        updateData.webToken = generateWebToken();
      }

      // Generate or remove passcode based on sharing type
      if (sharingType === 'external_link_passcode' && !registry.passcode) {
        updateData.passcode = generatePasscode();
      } else if (sharingType !== 'external_link_passcode') {
        updateData.passcode = null;
      }

      // Remove webToken if changing to group_only
      if (sharingType === 'group_only') {
        updateData.webToken = null;
        updateData.passcode = null;
      }
    }

    // Update registry
    const updatedRegistry = await prisma.itemRegistry.update({
      where: {
        registryId: registryId,
      },
      data: updateData,
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

    // Create audit log
    const changes = [];
    if (name && name !== registry.name) {
      changes.push(`name from "${registry.name}" to "${name}"`);
    }
    if (sharingType && sharingType !== registry.sharingType) {
      changes.push(`sharing type from "${registry.sharingType}" to "${sharingType}"`);
    }
    const changeDescription = changes.length > 0 ? changes.join(', ') : 'no changes';

    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'update_item_registry',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'item_registry',
        messageContent: `Updated item registry "${registry.name}": ${changeDescription}`,
      },
    });

    res.status(200).json({
      success: true,
      registry: {
        ...updatedRegistry,
        type: 'group',
      },
    });
  } catch (error) {
    console.error('Update item registry error:', error);
    res.status(500).json({
      error: 'Failed to update item registry',
      message: error.message,
    });
  }
}

/**
 * Delete an item registry
 * DELETE /groups/:groupId/item-registries/:registryId
 */
async function deleteItemRegistry(req, res) {
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

    // Find registry
    const registry = await prisma.itemRegistry.findFirst({
      where: {
        registryId: registryId,
        groupId: groupId,
      },
    });

    if (!registry) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Item registry not found',
      });
    }

    // Verify user is the creator or an admin
    const isCreator = registry.creatorId === membership.groupMemberId;
    const isAdmin = membership.role === 'admin';

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the creator or an admin can delete this registry',
      });
    }

    // Delete registry (CASCADE will delete items)
    await prisma.itemRegistry.delete({
      where: {
        registryId: registryId,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'delete_item_registry',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'item_registry',
        messageContent: `Deleted item registry "${registry.name}"`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Item registry deleted',
    });
  } catch (error) {
    console.error('Delete item registry error:', error);
    res.status(500).json({
      error: 'Failed to delete item registry',
      message: error.message,
    });
  }
}

/**
 * Add an item to a registry
 * POST /groups/:groupId/item-registries/:registryId/items
 */
async function addItem(req, res) {
  try {
    const { groupId, registryId } = req.params;
    const { title, description, photoUrl, storageLocation, category, currentlyBorrowedBy, replacementValue } = req.body;

    if (!title) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Title is required',
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

    // Verify registry exists and user can edit it
    const registry = await prisma.itemRegistry.findFirst({
      where: {
        registryId: registryId,
        groupId: groupId,
      },
    });

    if (!registry) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Item registry not found',
      });
    }

    // Only creator can add items
    if (registry.creatorId !== membership.groupMemberId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the creator can add items to this registry',
      });
    }

    // Get highest display order
    const highestOrderItem = await prisma.itemRegistryItem.findFirst({
      where: { registryId: registryId },
      orderBy: { displayOrder: 'desc' },
    });

    const displayOrder = (highestOrderItem?.displayOrder || 0) + 1;

    // Create item
    const item = await prisma.itemRegistryItem.create({
      data: {
        registryId: registryId,
        title: title,
        description: description || null,
        photoUrl: photoUrl || null,
        storageLocation: storageLocation || null,
        category: category || null,
        currentlyBorrowedBy: currentlyBorrowedBy || null,
        replacementValue: replacementValue ? parseFloat(replacementValue) : null,
        displayOrder: displayOrder,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'add_item',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'item_registry',
        messageContent: `Added item "${title}" to registry "${registry.name}"`,
      },
    });

    res.status(201).json({
      success: true,
      item: item,
    });
  } catch (error) {
    console.error('Add item error:', error);
    res.status(500).json({
      error: 'Failed to add item',
      message: error.message,
    });
  }
}

/**
 * Update an item
 * PUT /groups/:groupId/item-registries/:registryId/items/:itemId
 */
async function updateItem(req, res) {
  try {
    const { groupId, registryId, itemId } = req.params;
    const { title, description, photoUrl, storageLocation, category, currentlyBorrowedBy, replacementValue } = req.body;

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

    // Verify registry exists and user can edit it
    const registry = await prisma.itemRegistry.findFirst({
      where: {
        registryId: registryId,
        groupId: groupId,
      },
    });

    if (!registry) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Item registry not found',
      });
    }

    // Only creator can update items
    if (registry.creatorId !== membership.groupMemberId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the creator can update items in this registry',
      });
    }

    // Verify item exists
    const item = await prisma.itemRegistryItem.findFirst({
      where: {
        itemId: itemId,
        registryId: registryId,
      },
    });

    if (!item) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Item not found in this registry',
      });
    }

    // Build update data
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description || null;
    if (photoUrl !== undefined) updateData.photoUrl = photoUrl || null;
    if (storageLocation !== undefined) updateData.storageLocation = storageLocation || null;
    if (category !== undefined) updateData.category = category || null;
    if (currentlyBorrowedBy !== undefined) updateData.currentlyBorrowedBy = currentlyBorrowedBy || null;
    if (replacementValue !== undefined) updateData.replacementValue = replacementValue ? parseFloat(replacementValue) : null;

    // Update item
    const updatedItem = await prisma.itemRegistryItem.update({
      where: {
        itemId: itemId,
      },
      data: updateData,
    });

    // Create audit log
    const itemChanges = [];
    if (title !== undefined && title !== item.title) {
      itemChanges.push(`title from "${item.title}" to "${title}"`);
    }
    if (description !== undefined && description !== item.description) {
      itemChanges.push('description');
    }
    if (storageLocation !== undefined && storageLocation !== item.storageLocation) {
      itemChanges.push('storage location');
    }
    if (category !== undefined && category !== item.category) {
      itemChanges.push('category');
    }
    if (currentlyBorrowedBy !== undefined && currentlyBorrowedBy !== item.currentlyBorrowedBy) {
      itemChanges.push('borrowed status');
    }
    if (replacementValue !== undefined) {
      itemChanges.push('replacement value');
    }
    const itemChangeDescription = itemChanges.length > 0 ? itemChanges.join(', ') : 'no changes';

    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'update_item',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'item_registry',
        messageContent: `Updated item "${item.title}" in registry "${registry.name}": ${itemChangeDescription}`,
      },
    });

    res.status(200).json({
      success: true,
      item: updatedItem,
    });
  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({
      error: 'Failed to update item',
      message: error.message,
    });
  }
}

/**
 * Delete an item
 * DELETE /groups/:groupId/item-registries/:registryId/items/:itemId
 */
async function deleteItem(req, res) {
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

    // Verify registry exists and user can edit it
    const registry = await prisma.itemRegistry.findFirst({
      where: {
        registryId: registryId,
        groupId: groupId,
      },
    });

    if (!registry) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Item registry not found',
      });
    }

    // Only creator can delete items
    if (registry.creatorId !== membership.groupMemberId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the creator can delete items from this registry',
      });
    }

    // Verify item exists
    const item = await prisma.itemRegistryItem.findFirst({
      where: {
        itemId: itemId,
        registryId: registryId,
      },
    });

    if (!item) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Item not found in this registry',
      });
    }

    // Delete item
    await prisma.itemRegistryItem.delete({
      where: {
        itemId: itemId,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'delete_item',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'item_registry',
        messageContent: `Deleted item "${item.title}" from registry "${registry.name}"`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Item deleted',
    });
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({
      error: 'Failed to delete item',
      message: error.message,
    });
  }
}

/**
 * Reorder items
 * PUT /groups/:groupId/item-registries/:registryId/items/reorder
 */
async function reorderItems(req, res) {
  try {
    const { groupId, registryId } = req.params;
    const { itemOrders } = req.body; // Array of { itemId, displayOrder }

    if (!Array.isArray(itemOrders)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'itemOrders must be an array',
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

    // Verify registry exists and user can edit it
    const registry = await prisma.itemRegistry.findFirst({
      where: {
        registryId: registryId,
        groupId: groupId,
      },
    });

    if (!registry) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Item registry not found',
      });
    }

    // Only creator can reorder items
    if (registry.creatorId !== membership.groupMemberId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the creator can reorder items in this registry',
      });
    }

    // Update all items in a transaction
    await prisma.$transaction(
      itemOrders.map(({ itemId, displayOrder }) =>
        prisma.itemRegistryItem.updateMany({
          where: { itemId, registryId }, // Ensure item belongs to this registry
          data: { displayOrder },
        })
      )
    );

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'reorder_items',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'item_registry',
        messageContent: `Reordered ${itemOrders.length} items in registry "${registry.name}"`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Items reordered',
    });
  } catch (error) {
    console.error('Reorder items error:', error);
    res.status(500).json({
      error: 'Failed to reorder items',
      message: error.message,
    });
  }
}

/**
 * Link personal item registry to group
 * POST /groups/:groupId/item-registries/:registryId/link
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
    const personalRegistry = await prisma.personalItemRegistry.findUnique({
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
    const existingLink = await prisma.personalItemRegistryGroupLink.findFirst({
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
    await prisma.personalItemRegistryGroupLink.create({
      data: {
        registryId: registryId,
        groupId: groupId,
        linkedBy: membership.groupMemberId,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'link_personal_registry',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'item_registry',
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
 * Unlink personal item registry from group
 * DELETE /groups/:groupId/item-registries/:registryId/unlink
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
    const link = await prisma.personalItemRegistryGroupLink.findFirst({
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

    // Delete link
    await prisma.personalItemRegistryGroupLink.delete({
      where: {
        linkId: link.linkId,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'unlink_personal_registry',
        performedBy: membership.groupMemberId,
        performedByName: membership.displayName,
        performedByEmail: membership.email || 'N/A',
        actionLocation: 'item_registry',
        messageContent: `Unlinked personal registry "${link.registry.name}" from group`,
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
 * Get public item registry by webToken
 * GET /public/item-registry/:webToken
 * No authentication required
 */
async function getPublicItemRegistry(req, res) {
  try {
    const { webToken } = req.params;

    if (!webToken) {
      return res.status(400).json({
        error: 'Missing webToken',
        message: 'Registry token is required',
      });
    }

    // Try to find in group item registries first
    let registry = await prisma.itemRegistry.findFirst({
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

    // If not found, try personal item registries
    if (!registry) {
      registry = await prisma.personalItemRegistry.findFirst({
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

    // Public registry - return full data
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
          isObtained: item.isObtained,
          category: item.category,
          storageLocation: item.storageLocation,
        })),
      },
    });
  } catch (error) {
    console.error('Get public item registry error:', error);
    res.status(500).json({
      error: 'Failed to get registry',
      message: error.message,
    });
  }
}

/**
 * Verify passcode and get item registry
 * POST /public/item-registry/:webToken
 * Body: { passcode }
 * No authentication required
 */
async function verifyItemRegistryPasscode(req, res) {
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

    // Try to find in group item registries first
    let registry = await prisma.itemRegistry.findFirst({
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

    // If not found, try personal item registries
    if (!registry) {
      registry = await prisma.personalItemRegistry.findFirst({
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
            isObtained: item.isObtained,
            category: item.category,
            storageLocation: item.storageLocation,
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
          isObtained: item.isObtained,
          category: item.category,
          storageLocation: item.storageLocation,
        })),
      },
    });
  } catch (error) {
    console.error('Verify item registry passcode error:', error);
    res.status(500).json({
      error: 'Failed to verify passcode',
      message: error.message,
    });
  }
}

/**
 * Reset passcode for an item registry
 * POST /groups/:groupId/item-registries/:registryId/reset-passcode
 */
async function resetPasscode(req, res) {
  try {
    const { groupId, registryId } = req.params;

    // Get registry
    const registry = await prisma.itemRegistry.findUnique({
      where: {
        registryId: registryId,
      },
    });

    if (!registry) {
      return res.status(404).json({
        error: 'Registry not found',
        message: 'Item registry not found',
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
    await prisma.itemRegistry.update({
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
        actionLocation: 'item_registry',
        messageContent: `Reset passcode for item registry "${registry.name}"`,
      },
    });

    res.json({
      success: true,
      passcode: newPasscode,
    });
  } catch (error) {
    console.error('Reset item registry passcode error:', error);
    res.status(500).json({
      error: 'Failed to reset passcode',
      message: error.message,
    });
  }
}

module.exports = {
  getItemRegistries,
  getItemRegistryById,
  createItemRegistry,
  updateItemRegistry,
  deleteItemRegistry,
  addItem,
  updateItem,
  deleteItem,
  reorderItems,
  linkPersonalRegistry,
  unlinkPersonalRegistry,
  getPublicItemRegistry,
  verifyItemRegistryPasscode,
  resetPasscode,
};
