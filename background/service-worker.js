/**
 * @file ScreenBolt — Background Service Worker v0.5.1 (MV3 ES Module)
 * @description Central coordinator for the extension. Handles capture commands,
 * keyboard shortcuts, recording state, notifications, onInstalled events,
 * and history management. Uses a message router pattern for clean dispatch.
 *
 * NOTE: Service workers can terminate after 30s of inactivity.
 * State is persisted via chrome.storage, not global variables.
 * @version 0.5.1
 */

// ── ES Module Imports ───────────────────────────────
import {
  MESSAGE_TYPES,
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  BADGE_RECORDING_COLOR,
  EXTENSION_NAME,
} from '../utils/constants.js';

import { createLogger } from '../utils/logger.js';
import { getTimestamp, sanitizeFilename } from '../utils/helpers.js';
import { getSettings } from '../utils/storage.js';
import { ExtensionError, ErrorCodes } from '../utils/errors.js';
import { hasNotificationsSupport, hasPermission } from '../utils/feature-detection.js';
import { runMigrations } from '../utils/migration.js';

// ── Logger ──────────────────────────────────────────
const log = createLogger('SW');

// ── Init Promise (ensure settings cache is ready before handling events) ──

/** @type {Object} Cached settings loaded at startup */
let settingsCache = { ...DEFAULT_SETTINGS };

/**
 * Initialization promise — loads settings into cache before any handler runs.
 * All event handlers await this before operating on settings.
 * @type {Promise<void>}
 */
const initPromise = chrome.storage.sync.get(STORAGE_KEYS.SETTINGS).then((result) => {
  settingsCache = { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
  log.debug('Settings cache initialized');
}).catch((err) => {
  log.warn('Failed to load settings cache, using defaults:', err.message);
});

// Listen for settings changes to keep cache in sync
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[STORAGE_KEYS.SETTINGS]) {
    settingsCache = { ...DEFAULT_SETTINGS, ...(changes[STORAGE_KEYS.SETTINGS].newValue || {}) };
    log.debug('Settings cache updated from storage change');
  }
});

/**
 * Get cached settings (fast, synchronous after init).
 * Falls back to chrome.storage.sync if cache isn't ready.
 * @returns {Promise<Object>} Merged settings
 */
async function getCachedSettings() {
  await initPromise;
  return settingsCache;
}

// ── Recording State (session storage for SW restart resilience) ──

/**
 * Get recording state from session storage (survives SW restart within session).
 * @returns {Promise<{isRecording: boolean, recorderTabId: number|null, recordingTargetTabId: number|null}>}
 */
async function getRecordingState() {
  try {
    const result = await chrome.storage.session.get('recordingState');
    return result.recordingState || { isRecording: false, recorderTabId: null, recordingTargetTabId: null };
  } catch {
    return { isRecording: false, recorderTabId: null, recordingTargetTabId: null };
  }
}

/**
 * Update recording state in session storage.
 * @param {Object} updates - Partial state updates
 * @returns {Promise<void>}
 */
async function setRecordingState(updates) {
  const current = await getRecordingState();
  await chrome.storage.session.set({ recordingState: { ...current, ...updates } });
}

// ── onInstalled — Welcome page, default settings & migrations ───

chrome.runtime.onInstalled.addListener(async (details) => {
  await initPromise;

  if (details.reason === 'install') {
    log.info('Extension installed — initializing');

    const result = await chrome.storage.local.get(STORAGE_KEYS.ONBOARDING_COMPLETE);
    if (!result[STORAGE_KEYS.ONBOARDING_COMPLETE]) {
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
    }

    const existing = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
    if (!existing[STORAGE_KEYS.SETTINGS]) {
      await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: { ...DEFAULT_SETTINGS } });
    }
  } else if (details.reason === 'update') {
    const currentVersion = chrome.runtime.getManifest().version;
    const previousVersion = details.previousVersion || '0.0.0';
    log.info(`Extension updated to v${currentVersion} from v${previousVersion}`);

    // Run data migrations
    await runMigrations(previousVersion, currentVersion);
  }
});

// ── Keyboard Shortcuts ──────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  await initPromise;

  const tab = await getCurrentTab();
  if (!tab) {
    log.warn('No active tab for command:', command);
    return;
  }

  switch (command) {
    case 'capture-visible':
      await captureVisibleArea(tab);
      break;
    case 'capture-full':
      await ensureContentScript(tab.id);
      await sendToContent(tab.id, { action: MESSAGE_TYPES.CAPTURE_FULL_PAGE });
      break;
    case 'capture-selection':
      await ensureContentScript(tab.id);
      await sendToContent(tab.id, { action: MESSAGE_TYPES.START_SELECTION });
      break;
    default:
      log.warn('Unknown command:', command);
  }
});

