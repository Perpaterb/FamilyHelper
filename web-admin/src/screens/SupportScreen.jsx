/**
 * Support Screen
 *
 * Simplified support-only screen for managing users.
 * Features:
 * - List users by email only
 * - Toggle support/lock status
 * - Set "subscribed till" date (sets both renewalDate and subscriptionEndDate)
 * - Expire subscription (sets both dates to yesterday)
 * - Expandable billing history
 * - View support audit logs
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
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
  SegmentedButtons,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../services/api';

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

  // Expanded user for billing history
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [billingHistory, setBillingHistory] = useState([]);
  const [billingLoading, setBillingLoading] = useState(false);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState(null);
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [logActionFilter, setLogActionFilter] = useState('');

  // Action state
  const [actionLoading, setActionLoading] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Lock dialog state
  const [lockDialogVisible, setLockDialogVisible] = useState(false);
  const [userToLock, setUserToLock] = useState(null);
  const [lockReason, setLockReason] = useState('');

  // Subscribe till dialog state
  const [subscribeTillDialogVisible, setSubscribeTillDialogVisible] = useState(false);
  const [userToSubscribe, setUserToSubscribe] = useState(null);
  const [subscribeTillDate, setSubscribeTillDate] = useState('');

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

  async function fetchBillingHistory(userId) {
    try {
      setBillingLoading(true);
      const response = await api.get(`/support/users/${userId}/billing-history`);
      setBillingHistory(response.data.billingHistory || []);
    } catch (err) {
      console.error('Failed to fetch billing history:', err);
      setBillingHistory([]);
    } finally {
      setBillingLoading(false);
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

  function toggleExpandUser(userId) {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setBillingHistory([]);
    } else {
      setExpandedUserId(userId);
      fetchBillingHistory(userId);
    }
  }

  function getSubscriptionStatus(user) {
    // Calculate trial end date (20 days from account creation)
    const trialEndDate = new Date(user.createdAt);
    trialEndDate.setDate(trialEndDate.getDate() + 20);
    const isOnTrial = !user.isSubscribed && trialEndDate > new Date();

    if (user.isSubscribed) {
      return { status: 'Subscribed', color: '#4caf50' };
    } else if (isOnTrial) {
      return { status: 'Trial', color: '#ff9800' };
    } else {
      return { status: 'Expired', color: '#d32f2f' };
    }
  }

  function formatDateShort(dateString) {
    if (!dateString) return '—';
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
      setUserToLock(user);
      setLockReason('');
      setLockDialogVisible(true);
    } else {
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

  function handleSubscribeTillClick(user) {
    setUserToSubscribe(user);
    // Default to 1 year from now
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    setSubscribeTillDate(oneYearFromNow.toISOString().split('T')[0]);
    setSubscribeTillDialogVisible(true);
  }

  async function handleSubscribeTillConfirm() {
    if (!userToSubscribe || !subscribeTillDate) return;

    try {
      setActionLoading(userToSubscribe.userId);
      await api.put(`/support/users/${userToSubscribe.userId}/subscribe-till`, {
        date: subscribeTillDate,
      });
      setSuccessMessage(`Subscription set till ${subscribeTillDate} for ${userToSubscribe.email}`);
      setSubscribeTillDialogVisible(false);
      setUserToSubscribe(null);
      setSubscribeTillDate('');
      fetchUsers();
    } catch (err) {
      console.error('Failed to set subscription:', err);
      setUsersError(err.response?.data?.error || 'Failed to set subscription');
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
      subscribe_till: 'Set Subscribe Till',
      update_subscription_end_date: 'Updated Sub End Date',
      update_renewal_date: 'Updated Renewal Date',
      expire_subscription: 'Expired Subscription',
      grant_support: 'Granted Support Access',
      revoke_support: 'Revoked Support Access',
      lock_user: 'Locked Account',
      unlock_user: 'Unlocked Account',
    };
    return labels[action] || action;
  }

  function getActionColor(action) {
    if (action.includes('grant') || action === 'subscribe_till') return '#4caf50';
    if (action.includes('revoke') || action === 'expire_subscription') return '#ff9800';
    if (action === 'update_subscription_end_date' || action === 'update_renewal_date')
      return '#9c27b0';
    if (action === 'lock_user') return '#d32f2f';
    if (action === 'unlock_user') return '#2196f3';
    return '#666';
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Title style={styles.pageTitle}>Support Dashboard</Title>
        <Paragraph style={styles.pageSubtitle}>Manage users and view support audit logs</Paragraph>

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
                  label="Search by email"
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    setUserPage(1);
                  }}
                  mode="outlined"
                  left={<TextInput.Icon icon="magnify" />}
                  right={
                    searchQuery ? (
                      <TextInput.Icon icon="close" onPress={() => setSearchQuery('')} />
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
                    {searchQuery ? 'No users match your search' : 'No users found'}
                  </Text>
                ) : (
                  <View style={styles.usersList}>
                    {/* Header Row */}
                    <View style={styles.tableHeader}>
                      <Text style={[styles.headerCell, styles.emailCol]}>Email</Text>
                      <Text style={[styles.headerCell, styles.statusCol]}>Status</Text>
                      <Text style={[styles.headerCell, styles.dateCol]}>Due Date</Text>
                      <Text style={[styles.headerCell, styles.actionsCol]}>Actions</Text>
                    </View>

                    {users.map((user) => {
                      const subStatus = getSubscriptionStatus(user);
                      const isExpanded = expandedUserId === user.userId;

                      return (
                        <View key={user.userId}>
                          {/* User Row */}
                          <TouchableOpacity
                            style={styles.userRow}
                            onPress={() => toggleExpandUser(user.userId)}
                          >
                            {/* Email */}
                            <View style={[styles.cell, styles.emailCol]}>
                              <MaterialCommunityIcons
                                name={isExpanded ? 'chevron-down' : 'chevron-right'}
                                size={20}
                                color="#666"
                              />
                              <Text style={styles.emailText} numberOfLines={1}>
                                {user.email}
                              </Text>
                            </View>

                            {/* Status badges */}
                            <View style={[styles.cell, styles.statusCol]}>
                              <View style={styles.statusBadges}>
                                <Chip
                                  style={[
                                    styles.statusChip,
                                    { backgroundColor: subStatus.color + '20' },
                                  ]}
                                  textStyle={[styles.statusChipText, { color: subStatus.color }]}
                                >
                                  {subStatus.status}
                                </Chip>
                                {user.isSupportUser && (
                                  <Chip
                                    style={styles.supportChip}
                                    textStyle={styles.supportChipText}
                                    icon="shield-account"
                                  >
                                    Support
                                  </Chip>
                                )}
                                {user.isLocked && (
                                  <Chip
                                    style={styles.lockedChip}
                                    textStyle={styles.lockedChipText}
                                    icon="lock"
                                  >
                                    Locked
                                  </Chip>
                                )}
                              </View>
                            </View>

                            {/* Due Date */}
                            <View style={[styles.cell, styles.dateCol]}>
                              <Text style={styles.dateText}>
                                {formatDateShort(user.renewalDate)}
                              </Text>
                            </View>

                            {/* Actions */}
                            <View style={[styles.cell, styles.actionsCol]}>
                              <View style={styles.actionsRow}>
                                {/* Support Toggle */}
                                <View style={styles.actionItem}>
                                  <Text style={styles.actionLabel}>Support</Text>
                                  <Switch
                                    value={user.isSupportUser}
                                    onValueChange={() => handleToggleSupportAccess(user)}
                                    disabled={actionLoading === user.userId}
                                  />
                                </View>

                                {/* Lock Toggle */}
                                <IconButton
                                  icon={user.isLocked ? 'lock-open' : 'lock'}
                                  iconColor={user.isLocked ? '#4caf50' : '#d32f2f'}
                                  size={22}
                                  onPress={() => handleToggleLock(user)}
                                  disabled={actionLoading === user.userId}
                                  style={styles.actionButton}
                                />

                                {/* Subscribe Till */}
                                <IconButton
                                  icon="calendar-plus"
                                  iconColor="#2196f3"
                                  size={22}
                                  onPress={() => handleSubscribeTillClick(user)}
                                  disabled={actionLoading === user.userId}
                                  style={styles.actionButton}
                                />

                                {/* Expire */}
                                <IconButton
                                  icon="clock-alert-outline"
                                  iconColor={subStatus.status === 'Expired' ? '#999' : '#ff9800'}
                                  size={22}
                                  onPress={() => handleExpireClick(user)}
                                  disabled={
                                    actionLoading === user.userId ||
                                    subStatus.status === 'Expired'
                                  }
                                  style={styles.actionButton}
                                />
                              </View>
                            </View>
                          </TouchableOpacity>

                          {/* Expanded Billing History */}
                          {isExpanded && (
                            <View style={styles.expandedSection}>
                              <Text style={styles.expandedTitle}>Billing History</Text>
                              {billingLoading ? (
                                <ActivityIndicator size="small" />
                              ) : billingHistory.length === 0 ? (
                                <Text style={styles.noBillingText}>No billing records found</Text>
                              ) : (
                                <View style={styles.billingList}>
                                  {billingHistory.map((record) => (
                                    <View key={record.billingId} style={styles.billingRecord}>
                                      <Text style={styles.billingAmount}>
                                        {record.amountFormatted}
                                      </Text>
                                      <Chip
                                        style={[
                                          styles.billingStatusChip,
                                          {
                                            backgroundColor:
                                              record.status === 'succeeded'
                                                ? '#e8f5e9'
                                                : '#fff3e0',
                                          },
                                        ]}
                                        textStyle={{
                                          fontSize: 10,
                                          color:
                                            record.status === 'succeeded' ? '#2e7d32' : '#e65100',
                                        }}
                                      >
                                        {record.status}
                                      </Chip>
                                      <Text style={styles.billingDate}>
                                        {formatDateShort(record.createdAt)}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              )}

                              {/* Additional User Info */}
                              <View style={styles.userDetails}>
                                <View style={styles.detailRow}>
                                  <Text style={styles.detailLabel}>User ID:</Text>
                                  <Text style={styles.detailValue}>{user.userId}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                  <Text style={styles.detailLabel}>Created:</Text>
                                  <Text style={styles.detailValue}>
                                    {formatDateShort(user.createdAt)}
                                  </Text>
                                </View>
                                <View style={styles.detailRow}>
                                  <Text style={styles.detailLabel}>Due Date:</Text>
                                  <Text style={styles.detailValue}>
                                    {formatDateShort(user.renewalDate)}
                                  </Text>
                                </View>
                                <View style={styles.detailRow}>
                                  <Text style={styles.detailLabel}>End Date:</Text>
                                  <Text style={styles.detailValue}>
                                    {formatDateShort(user.subscriptionEndDate)}
                                  </Text>
                                </View>
                                {user.isLocked && user.lockedReason && (
                                  <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Lock Reason:</Text>
                                    <Text style={styles.detailValue}>{user.lockedReason}</Text>
                                  </View>
                                )}
                              </View>
                            </View>
                          )}

                          <Divider />
                        </View>
                      );
                    })}
                  </View>
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
                        <Text style={styles.logDate}>{formatDate(log.createdAt)}</Text>
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
            All support actions are logged and cannot be deleted. This ensures accountability and
            compliance with audit requirements.
          </Text>
        </Surface>
      </View>

      {/* Lock Confirmation Dialog */}
      <Portal>
        <Dialog visible={lockDialogVisible} onDismiss={() => setLockDialogVisible(false)}>
          <Dialog.Title>Lock User Account</Dialog.Title>
          <Dialog.Content>
            <Paragraph>Lock account for {userToLock?.email}?</Paragraph>
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

      {/* Subscribe Till Dialog */}
      <Portal>
        <Dialog
          visible={subscribeTillDialogVisible}
          onDismiss={() => setSubscribeTillDialogVisible(false)}
        >
          <Dialog.Title>Set Subscription Date</Dialog.Title>
          <Dialog.Content>
            <Paragraph>Set subscription for {userToSubscribe?.email}?</Paragraph>
            <Paragraph style={styles.dialogInfo}>
              This will set both the due date and end date to the specified date.
            </Paragraph>
            <TextInput
              label="Subscribe till date"
              value={subscribeTillDate}
              onChangeText={setSubscribeTillDate}
              mode="outlined"
              placeholder="YYYY-MM-DD"
              style={styles.dateInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSubscribeTillDialogVisible(false)}>Cancel</Button>
            <Button
              onPress={handleSubscribeTillConfirm}
              loading={actionLoading === userToSubscribe?.userId}
              textColor="#4caf50"
            >
              Set Subscription
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Expire Subscription Dialog */}
      <Portal>
        <Dialog visible={expireDialogVisible} onDismiss={() => setExpireDialogVisible(false)}>
          <Dialog.Title>Expire Subscription</Dialog.Title>
          <Dialog.Content>
            <Paragraph>Expire subscription for {userToExpire?.email}?</Paragraph>
            <Paragraph style={styles.dialogWarning}>
              This will set both dates to yesterday.
            </Paragraph>
            <Paragraph style={styles.dialogInfo}>
              {'\u2022'} Groups where they're the only admin will become read-only{'\n'}
              {'\u2022'} In groups with other admins, their role will change to adult
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
  usersList: {
    marginTop: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
    marginBottom: 8,
  },
  headerCell: {
    fontWeight: '600',
    fontSize: 13,
    color: '#666',
    paddingHorizontal: 8,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 60,
  },
  cell: {
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  emailCol: {
    flex: 2,
  },
  statusCol: {
    flex: 2,
  },
  dateCol: {
    flex: 1,
  },
  actionsCol: {
    flex: 2.5,
    justifyContent: 'flex-end',
  },
  emailText: {
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  statusBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  statusChip: {
    height: 24,
  },
  statusChipText: {
    fontSize: 10,
  },
  supportChip: {
    backgroundColor: '#e3f2fd',
    height: 24,
  },
  supportChipText: {
    fontSize: 10,
    color: '#1565c0',
  },
  lockedChip: {
    backgroundColor: '#ffebee',
    height: 24,
  },
  lockedChipText: {
    fontSize: 10,
    color: '#d32f2f',
  },
  dateText: {
    fontSize: 13,
    color: '#333',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    fontSize: 11,
    color: '#666',
  },
  actionButton: {
    margin: 0,
  },
  // Expanded section
  expandedSection: {
    backgroundColor: '#fafafa',
    padding: 16,
    marginLeft: 28,
    marginBottom: 8,
    borderRadius: 8,
  },
  expandedTitle: {
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 12,
    color: '#333',
  },
  noBillingText: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
  },
  billingList: {
    gap: 8,
    marginBottom: 16,
  },
  billingRecord: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  billingAmount: {
    fontWeight: '600',
    fontSize: 14,
    width: 80,
  },
  billingStatusChip: {
    height: 22,
  },
  billingDate: {
    fontSize: 12,
    color: '#666',
  },
  userDetails: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 12,
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
    width: 100,
  },
  detailValue: {
    fontSize: 12,
    color: '#333',
    flex: 1,
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
  dateInput: {
    marginTop: 16,
  },
});
