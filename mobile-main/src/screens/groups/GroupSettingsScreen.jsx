/**
 * Group Settings Screen
 *
 * Allows admins to manage group settings and members.
 * Regular members can view group info and members list.
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Platform, Image } from 'react-native';
import { CustomAlert } from '../../components/CustomAlert';
import {
  Card,
  Title,
  Text,
  Avatar,
  List,
  Button,
  Chip,
  IconButton,
  Divider,
  Switch,
  Menu,
  TextInput,
  HelperText,
} from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import api from '../../services/api';
import { getContrastTextColor } from '../../utils/colorUtils';
import UserAvatar from '../../components/shared/UserAvatar';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';
import ColorPickerModal from '../../components/ColorPickerModal';

/**
 * @typedef {Object} GroupSettingsScreenProps
 * @property {Object} navigation - React Navigation navigation object
 * @property {Object} route - React Navigation route object
 */

/**
 * GroupSettingsScreen component
 *
 * @param {GroupSettingsScreenProps} props
 * @returns {JSX.Element}
 */
export default function GroupSettingsScreen({ navigation, route }) {
  const { groupId } = route.params;
  const insets = useSafeAreaInsets();
  const [groupInfo, setGroupInfo] = useState(null);
  const [members, setMembers] = useState([]);
  const [userRole, setUserRole] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Group settings state
  const [groupSettings, setGroupSettings] = useState(null);
  const [adminPermissions, setAdminPermissions] = useState([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [currencyMenuVisible, setCurrencyMenuVisible] = useState(false);

  // Group details editing state
  const [editGroupName, setEditGroupName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editBackgroundColor, setEditBackgroundColor] = useState('#6200ee');
  const [editBackgroundImageId, setEditBackgroundImageId] = useState(null);
  const [editBackgroundImageUri, setEditBackgroundImageUri] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [updatingGroup, setUpdatingGroup] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [groupDetailsError, setGroupDetailsError] = useState(null);

  useEffect(() => {
    loadGroupDetails();
    // Load settings if user is admin (will be checked in loadGroupSettings)
    loadGroupSettings();
    loadAdminPermissions();
  }, [groupId]);


  /**
   * Refresh on screen focus
   */
  useFocusEffect(
    React.useCallback(() => {
      loadGroupDetails();
      loadGroupSettings();
    }, [groupId])
  );

  /**
   * Load group details and members
   */
  const loadGroupDetails = async () => {
    try {
      setError(null);
      const response = await api.get(`/groups/${groupId}`);
      const group = response.data.group;

      setGroupInfo({
        groupId: group.groupId,
        name: group.name,
        icon: group.icon,
        backgroundColor: group.backgroundColor,
        backgroundImageId: group.backgroundImageId,
        createdAt: group.createdAt,
      });

      // Initialize editing fields with current values
      setEditGroupName(group.name);
      setEditIcon(group.icon || '');
      setEditBackgroundColor(group.backgroundColor || '#6200ee');
      setEditBackgroundImageId(group.backgroundImageId || null);

      // Fetch image URL if backgroundImageId exists
      if (group.backgroundImageId) {
        setEditBackgroundImageUri(`${api.defaults.baseURL}/files/${group.backgroundImageId}`);
      } else {
        setEditBackgroundImageUri(null);
      }

      setMembers(group.members || []);
      setUserRole(group.userRole);
      setCurrentUserId(group.currentUserId);
    } catch (err) {
      console.error('Load group details error:', err);

      // Don't show error if it's an auth error - logout happens automatically
      if (err.isAuthError) {
        console.log('[GroupSettings] Auth error detected - user will be logged out');
        return;
      }

      setError(err.response?.data?.message || err.message || 'Failed to load group details');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load group settings (permissions)
   */
  const loadGroupSettings = async () => {
    try {
      const response = await api.get(`/groups/${groupId}/settings`);
      if (response.data.success) {
        setGroupSettings(response.data.settings);
      }
    } catch (err) {
      console.error('Load group settings error:', err);
      // Non-blocking error - settings section will just not appear for non-admins
    }
  };

  /**
   * Load admin permissions (for auto-approval settings)
   */
  const loadAdminPermissions = async () => {
    try {
      const response = await api.get(`/groups/${groupId}/admin-permissions`);
      if (response.data.success) {
        setAdminPermissions(response.data.admins || []);
      }
    } catch (err) {
      console.error('Load admin permissions error:', err);
      // Non-blocking error - admin permissions section will just not appear for non-admins
    }
  };

  /**
   * Handle settings toggle
   * Enforces dependency: If feature visibility is turned off, turn off creation permission
   */
  const handleToggleSetting = (key, value) => {
    setGroupSettings(prev => ({
      ...prev,
      [key]: value,
    }));

    // Enforce dependency for ALL features: If visibility is turned off, turn off creatable/usable
    // Pattern: {feature}VisibleTo{Role} -> {feature}CreatableBy{Role} or {feature}UsableBy{Role}
    const features = ['messageGroups', 'calendar', 'finance', 'giftRegistry', 'secretSanta', 'itemRegistry', 'wiki', 'documents'];
    const callFeatures = ['phoneCalls', 'videoCalls']; // These use "usable" instead of "creatable"
    const roles = ['Admins', 'Parents', 'Adults', 'Caregivers', 'Children'];

    features.forEach(feature => {
      roles.forEach(role => {
        const visibleKey = `${feature}VisibleTo${role}`;
        const creatableKey = `${feature}CreatableBy${role}`;

        if (key === visibleKey && !value) {
          // If turning off visibility, also turn off creatable
          setGroupSettings(prev => ({ ...prev, [creatableKey]: false }));
        }
      });
    });

    // Handle call features (use "usable" instead of "creatable")
    callFeatures.forEach(feature => {
      roles.forEach(role => {
        const visibleKey = `${feature}VisibleTo${role}`;
        const usableKey = `${feature}UsableBy${role}`;

        if (key === visibleKey && !value) {
          // If turning off visibility, also turn off usable
          setGroupSettings(prev => ({ ...prev, [usableKey]: false }));
        }
      });
    });
  };

  /**
   * Handle admin permission toggle
   */
  const handleToggleAdminPermission = async (targetAdminId, permissionKey, value) => {
    try {
      await api.put(`/groups/${groupId}/admin-permissions/${targetAdminId}`, {
        [permissionKey]: value,
      });

      // Update local state
      setAdminPermissions(prev =>
        prev.map(admin =>
          admin.userId === targetAdminId
            ? { ...admin, [permissionKey]: value }
            : admin
        )
      );
    } catch (err) {
      console.error('Update admin permission error:', err);

      if (err.isAuthError) {
        console.log('[GroupSettings] Auth error detected - user will be logged out');
        return;
      }

      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to update permission');
    }
  };

  /**
   * Save group settings
   */
  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);

      const response = await api.put(`/groups/${groupId}/settings`, groupSettings);

      // Show appropriate message based on whether approval is required
      const title = response.data.pendingApproval ? 'Approval Required' : 'Success';
      const message = response.data.message || 'Group settings saved successfully';
      CustomAlert.alert(title, message);
    } catch (err) {
      console.error('Save group settings error:', err);

      if (err.isAuthError) {
        console.log('[GroupSettings] Auth error detected - user will be logged out');
        return;
      }

      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  /**
   * Handle currency change
   */
  const handleCurrencyChange = async (currencyCode) => {
    setCurrencyMenuVisible(false);

    try {
      // Optimistically update UI
      setGroupSettings(prev => ({
        ...prev,
        defaultCurrency: currencyCode,
      }));

      const response = await api.put(`/groups/${groupId}/settings`, {
        ...groupSettings,
        defaultCurrency: currencyCode,
      });

      CustomAlert.alert('Success', response.data.message || `Default currency changed to ${currencyCode}`);
    } catch (err) {
      console.error('Change currency error:', err);

      if (err.isAuthError) {
        console.log('[GroupSettings] Auth error detected - user will be logged out');
        return;
      }

      // Revert on error
      await loadGroupSettings();
      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to change currency');
    }
  };

  /**
   * Render a feature permission section
   * @param {string} featureName - Display name (e.g., "Message Groups")
   * @param {string} featureKey - camelCase key (e.g., "messageGroups")
   */
  const renderFeatureSection = (featureName, featureKey) => {
    const roles = [
      { name: 'Admins', key: 'Admins' },
      { name: 'Parents', key: 'Parents' },
      { name: 'Adults', key: 'Adults' },
      { name: 'Caregivers', key: 'Caregivers' },
      { name: 'Children', key: 'Children' },
      { name: 'Supervisors', key: 'Supervisors' },
    ];

    return (
      <View key={featureKey}>
        <Text style={styles.subsectionTitle}>{featureName}</Text>

        {/* Visibility switches for all roles */}
        {roles.map(role => (
          <View key={`${featureKey}-visible-${role.key}`} style={styles.settingRow}>
            <Text style={styles.settingLabel}>
              {role.name} can see {featureName}
            </Text>
            <Switch
              value={groupSettings[`${featureKey}VisibleTo${role.key}`] ?? true}
              onValueChange={(value) => handleToggleSetting(`${featureKey}VisibleTo${role.key}`, value)}
              disabled={savingSettings}
            />
          </View>
        ))}

        {/* Creation switches for Parents, Caregivers, Children (grayed out if not visible) */}
        {roles.filter(r => r.key !== 'Supervisors').map(role => {
          const visibleKey = `${featureKey}VisibleTo${role.key}`;
          const creatableKey = `${featureKey}CreatableBy${role.key}`;
          const isVisible = groupSettings[visibleKey] ?? true;

          return (
            <View key={`${featureKey}-create-${role.key}`} style={styles.settingRow}>
              <Text style={[
                styles.settingLabel,
                !isVisible && styles.settingLabelDisabled
              ]}>
                {role.name} can create {featureName}
              </Text>
              <Switch
                value={groupSettings[creatableKey] ?? true}
                onValueChange={(value) => handleToggleSetting(creatableKey, value)}
                disabled={savingSettings || !isVisible}
              />
            </View>
          );
        })}

        <Divider style={styles.sectionDivider} />
      </View>
    );
  };

  /**
   * Render a calls feature permission section (uses "usable" instead of "creatable")
   * @param {string} featureName - Display name (e.g., "Phone Calls")
   * @param {string} featureKey - camelCase key (e.g., "phoneCalls")
   */
  const renderCallsFeatureSection = (featureName, featureKey) => {
    const roles = [
      { name: 'Admins', key: 'Admins' },
      { name: 'Parents', key: 'Parents' },
      { name: 'Adults', key: 'Adults' },
      { name: 'Caregivers', key: 'Caregivers' },
      { name: 'Children', key: 'Children' },
      { name: 'Supervisors', key: 'Supervisors' },
    ];

    return (
      <View key={featureKey}>
        <Text style={styles.subsectionTitle}>{featureName}</Text>

        {/* Visibility switches for all roles */}
        {roles.map(role => (
          <View key={`${featureKey}-visible-${role.key}`} style={styles.settingRow}>
            <Text style={styles.settingLabel}>
              {role.name} can see {featureName}
            </Text>
            <Switch
              value={groupSettings[`${featureKey}VisibleTo${role.key}`] ?? true}
              onValueChange={(value) => handleToggleSetting(`${featureKey}VisibleTo${role.key}`, value)}
              disabled={savingSettings}
            />
          </View>
        ))}

        {/* Usable switches for non-Supervisors (grayed out if not visible) */}
        {roles.filter(r => r.key !== 'Supervisors').map(role => {
          const visibleKey = `${featureKey}VisibleTo${role.key}`;
          const usableKey = `${featureKey}UsableBy${role.key}`;
          const isVisible = groupSettings[visibleKey] ?? true;

          return (
            <View key={`${featureKey}-usable-${role.key}`} style={styles.settingRow}>
              <Text style={[
                styles.settingLabel,
                !isVisible && styles.settingLabelDisabled
              ]}>
                {role.name} can use {featureName}
              </Text>
              <Switch
                value={groupSettings[usableKey] ?? true}
                onValueChange={(value) => handleToggleSetting(usableKey, value)}
                disabled={savingSettings || !isVisible}
              />
            </View>
          );
        })}

        <Divider style={styles.sectionDivider} />
      </View>
    );
  };

  /**
   * Save group details
   */
  const handleSaveGroupDetails = async () => {
    // Validate
    if (!editGroupName.trim()) {
      setGroupDetailsError('Group name is required');
      return;
    }

    try {
      setUpdatingGroup(true);
      setGroupDetailsError(null);

      await api.put(`/groups/${groupId}`, {
        name: editGroupName.trim(),
        icon: editIcon.trim() || undefined,
        backgroundColor: editBackgroundColor,
        backgroundImageId: editBackgroundImageId,
      });

      // Update local state
      setGroupInfo({
        ...groupInfo,
        name: editGroupName.trim(),
        icon: editIcon.trim(),
        backgroundColor: editBackgroundColor,
        backgroundImageId: editBackgroundImageId,
      });

      // Show success message
      CustomAlert.alert('Success', `Group "${editGroupName}" updated successfully!`);
    } catch (err) {
      console.error('Update group error:', err);

      // Don't show error if it's an auth error - logout happens automatically
      if (err.isAuthError) {
        console.log('[GroupSettings] Auth error detected - user will be logged out');
        return;
      }

      const errorMessage = err.response?.data?.message || err.message || 'Failed to update group';
      setGroupDetailsError(errorMessage);
    } finally {
      setUpdatingGroup(false);
    }
  };

  /**
   * Open color picker
   */
  const handleOpenColorPicker = () => {
    setColorPickerVisible(true);
  };

  /**
   * Handle color selection
   */
  const handleColorConfirm = (color) => {
    setEditBackgroundColor(color);
    setColorPickerVisible(false);
  };

  /**
   * Handle background image selection
   */
  const handleSelectBackgroundImage = async () => {
    try {
      // On web, use file input instead of image picker
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          try {
            setUploadingImage(true);
            setGroupDetailsError(null);

            // Resize image to 16:9 aspect ratio (800x450px) using canvas
            const resizedBlob = await new Promise((resolve, reject) => {
              const img = new window.Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Target dimensions: 800x450 (16:9)
                const targetWidth = 800;
                const targetHeight = 450;

                canvas.width = targetWidth;
                canvas.height = targetHeight;

                // Calculate scaling to cover the canvas while maintaining aspect ratio
                const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;

                // Center the image
                const x = (targetWidth - scaledWidth) / 2;
                const y = (targetHeight - scaledHeight) / 2;

                // Draw image centered and scaled
                ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

                canvas.toBlob(
                  (blob) => {
                    if (blob) {
                      resolve(blob);
                    } else {
                      reject(new Error('Failed to create blob'));
                    }
                  },
                  'image/jpeg',
                  0.8 // quality
                );
              };
              img.onerror = reject;
              img.src = URL.createObjectURL(file);
            });

            const formData = new FormData();
            formData.append('file', resizedBlob, 'group-background.jpg');
            formData.append('category', 'profiles');
            formData.append('groupId', groupId);

            const uploadResponse = await api.post('/files/upload', formData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            });

            const fileId = uploadResponse.data.file.fileId;

            // Update local state with uploaded image
            setEditBackgroundImageId(fileId);
            setEditBackgroundImageUri(URL.createObjectURL(resizedBlob));

            CustomAlert.alert('Success', 'Background image resized to 16:9 and selected. Click "Save Changes" to apply.');
          } catch (err) {
            console.error('Upload error:', err);
            const errorMessage = err.response?.data?.message || err.message || 'Failed to upload image';
            setGroupDetailsError(errorMessage);
          } finally {
            setUploadingImage(false);
          }
        };
        input.click();
        return;
      }

      // On mobile, use expo-image-picker
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        CustomAlert.alert('Permission Required', 'Please grant photo library access to upload an image');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false, // We'll handle cropping ourselves
        quality: 1.0, // Start with full quality, we'll compress after resize
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedImage = result.assets[0];

        setUploadingImage(true);
        setGroupDetailsError(null);

        // Resize and crop to 16:9 aspect ratio (800x450px)
        const manipulatedImage = await ImageManipulator.manipulateAsync(
          selectedImage.uri,
          [
            { resize: { width: 800 } }, // Resize width to 800px (maintains aspect ratio)
          ],
          {
            compress: 0.8,
            format: ImageManipulator.SaveFormat.JPEG,
          }
        );

        // Now crop to 16:9 if needed
        const targetAspectRatio = 16 / 9;
        const currentAspectRatio = manipulatedImage.width / manipulatedImage.height;

        let finalImage = manipulatedImage;

        if (Math.abs(currentAspectRatio - targetAspectRatio) > 0.01) {
          // Need to crop to 16:9
          const targetWidth = 800;
          const targetHeight = Math.round(targetWidth / targetAspectRatio); // 450px

          const cropX = 0;
          const cropY = Math.round((manipulatedImage.height - targetHeight) / 2);

          finalImage = await ImageManipulator.manipulateAsync(
            manipulatedImage.uri,
            [
              {
                crop: {
                  originX: cropX,
                  originY: Math.max(0, cropY),
                  width: targetWidth,
                  height: Math.min(targetHeight, manipulatedImage.height),
                },
              },
            ],
            {
              compress: 0.8,
              format: ImageManipulator.SaveFormat.JPEG,
            }
          );
        }

        const formData = new FormData();
        formData.append('file', {
          uri: finalImage.uri,
          type: 'image/jpeg',
          name: 'group-background.jpg',
        });
        formData.append('category', 'profiles');
        formData.append('groupId', groupId);

        const uploadResponse = await api.post('/files/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        const fileId = uploadResponse.data.file.fileId;

        setEditBackgroundImageId(fileId);
        setEditBackgroundImageUri(finalImage.uri);

        CustomAlert.alert('Success', 'Background image selected. Click "Save Changes" to apply.');
      }
    } catch (err) {
      console.error('Select background image error:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to upload image';
      setGroupDetailsError(errorMessage);
    } finally {
      setUploadingImage(false);
    }
  };

  /**
   * Handle removing background image
   */
  const handleRemoveBackgroundImage = () => {
    setEditBackgroundImageId(null);
    setEditBackgroundImageUri(null);
  };

  /**
   * Handle color picker cancel
   */
  const handleColorCancel = () => {
    setColorPickerVisible(false);
  };

  /**
   * Handle delete group
   */
  const handleDeleteGroup = () => {
    CustomAlert.alert(
      'Delete Group',
      `Are you sure you want to delete "${groupInfo.name}"? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: confirmDeleteGroup,
        },
      ]
    );
  };

  /**
   * Confirm delete group
   */
  const confirmDeleteGroup = async () => {
    try {
      setDeletingGroup(true);
      setGroupDetailsError(null);

      const response = await api.delete(`/groups/${groupId}`);

      // Check if approval is required
      if (response.data.requiresApproval) {
        CustomAlert.alert(
          'Approval Required',
          response.data.message || `Your request to delete "${groupInfo.name}" requires approval from other admins.`,
          [
            { text: 'OK', onPress: () => navigation.navigate('Groups') },
          ]
        );
        return;
      }

      CustomAlert.alert(
        'Success',
        response.data.message || 'Group deleted successfully.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Navigate back to groups list
              navigation.navigate('Groups');
            },
          },
        ]
      );
    } catch (err) {
      console.error('Delete group error:', err);

      // Don't show error if it's an auth error - logout happens automatically
      if (err.isAuthError) {
        console.log('[GroupSettings] Auth error detected - user will be logged out');
        return;
      }

      const errorMessage = err.response?.data?.message || err.message || 'Failed to delete group';
      setGroupDetailsError(errorMessage);
    } finally {
      setDeletingGroup(false);
    }
  };

  /**
   * Navigate to invite member screen
   */
  const handleInviteMember = () => {
    navigation.navigate('InviteMember', { groupId });
  };

  /**
   * Handle member press (show options for admin)
   */
  const handleMemberPress = (member) => {
    if (userRole !== 'admin') {
      return; // Regular members can't manage other members
    }

    // Prevent admins from managing their own role
    if (member.userId === currentUserId) {
      return; // Can't change your own role
    }

    // Show member options (change role, remove)
    CustomAlert.alert(
      member.displayName,
      'Member management options',
      [
        {
          text: 'Change Role',
          onPress: () => handleChangeRole(member),
        },
        {
          text: 'Remove from Group',
          onPress: () => handleRemoveMember(member),
          style: 'destructive',
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  /**
   * Handle change member role
   */
  const handleChangeRole = (member) => {
    const roles = [
      { label: 'Admin', value: 'admin' },
      { label: 'Parent', value: 'parent' },
      { label: 'Adult', value: 'adult' },
      { label: 'Child', value: 'child' },
      { label: 'Caregiver', value: 'caregiver' },
      { label: 'Supervisor', value: 'supervisor' },
    ];

    // Create alert with role options
    const buttons = roles.map(role => ({
      text: role.label,
      onPress: () => confirmChangeRole(member, role.value),
    }));
    buttons.push({ text: 'Cancel', style: 'cancel' });

    CustomAlert.alert(
      'Change Role',
      `Select new role for ${member.displayName || member.email}`,
      buttons
    );
  };

  /**
   * Confirm and execute role change
   */
  const confirmChangeRole = async (member, newRole) => {
    try {
      const response = await api.put(`/groups/${groupId}/members/${member.groupMemberId}/role`, {
        role: newRole,
      });

      // Check if approval is required
      if (response.data.requiresApproval) {
        CustomAlert.alert(
          'Approval Required',
          response.data.message || `Your request to change ${member.displayName || member.email}'s role requires approval from other admins.`,
          [
            { text: 'OK' },
          ]
        );
        return;
      }

      CustomAlert.alert('Success', response.data.message || `Role changed to ${newRole}`);
      loadGroupDetails(); // Reload to show updated role
    } catch (err) {
      console.error('Change role error:', err);

      // Don't show error if it's an auth error - logout happens automatically
      if (err.isAuthError) {
        console.log('[GroupSettings] Auth error detected - user will be logged out');
        return;
      }

      const errorMessage = err.response?.data?.message || err.message || 'Failed to change role';
      CustomAlert.alert('Error', errorMessage);
    }
  };

  /**
   * Handle remove member
   */
  const handleRemoveMember = (member) => {
    CustomAlert.alert(
      'Remove Member',
      `Are you sure you want to remove ${member.displayName || member.email} from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => confirmRemoveMember(member),
        },
      ]
    );
  };

  /**
   * Confirm and execute member removal
   */
  const confirmRemoveMember = async (member) => {
    try {
      const response = await api.delete(`/groups/${groupId}/members/${member.groupMemberId}`);

      // Check if approval is required
      if (response.data.requiresApproval) {
        CustomAlert.alert(
          'Approval Required',
          response.data.message || `Your request to remove ${member.displayName || member.email} requires approval from other admins.`,
          [
            { text: 'OK' },
          ]
        );
        return;
      }

      CustomAlert.alert('Success', response.data.message || 'Member removed from group');
      loadGroupDetails(); // Reload to show updated member list
    } catch (err) {
      console.error('Remove member error:', err);

      // Don't show error if it's an auth error - logout happens automatically
      if (err.isAuthError) {
        console.log('[GroupSettings] Auth error detected - user will be logged out');
        return;
      }

      const errorMessage = err.response?.data?.message || err.message || 'Failed to remove member';
      CustomAlert.alert('Error', errorMessage);
    }
  };

  /**
   * Handle leave group
   */
  const handleLeaveGroup = () => {
    CustomAlert.alert(
      'Leave Group',
      `Are you sure you want to leave "${groupInfo?.name}"? You will need to be re-invited to rejoin.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: confirmLeaveGroup,
        },
      ]
    );
  };

  /**
   * Confirm and execute leave group
   */
  const confirmLeaveGroup = async () => {
    try {
      await api.post(`/groups/${groupId}/leave`);

      CustomAlert.alert(
        'Success',
        'You have left the group',
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Groups'),
          },
        ]
      );
    } catch (err) {
      console.error('Leave group error:', err);

      // Don't show error if it's an auth error - logout happens automatically
      if (err.isAuthError) {
        console.log('[GroupSettings] Auth error detected - user will be logged out');
        return;
      }

      const errorMessage = err.response?.data?.message || err.message || 'Failed to leave group';
      CustomAlert.alert('Error', errorMessage);
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
      case 'adult':
        return '#2196f3';
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

  return (
    <View style={styles.container}>
      {/* Custom Navigation Header */}
      <CustomNavigationHeader
        title="Group Settings"
        onBack={() => navigation.goBack()}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <Text>Loading group settings...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={loadGroupDetails} style={styles.retryButton}>
            Retry
          </Button>
        </View>
      ) : !groupInfo ? (
        <View style={styles.errorContainer}>
          <Text>Group not found</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 20 }}>
      {/* Group Details Section */}
      {userRole === 'admin' && (
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Group Details</Title>

            {groupDetailsError && (
              <HelperText type="error" visible={!!groupDetailsError} style={styles.errorText}>
                {groupDetailsError}
              </HelperText>
            )}

            <TextInput
              label="Group Name *"
              value={editGroupName}
              onChangeText={setEditGroupName}
              mode="outlined"
              style={styles.input}
              placeholder="e.g., Family Chat, Weekend Plans"
              maxLength={255}
              disabled={updatingGroup}
            />

            <TextInput
              label="Icon (emoji or single character)"
              value={editIcon}
              onChangeText={setEditIcon}
              mode="outlined"
              style={styles.input}
              placeholder="e.g., 🏠, 👨‍👩‍👧‍👦, F"
              maxLength={2}
              disabled={updatingGroup}
            />

            <View style={styles.colorSection}>
              <Text style={styles.colorLabel}>Group Color</Text>
              <TouchableOpacity
                style={styles.colorButton}
                onPress={handleOpenColorPicker}
                disabled={updatingGroup}
              >
                <View style={[styles.colorPreview, { backgroundColor: editBackgroundColor }]} />
                <Text style={styles.colorButtonText}>
                  {editBackgroundColor.toUpperCase()}
                </Text>
                <Text style={styles.colorButtonLabel}>Tap to change</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.backgroundImageSection}>
              <Text style={styles.colorLabel}>Card Background Image</Text>
              <Text style={styles.helperText}>Portrait rectangle (16:9) - shown on group list card</Text>

              {editBackgroundImageUri ? (
                <View style={styles.imagePreviewContainer}>
                  <Image
                    source={{ uri: editBackgroundImageUri }}
                    style={styles.backgroundImagePreview}
                    resizeMode="cover"
                  />
                  <View style={styles.imageButtonsRow}>
                    <Button
                      mode="outlined"
                      onPress={handleSelectBackgroundImage}
                      disabled={updatingGroup || uploadingImage}
                      style={styles.changeImageButton}
                      icon="image-edit"
                    >
                      Change Image
                    </Button>
                    <Button
                      mode="outlined"
                      onPress={handleRemoveBackgroundImage}
                      disabled={updatingGroup || uploadingImage}
                      style={styles.removeImageButton}
                      icon="delete"
                      textColor="#d32f2f"
                    >
                      Remove
                    </Button>
                  </View>
                </View>
              ) : (
                <Button
                  mode="outlined"
                  onPress={handleSelectBackgroundImage}
                  disabled={updatingGroup || uploadingImage}
                  loading={uploadingImage}
                  style={styles.uploadButton}
                  icon="image-plus"
                >
                  {uploadingImage ? 'Uploading...' : 'Upload Background Image'}
                </Button>
              )}
            </View>

            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Icon Preview:</Text>
              <View
                style={[
                  styles.previewBox,
                  { backgroundColor: editBackgroundColor || '#6200ee' },
                ]}
              >
                <Text style={styles.previewIcon}>
                  {editIcon || editGroupName[0] || '?'}
                </Text>
              </View>
            </View>

            <Button
              mode="contained"
              onPress={handleSaveGroupDetails}
              loading={updatingGroup}
              disabled={updatingGroup || !editGroupName.trim()}
              style={styles.saveButton}
            >
              Save Changes
            </Button>
          </Card.Content>
        </Card>
      )}

      {/* Members Section */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.sectionHeader}>
            <Title style={styles.sectionTitle}>Members</Title>
            {userRole === 'admin' && (
              <IconButton
                icon="account-plus"
                mode="contained"
                iconColor="#fff"
                containerColor="#6200ee"
                size={20}
                onPress={handleInviteMember}
              />
            )}
          </View>

          {userRole === 'admin' && (
            <Text style={styles.memberNote}>
              It is recommended that all people that supervise a child are added as a member of the group regardless of if they use this app or not. Schools and institutions that look after a child don't need to be added.
            </Text>
          )}

          <Divider style={styles.divider} />

          {members.map((member, index) => (
            <List.Item
              key={member.groupMemberId}
              title={member.email || 'No email'}
              description={member.displayName}
              onPress={() => handleMemberPress(member)}
              left={(props) => (
                <UserAvatar
                  profilePhotoUrl={member.profilePhotoUrl}
                  memberIcon={member.iconLetters}
                  iconColor={member.iconColor}
                  displayName={member.displayName}
                  email={member.email}
                  size={40}
                />
              )}
              right={() => (
                <Chip
                  mode="flat"
                  style={{ backgroundColor: getRoleBadgeColor(member.role) }}
                  textStyle={{ color: '#fff', fontSize: 12 }}
                >
                  {member.role.toUpperCase()}
                </Chip>
              )}
              style={[
                styles.memberItem,
                index < members.length - 1 && styles.memberItemBorder,
              ]}
            />
          ))}
        </Card.Content>
      </Card>

      {/* Currency Settings Section (Admin Only) */}
      {userRole === 'admin' && groupSettings && (
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Currency</Title>
            <Text style={styles.sectionDescription}>
              Default currency for finance matters in this group
            </Text>
            <Divider style={styles.divider} />

            <Menu
              visible={currencyMenuVisible}
              onDismiss={() => setCurrencyMenuVisible(false)}
              anchor={
                <Button
                  mode="outlined"
                  onPress={() => setCurrencyMenuVisible(true)}
                  icon="currency-usd"
                  style={styles.currencyButton}
                  contentStyle={styles.currencyButtonContent}
                >
                  {groupSettings.defaultCurrency || 'USD'}
                </Button>
              }
            >
              <Menu.Item onPress={() => handleCurrencyChange('USD')} title="USD - US Dollar" />
              <Menu.Item onPress={() => handleCurrencyChange('EUR')} title="EUR - Euro" />
              <Menu.Item onPress={() => handleCurrencyChange('GBP')} title="GBP - British Pound" />
              <Menu.Item onPress={() => handleCurrencyChange('CAD')} title="CAD - Canadian Dollar" />
              <Menu.Item onPress={() => handleCurrencyChange('AUD')} title="AUD - Australian Dollar" />
              <Menu.Item onPress={() => handleCurrencyChange('JPY')} title="JPY - Japanese Yen" />
              <Menu.Item onPress={() => handleCurrencyChange('CNY')} title="CNY - Chinese Yuan" />
              <Menu.Item onPress={() => handleCurrencyChange('INR')} title="INR - Indian Rupee" />
            </Menu>
          </Card.Content>
        </Card>
      )}

      {/* Call Recording Settings Section (Admin Only) */}
      {userRole === 'admin' && groupSettings && (
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Call Recording</Title>
            <Text style={styles.sectionDescription}>
              Automatically record phone and video calls for this group. Recordings are stored securely and count toward storage usage.
            </Text>
            <Divider style={styles.divider} />

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Record Phone Calls</Text>
              <Switch
                value={groupSettings.recordPhoneCalls ?? true}
                onValueChange={(value) => handleToggleSetting('recordPhoneCalls', value)}
                disabled={savingSettings}
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Record Video Calls</Text>
              <Switch
                value={groupSettings.recordVideoCalls ?? true}
                onValueChange={(value) => handleToggleSetting('recordVideoCalls', value)}
                disabled={savingSettings}
              />
            </View>

            <Button
              mode="contained"
              onPress={handleSaveSettings}
              loading={savingSettings}
              disabled={savingSettings}
              style={styles.saveButton}
            >
              Save Recording Settings
            </Button>
          </Card.Content>
        </Card>
      )}

      {/* Group Permissions Section (Admin Only) */}
      {userRole === 'admin' && groupSettings && (
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Group Permissions</Title>
            <Divider style={styles.divider} />

            {/* All Feature Permissions - Grouped by Feature */}
            {renderFeatureSection('Message Groups', 'messageGroups')}

            {renderFeatureSection('Calendar', 'calendar')}
            {renderFeatureSection('Finance', 'finance')}
            {renderFeatureSection('Gift Registry', 'giftRegistry')}
            {renderFeatureSection('Secret Santa', 'secretSanta')}
            {renderFeatureSection('Item Registry', 'itemRegistry')}
            {renderFeatureSection('Wiki', 'wiki')}
            {renderFeatureSection('Secure Documents', 'documents')}
            {renderCallsFeatureSection('Phone Calls', 'phoneCalls')}
            {renderCallsFeatureSection('Video Calls', 'videoCalls')}

            <Button
              mode="contained"
              onPress={handleSaveSettings}
              loading={savingSettings}
              disabled={savingSettings}
              style={styles.saveButton}
            >
              Save Permissions
            </Button>
          </Card.Content>
        </Card>
      )}

      {/* Auto-Approve Settings (Admin Only) */}
      {userRole === 'admin' && (
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Auto-Approve Settings</Title>
            <Text style={styles.helperText}>
              Pre-approve specific actions from other admins. When more than 50% of other admins have
              pre-approved an action type, it will execute immediately without requiring approval.
            </Text>
            <Button
              mode="outlined"
              icon="shield-check"
              onPress={() => navigation.navigate('AutoApproveSettings', { groupId })}
              style={styles.autoApproveButton}
            >
              Manage Auto-Approve Permissions
            </Button>
          </Card.Content>
        </Card>
      )}

      {/* Delete Group Button (for admins) */}
      {userRole === 'admin' && (
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.dangerZone}>
              <Text style={styles.dangerZoneTitle}>Danger Zone</Text>
              <Text style={styles.dangerZoneText}>
                Deleting a group is permanent and cannot be undone. All messages, calendar events, and finance records will be hidden but preserved in audit logs.
              </Text>
              <Text style={styles.dangerZoneText}>
                If there are multiple admins, approval requests will be sent to all other admins. The group will be deleted if more than 75% of admins approve.
              </Text>
              <Button
                mode="outlined"
                icon="delete"
                textColor="#d32f2f"
                onPress={handleDeleteGroup}
                loading={deletingGroup}
                disabled={deletingGroup}
                style={styles.deleteButton}
              >
                Delete Group
              </Button>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Leave Group Button (for non-admins) */}
      {userRole !== 'admin' && (
        <Card style={styles.card}>
          <Card.Content>
            <Button
              mode="outlined"
              icon="exit-to-app"
              textColor="#d32f2f"
              onPress={handleLeaveGroup}
            >
              Leave Group
            </Button>
          </Card.Content>
        </Card>
      )}

      {/* Color Picker Modal */}
      <ColorPickerModal
        visible={colorPickerVisible}
        initialColor={editBackgroundColor}
        onConfirm={handleColorConfirm}
        onCancel={handleColorCancel}
      />
        </ScrollView>
      )}
    </View>
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
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
  },
  card: {
    margin: 16,
    marginBottom: 0,
    elevation: 2,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    marginRight: 16,
  },
  groupHeaderInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  editButton: {
    marginTop: 8,
  },
  autoApproveButton: {
    marginTop: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  memberNote: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
    marginBottom: 8,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  divider: {
    marginBottom: 8,
  },
  memberItem: {
    paddingVertical: 8,
  },
  memberItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 12,
    color: '#333',
  },
  subSubsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
    color: '#555',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingLabel: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    marginRight: 12,
  },
  settingLabelDisabled: {
    color: '#999',
  },
  sectionDivider: {
    marginVertical: 16,
  },
  saveButton: {
    marginTop: 16,
    backgroundColor: '#6200ee',
  },
  helperText: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    marginBottom: 8,
  },
  adminPermissionSection: {
    marginBottom: 8,
  },
  adminHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  adminName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  permissionsList: {
    marginLeft: 8,
  },
  permissionLabel: {
    fontSize: 13,
    color: '#555',
    flex: 1,
    marginRight: 12,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  currencyButton: {
    marginTop: 8,
    borderColor: '#6200ee',
  },
  currencyButtonContent: {
    height: 48,
  },
  // Group details editing styles
  groupActionsContainer: {
    marginTop: 16,
    gap: 8,
  },
  deleteButton: {
    borderColor: '#d32f2f',
    marginTop: 8,
  },
  input: {
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    marginBottom: 8,
  },
  colorSection: {
    marginBottom: 16,
  },
  colorLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    fontWeight: '500',
  },
  colorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  colorPreview: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 16,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  colorButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  colorButtonLabel: {
    fontSize: 12,
    color: '#999',
  },
  preview: {
    marginVertical: 20,
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  previewBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewIcon: {
    fontSize: 40,
    color: '#fff',
    fontWeight: 'bold',
  },
  editButtonsContainer: {
    marginTop: 20,
  },
  saveButton: {
    paddingVertical: 6,
  },
  cancelEditButton: {
    marginTop: 8,
  },
  dangerZone: {
    padding: 16,
    backgroundColor: '#ffebee',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffcdd2',
  },
  dangerZoneTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 8,
  },
  dangerZoneText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  backgroundImageSection: {
    marginBottom: 16,
    marginTop: 8,
  },
  helperText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  imagePreviewContainer: {
    marginTop: 8,
  },
  backgroundImagePreview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    marginBottom: 12,
  },
  imageButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  changeImageButton: {
    flex: 1,
  },
  removeImageButton: {
    flex: 1,
    borderColor: '#d32f2f',
  },
  uploadButton: {
    marginTop: 8,
  },
});