// ── Message Router (Pub/Sub Pattern) ────────────────

/** @type {Map<string, Function>} Handler registry */
const messageHandlers = new Map();

/**
 * Register a message handler for a specific action type.
 * @param {string} action - Message action type
 * @param {Function} handler - Async handler function (payload, sender) => response
 */
function registerHandler(action, handler) {
  if (messageHandlers.has(action)) {
    log.warn(`Handler already registered for: ${action}`);
  }
  messageHandlers.set(action, handler);
}

// Register all handlers
registerHandler(MESSAGE_TYPES.CAPTURE_VISIBLE, () => captureVisibleArea());
registerHandler(MESSAGE_TYPES.CAPTURE_FULL_PAGE, (msg, sender) => initiateFullPageCapture(sender.tab?.id));
registerHandler(MESSAGE_TYPES.CAPTURE_SELECTION, (msg, sender) => initiateSelectionCapture(sender.tab?.id));
registerHandler(MESSAGE_TYPES.FULL_PAGE_DATA, (msg) => processCapture(msg.dataUrl, msg.filename));
registerHandler(MESSAGE_TYPES.SELECTION_DATA, (msg) => processCapture(msg.dataUrl, msg.filename));
registerHandler(MESSAGE_TYPES.SAVE_CAPTURE, (msg) => saveCapture(msg.dataUrl, msg.filename, msg.format));
registerHandler(MESSAGE_TYPES.COPY_TO_CLIPBOARD, (msg) => copyToClipboard(msg.dataUrl));
registerHandler(MESSAGE_TYPES.REQUEST_DESKTOP_CAPTURE, (_msg, sender) => requestDesktopCapture(sender));
registerHandler(MESSAGE_TYPES.RECORDING_STARTED, (_msg, sender) => onRecordingStarted(sender));
registerHandler(MESSAGE_TYPES.RECORDING_PAUSED, () => onRecordingPaused());
registerHandler(MESSAGE_TYPES.RECORDING_RESUMED, () => onRecordingResumed());
registerHandler(MESSAGE_TYPES.RECORDING_STOPPED, () => onRecordingStopped());
registerHandler(MESSAGE_TYPES.GET_RECORDING_STATUS, async () => {
  const state = await getRecordingState();
  return { success: true, isRecording: state.isRecording };
});
registerHandler(MESSAGE_TYPES.WIDGET_PAUSE, () => forwardToRecorder(MESSAGE_TYPES.TOGGLE_PAUSE));
registerHandler(MESSAGE_TYPES.WIDGET_RESUME, () => forwardToRecorder(MESSAGE_TYPES.TOGGLE_PAUSE));
registerHandler(MESSAGE_TYPES.WIDGET_MUTE, () => forwardToRecorder('toggle-mute'));
registerHandler(MESSAGE_TYPES.WIDGET_STOP, () => forwardToRecorder(MESSAGE_TYPES.STOP_RECORDING));
registerHandler(MESSAGE_TYPES.ADD_HISTORY_ENTRY, (msg) => addHistoryEntry(msg.entry));
registerHandler(MESSAGE_TYPES.NOTIFICATION_CLICK, () => ({ success: true }));

// Main message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.action !== 'string') {
    log.warn('Received invalid message:', message);
    sendResponse({ success: false, error: 'Invalid message format' });
    return false;
  }

  const handler = messageHandlers.get(message.action);
  if (!handler) {
    log.warn('No handler for action:', message.action);
    sendResponse({ success: false, error: `Unknown action: ${message.action}` });
    return false;
  }

  // Ensure init is complete before handling
  initPromise.then(() => handler(message, sender))
    .then((result) => sendResponse(result))
    .catch((err) => {
      const errorMsg = err instanceof ExtensionError
        ? `[${err.code}] ${err.message}`
        : err.message;
      log.error(`Handler "${message.action}" threw:`, errorMsg);
      sendResponse({ success: false, error: err.message });
    });

  return true; // Keep channel open for async response
});

// ── Content Script Injection (dynamic — no manifest content_scripts) ────

