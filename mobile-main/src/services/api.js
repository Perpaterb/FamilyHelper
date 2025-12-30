/**
 * API Service
 *
 * Central API configuration and Axios instance for all API calls.
 * Handles authentication tokens, request/response interceptors, and error handling.
 *
 * Features:
 * - Uses Kinde tokens directly (Phase 2 - no custom JWT)
 * - Automatic token refresh via Kinde's token endpoint
 * - Prevents race conditions during simultaneous refreshes
 * - Silent error handling - never shows technical errors to users
 */

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import authEvents from './authEvents';
import { hasTokenRefresher, refreshToken as refreshFromProvider } from './tokenProvider';

// Error codes that indicate group is in read-only mode
const READ_ONLY_ERROR_CODES = ['GROUP_NO_ACTIVE_ADMIN', 'GROUP_READ_ONLY_UNTIL', 'GROUP_READ_ONLY'];

// API Base URL - uses environment variable with fallback to localhost
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Kinde configuration for token refresh
const KINDE_DOMAIN = process.env.EXPO_PUBLIC_KINDE_DOMAIN || 'familyhelperapp.kinde.com';
const KINDE_CLIENT_ID = process.env.EXPO_PUBLIC_KINDE_CLIENT_ID || '';

/**
 * Create Axios instance with base configuration
 */
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Token refresh state management
 * Prevents race conditions when multiple requests fail simultaneously
 */
let isRefreshing = false;
let failedRequestsQueue = [];

/**
 * Request interceptor - Add auth token to all requests
 */
api.interceptors.request.use(
  async (config) => {
    try {
      // Get access token from secure storage
      const accessToken = await SecureStore.getItemAsync('accessToken');

      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }

      return config;
    } catch (error) {
      console.error('Error adding auth token to request:', error);
      return config;
    }
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Process queued requests after successful token refresh
 * @param {Error|null} error - Error if refresh failed, null if successful
 * @param {string|null} token - New access token if successful
 */
function processQueue(error, token = null) {
  failedRequestsQueue.forEach(promise => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token);
    }
  });

  failedRequestsQueue = [];
}

/**
 * Response interceptor - Handle errors and token refresh
 * Includes request queuing to prevent race conditions
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle read-only group errors (403 with specific error codes)
    if (error.response?.status === 403) {
      const errorCode = error.response?.data?.code;
      if (READ_ONLY_ERROR_CODES.includes(errorCode)) {
        // Show user-friendly alert
        Alert.alert(
          'Group is Read-Only',
          error.response?.data?.message || 'This group is in read-only mode. An admin needs to subscribe to restore full access.',
          [{ text: 'OK' }]
        );

        // Mark error as handled so components don't show their own error
        error.isReadOnlyError = true;
        error.silent = true;
        return Promise.reject(error);
      }
    }

    // If 401 Unauthorized and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Another request is already refreshing the token
        // Queue this request and wait for the refresh to complete
        return new Promise((resolve, reject) => {
          failedRequestsQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch(err => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Check if we have a token provider (web-admin with Kinde SDK)
        if (hasTokenRefresher()) {
          const newToken = await refreshFromProvider();

          if (newToken) {
            // Store the new token
            await SecureStore.setItemAsync('accessToken', newToken);
            api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

            processQueue(null, newToken);
            isRefreshing = false;

            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          }

          // Token provider failed - trigger logout
          processQueue(new Error('Token refresh failed'));
          isRefreshing = false;

          await SecureStore.deleteItemAsync('accessToken');
          authEvents.emitLogout('token_provider_refresh_failed');

          const authError = new Error('Session expired');
          authError.isAuthError = true;
          authError.silent = true;
          return Promise.reject(authError);
        }

        // Mobile flow: Attempt to refresh token using Kinde's token endpoint
        const refreshToken = await SecureStore.getItemAsync('refreshToken');

        if (!refreshToken) {
          // No refresh token available - logout immediately
          isRefreshing = false;
          processQueue(new Error('No refresh token available'));

          console.log('[API] No refresh token - triggering logout');
          await SecureStore.deleteItemAsync('accessToken');
          authEvents.emitLogout('no_refresh_token');

          const authError = new Error('Please log in again.');
          authError.isAuthError = true;
          return Promise.reject(authError);
        }

        // Refresh using Kinde's token endpoint (Phase 2)
        const response = await axios.post(
          `https://${KINDE_DOMAIN}/oauth2/token`,
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: KINDE_CLIENT_ID,
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        );

        const { access_token: newAccessToken, refresh_token: newRefreshToken } = response.data;

        // Store new tokens
        await SecureStore.setItemAsync('accessToken', newAccessToken);
        if (newRefreshToken) {
          await SecureStore.setItemAsync('refreshToken', newRefreshToken);
        }

        // Update default header for future requests
        api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;

        // Process all queued requests with the new token
        processQueue(null, newAccessToken);

        isRefreshing = false;

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - user needs to login again
        processQueue(refreshError);
        isRefreshing = false;

        console.log('[API] Kinde token refresh failed - triggering logout');

        // Clear stored tokens
        await SecureStore.deleteItemAsync('accessToken');
        await SecureStore.deleteItemAsync('refreshToken');

        // Emit logout event to App.js
        authEvents.emitLogout('token_refresh_failed');

        // Don't show technical error messages to users
        // App.js will handle the logout and show login screen
        const authError = new Error('Session expired');
        authError.isAuthError = true;
        authError.silent = true; // Flag to prevent error display
        return Promise.reject(authError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
export { API_BASE_URL };
