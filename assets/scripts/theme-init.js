/**
 * @file ScreenBolt — Theme Initialization & Global Error Boundaries
 * @description Auto-applies the saved theme preference before DOMContentLoaded
 * to prevent flash of unstyled/wrong-themed content. Also installs global
 * error handlers for uncaught exceptions and unhandled promise rejections.
 * Must be loaded synchronously in the <head> of every page.
 * @version 0.5.0
 */

// ── Global Error Boundaries ─────────────────────────
// Catch uncaught errors and show a user-friendly toast instead of silent failure.

/**
 * Show a temporary error toast on the page.
 * @param {string} message - Error message to display
 */
function __screenBoltShowErrorToast(message) {
  if (!document.body) return;
  const existing = document.querySelector('.screenbolt-global-error-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'screenbolt-global-error-toast';
  toast.setAttribute('role', 'alert');
  toast.textContent = '\u26A0\uFE0F ' + (message || 'Something went wrong');
  toast.style.cssText =
    'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);' +
    'padding:10px 20px;background:#DC2626;color:#fff;border-radius:8px;' +
    'font-size:13px;font-weight:500;z-index:999999;' +
    'box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:none;';
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 4000);
}

window.addEventListener('error', (event) => {
  console.error('[ScreenBolt] Uncaught error:', event.error || event.message);
  __screenBoltShowErrorToast(event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason || 'Async error');
  console.error('[ScreenBolt] Unhandled promise rejection:', reason);
  __screenBoltShowErrorToast(message);
});

// ── Theme Initialization ────────────────────────────
(async () => {
  try {
    const result = await chrome.storage.sync.get('settings');
    const theme = result?.settings?.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
