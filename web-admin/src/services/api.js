/**
 * API Service
 *
 * Axios instance configured for the Family Helper API.
 * Handles authentication tokens, error handling, and request/response interceptors.
 *
 * Phase 2: Uses Kinde tokens directly (no custom JWT)
 */

import axios from 'axios';
import config from '../config/env';
import { hasTokenRefresher, refreshToken as refreshFromProvider } from '../../../mobile-main/src/services/tokenProvider';

// Error codes that indicate group is in read-only mode
const READ_ONLY_ERROR_CODES = ['GROUP_NO_ACTIVE_ADMIN', 'GROUP_READ_ONLY_UNTIL', 'GROUP_READ_ONLY'];

/**
 * Create axios instance with base configuration
 */
const api = axios.create({
  baseURL: config.api.url,
  timeout: config.api.timeout,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send cookies with requests (for refresh token)
});

/**
 * Request Interceptor
 * Add access token to all requests
 */
api.interceptors.request.use(
  (config) => {
    // Get access token from localStorage
    const accessToken = localStorage.getItem('accessToken');

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    // Log request in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] ${config.method.toUpperCase()} ${config.url}`);
    }

    return config;
  },
  (error) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor
 * Handle errors and token refresh
 */
api.interceptors.response.use(
  (response) => {
    // Log response in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] ${response.status} ${response.config.url}`);
    }

    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle read-only group errors (403 with specific error codes)
    if (error.response?.status === 403) {
      const errorCode = error.response?.data?.code;
      if (READ_ONLY_ERROR_CODES.includes(errorCode)) {
        // Show user-friendly alert
        window.alert(
          error.response?.data?.message || 'This group is in read-only mode. An admin needs to subscribe to restore full access.'
        );

        // Mark error as handled so components don't show their own error
        error.isReadOnlyError = true;
        error.silent = true;
        return Promise.reject(error);
      }
    }

    // If 401 error and we haven't already tried to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Use tokenProvider to get a fresh token from Kinde SDK
        if (!hasTokenRefresher()) {
          localStorage.removeItem('accessToken');
          console.warn('[API] No token refresher available - user will be redirected by auth state change');
          return Promise.reject(new Error('No token refresher'));
        }

        const newToken = await refreshFromProvider();

        if (!newToken) {
          localStorage.removeItem('accessToken');
          console.warn('[API] Token refresh returned null - user will be redirected by auth state change');
          return Promise.reject(new Error('Token refresh failed'));
        }

        // Store new token
        localStorage.setItem('accessToken', newToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - clear tokens
        // DO NOT redirect here! Let Kinde's isAuthenticated state handle navigation.
        localStorage.removeItem('accessToken');
        console.warn('[API] Kinde token refresh failed - user will be redirected by auth state change');
        return Promise.reject(refreshError);
      }
    }

    // Log error in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[API] Response error:', error.response?.data || error.message);
    }

    return Promise.reject(error);
  }
);

export default api;
