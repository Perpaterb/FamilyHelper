/**
 * Updates & Coming Soon Screen
 *
 * Public page showing version info, upcoming features, known issues, and recent bug fixes.
 * Accessible without login from landing page.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Text,
  Button,
  Card,
  Title,
  Paragraph,
  Surface,
  Chip,
  Divider,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function UpdatesScreen({ navigation }) {
  const APP_VERSION = '1.0.100';
  const LAST_UPDATED = 'January 3, 2025';

  const comingSoon = [
    {
      icon: 'calendar-import',
      title: 'Calendar Import & Export',
      description: 'Import events from Google Calendar, Apple Calendar, and Outlook. Export your Family Helper calendar to other apps.',
      status: 'In Development',
    },
    {
      icon: 'image-multiple',
      title: 'Group Photo Albums',
      description: 'Create shared photo albums within your groups. Organize memories by events, dates, or custom albums.',
      status: 'Planned',
    },
  ];

  const knownIssues = [
    {
      id: 'BUG-001',
      title: 'Calendar Day View Movement',
      description: 'Some users experience issues with dragging events in the calendar day view.',
      severity: 'medium',
    },
  ];

  const recentFixes = [
    {
      date: 'Jan 3, 2025',
      title: 'Mobile App Bill Section',
      description: 'Added current bill section to mobile app My Account screen. View cost breakdown, due date, and generate billing emails directly from the app.',
    },
    {
      date: 'Jan 2, 2025',
      title: 'Auto-Approve Settings & Approvals Display',
      description: 'Fixed profile photos and display names not showing correctly in Auto-Approve Settings and Approvals screens. Added auto-approval support for recording settings changes.',
    },
    {
      date: 'Dec 27, 2024',
      title: 'App Icon Badge Notifications',
      description: 'Added app icon badge showing total unread notifications across all groups. Badge respects group mute settings.',
    },
    {
      date: 'Dec 27, 2024',
      title: 'Push Notifications',
      description: 'Push notifications now fully configured for messages, calendar events, finance, and approval requests.',
    },
    {
      date: 'Dec 23, 2024',
      title: 'Login Flow Improvements',
      description: 'Improved login and registration flow with better error handling and navigation.',
    },
    {
      date: 'Dec 13, 2024',
      title: 'Registry Passcode Reset',
      description: 'Fixed an issue where resetting the access code on gift and item registries would fail.',
    },
    {
      date: 'Dec 13, 2024',
      title: 'Emoji Picker Search',
      description: 'Fixed the emoji search box closing unexpectedly when clicking inside it on web.',
    },
    {
      date: 'Dec 11, 2024',
      title: 'Video Call Recordings',
      description: 'Improved video call recording reliability and fixed duration display issues.',
    },
    {
      date: 'Dec 10, 2024',
      title: 'Call End Navigation',
      description: 'Fixed an issue where participants were not properly redirected after a call ended.',
    },
    {
      date: 'Dec 9, 2024',
      title: 'Video Player Progress Bar',
      description: 'Fixed progress bar not working correctly for video recordings.',
    },
  ];

  function getSeverityColor(severity) {
    switch (severity) {
      case 'high':
        return '#f44336';
      case 'medium':
        return '#ff9800';
      case 'low':
        return '#4caf50';
      default:
        return '#9e9e9e';
    }
  }

  function getStatusColor(status) {
    switch (status) {
      case 'In Development':
        return '#2196f3';
      case 'Planned':
        return '#9c27b0';
      case 'Testing':
        return '#ff9800';
      default:
        return '#9e9e9e';
    }
  }

  return (
    <div style={{ height: '100vh', overflowY: 'auto', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Family Helper</Text>
        <View style={styles.headerButtons}>
          <Button mode="text" onPress={() => navigation.navigate('Landing')}>
            Back to Home
          </Button>
        </View>
      </View>

      {/* Hero Section */}
      <Surface style={styles.hero}>
        <Title style={styles.heroTitle}>Updates & Coming Soon</Title>
        <Paragraph style={styles.heroSubtitle}>
          Stay up to date with the latest features, improvements, and bug fixes.
        </Paragraph>
      </Surface>

      {/* Version Info */}
      <View style={styles.section}>
        <Card style={styles.versionCard}>
          <Card.Content style={styles.versionContent}>
            <View style={styles.versionRow}>
              <MaterialCommunityIcons name="tag" size={24} color="#1976d2" />
              <View style={styles.versionInfo}>
                <Text style={styles.versionLabel}>Current Version</Text>
                <Text style={styles.versionNumber}>{APP_VERSION}</Text>
              </View>
            </View>
            <View style={styles.versionRow}>
              <MaterialCommunityIcons name="calendar-check" size={24} color="#1976d2" />
              <View style={styles.versionInfo}>
                <Text style={styles.versionLabel}>Last Updated</Text>
                <Text style={styles.versionNumber}>{LAST_UPDATED}</Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      </View>

      {/* Coming Soon Section */}
      <View style={styles.section}>
        <Title style={styles.sectionTitle}>Coming Soon</Title>
        <Paragraph style={styles.sectionSubtitle}>
          Features we're working on to make Family Helper even better.
        </Paragraph>
        <View style={styles.cardsContainer}>
          {comingSoon.map((feature, index) => (
            <Card key={index} style={styles.featureCard}>
              <Card.Content>
                <View style={styles.featureHeader}>
                  <MaterialCommunityIcons
                    name={feature.icon}
                    size={32}
                    color="#1976d2"
                  />
                  <Chip
                    style={[
                      styles.statusChip,
                      { backgroundColor: getStatusColor(feature.status) },
                    ]}
                    textStyle={styles.statusChipText}
                  >
                    {feature.status}
                  </Chip>
                </View>
                <Title style={styles.featureTitle}>{feature.title}</Title>
                <Paragraph style={styles.featureDescription}>
                  {feature.description}
                </Paragraph>
              </Card.Content>
            </Card>
          ))}
        </View>
      </View>

      {/* Known Issues Section */}
      <Surface style={styles.issuesSection}>
        <Title style={styles.sectionTitle}>Known Issues</Title>
        <Paragraph style={styles.sectionSubtitle}>
          Issues we're aware of and actively working to resolve.
        </Paragraph>
        <View style={styles.cardsContainer}>
          {knownIssues.map((issue, index) => (
            <Card key={index} style={styles.issueCard}>
              <Card.Content>
                <View style={styles.issueHeader}>
                  <Text style={styles.issueId}>{issue.id}</Text>
                  <Chip
                    style={[
                      styles.severityChip,
                      { backgroundColor: getSeverityColor(issue.severity) },
                    ]}
                    textStyle={styles.severityChipText}
                  >
                    {issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)}
                  </Chip>
                </View>
                <Title style={styles.issueTitle}>{issue.title}</Title>
                <Paragraph style={styles.issueDescription}>
                  {issue.description}
                </Paragraph>
              </Card.Content>
            </Card>
          ))}
        </View>
      </Surface>

      {/* Recent Bug Fixes Section */}
      <View style={styles.section}>
        <Title style={styles.sectionTitle}>Recent Bug Fixes</Title>
        <Paragraph style={styles.sectionSubtitle}>
          Issues we've recently resolved.
        </Paragraph>
        <Card style={styles.fixesCard}>
          <Card.Content>
            {recentFixes.map((fix, index) => (
              <View key={index}>
                <View style={styles.fixItem}>
                  <View style={styles.fixHeader}>
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={20}
                      color="#4caf50"
                    />
                    <Text style={styles.fixDate}>{fix.date}</Text>
                  </View>
                  <Title style={styles.fixTitle}>{fix.title}</Title>
                  <Paragraph style={styles.fixDescription}>
                    {fix.description}
                  </Paragraph>
                </View>
                {index < recentFixes.length - 1 && <Divider style={styles.divider} />}
              </View>
            ))}
          </Card.Content>
        </Card>
      </View>

      {/* Feedback CTA */}
      <View style={styles.ctaSection}>
        <Title style={styles.ctaSectionTitle}>Have Feedback?</Title>
        <Paragraph style={styles.ctaSectionText}>
          We'd love to hear from you! Report bugs or suggest features.
        </Paragraph>
        <Button
          mode="contained"
          onPress={() => navigation.navigate('Landing')}
          style={styles.ctaButton}
        >
          Back to Home
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
  },
  hero: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#1976d2',
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    opacity: 0.9,
    maxWidth: 600,
  },
  section: {
    padding: 32,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  versionCard: {
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  versionContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 24,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  versionInfo: {
    alignItems: 'flex-start',
  },
  versionLabel: {
    fontSize: 12,
    color: '#666',
  },
  versionNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976d2',
  },
  cardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
  },
  featureCard: {
    width: 320,
    margin: 8,
  },
  featureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusChip: {
    height: 28,
  },
  statusChipText: {
    color: '#fff',
    fontSize: 12,
  },
  featureTitle: {
    fontSize: 18,
    marginBottom: 8,
  },
  featureDescription: {
    fontSize: 14,
    color: '#666',
  },
  issuesSection: {
    padding: 32,
    backgroundColor: '#fff',
  },
  issueCard: {
    width: 320,
    margin: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  issueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  issueId: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
  },
  severityChip: {
    height: 24,
  },
  severityChipText: {
    color: '#fff',
    fontSize: 11,
  },
  issueTitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  issueDescription: {
    fontSize: 14,
    color: '#666',
  },
  fixesCard: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  fixItem: {
    paddingVertical: 12,
  },
  fixHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  fixDate: {
    fontSize: 12,
    color: '#666',
  },
  fixTitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  fixDescription: {
    fontSize: 14,
    color: '#666',
  },
  divider: {
    marginVertical: 8,
  },
  ctaSection: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
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
  ctaButton: {
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  footer: {
    padding: 24,
    backgroundColor: '#333',
    alignItems: 'center',
  },
  footerText: {
    color: '#fff',
  },
});
