/**
 * App Layout Component
 *
 * Main layout with navigation drawer and app bar.
 * React Native Paper version.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import {
  Drawer,
  Text,
  Divider,
  Portal,
  Modal,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';

const DRAWER_WIDTH = 240;

function AppLayout({ children, navigation, currentRoute }) {
  const { logout } = useKindeAuth();
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const [isSupportUser, setIsSupportUser] = useState(false);
  const supportCheckRef = useRef(false);

  // Check if user has support access - only once using ref to prevent re-runs
  useEffect(() => {
    if (supportCheckRef.current) return;
    supportCheckRef.current = true;

    async function checkSupportAccess() {
      try {
        const response = await api.get('/support/check-access');
        setIsSupportUser(response.data.isSupportUser || false);
      } catch (err) {
        // Silently fail - user is not a support user
        console.log('Support access check failed (user may not be a support user)');
      }
    }
    checkSupportAccess();
  }, []);

  const handleLogout = async () => {
    // Clear local storage
    await SecureStore.deleteItemAsync('accessToken');
    // Logout with Kinde
    logout();
  };

  // TODO: Get isAdmin from user context/API
  const isAdmin = true;

  const menuItems = [
    { label: 'Web App', icon: 'apps', route: 'Groups' },
    { label: 'Subscription', icon: 'credit-card', route: 'Subscription' },
    { label: 'My Account', icon: 'account-circle', route: 'WebAdminMyAccount' },
    ...(isAdmin ? [
      { label: 'Storage', icon: 'database', route: 'Storage' },
      { label: 'Audit Logs', icon: 'history', route: 'AuditLogs' },
    ] : []),
    ...(isSupportUser ? [
      { label: 'Support', icon: 'shield-account', route: 'Support' },
    ] : []),
  ];

  const isActive = (route) => currentRoute === route;

  const handleNavigation = (route) => {
    navigation.navigate(route);
    setMobileMenuVisible(false);
  };

  const DrawerContent = () => (
    <View style={styles.drawerContent}>
      <View style={styles.drawerHeader}>
        <Text style={styles.drawerTitle}>Family Helper</Text>
        <TouchableOpacity
          onPress={() => setMenuCollapsed(true)}
          style={styles.collapseButton}
        >
          <MaterialCommunityIcons name="chevron-left" size={24} color="#666" />
        </TouchableOpacity>
      </View>
      <Divider />
      <ScrollView>
        {menuItems.map((item) => (
          <Drawer.Item
            key={item.route}
            label={item.label}
            icon={item.icon}
            active={isActive(item.route)}
            onPress={() => handleNavigation(item.route)}
            style={styles.drawerItem}
          />
        ))}
        <Divider style={styles.divider} />
        <Drawer.Item
          label="Logout"
          icon="logout"
          onPress={handleLogout}
          style={styles.drawerItem}
        />
      </ScrollView>
    </View>
  );

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      height: '100vh',
      backgroundColor: '#f5f5f5',
    }}>
      {/* Desktop Drawer - collapsible */}
      {!menuCollapsed && (
        <div style={{
          width: DRAWER_WIDTH,
          backgroundColor: '#fff',
          borderRight: '1px solid #e0e0e0',
          flexShrink: 0,
          overflow: 'auto',
        }}>
          <DrawerContent />
        </div>
      )}

      {/* Expand button when collapsed */}
      {menuCollapsed && (
        <div
          onClick={() => setMenuCollapsed(false)}
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 100,
            backgroundColor: '#fff',
            borderRadius: 20,
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            cursor: 'pointer',
          }}
        >
          <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
        </div>
      )}

      {/* Main Content Area - scrollable */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        backgroundColor: '#f5f5f5',
      }}>
        {children}
      </div>

      {/* Mobile Menu Modal */}
      <Portal>
        <Modal
          visible={mobileMenuVisible}
          onDismiss={() => setMobileMenuVisible(false)}
          contentContainerStyle={styles.mobileDrawer}
        >
          <DrawerContent />
        </Modal>
      </Portal>
    </div>
  );
}

const styles = StyleSheet.create({
  desktopDrawer: {
    width: DRAWER_WIDTH,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    display: 'flex',
  },
  drawerContent: {
    flex: 1,
  },
  drawerHeader: {
    padding: 16,
    paddingTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1976d2',
  },
  collapseButton: {
    padding: 4,
  },
  drawerItem: {
    marginHorizontal: 8,
  },
  divider: {
    marginVertical: 8,
  },
  mobileDrawer: {
    backgroundColor: '#fff',
    width: DRAWER_WIDTH,
    height: '100%',
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
});

export default AppLayout;
