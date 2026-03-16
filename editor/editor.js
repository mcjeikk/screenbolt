/**
 * ScreenSnap — Editor
 * Displays captured screenshot and provides save/copy actions.
 * Annotation tools will be added in Sprint 2.
 */

const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
let currentImage = null;

// Load pending capture from storage
document.addEventListener('DOMContentLoaded', async () => {
  const result = await chrome.storage.local.get('pendingCapture');

  if (result.pendingCapture) {
    await loadImage(result.pendingCapture);
    // Clean up
    await chrome.storage.local.remove('pendingCapture');
  } else {
    document.getElementById('status-dimensions').textContent = 'No capture loaded';
  }

  setupButtons();
});

/**
 * Load image data URL onto the canvas.
 */
function loadImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      currentImage = img;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Update status bar
      document.getElementById('status-dimensions').textContent =
        `${img.width} × ${img.height}px`;

      // Estimate file size
      const base64Length = dataUrl.length - dataUrl.indexOf(',') - 1;
      const sizeKB = Math.round((base64Length * 3) / 4 / 1024);
      document.getElementById('status-size').textContent =
        sizeKB > 1024 ? `~${(sizeKB / 1024).toFixed(1)} MB` : `~${sizeKB} KB`;

      resolve();
    };
    img.src = dataUrl;
  });
}

/**
 * Setup button event listeners.
 */
function setupButtons() {
  document.getElementById('btn-copy').addEventListener('click', copyToClipboard);
  document.getElementById('btn-save-png').addEventListener('click', () => saveAs('png'));
  document.getElementById('btn-save-jpg').addEventListener('click', () => saveAs('jpeg'));
  document.getElementById('btn-download').addEventListener('click', () => saveAs('png'));
}

/**
 * Copy canvas content to clipboard.
 */
async function copyToClipboard() {
  try {
    const blob = await canvasToBlob('image/png');
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
    showToast('Copied to clipboard! 📋');
  } catch (error) {
    console.error('[ScreenSnap] Clipboard copy failed:', error);
    showToast('Copy failed — try downloading instead', true);
  }
}

/**
 * Save canvas as file download.
 */
async function saveAs(format) {
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const quality = format === 'jpeg' ? 0.92 : undefined;

  const dataUrl = canvas.toDataURL(mimeType, quality);
  const filename = `ScreenSnap_${getTimestamp()}.${ext}`;

  try {
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true,
    });
    showToast(`Saved as ${filename} 💾`);
  } catch (error) {
    // Fallback: create download link
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
    showToast(`Downloaded ${filename} 💾`);
  }
}

/**
 * Convert canvas to Blob.
 */
function canvasToBlob(mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}

/**
 * Show a toast notification.
 */
function showToast(message, isError = false) {
  // Remove existing toasts
  document.querySelectorAll('.toast').forEach((t) => t.remove());

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 48px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    background: ${isError ? '#DC2626' : '#059669'};
    color: white;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    z-index: 9999;
    animation: fadeInUp 0.3s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function getTimestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}-${String(d.getSeconds()).padStart(2, '0')}`;
}
