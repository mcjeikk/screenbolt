# ScreenSnap 📸

Free screenshot & screen recording Chrome extension. No limits, no account required, 100% local.

## Features (Planned)

### Screenshots
- Capture visible area
- Capture selected area (drag to select)
- Capture full page (scroll capture)
- Save as PNG/JPG
- Copy to clipboard
- Keyboard shortcuts

### Annotations (Coming Soon)
- Arrows, rectangles, circles, lines
- Text with fonts and colors
- Blur/pixelate sensitive info
- Highlighting
- Crop/resize
- Undo/redo

### Screen Recording (Coming Soon)
- Record current tab
- Record full screen/window
- Record webcam only
- Picture-in-picture (webcam + screen)
- System + microphone audio
- No time limit
- Save as WebM and MP4

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript
- Canvas API (annotations)
- MediaRecorder API (video)
- 100% client-side — no server, no cloud

## Development

1. Clone the repo
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" → select the `screensnap` folder
5. The extension icon appears in your toolbar

## License

MIT
