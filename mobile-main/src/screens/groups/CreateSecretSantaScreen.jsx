/**
 * CreateSecretSantaScreen
 *
 * Create a new Secret Santa event with participants.
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform,  } from 'react-native';
import { CustomAlert } from '../../components/CustomAlert';
import {
  Text,
  TextInput,
  Button,
  IconButton,
  Divider,
  Chip,
  List,
  Portal,
  Modal as PaperModal,
  Card,
  Title,
  ActivityIndicator,
} from 'react-native-paper';
import api from '../../services/api';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';
import DateTimeSelector, { formatDateByType } from '../../components/DateTimeSelector';
import UserAvatar from '../../components/shared/UserAvatar';

export default function CreateSecretSantaScreen({ navigation, route }) {
  const { groupId } = route.params;

  // Form state
  const [name, setName] = useState('');
  const [priceLimit, setPriceLimit] = useState('');
  const [exchangeDate, setExchangeDate] = useState(new Date());

  // Participants
  const [participants, setParticipants] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);

  // Date picker modal state
  const [showExchangeDatePicker, setShowExchangeDatePicker] = useState(false);

  // Modal state
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showExternalModal, setShowExternalModal] = useState(false);
  const [showExclusionModal, setShowExclusionModal] = useState(false);
  const [externalName, setExternalName] = useState('');
  const [externalEmail, setExternalEmail] = useState('');
  const [selectedParticipantIndex, setSelectedParticipantIndex] = useState(null);

  // Loading state
  const [loading, setLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);

  // Load group members on mount
  useEffect(() => {
    loadGroupMembers();
  }, []);

  /**
   * Load group members for participant selection
   */
  const loadGroupMembers = async () => {
    try {
      const response = await api.get(`/groups/${groupId}`);
      setGroupMembers(response.data.group?.members || []);
    } catch (err) {
      console.error('Load group members error:', err);
      CustomAlert.alert('Error', 'Failed to load group members');
    } finally {
      setLoadingMembers(false);
    }
  };

  /**
   * Add a group member as participant
   */
  const handleAddMember = (member) => {
    // Check if already added
    if (participants.some(p => p.groupMemberId === member.groupMemberId)) {
      CustomAlert.alert('Already Added', `${member.user?.displayName || member.displayName} is already a participant`);
      return;
    }

    setParticipants([
      ...participants,
      {
        groupMemberId: member.groupMemberId,
        name: member.user?.displayName || member.displayName,
        email: member.user?.email || member.email,
        isGroupMember: true,
        exclusions: [], // Array of participant indices they can't be matched with
      },
    ]);
    setShowMemberModal(false);
  };

  /**
   * Add an external participant
   */
  const handleAddExternal = () => {
    if (!externalName.trim() || !externalEmail.trim()) {
      CustomAlert.alert('Required Fields', 'Please enter both name and email');
      return;
    }

    // Check if email already exists
    if (participants.some(p => p.email?.toLowerCase() === externalEmail.toLowerCase())) {
      CustomAlert.alert('Already Added', 'A participant with this email already exists');
      return;
    }

    setParticipants([
      ...participants,
      {
        name: externalName.trim(),
        email: externalEmail.trim().toLowerCase(),
        isGroupMember: false,
        exclusions: [],
      },
    ]);

    setExternalName('');
    setExternalEmail('');
    setShowExternalModal(false);
  };

  /**
   * Remove a participant
   */
  const handleRemoveParticipant = (index) => {
    const newParticipants = [...participants];
    newParticipants.splice(index, 1);

    // Update exclusions to remove references to the removed participant
    newParticipants.forEach(p => {
      p.exclusions = p.exclusions
        .filter(i => i !== index)
        .map(i => i > index ? i - 1 : i);
    });

    setParticipants(newParticipants);
  };

  /**
   * Open exclusion modal for a participant
   */
  const handleOpenExclusions = (index) => {
    setSelectedParticipantIndex(index);
    setShowExclusionModal(true);
  };

  /**
   * Toggle exclusion for a participant
   */
  const handleToggleExclusion = (excludeIndex) => {
    if (selectedParticipantIndex === null) return;

    const newParticipants = [...participants];
    const exclusions = newParticipants[selectedParticipantIndex].exclusions || [];

    if (exclusions.includes(excludeIndex)) {
      newParticipants[selectedParticipantIndex].exclusions = exclusions.filter(i => i !== excludeIndex);
    } else {
      newParticipants[selectedParticipantIndex].exclusions = [...exclusions, excludeIndex];
    }

    setParticipants(newParticipants);
  };

  /**
   * Handle create
   */
  const handleCreate = async () => {
    // Validation
    if (!name.trim()) {
      CustomAlert.alert('Required', 'Please enter a name for the Secret Santa');
      return;
    }

    if (participants.length < 3) {
      CustomAlert.alert('Not Enough Participants', 'You need at least 3 participants for Secret Santa');
      return;
    }

    try {
      setLoading(true);

      const payload = {
        name: name.trim(),
        priceLimit: priceLimit ? parseFloat(priceLimit) : null,
        exchangeDate: exchangeDate.toISOString(),
        participants: participants.map((p, index) => ({
          groupMemberId: p.groupMemberId || null,
          name: p.name,
          email: p.email,
          exclusions: p.exclusions.map(i => participants[i].email), // Send exclusions as emails
        })),
      };

      const response = await api.post(`/groups/${groupId}/kris-kringle`, payload);

      CustomAlert.alert(
        'Secret Santa Created!',
        `${participants.length} participants have been emailed with their access link and passcode.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (err) {
      console.error('Create secret santa error:', err);

      if (err.isAuthError) {
        console.log('[CreateSecretSanta] Auth error detected - user will be logged out');
        return;
      }

      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to create Secret Santa');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <CustomNavigationHeader
        title="New Secret Santa"
        onBack={() => navigation.goBack()}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Event Details */}
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Event Details</Title>

            <TextInput
              label="Event Name *"
              value={name}
              onChangeText={setName}
              mode="outlined"
              style={styles.input}
              placeholder="Christmas Gift Exchange 2024"
            />

            <TextInput
              label="Gift Value ($)"
              value={priceLimit}
              onChangeText={setPriceLimit}
              mode="outlined"
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="25"
            />

            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowExchangeDatePicker(true)}
            >
              <Text style={styles.dateLabel}>Exchange Date</Text>
              <Text style={styles.dateValue}>{formatDateByType(exchangeDate, 2)}</Text>
            </TouchableOpacity>

            <Text style={styles.noteText}>
              You'll generate and reveal the matches manually when you're ready.
            </Text>
          </Card.Content>
        </Card>

        {/* Participants */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.participantsHeader}>
              <Title style={styles.sectionTitle}>Participants ({participants.length})</Title>
            </View>

            <Text style={styles.tipText}>
              Tip: Add people as group members first so they can link their gift registry.
              Use the exclude button to prevent specific pairings (e.g., spouses).
            </Text>

            {participants.length === 0 ? (
              <Text style={styles.noParticipants}>No participants added yet</Text>
            ) : (
              participants.map((p, index) => (
                <View key={index} style={styles.participantItem}>
                  <View style={styles.participantInfo}>
                    <Text style={styles.participantName}>{p.name}</Text>
                    <Text style={styles.participantEmail}>{p.email}</Text>
                    <View style={styles.participantChips}>
                      {!p.isGroupMember && (
                        <Chip style={styles.externalChip} textStyle={styles.externalChipText}>
                          External
                        </Chip>
                      )}
                      {p.exclusions && p.exclusions.length > 0 && (
                        <Chip style={styles.exclusionChip} textStyle={styles.exclusionChipText}>
                          {p.exclusions.length} excluded
                        </Chip>
                      )}
                    </View>
                  </View>
                  <IconButton
                    icon="account-cancel"
                    size={20}
                    onPress={() => handleOpenExclusions(index)}
                  />
                  <IconButton
                    icon="close"
                    size={20}
                    onPress={() => handleRemoveParticipant(index)}
                  />
                </View>
              ))
            )}

            <View style={styles.addButtonsRow}>
              <Button
                mode="outlined"
                icon="account-plus"
                onPress={() => setShowMemberModal(true)}
                style={styles.addButton}
              >
                Add Member
              </Button>
              <Button
                mode="outlined"
                icon="email-plus"
                onPress={() => setShowExternalModal(true)}
                style={styles.addButton}
              >
                Add External
              </Button>
            </View>

            {participants.length > 0 && participants.length < 3 && (
              <Text style={styles.warningText}>
                Need at least 3 participants ({3 - participants.length} more)
              </Text>
            )}
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={handleCreate}
          loading={loading}
          disabled={loading || participants.length < 3}
          style={styles.createButton}
        >
          Create Secret Santa
        </Button>
      </ScrollView>

      {/* Member Selection Modal */}
      <Portal>
        <PaperModal
          visible={showMemberModal}
          onDismiss={() => setShowMemberModal(false)}
          contentContainerStyle={styles.modal}
        >
          <Title style={styles.modalTitle}>Select Group Member</Title>
          <Divider />
          {loadingMembers ? (
            <ActivityIndicator style={styles.modalLoading} />
          ) : (
            <ScrollView style={styles.memberList}>
              {groupMembers
                .filter(m => !participants.some(p => p.groupMemberId === m.groupMemberId))
                .map((member) => (
                  <List.Item
                    key={member.groupMemberId}
                    title={member.user?.displayName || member.displayName}
                    description={member.user?.email || member.email}
                    onPress={() => handleAddMember(member)}
                    left={() => (
                      <UserAvatar
                        profilePhotoUrl={member.user?.profilePhotoFileId ? `${api.defaults.baseURL}/files/${member.user.profilePhotoFileId}` : null}
                        memberIcon={member.user?.memberIcon || member.iconLetters}
                        iconColor={member.user?.iconColor || member.iconColor || '#6200ee'}
                        displayName={member.user?.displayName || member.displayName}
                        size={40}
                        style={styles.memberIcon}
                      />
                    )}
                  />
                ))}
              {groupMembers.filter(m => !participants.some(p => p.groupMemberId === m.groupMemberId)).length === 0 && (
                <Text style={styles.noMembersText}>All group members have been added</Text>
              )}
            </ScrollView>
          )}
          <Button onPress={() => setShowMemberModal(false)} style={styles.modalButton}>
            Cancel
          </Button>
        </PaperModal>
      </Portal>

      {/* External Participant Modal */}
      <Portal>
        <PaperModal
          visible={showExternalModal}
          onDismiss={() => setShowExternalModal(false)}
          contentContainerStyle={styles.modal}
        >
          <Title style={styles.modalTitle}>Add External Participant</Title>
          <Divider />
          <View style={styles.externalForm}>
            <TextInput
              label="Name *"
              value={externalName}
              onChangeText={setExternalName}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Email *"
              value={externalEmail}
              onChangeText={setExternalEmail}
              mode="outlined"
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={styles.externalNote}>
              They will receive an email with a link and passcode to view their assignment.
            </Text>
          </View>
          <View style={styles.modalButtons}>
            <Button onPress={() => setShowExternalModal(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleAddExternal}>
              Add
            </Button>
          </View>
        </PaperModal>
      </Portal>

      {/* Exclusion Modal */}
      <Portal>
        <PaperModal
          visible={showExclusionModal}
          onDismiss={() => setShowExclusionModal(false)}
          contentContainerStyle={styles.modal}
        >
          <Title style={styles.modalTitle}>
            Can't be matched with
          </Title>
          <Text style={styles.exclusionSubtitle}>
            {selectedParticipantIndex !== null && participants[selectedParticipantIndex]?.name}
          </Text>
          <Divider />
          <ScrollView style={styles.memberList}>
            {participants.map((p, index) => {
              if (index === selectedParticipantIndex) return null;
              const isExcluded = selectedParticipantIndex !== null &&
                participants[selectedParticipantIndex]?.exclusions?.includes(index);
              return (
                <List.Item
                  key={index}
                  title={p.name}
                  description={p.email}
                  onPress={() => handleToggleExclusion(index)}
                  right={() => (
                    <IconButton
                      icon={isExcluded ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      iconColor={isExcluded ? '#6200ee' : '#666'}
                    />
                  )}
                />
              );
            })}
          </ScrollView>
          <Button onPress={() => setShowExclusionModal(false)} style={styles.modalButton}>
            Done
          </Button>
        </PaperModal>
      </Portal>

      {/* Exchange Date Picker */}
      <DateTimeSelector
        value={exchangeDate}
        onChange={setExchangeDate}
        format={2}
        visible={showExchangeDatePicker}
        onClose={() => setShowExchangeDatePicker(false)}
        title="Exchange Date"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: 12,
  },
  input: {
    marginBottom: 12,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#666',
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
  },
  dateLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  dateValue: {
    fontSize: 14,
  },
  noteText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
  },
  participantsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tipText: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#e3f2fd',
    padding: 8,
    borderRadius: 4,
    marginBottom: 12,
  },
  noParticipants: {
    textAlign: 'center',
    color: '#999',
    paddingVertical: 20,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 14,
    fontWeight: '600',
  },
  participantEmail: {
    fontSize: 12,
    color: '#666',
  },
  participantChips: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 4,
  },
  externalChip: {
    backgroundColor: '#ff9800',
    height: 28,
    justifyContent: 'center',
  },
  externalChipText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 14
  },
  exclusionChip: {
    backgroundColor: '#f44336',
    height: 28,
    justifyContent: 'center',
  },
  exclusionChipText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 14
  },
  addButtonsRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  addButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  warningText: {
    color: '#ff9800',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
  createButton: {
    marginTop: 16,
    marginBottom: 20,
  },
  modal: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 8,
    maxHeight: '90%',
    minHeight: '60%',
  },
  modalTitle: {
    padding: 16,
    fontSize: 18,
  },
  exclusionSubtitle: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontSize: 14,
    color: '#666',
  },
  modalLoading: {
    padding: 40,
  },
  memberList: {
    flex: 1,
  },
  memberIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  memberIconText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  noMembersText: {
    textAlign: 'center',
    color: '#999',
    padding: 20,
  },
  modalButton: {
    margin: 8,
  },
  externalForm: {
    padding: 16,
  },
  externalNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 8,
  },
});
