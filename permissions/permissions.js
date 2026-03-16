/**
 * @file ScreenBolt — Permissions Page
 * @description Opens in a regular tab to request mic/camera permissions.
 * Extension popups can't show Chrome permission prompts, so this page
 * handles it. Once granted, permissions are cached and the offscreen
 * document can use them freely.
 */
(() => {
  'use strict';

  const resultEl = document.getElementById('result');
  const doneBtn = document.getElementById('btn-done');
  let micGranted = false;
  let camGranted = false;

  /**
   * Show a result message.
   * @param {string} msg - Message to display
   * @param {boolean} ok - Success or failure
   */
  function showResult(msg, ok) {
    resultEl.textContent = msg;
    resultEl.className = ok ? 'result result--ok' : 'result result--fail';
    if (micGranted || camGranted) {
      doneBtn.style.display = 'inline-block';
    }
  }

  document.getElementById('btn-mic').addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      micGranted = true;
      showResult('✅ Microphone access granted!', true);
    } catch (err) {
      showResult('❌ Microphone denied: ' + err.message, false);
    }
  });

  document.getElementById('btn-cam').addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());
      camGranted = true;
      showResult('✅ Camera access granted!', true);
    } catch (err) {
      showResult('❌ Camera denied: ' + err.message, false);
    }
  });

  doneBtn.addEventListener('click', async () => {
    // Notify SW that permissions are ready, then close
    try {
      await chrome.runtime.sendMessage({ action: 'permissions-granted', mic: micGranted, cam: camGranted });
    } catch { /* SW may not be listening */ }
    window.close();
  });

  // Check if permissions are already granted
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      stream.getTracks().forEach(t => t.stop());
      micGranted = true;
      document.getElementById('btn-mic').textContent = '🎤 Microphone ✅';
    })
    .catch(() => {});

  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      stream.getTracks().forEach(t => t.stop());
      camGranted = true;
      document.getElementById('btn-cam').textContent = '📷 Camera ✅';
    })
    .catch(() => {});
})();
