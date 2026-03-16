/**
 * ScreenSnap — Popup Script v0.4.0
 * Handles button clicks, recording indicator, last capture, and settings integration.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Screenshot buttons
  document.getElementById('btn-visible').addEventListener('click', () => captureAction('capture-visible'));
  document.getElementById('btn-full').addEventListener('click', () => captureAction('capture-full-page'));
  document.getElementById('btn-selection').addEventListener('click', () => captureAction('capture-selection'));

  // Record buttons
  document.getElementById('btn-record-tab').addEventListener('click', () => openRecorder('tab'));
  document.getElementById('btn-record-screen').addEventListener('click', () => openRecorder('screen'));
  document.getElementById('btn-record-cam').addEventListener('click', () => openRecorder('camera'));

  // Footer buttons — correct URLs
  document.getElementById('btn-history').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
    window.close();
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
    window.close();
  });

  // Check recording status
  await checkRecordingStatus();

  // Show last capture
  await showLastCapture();
});

/**
 * Open the recorder configuration page with the given source.
 */
function openRecorder(source) {
  const url = chrome.runtime.getURL(`recorder/recorder.html?source=${source}`);
  chrome.tabs.create({ url });
  window.close();
}

/**
 * Send capture action to background and handle response.
 */
async function captureAction(action) {
  try {
    if (action === 'capture-selection' || action === 'capture-full-page') {
      await chrome.runtime.sendMessage({ action });
      window.close();
      return;
    }

    const response = await chrome.runtime.sendMessage({ action });

    if (response?.success && response.dataUrl) {
      // Check settings for after-capture action
      const settings = await getSettings();
      const afterCapture = settings.afterCapture || 'editor';

      if (afterCapture === 'clipboard') {
        // Copy to clipboard via background
        await chrome.runtime.sendMessage({ action: 'copy-to-clipboard', dataUrl: response.dataUrl });
        window.close();
      } else if (afterCapture === 'save') {
        // Save directly
        await chrome.runtime.sendMessage({
          action: 'save-capture',
          dataUrl: response.dataUrl,
          format: settings.screenshotFormat || 'png'
        });
        window.close();
      } else {
        // Open editor (default)
        await chrome.storage.local.set({ pendingCapture: response.dataUrl });
        await chrome.tabs.create({ url: chrome.runtime.getURL('editor/editor.html') });
        window.close();
      }
    } else {
      showError(response?.error || 'Capture failed');
    }
  } catch (error) {
    showError(error.message);
  }
}

/**
 * Check if a recording is in progress and show indicator.
 */
async function checkRecordingStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'get-recording-status' });
    if (response?.isRecording) {
      document.getElementById('recording-indicator').style.display = 'flex';
    }
  } catch (e) {
    // Service worker might not have that handler yet, ignore
  }
}

/**
 * Show the last capture thumbnail and quick access.
 */
async function showLastCapture() {
  try {
    const result = await chrome.storage.local.get('historyEntries');
    const entries = result.historyEntries || [];
    if (entries.length === 0) return;

    // Get most recent
    const last = entries.sort((a, b) => b.timestamp - a.timestamp)[0];
    if (!last.thumbnail) return;

    const container = document.getElementById('last-capture');
    const thumb = document.getElementById('last-capture-thumb');
    const name = document.getElementById('last-capture-name');

    thumb.src = last.thumbnail;
    name.textContent = last.name;
    container.style.display = 'flex';

    document.getElementById('btn-open-last').addEventListener('click', () => {
      if (last.type === 'screenshot' && last.dataUrl) {
        chrome.storage.local.set({ pendingCapture: last.dataUrl }, () => {
          chrome.tabs.create({ url: chrome.runtime.getURL('editor/editor.html') });
          window.close();
        });
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
        window.close();
      }
    });
  } catch (e) {
    // Silently ignore
  }
}

/**
 * Load settings from sync storage.
 */
async function getSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    return result.settings || {};
  } catch (e) {
    return {};
  }
}

/**
 * Show error feedback in the popup.
 */
function showError(message) {
  const container = document.querySelector('.container');
  const errorEl = document.createElement('div');
  errorEl.className = 'error-toast';
  errorEl.textContent = `⚠️ ${message}`;
  errorEl.style.cssText = `
    position: fixed; bottom: 8px; left: 8px; right: 8px;
    padding: 8px 12px; background: #FEE2E2; color: #DC2626;
    border-radius: 6px; font-size: 12px; text-align: center;
  `;
  container.appendChild(errorEl);
  setTimeout(() => errorEl.remove(), 3000);
}
