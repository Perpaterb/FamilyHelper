/**
 * ItemRegistryPublicScreen
 *
 * Public screen for viewing a shared item registry.
 * Supports both public links and passcode-protected registries.
 * Shows all item details including photos, descriptions, categories, etc.
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Text,
  Card,
  Button,
  ActivityIndicator,
  TextInput,
  Divider,
  IconButton,
  Snackbar,
} from 'react-native-paper';
import config from '../config/env';

/**
 * Construct full file URL from fileId
 * The photoUrl stored in DB is just the fileId, we need to construct the full URL
 */
const getFileUrl = (fileId) => {
  if (!fileId) return null;
  // If it's already a full URL, return as-is
  if (fileId.startsWith('http://') || fileId.startsWith('https://')) {
    return fileId;
  }
  return `${config.api.url}/files/${fileId}`;
};

export default function ItemRegistryPublicScreen({ route }) {
  const { webToken } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [registry, setRegistry] = useState(null);
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);

  // Copy link snackbar
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const handleCopyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      setSnackbarVisible(true);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Fetch registry info
  useEffect(() => {
    async function fetchRegistry() {
      if (!webToken) {
        setError('No registry specified');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${config.api.url}/public/item-registry/${webToken}`);
        const data = await response.json();

        if (!response.ok) {
          if (response.status === 401 && data.requiresPasscode) {
            setNeedsPasscode(true);
            setRegistry({ name: data.name });
          } else {
            setError(data.message || 'Registry not found');
          }
        } else {
          setRegistry(data.registry);
        }
      } catch (err) {
        console.error('Error fetching registry:', err);
        setError('Failed to load registry');
      } finally {
        setLoading(false);
      }
    }

    fetchRegistry();
  }, [webToken]);

  const handleVerifyPasscode = async () => {
    if (!passcode.trim()) {
      setVerifyError('Please enter the passcode');
      return;
    }

    setVerifying(true);
    setVerifyError(null);

    try {
      const response = await fetch(`${config.api.url}/public/item-registry/${webToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setVerifyError(data.message || 'Invalid passcode');
        return;
      }

      setRegistry(data.registry);
      setNeedsPasscode(false);
    } catch (err) {
      console.error('Passcode verification error:', err);
      setVerifyError('Failed to verify passcode');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', overflowY: 'auto', backgroundColor: '#f5f5f5', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#6200ee" />
          <Text style={styles.loadingText}>Loading registry...</Text>
        </View>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '100vh', overflowY: 'auto', backgroundColor: '#f5f5f5', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorTitle}>Oops!</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </div>
    );
  }

  if (needsPasscode) {
    return (
      <div style={{ height: '100vh', overflowY: 'auto', backgroundColor: '#f5f5f5', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.emoji}>📦</Text>
            <Text style={styles.title}>{registry?.name || 'Item Registry'}</Text>
          </View>

          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.passcodeTitle}>This registry is protected</Text>
              <Text style={styles.passcodeSubtitle}>
                Enter the passcode to view the item list
              </Text>

              <TextInput
                label="Passcode"
                value={passcode}
                onChangeText={setPasscode}
                mode="outlined"
                style={styles.input}
                autoCapitalize="characters"
                maxLength={6}
              />

              {verifyError && (
                <Text style={styles.errorMessage}>{verifyError}</Text>
              )}

              <Button
                mode="contained"
                onPress={handleVerifyPasscode}
                loading={verifying}
                disabled={verifying || !passcode.trim()}
                style={styles.button}
              >
                View Registry
              </Button>
            </Card.Content>
          </Card>
        </View>
      </div>
    );
  }

  // Show the registry
  return (
    <div style={{ height: '100vh', overflowY: 'auto', backgroundColor: '#f5f5f5', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.emoji}>📦</Text>
          <Text style={styles.title}>{registry.name}</Text>
          <Text style={styles.subtitle}>Item Registry</Text>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>
              {registry.items?.length || 0} Items
            </Text>

            {(!registry.items || registry.items.length === 0) ? (
              <Text style={styles.emptyText}>No items in this registry yet.</Text>
            ) : (
              <View>
                {registry.items.map((item, index) => (
                  <View key={item.itemId}>
                    <View style={styles.itemContainer}>
                      {/* Photo */}
                      {item.photoUrl && (
                        <img
                          src={getFileUrl(item.photoUrl)}
                          alt={item.title}
                          style={{
                            width: '100%',
                            height: 'auto',
                            borderRadius: 8,
                            marginBottom: 12,
                            backgroundColor: '#f0f0f0',
                          }}
                        />
                      )}

                      {/* Item Details */}
                      <Text style={styles.itemTitle}>{item.title}</Text>

                      {item.cost && (
                        <Text style={styles.itemCost}>
                          ${parseFloat(item.cost).toFixed(2)}
                        </Text>
                      )}

                      {item.description && (
                        <Text style={styles.itemDescription}>{item.description}</Text>
                      )}

                      {item.category && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Category:</Text>
                          <Text style={styles.detailValue}>{item.category}</Text>
                        </View>
                      )}

                      {item.storageLocation && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Storage Location:</Text>
                          <Text style={styles.detailValue}>{item.storageLocation}</Text>
                        </View>
                      )}

                      {item.link && (
                        <View style={styles.linkContainer}>
                          <Text style={styles.linkLabel}>Link:</Text>
                          <Text style={styles.linkText} selectable>{item.link}</Text>
                          <IconButton
                            icon="content-copy"
                            size={18}
                            onPress={() => handleCopyLink(item.link)}
                            style={styles.copyButton}
                          />
                        </View>
                      )}
                    </View>
                    {index < registry.items.length - 1 && <Divider style={styles.divider} />}
                  </View>
                ))}
              </View>
            )}
          </Card.Content>
        </Card>

        <Text style={styles.footer}>
          Shared via Family Helper
        </Text>
      </View>
      <View style={{ height: 40 }} />

      {/* Copy Link Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
        style={styles.snackbar}
      >
        Link copied to clipboard
      </Snackbar>
    </div>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    maxWidth: 600,
    width: '100%',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#333',
  },
  emptyText: {
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  itemContainer: {
    paddingVertical: 16,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  itemCost: {
    fontSize: 16,
    color: '#4caf50',
    fontWeight: '600',
    marginBottom: 8,
  },
  itemDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: '#888',
    marginRight: 8,
  },
  detailValue: {
    fontSize: 13,
    color: '#333',
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 8,
    paddingLeft: 12,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  linkLabel: {
    fontSize: 13,
    color: '#666',
    marginRight: 8,
  },
  linkText: {
    fontSize: 13,
    color: '#333',
    flex: 1,
    wordBreak: 'break-all',
  },
  copyButton: {
    margin: 0,
  },
  snackbar: {
    backgroundColor: '#333',
  },
  divider: {
    marginVertical: 8,
  },
  passcodeTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  passcodeSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
  },
  errorMessage: {
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 8,
  },
  loadingText: {
    marginTop: 16,
    color: '#666',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  footer: {
    textAlign: 'center',
    color: '#999',
    fontSize: 12,
    marginTop: 16,
  },
});
