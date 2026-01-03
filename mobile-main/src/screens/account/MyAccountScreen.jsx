/**
 * My Account Screen
 *
 * Allows users to:
 * - View and edit their display name
 * - View and edit their member icon
 * - View subscription status
 * - Navigate to web admin for full account features
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Linking, TouchableOpacity, Image, Platform } from 'react-native';
import { CustomAlert } from '../../components/CustomAlert';
import { Card, Title, Text, TextInput, Button, Avatar, Divider, ActivityIndicator, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import api from '../../services/api';
import { STORAGE_KEYS, API_BASE_URL } from '../../config/config';
import ColorPickerModal from '../../components/ColorPickerModal';
import MediaPicker from '../../components/shared/MediaPicker';
import { getContrastTextColor } from '../../utils/colorUtils';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';

/**
 * @typedef {Object} MyAccountScreenProps
 * @property {Object} navigation - React Navigation navigation object
 */

/**
 * MyAccountScreen component
 *
 * @param {MyAccountScreenProps} props
 * @returns {JSX.Element}
 */
export default function MyAccountScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [memberIcon, setMemberIcon] = useState('');
  const [iconColor, setIconColor] = useState('#6200ee');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [email, setEmail] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [error, setError] = useState(null);
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [regeneratingBill, setRegeneratingBill] = useState(false);

  useEffect(() => {
    loadAccountInfo();
  }, []);

  /**
   * Load account information
   */
  const loadAccountInfo = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get user profile from API
      try {
        const profileResponse = await api.get('/users/profile');
        if (profileResponse.data.success) {
          const user = profileResponse.data.user;
          setEmail(user.email || '');
          setDisplayName(user.displayName || user.email || '');
          setMemberIcon(user.memberIcon || '');
          setIconColor(user.iconColor || '#6200ee');
          setProfilePhotoUrl(user.profilePhotoUrl || null);

          // Update SecureStore cache
          const userDataString = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
          if (userDataString) {
            const userData = JSON.parse(userDataString);
            userData.displayName = user.displayName;
            userData.memberIcon = user.memberIcon;
            userData.iconColor = user.iconColor;
            userData.profilePhotoUrl = user.profilePhotoUrl;
            await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
          }
        }
      } catch (err) {
        console.error('Failed to load user profile from API:', err);
        // Fallback to SecureStore cache
        const userDataString = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
        if (userDataString) {
          const userData = JSON.parse(userDataString);
          setEmail(userData.email || '');
          setDisplayName(userData.given_name || userData.displayName || userData.email || '');
          setMemberIcon(userData.memberIcon || '');
          setIconColor(userData.iconColor || '#6200ee');
          setProfilePhotoUrl(userData.profilePhotoUrl || null);
        }
      }

      // Get subscription status from API
      try {
        const response = await api.get('/subscriptions/current');
        if (response.data.success) {
          setSubscriptionStatus(response.data.subscription);
        }
      } catch (err) {
        console.error('Failed to load subscription status:', err);
        // Set default trial status on error
        setSubscriptionStatus({
          isActive: false,
          plan: 'Free Trial',
          status: 'trial',
          daysRemaining: 20,
        });
      }

      // Get invoice/bill data
      try {
        const invoiceResponse = await api.get('/subscriptions/invoice');
        setInvoice(invoiceResponse.data.invoice);
      } catch (err) {
        console.error('Failed to load invoice:', err);
        // Don't show error - invoice may not be available yet
      }

    } catch (err) {
      console.error('Load account info error:', err);
      setError('Failed to load account information');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Save account changes
   */
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // Save to backend API
      await api.put('/users/profile', { displayName, memberIcon, iconColor });

      // Update local SecureStore cache
      const userDataString = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
      if (userDataString) {
        const userData = JSON.parse(userDataString);
        userData.given_name = displayName;
        userData.memberIcon = memberIcon;
        userData.iconColor = iconColor;
        await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
      }

      CustomAlert.alert('Success', 'Your account information has been saved.');
    } catch (err) {
      console.error('Save account error:', err);
      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to save account information');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Open web admin page
   */
  const handleOpenWebAdmin = async () => {
    try {
      const webAdminUrl = 'https://familyhelperapp.com/account';
      const supported = await Linking.canOpenURL(webAdminUrl);

      if (supported) {
        await Linking.openURL(webAdminUrl);
      } else {
        CustomAlert.alert('Error', 'Cannot open web admin page');
      }
    } catch (err) {
      console.error('Open web admin error:', err);
      CustomAlert.alert('Error', 'Failed to open web admin page');
    }
  };

  /**
   * Handle profile photo upload
   */
  const handlePhotoUpload = async (file) => {
    try {
      setUploadingPhoto(true);
      setError(null);

      // Create FormData for file upload
      const formData = new FormData();

      // Handle file differently for web vs native platforms
      if (Platform.OS === 'web') {
        // On web, fetch the blob and append directly
        const response = await fetch(file.uri);
        const blob = await response.blob();
        formData.append('file', blob, file.name);
      } else {
        // On native platforms, use the React Native FormData pattern
        formData.append('file', {
          uri: file.uri,
          type: file.mimeType,
          name: file.name,
        });
      }
      formData.append('category', 'profiles');

      // Upload file to backend
      const uploadResponse = await api.post('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (uploadResponse.data.success) {
        const fileId = uploadResponse.data.file.fileId;

        // Update user profile with new photo URL
        await api.put('/users/profile', {
          displayName,
          memberIcon,
          iconColor,
          profilePhotoFileId: fileId
        });

        // Construct the full URL for the photo
        const photoUrl = `${API_BASE_URL}/files/${fileId}`;
        setProfilePhotoUrl(photoUrl);

        // Update SecureStore cache
        const userDataString = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
        if (userDataString) {
          const userData = JSON.parse(userDataString);
          userData.profilePhotoUrl = photoUrl;
          await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
        }

        CustomAlert.alert('Success', 'Profile photo uploaded successfully!');
      }
    } catch (err) {
      console.error('Photo upload error:', err);
      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to upload profile photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  /**
   * Remove profile photo
   */
  const handleRemovePhoto = async () => {
    try {
      CustomAlert.alert(
        'Remove Photo',
        'Are you sure you want to remove your profile photo?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                setUploadingPhoto(true);

                // Update profile to remove photo
                await api.put('/users/profile', {
                  displayName,
                  memberIcon,
                  iconColor,
                  profilePhotoFileId: null
                });

                setProfilePhotoUrl(null);

                // Update SecureStore cache
                const userDataString = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
                if (userDataString) {
                  const userData = JSON.parse(userDataString);
                  userData.profilePhotoUrl = null;
                  await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
                }

                CustomAlert.alert('Success', 'Profile photo removed');
              } catch (err) {
                console.error('Remove photo error:', err);
                CustomAlert.alert('Error', 'Failed to remove profile photo');
              } finally {
                setUploadingPhoto(false);
              }
            }
          }
        ]
      );
    } catch (err) {
      console.error('Remove photo error:', err);
    }
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
   * Get subscription status color
   */
  const getSubscriptionColor = () => {
    // Red for manually expired
    if (subscriptionStatus?.subscriptionManuallyExpired || subscriptionStatus?.status === 'manually_expired') {
      return '#d32f2f';
    }
    if (subscriptionStatus?.isActive) {
      // Yellow/orange for canceling, green for active
      if (subscriptionStatus?.cancelAtPeriodEnd) {
        return '#ff9800'; // Orange for canceling
      }
      return '#4caf50'; // Green for active
    }
    return '#ff9800'; // Orange for trial/inactive
  };

  /**
   * Get subscription status text
   */
  const getSubscriptionStatusText = () => {
    // Check for manually expired first
    if (subscriptionStatus?.subscriptionManuallyExpired || subscriptionStatus?.status === 'manually_expired') {
      return 'Manually Expired';
    }
    if (subscriptionStatus?.isActive) {
      // Check if subscription is scheduled for cancellation
      if (subscriptionStatus?.cancelAtPeriodEnd) {
        return 'Canceling';
      }
      return 'Active';
    }
    if (subscriptionStatus?.daysRemaining > 0) {
      return `Free Trial - ${subscriptionStatus.daysRemaining} days remaining`;
    }
    return 'No Active Subscription';
  };

  /**
   * Check if user is on free trial
   */
  const isOnFreeTrial = () => {
    return subscriptionStatus?.daysRemaining > 0 && !subscriptionStatus?.isActive;
  };

  /**
   * Check if subscription is expired
   */
  const isExpired = () => {
    return subscriptionStatus?.subscriptionManuallyExpired || subscriptionStatus?.status === 'manually_expired';
  };

  /**
   * Check if user has permanent subscription (internal/special)
   */
  const isPermanentSubscription = () => {
    return subscriptionStatus?.isPermanent === true;
  };

  /**
   * Check if regenerate bill button should be enabled
   * Only enable within 7 days of due date, or for trial users
   */
  const canRegenerateBill = () => {
    if (isOnFreeTrial()) {
      return true; // Trial users can always generate
    }
    return invoice && invoice.daysUntilDue <= 7;
  };

  /**
   * Handle regenerate bill button click
   */
  const handleRegenerateBill = async () => {
    try {
      setRegeneratingBill(true);
      setError(null);

      const response = await api.post('/subscriptions/regenerate-bill');

      // Update invoice with new data
      setInvoice(response.data.invoice);

      CustomAlert.alert('Success', 'Billing email sent! Check your inbox for the payment link.');
    } catch (err) {
      console.error('Regenerate bill failed:', err);
      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to regenerate bill. Please try again.');
    } finally {
      setRegeneratingBill(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <CustomNavigationHeader
          title="My Account"
          onBack={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6200ee" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Custom Navigation Header */}
      <CustomNavigationHeader
        title="My Account"
        onBack={() => navigation.goBack()}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {error && (
          <Card style={styles.errorCard}>
          <Card.Content>
            <Text style={styles.errorText}>{error}</Text>
          </Card.Content>
        </Card>
      )}

      {/* Profile Section */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Profile Information</Title>
          <Divider style={styles.divider} />

          <View style={styles.avatarContainer}>
            {uploadingPhoto ? (
              <View style={styles.uploadingContainer}>
                <ActivityIndicator size="large" color="#6200ee" />
                <Text style={styles.uploadingText}>Uploading...</Text>
              </View>
            ) : profilePhotoUrl ? (
              <TouchableOpacity onPress={handleRemovePhoto}>
                <Image
                  key={profilePhotoUrl}
                  source={{ uri: profilePhotoUrl }}
                  style={styles.profilePhoto}
                  resizeMode="cover"
                />
                <Text style={styles.avatarHint}>Tap to remove photo</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handleOpenColorPicker}>
                <Avatar.Text
                  size={80}
                  label={memberIcon || displayName?.[0]?.toUpperCase() || email?.[0]?.toUpperCase() || '?'}
                  style={[styles.avatar, { backgroundColor: iconColor }]}
                  color={getContrastTextColor(iconColor)}
                />
                <Text style={styles.avatarHint}>Tap to change color</Text>
              </TouchableOpacity>
            )}

            {!profilePhotoUrl && !uploadingPhoto && (
              <View style={styles.photoUploadContainer}>
                <MediaPicker
                  onSelect={handlePhotoUpload}
                  mediaType="photo"
                  maxSize={5 * 1024 * 1024}
                  profileIcon={true}
                  renderTrigger={(onPress) => (
                    <Button
                      mode="outlined"
                      onPress={onPress}
                      icon="camera"
                      style={styles.uploadPhotoButton}
                    >
                      Add Profile Photo
                    </Button>
                  )}
                />
              </View>
            )}
          </View>

          <TextInput
            label="Display Name"
            value={displayName}
            onChangeText={setDisplayName}
            mode="outlined"
            style={styles.input}
            disabled={saving}
          />

          <TextInput
            label="Member Icon (emoji or letter)"
            value={memberIcon}
            onChangeText={setMemberIcon}
            mode="outlined"
            style={styles.input}
            maxLength={2}
            placeholder="e.g., 👤 or A"
            disabled={saving}
          />

          <Text style={styles.emailLabel}>Email</Text>
          <Text style={styles.emailText}>{email}</Text>

          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={styles.saveButton}
          >
            Save Changes
          </Button>
        </Card.Content>
      </Card>

      {/* Subscription Section */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Subscription Status</Title>
          <Divider style={styles.divider} />

          <View style={[styles.statusBadge, { backgroundColor: getSubscriptionColor() }]}>
            <Text style={styles.statusText}>{getSubscriptionStatusText()}</Text>
          </View>

          <Text style={styles.subscriptionNote}>
            For full subscription management, billing history, and storage details, please visit the web admin portal.
          </Text>

          <Button
            mode="contained"
            onPress={handleOpenWebAdmin}
            style={styles.webAdminButton}
            icon="open-in-new"
          >
            Open Web Admin Portal
          </Button>
        </Card.Content>
      </Card>

      {/* Current Bill Card - Show for subscribed, trial, or expired users */}
      {invoice && (subscriptionStatus?.isSubscribed || isOnFreeTrial() || isExpired()) && (
        <Card style={styles.billCard}>
          <Card.Content>
            <View style={styles.billHeader}>
              <MaterialCommunityIcons name="receipt" size={28} color="#6200ee" />
              <Title style={styles.billTitle}>Your Current Bill</Title>
            </View>
            <Divider style={styles.divider} />

            {/* Cost Breakdown Table */}
            <View style={styles.billTable}>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Admin Subscription</Text>
                <Text style={styles.billValue}>${invoice.baseAmount} USD</Text>
              </View>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Storage Used</Text>
                <Text style={styles.billValue}>{invoice.storageUsedGb} GB</Text>
              </View>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Additional Storage ({invoice.storagePacksNeeded} × 10GB)</Text>
                <Text style={styles.billValue}>${invoice.storageCharges} USD</Text>
              </View>
              <View style={[styles.billRow, styles.billTotalRow]}>
                <Text style={styles.billTotalLabel}>TOTAL DUE</Text>
                <Text style={styles.billTotalValue}>${invoice.totalAmount} USD</Text>
              </View>
            </View>

            {/* Due Date */}
            <View style={styles.dueDateContainer}>
              <MaterialCommunityIcons
                name="calendar-clock"
                size={20}
                color={invoice.daysUntilDue <= 3 ? '#d32f2f' : invoice.daysUntilDue <= 5 ? '#f57c00' : '#666'}
              />
              <Text style={[
                styles.dueDateText,
                invoice.daysUntilDue <= 3 && styles.dueDateUrgent,
                invoice.daysUntilDue <= 5 && invoice.daysUntilDue > 3 && styles.dueDateWarning,
              ]}>
                Due: {invoice.dueDate} ({invoice.daysUntilDue} day{invoice.daysUntilDue !== 1 ? 's' : ''})
              </Text>
            </View>

            {/* Trial user note about billing date */}
            {isOnFreeTrial() && (
              <Surface style={styles.trialBillingNote}>
                <MaterialCommunityIcons name="information" size={18} color="#1565c0" />
                <Text style={styles.trialBillingNoteText}>
                  Your first billing date is at the end of your 20-day trial. If you subscribe during your trial the first subscription period will be one month + the days left on your trial.
                </Text>
              </Surface>
            )}

            {/* Generate/Regenerate Bill Email Button - disabled for permanent subscriptions */}
            {!isPermanentSubscription() && (
              <View style={styles.billActions}>
                <Button
                  mode="outlined"
                  onPress={handleRegenerateBill}
                  loading={regeneratingBill}
                  disabled={regeneratingBill || !canRegenerateBill()}
                  style={[styles.generateBillButton, !canRegenerateBill() && styles.buttonDisabled]}
                  textColor="#6200ee"
                  icon="email-outline"
                >
                  {invoice.lastBillingEmailSent ? 'Regenerate Bill Email' : 'Generate Bill Email'}
                </Button>
              </View>
            )}

            {!isPermanentSubscription() && !canRegenerateBill() && !isOnFreeTrial() && (
              <Text style={styles.billNote}>
                You can generate a billing email within 7 days of your due date.
              </Text>
            )}

            {!isPermanentSubscription() && (
              <Text style={styles.paymentNote}>
                To pay your bill, click the payment link in the billing email we send you.
              </Text>
            )}
          </Card.Content>
        </Card>
      )}

      {/* Personal Registries Section */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Personal Registries</Title>
          <Divider style={styles.divider} />
          <Text style={styles.registriesNote}>
            Manage your personal gift and item registries. You can link these to groups or share them externally.
          </Text>

          <Button
            mode="contained"
            onPress={() => navigation.navigate('PersonalGiftRegistries')}
            style={styles.registryButton}
            icon="gift"
          >
            My Gift Registries
          </Button>

          <Button
            mode="contained"
            onPress={() => navigation.navigate('PersonalItemRegistries')}
            style={styles.registryButton}
            icon="package-variant"
          >
            My Item Registries
          </Button>
        </Card.Content>
      </Card>

      {/* Features Note */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Web Admin Features</Title>
          <Divider style={styles.divider} />
          <Text style={styles.featureText}>• Manage subscription and payment methods</Text>
          <Text style={styles.featureText}>• View billing history</Text>
          <Text style={styles.featureText}>• Track storage usage</Text>
          <Text style={styles.featureText}>• Export audit logs</Text>
          <Text style={styles.featureText}>• Advanced account settings</Text>
        </Card.Content>
      </Card>

      {/* Color Picker Modal */}
      <ColorPickerModal
        visible={colorPickerVisible}
        initialColor={iconColor}
        onConfirm={handleColorConfirm}
        onCancel={handleColorCancel}
      />
      </ScrollView>
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
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorCard: {
    marginBottom: 16,
    backgroundColor: '#ffebee',
  },
  errorText: {
    color: '#d32f2f',
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  divider: {
    marginVertical: 12,
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
  profilePhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#6200ee',
  },
  photoUploadContainer: {
    marginTop: 12,
    width: '100%',
  },
  uploadPhotoButton: {
    borderColor: '#6200ee',
  },
  uploadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  uploadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  input: {
    marginBottom: 12,
  },
  emailLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    marginTop: 8,
  },
  emailText: {
    fontSize: 16,
    marginBottom: 16,
  },
  saveButton: {
    marginTop: 8,
    backgroundColor: '#6200ee',
  },
  statusBadge: {
    padding: 12,
    borderRadius: 8,
    marginVertical: 12,
    alignItems: 'center',
  },
  statusText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  subscriptionNote: {
    fontSize: 14,
    color: '#666',
    marginVertical: 12,
    lineHeight: 20,
  },
  webAdminButton: {
    marginTop: 8,
    backgroundColor: '#03dac6',
  },
  registriesNote: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  registryButton: {
    marginTop: 8,
    backgroundColor: '#6200ee',
  },
  featureText: {
    fontSize: 14,
    color: '#333',
    marginVertical: 4,
    lineHeight: 20,
  },
  // Bill Card Styles
  billCard: {
    marginBottom: 16,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#6200ee',
  },
  billHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  billTitle: {
    marginLeft: 12,
    fontSize: 20,
  },
  billTable: {
    marginVertical: 12,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  billLabel: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  billValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  billTotalRow: {
    borderBottomWidth: 0,
    borderTopWidth: 2,
    borderTopColor: '#6200ee',
    marginTop: 8,
    paddingTop: 12,
  },
  billTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  billTotalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6200ee',
  },
  dueDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  dueDateText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  dueDateUrgent: {
    color: '#d32f2f',
    fontWeight: 'bold',
  },
  dueDateWarning: {
    color: '#f57c00',
    fontWeight: '500',
  },
  trialBillingNote: {
    flexDirection: 'row',
    padding: 12,
    marginTop: 12,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    elevation: 0,
  },
  trialBillingNoteText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: '#1565c0',
    lineHeight: 18,
  },
  billActions: {
    marginTop: 16,
  },
  generateBillButton: {
    borderColor: '#6200ee',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  billNote: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  paymentNote: {
    marginTop: 12,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
});
