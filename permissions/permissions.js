/**
 * @file ScreenBolt — Permissions Page
 * @description Opens in a tab to request mic/camera permissions.
 * Accepts ?request=microphone or ?request=camera to show only the relevant button.
 * Auto-closes after permission is granted (1s delay with success message).
 */
(() => {
  'use strict';

  const resultEl = document.getElementById('result');
  const micBtn = document.getElementById('btn-mic');
  const camBtn = document.getElementById('btn-cam');

  const params = new URLSearchParams(window.location.search);
  const request = params.get('request');

  // Show only the relevant button(s) based on ?request param
  if (request === 'microphone') {
    camBtn.style.display = 'none';
  } else if (request === 'camera') {
    micBtn.style.display = 'none';
  }
  // If no param or ?request=both → show both (default)

  function showResult(msg, ok) {
    resultEl.textContent = msg;
    resultEl.className = ok ? 'result result--ok' : 'result result--fail';
  }

  function autoCloseAfterGrant(type) {
    showResult(`✅ ${type} granted! Closing in 1 second…`, true);
    setTimeout(() => window.close(), 1000);
  }

  async function requestMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      micBtn.textContent = '🎤 Microphone ✅';
      micBtn.disabled = true;
      autoCloseAfterGrant('Microphone');
    } catch (err) {
      showResult('❌ Microphone denied: ' + err.message, false);
    }
  }

  async function requestCam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());
      camBtn.textContent = '📷 Camera ✅';
      camBtn.disabled = true;
      autoCloseAfterGrant('Camera');
    } catch (err) {
      showResult('❌ Camera denied: ' + err.message, false);
    }
  }

  micBtn.addEventListener('click', requestMic);
  camBtn.addEventListener('click', requestCam);

  // Check which permissions are already granted and update buttons
  async function checkExisting() {
    try {
      const mic = await navigator.permissions.query({ name: 'microphone' });
      if (mic.state === 'granted') {
        micBtn.textContent = '🎤 Microphone ✅';
        micBtn.disabled = true;
      }
    } catch {}
    try {
      const cam = await navigator.permissions.query({ name: 'camera' });
      if (cam.state === 'granted') {
        camBtn.textContent = '📷 Camera ✅';
        camBtn.disabled = true;
      }
    } catch {}
  }

  checkExisting();

  // Auto-request based on URL param
  if (request === 'microphone') {
    requestMic();
  } else if (request === 'camera') {
    requestCam();
  }
})();
