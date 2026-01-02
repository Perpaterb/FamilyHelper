/**
 * Create Message Group Screen
 *
 * Allows users to create a new message group within a group.
 * Users can name the message group and select which members to include.
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { CustomAlert } from '../../components/CustomAlert';
import {
  TextInput,
  Button,
  Title,
  Text,
  HelperText,
  Checkbox,
  Avatar,
  Card,
} from 'react-native-paper';
import api from '../../services/api';
import { getContrastTextColor } from '../../utils/colorUtils';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';
import UserAvatar from '../../components/shared/UserAvatar';

/**
 * @typedef {Object} CreateMessageGroupScreenProps
 * @property {Object} navigation - React Navigation navigation object
 * @property {Object} route - React Navigation route object
 */

/**
 * CreateMessageGroupScreen component
 *
 * @param {CreateMessageGroupScreenProps} props
 * @returns {JSX.Element}
 */
export default function CreateMessageGroupScreen({ navigation, route }) {
  const { groupId } = route.params;
  const [name, setName] = useState('');
  const [members, setMembers] = useState([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadGroupMembers();
  }, [groupId]);

  /**
   * Load group members from API
   */
  const loadGroupMembers = async () => {
    try {
      setError(null);
      const response = await api.get(`/groups/${groupId}`);
      const groupData = response.data.group;

      // Get members from the group
      const groupMembers = groupData.members || [];
      setMembers(groupMembers);

      // Auto-select all members by default
      const allMemberIds = groupMembers.map(m => m.groupMemberId);
      setSelectedMemberIds(allMemberIds);
    } catch (err) {
      console.error('Load group members error:', err);

      // Don't show error if it's an auth error
      if (err.isAuthError) {
        console.log('[CreateMessageGroup] Auth error detected - user will be logged out');
        return;
      }

      setError(err.response?.data?.message || 'Failed to load group members');
    } finally {
      setLoadingMembers(false);
    }
  };

  /**
   * Toggle member selection
   */
  const toggleMember = (groupMemberId) => {
    setSelectedMemberIds((prev) => {
      if (prev.includes(groupMemberId)) {
        return prev.filter((id) => id !== groupMemberId);
      } else {
        return [...prev, groupMemberId];
      }
    });
  };

  /**
   * Select all members
   */
  const selectAllMembers = () => {
    const allMemberIds = members.map(m => m.groupMemberId);
    setSelectedMemberIds(allMemberIds);
  };

  /**
   * Deselect all members
   */
  const deselectAllMembers = () => {
    setSelectedMemberIds([]);
  };

  /**
   * Handle create message group submission
   */
  const handleCreate = async () => {
    // Validate name
    if (!name.trim()) {
      setError('Message group name is required');
      return;
    }

    if (selectedMemberIds.length === 0) {
      setError('Please select at least one member');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await api.post(`/groups/${groupId}/message-groups`, {
        name: name.trim(),
        memberIds: selectedMemberIds,
      });

      CustomAlert.alert(
        'Message Group Created',
        `"${name.trim()}" has been created with ${selectedMemberIds.length} member(s).`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (err) {
      console.error('Create message group error:', err);

      // Don't show error if it's an auth error
      if (err.isAuthError) {
        console.log('[CreateMessageGroup] Auth error detected - user will be logged out');
        return;
      }

      const errorMessage =
        err.response?.data?.message || err.message || 'Failed to create message group';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Custom Navigation Header */}
      <CustomNavigationHeader
        title="Create Message Group"
        onBack={() => navigation.goBack()}
      />

      {loadingMembers ? (
        <View style={styles.loadingContainer}>
          <Text>Loading members...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView}>
          <View style={styles.content}>
        <Title style={styles.title}>Create Message Group</Title>
        <Text style={styles.subtitle}>
          Give your message group a name and select which members should be included.
        </Text>

        {error && (
          <HelperText type="error" visible={!!error} style={styles.errorText}>
            {error}
          </HelperText>
        )}

        <TextInput
          label="Message Group Name *"
          value={name}
          onChangeText={(text) => {
            setName(text);
            setError(null);
          }}
          mode="outlined"
          style={styles.input}
          placeholder="e.g., Parents Only, Everyone, Kids Chat"
          disabled={loading}
          maxLength={100}
        />
        <HelperText type="info" visible={true} style={styles.helperTextInfo}>
          Choose a descriptive name for this message group
        </HelperText>

        <Card style={styles.membersCard}>
          <Card.Content>
            <View style={styles.memberHeader}>
              <Text style={styles.memberTitle}>Select Members *</Text>
              <View style={styles.selectButtons}>
                <Button
                  mode="text"
                  onPress={selectAllMembers}
                  disabled={loading}
                  compact
                  style={styles.selectButton}
                >
                  All
                </Button>
                <Button
                  mode="text"
                  onPress={deselectAllMembers}
                  disabled={loading}
                  compact
                  style={styles.selectButton}
                >
                  None
                </Button>
              </View>
            </View>
            <Text style={styles.memberSubtitle}>
              {selectedMemberIds.length} of {members.length} selected
            </Text>

            {members.map((member) => (
              <TouchableOpacity
                key={member.groupMemberId}
                style={styles.memberRow}
                onPress={() => toggleMember(member.groupMemberId)}
                disabled={loading}
                activeOpacity={0.7}
              >
                <View pointerEvents="none">
                  <Checkbox
                    status={selectedMemberIds.includes(member.groupMemberId) ? 'checked' : 'unchecked'}
                    disabled={true}
                  />
                </View>
                <UserAvatar
                  profilePhotoUrl={member.profilePhotoUrl}
                  memberIcon={member.iconLetters}
                  iconColor={member.iconColor || '#6200ee'}
                  displayName={member.displayName}
                  size={40}
                  style={styles.avatar}
                />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName} numberOfLines={1}>{member.displayName || 'Unknown'}</Text>
                  <Text style={styles.memberRole}>{member.role}</Text>
                </View>
              </TouchableOpacity>
            ))}

            {members.length === 0 && (
              <Text style={styles.noMembersText}>No members found in this group</Text>
            )}
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={handleCreate}
          loading={loading}
          disabled={loading || !name.trim() || selectedMemberIds.length === 0}
          style={styles.createButton}
        >
          Create Message Group
        </Button>

        <Button
          mode="text"
          onPress={() => navigation.goBack()}
          disabled={loading}
          style={styles.cancelButton}
        >
          Cancel
        </Button>
          </View>
        </ScrollView>
      )}
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
  content: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  input: {
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    marginBottom: 8,
  },
  helperTextInfo: {
    fontSize: 12,
    marginTop: -4,
    marginBottom: 20,
    paddingHorizontal: 0,
  },
  membersCard: {
    marginBottom: 20,
    elevation: 1,
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  memberTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  selectButtons: {
    flexDirection: 'row',
  },
  selectButton: {
    marginLeft: 8,
  },
  memberSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 4,
  },
  checkbox: {
    paddingVertical: 0,
    marginRight: -8,
  },
  avatar: {
    marginRight: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  memberRole: {
    fontSize: 13,
    color: '#666',
    textTransform: 'capitalize',
  },
  noMembersText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  createButton: {
    marginTop: 12,
    paddingVertical: 6,
  },
  cancelButton: {
    marginTop: 8,
  },
});
