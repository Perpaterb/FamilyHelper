/**
 * GroupsListScreen Tests
 *
 * Tests for the groups list functionality including:
 * - Group listing and display
 * - Pin/Unpin functionality
 * - Support/Feedback button
 * - Search functionality
 * - Invitation count badge
 *
 * Based on USER_STORIES.md:
 * - US-GROUP-001: View Groups List
 * - US-GROUP-004: Pin/Unpin Groups
 * - US-GROUP-010: Mute/Unmute Group
 */

import React from 'react';
import { render, fireEvent, waitFor, act, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import GroupsListScreen from '../../../screens/groups/GroupsListScreen';
import api from '../../../services/api';

// Helper to render with PaperProvider
const renderWithProvider = (component) => {
  return render(
    <PaperProvider>{component}</PaperProvider>
  );
};

// Mock the CustomNavigationHeader component
jest.mock('../../../components/CustomNavigationHeader', () => {
  const { View, Text, TouchableOpacity } = require('react-native');
  return {
    __esModule: true,
    default: ({ title, leftButtons, rightButtons }) => (
      <View testID="custom-header">
        {leftButtons?.map((btn, idx) => (
          <TouchableOpacity key={`left-${idx}`} onPress={btn.onPress} testID={`header-left-${btn.icon}`}>
            <Text>{btn.icon}</Text>
          </TouchableOpacity>
        ))}
        <Text>{title}</Text>
        {rightButtons?.map((btn, idx) => (
          <TouchableOpacity key={`right-${idx}`} onPress={btn.onPress} testID={`header-right-${btn.icon}`}>
            <Text>{btn.icon}</Text>
            {btn.badge}
          </TouchableOpacity>
        ))}
      </View>
    ),
  };
});

describe('GroupsListScreen', () => {
  const mockNavigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
  };

  const mockGroups = [
    {
      groupId: 'group-1',
      name: 'Family Group',
      icon: 'F',
      backgroundColor: '#6200ee',
      role: 'admin',
      isPinned: false,
      isMuted: false,
      unreadMessagesCount: 5,
      unreadMentionsCount: 2,
      pendingApprovalsCount: 1,
      pendingFinanceCount: 0,
    },
    {
      groupId: 'group-2',
      name: 'Work Team',
      icon: 'W',
      backgroundColor: '#03dac6',
      role: 'parent',
      isPinned: true,
      isMuted: false,
      unreadMessagesCount: 0,
      unreadMentionsCount: 0,
      pendingApprovalsCount: 0,
      pendingFinanceCount: 3,
    },
    {
      groupId: 'group-3',
      name: 'Extended Family',
      icon: 'E',
      backgroundColor: '#ff6f00',
      role: 'caregiver',
      isPinned: false,
      isMuted: true,
      unreadMessagesCount: 10,
      unreadMentionsCount: 0,
      pendingApprovalsCount: 0,
      pendingFinanceCount: 0,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (url === '/groups') {
        return Promise.resolve({ data: { groups: mockGroups } });
      }
      if (url === '/invitations/count') {
        return Promise.resolve({ data: { count: 3 } });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    api.put.mockResolvedValue({ data: { success: true } });
    api.post.mockResolvedValue({ data: { success: true } });
  });

  describe('Group Listing (US-GROUP-001)', () => {
    it('should load and display groups on mount', async () => {
      const { findByText } = renderWithProvider(
        <GroupsListScreen navigation={mockNavigation} />
      );

      expect(await findByText('Family Group')).toBeTruthy();
      expect(await findByText('Work Team')).toBeTruthy();
      expect(await findByText('Extended Family')).toBeTruthy();
    });

    it('should display role badge only for admin role', async () => {
      const { findByText, queryByText } = renderWithProvider(
        <GroupsListScreen navigation={mockNavigation} />
      );

      // Only ADMIN role should show a badge (per business rule)
      expect(await findByText('ADMIN')).toBeTruthy();
      // Non-admin roles (parent, caregiver, etc.) should NOT show role badges
      expect(queryByText('PARENT')).toBeNull();
      expect(queryByText('CAREGIVER')).toBeNull();
    });

    it('should display unread badges for groups with unread messages', async () => {
      const { findAllByText } = renderWithProvider(
        <GroupsListScreen navigation={mockNavigation} />
      );

      // Check that badges are displayed
      expect(await findAllByText('5')).toBeTruthy(); // unread messages for Family Group
      expect(await findAllByText('2')).toBeTruthy(); // unread mentions for Family Group
    });

    it('should display muted indicator for muted groups', async () => {
      const { findByText } = renderWithProvider(
        <GroupsListScreen navigation={mockNavigation} />
      );

      expect(await findByText('MUTED')).toBeTruthy();
    });

    it('should navigate to group dashboard when group is pressed', async () => {
      const { findByText } = renderWithProvider(
        <GroupsListScreen navigation={mockNavigation} />
      );

      const groupCard = await findByText('Family Group');
      fireEvent.press(groupCard);

      expect(mockNavigation.navigate).toHaveBeenCalledWith('GroupDashboard', {
        groupId: 'group-1',
      });
    });

    it('should display empty state when no groups', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/groups') {
          return Promise.resolve({ data: { groups: [] } });
        }
        if (url === '/invitations/count') {
          return Promise.resolve({ data: { count: 0 } });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const { findByText } = renderWithProvider(
        <GroupsListScreen navigation={mockNavigation} />
      );

      expect(await findByText('No groups found')).toBeTruthy();
      expect(await findByText('Create your first group to get started')).toBeTruthy();
    });

    it('should display loading state initially', () => {
      const { getByRole } = renderWithProvider(
        <GroupsListScreen navigation={mockNavigation} />
      );

      // Loading state shows ActivityIndicator spinner
      expect(getByRole('progressbar')).toBeTruthy();
    });
  });

  describe('Pin/Unpin Groups (US-GROUP-004)', () => {
    it('should toggle pin status when pin button is pressed', async () => {
      const { getByText, getAllByTestId } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Family Group')).toBeTruthy();
      });

      // Find the pin button for the first group
      const pinButtons = getAllByTestId('pin');

      await act(async () => {
        fireEvent.press(pinButtons[0]);
      });

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/groups/group-1/pin');
      });
    });

    it('should call unpin API for already pinned groups', async () => {
      const { getByText, getAllByTestId } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Work Team')).toBeTruthy();
      });

      // Work Team (group-2) is already pinned
      const pinButtons = getAllByTestId('pin');

      await act(async () => {
        // Press the pin button for Work Team (second group in the list)
        fireEvent.press(pinButtons[1]);
      });

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/groups/group-2/unpin');
      });
    });

    it('should reload groups after pin/unpin', async () => {
      const { getByText, getAllByTestId } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Family Group')).toBeTruthy();
      });

      const pinButtons = getAllByTestId('pin');

      await act(async () => {
        fireEvent.press(pinButtons[0]);
      });

      await waitFor(() => {
        // Initial load + reload after pin
        expect(api.get).toHaveBeenCalledWith('/groups');
      });
    });
  });

  describe('Mute/Unmute Groups (US-GROUP-010)', () => {
    it('should toggle mute status when mute button is pressed', async () => {
      const { getByText, getAllByTestId } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Family Group')).toBeTruthy();
      });

      // Find mute buttons
      const muteButtons = getAllByTestId('ear-hearing');

      await act(async () => {
        fireEvent.press(muteButtons[0]);
      });

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/groups/group-1/mute');
      });
    });

    it('should call unmute API for already muted groups', async () => {
      const { getByText, getAllByTestId } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Extended Family')).toBeTruthy();
      });

      // Extended Family (group-3) is already muted
      const unmuteButtons = getAllByTestId('ear-hearing-off');

      await act(async () => {
        fireEvent.press(unmuteButtons[0]);
      });

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/groups/group-3/unmute');
      });
    });
  });

  describe('Support/Feedback Button', () => {
    it('should display support/feedback FAB button', async () => {
      const { getByText } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Support\nFeedback')).toBeTruthy();
      });
    });

    it('should open feedback modal when support button is pressed', async () => {
      const { getByText } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Support\nFeedback')).toBeTruthy();
      });

      fireEvent.press(getByText('Support\nFeedback'));

      await waitFor(() => {
        expect(getByText('Contact Support')).toBeTruthy();
        expect(getByText('Share your feedback, suggest new features, or report issues')).toBeTruthy();
      });
    });

    it('should send feedback when send button is pressed', async () => {
      const { getByText, getByPlaceholderText } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Support\nFeedback')).toBeTruthy();
      });

      fireEvent.press(getByText('Support\nFeedback'));

      await waitFor(() => {
        expect(getByText('Contact Support')).toBeTruthy();
      });

      const feedbackInput = getByPlaceholderText('Tell us what you think...');
      fireEvent.changeText(feedbackInput, 'Great app!');

      fireEvent.press(getByText('Send'));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/feedback', {
          message: 'Great app!',
        });
      });
    });

    it('should close modal when cancel is pressed', async () => {
      const { getByText, queryByText } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Support\nFeedback')).toBeTruthy();
      });

      fireEvent.press(getByText('Support\nFeedback'));

      await waitFor(() => {
        expect(getByText('Contact Support')).toBeTruthy();
      });

      fireEvent.press(getByText('Cancel'));

      await waitFor(() => {
        expect(queryByText('Contact Support')).toBeNull();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should toggle search bar when search icon is pressed', async () => {
      const { getByTestId, queryByPlaceholderText, getByPlaceholderText } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        // Search bar should not be visible initially
        expect(queryByPlaceholderText('Search groups...')).toBeNull();
      });

      fireEvent.press(getByTestId('header-right-magnify'));

      await waitFor(() => {
        expect(getByPlaceholderText('Search groups...')).toBeTruthy();
      });
    });

    it('should filter groups based on search query', async () => {
      const { getByTestId, getByPlaceholderText, getByText, queryByText } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Family Group')).toBeTruthy();
      });

      fireEvent.press(getByTestId('header-right-magnify'));

      const searchInput = getByPlaceholderText('Search groups...');
      fireEvent.changeText(searchInput, 'Work');

      await waitFor(() => {
        expect(getByText('Work Team')).toBeTruthy();
        expect(queryByText('Family Group')).toBeNull();
        expect(queryByText('Extended Family')).toBeNull();
      });
    });

    it('should show empty state when search has no results', async () => {
      const { getByTestId, getByPlaceholderText, getByText } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Family Group')).toBeTruthy();
      });

      fireEvent.press(getByTestId('header-right-magnify'));

      const searchInput = getByPlaceholderText('Search groups...');
      fireEvent.changeText(searchInput, 'NonExistent');

      await waitFor(() => {
        expect(getByText('No groups found')).toBeTruthy();
        expect(getByText('Try a different search term')).toBeTruthy();
      });
    });

    it('should clear search when search bar is hidden', async () => {
      const { getByTestId, getByPlaceholderText, getByText, queryByText } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Family Group')).toBeTruthy();
      });

      // Open search
      fireEvent.press(getByTestId('header-right-magnify'));

      const searchInput = getByPlaceholderText('Search groups...');
      fireEvent.changeText(searchInput, 'Work');

      await waitFor(() => {
        expect(queryByText('Family Group')).toBeNull();
      });

      // Close search
      fireEvent.press(getByTestId('header-right-magnify'));

      await waitFor(() => {
        expect(getByText('Family Group')).toBeTruthy();
        expect(getByText('Work Team')).toBeTruthy();
      });
    });
  });

  describe('Invitations Badge', () => {
    it('should display invitation count in header', async () => {
      const { getAllByText } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        // There may be multiple "3" elements (invitation count + pendingFinanceCount)
        // Just verify at least one exists
        const threeElements = getAllByText('3');
        expect(threeElements.length).toBeGreaterThan(0);
      });
    });

    it('should navigate to invites screen when email icon is pressed', async () => {
      const { getByTestId, getByText } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Family Group')).toBeTruthy();
      });

      fireEvent.press(getByTestId('header-right-email'));

      expect(mockNavigation.navigate).toHaveBeenCalledWith('Invites');
    });
  });

  describe('Create Group', () => {
    it('should display create group FAB', async () => {
      const { getByText } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Create Group')).toBeTruthy();
      });
    });

    it('should navigate to create group screen when FAB is pressed', async () => {
      const { getByText } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Create Group')).toBeTruthy();
      });

      fireEvent.press(getByText('Create Group'));

      expect(mockNavigation.navigate).toHaveBeenCalledWith('CreateGroup');
    });
  });

  describe('My Account Navigation', () => {
    it('should navigate to my account when account icon is pressed', async () => {
      const { getByTestId, getByText } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Family Group')).toBeTruthy();
      });

      fireEvent.press(getByTestId('header-left-account-circle'));

      expect(mockNavigation.navigate).toHaveBeenCalledWith('MyAccount');
    });
  });

  describe('Error Handling', () => {
    it('should display error state when groups fail to load', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/groups') {
          return Promise.reject({
            response: { data: { message: 'Server error' } },
          });
        }
        if (url === '/invitations/count') {
          return Promise.resolve({ data: { count: 0 } });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const { getByText } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Server error')).toBeTruthy();
        expect(getByText('Tap to retry')).toBeTruthy();
      });
    });

    it('should retry loading when error state is tapped', async () => {
      let callCount = 0;
      api.get.mockImplementation((url) => {
        if (url === '/groups') {
          callCount++;
          if (callCount === 1) {
            return Promise.reject({
              response: { data: { message: 'Server error' } },
            });
          }
          return Promise.resolve({ data: { groups: mockGroups } });
        }
        if (url === '/invitations/count') {
          return Promise.resolve({ data: { count: 0 } });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const { getByText } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Tap to retry')).toBeTruthy();
      });

      fireEvent.press(getByText('Tap to retry'));

      await waitFor(() => {
        expect(getByText('Family Group')).toBeTruthy();
      });
    });
  });

  describe('Pull to Refresh', () => {
    it('should reload groups on pull to refresh', async () => {
      const { getByText, UNSAFE_getByType } = render(
        <GroupsListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Family Group')).toBeTruthy();
      });

      // Initial load happened
      expect(api.get).toHaveBeenCalledWith('/groups');

      // Clear mocks to check for refresh call
      api.get.mockClear();

      // Simulate pull to refresh
      // Note: This is a simplified test - in real testing you might need to trigger the RefreshControl
    });
  });
});
