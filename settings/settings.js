/**
 * ScreenSnap — Settings Page v0.4.0
 * Persists all settings in chrome.storage.sync for cross-device sync.
 */

(() => {
  'use strict';

  // Default settings
  const DEFAULTS = {
    // Screenshot
    screenshotFormat: 'png',
    jpgQuality: 92,
    afterCapture: 'editor',       // editor | save | clipboard
    saveSubfolder: '',

    // Recording
    recResolution: '1080',
    recAudio: 'both',             // both | system | mic | none
    recPip: 'off',
    recPipPosition: 'bottom-right',
    recPipSize: 'medium',
    recCountdown: 'on',
    recFormat: 'webm',

    // General
    theme: 'dark',
    notifications: 'on',
    keepHistory: 'on',
    maxHistory: 100,
  };

  // Map setting keys → DOM element ids
  const FIELD_MAP = {
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
  };

  const saveStatus = document.getElementById('save-status');
  let saveTimeout = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const settings = await loadSettings();
    populateUI(settings);
    setupListeners(settings);
  });

  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get('settings');
      return { ...DEFAULTS, ...(result.settings || {}) };
    } catch (e) {
      return { ...DEFAULTS };
    }
  }

  function populateUI(settings) {
    for (const [key, elId] of Object.entries(FIELD_MAP)) {
      const el = document.getElementById(elId);
      if (!el) continue;
      const val = settings[key];

      if (el.type === 'range') {
        el.value = val;
        const valDisplay = document.getElementById(elId + '-val');
        if (valDisplay) valDisplay.textContent = val + '%';
      } else {
        el.value = String(val);
      }
    }

    // Show/hide JPG quality based on format
    toggleJpgQuality(settings.screenshotFormat);
  }

  function setupListeners(settings) {
    for (const [key, elId] of Object.entries(FIELD_MAP)) {
      const el = document.getElementById(elId);
      if (!el) continue;

      const event = el.type === 'range' ? 'input' : 'change';
      el.addEventListener(event, () => {
        let val = el.value;
        if (el.type === 'range') {
          val = parseInt(val, 10);
          const valDisplay = document.getElementById(elId + '-val');
          if (valDisplay) valDisplay.textContent = val + '%';
        }
        if (key === 'maxHistory') val = parseInt(val, 10);

        settings[key] = val;
        saveSettings(settings);

        // Special handlers
        if (key === 'screenshotFormat') toggleJpgQuality(val);
        if (key === 'theme') applyTheme(val);
      });
    }
  }

  function toggleJpgQuality(format) {
    const row = document.getElementById('jpg-quality-row');
    if (row) row.style.display = format === 'jpg' ? 'flex' : 'none';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  async function saveSettings(settings) {
    try {
      await chrome.storage.sync.set({ settings });
      showSaveStatus();
    } catch (e) {
      console.error('[Settings] Save failed:', e);
    }
  }

  function showSaveStatus() {
    saveStatus.classList.add('visible');
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveStatus.classList.remove('visible');
    }, 1500);
  }
})();
