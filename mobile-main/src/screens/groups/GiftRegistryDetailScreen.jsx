/**
 * Gift Registry Detail Screen
 *
 * Displays a single gift registry with all its items.
 * Users can add, edit, and delete items based on permissions.
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Linking, Image } from 'react-native';
import { CustomAlert } from '../../components/CustomAlert';
import { Card, Title, Text, FAB, IconButton, Button, Chip, Divider, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import ImageViewer from '../../components/shared/ImageViewer';
import { getFileUrl } from '../../services/upload.service';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';
import CONFIG from '../../constants/config';

/**
 * @typedef {Object} GiftRegistryDetailScreenProps
 * @property {Object} navigation - React Navigation navigation object
 * @property {Object} route - React Navigation route object
 */

/**
 * GiftRegistryDetailScreen component
 *
 * @param {GiftRegistryDetailScreenProps} props
 * @returns {JSX.Element}
 */
export default function GiftRegistryDetailScreen({ navigation, route }) {
  const { groupId, registryId, registryName } = route.params;
  const [registry, setRegistry] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState(null);
  const [error, setError] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [currentGroupMemberId, setCurrentGroupMemberId] = useState(null);

  // Set screen title
  useEffect(() => {
    navigation.setOptions({
      title: registryName || 'Gift Registry',
    });
  }, [navigation, registryName]);

  useEffect(() => {
    loadUserInfo();
  }, [groupId]);

  // Reload registry when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadRegistry();
    }, [registryId])
  );

  /**
   * Load user information
   */
  const loadUserInfo = async () => {
    try {
      const response = await api.get(`/groups/${groupId}`);
      setUserRole(response.data.group?.userRole || null);
      setCurrentGroupMemberId(response.data.group?.currentGroupMemberId || null);
    } catch (err) {
      console.error('Load user info error:', err);
    }
  };

  /**
   * Load gift registry and items from API
   */
  const loadRegistry = async () => {
    try {
      setError(null);
      const response = await api.get(`/groups/${groupId}/gift-registries/${registryId}`);
      setRegistry(response.data.registry);
      setItems(response.data.registry.items || []);
    } catch (err) {
      console.error('Load registry error:', err);

      // Don't show error if it's an auth error
      if (err.isAuthError) {
        console.log('[GiftRegistryDetail] Auth error detected - user will be logged out');
        return;
      }

      setError(err.response?.data?.message || 'Failed to load registry');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Check if user can edit registry items
   * For personal_linked registries: ONLY the owner can edit (not admins)
   * For group registries: creator or admins can edit
   */
  const canEditRegistry = () => {
    if (!registry) return false;

    // For linked personal registries, only the owner can edit
    // Admins should not be able to edit someone else's personal registry items
    if (registry.type === 'personal_linked') {
      return registry.isOwner === true;
    }

    // For group registries: check if user is the creator or an admin
    return registry.creatorId === currentGroupMemberId || userRole === 'admin';
  };

  /**
   * Navigate to edit registry screen
   */
  const handleEditRegistry = () => {
    navigation.navigate('AddEditRegistry', {
      groupId: groupId,
      registryId: registryId,
      mode: 'edit',
      registryData: registry,
    });
  };

  /**
   * Navigate to add item screen
   */
  const handleAddItem = () => {
    navigation.navigate('AddEditGiftItem', {
      groupId: groupId,
      registryId: registryId,
      mode: 'create',
      registryType: registry?.type || 'group',
    });
  };

  /**
   * Navigate to edit item screen
   */
  const handleEditItem = (item) => {
    navigation.navigate('AddEditGiftItem', {
      groupId: groupId,
      registryId: registryId,
      itemId: item.itemId,
      mode: 'edit',
      itemData: item,
      registryType: registry?.type || 'group',
    });
  };

  /**
   * Handle delete item
   */
  const handleDeleteItem = async (itemId, itemTitle) => {
    CustomAlert.alert(
      'Delete Item',
      `Are you sure you want to delete "${itemTitle}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Use appropriate endpoint based on registry type
              const endpoint = registry?.type === 'personal_linked'
                ? `/users/personal-registries/gift-registries/${registryId}/items/${itemId}`
                : `/groups/${groupId}/gift-registries/${registryId}/items/${itemId}`;

              await api.delete(endpoint);
              loadRegistry(); // Reload registry after deletion
            } catch (err) {
              console.error('Delete item error:', err);

              if (err.isAuthError) {
                console.log('[GiftRegistryDetail] Auth error detected - user will be logged out');
                return;
              }

              CustomAlert.alert('Error', err.response?.data?.message || 'Failed to delete item');
            }
          },
        },
      ]
    );
  };

  /**
   * Open link in browser
   */
  const handleOpenLink = (link) => {
    if (!link) return;

    // Add https:// if no protocol specified
    const url = link.startsWith('http://') || link.startsWith('https://')
      ? link
      : `https://${link}`;

    Linking.openURL(url).catch(err => {
      console.error('Failed to open link:', err);
      CustomAlert.alert('Error', 'Failed to open link');
    });
  };

  /**
   * Handle reset passcode
   */
  const handleResetPasscode = async () => {
    CustomAlert.alert(
      'Reset Passcode',
      'This will generate a new 6-digit passcode for this registry. The old passcode will no longer work.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset',
          onPress: async () => {
            try {
              await api.post(`/groups/${groupId}/gift-registries/${registryId}/reset-passcode`);
              loadRegistry(); // Reload to show new passcode
              CustomAlert.alert('Success', 'Passcode has been reset');
            } catch (err) {
              console.error('Reset passcode error:', err);

              if (err.isAuthError) {
                console.log('[GiftRegistryDetail] Auth error detected - user will be logged out');
                return;
              }

              CustomAlert.alert('Error', err.response?.data?.message || 'Failed to reset passcode');
            }
          },
        },
      ]
    );
  };

  /**
   * Get sharing type label
   */
  const getSharingTypeLabel = (sharingType) => {
    switch (sharingType) {
      case 'public':
        return 'Public';
      case 'passcode':
        return 'Passcode Protected';
      case 'group_only':
        return 'Group Only';
      default:
        return sharingType;
    }
  };

  /**
   * Format cost
   */
  const formatCost = (cost) => {
    if (!cost) return null;
    return `$${parseFloat(cost).toFixed(2)}`;
  };

  /**
   * Handle mark item as purchased
   */
  const handleMarkAsPurchased = (item) => {
    CustomAlert.alert(
      'Mark as Purchased',
      'Are you sure you want to mark this item as purchased? This action cannot be undone, and the registry owner will not see this item anymore.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Mark as Purchased',
          onPress: async () => {
            try {
              await api.post(`/groups/${groupId}/gift-registries/${registryId}/items/${item.itemId}/mark-purchased`);
              loadRegistry(); // Reload registry after marking as purchased
              CustomAlert.alert('Success', 'Item marked as purchased');
            } catch (err) {
              console.error('Mark as purchased error:', err);

              if (err.isAuthError) {
                console.log('[GiftRegistryDetail] Auth error detected - user will be logged out');
                return;
              }

              CustomAlert.alert('Error', err.response?.data?.message || 'Failed to mark item as purchased');
            }
          },
        },
      ]
    );
  };

  /**
   * Render gift item
   */
  const renderItem = ({ item, index }) => {
    const canEdit = canEditRegistry();
    const isOwner = registry?.isOwner || false;
    const isPurchased = item.isPurchased || false;

    return (
      <Card style={[styles.itemCard, isPurchased && styles.purchasedCard]}>
        <Card.Content>
          <View style={styles.itemHeader}>
            <View style={styles.itemNumberContainer}>
              <Text style={styles.itemNumber}>#{index + 1}</Text>
              {isPurchased && (
                <Chip icon="check-circle" style={styles.purchasedChip} textStyle={styles.purchasedChipText}>
                  Secretly Purchased
                </Chip>
              )}
            </View>
            {canEdit && !isPurchased && (
              <View style={styles.itemActions}>
                <IconButton
                  icon="pencil"
                  size={20}
                  iconColor="#6200ee"
                  onPress={() => handleEditItem(item)}
                  style={styles.actionButton}
                />
                <IconButton
                  icon="delete"
                  size={20}
                  iconColor="#f44336"
                  onPress={() => handleDeleteItem(item.itemId, item.title)}
                  style={styles.actionButton}
                />
              </View>
            )}
          </View>

          {item.photoUrl && (
            <TouchableOpacity
              onPress={() => {
                setSelectedImageUrl(getFileUrl(item.photoUrl));
                setShowImageViewer(true);
              }}
            >
              <Image
                source={{ uri: getFileUrl(item.photoUrl) }}
                style={[styles.itemPhoto, isPurchased && styles.purchasedPhoto]}
                resizeMode="cover"
              />
            </TouchableOpacity>
          )}

          <Title style={[styles.itemTitle, isPurchased && styles.purchasedText]}>{item.title}</Title>

          {item.cost && (
            <Text style={[styles.itemCost, isPurchased && styles.purchasedText]}>{formatCost(item.cost)}</Text>
          )}

          {item.description && (
            <Text style={[styles.itemDescription, isPurchased && styles.purchasedText]}>{item.description}</Text>
          )}

          {item.link && !isPurchased && (
            <Button
              mode="outlined"
              icon="open-in-new"
              onPress={() => handleOpenLink(item.link)}
              style={styles.linkButton}
            >
              View Product
            </Button>
          )}

          {/* Show "Mark as Purchased" button for non-owners and non-purchased items */}
          {!isOwner && !isPurchased && (
            <Button
              mode="contained"
              icon="cart-check"
              onPress={() => handleMarkAsPurchased(item)}
              style={styles.markPurchasedButton}
            >
              Mark as Purchased
            </Button>
          )}
        </Card.Content>
      </Card>
    );
  };

  /**
   * Render header
   */
  const renderHeader = () => {
    if (!registry) return null;

    const canEdit = canEditRegistry();

    return (
      <View style={styles.header}>
        <Card style={styles.infoCard}>
          <Card.Content>
            <View style={styles.infoHeader}>
              <Title style={styles.registryTitle}>{registry.name}</Title>
              {canEdit && (
                <IconButton
                  icon="pencil"
                  size={24}
                  iconColor="#6200ee"
                  onPress={handleEditRegistry}
                  style={styles.editButton}
                />
              )}
            </View>

            <View style={styles.metaRow}>
              <Chip icon="gift" style={styles.sharingChip}>
                {getSharingTypeLabel(registry.sharingType)}
              </Chip>
            </View>

            {registry.sharingType === 'passcode' && registry.passcode && (
              <View style={styles.passcodeSection}>
                <Text style={styles.passcodeLabel}>Passcode:</Text>
                <Text style={styles.passcodeValue}>{registry.passcode}</Text>
                {canEdit && (
                  <Button
                    mode="text"
                    onPress={handleResetPasscode}
                    compact
                    style={styles.resetButton}
                  >
                    Reset
                  </Button>
                )}
              </View>
            )}

            <Text style={styles.createdBy}>
              Created by {registry.creator?.displayName || 'Unknown'}
            </Text>

            {registry.webToken && (
              <View style={styles.webTokenSection}>
                <Text style={styles.webTokenLabel}>Share Link:</Text>
                <Text
                  style={styles.webTokenValue}
                  selectable
                >
                  {`${CONFIG.WEB_APP_URL}/gift-registry/${registry.webToken}`}
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        <View style={styles.itemsHeader}>
          <Title style={styles.itemsTitle}>
            {items.length} {items.length === 1 ? 'Item' : 'Items'}
          </Title>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <CustomNavigationHeader
          title="Registry Details"
          onBack={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6200ee" />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Custom Navigation Header */}
      <CustomNavigationHeader
        title="Registry Details"
        onBack={() => navigation.goBack()}
      />

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.itemId}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No items yet</Text>
            <Text style={styles.emptySubtext}>
              Add items to this gift registry
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      {canEditRegistry() && (
        <FAB
          style={styles.fab}
          icon="plus"
          label="Add Item"
          color="#fff"
          onPress={handleAddItem}
        />
      )}

      {/* Image Viewer */}
      {selectedImageUrl && (
        <ImageViewer
          visible={showImageViewer}
          imageUrl={selectedImageUrl}
          onClose={() => setShowImageViewer(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 80, // Space for FAB
  },
  header: {
    padding: 16,
  },
  infoCard: {
    marginBottom: 16,
    elevation: 2,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  registryTitle: {
    fontSize: 24,
    fontWeight: '700',
    flex: 1,
  },
  editButton: {
    margin: 0,
    marginRight: -8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sharingChip: {
    backgroundColor: '#e3f2fd',
  },
  passcodeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#fff3e0',
    borderRadius: 8,
  },
  passcodeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginRight: 8,
  },
  passcodeValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF9800',
    flex: 1,
  },
  resetButton: {
    marginLeft: 8,
  },
  createdBy: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  webTokenSection: {
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginTop: 8,
  },
  webTokenLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  webTokenValue: {
    fontSize: 12,
    color: '#6200ee',
    fontFamily: 'monospace',
  },
  itemsHeader: {
    marginBottom: 8,
  },
  itemsTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  itemCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemNumberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  itemNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    margin: 0,
  },
  purchasedCard: {
    backgroundColor: '#f5f5f5',
    opacity: 0.85,
  },
  purchasedChip: {
    backgroundColor: '#4CAF50',
  },
  purchasedChipText: {
    color: '#fff',
    fontSize: 12,
  },
  purchasedPhoto: {
    opacity: 0.6,
  },
  purchasedText: {
    color: '#999',
    textDecorationLine: 'line-through',
  },
  itemPhoto: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemCost: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
    marginBottom: 8,
  },
  itemDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  linkButton: {
    marginTop: 8,
  },
  markPurchasedButton: {
    marginTop: 12,
    backgroundColor: '#4CAF50',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#f44336',
    textAlign: 'center',
    padding: 16,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#6200ee',
  },
});
