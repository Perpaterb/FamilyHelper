/**
 * Web Admin App
 *
 * React Native Web app that shares code with mobile-main.
 * Uses React Navigation and React Native Paper.
 */

// CRITICAL: Patch Dimensions.get() BEFORE importing any screens
import './src/utils/patchDimensions';

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer, useNavigation, useRoute } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider, MD3LightTheme } from 'react-native-paper';
import { KindeProvider, useKindeAuth } from '@kinde-oss/kinde-auth-react';
import * as SecureStore from 'expo-secure-store';
import config from './src/config/env';
import { setTokenRefresher, clearTokenRefresher } from '../mobile-main/src/services/tokenProvider';

// Layout components
import AppLayout from './src/components/AppLayout';
import PhoneFrame from './src/components/PhoneFrame';
import { CustomAlertProvider, setGlobalAlertHandler, useCustomAlert } from './src/components/CustomAlert';
// Also import from mobile-main's CustomAlert to set its global handler
import { setGlobalAlertHandler as setMobileGlobalAlertHandler } from '../mobile-main/src/components/CustomAlert';

// Import screens from mobile-main (single source of truth)
import GroupsListScreen from '../mobile-main/src/screens/groups/GroupsListScreen';
import GroupDashboardScreen from '../mobile-main/src/screens/groups/GroupDashboardScreen';
import GroupSettingsScreen from '../mobile-main/src/screens/groups/GroupSettingsScreen';
import CreateGroupScreen from '../mobile-main/src/screens/groups/CreateGroupScreen';
import InvitesScreen from '../mobile-main/src/screens/groups/InvitesScreen';
import InviteMemberScreen from '../mobile-main/src/screens/groups/InviteMemberScreen';
import MessageGroupsListScreen from '../mobile-main/src/screens/groups/MessageGroupsListScreen';
import MessagesScreen from '../mobile-main/src/screens/groups/MessagesScreen';
import CreateMessageGroupScreen from '../mobile-main/src/screens/groups/CreateMessageGroupScreen';
import MessageGroupSettingsScreen from '../mobile-main/src/screens/groups/MessageGroupSettingsScreen';
// Mobile app My Account (in phone frame)
import MobileMyAccountScreen from '../mobile-main/src/screens/account/MyAccountScreen';
// Web-admin My Account (different from mobile)
import WebAdminMyAccountScreen from './src/screens/MyAccountScreen';

// Import personal registry screens
import PersonalGiftRegistriesScreen from '../mobile-main/src/screens/account/PersonalGiftRegistriesScreen';
import PersonalItemRegistriesScreen from '../mobile-main/src/screens/account/PersonalItemRegistriesScreen';
import AddEditPersonalGiftRegistryScreen from '../mobile-main/src/screens/account/AddEditPersonalGiftRegistryScreen';
import AddEditPersonalItemRegistryScreen from '../mobile-main/src/screens/account/AddEditPersonalItemRegistryScreen';
import PersonalGiftRegistryDetailScreen from '../mobile-main/src/screens/account/PersonalGiftRegistryDetailScreen';
import PersonalItemRegistryDetailScreen from '../mobile-main/src/screens/account/PersonalItemRegistryDetailScreen';
import AddEditPersonalGiftItemScreen from '../mobile-main/src/screens/account/AddEditPersonalGiftItemScreen';
import AddEditPersonalItemRegistryItemScreen from '../mobile-main/src/screens/account/AddEditPersonalItemRegistryItemScreen';

// Import calendar screens
import CalendarScreen from '../mobile-main/src/screens/calendar/CalendarScreen';
import CreateEventScreen from '../mobile-main/src/screens/calendar/CreateEventScreen';
import CreateChildEventScreen from '../mobile-main/src/screens/calendar/CreateChildEventScreen';
import EditEventScreen from '../mobile-main/src/screens/calendar/EditEventScreen';
import EditChildEventScreen from '../mobile-main/src/screens/calendar/EditChildEventScreen';

