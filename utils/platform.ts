/**
 * ScreenBolt -- Platform Abstraction Layer
 *
 * Provides cross-browser implementations for APIs that differ between
 * Chrome/Edge and Firefox. Uses runtime feature detection from
 * feature-detection.ts rather than browser sniffing.
 *
 * Chrome/Edge: Uses offscreen documents, tabCapture, desktopCapture.
 * Firefox MV3: Background scripts have DOM access, so Clipboard API and
 * getDisplayMedia() can be used directly. No offscreen document needed.
 */

import {
  hasOffscreenSupport,
  hasTabCaptureSupport,
  hasDesktopCaptureSupport,
  hasGetContextsSupport,
} from './feature-detection.js';

import { MESSAGE_TYPES } from './constants.js';
import { createLogger } from './logger.js';
import { ExtensionError, ErrorCodes } from './errors.js';

const log = createLogger('Platform');

// -- Browser Detection (feature-based) --------------------------------

/**
 * Returns true when running in Firefox (or any browser without offscreen
 * and tabCapture support). Prefer per-feature checks where possible.
 */
export function isFirefoxLike(): boolean {
  return !hasOffscreenSupport() && !hasTabCaptureSupport();
}

// -- Offscreen Document Lifecycle -------------------------------------

/**
 * Ensure the recorder offscreen document exists.
 * On Firefox this is a no-op because Firefox background scripts have DOM
 * access and don't need an offscreen document.
 */
export async function ensureOffscreenDocument(): Promise<void> {
  if (!hasOffscreenSupport()) return; // Firefox -- no offscreen needed

  try {
    // Check if already exists (Chrome 116+ has getContexts)
    if (hasGetContextsSupport()) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      });
      if (contexts.length > 0) return;
    }

    await chrome.offscreen.createDocument({
      url: 'offscreen/recorder-offscreen.html',
      reasons: [
        chrome.offscreen.Reason.USER_MEDIA,
        chrome.offscreen.Reason.AUDIO_PLAYBACK,
        chrome.offscreen.Reason.CLIPBOARD,
      ],
      justification: 'Recording screen/tab media via MediaRecorder and clipboard operations',
    });
    log.debug('Offscreen document created');
  } catch (err) {
    log.error('Failed to create offscreen document:', (err as Error).message);
    throw new ExtensionError((err as Error).message, ErrorCodes.OFFSCREEN_FAILED);
  }
}

/**
 * Close the offscreen document if it exists.
 * No-op on Firefox.
 */
export async function closeOffscreenDocument(): Promise<void> {
  if (!hasOffscreenSupport()) return;

  try {
    if (hasGetContextsSupport()) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      });
      if (contexts.length === 0) return;
    }
    await chrome.offscreen.closeDocument();
    log.debug('Offscreen document closed');
  } catch (err) {
    log.debug('Offscreen close skipped:', (err as Error).message);
  }
}

// -- Clipboard --------------------------------------------------------

/**
 * Copy an image data URL to the clipboard.
 *
 * Firefox: Background scripts have DOM access, so we use the Clipboard API
 * directly -- no offscreen document needed.
 *
 * Chrome/Edge: Service workers lack DOM access, so we delegate to the
 * offscreen document.
 */
export async function copyImageToClipboard(dataUrl: string): Promise<void> {
  if (typeof document !== 'undefined' && typeof navigator !== 'undefined' && navigator.clipboard) {
    // Firefox background script or extension page -- has DOM access
    log.debug('Using direct Clipboard API (DOM available)');
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } else {
    // Chrome/Edge -- must use offscreen document
    log.debug('Using offscreen document for clipboard');
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({
      action: MESSAGE_TYPES.OFFSCREEN_COPY_CLIPBOARD,
      dataUrl,
    });
  }
}

// -- Screen / Tab Capture ---------------------------------------------

/**
 * Get a tab capture stream ID via chrome.tabCapture.
 * Throws if tabCapture is not available (e.g. Firefox).
 */
export function getTabCaptureStreamId(targetTabId: number): Promise<string> {
  if (!hasTabCaptureSupport()) {
    return Promise.reject(
      new ExtensionError(
        'Tab capture is not supported in this browser',
        ErrorCodes.CAPTURE_FAILED,
      ),
    );
  }

  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId }, (streamId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!streamId) {
        reject(new Error('Failed to get tab capture stream ID'));
      } else {
        resolve(streamId);
      }
    });
  });
}

/**
 * Show the desktop capture picker and return the stream ID.
 * Throws if desktopCapture is not available (e.g. Firefox).
 */
export function getDesktopCaptureStreamId(tab: chrome.tabs.Tab): Promise<string> {
  if (!hasDesktopCaptureSupport()) {
    return Promise.reject(
      new ExtensionError(
        'Desktop capture is not supported in this browser',
        ErrorCodes.CAPTURE_FAILED,
      ),
    );
  }

  return new Promise((resolve, reject) => {
    chrome.desktopCapture.chooseDesktopMedia(
      ['screen', 'window', 'tab'],
      tab,
      (streamId) => {
        if (!streamId) {
          reject(new Error('User cancelled desktop capture picker'));
        } else {
          resolve(streamId);
        }
      },
    );
  });
}

/**
 * Whether the current browser supports the Chrome-style recording flow
 * (offscreen + tabCapture/desktopCapture stream IDs).
 */
export function hasChromeRecordingSupport(): boolean {
  return hasOffscreenSupport() && (hasTabCaptureSupport() || hasDesktopCaptureSupport());
}

/**
 * Forward a control message to the offscreen document (Chrome/Edge).
 * On Firefox this is a no-op since there is no offscreen document.
 */
export async function forwardToOffscreen(
  action: string,
): Promise<{ success: boolean; error?: string }> {
  if (!hasOffscreenSupport()) {
    log.debug('forwardToOffscreen skipped -- no offscreen support');
    return { success: false, error: 'Offscreen not supported on this browser' };
  }

  try {
    const response = (await chrome.runtime.sendMessage({ action })) as
      | { success: boolean; error?: string }
      | undefined;
    return response || { success: true };
  } catch (err) {
    log.warn('Forward to offscreen failed:', (err as Error).message);
    return { success: false, error: (err as Error).message };
  }
}
