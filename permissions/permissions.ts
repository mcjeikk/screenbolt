// ScreenBolt — Permissions Page
// Opens in a tab to request mic/camera permissions.
// Accepts ?request=microphone or ?request=camera to show only the relevant button.
// Auto-closes after permission is granted (1s delay with success message).

const resultEl = document.getElementById('result')!;
const micBtn = document.getElementById('btn-mic') as HTMLButtonElement;
const camBtn = document.getElementById('btn-cam') as HTMLButtonElement;

const params = new URLSearchParams(window.location.search);
const request = params.get('request');

// Show only the relevant button(s) based on ?request param
if (request === 'microphone') {
  camBtn.style.display = 'none';
} else if (request === 'camera') {
  micBtn.style.display = 'none';
}
// If no param or ?request=both -> show both (default)

function showResult(msg: string, ok: boolean): void {
  resultEl.textContent = msg;
  resultEl.className = ok ? 'result result--ok' : 'result result--fail';
}

function autoCloseAfterGrant(type: string): void {
  showResult(`\u2705 ${type} granted! Closing in 1 second\u2026`, true);
  setTimeout(() => window.close(), 1000);
}

async function requestMic(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    micBtn.textContent = '\uD83C\uDFA4 Microphone \u2705';
    micBtn.disabled = true;
    autoCloseAfterGrant('Microphone');
  } catch (err) {
    showResult('\u274C Microphone denied: ' + (err as Error).message, false);
  }
}

async function requestCam(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
    camBtn.textContent = '\uD83D\uDCF7 Camera \u2705';
    camBtn.disabled = true;
    autoCloseAfterGrant('Camera');
  } catch (err) {
    showResult('\u274C Camera denied: ' + (err as Error).message, false);
  }
}

micBtn.addEventListener('click', requestMic);
camBtn.addEventListener('click', requestCam);

// Check which permissions are already granted and update buttons
async function checkExisting(): Promise<void> {
  try {
    const mic = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (mic.state === 'granted') {
      micBtn.textContent = '\uD83C\uDFA4 Microphone \u2705';
      micBtn.disabled = true;
    }
  } catch {
    // permissions.query may not be available
  }
  try {
    const cam = await navigator.permissions.query({ name: 'camera' as PermissionName });
    if (cam.state === 'granted') {
      camBtn.textContent = '\uD83D\uDCF7 Camera \u2705';
      camBtn.disabled = true;
    }
  } catch {
    // permissions.query may not be available
  }
}

checkExisting();

// Auto-request based on URL param
if (request === 'microphone') {
  requestMic();
} else if (request === 'camera') {
  requestCam();
}
