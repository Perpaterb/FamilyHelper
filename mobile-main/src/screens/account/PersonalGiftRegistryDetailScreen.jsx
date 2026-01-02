/**
 * Personal Gift Registry Detail Screen
 *
 * Displays a single personal gift registry with all its items.
 * Users can view sharing information and manage items.
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, FlatList, TouchableOpacity, Linking, Image } from 'react-native';
import { CustomAlert } from '../../components/CustomAlert';
import { Card, Title, Text, Button, Divider, Chip, ActivityIndicator, IconButton } from 'react-native-paper';
import SafeAreaFAB from '../../components/SafeAreaFAB';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import ImageViewer from '../../components/shared/ImageViewer';
import { getFileUrl } from '../../services/upload.service';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';
import CONFIG from '../../constants/config';

/**
 * @typedef {Object} PersonalGiftRegistryDetailScreenProps
 * @property {Object} navigation - React Navigation navigation object
 * @property {Object} route - React Navigation route object
 */

/**
 * PersonalGiftRegistryDetailScreen component
 *
 * @param {PersonalGiftRegistryDetailScreenProps} props
 * @returns {JSX.Element}
 */
export default function PersonalGiftRegistryDetailScreen({ navigation, route }) {
  const { registryId, registryName, sharingType, onUpdate, fromGroup } = route.params;
  const [registry, setRegistry] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState(null);
  const [isOwner, setIsOwner] = useState(true); // Default to true for backwards compatibility

  // Set screen title
  useEffect(() => {
    navigation.setOptions({
      title: registryName || 'Gift Registry',
    });
  }, [navigation, registryName]);

  // Reload registry when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadRegistry();
    }, [registryId])
  );

  /**
   * Load gift registry from API
   */
  const loadRegistry = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get(`/users/personal-registries/gift-registries/${registryId}`);
      setRegistry(response.data.registry);
      setItems(response.data.registry.items || []);
      setIsOwner(response.data.registry.isOwner !== false); // Backend returns isOwner flag
    } catch (err) {
      console.error('Load registry error:', err);

      if (err.isAuthError) {
        console.log('[PersonalGiftRegistryDetail] Auth error detected - user will be logged out');
        return;
      }

      setError(err.response?.data?.message || 'Failed to load registry');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get sharing type display text
   */
  const getSharingTypeText = (type) => {
    // If viewing from a group (fromGroup is true), show "Linked to Group" instead of sharing type
    if (fromGroup) {
      return 'Linked to Group';
    }

    if (type === 'external_link') {
      return 'Public Link';
    }
    if (type === 'external_link_passcode') {
      return 'Link with Passcode';
    }
    return type;
  };

  /**
   * Get sharing type color
   */
  const getSharingTypeColor = (type) => {
    if (type === 'external_link') {
      return '#4caf50'; // Green for public
    }
    if (type === 'external_link_passcode') {
      return '#ff9800'; // Orange for passcode protected
    }
    return '#666';
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
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await api.put(`/users/personal-registries/gift-registries/${registryId}/reset-passcode`);
              CustomAlert.alert(
                'Passcode Reset',
                `New passcode: ${response.data.passcode}\n\nPlease save this passcode and share it with people who need access to this registry.`,
                [{ text: 'OK', onPress: loadRegistry }]
              );
            } catch (err) {
              console.error('Reset passcode error:', err);
              CustomAlert.alert('Error', err.response?.data?.message || 'Failed to reset passcode');
            }
          },
        },
      ]
    );
  };

  /**
   * Navigate to add item screen
   */
  const handleAddItem = () => {
    navigation.navigate('AddEditPersonalGiftItem', {
      registryId: registryId,
      mode: 'create',
    });
  };

  /**
   * Navigate to edit item screen
   */
  const handleEditItem = (item) => {
    navigation.navigate('AddEditPersonalGiftItem', {
      registryId: registryId,
      itemId: item.itemId,
      mode: 'edit',
      itemData: item,
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
              await api.delete(`/users/personal-registries/gift-registries/${registryId}/items/${itemId}`);
              loadRegistry(); // Reload registry after deletion
            } catch (err) {
              console.error('Delete item error:', err);

              if (err.isAuthError) {
                console.log('[PersonalGiftRegistryDetail] Auth error detected - user will be logged out');
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
   * Format cost
   */
  const formatCost = (cost) => {
    if (!cost) return null;
    return `$${parseFloat(cost).toFixed(2)}`;
  };

  /**
   * Render gift item
   */
  const renderItem = ({ item, index }) => {
    return (
      <Card style={styles.itemCard}>
        <Card.Content>
          <View style={styles.itemHeader}>
            <Text style={styles.itemNumber}>#{index + 1}</Text>
            {isOwner && (
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
                style={styles.itemPhoto}
                resizeMode="cover"
              />
            </TouchableOpacity>
          )}

          <Title style={styles.itemTitle}>{item.title}</Title>

          {item.cost && (
            <Text style={styles.itemCost}>{formatCost(item.cost)}</Text>
          )}

          {item.description && (
            <Text style={styles.itemDescription}>{item.description}</Text>
          )}

          {item.link && (
            <Button
              mode="outlined"
              icon="open-in-new"
              onPress={() => handleOpenLink(item.link)}
              style={styles.linkButton}
            >
              View Product
            </Button>
          )}
        </Card.Content>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={styles.loadingText}>Loading registry...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Button mode="contained" onPress={loadRegistry} style={styles.retryButton}>
          Retry
        </Button>
      </View>
    );
  }

  if (!registry) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Registry not found</Text>
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
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={() => (
          <View style={styles.header}>
            {/* Registry Info Card */}
            <Card style={styles.card}>
              <Card.Content>
                <Title>{registry.name}</Title>
                <Divider style={styles.divider} />

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Sharing:</Text>
                  <Chip
                    style={[styles.sharingChip, { backgroundColor: getSharingTypeColor(registry.sharingType) }]}
                    textStyle={styles.sharingText}
                  >
                    {getSharingTypeText(registry.sharingType)}
                  </Chip>
                </View>

                {registry.sharingType === 'external_link_passcode' && registry.passcode && (
                  <View style={styles.passcodeContainer}>
                    <Text style={styles.passcodeLabel}>Passcode:</Text>
                    <Text style={styles.passcodeValue}>{registry.passcode}</Text>
                    <Button
                      mode="outlined"
                      onPress={handleResetPasscode}
                      icon="refresh"
                      style={styles.resetButton}
                      compact
                    >
                      Reset Passcode
                    </Button>
                  </View>
                )}

                {registry.webToken && (
                  <View style={styles.linkContainer}>
                    <Text style={styles.linkLabel}>Share Link:</Text>
                    <Text style={styles.linkValue} selectable>
                      {`${CONFIG.WEB_APP_URL}/gift-registry/${registry.webToken}`}
                    </Text>
                    <Text style={styles.linkHint}>
                      Anyone with this link {registry.sharingType === 'external_link_passcode' ? 'and passcode ' : ''}
                      can view this registry
                    </Text>
                  </View>
                )}

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Items:</Text>
                  <Text style={styles.infoValue}>{items.length}</Text>
                </View>

                {registry.linkedToGroups && registry.linkedToGroups.length > 0 && (
                  <View style={styles.linkedGroupsContainer}>
                    <Text style={styles.linkedGroupsLabel}>Linked to Groups:</Text>
                    {registry.linkedToGroups.map((group, index) => (
                      <Chip key={index} style={styles.groupChip}>
                        {group.groupName}
                      </Chip>
                    ))}
                  </View>
                )}

                <Text style={styles.createdDate}>
                  Created: {new Date(registry.createdAt).toLocaleDateString()}
                </Text>
              </Card.Content>
            </Card>

            {/* Items Header */}
            <View style={styles.itemsHeader}>
              <Title style={styles.itemsTitle}>
                {items.length} {items.length === 1 ? 'Item' : 'Items'}
              </Title>
            </View>
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No items in this registry yet.</Text>
            <Text style={styles.emptyHint}>
              Tap the + button below to add your first item.
            </Text>
          </View>
        )}
      />

      {/* FAB for adding items - only show for owner */}
      {isOwner && (
        <SafeAreaFAB
          icon="plus"
          style={styles.fab}
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
  listContent: {
    paddingBottom: 80, // Space for FAB
  },
  header: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    marginTop: 8,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  divider: {
    marginVertical: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
  },
  sharingChip: {
    height: 28,
  },
  sharingText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
  },
  passcodeContainer: {
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  passcodeLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  passcodeValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    letterSpacing: 4,
    marginBottom: 8,
  },
  resetButton: {
    marginTop: 8,
  },
  linkContainer: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  linkLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  linkValue: {
    fontSize: 12,
    color: '#1976d2',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  linkHint: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  linkedGroupsContainer: {
    marginBottom: 12,
  },
  linkedGroupsLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    fontWeight: '500',
  },
  groupChip: {
    marginBottom: 4,
    marginRight: 4,
  },
  createdDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  itemsHeader: {
    marginBottom: 8,
  },
  itemsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
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
  itemNumber: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  itemActions: {
    flexDirection: 'row',
  },
  actionButton: {
    margin: 0,
  },
  itemPhoto: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  itemCost: {
    fontSize: 16,
    color: '#6200ee',
    fontWeight: '600',
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
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#6200ee',
  },
});
