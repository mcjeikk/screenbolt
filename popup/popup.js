/**
 * ScreenSnap — Popup Script
 * Handles button clicks and communicates with the background service worker.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Screenshot buttons
  document.getElementById('btn-visible').addEventListener('click', () => {
    captureAction('capture-visible');
  });

  document.getElementById('btn-full').addEventListener('click', () => {
    captureAction('capture-full-page');
  });

  document.getElementById('btn-selection').addEventListener('click', () => {
    captureAction('capture-selection');
  });

  // Footer buttons
  document.getElementById('btn-history').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('editor/history.html') });
    window.close();
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('editor/settings.html') });
    window.close();
  });
});

/**
 * Send capture action to background and handle response.
 */
async function captureAction(action) {
  try {
    // For selection and full page, we need to close popup first
    // because popup blocks content script interaction
    if (action === 'capture-selection' || action === 'capture-full-page') {
      await chrome.runtime.sendMessage({ action });
      window.close();
      return;
    }

    // For visible capture, get result directly
    const response = await chrome.runtime.sendMessage({ action });

    if (response?.success && response.dataUrl) {
      // Store capture and open editor
      await chrome.storage.local.set({ pendingCapture: response.dataUrl });
      await chrome.tabs.create({
        url: chrome.runtime.getURL('editor/editor.html'),
      });
      window.close();
    } else {
      showError(response?.error || 'Capture failed');
    }
  } catch (error) {
    showError(error.message);
  }
}

/**
 * Show error feedback in the popup.
 */
function showError(message) {
  // Brief visual feedback
  const container = document.querySelector('.container');
  const errorEl = document.createElement('div');
  errorEl.className = 'error-toast';
  errorEl.textContent = `⚠️ ${message}`;
  errorEl.style.cssText = `
    position: fixed;
    bottom: 8px;
    left: 8px;
    right: 8px;
    padding: 8px 12px;
    background: #FEE2E2;
    color: #DC2626;
    border-radius: 6px;
    font-size: 12px;
    text-align: center;
  `;
  container.appendChild(errorEl);
  setTimeout(() => errorEl.remove(), 3000);
}
