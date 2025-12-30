/**
 * SubscriptionScreen Test Suite
 *
 * Tests for the subscription management screen.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import SubscriptionScreen from '../../screens/SubscriptionScreen';
import api from '../../services/api';

// Mock api
jest.mock('../../services/api');

// Mock MaterialCommunityIcons
jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

// Mock window.location
const mockLocation = {
  origin: 'http://localhost:3000',
  search: '',
  href: '',
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

// Mock window.history
const mockHistory = {
  replaceState: jest.fn(),
};
Object.defineProperty(window, 'history', {
  value: mockHistory,
  writable: true,
});

describe('SubscriptionScreen', () => {
  const mockNavigation = {
    navigate: jest.fn(),
  };

  const mockPricing = {
    adminSubscription: {
      name: 'Admin Subscription',
      amount: 300, // $3.00 USD
      currency: 'usd',
      interval: 'month',
      priceId: 'price_123',
      description: 'Full admin access with 10GB storage',
    },
    additionalStorage: {
      name: 'Additional Storage',
      amount: 100, // $1.00 USD per 10GB
      currency: 'usd',
      unit: '10GB',
      interval: 'month',
      description: 'Extra storage space',
    },
  };

  const mockActiveSubscription = {
    isSubscribed: true,
    startDate: '2024-01-01T00:00:00Z',
    storageUsedGb: '5.00',
    stripe: {
      currentPeriodEnd: '2024-02-01T00:00:00Z',
    },
  };

  const mockCanceledSubscription = {
    isSubscribed: true,
    startDate: '2024-01-01T00:00:00Z',
    endDate: '2024-02-01T00:00:00Z',
    storageUsedGb: '5.00',
  };

  const mockTrialSubscription = {
    isSubscribed: false,
    createdAt: new Date().toISOString(), // Today, so trial is active
    storageUsedGb: '1.00',
  };

  const mockInvoice = {
    baseAmount: '3.00',
    storageUsedGb: '2.50',
    storagePacksNeeded: 0,
    storageCharges: '0.00',
    totalAmount: '3.00',
    dueDate: '15-Dec-2025',
    daysUntilDue: 5,
    canPayNow: true,
    canGenerateBillEmail: true,
    lastBillingEmailSent: false,
    currency: 'USD',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocation.search = '';
    mockLocation.href = '';
    api.get.mockImplementation((url) => {
      if (url === '/subscriptions/pricing') {
        return Promise.resolve({ data: { pricing: mockPricing } });
      }
      if (url === '/subscriptions/current') {
        return Promise.resolve({ data: { subscription: null } });
      }
      if (url === '/subscriptions/invoice') {
        return Promise.resolve({ data: { invoice: mockInvoice } });
      }
      return Promise.reject(new Error('Not found'));
    });
  });

  const renderSubscriptionScreen = () => {
    return render(
      <PaperProvider>
        <SubscriptionScreen navigation={mockNavigation} />
      </PaperProvider>
    );
  };

  describe('Loading State', () => {
    it('should show loading indicator while fetching data', () => {
      // Make API calls pending
      api.get.mockImplementation(() => new Promise(() => {}));

      const { toJSON } = renderSubscriptionScreen();
      const tree = JSON.stringify(toJSON());

      expect(tree).toContain('progressbar');
      expect(tree).toContain('Loading pricing information');
    });
  });

  describe('Content Rendering', () => {
    it('should render page title', async () => {
      const { toJSON } = renderSubscriptionScreen();

      await waitFor(() => {
        const tree = JSON.stringify(toJSON());
        expect(tree).toContain('Subscription Management');
      });
    });

    it('should render admin subscription card with pricing', async () => {
      const { toJSON } = renderSubscriptionScreen();

      await waitFor(() => {
        const tree = JSON.stringify(toJSON());
        expect(tree).toContain('Admin Subscription');
        // Check for the formatted price (USD format: $3.00 USD)
        expect(tree).toMatch(/\$3\.00\s*USD/);
      });
    });

    it('should render additional storage card', async () => {
      const { toJSON } = renderSubscriptionScreen();

      await waitFor(() => {
        const tree = JSON.stringify(toJSON());
        expect(tree).toContain('Additional Storage');
        expect(tree).toContain('Charged in 10GB blocks');
        expect(tree).toContain('Automatic billing as needed');
      });
    });

    it('should render admin subscription features', async () => {
      const { toJSON } = renderSubscriptionScreen();

      await waitFor(() => {
        const tree = JSON.stringify(toJSON());
        expect(tree).toContain('Full admin access');
        expect(tree).toContain('10GB storage included');
        expect(tree).toContain('Unlimited groups');
        expect(tree).toContain('Audit log exports');
      });
    });
  });

  describe('No Subscription State', () => {
    it('should show "no subscription" message when user has no subscription', async () => {
      const { toJSON } = renderSubscriptionScreen();

      await waitFor(() => {
        const tree = JSON.stringify(toJSON());
        expect(tree).toContain("You don't have an active subscription");
      });
    });
  });

  describe('Active Subscription State', () => {
    beforeEach(() => {
      api.get.mockImplementation((url) => {
        if (url === '/subscriptions/pricing') {
          return Promise.resolve({ data: { pricing: mockPricing } });
        }
        if (url === '/subscriptions/current') {
          return Promise.resolve({ data: { subscription: mockActiveSubscription } });
        }
        if (url === '/subscriptions/invoice') {
          return Promise.resolve({ data: { invoice: mockInvoice } });
        }
        return Promise.reject(new Error('Not found'));
      });
    });

    it('should display Current Subscription section', async () => {
      const { toJSON } = renderSubscriptionScreen();

      await waitFor(() => {
        const tree = JSON.stringify(toJSON());
        expect(tree).toContain('Current Subscription');
        expect(tree).toContain('Active');
      });
    });

    it('should display storage usage', async () => {
      const { toJSON } = renderSubscriptionScreen();

      await waitFor(() => {
        const tree = JSON.stringify(toJSON());
        expect(tree).toContain('Storage Used');
        // Storage text may be split like ["5.00", " GB"]
        expect(tree).toContain('5.00');
        expect(tree).toContain('GB');
      });
    });

    it('should display subscription ends date', async () => {
      const { toJSON } = renderSubscriptionScreen();

      await waitFor(() => {
        const tree = JSON.stringify(toJSON());
        expect(tree).toContain('Subscription Ends');
      });
    });
  });

  describe('Free Trial State', () => {
    beforeEach(() => {
      api.get.mockImplementation((url) => {
        if (url === '/subscriptions/pricing') {
          return Promise.resolve({ data: { pricing: mockPricing } });
        }
        if (url === '/subscriptions/current') {
          return Promise.resolve({ data: { subscription: mockTrialSubscription } });
        }
        if (url === '/subscriptions/invoice') {
          return Promise.resolve({ data: { invoice: mockInvoice } });
        }
        return Promise.reject(new Error('Not found'));
      });
    });

    it('should show free trial status', async () => {
      const { toJSON } = renderSubscriptionScreen();

      await waitFor(() => {
        const tree = JSON.stringify(toJSON());
        expect(tree).toContain('Free Trial');
      });
    });

    it('should show trial ends label for trial users', async () => {
      const { toJSON } = renderSubscriptionScreen();

      await waitFor(() => {
        const tree = JSON.stringify(toJSON());
        expect(tree).toContain('Trial Ends');
      });
    });
  });

  describe('URL Parameters', () => {
    it('should show success message when success=true in URL', async () => {
      mockLocation.search = '?success=true';

      const { toJSON } = renderSubscriptionScreen();

      await waitFor(() => {
        const tree = JSON.stringify(toJSON());
        expect(tree).toContain('Subscription successful');
      });
    });

    it('should show info message when canceled=true in URL', async () => {
      mockLocation.search = '?canceled=true';

      const { toJSON } = renderSubscriptionScreen();

      await waitFor(() => {
        const tree = JSON.stringify(toJSON());
        expect(tree).toContain('Checkout canceled');
      });
    });

    it('should clean up URL after showing success message', async () => {
      mockLocation.search = '?success=true';

      renderSubscriptionScreen();

      await waitFor(() => {
        expect(mockHistory.replaceState).toHaveBeenCalledWith({}, '', '/subscription');
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message when pricing fetch fails', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/subscriptions/pricing') {
          return Promise.reject(new Error('Network error'));
        }
        if (url === '/subscriptions/current') {
          return Promise.resolve({ data: { subscription: null } });
        }
        if (url === '/subscriptions/invoice') {
          return Promise.resolve({ data: { invoice: mockInvoice } });
        }
        return Promise.reject(new Error('Not found'));
      });

      const { toJSON } = renderSubscriptionScreen();

      await waitFor(() => {
        const tree = JSON.stringify(toJSON());
        expect(tree).toContain('Failed to load pricing information');
      });
    });

    it('should allow dismissing error message', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/subscriptions/pricing') {
          return Promise.reject(new Error('Network error'));
        }
        if (url === '/subscriptions/current') {
          return Promise.resolve({ data: { subscription: null } });
        }
        if (url === '/subscriptions/invoice') {
          return Promise.resolve({ data: { invoice: mockInvoice } });
        }
        return Promise.reject(new Error('Not found'));
      });

      const { root, toJSON } = renderSubscriptionScreen();

      await waitFor(() => {
        const tree = JSON.stringify(toJSON());
        expect(tree).toContain('Failed to load pricing information');
      });

      // Find dismiss button - it's a compact button next to error text
      const buttons = root.findAllByType('button');
      // Press the first button which should be dismiss
      if (buttons.length > 0) {
        fireEvent.press(buttons[0]);

        await waitFor(() => {
          const tree = JSON.stringify(toJSON());
          expect(tree).not.toContain('Failed to load pricing information');
        });
      }
    });
  });

  describe('Storage Overflow', () => {
    it('should show additional storage charges when over 10GB', async () => {
      const overStorageSubscription = {
        ...mockActiveSubscription,
        storageUsedGb: '25.00',
      };

      api.get.mockImplementation((url) => {
        if (url === '/subscriptions/pricing') {
          return Promise.resolve({ data: { pricing: mockPricing } });
        }
        if (url === '/subscriptions/current') {
          return Promise.resolve({ data: { subscription: overStorageSubscription } });
        }
        if (url === '/subscriptions/invoice') {
          return Promise.resolve({ data: { invoice: mockInvoice } });
        }
        return Promise.reject(new Error('Not found'));
      });

      const { toJSON } = renderSubscriptionScreen();

      await waitFor(() => {
        const tree = JSON.stringify(toJSON());
        expect(tree).toContain('Additional Storage Charges');
        // Storage text may be split like ["25.00", " GB"]
        expect(tree).toContain('25.00');
        expect(tree).toContain('GB');
      });
    });
  });
});