// Import finance screens
import FinanceListScreen from '../mobile-main/src/screens/groups/FinanceListScreen';
import CreateFinanceMatterScreen from '../mobile-main/src/screens/finance/CreateFinanceMatterScreen';
import FinanceMatterDetailsScreen from '../mobile-main/src/screens/finance/FinanceMatterDetailsScreen';

// Import registry screens
import GiftRegistryListScreen from '../mobile-main/src/screens/groups/GiftRegistryListScreen';
import GiftRegistryDetailScreen from '../mobile-main/src/screens/groups/GiftRegistryDetailScreen';
import ItemRegistryListScreen from '../mobile-main/src/screens/groups/ItemRegistryListScreen';
import ItemRegistryDetailScreen from '../mobile-main/src/screens/groups/ItemRegistryDetailScreen';
import SecretSantaListScreen from '../mobile-main/src/screens/groups/SecretSantaListScreen';
import SecretSantaDetailScreen from '../mobile-main/src/screens/groups/SecretSantaDetailScreen';
import CreateSecretSantaScreen from '../mobile-main/src/screens/groups/CreateSecretSantaScreen';

// Import approval screens
import ApprovalsListScreen from '../mobile-main/src/screens/groups/ApprovalsListScreen';
import AutoApproveSettingsScreen from '../mobile-main/src/screens/groups/AutoApproveSettingsScreen';

// Import wiki and documents screens
import WikiScreen from '../mobile-main/src/screens/wiki/WikiScreen';
import DocumentsScreen from '../mobile-main/src/screens/documents/DocumentsScreen';

// Import phone call screens
import PhoneCallsScreen from '../mobile-main/src/screens/groups/PhoneCallsScreen';
import InitiatePhoneCallScreen from '../mobile-main/src/screens/groups/InitiatePhoneCallScreen';
import PhoneCallDetailsScreen from '../mobile-main/src/screens/groups/PhoneCallDetailsScreen';
import ActivePhoneCallScreen from '../mobile-main/src/screens/groups/ActivePhoneCallScreen';

// Import video call screens
import VideoCallsScreen from '../mobile-main/src/screens/groups/VideoCallsScreen';
import InitiateVideoCallScreen from '../mobile-main/src/screens/groups/InitiateVideoCallScreen';
import VideoCallDetailsScreen from '../mobile-main/src/screens/groups/VideoCallDetailsScreen';
import ActiveVideoCallScreen from '../mobile-main/src/screens/groups/ActiveVideoCallScreen';

// Import incoming call context and handler
import { IncomingCallProvider } from '../mobile-main/src/contexts/IncomingCallContext';
import IncomingCallHandler from '../mobile-main/src/components/IncomingCallHandler';

// Web-only screens (admin features)
import LandingScreen from './src/screens/LandingScreen';
import LoginScreen from './src/screens/LoginScreen';
import SubscriptionScreen from './src/screens/SubscriptionScreen';
import StorageScreen from './src/screens/StorageScreen';
import AuditLogsScreen from './src/screens/AuditLogsScreen';
import SupportScreen from './src/screens/SupportScreen';

// Public Secret Santa screens (no auth required)
import SecretSantaPasscodeScreen from './src/screens/SecretSantaPasscodeScreen';
import SecretSantaViewScreen from './src/screens/SecretSantaViewScreen';

// Public registry screens (no auth required)
import GiftRegistryPublicScreen from './src/screens/GiftRegistryPublicScreen';
import ItemRegistryPublicScreen from './src/screens/ItemRegistryPublicScreen';

// Privacy Policy (no auth required)
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';

// Updates page (no auth required)
import UpdatesScreen from './src/screens/UpdatesScreen';

const Stack = createStackNavigator();

