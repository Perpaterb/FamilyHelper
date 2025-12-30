/**
 * Support Screen
 *
 * Support-only screen for managing users.
 * Features:
 * - List all users with search
 * - Toggle subscription access
 * - Toggle support user access
 * - Lock/unlock accounts
 * - View support audit logs
 *
 * React Native Paper version for web-admin.
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import {
  Text,
  Button,
  Card,
  Title,
  Paragraph,
  Surface,
  ActivityIndicator,
  Divider,
  IconButton,
  Chip,
  Portal,
  Dialog,
  TextInput,
  Switch,
  DataTable,
  Avatar,
  SegmentedButtons,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../services/api';
import { getContrastTextColor } from '../utils/colorUtils';

export default function SupportScreen({ navigation }) {
  // Tab state
  const [activeTab, setActiveTab] = useState('users');

  // Users state
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [userTotalPages, setUserTotalPages] = useState(1);
  const [userTotal, setUserTotal] = useState(0);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState(null);
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [logActionFilter, setLogActionFilter] = useState('');

  // Action state
  const [actionLoading, setActionLoading] = useState(null); // userId being actioned
  const [successMessage, setSuccessMessage] = useState(null);

  // Lock dialog state
  const [lockDialogVisible, setLockDialogVisible] = useState(false);
  const [userToLock, setUserToLock] = useState(null);
  const [lockReason, setLockReason] = useState('');

  // Subscription end date editing state
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingEndDate, setEditingEndDate] = useState('');

  // Expire subscription dialog state
  const [expireDialogVisible, setExpireDialogVisible] = useState(false);
  const [userToExpire, setUserToExpire] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, [searchQuery, userPage]);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchAuditLogs();
    }
  }, [activeTab, logPage, logActionFilter]);

  async function fetchUsers() {
    try {
      setUsersLoading(true);
      setUsersError(null);
      const response = await api.get('/support/users', {
        params: {
          search: searchQuery,
          page: userPage,
          limit: 20,
        },
      });
      setUsers(response.data.users || []);
      setUserTotalPages(response.data.pagination?.totalPages || 1);
      setUserTotal(response.data.pagination?.total || 0);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setUsersError('Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }

  async function fetchAuditLogs() {
    try {
      setLogsLoading(true);
      setLogsError(null);
      const response = await api.get('/support/audit-logs', {
        params: {
          page: logPage,
          limit: 50,
          action: logActionFilter || undefined,
        },
      });
      setAuditLogs(response.data.logs || []);
      setLogTotalPages(response.data.pagination?.totalPages || 1);
      setLogTotal(response.data.pagination?.total || 0);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      setLogsError('Failed to load audit logs');
    } finally {
      setLogsLoading(false);
    }
  }

  async function handleUpdateSubscriptionEndDate(user) {
    if (!editingEndDate) {
      setUsersError('Please enter a valid date');
      return;
    }

    const newDate = new Date(editingEndDate);
    if (newDate <= new Date()) {
      setUsersError('Subscription end date must be in the future');
      return;
    }

    try {
      setActionLoading(user.userId);
      await api.put(`/support/users/${user.userId}/subscription-end-date`, {
        subscriptionEndDate: newDate.toISOString(),
      });
      setSuccessMessage(`Subscription end date updated for ${user.email}`);
      setEditingUserId(null);
      setEditingEndDate('');
      fetchUsers();
    } catch (err) {
      console.error('Failed to update subscription end date:', err);
      setUsersError(err.response?.data?.error || 'Failed to update subscription end date');
    } finally {
      setActionLoading(null);
    }
  }

  function startEditingEndDate(user) {
    setEditingUserId(user.userId);
    // Use the displayed date (from subscription status) as default
    const subStatus = getSubscriptionStatus(user);
    if (subStatus.date) {
      const date = new Date(subStatus.date);
      setEditingEndDate(date.toISOString().split('T')[0]); // YYYY-MM-DD format
    } else if (user.subscriptionEndDate) {
      // Fallback to raw subscription end date
      const date = new Date(user.subscriptionEndDate);
      setEditingEndDate(date.toISOString().split('T')[0]);
    } else {
      setEditingEndDate('');
    }
  }

  function cancelEditingEndDate() {
    setEditingUserId(null);
    setEditingEndDate('');
  }

  function getSubscriptionStatus(user) {
    // Check if subscription was manually expired by support
    if (user.subscriptionManuallyExpired) {
      return { status: 'Manually Expired', color: '#d32f2f', date: user.subscriptionEndDate };
    }

    // Calculate trial end date (20 days from account creation)
    const trialEndDate = new Date(user.createdAt);
    trialEndDate.setDate(trialEndDate.getDate() + 20);
    const isOnTrial = !user.isSubscribed && trialEndDate > new Date();

    if (user.isSubscribed && user.subscriptionEndDate) {
      const endDate = new Date(user.subscriptionEndDate);
      const now = new Date();
      const isPermanent = endDate.getFullYear() - now.getFullYear() > 5;
      if (isPermanent) {
        return { status: 'Permanent', color: '#4caf50', date: null };
      }
      return {
        status: 'Subscribed',
        color: '#2196f3',
        date: user.subscriptionEndDate,
      };
    } else if (isOnTrial) {
      return { status: 'Trial', color: '#ff9800', date: trialEndDate.toISOString() };
    } else {
      return { status: 'Expired', color: '#d32f2f', date: null };
    }
  }

  function formatDateShort(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  async function handleToggleSupportAccess(user) {
    try {
      setActionLoading(user.userId);
      await api.put(`/support/users/${user.userId}/support-access`, {
        grant: !user.isSupportUser,
      });
      setSuccessMessage(
        user.isSupportUser
          ? `Support access revoked from ${user.email}`
          : `Support access granted to ${user.email}`
      );
      fetchUsers();
    } catch (err) {
      console.error('Failed to toggle support access:', err);
      setUsersError(err.response?.data?.error || 'Failed to update support access');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleToggleLock(user) {
    if (!user.isLocked) {
      // Opening lock dialog
      setUserToLock(user);
      setLockReason('');
      setLockDialogVisible(true);
    } else {
      // Unlocking directly
      try {
        setActionLoading(user.userId);
        await api.put(`/support/users/${user.userId}/lock`, {
          lock: false,
        });
        setSuccessMessage(`Account unlocked for ${user.email}`);
        fetchUsers();
      } catch (err) {
        console.error('Failed to unlock account:', err);
        setUsersError(err.response?.data?.error || 'Failed to unlock account');
      } finally {
        setActionLoading(null);
      }
    }
  }

  async function handleLockConfirm() {
    if (!userToLock) return;

    try {
      setActionLoading(userToLock.userId);
      await api.put(`/support/users/${userToLock.userId}/lock`, {
        lock: true,
        reason: lockReason || 'Locked by support',
      });
      setSuccessMessage(`Account locked for ${userToLock.email}`);
      setLockDialogVisible(false);
      setUserToLock(null);
      setLockReason('');
      fetchUsers();
    } catch (err) {
      console.error('Failed to lock account:', err);
      setUsersError(err.response?.data?.error || 'Failed to lock account');
    } finally {
      setActionLoading(null);
    }
  }

  function handleExpireClick(user) {
    setUserToExpire(user);
    setExpireDialogVisible(true);
  }

  async function handleExpireConfirm() {
    if (!userToExpire) return;

    try {
      setActionLoading(userToExpire.userId);
      const response = await api.put(`/support/users/${userToExpire.userId}/expire-subscription`);
      const { groupsAffected } = response.data;

      let message = `Subscription expired for ${userToExpire.email}.`;
      if (groupsAffected?.readOnly?.length > 0) {
        message += ` ${groupsAffected.readOnly.length} group(s) now read-only.`;
      }
      if (groupsAffected?.roleChanges?.length > 0) {
        message += ` ${groupsAffected.roleChanges.length} role change(s) to adult.`;
      }

      setSuccessMessage(message);
      setExpireDialogVisible(false);
      setUserToExpire(null);
      fetchUsers();
    } catch (err) {
      console.error('Failed to expire subscription:', err);
      setUsersError(err.response?.data?.error || 'Failed to expire subscription');
    } finally {
      setActionLoading(null);
    }
  }

  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getActionLabel(action) {
    const labels = {
      grant_subscription: 'Granted Subscription',
      revoke_subscription: 'Revoked Subscription',
      update_subscription_end_date: 'Updated Sub End Date',
      grant_support: 'Granted Support Access',
      revoke_support: 'Revoked Support Access',
      lock_user: 'Locked Account',
      unlock_user: 'Unlocked Account',
    };
    return labels[action] || action;
  }

  function getActionColor(action) {
    if (action.includes('grant')) return '#4caf50';
    if (action.includes('revoke')) return '#ff9800';
    if (action === 'update_subscription_end_date') return '#9c27b0';
    if (action === 'lock_user') return '#d32f2f';
    if (action === 'unlock_user') return '#2196f3';
    return '#666';
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Title style={styles.pageTitle}>Support Dashboard</Title>
        <Paragraph style={styles.pageSubtitle}>
          Manage users and view support audit logs
        </Paragraph>

        {/* Success Message */}
        {successMessage && (
          <Surface style={styles.alertSuccess}>
            <Text style={styles.alertSuccessText}>{successMessage}</Text>
            <Button compact onPress={() => setSuccessMessage(null)}>
              Dismiss
            </Button>
          </Surface>
        )}

        {/* Error Message */}
        {usersError && (
          <Surface style={styles.alertError}>
            <Text style={styles.alertErrorText}>{usersError}</Text>
            <Button compact onPress={() => setUsersError(null)}>
              Dismiss
            </Button>
          </Surface>
        )}

        {/* Tab Selector */}
        <SegmentedButtons
          value={activeTab}
          onValueChange={setActiveTab}
          buttons={[
            { value: 'users', label: 'Users', icon: 'account-group' },
            { value: 'logs', label: 'Support Audit Logs', icon: 'history' },
          ]}
          style={styles.tabSelector}
        />

        {/* Users Tab */}
        {activeTab === 'users' && (
          <>
            {/* Search */}
            <Card style={styles.card}>
              <Card.Content>
                <TextInput
                  label="Search users by email or name"
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    setUserPage(1);
                  }}
                  mode="outlined"
                  left={<TextInput.Icon icon="magnify" />}
                  right={
                    searchQuery ? (
                      <TextInput.Icon
                        icon="close"
                        onPress={() => setSearchQuery('')}
                      />
                    ) : null
                  }
                />
                <Text style={styles.resultCount}>
                  {userTotal} user{userTotal !== 1 ? 's' : ''} found
                </Text>
              </Card.Content>
            </Card>

            {/* Users List */}
            <Card style={styles.card}>
              <Card.Content>
                <Title>Users</Title>
                <Divider style={styles.divider} />

                {usersLoading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" />
                    <Text style={styles.loadingText}>Loading users...</Text>
                  </View>
                ) : users.length === 0 ? (
                  <Text style={styles.noResultsText}>
                    {searchQuery
                      ? 'No users match your search'
                      : 'No users found'}
                  </Text>
                ) : (
                  <DataTable>
                    <DataTable.Header>
                      <DataTable.Title style={styles.userColumn}>User</DataTable.Title>
                      <DataTable.Title style={styles.statusColumn}>Status</DataTable.Title>
                      <DataTable.Title style={styles.subscriptionColumn}>Subscription End Date</DataTable.Title>
                      <DataTable.Title style={styles.supportColumn}>Support</DataTable.Title>
                      <DataTable.Title style={styles.expireColumn}>Expire</DataTable.Title>
                      <DataTable.Title style={styles.lockColumn}>Lock</DataTable.Title>
                    </DataTable.Header>

                    {users.map((user) => {
                      const subStatus = getSubscriptionStatus(user);
                      const isEditing = editingUserId === user.userId;

                      return (
                        <DataTable.Row key={user.userId}>
                          <DataTable.Cell style={styles.userColumn}>
                            <View style={styles.userCell}>
                              <Avatar.Text
                                size={32}
                                label={user.memberIcon || user.displayName?.substring(0, 2) || '?'}
                                style={{
                                  backgroundColor: user.iconColor || '#6200ee',
                                }}
                                color={getContrastTextColor(user.iconColor || '#6200ee')}
                              />
                              <View style={styles.userInfo}>
                                <Text style={styles.userName} numberOfLines={1}>
                                  {user.displayName || 'No name'}
                                </Text>
                                <Text style={styles.userEmail} numberOfLines={1}>
                                  {user.email}
                                </Text>
                              </View>
                            </View>
                          </DataTable.Cell>

                          <DataTable.Cell style={styles.statusColumn}>
                            <View style={styles.statusBadges}>
                              <Chip
                                style={[styles.statusChip, { backgroundColor: subStatus.color + '20' }]}
                                textStyle={[styles.statusChipText, { color: subStatus.color }]}
                              >
                                {subStatus.status}
                              </Chip>
                              {user.isLocked && (
                                <Chip
                                  style={styles.lockedChip}
                                  textStyle={styles.lockedChipText}
                                  icon="lock"
                                >
                                  Locked
                                </Chip>
                              )}
                              {user.isSupportUser && (
                                <Chip
                                  style={styles.supportChip}
                                  textStyle={styles.supportChipText}
                                  icon="shield-account"
                                >
                                  Support
                                </Chip>
                              )}
                            </View>
                          </DataTable.Cell>

                          <DataTable.Cell style={styles.subscriptionColumn}>
                            {isEditing ? (
                              <View style={styles.editDateContainer}>
                                <TextInput
                                  value={editingEndDate}
                                  onChangeText={setEditingEndDate}
                                  mode="outlined"
                                  dense
                                  placeholder="YYYY-MM-DD"
                                  style={styles.dateInput}
                                />
                                <IconButton
                                  icon="check"
                                  iconColor="#4caf50"
                                  size={18}
                                  onPress={() => handleUpdateSubscriptionEndDate(user)}
                                  disabled={actionLoading === user.userId}
                                />
                                <IconButton
                                  icon="close"
                                  iconColor="#d32f2f"
                                  size={18}
                                  onPress={cancelEditingEndDate}
                                />
                                {actionLoading === user.userId && (
                                  <ActivityIndicator size="small" />
                                )}
                              </View>
                            ) : (
                              <View style={styles.dateDisplayContainer}>
                                <Text style={styles.dateText}>
                                  {subStatus.date ? formatDateShort(subStatus.date) : '—'}
                                </Text>
                                <IconButton
                                  icon="pencil"
                                  iconColor="#666"
                                  size={16}
                                  onPress={() => startEditingEndDate(user)}
                                  style={styles.editButton}
                                />
                              </View>
                            )}
                          </DataTable.Cell>

                          <DataTable.Cell style={styles.supportColumn}>
                            <View style={styles.switchContainer}>
                              <Switch
                                value={user.isSupportUser}
                                onValueChange={() => handleToggleSupportAccess(user)}
                                disabled={actionLoading === user.userId}
                              />
                            </View>
                          </DataTable.Cell>

                          <DataTable.Cell style={styles.expireColumn}>
                            <IconButton
                              icon="clock-alert-outline"
                              iconColor={subStatus.status === 'Expired' || subStatus.status === 'Manually Expired' ? '#999' : '#ff9800'}
                              size={20}
                              onPress={() => handleExpireClick(user)}
                              disabled={actionLoading === user.userId || subStatus.status === 'Expired' || subStatus.status === 'Manually Expired'}
                            />
                          </DataTable.Cell>

                          <DataTable.Cell style={styles.lockColumn}>
                            <IconButton
                              icon={user.isLocked ? 'lock-open' : 'lock'}
                              iconColor={user.isLocked ? '#4caf50' : '#d32f2f'}
                              size={20}
                              onPress={() => handleToggleLock(user)}
                              disabled={actionLoading === user.userId}
                            />
                          </DataTable.Cell>
                        </DataTable.Row>
                      );
                    })}
                  </DataTable>
                )}

                {/* Pagination */}
                {userTotalPages > 1 && (
                  <View style={styles.pagination}>
                    <Button
                      mode="outlined"
                      onPress={() => setUserPage((p) => Math.max(1, p - 1))}
                      disabled={userPage === 1}
                      compact
                    >
                      Previous
                    </Button>
                    <Text style={styles.pageInfo}>
                      Page {userPage} of {userTotalPages}
                    </Text>
                    <Button
                      mode="outlined"
                      onPress={() => setUserPage((p) => Math.min(userTotalPages, p + 1))}
                      disabled={userPage === userTotalPages}
                      compact
                    >
                      Next
                    </Button>
                  </View>
                )}
              </Card.Content>
            </Card>
          </>
        )}

        {/* Audit Logs Tab */}
        {activeTab === 'logs' && (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.logsHeader}>
                <Title>Support Audit Logs</Title>
                <View style={styles.logFilters}>
                  <TextInput
                    label="Filter by action"
                    value={logActionFilter}
                    onChangeText={(text) => {
                      setLogActionFilter(text);
                      setLogPage(1);
                    }}
                    mode="outlined"
                    dense
                    style={styles.logFilterInput}
                    placeholder="e.g., grant_subscription"
                  />
                </View>
              </View>
              <Divider style={styles.divider} />

              {logsLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" />
                  <Text style={styles.loadingText}>Loading audit logs...</Text>
                </View>
              ) : logsError ? (
                <Surface style={styles.alertError}>
                  <Text style={styles.alertErrorText}>{logsError}</Text>
                </Surface>
              ) : auditLogs.length === 0 ? (
                <Text style={styles.noResultsText}>No audit logs found</Text>
              ) : (
                <>
                  <Text style={styles.resultCount}>
                    {logTotal} log entr{logTotal !== 1 ? 'ies' : 'y'}
                  </Text>

                  {auditLogs.map((log) => (
                    <Surface key={log.logId} style={styles.logEntry}>
                      <View style={styles.logHeader}>
                        <Chip
                          style={[
                            styles.actionChip,
                            { backgroundColor: getActionColor(log.action) + '20' },
                          ]}
                          textStyle={[
                            styles.actionChipText,
                            { color: getActionColor(log.action) },
                          ]}
                        >
                          {getActionLabel(log.action)}
                        </Chip>
                        <Text style={styles.logDate}>
                          {formatDate(log.createdAt)}
                        </Text>
                      </View>

                      <View style={styles.logBody}>
                        <View style={styles.logRow}>
                          <Text style={styles.logLabel}>Performed by:</Text>
                          <Text style={styles.logValue}>{log.performedByEmail}</Text>
                        </View>
                        <View style={styles.logRow}>
                          <Text style={styles.logLabel}>Target user:</Text>
                          <Text style={styles.logValue}>{log.targetUserEmail}</Text>
                        </View>
                        {log.details && (
                          <View style={styles.logRow}>
                            <Text style={styles.logLabel}>Details:</Text>
                            <Text style={styles.logValue}>{log.details}</Text>
                          </View>
                        )}
                        {log.ipAddress && (
                          <View style={styles.logRow}>
                            <Text style={styles.logLabel}>IP:</Text>
                            <Text style={styles.logValueMuted}>{log.ipAddress}</Text>
                          </View>
                        )}
                      </View>
                    </Surface>
                  ))}

                  {/* Pagination */}
                  {logTotalPages > 1 && (
                    <View style={styles.pagination}>
                      <Button
                        mode="outlined"
                        onPress={() => setLogPage((p) => Math.max(1, p - 1))}
                        disabled={logPage === 1}
                        compact
                      >
                        Previous
                      </Button>
                      <Text style={styles.pageInfo}>
                        Page {logPage} of {logTotalPages}
                      </Text>
                      <Button
                        mode="outlined"
                        onPress={() => setLogPage((p) => Math.min(logTotalPages, p + 1))}
                        disabled={logPage === logTotalPages}
                        compact
                      >
                        Next
                      </Button>
                    </View>
                  )}
                </>
              )}
            </Card.Content>
          </Card>
        )}

        {/* Info Box */}
        <Surface style={styles.infoBox}>
          <MaterialCommunityIcons name="information" size={20} color="#1976d2" />
          <Text style={styles.infoText}>
            All support actions are logged and cannot be deleted. This ensures
            accountability and compliance with audit requirements.
          </Text>
        </Surface>
      </View>

      {/* Lock Confirmation Dialog */}
      <Portal>
        <Dialog
          visible={lockDialogVisible}
          onDismiss={() => setLockDialogVisible(false)}
        >
          <Dialog.Title>Lock User Account</Dialog.Title>
          <Dialog.Content>
            <Paragraph>
              Lock account for {userToLock?.email}?
            </Paragraph>
            <Paragraph style={styles.dialogWarning}>
              This will prevent the user from accessing their account.
            </Paragraph>
            <TextInput
              label="Reason for locking (optional)"
              value={lockReason}
              onChangeText={setLockReason}
              mode="outlined"
              multiline
              numberOfLines={2}
              style={styles.lockReasonInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLockDialogVisible(false)}>Cancel</Button>
            <Button
              onPress={handleLockConfirm}
              loading={actionLoading === userToLock?.userId}
              textColor="#d32f2f"
            >
              Lock Account
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Expire Subscription Dialog */}
      <Portal>
        <Dialog
          visible={expireDialogVisible}
          onDismiss={() => setExpireDialogVisible(false)}
        >
          <Dialog.Title>Expire Subscription</Dialog.Title>
          <Dialog.Content>
            <Paragraph>
              Expire subscription for {userToExpire?.email}?
            </Paragraph>
            <Paragraph style={styles.dialogWarning}>
              This will set their subscription end date to yesterday.
            </Paragraph>
            <Paragraph style={styles.dialogInfo}>
              • Groups where they're the only admin will become read-only{'\n'}
              • In groups with other admins, their role will change to adult
            </Paragraph>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setExpireDialogVisible(false)}>Cancel</Button>
            <Button
              onPress={handleExpireConfirm}
              loading={actionLoading === userToExpire?.userId}
              textColor="#ff9800"
            >
              Expire Subscription
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 24,
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  pageTitle: {
    fontSize: 28,
    marginBottom: 8,
  },
  pageSubtitle: {
    color: '#666',
    marginBottom: 24,
  },
  tabSelector: {
    marginBottom: 16,
  },
  // Alert styles
  alertError: {
    backgroundColor: '#ffebee',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertErrorText: {
    color: '#c62828',
    flex: 1,
  },
  alertSuccess: {
    backgroundColor: '#e8f5e9',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertSuccessText: {
    color: '#2e7d32',
    flex: 1,
  },
  // Cards
  card: {
    marginBottom: 16,
  },
  divider: {
    marginVertical: 12,
  },
  // Loading
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#666',
  },
  noResultsText: {
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 24,
  },
  resultCount: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
  },
  // Users table
  userColumn: {
    flex: 3,
  },
  statusColumn: {
    flex: 2,
  },
  subscriptionColumn: {
    flex: 2,
    justifyContent: 'center',
  },
  supportColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  expireColumn: {
    flex: 0.5,
    justifyContent: 'center',
  },
  lockColumn: {
    flex: 0.5,
    justifyContent: 'center',
  },
  userCell: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  userInfo: {
    marginLeft: 12,
    flex: 1,
  },
  userName: {
    fontWeight: '500',
    fontSize: 14,
  },
  userEmail: {
    fontSize: 12,
    color: '#666',
  },
  statusBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  lockedChip: {
    backgroundColor: '#ffebee',
    height: 24,
  },
  lockedChipText: {
    fontSize: 10,
    color: '#d32f2f',
  },
  supportChip: {
    backgroundColor: '#e3f2fd',
    height: 24,
  },
  supportChipText: {
    fontSize: 10,
    color: '#1565c0',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionLoader: {
    marginLeft: 8,
  },
  // Pagination
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    gap: 16,
  },
  pageInfo: {
    color: '#666',
  },
  // Audit logs
  logsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  logFilters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logFilterInput: {
    width: 200,
  },
  logEntry: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    elevation: 1,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionChip: {
    height: 28,
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  logDate: {
    fontSize: 12,
    color: '#666',
  },
  logBody: {
    gap: 6,
  },
  logRow: {
    flexDirection: 'row',
    gap: 8,
  },
  logLabel: {
    fontSize: 13,
    color: '#666',
    width: 100,
  },
  logValue: {
    fontSize: 13,
    flex: 1,
  },
  logValueMuted: {
    fontSize: 12,
    color: '#999',
    flex: 1,
  },
  // Info box
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 12,
    color: '#1565c0',
    lineHeight: 18,
  },
  // Dialog
  dialogWarning: {
    marginTop: 8,
    color: '#e65100',
    fontSize: 12,
  },
  dialogInfo: {
    marginTop: 12,
    color: '#666',
    fontSize: 12,
    lineHeight: 20,
  },
  lockReasonInput: {
    marginTop: 16,
  },
  // Subscription status chip
  statusChip: {
    height: 24,
  },
  statusChipText: {
    fontSize: 10,
  },
  // Date editing
  editDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateInput: {
    width: 110,
    height: 36,
    fontSize: 12,
  },
  dateDisplayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 13,
    color: '#333',
  },
  editButton: {
    margin: 0,
    marginLeft: 4,
  },
});
