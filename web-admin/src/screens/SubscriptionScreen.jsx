/**
 * Subscription Screen
 *
 * Admin-only screen for managing subscription and billing.
 * React Native Paper version for web-admin.
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Linking } from 'react-native';
import {
  Text,
  Button,
  Card,
  Title,
  Paragraph,
  Surface,
  ActivityIndicator,
  Divider,
  Chip,
  Portal,
  Dialog,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../services/api';

export default function SubscriptionScreen({ navigation }) {
  const [pricing, setPricing] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [canceling, setCanceling] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showReactivateDialog, setShowReactivateDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [regeneratingBill, setRegeneratingBill] = useState(false);

  useEffect(() => {
    fetchData();
    checkUrlParams();
  }, []);

  /**
   * Check URL parameters for success/canceled messages
   */
  function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
      setSuccessMessage('Subscription successful! Your admin access is now active.');
      // Clean up URL
      window.history.replaceState({}, '', '/subscription');
    }
    if (urlParams.get('canceled') === 'true') {
      setInfoMessage('Checkout canceled. You can subscribe anytime.');
      // Clean up URL
      window.history.replaceState({}, '', '/subscription');
    }
  }

  /**
   * Fetch both pricing and subscription data
   */
  async function fetchData() {
    await Promise.all([fetchPricing(), fetchSubscription(), fetchInvoice()]);
  }

  /**
   * Fetch pricing information from backend
   */
  async function fetchPricing() {
    try {
      setLoading(true);
      const response = await api.get('/subscriptions/pricing');
      setPricing(response.data.pricing);
    } catch (err) {
      console.error('Failed to fetch pricing:', err);
      setError('Failed to load pricing information. Please try again later.');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Fetch current subscription status
   */
  async function fetchSubscription() {
    try {
      const response = await api.get('/subscriptions/current');
      setSubscription(response.data.subscription);
    } catch (err) {
      console.error('Failed to fetch subscription:', err);
      // Don't show error if user just doesn't have a subscription
      if (err.response?.status !== 404) {
        setError('Failed to load subscription information.');
      }
    }
  }

  /**
   * Fetch current invoice/bill breakdown
   */
  async function fetchInvoice() {
    try {
      const response = await api.get('/subscriptions/invoice');
      setInvoice(response.data.invoice);
    } catch (err) {
      console.error('Failed to fetch invoice:', err);
      // Don't show error - invoice may not be available yet
    }
  }

  /**
   * Check if regenerate bill button should be enabled
   * - Trial users: can regenerate anytime
   * - Subscribed users: only within 7 days of due date
   * @returns {boolean} True if button should be enabled
   */
  function canRegenerateBill() {
    if (isOnFreeTrial()) {
      return true; // Trial users can always regenerate
    }
    // Subscribed users: only within 7 days
    return invoice && invoice.daysUntilDue <= 7;
  }

  /**
   * Handle regenerate bill button click
   */
  async function handleRegenerateBill() {
    try {
      setRegeneratingBill(true);
      setError(null);

      const response = await api.post('/subscriptions/regenerate-bill');

      // Update invoice with new data
      setInvoice(response.data.invoice);

      setSuccessMessage('Billing email sent! Check your inbox for the payment link.');
    } catch (err) {
      console.error('Regenerate bill failed:', err);
      setError(err.response?.data?.message || 'Failed to regenerate bill. Please try again.');
    } finally {
      setRegeneratingBill(false);
    }
  }

  /**
   * Handle subscription cancellation
   */
  async function handleCancel() {
    setShowCancelDialog(false);

    try {
      setCanceling(true);
      setError(null);

      const response = await api.post('/subscriptions/cancel');

      // Refresh subscription data
      await fetchSubscription();

      setSuccessMessage(`Subscription canceled. Access will continue until ${formatDate(response.data.cancelAt)}`);
    } catch (err) {
      console.error('Cancellation failed:', err);
      setError(err.response?.data?.message || 'Failed to cancel subscription. Please try again.');
    } finally {
      setCanceling(false);
    }
  }

  /**
   * Handle subscription reactivation
   */
  async function handleReactivate() {
    setShowReactivateDialog(false);

    try {
      setReactivating(true);
      setError(null);

      await api.post('/subscriptions/reactivate');

      // Refresh subscription data
      await fetchSubscription();

      setSuccessMessage('Subscription reactivated successfully!');
    } catch (err) {
      console.error('Reactivation failed:', err);
      setError(err.response?.data?.message || 'Failed to reactivate subscription. Please try again.');
    } finally {
      setReactivating(false);
    }
  }

  /**
   * Format price for display
   * @param {number} amount - Amount in cents
   * @param {string} currency - Currency code
   * @returns {string} Formatted price with currency prefix
   */
  function formatPrice(amount, currency) {
    const currencyCode = currency?.toUpperCase() || 'USD';
    // Use en-US locale for USD to get "$" symbol, otherwise use appropriate locale
    const locale = currencyCode === 'USD' ? 'en-US' : 'en-AU';
    const formattedAmount = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
    }).format(amount / 100);

    // Append currency code for clarity (e.g., "$3.00 USD")
    return `${formattedAmount} ${currencyCode}`;
  }

  /**
   * Format date for display
   * @param {string} dateString - ISO date string
   * @returns {string} Formatted date
   */
  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Check if user is on free trial
   * @returns {boolean} True if on trial, false otherwise
   */
  function isOnFreeTrial() {
    if (!subscription || subscription.isSubscribed) return false;

    // If subscription was manually expired (endDate in the past), not on trial
    if (subscription.endDate && new Date(subscription.endDate) < new Date()) {
      return false;
    }

    const now = new Date();
    const createdAt = new Date(subscription.createdAt);
    const trialEndDate = new Date(createdAt);
    trialEndDate.setDate(trialEndDate.getDate() + 20);

    return now < trialEndDate;
  }

  /**
   * Get trial end date
   * @returns {Date|null} Trial end date or null
   */
  function getTrialEndDate() {
    if (!subscription || !subscription.createdAt) return null;

    const createdAt = new Date(subscription.createdAt);
    const trialEndDate = new Date(createdAt);
    trialEndDate.setDate(trialEndDate.getDate() + 20);

    return trialEndDate;
  }

  /**
   * Check if user has a permanent subscription (support users, etc.)
   * @returns {boolean} True if permanent subscription
   */
  function isPermanentSubscription() {
    return subscription?.isPermanent === true;
  }

  /**
   * Check if subscription is expired (manually or endDate in past)
   * @returns {boolean} True if expired
   */
  function isExpired() {
    // Check explicit flag
    if (subscription?.subscriptionManuallyExpired === true || subscription?.status === 'manually_expired') {
      return true;
    }
    // Check if endDate is in the past (and not currently subscribed)
    if (!subscription?.isSubscribed && subscription?.endDate && new Date(subscription.endDate) < new Date()) {
      return true;
    }
    return false;
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading pricing information...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Title style={styles.pageTitle}>Subscription Management</Title>

        {/* Error Alert */}
        {error && (
          <Surface style={styles.alertError}>
            <Text style={styles.alertErrorText}>{error}</Text>
            <Button compact onPress={() => setError(null)}>Dismiss</Button>
          </Surface>
        )}

        {/* Success Alert */}
        {successMessage && (
          <Surface style={styles.alertSuccess}>
            <Text style={styles.alertSuccessText}>{successMessage}</Text>
            <Button compact onPress={() => setSuccessMessage(null)}>Dismiss</Button>
          </Surface>
        )}

        {/* Info Alert */}
        {infoMessage && (
          <Surface style={styles.alertInfo}>
            <Text style={styles.alertInfoText}>{infoMessage}</Text>
            <Button compact onPress={() => setInfoMessage(null)}>Dismiss</Button>
          </Surface>
        )}

        {/* Pricing Cards */}
        {pricing && (
          <View style={styles.pricingGrid}>
            {/* Admin Subscription Card */}
            <Card style={[styles.pricingCard, styles.primaryCard]}>
              <Card.Content>
                <Title style={styles.cardTitle}>{pricing.adminSubscription.name}</Title>
                <View style={styles.priceRow}>
                  <Text style={styles.price}>
                    {formatPrice(pricing.adminSubscription.amount, pricing.adminSubscription.currency)}
                  </Text>
                  <Text style={styles.interval}>/{pricing.adminSubscription.interval}</Text>
                </View>
                <Paragraph style={styles.cardDescription}>
                  {pricing.adminSubscription.description}
                </Paragraph>

                <View style={styles.features}>
                  <View style={styles.featureRow}>
                    <MaterialCommunityIcons name="check-circle" size={20} color="#4caf50" />
                    <Text style={styles.featureText}>Full admin access</Text>
                  </View>
                  <View style={styles.featureRow}>
                    <MaterialCommunityIcons name="check-circle" size={20} color="#4caf50" />
                    <Text style={styles.featureText}>10GB storage included</Text>
                  </View>
                  <View style={styles.featureRow}>
                    <MaterialCommunityIcons name="check-circle" size={20} color="#4caf50" />
                    <Text style={styles.featureText}>Unlimited groups</Text>
                  </View>
                  <View style={styles.featureRow}>
                    <MaterialCommunityIcons name="check-circle" size={20} color="#4caf50" />
                    <Text style={styles.featureText}>Audit log exports</Text>
                  </View>
                </View>
              </Card.Content>
            </Card>

            {/* Additional Storage Card */}
            <Card style={styles.pricingCard}>
              <Card.Content>
                <Title style={styles.cardTitle}>{pricing.additionalStorage.name}</Title>
                <View style={styles.priceRow}>
                  <Text style={styles.price}>
                    {formatPrice(pricing.additionalStorage.amount, pricing.additionalStorage.currency)}
                  </Text>
                  <Text style={styles.interval}>per {pricing.additionalStorage.unit}/{pricing.additionalStorage.interval}</Text>
                </View>
                <Paragraph style={styles.cardDescription}>
                  {pricing.additionalStorage.description}
                </Paragraph>

                <View style={styles.features}>
                  <View style={styles.featureRow}>
                    <MaterialCommunityIcons name="check-circle" size={20} color="#4caf50" />
                    <Text style={styles.featureText}>Charged in 10GB blocks</Text>
                  </View>
                  <View style={styles.featureRow}>
                    <MaterialCommunityIcons name="check-circle" size={20} color="#4caf50" />
                    <Text style={styles.featureText}>Automatic billing as needed</Text>
                  </View>
                  <View style={styles.featureRow}>
                    <MaterialCommunityIcons name="check-circle" size={20} color="#4caf50" />
                    <Text style={styles.featureText}>No storage limits</Text>
                  </View>
                </View>
                <Paragraph style={styles.cardNote}>
                  Only for admins. Billed per 10GB chunk when you exceed your base 10GB allocation.
                </Paragraph>
              </Card.Content>
            </Card>
          </View>
        )}

        {/* Current Bill Card - Show when invoice available and subscribed or on trial */}
        {invoice && (subscription?.isSubscribed || isOnFreeTrial()) && (
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
                    labelStyle={styles.generateBillButtonLabel}
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

              {/* Warning about non-payment - hidden for permanent subscriptions */}
              {!isPermanentSubscription() && (
                <Surface style={styles.billWarning}>
                  <MaterialCommunityIcons name="alert" size={20} color="#d32f2f" />
                  <View style={styles.billWarningContent}>
                    <Text style={styles.billWarningTitle}>If not paid by {invoice.dueDate}:</Text>
                    <Text style={styles.billWarningText}>• Groups where you're the only admin will become read-only for everyone</Text>
                    <Text style={styles.billWarningText}>• Groups with other admins: you'll lose admin access</Text>
                  </View>
                </Surface>
              )}
            </Card.Content>
          </Card>
        )}

        {/* Current Subscription Status */}
        {(subscription?.isSubscribed || isOnFreeTrial() || isExpired()) && (
          <Card style={styles.statusCard}>
            <Card.Content>
              <Title>Current Subscription</Title>
              <Divider style={styles.divider} />

              <View style={styles.statusGrid}>
                <View style={styles.statusColumn}>
                  <Text style={styles.statusLabel}>Status</Text>
                  <Chip
                    style={[
                      styles.statusChip,
                      isExpired() ? styles.chipError :
                      isOnFreeTrial() ? styles.chipInfo :
                      styles.chipSuccess
                    ]}
                    textStyle={styles.chipText}
                  >
                    {isExpired() ? 'Expired' :
                     isOnFreeTrial() ? 'Free Trial' :
                     'Active'}
                  </Chip>

                  <Text style={styles.statusLabel}>Subscription Started</Text>
                  <Text style={styles.statusValue}>{formatDate(subscription.startDate)}</Text>

                  {/* Show subscription/trial end date */}
                  <Text style={styles.statusLabel}>
                    {isOnFreeTrial() ? 'Trial Ends' : 'Subscription Ends'}
                  </Text>
                  <Text style={styles.statusValue}>
                    {isOnFreeTrial()
                      ? formatDate(getTrialEndDate())
                      : formatDate(subscription.endDate || subscription.renewalDate)}
                  </Text>
                </View>

                <View style={styles.statusColumn}>
                  <Text style={styles.statusLabel}>Storage Used</Text>
                  <Text style={styles.statusValue}>{subscription.storageUsedGb || '0.00'} GB</Text>

                  {/* Show storage charges for all users over 10GB */}
                  {parseFloat(subscription.storageUsedGb || 0) > 10 && (
                    <>
                      <Text style={styles.statusLabel}>Additional Storage Charges</Text>
                      <Text style={styles.statusValue}>
                        {Math.ceil((parseFloat(subscription.storageUsedGb) - 10) / 10)} × $1.00 USD/month
                      </Text>
                      <Text style={styles.storageNote}>
                        ({(parseFloat(subscription.storageUsedGb) - 10).toFixed(2)} GB over base 10GB - billed in 10GB chunks)
                      </Text>
                    </>
                  )}
                </View>
              </View>

            </Card.Content>
          </Card>
        )}

        {/* No Subscription Message */}
        {!subscription?.isSubscribed && !isOnFreeTrial() && !isExpired() && !loading && (
          <Card style={styles.statusCard}>
            <Card.Content>
              <Title>Current Subscription</Title>
              <Divider style={styles.divider} />
              <Paragraph style={styles.noSubText}>
                You don't have an active subscription. Subscribe above to access admin features.
              </Paragraph>
            </Card.Content>
          </Card>
        )}
      </View>

      {/* Cancel Dialog */}
      <Portal>
        <Dialog visible={showCancelDialog} onDismiss={() => setShowCancelDialog(false)}>
          <Dialog.Title>Cancel Subscription?</Dialog.Title>
          <Dialog.Content>
            <Paragraph>
              Are you sure you want to cancel your subscription? Access will continue until the end of your current billing period.
            </Paragraph>
            <Surface style={styles.dialogInfoBox}>
              <Text style={styles.dialogInfoTitle}>What happens to your groups:</Text>
              <View style={styles.dialogInfoRow}>
                <MaterialCommunityIcons name="account-group" size={18} color="#1976d2" />
                <Text style={styles.dialogInfoText}>
                  <Text style={styles.dialogInfoBold}>Groups where you're the only admin:</Text> All members get 30 days of read-only access. After 30 days, the group is archived.
                </Text>
              </View>
              <View style={styles.dialogInfoRow}>
                <MaterialCommunityIcons name="account-switch" size={18} color="#1976d2" />
                <Text style={styles.dialogInfoText}>
                  <Text style={styles.dialogInfoBold}>Groups with other admins:</Text> Your role changes to "Adult" and you lose admin privileges. Other admins continue managing the group.
                </Text>
              </View>
            </Surface>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowCancelDialog(false)}>No, Keep It</Button>
            <Button onPress={handleCancel} textColor="#d32f2f">Yes, Cancel</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Reactivate Dialog */}
      <Portal>
        <Dialog visible={showReactivateDialog} onDismiss={() => setShowReactivateDialog(false)}>
          <Dialog.Title>Reactivate Subscription?</Dialog.Title>
          <Dialog.Content>
            <Paragraph>
              Reactivate your subscription? Your access will continue without interruption.
            </Paragraph>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowReactivateDialog(false)}>Cancel</Button>
            <Button onPress={handleReactivate} textColor="#4caf50">Reactivate</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 24,
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#666',
  },
  pageTitle: {
    fontSize: 28,
    marginBottom: 24,
  },
  // Alert styles
  alertError: {
    backgroundColor: '#ffebee',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertErrorText: {
    color: '#c62828',
    flex: 1,
  },
  alertSuccess: {
    backgroundColor: '#e8f5e9',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertSuccessText: {
    color: '#2e7d32',
    flex: 1,
  },
  alertInfo: {
    backgroundColor: '#e3f2fd',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertInfoText: {
    color: '#1565c0',
    flex: 1,
  },
  alertWarning: {
    backgroundColor: '#fff3e0',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  alertWarningText: {
    color: '#e65100',
  },
  // Pricing cards
  pricingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
    marginBottom: 24,
  },
  pricingCard: {
    flex: 1,
    minWidth: 300,
    margin: 8,
  },
  primaryCard: {
    borderWidth: 2,
    borderColor: '#1976d2',
  },
  cardTitle: {
    fontSize: 22,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  price: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1976d2',
  },
  interval: {
    fontSize: 16,
    color: '#666',
  },
  cardDescription: {
    color: '#666',
    marginBottom: 16,
  },
  features: {
    marginTop: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureText: {
    marginLeft: 8,
    fontSize: 14,
  },
  cardActions: {
    padding: 16,
    justifyContent: 'center',
  },
  activeChip: {
    backgroundColor: '#e8f5e9',
  },
  activeChipText: {
    color: '#2e7d32',
  },
  // Status card
  statusCard: {
    marginBottom: 24,
  },
  divider: {
    marginVertical: 16,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statusColumn: {
    flex: 1,
    minWidth: 200,
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 12,
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 16,
  },
  statusChip: {
    alignSelf: 'flex-start',
  },
  chipSuccess: {
    backgroundColor: '#e8f5e9',
  },
  chipWarning: {
    backgroundColor: '#fff3e0',
  },
  chipInfo: {
    backgroundColor: '#e3f2fd',
  },
  chipError: {
    backgroundColor: '#ffebee',
  },
  chipText: {
    fontSize: 12,
  },
  storageNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  actionSection: {
    marginTop: 8,
  },
  cancelButton: {
    borderColor: '#d32f2f',
    alignSelf: 'flex-start',
  },
  reactivateButton: {
    borderColor: '#4caf50',
    alignSelf: 'flex-start',
  },
  actionNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  noSubText: {
    color: '#666',
  },
  cardNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  // Dialog info box
  dialogInfoBox: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  dialogInfoTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 12,
    color: '#1565c0',
  },
  dialogInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  dialogInfoText: {
    fontSize: 13,
    color: '#333',
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
  dialogInfoBold: {
    fontWeight: 'bold',
  },
  // Info card
  infoCard: {
    marginBottom: 24,
    backgroundColor: '#fafafa',
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoCardTitle: {
    fontSize: 18,
    marginLeft: 8,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  infoItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoItemTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 4,
  },
  infoItemText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  // Bill card styles
  billCard: {
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#6200ee',
  },
  billHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  billTitle: {
    fontSize: 20,
    marginLeft: 12,
    color: '#333',
  },
  billTable: {
    marginBottom: 16,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  billLabel: {
    fontSize: 14,
    color: '#666',
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
    marginBottom: 20,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  dueDateText: {
    fontSize: 15,
    marginLeft: 8,
    color: '#666',
  },
  dueDateWarning: {
    color: '#f57c00',
    fontWeight: '600',
  },
  dueDateUrgent: {
    color: '#d32f2f',
    fontWeight: 'bold',
  },
  billActions: {
    marginBottom: 12,
  },
  generateBillButton: {
    borderColor: '#6200ee',
  },
  generateBillButtonLabel: {
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  billNote: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  paymentNote: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  trialBillingNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  trialBillingNoteText: {
    fontSize: 13,
    color: '#1565c0',
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
  billWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  billWarningContent: {
    flex: 1,
    marginLeft: 12,
  },
  billWarningTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 4,
  },
  billWarningText: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
});
