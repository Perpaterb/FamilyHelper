/**
 * Token Provider
 *
 * Provides a way for api.js to get fresh tokens without knowing
 * the underlying auth mechanism (manual OAuth vs Kinde SDK).
 *
 * Mobile-main: Uses stored refresh token (traditional OAuth)
 * Web-admin: Uses Kinde SDK's getToken() which handles refresh internally
 */

let tokenRefresher = null;

/**
 * Register a token refresher function
 * Called by the auth provider (App.js in web-admin)
 * @param {Function} refresher - Async function that returns a fresh access token
 */
export function setTokenRefresher(refresher) {
  tokenRefresher = refresher;
}

/**
 * Get a fresh token using the registered refresher
 * @returns {Promise<string|null>} Fresh access token or null if no refresher registered
 */
export async function refreshToken() {
  if (!tokenRefresher) {
    return null;
  }

  try {
    const token = await tokenRefresher();
    return token;
  } catch (error) {
    console.error('[TokenProvider] Refresh failed:', error);
    return null;
  }
}

/**
 * Check if a token refresher is registered
 * @returns {boolean}
 */
export function hasTokenRefresher() {
  return tokenRefresher !== null;
}

/**
 * Clear the token refresher (on logout)
 */
export function clearTokenRefresher() {
  tokenRefresher = null;
}