/**
 * Component to initialize the global alert handler
 * Sets handler on BOTH web-admin and mobile-main's CustomAlert modules
 * since mobile-main screens import their own CustomAlert
 */
function AlertHandlerInitializer() {
  const { showAlert } = useCustomAlert();

  useEffect(() => {
    // Set handler on web-admin's CustomAlert
    setGlobalAlertHandler(showAlert);
    // Also set handler on mobile-main's CustomAlert (used by imported screens)
    setMobileGlobalAlertHandler(showAlert);
  }, [showAlert]);

  return null;
}

// Wrapper to add PhoneFrame around mobile screens
function withPhoneFrame(ScreenComponent) {
  return function WrappedScreen(props) {
    return (
      <PhoneFrame>
        <ScreenComponent {...props} />
      </PhoneFrame>
    );
  };
}

// Wrapper to add AppLayout around admin screens
function withAppLayout(ScreenComponent, routeName) {
  return function WrappedScreen(props) {
    return (
      <AppLayout navigation={props.navigation} currentRoute={routeName}>
        <ScreenComponent {...props} />
      </AppLayout>
    );
  };
}

// Wrapper for mobile screens: AppLayout + PhoneFrame
function withAppLayoutAndPhoneFrame(ScreenComponent, routeName) {
  return function WrappedScreen(props) {
    return (
      <AppLayout navigation={props.navigation} currentRoute={routeName}>
        <PhoneFrame>
          <ScreenComponent {...props} />
        </PhoneFrame>
      </AppLayout>
    );
  };
}

