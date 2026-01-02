/**
 * Documents Screen
 *
 * Displays secure documents uploaded to a group.
 * Supports uploading, downloading, hiding, and deleting documents.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform,  } from 'react-native';
import { CustomAlert } from '../../components/CustomAlert';
import { IconButton, Menu, ActivityIndicator, Avatar } from 'react-native-paper';
import SafeAreaFAB from '../../components/SafeAreaFAB';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import api from '../../services/api';
import { uploadFile } from '../../services/upload.service';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';
import { getContrastTextColor } from '../../utils/colorUtils';

/**
 * @typedef {Object} DocumentsScreenProps
 * @property {Object} navigation - React Navigation navigation object
 * @property {Object} route - React Navigation route object
 */

/**
 * DocumentsScreen component
 *
 * @param {DocumentsScreenProps} props
 * @returns {JSX.Element}
 */
export default function DocumentsScreen({ navigation, route }) {
  const { groupId } = route.params;

  // State
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [groupInfo, setGroupInfo] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [menuVisible, setMenuVisible] = useState(null); // documentId of open menu

  useEffect(() => {
    loadGroupInfo();
  }, [groupId]);

  useFocusEffect(
    React.useCallback(() => {
      loadDocuments();
    }, [groupId])
  );

  // Permission state
  const [canCreate, setCanCreate] = useState(false);

  /**
   * Load group information
   */
  const loadGroupInfo = async () => {
    try {
      const response = await api.get(`/groups/${groupId}`);
      setGroupInfo(response.data.group);
      const role = response.data.group?.userRole || null;
      setUserRole(role);

      // Check if user can upload documents
      // Use !== false to properly handle explicit false values (defaults to true if undefined)
      const settings = response.data.group?.settings;
      if (role === 'admin' && settings?.documentsCreatableByAdmins !== false) {
        setCanCreate(true);
      } else if (role === 'parent' && settings?.documentsCreatableByParents !== false) {
        setCanCreate(true);
      } else if (role === 'adult' && settings?.documentsCreatableByAdults !== false) {
        setCanCreate(true);
      } else if (role === 'caregiver' && settings?.documentsCreatableByCaregivers !== false) {
        setCanCreate(true);
      } else if (role === 'child' && settings?.documentsCreatableByChildren !== false) {
        setCanCreate(true);
      } else {
        setCanCreate(false);
      }
    } catch (err) {
      console.error('Load group info error:', err);
    }
  };

  /**
   * Load documents from API
   */
  const loadDocuments = async () => {
    try {
      setError(null);
      const response = await api.get(`/groups/${groupId}/documents`);
      setDocuments(response.data.documents || []);
    } catch (err) {
      if (err.isAuthError) return;
      setError(err.response?.data?.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  /**
   * Format date for display
   * @param {string} dateString - ISO date string
   * @returns {string} Formatted date
   */
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * Handle document upload
   */
  const handleUpload = async () => {
    try {
      // Pick document
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      setUploading(true);

      // Upload file to /files endpoint
      const uploadedFile = await uploadFile(
        {
          uri: file.uri,
          mimeType: file.mimeType,
          name: file.name,
        },
        'secure-documents',
        groupId
      );

      // Create document record
      const response = await api.post(`/groups/${groupId}/documents`, {
        fileName: file.name,
        fileId: uploadedFile.fileId,
        fileSizeBytes: file.size,
        mimeType: file.mimeType,
      });

      // Add new document to list
      setDocuments((prev) => [response.data.document, ...prev]);
      CustomAlert.alert('Success', 'Document uploaded successfully');
    } catch (err) {
      console.error('Upload error:', err);
      CustomAlert.alert('Error', err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  /**
   * Handle document download
   * @param {Object} document - Document to download
   */
  const handleDownload = async (document) => {
    try {
      // Get document info with download URL
      const response = await api.get(`/groups/${groupId}/documents/${document.documentId}`);
      const downloadUrl = response.data.document.downloadUrl;

      if (!downloadUrl) {
        CustomAlert.alert('Error', 'Download URL not available');
        return;
      }

      // Different handling for web vs native
      if (Platform.OS === 'web') {
        // For web, open the download URL in a new tab or trigger download
        // Create a temporary link element to trigger download
        const link = window.document.createElement('a');
        link.href = downloadUrl;
        link.download = document.fileName;
        link.target = '_blank';
        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);
      } else {
        // For native (iOS/Android), use FileSystem to download and share
        const fileUri = FileSystem.cacheDirectory + document.fileName;
        const downloadResult = await FileSystem.downloadAsync(downloadUrl, fileUri);

        if (downloadResult.status === 200) {
          // Share/open the file
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(downloadResult.uri);
          } else {
            CustomAlert.alert('Success', 'Document downloaded to cache');
          }
        } else {
          CustomAlert.alert('Error', 'Failed to download document');
        }
      }
    } catch (err) {
      console.error('Download error:', err);
      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to download document');
    }
  };

  /**
   * Handle hide document (admin only)
   * @param {Object} document - Document to hide
   */
  const handleHide = async (document) => {
    try {
      await api.put(`/groups/${groupId}/documents/${document.documentId}/hide`);
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.documentId === document.documentId ? { ...doc, isHidden: true } : doc
        )
      );
      setMenuVisible(null);
    } catch (err) {
      console.error('Hide error:', err);
      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to hide document');
    }
  };

  /**
   * Handle unhide document (admin only)
   * @param {Object} document - Document to unhide
   */
  const handleUnhide = async (document) => {
    try {
      await api.put(`/groups/${groupId}/documents/${document.documentId}/unhide`);
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.documentId === document.documentId ? { ...doc, isHidden: false } : doc
        )
      );
      setMenuVisible(null);
    } catch (err) {
      console.error('Unhide error:', err);
      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to unhide document');
    }
  };

  /**
   * Handle delete document (admin only)
   * @param {Object} document - Document to delete
   */
  const handleDelete = (document) => {
    CustomAlert.alert(
      'Delete Document',
      `Are you sure you want to delete "${document.fileName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/groups/${groupId}/documents/${document.documentId}`);
              setDocuments((prev) =>
                prev.filter((doc) => doc.documentId !== document.documentId)
              );
              setMenuVisible(null);
            } catch (err) {
              console.error('Delete error:', err);
              CustomAlert.alert(
                'Error',
                err.response?.data?.message || 'Failed to delete document'
              );
            }
          },
        },
      ]
    );
  };

  /**
   * Check if user is admin
   */
  const isAdmin = userRole === 'admin';

  /**
   * Render document item
   */
  const renderDocument = ({ item }) => {
    const uploaderIconColor = item.uploader?.iconColor || '#6200ee';

    return (
      <TouchableOpacity
        style={[styles.documentItem, item.isHidden && styles.documentItemHidden]}
        onPress={() => handleDownload(item)}
        onLongPress={() => isAdmin && setMenuVisible(item.documentId)}
        activeOpacity={0.7}
      >
        <View style={styles.documentContent}>
          {/* File icon */}
          <View style={styles.fileIconContainer}>
            <IconButton
              icon="file-document-outline"
              size={32}
              iconColor="#6200ee"
              style={styles.fileIcon}
            />
          </View>

          {/* Document info */}
          <View style={styles.documentInfo}>
            <Text
              style={[
                styles.fileName,
                item.isHidden && styles.fileNameHidden,
              ]}
              numberOfLines={1}
            >
              {item.fileName}
              {item.isHidden && isAdmin && (
                <Text style={styles.hiddenBadge}> (Hidden)</Text>
              )}
            </Text>

            <View style={styles.documentMeta}>
              {/* Uploader info */}
              {item.uploader && (
                <View style={styles.uploaderInfo}>
                  <Avatar.Text
                    size={20}
                    label={item.uploader.iconLetters || '?'}
                    style={{ backgroundColor: uploaderIconColor }}
                    color={getContrastTextColor(uploaderIconColor)}
                  />
                  <Text style={styles.uploaderName} numberOfLines={1}>
                    {item.uploader.displayName}
                  </Text>
                </View>
              )}

              {/* File size and date */}
              <Text style={styles.metaText}>
                {formatFileSize(item.fileSizeBytes)} • {formatDate(item.uploadedAt)}
              </Text>
            </View>
          </View>

          {/* Menu for admins */}
          {isAdmin && (
            <Menu
              visible={menuVisible === item.documentId}
              onDismiss={() => setMenuVisible(null)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  size={24}
                  onPress={() => setMenuVisible(item.documentId)}
                />
              }
            >
              {item.isHidden ? (
                <Menu.Item
                  onPress={() => handleUnhide(item)}
                  title="Unhide"
                  leadingIcon="eye"
                />
              ) : (
                <Menu.Item
                  onPress={() => handleHide(item)}
                  title="Hide"
                  leadingIcon="eye-off"
                />
              )}
              <Menu.Item
                onPress={() => handleDelete(item)}
                title="Delete"
                leadingIcon="delete"
              />
            </Menu>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  /**
   * Render empty state
   */
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <IconButton icon="file-document-outline" size={64} iconColor="#ccc" />
      <Text style={styles.emptyText}>No documents yet</Text>
      <Text style={styles.emptySubtext}>
        Tap the + button to upload your first document
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <CustomNavigationHeader
          title="Documents"
          onBack={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CustomNavigationHeader
        title="Documents"
        onBack={() => navigation.goBack()}
      />

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={documents}
        renderItem={renderDocument}
        keyExtractor={(item) => item.documentId}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
      />

      {/* Upload FAB */}
      {canCreate && (
        <SafeAreaFAB
          icon={uploading ? 'loading' : 'plus'}
          style={[
            styles.fab,
            { backgroundColor: groupInfo?.backgroundColor || '#6200ee' },
          ]}
          color="#fff"
          onPress={handleUpload}
          disabled={uploading}
          loading={uploading}
        />
      )}
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
  errorBanner: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ffcdd2',
  },
  errorText: {
    color: '#c62828',
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
    flexGrow: 1,
  },
  documentItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  documentItemHidden: {
    opacity: 0.6,
    backgroundColor: '#f5f5f5',
  },
  documentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  fileIconContainer: {
    marginRight: 12,
  },
  fileIcon: {
    margin: 0,
  },
  documentInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  fileNameHidden: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  hiddenBadge: {
    fontSize: 12,
    color: '#f57c00',
    fontWeight: 'normal',
  },
  documentMeta: {
    flexDirection: 'column',
  },
  uploaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  uploaderName: {
    fontSize: 12,
    color: '#666',
    marginLeft: 6,
    flex: 1,
  },
  metaText: {
    fontSize: 12,
    color: '#999',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});
