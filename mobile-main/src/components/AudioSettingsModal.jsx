/**
 * Audio Settings Modal
 *
 * Popup for adjusting call audio settings:
 * - Volume controls for each participant
 * - Input device (microphone) selection
 * - Output device (speaker/earpiece) selection
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Modal, Portal, Text, Button, IconButton, Divider, RadioButton } from 'react-native-paper';
import Slider from '@react-native-community/slider';
import UserAvatar from './shared/UserAvatar';

/**
 * @typedef {Object} Participant
 * @property {string} odash groupMemberId
 * @property {string} displayName
 * @property {string} iconLetters
 * @property {string} iconColor
 * @property {number} volume - 0 to 1
 */

/**
 * AudioSettingsModal component
 *
 * @param {Object} props
 * @param {boolean} props.visible - Whether modal is visible
 * @param {function} props.onDismiss - Called when modal is dismissed
 * @param {Array<Participant>} props.participants - List of call participants
 * @param {function} props.onVolumeChange - Called when participant volume changes (groupMemberId, volume)
 * @param {string} props.outputDevice - Current output device ('speaker' or 'earpiece')
 * @param {function} props.onOutputDeviceChange - Called when output device changes
 * @param {boolean} props.isMuted - Whether local mic is muted
 * @param {function} props.onMuteToggle - Called when mute is toggled
 */
export default function AudioSettingsModal({
  visible,
  onDismiss,
  participants = [],
  onVolumeChange,
  outputDevice = 'speaker',
  onOutputDeviceChange,
  isMuted = false,
  onMuteToggle,
}) {
  // Local state for volumes (to make sliders responsive)
  const [volumes, setVolumes] = useState({});

  // Initialize volumes from participants
  useEffect(() => {
    const initialVolumes = {};
    participants.forEach(p => {
      initialVolumes[p.groupMemberId] = p.volume ?? 1.0;
    });
    setVolumes(initialVolumes);
  }, [participants]);

  const handleVolumeChange = (groupMemberId, value) => {
    setVolumes(prev => ({ ...prev, [groupMemberId]: value }));
  };

  const handleVolumeChangeComplete = (groupMemberId, value) => {
    if (onVolumeChange) {
      onVolumeChange(groupMemberId, value);
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modalContainer}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Audio Settings</Text>
          <IconButton icon="close" size={24} onPress={onDismiss} />
        </View>

        <ScrollView style={styles.content}>
          {/* Output Device Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Output Device</Text>
            <RadioButton.Group
              onValueChange={onOutputDeviceChange}
              value={outputDevice}
            >
              <View style={styles.radioRow}>
                <RadioButton.Item
                  label="Speaker"
                  value="speaker"
                  style={styles.radioItem}
                  labelStyle={styles.radioLabel}
                />
              </View>
              <View style={styles.radioRow}>
                <RadioButton.Item
                  label="Earpiece"
                  value="earpiece"
                  style={styles.radioItem}
                  labelStyle={styles.radioLabel}
                />
              </View>
            </RadioButton.Group>
          </View>

          <Divider style={styles.divider} />

          {/* Microphone Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Microphone</Text>
            <View style={styles.micRow}>
              <Text style={styles.micLabel}>
                {isMuted ? 'Muted' : 'Active'}
              </Text>
              <Button
                mode={isMuted ? 'contained' : 'outlined'}
                onPress={onMuteToggle}
                icon={isMuted ? 'microphone-off' : 'microphone'}
                compact
              >
                {isMuted ? 'Unmute' : 'Mute'}
              </Button>
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Participant Volume Controls */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Participant Volume</Text>
            {participants.length === 0 ? (
              <Text style={styles.noParticipants}>No other participants yet</Text>
            ) : (
              participants.map(participant => (
                <View key={participant.groupMemberId} style={styles.participantRow}>
                  <View style={styles.participantInfo}>
                    <UserAvatar
                      displayName={participant.displayName}
                      iconLetters={participant.iconLetters}
                      iconColor={participant.iconColor}
                      size={36}
                    />
                    <Text style={styles.participantName} numberOfLines={1}>
                      {participant.displayName}
                    </Text>
                  </View>
                  <View style={styles.volumeControl}>
                    <IconButton
                      icon="volume-low"
                      size={16}
                      style={styles.volumeIcon}
                    />
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={1}
                      value={volumes[participant.groupMemberId] ?? 1}
                      onValueChange={(value) => handleVolumeChange(participant.groupMemberId, value)}
                      onSlidingComplete={(value) => handleVolumeChangeComplete(participant.groupMemberId, value)}
                      minimumTrackTintColor="#6200ee"
                      maximumTrackTintColor="#d0d0d0"
                      thumbTintColor="#6200ee"
                    />
                    <IconButton
                      icon="volume-high"
                      size={16}
                      style={styles.volumeIcon}
                    />
                  </View>
                  <Text style={styles.volumePercent}>
                    {Math.round((volumes[participant.groupMemberId] ?? 1) * 100)}%
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button mode="contained" onPress={onDismiss}>
            Done
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 12,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 8,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  radioRow: {
    marginLeft: -8,
  },
  radioItem: {
    paddingVertical: 4,
  },
  radioLabel: {
    fontSize: 15,
  },
  divider: {
    marginVertical: 8,
  },
  micRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  micLabel: {
    fontSize: 15,
    color: '#666',
  },
  noParticipants: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  participantRow: {
    marginBottom: 16,
  },
  participantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  participantName: {
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 12,
    flex: 1,
  },
  volumeControl: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  volumeIcon: {
    margin: 0,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  volumePercent: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: 2,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
});
