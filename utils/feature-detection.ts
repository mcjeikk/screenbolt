/**
 * ScreenBolt — Feature Detection Utilities
 *
 * Cross-browser feature detection for Chrome extension APIs.
 * Uses capability checks instead of browser sniffing for forward compatibility.
 */

/** Side Panel API (Chrome 114+). */
export function hasSidePanelSupport(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.sidePanel;
}

/** Offscreen Document API (Chrome 109+). */
export function hasOffscreenSupport(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.offscreen;
}

/** chrome.scripting API (Chrome 88+, MV3). */
export function hasScriptingSupport(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.scripting;
}

/** chrome.tabCapture API. */
export function hasTabCaptureSupport(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.tabCapture;
}

/** chrome.desktopCapture API. */
export function hasDesktopCaptureSupport(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.desktopCapture;
}

/** chrome.notifications API. */
export function hasNotificationsSupport(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.notifications;
}

/** chrome.alarms API (used for SW keepalive). */
export function hasAlarmsSupport(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.alarms;
}

/** runtime.getContexts (Chrome 116+). Used for offscreen document lifecycle management. */
export function hasGetContextsSupport(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime && typeof chrome.runtime.getContexts === 'function';
}

/** Checks if the browser is running on a Chromium base. */
export function isChromium(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

/** Check if a specific permission has been granted. */
export async function hasPermission(permission: chrome.runtime.ManifestPermission): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ permissions: [permission] });
  } catch {
    return false;
  }
}

/** Request a specific optional permission from the user. Returns true if granted. */
export async function requestPermission(permission: chrome.runtime.ManifestPermission): Promise<boolean> {
  try {
    return await chrome.permissions.request({ permissions: [permission] });
  } catch {
    return false;
  }
}
