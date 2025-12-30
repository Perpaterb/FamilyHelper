/**
 * Groups List Screen
 *
 * Displays all groups where the user is a member.
 * Allows navigation to group details and message threads.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, ImageBackground, Animated } from 'react-native';
import { CustomAlert } from '../../components/CustomAlert';
import { Card, Title, Text, FAB, Avatar, Chip, Searchbar, Badge, IconButton, Portal, Modal, TextInput, Button } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { getContrastTextColor } from '../../utils/colorUtils';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';

/**
 * @typedef {Object} GroupsListScreenProps
 * @property {Object} navigation - React Navigation navigation object
 */

/**
 * GroupsListScreen component
 *
 * @param {GroupsListScreenProps} props
 * @returns {JSX.Element}
 */
export default function GroupsListScreen({ navigation }) {
  const [groups, setGroups] = useState([]);
  const [filteredGroups, setFilteredGroups] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [invitationCount, setInvitationCount] = useState(0);
  const [searchVisible, setSearchVisible] = useState(false);
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);

  // Animation for arrow pointing to invites
  const arrowAnim = useRef(new Animated.Value(0)).current;

  // Use ref instead of state to prevent useFocusEffect re-execution on auth error
  const authErrorRef = useRef(false);
  // Track if this is the first load to show loading spinner
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    filterGroups();
  }, [searchQuery, groups]);

  // Start arrow animation when user has no groups but has invitations
  useEffect(() => {
    if (groups.length === 0 && invitationCount > 0 && !loading) {
      // Bouncing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(arrowAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(arrowAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      arrowAnim.setValue(0);
    }
  }, [groups.length, invitationCount, loading]);

  /**
   * Refresh groups list when screen comes into focus
   * This ensures newly created groups appear immediately
   * Also starts polling which stops when screen loses focus
   */
  useFocusEffect(
    useCallback(() => {
      // Don't start polling if auth error already occurred
      if (authErrorRef.current) return;

      // Show loading spinner on first load, silent refresh on subsequent focuses
      const showLoader = isFirstLoadRef.current;
      isFirstLoadRef.current = false;

      // Refresh immediately on focus
      loadGroups(showLoader);
      loadInvitationCount();

      // Start polling (only while focused)
      const pollInterval = setInterval(() => {
        // Check again in case auth error happened during polling
        if (authErrorRef.current) {
          clearInterval(pollInterval);
          return;
        }
        loadGroups(); // Silent refresh
        loadInvitationCount();
      }, 5000); // Poll every 5 seconds

      // Stop polling when screen loses focus
      return () => clearInterval(pollInterval);
    }, [])
  );

  /**
   * Load groups from API
   */
  const loadGroups = async (showLoader = false) => {
    // Don't make API calls if auth error already occurred
    if (authErrorRef.current) return;

    try {
      setError(null);
      // Only show loading spinner on initial load, not on focus refresh
      if (showLoader && groups.length === 0) {
        setLoading(true);
      }
      const response = await api.get('/groups');
      setGroups(response.data.groups || []);
    } catch (err) {
      console.error('Load groups error:', err);

      // Don't show error if it's an auth error - logout happens automatically
      if (err.isAuthError) {
        console.log('[GroupsList] Auth error detected - user will be logged out');
        authErrorRef.current = true; // Prevent further API calls
        return;
      }

      setError(err.response?.data?.message || err.message || 'Failed to load groups');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /**
   * Load invitation count from API
   */
  const loadInvitationCount = async () => {
    // Don't make API calls if auth error already occurred
    if (authErrorRef.current) return;

    try {
      const response = await api.get('/invitations/count');
      setInvitationCount(response.data.count || 0);
    } catch (err) {
      console.error('Load invitation count error:', err);
      // Mark auth error to prevent further calls
      if (err.isAuthError) {
        authErrorRef.current = true;
        return;
      }
      // Don't show error, just set count to 0
      setInvitationCount(0);
    }
  };

  /**
   * Handle pull-to-refresh
   */
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadGroups();
  }, []);

  /**
   * Filter groups based on search query
   */
  const filterGroups = () => {
    if (!searchQuery.trim()) {
      setFilteredGroups(groups);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = groups.filter(group =>
      group.name.toLowerCase().includes(query)
    );
    setFilteredGroups(filtered);
  };

  /**
   * Navigate to group dashboard
   */
  const handleGroupPress = (group) => {
    navigation.navigate('GroupDashboard', { groupId: group.groupId });
  };

  /**
   * Navigate to create group screen
   */
  const handleCreateGroup = () => {
    navigation.navigate('CreateGroup');
  };

  /**
   * Handle contact support / feedback - open modal
   */
  const handleContactSupport = () => {
    setFeedbackModalVisible(true);
  };

  /**
   * Send feedback email via backend
   */
  const handleSendFeedback = async () => {
    if (!feedbackMessage.trim()) {
      CustomAlert.alert('Error', 'Please enter your feedback message');
      return;
    }

    setSendingFeedback(true);
    try {
      await api.post('/feedback', {
        message: feedbackMessage.trim(),
      });

      CustomAlert.alert(
        'Thank You!',
        'Your feedback has been sent. We appreciate your input!',
        [{ text: 'OK' }]
      );

      setFeedbackMessage('');
      setFeedbackModalVisible(false);
    } catch (err) {
      console.error('Error sending feedback:', err);

      // Don't show error if it's an auth error
      if (err.isAuthError) {
        return;
      }

      CustomAlert.alert(
        'Error',
        err.response?.data?.message || 'Failed to send feedback. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setSendingFeedback(false);
    }
  };

  /**
   * Get role badge color
   */
  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'admin':
        return '#6200ee';
      case 'parent':
        return '#03dac6';
      case 'child':
        return '#ffc107';
      case 'caregiver':
        return '#ff6f00';
      case 'supervisor':
        return '#757575';
      default:
        return '#666';
    }
  };

  /**
   * Handle pin/unpin group
   */
  const handlePinToggle = async (groupId, isPinned, event) => {
    // Stop event propagation to prevent navigating to group
    event?.stopPropagation?.();

    try {
      if (isPinned) {
        await api.put(`/groups/${groupId}/unpin`);
      } else {
        await api.put(`/groups/${groupId}/pin`);
      }

      // Reload groups to show updated pin status
      loadGroups();
    } catch (err) {
      console.error('Pin toggle error:', err);

      // Don't show error if it's an auth error - logout happens automatically
      if (err.isAuthError) {
        console.log('[GroupsList] Auth error detected - user will be logged out');
        return;
      }
    }
  };

  /**
   * Handle mute/unmute group
   */
  const handleMuteToggle = async (groupId, isMuted, event) => {
    // Stop event propagation to prevent navigating to group
    event?.stopPropagation?.();

    try {
      if (isMuted) {
        await api.put(`/groups/${groupId}/unmute`);
      } else {
        await api.put(`/groups/${groupId}/mute`);
      }

      // Reload groups to show updated mute status
      loadGroups();
    } catch (err) {
      console.error('Mute toggle error:', err);

      // Don't show error if it's an auth error - logout happens automatically
      if (err.isAuthError) {
        console.log('[GroupsList] Auth error detected - user will be logged out');
        return;
      }
    }
  };

  /**
   * Render group item
   */
  const renderGroupItem = ({ item }) => {
    const backgroundImageUri = item.backgroundImageId
      ? `${api.defaults.baseURL}/files/${item.backgroundImageId}`
      : null;

    const cardContent = (
      <>
        <View style={styles.groupHeader}>
          <Avatar.Text
            size={48}
            label={item.icon || item.name[0]}
            style={{ backgroundColor: item.backgroundColor || '#6200ee' }}
            color={getContrastTextColor(item.backgroundColor || '#6200ee')}
          />
          <View style={styles.groupInfo}>
            <Title style={styles.groupName}>{item.name}</Title>
          </View>
          <IconButton
            icon="pin"
            size={20}
            iconColor={item.isPinned ? '#6200ee' : '#ccc'}
            onPress={(e) => handlePinToggle(item.groupId, item.isPinned, e)}
            style={styles.pinButton}
          />
        </View>

        <View style={styles.groupFooter}>
          <View style={styles.groupFooterLeft}>
            {item.role === 'admin' && (
              <Chip
                mode="outlined"
                style={{ backgroundColor: getRoleBadgeColor(item.role) }}
                textStyle={{ color: '#fff', fontSize: 12 }}
              >
                ADMIN
              </Chip>
            )}
            {item.isMuted && (
              <Chip
                mode="outlined"
                style={{ backgroundColor: '#757575', marginLeft: 8 }}
                textStyle={{ color: '#fff', fontSize: 12 }}
                icon="bell-off"
              >
                MUTED
              </Chip>
            )}
            {item.hasActiveAdmin === false && (
              <Chip
                mode="outlined"
                style={{ backgroundColor: '#d32f2f', marginLeft: 8 }}
                textStyle={{ color: '#fff', fontSize: 12 }}
                icon="lock"
              >
                READ ONLY
              </Chip>
            )}
            {/* Badge counts */}
            {(item.unreadMentionsCount > 0 || item.unreadMessagesCount > 0 || item.pendingApprovalsCount > 0 || item.pendingFinanceCount > 0 || item.pendingCalendarCount > 0 || item.upcomingRemindersCount > 0) && (
              <View style={styles.badgesRow}>
                {item.unreadMentionsCount > 0 && (
                  <Badge size={20} style={styles.mentionBadge}>
                    {item.unreadMentionsCount}
                  </Badge>
                )}
                {item.unreadMessagesCount > 0 && (
                  <Badge size={20} style={styles.unreadBadge}>
                    {item.unreadMessagesCount}
                  </Badge>
                )}
                {item.pendingApprovalsCount > 0 && (
                  <Badge size={20} style={styles.approvalBadge}>
                    {item.pendingApprovalsCount}
                  </Badge>
                )}
                {item.pendingFinanceCount > 0 && (
                  <Badge size={20} style={styles.financeBadge}>
                    {item.pendingFinanceCount}
                  </Badge>
                )}
                {item.pendingCalendarCount > 0 && (
                  <Badge size={20} style={styles.calendarBadge}>
                    {item.pendingCalendarCount}
                  </Badge>
                )}
                {item.upcomingRemindersCount > 0 && (
                  <Badge size={20} style={styles.reminderBadge}>
                    {item.upcomingRemindersCount}
                  </Badge>
                )}
              </View>
            )}
          </View>
          <IconButton
            icon={item.isMuted ? 'ear-hearing-off' : 'ear-hearing'}
            size={20}
            iconColor={item.isMuted ? '#ccc' : '#6200ee'}
            onPress={(e) => handleMuteToggle(item.groupId, item.isMuted, e)}
            style={styles.muteButton}
          />
        </View>
      </>
    );

    return (
      <Card
        style={[
          styles.groupCard,
          { borderLeftColor: item.backgroundColor || '#6200ee' }
        ]}
        onPress={() => handleGroupPress(item)}
      >
        {backgroundImageUri ? (
          <ImageBackground
            source={{ uri: backgroundImageUri }}
            style={styles.cardBackgroundImage}
            imageStyle={{ borderRadius: 8 }}
            resizeMode="cover"
          >
            <View style={styles.imageOverlay}>
              <Card.Content style={styles.groupContent}>
                {cardContent}
              </Card.Content>
            </View>
          </ImageBackground>
        ) : (
          <Card.Content style={styles.groupContent}>
            {cardContent}
          </Card.Content>
        )}
      </Card>
    );
  };

  /**
   * Render empty state
   */
  const renderEmptyState = () => {
    const showInviteArrow = !searchQuery && groups.length === 0 && invitationCount > 0;

    // Interpolate animation for bounce effect
    const arrowTranslateY = arrowAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -10],
    });

    return (
      <View style={styles.emptyState}>
        {showInviteArrow && (
          <Animated.View
            style={[
              styles.inviteArrowContainer,
              { transform: [{ translateY: arrowTranslateY }] }
            ]}
          >
            <Text style={styles.inviteArrowText}>
              You have {invitationCount} pending invitation{invitationCount > 1 ? 's' : ''}!
            </Text>
            <Text style={styles.inviteArrowIcon}>↗</Text>
          </Animated.View>
        )}
        <Text style={styles.emptyText}>No groups found</Text>
        <Text style={styles.emptySubtext}>
          {searchQuery
            ? 'Try a different search term'
            : showInviteArrow
              ? 'Check your invitations to join a group'
              : 'Create your first group to get started'}
        </Text>
      </View>
    );
  };

  /**
   * Render error state
   */
  const renderErrorState = () => (
    <View style={styles.errorState}>
      <Text style={styles.errorText}>{error}</Text>
      <Text style={styles.errorSubtext} onPress={loadGroups}>
        Tap to retry
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading groups...</Text>
      </View>
    );
  }

  if (error && !refreshing) {
    return renderErrorState();
  }

  return (
    <View style={styles.container}>
      {/* Custom Navigation Header */}
      <CustomNavigationHeader
        title="Groups"
        leftButtons={[
          {
            icon: 'account-circle',
            onPress: () => navigation.navigate('MyAccount'),
          },
        ]}
        rightButtons={[
          {
            icon: 'magnify',
            onPress: () => {
              setSearchVisible(!searchVisible);
              if (searchVisible) {
                setSearchQuery('');
              }
            },
          },
          {
            icon: 'email',
            onPress: () => navigation.navigate('Invites'),
            badge: invitationCount > 0 ? (
              <Badge
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  backgroundColor: '#d32f2f',
                }}
                size={16}
              >
                {invitationCount}
              </Badge>
            ) : null,
          },
        ]}
      />

      {searchVisible && (
        <Searchbar
          placeholder="Search groups..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
      )}

      <FlatList
        data={filteredGroups}
        renderItem={renderGroupItem}
        keyExtractor={(item) => item.groupId}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: searchVisible ? 0 : 16 }
        ]}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />

      <FAB
        style={styles.fabSupport}
        label={"Support\nFeedback"}
        size="small"
        color="#fff"
        onPress={handleContactSupport}
      />

      <FAB
        style={styles.fab}
        icon="plus"
        label="Create Group"
        color="#fff"
        onPress={handleCreateGroup}
      />

      {/* Feedback Modal */}
      <Portal>
        <Modal
          visible={feedbackModalVisible}
          onDismiss={() => {
            setFeedbackModalVisible(false);
            setFeedbackMessage('');
          }}
          contentContainerStyle={styles.modalContainer}
        >
          <Text style={styles.modalTitle}>Contact Support</Text>
          <Text style={styles.modalSubtitle}>
            Share your feedback, suggest new features, or report issues
          </Text>
          <TextInput
            mode="outlined"
            label="Your message"
            value={feedbackMessage}
            onChangeText={setFeedbackMessage}
            multiline
            numberOfLines={6}
            style={styles.feedbackInput}
            placeholder="Tell us what you think..."
          />
          <View style={styles.modalButtons}>
            <Button
              mode="outlined"
              onPress={() => {
                setFeedbackModalVisible(false);
                setFeedbackMessage('');
              }}
              style={styles.modalButton}
              disabled={sendingFeedback}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSendFeedback}
              style={styles.modalButton}
              loading={sendingFeedback}
              disabled={sendingFeedback || !feedbackMessage.trim()}
            >
              Send
            </Button>
          </View>
        </Modal>
      </Portal>
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
  searchBar: {
    margin: 16,
    elevation: 2,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  groupCard: {
    marginBottom: 16,
    elevation: 2,
    borderLeftWidth: 4,
  },
  groupContent: {
    paddingVertical: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupInfo: {
    flex: 1,
    marginLeft: 12,
  },
  groupName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  pinButton: {
    margin: 0,
    marginTop: -8,
  },
  groupFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  muteButton: {
    margin: 0,
    marginTop: -8,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
  },
  mentionBadge: {
    backgroundColor: '#f9a825',
  },
  unreadBadge: {
    backgroundColor: '#2196f3',
  },
  approvalBadge: {
    backgroundColor: '#e91e63',
  },
  financeBadge: {
    backgroundColor: '#d32f2f',
  },
  calendarBadge: {
    backgroundColor: '#4caf50', // Green for new calendar events
  },
  reminderBadge: {
    backgroundColor: '#2e7d32', // Dark green for upcoming reminders
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
    paddingHorizontal: 20,
  },
  inviteArrowContainer: {
    position: 'absolute',
    top: 10,
    right: 20,
    alignItems: 'flex-end',
  },
  inviteArrowText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6200ee',
    marginBottom: 4,
    textAlign: 'right',
  },
  inviteArrowIcon: {
    fontSize: 40,
    color: '#6200ee',
    fontWeight: 'bold',
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 14,
    color: '#666',
    textDecorationLine: 'underline',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#6200ee',
  },
  fabSupport: {
    position: 'absolute',
    margin: 16,
    left: 0,
    bottom: 0,
    backgroundColor: '#757575',
    paddingHorizontal: 0,
  },
  modalContainer: {
    backgroundColor: 'white',
    padding: 20,
    margin: 20,
    borderRadius: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  feedbackInput: {
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    minWidth: 80,
  },
  cardBackgroundImage: {
    width: '100%',
  },
  imageOverlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 8,
  },
  groupNameWithImage: {
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
