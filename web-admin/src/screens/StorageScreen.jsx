/**
 * Storage Screen
 *
 * Admin-only screen for viewing and managing storage usage.
 * Shows breakdown by groups, with ability to drill into each group
 * and manage individual files with admin approval for deletion.
 * Includes image/video previews and filtering by type and uploader.
 *
 * React Native Paper version for web-admin.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, StyleSheet, Pressable, Image, Modal } from 'react-native';
import {
  Text,
  Button,
  Card,
  Title,
  Paragraph,
  Surface,
  ActivityIndicator,
  ProgressBar,
  Divider,
  IconButton,
  Chip,
  Portal,
  Dialog,
  Menu,
  Avatar,
  TextInput,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../services/api';
import { getContrastTextColor } from '../utils/colorUtils';

export default function StorageScreen({ navigation }) {
  const [storage, setStorage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Group detail view state
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupFiles, setGroupFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [sortBy, setSortBy] = useState('size'); // 'size', 'name', 'date'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'
  const [sortMenuVisible, setSortMenuVisible] = useState(false);

  // Delete confirmation state
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  // Filter state
  const [filterVisible, setFilterVisible] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState([]); // ['image', 'video']
  const [selectedUploaders, setSelectedUploaders] = useState([]); // array of email addresses
  const [availableUploaders, setAvailableUploaders] = useState([]);
  const [availableTypes, setAvailableTypes] = useState([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showPendingDeletion, setShowPendingDeletion] = useState(false); // Filter to show only pending deletion
  const [showDeleted, setShowDeleted] = useState(false); // Filter to show only deleted files

  // Preview modal state
  const [previewFile, setPreviewFile] = useState(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const ITEMS_PER_PAGE = 50;
  const scrollViewRef = useRef(null);

  useEffect(() => {
    fetchStorage();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      fetchGroupFiles(selectedGroup.groupId);
      setCurrentPage(1);
      setPageInput('1');
    }
  }, [selectedGroup, sortBy, sortOrder, selectedTypes, selectedUploaders, fromDate, toDate]);

  async function fetchStorage() {
    try {
      setLoading(true);
      setError(null);
      // Auto-recalculate storage on page load
      await api.post('/storage/recalculate');
      const response = await api.get('/storage/usage');
      setStorage(response.data.storage);
    } catch (err) {
      console.error('Failed to fetch storage:', err);
      setError('Failed to load storage information');
    } finally {
      setLoading(false);
    }
  }

  async function fetchGroupFiles(groupId) {
    try {
      setFilesLoading(true);
      const params = { sortBy, sortOrder };

      // Add type filter if selected
      if (selectedTypes.length > 0) {
        params.filterType = selectedTypes.join(',');
      }

      // Add uploader filter if selected (multiple uploaders by email)
      if (selectedUploaders.length > 0) {
        params.filterUploader = selectedUploaders.join(',');
      }

      // Add date range filters
      if (fromDate) {
        params.fromDate = fromDate;
      }
      if (toDate) {
        params.toDate = toDate;
      }

      const response = await api.get(`/storage/groups/${groupId}/files`, { params });
      setGroupFiles(response.data.files || []);
      setAvailableUploaders(response.data.availableUploaders || []);
      setAvailableTypes(response.data.availableTypes || []);
    } catch (err) {
      console.error('Failed to fetch group files:', err);
      setGroupFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }

  function toggleTypeFilter(type) {
    setSelectedTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  }

  function toggleUploaderFilter(email) {
    setSelectedUploaders(prev =>
      prev.includes(email)
        ? prev.filter(u => u !== email)
        : [...prev, email]
    );
  }

  function clearFilters() {
    setSelectedTypes([]);
    setSelectedUploaders([]);
    setFromDate('');
    setToDate('');
    setShowPendingDeletion(false);
    setShowDeleted(false);
  }

  function openPreview(file) {
    // Allow preview for images, videos, and audio (including phone call recordings)
    if (file.fileType === 'image' || file.fileType === 'video' ||
        file.fileType === 'audio' || file.fileType === 'phonecall' || file.fileType === 'videocall') {
      setPreviewFile(file);
      setPreviewVisible(true);
    }
  }

  function closePreview() {
    setPreviewVisible(false);
    setPreviewFile(null);
  }

  async function handleDeleteFile() {
    if (!fileToDelete) return;

    try {
      setDeleting(true);
      await api.post(`/storage/files/${fileToDelete.mediaId}/delete-request`);

      setSuccessMessage(
        'Deletion request submitted. Other admins will be notified for approval (requires >50% admin votes).'
      );
      setDeleteDialogVisible(false);
      setFileToDelete(null);

      // Refresh the file list
      if (selectedGroup) {
        fetchGroupFiles(selectedGroup.groupId);
      }
    } catch (err) {
      console.error('Failed to request deletion:', err);
      setError(err.response?.data?.message || 'Failed to request file deletion');
    } finally {
      setDeleting(false);
    }
  }


  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function getUsageColor(percentage) {
    if (percentage >= 90) return '#d32f2f';
    if (percentage >= 70) return '#ff9800';
    return '#4caf50';
  }

  function getFileIcon(mimeType) {
    if (!mimeType) return 'file';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'music';
    if (mimeType.includes('pdf')) return 'file-pdf-box';
    return 'file-document';
  }

  function toggleSort(field) {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setSortMenuVisible(false);
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading storage information...</Text>
      </View>
    );
  }

  const usagePercentage = storage
    ? (storage.usedBytes / storage.totalBytes) * 100
    : 0;

  // Check if any filters are active
  const hasActiveFilters = selectedTypes.length > 0 || selectedUploaders.length > 0 || fromDate || toDate || showPendingDeletion || showDeleted;

  // Filter files client-side - all filters work together (AND logic)
  // By default (no status filter), exclude deleted and pending deletion files
  // If status filter is selected, show ONLY files matching that status
  const displayedFiles = (() => {
    let files = groupFiles;

    // Status filtering logic:
    // - No status filter selected: Show normal files + pending deletion (not deleted)
    // - Deleted selected: Show only deleted files
    // - Pending Deletion selected: Show only pending deletion files
    if (showDeleted) {
      files = files.filter(file => file.isDeleted === true);
    } else if (showPendingDeletion) {
      files = files.filter(file => file.pendingDeletion === true);
    } else {
      // Default: exclude only deleted files (pending deletion files are visible)
      files = files.filter(file => !file.isDeleted);
    }

    return files;
  })();

  // Pagination calculations
  const totalPages = Math.ceil(displayedFiles.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedFiles = displayedFiles.slice(startIndex, endIndex);

  // Pagination handlers
  const goToPage = (page) => {
    const validPage = Math.max(1, Math.min(page, totalPages || 1));
    setCurrentPage(validPage);
    setPageInput(String(validPage));
    // Scroll to top
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
    }
  };

  const handlePageInputSubmit = () => {
    const page = parseInt(pageInput, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      goToPage(page);
    } else {
      setPageInput(String(currentPage));
    }
  };

  // If viewing a specific group's files
  if (selectedGroup) {
    return (
      <ScrollView style={styles.container} ref={scrollViewRef}>
        <View style={styles.content}>
          {/* Back button and group title */}
          <View style={styles.groupHeader}>
            <Button
              mode="text"
              onPress={() => {
                setSelectedGroup(null);
                setGroupFiles([]);
                clearFilters();
              }}
              icon="arrow-left"
            >
              Back to Overview
            </Button>
          </View>

          <Title style={styles.pageTitle}>{selectedGroup.name} - Storage</Title>
          <Paragraph style={styles.pageSubtitle}>
            {formatBytes(selectedGroup.usedBytes)} used across {displayedFiles.length} files
            {hasActiveFilters && ' (filtered)'}
          </Paragraph>

          {/* Success Message */}
          {successMessage && (
            <Surface style={styles.alertSuccess}>
              <Text style={styles.alertSuccessText}>{successMessage}</Text>
              <Button compact onPress={() => setSuccessMessage(null)}>Dismiss</Button>
            </Surface>
          )}

          {/* Error Message */}
          {error && (
            <Surface style={styles.alertError}>
              <Text style={styles.alertErrorText}>{error}</Text>
              <Button compact onPress={() => setError(null)}>Dismiss</Button>
            </Surface>
          )}

          {/* Sort and Filter controls */}
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.controlsRow}>
                {/* Sort controls */}
                <View style={styles.sortRow}>
                  <Text style={styles.sortLabel}>Sort by:</Text>
                  <Menu
                    visible={sortMenuVisible}
                    onDismiss={() => setSortMenuVisible(false)}
                    anchor={
                      <Button
                        mode="outlined"
                        onPress={() => setSortMenuVisible(true)}
                        icon={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
                      >
                        {sortBy === 'size' ? 'Size' : sortBy === 'name' ? 'Name' : 'Date'}
                      </Button>
                    }
                  >
                    <Menu.Item
                      onPress={() => toggleSort('size')}
                      title="Size"
                      leadingIcon={sortBy === 'size' ? 'check' : undefined}
                    />
                    <Menu.Item
                      onPress={() => toggleSort('name')}
                      title="Name"
                      leadingIcon={sortBy === 'name' ? 'check' : undefined}
                    />
                    <Menu.Item
                      onPress={() => toggleSort('date')}
                      title="Date"
                      leadingIcon={sortBy === 'date' ? 'check' : undefined}
                    />
                  </Menu>
                </View>

                {/* Filter toggle button */}
                <Button
                  mode={filterVisible ? 'contained' : 'outlined'}
                  onPress={() => setFilterVisible(!filterVisible)}
                  icon="filter"
                  style={styles.filterButton}
                >
                  Filters
                </Button>
              </View>

              {/* Expandable filter panel */}
              {filterVisible && (
                <View style={styles.filterPanel}>
                  <Divider style={styles.divider} />

                  <View style={styles.filterHeader}>
                    <Title style={styles.filterTitle}>Filters</Title>
                    <Button
                      mode="text"
                      onPress={clearFilters}
                      disabled={!hasActiveFilters}
                    >
                      Clear All
                    </Button>
                  </View>

                  {/* Type filters - dynamically show only types that exist */}
                  <Text style={styles.filterSectionTitle}>File Type</Text>
                  <View style={styles.filterChipsRow}>
                    {availableTypes.map(type => (
                      <Chip
                        key={type}
                        selected={selectedTypes.includes(type)}
                        onPress={() => toggleTypeFilter(type)}
                        style={styles.filterChip}
                      >
                        {type === 'image' ? 'Images' : type === 'video' ? 'Videos' : type === 'audio' ? 'Audio' : type === 'phonecall' ? 'Phone Calls' : type === 'videocall' ? 'Video Calls' : type}
                      </Chip>
                    ))}
                    {availableTypes.length === 0 && (
                      <Text style={{ color: '#666', fontStyle: 'italic' }}>No files uploaded yet</Text>
                    )}
                  </View>

                  {/* Status Filter - only show if there are pending deletion or deleted files */}
                  {(groupFiles.some(f => f.pendingDeletion) || groupFiles.some(f => f.isDeleted)) && (
                    <>
                      <Text style={styles.filterSectionTitle}>Status</Text>
                      <View style={styles.filterChipsRow}>
                        {groupFiles.some(f => f.pendingDeletion) && (
                          <Chip
                            selected={showPendingDeletion}
                            onPress={() => {
                              setShowPendingDeletion(!showPendingDeletion);
                              if (!showPendingDeletion) setShowDeleted(false); // Mutually exclusive
                            }}
                            style={[styles.filterChip, showPendingDeletion && styles.pendingDeletionFilterChip]}
                            icon={showPendingDeletion ? 'check' : 'clock-outline'}
                          >
                            Pending Deletion
                          </Chip>
                        )}
                        {groupFiles.some(f => f.isDeleted) && (
                          <Chip
                            selected={showDeleted}
                            onPress={() => {
                              setShowDeleted(!showDeleted);
                              if (!showDeleted) setShowPendingDeletion(false); // Mutually exclusive
                            }}
                            style={[styles.filterChip, showDeleted && styles.deletedFilterChip]}
                            icon={showDeleted ? 'check' : 'delete-outline'}
                          >
                            Deleted
                          </Chip>
                        )}
                      </View>
                    </>
                  )}

                  {/* Uploader filter - show email addresses */}
                  <Text style={styles.filterSectionTitle}>Uploaded By</Text>
                  <View style={styles.filterChipsRow}>
                    {availableUploaders.map(uploader => (
                      <Chip
                        key={uploader.email}
                        selected={selectedUploaders.includes(uploader.email)}
                        onPress={() => toggleUploaderFilter(uploader.email)}
                        style={styles.filterChip}
                      >
                        {uploader.email}
                      </Chip>
                    ))}
                  </View>

                  {/* Date Range Filters */}
                  <Text style={styles.filterSectionTitle}>Date Range</Text>
                  <View style={styles.dateRow}>
                    <TextInput
                      label="From Date"
                      value={fromDate}
                      onChangeText={setFromDate}
                      placeholder="YYYY-MM-DD"
                      mode="outlined"
                      style={styles.dateInput}
                      dense
                    />
                    <TextInput
                      label="To Date"
                      value={toDate}
                      onChangeText={setToDate}
                      placeholder="YYYY-MM-DD"
                      mode="outlined"
                      style={styles.dateInput}
                      dense
                    />
                  </View>

                  {/* Active Filters Summary */}
                  {hasActiveFilters && (
                    <View style={styles.activeFiltersSummary}>
                      <Text style={styles.activeFiltersText}>
                        Active filters: {selectedTypes.length} types, {selectedUploaders.length} uploaders
                        {fromDate && `, from ${fromDate}`}
                        {toDate && `, to ${toDate}`}
                        {showPendingDeletion && ', pending deletion only'}
                        {showDeleted && ', deleted only'}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </Card.Content>
          </Card>

          {/* Files list with previews */}
          <Card style={styles.card}>
            <Card.Content>
              <Title>Files</Title>
              <Divider style={styles.divider} />

              {filesLoading ? (
                <View style={styles.filesLoading}>
                  <ActivityIndicator size="small" />
                  <Text style={styles.filesLoadingText}>Loading files...</Text>
                </View>
              ) : displayedFiles.length === 0 ? (
                <Text style={styles.noFilesText}>
                  {hasActiveFilters ? 'No files match the selected filters' : 'No files in this group'}
                </Text>
              ) : (
                paginatedFiles.map((file) => (
                  <Pressable
                    key={file.mediaId}
                    style={({ pressed }) => [
                      styles.fileRow,
                      file.isDeleted && styles.fileRowDeleted,
                      file.pendingDeletion && styles.fileRowPendingDeletion,
                      !file.isDeleted && ['image', 'video', 'audio', 'phonecall', 'videocall'].includes(file.fileType) && styles.fileRowClickable,
                      pressed && !file.isDeleted && ['image', 'video', 'audio', 'phonecall', 'videocall'].includes(file.fileType) && styles.fileRowPressed,
                    ]}
                    onPress={() => !file.isDeleted && openPreview(file)}
                    disabled={file.isDeleted}
                  >
                    {/* Deleted file placeholder */}
                    {file.isDeleted ? (
                      <View style={styles.deletedIconContainer}>
                        <MaterialCommunityIcons
                          name="delete-circle"
                          size={32}
                          color="#d32f2f"
                        />
                      </View>
                    ) : (
                      /* Thumbnail preview for images/videos */
                      (file.fileType === 'image' || file.fileType === 'video') && (file.thumbnailUrl || file.url) ? (
                        <View style={styles.thumbnailContainer}>
                          <Image
                            source={{ uri: file.thumbnailUrl || file.url }}
                            style={styles.thumbnail}
                            resizeMode="cover"
                          />
                          {file.fileType === 'video' && (
                            <View style={styles.videoOverlay}>
                              <MaterialCommunityIcons name="play-circle" size={24} color="#fff" />
                            </View>
                          )}
                        </View>
                      ) : (
                        <View style={styles.iconContainer}>
                          <MaterialCommunityIcons
                            name={getFileIcon(file.mimeType)}
                            size={32}
                            color="#666"
                          />
                        </View>
                      )
                    )}

                    <View style={styles.fileDetails}>
                      {file.isDeleted ? (
                        <>
                          <Text style={styles.deletedFileName} numberOfLines={1}>
                            {file.fileName || 'Unnamed file'}
                          </Text>
                          <Chip style={styles.deletedChip} textStyle={styles.deletedChipText} icon="delete">
                            Deleted by Admin
                          </Chip>
                          {/* Deleted by info */}
                          {file.deletedBy && (
                            <View style={styles.deletedByRow}>
                              <Avatar.Text
                                size={18}
                                label={file.deletedBy.iconLetters || '?'}
                                style={{ backgroundColor: file.deletedBy.iconColor || '#d32f2f' }}
                                color={getContrastTextColor(file.deletedBy.iconColor || '#d32f2f')}
                              />
                              <Text style={styles.deletedByText}>
                                {file.deletedBy.displayName} • {formatDate(file.deletedAt)}
                              </Text>
                            </View>
                          )}
                          <Text style={styles.deletedMeta}>
                            Original: {formatBytes(file.fileSizeBytes)} • {formatDate(file.uploadedAt)}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.fileName} numberOfLines={1}>
                            {file.fileName || 'Unnamed file'}
                          </Text>
                          <Text style={styles.fileMeta}>
                            {formatBytes(file.fileSizeBytes)} • {formatDate(file.uploadedAt)}
                          </Text>

                          {/* Uploader info */}
                          {file.uploader && (
                            <View style={styles.uploaderRow}>
                              <Avatar.Text
                                size={18}
                                label={file.uploader.iconLetters || '?'}
                                style={{ backgroundColor: file.uploader.iconColor || '#6200ee' }}
                                color={getContrastTextColor(file.uploader.iconColor || '#6200ee')}
                              />
                              <Text style={styles.uploaderName}>
                                {file.uploader.displayName}
                              </Text>
                            </View>
                          )}

                          {file.pendingDeletion && (
                            <Chip
                              style={styles.pendingChip}
                              textStyle={styles.pendingChipText}
                              icon="clock-alert-outline"
                            >
                              Awaiting Deletion Approval
                            </Chip>
                          )}
                        </>
                      )}
                    </View>

                    <View style={styles.fileActions}>
                      {/* File type badge */}
                      {!file.isDeleted && file.fileType === 'image' && (
                        <Chip style={styles.typeChip} textStyle={styles.typeChipText} icon="image">
                          Image
                        </Chip>
                      )}
                      {!file.isDeleted && file.fileType === 'video' && (
                        <Chip style={styles.typeChip} textStyle={styles.typeChipText} icon="video">
                          Video
                        </Chip>
                      )}
                      {!file.isDeleted && file.fileType === 'audio' && (
                        <Chip style={styles.audioChip} textStyle={styles.audioChipText} icon="microphone">
                          Audio
                        </Chip>
                      )}
                      {!file.isDeleted && file.fileType === 'phonecall' && (
                        <Chip style={styles.phonecallChip} textStyle={styles.phonecallChipText} icon="phone">
                          Phone Call
                        </Chip>
                      )}
                      {!file.isDeleted && file.fileType === 'videocall' && (
                        <Chip style={styles.videocallChip} textStyle={styles.videocallChipText} icon="video-box">
                          Video Call
                        </Chip>
                      )}

                      {!file.isDeleted && !file.pendingDeletion && !file.isLog && (
                        <IconButton
                          icon="delete"
                          iconColor="#d32f2f"
                          size={20}
                          onPress={(e) => {
                            e.stopPropagation();
                            setFileToDelete(file);
                            setDeleteDialogVisible(true);
                          }}
                        />
                      )}
                      {!file.isDeleted && file.isLog && (
                        <Chip style={styles.logChip} textStyle={styles.logChipText}>
                          Log
                        </Chip>
                      )}
                    </View>
                  </Pressable>
                ))
              )}
            </Card.Content>
          </Card>

          {/* Pagination Controls */}
          {displayedFiles.length > ITEMS_PER_PAGE && (
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.paginationContainer}>
                  <View style={styles.paginationInfo}>
                    <Text style={styles.paginationText}>
                      Showing {startIndex + 1}-{Math.min(endIndex, displayedFiles.length)} of {displayedFiles.length} files
                    </Text>
                  </View>
                  <View style={styles.paginationControls}>
                    <Button
                      mode="outlined"
                      onPress={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      compact
                      icon="chevron-left"
                    >
                      Previous
                    </Button>
                    <View style={styles.pageInputContainer}>
                      <Text style={styles.pageLabel}>Page</Text>
                      <TextInput
                        value={pageInput}
                        onChangeText={setPageInput}
                        onSubmitEditing={handlePageInputSubmit}
                        onBlur={handlePageInputSubmit}
                        keyboardType="number-pad"
                        style={styles.pageInput}
                        mode="outlined"
                        dense
                      />
                      <Text style={styles.pageLabel}>of {totalPages}</Text>
                    </View>
                    <Button
                      mode="outlined"
                      onPress={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      compact
                      icon="chevron-right"
                      contentStyle={{ flexDirection: 'row-reverse' }}
                    >
                      Next
                    </Button>
                  </View>
                </View>
              </Card.Content>
            </Card>
          )}

          {/* Important note about logs */}
          <Surface style={styles.infoBox}>
            <MaterialCommunityIcons name="information" size={20} color="#1976d2" />
            <Text style={styles.infoText}>
              Audit logs cannot be deleted as they are required for compliance.
              File deletions require approval from more than 50% of group admins
              and will remove the file from all admins' storage.
            </Text>
          </Surface>
        </View>

        {/* Delete Confirmation Dialog */}
        <Portal>
          <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
            <Dialog.Title>Request File Deletion</Dialog.Title>
            <Dialog.Content>
              <Paragraph>
                Request to delete "{fileToDelete?.fileName || 'this file'}"?
              </Paragraph>
              <Paragraph style={styles.dialogWarning}>
                This will require approval from more than 50% of group admins.
                Once approved, the file will be permanently deleted from all admins' storage.
              </Paragraph>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setDeleteDialogVisible(false)}>Cancel</Button>
              <Button
                onPress={handleDeleteFile}
                loading={deleting}
                textColor="#d32f2f"
              >
                Request Deletion
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        {/* Preview Modal for Images/Videos */}
        <Portal>
          <Modal
            visible={previewVisible}
            transparent
            onRequestClose={closePreview}
          >
            <Pressable style={styles.previewOverlay} onPress={closePreview}>
              <View style={styles.previewContainer}>
                <View style={styles.previewHeader}>
                  <Text style={styles.previewTitle} numberOfLines={1}>
                    {previewFile?.fileName || 'Preview'}
                  </Text>
                  <IconButton
                    icon="close"
                    iconColor="#fff"
                    size={24}
                    onPress={closePreview}
                  />
                </View>

                {previewFile?.fileType === 'image' && (
                  <Image
                    source={{ uri: previewFile.url }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                )}

                {previewFile?.fileType === 'video' && (
                  <video
                    src={previewFile.url}
                    controls
                    style={{ maxWidth: '100%', maxHeight: '80vh' }}
                  />
                )}

                {/* Audio player for audio files, phone call recordings, and video call recordings */}
                {(previewFile?.fileType === 'audio' || previewFile?.fileType === 'phonecall') && (
                  <View style={styles.audioPreviewContainer}>
                    <MaterialCommunityIcons
                      name={previewFile?.fileType === 'phonecall' ? 'phone' : 'microphone'}
                      size={64}
                      color="#4caf50"
                    />
                    <Text style={styles.audioPreviewTitle}>
                      {previewFile?.fileType === 'phonecall' ? 'Phone Call Recording' : 'Audio Recording'}
                    </Text>
                    <audio
                      src={previewFile.url}
                      controls
                      style={{ width: '100%', maxWidth: 400, marginTop: 16 }}
                    />
                  </View>
                )}

                {previewFile?.fileType === 'videocall' && (
                  <video
                    src={previewFile.url}
                    controls
                    style={{ maxWidth: '100%', maxHeight: '80vh' }}
                  />
                )}

                <View style={styles.previewInfo}>
                  <Text style={styles.previewInfoText}>
                    {formatBytes(previewFile?.fileSizeBytes)} • {formatDate(previewFile?.uploadedAt)}
                  </Text>
                  {previewFile?.uploader && (
                    <Text style={styles.previewInfoText}>
                      Uploaded by: {previewFile.uploader.displayName}
                    </Text>
                  )}
                </View>
              </View>
            </Pressable>
          </Modal>
        </Portal>
      </ScrollView>
    );
  }

  // Main storage overview
  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Title style={styles.pageTitle}>Storage Management</Title>
        <Paragraph style={styles.pageSubtitle}>
          View and manage storage usage across your groups
        </Paragraph>

        {/* Error Message */}
        {error && (
          <Surface style={styles.alertError}>
            <Text style={styles.alertErrorText}>{error}</Text>
            <Button compact onPress={() => setError(null)}>Dismiss</Button>
          </Surface>
        )}

        {storage ? (
          <>
            {/* Usage Overview */}
            <Card style={styles.card}>
              <Card.Content>
                <Title>Total Storage Usage</Title>
                <Divider style={styles.divider} />
                <View style={styles.usageContainer}>
                  <View style={styles.usageHeader}>
                    <Text style={styles.usageText}>
                      {formatBytes(storage.usedBytes)} of {formatBytes(storage.totalBytes)} used
                    </Text>
                    <Text style={[styles.usagePercent, { color: getUsageColor(usagePercentage) }]}>
                      {usagePercentage.toFixed(1)}%
                    </Text>
                  </View>
                  <ProgressBar
                    progress={usagePercentage / 100}
                    color={getUsageColor(usagePercentage)}
                    style={styles.progressBar}
                  />
                </View>
                {usagePercentage >= 80 && (
                  <Surface style={styles.warningBanner}>
                    <Text style={styles.warningText}>
                      {usagePercentage >= 90
                        ? 'Storage almost full! Consider removing files or upgrading.'
                        : 'Storage is getting full. Consider reviewing large files.'}
                    </Text>
                  </Surface>
                )}
              </Card.Content>
            </Card>

            {/* Breakdown by Type */}
            <Card style={styles.card}>
              <Card.Content>
                <Title>Breakdown by Type</Title>
                <Divider style={styles.divider} />
                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownItem}>
                    <MaterialCommunityIcons name="image" size={20} color="#666" />
                    <Text style={styles.breakdownLabel}>Images</Text>
                  </View>
                  <Text style={styles.breakdownValue}>
                    {formatBytes(storage.breakdown?.images || 0)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownItem}>
                    <MaterialCommunityIcons name="video" size={20} color="#666" />
                    <Text style={styles.breakdownLabel}>Videos</Text>
                  </View>
                  <Text style={styles.breakdownValue}>
                    {formatBytes(storage.breakdown?.videos || 0)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownItem}>
                    <MaterialCommunityIcons name="microphone" size={20} color="#666" />
                    <Text style={styles.breakdownLabel}>Audio</Text>
                  </View>
                  <Text style={styles.breakdownValue}>
                    {formatBytes(storage.breakdown?.audio || 0)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownItem}>
                    <MaterialCommunityIcons name="phone" size={20} color="#666" />
                    <Text style={styles.breakdownLabel}>Phone Calls</Text>
                  </View>
                  <Text style={styles.breakdownValue}>
                    {formatBytes(storage.breakdown?.phonecalls || 0)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownItem}>
                    <MaterialCommunityIcons name="video-box" size={20} color="#666" />
                    <Text style={styles.breakdownLabel}>Video Calls</Text>
                  </View>
                  <Text style={styles.breakdownValue}>
                    {formatBytes(storage.breakdown?.videocalls || 0)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownItem}>
                    <MaterialCommunityIcons name="file-document" size={20} color="#666" />
                    <Text style={styles.breakdownLabel}>Documents</Text>
                  </View>
                  <Text style={styles.breakdownValue}>
                    {formatBytes(storage.breakdown?.documents || 0)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownItem}>
                    <MaterialCommunityIcons name="file-export" size={20} color="#666" />
                    <Text style={styles.breakdownLabel}>Log Exports</Text>
                  </View>
                  <Text style={styles.breakdownValue}>
                    {formatBytes(storage.breakdown?.logs || 0)}
                  </Text>
                </View>
              </Card.Content>
            </Card>

            {/* Storage by Group - Clickable */}
            <Card style={styles.card}>
              <Card.Content>
                <Title>Storage by Group</Title>
                <Paragraph style={styles.groupsSubtitle}>
                  Click a group to view and manage its files
                </Paragraph>
                <Divider style={styles.divider} />
                {storage.groups?.length > 0 ? (
                  storage.groups.map((group) => (
                    <Pressable
                      key={group.groupId}
                      style={({ pressed }) => [
                        styles.groupRow,
                        pressed && styles.groupRowPressed,
                      ]}
                      onPress={() => setSelectedGroup(group)}
                    >
                      <View style={styles.groupInfo}>
                        <Text style={styles.groupName} numberOfLines={1}>
                          {group.name}
                        </Text>
                        <Text style={styles.groupMeta}>
                          {group.fileCount || 0} files
                        </Text>
                      </View>
                      <View style={styles.groupRight}>
                        <Text style={styles.groupUsage}>
                          {formatBytes(group.usedBytes)}
                        </Text>
                        <MaterialCommunityIcons name="chevron-right" size={20} color="#666" />
                      </View>
                    </Pressable>
                  ))
                ) : (
                  <Text style={styles.noGroupsText}>
                    No groups found. You need to be an admin of a group to see its storage.
                  </Text>
                )}
              </Card.Content>
            </Card>

            {/* Storage Pricing Info */}
            <Card style={styles.card}>
              <Card.Content>
                <Title>Storage Pricing</Title>
                <Divider style={styles.divider} />
                <Paragraph>
                  Your subscription includes 10GB of storage. Additional storage is automatically
                  added at $1.00 USD per 10GB chunk when you exceed your base allocation.
                </Paragraph>
                <Surface style={styles.infoBox}>
                  <MaterialCommunityIcons name="information" size={20} color="#1976d2" />
                  <Text style={styles.infoText}>
                    When you become an admin of a group, you receive a copy of all existing
                    files and audit logs. This counts towards your storage usage.
                  </Text>
                </Surface>
              </Card.Content>
            </Card>
          </>
        ) : (
          <Card style={styles.card}>
            <Card.Content>
              <Title>No Storage Data</Title>
              <Paragraph>
                Unable to load storage information at this time.
              </Paragraph>
              <Button mode="contained" onPress={fetchStorage} style={styles.retryButton}>
                Retry
              </Button>
            </Card.Content>
          </Card>
        )}
      </View>
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
    marginBottom: 8,
  },
  pageSubtitle: {
    color: '#666',
    marginBottom: 24,
  },
  groupHeader: {
    marginBottom: 16,
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
  // Cards
  card: {
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    marginVertical: 12,
  },
  // Usage display
  usageContainer: {
    marginBottom: 16,
  },
  usageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  usageText: {
    fontSize: 14,
  },
  usagePercent: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  warningBanner: {
    padding: 12,
    backgroundColor: '#fff3e0',
    borderRadius: 4,
  },
  warningText: {
    color: '#e65100',
    fontSize: 12,
  },
  // Breakdown
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakdownLabel: {
    color: '#666',
    marginLeft: 8,
  },
  breakdownValue: {
    fontWeight: '500',
  },
  // Groups list
  groupsSubtitle: {
    color: '#666',
    fontSize: 12,
    marginTop: -8,
    marginBottom: 8,
  },
  groupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    borderRadius: 4,
  },
  groupRowPressed: {
    backgroundColor: '#f0f0f0',
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    marginBottom: 4,
  },
  groupMeta: {
    fontSize: 12,
    color: '#666',
  },
  groupRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupUsage: {
    fontWeight: '500',
    marginRight: 8,
  },
  noGroupsText: {
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  // Sort controls
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortLabel: {
    marginRight: 12,
    color: '#666',
  },
  // Files list
  filesLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  filesLoadingText: {
    marginLeft: 8,
    color: '#666',
  },
  noFilesText: {
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  fileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  fileIcon: {
    marginRight: 12,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    marginBottom: 4,
  },
  fileMeta: {
    fontSize: 12,
    color: '#666',
  },
  pendingChip: {
    marginTop: 4,
    backgroundColor: '#fff3e0',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#ff9800',
  },
  pendingChipText: {
    fontSize: 10,
    color: '#e65100',
    fontWeight: '600',
  },
  logChip: {
    backgroundColor: '#e3f2fd',
  },
  logChipText: {
    fontSize: 10,
    color: '#1565c0',
  },
  // Pagination
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  paginationInfo: {
    flex: 1,
    minWidth: 150,
  },
  paginationText: {
    fontSize: 14,
    color: '#666',
  },
  paginationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageLabel: {
    fontSize: 14,
    color: '#666',
  },
  pageInput: {
    width: 60,
    textAlign: 'center',
  },
  // Info box
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 12,
    color: '#1565c0',
    lineHeight: 18,
  },
  // Dialog
  dialogWarning: {
    marginTop: 8,
    color: '#e65100',
    fontSize: 12,
  },
  retryButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
  },
  // Controls row (sort + filter)
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  filterButton: {
    marginLeft: 'auto',
  },
  // Filter panel
  filterPanel: {
    marginTop: 8,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  filterTitle: {
    fontSize: 16,
  },
  filterSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    marginRight: 4,
    marginBottom: 4,
  },
  pendingDeletionFilterChip: {
    backgroundColor: '#fff3e0',
  },
  deletedFilterChip: {
    backgroundColor: '#ffebee',
  },
  activeFiltersSummary: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#e3f2fd',
    borderRadius: 4,
  },
  activeFiltersText: {
    fontSize: 13,
    color: '#1976d2',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  dateInput: {
    flex: 1,
    maxWidth: 200,
  },
  // File row with thumbnails
  fileRowClickable: {
    cursor: 'pointer',
  },
  fileRowPressed: {
    backgroundColor: '#f5f5f5',
  },
  fileRowDeleted: {
    backgroundColor: '#ffebee',
    opacity: 0.8,
  },
  fileRowPendingDeletion: {
    backgroundColor: '#fff8e1',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  deletedIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#ffcdd2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deletedFileName: {
    fontSize: 14,
    marginBottom: 4,
    textDecorationLine: 'line-through',
    color: '#999',
  },
  deletedChip: {
    backgroundColor: '#ffebee',
    borderColor: '#d32f2f',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  deletedChipText: {
    fontSize: 10,
    color: '#d32f2f',
    fontWeight: 'bold',
  },
  deletedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  deletedByText: {
    fontSize: 11,
    color: '#d32f2f',
    marginLeft: 6,
  },
  deletedMeta: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  thumbnailContainer: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: '#f0f0f0',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  uploaderName: {
    fontSize: 11,
    color: '#666',
    marginLeft: 6,
  },
  fileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeChip: {
    backgroundColor: '#f3e5f5',
  },
  typeChipText: {
    fontSize: 10,
    color: '#7b1fa2',
  },
  audioChip: {
    backgroundColor: '#e8f5e9',
  },
  audioChipText: {
    fontSize: 10,
    color: '#388e3c',
  },
  phonecallChip: {
    backgroundColor: '#e3f2fd',
  },
  phonecallChipText: {
    fontSize: 10,
    color: '#1565c0',
  },
  videocallChip: {
    backgroundColor: '#fce4ec',
  },
  videocallChipText: {
    fontSize: 10,
    color: '#c2185b',
  },
  // Preview modal
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  previewContainer: {
    maxWidth: '90%',
    maxHeight: '90%',
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  previewTitle: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  previewImage: {
    width: '100%',
    height: 500,
    maxHeight: '70vh',
  },
  previewInfo: {
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  previewInfoText: {
    color: '#fff',
    fontSize: 12,
    marginBottom: 4,
  },
  // Audio preview styles
  audioPreviewContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    minHeight: 200,
  },
  audioPreviewTitle: {
    color: '#fff',
    fontSize: 18,
    marginTop: 16,
    marginBottom: 8,
  },
});
