/**
 * Messages Screen
 *
 * Displays messages for a message group and allows sending new messages.
 * Main messaging interface for message group communication.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, Modal, TouchableOpacity, ScrollView, Dimensions, Image, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CustomAlert } from '../../components/CustomAlert';
import { TextInput, IconButton, Text, Chip, Avatar, Menu, Divider as MenuDivider } from 'react-native-paper';
// Platform-specific emoji pickers
let NativeEmojiPicker = null;
let WebEmojiPicker = null;

if (Platform.OS === 'web') {
  // Web platform - use emoji-picker-react
  try {
    WebEmojiPicker = require('emoji-picker-react').default;
  } catch (e) {
    WebEmojiPicker = null;
  }
} else {
  // Native platforms (iOS/Android) - use rn-emoji-keyboard
  try {
    NativeEmojiPicker = require('rn-emoji-keyboard').default;
  } catch (e) {
    NativeEmojiPicker = null;
  }
}

// Unified flag to check if any emoji picker is available
const hasEmojiPicker = Platform.OS === 'web' ? WebEmojiPicker !== null : NativeEmojiPicker !== null;
import api from '../../services/api';
import activeScreenService from '../../services/activeScreen.service';
import { getContrastTextColor } from '../../utils/colorUtils';
import MediaPicker from '../../components/shared/MediaPicker';
import ImageViewer from '../../components/shared/ImageViewer';
import VideoPlayer from '../../components/shared/VideoPlayer';
import UserAvatar from '../../components/shared/UserAvatar';
import AudioRecorder from '../../components/AudioRecorder';
import AudioPlayer from '../../components/AudioPlayer';
import { uploadFile, uploadMultipleFiles, getFileUrl } from '../../services/upload.service';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';

/**
 * @typedef {Object} MessagesScreenProps
 * @property {Object} navigation - React Navigation navigation object
 * @property {Object} route - React Navigation route object
 */

/**
 * MessagesScreen component
 *
 * @param {MessagesScreenProps} props
 * @returns {JSX.Element}
 */
