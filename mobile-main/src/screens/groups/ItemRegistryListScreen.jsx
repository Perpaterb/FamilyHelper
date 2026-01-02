/**
 * Item Registry List Screen
 *
 * Displays all item registries within a group (both group-owned and linked personal registries).
 * Users can click on a registry to see items and manage the registry.
 * Users can add registries via 3 options: group-only, create personal, or link existing personal.
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Modal, ScrollView, Platform } from 'react-native';
import { CustomAlert } from '../../components/CustomAlert';
import { Card, Title, Text, IconButton, Chip, Button, Divider, ActivityIndicator } from 'react-native-paper';
import SafeAreaFAB from '../../components/SafeAreaFAB';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';

/**
 * @typedef {Object} ItemRegistryListScreenProps
 * @property {Object} navigation - React Navigation navigation object
 * @property {Object} route - React Navigation route object
 */

/**
 * ItemRegistryListScreen component
 *
 * @param {ItemRegistryListScreenProps} props
 * @returns {JSX.Element}
 */
export default function ItemRegistryListScreen({ navigation, route }) {
  const { groupId } = route.params;
  const [groupRegistries, setGroupRegistries] = useState([]);
  const [linkedRegistries, setLinkedRegistries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groupInfo, setGroupInfo] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [currentGroupMemberId, setCurrentGroupMemberId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [personalRegistries, setPersonalRegistries] = useState([]);

  useEffect(() => {
    loadGroupInfo();
  }, [groupId]);

  // Reload registries when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadRegistries();
    }, [groupId])
  );

  // Permission state
  const [canCreate, setCanCreate] = useState(false);

  /**
   * Load group information
   */
  const loadGroupInfo = async () => {
    try {
      const response = await api.get(`/groups/${groupId}`);
      setGroupInfo(response.data.group);
      const role = response.data.group?.userRole || null;
      setUserRole(role);
      setCurrentGroupMemberId(response.data.group?.currentGroupMemberId || null);

      // Check if user can create item registries
      const settings = response.data.group?.settings;
      if (role === 'admin' && settings?.itemRegistryCreatableByAdmins !== false) {
        setCanCreate(true);
      } else if (role === 'parent' && settings?.itemRegistryCreatableByParents !== false) {
        setCanCreate(true);
      } else if (role === 'adult' && settings?.itemRegistryCreatableByAdults !== false) {
        setCanCreate(true);
      } else if (role === 'caregiver' && settings?.itemRegistryCreatableByCaregivers !== false) {
        setCanCreate(true);
      } else if (role === 'child' && settings?.itemRegistryCreatableByChildren !== false) {
        setCanCreate(true);
      } else {
        setCanCreate(false);
      }
    } catch (err) {
      console.error('Load group info error:', err);
    }
  };

  /**
   * Load item registries from API
   */
  const loadRegistries = async () => {
    try {
      setError(null);
      const response = await api.get(`/groups/${groupId}/item-registries`);

      // Handle new response format with group and linked arrays
      if (response.data.registries) {
        setGroupRegistries(response.data.registries.group || []);
        setLinkedRegistries(response.data.registries.linked || []);
      }
    } catch (err) {
      console.error('Load item registries error:', err);

      // Don't show error if it's an auth error
      if (err.isAuthError) {
        console.log('[ItemRegistryList] Auth error detected - user will be logged out');
        return;
      }

      setError(err.response?.data?.message || 'Failed to load item registries');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load user's personal item registries for linking
   */
  const loadPersonalRegistries = async () => {
    try {
      const response = await api.get('/users/personal-registries/item-registries');
      setPersonalRegistries(response.data.registries || []);
    } catch (err) {
      console.error('Load personal registries error:', err);
      CustomAlert.alert('Error', 'Failed to load personal registries');
    }
  };

  /**
   * Navigate to registry detail screen
   * All registries (group and personal_linked) use ItemRegistryDetail
   * because the backend getItemRegistryById handles both types
   */
  const handleRegistryPress = (registry) => {
    navigation.navigate('ItemRegistryDetail', {
      groupId: groupId,
      registryId: registry.registryId,
      registryName: registry.name,
    });
  };

  /**
   * Show add options modal
   */
  const handleShowAddModal = () => {
    setShowAddModal(true);
  };

  /**
   * Option 1: Create group-only registry
   */
  const handleCreateGroupRegistry = () => {
    setShowAddModal(false);
    navigation.navigate('AddEditItemRegistry', {
      groupId: groupId,
      mode: 'create',
    });
  };

  /**
   * Option 2: Create new personal registry (redirects to My Account)
   */
  const handleCreatePersonalRegistry = () => {
    setShowAddModal(false);
    CustomAlert.alert(
      'Create Personal Registry',
      'You will be redirected to My Account to create a personal item registry. After creating it, you can return here and link it to this group.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Go to My Account',
          onPress: () => {
            navigation.navigate('MyAccount');
          },
        },
      ]
    );
  };

  /**
   * Option 3: Link existing personal registry
   */
  const handleLinkExistingRegistry = async () => {
    setShowAddModal(false);
    await loadPersonalRegistries();
    setShowLinkModal(true);
  };

  /**
   * Link a personal registry to this group
   */
  const handleLinkRegistry = async (registryId, registryName) => {
    try {
      await api.post(`/groups/${groupId}/item-registries/${registryId}/link`);
      CustomAlert.alert('Success', `"${registryName}" has been linked to this group.`);
      setShowLinkModal(false);
      loadRegistries(); // Reload list
    } catch (err) {
      console.error('Link registry error:', err);
      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to link registry');
    }
  };

  /**
   * Handle delete registry
   */
  const handleDeleteRegistry = async (registryId, registryName) => {
    CustomAlert.alert(
      'Delete Registry',
      `Are you sure you want to delete "${registryName}"? This will also delete all items in the registry.`,
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
              await api.delete(`/groups/${groupId}/item-registries/${registryId}`);
              loadRegistries(); // Reload list after deletion
            } catch (err) {
              console.error('Delete registry error:', err);

              if (err.isAuthError) {
                console.log('[ItemRegistryList] Auth error detected - user will be logged out');
                return;
              }

              CustomAlert.alert('Error', err.response?.data?.message || 'Failed to delete registry');
            }
          },
        },
      ]
    );
  };

  /**
   * Handle unlink personal registry from group
   */
  const handleUnlinkRegistry = async (registryId, registryName) => {
    CustomAlert.alert(
      'Unlink Registry',
      `Are you sure you want to unlink "${registryName}" from this group? The registry will still exist in your personal registries.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/groups/${groupId}/item-registries/${registryId}/unlink`);
              loadRegistries(); // Reload list after unlinking
            } catch (err) {
              console.error('Unlink registry error:', err);

              if (err.isAuthError) {
                console.log('[ItemRegistryList] Auth error detected - user will be logged out');
                return;
              }

              CustomAlert.alert('Error', err.response?.data?.message || 'Failed to unlink registry');
            }
          },
        },
      ]
    );
  };

  /**
   * Check if user can edit/delete a registry
   * Only creator or admins can edit/delete
   */
  const canEditRegistry = (registry) => {
    return registry.creatorId === currentGroupMemberId || userRole === 'admin';
  };

  /**
   * Get sharing type label
   */
  const getSharingTypeLabel = (sharingType) => {
    switch (sharingType) {
      case 'external_link':
        return 'Public Link';
      case 'external_link_passcode':
        return 'Link with Passcode';
      case 'group_only':
        return 'Group Only';
      case 'public':
        return 'Public';
      case 'passcode':
        return 'Passcode Protected';
      default:
        return sharingType;
    }
  };

  /**
   * Get sharing type color
   */
  const getSharingTypeColor = (sharingType) => {
    switch (sharingType) {
      case 'external_link':
      case 'public':
        return '#4CAF50'; // Green
      case 'external_link_passcode':
      case 'passcode':
        return '#FF9800'; // Orange
      case 'group_only':
        return '#2196F3'; // Blue
      default:
        return '#999';
    }
  };

  /**
   * Render registry card
   */
  const renderRegistry = ({ item }) => {
    const canEdit = canEditRegistry(item);
    const itemCount = item.itemCount || 0;
    const isLinked = item.type === 'personal_linked';

    return (
      <TouchableOpacity
        onPress={() => handleRegistryPress(item)}
        activeOpacity={0.7}
      >
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.registryInfo}>
                <View style={styles.titleRow}>
                  <Title style={styles.registryName}>{item.name}</Title>
                  {isLinked ? (
                    // Only show unlink button for owner or admin
                    (item.isOwner || userRole === 'admin') && (
                      <IconButton
                        icon="link-off"
                        size={20}
                        iconColor="#f44336"
                        onPress={() => handleUnlinkRegistry(item.registryId, item.name)}
                        style={styles.deleteButton}
                      />
                    )
                  ) : (
                    canEdit && (
                      <IconButton
                        icon="delete"
                        size={20}
                        iconColor="#f44336"
                        onPress={() => handleDeleteRegistry(item.registryId, item.name)}
                        style={styles.deleteButton}
                      />
                    )
                  )}
                </View>

                {isLinked && (
                  <Chip
                    icon="account"
                    style={styles.linkedChip}
                    textStyle={styles.linkedChipText}
                  >
                    Personal Registry - {item.owner?.displayName || 'Unknown'}
                  </Chip>
                )}

                <View style={styles.infoRow}>
                  {/* Only show sharing type chip for group-owned registries, not linked personal registries */}
                  {!isLinked && (
                    <Chip
                      icon="package-variant"
                      style={[styles.chip, { backgroundColor: getSharingTypeColor(item.sharingType) + '20' }]}
                      textStyle={[styles.chipText, { color: getSharingTypeColor(item.sharingType) }]}
                    >
                      {getSharingTypeLabel(item.sharingType)}
                    </Chip>
                  )}

                  <Text style={styles.itemCount}>
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  </Text>
                </View>

                {item.sharingType === 'passcode' && item.passcode && (
                  <Text style={styles.passcode}>Passcode: {item.passcode}</Text>
                )}

                {!isLinked && (
                  <Text style={styles.createdBy}>
                    Created by {item.creator?.displayName || 'Unknown'}
                  </Text>
                )}

                {isLinked && item.linkedBy && (
                  <Text style={styles.createdBy}>
                    Linked by {item.linkedBy}
                  </Text>
                )}
              </View>
            </View>
          </Card.Content>
        </Card>
      </TouchableOpacity>
    );
  };

  const allRegistries = [...groupRegistries, ...linkedRegistries];

  if (loading) {
    return (
      <View style={styles.container}>
        <CustomNavigationHeader
          title="Item Registries"
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
        title="Item Registries"
        onBack={() => navigation.goBack()}
      />

      {allRegistries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No item registries yet</Text>
          <Text style={styles.emptySubtext}>
            Create your first item registry to track books, tools, and borrowable items
          </Text>
        </View>
      ) : (
        <FlatList
          data={allRegistries}
          renderItem={renderRegistry}
          keyExtractor={(item) => item.registryId}
          contentContainerStyle={styles.listContent}
        />
      )}

      {canCreate && (
        <SafeAreaFAB
          style={styles.fab}
          icon="plus"
          label="New Registry"
          color="#fff"
          onPress={handleShowAddModal}
        />
      )}

      {/* Add Options Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={[styles.modalOverlay, Platform.OS === 'web' && styles.modalOverlayWeb]}>
          <View style={[styles.modalContent, Platform.OS === 'web' && styles.modalContentWeb]}>
            <Title style={styles.modalTitle}>Add Item Registry</Title>
            <Divider style={styles.modalDivider} />

            <Button
              mode="contained"
              icon="plus-circle"
              onPress={handleCreatePersonalRegistry}
              style={styles.modalButton}
            >
              Add a Personal Item Registry
            </Button>
            <Text style={styles.modalButtonHint}>
              Create a new personal registry and link it to this group
            </Text>

            <Button
              mode="contained"
              icon="link"
              onPress={handleLinkExistingRegistry}
              style={styles.modalButton}
            >
              Link Existing Personal Registry
            </Button>
            <Text style={styles.modalButtonHint}>
              Members of the group will be able to access this registry without a passcode
            </Text>

            <Button
              mode="contained"
              icon="folder"
              onPress={handleCreateGroupRegistry}
              style={styles.modalButton}
            >
              Add Group Only Registry
            </Button>
            <Text style={styles.modalButtonHint}>
              Create a registry specific to this group only
            </Text>

            <Button
              mode="text"
              onPress={() => setShowAddModal(false)}
              style={styles.modalCancelButton}
            >
              Cancel
            </Button>
          </View>
        </View>
      </Modal>

      {/* Link Personal Registry Modal */}
      <Modal
        visible={showLinkModal}
        transparent
        animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
        onRequestClose={() => setShowLinkModal(false)}
      >
        <View style={[styles.modalOverlay, Platform.OS === 'web' && styles.modalOverlayWeb]}>
          <View style={[styles.modalContent, Platform.OS === 'web' && styles.modalContentWeb]}>
            <Title style={styles.modalTitle}>Select Personal Registry</Title>
            <Divider style={styles.modalDivider} />

            <ScrollView style={styles.registryListContainer}>
              {personalRegistries.length === 0 ? (
                <Text style={styles.noRegistriesText}>
                  You don't have any personal item registries yet. Create one from My Account first.
                </Text>
              ) : (
                personalRegistries.map((registry) => (
                  <Card key={registry.registryId} style={styles.linkCard}>
                    <Card.Content>
                      <Text style={styles.linkCardTitle}>{registry.name}</Text>
                      <Text style={styles.linkCardInfo}>
                        {registry.itemCount || 0} items • {getSharingTypeLabel(registry.sharingType)}
                      </Text>
                      <Button
                        mode="contained"
                        onPress={() => handleLinkRegistry(registry.registryId, registry.name)}
                        style={styles.linkButton}
                        compact
                      >
                        Link to Group
                      </Button>
                    </Card.Content>
                  </Card>
                ))
              )}
            </ScrollView>

            <Button
              mode="text"
              onPress={() => setShowLinkModal(false)}
              style={styles.modalCancelButton}
            >
              Cancel
            </Button>
          </View>
        </View>
      </Modal>
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
    padding: 16,
    paddingBottom: 80, // Space for FAB
  },
  card: {
    marginBottom: 12,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  registryInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  registryName: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  deleteButton: {
    margin: 0,
    marginRight: -8,
  },
  linkedChip: {
    backgroundColor: '#e3f2fd',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  linkedChipText: {
    fontSize: 12,
    color: '#1976d2',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  chip: {
    height: 28,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemCount: {
    fontSize: 14,
    color: '#666',
  },
  passcode: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: '600',
    marginBottom: 4,
  },
  createdBy: {
    fontSize: 12,
    color: '#999',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
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
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalOverlayWeb: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  modalContentWeb: {
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalDivider: {
    marginBottom: 16,
  },
  modalButton: {
    marginTop: 16,
    backgroundColor: '#6200ee',
  },
  modalButtonHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    marginLeft: 16,
    marginBottom: 8,
  },
  modalCancelButton: {
    marginTop: 16,
  },
  registryListContainer: {
    maxHeight: 300,
  },
  noRegistriesText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    padding: 20,
  },
  linkCard: {
    marginBottom: 12,
  },
  linkCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  linkCardInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  linkButton: {
    marginTop: 8,
  },
});
