/**
 * Personal Item Registries Screen
 *
 * Allows users to manage their personal item registries from My Account.
 * Users can create, edit, view, and delete their personal item registries (books, tools, equipment).
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { CustomAlert } from '../../components/CustomAlert';
import { Card, Title, Text, Button, ActivityIndicator, Divider, IconButton } from 'react-native-paper';
import SafeAreaFAB from '../../components/SafeAreaFAB';
import api from '../../services/api';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';

/**
 * @typedef {Object} PersonalItemRegistriesScreenProps
 * @property {Object} navigation - React Navigation navigation object
 */

/**
 * PersonalItemRegistriesScreen component
 *
 * @param {PersonalItemRegistriesScreenProps} props
 * @returns {JSX.Element}
 */
export default function PersonalItemRegistriesScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [registries, setRegistries] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadRegistries();
  }, []);

  /**
   * Load personal item registries
   */
  const loadRegistries = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get('/users/personal-registries/item-registries');

      if (response.data.success) {
        setRegistries(response.data.registries || []);
      }
    } catch (err) {
      console.error('Load registries error:', err);
      setError('Failed to load item registries');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Navigate to create new registry
   */
  const handleCreateRegistry = () => {
    navigation.navigate('AddEditPersonalItemRegistry', {
      mode: 'create',
      onSave: loadRegistries,
    });
  };

  /**
   * Navigate to edit registry
   */
  const handleEditRegistry = (registry) => {
    navigation.navigate('AddEditPersonalItemRegistry', {
      mode: 'edit',
      registryId: registry.registryId,
      registryName: registry.name,
      sharingType: registry.sharingType,
      onSave: loadRegistries,
    });
  };

  /**
   * Navigate to view registry items
   */
  const handleViewRegistry = (registry) => {
    navigation.navigate('PersonalItemRegistryDetail', {
      registryId: registry.registryId,
      registryName: registry.name,
      sharingType: registry.sharingType,
      onUpdate: loadRegistries,
    });
  };

  /**
   * Delete a registry
   */
  const handleDeleteRegistry = (registry) => {
    CustomAlert.alert(
      'Delete Registry',
      `Are you sure you want to delete "${registry.name}"? This will remove all items and unlink it from any groups.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/users/personal-registries/item-registries/${registry.registryId}`);
              CustomAlert.alert('Success', 'Registry deleted successfully');
              loadRegistries();
            } catch (err) {
              console.error('Delete registry error:', err);
              CustomAlert.alert('Error', err.response?.data?.message || 'Failed to delete registry');
            }
          },
        },
      ]
    );
  };

  /**
   * Get sharing type display text
   */
  const getSharingTypeText = (sharingType) => {
    if (sharingType === 'external_link') {
      return 'Public Link';
    }
    if (sharingType === 'external_link_passcode') {
      return 'Link with Passcode';
    }
    return sharingType;
  };

  /**
   * Get sharing type color
   */
  const getSharingTypeColor = (sharingType) => {
    if (sharingType === 'external_link') {
      return '#4caf50'; // Green for public
    }
    if (sharingType === 'external_link_passcode') {
      return '#ff9800'; // Orange for passcode protected
    }
    return '#666';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={styles.loadingText}>Loading item registries...</Text>
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

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {error && (
          <Card style={styles.errorCard}>
            <Card.Content>
              <Text style={styles.errorText}>{error}</Text>
            </Card.Content>
          </Card>
        )}

        {registries.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Card.Content>
              <Text style={styles.emptyText}>
                You don't have any item registries yet. Create your first one to get started!
              </Text>
              <Text style={styles.emptyHint}>
                Item registries can be used to track books, tools, equipment, or any other items you own or lend.
              </Text>
              <Button
                mode="contained"
                onPress={handleCreateRegistry}
                icon="plus"
                style={styles.createButton}
              >
                Create Item Registry
              </Button>
            </Card.Content>
          </Card>
        ) : (
          <>
            <Text style={styles.listHeader}>My Item Registries ({registries.length})</Text>
            {registries.map((registry) => (
              <Card key={registry.registryId} style={styles.registryCard}>
                <TouchableOpacity onPress={() => handleViewRegistry(registry)}>
                  <Card.Content>
                    <View style={styles.cardHeader}>
                      <Title style={styles.registryName}>{registry.name}</Title>
                      <View style={styles.cardActions}>
                        <IconButton
                          icon="pencil"
                          size={20}
                          onPress={() => handleEditRegistry(registry)}
                        />
                        <IconButton
                          icon="delete"
                          size={20}
                          iconColor="#d32f2f"
                          onPress={() => handleDeleteRegistry(registry)}
                        />
                      </View>
                    </View>

                    <Divider style={styles.divider} />

                    <View style={styles.registryInfo}>
                      <Text style={styles.infoLabel}>Items:</Text>
                      <Text style={styles.infoValue}>{registry.itemCount || 0}</Text>
                    </View>

                    <View style={styles.registryInfo}>
                      <Text style={styles.infoLabel}>Sharing:</Text>
                      <View
                        style={[
                          styles.sharingBadge,
                          { backgroundColor: getSharingTypeColor(registry.sharingType) },
                        ]}
                      >
                        <Text style={styles.sharingText}>
                          {getSharingTypeText(registry.sharingType)}
                        </Text>
                      </View>
                    </View>

                    {registry.linkedToGroups && registry.linkedToGroups.length > 0 && (
                      <View style={styles.registryInfo}>
                        <Text style={styles.infoLabel}>Linked to:</Text>
                        <Text style={styles.infoValue}>
                          {registry.linkedToGroups.length} group(s)
                        </Text>
                      </View>
                    )}

                    <Text style={styles.createdDate}>
                      Created: {new Date(registry.createdAt).toLocaleDateString()}
                    </Text>
                  </Card.Content>
                </TouchableOpacity>
              </Card>
            ))}
          </>
        )}
      </ScrollView>

      {/* Floating Action Button */}
      <SafeAreaFAB
        style={styles.fab}
        icon="plus"
        label="New Registry"
        color="#fff"
        onPress={handleCreateRegistry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80, // Space for FAB
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
  errorCard: {
    marginBottom: 16,
    backgroundColor: '#ffebee',
  },
  errorText: {
    color: '#d32f2f',
  },
  emptyCard: {
    marginTop: 32,
    elevation: 2,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 24,
  },
  emptyHint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  createButton: {
    marginTop: 8,
    backgroundColor: '#6200ee',
  },
  listHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  registryCard: {
    marginBottom: 12,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  registryName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
  },
  divider: {
    marginVertical: 8,
  },
  registryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
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
  sharingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sharingText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
  },
  createdDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#6200ee',
  },
});
