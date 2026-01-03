/**
 * Wiki Screen
 *
 * Displays wiki documents with a slide-out drawer for document list.
 * Supports markdown editing with formatting toolbar and code view toggle.
 */

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, FlatList, Modal, Animated, Dimensions, KeyboardAvoidingView, Platform,  } from 'react-native';
import { CustomAlert } from '../../components/CustomAlert';
import { IconButton, Searchbar, ActivityIndicator } from 'react-native-paper';
import SafeAreaFAB from '../../components/SafeAreaFAB';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import CustomNavigationHeader from '../../components/CustomNavigationHeader';
import Markdown from 'react-native-markdown-display';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.75;

/**
 * WikiScreen component
 *
 * @param {Object} props
 * @param {Object} props.navigation - React Navigation navigation object
 * @param {Object} props.route - React Navigation route object
 * @returns {JSX.Element}
 */
export default function WikiScreen({ navigation, route }) {
  const { groupId } = route.params;

  // Document state
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [groupInfo, setGroupInfo] = useState(null);

  // Editor state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(true);
  const drawerAnim = useRef(new Animated.Value(0)).current;

  // Create new document modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');

  const contentInputRef = useRef(null);

  useEffect(() => {
    loadGroupInfo();
  }, [groupId]);

  useFocusEffect(
    React.useCallback(() => {
      loadDocuments();
    }, [groupId])
  );

  // Animate drawer
  useEffect(() => {
    Animated.timing(drawerAnim, {
      toValue: drawerOpen ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [drawerOpen]);

  // Permission state
  const [canCreate, setCanCreate] = useState(false);

  const loadGroupInfo = async () => {
    try {
      const response = await api.get(`/groups/${groupId}`);
      setGroupInfo(response.data.group);
      const role = response.data.group?.userRole || null;
      const settings = response.data.group?.settings;

      // Check if user can create wiki documents
      if (role === 'admin' && settings?.wikiCreatableByAdmins !== false) {
        setCanCreate(true);
      } else if (role === 'parent' && settings?.wikiCreatableByParents !== false) {
        setCanCreate(true);
      } else if (role === 'adult' && settings?.wikiCreatableByAdults !== false) {
        setCanCreate(true);
      } else if (role === 'caregiver' && settings?.wikiCreatableByCaregivers !== false) {
        setCanCreate(true);
      } else if (role === 'child' && settings?.wikiCreatableByChildren !== false) {
        setCanCreate(true);
      } else {
        setCanCreate(false);
      }
    } catch (err) {
      console.error('Load group info error:', err);
    }
  };

  const loadDocuments = async () => {
    try {
      setError(null);
      const response = await api.get(`/groups/${groupId}/wiki-documents`);
      setDocuments(response.data.documents || []);
    } catch (err) {
      if (err.isAuthError) return;
      setError(err.response?.data?.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    try {
      const response = await api.get(`/groups/${groupId}/wiki-documents/search?q=${encodeURIComponent(query)}`);
      setSearchResults(response.data.documents || []);
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  const handleSelectDocument = async (doc) => {
    if (hasChanges) {
      CustomAlert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Do you want to discard them?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => selectDocument(doc)
          },
        ]
      );
    } else {
      selectDocument(doc);
    }
  };

  const selectDocument = async (doc) => {
    try {
      const response = await api.get(`/groups/${groupId}/wiki-documents/${doc.documentId}`);
      setSelectedDocument(response.data.document);
      setEditTitle(response.data.document.title);
      setEditContent(response.data.document.content);
      setIsEditing(false);
      setHasChanges(false);
      setDrawerOpen(false);
    } catch (err) {
      console.error('Load document error:', err);
      CustomAlert.alert('Error', 'Failed to load document');
    }
  };

  const handleCreateDocument = async () => {
    if (!newDocTitle.trim()) {
      CustomAlert.alert('Error', 'Please enter a document title');
      return;
    }

    try {
      const response = await api.post(`/groups/${groupId}/wiki-documents`, {
        title: newDocTitle.trim(),
        content: '',
      });

      setDocuments(prev => [response.data.document, ...prev]);
      setSelectedDocument(response.data.document);
      setEditTitle(response.data.document.title);
      setEditContent('');
      setIsEditing(true);
      setShowCreateModal(false);
      setNewDocTitle('');
      setDrawerOpen(false);
    } catch (err) {
      console.error('Create document error:', err);
      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to create document');
    }
  };

  const handleSaveDocument = async () => {
    if (!selectedDocument) return;

    setSaving(true);
    try {
      const response = await api.put(
        `/groups/${groupId}/wiki-documents/${selectedDocument.documentId}`,
        {
          title: editTitle.trim(),
          content: editContent,
        }
      );

      setSelectedDocument(response.data.document);
      setHasChanges(false);
      setIsEditing(false);

      // Update in documents list
      setDocuments(prev =>
        prev.map(doc =>
          doc.documentId === selectedDocument.documentId
            ? response.data.document
            : doc
        )
      );
    } catch (err) {
      console.error('Save document error:', err);
      CustomAlert.alert('Error', err.response?.data?.message || 'Failed to save document');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDocument = () => {
    if (!selectedDocument) return;

    CustomAlert.alert(
      'Delete Document',
      `Are you sure you want to delete "${selectedDocument.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/groups/${groupId}/wiki-documents/${selectedDocument.documentId}`);
              setDocuments(prev => prev.filter(doc => doc.documentId !== selectedDocument.documentId));
              setSelectedDocument(null);
              setDrawerOpen(true);
            } catch (err) {
              console.error('Delete document error:', err);
              CustomAlert.alert('Error', err.response?.data?.message || 'Failed to delete document');
            }
          },
        },
      ]
    );
  };

  // Markdown formatting helpers
  const insertMarkdown = (before, after = '') => {
    if (!contentInputRef.current) return;

    const newContent = editContent + before + after;
    setEditContent(newContent);
    setHasChanges(true);
  };

  const formatBold = () => insertMarkdown('**bold text**');
  const formatItalic = () => insertMarkdown('*italic text*');
  const formatHeading = () => insertMarkdown('\n## Heading\n');
  const formatBulletList = () => insertMarkdown('\n- Item 1\n- Item 2\n- Item 3\n');
  const formatNumberList = () => insertMarkdown('\n1. Item 1\n2. Item 2\n3. Item 3\n');
  const formatLink = () => insertMarkdown('[link text](url)');
  const formatCode = () => insertMarkdown('\n```\ncode here\n```\n');

  const renderDocumentItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.documentItem,
        selectedDocument?.documentId === item.documentId && styles.documentItemSelected,
      ]}
      onPress={() => handleSelectDocument(item)}
    >
      <Text style={styles.documentTitle} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={styles.documentDate}>
        {new Date(item.updatedAt).toLocaleDateString()}
      </Text>
    </TouchableOpacity>
  );

  const drawerTranslateX = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-DRAWER_WIDTH, 0],
  });

  const displayDocs = searchResults !== null ? searchResults : documents;

  return (
    <View style={styles.container}>
      <CustomNavigationHeader
        navigation={navigation}
        title="Wiki"
        backgroundColor={groupInfo?.backgroundColor}
        onBack={() => navigation.goBack()}
        rightButtons={[
          {
            icon: drawerOpen ? 'menu-open' : 'menu',
            onPress: () => setDrawerOpen(!drawerOpen),
          },
        ]}
      />

      <View style={styles.content}>
        {/* Main content area */}
        <View style={styles.mainContent}>
          {loading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" />
            </View>
          ) : error ? (
            <View style={styles.centerContent}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : !selectedDocument ? (
            <View style={styles.centerContent}>
              <Text style={styles.placeholderText}>
                Select a document from the list or create a new one
              </Text>
            </View>
          ) : (
            <KeyboardAvoidingView
              style={styles.editorContainer}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
              {/* Document header */}
              <View style={styles.documentHeader}>
                {isEditing ? (
                  <TextInput
                    style={styles.titleInput}
                    value={editTitle}
                    onChangeText={(text) => {
                      setEditTitle(text);
                      setHasChanges(true);
                    }}
                    placeholder="Document title"
                  />
                ) : (
                  <Text style={styles.documentHeaderTitle}>{selectedDocument.title}</Text>
                )}

                <View style={styles.documentActions}>
                  {isEditing ? (
                    <>
                      <IconButton
                        icon="content-save"
                        size={20}
                        onPress={handleSaveDocument}
                        disabled={saving}
                      />
                      <IconButton
                        icon="close"
                        size={20}
                        onPress={() => {
                          setEditTitle(selectedDocument.title);
                          setEditContent(selectedDocument.content);
                          setIsEditing(false);
                          setHasChanges(false);
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <IconButton
                        icon="pencil"
                        size={20}
                        onPress={() => setIsEditing(true)}
                      />
                      <IconButton
                        icon="delete"
                        size={20}
                        onPress={handleDeleteDocument}
                      />
                    </>
                  )}
                </View>
              </View>

              {/* Formatting toolbar (visible when editing) */}
              {isEditing && (
                <View style={styles.toolbar}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <IconButton icon="format-bold" size={18} onPress={formatBold} />
                    <IconButton icon="format-italic" size={18} onPress={formatItalic} />
                    <IconButton icon="format-header-pound" size={18} onPress={formatHeading} />
                    <IconButton icon="format-list-bulleted" size={18} onPress={formatBulletList} />
                    <IconButton icon="format-list-numbered" size={18} onPress={formatNumberList} />
                    <IconButton icon="link" size={18} onPress={formatLink} />
                    <IconButton icon="code-tags" size={18} onPress={formatCode} />
                  </ScrollView>
                </View>
              )}

              {/* Content area */}
              <ScrollView style={styles.contentScroll}>
                {isEditing ? (
                  <TextInput
                    ref={contentInputRef}
                    style={styles.contentInput}
                    value={editContent}
                    onChangeText={(text) => {
                      setEditContent(text);
                      setHasChanges(true);
                    }}
                    placeholder="Write your content in Markdown..."
                    multiline
                    textAlignVertical="top"
                  />
                ) : (
                  <View style={styles.markdownContainer}>
                    <Markdown style={markdownStyles}>
                      {selectedDocument.content || '*No content yet*'}
                    </Markdown>
                  </View>
                )}
              </ScrollView>
            </KeyboardAvoidingView>
          )}
        </View>

        {/* Slide-out drawer */}
        <Animated.View
          style={[
            styles.drawer,
            { transform: [{ translateX: drawerTranslateX }] },
          ]}
        >
          <View style={styles.drawerContent}>
            <Searchbar
              placeholder="Search documents..."
              onChangeText={handleSearch}
              value={searchQuery}
              style={styles.searchBar}
            />

            <FlatList
              data={displayDocs}
              keyExtractor={(item) => item.documentId}
              renderItem={renderDocumentItem}
              ListEmptyComponent={
                <View style={styles.emptyList}>
                  <Text style={styles.emptyText}>
                    {searchQuery ? 'No documents found' : 'No documents yet'}
                  </Text>
                </View>
              }
              contentContainerStyle={styles.documentList}
            />
          </View>
        </Animated.View>

        {/* Overlay when drawer is open */}
        {drawerOpen && (
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={() => setDrawerOpen(false)}
          />
        )}
      </View>

      {/* FAB for creating new document */}
      {canCreate && (
        <SafeAreaFAB
          icon="plus"
          style={[styles.fab, { backgroundColor: groupInfo?.backgroundColor || '#6200ee' }]}
          color="#fff"
          onPress={() => setShowCreateModal(true)}
        />
      )}

      {/* Create document modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Document</Text>
            <TextInput
              style={styles.modalInput}
              value={newDocTitle}
              onChangeText={setNewDocTitle}
              placeholder="Document title"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => {
                  setShowCreateModal(false);
                  setNewDocTitle('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleCreateDocument}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const markdownStyles = {
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  heading1: {
    fontSize: 28,
    fontWeight: 'bold',
    marginVertical: 10,
  },
  heading2: {
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: 8,
  },
  heading3: {
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 6,
  },
  paragraph: {
    marginVertical: 4,
  },
  listItem: {
    marginVertical: 2,
  },
  code_block: {
    backgroundColor: '#f4f4f4',
    padding: 12,
    borderRadius: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  code_inline: {
    backgroundColor: '#f4f4f4',
    paddingHorizontal: 4,
    borderRadius: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  blockquote: {
    borderLeftWidth: 4,
    borderLeftColor: '#ddd',
    paddingLeft: 12,
    marginVertical: 8,
    fontStyle: 'italic',
  },
  link: {
    color: '#6200ee',
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    textAlign: 'center',
  },
  editorContainer: {
    flex: 1,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  documentHeaderTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
  },
  titleInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    padding: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
  },
  documentActions: {
    flexDirection: 'row',
  },
  toolbar: {
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  contentScroll: {
    flex: 1,
  },
  contentInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    minHeight: 300,
  },
  markdownContainer: {
    padding: 16,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  drawerContent: {
    flex: 1,
    paddingTop: 8,
  },
  searchBar: {
    margin: 8,
    elevation: 0,
    backgroundColor: '#f5f5f5',
  },
  documentList: {
    paddingBottom: 80,
  },
  documentItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  documentItemSelected: {
    backgroundColor: '#e3f2fd',
  },
  documentTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  documentDate: {
    fontSize: 12,
    color: '#666',
  },
  emptyList: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: DRAWER_WIDTH,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 5,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  modalButtonPrimary: {
    backgroundColor: '#6200ee',
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  modalButtonTextPrimary: {
    color: '#fff',
  },
});
