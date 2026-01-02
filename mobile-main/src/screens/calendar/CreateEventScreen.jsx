/**
 * Create Event Screen
 *
 * Form for creating calendar events.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Platform } from 'react-native';
import { CustomAlert } from '../../components/CustomAlert';
import API from '../../services/api';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';
import DateTimeSelector, { formatDateByType } from '../../components/DateTimeSelector';
import UserAvatar from '../../components/shared/UserAvatar';

/**
 * CreateEventScreen component
 *
 * @param {Object} props
 * @param {Object} props.navigation - React Navigation object
 * @param {Object} props.route - Route params including groupId
 * @returns {JSX.Element}
 */
export default function CreateEventScreen({ navigation, route }) {
  const { groupId, defaultStartDate } = route.params;

  // Initialize dates from params or defaults
  const initialStartDate = defaultStartDate ? new Date(defaultStartDate) : new Date();
  const initialEndDate = new Date(initialStartDate.getTime() + 60 * 60 * 1000); // +1 hour

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  // Member selection state
  const [members, setMembers] = useState([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [showMemberModal, setShowMemberModal] = useState(false);

  // Recurring event state
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState('WEEKLY'); // DAILY, WEEKLY, FORTNIGHTLY, MONTHLY, QUARTERLY, YEARLY
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(null);
  const [showRecurrenceEndPicker, setShowRecurrenceEndPicker] = useState(false);
  const [showFrequencyModal, setShowFrequencyModal] = useState(false);

  // Notification state
  const [notificationMinutes, setNotificationMinutes] = useState(15); // Default 15 minutes before
  const [showNotificationModal, setShowNotificationModal] = useState(false);

  /**
   * Fetch group members on mount
   */
  useEffect(() => {
    fetchGroupMembers();
  }, [groupId]);

  /**
   * Fetch group members from API
   */
  const fetchGroupMembers = async () => {
    try {
      const response = await API.get(`/groups/${groupId}`);
      if (response.data.success) {
        setMembers(response.data.group.members || []);
      }
    } catch (error) {
      console.error('Error fetching group members:', error);
      CustomAlert.alert('Error', 'Failed to load group members');
    }
  };

  /**
   * Toggle member selection
   */
  const toggleMemberSelection = (groupMemberId) => {
    setSelectedMemberIds(prev => {
      if (prev.includes(groupMemberId)) {
        return prev.filter(id => id !== groupMemberId);
      } else {
        return [...prev, groupMemberId];
      }
    });
  };

  /**
   * Handle start date change
   */
  const handleStartDateChange = (newDate) => {
    setStartDate(newDate);
    // Auto-adjust end date if it's before or equal to start date
    if (endDate <= newDate) {
      const newEndDate = new Date(newDate.getTime() + 60 * 60 * 1000); // +1 hour
      setEndDate(newEndDate);
    }
  };

  /**
   * Handle end date change
   */
  const handleEndDateChange = (newDate) => {
    if (newDate <= startDate) {
      CustomAlert.alert('Invalid Date', 'End date must be after start date');
      return;
    }
    setEndDate(newDate);
  };

  /**
   * Format notification time for display
   */
  const formatNotificationTime = (minutes) => {
    if (minutes === 0) return 'At time of event';
    if (minutes < 60) return `${minutes} minutes before`;
    if (minutes === 60) return '1 hour before';
    if (minutes < 1440) return `${minutes / 60} hours before`;
    if (minutes === 1440) return '1 day before';
    return `${minutes / 1440} days before`;
  };

  /**
   * Format recurrence frequency for display
   */
  const formatFrequency = (freq) => {
    switch (freq) {
      case 'DAILY': return 'Every Day';
      case 'WEEKLY': return 'Every Week';
      case 'FORTNIGHTLY': return 'Every Fortnight (2 weeks)';
      case 'MONTHLY': return 'Every Month';
      case 'QUARTERLY': return 'Every Quarter (3 months)';
      case 'YEARLY': return 'Every Year';
      default: return 'Every Week';
    }
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async () => {
    // Validation
    if (!title.trim()) {
      CustomAlert.alert('Validation Error', 'Please enter an event title');
      return;
    }

    if (endDate <= startDate) {
      CustomAlert.alert('Validation Error', 'End time must be after start time');
      return;
    }

    setLoading(true);

    try {
      // Build recurrence rule if recurring
      let recurrenceRule = null;
      if (isRecurring) {
        // Handle special frequencies
        if (recurrenceFrequency === 'FORTNIGHTLY') {
          // Fortnight = weekly with interval of 2
          recurrenceRule = 'FREQ=WEEKLY;INTERVAL=2';
        } else if (recurrenceFrequency === 'QUARTERLY') {
          // Quarterly = monthly with interval of 3
          recurrenceRule = 'FREQ=MONTHLY;INTERVAL=3';
        } else {
          // Standard frequencies: DAILY, WEEKLY, MONTHLY, YEARLY
          recurrenceRule = `FREQ=${recurrenceFrequency}`;
        }

        if (recurrenceEndDate) {
          // Format: YYYYMMDD
          const formattedDate = recurrenceEndDate.toISOString().split('T')[0].replace(/-/g, '');
          recurrenceRule += `;UNTIL=${formattedDate}`;
        }
        // If no end date, it repeats forever (no UNTIL clause)
      }

      // Call backend API to create event
      const response = await API.post(`/groups/${groupId}/calendar/events`, {
        title: title.trim(),
        description: description.trim() || null,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        allDay: false,
        isRecurring: isRecurring,
        recurrenceRule: recurrenceRule,
        attendeeIds: selectedMemberIds, // Array of groupMemberIds
        notificationMinutes: notificationMinutes, // Minutes before event to send notification
      });

      if (response.data.success) {
        CustomAlert.alert('Success', 'Event created successfully', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]);
      } else {
        CustomAlert.alert('Error', response.data.message || 'Failed to create event');
      }
    } catch (error) {
      console.error('Error creating event:', error);
      const errorMessage = error.response?.data?.message || 'Failed to create event. Please try again.';
      CustomAlert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Custom Navigation Header */}
      <CustomNavigationHeader
        title="New Event"
        onBack={() => navigation.goBack()}
      />

      <ScrollView style={styles.scrollView}>
        <View style={styles.formContainer}>
          {/* Title */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Event title"
            placeholderTextColor="#999"
          />
        </View>

        {/* Description */}
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Event description (optional)"
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Attendees */}
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Attendees (will receive notifications)</Text>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => setShowMemberModal(true)}
          >
            <Text style={styles.selectButtonText}>
              {selectedMemberIds.length === 0
                ? 'Select attendees'
                : `${selectedMemberIds.length} member${selectedMemberIds.length !== 1 ? 's' : ''} selected`}
            </Text>
          </TouchableOpacity>
          {selectedMemberIds.length > 0 && (
            <View style={styles.selectedMembersContainer}>
              {members
                .filter(m => selectedMemberIds.includes(m.groupMemberId))
                .map(member => (
                  <View key={member.groupMemberId} style={styles.memberChip}>
                    <UserAvatar
                      profilePhotoUrl={member.profilePhotoUrl}
                      memberIcon={member.iconLetters}
                      iconColor={member.iconColor}
                      displayName={member.displayName}
                      size={24}
                      style={styles.memberChipIcon}
                    />
                    <Text style={styles.memberChipText}>{member.displayName}</Text>
                    <TouchableOpacity
                      onPress={() => toggleMemberSelection(member.groupMemberId)}
                      style={styles.memberChipRemove}
                    >
                      <Text style={styles.memberChipRemoveText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
            </View>
          )}
        </View>

        {/* Start Date/Time */}
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Start Date & Time *</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowStartPicker(true)}
          >
            <Text style={styles.dateButtonText}>
              {formatDateByType(startDate, 1)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* End Date/Time */}
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>End Date & Time *</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowEndPicker(true)}
          >
            <Text style={styles.dateButtonText}>
              {formatDateByType(endDate, 1)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Recurring Event Toggle */}
        <View style={styles.fieldContainer}>
          <View style={styles.toggleRow}>
            <Text style={styles.label}>Recurring Event</Text>
            <TouchableOpacity
              style={[styles.toggle, isRecurring && styles.toggleActive]}
              onPress={() => setIsRecurring(!isRecurring)}
            >
              <View style={[styles.toggleCircle, isRecurring && styles.toggleCircleActive]} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Recurrence Frequency (only show if recurring is enabled) */}
        {isRecurring && (
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Repeat Frequency</Text>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => setShowFrequencyModal(true)}
            >
              <Text style={styles.selectButtonText}>
                {formatFrequency(recurrenceFrequency)}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Recurring End Date (only show if recurring is enabled) */}
        {isRecurring && (
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Repeat Until</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowRecurrenceEndPicker(true)}
            >
              <Text style={styles.dateButtonText}>
                {recurrenceEndDate
                  ? formatDateByType(recurrenceEndDate, 3)
                  : 'Forever (no end date)'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Notification Time */}
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Notification Time</Text>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => setShowNotificationModal(true)}
          >
            <Text style={styles.selectButtonText}>
              {formatNotificationTime(notificationMinutes)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Create Event</Text>
          )}
        </TouchableOpacity>

        {/* Cancel Button */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Member Selection Modal */}
      <Modal
        visible={showMemberModal}
        animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
        transparent={true}
        onRequestClose={() => setShowMemberModal(false)}
      >
        <View style={[styles.modalOverlay, Platform.OS === 'web' && styles.modalOverlayWeb]}>
          <View style={[styles.modalContainer, Platform.OS === 'web' && styles.modalContainerWeb]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Attendees</Text>
              <TouchableOpacity onPress={() => setShowMemberModal(false)}>
                <Text style={styles.modalCloseButton}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              {members.map(member => {
                const isSelected = selectedMemberIds.includes(member.groupMemberId);
                return (
                  <TouchableOpacity
                    key={member.groupMemberId}
                    style={styles.memberItem}
                    onPress={() => toggleMemberSelection(member.groupMemberId)}
                  >
                    <View style={styles.memberItemLeft}>
                      <UserAvatar
                        profilePhotoUrl={member.profilePhotoUrl}
                        memberIcon={member.iconLetters}
                        iconColor={member.iconColor}
                        displayName={member.displayName}
                        size={40}
                        style={styles.memberIcon}
                      />
                      <View>
                        <Text style={styles.memberName}>{member.displayName}</Text>
                        <Text style={styles.memberRole}>{member.role}</Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.checkbox,
                        isSelected && styles.checkboxSelected,
                      ]}
                    >
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Notification Time Modal */}
      <Modal
        visible={showNotificationModal}
        animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
        transparent={true}
        onRequestClose={() => setShowNotificationModal(false)}
      >
        <View style={[styles.modalOverlay, Platform.OS === 'web' && styles.modalOverlayWeb]}>
          <View style={[styles.modalContainer, Platform.OS === 'web' && styles.modalContainerWeb]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notification Time</Text>
              <TouchableOpacity onPress={() => setShowNotificationModal(false)}>
                <Text style={styles.modalCloseButton}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              {[0, 5, 15, 30, 60, 120, 1440].map(minutes => (
                <TouchableOpacity
                  key={minutes}
                  style={styles.notificationOption}
                  onPress={() => {
                    setNotificationMinutes(minutes);
                    setShowNotificationModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.notificationOptionText,
                      notificationMinutes === minutes && styles.notificationOptionSelected,
                    ]}
                  >
                    {formatNotificationTime(minutes)}
                  </Text>
                  {notificationMinutes === minutes && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Recurrence Frequency Modal */}
      <Modal
        visible={showFrequencyModal}
        animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
        transparent={true}
        onRequestClose={() => setShowFrequencyModal(false)}
      >
        <View style={[styles.modalOverlay, Platform.OS === 'web' && styles.modalOverlayWeb]}>
          <View style={[styles.modalContainer, Platform.OS === 'web' && styles.modalContainerWeb]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Repeat Frequency</Text>
              <TouchableOpacity onPress={() => setShowFrequencyModal(false)}>
                <Text style={styles.modalCloseButton}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              {['DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'].map(freq => (
                <TouchableOpacity
                  key={freq}
                  style={styles.notificationOption}
                  onPress={() => {
                    setRecurrenceFrequency(freq);
                    setShowFrequencyModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.notificationOptionText,
                      recurrenceFrequency === freq && styles.notificationOptionSelected,
                    ]}
                  >
                    {formatFrequency(freq)}
                  </Text>
                  {recurrenceFrequency === freq && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Start Date/Time Picker */}
      <DateTimeSelector
        value={startDate}
        onChange={handleStartDateChange}
        format={1}
        visible={showStartPicker}
        onClose={() => setShowStartPicker(false)}
        title="Start Date & Time"
      />

      {/* End Date/Time Picker */}
      <DateTimeSelector
        value={endDate}
        onChange={handleEndDateChange}
        format={1}
        visible={showEndPicker}
        onClose={() => setShowEndPicker(false)}
        title="End Date & Time"
      />

      {/* Recurrence End Date Picker */}
      <DateTimeSelector
        value={recurrenceEndDate || new Date()}
        onChange={setRecurrenceEndDate}
        format={3}
        visible={showRecurrenceEndPicker}
        onClose={() => setShowRecurrenceEndPicker(false)}
        title="Repeat Until"
      />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  formContainer: {
    padding: 20,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9f9f9',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#333',
  },
  submitButton: {
    backgroundColor: '#6200ee',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonDisabled: {
    backgroundColor: '#9d7ddb',
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  selectButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9f9f9',
  },
  selectButtonText: {
    fontSize: 16,
    color: '#333',
  },
  selectedMembersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 8,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
  },
  memberChipIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberChipIconText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  memberChipText: {
    fontSize: 14,
    color: '#333',
  },
  memberChipRemove: {
    marginLeft: 4,
  },
  memberChipRemoveText: {
    fontSize: 20,
    color: '#666',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalOverlayWeb: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalContainerWeb: {
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalCloseButton: {
    fontSize: 16,
    color: '#6200ee',
    fontWeight: '600',
  },
  modalContent: {
    padding: 20,
  },
  memberItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  memberItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  memberIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberIconText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  memberRole: {
    fontSize: 12,
    color: '#666',
    textTransform: 'capitalize',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#6200ee',
    borderColor: '#6200ee',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ddd',
    justifyContent: 'center',
    padding: 2,
  },
  toggleActive: {
    backgroundColor: '#6200ee',
  },
  toggleCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  toggleCircleActive: {
    alignSelf: 'flex-end',
  },
  clearButton: {
    marginTop: 8,
    padding: 8,
  },
  clearButtonText: {
    color: '#6200ee',
    fontSize: 14,
    textAlign: 'center',
  },
  notificationOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  notificationOptionText: {
    fontSize: 16,
    color: '#333',
  },
  notificationOptionSelected: {
    color: '#6200ee',
    fontWeight: '600',
  },
});
