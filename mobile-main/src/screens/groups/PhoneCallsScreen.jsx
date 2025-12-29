/**
 * Phone Calls Screen
 *
 * Displays phone call history for a group.
 * Users see calls they were invited to (even if rejected).
 * Admins see all calls in the group.
 * Includes FAB for initiating new calls.
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Card, Title, Text, FAB, Avatar, Chip, IconButton } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { getContrastTextColor } from '../../utils/colorUtils';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';
import UserAvatar from '../../components/shared/UserAvatar';

/**
 * @typedef {Object} PhoneCallsScreenProps
 * @property {Object} navigation - React Navigation navigation object
 * @property {Object} route - React Navigation route object
 */

/**
 * PhoneCallsScreen component
 *
 * @param {PhoneCallsScreenProps} props
 * @returns {JSX.Element}
 */
export default function PhoneCallsScreen({ navigation, route }) {
  const { groupId } = route.params;
  const [phoneCalls, setPhoneCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groupInfo, setGroupInfo] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [canMakeCalls, setCanMakeCalls] = useState(false);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    loadGroupInfo();
  }, [groupId]);

  // Reload phone calls when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadPhoneCalls();
    }, [groupId])
  );

  /**
   * Load group information and determine permissions
   */
  const loadGroupInfo = async () => {
    try {
      const response = await api.get(`/groups/${groupId}`);
      const group = response.data.group;
      setGroupInfo(group);
      setUserRole(group?.userRole || null);
      setMembers(group?.members || []);

      // Check if user can make phone calls
      const role = group?.userRole;
      const settings = group?.settings;

      // Supervisors cannot make calls (read-only role)
      if (role === 'supervisor') {
        setCanMakeCalls(false);
      } else if (role === 'admin' && settings?.phoneCallsUsableByAdmins !== false) {
        setCanMakeCalls(true);
      } else if (role === 'parent' && settings?.phoneCallsUsableByParents !== false) {
        setCanMakeCalls(true);
      } else if (role === 'adult' && settings?.phoneCallsUsableByAdults !== false) {
        setCanMakeCalls(true);
      } else if (role === 'caregiver' && settings?.phoneCallsUsableByCaregivers !== false) {
        setCanMakeCalls(true);
      } else if (role === 'child' && settings?.phoneCallsUsableByChildren !== false) {
        setCanMakeCalls(true);
      } else {
        setCanMakeCalls(false);
      }
    } catch (err) {
      console.error('Load group info error:', err);
    }
  };

  /**
   * Load phone calls from API
   */
  const loadPhoneCalls = async () => {
    try {
      setError(null);
      const response = await api.get(`/groups/${groupId}/phone-calls`);
      setPhoneCalls(response.data.phoneCalls || []);
    } catch (err) {
      console.error('Load phone calls error:', err);

      if (err.isAuthError) {
        console.log('[PhoneCalls] Auth error detected - user will be logged out');
        return;
      }

      setError(err.response?.data?.message || 'Failed to load phone calls');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Format call duration from milliseconds
   */
  const formatDuration = (durationMs) => {
    if (!durationMs) return '--:--';
    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  /**
   * Format call date/time - always shows both date and time
   */
  const formatCallTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${dateStr}, ${timeStr}`;
  };

  /**
   * Get status chip color
   */
  const getStatusColor = (status) => {
    switch (status) {
      case 'ended':
        return { bg: '#e8f5e9', text: '#2e7d32', border: '#4caf50' };
      case 'active':
        return { bg: '#e3f2fd', text: '#1565c0', border: '#2196f3' };
      case 'ringing':
        return { bg: '#fff3e0', text: '#e65100', border: '#ff9800' };
      case 'missed':
        return { bg: '#ffebee', text: '#c62828', border: '#f44336' };
      default:
        return { bg: '#f5f5f5', text: '#666', border: '#999' };
    }
  };

  /**
   * Get call direction icon
   */
  const getCallIcon = (call, currentUserId) => {
    const isInitiator = call.initiatedBy === currentUserId;
    if (call.status === 'missed') {
      return '📵'; // Missed call
    }
    return isInitiator ? '📲' : '📞'; // Outgoing vs Incoming
  };

  /**
   * Handle initiating a new call
   */
  const handleMakeCall = () => {
    navigation.navigate('InitiatePhoneCall', { groupId, members });
  };

  /**
   * Handle viewing call details / playing recording
   */
  const handleCallPress = (call) => {
    navigation.navigate('PhoneCallDetails', {
      groupId,
      callId: call.callId,
      call
    });
  };

  /**
   * Render phone call card
   */
  const renderPhoneCall = ({ item }) => {
    const statusColors = getStatusColor(item.status);
    const hasRecording = item.recordingUrl && !item.recordingIsHidden;
    const initiatorName = item.initiator?.displayName || 'Unknown';

    // Build all participants list including initiator for avatar display
    const allParticipants = [];

    // Add initiator first if available
    if (item.initiator) {
      allParticipants.push({
        groupMemberId: item.initiatedBy,
        displayName: item.initiator.displayName,
        iconLetters: item.initiator.iconLetters,
        iconColor: item.initiator.iconColor,
        isInitiator: true,
      });
    }

    // Add other participants (excluding initiator to avoid duplicates)
    item.participants?.forEach(p => {
      if (p.groupMemberId !== item.initiatedBy) {
        allParticipants.push(p);
      }
    });

    return (
      <TouchableOpacity
        onPress={() => handleCallPress(item)}
        activeOpacity={0.7}
      >
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              {/* Show all participants avatars at the start */}
              <View style={styles.avatarsColumn}>
                {allParticipants.slice(0, 4).map((participant, index) => (
                  <UserAvatar
                    key={`${item.callId}-${participant.groupMemberId || index}`}
                    size={32}
                    profilePhotoUrl={participant.profilePhotoUrl}
                    memberIcon={participant.iconLetters}
                    iconColor={participant.iconColor || '#6200ee'}
                    displayName={participant.displayName}
                    style={{ marginTop: index > 0 ? -8 : 0 }}
                  />
                ))}
                {allParticipants.length > 4 && (
                  <Text style={styles.moreAvatarsText}>+{allParticipants.length - 4}</Text>
                )}
              </View>

              <View style={styles.callInfo}>
                <View style={styles.titleRow}>
                  <Text style={styles.initiatorText}>
                    {initiatorName} called
                  </Text>
                  <Chip
                    mode="outlined"
                    compact={false}
                    style={[styles.statusChip, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}
                    textStyle={[styles.statusChipText, { color: statusColors.text }]}
                  >
                    {item.status}
                  </Chip>
                </View>

                <View style={styles.detailsRow}>
                  <Text style={styles.callTime}>
                    {formatCallTime(item.startedAt)}
                  </Text>
                  {item.status === 'ended' && item.durationMs && (
                    <Text style={styles.duration}>
                      {formatDuration(item.durationMs)}
                    </Text>
                  )}
                  {hasRecording && (
                    <View style={styles.recordingIndicator}>
                      <Text style={styles.recordingIcon}>🎙️</Text>
                      <Text style={styles.recordingText}>Recording</Text>
                    </View>
                  )}
                </View>
              </View>
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
      <Text style={styles.emptyEmoji}>📞</Text>
      <Text style={styles.emptyText}>No phone calls yet</Text>
      <Text style={styles.emptySubtext}>
        {canMakeCalls
          ? 'Make a call to start connecting with your group'
          : 'No phone calls have been made in this group yet'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <CustomNavigationHeader
          title="Phone Calls"
          onBack={() => navigation.navigate('GroupDashboard', { groupId })}
        />
        <View style={styles.loadingContainer}>
          <Text>Loading phone calls...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CustomNavigationHeader
        title="Phone Calls"
        onBack={() => navigation.navigate('GroupDashboard', { groupId })}
      />

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={phoneCalls}
        renderItem={renderPhoneCall}
        keyExtractor={(item) => item.callId}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
      />

      {/* FAB for making new calls - only show if user has permission */}
      {canMakeCalls && (
        <FAB
          style={styles.fab}
          icon="phone-plus"
          label="Make Call"
          color="#fff"
          onPress={handleMakeCall}
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
    paddingBottom: 100,
  },
  card: {
    marginBottom: 12,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarsColumn: {
    alignItems: 'center',
    marginRight: 12,
    minWidth: 40,
  },
  moreAvatarsText: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  callInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  statusChip: {
    height: 26,
    paddingHorizontal: 4,
  },
  statusChipText: {
    fontSize: 12,
    textTransform: 'capitalize',
    lineHeight: 14,
  },
  initiatorText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  callTime: {
    fontSize: 13,
    color: '#999',
  },
  duration: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recordingIcon: {
    fontSize: 14,
  },
  recordingText: {
    fontSize: 12,
    color: '#4caf50',
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
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
    backgroundColor: '#4caf50',
  },
});
