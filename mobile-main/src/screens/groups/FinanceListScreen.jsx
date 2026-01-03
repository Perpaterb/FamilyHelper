/**
 * Finance List Screen
 *
 * Displays all finance matters within a group.
 * Users can click on a finance matter to see details.
 * "Create Finance Request" button visibility is based on role permissions.
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Card, Title, Text, Avatar, Chip, Badge, ActivityIndicator } from 'react-native-paper';
import SafeAreaFAB from '../../components/SafeAreaFAB';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { getContrastTextColor } from '../../utils/colorUtils';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';

/**
 * @typedef {Object} FinanceListScreenProps
 * @property {Object} navigation - React Navigation navigation object
 * @property {Object} route - React Navigation route object
 */

/**
 * FinanceListScreen component
 *
 * @param {FinanceListScreenProps} props
 * @returns {JSX.Element}
 */
export default function FinanceListScreen({ navigation, route }) {
  const { groupId } = route.params;
  const [financeMatters, setFinanceMatters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groupInfo, setGroupInfo] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [canCreate, setCanCreate] = useState(false);

  useEffect(() => {
    loadGroupInfo();
  }, [groupId]);

  // Reload finance matters when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadFinanceMatters();
    }, [groupId])
  );

  /**
   * Load group information and determine create permissions
   */
  const loadGroupInfo = async () => {
    try {
      const response = await api.get(`/groups/${groupId}`);
      const group = response.data.group;
      setGroupInfo(group);
      setUserRole(group?.userRole || null);

      // Check if user can create finance matters
      const role = group?.userRole;
      const settings = group?.settings;

      if (role === 'admin' && settings?.financeCreatableByAdmins !== false) {
        setCanCreate(true);
      } else if (role === 'parent' && settings?.financeCreatableByParents !== false) {
        setCanCreate(true);
      } else if (role === 'adult' && settings?.financeCreatableByAdults !== false) {
        setCanCreate(true);
      } else if (role === 'caregiver' && settings?.financeCreatableByCaregivers !== false) {
        setCanCreate(true);
      } else if (role === 'child' && settings?.financeCreatableByChildren !== false) {
        setCanCreate(true);
      } else {
        setCanCreate(false);
      }
    } catch (err) {
      console.error('Load group info error:', err);
    }
  };

  /**
   * Load finance matters from API
   */
  const loadFinanceMatters = async () => {
    try {
      setError(null);
      const response = await api.get(`/groups/${groupId}/finance-matters`);
      setFinanceMatters(response.data.financeMatters || []);
    } catch (err) {
      console.error('Load finance matters error:', err);

      // Don't show error if it's an auth error
      if (err.isAuthError) {
        console.log('[FinanceList] Auth error detected - user will be logged out');
        return;
      }

      setError(err.response?.data?.message || 'Failed to load finance matters');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Navigate to finance matter details screen
   */
  const handleFinanceMatterPress = (financeMatter) => {
    navigation.navigate('FinanceMatterDetails', {
      groupId: groupId,
      financeMatterId: financeMatter.financeMatterId,
      financeMatterName: financeMatter.name,
    });
  };

  /**
   * Navigate to create finance matter screen
   */
  const handleCreateFinanceMatter = () => {
    navigation.navigate('CreateFinanceMatter', {
      groupId: groupId,
    });
  };

  /**
   * Format due date
   */
  const formatDueDate = (dueDate) => {
    if (!dueDate) return 'No due date';

    const date = new Date(dueDate);
    const now = new Date();
    const diffMs = date - now;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)} days`;
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    if (diffDays < 7) return `Due in ${diffDays} days`;

    return date.toLocaleDateString();
  };

  /**
   * Calculate pending amount for a finance matter
   */
  const calculatePendingAmount = (financeMatter) => {
    if (financeMatter.isSettled) return 0;

    const totalPaid = financeMatter.members?.reduce((sum, member) => {
      return sum + (parseFloat(member.paidAmount) || 0);
    }, 0) || 0;

    const totalExpected = parseFloat(financeMatter.totalAmount) || 0;
    return totalExpected - totalPaid;
  };

  /**
   * Render finance matter card
   */
  const renderFinanceMatter = ({ item }) => {
    const pendingAmount = calculatePendingAmount(item);
    const isOverdue = item.dueDate && new Date(item.dueDate) < new Date() && !item.isSettled;

    return (
      <TouchableOpacity
        onPress={() => handleFinanceMatterPress(item)}
        activeOpacity={0.7}
      >
        <Card style={[styles.card, item.isSettled && styles.settledCard, item.isCanceled && styles.canceledCard]}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.financeInfo}>
                <View style={styles.titleRow}>
                  <Title style={styles.financeName}>{item.name}</Title>
                  {item.isSettled && (
                    <Chip mode="outlined" style={styles.settledChip} textStyle={styles.settledChipText}>
                      Settled
                    </Chip>
                  )}
                  {item.isCanceled && (
                    <Chip mode="outlined" style={styles.canceledChip} textStyle={styles.canceledChipText}>
                      Canceled
                    </Chip>
                  )}
                </View>
                {item.description && (
                  <Text style={styles.description} numberOfLines={2}>
                    {item.description}
                  </Text>
                )}
                <View style={styles.amountRow}>
                  <Text style={styles.totalAmount}>
                    {item.currency} {parseFloat(item.totalAmount).toFixed(2)}
                  </Text>
                  {!item.isSettled && pendingAmount > 0 && (
                    <Text style={[styles.pendingAmount, isOverdue && styles.overdueText]}>
                      {pendingAmount.toFixed(2)} pending
                    </Text>
                  )}
                </View>
                <Text style={[styles.dueDate, isOverdue && styles.overdueText]}>
                  {formatDueDate(item.dueDate)}
                </Text>
              </View>
              <View style={styles.badgeContainer}>
                {!item.isSettled && pendingAmount > 0 && (
                  <Badge size={24} style={[styles.badge, isOverdue && styles.overdueBadge]}>
                    !
                  </Badge>
                )}
              </View>
            </View>

            {/* Show involved members */}
            <View style={styles.membersRow}>
              {item.members?.slice(0, 5).map((member, index) => {
                const bgColor = member.groupMember?.iconColor || '#6200ee';
                return (
                  <Avatar.Text
                    key={member.groupMemberId}
                    size={32}
                    label={member.groupMember?.iconLetters || '?'}
                    style={{
                      backgroundColor: bgColor,
                      marginLeft: index > 0 ? -6 : 0,
                    }}
                    color={getContrastTextColor(bgColor)}
                  />
                );
              })}
              {item.members?.length > 5 && (
                <Text style={styles.moreMembersText}>
                  +{item.members.length - 5}
                </Text>
              )}
            </View>
          </Card.Content>
        </Card>
      </TouchableOpacity>
    );
  };

  /**
   * Render empty state
   */
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>No finance matters yet</Text>
      <Text style={styles.emptySubtext}>
        {canCreate
          ? 'Create a finance matter to track expenses and payments'
          : 'No finance matters have been created yet'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <CustomNavigationHeader
          title="Finance"
          onBack={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6200ee" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Custom Navigation Header */}
      <CustomNavigationHeader
        title="Finance"
        onBack={() => navigation.goBack()}
      />

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={financeMatters}
        renderItem={renderFinanceMatter}
        keyExtractor={(item) => item.financeMatterId}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
      />

      {/* Only show FAB if user has permission to create */}
      {canCreate && (
        <SafeAreaFAB
          style={styles.fab}
          icon="plus"
          label="New Finance Request"
          color="#fff"
          onPress={handleCreateFinanceMatter}
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
  errorBanner: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ffcdd2',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  card: {
    marginBottom: 12,
    elevation: 2,
  },
  settledCard: {
    opacity: 0.7,
    backgroundColor: '#e8f5e9',
  },
  canceledCard: {
    backgroundColor: '#ffebee',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  financeInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  financeName: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  settledChip: {
    backgroundColor: '#c8e6c9',
    borderColor: '#4caf50',
    marginLeft: 8,
  },
  settledChipText: {
    color: '#2e7d32',
    fontSize: 12,
  },
  canceledChip: {
    backgroundColor: '#ffebee',
    borderColor: '#c62828',
    marginLeft: 8,
  },
  canceledChipText: {
    color: '#c62828',
    fontSize: 12,
  },
  description: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  pendingAmount: {
    fontSize: 14,
    color: '#f57c00',
    fontWeight: '500',
  },
  dueDate: {
    fontSize: 13,
    color: '#999',
  },
  overdueText: {
    color: '#d32f2f',
    fontWeight: 'bold',
  },
  badgeContainer: {
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#ffa726',
  },
  overdueBadge: {
    backgroundColor: '#d32f2f',
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  moreMembersText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#666',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#6200ee',
  },
});