// Linking configuration for web URLs
// NOTE: This linking config is used by BOTH authenticated and unauthenticated navigators.
// The navigator will only resolve routes that exist in its current stack.
// If a user lands on '/web-app' while unauthenticated, React Navigation will
// NOT find the 'Groups' screen (it's only in authenticated stack) and will
// fall back to the initial route ('Landing').
const linking = {
  prefixes: [
    'http://localhost:8081',
    'http://localhost:3001',
    'https://familyhelperapp.com',
    'https://www.familyhelperapp.com',
    'https://did5g5bty80vq.cloudfront.net'
  ],
  config: {
    screens: {
      // Public Secret Santa pages (no auth required)
      SecretSantaPasscode: 'secret-santa/:webToken',
      SecretSantaView: 'secret-santa/:webToken/view',
      // Public registry pages (no auth required)
      GiftRegistryPublic: 'gift-registry/:webToken',
      ItemRegistryPublic: 'item-registry/:webToken',
      // Privacy Policy (no auth required)
      PrivacyPolicy: 'privacy-policy',
      // Updates page (no auth required)
      Updates: 'updates',
      // Public/Admin pages
      Landing: '',
      Login: 'login',
      Subscription: 'subscription',
      Storage: 'storage',
      AuditLogs: 'audit-logs',
      Support: 'support',
      WebAdminMyAccount: 'web-admin-my-account',
      // Mobile app screens with unique URLs
      Groups: 'web-app',
      GroupDashboard: 'web-app/group/:groupId',
      GroupSettings: 'web-app/group/:groupId/settings',
      CreateGroup: 'web-app/create-group',
      Invites: 'web-app/invites',
      InviteMember: 'web-app/group/:groupId/invite',
      MessageGroupsList: 'web-app/group/:groupId/messages',
      GroupMessages: 'web-app/group/:groupId/messages/:messageGroupId',
      CreateMessageGroup: 'web-app/group/:groupId/messages/create',
      MessageGroupSettings: 'web-app/group/:groupId/messages/:messageGroupId/settings',
      Calendar: 'web-app/group/:groupId/calendar',
      CreateEvent: 'web-app/group/:groupId/calendar/create',
      CreateChildEvent: 'web-app/group/:groupId/calendar/create-child',
      EditEvent: 'web-app/group/:groupId/calendar/:eventId/edit',
      EditChildEvent: 'web-app/group/:groupId/calendar/:eventId/edit-child',
      Finance: 'web-app/group/:groupId/finance',
      CreateFinanceMatter: 'web-app/group/:groupId/finance/create',
      FinanceMatterDetails: 'web-app/group/:groupId/finance/:financeMatterId',
      GiftRegistryList: 'web-app/group/:groupId/gift-registry',
      GiftRegistryDetail: 'web-app/group/:groupId/gift-registry/:registryId',
      ItemRegistryList: 'web-app/group/:groupId/item-registry',
      ItemRegistryDetail: 'web-app/group/:groupId/item-registry/:registryId',
      SecretSantaList: 'web-app/group/:groupId/secret-santa',
      SecretSantaDetail: 'web-app/group/:groupId/secret-santa/:eventId',
      CreateSecretSanta: 'web-app/group/:groupId/secret-santa/create',
      ApprovalsList: 'web-app/group/:groupId/approvals',
      AutoApproveSettings: 'web-app/group/:groupId/approvals/auto-approve',
      Wiki: 'web-app/group/:groupId/wiki',
      Documents: 'web-app/group/:groupId/documents',
      PhoneCalls: 'web-app/group/:groupId/phone-calls',
      InitiatePhoneCall: 'web-app/group/:groupId/phone-calls/initiate',
      ActivePhoneCall: 'web-app/group/:groupId/phone-calls/:callId/active',
      PhoneCallDetails: 'web-app/group/:groupId/phone-calls/:callId',
      VideoCalls: 'web-app/group/:groupId/video-calls',
      InitiateVideoCall: 'web-app/group/:groupId/video-calls/initiate',
      ActiveVideoCall: 'web-app/group/:groupId/video-calls/:callId/active',
      VideoCallDetails: 'web-app/group/:groupId/video-calls/:callId',
      MyAccount: 'my-account',
      PersonalGiftRegistries: 'my-account/gift-registries',
      PersonalItemRegistries: 'my-account/item-registries',
      AddEditPersonalGiftRegistry: 'my-account/gift-registries/edit/:registryId?',
      AddEditPersonalItemRegistry: 'my-account/item-registries/edit/:registryId?',
      PersonalGiftRegistryDetail: 'my-account/gift-registries/:registryId',
      PersonalItemRegistryDetail: 'my-account/item-registries/:registryId',
      AddEditPersonalGiftItem: 'my-account/gift-registries/:registryId/item/:itemId?',
      AddEditPersonalItemRegistryItem: 'my-account/item-registries/:registryId/item/:itemId?',
    },
  },
};

