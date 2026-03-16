/**
 * ScreenSnap — Background Service Worker (MV3)
 * Handles capture commands, keyboard shortcuts, and message routing.
 */

// Listen for keyboard shortcut commands
chrome.commands.onCommand.addListener(async (command) => {
  const tab = await getCurrentTab();
  if (!tab) return;

  switch (command) {
    case 'capture-visible':
      await captureVisibleArea(tab);
      break;
    case 'capture-full':
      await sendToContent(tab.id, { action: 'capture-full-page' });
      break;
    case 'capture-selection':
      await sendToContent(tab.id, { action: 'start-selection' });
      break;
  }
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

/**
 * Route incoming messages to appropriate handlers.
 */
async function handleMessage(message, sender) {
  switch (message.action) {
    case 'capture-visible':
      return await captureVisibleArea();

    case 'capture-full-page':
      return await initiateFullPageCapture(sender.tab?.id);

    case 'capture-selection':
      return await initiateSelectionCapture(sender.tab?.id);

    case 'full-page-data':
      // Content script sends back stitched image data
      return await processCapture(message.dataUrl, message.filename);

    case 'selection-data':
      return await processCapture(message.dataUrl, message.filename);

    case 'save-capture':
      return await saveCapture(message.dataUrl, message.filename, message.format);

    case 'copy-to-clipboard':
      return await copyToClipboard(message.dataUrl);

    default:
      console.warn('[ScreenSnap] Unknown action:', message.action);
      return { success: false, error: 'Unknown action' };
  }
}

/**
 * Capture the visible area of the current tab.
 */
async function captureVisibleArea(tab) {
  try {
    const settings = await getSettings();
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: settings.format || 'png',
      quality: settings.quality || 92,
    });
    return { success: true, dataUrl };
  } catch (error) {
    console.error('[ScreenSnap] Capture visible failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Tell content script to start full page scroll capture.
 */
async function initiateFullPageCapture(tabId) {
  const tab = tabId ? { id: tabId } : await getCurrentTab();
  if (!tab?.id) return { success: false, error: 'No active tab' };

  await sendToContent(tab.id, { action: 'capture-full-page' });
  return { success: true };
}

/**
 * Tell content script to show selection overlay.
 */
async function initiateSelectionCapture(tabId) {
  const tab = tabId ? { id: tabId } : await getCurrentTab();
  if (!tab?.id) return { success: false, error: 'No active tab' };

  await sendToContent(tab.id, { action: 'start-selection' });
  return { success: true };
}

/**
 * Process a captured image — open in editor or save directly.
 */
async function processCapture(dataUrl, filename) {
  const settings = await getSettings();

  if (settings.openEditor !== false) {
    // Open editor tab with the capture
    const editorUrl = chrome.runtime.getURL('editor/editor.html');
    await chrome.storage.local.set({ pendingCapture: dataUrl });
    await chrome.tabs.create({ url: editorUrl });
  } else {
    await saveCapture(dataUrl, filename);
  }

  return { success: true };
}

/**
 * Save capture to disk via chrome.downloads.
 */
async function saveCapture(dataUrl, filename, format) {
  const settings = await getSettings();
  const ext = format || settings.format || 'png';
  const name = filename || `ScreenSnap_${getTimestamp()}.${ext}`;

  try {
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: name,
      saveAs: settings.askSaveLocation || false,
    });
    return { success: true, downloadId };
  } catch (error) {
    console.error('[ScreenSnap] Save failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Copy image data to clipboard using offscreen document.
 */
async function copyToClipboard(dataUrl) {
  try {
    // MV3 requires offscreen document for clipboard access
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({
      action: 'offscreen-copy-clipboard',
      dataUrl,
    });
    return { success: true };
  } catch (error) {
    console.error('[ScreenSnap] Clipboard copy failed:', error);
    return { success: false, error: error.message };
  }
}

// ── Helpers ──────────────────────────────────────────

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToContent(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

async function getSettings() {
  const result = await chrome.storage.local.get('settings');
  return result.settings || {};
}

function getTimestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}-${String(d.getSeconds()).padStart(2, '0')}`;
}

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['CLIPBOARD'],
    justification: 'Copy screenshot to clipboard',
  });
}
