/**
 * Invite Member Screen
 *
 * Allows admins to invite new members to a group by email.
 * Members can be assigned different roles.
 */

import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { CustomAlert } from '../../components/CustomAlert';
import {
  TextInput,
  Button,
  Title,
  Text,
  HelperText,
  RadioButton,
  Card,
  Avatar,
} from 'react-native-paper';
import api from '../../services/api';
import ColorPickerModal from '../../components/ColorPickerModal';
import { getContrastTextColor } from '../../utils/colorUtils';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';

/**
 * @typedef {Object} InviteMemberScreenProps
 * @property {Object} navigation - React Navigation navigation object
 * @property {Object} route - React Navigation route object
 */

/**
 * InviteMemberScreen component
 *
 * @param {InviteMemberScreenProps} props
 * @returns {JSX.Element}
 */
export default function InviteMemberScreen({ navigation, route }) {
  const { groupId } = route.params;
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [memberIcon, setMemberIcon] = useState('');
  const [iconColor, setIconColor] = useState('#6200ee');
  const [role, setRole] = useState('parent'); // Default role
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [colorPickerVisible, setColorPickerVisible] = useState(false);

  /**
   * Validate email format
   */
  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  /**
   * Open color picker modal
   */
  const handleOpenColorPicker = () => {
    setColorPickerVisible(true);
  };

  /**
   * Confirm color selection from picker
   */
  const handleColorConfirm = (color) => {
    setIconColor(color);
    setColorPickerVisible(false);
  };

  /**
   * Cancel color selection
   */
  const handleColorCancel = () => {
    setColorPickerVisible(false);
  };

  /**
   * Handle invite submission
   */
  const handleInvite = async () => {
    // Validate email
    if (!email.trim()) {
      setError('Email address is required');
      return;
    }

    if (!isValidEmail(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await api.post(`/groups/${groupId}/members/invite`, {
        email: email.trim().toLowerCase(),
        role: role,
        displayName: displayName.trim() || undefined,
        memberIcon: memberIcon.trim() || undefined,
        iconColor: iconColor,
      });

      // Show appropriate message based on whether approval is required
      const title = response.data.requiresApproval ? 'Approval Required' : 'Invitation Sent';
      const message = response.data.message || `Invitation sent to ${email}. They will be added as a ${role}.`;

      CustomAlert.alert(
        title,
        message,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );

      // On web, also navigate immediately since alert is non-blocking
      if (Platform.OS === 'web') {
        navigation.goBack();
      }
    } catch (err) {
      console.error('Invite member error:', err);

      // Don't show error if it's an auth error - logout happens automatically
      if (err.isAuthError) {
        console.log('[InviteMember] Auth error detected - user will be logged out');
        return;
      }

      const errorMessage =
        err.response?.data?.message || err.message || 'Failed to send invitation';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get role description
   */
  const getRoleDescription = (roleValue) => {
    switch (roleValue) {
      case 'admin':
        return 'Full control - can manage group settings, members, and all features';
      case 'parent':
        return 'Standard access - can use all features and communicate';
      case 'adult':
        return 'Adult family member - same as parent but distinct role for non-parents';
      case 'child':
        return 'Limited access - can view and participate in age-appropriate features';
      case 'caregiver':
        return 'Care-related access - can manage care schedules and activities';
      case 'supervisor':
        return 'View-only access - can monitor but cannot send messages';
      default:
        return '';
    }
  };

  return (
    <View style={styles.container}>
      {/* Custom Navigation Header */}
      <CustomNavigationHeader
        title="Invite Member"
        onBack={() => navigation.goBack()}
      />

      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
        <Title style={styles.title}>Invite Member to Group</Title>
        <Text style={styles.subtitle}>
          Enter the email address of the person you'd like to invite and select their
          role.
        </Text>

        {error && (
          <HelperText type="error" visible={!!error} style={styles.errorText}>
            {error}
          </HelperText>
        )}

        <TextInput
          label="Email Address *"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setError(null);
          }}
          mode="outlined"
          style={styles.input}
          placeholder="member@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          disabled={loading}
        />

        <TouchableOpacity style={styles.avatarContainer} onPress={handleOpenColorPicker}>
          <Avatar.Text
            size={64}
            label={memberIcon || displayName?.[0]?.toUpperCase() || email?.[0]?.toUpperCase() || '?'}
            style={[styles.avatar, { backgroundColor: iconColor }]}
            color={getContrastTextColor(iconColor)}
          />
          <Text style={styles.avatarHint}>Tap to change icon color</Text>
        </TouchableOpacity>

        <TextInput
          label="Display Name (Placeholder)"
          value={displayName}
          onChangeText={setDisplayName}
          mode="outlined"
          style={styles.input}
          placeholder="e.g., Grandma, School, Soccer Coach"
          disabled={loading}
        />
        <HelperText type="info" visible={true} style={styles.helperTextInfo}>
          Optional: A name to display for this member until they join
        </HelperText>

        <TextInput
          label="Member Icon (Placeholder)"
          value={memberIcon}
          onChangeText={setMemberIcon}
          mode="outlined"
          style={styles.input}
          placeholder="e.g., 👵 or G"
          maxLength={2}
          disabled={loading}
        />
        <HelperText type="info" visible={true} style={styles.helperTextInfo}>
          Optional: An emoji or letter to represent this member
        </HelperText>

        <Card style={styles.roleCard}>
          <Card.Content>
            <Text style={styles.roleTitle}>Select Role *</Text>
            <Text style={styles.roleSubtitle}>
              Choose the level of access for this member
            </Text>

            <RadioButton.Group onValueChange={setRole} value={role}>
              <View style={styles.roleOption}>
                <RadioButton.Item
                  label="Parent"
                  value="parent"
                  disabled={loading}
                  style={styles.radioItem}
                />
                <Text style={styles.roleDescription}>
                  {getRoleDescription('parent')}
                </Text>
              </View>

              <View style={styles.roleOption}>
                <RadioButton.Item
                  label="Adult"
                  value="adult"
                  disabled={loading}
                  style={styles.radioItem}
                />
                <Text style={styles.roleDescription}>
                  {getRoleDescription('adult')}
                </Text>
              </View>

              <View style={styles.roleOption}>
                <RadioButton.Item
                  label="Child"
                  value="child"
                  disabled={loading}
                  style={styles.radioItem}
                />
                <Text style={styles.roleDescription}>
                  {getRoleDescription('child')}
                </Text>
              </View>

              <View style={styles.roleOption}>
                <RadioButton.Item
                  label="Caregiver"
                  value="caregiver"
                  disabled={loading}
                  style={styles.radioItem}
                />
                <Text style={styles.roleDescription}>
                  {getRoleDescription('caregiver')}
                </Text>
              </View>

              <View style={styles.roleOption}>
                <RadioButton.Item
                  label="Supervisor"
                  value="supervisor"
                  disabled={loading}
                  style={styles.radioItem}
                />
                <Text style={styles.roleDescription}>
                  {getRoleDescription('supervisor')}
                </Text>
              </View>
            </RadioButton.Group>

            <HelperText type="info" visible={true} style={styles.adminNote}>
              Note: After a member joins as a parent, they can be promoted to admin if
              they have an active subscription.
            </HelperText>
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={handleInvite}
          loading={loading}
          disabled={loading || !email.trim()}
          style={styles.inviteButton}
        >
          Send Invitation
        </Button>

        <Button
          mode="text"
          onPress={() => navigation.goBack()}
          disabled={loading}
          style={styles.cancelButton}
        >
          Cancel
        </Button>

        {/* Color Picker Modal */}
        <ColorPickerModal
          visible={colorPickerVisible}
          initialColor={iconColor}
          onConfirm={handleColorConfirm}
          onCancel={handleColorCancel}
        />
        </View>
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
  content: {
    padding: 20,
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
    marginBottom: 20,
  },
  errorText: {
    fontSize: 14,
    marginBottom: 8,
  },
  helperTextInfo: {
    fontSize: 12,
    marginTop: -16,
    marginBottom: 12,
    paddingHorizontal: 0,
  },
  avatarContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  avatar: {
    backgroundColor: '#6200ee',
  },
  avatarHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  roleCard: {
    marginBottom: 20,
    elevation: 1,
  },
  roleTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  roleSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  roleOption: {
    marginBottom: 8,
  },
  radioItem: {
    paddingVertical: 0,
  },
  roleDescription: {
    fontSize: 12,
    color: '#666',
    marginLeft: 48,
    marginTop: -8,
    marginBottom: 8,
  },
  adminNote: {
    fontSize: 13,
    marginTop: 12,
    paddingHorizontal: 0,
  },
  inviteButton: {
    marginTop: 12,
    paddingVertical: 6,
  },
  cancelButton: {
    marginTop: 8,
  },
});
