/**
 * Message Groups List Screen
 *
 * Displays all message groups within a group.
 * Users can click on a message group to see messages.
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Card, Title, Text, FAB, Avatar, Chip, IconButton, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { getContrastTextColor } from '../../utils/colorUtils';
import UserAvatar from '../../components/shared/UserAvatar';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';

/**
 * @typedef {Object} MessageGroupsListScreenProps
 * @property {Object} navigation - React Navigation navigation object
 * @property {Object} route - React Navigation route object
 */

/**
 * MessageGroupsListScreen component
 *
 * @param {MessageGroupsListScreenProps} props
 * @returns {JSX.Element}
 */
export default function MessageGroupsListScreen({ navigation, route }) {
  const { groupId } = route.params;
  const [messageGroups, setMessageGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groupInfo, setGroupInfo] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [canCreate, setCanCreate] = useState(false);
  const [expandedCards, setExpandedCards] = useState({}); // Track which cards are expanded

  useEffect(() => {
    loadGroupInfo();
  }, [groupId]);

  /**
   * Reload message groups when screen comes into focus and start polling
   * Polling stops when screen loses focus to reduce unnecessary API calls
   */
  useFocusEffect(
    React.useCallback(() => {
      // Refresh immediately on focus
      loadMessageGroups();

      // Start polling (only while focused)
      const pollInterval = setInterval(() => {
        loadMessageGroups();
      }, 5000); // Poll every 5 seconds

      // Stop polling when screen loses focus
      return () => clearInterval(pollInterval);
    }, [groupId])
  );

  /**
   * Load group information
   */
  const loadGroupInfo = async () => {
    try {
      const response = await api.get(`/groups/${groupId}`);
      setGroupInfo(response.data.group);
      const role = response.data.group?.userRole || null;
      setUserRole(role);

      // Check if user can create message groups
      const settings = response.data.group?.settings;
      if (role === 'admin' && settings?.messageGroupsCreatableByAdmins !== false) {
        setCanCreate(true);
      } else if (role === 'parent' && settings?.messageGroupsCreatableByParents !== false) {
        setCanCreate(true);
      } else if (role === 'adult' && settings?.messageGroupsCreatableByAdults !== false) {
        setCanCreate(true);
      } else if (role === 'caregiver' && settings?.messageGroupsCreatableByCaregivers !== false) {
        setCanCreate(true);
      } else if (role === 'child' && settings?.messageGroupsCreatableByChildren !== false) {
        setCanCreate(true);
      } else {
        setCanCreate(false);
      }
    } catch (err) {
      console.error('Load group info error:', err);
    }
  };

  /**
   * Load message groups from API
   */
  const loadMessageGroups = async () => {
    try {
      setError(null);
      const response = await api.get(`/groups/${groupId}/message-groups`);
      setMessageGroups(response.data.messageGroups || []);
    } catch (err) {
      console.error('Load message groups error:', err);

      // Don't show error if it's an auth error
      if (err.isAuthError) {
        console.log('[MessageGroupsList] Auth error detected - user will be logged out');
        return;
      }

      setError(err.response?.data?.message || 'Failed to load message groups');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Navigate to messages screen
   */
  const handleMessageGroupPress = (messageGroup) => {
    navigation.navigate('GroupMessages', {
      groupId: groupId,
      messageGroupId: messageGroup.messageGroupId,
      messageGroupName: messageGroup.name,
    });
  };

  /**
   * Navigate to create message group screen
   */
  const handleCreateMessageGroup = () => {
    navigation.navigate('CreateMessageGroup', {
      groupId: groupId,
    });
  };

  /**
   * Navigate to message group settings
   */
  const handleMessageGroupSettings = (messageGroup) => {
    navigation.navigate('MessageGroupSettings', {
      groupId: groupId,
      messageGroupId: messageGroup.messageGroupId,
      messageGroupName: messageGroup.name,
    });
  };

  /**
   * Toggle expanded state for a card
   */
  const toggleCardExpanded = (messageGroupId) => {
    setExpandedCards(prev => ({
      ...prev,
      [messageGroupId]: !prev[messageGroupId]
    }));
  };

  /**
   * Handle mute/unmute message group
   */
  const handleMuteToggle = async (messageGroupId, isMuted, event) => {
    // Stop event propagation to prevent navigating to messages
    event?.stopPropagation?.();

    try {
      if (isMuted) {
        await api.put(`/groups/${groupId}/message-groups/${messageGroupId}/unmute`);
      } else {
        await api.put(`/groups/${groupId}/message-groups/${messageGroupId}/mute`);
      }

      // Reload message groups to show updated mute status
      loadMessageGroups();
    } catch (err) {
      console.error('Mute toggle error:', err);

      // Don't show error if it's an auth error - logout happens automatically
      if (err.isAuthError) {
        console.log('[MessageGroupsList] Auth error detected - user will be logged out');
        return;
      }
    }
  };

  /**
   * Format last message time
   */
  const formatLastMessageTime = (timestamp) => {
    if (!timestamp) return 'No messages yet';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  /**
   * Render message group card
   */
  const renderMessageGroup = ({ item }) => (
    <TouchableOpacity
      onPress={() => handleMessageGroupPress(item)}
      onLongPress={() => toggleCardExpanded(item.messageGroupId)}
      activeOpacity={0.7}
    >
      <Card style={[styles.card, item.isHidden && userRole === 'admin' && styles.hiddenCard]}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.groupInfo}>
              <View style={styles.titleRow}>
                <View style={styles.nameWithIcon}>
                  <Title style={styles.groupName}>{item.name}</Title>
                  {item.isHidden && userRole === 'admin' && (
                    <IconButton
                      icon="eye-off"
                      size={20}
                      iconColor="#999"
                      style={styles.hiddenIcon}
                    />
                  )}
                </View>
                {userRole === 'admin' && (
                  <IconButton
                    icon="cog"
                    size={20}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleMessageGroupSettings(item);
                    }}
                    style={styles.settingsButton}
                  />
                )}
              </View>
              <View style={styles.memberInfoRow}>
                <Text style={styles.memberCount}>
                  {item._count?.members || 0} members
                </Text>
                {!item.isMember && userRole === 'admin' && (
                  <Text style={styles.notMemberBadge}>(not a member)</Text>
                )}
              </View>
            </View>
            <View style={styles.badgeContainer}>
              {item.unreadMentionsCount > 0 && (
                <Chip mode="outlined" style={styles.mentionBadge} textStyle={styles.mentionBadgeText}>
                  @ {item.unreadMentionsCount}
                </Chip>
              )}
              {item.unreadCount > 0 && (
                <Chip mode="outlined" style={styles.unreadCount}>
                  {item.unreadCount}
                </Chip>
              )}
            </View>
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.lastMessage}>
              {formatLastMessageTime(item.lastMessageAt)}
            </Text>
            <IconButton
              icon={item.isMuted ? 'ear-hearing-off' : 'ear-hearing'}
              size={20}
              iconColor={item.isMuted ? '#ccc' : '#6200ee'}
              onPress={(e) => handleMuteToggle(item.messageGroupId, item.isMuted, e)}
              style={styles.muteButton}
            />
          </View>

          {!expandedCards[item.messageGroupId] ? (
            // Collapsed view - show first 5 avatars
            <View style={styles.membersRow}>
              {item.members?.slice(0, 5).map((member, index) => {
                return (
                  <View key={member.groupMemberId} style={{ marginLeft: index > 0 ? -6 : 0 }}>
                    <UserAvatar
                      profilePhotoUrl={member.groupMember?.profilePhotoUrl}
                      memberIcon={member.groupMember?.iconLetters}
                      iconColor={member.groupMember?.iconColor || '#6200ee'}
                      displayName={member.groupMember?.displayName}
                      size={32}
                    />
                  </View>
                );
              })}
              {item.members?.length > 5 && (
                <Text style={styles.moreMembersText}>
                  +{item.members.length - 5}
                </Text>
              )}
            </View>
          ) : (
            // Expanded view - show all members with names
            <View style={styles.membersExpandedContainer}>
              {item.members?.map((member) => {
                return (
                  <View key={member.groupMemberId} style={styles.memberExpandedRow}>
                    <UserAvatar
                      profilePhotoUrl={member.groupMember?.profilePhotoUrl}
                      memberIcon={member.groupMember?.iconLetters}
                      iconColor={member.groupMember?.iconColor || '#6200ee'}
                      displayName={member.groupMember?.displayName}
                      size={32}
                    />
                    <Text style={styles.memberExpandedName} numberOfLines={1}>
                      {member.groupMember?.displayName || 'Unknown'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  /**
   * Render empty state
   */
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>No message groups yet</Text>
      <Text style={styles.emptySubtext}>
        Create a message group to start communicating with group members
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Custom Navigation Header */}
      <CustomNavigationHeader
        title="Message Groups"
        onBack={() => navigation.goBack()}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6200ee" />
        </View>
      ) : (
        <>
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <FlatList
        data={messageGroups}
        renderItem={renderMessageGroup}
        keyExtractor={(item) => item.messageGroupId}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
          />

          {canCreate && (
            <FAB
              style={styles.fab}
              icon="plus"
              label="New Message Group"
              color="#fff"
              onPress={handleCreateMessageGroup}
            />
          )}
        </>
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
  hiddenCard: {
    backgroundColor: '#757575', // Lighter grey background for hidden message groups
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  groupInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  groupName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  hiddenIcon: {
    margin: 0,
    marginLeft: 4,
  },
  settingsButton: {
    margin: 0,
    marginLeft: 8,
  },
  memberInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberCount: {
    fontSize: 13,
    color: '#666',
  },
  notMemberBadge: {
    fontSize: 12,
    color: '#1565c0',
    fontStyle: 'italic',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mentionBadge: {
    backgroundColor: '#fff9c4',
    borderColor: '#f9a825',
  },
  mentionBadgeText: {
    color: '#f57f17',
    fontWeight: 'bold',
  },
  unreadCount: {
    backgroundColor: '#2196f3',
    borderColor: '#1976d2',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  lastMessage: {
    fontSize: 13,
    color: '#999',
    flex: 1,
  },
  muteButton: {
    margin: 0,
    marginTop: -8,
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  memberAvatar: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  moreMembersText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#666',
  },
  membersExpandedContainer: {
    marginTop: 8,
    gap: 8,
  },
  memberExpandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  memberExpandedName: {
    marginLeft: 12,
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
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