/**
 * Dynamically inject the content script and CSS into a tab.
 * Uses a guard in the content script to prevent double-initialization.
 * @param {number} tabId - Target tab ID
 * @returns {Promise<boolean>} True if injection succeeded
 * @throws {ExtensionError} If the tab URL is restricted
 */
async function ensureContentScript(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = tab.url || '';
    if (
      !url ||
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://') ||
      url.startsWith('devtools://')
    ) {
      throw new ExtensionError(
        'Cannot inject content script into restricted URL',
        ErrorCodes.RESTRICTED_URL,
        { url },
      );
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content-script.js'],
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content/content-style.css'],
    });
    return true;
  } catch (err) {
    if (err instanceof ExtensionError) {
      log.warn(err.message);
      return false;
    }
    log.warn('Content script injection failed:', err.message);
    return false;
  }
}

// ── Screenshot Functions ────────────────────────────

/**
 * Capture the visible area of the active tab.
 * @param {chrome.tabs.Tab} [tab] - Optional tab reference (for keyboard shortcut context)
 * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
 */
async function captureVisibleArea(tab) {
  try {
    const settings = await getCachedSettings();
    const format = settings.screenshotFormat || 'png';
    const quality = format === 'jpg' ? (settings.jpgQuality || 92) : 92;

    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: format === 'jpg' ? 'jpeg' : 'png',
      quality,
    });

    return { success: true, dataUrl };
  } catch (err) {
    log.error('Capture visible failed:', err.message);
    throw new ExtensionError(err.message, ErrorCodes.CAPTURE_FAILED);
  }
}

/**
 * Initiate a full-page capture by injecting and messaging the content script.
 * @param {number} [tabId] - Target tab ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function initiateFullPageCapture(tabId) {
  const tab = tabId ? { id: tabId } : await getCurrentTab();
  if (!tab?.id) return { success: false, error: 'No active tab' };

  const injected = await ensureContentScript(tab.id);
  if (!injected) return { success: false, error: 'Cannot capture this page (restricted URL)' };

  await sendToContent(tab.id, { action: MESSAGE_TYPES.CAPTURE_FULL_PAGE });
  return { success: true };
}

/**
 * Initiate selection capture by injecting and messaging the content script.
 * @param {number} [tabId] - Target tab ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function initiateSelectionCapture(tabId) {
  const tab = tabId ? { id: tabId } : await getCurrentTab();
  if (!tab?.id) return { success: false, error: 'No active tab' };

  const injected = await ensureContentScript(tab.id);
  if (!injected) return { success: false, error: 'Cannot capture this page (restricted URL)' };

  await sendToContent(tab.id, { action: MESSAGE_TYPES.START_SELECTION });
  return { success: true };
}

/**
 * Process a captured screenshot based on user's after-capture preference.
 * @param {string} dataUrl - The screenshot data URL
 * @param {string} [filename] - Optional filename
 * @returns {Promise<{success: boolean}>}
 */
async function processCapture(dataUrl, filename) {
  const settings = await getCachedSettings();
  const afterCapture = settings.afterCapture || 'editor';

  if (afterCapture === 'clipboard') {
    await copyToClipboard(dataUrl);
    await showNotification('Screenshot copied!', 'Copied to clipboard');
  } else if (afterCapture === 'save') {
    await saveCapture(dataUrl, filename);
    await showNotification('Screenshot saved!', filename || 'Saved to Downloads');
  } else {
    // Open editor (default)
    await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_CAPTURE]: dataUrl });
    await chrome.tabs.create({ url: chrome.runtime.getURL('editor/editor.html') });
  }

  return { success: true };
}

/**
 * Save a screenshot to the Downloads folder.
 * @param {string} dataUrl - Image data URL
 * @param {string} [filename] - Optional filename
 * @param {string} [format] - Image format override
 * @returns {Promise<{success: boolean, downloadId?: number, error?: string}>}
 */
async function saveCapture(dataUrl, filename, format) {
  const settings = await getCachedSettings();
  const ext = format || settings.screenshotFormat || 'png';
  let name = filename || `${EXTENSION_NAME}_${getTimestamp()}.${ext}`;

  name = sanitizeFilename(name);

  const subfolder = sanitizeFilename(settings.saveSubfolder);
  if (subfolder) {
    name = `${subfolder}/${name}`;
  }

  try {
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: name,
      saveAs: false,
    });
    await showNotification('Screenshot saved!', name);
    return { success: true, downloadId };
  } catch (err) {
    log.error('Save failed:', err.message);
    throw new ExtensionError(err.message, ErrorCodes.CAPTURE_FAILED);
  }
}

