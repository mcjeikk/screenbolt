/**
 * ScreenSnap — Theme Initialization Script
 * Include this in every page to auto-apply the saved theme preference.
 * Must run BEFORE DOMContentLoaded to prevent flash.
 */
(async () => {
  try {
    const result = await chrome.storage.sync.get('settings');
    const theme = result?.settings?.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
