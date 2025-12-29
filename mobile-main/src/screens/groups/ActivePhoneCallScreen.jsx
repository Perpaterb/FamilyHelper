/**
 * Active Phone Call Screen
 *
 * Shows during an active or ringing phone call.
 * Features:
 * - WebRTC peer-to-peer audio (web and mobile with dev build)
 * - Participant avatars and status
 * - Call duration timer (when connected)
 * - Mute and speaker controls
 * - End call button
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, BackHandler, Platform } from 'react-native';
import { Text, Avatar, Button, IconButton, ActivityIndicator } from 'react-native-paper';
import { Audio } from 'expo-av';
import { useKeepAwake } from 'expo-keep-awake';
import api from '../../services/api';
import { getContrastTextColor } from '../../utils/colorUtils';
import { CustomAlert } from '../../components/CustomAlert';
import { useWebRTC } from '../../hooks/useWebRTC';
import UserAvatar from '../../components/shared/UserAvatar';
import AudioSettingsModal from '../../components/AudioSettingsModal';

/**
 * Get color for participant status
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
    case 'invited':
      return '#2196f3';
    default:
      return '#666';
  }
};

/**
 * ActivePhoneCallScreen component
 */
export default function ActivePhoneCallScreen({ navigation, route }) {
  // Keep screen awake during phone call
  useKeepAwake();

  const { groupId, callId, call: passedCall, isInitiator } = route.params;
  const [call, setCall] = useState(passedCall || null);
  const [loading, setLoading] = useState(!passedCall);
  const [endingCall, setEndingCall] = useState(false);
  const [leavingCall, setLeavingCall] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);

  // Server-side recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState('idle');
  const [isRecordingDisabled, setIsRecordingDisabled] = useState(false);

  // Audio settings modal state
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [participantVolumes, setParticipantVolumes] = useState({});

  const timerRef = useRef(null);
  const pollRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // WebRTC hook - audio only for phone calls
  const {
    localStream,
    remoteStreams,
    isConnecting,
    error: webrtcError,
    connectionStates,
    isWebRTCSupported,
    toggleAudio,
    stopConnection,
  } = useWebRTC({
    groupId,
    callId,
    isActive: call?.status === 'active',
    isInitiator,
    audioOnly: true,
    callType: 'phone',
  });

  // Get first remote stream (for 1-to-1 calls)
  const remoteStreamEntries = Object.entries(remoteStreams);
  const firstRemoteStream = remoteStreamEntries.length > 0 ? remoteStreamEntries[0][1] : null;

  useEffect(() => {
    if (!passedCall) {
      loadCallDetails();
    } else {
      // Check if recording is disabled from passed call data
      if (passedCall.recording?.status === 'disabled' || passedCall.recordingStatus === 'disabled') {
        setIsRecordingDisabled(true);
      }
    }

    // Start polling for call status updates
    startPolling();

    // Set up audio mode
    setupAudio();

    // Prevent back button from leaving without ending
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleEndCall();
      return true;
    });

    return () => {
      stopPolling();
      stopConnection();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      stopRecording();
      backHandler.remove();
    };
  }, [callId]);

  // Start duration timer when call becomes active
  useEffect(() => {
    if (call?.status === 'active' && call?.connectedAt) {
      startDurationTimer();
    }
  }, [call?.status, call?.connectedAt]);

  // Play remote audio on web
  useEffect(() => {
    if (Platform.OS === 'web' && remoteAudioRef.current && firstRemoteStream) {
      remoteAudioRef.current.srcObject = firstRemoteStream;
    }
  }, [firstRemoteStream]);

  // Start recording when call becomes active (only if recording is enabled)
  useEffect(() => {
    if (call?.status === 'active' && !isRecording && recordingStatus === 'idle' && !isRecordingDisabled) {
      console.log('[ActivePhoneCall] Call is active, starting recording...');
      setTimeout(() => startRecording(), 500);
    }
  }, [call?.status, isRecordingDisabled]);

  const setupAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: !isSpeaker,
      });
    } catch (err) {
      console.error('[ActivePhoneCall] Audio setup error:', err);
    }
  };

  const fetchCallUpdate = async () => {
    try {
      const response = await api.get(`/groups/${groupId}/phone-calls`);
      const updatedCall = response.data.phoneCalls?.find(c => c.callId === callId);
      if (updatedCall) {
        setCall(updatedCall);

        // Sync recording status from server for ALL participants
        if (updatedCall.recording?.status === 'disabled' || updatedCall.recordingStatus === 'disabled') {
          setIsRecordingDisabled(true);
          setIsRecording(false);
        } else if (updatedCall.recording?.status === 'recording') {
          setIsRecording(true);
          setRecordingStatus('recording');
          setIsRecordingDisabled(false);
        } else if (updatedCall.recording?.status === 'completed' || updatedCall.recording?.status === 'ready') {
          setIsRecording(false);
          setRecordingStatus('idle');
        }

        if (updatedCall.status === 'ended' || updatedCall.status === 'missed') {
          console.log('[ActivePhoneCall] Call ended remotely');
          stopPolling();
          await stopRecording();
          stopConnection();

          navigation.replace('PhoneCallDetails', {
            groupId,
            callId,
            call: updatedCall,
          });
        }
      }
    } catch (err) {
      console.error('Poll call status error:', err);
    }
  };

  const startPolling = () => {
    fetchCallUpdate();
    pollRef.current = setInterval(fetchCallUpdate, 2000);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startDurationTimer = () => {
    if (timerRef.current) return;
    const startTime = call.connectedAt ? new Date(call.connectedAt).getTime() : Date.now();
    timerRef.current = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
  };

  const loadCallDetails = async () => {
    try {
      const response = await api.get(`/groups/${groupId}/phone-calls`);
      const foundCall = response.data.phoneCalls?.find(c => c.callId === callId);
      if (foundCall) {
        setCall(foundCall);
        // Check if recording is disabled for this group
        if (foundCall.recording?.status === 'disabled' || foundCall.recordingStatus === 'disabled') {
          setIsRecordingDisabled(true);
        }
      }
    } catch (err) {
      console.error('Load call details error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggleMute = () => {
    const newValue = !isMuted;
    setIsMuted(newValue);
    toggleAudio(!newValue);
  };

  /**
   * Handle output device change from audio settings modal
   */
  const handleOutputDeviceChange = async (device) => {
    const useSpeaker = device === 'speaker';
    setIsSpeaker(useSpeaker);
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: !useSpeaker,
      });
    } catch (err) {
      console.error('[ActivePhoneCall] Output device change error:', err);
    }
  };

  /**
   * Handle participant volume change from audio settings modal
   */
  const handleParticipantVolumeChange = (groupMemberId, volume) => {
    setParticipantVolumes(prev => ({ ...prev, [groupMemberId]: volume }));

    // For web, we can adjust the HTMLMediaElement volume
    if (Platform.OS === 'web' && remoteAudioRef.current) {
      remoteAudioRef.current.volume = volume;
    }
    // Note: For mobile, individual participant volume control is more complex
  };

  /**
   * Start server-side recording
   * Initiator triggers the ghost recorder on the server
   */
  const startRecording = async () => {
    if (isRecording) return;
    if (!isInitiator) {
      console.log('[ActivePhoneCall] Only initiator can start recording');
      return;
    }

    console.log('[ActivePhoneCall] Starting server-side recording...');
    setRecordingStatus('recording');

    try {
      const response = await api.post(`/groups/${groupId}/phone-calls/${callId}/start-recording`);
      if (response.data.isRecording) {
        setIsRecording(true);
        console.log('[ActivePhoneCall] Server-side recording started');
      }
    } catch (err) {
      console.error('[ActivePhoneCall] Start recording error:', err);
      setRecordingStatus('error');
    }
  };

  /**
   * Stop server-side recording
   */
  const stopRecording = async () => {
    if (!isRecording) return;
    if (!isInitiator) return;

    console.log('[ActivePhoneCall] Stopping server-side recording...');
    setRecordingStatus('stopping');

    try {
      await api.post(`/groups/${groupId}/phone-calls/${callId}/stop-recording`);
      console.log('[ActivePhoneCall] Server-side recording stopped');
    } catch (err) {
      console.error('[ActivePhoneCall] Stop recording error:', err);
    } finally {
      setIsRecording(false);
      setRecordingStatus('idle');
    }
  };

  const handleLeaveCall = () => {
    if (leavingCall) return;

    CustomAlert.alert(
      'Leave Phone Call',
      isInitiator
        ? 'As the initiator, leaving will end the call for everyone.'
        : 'Are you sure you want to leave this call?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setLeavingCall(true);
            try {
              await stopRecording();
              stopConnection();
              const response = await api.put(`/groups/${groupId}/phone-calls/${callId}/leave`);
              stopPolling();

              if (response.data.callEnded) {
                navigation.replace('PhoneCallDetails', {
                  groupId,
                  callId,
                  call: { ...call, status: 'ended', endedAt: new Date().toISOString() },
                });
              } else {
                navigation.replace('PhoneCalls', { groupId });
              }
            } catch (err) {
              console.error('Leave call error:', err);
              CustomAlert.alert('Error', err.response?.data?.message || 'Failed to leave call');
              setLeavingCall(false);
            }
          },
        },
      ]
    );
  };

  const handleEndCall = () => {
    if (endingCall) return;

    CustomAlert.alert(
      'End Phone Call for Everyone',
      'This will end the phone call for all participants. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End for All',
          style: 'destructive',
          onPress: async () => {
            setEndingCall(true);
            try {
              await stopRecording();
              stopConnection();
              await api.put(`/groups/${groupId}/phone-calls/${callId}/end`);
              stopPolling();
              navigation.replace('PhoneCallDetails', {
                groupId,
                callId,
                call: { ...call, status: 'ended', endedAt: new Date().toISOString() },
              });
            } catch (err) {
              console.error('End call error:', err);
              CustomAlert.alert('Error', err.response?.data?.message || 'Failed to end call');
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
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Connecting...</Text>
      </View>
    );
  }

  if (!call) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Call not found</Text>
        <Button mode="contained" onPress={() => navigation.goBack()} style={styles.backButton}>
          Go Back
        </Button>
      </View>
    );
  }

  const isRinging = call.status === 'ringing';
  const isActive = call.status === 'active';

  // Get all participants for display (initiator + all call participants)
  const allParticipants = [];

  // Check if we have ANY connected WebRTC peer (simplified check)
  const hasAnyConnection = firstRemoteStream || Object.values(connectionStates).some(s => s === 'connected');

  // Add initiator
  if (call.initiator) {
    // If I'm the initiator, I'm always "joined"
    // If I'm the callee and we have a connection, show initiator as "joined"
    const initiatorStatus = isInitiator ? 'joined' : (hasAnyConnection ? 'joined' : 'accepted');

    allParticipants.push({
      ...call.initiator,
      isInitiator: true,
      callStatus: initiatorStatus,
    });
  }

  // Add other participants
  if (call.participants) {
    call.participants.forEach(p => {
      // Don't add if already the initiator
      if (p.groupMemberId !== call.initiator?.groupMemberId) {
        // If we have any connection and participant accepted, show as joined
        const effectiveStatus = (hasAnyConnection && p.status === 'accepted') ? 'joined' : p.status;

        allParticipants.push({
          ...p,
          isInitiator: false,
          callStatus: effectiveStatus,
        });
      }
    });
  }

  return (
    <View style={styles.container}>
      {/* Hidden audio element for remote stream on web */}
      {Platform.OS === 'web' && (
        <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
      )}

      {/* Top Status */}
      <View style={styles.topSection}>
        <Text style={styles.statusText}>
          {isRinging ? '📞 Calling...' : '📞 Phone Call'}
        </Text>
        {isActive && (
          <Text style={styles.durationText}>{formatDuration(callDuration)}</Text>
        )}
        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingLabel}>REC</Text>
          </View>
        )}
        {isRecordingDisabled && (
          <View style={styles.notRecordingIndicator}>
            <Text style={styles.notRecordingLabel}>Not Recording</Text>
          </View>
        )}
      </View>

      {/* Main Content - All Participant Avatars */}
      <View style={styles.mainContent}>
        <View style={styles.participantsRow}>
          {allParticipants.map((participant, index) => (
            <View key={participant.groupMemberId || index} style={styles.participantItem}>
              <View style={[
                styles.avatarWrapper,
                participant.callStatus === 'joined' && styles.avatarConnected,
                participant.callStatus === 'accepted' && styles.avatarConnecting,
                participant.callStatus === 'invited' && styles.avatarRinging,
              ]}>
                <UserAvatar
                  size={allParticipants.length > 2 ? 80 : 100}
                  profilePhotoUrl={participant.profilePhotoUrl}
                  memberIcon={participant.iconLetters}
                  iconColor={participant.iconColor || '#6200ee'}
                  displayName={participant.displayName}
                />
              </View>
              <Text style={styles.participantName} numberOfLines={1}>
                {participant.displayName || 'Participant'}
              </Text>
              <Text style={styles.participantStatus}>
                {participant.isInitiator ? '📞' : ''}
                {participant.callStatus === 'joined' ? ' Connected' :
                 participant.callStatus === 'accepted' ? ' Connecting...' :
                 participant.callStatus === 'invited' ? ' Ringing...' :
                 participant.callStatus === 'rejected' ? ' Declined' :
                 participant.callStatus === 'left' ? ' Left' : ''}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.connectionStatus}>
          {isRinging ? 'Call in progress...' :
           isConnecting ? 'Connecting audio...' :
           firstRemoteStream ? 'Audio connected' :
           !isWebRTCSupported ? 'Requires development build' :
           'Waiting for audio...'}
        </Text>
      </View>

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        <View style={styles.controlsRow}>
          <View style={styles.controlItem}>
            <IconButton
              icon={isMuted ? 'microphone-off' : 'microphone'}
              iconColor={isMuted ? '#f44336' : '#fff'}
              size={32}
              style={[styles.controlButton, isMuted && styles.controlButtonActive]}
              onPress={handleToggleMute}
            />
            <Text style={styles.controlLabel}>Mute</Text>
          </View>

          <View style={styles.controlItem}>
            <IconButton
              icon={isSpeaker ? 'volume-high' : 'volume-medium'}
              iconColor="#fff"
              size={32}
              style={[styles.controlButton, isSpeaker && styles.controlButtonActive]}
              onPress={() => setShowAudioSettings(true)}
            />
            <Text style={styles.controlLabel}>Audio</Text>
          </View>
        </View>

        <View style={styles.actionButtons}>
          <Button
            mode="contained"
            onPress={handleLeaveCall}
            loading={leavingCall}
            disabled={leavingCall || endingCall}
            style={styles.leaveButton}
            buttonColor="#ff9800"
            textColor="#fff"
            icon="exit-run"
          >
            {leavingCall ? 'Leaving...' : 'Leave'}
          </Button>
          {isInitiator && (
            <Button
              mode="contained"
              onPress={handleEndCall}
              loading={endingCall}
              disabled={endingCall || leavingCall}
              style={styles.endButton}
              buttonColor="#d32f2f"
              textColor="#fff"
              icon="phone-hangup"
            >
              {endingCall ? 'Ending...' : 'End All'}
            </Button>
          )}
        </View>
      </View>

      {/* WebRTC Error */}
      {webrtcError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{webrtcError}</Text>
        </View>
      )}

      {/* Audio Settings Modal */}
      <AudioSettingsModal
        visible={showAudioSettings}
        onDismiss={() => setShowAudioSettings(false)}
        participants={allParticipants
          .filter(p => {
            // If I'm the initiator, show participants (not myself)
            // If I'm not the initiator, show the initiator (the other person)
            return isInitiator ? !p.isInitiator : p.isInitiator;
          })
          .map(p => ({
            groupMemberId: p.groupMemberId,
            displayName: p.displayName,
            iconLetters: p.iconLetters,
            iconColor: p.iconColor,
            volume: participantVolumes[p.groupMemberId] ?? 1.0,
          }))}
        onVolumeChange={handleParticipantVolumeChange}
        outputDevice={isSpeaker ? 'speaker' : 'earpiece'}
        onOutputDeviceChange={handleOutputDeviceChange}
        isMuted={isMuted}
        onMuteToggle={handleToggleMute}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  topSection: {
    paddingTop: 60,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  durationText: {
    color: '#4caf50',
    fontSize: 32,
    fontWeight: 'bold',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(244, 67, 54, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 6,
  },
  recordingLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  notRecordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(158, 158, 158, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  notRecordingLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  participantsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 24,
    marginBottom: 16,
  },
  participantItem: {
    alignItems: 'center',
    minWidth: 100,
    maxWidth: 120,
  },
  avatarWrapper: {
    padding: 8,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  avatarConnected: {
    borderColor: 'rgba(76, 175, 80, 0.8)',
  },
  avatarConnecting: {
    borderColor: 'rgba(255, 193, 7, 0.8)',
  },
  avatarRinging: {
    borderColor: 'rgba(33, 150, 243, 0.8)',
  },
  participantName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 8,
    textAlign: 'center',
  },
  participantStatus: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  connectionStatus: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    marginTop: 8,
  },
  bottomControls: {
    paddingBottom: 50,
    paddingTop: 20,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    gap: 24,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 40,
  },
  controlItem: {
    alignItems: 'center',
  },
  controlButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  controlButtonActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.4)',
  },
  controlLabel: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  leaveButton: {
    borderRadius: 24,
  },
  endButton: {
    borderRadius: 24,
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 16,
    textAlign: 'center',
  },
  errorText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 20,
    marginHorizontal: 40,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 180,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(244, 67, 54, 0.9)',
    padding: 12,
    borderRadius: 8,
  },
  errorBannerText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
});
