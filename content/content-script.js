/**
 * ScreenSnap — Content Script
 * Handles selection overlay and full-page scroll capture within the page.
 */

(() => {
  // Prevent double injection
  if (window.__screenSnapInjected) return;
  window.__screenSnapInjected = true;

  let selectionOverlay = null;
  let isSelecting = false;
  let startX = 0;
  let startY = 0;

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'start-selection':
        startSelectionMode();
        sendResponse({ success: true });
        break;

      case 'capture-full-page':
        captureFullPage().then(sendResponse);
        return true; // async

      case 'capture-visible-for-stitch':
        // Background asks us to scroll and report position
        sendResponse({
          scrollY: window.scrollY,
          viewportHeight: window.innerHeight,
          fullHeight: document.documentElement.scrollHeight,
          fullWidth: document.documentElement.scrollWidth,
        });
        break;

      default:
        sendResponse({ success: false });
    }
  });

  // ── Selection Mode ────────────────────────────────

  function startSelectionMode() {
    removeSelectionOverlay();

    selectionOverlay = document.createElement('div');
    selectionOverlay.id = 'screensnap-overlay';
    selectionOverlay.innerHTML = `
      <div id="screensnap-selection-box"></div>
      <div id="screensnap-instructions">
        Click and drag to select area • ESC to cancel
      </div>
    `;
    document.body.appendChild(selectionOverlay);

    const overlay = selectionOverlay;
    const box = overlay.querySelector('#screensnap-selection-box');

    overlay.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isSelecting = true;
      startX = e.clientX;
      startY = e.clientY;
      box.style.display = 'block';
      box.style.left = `${startX}px`;
      box.style.top = `${startY}px`;
      box.style.width = '0';
      box.style.height = '0';
    });

    overlay.addEventListener('mousemove', (e) => {
      if (!isSelecting) return;

      const currentX = e.clientX;
      const currentY = e.clientY;

      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
    });

    overlay.addEventListener('mouseup', async (e) => {
      if (!isSelecting) return;
      isSelecting = false;

      const rect = box.getBoundingClientRect();
      if (rect.width < 5 || rect.height < 5) {
        removeSelectionOverlay();
        return;
      }

      // Capture selection
      await captureSelection(rect);
    });

    // ESC to cancel
    document.addEventListener('keydown', handleEscape);
  }

  function handleEscape(e) {
    if (e.key === 'Escape') {
      removeSelectionOverlay();
      document.removeEventListener('keydown', handleEscape);
    }
  }

  function removeSelectionOverlay() {
    if (selectionOverlay) {
      selectionOverlay.remove();
      selectionOverlay = null;
    }
    isSelecting = false;
  }

  /**
   * Capture the selected area by cropping a visible tab capture.
   */
  async function captureSelection(rect) {
    removeSelectionOverlay();

    try {
      // Ask background for visible capture
      const response = await chrome.runtime.sendMessage({
        action: 'capture-visible',
      });

      if (!response?.success || !response.dataUrl) {
        console.error('[ScreenSnap] Failed to capture visible area');
        return;
      }

      // Crop the image to the selection
      const croppedDataUrl = await cropImage(
        response.dataUrl,
        rect.left,
        rect.top,
        rect.width,
        rect.height
      );

      // Send cropped image to background for processing
      await chrome.runtime.sendMessage({
        action: 'selection-data',
        dataUrl: croppedDataUrl,
        filename: `ScreenSnap_Selection_${getTimestamp()}.png`,
      });
    } catch (error) {
      console.error('[ScreenSnap] Selection capture failed:', error);
    }
  }

  /**
   * Crop an image using canvas.
   */
  function cropImage(dataUrl, x, y, width, height) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Account for device pixel ratio
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.createElement('canvas');
        canvas.width = width * dpr;
        canvas.height = height * dpr;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(
          img,
          x * dpr,
          y * dpr,
          width * dpr,
          height * dpr,
          0,
          0,
          width * dpr,
          height * dpr
        );

        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    });
  }

  /**
   * Capture the full page by scrolling and stitching screenshots.
   */
  async function captureFullPage() {
    const fullHeight = document.documentElement.scrollHeight;
    const fullWidth = document.documentElement.scrollWidth;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const dpr = window.devicePixelRatio || 1;

    // Save original scroll position
    const originalScrollY = window.scrollY;
    const originalOverflow = document.documentElement.style.overflow;

    // Hide scrollbar during capture
    document.documentElement.style.overflow = 'hidden';

    const captures = [];
    const totalScrolls = Math.ceil(fullHeight / viewportHeight);

    try {
      for (let i = 0; i < totalScrolls; i++) {
        const scrollTo = Math.min(i * viewportHeight, fullHeight - viewportHeight);
        window.scrollTo(0, scrollTo);

        // Wait for scroll and render
        await delay(150);

        // Capture visible area
        const response = await chrome.runtime.sendMessage({
          action: 'capture-visible',
        });

        if (response?.success && response.dataUrl) {
          captures.push({
            dataUrl: response.dataUrl,
            scrollY: scrollTo,
            isLast: i === totalScrolls - 1,
          });
        }
      }

      // Stitch all captures together
      const stitchedDataUrl = await stitchCaptures(
        captures,
        fullWidth,
        fullHeight,
        viewportHeight,
        dpr
      );

      // Restore scroll position
      window.scrollTo(0, originalScrollY);
      document.documentElement.style.overflow = originalOverflow;

      // Send to background for processing
      await chrome.runtime.sendMessage({
        action: 'full-page-data',
        dataUrl: stitchedDataUrl,
        filename: `ScreenSnap_FullPage_${getTimestamp()}.png`,
      });

      return { success: true };
    } catch (error) {
      // Restore on error
      window.scrollTo(0, originalScrollY);
      document.documentElement.style.overflow = originalOverflow;
      console.error('[ScreenSnap] Full page capture failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stitch multiple viewport captures into one tall image.
   */
  function stitchCaptures(captures, fullWidth, fullHeight, viewportHeight, dpr) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = fullWidth * dpr;
      canvas.height = fullHeight * dpr;
      const ctx = canvas.getContext('2d');

      let loaded = 0;

      captures.forEach((capture, index) => {
        const img = new Image();
        img.onload = () => {
          const yPos = capture.scrollY * dpr;

          if (capture.isLast) {
            // Last capture might overlap — draw from bottom
            const bottomY = fullHeight * dpr - img.height;
            ctx.drawImage(img, 0, Math.max(0, bottomY));
          } else {
            ctx.drawImage(img, 0, yPos);
          }

          loaded++;
          if (loaded === captures.length) {
            resolve(canvas.toDataURL('image/png'));
          }
        };
        img.src = capture.dataUrl;
      });
    });
  }

  // ── Helpers ─────────────────────────────────────

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getTimestamp() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}-${String(d.getSeconds()).padStart(2, '0')}`;
  }
})();
