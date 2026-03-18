# ScreenBolt

> **Free screenshot & screen recording browser extension.**
> No limits. No account. No tracking. 100% local.

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/)
[![Firefox Add-on](https://img.shields.io/badge/Firefox-Add--on-FF7139?logo=firefox&logoColor=white)](https://addons.mozilla.org/)
[![Edge Add-on](https://img.shields.io/badge/Edge-Add--on-0078D7?logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-22C55E)](https://developer.chrome.com/docs/extensions/mv3/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-indigo)](CHANGELOG.md)

---

## Features

### Screenshots
- **Visible Area** — Capture what you see, instantly
- **Full Page** — Scroll-and-stitch capture for entire pages
- **Selection** — Click and drag to capture a specific region
- **Keyboard shortcuts** — Alt+Shift+V / F / S for quick access

### Annotation Editor
- **Arrow** — Point to what matters
- **Rectangle** — Highlight areas with rounded-corner outlines
- **Ellipse** — Circle important elements
- **Line** — Draw straight lines
- **Freehand** — Sketch freely
- **Text** — Add labels and notes
- **Blur/Pixelate** — Redact sensitive information
- **Highlight** — Semi-transparent marker
- **Crop** — Trim to exactly what you need
- **Undo/Redo** — Full history stack (Ctrl+Z / Ctrl+Shift+Z)
- **Opacity control** — Per-annotation transparency (10-100%)
- **Color picker** + stroke width control
- **Keyboard shortcut hints** — Visible key badges on every tool
- **Export** — PNG, JPG, or PDF

### Screen Recording
- **Tab Recording** — Capture a single browser tab
- **Screen/Window** — Record your full screen or any window
- **Camera Only** — Webcam-only recording
- **PiP Webcam Overlay** — Circular webcam bubble on recordings
- **Audio Controls** — Mic + system audio, independently togglable
- **Pause/Resume** — Take breaks during recording
- **No Time Limit** — Record as long as you need
- **Recording Trim** — Cut start/end before downloading
- **GIF Export** — Convert recordings to GIF (10fps, optimized palette)
- **WebM & MP4** export (native MediaRecorder)

### History
- Grid view with thumbnails for all captures
- Filter by type (screenshots / recordings)
- Search by name, sort by date/size/name
- **Inline rename** — Double-click to edit capture names
- **Batch select + delete** — Multi-select with checkboxes
- One-click re-open in editor

### Settings
- Theme: Dark / Light / System auto-detect
- Screenshot format (PNG/JPG), quality, after-capture action
- Recording resolution (720p/1080p/4K), audio defaults
- Notifications toggle, history limits

---

## Installation

### Chrome
1. Clone: `git clone https://github.com/mcjeikk/screenbolt.git && cd screenbolt`
2. Install: `npm install && npm run build:chrome`
3. Open `chrome://extensions/` > Developer mode > Load unpacked > select `dist-chrome/`

### Firefox
1. Clone: `git clone https://github.com/mcjeikk/screenbolt.git && cd screenbolt`
2. Install: `npm install && npm run build:firefox`
3. Open `about:debugging#/runtime/this-firefox` > Load Temporary Add-on > select `dist-firefox/manifest.json`

### Edge
1. Clone: `git clone https://github.com/mcjeikk/screenbolt.git && cd screenbolt`
2. Install: `npm install && npm run build:edge`
3. Open `edge://extensions/` > Developer mode > Load unpacked > select `dist-edge/`

---

## Architecture

```
screenbolt/
├── manifests/                    # Platform-specific manifests (chrome, firefox, edge)
├── background/
│   └── service-worker.ts         # Central coordinator & message router
├── popup/
│   └── popup.ts/html/css         # Extension popup — screenshots + recording config
├── content/
│   ├── content-script.ts         # Selection overlay & full-page scroll-stitch capture
│   ├── content-style.css         # Selection overlay styles
│   └── recording-widget.ts       # Floating recording controls (shadow DOM) + PiP webcam
├── editor/
│   └── editor.ts/html/css        # Canvas-based annotation editor (9 tools + opacity)
├── recorder/
│   └── preview.ts/html/css       # Post-recording preview, trim & GIF export
├── offscreen/
│   └── recorder-offscreen.ts/html # MediaRecorder + audio mixing (Chrome/Edge only)
├── history/
│   └── history.ts/html/css       # Capture history with rename & batch ops
├── settings/
│   └── settings.ts/html/css      # Extension settings (synced via chrome.storage.sync)
├── welcome/
│   └── welcome.ts/html/css       # Onboarding slides (shown on first install)
├── permissions/
│   └── permissions.ts/html       # Mic/camera permission grant page
├── utils/
│   ├── types.ts                  # Shared interfaces (Settings, HistoryEntry, etc.)
│   ├── constants.ts              # MESSAGE_TYPES, STORAGE_KEYS, DEFAULT_SETTINGS
│   ├── platform.ts               # Cross-browser abstraction (clipboard, capture, offscreen)
│   ├── idb-storage.ts            # IndexedDB wrapper for recordings & thumbnails
│   ├── storage.ts                # chrome.storage wrapper with typed get/set
│   ├── messages.ts               # Type-safe message passing with validation
│   ├── logger.ts                 # Structured logging with error ring buffer
│   ├── errors.ts                 # ExtensionError class, error codes, withRetry()
│   ├── helpers.ts                # Timestamps, formatting, sanitization, debounce
│   ├── feature-detection.ts      # Cross-browser capability checks
│   └── migration.ts              # Versioned data migration runner
├── types/
│   ├── gifenc.d.ts               # Type declarations for gifenc
│   └── env.d.ts                  # Build environment types
├── tests/
│   ├── utils/                    # Unit tests (Vitest)
│   └── e2e/                      # E2E tests (Playwright)
├── assets/
│   ├── icons/                    # Extension icons (16/32/48/128px)
│   ├── styles/themes.css         # CSS custom properties for dark/light/system themes
│   └── scripts/theme-init.js     # Theme pre-loader (prevents flash)
├── _locales/                     # i18n (English, Spanish, Portuguese)
└── docs/                         # Development guidelines & audit results
```

### Key Design Decisions

- **TypeScript strict** — Full codebase, zero `@ts-expect-error`, compile-time safety
- **Canvas API** — All annotations rendered directly on canvas
- **IndexedDB** — Recordings stored as blobs, no base64 relay through service worker
- **MV3 Native** — Service worker, offscreen documents, ES modules
- **Platform Abstraction** — Feature detection, not browser sniffing
- **Shadow DOM** — Recording widget CSS-isolated from page styles
- **Vite + @crxjs** — Hot reload in dev, optimized multi-target production builds

---

## Development

### Prerequisites
- Node.js 18+
- npm 9+

### Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server with HMR (Chrome)
npm run build        # Production build (Chrome)
npm run build:all    # Build all targets (Chrome + Firefox + Edge)
npm run lint         # ESLint + TypeScript checking
npm run test         # Unit tests (Vitest)
npm run test:e2e     # E2E tests (Playwright)
npm run typecheck    # TypeScript strict check
```

### Code Standards
- **TypeScript strict** — No implicit any, no unchecked index access
- **ESLint + Prettier** — Enforced via CI
- **camelCase** for variables/functions, **UPPER_SNAKE** for constants
- **No innerHTML** with user data — use DOM APIs
- **Always** revoke Object URLs and stop MediaStream tracks

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes following the code standards
4. Run `npm run lint && npm test && npm run build`
5. Commit: `git commit -m "feat: add my feature"`
6. Push and open a Pull Request

---

## Privacy

ScreenBolt is designed with privacy as a core principle:

- **100% Local** — All processing happens in your browser
- **No Server** — No data is sent to any server, ever
- **No Analytics** — No tracking, no telemetry, no cookies
- **No Account** — No sign-up required
- **Open Source** — Inspect every line of code yourself

Your screenshots and recordings never leave your device.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with TypeScript & zero dependencies<br>
  <strong>ScreenBolt</strong> — Screenshot & record, beautifully.
</p>
