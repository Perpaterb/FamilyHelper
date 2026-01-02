/**
 * Initiate Phone Call Screen
 *
 * Modal screen for selecting members to call.
 * Shows group members with checkboxes for multi-select.
 * Initiates call via API when user confirms.
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Card, Text, Avatar, Checkbox, Button, ActivityIndicator } from 'react-native-paper';
import api from '../../services/api';
import { getContrastTextColor } from '../../utils/colorUtils';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';
import UserAvatar from '../../components/shared/UserAvatar';
import RecordingQueueModal from '../../components/RecordingQueueModal';

/**
 * @typedef {Object} InitiatePhoneCallScreenProps
 * @property {Object} navigation - React Navigation navigation object
 * @property {Object} route - React Navigation route object
 */

/**
 * InitiatePhoneCallScreen component
 *
 * @param {InitiatePhoneCallScreenProps} props
 * @returns {JSX.Element}
 */
export default function InitiatePhoneCallScreen({ navigation, route }) {
  const { groupId, members: passedMembers } = route.params;
  const [members, setMembers] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initiating, setInitiating] = useState(false);
  const [currentUserMemberId, setCurrentUserMemberId] = useState(null);

  useEffect(() => {
    loadMembers();
  }, [groupId]);

  /**
   * Load group members from API
   */
  const loadMembers = async () => {
    try {
      // Always fetch fresh data from API to get isRegistered field
      const response = await api.get(`/groups/${groupId}`);
      const group = response.data.group;
      setCurrentUserMemberId(group?.currentUserMember?.groupMemberId);

      // Filter out current user and supervisors (they can't receive calls)
      // Members must have a userId (linked to real user account) to receive calls
      // Placeholder members (userId=null) cannot log in and thus cannot receive calls
      const callableMembers = (group?.members || []).filter(m => {
        const isNotCurrentUser = m.groupMemberId !== group?.currentUserMember?.groupMemberId;
        const isNotSupervisor = m.role !== 'supervisor';
        const hasUserId = m.userId != null; // Has a linked user account

        return isNotCurrentUser && isNotSupervisor && hasUserId;
      });

      setMembers(callableMembers);
    } catch (err) {
      console.error('Load members error:', err);
      Alert.alert('Error', 'Failed to load group members');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Toggle member selection
   */
  const toggleMemberSelection = (memberId) => {
    setSelectedMembers(prev => {
      if (prev.includes(memberId)) {
        return prev.filter(id => id !== memberId);
      }
      return [...prev, memberId];
    });
  };

  /**
   * Initiate the phone call
   */
  const handleInitiateCall = async () => {
    if (selectedMembers.length === 0) {
      Alert.alert('Select Members', 'Please select at least one member to call.');
      return;
    }

    setInitiating(true);
    try {
      const response = await api.post(`/groups/${groupId}/phone-calls`, {
        participantIds: selectedMembers,
      });

      const call = response.data.phoneCall;

      // Navigate to active call screen
      navigation.replace('ActivePhoneCall', {
        groupId,
        callId: call.callId,
        call,
        isInitiator: true,
      });
    } catch (err) {
      console.error('Initiate call error:', err);
      Alert.alert(
        'Call Failed',
        err.response?.data?.message || 'Failed to initiate phone call'
      );
      setInitiating(false);
    }
  };

  /**
   * Render member item
   */
  const renderMember = ({ item }) => {
    const isSelected = selectedMembers.includes(item.groupMemberId);

    return (
      <TouchableOpacity
        onPress={() => toggleMemberSelection(item.groupMemberId)}
        activeOpacity={0.7}
      >
        <Card style={[styles.memberCard, isSelected && styles.selectedCard]}>
          <Card.Content style={styles.memberContent}>
            <Checkbox
              status={isSelected ? 'checked' : 'unchecked'}
              onPress={() => toggleMemberSelection(item.groupMemberId)}
              color="#4caf50"
            />
            <UserAvatar
              size={40}
              profilePhotoUrl={item.profilePhotoUrl}
              memberIcon={item.iconLetters}
              iconColor={item.iconColor || '#6200ee'}
              displayName={item.displayName}
              style={{ marginHorizontal: 12 }}
            />
            <View style={styles.memberInfo}>
              <Text style={styles.memberName} numberOfLines={1}>{item.displayName || 'Unknown'}</Text>
              <Text style={styles.memberRole}>{item.role}</Text>
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
      <Text style={styles.emptyEmoji}>👥</Text>
      <Text style={styles.emptyText}>No members available</Text>
      <Text style={styles.emptySubtext}>
        There are no registered members in this group that can receive calls.
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <CustomNavigationHeader
          title="Select Members"
          onBack={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4caf50" />
          <Text style={styles.loadingText}>Loading members...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CustomNavigationHeader
        title="Select Members to Call"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.headerInfo}>
        <Text style={styles.headerText}>
          Select one or more members to start a phone call
        </Text>
        {selectedMembers.length > 0 && (
          <Text style={styles.selectedCount}>
            {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''} selected
          </Text>
        )}
      </View>

      <FlatList
        data={members}
        renderItem={renderMember}
        keyExtractor={(item) => item.groupMemberId}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
      />

      {members.length > 0 && (
        <View style={styles.bottomBar}>
          <Button
            mode="contained"
            onPress={handleInitiateCall}
            disabled={selectedMembers.length === 0 || initiating}
            loading={initiating}
            style={styles.callButton}
            contentStyle={styles.callButtonContent}
            labelStyle={styles.callButtonLabel}
            icon="phone"
          >
            {initiating ? 'Calling...' : `Call ${selectedMembers.length > 0 ? `(${selectedMembers.length})` : ''}`}
          </Button>
        </View>
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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  headerInfo: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerText: {
    fontSize: 14,
    color: '#666',
  },
  selectedCount: {
    fontSize: 14,
    color: '#4caf50',
    fontWeight: 'bold',
    marginTop: 4,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  memberCard: {
    marginBottom: 8,
    elevation: 1,
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: '#4caf50',
    backgroundColor: '#e8f5e9',
  },
  memberContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
  },
  memberRole: {
    fontSize: 13,
    color: '#666',
    textTransform: 'capitalize',
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
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    elevation: 8,
  },
  callButton: {
    backgroundColor: '#4caf50',
    borderRadius: 28,
  },
  callButtonContent: {
    height: 56,
  },
  callButtonLabel: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});
