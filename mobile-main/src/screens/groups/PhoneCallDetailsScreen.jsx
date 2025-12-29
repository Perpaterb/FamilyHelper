/**
 * Phone Call Details Screen
 *
 * Shows details of a phone call including:
 * - Call status and duration
 * - Participants list with their status
 * - Recording playback (if available and not hidden)
 * - Admin can request recording deletion
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Linking, Pressable, Platform, TouchableOpacity } from 'react-native';
import { Card, Title, Text, Avatar, Button, Chip, IconButton, ActivityIndicator } from 'react-native-paper';
import { Audio } from 'expo-av';
import api from '../../services/api';
import { getContrastTextColor } from '../../utils/colorUtils';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';
import { CustomAlert } from '../../components/CustomAlert';
import { CONFIG } from '../../constants/config';
import UserAvatar from '../../components/shared/UserAvatar';

/**
 * @typedef {Object} PhoneCallDetailsScreenProps
 * @property {Object} navigation - React Navigation navigation object
 * @property {Object} route - React Navigation route object
 */

/**
 * PhoneCallDetailsScreen component
 *
 * @param {PhoneCallDetailsScreenProps} props
 * @returns {JSX.Element}
 */
export default function PhoneCallDetailsScreen({ navigation, route }) {
  const { groupId, callId, call: passedCall } = route.params;
  const [call, setCall] = useState(passedCall || null);
  const [loading, setLoading] = useState(!passedCall);
  const [userRole, setUserRole] = useState(null);
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [endingCall, setEndingCall] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [progressBarLeft, setProgressBarLeft] = useState(0);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const progressBarRef = useRef(null);

  useEffect(() => {
    loadGroupInfo();
    if (!passedCall) {
      loadCallDetails();
    }

    // Cleanup sound on unmount
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [callId]);

  // Poll for recording after call ends (recording takes time to upload)
  // Also poll while uploads are in progress (recording status === 'recording')
  useEffect(() => {
    // Check if there's already a recording
    const hasRecording = call?.recordingUrl || call?.recording?.url ||
                        (call?.recordingChunks && call.recordingChunks.length > 0) ||
                        (call?.recording?.chunks && call.recording.chunks.length > 0);
    // Check if upload is in progress
    const isUploading = call?.recording?.status === 'recording';
    // Poll if: call ended AND (no recording yet OR upload in progress)
    const shouldPoll = call?.status === 'ended' && (!hasRecording || isUploading);

    if (!shouldPoll) return;

    let pollCount = 0;
    // Poll for up to 5 minutes if uploading, 60 seconds otherwise
    const maxPolls = isUploading ? 60 : 12;

    const pollForRecording = setInterval(async () => {
      pollCount++;
      if (pollCount % 6 === 1 || pollCount === 1) { // Log every 30s or first poll
        console.log(`[CallDetails] Polling for recording (${pollCount}/${maxPolls})...`);
      }

      try {
        const response = await api.get(`/groups/${groupId}/phone-calls`);
        const updatedCall = response.data.phoneCalls?.find(c => c.callId === callId);

        if (updatedCall) {
          // Check if recording is now available (single or chunks)
          const hasNewRecording = updatedCall.recordingUrl || updatedCall.recording?.url ||
                                  (updatedCall.recordingChunks && updatedCall.recordingChunks.length > 0) ||
                                  (updatedCall.recording?.chunks && updatedCall.recording.chunks.length > 0);
          const stillUploading = updatedCall.recording?.status === 'recording';

          if (hasNewRecording && !stillUploading) {
            console.log('[CallDetails] Recording complete, updating state');
            setCall(updatedCall);
            clearInterval(pollForRecording);
          } else {
            // Update state with any changes (new chunks, etc)
            setCall(updatedCall);
          }
        }
      } catch (err) {
        console.error('[CallDetails] Poll error:', err);
      }

      // Stop polling after max attempts
      if (pollCount >= maxPolls) {
        console.log('[CallDetails] Max polls reached, stopping');
        clearInterval(pollForRecording);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollForRecording);
  }, [call?.status, call?.recordingUrl, call?.recording?.url, call?.recording?.status, call?.recordingChunks?.length, call?.recording?.chunks?.length, groupId, callId]);

  /**
   * Load group info to get user role
   */
  const loadGroupInfo = async () => {
    try {
      const response = await api.get(`/groups/${groupId}`);
      setUserRole(response.data.group?.userRole);
    } catch (err) {
      console.error('Load group info error:', err);
    }
  };

  /**
   * Load call details from API
   */
  const loadCallDetails = async () => {
    try {
      const response = await api.get(`/groups/${groupId}/phone-calls`);
      const foundCall = response.data.phoneCalls?.find(c => c.callId === callId);
      if (foundCall) {
        setCall(foundCall);
      }
    } catch (err) {
      console.error('Load call details error:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Format duration from milliseconds
   */
  const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  /**
   * Format date/time
   */
  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * Get status color
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
   * Get participant status color
   */
  const getParticipantStatusColor = (status) => {
    switch (status) {
      case 'joined':
      case 'accepted':
        return '#4caf50';
      case 'left':
        return '#ff9800';
      case 'rejected':
        return '#f44336';
      case 'missed':
        return '#9e9e9e';
      case 'invited':
        return '#2196f3';
      default:
        return '#666';
    }
  };

  /**
   * Get full recording URL (for single recording or chunk)
   */
  const getRecordingUrl = (chunkUrl = null) => {
    const relativeUrl = chunkUrl || call?.recording?.url || call?.recordingUrl;
    if (!relativeUrl) return null;
    // If already absolute URL, use it directly
    if (relativeUrl.startsWith('http')) return relativeUrl;
    // Otherwise prepend API base URL
    return `${CONFIG.API_BASE_URL}${relativeUrl}`;
  };

  /**
   * Get current chunk URL (for playlist mode)
   * Handles both call.recordingChunks and call.recording.chunks formats
   */
  const getCurrentChunkUrl = () => {
    const chunks = call?.recordingChunks || call?.recording?.chunks;
    if (!chunks || chunks.length === 0) return null;
    const sortedChunks = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
    const chunk = sortedChunks[currentChunkIndex];
    // API returns `url`, local data might have `fileUrl`
    return chunk ? getRecordingUrl(chunk.url || chunk.fileUrl) : null;
  };

  /**
   * Get sorted recording chunks
   * Handles both call.recordingChunks and call.recording.chunks formats
   */
  const getSortedChunks = () => {
    const chunks = call?.recordingChunks || call?.recording?.chunks || [];
    return [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  };

  /**
   * Handle audio end - auto-play next chunk
   */
  const handleAudioEnd = async () => {
    const chunks = getSortedChunks();
    if (currentChunkIndex < chunks.length - 1) {
      // Unload current sound
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }
      setCurrentChunkIndex(prev => prev + 1);
      setPlaybackPosition(0);
      // Will auto-play via useEffect watching currentChunkIndex
    }
  };

  // Auto-play next chunk when index changes
  useEffect(() => {
    const chunks = getSortedChunks();
    if (chunks.length > 0 && currentChunkIndex > 0 && isPlaying) {
      // Load and play the new chunk
      const playNextChunk = async () => {
        const chunkUrl = getCurrentChunkUrl();
        if (chunkUrl) {
          try {
            setLoadingAudio(true);
            const { sound: newSound } = await Audio.Sound.createAsync(
              { uri: chunkUrl },
              { shouldPlay: true },
              onPlaybackStatusUpdate
            );
            setSound(newSound);
            setIsPlaying(true);
          } catch (err) {
            console.error('Audio chunk playback error:', err);
          } finally {
            setLoadingAudio(false);
          }
        }
      };
      playNextChunk();
    }
  }, [currentChunkIndex]);

  /**
   * Play or pause recording
   */
  const togglePlayback = async () => {
    // Use chunk URL if chunks exist, otherwise single recording URL
    const chunks = getSortedChunks();
    const recordingUrl = chunks.length > 0 ? getCurrentChunkUrl() : getRecordingUrl();
    if (!recordingUrl) return;

    try {
      if (sound) {
        if (isPlaying) {
          await sound.pauseAsync();
          setIsPlaying(false);
        } else {
          await sound.playAsync();
          setIsPlaying(true);
        }
      } else {
        setLoadingAudio(true);
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: recordingUrl },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );
        setSound(newSound);
        setIsPlaying(true);
        setLoadingAudio(false);
      }
    } catch (err) {
      console.error('Audio playback error:', err);
      CustomAlert.alert('Playback Error', 'Failed to play recording');
      setLoadingAudio(false);
    }
  };

  /**
   * Handle playback status updates
   */
  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setPlaybackPosition(status.positionMillis);
      setPlaybackDuration(status.durationMillis || call?.recordingDurationMs || 0);
      if (status.didJustFinish) {
        // Check if there are more chunks to play
        const chunks = getSortedChunks();
        if (chunks.length > 0 && currentChunkIndex < chunks.length - 1) {
          handleAudioEnd();
        } else {
          setIsPlaying(false);
          setPlaybackPosition(0);
        }
      }
    }
  };

  /**
   * Handle tap on progress bar to seek
   * Works on both mobile (locationX) and web (offsetX/pageX)
   */
  const handleSeek = async (event) => {
    if (!sound || !playbackDuration || progressBarWidth === 0) return;

    let locationX;

    if (Platform.OS === 'web') {
      // On web, use offsetX if available, otherwise calculate from pageX
      if (event.nativeEvent.offsetX !== undefined) {
        locationX = event.nativeEvent.offsetX;
      } else if (event.nativeEvent.pageX !== undefined) {
        locationX = event.nativeEvent.pageX - progressBarLeft;
      } else {
        return;
      }
    } else {
      // On mobile, use locationX
      locationX = event.nativeEvent.locationX;
    }

    if (locationX === undefined || locationX === null) return;

    // Clamp to valid range
    locationX = Math.max(0, Math.min(locationX, progressBarWidth));
    const seekPosition = (locationX / progressBarWidth) * playbackDuration;

    try {
      await sound.setPositionAsync(Math.max(0, Math.floor(seekPosition)));
    } catch (err) {
      console.error('Seek error:', err);
    }
  };

  /**
   * Handle layout to get width and position for web click handling
   */
  const handleProgressBarLayout = (e) => {
    setProgressBarWidth(e.nativeEvent.layout.width);
    // On web, also track the left position for pageX calculation
    if (Platform.OS === 'web' && progressBarRef.current) {
      try {
        progressBarRef.current.measure((x, y, width, height, pageX, pageY) => {
          setProgressBarLeft(pageX || 0);
        });
      } catch (err) {
        // measure might not be available, use layout.x as fallback
        setProgressBarLeft(e.nativeEvent.layout.x || 0);
      }
    }
  };

  /**
   * Handle hide recording (admin only)
   */
  const handleHideRecording = () => {
    CustomAlert.alert(
      'Hide Recording',
      'Are you sure you want to hide this recording? This action requires admin approval.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.put(`/groups/${groupId}/phone-calls/${callId}/hide-recording`);
              CustomAlert.alert('Success', 'Recording has been hidden');
              setCall(prev => ({ ...prev, recordingIsHidden: true }));
            } catch (err) {
              console.error('Hide recording error:', err);
              CustomAlert.alert('Error', err.response?.data?.message || 'Failed to hide recording');
            }
          },
        },
      ]
    );
  };

  /**
   * Handle ending the call
   */
  const handleEndCall = async () => {
    CustomAlert.alert(
      'End Call',
      'Are you sure you want to end this call?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Call',
          style: 'destructive',
          onPress: async () => {
            setEndingCall(true);
            try {
              await api.put(`/groups/${groupId}/phone-calls/${callId}/end`);
              setCall(prev => ({ ...prev, status: 'ended', endedAt: new Date().toISOString() }));
              CustomAlert.alert('Call Ended', 'The call has been ended.');
            } catch (err) {
              console.error('End call error:', err);
              CustomAlert.alert('Error', err.response?.data?.message || 'Failed to end call');
            } finally {
              setEndingCall(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <CustomNavigationHeader
          title="Call Details"
          onBack={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4caf50" />
        </View>
      </View>
    );
  }

  if (!call) {
    return (
      <View style={styles.container}>
        <CustomNavigationHeader
          title="Call Details"
          onBack={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <Text>Call not found</Text>
        </View>
      </View>
    );
  }

  const statusColors = getStatusColor(call.status);
  // Check for recording - either single URL or chunked recordings
  const sortedChunks = getSortedChunks();
  const hasChunks = sortedChunks.length > 0;
  const hasSingleRecording = (call.recording?.url || call.recordingUrl) &&
                             !call.recording?.isHidden && !call.recordingIsHidden;
  // Check if recording is in progress (uploading chunks)
  const isUploadingRecording = call.recording?.status === 'recording';
  // Show recording section if we have content OR if uploads are in progress
  const hasRecording = hasSingleRecording || hasChunks || isUploadingRecording;
  // Check if recording is still processing
  const isRecordingProcessing = call.recording?.status === 'processing';

  return (
    <View style={styles.container}>
      <CustomNavigationHeader
        title="Call Details"
        onBack={() => navigation.goBack()}
      />

      <ScrollView style={styles.scrollView}>
        {/* Call Info Card */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.headerRow}>
              <View style={styles.callIconLarge}>
                <Text style={styles.callEmojiLarge}>📞</Text>
              </View>
              <View style={styles.headerInfo}>
                <Chip
                  mode="outlined"
                  style={[styles.statusChip, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}
                  textStyle={[styles.statusChipText, { color: statusColors.text }]}
                >
                  {call.status}
                </Chip>
                <Text style={styles.dateText}>{formatDateTime(call.startedAt)}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Duration:</Text>
              <Text style={styles.infoValue}>{formatDuration(call.durationMs)}</Text>
            </View>

            {call.connectedAt && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Connected at:</Text>
                <Text style={styles.infoValue}>{formatDateTime(call.connectedAt)}</Text>
              </View>
            )}

            {call.endedAt && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Ended at:</Text>
                <Text style={styles.infoValue}>{formatDateTime(call.endedAt)}</Text>
              </View>
            )}

            {/* End Call Button - show for active or ringing calls */}
            {(call.status === 'active' || call.status === 'ringing') && (
              <Button
                mode="contained"
                onPress={handleEndCall}
                loading={endingCall}
                disabled={endingCall}
                style={styles.endCallButton}
                buttonColor="#d32f2f"
                textColor="#fff"
                icon="phone-hangup"
              >
                {endingCall ? 'Ending...' : 'End Call'}
              </Button>
            )}
          </Card.Content>
        </Card>

        {/* Recording Processing Placeholder */}
        {isRecordingProcessing && (
          <Card style={[styles.card, styles.processingCard]}>
            <Card.Content>
              <Title style={styles.sectionTitle}>Recording</Title>
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color="#ff9800" />
                <Text style={styles.processingTitle}>Processing Recording</Text>
                <Text style={styles.processingText}>
                  Your recording is being processed. This may take a few moments.
                </Text>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Recording Card */}
        {hasRecording && !isRecordingProcessing && (
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.sectionTitle}>
                Recording {hasChunks && `(${sortedChunks.length} segments)`}
              </Title>

              <View style={styles.playerContainer}>
                <IconButton
                  icon={loadingAudio ? 'loading' : isPlaying ? 'pause' : 'play'}
                  size={40}
                  onPress={togglePlayback}
                  disabled={loadingAudio}
                  style={styles.playButton}
                  iconColor="#fff"
                />

                <View style={styles.progressContainer}>
                  <Pressable
                    ref={progressBarRef}
                    style={styles.progressBarTouchable}
                    onPress={handleSeek}
                    onLayout={handleProgressBarLayout}
                  >
                    <View style={styles.progressBarWrapper}>
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${playbackDuration > 0 ? (playbackPosition / playbackDuration) * 100 : 0}%` }
                          ]}
                        />
                      </View>
                      {/* Seek indicator dot */}
                      <View
                        style={[
                          styles.seekDot,
                          { left: `${playbackDuration > 0 ? (playbackPosition / playbackDuration) * 100 : 0}%` }
                        ]}
                      />
                    </View>
                  </Pressable>
                  <View style={styles.timeRow}>
                    <Text style={styles.timeText}>{formatDuration(playbackPosition)}</Text>
                    <Text style={styles.timeText}>
                      {hasChunks
                        ? formatDuration(sortedChunks[currentChunkIndex]?.durationMs || playbackDuration)
                        : formatDuration(call.recording?.durationMs || call.recordingDurationMs || playbackDuration)
                      }
                    </Text>
                  </View>
                </View>
              </View>

              {/* Chunk navigation controls */}
              {hasChunks && (
                <View style={styles.chunkNavigation}>
                  <TouchableOpacity
                    style={[styles.chunkNavButton, currentChunkIndex === 0 && styles.chunkNavButtonDisabled]}
                    onPress={async () => {
                      if (sound) {
                        await sound.unloadAsync();
                        setSound(null);
                      }
                      setPlaybackPosition(0);
                      setCurrentChunkIndex(prev => Math.max(0, prev - 1));
                    }}
                    disabled={currentChunkIndex === 0}
                  >
                    <Text style={[styles.chunkNavButtonText, currentChunkIndex === 0 && styles.chunkNavButtonTextDisabled]}>
                      Previous
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.chunkIndicator}>
                    Segment {currentChunkIndex + 1} of {sortedChunks.length}
                  </Text>

                  <TouchableOpacity
                    style={[styles.chunkNavButton, currentChunkIndex >= sortedChunks.length - 1 && styles.chunkNavButtonDisabled]}
                    onPress={async () => {
                      if (sound) {
                        await sound.unloadAsync();
                        setSound(null);
                      }
                      setPlaybackPosition(0);
                      setCurrentChunkIndex(prev => Math.min(sortedChunks.length - 1, prev + 1));
                    }}
                    disabled={currentChunkIndex >= sortedChunks.length - 1}
                  >
                    <Text style={[styles.chunkNavButtonText, currentChunkIndex >= sortedChunks.length - 1 && styles.chunkNavButtonTextDisabled]}>
                      Next
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Chunk list - show if we have chunks OR if uploads are in progress */}
              {(hasChunks || isUploadingRecording) && (
                <View style={styles.chunkList}>
                  <Text style={styles.chunkListTitle}>All Segments</Text>
                  {sortedChunks.map((chunk, index) => (
                    <TouchableOpacity
                      key={chunk.chunkId}
                      style={[styles.chunkItem, index === currentChunkIndex && styles.chunkItemActive]}
                      onPress={async () => {
                        if (sound) {
                          await sound.unloadAsync();
                          setSound(null);
                        }
                        setPlaybackPosition(0);
                        setCurrentChunkIndex(index);
                      }}
                    >
                      <View style={styles.chunkItemLeft}>
                        <Text style={[styles.chunkItemNumber, index === currentChunkIndex && styles.chunkItemTextActive]}>
                          {index + 1}
                        </Text>
                        <View>
                          <Text style={[styles.chunkItemDuration, index === currentChunkIndex && styles.chunkItemTextActive]}>
                            {formatDuration(chunk.durationMs)}
                          </Text>
                          <Text style={styles.chunkItemTime}>
                            {new Date(chunk.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                      </View>
                      {index === currentChunkIndex && (
                        <Text style={styles.chunkItemNowPlaying}>
                          {isPlaying ? 'Now Playing' : 'Selected'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}

                  {/* Show pending upload indicator if recording is still in progress */}
                  {isUploadingRecording && (
                    <View style={styles.chunkItemPending}>
                      <View style={styles.chunkItemLeft}>
                        <Text style={styles.chunkItemNumberPending}>
                          {sortedChunks.length + 1}
                        </Text>
                        <View>
                          <Text style={styles.chunkItemDurationPending}>Uploading...</Text>
                          <Text style={styles.chunkItemTime}>In progress</Text>
                        </View>
                      </View>
                      <ActivityIndicator size="small" color="#ff9800" />
                    </View>
                  )}
                </View>
              )}

              {/* Admin can hide recording */}
              {userRole === 'admin' && (
                <Button
                  mode="outlined"
                  onPress={handleHideRecording}
                  style={styles.hideButton}
                  textColor="#d32f2f"
                >
                  Hide Recording
                </Button>
              )}
            </Card.Content>
          </Card>
        )}

        {/* Recording Hidden/Deleted Notice */}
        {(call.recordingIsHidden || call.recording?.isHidden) && (
          <Card style={[styles.card, styles.deletedCard]}>
            <Card.Content>
              <View style={styles.deletedNotice}>
                <View style={styles.deletedIconContainer}>
                  <Text style={styles.deletedIcon}>🗑️</Text>
                </View>
                <View style={styles.deletedInfo}>
                  <Text style={styles.deletedTitle}>Recording Deleted by Admin</Text>
                  {call.recording?.hiddenBy && (
                    <View style={styles.deletedByRow}>
                      <UserAvatar
                        size={24}
                        profilePhotoUrl={call.recording.hiddenBy.profilePhotoUrl}
                        memberIcon={call.recording.hiddenBy.iconLetters}
                        iconColor={call.recording.hiddenBy.iconColor || '#d32f2f'}
                        displayName={call.recording.hiddenBy.displayName}
                      />
                      <Text style={styles.deletedByText}>
                        {call.recording.hiddenBy.displayName || 'Admin'}
                        {call.recording.hiddenAt &&
                          ` • ${formatDateTime(call.recording.hiddenAt)}`
                        }
                      </Text>
                    </View>
                  )}
                  {!call.recording?.hiddenBy && (
                    <Text style={styles.deletedByText}>
                      This recording was removed by a group admin
                    </Text>
                  )}
                </View>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Participants Card */}
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>
              Participants
            </Title>

            {/* Initiator */}
            {call.initiator && (
              <View style={styles.participantRow}>
                <UserAvatar
                  size={40}
                  profilePhotoUrl={call.initiator.profilePhotoUrl}
                  memberIcon={call.initiator.iconLetters}
                  iconColor={call.initiator.iconColor || '#6200ee'}
                  displayName={call.initiator.displayName}
                />
                <View style={styles.participantInfo}>
                  <Text style={styles.participantName}>
                    {call.initiator.displayName || 'Unknown'}
                  </Text>
                  <Text style={styles.participantRole}>Caller (Initiator)</Text>
                </View>
              </View>
            )}

            {/* Other participants */}
            {call.participants?.map(participant => {
              if (participant.groupMemberId === call.initiatedBy) return null;
              const statusColor = getParticipantStatusColor(participant.status);

              return (
                <View key={participant.groupMemberId} style={styles.participantRow}>
                  <UserAvatar
                    size={40}
                    profilePhotoUrl={participant.profilePhotoUrl}
                    memberIcon={participant.iconLetters}
                    iconColor={participant.iconColor || '#6200ee'}
                    displayName={participant.displayName}
                  />
                  <View style={styles.participantInfo}>
                    <Text style={styles.participantName}>
                      {participant.displayName || 'Unknown'}
                    </Text>
                    <Text style={styles.participantRole}>Participant</Text>
                  </View>
                </View>
              );
            })}
          </Card.Content>
        </Card>
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  card: {
    margin: 16,
    marginBottom: 8,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  callIconLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  callEmojiLarge: {
    fontSize: 32,
  },
  headerInfo: {
    flex: 1,
  },
  statusChip: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  statusChipText: {
    textTransform: 'capitalize',
  },
  dateText: {
    fontSize: 14,
    color: '#666',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  endCallButton: {
    marginTop: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 16,
  },
  playerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  playButton: {
    backgroundColor: '#4caf50',
    marginRight: 16,
  },
  progressContainer: {
    flex: 1,
  },
  progressBarTouchable: {
    paddingVertical: 10, // Larger touch target
    cursor: Platform.OS === 'web' ? 'pointer' : undefined,
  },
  progressBarWrapper: {
    position: 'relative',
    height: 16, // Height to contain the seek dot
    justifyContent: 'center',
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4caf50',
    borderRadius: 3,
  },
  seekDot: {
    position: 'absolute',
    top: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4caf50',
    transform: [{ translateX: -8 }], // Center the dot on the position
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    color: '#666',
  },
  hideButton: {
    borderColor: '#d32f2f',
  },
  processingCard: {
    backgroundColor: '#fff8e1',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  processingContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  processingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e65100',
    marginTop: 16,
    marginBottom: 8,
  },
  processingText: {
    fontSize: 14,
    color: '#f57c00',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  hiddenCard: {
    backgroundColor: '#fff3e0',
  },
  hiddenNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  hiddenText: {
    fontSize: 14,
    color: '#e65100',
  },
  deletedCard: {
    backgroundColor: '#ffebee',
    borderLeftWidth: 4,
    borderLeftColor: '#d32f2f',
  },
  deletedNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  deletedIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffcdd2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  deletedIcon: {
    fontSize: 24,
  },
  deletedInfo: {
    flex: 1,
  },
  deletedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#c62828',
    marginBottom: 4,
  },
  deletedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  deletedByText: {
    fontSize: 13,
    color: '#d32f2f',
    marginLeft: 8,
    flex: 1,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  participantInfo: {
    marginLeft: 12,
    flex: 1,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '500',
  },
  participantRole: {
    fontSize: 13,
    color: '#4caf50',
  },
  participantStatus: {
    fontSize: 13,
    textTransform: 'capitalize',
  },
  // Chunk navigation styles
  chunkNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    marginBottom: 12,
  },
  chunkNavButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#4caf50',
    borderRadius: 4,
  },
  chunkNavButtonDisabled: {
    backgroundColor: '#e0e0e0',
  },
  chunkNavButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  chunkNavButtonTextDisabled: {
    color: '#999',
  },
  chunkIndicator: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  // Chunk list styles
  chunkList: {
    marginBottom: 16,
  },
  chunkListTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  chunkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 6,
  },
  chunkItemActive: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#4caf50',
  },
  chunkItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chunkItemNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    width: 24,
    marginRight: 12,
  },
  chunkItemTextActive: {
    color: '#2e7d32',
  },
  chunkItemDuration: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  chunkItemTime: {
    fontSize: 12,
    color: '#999',
  },
  chunkItemNowPlaying: {
    fontSize: 12,
    color: '#4caf50',
    fontWeight: '500',
  },
  // Pending upload indicator styles
  chunkItemPending: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff8e1',
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#ff9800',
    borderStyle: 'dashed',
  },
  chunkItemNumberPending: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff9800',
    width: 24,
    marginRight: 12,
  },
  chunkItemDurationPending: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ff9800',
  },
});
