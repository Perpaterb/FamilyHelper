/**
 * SecretSantaListScreen
 *
 * Displays list of Secret Santa events in a group.
 * Allows creating new events and viewing existing ones.
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Text, Card, Title, Paragraph, FAB, ActivityIndicator, IconButton, Chip } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';

export default function SecretSantaListScreen({ navigation, route }) {
  const { groupId } = route.params;

  const [secretSantas, setSecretSantas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [canCreate, setCanCreate] = useState(false);

  /**
   * Load group info and check permissions
   */
  const loadGroupInfo = async () => {
    try {
      const response = await api.get(`/groups/${groupId}`);
      const role = response.data.group?.userRole || null;
      const settings = response.data.group?.settings;

      // Check if user can create secret santa events
      if (role === 'admin' && settings?.secretSantaCreatableByAdmins !== false) {
        setCanCreate(true);
      } else if (role === 'parent' && settings?.secretSantaCreatableByParents !== false) {
        setCanCreate(true);
      } else if (role === 'adult' && settings?.secretSantaCreatableByAdults !== false) {
        setCanCreate(true);
      } else if (role === 'caregiver' && settings?.secretSantaCreatableByCaregivers !== false) {
        setCanCreate(true);
      } else if (role === 'child' && settings?.secretSantaCreatableByChildren !== false) {
        setCanCreate(true);
      } else {
        setCanCreate(false);
      }
    } catch (err) {
      console.error('Load group info error:', err);
    }
  };

  /**
   * Load secret santa events
   */
  const loadSecretSantas = async () => {
    try {
      setError(null);
      const response = await api.get(`/groups/${groupId}/kris-kringle`);
      setSecretSantas(response.data.krisKringles || []);
    } catch (err) {
      console.error('Load secret santas error:', err);

      if (err.isAuthError) {
        console.log('[SecretSantaList] Auth error detected - user will be logged out');
        return;
      }

      setError(err.response?.data?.message || 'Failed to load Secret Santa events');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load on mount and when screen gains focus
  useFocusEffect(
    useCallback(() => {
      loadGroupInfo();
      loadSecretSantas();
    }, [groupId])
  );

  /**
   * Handle refresh
   */
  const onRefresh = () => {
    setRefreshing(true);
    loadSecretSantas();
  };

  /**
   * Navigate to create screen
   */
  const handleCreate = () => {
    navigation.navigate('CreateSecretSanta', { groupId });
  };

  /**
   * Navigate to detail screen
   */
  const handlePress = (item) => {
    navigation.navigate('SecretSantaDetail', {
      groupId,
      krisKringleId: item.krisKringleId,
      eventName: item.name,
    });
  };

  /**
   * Format date for display
   */
  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  /**
   * Get status chip color
   */
  const getStatusColor = (status) => {
    switch (status) {
      case 'draft':
        return '#9e9e9e';
      case 'active':
        return '#4caf50';
      case 'completed':
        return '#2196f3';
      default:
        return '#9e9e9e';
    }
  };

  /**
   * Render a secret santa card
   */
  const renderItem = ({ item }) => (
    <Card style={styles.card} onPress={() => handlePress(item)}>
      <Card.Content>
        <View style={styles.cardHeader}>
          <Title style={styles.cardTitle}>{item.name}</Title>
          <Chip
            style={[styles.statusChip, { backgroundColor: getStatusColor(item.status) }]}
            textStyle={styles.statusChipText}
          >
            {item.status}
          </Chip>
        </View>

        {item.occasion && (
          <Paragraph style={styles.occasion}>{item.occasion}</Paragraph>
        )}

        <View style={styles.detailsRow}>
          <View style={styles.detail}>
            <Text style={styles.detailLabel}>Exchange Date</Text>
            <Text style={styles.detailValue}>{formatDate(item.exchangeDate)}</Text>
          </View>
          {item.priceLimit && (
            <View style={styles.detail}>
              <Text style={styles.detailLabel}>Gift Value</Text>
              <Text style={styles.detailValue}>${item.priceLimit}</Text>
            </View>
          )}
        </View>

        <View style={styles.participantsRow}>
          <Text style={styles.participantCount}>
            {item._count?.participants || 0} participants
          </Text>
          {item._count?.matches > 0 && (
            <Text style={styles.matchedText}>• Matched</Text>
          )}
        </View>

        <Text style={styles.creatorText}>
          Created by {item.creator?.displayName || 'Unknown'}
        </Text>
      </Card.Content>
    </Card>
  );

  /**
   * Render empty state
   */
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No Secret Santa events yet</Text>
      <Text style={styles.emptySubtext}>
        Tap the + button to create your first Secret Santa
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <CustomNavigationHeader
          title="Secret Santa"
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
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <IconButton icon="refresh" size={24} onPress={loadSecretSantas} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CustomNavigationHeader
        title="Secret Santa"
        onBack={() => navigation.goBack()}
      />

      <FlatList
        data={secretSantas}
        renderItem={renderItem}
        keyExtractor={(item) => item.krisKringleId}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={renderEmpty}
      />

      {canCreate && (
        <FAB
          icon="plus"
          style={styles.fab}
          label="New Secret Santa"
          color="#fff"
          onPress={handleCreate}
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 16,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    marginBottom: 12,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 18,
  },
  statusChip: {
    marginLeft: 8,
  },
  statusChipText: {
    color: '#fff',
    fontSize: 11,
    textTransform: 'capitalize',
  },
  occasion: {
    color: '#666',
    marginBottom: 12,
  },
  detailsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  detail: {
    marginRight: 24,
  },
  detailLabel: {
    fontSize: 11,
    color: '#666',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  participantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  participantCount: {
    fontSize: 13,
    color: '#666',
  },
  matchedText: {
    fontSize: 13,
    color: '#4caf50',
    marginLeft: 8,
  },
  creatorText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
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
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#6200ee',
  },
});
