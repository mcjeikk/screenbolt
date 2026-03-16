/**
 * @file ScreenSnap — Theme Initialization Script
 * @description Auto-applies the saved theme preference before DOMContentLoaded
 * to prevent flash of unstyled/wrong-themed content. Must be loaded synchronously
 * in the <head> of every page.
 * @version 0.4.1
 */
(async () => {
  try {
    const result = await chrome.storage.sync.get('settings');
    const theme = result?.settings?.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