function AppNavigator() {
  const { isAuthenticated, isLoading, getToken, user, logout } = useKindeAuth();
  const [tokenExchanged, setTokenExchanged] = useState(false);
  const [tokenExchangeError, setTokenExchangeError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Phase 2: Store Kinde tokens directly (no /auth/exchange)
  // The Kinde React SDK handles token refresh automatically
  useEffect(() => {
    async function storeKindeTokens() {
      if (isLoading) {
        return;
      }

      // Mark auth as checked once loading is done (regardless of auth state)
      setAuthChecked(true);

      if (!isAuthenticated || tokenExchanged) {
        return;
      }

      try {
        // Get Kinde access token - SDK handles refresh automatically
        const kindeToken = await getToken();
        if (!kindeToken || !user || !user.email) {
          return;
        }

        // Store Kinde token directly - API validates via JWKS
        await SecureStore.setItemAsync('accessToken', kindeToken);

        // Register token refresher for api.js to use on 401 errors
        // Kinde React SDK handles refresh internally via silent auth
        setTokenRefresher(() => getToken());
        console.log('[App] Token refresher registered for API calls');

        setTokenExchanged(true);
        console.log('[App] Kinde token stored for API calls');
      } catch (error) {
        console.error('Failed to get Kinde token:', error.message);
        setTokenExchangeError(error.message);
      }
    }

    storeKindeTokens();
  }, [isAuthenticated, isLoading, getToken, user, tokenExchanged]);

  // Clear token refresher when user logs out
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      clearTokenRefresher();
    }
  }, [isAuthenticated, isLoading]);

  // Show loading until Kinde has finished checking auth state
  // This prevents the brief flash of unauthenticated state that causes redirect loops
  if (isLoading || !authChecked) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  // If authenticated but token exchange hasn't completed yet, show loading
  // This prevents API calls from happening before we have the access token
  if (isAuthenticated && !tokenExchanged) {
    // If there was an error during token exchange, show error and allow retry
    if (tokenExchangeError) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Login failed: {tokenExchangeError}</Text>
          <Text
            style={styles.retryLink}
            onPress={() => {
              setTokenExchangeError(null);
              logout();
            }}
          >
            Try again
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.loadingContainer}>
        <Text>Completing login...</Text>
      </View>
    );
  }

  return (
    <IncomingCallProvider isAuthenticated={isAuthenticated}>
      <NavigationContainer linking={linking}>
        {/* Incoming call overlay - shows when there's an incoming call */}
        {isAuthenticated && <IncomingCallHandler />}
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
          }}
        >
          {!isAuthenticated ? (
            // Auth screens (no layout)
            <>
              <Stack.Screen name="Landing" component={LandingScreen} />
              <Stack.Screen name="Login" component={LoginScreen} />
              {/* Public Secret Santa screens - no auth required */}
              <Stack.Screen name="SecretSantaPasscode" component={SecretSantaPasscodeScreen} />
              <Stack.Screen name="SecretSantaView" component={SecretSantaViewScreen} />
              {/* Public registry screens - no auth required */}
              <Stack.Screen name="GiftRegistryPublic" component={GiftRegistryPublicScreen} />
              <Stack.Screen name="ItemRegistryPublic" component={ItemRegistryPublicScreen} />
              {/* Privacy Policy - no auth required */}
              <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
              {/* Updates page - no auth required */}
              <Stack.Screen name="Updates" component={UpdatesScreen} />
            </>
          ) : (
          // Authenticated screens (with AppLayout)
          <>
            {/* Mobile app screens - AppLayout + PhoneFrame */}
            <Stack.Screen name="Groups" component={withAppLayoutAndPhoneFrame(GroupsListScreen, 'Groups')} />
            <Stack.Screen name="GroupDashboard" component={withAppLayoutAndPhoneFrame(GroupDashboardScreen, 'Groups')} />
            <Stack.Screen name="GroupSettings" component={withAppLayoutAndPhoneFrame(GroupSettingsScreen, 'Groups')} />
            <Stack.Screen name="CreateGroup" component={withAppLayoutAndPhoneFrame(CreateGroupScreen, 'Groups')} />
            <Stack.Screen name="Invites" component={withAppLayoutAndPhoneFrame(InvitesScreen, 'Groups')} />
            <Stack.Screen name="InviteMember" component={withAppLayoutAndPhoneFrame(InviteMemberScreen, 'Groups')} />

            {/* Messages */}
            <Stack.Screen name="MessageGroupsList" component={withAppLayoutAndPhoneFrame(MessageGroupsListScreen, 'Groups')} />
            <Stack.Screen name="GroupMessages" component={withAppLayoutAndPhoneFrame(MessagesScreen, 'Groups')} />
            <Stack.Screen name="CreateMessageGroup" component={withAppLayoutAndPhoneFrame(CreateMessageGroupScreen, 'Groups')} />
            <Stack.Screen name="MessageGroupSettings" component={withAppLayoutAndPhoneFrame(MessageGroupSettingsScreen, 'Groups')} />

            {/* Calendar */}
            <Stack.Screen name="Calendar" component={withAppLayoutAndPhoneFrame(CalendarScreen, 'Groups')} />
            <Stack.Screen name="CreateEvent" component={withAppLayoutAndPhoneFrame(CreateEventScreen, 'Groups')} />
            <Stack.Screen name="CreateChildEvent" component={withAppLayoutAndPhoneFrame(CreateChildEventScreen, 'Groups')} />
            <Stack.Screen name="EditEvent" component={withAppLayoutAndPhoneFrame(EditEventScreen, 'Groups')} />
            <Stack.Screen name="EditChildEvent" component={withAppLayoutAndPhoneFrame(EditChildEventScreen, 'Groups')} />

            {/* Finance */}
            <Stack.Screen name="Finance" component={withAppLayoutAndPhoneFrame(FinanceListScreen, 'Groups')} />
            <Stack.Screen name="CreateFinanceMatter" component={withAppLayoutAndPhoneFrame(CreateFinanceMatterScreen, 'Groups')} />
            <Stack.Screen name="FinanceMatterDetails" component={withAppLayoutAndPhoneFrame(FinanceMatterDetailsScreen, 'Groups')} />

            {/* Registries */}
            <Stack.Screen name="GiftRegistryList" component={withAppLayoutAndPhoneFrame(GiftRegistryListScreen, 'Groups')} />
            <Stack.Screen name="GiftRegistryDetail" component={withAppLayoutAndPhoneFrame(GiftRegistryDetailScreen, 'Groups')} />
            <Stack.Screen name="ItemRegistryList" component={withAppLayoutAndPhoneFrame(ItemRegistryListScreen, 'Groups')} />
            <Stack.Screen name="ItemRegistryDetail" component={withAppLayoutAndPhoneFrame(ItemRegistryDetailScreen, 'Groups')} />
            <Stack.Screen name="SecretSantaList" component={withAppLayoutAndPhoneFrame(SecretSantaListScreen, 'Groups')} />
            <Stack.Screen name="SecretSantaDetail" component={withAppLayoutAndPhoneFrame(SecretSantaDetailScreen, 'Groups')} />
            <Stack.Screen name="CreateSecretSanta" component={withAppLayoutAndPhoneFrame(CreateSecretSantaScreen, 'Groups')} />

            {/* Approvals */}
            <Stack.Screen name="ApprovalsList" component={withAppLayoutAndPhoneFrame(ApprovalsListScreen, 'Groups')} />
            <Stack.Screen name="AutoApproveSettings" component={withAppLayoutAndPhoneFrame(AutoApproveSettingsScreen, 'Groups')} />

            {/* Wiki and Documents */}
            <Stack.Screen name="Wiki" component={withAppLayoutAndPhoneFrame(WikiScreen, 'Groups')} />
            <Stack.Screen name="Documents" component={withAppLayoutAndPhoneFrame(DocumentsScreen, 'Groups')} />

            {/* Phone Calls */}
            <Stack.Screen name="PhoneCalls" component={withAppLayoutAndPhoneFrame(PhoneCallsScreen, 'Groups')} />
            <Stack.Screen name="InitiatePhoneCall" component={withAppLayoutAndPhoneFrame(InitiatePhoneCallScreen, 'Groups')} />
            <Stack.Screen name="ActivePhoneCall" component={withAppLayoutAndPhoneFrame(ActivePhoneCallScreen, 'Groups')} />
            <Stack.Screen name="PhoneCallDetails" component={withAppLayoutAndPhoneFrame(PhoneCallDetailsScreen, 'Groups')} />

            {/* Video Calls */}
            <Stack.Screen name="VideoCalls" component={withAppLayoutAndPhoneFrame(VideoCallsScreen, 'Groups')} />
            <Stack.Screen name="InitiateVideoCall" component={withAppLayoutAndPhoneFrame(InitiateVideoCallScreen, 'Groups')} />
            <Stack.Screen name="ActiveVideoCall" component={withAppLayoutAndPhoneFrame(ActiveVideoCallScreen, 'Groups')} />
            <Stack.Screen name="VideoCallDetails" component={withAppLayoutAndPhoneFrame(VideoCallDetailsScreen, 'Groups')} />

            {/* Mobile app My Account - in phone frame */}
            <Stack.Screen name="MyAccount" component={withAppLayoutAndPhoneFrame(MobileMyAccountScreen, 'Groups')} />

            {/* Personal Registries */}
            <Stack.Screen name="PersonalGiftRegistries" component={withAppLayoutAndPhoneFrame(PersonalGiftRegistriesScreen, 'Groups')} />
            <Stack.Screen name="PersonalItemRegistries" component={withAppLayoutAndPhoneFrame(PersonalItemRegistriesScreen, 'Groups')} />
            <Stack.Screen name="AddEditPersonalGiftRegistry" component={withAppLayoutAndPhoneFrame(AddEditPersonalGiftRegistryScreen, 'Groups')} />
            <Stack.Screen name="AddEditPersonalItemRegistry" component={withAppLayoutAndPhoneFrame(AddEditPersonalItemRegistryScreen, 'Groups')} />
            <Stack.Screen name="PersonalGiftRegistryDetail" component={withAppLayoutAndPhoneFrame(PersonalGiftRegistryDetailScreen, 'Groups')} />
            <Stack.Screen name="PersonalItemRegistryDetail" component={withAppLayoutAndPhoneFrame(PersonalItemRegistryDetailScreen, 'Groups')} />
            <Stack.Screen name="AddEditPersonalGiftItem" component={withAppLayoutAndPhoneFrame(AddEditPersonalGiftItemScreen, 'Groups')} />
            <Stack.Screen name="AddEditPersonalItemRegistryItem" component={withAppLayoutAndPhoneFrame(AddEditPersonalItemRegistryItemScreen, 'Groups')} />

            {/* Web-admin My Account - no phone frame */}
            <Stack.Screen name="WebAdminMyAccount" component={withAppLayout(WebAdminMyAccountScreen, 'MyAccount')} />

            {/* Admin-only screens - AppLayout only (no phone frame) */}
            <Stack.Screen name="Subscription" component={withAppLayout(SubscriptionScreen, 'Subscription')} />
            <Stack.Screen name="Storage" component={withAppLayout(StorageScreen, 'Storage')} />
            <Stack.Screen name="AuditLogs" component={withAppLayout(AuditLogsScreen, 'AuditLogs')} />
            <Stack.Screen name="Support" component={withAppLayout(SupportScreen, 'Support')} />

            {/* Public Secret Santa screens - available when authenticated too */}
            <Stack.Screen name="SecretSantaPasscode" component={SecretSantaPasscodeScreen} />
            <Stack.Screen name="SecretSantaView" component={SecretSantaViewScreen} />

            {/* Public registry screens - available when authenticated too */}
            <Stack.Screen name="GiftRegistryPublic" component={GiftRegistryPublicScreen} />
            <Stack.Screen name="ItemRegistryPublic" component={ItemRegistryPublicScreen} />

            {/* Privacy Policy - available when authenticated too */}
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />

            {/* Updates page - available when authenticated too */}
            <Stack.Screen name="Updates" component={UpdatesScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  </IncomingCallProvider>
  );
}

export default function App() {
  return (
    <KindeProvider
      clientId={config.kinde.clientId}
      domain={config.kinde.domain}
      redirectUri={config.kinde.redirectUri}
      logoutUri={config.kinde.logoutRedirectUri}
    >
      <PaperProvider theme={MD3LightTheme}>
        <CustomAlertProvider>
          <AlertHandlerInitializer />
          <AppNavigator />
        </CustomAlertProvider>
      </PaperProvider>
    </KindeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#d32f2f',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryLink: {
    color: '#1976d2',
    textDecorationLine: 'underline',
    cursor: 'pointer',
  },
});
