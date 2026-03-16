/**
 * @file ScreenBolt — Preview Script v0.5.0
 * @description Loads recorded video from chrome.storage, provides playback preview,
 * and offers download in WebM or MP4 (via ffmpeg.wasm lazy-loaded from CDN).
 * Properly revokes Object URLs on cleanup.
 * @version 0.5.0
 */


'use strict';

// ── Constants ───────────────────────────────────
const LOG_PREFIX = '[ScreenBolt][Preview]';

// ── State ───────────────────────────────────────
/** @type {Blob|null} */
let videoBlob = null;

/** @type {string} */
let videoMimeType = 'video/webm';

/** @type {string|null} Object URL for the video element — must be revoked */
let videoBlobUrl = null;

// ── Init ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadRecording();
    bindButtons();
  } catch (err) {
    showError(`Failed to load recording: ${err.message}`);
  }
});

// ── Load Recording from Storage ─────────────────

/**
 * Reassemble the recording from storage chunks and set up the video player.
 * @throws {Error} If no recording data is found
 */
async function loadRecording() {
  const meta = await chrome.storage.local.get([
    'pendingRecording',
    'recording-chunks-count',
    'recording-mime',
  ]);

  const info = meta.pendingRecording;
  const chunkCount = meta['recording-chunks-count'];
  videoMimeType = meta['recording-mime'] || 'video/webm';

  if (!chunkCount || chunkCount === 0) {
    throw new Error('No recording data found');
  }

  // Read all chunks
  const chunkKeys = [];
  for (let i = 0; i < chunkCount; i++) {
    chunkKeys.push(`recording-chunk-${i}`);
  }

  const chunkData = await chrome.storage.local.get(chunkKeys);

  // Reassemble into a single Uint8Array
  const parts = [];
  let totalLength = 0;
  for (let i = 0; i < chunkCount; i++) {
    const arr = chunkData[`recording-chunk-${i}`];
    if (!arr) throw new Error(`Missing recording chunk ${i}`);
    totalLength += arr.length;
    parts.push(new Uint8Array(arr));
  }

  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }

  videoBlob = new Blob([combined], { type: videoMimeType });

  // Set up video player
  const video = document.getElementById('preview-video');
  videoBlobUrl = URL.createObjectURL(videoBlob);
  video.src = videoBlobUrl;

  // Display metadata
  if (info) {
    const durationSec = Math.floor((info.duration || 0) / 1000);
    const mm = String(Math.floor(durationSec / 60)).padStart(2, '0');
    const ss = String(durationSec % 60).padStart(2, '0');
    document.getElementById('meta-duration').textContent = `${mm}:${ss}`;
  }

  document.getElementById('meta-size').textContent = formatFileSize(videoBlob.size);
  document.getElementById('meta-format').textContent = videoMimeType.includes('webm') ? 'WebM' : videoMimeType;

  // Show content, hide loading
  document.getElementById('loading').style.display = 'none';
  document.getElementById('preview-content').style.display = 'block';

  // Clean up storage (recording data is now in memory)
  cleanupStorage(chunkCount);
}

/**
 * Remove recording chunks from chrome.storage.local.
 * @param {number} chunkCount - Number of chunks to remove
 */
async function cleanupStorage(chunkCount) {
  const keys = ['pendingRecording', 'recording-chunks-count', 'recording-mime'];
  for (let i = 0; i < chunkCount; i++) {
    keys.push(`recording-chunk-${i}`);
  }
  await chrome.storage.local.remove(keys);
}

// ── Button Handlers ─────────────────────────────

/** Bind download and discard buttons. */
function bindButtons() {
  document.getElementById('btn-download-webm').addEventListener('click', downloadWebM);
  document.getElementById('btn-download-mp4').addEventListener('click', downloadMP4);
  document.getElementById('btn-discard').addEventListener('click', discard);
}

