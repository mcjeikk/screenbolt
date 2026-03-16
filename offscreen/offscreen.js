/**
 * ScreenSnap — Offscreen Document
 * Handles clipboard operations that require DOM access (MV3 requirement).
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'offscreen-copy-clipboard') {
    copyImageToClipboard(message.dataUrl)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function copyImageToClipboard(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob }),
  ]);
}
