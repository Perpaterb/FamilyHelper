/**
 * Landing Screen
 *
 * Public landing page showcasing app features and pricing.
 * React Native version of the old Landing.jsx
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Text,
  Button,
  Card,
  Title,
  Paragraph,
  Surface,
  ActivityIndicator,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import api from '../services/api';

export default function LandingScreen({ navigation }) {
  const { login, register, isAuthenticated, isLoading } = useKindeAuth();
  const [pricing, setPricing] = useState(null);
  const [pricingLoading, setPricingLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigation.navigate('Groups');
    }
  }, [isAuthenticated, isLoading, navigation]);

  useEffect(() => {
    fetchPricing();
  }, []);

  async function fetchPricing() {
    try {
      const response = await api.get('/subscriptions/pricing');
      setPricing(response.data.pricing);
    } catch (err) {
      console.error('Failed to fetch pricing:', err);
    } finally {
      setPricingLoading(false);
    }
  }

  function formatPrice(amount, currency) {
    const currencyCode = currency?.toUpperCase() || 'USD';
    // Use en-US locale for USD to get "$" symbol, otherwise use appropriate locale
    const locale = currencyCode === 'USD' ? 'en-US' : 'en-AU';
    const formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
    }).format(amount / 100);
    // Append currency code for clarity (e.g., "$3.00 USD")
    return `${formatted} ${currencyCode}`;
  }

  const features = [
    { icon: '🔒', title: 'Secure & Encrypted Messaging', description: 'End-to-end encrypted group messaging with media sharing, mentions, and read receipts.' },
    { icon: '🎙️', title: 'Audio Messages', description: 'Record and send voice messages. All audio is encrypted and stored securely.' },
    { icon: '📞', title: 'Phone Calls', description: 'Make voice calls with group members. All phone call recordings are encrypted and stored securely. Option to not record by default if desired.' },
    { icon: '👋', title: 'Video Calls', description: 'Make video calls with group members. All video call recordings are encrypted and stored securely. Option to not record by default if desired.' },
    { icon: '📅', title: 'Shared Calendar', description: 'Coordinate schedules with events, child responsibilities, and handoff tracking.' },
    { icon: '💰', title: 'Finance Tracking', description: 'Track shared expenses, balances, and financial communications.' },
    { icon: '🎁', title: 'Gift Registry', description: 'Manage wish lists and gift registries for birthdays and holidays.' },
    { icon: '🎅', title: 'Secret Santa', description: 'Organize gift exchanges with automatic matching and anonymous wishlists.' },
    { icon: '📖', title: 'Wiki Documents', description: 'Create and share important documents with rich text editing.' },
    { icon: '📁', title: 'Secure Storage', description: 'Upload and manage important documents securely.' },
    { icon: '📜', title: 'Audit Logs', description: 'Complete history of all actions for accountability, legal compliance, and court order adherence.' },
  ];

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <div style={{ height: '100vh', overflowY: 'auto', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Family Helper</Text>
        <View style={styles.headerButtons}>
          <Button mode="text" onPress={() => navigation.navigate('Updates')} labelStyle={styles.headerButtonLabel}>Updates</Button>
          <Button mode="text" onPress={() => login()} labelStyle={styles.headerButtonLabel} style={styles.headerButtonSpacing}>Login</Button>
          <Button mode="contained" onPress={() => register()} labelStyle={styles.headerButtonLabel} style={styles.headerButtonSpacing}>Sign Up</Button>
        </View>
      </View>

      {/* Hero Section */}
      <Surface style={styles.hero}>
        <Title style={styles.heroTitle}>
          Co-Parenting & Family Management Made Easy
        </Title>
        <Paragraph style={styles.heroSubtitle}>
          All-in-one family and co-parenting app. Coordinate schedules, share expenses,
          and communicate securely with only the people you need and want to.
        </Paragraph>
        <Button
          mode="contained"
          onPress={() => register()}
          style={styles.ctaButton}
          labelStyle={styles.ctaButtonLabel}
        >
          Start Free 20-Day Trial
        </Button>
        <Text style={styles.noCreditCard}>No credit card required</Text>
        <Text style={styles.privacyNote}>Completely ad-free and we will never sell or give any data away</Text>
        <div className="store-buttons-container">
          <a
            href="https://play.google.com/store"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
          >
            <View style={styles.storeButton}>
              <MaterialCommunityIcons name="google-play" size={24} color="#fff" />
              <View style={styles.storeButtonTextContainer}>
                <Text style={styles.storeButtonSmallText}>Get it on</Text>
                <Text style={styles.storeButtonText}>Google Play</Text>
              </View>
            </View>
          </a>
          <a
            href="https://apps.apple.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
          >
            <View style={styles.storeButton}>
              <MaterialCommunityIcons name="apple" size={24} color="#fff" />
              <View style={styles.storeButtonTextContainer}>
                <Text style={styles.storeButtonSmallText}>Download on the</Text>
                <Text style={styles.storeButtonText}>App Store</Text>
              </View>
            </View>
          </a>
          <div onClick={() => login()} style={{ cursor: 'pointer' }}>
            <View style={styles.storeButton}>
              <MaterialCommunityIcons name="web" size={24} color="#fff" />
              <View style={styles.storeButtonTextContainer}>
                <Text style={styles.storeButtonSmallText}>Login for full web app</Text>
                <Text style={styles.storeButtonText}>Audit Logs, Storage & Subscriptions</Text>
              </View>
            </View>
          </div>
        </div>
        <style>{`
          .store-buttons-container {
            display: flex;
            flex-direction: row;
            flex-wrap: wrap;
            justify-content: center;
            gap: 16px;
            margin-top: 20px;
          }
          @media (max-width: 768px) {
            .store-buttons-container {
              flex-direction: column;
              align-items: center;
            }
          }
        `}</style>
      </Surface>

      {/* Features Section */}
      <View style={styles.section}>
        <Title style={styles.sectionTitle}>Everything You Need</Title>
        <View style={styles.featuresGrid}>
          {features.map((feature, index) => (
            <Card key={index} style={styles.featureCard}>
              <Card.Content style={styles.featureContent}>
                <Text style={styles.featureIcon}>{feature.icon}</Text>
                <Title style={styles.featureTitle}>{feature.title}</Title>
                <Paragraph style={styles.featureDescription}>{feature.description}</Paragraph>
              </Card.Content>
            </Card>
          ))}
        </View>
      </View>

      {/* Pricing Section */}
      <Surface style={styles.pricingSection}>
        <Title style={styles.sectionTitle}>Simple, Transparent Pricing</Title>

        {pricingLoading ? (
          <ActivityIndicator />
        ) : pricing ? (
          <View style={styles.pricingGrid}>
            {/* Free Members Card */}
            <Card style={styles.pricingCard}>
              <Card.Content>
                <Title style={styles.pricingTitle}>Group Members</Title>
                <Text style={styles.priceAmount}>Free</Text>
                <Text style={styles.priceInterval}>forever</Text>
                <View style={styles.featureList}>
                  {['Parents', 'Adults', 'Children', 'Caregivers', 'Supervisors'].map((item, i) => (
                    <View key={i} style={styles.featureRow}>
                      <MaterialCommunityIcons name="check-circle" size={20} color="#4caf50" />
                      <Text style={styles.featureText}>{item}</Text>
                    </View>
                  ))}
                </View>
                <Paragraph style={styles.pricingNote}>
                  All features included when invited to a group
                </Paragraph>
              </Card.Content>
            </Card>

            {/* Admin Subscription Card */}
            <Card style={[styles.pricingCard, styles.highlightedCard]}>
              <Card.Content>
                <Title style={styles.pricingTitle}>{pricing.adminSubscription.name}</Title>
                <Text style={styles.priceAmount}>
                  {formatPrice(pricing.adminSubscription.amount, pricing.adminSubscription.currency)}
                </Text>
                <Text style={styles.priceInterval}>per {pricing.adminSubscription.interval}</Text>
                <View style={styles.featureList}>
                  {['Full admin access', '10GB storage included', 'Unlimited groups', 'Audit log exports'].map((item, i) => (
                    <View key={i} style={styles.featureRow}>
                      <MaterialCommunityIcons name="check-circle" size={20} color="#4caf50" />
                      <Text style={styles.featureText}>{item}</Text>
                    </View>
                  ))}
                </View>
                <Button mode="contained" onPress={() => register()} style={styles.pricingButton}>
                  Start Free Trial
                </Button>
                <Paragraph style={styles.pricingNote}>Minimum 1 admin per group</Paragraph>
              </Card.Content>
            </Card>

            {/* Additional Storage Card */}
            <Card style={styles.pricingCard}>
              <Card.Content>
                <Title style={styles.pricingTitle}>{pricing.additionalStorage.name}</Title>
                <Text style={styles.priceAmount}>
                  {formatPrice(pricing.additionalStorage.amount, pricing.additionalStorage.currency)}
                </Text>
                <Text style={styles.priceInterval}>per {pricing.additionalStorage.unit} / {pricing.additionalStorage.interval}</Text>
                <View style={styles.featureList}>
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
                <Paragraph style={styles.pricingNote}>
                  Only for admins. Billed per 10GB chunk when you exceed your base 10GB allocation.
                </Paragraph>
              </Card.Content>
            </Card>
          </View>
        ) : (
          <Text style={styles.errorText}>Unable to load pricing information.</Text>
        )}
      </Surface>

      {/* CTA Section */}
      <View style={styles.ctaSection}>
        <Title style={styles.ctaSectionTitle}>Ready to Get Started?</Title>
        <Paragraph style={styles.ctaSectionText}>
          Join families who are already using Family Helper to stay organized and connected.
        </Paragraph>
        <Button mode="contained" onPress={() => register()} style={styles.ctaButton}>
          Create Your Account
        </Button>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          © {new Date().getFullYear()} Family Helper. All rights reserved.
        </Text>
      </View>
      <View style={{ height: 40 }} />
    </div>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  logo: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1976d2',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButtonLabel: {
    fontSize: 16,
  },
  headerButtonSpacing: {
    marginLeft: 8,
  },
  hero: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#1976d2',
  },
  heroTitle: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 58,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    opacity: 0.9,
    marginBottom: 24,
    maxWidth: 600,
  },
  ctaButton: {
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  ctaButtonLabel: {
    fontSize: 16,
  },
  noCreditCard: {
    color: '#fff',
    opacity: 0.8,
    marginTop: 8,
  },
  privacyNote: {
    color: '#fff',
    opacity: 0.7,
    marginTop: 4,
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 400,
  },
  storeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    minWidth: 200,
  },
  storeButtonTextContainer: {
    marginLeft: 10,
    flexShrink: 0,
  },
  storeButtonSmallText: {
    color: '#fff',
    fontSize: 10,
    opacity: 0.9,
  },
  storeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  section: {
    padding: 32,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
  },
  featureCard: {
    width: 280,
    margin: 8,
  },
  featureContent: {
    alignItems: 'center',
    padding: 16,
  },
  featureIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  featureDescription: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
  },
  pricingSection: {
    padding: 32,
    backgroundColor: '#fff',
  },
  pricingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
  },
  pricingCard: {
    width: 320,
    margin: 8,
  },
  highlightedCard: {
    borderWidth: 2,
    borderColor: '#1976d2',
  },
  pricingTitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  priceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#1976d2',
  },
  priceInterval: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    marginBottom: 16,
  },
  featureList: {
    marginBottom: 16,
  },
  featureItem: {
    fontSize: 14,
    marginBottom: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureText: {
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  pricingButton: {
    marginBottom: 8,
  },
  pricingNote: {
    fontSize: 12,
    textAlign: 'center',
    color: '#666',
  },
  ctaSection: {
    padding: 32,
    alignItems: 'center',
  },
  ctaSectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  ctaSectionText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  footer: {
    padding: 24,
    backgroundColor: '#333',
    alignItems: 'center',
  },
  footerText: {
    color: '#fff',
  },
  errorText: {
    textAlign: 'center',
    color: '#666',
  },
});