/** Download the recording as WebM (native format, instant). */
function downloadWebM() {
  if (!videoBlob) return;
  const url = URL.createObjectURL(videoBlob);
  const filename = `ScreenBolt_${getTimestamp()}.webm`;
  triggerDownload(url, filename);
  // Revoke after a delay to ensure download starts
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Download as MP4 using ffmpeg.wasm (bundled locally, core loaded on-demand).
 * Shows progress bar during conversion.
 */
/**
 * Download as MP4 using ffmpeg.wasm via a sandboxed iframe.
 * MV3 CSP blocks blob: scripts in extension pages, but sandbox pages
 * have relaxed CSP and can load ffmpeg from CDN freely.
 */
async function downloadMP4() {
  if (!videoBlob) return;

  const progressContainer = document.getElementById('mp4-progress');
  const progressBar = document.getElementById('mp4-progress-bar');
  const statusText = document.getElementById('mp4-status');
  const btn = document.getElementById('btn-download-mp4');

  btn.disabled = true;
  progressContainer.style.display = 'block';
  statusText.textContent = 'Initializing converter\u2026';
  progressBar.style.width = '5%';

  try {
    // Create sandboxed iframe for ffmpeg (sandbox has relaxed CSP)
    let iframe = document.getElementById('mp4-sandbox');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'mp4-sandbox';
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
    }
    iframe.src = chrome.runtime.getURL('sandbox/mp4-converter.html');

    // Wait for iframe to signal ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Converter iframe timeout')), 15000);
      const handler = (event) => {
        if (event.data?.type === 'mp4-converter-ready') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          resolve();
        }
      };
      window.addEventListener('message', handler);
    });

    statusText.textContent = 'Loading ffmpeg (~30MB first time)\u2026';
    progressBar.style.width = '10%';

    // Convert blob to ArrayBuffer and send to sandbox
    const webmData = await videoBlob.arrayBuffer();

    // Listen for progress and result from sandbox
    const mp4Data = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('MP4 conversion timeout (5 min)')), 300000);
      const handler = (event) => {
        const msg = event.data;
        if (!msg) return;

        if (msg.type === 'mp4-progress') {
          if (msg.stage === 'loading') {
            const pct = Math.round(10 + msg.progress * 20);
            progressBar.style.width = `${pct}%`;
            statusText.textContent = 'Downloading ffmpeg core\u2026';
          } else if (msg.stage === 'converting') {
            const pct = Math.round(30 + msg.progress * 65);
            progressBar.style.width = `${pct}%`;
            statusText.textContent = `Converting\u2026 ${Math.round(msg.progress * 100)}%`;
          }
        } else if (msg.type === 'mp4-result') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          if (msg.success) {
            resolve(msg.data);
          } else {
            reject(new Error(msg.error || 'Conversion failed'));
          }
        }
      };
      window.addEventListener('message', handler);

      // Send WebM data to sandbox (transfer, not copy)
      iframe.contentWindow.postMessage(
        { type: 'convert-to-mp4', webmData },
        '*',
        [webmData]
      );
    });

    // Download MP4
    const mp4Blob = new Blob([mp4Data], { type: 'video/mp4' });
    progressBar.style.width = '100%';
    statusText.textContent = 'Done! Downloading\u2026';

    const url = URL.createObjectURL(mp4Blob);
    triggerDownload(url, `ScreenBolt_${getTimestamp()}.mp4`);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    setTimeout(() => {
      progressContainer.style.display = 'none';
      btn.disabled = false;
    }, 2000);

  } catch (err) {
    console.error(LOG_PREFIX, 'MP4 conversion failed:', err);
    statusText.textContent = `\u274C ${err.message}`;
    progressBar.style.width = '0%';
    btn.disabled = false;
  }
}

/** Discard the recording and close the tab. */
function discard() {
  if (confirm('Discard this recording? This cannot be undone.')) {
    cleanup();
    window.close();
  }
}

// ── Helpers ───────────────────────────────────────

/**
 * Trigger a file download via chrome.downloads API.
 * @param {string} url - Object URL or data URL to download
 * @param {string} filename - Target filename
 */
function triggerDownload(url, filename) {
  chrome.downloads.download({ url, filename, saveAs: true });
}

/**
 * Generate a formatted timestamp for filenames.
 * @returns {string} Compact timestamp
 */
function getTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Format a byte count into a human-readable file size.
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Show an error message and hide the loading state.
 * @param {string} msg - Error message
 */
function showError(msg) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('error-container').style.display = 'block';
  document.getElementById('error-msg').textContent = `\u26A0\uFE0F ${msg}`;
}

/**
 * Clean up resources: revoke Object URLs and release blob.
 */
function cleanup() {
  if (videoBlobUrl) {
    URL.revokeObjectURL(videoBlobUrl);
    videoBlobUrl = null;
  }
  videoBlob = null;
}

// Cleanup on page hide (pagehide is preferred over beforeunload for bfcache compatibility)
window.addEventListener('pagehide', cleanup);

