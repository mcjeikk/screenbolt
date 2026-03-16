/**
 * @file ScreenBolt — Feature Detection Utilities
 * @description Provides cross-browser feature detection for Chrome extension APIs.
 * Uses capability checks instead of browser sniffing for forward compatibility.
 * @version 0.5.1
 */

/**
 * Check if the Side Panel API is available (Chrome 114+).
 * @returns {boolean}
 */
export function hasSidePanelSupport() {
  return typeof chrome !== 'undefined' && !!chrome.sidePanel;
}

/**
 * Check if the Offscreen Document API is available (Chrome 109+).
 * @returns {boolean}
 */
export function hasOffscreenSupport() {
  return typeof chrome !== 'undefined' && !!chrome.offscreen;
}

/**
 * Check if the chrome.scripting API is available (Chrome 88+, MV3).
 * @returns {boolean}
 */
export function hasScriptingSupport() {
  return typeof chrome !== 'undefined' && !!chrome.scripting;
}

/**
 * Check if chrome.tabCapture is available.
 * @returns {boolean}
 */
export function hasTabCaptureSupport() {
  return typeof chrome !== 'undefined' && !!chrome.tabCapture;
}

/**
 * Check if chrome.desktopCapture is available.
 * @returns {boolean}
 */
export function hasDesktopCaptureSupport() {
  return typeof chrome !== 'undefined' && !!chrome.desktopCapture;
}

/**
 * Check if chrome.notifications is available.
 * @returns {boolean}
 */
export function hasNotificationsSupport() {
  return typeof chrome !== 'undefined' && !!chrome.notifications;
}

/**
 * Check if chrome.alarms is available (used for SW keepalive).
 * @returns {boolean}
 */
export function hasAlarmsSupport() {
  return typeof chrome !== 'undefined' && !!chrome.alarms;
}

/**
 * Check if runtime.getContexts is available (Chrome 116+).
 * Used for offscreen document lifecycle management.
 * @returns {boolean}
 */
export function hasGetContextsSupport() {
  return typeof chrome !== 'undefined' &&
         !!chrome.runtime &&
         typeof chrome.runtime.getContexts === 'function';
}

/**
 * Check if the browser is running on a Chromium base.
 * @returns {boolean}
 */
export function isChromium() {
  return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

/**
 * Check if a specific permission has been granted.
 * @param {string} permission - Permission name to check
 * @returns {Promise<boolean>}
 */
export async function hasPermission(permission) {
  try {
    return await chrome.permissions.contains({ permissions: [permission] });
  } catch {
    return false;
  }
}

/**
 * Request a specific optional permission from the user.
 * @param {string} permission - Permission name to request
 * @returns {Promise<boolean>} True if granted
 */
export async function requestPermission(permission) {
  try {
    return await chrome.permissions.request({ permissions: [permission] });
  } catch {
    return false;
  }
}
