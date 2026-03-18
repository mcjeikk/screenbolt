// ScreenBolt — Settings Page
// Persists all user settings in chrome.storage.sync for cross-device sync.
// Uses a field map pattern for clean, maintainable settings binding.

import type { Settings } from '../utils/types.js';

// ── Default Settings ────────────────────────────
const DEFAULTS: Readonly<Settings> = Object.freeze({
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
});

// Map of setting keys to DOM element IDs
const FIELD_MAP: Readonly<Record<keyof Settings, string>> = Object.freeze({
  screenshotFormat: 'ss-format',
  jpgQuality: 'ss-jpg-quality',
  afterCapture: 'ss-after-capture',
  saveSubfolder: 'ss-subfolder',
  recResolution: 'rec-resolution',
  recAudio: 'rec-audio',
  recPip: 'rec-pip',
  recPipPosition: 'rec-pip-position',
  recPipSize: 'rec-pip-size',
  recCountdown: 'rec-countdown',
  recFormat: 'rec-format',
  theme: 'gen-theme',
  notifications: 'gen-notifications',
  keepHistory: 'gen-keep-history',
  maxHistory: 'gen-max-history',
});

// Duration to show save confirmation (ms)
const SAVE_STATUS_DURATION_MS = 1500;

const saveStatus = document.getElementById('save-status')!;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

// ── Init ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const settings = await loadSettings();
  populateUI(settings);
  setupListeners(settings);
});

// Load settings from chrome.storage.sync, merged with defaults.
async function loadSettings(): Promise<Settings> {
  try {
    const result = await chrome.storage.sync.get('settings');
    return { ...DEFAULTS, ...(result.settings || {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

// Populate all UI fields from the settings object.
function populateUI(settings: Settings): void {
  for (const [key, elId] of Object.entries(FIELD_MAP)) {
    const el = document.getElementById(elId) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) continue;
    const val = settings[key as keyof Settings];

    if (el instanceof HTMLInputElement && el.type === 'range') {
      el.value = String(val);
      const valDisplay = document.getElementById(`${elId}-val`);
      if (valDisplay) valDisplay.textContent = `${val}%`;
    } else {
      el.value = String(val);
    }
  }

  toggleJpgQuality(settings.screenshotFormat);
}

// Set up change listeners on all settings fields.
function setupListeners(settings: Settings): void {
  for (const [key, elId] of Object.entries(FIELD_MAP)) {
    const el = document.getElementById(elId) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) continue;

    const event = el instanceof HTMLInputElement && el.type === 'range' ? 'input' : 'change';
    el.addEventListener(event, () => {
      let val: string | number = el.value;

      if (el instanceof HTMLInputElement && el.type === 'range') {
        val = parseInt(val, 10);
        const valDisplay = document.getElementById(`${elId}-val`);
        if (valDisplay) valDisplay.textContent = `${val}%`;
      }

      if (key === 'maxHistory') val = parseInt(String(val), 10);

      (settings as unknown as Record<string, string | number>)[key] = val;
      saveSettings(settings);

      // Special handlers
      if (key === 'screenshotFormat') toggleJpgQuality(val as string);
      if (key === 'theme') applyTheme(val as string);
    });
  }
}

// Show/hide JPG quality slider based on format selection.
function toggleJpgQuality(format: string): void {
  const row = document.getElementById('jpg-quality-row');
  if (row) row.style.display = format === 'jpg' ? 'flex' : 'none';
}

// Apply a theme to the current page.
function applyTheme(theme: string): void {
  document.documentElement.setAttribute('data-theme', theme);
}

// Save settings to chrome.storage.sync and show confirmation.
async function saveSettings(settings: Settings): Promise<void> {
  try {
    await chrome.storage.sync.set({ settings });
    showSaveStatus();
  } catch (err) {
    console.error('[ScreenBolt][Settings] Save failed:', err);
  }
}

// Show the "Settings saved" confirmation toast.
function showSaveStatus(): void {
  saveStatus.classList.add('visible');
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveStatus.classList.remove('visible');
  }, SAVE_STATUS_DURATION_MS);
}