/**
 * Copy an image to clipboard via the offscreen document.
 * @param {string} dataUrl - Image data URL to copy
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function copyToClipboard(dataUrl) {
  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({
      action: MESSAGE_TYPES.OFFSCREEN_COPY_CLIPBOARD,
      dataUrl,
    });
    await closeOffscreenDocument();
    return { success: true };
  } catch (err) {
    log.error('Clipboard copy failed:', err.message);
    throw new ExtensionError(err.message, ErrorCodes.OFFSCREEN_FAILED);
  }
}

/**
 * Close the offscreen document if it exists.
 * @returns {Promise<void>}
 */
async function closeOffscreenDocument() {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });
    if (existingContexts.length > 0) {
      await chrome.offscreen.closeDocument();
    }
  } catch (err) {
    log.debug('Offscreen close skipped:', err.message);
  }
}

// ── Recording Functions ─────────────────────────────

/**
 * Show the desktop capture picker and return the stream ID.
 * @param {chrome.runtime.MessageSender} sender - The message sender
 * @returns {Promise<{success: boolean, streamId?: string, error?: string}>}
 */
async function requestDesktopCapture(sender) {
  return new Promise((resolve) => {
    const senderTab = sender.tab;
    if (!senderTab) {
      resolve({ success: false, error: 'No sender tab for desktop capture' });
      return;
    }

    chrome.desktopCapture.chooseDesktopMedia(
      ['screen', 'window', 'tab'],
      senderTab,
      (streamId) => {
        if (!streamId) {
          resolve({ success: false, error: 'User cancelled desktop capture picker' });
        } else {
          resolve({ success: true, streamId });
        }
      }
    );
  });
}

/**
 * Handle recording-started notification from the recorder tab.
 * @param {chrome.runtime.MessageSender} sender - Message sender (recorder tab)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function onRecordingStarted(sender) {
  const currentState = await getRecordingState();
  if (currentState.isRecording) {
    log.warn('Ignoring recording-started — another recording is already active');
    return { success: false, error: 'A recording is already in progress' };
  }

  const recorderTabId = sender.tab?.id || null;
  await setRecordingState({ isRecording: true, recorderTabId });

  await chrome.action.setBadgeText({ text: 'REC' });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_RECORDING_COLOR });
  await startKeepalive();

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
      if (tab.id !== recorderTabId && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        await setRecordingState({ recordingTargetTabId: tab.id });
        await injectRecordingWidget(tab.id);
        break;
      }
    }
  } catch (err) {
    log.warn('Could not inject recording widget:', err.message);
  }

  return { success: true };
}

/**
 * Inject the recording controls widget into a tab.
 * @param {number} tabId - Target tab ID
 * @returns {Promise<void>}
 */
async function injectRecordingWidget(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['recorder/recording-controls.js'],
    });
  } catch (err) {
    log.warn('Widget injection failed:', err.message);
  }
}

/** @returns {Promise<{success: boolean}>} */
async function onRecordingPaused() {
  await chrome.action.setBadgeText({ text: '⏸' });
  return { success: true };
}

/** @returns {Promise<{success: boolean}>} */
async function onRecordingResumed() {
  await chrome.action.setBadgeText({ text: 'REC' });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_RECORDING_COLOR });
  return { success: true };
}

/** @returns {Promise<{success: boolean}>} */
async function onRecordingStopped() {
  const state = await getRecordingState();

  await chrome.action.setBadgeText({ text: '' });
  await showNotification('Recording saved!', 'Your recording is ready');

  if (state.recordingTargetTabId) {
    try {
      await chrome.tabs.sendMessage(state.recordingTargetTabId, {
        action: MESSAGE_TYPES.REMOVE_RECORDING_WIDGET,
      });
    } catch {
      // Tab may have been closed
    }
  }

  await setRecordingState({ isRecording: false, recorderTabId: null, recordingTargetTabId: null });
  await stopKeepalive();
  return { success: true };
}

/**
 * Forward a command to the recorder tab.
 * @param {string} action - The action to forward
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function forwardToRecorder(action) {
  const state = await getRecordingState();
  if (!state.recorderTabId) {
    return { success: false, error: 'No recorder tab' };
  }

  try {
    const response = await chrome.tabs.sendMessage(state.recorderTabId, { action });
    return response || { success: true };
  } catch (err) {
    log.warn('Forward to recorder failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Notifications (optional permission) ─────────────

/**
 * Show a chrome notification if notifications are enabled and permission is granted.
 * Since notifications is an optional permission, gracefully degrades if not available.
 * @param {string} title - Notification title
 * @param {string} [message=''] - Notification body
 * @returns {Promise<void>}
 */
