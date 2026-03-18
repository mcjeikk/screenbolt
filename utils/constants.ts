/**
 * @file ScreenBolt — Shared Constants
 * @description Single source of truth for all constants used across the extension.
 * Import this module wherever you need message types, storage keys, or configuration values.
 * @version 0.5.0
 */

import type { Settings } from './types.js';

// ── Message Types ───────────────────────────────────
/** All message action types used in runtime.sendMessage */
export const MESSAGE_TYPES = {
  // Screenshot actions
  CAPTURE_VISIBLE: 'capture-visible',
  CAPTURE_FULL_PAGE: 'capture-full-page',
  CAPTURE_SELECTION: 'capture-selection',
  START_SELECTION: 'start-selection',
  FULL_PAGE_DATA: 'full-page-data',
  SELECTION_DATA: 'selection-data',
  SAVE_CAPTURE: 'save-capture',
  COPY_TO_CLIPBOARD: 'copy-to-clipboard',
  CAPTURE_VISIBLE_FOR_STITCH: 'capture-visible-for-stitch',

  // Recording actions
  REQUEST_DESKTOP_CAPTURE: 'request-desktop-capture',
  RECORDING_STARTED: 'recording-started',
  RECORDING_PAUSED: 'recording-paused',
  RECORDING_RESUMED: 'recording-resumed',
  RECORDING_STOPPED: 'recording-stopped',
  GET_RECORDING_STATUS: 'get-recording-status',
  STOP_RECORDING: 'stop-recording',
  TOGGLE_PAUSE: 'toggle-pause',
  TOGGLE_MUTE: 'toggle-mute',

  // Inline recording actions (popup → SW → offscreen)
  START_RECORDING: 'start-recording',
  GET_RECORDING_TIME: 'get-recording-time',
  OFFSCREEN_START_RECORDING: 'offscreen-start-recording',
  OFFSCREEN_STOP_RECORDING: 'offscreen-stop-recording',
  OFFSCREEN_TOGGLE_PAUSE: 'offscreen-toggle-pause',
  OFFSCREEN_TOGGLE_MUTE: 'offscreen-toggle-mute',
  OFFSCREEN_GET_TIME: 'offscreen-get-time',
  OFFSCREEN_RECORDING_COMPLETE: 'offscreen-recording-complete',

  // Widget actions (from content script recording widget)
  WIDGET_PAUSE: 'widget-pause',
  WIDGET_RESUME: 'widget-resume',
  WIDGET_MUTE: 'widget-mute',
  WIDGET_STOP: 'widget-stop',

  // History actions
  ADD_HISTORY_ENTRY: 'add-history-entry',

  // Offscreen actions
  OFFSCREEN_COPY_CLIPBOARD: 'offscreen-copy-clipboard',

  // Widget removal
  REMOVE_RECORDING_WIDGET: 'remove-recording-widget',

  // Notifications
  NOTIFICATION_CLICK: 'notification-click',
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

// ── Storage Keys ────────────────────────────────────
/** Keys used in chrome.storage */
export const STORAGE_KEYS = {
  SETTINGS: 'settings',
  HISTORY_ENTRIES: 'historyEntries',
  ONBOARDING_COMPLETE: 'onboardingComplete',
  PENDING_CAPTURE: 'pendingCapture',
  PENDING_RECORDING: 'pendingRecording',
  RECORDING_CHUNKS_COUNT: 'recording-chunks-count',
  RECORDING_MIME: 'recording-mime',
  RECORDING_CHUNK_PREFIX: 'recording-chunk-',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

// ── Default Settings ────────────────────────────────
/** Default settings applied on first install */
export const DEFAULT_SETTINGS: Settings = Object.freeze({
  // Screenshot
  screenshotFormat: 'png',
  jpgQuality: 92,
  afterCapture: 'editor',
  saveSubfolder: '',

  // Recording
  recResolution: '1080',
  recAudio: 'both',
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
});

// ── Capture Formats ─────────────────────────────────
/** Supported screenshot formats */
export const CAPTURE_FORMATS = {
  PNG: 'png',
  JPG: 'jpg',
} as const;

export type CaptureFormat = (typeof CAPTURE_FORMATS)[keyof typeof CAPTURE_FORMATS];

// ── Recording Sources ───────────────────────────────
/** Recording source types */
export const RECORDING_SOURCES = {
  TAB: 'tab',
  SCREEN: 'screen',
  CAMERA: 'camera',
} as const;

export type RecordingSource = (typeof RECORDING_SOURCES)[keyof typeof RECORDING_SOURCES];

// ── Resolution Presets ──────────────────────────────
export const RESOLUTION_PRESETS = {
  720: { width: 1280, height: 720 },
  1080: { width: 1920, height: 1080 },
  2160: { width: 3840, height: 2160 },
} as const;

// ── PiP Configuration ───────────────────────────────
/** Bubble diameter in pixels */
export const PIP_SIZES = {
  small: 120,
  medium: 180,
  large: 240,
} as const;

/** Margin from screen edge in pixels */
export const PIP_MARGIN = 20 as const;

// ── Editor Constants ────────────────────────────────
/** Editor tool names */
export const EDITOR_TOOLS = {
  ARROW: 'arrow',
  RECT: 'rect',
  CIRCLE: 'circle',
  LINE: 'line',
  FREEHAND: 'freehand',
  TEXT: 'text',
  BLUR: 'blur',
  HIGHLIGHT: 'highlight',
  CROP: 'crop',
} as const;

export type EditorTool = (typeof EDITOR_TOOLS)[keyof typeof EDITOR_TOOLS];

/** Keyboard shortcut to tool mapping */
export const EDITOR_SHORTCUTS = {
  a: EDITOR_TOOLS.ARROW,
  r: EDITOR_TOOLS.RECT,
  e: EDITOR_TOOLS.CIRCLE,
  l: EDITOR_TOOLS.LINE,
  p: EDITOR_TOOLS.FREEHAND,
  t: EDITOR_TOOLS.TEXT,
  b: EDITOR_TOOLS.BLUR,
  h: EDITOR_TOOLS.HIGHLIGHT,
  c: EDITOR_TOOLS.CROP,
} as const;

/** Text font sizes mapped from stroke width */
export const TEXT_FONT_SIZES = {
  THIN: 16,
  MEDIUM: 24,
  THICK: 36,
} as const;

/** Minimum drag distance (px) to register as a shape, not a click */
export const MIN_DRAG_DISTANCE = 3 as const;

/** Minimum selection area to be valid (px) */
export const MIN_SELECTION_SIZE = 5 as const;

/** Minimum blur area dimension (px) */
export const MIN_BLUR_SIZE = 2 as const;

/** Corner radius for rectangle annotations (px) */
export const RECT_CORNER_RADIUS = 8 as const;

/** Highlight overlay color */
export const HIGHLIGHT_COLOR = 'rgba(255, 214, 0, 0.35)' as const;

// ── Timing Constants ────────────────────────────────
/** Delay between scroll captures for full-page mode (ms) */
export const SCROLL_CAPTURE_DELAY_MS = 150 as const;

/** Countdown seconds before recording starts */
export const RECORDING_COUNTDOWN_SECONDS = 3 as const;

/** MediaRecorder data collection interval (ms) */
export const MEDIA_RECORDER_TIMESLICE_MS = 1000 as const;

/** Toast notification display duration (ms) */
export const TOAST_DURATION_MS = 2500 as const;

/** Settings save status display duration (ms) */
export const SAVE_STATUS_DURATION_MS = 1500 as const;

// ── Recording Quality ───────────────────────────────
/** Video bitrate for recordings (bps) */
export const VIDEO_BITRATE = 5_000_000 as const;

/** Canvas capture FPS for PiP compositing */
export const PIP_CANVAS_FPS = 30 as const;

/** JPEG quality for editor export (0-1) */
export const JPEG_EXPORT_QUALITY = 0.92 as const;

/** JPEG quality for thumbnails (0-1) */
export const THUMBNAIL_QUALITY = 0.6 as const;

// ── Storage Limits ──────────────────────────────────
/** Max dataUrl size to store in history (bytes) */
export const MAX_HISTORY_DATAURL_SIZE = 500_000 as const;

/** Thumbnail max dimensions (px) */
export const THUMBNAIL_MAX_WIDTH = 320 as const;
export const THUMBNAIL_MAX_HEIGHT = 200 as const;

/** Recording chunk size for storage serialization (bytes) */
export const RECORDING_CHUNK_SIZE = 5 * 1024 * 1024;

// ── History Pagination ──────────────────────────────
/** Items per page in history grid */
export const HISTORY_PAGE_SIZE = 24 as const;

// ── Badge Colors ────────────────────────────────────
/** Badge background during recording */
export const BADGE_RECORDING_COLOR = '#EF4444' as const;

// ── Extension Info ──────────────────────────────────
/** Extension name prefix for logs and notifications */
export const EXTENSION_NAME = 'ScreenBolt' as const;

/** Current version */
export const VERSION = '0.8.8' as const;
