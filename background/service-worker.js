/**
 * ScreenSnap — Background Service Worker v0.4.0 (MV3)
 * Handles capture commands, keyboard shortcuts, recording coordination,
 * notifications, onInstalled welcome page, and history management.
 */

// ── Recording State ─────────────────────────────────
let isRecording = false;
let recorderTabId = null;
let recordingTargetTabId = null;

// ── onInstalled — Welcome page & setup ──────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // First install: show welcome page
    const result = await chrome.storage.local.get('onboardingComplete');
    if (!result.onboardingComplete) {
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
    }

    // Set default settings
    const existing = await chrome.storage.sync.get('settings');
    if (!existing.settings) {
      await chrome.storage.sync.set({
        settings: {
          screenshotFormat: 'png',
          jpgQuality: 92,
          afterCapture: 'editor',
          saveSubfolder: '',
          recResolution: '1080',
          recAudio: 'both',
          recPip: 'off',
          recPipPosition: 'bottom-right',
          recPipSize: 'medium',
          recCountdown: 'on',
          recFormat: 'webm',
          theme: 'dark',
          notifications: 'on',
          keepHistory: 'on',
          maxHistory: 100,
        }
      });
    }
  }
});

// ── Keyboard Shortcuts ──────────────────────────────
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

// ── Message Router ──────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(message, sender) {
  switch (message.action) {
    // ── Screenshot Actions ──────────────────────────
    case 'capture-visible':
      return await captureVisibleArea();

    case 'capture-full-page':
      return await initiateFullPageCapture(sender.tab?.id);

    case 'capture-selection':
      return await initiateSelectionCapture(sender.tab?.id);

    case 'full-page-data':
      return await processCapture(message.dataUrl, message.filename);

    case 'selection-data':
      return await processCapture(message.dataUrl, message.filename);

    case 'save-capture':
      return await saveCapture(message.dataUrl, message.filename, message.format);

    case 'copy-to-clipboard':
      return await copyToClipboard(message.dataUrl);

    // ── Recording Actions ───────────────────────────
    case 'request-desktop-capture':
      return await requestDesktopCapture(sender);

    case 'recording-started':
      return await onRecordingStarted(sender);

    case 'recording-paused':
      return await onRecordingPaused();

    case 'recording-resumed':
      return await onRecordingResumed();

    case 'recording-stopped':
      return await onRecordingStopped();

    case 'get-recording-status':
      return { success: true, isRecording };

    // Widget commands
    case 'widget-pause':
    case 'widget-resume':
      return await forwardToRecorder('toggle-pause');

    case 'widget-mute':
      return await forwardToRecorder('toggle-mute');

    case 'widget-stop':
      return await forwardToRecorder('stop-recording');

    // ── History Actions ─────────────────────────────
    case 'add-history-entry':
      return await addHistoryEntry(message.entry);

    // ── Notification click ──────────────────────────
    case 'notification-click':
      return { success: true };

    default:
      console.warn('[ScreenSnap] Unknown action:', message.action);
      return { success: false, error: 'Unknown action' };
  }
}

// ── Screenshot Functions ────────────────────────────

async function captureVisibleArea(tab) {
  try {
    const settings = await getSettings();
    const format = settings.screenshotFormat || 'png';
    const quality = format === 'jpg' ? (settings.jpgQuality || 92) : 92;
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: format === 'jpg' ? 'jpeg' : 'png',
      quality,
    });
    return { success: true, dataUrl };
  } catch (error) {
    console.error('[ScreenSnap] Capture visible failed:', error);
    return { success: false, error: error.message };
  }
}

async function initiateFullPageCapture(tabId) {
  const tab = tabId ? { id: tabId } : await getCurrentTab();
  if (!tab?.id) return { success: false, error: 'No active tab' };
  await sendToContent(tab.id, { action: 'capture-full-page' });
  return { success: true };
}

async function initiateSelectionCapture(tabId) {
  const tab = tabId ? { id: tabId } : await getCurrentTab();
  if (!tab?.id) return { success: false, error: 'No active tab' };
  await sendToContent(tab.id, { action: 'start-selection' });
  return { success: true };
}

async function processCapture(dataUrl, filename) {
  const settings = await getSettings();
  const afterCapture = settings.afterCapture || 'editor';

  if (afterCapture === 'clipboard') {
    await copyToClipboard(dataUrl);
    await showNotification('Screenshot copied!', 'Copied to clipboard');
  } else if (afterCapture === 'save') {
    await saveCapture(dataUrl, filename);
    await showNotification('Screenshot saved!', filename || 'Saved to Downloads');
  } else {
    // Open editor (default)
    const editorUrl = chrome.runtime.getURL('editor/editor.html');
    await chrome.storage.local.set({ pendingCapture: dataUrl });
    await chrome.tabs.create({ url: editorUrl });
  }
  return { success: true };
}