async function showNotification(title, message) {
  try {
    const settings = await getCachedSettings();
    if (settings.notifications === 'off') return;

    // Check if notifications permission is granted (optional permission)
    if (!hasNotificationsSupport()) return;
    const granted = await hasPermission('notifications');
    if (!granted) return;

    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icons/icon-128.png'),
      title: `${EXTENSION_NAME} — ${title}`,
      message: message || '',
      silent: false,
    });
  } catch (err) {
    log.warn('Notification failed:', err.message);
  }
}

// Graceful degradation: notifications API may not be available
if (chrome.notifications?.onClicked) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
    chrome.notifications.clear(notificationId);
  });
}

// ── History Management ──────────────────────────────

/**
 * Add a new entry to the capture history.
 * @param {Object} entry - History entry object
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function addHistoryEntry(entry) {
  try {
    const settings = await getCachedSettings();
    if (settings.keepHistory === 'off') return { success: true };

    const maxHistory = settings.maxHistory || 100;
    const result = await chrome.storage.local.get(STORAGE_KEYS.HISTORY_ENTRIES);
    const entries = result[STORAGE_KEYS.HISTORY_ENTRIES] || [];

    entries.unshift(entry);

    while (entries.length > maxHistory) {
      entries.pop();
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY_ENTRIES]: entries });
    return { success: true };
  } catch (err) {
    log.error('Failed to add history entry:', err.message);
    throw new ExtensionError(err.message, ErrorCodes.STORAGE_FULL);
  }
}

// ── Helpers ─────────────────────────────────────────

/**
 * Get the active tab in the current window.
 * @returns {Promise<chrome.tabs.Tab|undefined>}
 */
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Send a message to a content script in a specific tab.
 * @param {number} tabId - Target tab ID
 * @param {Object} message - Message to send
 * @returns {Promise<*>}
 */
async function sendToContent(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    log.warn(`Failed to send to tab ${tabId}:`, err.message);
    return null;
  }
}

/**
 * Ensure the offscreen document exists for clipboard operations.
 * @returns {Promise<void>}
 */
async function ensureOffscreenDocument() {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });
    if (existingContexts.length > 0) return;

    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Copy screenshot to clipboard',
    });
  } catch (err) {
    log.error('Failed to create offscreen document:', err.message);
    throw new ExtensionError(err.message, ErrorCodes.OFFSCREEN_FAILED);
  }
}

// ── Tab Removal Cleanup ─────────────────────────────

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const state = await getRecordingState();
    if (state.isRecording && state.recorderTabId === tabId) {
      log.warn('Recorder tab closed during recording — cleaning up');
      await onRecordingStopped();
    }
  } catch (err) {
    log.warn('Tab removal cleanup error:', err.message);
  }
});

// ── Service Worker Lifecycle Events ──────────────

chrome.runtime.onStartup.addListener(async () => {
  log.info('Service worker startup — recovering state');
  const state = await getRecordingState();
  if (state.isRecording) {
    log.warn('Found stale recording state on startup — cleaning up');
    await setRecordingState({ isRecording: false, recorderTabId: null, recordingTargetTabId: null });
    await chrome.action.setBadgeText({ text: '' });
  }
});

chrome.runtime.onSuspend.addListener(() => {
  log.info('Service worker suspending');
});

// ── Keepalive during recording ──────────────────

const KEEPALIVE_ALARM_NAME = 'screenbolt-keepalive';

/**
 * Start a periodic alarm to keep the service worker alive during recording.
 */
async function startKeepalive() {
  await chrome.alarms.create(KEEPALIVE_ALARM_NAME, { periodInMinutes: 0.5 });
  log.debug('Keepalive alarm started');
}

/**
 * Stop the keepalive alarm when recording ends.
 */
async function stopKeepalive() {
  await chrome.alarms.clear(KEEPALIVE_ALARM_NAME);
  log.debug('Keepalive alarm stopped');
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === KEEPALIVE_ALARM_NAME) {
    const state = await getRecordingState();
    if (!state.isRecording) {
      await stopKeepalive();
    }
  }
});

log.info(`Service worker initialized (v${chrome.runtime.getManifest().version})`);
