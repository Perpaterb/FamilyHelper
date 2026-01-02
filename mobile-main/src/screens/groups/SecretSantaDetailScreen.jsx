/**
 * SecretSantaDetailScreen
 *
 * View and manage a Secret Santa event.
 * Shows event details, participants, and admin controls.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl,  } from 'react-native';
import { CustomAlert } from '../../components/CustomAlert';
import {
  Text,
  TextInput,
  Card,
  Title,
  Paragraph,
  Button,
  IconButton,
  Chip,
  List,
  Divider,
  ActivityIndicator,
  Portal,
  Modal,
  Menu,
} from 'react-native-paper';
import { TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import DateTimeSelector, { formatDateByType } from '../../components/DateTimeSelector';
import { useFocusEffect } from '@react-navigation/native';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';
import api from '../../services/api';

export default function SecretSantaDetailScreen({ navigation, route }) {
  const { groupId, krisKringleId, eventName } = route.params;

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Action states
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resendingId, setResendingId] = useState(null);

  // Menu states
  const [menuVisible, setMenuVisible] = useState(null);

  // Match visibility - hidden by default so admin doesn't see spoilers
  const [showMatches, setShowMatches] = useState(false);

  // Edit mode states
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPriceLimit, setEditPriceLimit] = useState('');
  const [editExchangeDate, setEditExchangeDate] = useState(new Date());
  const [showExchangeDatePicker, setShowExchangeDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add participant states
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showExternalModal, setShowExternalModal] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [externalName, setExternalName] = useState('');
  const [externalEmail, setExternalEmail] = useState('');
  const [addingParticipant, setAddingParticipant] = useState(false);

  /**
   * Load event details
   */
  const loadEvent = async () => {
    try {
      setError(null);
      const response = await api.get(`/groups/${groupId}/kris-kringle/${krisKringleId}`);
      setEvent(response.data.krisKringle);
    } catch (err) {
      console.error('Load secret santa error:', err);

      if (err.isAuthError) {
        console.log('[SecretSantaDetail] Auth error detected - user will be logged out');
        return;
      }

      setError(err.response?.data?.message || 'Failed to load Secret Santa event');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load on mount and when screen gains focus
  useFocusEffect(
    useCallback(() => {
      loadEvent();
    }, [groupId, krisKringleId])
  );

  /**
   * Handle refresh
   */
  const onRefresh = () => {
    setRefreshing(true);
    loadEvent();
  };

  /**
   * Enter edit mode
   */
  const handleStartEdit = () => {
    setEditName(event.name);
    setEditPriceLimit(event.priceLimit ? String(event.priceLimit) : '');
    setEditExchangeDate(event.exchangeDate ? new Date(event.exchangeDate) : new Date());
    setIsEditing(true);
  };

  /**
   * Cancel edit mode
   */
  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  /**
   * Save edited event details
   */
  const handleSaveEdit = async () => {
    if (!editName.trim()) {
      CustomAlert.alert('Required', 'Please enter a name for the Secret Santa');
      return;
    }

    try {
      setSaving(true);
      await api.put(`/groups/${groupId}/kris-kringle/${krisKringleId}`, {
        name: editName.trim(),
        priceLimit: editPriceLimit ? parseFloat(editPriceLimit) : null,
        exchangeDate: editExchangeDate.toISOString(),
      });
      setIsEditing(false);
      loadEvent();
    } catch (err) {
      console.error('Save edit error:', err);
      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Load group members for adding participants
   */
  const loadGroupMembers = async () => {
    try {
      setLoadingMembers(true);
      const response = await api.get(`/groups/${groupId}`);
      setGroupMembers(response.data.group?.members || []);
    } catch (err) {
      console.error('Load group members error:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  /**
   * Open member modal to add participant
   */
  const handleOpenAddMember = () => {
    loadGroupMembers();
    setShowMemberModal(true);
  };

  /**
   * Add a group member as participant
   */
  const handleAddMember = async (member) => {
    // Check if already added
    if (event.participants?.some(p => p.groupMemberId === member.groupMemberId)) {
      CustomAlert.alert('Already Added', `${member.displayName || member.user?.displayName} is already a participant`);
      return;
    }

    try {
      setAddingParticipant(true);
      await api.post(`/groups/${groupId}/kris-kringle/${krisKringleId}/participants`, {
        groupMemberId: member.groupMemberId,
        name: member.user?.displayName || member.displayName,
        email: member.user?.email || member.email,
      });
      setShowMemberModal(false);
      loadEvent();
    } catch (err) {
      console.error('Add participant error:', err);
      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to add participant');
    } finally {
      setAddingParticipant(false);
    }
  };

  /**
   * Add an external participant
   */
  const handleAddExternal = async () => {
    if (!externalName.trim() || !externalEmail.trim()) {
      CustomAlert.alert('Required Fields', 'Please enter both name and email');
      return;
    }

    // Check if email already exists
    if (event.participants?.some(p => p.email?.toLowerCase() === externalEmail.toLowerCase())) {
      CustomAlert.alert('Already Added', 'A participant with this email already exists');
      return;
    }

    try {
      setAddingParticipant(true);
      await api.post(`/groups/${groupId}/kris-kringle/${krisKringleId}/participants`, {
        name: externalName.trim(),
        email: externalEmail.trim().toLowerCase(),
      });
      setExternalName('');
      setExternalEmail('');
      setShowExternalModal(false);
      loadEvent();
    } catch (err) {
      console.error('Add external participant error:', err);
      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to add participant');
    } finally {
      setAddingParticipant(false);
    }
  };

  /**
   * Remove a participant
   */
  const handleRemoveParticipant = async (participantId) => {
    setMenuVisible(null);

    CustomAlert.alert(
      'Remove Participant?',
      'This will remove them from the Secret Santa event.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/groups/${groupId}/kris-kringle/${krisKringleId}/participants/${participantId}`);
              loadEvent();
            } catch (err) {
              console.error('Remove participant error:', err);
              CustomAlert.alert('Error', err.response?.data?.message || 'Failed to remove participant');
            }
          },
        },
      ]
    );
  };

  /**
   * Generate matches
   */
  const handleGenerateMatches = async () => {
    if (event.participants.length < 3) {
      CustomAlert.alert('Not Enough Participants', 'You need at least 3 participants to generate matches');
      return;
    }

    CustomAlert.alert(
      'Generate Matches?',
      'This will randomly assign each participant to give a gift to another participant. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            try {
              setGenerating(true);
              await api.post(`/groups/${groupId}/kris-kringle/${krisKringleId}/generate-matches`);
              CustomAlert.alert('Success', 'Matches have been generated!');
              loadEvent();
            } catch (err) {
              console.error('Generate matches error:', err);
              CustomAlert.alert('Error', err.response?.data?.message || 'Failed to generate matches');
            } finally {
              setGenerating(false);
            }
          },
        },
      ]
    );
  };

  /**
   * Resend email to participant
   */
  const handleResendEmail = async (participantId) => {
    setMenuVisible(null);

    try {
      setResendingId(participantId);
      await api.post(`/groups/${groupId}/kris-kringle/${krisKringleId}/participants/${participantId}/resend`);
      CustomAlert.alert('Email Sent', 'A new email with a fresh passcode has been sent.');
      loadEvent();
    } catch (err) {
      console.error('Resend email error:', err);
      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to resend email');
    } finally {
      setResendingId(null);
    }
  };

  /**
   * Delete event
   */
  const handleDelete = async () => {
    const isBeforeExchange = event.exchangeDate && new Date(event.exchangeDate) > new Date();

    const message = isBeforeExchange
      ? 'This will delete the Secret Santa event and notify all participants via email. This cannot be undone.'
      : 'This will delete the Secret Santa event. This cannot be undone.';

    CustomAlert.alert(
      'Delete Secret Santa?',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await api.delete(`/groups/${groupId}/kris-kringle/${krisKringleId}`);
              navigation.goBack();
            } catch (err) {
              console.error('Delete event error:', err);
              CustomAlert.alert('Error', err.response?.data?.message || 'Failed to delete event');
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  /**
   * Format date for display
   */
  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  /**
   * Format datetime for display
   */
  const formatDateTime = (dateString) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  /**
   * Get status chip color
   */
  const getStatusColor = (status) => {
    switch (status) {
      case 'draft':
        return '#9e9e9e';
      case 'active':
        return '#4caf50';
      case 'completed':
        return '#2196f3';
      default:
        return '#9e9e9e';
    }
  };

  /**
   * Check if assignments have been revealed
   */
  const isRevealed = () => {
    if (!event.assigningDateTime) return true;
    return new Date(event.assigningDateTime) <= new Date();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <CustomNavigationHeader
          title={eventName || 'Secret Santa'}
          onBack={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6200ee" />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Button onPress={loadEvent}>Retry</Button>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Event not found</Text>
        <Button onPress={() => navigation.goBack()}>Go Back</Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CustomNavigationHeader
        title={eventName || event.name}
        onBack={() => navigation.goBack()}
        rightButtons={[
          {
            icon: 'delete',
            onPress: handleDelete,
          },
        ]}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Event Details Card */}
        <Card style={styles.card}>
          <Card.Content>
            {isEditing ? (
              // Edit mode UI
              <>
                <Title style={styles.sectionTitle}>Edit Event</Title>
                <TextInput
                  label="Event Name *"
                  value={editName}
                  onChangeText={setEditName}
                  mode="outlined"
                  style={styles.input}
                />
                <TextInput
                  label="Gift Value ($)"
                  value={editPriceLimit}
                  onChangeText={setEditPriceLimit}
                  mode="outlined"
                  style={styles.input}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowExchangeDatePicker(true)}
                >
                  <Text style={styles.dateLabel}>Exchange Date</Text>
                  <Text style={styles.dateValue}>{formatDateByType(editExchangeDate, 2)}</Text>
                </TouchableOpacity>
                <View style={styles.editButtons}>
                  <Button mode="outlined" onPress={handleCancelEdit} style={styles.editButton}>
                    Cancel
                  </Button>
                  <Button
                    mode="contained"
                    onPress={handleSaveEdit}
                    loading={saving}
                    disabled={saving}
                    style={styles.editButton}
                  >
                    Save
                  </Button>
                </View>
              </>
            ) : (
              // View mode UI
              <>
                <View style={styles.cardHeader}>
                  <Title style={styles.cardTitle}>{event.name}</Title>
                  <View style={styles.headerActions}>
                    {!event.isAssigned && event.canManage && (
                      <IconButton icon="pencil" size={20} onPress={handleStartEdit} />
                    )}
                    <Chip
                      style={[styles.statusChip, { backgroundColor: getStatusColor(event.status) }]}
                      textStyle={styles.statusChipText}
                    >
                      {event.status}
                    </Chip>
                  </View>
                </View>

                {event.occasion && (
                  <Paragraph style={styles.occasion}>{event.occasion}</Paragraph>
                )}

                <Divider style={styles.divider} />

                <View style={styles.detailsGrid}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Exchange Date</Text>
                    <Text style={styles.detailValue}>{formatDate(event.exchangeDate)}</Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Gift Value</Text>
                    <Text style={styles.detailValue}>
                      {event.priceLimit ? `$${event.priceLimit}` : 'Not set'}
                    </Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Matches Generated</Text>
                    <Text style={styles.detailValue}>
                      {event.isAssigned ? 'Yes' : 'No'}
                    </Text>
                  </View>
                </View>

                {event.canManage && (
                  event.isAssigned ? (
                    <View style={styles.matchesGeneratedContainer}>
                      <Chip
                        icon="check-circle"
                        style={styles.matchesGeneratedChip}
                        textStyle={styles.matchesGeneratedText}
                      >
                        Matches Generated
                      </Chip>
                      <Text style={styles.matchesGeneratedNote}>
                        All participants have been assigned. You can resend emails from the participant menu.
                      </Text>
                    </View>
                  ) : (
                    <Button
                      mode="contained"
                      icon="shuffle-variant"
                      onPress={handleGenerateMatches}
                      loading={generating}
                      disabled={generating || event.participants.length < 3}
                      style={styles.generateButton}
                    >
                      Generate Matches
                    </Button>
                  )
                )}
              </>
            )}
          </Card.Content>
        </Card>

        {/* Participants Card */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.participantsTitleRow}>
              <Title style={styles.sectionTitle}>
                Participants ({event.participants?.length || 0})
              </Title>
              {event.isAssigned && event.canManage && isRevealed() && (
                <Button
                  mode="text"
                  icon={showMatches ? 'eye-off' : 'eye'}
                  onPress={() => setShowMatches(!showMatches)}
                  compact
                >
                  {showMatches ? 'Hide Matches' : 'Show Matches'}
                </Button>
              )}
            </View>

            {event.participants?.length === 0 ? (
              <Text style={styles.noParticipants}>No participants added</Text>
            ) : (
              event.participants.map((participant, index) => (
                <View key={participant.participantId}>
                  <View style={styles.participantItem}>
                    <View style={styles.participantInfo}>
                      <Text style={styles.participantName}>{participant.name}</Text>
                      <Text style={styles.participantEmail}>{participant.email}</Text>
                      <View style={styles.participantChips}>
                        {!participant.groupMemberId && (
                          <Chip
                            style={styles.externalChip}
                            textStyle={styles.chipText}
                          >
                            External
                          </Chip>
                        )}
                        {participant.hasViewed && (
                          <Chip
                            style={styles.viewedChip}
                            textStyle={styles.chipText}
                          >
                            Viewed
                          </Chip>
                        )}
                        {event.isAssigned && participant.match && isRevealed() && showMatches && (
                          <Chip
                            style={styles.matchChip}
                            textStyle={styles.chipText}
                            icon="arrow-right"
                          >
                            {participant.match.name}
                          </Chip>
                        )}
                      </View>
                    </View>

                    {event.canManage && (
                      <Menu
                        visible={menuVisible === participant.participantId}
                        onDismiss={() => setMenuVisible(null)}
                        anchor={
                          <IconButton
                            icon="dots-vertical"
                            onPress={() => setMenuVisible(participant.participantId)}
                          />
                        }
                      >
                        <Menu.Item
                          onPress={() => handleResendEmail(participant.participantId)}
                          title="Resend Email"
                          leadingIcon="email"
                          disabled={resendingId === participant.participantId}
                        />
                        {!event.isAssigned && (
                          <Menu.Item
                            onPress={() => handleRemoveParticipant(participant.participantId)}
                            title="Remove"
                            leadingIcon="close"
                          />
                        )}
                      </Menu>
                    )}
                  </View>
                  {index < event.participants.length - 1 && (
                    <Divider style={styles.participantDivider} />
                  )}
                </View>
              ))
            )}

            {/* Add participant buttons - only show before matches generated */}
            {!event.isAssigned && event.canManage && (
              <View style={styles.addButtonsRow}>
                <Button
                  mode="outlined"
                  icon="account-plus"
                  onPress={handleOpenAddMember}
                  style={styles.addButton}
                  loading={addingParticipant}
                  disabled={addingParticipant}
                >
                  Add Member
                </Button>
                <Button
                  mode="outlined"
                  icon="email-plus"
                  onPress={() => setShowExternalModal(true)}
                  style={styles.addButton}
                  disabled={addingParticipant}
                >
                  Add External
                </Button>
              </View>
            )}

            {!event.isAssigned && event.participants?.length > 0 && event.participants.length < 3 && (
              <Text style={styles.warningText}>
                Need at least 3 participants ({3 - event.participants.length} more)
              </Text>
            )}

            {event.isAssigned && event.canManage && (
              <Text style={styles.lockedNote}>
                Participants cannot be added or removed after matches are generated.
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Info Card */}
        <Card style={styles.infoCard}>
          <Card.Content>
            <Text style={styles.infoText}>
              Each participant receives an email with a unique link and passcode to view their assignment.
              {!event.isAssigned && ' Generate matches to reveal assignments.'}
            </Text>
          </Card.Content>
        </Card>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Member Selection Modal */}
      <Portal>
        <Modal
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
                .filter(m => !event.participants?.some(p => p.groupMemberId === m.groupMemberId))
                .map((member) => (
                  <List.Item
                    key={member.groupMemberId}
                    title={member.user?.displayName || member.displayName}
                    description={member.user?.email || member.email}
                    onPress={() => handleAddMember(member)}
                    left={() => (
                      <View style={[styles.memberIcon, { backgroundColor: member.user?.iconColor || member.iconColor || '#6200ee' }]}>
                        <Text style={styles.memberIconText}>
                          {member.user?.memberIcon || member.iconLetters || '??'}
                        </Text>
                      </View>
                    )}
                  />
                ))}
              {groupMembers.filter(m => !event.participants?.some(p => p.groupMemberId === m.groupMemberId)).length === 0 && (
                <Text style={styles.noMembersText}>All group members have been added</Text>
              )}
            </ScrollView>
          )}
          <Button onPress={() => setShowMemberModal(false)} style={styles.modalButton}>
            Cancel
          </Button>
        </Modal>
      </Portal>

      {/* External Participant Modal */}
      <Portal>
        <Modal
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
            <Button
              mode="contained"
              onPress={handleAddExternal}
              loading={addingParticipant}
              disabled={addingParticipant}
            >
              Add
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Exchange Date Picker */}
      <DateTimeSelector
        value={editExchangeDate}
        onChange={setEditExchangeDate}
        format={2}
        visible={showExchangeDatePicker}
        onClose={() => setShowExchangeDatePicker(false)}
        title="Exchange Date"
      />
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 20,
  },
  statusChip: {
    marginLeft: 8,
  },
  statusChipText: {
    color: '#fff',
    fontSize: 11,
    textTransform: 'capitalize',
  },
  occasion: {
    color: '#666',
    marginBottom: 8,
  },
  divider: {
    marginVertical: 12,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  detailItem: {
    width: '50%',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 11,
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  generateButton: {
    marginTop: 8,
  },
  matchesGeneratedContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  matchesGeneratedChip: {
    backgroundColor: '#4caf50',
  },
  matchesGeneratedText: {
    color: '#fff',
  },
  matchesGeneratedNote: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
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
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  participantsTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  externalChip: {
    backgroundColor: '#ff9800',
    height: 28,
    justifyContent: 'center',
  },
  viewedChip: {
    backgroundColor: '#4caf50',
    height: 28,
    justifyContent: 'center',
  },
  matchChip: {
    backgroundColor: '#2196f3',
    height: 28,
    justifyContent: 'center',
  },
  chipText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 14,
    marginVertical: 0,
    marginTop: 0,
    marginBottom: 0,
  },
  participantDivider: {
    marginVertical: 4,
  },
  infoCard: {
    backgroundColor: '#e3f2fd',
  },
  infoText: {
    fontSize: 12,
    color: '#1565c0',
    lineHeight: 18,
  },
  bottomPadding: {
    height: 20,
  },
  // Edit mode styles
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
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  editButton: {
    marginLeft: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Add participant styles
  addButtonsRow: {
    flexDirection: 'row',
    marginTop: 16,
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
  lockedNote: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  // Modal styles
  modal: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 8,
    maxHeight: '80%',
  },
  modalTitle: {
    padding: 16,
    fontSize: 18,
  },
  modalLoading: {
    padding: 40,
  },
  memberList: {
    maxHeight: 300,
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