export default function MessagesScreen({ navigation, route }) {
  const { groupId, messageGroupId, messageGroupName } = route.params;
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [groupInfo, setGroupInfo] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [currentUserMemberId, setCurrentUserMemberId] = useState(null);
  const [members, setMembers] = useState([]);
  const [isMember, setIsMember] = useState(true); // Track if user is a member of the message group
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionSearchText, setMentionSearchText] = useState('');
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [longPressedMessage, setLongPressedMessage] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [attachedMedia, setAttachedMedia] = useState([]); // Array of {fileId, type, url, mimeType, fileSizeBytes}
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [selectedMediaUrl, setSelectedMediaUrl] = useState(null);
  const [isRecordingMode, setIsRecordingMode] = useState(false);
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [reactionTargetMessage, setReactionTargetMessage] = useState(null);
  const mediaPickerRef = useRef(null);
  const flatListRef = useRef(null);
  const inputRef = useRef(null);

  // Calculate max height for input (50% of screen height)
  const screenHeight = Dimensions.get('window').height;
  const maxInputHeight = screenHeight * 0.5;

  /**
   * Scroll to bottom of messages list
   */
  const scrollToBottom = React.useCallback((animated = true) => {
    if (flatListRef.current) {
      // Use setTimeout to ensure FlatList has finished rendering
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated });
      }, 50);
    }
  }, []);

  /**
   * Load message group information
   */
  const loadMessageGroupInfo = async () => {
    try {
      const response = await api.get(`/groups/${groupId}/message-groups/${messageGroupId}`);
      setGroupInfo(response.data.messageGroup);
      // Get user's role from the group member info
      setUserRole(response.data.userRole);
      // Get current user's group member ID for message alignment
      const memberId = response.data.currentGroupMemberId;
      setCurrentUserMemberId(memberId);
      // Save members for @ mentions and read receipt calculations
      const messageGroup = response.data.messageGroup;
      if (messageGroup?.members) {
        // Preserve both groupMemberId and groupMember properties
        const membersList = messageGroup.members.map(m => ({
          ...m.groupMember,
          groupMemberId: m.groupMemberId
        }));
        setMembers(membersList);

        // Check if current user is a member of this message group
        const userIsMember = membersList.some(m => m.groupMemberId === memberId);
        setIsMember(userIsMember);
      }
    } catch (err) {
      console.error('Load message group info error:', err);
    }
  };

  /**
   * Load messages from API (last 50 messages)
   * @param {boolean} silent - If true, don't show loading spinner (for polling)
   */
  const loadMessages = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setError(null);
      }

      const response = await api.get(`/groups/${groupId}/message-groups/${messageGroupId}/messages?limit=50`);
      const fetchedMessages = response.data.messages || [];

      // Check if messages or read receipts have changed (for live status updates)
      const currentSnapshot = JSON.stringify(messages.map(m => ({
        id: m.messageId,
        readCount: m.readReceipts?.length || 0
      })));
      const newSnapshot = JSON.stringify(fetchedMessages.map(m => ({
        id: m.messageId,
        readCount: m.readReceipts?.length || 0
      })));
      const messagesChanged = currentSnapshot !== newSnapshot;

      // Mark messages as read if user is viewing the screen (initial load only)
      // This creates read receipts for other users to see
      if (!silent) {
        try {
          await api.put(`/groups/${groupId}/message-groups/${messageGroupId}/mark-read`);
        } catch (markReadErr) {
          console.error('Mark as read error:', markReadErr);
        }
      }

      if (messagesChanged) {
        setMessages(fetchedMessages);
        setHasMore(response.data.hasMore || false);

        // Scroll to bottom after messages load (only on initial load, not polling)
        if (!silent) {
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          }, 100);
        }
      } else if (silent) {
        // During polling, even if message IDs haven't changed, ALWAYS update
        // to get latest read receipts (they change independently of messages)
        setMessages(fetchedMessages);
      }
    } catch (err) {
      console.error('Load messages error:', err);

      if (err.isAuthError) {
        console.log('[Messages] Auth error detected - user will be logged out');
        return;
      }

      setError(err.response?.data?.message || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [groupId, messageGroupId, messages]);

  // Initial load of messages when messageGroupId changes
  useEffect(() => {
    loadMessageGroupInfo();
    loadMessages();
  }, [messageGroupId, loadMessages]);

  // Real-time polling: Check for new messages every 3 seconds (only when screen is focused)
  useFocusEffect(
    useCallback(() => {
      const pollInterval = setInterval(() => {
        loadMessages(true); // true = silent refresh (no loading spinner)
      }, 3000); // Poll every 3 seconds

      return () => clearInterval(pollInterval);
    }, [loadMessages])
  );

  // Track active message group for notification suppression
  useFocusEffect(
    useCallback(() => {
      // Set active message group when screen is focused
      activeScreenService.setActiveMessageGroup(messageGroupId);

      return () => {
        // Clear active message group when screen loses focus
        activeScreenService.clearActiveMessageGroup();
      };
    }, [messageGroupId])
  );

  // Scroll to bottom when messages load
  useEffect(() => {
    if (messages.length > 0) {
      // Longer timeout on initial load to ensure FlatList is fully rendered
      setTimeout(() => {
        scrollToBottom(false); // No animation on initial load
      }, 300);
    }
  }, [messages.length, scrollToBottom]);

  /**
   * Load more older messages
   */
  const loadMoreMessages = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;

    try {
      setLoadingMore(true);
      setError(null);

      // Get timestamp of oldest message for pagination
      const oldestMessage = messages[0];
      const before = oldestMessage.createdAt;

      const response = await api.get(
        `/groups/${groupId}/message-groups/${messageGroupId}/messages?limit=50&before=${before}`
      );
      const olderMessages = response.data.messages || [];

      // Prepend older messages to the beginning of the list
      setMessages([...olderMessages, ...messages]);
      setHasMore(response.data.hasMore || false);
    } catch (err) {
      console.error('Load more messages error:', err);

      if (err.isAuthError) {
        console.log('[Messages] Auth error detected - user will be logged out');
        return;
      }

      setError(err.response?.data?.message || 'Failed to load more messages');
    } finally {
      setLoadingMore(false);
    }
  };

  /**
   * Handle text change and detect @ for mentions
   */
  const handleTextChange = (text) => {
    setNewMessage(text);

    // Check for @ symbol and get search text
    const lastAtIndex = text.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = text.substring(lastAtIndex + 1);
      // Only show picker if @ is followed by nothing or letters/numbers (no space after @)
      if (!textAfterAt.includes(' ') && textAfterAt.length < 30) {
        setMentionSearchText(textAfterAt.toLowerCase());
        setShowMentionPicker(true);
      } else {
        setShowMentionPicker(false);
      }
    } else {
      setShowMentionPicker(false);
    }
  };

  /**
   * Handle mention selection from picker
   */
  const handleMentionSelect = (member) => {
    // Find the last @ position
    const lastAtIndex = newMessage.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      // Replace everything after @ with the selected member's display name
      const beforeAt = newMessage.substring(0, lastAtIndex);
      const newText = `${beforeAt}@${member.displayName} `;
      setNewMessage(newText);

      // Add member to selectedMentions if not already there
      if (!selectedMentions.includes(member.groupMemberId)) {
        setSelectedMentions([...selectedMentions, member.groupMemberId]);
      }
    }

    // Close picker and focus back on input
    setShowMentionPicker(false);
    setMentionSearchText('');
    inputRef.current?.focus();
  };

  /**
   * Get filtered members for mention picker
   */
  const getFilteredMembers = () => {
    if (!mentionSearchText) {
      return members;
    }
    return members.filter(member =>
      member.displayName.toLowerCase().includes(mentionSearchText)
    );
  };

  /**
   * Handle media selection and upload
   */
  const handleMediaSelect = async (files) => {
    try {
      setUploading(true);
      setError(null);
      setUploadProgress(0);

      const uploadedFiles = await uploadMultipleFiles(
        files,
        'messages',
        groupId,
        (progress) => setUploadProgress(progress)
      );

      // Add uploaded files to attachedMedia
      // Default to 'image' if mimeType doesn't explicitly start with 'video/'
      // This handles cases where mimeType might be missing or unexpected
      const mediaItems = uploadedFiles.map(file => {
        const mimeType = file.mimeType || '';
        const isVideo = mimeType.startsWith('video/');
        return {
          fileId: file.fileId,
          type: isVideo ? 'video' : 'image',  // Default to image
          url: file.fileId,
          mimeType: mimeType || (isVideo ? 'video/mp4' : 'image/png'),
          fileSizeBytes: file.size || 0,
        };
      });

      setAttachedMedia([...attachedMedia, ...mediaItems]);
    } catch (err) {
      console.error('Media upload error:', err);
      CustomAlert.alert('Upload Failed', err.message || 'Failed to upload media');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  /**
   * Handle removing attached media
   */
  const handleRemoveMedia = (fileId) => {
    setAttachedMedia(attachedMedia.filter(m => m.fileId !== fileId));
  };

  /**
   * Handle media tap to view full-screen
   */
  const handleMediaTap = (media) => {
    setSelectedMediaUrl(getFileUrl(media.url));
    if (media.mediaType === 'image') {
      setShowImageViewer(true);
    } else if (media.mediaType === 'video') {
      setShowVideoPlayer(true);
    }
    // Audio is played inline via AudioPlayer component
  };

  /**
   * Handle audio recording completion
   * Upload the recorded audio and add to attached media
   */
  const handleAudioRecordingComplete = async (audioData) => {
    try {
      setIsRecordingMode(false);
      setUploading(true);
      setError(null);

      // Create file object for upload
      // Use correct extension based on mimeType (webm for web, m4a for native)
      const extension = audioData.mimeType === 'audio/webm' ? 'webm' : 'm4a';
      const audioFile = {
        uri: audioData.uri,
        name: `voice_message_${Date.now()}.${extension}`,
        mimeType: audioData.mimeType,
      };

      // Upload the audio file
      const result = await uploadFile(
        audioFile,
        'audio',
        groupId,
        (progress) => setUploadProgress(progress)
      );

      if (result && result.fileId) {
        // Add to attached media with audio type
        const audioItem = {
          fileId: result.fileId,
          type: 'audio',
          url: result.fileId,
          mimeType: audioData.mimeType,
          fileSizeBytes: result.size || 0,
          duration: audioData.duration,
        };

        setAttachedMedia([...attachedMedia, audioItem]);
      }
    } catch (err) {
      console.error('Failed to upload audio:', err);
      setError('Failed to upload audio recording');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  /**
   * Handle audio recording cancel
   */
  const handleAudioRecordingCancel = () => {
    setIsRecordingMode(false);
  };

  /**
   * Handle emoji selection for message input
   */
  const handleEmojiSelect = (emoji) => {
    setNewMessage(prev => prev + emoji.emoji);
    setShowEmojiPicker(false);
  };

  /**
   * Handle reaction emoji selection
   */
  const handleReactionSelect = async (emoji) => {
    if (!reactionTargetMessage) return;

    try {
      await api.post(
        `/groups/${groupId}/message-groups/${messageGroupId}/messages/${reactionTargetMessage.messageId}/reactions`,
        { emoji: emoji.emoji }
      );

      // Update the message in state with the new reaction
      setMessages(prevMessages =>
        prevMessages.map(msg => {
          if (msg.messageId === reactionTargetMessage.messageId) {
            const existingReactions = msg.reactions || [];
            // Add the new reaction
            return {
              ...msg,
              reactions: [...existingReactions, {
                emoji: emoji.emoji,
                reactor: {
                  groupMemberId: currentUserMemberId,
                  // We'll get full details on next refresh
                },
              }],
            };
          }
          return msg;
        })
      );
    } catch (err) {
      console.error('Failed to add reaction:', err);
      CustomAlert.alert('Error', 'Failed to add reaction');
    }

    setShowReactionPicker(false);
    setReactionTargetMessage(null);
  };

  /**
   * Handle removing a reaction
   */
  const handleRemoveReaction = async (messageId, emoji) => {
    try {
      await api.delete(
        `/groups/${groupId}/message-groups/${messageGroupId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`
      );

      // Update the message in state
      setMessages(prevMessages =>
        prevMessages.map(msg => {
          if (msg.messageId === messageId) {
            return {
              ...msg,
              reactions: (msg.reactions || []).filter(
                r => !(r.emoji === emoji && r.reactor?.groupMemberId === currentUserMemberId)
              ),
            };
          }
          return msg;
        })
      );
    } catch (err) {
      console.error('Failed to remove reaction:', err);
    }
  };

  /**
   * Open reaction picker for a message
   */
  const openReactionPicker = (message) => {
    setReactionTargetMessage(message);
    setShowReactionPicker(true);
    setMenuVisible(false);
    setLongPressedMessage(null);
  };

  /**
   * Check if a message contains only a single emoji
   * Returns true if the message is just one emoji with no other text
   */
  const isSingleEmojiMessage = (content) => {
    if (!content || typeof content !== 'string') return false;
    const trimmed = content.trim();
    // Emoji regex pattern - matches most emojis including compound ones
    const emojiRegex = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})(\u{FE0F})?(\u{200D}(\p{Emoji_Presentation}|\p{Extended_Pictographic})(\u{FE0F})?)*$/u;
    return emojiRegex.test(trimmed);
  };

  /**
   * Render reactions for a message
   */
  const renderReactions = (message, isMyMessage) => {
    const reactions = message.reactions || [];
    if (reactions.length === 0) return null;

    // Group reactions by emoji to avoid duplicates display
    const groupedReactions = {};
    reactions.forEach(reaction => {
      const emoji = reaction.emoji;
      if (!groupedReactions[emoji]) {
        groupedReactions[emoji] = [];
      }
      groupedReactions[emoji].push(reaction);
    });

    return (
      <View style={[
        styles.reactionsContainer,
        isMyMessage ? styles.reactionsContainerLeft : styles.reactionsContainerRight
      ]}>
        {Object.entries(groupedReactions).map(([emoji, reactors]) => {
          const firstReactor = reactors[0]?.reactor;
          const isMyReaction = reactors.some(r => r.reactor?.groupMemberId === currentUserMemberId);

          return (
            <Pressable
              key={emoji}
              style={[styles.reactionItem, isMyReaction && styles.reactionItemMine]}
              onPress={() => {
                if (isMyReaction) {
                  handleRemoveReaction(message.messageId, emoji);
                } else if (userRole !== 'supervisor' && isMember) {
                  // Add reaction if user can react
                  handleReactionSelect({ emoji });
                  setReactionTargetMessage(message);
                }
              }}
            >
              <View style={styles.reactionAvatarContainer}>
                <UserAvatar
                  profilePhotoUrl={firstReactor?.profilePhotoUrl}
                  memberIcon={firstReactor?.iconLetters || firstReactor?.user?.memberIcon || '?'}
                  iconColor={firstReactor?.iconColor || firstReactor?.user?.iconColor || '#ccc'}
                  displayName={firstReactor?.displayName || 'User'}
                  size={20}
                />
                <View style={styles.reactionEmojiOverlay}>
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </View>
              </View>
              {reactors.length > 1 && (
                <Text style={styles.reactionCount}>+{reactors.length - 1}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    );
  };

  /**
   * Send a new message
   */
  const handleSendMessage = async () => {
    if (!newMessage.trim() && attachedMedia.length === 0) return;

    // Supervisors cannot send messages (per appplan.md line 91)
    if (userRole === 'supervisor') {
      setError('Supervisors cannot send messages');
      return;
    }

    try {
      setSending(true);
      setError(null);

      const payload = {
        content: newMessage.trim() || ' ', // Backend requires content, use space if only media
        mentions: selectedMentions,
      };

      // Add media file IDs if any
      if (attachedMedia.length > 0) {
        payload.mediaFiles = attachedMedia.map(m => ({
          fileId: m.fileId,
          mimeType: m.mimeType || (m.type === 'image' ? 'image/jpeg' : 'video/mp4'),
          fileSizeBytes: m.fileSizeBytes || 0,
          durationMs: m.duration || null, // Duration in ms for audio/video
        }));
      }

      const response = await api.post(`/groups/${groupId}/message-groups/${messageGroupId}/messages`, payload);

      // Add new message to list
      setMessages([...messages, response.data.message]);
      setNewMessage('');
      setSelectedMentions([]);
      setAttachedMedia([]);

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err) {
      console.error('Send message error:', err);

      // Don't show error if it's an auth error
      if (err.isAuthError) {
        console.log('[Messages] Auth error detected - user will be logged out');
        return;
      }

      setError(err.response?.data?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  /**
   * Format message timestamp
   * If today: "10:23am"
   * If before today: "10-May-25 10:23am"
   */
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();

    // Check if message is from today
    const isToday = date.getDate() === now.getDate() &&
                    date.getMonth() === now.getMonth() &&
                    date.getFullYear() === now.getFullYear();

    // Format time as "10:23am"
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours % 12 || 12; // Convert 0 to 12 for midnight
    const displayMinutes = minutes.toString().padStart(2, '0');
    const timeString = `${displayHours}:${displayMinutes}${ampm}`;

    // If today, just show time
    if (isToday) {
      return timeString;
    }

    // If before today, show date + time
    const day = date.getDate().toString().padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear().toString().slice(-2); // Last 2 digits of year

    return `${day}-${month}-${year} ${timeString}`;
  };

  /**
   * Calculate read receipt status for a message
   * @param {Object} message - The message object
   * @returns {'sending'|'delivered'|'read-some'|'read-all'} - The read status
   */
  const getReadReceiptStatus = (message) => {
    // If message has messageId from server, it's at least delivered
    if (!message.messageId) {
      return 'sending';
    }

    // If no read receipts, message is delivered but not read
    if (!message.readReceipts || message.readReceipts.length === 0) {
      return 'delivered';
    }

    // Calculate total REGISTERED members excluding the sender
    // Only count members who have registered (isRegistered === true)
    // Members created by admins who haven't logged in don't count toward read receipts
    const registeredMembersExcludingSender = members.filter(
      m => m.groupMemberId !== message.sender?.groupMemberId && m.isRegistered === true
    ).length;

    const readCount = message.readReceipts.length;

    // If all registered members have read it
    if (readCount >= registeredMembersExcludingSender && registeredMembersExcludingSender > 0) {
      return 'read-all';
    }

    // Some registered members have read it
    return 'read-some';
  };

  /**
   * Render read receipt indicator (diamonds)
   * 4 states:
   * - sending: 1 gray diamond (◇)
   * - delivered: 2 gray diamonds (◇◇)
   * - read-some: 1 blue + 1 gray diamond (◆◇)
   * - read-all: 2 blue diamonds (◆◆)
   *
   * @param {Object} message - The message object
   * @returns {JSX.Element|null} - The read receipt component
   */
  const renderReadReceipt = (message) => {
    const status = getReadReceiptStatus(message);

    if (status === 'sending') {
      // 1 gray diamond - sent but not confirmed by server
      return <Text style={styles.readReceipt}>◇</Text>;
    }

    if (status === 'delivered') {
      // 2 gray diamonds - delivered to server, not read
      return <Text style={styles.readReceipt}>◇◇</Text>;
    }

    if (status === 'read-some') {
      // 1 blue + 1 gray diamond - read by some
      return (
        <Text style={styles.readReceipt}>
          <Text style={styles.readReceiptBlue}>◆</Text>
          <Text>◇</Text>
        </Text>
      );
    }

    // read-all: 2 blue diamonds - read by all
    return <Text style={[styles.readReceipt, styles.readReceiptBlue]}>◆◆</Text>;
  };

  /**
   * Handle long press on message
   */
  const handleLongPress = (message) => {
    setLongPressedMessage(message);
    setMenuVisible(true);
  };

  /**
   * Handle hide message action
   */
  const handleHideMessage = async () => {
    if (!longPressedMessage) return;

    setMenuVisible(false);

    try {
      await api.put(`/groups/${groupId}/message-groups/${messageGroupId}/messages/${longPressedMessage.messageId}/hide`);

      // Update local state
      setMessages(messages.map(msg =>
        msg.messageId === longPressedMessage.messageId
          ? { ...msg, isHidden: true }
          : msg
      ));

      setLongPressedMessage(null);
    } catch (err) {
      console.error('Hide message error:', err);
      if (!err.isAuthError) {
        CustomAlert.alert('Error', err.response?.data?.message || 'Failed to hide message');
      }
    }
  };

  /**
   * Handle unhide message action (admin only)
   */
  const handleUnhideMessage = async () => {
    if (!longPressedMessage) return;

    setMenuVisible(false);

    try {
      await api.put(`/groups/${groupId}/message-groups/${messageGroupId}/messages/${longPressedMessage.messageId}/unhide`);

      // Update local state
      setMessages(messages.map(msg =>
        msg.messageId === longPressedMessage.messageId
          ? { ...msg, isHidden: false }
          : msg
      ));

      setLongPressedMessage(null);
    } catch (err) {
      console.error('Unhide message error:', err);
      if (!err.isAuthError) {
        CustomAlert.alert('Error', err.response?.data?.message || 'Failed to unhide message');
      }
    }
  };

  /**
   * Render message item
   */
  const renderMessage = ({ item }) => {
    const isMyMessage = item.sender?.groupMemberId === currentUserMemberId;
    const isHidden = item.isHidden || false;
    const isSingleEmoji = isSingleEmojiMessage(item.content);

    return (
      <TouchableOpacity
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.7}
      >
        <View style={[
          styles.messageWrapper,
          isMyMessage ? styles.messageWrapperRight : styles.messageWrapperLeft
        ]}>
          {/* Reactions container - positioned outside bubble */}
          <View style={styles.messageWithReactions}>
            <View style={[
              styles.messageBubble,
              isMyMessage ? styles.messageBubbleRight : styles.messageBubbleLeft,
              isHidden && styles.messageBubbleHidden,
              isSingleEmoji && styles.messageBubbleSingleEmoji
            ]}>
              {isHidden && userRole === 'admin' && (
                <View style={styles.hiddenIndicator}>
                  <IconButton icon="eye-off" size={16} iconColor="#999" style={styles.hiddenIcon} />
                  <Text style={styles.hiddenText}>Hidden Message</Text>
                </View>
              )}

              {/* Render attached media */}
              {item.media && item.media.length > 0 && (
                <View style={styles.mediaContainer}>
                  {item.media.map((media) => (
                    media.isDeleted ? (
                      // Deleted file placeholder
                      <View key={media.mediaId} style={styles.deletedMediaPlaceholder}>
                        <IconButton icon="delete-circle" size={32} iconColor="#d32f2f" />
                        <Text style={styles.deletedMediaText} numberOfLines={1}>
                          {media.fileName || 'Deleted file'}
                        </Text>
                        <Text style={styles.deletedByText}>
                          Deleted by {media.deletedBy?.displayName || 'Admin'}
                        </Text>
                      </View>
                    ) : media.mediaType === 'audio' ? (
                      <View key={media.mediaId} style={styles.audioPlayerWrapper}>
                        <AudioPlayer
                          uri={getFileUrl(media.url)}
                          duration={media.durationMs}
                          mimeType={media.mimeType}
                          isMyMessage={isMyMessage}
                        />
                      </View>
                    ) : (
                      <TouchableOpacity
                        key={media.mediaId}
                        onPress={() => handleMediaTap(media)}
                        style={styles.mediaThumbnail}
                      >
                        {media.mediaType === 'image' ? (
                          <Image
                            source={{ uri: getFileUrl(media.url) }}
                            style={styles.mediaImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.videoThumbnail}>
                            <IconButton icon="play-circle" size={48} iconColor="#fff" />
                            <Text style={styles.videoText}>Video</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    )
                  ))}
                </View>
              )}

              {/* Message content - large if single emoji */}
              <Text style={[
                styles.messageContent,
                isSingleEmoji && styles.messageContentSingleEmoji
              ]}>
                {item.content}
              </Text>

              {/* Footer - hide for single emoji */}
              {!isSingleEmoji && (
                <View style={styles.messageFooter}>
                  <Text style={styles.senderName} numberOfLines={1}>
                    {item.sender?.displayName || 'Unknown'}
                  </Text>
                  <View style={styles.timeAndReceipt}>
                    <Text style={styles.messageTime}>{formatTime(item.createdAt)}</Text>
                    {isMyMessage && renderReadReceipt(item)}
                  </View>
                </View>
              )}

              {/* Minimal footer for single emoji */}
              {isSingleEmoji && (
                <View style={styles.messageFooterMinimal}>
                  <Text style={styles.senderNameSmall} numberOfLines={1}>
                    {item.sender?.displayName || 'Unknown'}
                  </Text>
                  {isMyMessage && renderReadReceipt(item)}
                </View>
              )}
            </View>

            {/* Render reactions */}
            {renderReactions(item, isMyMessage)}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  /**
   * Render load more button
   */
  const renderLoadMore = () => {
    if (!hasMore || messages.length === 0) return null;

    return (
      <View style={styles.loadMoreContainer}>
        <IconButton
          icon="chevron-up"
          mode="contained"
          onPress={loadMoreMessages}
          disabled={loadingMore}
          size={20}
          style={styles.loadMoreButton}
        />
        <Text style={styles.loadMoreText}>
          {loadingMore ? 'Loading...' : 'Load older messages'}
        </Text>
      </View>
    );
  };

  /**
   * Render empty state
   */
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>No messages yet</Text>
      <Text style={styles.emptySubtext}>
        {userRole === 'supervisor'
          ? 'As a supervisor, you can view but not send messages'
          : 'Be the first to send a message!'}
      </Text>
    </View>
  );

  /**
   * Render mention picker modal
   */
  const renderMentionPicker = () => {
    const filteredMembers = getFilteredMembers();

    return (
      <Modal
        visible={showMentionPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMentionPicker(false)}
      >
        <TouchableOpacity
          style={[styles.mentionPickerOverlay, Platform.OS === 'web' && styles.mentionPickerOverlayWeb]}
          activeOpacity={1}
          onPress={() => setShowMentionPicker(false)}
        >
          <View style={[styles.mentionPickerContainer, Platform.OS === 'web' && styles.mentionPickerContainerWeb]}>
            <ScrollView style={styles.mentionPickerScroll}>
              <Text style={styles.mentionPickerTitle}>Mention someone</Text>
              {filteredMembers.length === 0 ? (
                <Text style={styles.mentionPickerEmpty}>No members found</Text>
              ) : (
                filteredMembers.map((member) => {
                  return (
                    <TouchableOpacity
                      key={member.groupMemberId}
                      style={styles.mentionPickerItem}
                      onPress={() => handleMentionSelect(member)}
                    >
                      <UserAvatar
                        profilePhotoUrl={member.profilePhotoUrl}
                        memberIcon={member.iconLetters}
                        iconColor={member.iconColor}
                        displayName={member.displayName}
                        size={40}
                      />
                      <Text style={styles.mentionPickerItemText}>
                        {member.displayName}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  /**
   * Render input area
   */
  const renderInputArea = () => {
    // Supervisors cannot send messages
    if (userRole === 'supervisor') {
      return (
        <View style={styles.supervisorNotice}>
          <Text style={styles.supervisorText}>
            Supervisors can view but cannot send messages
          </Text>
        </View>
      );
    }

    // Non-members cannot send messages (admin viewing read-only)
    if (!isMember) {
      return (
        <View style={styles.supervisorNotice}>
          <Text style={styles.supervisorText}>
            You are not a member of this message group. You have read-only access.
          </Text>
        </View>
      );
    }

    // Recording mode - show AudioRecorder instead of input
    if (isRecordingMode) {
      return (
        <AudioRecorder
          onRecordingComplete={handleAudioRecordingComplete}
          onCancel={handleAudioRecordingCancel}
        />
      );
    }

    return (
      <View>
        {/* Show attached media preview */}
        {attachedMedia.length > 0 && (
          <ScrollView horizontal style={styles.attachedMediaContainer}>
            {attachedMedia.map((media) => (
              <View key={media.fileId} style={styles.attachedMediaItem}>
                {media.type === 'image' ? (
                  <Image
                    source={{ uri: getFileUrl(media.url) }}
                    style={styles.attachedMediaThumb}
                    resizeMode="cover"
                  />
                ) : media.type === 'audio' ? (
                  <View style={[styles.attachedMediaThumb, styles.attachedAudioThumb]}>
                    <IconButton icon="microphone" size={24} iconColor="#6200ee" />
                    <Text style={styles.audioDurationText}>
                      {media.duration ? `${Math.floor(media.duration / 60000)}:${String(Math.floor((media.duration % 60000) / 1000)).padStart(2, '0')}` : 'Audio'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.attachedMediaThumb}>
                    <IconButton icon="video" size={24} />
                  </View>
                )}
                <IconButton
                  icon="close-circle"
                  size={20}
                  iconColor="#f44336"
                  onPress={() => handleRemoveMedia(media.fileId)}
                  style={styles.removeMediaButton}
                />
              </View>
            ))}
          </ScrollView>
        )}

        {/* Upload/Processing progress indicator */}
        {(uploading || processing) && (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="small" color="#6200ee" />
            <Text style={styles.uploadingText}>
              {processing && !uploading ? 'Processing images...' : `Uploading... ${uploadProgress}%`}
            </Text>
          </View>
        )}

        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            value={newMessage}
            onChangeText={handleTextChange}
            placeholder="Type a message..."
            mode="outlined"
            style={[styles.input, { maxHeight: maxInputHeight }]}
            multiline
            maxLength={10000}
            disabled={sending || uploading}
          />
          <View style={styles.buttonColumn}>
            {/* More Menu with Attach Media and Record Audio options */}
            <Menu
              visible={moreMenuVisible}
              onDismiss={() => setMoreMenuVisible(false)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  mode="outlined"
                  size={32}
                  onPress={() => setMoreMenuVisible(true)}
                  disabled={uploading || sending || processing}
                  style={styles.addButton}
                />
              }
              anchorPosition="top"
              contentStyle={styles.moreMenuContent}
            >
              <Menu.Item
                leadingIcon="image-multiple"
                onPress={() => {
                  setMoreMenuVisible(false);
                  // Trigger media picker after menu closes
                  setTimeout(() => {
                    if (mediaPickerRef.current) {
                      mediaPickerRef.current();
                    }
                  }, 100);
                }}
                title="Attach Media"
              />
              <MenuDivider />
              <Menu.Item
                leadingIcon="microphone"
                onPress={() => {
                  setMoreMenuVisible(false);
                  setIsRecordingMode(true);
                }}
                title="Record Audio"
              />
              {/* Add Emoji - available on all platforms with emoji picker */}
              {hasEmojiPicker && (
                <>
                  <MenuDivider />
                  <Menu.Item
                    leadingIcon="emoticon-outline"
                    onPress={() => {
                      setMoreMenuVisible(false);
                      setShowEmojiPicker(true);
                    }}
                    title="Add Emoji"
                  />
                </>
              )}
            </Menu>
            {/* Hidden MediaPicker - triggered from menu */}
            <MediaPicker
              onSelect={handleMediaSelect}
              mediaType="both"
              maxSize={100 * 1024 * 1024}
              allowMultiple={true}
              imageQuality={0.8}
              disabled={uploading || sending || processing}
              onProcessingChange={setProcessing}
              renderTrigger={(onPress) => {
                // Store the onPress function to be called from menu
                mediaPickerRef.current = onPress;
                return null; // Don't render anything, menu triggers this
              }}
            />
            <IconButton
              icon="send"
              mode="contained"
              iconColor="#fff"
              containerColor="#6200ee"
              size={24}
              onPress={handleSendMessage}
              disabled={(!newMessage.trim() && attachedMedia.length === 0) || sending || uploading}
              style={styles.sendButton}
            />
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <CustomNavigationHeader
          title={messageGroupName || 'Messages'}
          onBack={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6200ee" />
        </View>
      </View>
    );
  }

  /**
   * Render long-press menu
   */
  const renderMessageMenu = () => {
    if (!longPressedMessage) return null;

    const isMyMessage = longPressedMessage.sender?.groupMemberId === currentUserMemberId;
    const isHidden = longPressedMessage.isHidden || false;

    return (
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setMenuVisible(false);
          setLongPressedMessage(null);
        }}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => {
            setMenuVisible(false);
            setLongPressedMessage(null);
          }}
        >
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>Message Options</Text>
            <MenuDivider />

            {/* React option - available to all members who can send messages */}
            {hasEmojiPicker && userRole !== 'supervisor' && isMember && (
              <TouchableOpacity style={styles.menuItem} onPress={() => openReactionPicker(longPressedMessage)}>
                <IconButton icon="emoticon-happy-outline" size={20} />
                <Text style={styles.menuItemText}>React</Text>
              </TouchableOpacity>
            )}

            {/* Hide/Unhide option for admins or own messages */}
            {userRole === 'admin' && !isHidden && (
              <TouchableOpacity style={styles.menuItem} onPress={handleHideMessage}>
                <IconButton icon="eye-off" size={20} />
                <Text style={styles.menuItemText}>Hide Message</Text>
              </TouchableOpacity>
            )}

            {userRole === 'admin' && isHidden && (
              <TouchableOpacity style={styles.menuItem} onPress={handleUnhideMessage}>
                <IconButton icon="eye" size={20} />
                <Text style={styles.menuItemText}>Unhide Message</Text>
              </TouchableOpacity>
            )}

            {userRole !== 'admin' && isMyMessage && !isHidden && (
              <TouchableOpacity style={styles.menuItem} onPress={handleHideMessage}>
                <IconButton icon="delete" size={20} />
                <Text style={styles.menuItemText}>Delete Message</Text>
              </TouchableOpacity>
            )}

            <MenuDivider />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setLongPressedMessage(null);
              }}
            >
              <Text style={[styles.menuItemText, styles.cancelText]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      {/* Custom Navigation Header */}
      <CustomNavigationHeader
        title={messageGroupName}
        onBack={() => navigation.goBack()}
        rightButtons={[
          {
            icon: 'arrow-down',
            onPress: () => scrollToBottom(true),
          },
        ]}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.messageId}
        contentContainerStyle={styles.messagesList}
        ListHeaderComponent={renderLoadMore}
        ListEmptyComponent={renderEmptyState}
      />


      {renderMentionPicker()}
      {renderMessageMenu()}
      {renderInputArea()}

      {/* Image Viewer */}
      {selectedMediaUrl && (
        <ImageViewer
          visible={showImageViewer}
          imageUrl={selectedMediaUrl}
          onClose={() => {
            setShowImageViewer(false);
            setSelectedMediaUrl(null);
          }}
        />
      )}

      {/* Video Player */}
      {selectedMediaUrl && (
        <VideoPlayer
          visible={showVideoPlayer}
          videoUrl={selectedMediaUrl}
          onClose={() => {
            setShowVideoPlayer(false);
            setSelectedMediaUrl(null);
          }}
        />
      )}

      {/* Native Emoji Picker for message input */}
      {NativeEmojiPicker && (
        <NativeEmojiPicker
          onEmojiSelected={handleEmojiSelect}
          open={showEmojiPicker}
          onClose={() => setShowEmojiPicker(false)}
          theme={{
            backdrop: 'rgba(0, 0, 0, 0.5)',
            knob: '#6200ee',
            container: '#fff',
            header: '#333',
            skinTonesContainer: '#f5f5f5',
            category: {
              icon: '#666',
              iconActive: '#6200ee',
              container: '#f5f5f5',
              containerActive: '#e3f2fd',
            },
          }}
        />
      )}

      {/* Native Emoji Picker for reactions */}
      {NativeEmojiPicker && (
        <NativeEmojiPicker
          onEmojiSelected={handleReactionSelect}
          open={showReactionPicker}
          onClose={() => {
            setShowReactionPicker(false);
            setReactionTargetMessage(null);
          }}
          theme={{
            backdrop: 'rgba(0, 0, 0, 0.5)',
            knob: '#6200ee',
            container: '#fff',
            header: '#333',
            skinTonesContainer: '#f5f5f5',
            category: {
              icon: '#666',
              iconActive: '#6200ee',
              container: '#f5f5f5',
              containerActive: '#e3f2fd',
            },
          }}
        />
      )}

      {/* Web Emoji Picker Modal for message input */}
      {Platform.OS === 'web' && WebEmojiPicker && showEmojiPicker && (
        <Modal
          visible={showEmojiPicker}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowEmojiPicker(false)}
        >
          <TouchableOpacity
            style={styles.webEmojiPickerOverlay}
            activeOpacity={1}
            onPress={() => setShowEmojiPicker(false)}
          >
            <Pressable
              style={styles.webEmojiPickerContainer}
              onPress={(e) => e.stopPropagation()}
            >
              <WebEmojiPicker
                onEmojiClick={(emojiData) => {
                  handleEmojiSelect({ emoji: emojiData.emoji });
                }}
                width="100%"
                height={400}
                searchPlaceHolder="Search emoji..."
                skinTonesDisabled
              />
            </Pressable>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Web Emoji Picker Modal for reactions */}
      {Platform.OS === 'web' && WebEmojiPicker && showReactionPicker && (
        <Modal
          visible={showReactionPicker}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            setShowReactionPicker(false);
            setReactionTargetMessage(null);
          }}
        >
          <TouchableOpacity
            style={styles.webEmojiPickerOverlay}
            activeOpacity={1}
            onPress={() => {
              setShowReactionPicker(false);
              setReactionTargetMessage(null);
            }}
          >
            <Pressable
              style={styles.webEmojiPickerContainer}
              onPress={(e) => e.stopPropagation()}
            >
              <WebEmojiPicker
                onEmojiClick={(emojiData) => {
                  handleReactionSelect({ emoji: emojiData.emoji });
                }}
                width="100%"
                height={400}
                searchPlaceHolder="Search emoji..."
                skinTonesDisabled
              />
            </Pressable>
          </TouchableOpacity>
        </Modal>
      )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  keyboardView: {
    flex: 1,
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
  messagesList: {
    padding: 16,
  },
  messageWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
    width: '90%',
  },
  messageWrapperLeft: {
    alignSelf: 'flex-start',
  },
  messageWrapperRight: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  messageBubble: {
    flex: 1,
    borderRadius: 12,
    padding: 8,
    elevation: 1,
  },
  messageBubbleLeft: {
    backgroundColor: '#fff',
  },
  messageBubbleRight: {
    backgroundColor: '#e3f2fd', // Light blue
  },
  messageBubbleHidden: {
    backgroundColor: '#f0f0f0', // Grey background for hidden messages
    borderWidth: 1,
    borderColor: '#ddd',
  },
  hiddenIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#fff',
    padding: 4,
    borderRadius: 4,
  },
  hiddenIcon: {
    margin: 0,
    padding: 0,
  },
  hiddenText: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
  },
  senderName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  messageContent: {
    fontSize: 15,
    color: '#333',
    lineHeight: 20,
    marginBottom: 2,
  },
  messageTime: {
    fontSize: 10,
    color: '#999',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 0,
  },
  timeAndReceipt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  readReceipt: {
    fontSize: 12,
    color: '#999',
  },
  readReceiptBlue: {
    color: '#2196F3',
  },
  hiddenChip: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#ffebee',
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
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  input: {
    flex: 1,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  buttonColumn: {
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
  },
  addButton: {
    margin: 0,
    width: 40,
    height: 40,
  },
  sendButton: {
    margin: 0,
  },
  supervisorNotice: {
    padding: 16,
    backgroundColor: '#fff3cd',
    borderTopWidth: 1,
    borderTopColor: '#ffd54f',
  },
  supervisorText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
  },
  loadMoreContainer: {
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f5f5f5',
  },
  loadMoreButton: {
    backgroundColor: '#e3f2fd',
  },
  loadMoreText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  mentionPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  mentionPickerOverlayWeb: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  mentionPickerContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingTop: 16,
    elevation: 5,
  },
  mentionPickerContainerWeb: {
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  mentionPickerScroll: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  mentionPickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  mentionPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 8,
  },
  mentionPickerItemText: {
    fontSize: 16,
    marginLeft: 12,
    color: '#333',
    fontWeight: '500',
  },
  mentionPickerEmpty: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    minWidth: 250,
    maxWidth: 300,
    padding: 8,
    elevation: 5,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    padding: 12,
    color: '#333',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  menuItemText: {
    fontSize: 15,
    color: '#333',
    marginLeft: 8,
  },
  cancelText: {
    color: '#999',
    textAlign: 'center',
    width: '100%',
    marginLeft: 0,
  },
  mediaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
    gap: 8,
  },
  audioPlayerWrapper: {
    width: '100%',
    marginVertical: 4,
  },
  mediaThumbnail: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 4,
  },
  mediaImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
  },
  videoThumbnail: {
    width: 200,
    height: 200,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  videoText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 4,
  },
  deletedMediaPlaceholder: {
    width: 200,
    height: 120,
    backgroundColor: '#ffebee',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffcdd2',
    padding: 8,
  },
  deletedMediaText: {
    color: '#d32f2f',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
  deletedByText: {
    color: '#999',
    fontSize: 10,
    marginTop: 2,
  },
  attachedMediaContainer: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  attachedMediaItem: {
    position: 'relative',
    marginRight: 8,
  },
  attachedMediaThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
  },
  removeMediaButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    margin: 0,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  uploadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 8,
  },
  uploadingText: {
    fontSize: 14,
    color: '#6200ee',
    fontWeight: '600',
  },
  attachedAudioThumb: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  audioDurationText: {
    fontSize: 10,
    color: '#388e3c',
    fontWeight: '600',
    marginTop: -4,
  },
  moreMenuContent: {
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  // Single emoji message styles
  messageBubbleSingleEmoji: {
    backgroundColor: 'transparent',
    elevation: 0,
    padding: 4,
  },
  messageContentSingleEmoji: {
    fontSize: 64,
    lineHeight: 72,
    textAlign: 'center',
  },
  messageFooterMinimal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  senderNameSmall: {
    fontSize: 10,
    color: '#999',
  },
  // Reactions styles
  messageWithReactions: {
    flexDirection: 'column',
    flex: 1,
  },
  reactionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 6,
  },
  reactionsContainerLeft: {
    justifyContent: 'flex-end',
    paddingRight: 8,
  },
  reactionsContainerRight: {
    justifyContent: 'flex-start',
    paddingLeft: 8,
  },
  reactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  reactionItemMine: {
    backgroundColor: '#e3f2fd',
    borderColor: '#90caf9',
  },
  reactionAvatarContainer: {
    position: 'relative',
    width: 24,
    height: 24,
  },
  reactionEmojiOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  reactionEmoji: {
    fontSize: 10,
  },
  reactionCount: {
    fontSize: 10,
    color: '#666',
    marginLeft: 2,
    fontWeight: '600',
  },
  // Web emoji picker styles
  webEmojiPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  webEmojiPickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    maxWidth: 400,
    width: '90%',
  },
});
