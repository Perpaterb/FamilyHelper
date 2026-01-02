/**
 * Approvals List Screen
 *
 * Shows approval requests organized into 3 lists:
 * 1. Approvals awaiting your action (with Approve/Reject buttons)
 * 2. Approvals you have made awaiting the action of others (with Cancel button)
 * 3. All canceled, rejected or approved approvals (read-only)
 */

import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { CustomAlert } from '../../components/CustomAlert';
import { Card, Text, Button, Avatar, Chip, Divider, List, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { getContrastTextColor } from '../../utils/colorUtils';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';

/**
 * @typedef {Object} ApprovalsListScreenProps
 * @property {Object} navigation - React Navigation navigation object
 * @property {Object} route - React Navigation route object
 */

/**
 * ApprovalsListScreen component
 *
 * @param {ApprovalsListScreenProps} props
 * @returns {JSX.Element}
 */
export default function ApprovalsListScreen({ navigation, route }) {
  const { groupId } = route.params;

  const [awaitingYourAction, setAwaitingYourAction] = useState([]);
  const [awaitingOthers, setAwaitingOthers] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [allAdmins, setAllAdmins] = useState([]);

  useFocusEffect(
    React.useCallback(() => {
      loadApprovals();
    }, [groupId])
  );

  /**
   * Load all approvals for the group
   */
  const loadApprovals = async () => {
    try {
      const [approvalsResponse, groupResponse] = await Promise.all([
        api.get(`/groups/${groupId}/approvals`),
        api.get(`/groups/${groupId}`)
      ]);

      const { approvals, userRole: role } = approvalsResponse.data;
      const { group } = groupResponse.data;

      // Extract all admin members
      const admins = (group.members || []).filter(m => m.role === 'admin');
      setAllAdmins(admins);

      setAwaitingYourAction(approvals.awaitingYourAction || []);
      setAwaitingOthers(approvals.awaitingOthers || []);
      setCompleted(approvals.completed || []);
      setUserRole(role);
    } catch (err) {
      console.error('Load approvals error:', err);
      if (!err.isAuthError) {
        CustomAlert.alert('Error', err.response?.data?.message || 'Failed to load approvals');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /**
   * Handle refresh
   */
  const handleRefresh = () => {
    setRefreshing(true);
    loadApprovals();
  };

  /**
   * Vote on an approval
   */
  const handleVote = async (approvalId, vote) => {
    try {
      await api.post(`/groups/${groupId}/approvals/${approvalId}/vote`, { vote });
      CustomAlert.alert('Success', `You have ${vote === 'approve' ? 'approved' : 'rejected'} this request`);
      loadApprovals(); // Reload to get updated status
    } catch (err) {
      console.error('Vote error:', err);
      if (!err.isAuthError) {
        CustomAlert.alert('Error', err.response?.data?.message || `Failed to ${vote} approval`);
      }
    }
  };

  /**
   * Cancel an approval
   */
  const handleCancel = async (approvalId) => {
    CustomAlert.alert(
      'Cancel Approval',
      'Are you sure you want to cancel this approval request?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/groups/${groupId}/approvals/${approvalId}/cancel`);
              CustomAlert.alert('Success', 'Approval request canceled');
              loadApprovals(); // Reload to get updated status
            } catch (err) {
              console.error('Cancel error:', err);
              if (!err.isAuthError) {
                CustomAlert.alert('Error', err.response?.data?.message || 'Failed to cancel approval');
              }
            }
          }
        }
      ]
    );
  };

  /**
   * Format approval type for display
   */
  const formatApprovalType = (type) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  /**
   * Format date for display
   */
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  /**
   * Get admin vote status for each admin
   * Shows ALL admins who were admins at the time of approval creation
   */
  const getAdminVoteStatuses = (approval) => {
    // Use allAdminStatuses from backend (includes all admins at approval creation time)
    return approval.allAdminStatuses || [];
  };

  /**
   * Get vote status chip style
   */
  const getVoteStatusChipStyle = (voteStatus, isAutoApproved) => {
    if (isAutoApproved) {
      return { backgroundColor: '#e3f2fd', borderColor: '#2196f3' };
    }
    switch (voteStatus) {
      case 'approve':
        return { backgroundColor: '#e8f5e9', borderColor: '#4caf50' };
      case 'reject':
        return { backgroundColor: '#ffebee', borderColor: '#d32f2f' };
      case 'pending':
        return { backgroundColor: '#f5f5f5', borderColor: '#9e9e9e' };
      default:
        return { backgroundColor: '#f5f5f5', borderColor: '#9e9e9e' };
    }
  };

  /**
   * Get vote status text
   */
  const getVoteStatusText = (voteStatus, isAutoApproved) => {
    if (isAutoApproved) {
      return 'Auto-Approved';
    }
    switch (voteStatus) {
      case 'approve':
        return 'Approved';
      case 'reject':
        return 'Rejected';
      case 'pending':
        return 'Pending';
      default:
        return 'Pending';
    }
  };

  /**
   * Render an approval card
   */
  const renderApprovalCard = (approval, type) => {
    const { approvalType, requester, requestedAt, status, description } = approval;
    const bgColor = requester.iconColor || '#6200ee';
    const adminStatuses = getAdminVoteStatuses(approval);

    // Get card background color based on completion status
    let cardStyle = styles.approvalCard;
    if (status === 'approved') {
      cardStyle = [styles.approvalCard, styles.approvedCard];
    } else if (status === 'rejected') {
      cardStyle = [styles.approvalCard, styles.rejectedCard];
    } else if (status === 'canceled') {
      cardStyle = [styles.approvalCard, styles.canceledCard];
    }

    return (
      <Card key={approval.approvalId} style={cardStyle}>
        <Card.Content>
          {/* Header with requester info */}
          <View style={styles.cardHeader}>
            <Avatar.Text
              size={40}
              label={requester.iconLetters || '?'}
              style={{ backgroundColor: bgColor }}
              color={getContrastTextColor(bgColor)}
            />
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.requesterName} numberOfLines={1}>{requester.displayName}</Text>
              <Text style={styles.timeText}>{formatDate(requestedAt)}</Text>
            </View>
            <Chip mode="outlined" style={getStatusChipStyle(status)} textStyle={styles.statusChipText}>
              {status}
            </Chip>
          </View>

          <Divider style={styles.divider} />

          {/* Approval details */}
          <View style={styles.approvalDetails}>
            <Text style={styles.approvalType}>{formatApprovalType(approvalType)}</Text>
            {description && (
              <Text style={styles.approvalDescription}>{description}</Text>
            )}
          </View>

          {/* Admin Vote Statuses */}
          <View style={styles.adminVotesSection}>
            <Text style={styles.adminVotesTitle}>Admin Votes:</Text>
            {adminStatuses.map(admin => (
              <View key={admin.groupMemberId} style={styles.adminVoteRow}>
                <Avatar.Text
                  size={32}
                  label={admin.iconLetters || '?'}
                  style={{ backgroundColor: admin.iconColor || '#6200ee' }}
                  color={getContrastTextColor(admin.iconColor || '#6200ee')}
                />
                <Text style={styles.adminVoteName} numberOfLines={1}>{admin.displayName}</Text>
                <Chip
                  mode="outlined"
                  style={[styles.voteStatusChip, getVoteStatusChipStyle(admin.voteStatus, admin.isAutoApproved)]}
                  textStyle={styles.voteStatusChipText}
                >
                  {getVoteStatusText(admin.voteStatus, admin.isAutoApproved)}
                </Chip>
              </View>
            ))}
          </View>

          {/* Action buttons */}
          {type === 'awaitingYourAction' && (
            <View style={styles.actionButtons}>
              <Button
                mode="contained"
                onPress={() => handleVote(approval.approvalId, 'reject')}
                buttonColor="#d32f2f"
                style={styles.actionButton}
              >
                Reject
              </Button>
              <Button
                mode="contained"
                onPress={() => handleVote(approval.approvalId, 'approve')}
                buttonColor="#4caf50"
                style={styles.actionButton}
              >
                Approve
              </Button>
            </View>
          )}

          {type === 'awaitingOthers' && status === 'pending' && (
            <View style={styles.actionButtons}>
              <Button
                mode="outlined"
                onPress={() => handleCancel(approval.approvalId)}
                textColor="#d32f2f"
                style={styles.actionButton}
              >
                Cancel
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  /**
   * Get chip style based on status
   */
  const getStatusChipStyle = (status) => {
    const baseStyle = { ...styles.statusChip };
    switch (status) {
      case 'approved':
        return { ...baseStyle, backgroundColor: '#e8f5e9', borderColor: '#4caf50' };
      case 'rejected':
        return { ...baseStyle, backgroundColor: '#ffebee', borderColor: '#d32f2f' };
      case 'canceled':
        return { ...baseStyle, backgroundColor: '#f5f5f5', borderColor: '#9e9e9e' };
      default:
        return { ...baseStyle, backgroundColor: '#fff3e0', borderColor: '#ff9800' };
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <CustomNavigationHeader
          title="Approvals"
          onBack={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6200ee" />
        </View>
      </View>
    );
  }

  const hasNoApprovals =
    awaitingYourAction.length === 0 && awaitingOthers.length === 0 && completed.length === 0;

  return (
    <View style={styles.container}>
      {/* Custom Navigation Header */}
      <CustomNavigationHeader
        title="Approvals"
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
      {hasNoApprovals ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No approvals found for this group</Text>
        </View>
      ) : (
        <>
          {/* Awaiting Your Action */}
          {awaitingYourAction.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Awaiting Your Action ({awaitingYourAction.length})</Text>
              {awaitingYourAction.map(approval => renderApprovalCard(approval, 'awaitingYourAction'))}
            </View>
          )}

          {/* Awaiting Others */}
          {awaitingOthers.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Awaiting Others ({awaitingOthers.length})</Text>
              {awaitingOthers.map(approval => renderApprovalCard(approval, 'awaitingOthers'))}
            </View>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Completed ({completed.length})</Text>
              {completed.map(approval => renderApprovalCard(approval, 'completed'))}
            </View>
          )}
        </>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  approvalCard: {
    marginBottom: 12,
    elevation: 2,
  },
  approvedCard: {
    backgroundColor: '#e8f5e9',
  },
  rejectedCard: {
    backgroundColor: '#ffebee',
  },
  canceledCard: {
    backgroundColor: '#f5f5f5',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardHeaderInfo: {
    flex: 1,
    marginLeft: 12,
  },
  requesterName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  timeText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  statusChip: {
    height: 34,
  },
  statusChipText: {
    fontSize: 14,
    textTransform: 'capitalize',
  },
  divider: {
    marginVertical: 12,
  },
  approvalDetails: {
    marginBottom: 12,
  },
  approvalType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  approvalDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  votingProgress: {
    marginBottom: 12,
  },
  votingText: {
    fontSize: 13,
    color: '#666',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    maxWidth: 120,
  },
  adminVotesSection: {
    marginTop: 12,
    marginBottom: 12,
  },
  adminVotesTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  adminVoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 4,
  },
  adminVoteName: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#333',
  },
  voteStatusChip: {
    height: 34,
  },
  voteStatusChipText: {
    fontSize: 14,
  },
});