async function saveCapture(dataUrl, filename, format) {
  const settings = await getSettings();
  const ext = format || settings.screenshotFormat || 'png';
  let name = filename || `ScreenSnap_${getTimestamp()}.${ext}`;

  // Apply subfolder if set
  if (settings.saveSubfolder) {
    name = `${settings.saveSubfolder}/${name}`;
  }

  try {
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: name,
      saveAs: false,
    });
    await showNotification('Screenshot saved!', name);
    return { success: true, downloadId };
  } catch (error) {
    console.error('[ScreenSnap] Save failed:', error);
    return { success: false, error: error.message };
  }
}

async function copyToClipboard(dataUrl) {
  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({ action: 'offscreen-copy-clipboard', dataUrl });
    return { success: true };
  } catch (error) {
    console.error('[ScreenSnap] Clipboard copy failed:', error);
    return { success: false, error: error.message };
  }
}

// ── Recording Functions ─────────────────────────────

async function requestDesktopCapture(sender) {
  return new Promise((resolve) => {
    const senderTab = sender.tab;
    chrome.desktopCapture.chooseDesktopMedia(['screen', 'window', 'tab'], senderTab, (streamId) => {
      if (!streamId) resolve({ success: false, error: 'User cancelled desktop capture picker' });
      else resolve({ success: true, streamId });
    });
  });
}

async function onRecordingStarted(sender) {
  isRecording = true;
  recorderTabId = sender.tab?.id;
  await chrome.action.setBadgeText({ text: 'REC' });
  await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
      if (tab.id !== recorderTabId && tab.url && !tab.url.startsWith('chrome://')) {
        recordingTargetTabId = tab.id;
        await injectRecordingWidget(tab.id);
        break;
      }
    }
  } catch (err) {
    console.warn('[ScreenSnap] Could not inject recording widget:', err);
  }
  return { success: true };
}

async function injectRecordingWidget(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['recorder/recording-controls.js'] });
  } catch (err) {
    console.warn('[ScreenSnap] Widget injection failed:', err);
  }
}

async function onRecordingPaused() {
  await chrome.action.setBadgeText({ text: '⏸' });
  return { success: true };
}

async function onRecordingResumed() {
  await chrome.action.setBadgeText({ text: 'REC' });
  await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
  return { success: true };
}

async function onRecordingStopped() {
  isRecording = false;
  await chrome.action.setBadgeText({ text: '' });
  await showNotification('Recording saved!', 'Your recording is ready');

  if (recordingTargetTabId) {
    try {
      await chrome.tabs.sendMessage(recordingTargetTabId, { action: 'remove-recording-widget' });
    } catch (err) { /* Tab may have been closed */ }
    recordingTargetTabId = null;
  }
  recorderTabId = null;
  return { success: true };
}

async function forwardToRecorder(action) {
  if (!recorderTabId) return { success: false, error: 'No recorder tab' };
  try {
    const response = await chrome.tabs.sendMessage(recorderTabId, { action });
    return response || { success: true };
  } catch (err) {
    console.warn('[ScreenSnap] Forward to recorder failed:', err);
    return { success: false, error: err.message };
  }
}

// ── Notifications ───────────────────────────────────

async function showNotification(title, message) {
  try {
    const settings = await getSettings();
    if (settings.notifications === 'off') return;

    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icons/icon-128.png'),
      title: `ScreenSnap — ${title}`,
      message: message || '',
      silent: false,
    });
  } catch (e) {
    console.warn('[ScreenSnap] Notification failed:', e);
  }
}

// Handle notification click
chrome.notifications.onClicked.addListener((notificationId) => {
  // Open history page when notification is clicked
  chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
  chrome.notifications.clear(notificationId);
});

// ── History Management ──────────────────────────────

async function addHistoryEntry(entry) {
  try {
    const settings = await getSettings();
    if (settings.keepHistory === 'off') return { success: true };

    const maxHistory = settings.maxHistory || 100;
    const result = await chrome.storage.local.get('historyEntries');
    const entries = result.historyEntries || [];

    entries.unshift(entry);

    // Trim to max
    while (entries.length > maxHistory) entries.pop();

    await chrome.storage.local.set({ historyEntries: entries });
    return { success: true };
  } catch (e) {
    console.error('[ScreenSnap] Failed to add history entry:', e);
    return { success: false, error: e.message };
  }
}

// ── Helpers ─────────────────────────────────────────

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToContent(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

async function getSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    return result.settings || {};
  } catch (e) {
    return {};
  }
}

function getTimestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}-${String(d.getSeconds()).padStart(2, '0')}`;
}

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existingContexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['CLIPBOARD'],
    justification: 'Copy screenshot to clipboard',
  });
}
