# Chrome Extension Best Practices — Guía Completa para ScreenSnap

> Documento de referencia para el desarrollo profesional de extensiones Chrome MV3.
> Basado en documentación oficial de Chrome, Mozilla Extension Workshop, y mejores prácticas de la industria.
> Fecha de compilación: 2026-03-16

---

## Tabla de Contenidos

1. [Arquitectura de Extensiones Profesionales](#1-arquitectura-de-extensiones-profesionales)
2. [Seguridad](#2-seguridad)
3. [Performance](#3-performance)
4. [Código Profesional](#4-código-profesional)
5. [UX/UI](#5-uxui)
6. [Publicación y Mantenimiento](#6-publicación-y-mantenimiento)
7. [Anti-Patrones — Qué NO Hacer](#7-anti-patrones--qué-no-hacer)
8. [Audit Checklist para ScreenSnap](#8-audit-checklist-para-screensnap)

---

## 1. Arquitectura de Extensiones Profesionales

### 1.1 Componentes y Separación de Concerns

Una extensión Chrome MV3 profesional tiene estos componentes claramente separados:

| Componente | Responsabilidad | DOM Access | Extension APIs |
|---|---|---|---|
| **Service Worker** (background) | Lógica central, event handling, coordinación | ❌ No | ✅ Todas |
| **Content Scripts** | Interactuar con páginas web | ✅ Página web | ⚠️ Limitado (storage, runtime, i18n, dom) |
| **Popup** | UI rápida del toolbar | ✅ Propio | ✅ Todas |
| **Extension Pages** (options, editor, etc.) | UI compleja, configuración | ✅ Propio | ✅ Todas |
| **Offscreen Documents** | DOM APIs sin UI visible | ✅ Propio | ⚠️ Solo runtime |

**Regla de oro:** Cada componente debe tener UNA responsabilidad clara.

```
screensnap/
├── background/           # Service Worker — coordinación y lógica central
│   └── service-worker.js
├── content/              # Content scripts — interacción con páginas
│   ├── content-script.js
│   └── content-style.css
├── popup/                # UI del popup
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── offscreen/            # Offscreen documents — DOM APIs sin UI
│   ├── offscreen.html
│   └── offscreen.js
├── shared/               # Módulos compartidos
│   ├── constants.js
│   ├── storage-manager.js
│   ├── message-types.js
│   └── utils.js
├── pages/                # Extension pages (editor, history, etc.)
│   ├── editor/
│   ├── history/
│   └── settings/
└── assets/
    ├── icons/
    ├── styles/
    └── _locales/         # i18n
```

### 1.2 Patrones de Diseño Recomendados

#### Module Pattern con ES Modules

MV3 soporta ES modules en service workers si `"type": "module"` está en el manifest:

```json
{
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  }
}
```

```javascript
// shared/constants.js
export const MESSAGE_TYPES = Object.freeze({
  CAPTURE_VISIBLE: 'capture-visible',
  CAPTURE_FULL: 'capture-full',
  CAPTURE_SELECTION: 'capture-selection',
  START_RECORDING: 'start-recording',
  STOP_RECORDING: 'stop-recording',
  RECORDING_STATUS: 'recording-status',
});

export const STORAGE_KEYS = Object.freeze({
  SETTINGS: 'settings',
  HISTORY: 'capture-history',
  RECORDING_STATE: 'recording-state',
});
```

#### Pub/Sub Pattern para Message Passing

Implementar un router de mensajes centralizado en el service worker:

```javascript
// background/message-router.js
const handlers = new Map();

export function registerHandler(type, handler) {
  if (handlers.has(type)) {
    console.warn(`Handler already registered for: ${type}`);
  }
  handlers.set(type, handler);
}

export function initMessageRouter() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, payload } = message;
    const handler = handlers.get(type);

    if (!handler) {
      console.warn(`No handler for message type: ${type}`);
      return false;
    }

    // Support async handlers
    const result = handler(payload, sender);
    if (result instanceof Promise) {
      result
        .then(response => sendResponse({ success: true, data: response }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response
    }

    sendResponse({ success: true, data: result });
    return false;
  });
}
```

```javascript
// background/service-worker.js
import { initMessageRouter, registerHandler } from './message-router.js';
import { MESSAGE_TYPES } from '../shared/constants.js';
import { handleCaptureVisible } from './handlers/capture.js';
import { handleStartRecording, handleStopRecording } from './handlers/recording.js';

registerHandler(MESSAGE_TYPES.CAPTURE_VISIBLE, handleCaptureVisible);
registerHandler(MESSAGE_TYPES.START_RECORDING, handleStartRecording);
registerHandler(MESSAGE_TYPES.STOP_RECORDING, handleStopRecording);

initMessageRouter();
```

#### State Management Pattern

Para estado compartido entre componentes, usar `chrome.storage.session` (en memoria, rápido) para estado efímero y `chrome.storage.local` para persistente:

```javascript
// shared/state-manager.js
export class StateManager {
  #cache = {};
  #storageArea;
  #listeners = new Map();

  constructor(storageArea = 'session') {
    this.#storageArea = chrome.storage[storageArea];
    this.#initListener();
  }

  #initListener() {
    this.#storageArea.onChanged.addListener((changes) => {
      for (const [key, { newValue }] of Object.entries(changes)) {
        this.#cache[key] = newValue;
        const callbacks = this.#listeners.get(key) || [];
        callbacks.forEach(cb => cb(newValue));
      }
    });
  }

  async get(key, defaultValue = null) {
    if (key in this.#cache) return this.#cache[key];
    const result = await this.#storageArea.get(key);
    this.#cache[key] = result[key] ?? defaultValue;
    return this.#cache[key];
  }

  async set(key, value) {
    this.#cache[key] = value;
    await this.#storageArea.set({ [key]: value });
  }

  onChange(key, callback) {
    if (!this.#listeners.has(key)) {
      this.#listeners.set(key, []);
    }
    this.#listeners.get(key).push(callback);
    return () => {
      const cbs = this.#listeners.get(key);
      const idx = cbs.indexOf(callback);
      if (idx !== -1) cbs.splice(idx, 1);
    };
  }
}
```

### 1.3 Comunicación entre Componentes

#### One-time Messages (Simple requests)

```javascript
// Desde content script o popup → service worker
const response = await chrome.runtime.sendMessage({
  type: MESSAGE_TYPES.CAPTURE_VISIBLE,
  payload: { format: 'png', quality: 0.95 }
});

if (!response.success) {
  console.error('Capture failed:', response.error);
}
```

#### Long-lived Connections (Streaming data)

Ideal para screen recording donde necesitas comunicación continua:

```javascript
// content-script.js — Abrir conexión para recording updates
const port = chrome.runtime.connect({ name: 'recording-channel' });

port.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'recording-started':
      showRecordingIndicator();
      break;
    case 'recording-time-update':
      updateTimer(msg.elapsed);
      break;
    case 'recording-stopped':
      hideRecordingIndicator();
      break;
  }
});

port.onDisconnect.addListener(() => {
  // Cleanup on disconnect
  hideRecordingIndicator();
});
```

```javascript
// service-worker.js — Manejar conexiones
const recordingPorts = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'recording-channel') return;

  recordingPorts.add(port);

  port.onDisconnect.addListener(() => {
    recordingPorts.delete(port);
  });

  port.onMessage.addListener((msg) => {
    // Handle messages from content script
  });
});

// Broadcast to all connected ports
function broadcastRecordingStatus(status) {
  for (const port of recordingPorts) {
    try {
      port.postMessage(status);
    } catch (e) {
      recordingPorts.delete(port);
    }
  }
}
```

### 1.4 Error Handling y Recovery

```javascript
// shared/errors.js
export class ExtensionError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ExtensionError';
    this.code = code;
    this.details = details;
  }
}

export const ErrorCodes = Object.freeze({
  CAPTURE_FAILED: 'CAPTURE_FAILED',
  RECORDING_FAILED: 'RECORDING_FAILED',
  STORAGE_FULL: 'STORAGE_FULL',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  TAB_NOT_FOUND: 'TAB_NOT_FOUND',
  OFFSCREEN_FAILED: 'OFFSCREEN_FAILED',
});

// Wrapper para chrome API calls con retry
export async function chromeApiCall(apiFn, ...args) {
  try {
    const result = await apiFn(...args);
    if (chrome.runtime.lastError) {
      throw new ExtensionError(
        chrome.runtime.lastError.message,
        'CHROME_API_ERROR'
      );
    }
    return result;
  } catch (error) {
    if (error instanceof ExtensionError) throw error;
    throw new ExtensionError(error.message, 'UNEXPECTED_ERROR', { original: error });
  }
}
```

```javascript
// Uso con retry pattern
export async function withRetry(fn, { maxRetries = 3, delay = 1000, backoff = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delay * Math.pow(backoff, attempt)));
      }
    }
  }
  throw lastError;
}
```

---

## 2. Seguridad

### 2.1 Content Security Policy (CSP) para MV3

MV3 impone un CSP más estricto. El `"extension_pages"` field solo permite:

- `self`
- `none`
- `wasm-unsafe-eval`
- Localhost (solo para desarrollo/extensiones desempaquetadas)

**No se permite:** `unsafe-eval`, `unsafe-inline`, CDNs remotos, o código remoto.

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'",
    "sandbox": "sandbox allow-scripts allow-forms allow-popups allow-modals; script-src 'self' 'unsafe-inline' 'unsafe-eval'; child-src 'self';"
  }
}
```

**Regla fundamental MV3:** Todo el código debe estar bundled en la extensión. No se puede cargar JS desde servidores externos.

### 2.2 Permisos Mínimos Necesarios

**Principio de privilegio mínimo:** Solicitar SOLO los permisos que realmente se necesitan.

```json
// ❌ MAL — Permisos excesivos
{
  "permissions": ["tabs", "history", "bookmarks", "storage", "<all_urls>"]
}

// ✅ BIEN — Solo lo necesario
{
  "permissions": ["activeTab", "storage", "scripting"],
  "optional_permissions": ["tabCapture", "desktopCapture"]
}
```

**Mejores prácticas para permisos:**

1. **Usar `activeTab` en lugar de `<all_urls>`** cuando sea posible. `activeTab` no muestra warning de instalación.
2. **Usar `optional_permissions`** para features que no todos los usuarios necesitan. Se piden en runtime.
3. **Preferir `host_permissions` específicos** sobre `<all_urls>`.
4. **Cada permiso nuevo con warning** puede desactivar la extensión hasta que el usuario acepte.

```javascript
// Solicitar permisos opcionales en runtime
async function requestRecordingPermission() {
  const granted = await chrome.permissions.request({
    permissions: ['tabCapture', 'desktopCapture']
  });

  if (!granted) {
    showMessage('Se necesitan permisos de grabación para esta función');
    return false;
  }
  return true;
}
```

### 2.3 Sanitización de Inputs

**Nunca** insertar HTML no sanitizado, especialmente en content scripts:

```javascript
// ❌ PELIGROSO — XSS vulnerability
element.innerHTML = userInput;
document.write(untrustedData);

// ✅ SEGURO — Usar DOM APIs safe
const textNode = document.createTextNode(userInput);
element.appendChild(textNode);

// ✅ SEGURO — setAttribute para atributos
element.setAttribute('title', userInput);

// ✅ SEGURO — textContent para texto
element.textContent = userInput;
```

**Para HTML dinámico, usar DOMPurify:**

```javascript
import DOMPurify from './lib/dompurify.min.js';

// Sanitizar HTML antes de insertar
const cleanHTML = DOMPurify.sanitize(dirtyHTML, {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
  ALLOWED_ATTR: ['href', 'title']
});
element.innerHTML = cleanHTML;
```

### 2.4 XSS Prevention en Extensiones

1. **Nunca usar `eval()`, `new Function()`, o `setTimeout(string)`** en extension pages
2. **No insertar scripts remotos** — todo debe ser local
3. **Usar template literals con DOM APIs**, no string concatenation para HTML
4. **Content scripts corren en isolated world** — pero pueden ser afectados por páginas maliciosas si acceden a `wrappedJSObject` o comparten DOM

```javascript
// ❌ MAL — String-based HTML construction
const html = `<div class="${userClass}" onclick="${handler}">${userContent}</div>`;
container.innerHTML = html;

// ✅ BIEN — DOM API construction
const div = document.createElement('div');
div.className = sanitizeClassName(userClass);
div.textContent = userContent;
div.addEventListener('click', handler);
container.appendChild(div);
```

### 2.5 Safe Eval Alternatives

Si necesitas evaluar código dinámico, usa **sandboxed iframes**:

```json
// manifest.json
{
  "sandbox": {
    "pages": ["sandbox/sandbox.html"]
  }
}
```

```javascript
// Comunicación con sandbox via postMessage
const iframe = document.createElement('iframe');
iframe.src = chrome.runtime.getURL('sandbox/sandbox.html');
document.body.appendChild(iframe);

iframe.contentWindow.postMessage({ code: dynamicCode }, '*');

window.addEventListener('message', (event) => {
  if (event.source === iframe.contentWindow) {
    console.log('Sandbox result:', event.data);
  }
});
```

### 2.6 Host Permissions Best Practices

```json
// ❌ MAL — Acceso a todas las URLs
{
  "host_permissions": ["<all_urls>"]
}

// ✅ MEJOR — URLs específicas cuando sea posible
{
  "host_permissions": ["https://api.myservice.com/*"]
}

// ✅ MEJOR AÚN — Usar activeTab para interacción manual
{
  "permissions": ["activeTab"]
}
```

**Para ScreenSnap específicamente:** Como es una herramienta de captura, `<all_urls>` puede ser justificable ya que el content script necesita funcionar en cualquier página. Sin embargo, considerar si el content script puede inyectarse programáticamente solo cuando se necesita en lugar de declarativamente en todas las páginas.

---

## 3. Performance

### 3.1 Service Worker Lifecycle y Optimización

El service worker de extensiones Chrome tiene un comportamiento especial:

- **Se termina después de 30 segundos de inactividad**
- **Un request no puede tardar más de 5 minutos**
- **Se reactiva con cada evento**

**Reglas críticas:**

```javascript
// ❌ MAL — Global state que se pierde
let captureCount = 0;
let currentSettings = {};

// ✅ BIEN — Persistir en storage
const storageCache = {};
const initPromise = chrome.storage.session.get().then(items => {
  Object.assign(storageCache, items);
});

// Asegurar que el cache está listo antes de operar
chrome.action.onClicked.addListener(async (tab) => {
  await initPromise;
  // Ahora es safe usar storageCache
});
```

**Mantener el service worker vivo durante operaciones largas:**

```javascript
// Para grabaciones que necesitan service worker activo:
// 1. WebSocket connections mantienen SW vivo (Chrome 116+)
// 2. Long-lived messaging (runtime.connect) mantiene SW vivo (Chrome 114+)
// 3. chrome.alarms para keepalive periódico

// Keepalive pattern para recording
let keepAliveInterval;

function startKeepAlive() {
  // Create alarm that fires every 25 seconds (before 30s timeout)
  chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });
}

function stopKeepAlive() {
  chrome.alarms.clear('keepalive');
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    // Just receiving the event keeps SW alive
    console.debug('Keepalive ping');
  }
});
```

### 3.2 Memory Management (Canvas y Video Streams)

**Especialmente crítico para ScreenSnap:**

```javascript
// ✅ Liberar MediaStreams cuando ya no se necesitan
function stopAllTracks(stream) {
  if (!stream) return;
  stream.getTracks().forEach(track => {
    track.stop();
    stream.removeTrack(track);
  });
}

// ✅ Revocar Object URLs después de usarlos
const url = URL.createObjectURL(blob);
try {
  await downloadFile(url, filename);
} finally {
  URL.revokeObjectURL(url);
}

// ✅ Limpiar canvas cuando ya no se necesita
function cleanupCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
}

// ✅ Para video recording — cleanup agresivo
class RecordingManager {
  #mediaStream = null;
  #mediaRecorder = null;
  #chunks = [];

  async startRecording(stream) {
    this.#mediaStream = stream;
    this.#chunks = [];
    this.#mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 2500000
    });

    this.#mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.#chunks.push(e.data);
    };

    this.#mediaRecorder.start(1000); // Collect every 1 second
  }

  async stopRecording() {
    return new Promise((resolve) => {
      this.#mediaRecorder.onstop = () => {
        const blob = new Blob(this.#chunks, { type: 'video/webm' });
        this.cleanup();
        resolve(blob);
      };
      this.#mediaRecorder.stop();
    });
  }

  cleanup() {
    stopAllTracks(this.#mediaStream);
    this.#mediaStream = null;
    this.#mediaRecorder = null;
    this.#chunks = [];
  }
}
```

### 3.3 Lazy Loading de Recursos

```javascript
// ✅ Importar módulos solo cuando se necesitan (dynamic import)
chrome.action.onClicked.addListener(async (tab) => {
  // Solo cargar el módulo de captura cuando se necesita
  const { captureVisibleTab } = await import('./handlers/capture.js');
  await captureVisibleTab(tab);
});

// ✅ En extension pages — lazy load de componentes pesados
async function openEditor(imageData) {
  // Cargar el canvas editor solo cuando se necesita
  const { initCanvasEditor } = await import('./editor/canvas-editor.js');
  initCanvasEditor(imageData);
}
```

### 3.4 Storage Quota Management

| Storage Area | Límite | Per-item | Notas |
|---|---|---|---|
| `storage.local` | 10 MB (o ilimitado con `unlimitedStorage`) | Sin límite por item | Persiste hasta desinstalar |
| `storage.sync` | ~100 KB total | 8 KB por item, 512 items max | Se sincroniza entre dispositivos |
| `storage.session` | 10 MB | Sin límite | En memoria, se pierde al reiniciar |

```javascript
// ✅ Monitorear uso de storage
async function checkStorageUsage() {
  const bytesInUse = await chrome.storage.local.getBytesInUse(null);
  const maxBytes = chrome.storage.local.QUOTA_BYTES; // 10485760

  const usagePercent = (bytesInUse / maxBytes) * 100;

  if (usagePercent > 80) {
    console.warn(`Storage usage: ${usagePercent.toFixed(1)}% — consider cleanup`);
    await cleanupOldCaptures();
  }

  return { bytesInUse, maxBytes, usagePercent };
}

// ✅ Para ScreenSnap: NO guardar imágenes/videos grandes en chrome.storage
// Usar IndexedDB para blobs grandes, o descargar directamente
async function saveCapture(blob, metadata) {
  // Metadata en chrome.storage (pequeño)
  const captures = await chrome.storage.local.get('captures');
  const list = captures.captures || [];
  list.push({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: metadata.type,
    format: metadata.format,
    size: blob.size,
    // NO guardar el blob aquí
  });
  await chrome.storage.local.set({ captures: list });

  // Blob grande → descargar directamente
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url,
    filename: metadata.filename,
    saveAs: metadata.saveAs
  });
  URL.revokeObjectURL(url);
}
```

### 3.5 Efficient Message Passing

```javascript
// ❌ MAL — Enviar datos grandes por message passing
chrome.runtime.sendMessage({
  type: 'save-capture',
  imageData: hugeBase64String // Puede ser megabytes
});

// ✅ BIEN — Usar referencias, no datos directos
// Opción 1: Guardar en storage/IndexedDB y pasar solo la key
await chrome.storage.session.set({ [`capture-${id}`]: imageData });
chrome.runtime.sendMessage({
  type: 'save-capture',
  captureId: id
});

// Opción 2: Para offscreen documents, usar transferable objects
// cuando sea posible (MessageChannel)
```

**Límite de mensaje:** 64 MiB máximo por mensaje. Pero aunque quepa, mensajes grandes bloquean.

### 3.6 requestAnimationFrame vs setInterval

```javascript
// ❌ MAL — setInterval para animaciones
setInterval(() => {
  updateRecordingTimer();
  drawAnnotation();
}, 16);

// ✅ BIEN — requestAnimationFrame para rendering
function animate() {
  updateRecordingTimer();
  drawAnnotation();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// ✅ Para timers no-visuales, usar setInterval está OK
// Pero para recording timer display en content script:
let startTime;
function updateTimer() {
  const elapsed = Date.now() - startTime;
  timerElement.textContent = formatTime(elapsed);
  if (isRecording) {
    requestAnimationFrame(updateTimer);
  }
}
```

### 3.7 Back/Forward Cache Considerations

Las extensiones pueden invalidar el bfcache, ralentizando la navegación del usuario:

```javascript
// ❌ MAL — unload handler (deprecated, invalida bfcache)
window.addEventListener('unload', cleanup);

// ✅ BIEN — pagehide event
window.addEventListener('pagehide', cleanup);

// ❌ MAL — WebSocket en content script (invalida bfcache)
const ws = new WebSocket('ws://localhost:8080');

// ✅ BIEN — Mover WebSocket al service worker
// y comunicar via runtime.connect()

// ❌ MAL — Dejar listeners sin limpiar
window.addEventListener('scroll', heavyHandler);

// ✅ BIEN — Cleanup con AbortController
const controller = new AbortController();
window.addEventListener('scroll', heavyHandler, { signal: controller.signal });
// Cuando el content script ya no necesite el listener:
controller.abort();
```

---

## 4. Código Profesional

### 4.1 Estructura de Carpetas Recomendada

```
screensnap/
├── manifest.json
├── background/
│   ├── service-worker.js          # Entry point, importa módulos
│   ├── message-router.js          # Routing de mensajes
│   └── handlers/                  # Handlers organizados por feature
│       ├── capture.js
│       ├── recording.js
│       └── download.js
├── content/
│   ├── content-script.js          # Entry point
│   ├── selection-overlay.js       # UI de selección de área
│   ├── recording-controls.js      # Controles de grabación
│   └── styles/
│       ├── content-style.css
│       └── recording-controls.css
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js
├── pages/                         # Extension pages completas
│   ├── editor/
│   │   ├── editor.html
│   │   ├── editor.js
│   │   ├── canvas-tools.js
│   │   └── editor.css
│   ├── history/
│   │   ├── history.html
│   │   ├── history.js
│   │   └── history.css
│   ├── settings/
│   │   ├── settings.html
│   │   ├── settings.js
│   │   └── settings.css
│   └── welcome/
│       ├── welcome.html
│       └── welcome.js
├── shared/                        # Código compartido entre componentes
│   ├── constants.js               # Message types, storage keys, etc.
│   ├── state-manager.js           # State management via chrome.storage
│   ├── storage-utils.js           # Storage helpers
│   ├── errors.js                  # Error types y helpers
│   ├── utils.js                   # Utilidades generales
│   └── logger.js                  # Logging system
├── lib/                           # Third-party libraries (bundled)
│   └── dompurify.min.js
├── assets/
│   ├── icons/
│   ├── images/
│   └── fonts/
├── _locales/                      # i18n
│   ├── en/messages.json
│   └── es/messages.json
├── docs/                          # Documentation
│   └── BEST_PRACTICES.md
└── tests/                         # Tests
    ├── unit/
    └── e2e/
```

### 4.2 Naming Conventions

```javascript
// Files: kebab-case
// content-script.js, message-router.js, canvas-tools.js

// Classes: PascalCase
class RecordingManager {}
class StateManager {}
class CaptureHandler {}

// Functions: camelCase, verbos descriptivos
function captureVisibleTab() {}
function startRecording() {}
function handleMessage() {}

// Constants: UPPER_SNAKE_CASE
const MAX_CAPTURE_SIZE = 10 * 1024 * 1024;
const DEFAULT_FORMAT = 'png';
const MESSAGE_TYPES = Object.freeze({ ... });

// Private members: # prefix (ES2022)
class MyClass {
  #privateField;
  #privateMethod() {}
}

// Event handlers: handle + Event/Subject
function handleCaptureRequest() {}
function handleStorageChange() {}
function handleTabRemoved() {}

// Boolean variables: is/has/should prefix
let isRecording = false;
let hasPermission = true;
let shouldAutoSave = false;

// DOM elements: suffix with Element or El
const timerElement = document.getElementById('timer');
const saveBtn = document.querySelector('.save-button');
```

### 4.3 JSDoc Documentation Standards

```javascript
/**
 * Captures the visible area of the active tab.
 *
 * @param {chrome.tabs.Tab} tab - The tab to capture
 * @param {Object} options - Capture options
 * @param {string} [options.format='png'] - Image format ('png' | 'jpeg' | 'webp')
 * @param {number} [options.quality=0.92] - JPEG/WebP quality (0-1)
 * @returns {Promise<Blob>} The captured image as a Blob
 * @throws {ExtensionError} If capture fails or tab is not accessible
 *
 * @example
 * const blob = await captureVisibleTab(tab, { format: 'png' });
 * downloadBlob(blob, 'screenshot.png');
 */
async function captureVisibleTab(tab, { format = 'png', quality = 0.92 } = {}) {
  // Implementation
}

/**
 * @typedef {Object} RecordingOptions
 * @property {'tab' | 'desktop' | 'camera'} source - Recording source
 * @property {boolean} [includeAudio=false] - Whether to include audio
 * @property {number} [maxDuration=300] - Max recording duration in seconds
 * @property {string} [format='webm'] - Output format
 */

/**
 * Starts a screen recording session.
 *
 * @param {RecordingOptions} options
 * @returns {Promise<string>} Session ID for the recording
 */
async function startRecording(options) {}
```

### 4.4 Error Boundaries

```javascript
// shared/error-boundary.js
/**
 * Wraps an async function with error handling and logging.
 * Prevents unhandled rejections from crashing the service worker.
 */
export function withErrorBoundary(fn, context = '') {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error(`[${context}] Error:`, error);

      // Log to storage for debugging
      await logError(context, error);

      // Re-throw if it's a known, handleable error
      if (error instanceof ExtensionError) {
        throw error;
      }

      // Wrap unknown errors
      throw new ExtensionError(
        `Unexpected error in ${context}: ${error.message}`,
        'UNEXPECTED_ERROR',
        { originalError: error.stack }
      );
    }
  };
}

// Uso:
const safeCaptureVisible = withErrorBoundary(captureVisibleTab, 'capture-visible');
```

### 4.5 Logging y Debugging

```javascript
// shared/logger.js
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

class Logger {
  #prefix;
  #level;

  constructor(prefix, level = LOG_LEVELS.INFO) {
    this.#prefix = prefix;
    this.#level = level;
  }

  #log(level, levelName, ...args) {
    if (level < this.#level) return;

    const timestamp = new Date().toISOString().slice(11, 23);
    const prefix = `[${timestamp}][${this.#prefix}][${levelName}]`;

    switch (level) {
      case LOG_LEVELS.ERROR: console.error(prefix, ...args); break;
      case LOG_LEVELS.WARN:  console.warn(prefix, ...args);  break;
      case LOG_LEVELS.INFO:  console.info(prefix, ...args);  break;
      default:               console.debug(prefix, ...args);
    }
  }

  debug(...args) { this.#log(LOG_LEVELS.DEBUG, 'DEBUG', ...args); }
  info(...args)  { this.#log(LOG_LEVELS.INFO, 'INFO', ...args);   }
  warn(...args)  { this.#log(LOG_LEVELS.WARN, 'WARN', ...args);   }
  error(...args) { this.#log(LOG_LEVELS.ERROR, 'ERROR', ...args); }
}

// Factory
export function createLogger(module) {
  return new Logger(module);
}

// Uso:
const log = createLogger('service-worker');
log.info('Extension started');
log.error('Capture failed', error);
```

### 4.6 Testing Strategies para Extensiones

```javascript
// 1. Unit tests — para shared modules (Jest, Vitest)
// tests/unit/state-manager.test.js
import { StateManager } from '../../shared/state-manager.js';

// Mock chrome.storage
const mockStorage = {
  get: jest.fn(),
  set: jest.fn(),
  onChanged: { addListener: jest.fn() },
};
global.chrome = { storage: { session: mockStorage } };

describe('StateManager', () => {
  test('should cache values after first get', async () => {
    mockStorage.get.mockResolvedValue({ key: 'value' });
    const manager = new StateManager('session');
    await manager.get('key');
    await manager.get('key');
    expect(mockStorage.get).toHaveBeenCalledTimes(1);
  });
});

// 2. Integration tests — con Puppeteer
// tests/e2e/capture.test.js
const puppeteer = require('puppeteer');

describe('Screenshot capture', () => {
  let browser;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
  });

  test('should capture visible tab', async () => {
    const page = await browser.newPage();
    await page.goto('https://example.com');

    // Find extension popup
    const extensionPage = await browser.newPage();
    const extensionId = '...'; // Get from chrome://extensions
    await extensionPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    // Click capture button
    await extensionPage.click('#btn-capture-visible');

    // Verify download
    // ...
  });

  afterAll(() => browser.close());
});
```

---

## 5. UX/UI

### 5.1 Popup Design Guidelines

- **Tamaño recomendado:** 300-400px wide, no más de 600px tall
- **Cargar rápido:** El popup se cierra si pierde foco, así que debe ser instantáneo
- **No hacer requests lentos en popup:** Iniciar acciones en service worker
- **Feedback inmediato:** Mostrar loading states al iniciar acciones

```javascript
// popup.js — Pattern para acciones rápidas
document.getElementById('btn-capture').addEventListener('click', async () => {
  const btn = document.getElementById('btn-capture');

  // Feedback inmediato
  btn.disabled = true;
  btn.textContent = 'Capturing...';

  try {
    // Enviar al service worker y cerrar popup
    await chrome.runtime.sendMessage({
      type: 'CAPTURE_VISIBLE',
      payload: { format: 'png' }
    });
    window.close(); // Cerrar popup rápido
  } catch (error) {
    btn.disabled = false;
    btn.textContent = 'Capture';
    showError('Capture failed');
  }
});
```

### 5.2 Accesibilidad (A11y)

```html
<!-- popup.html — Ejemplos de accesibilidad -->

<!-- ✅ Roles ARIA apropiados -->
<button id="btn-capture"
        role="button"
        aria-label="Capture visible area screenshot"
        tabindex="0">
  <svg aria-hidden="true"><!-- icon --></svg>
  <span>Screenshot</span>
</button>

<!-- ✅ Grupos de opciones -->
<fieldset role="radiogroup" aria-label="Capture mode">
  <legend>Capture Mode</legend>
  <label>
    <input type="radio" name="mode" value="visible" checked>
    Visible Area
  </label>
  <label>
    <input type="radio" name="mode" value="full">
    Full Page
  </label>
  <label>
    <input type="radio" name="mode" value="selection">
    Selection
  </label>
</fieldset>

<!-- ✅ Status region para screen readers -->
<div role="status" aria-live="polite" id="status-message"></div>
```

```javascript
// Keyboard navigation
document.addEventListener('keydown', (e) => {
  // Esc para cerrar/cancelar
  if (e.key === 'Escape') {
    cancelCurrentAction();
  }

  // Enter/Space para activar botones
  if (e.key === 'Enter' || e.key === ' ') {
    if (document.activeElement.matches('button, [role="button"]')) {
      document.activeElement.click();
    }
  }
});

// Focus management
function showModal(modalElement) {
  modalElement.hidden = false;
  modalElement.setAttribute('aria-modal', 'true');

  // Trap focus inside modal
  const focusableElements = modalElement.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusableElements.length) {
    focusableElements[0].focus();
  }
}
```

### 5.3 Consistent Theming

```css
/* assets/styles/theme.css */
:root {
  /* Color system */
  --color-primary: #4285F4;
  --color-primary-hover: #3367D6;
  --color-secondary: #34A853;
  --color-error: #EA4335;
  --color-warning: #FBBC05;

  /* Surfaces */
  --surface-bg: #FFFFFF;
  --surface-fg: #202124;
  --surface-secondary: #F1F3F4;
  --surface-border: #DADCE0;

  /* Typography */
  --font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-size-xs: 11px;
  --font-size-sm: 13px;
  --font-size-base: 14px;
  --font-size-lg: 16px;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* Dark theme */
@media (prefers-color-scheme: dark) {
  :root {
    --surface-bg: #202124;
    --surface-fg: #E8EAED;
    --surface-secondary: #303134;
    --surface-border: #5F6368;
  }
}

/* Force dark theme class */
:root.dark-theme {
  --surface-bg: #202124;
  --surface-fg: #E8EAED;
  --surface-secondary: #303134;
  --surface-border: #5F6368;
}
```

### 5.4 Loading States y Feedback Visual

```javascript
// shared/ui-utils.js
export function showLoading(container, message = 'Loading...') {
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    <div class="spinner" aria-hidden="true"></div>
    <span class="loading-message">${message}</span>
  `;
  container.style.position = 'relative';
  container.appendChild(overlay);
  return () => overlay.remove();
}

// CSS para feedback visual consistente
/*
.btn {
  transition: var(--transition-fast);
}
.btn:active {
  transform: scale(0.97);
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn--loading::after {
  content: '';
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  margin-left: 8px;
}
*/
```

### 5.5 Internationalization (i18n)

```json
// _locales/en/messages.json
{
  "extensionName": {
    "message": "ScreenSnap",
    "description": "Extension name"
  },
  "captureVisible": {
    "message": "Capture Visible Area",
    "description": "Button to capture the visible tab area"
  },
  "captureFullPage": {
    "message": "Capture Full Page",
    "description": "Button to capture the entire page"
  },
  "recordScreen": {
    "message": "Record Screen",
    "description": "Button to start screen recording"
  },
  "settingsSaved": {
    "message": "Settings saved successfully",
    "description": "Notification after saving settings"
  }
}
```

```html
<!-- En HTML -->
<button id="btn-capture">
  <span data-i18n="captureVisible"></span>
</button>
```

```javascript
// En JS
const text = chrome.i18n.getMessage('captureVisible');

// Auto-translate data-i18n attributes
document.querySelectorAll('[data-i18n]').forEach(el => {
  const key = el.getAttribute('data-i18n');
  el.textContent = chrome.i18n.getMessage(key);
});
```

---

## 6. Publicación y Mantenimiento

### 6.1 Chrome Web Store Review Guidelines

**Lo que revisan:**

- Cumplimiento del propósito único declarado
- Uso justificado de cada permiso
- No código remoto (todo bundled)
- Privacy policy si se recolectan datos
- Manifest V3 requerido para nuevas extensiones
- No técnicas de instalación engañosas
- Funcionalidad real (no extensiones vacías)

**Razones comunes de rechazo:**

1. Permisos excesivos sin justificación
2. Falta de privacy policy
3. Descripción engañosa
4. Código ofuscado sin justificación
5. Funcionalidad mínima o spam

### 6.2 Manifest Best Practices

```json
{
  "manifest_version": 3,
  "name": "__MSG_extensionName__",
  "description": "__MSG_extensionDescription__",
  "version": "1.0.0",
  "version_name": "1.0.0 Beta",

  "minimum_chrome_version": "116",

  "default_locale": "en",

  "icons": {
    "16": "assets/icons/icon-16.png",
    "32": "assets/icons/icon-32.png",
    "48": "assets/icons/icon-48.png",
    "128": "assets/icons/icon-128.png"
  },

  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "assets/icons/icon-16.png",
      "32": "assets/icons/icon-32.png"
    },
    "default_title": "__MSG_extensionName__"
  },

  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },

  "permissions": [
    "activeTab",
    "storage",
    "offscreen",
    "scripting"
  ],

  "optional_permissions": [
    "tabCapture",
    "desktopCapture",
    "downloads",
    "notifications"
  ],

  "commands": {
    "_execute_action": {
      "suggested_key": {
        "default": "Alt+Shift+S"
      }
    },
    "capture-visible": {
      "suggested_key": {
        "default": "Alt+Shift+V"
      },
      "description": "__MSG_captureVisible__"
    }
  }
}
```

### 6.3 Versionado

Seguir [Semantic Versioning](https://semver.org/):

```
MAJOR.MINOR.PATCH

1.0.0 → Primera versión pública
1.1.0 → Nueva feature (area selection)
1.1.1 → Bug fix
1.2.0 → Nueva feature (video recording)
2.0.0 → Breaking change (restructura de settings)
```

Chrome usa hasta 4 números: `MAJOR.MINOR.PATCH.BUILD`

### 6.4 Privacy Policy Requirements

**Obligatorio si:**
- Recolectas cualquier dato del usuario
- Usas analytics
- Tu extensión accede a contenido de páginas web

**Qué incluir:**
1. Qué datos se recolectan
2. Cómo se usan
3. Si se comparten con terceros
4. Cómo se almacenan y protegen
5. Cómo los usuarios pueden eliminar sus datos
6. Información de contacto

**Para ScreenSnap:** Como todo es local y no se envía data a servidores, la privacy policy puede ser simple pero debe existir.

### 6.5 Update Flow

```javascript
// background/service-worker.js
chrome.runtime.onInstalled.addListener((details) => {
  switch (details.reason) {
    case 'install':
      // Primera instalación
      chrome.tabs.create({
        url: chrome.runtime.getURL('pages/welcome/welcome.html')
      });
      initDefaultSettings();
      break;

    case 'update':
      // Actualización
      const previousVersion = details.previousVersion;
      const currentVersion = chrome.runtime.getManifest().version;
      console.info(`Updated from ${previousVersion} to ${currentVersion}`);

      // Migrar datos si es necesario
      migrateData(previousVersion, currentVersion);

      // Opcionalmente mostrar changelog
      if (shouldShowChangelog(previousVersion)) {
        chrome.notifications.create('update-notification', {
          type: 'basic',
          iconUrl: 'assets/icons/icon-128.png',
          title: `ScreenSnap updated to v${currentVersion}`,
          message: 'Click to see what\'s new!',
        });
      }
      break;
  }
});
```

---

## 7. Anti-Patrones — Qué NO Hacer

### 7.1 Common Mistakes en MV3

#### ❌ Usar variables globales para estado

```javascript
// ❌ MAL — Se pierde cuando el service worker se apaga
let isRecording = false;
let captureHistory = [];

// ✅ BIEN — Persistir en chrome.storage.session
await chrome.storage.session.set({ isRecording: true });
```

#### ❌ Asumir que el service worker siempre está corriendo

```javascript
// ❌ MAL — setInterval en service worker (se pierde)
setInterval(() => {
  checkRecordingStatus();
}, 1000);

// ✅ BIEN — Usar chrome.alarms
chrome.alarms.create('check-recording', { periodInMinutes: 1/60 }); // 1 segundo
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'check-recording') {
    checkRecordingStatus();
  }
});
```

#### ❌ No manejar la reconexión del service worker

```javascript
// ❌ MAL — Port connections se pierden al reiniciar SW
const port = chrome.runtime.connect({ name: 'recording' });
// Si el SW se reinicia, este port muere silenciosamente

// ✅ BIEN — Reconectar automáticamente
function createPort() {
  const port = chrome.runtime.connect({ name: 'recording' });
  port.onDisconnect.addListener(() => {
    // Reconectar después de un breve delay
    setTimeout(createPort, 100);
  });
  port.onMessage.addListener(handleMessage);
  return port;
}
```

### 7.2 Memory Leaks Comunes

#### ❌ No revocar Object URLs

```javascript
// ❌ Memory leak — URL nunca se libera
const url = URL.createObjectURL(blob);
img.src = url;
// blob sigue referenciado por la URL indefinidamente

// ✅ Revocar cuando ya no se necesita
const url = URL.createObjectURL(blob);
img.src = url;
img.onload = () => URL.revokeObjectURL(url);
```

#### ❌ No detener MediaStreams

```javascript
// ❌ Memory leak — stream sigue activo
const stream = await navigator.mediaDevices.getDisplayMedia();
// ... user cancels but stream is never stopped

// ✅ Siempre cleanup
try {
  const stream = await navigator.mediaDevices.getDisplayMedia();
  // ...use stream...
} catch (e) {
  // User cancelled or error
} finally {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
}
```

#### ❌ Event listeners sin cleanup en content scripts

```javascript
// ❌ Listeners se acumulan si el content script se re-inyecta
window.addEventListener('resize', onResize);
document.addEventListener('scroll', onScroll);
document.addEventListener('mousemove', onMouseMove);

// ✅ Usar AbortController para cleanup
const controller = new AbortController();
const { signal } = controller;

window.addEventListener('resize', onResize, { signal });
document.addEventListener('scroll', onScroll, { signal });
document.addEventListener('mousemove', onMouseMove, { signal });

// Cleanup all at once
function cleanup() {
  controller.abort();
}
```

#### ❌ Canvas sin cleanup

```javascript
// ❌ Canvas grande que nunca se libera
const canvas = document.createElement('canvas');
canvas.width = 3840;
canvas.height = 2160;
// Usa ~31 MB de memoria
// Si no se limpia, queda en memoria

// ✅ Resetear dimensiones para liberar memoria
function releaseCanvas(canvas) {
  canvas.width = 0;
  canvas.height = 0;
  // El browser puede ahora liberar el buffer
}
```

### 7.3 Pitfalls de tabCapture / desktopCapture

#### tabCapture Specifics

```javascript
// ❌ MAL — tabCapture.capture() solo funciona en response a user gesture
// No se puede llamar en un timer o automáticamente

// ✅ BIEN — Iniciar desde popup click o keyboard shortcut
chrome.action.onClicked.addListener(async (tab) => {
  // Este handler se ejecuta en response a user gesture
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tab.id,
  });
  // Enviar streamId al offscreen document
});

// ❌ MAL — Intentar capturar tabs especiales
// chrome:// y chrome-extension:// tabs no se pueden capturar

// ✅ BIEN — Verificar antes de capturar
if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
  showError('Cannot capture this page');
  return;
}
```

#### desktopCapture Pitfalls

```javascript
// ❌ MAL — No manejar el caso de usuario cancelando
chrome.desktopCapture.chooseDesktopMedia(
  ['screen', 'window', 'tab'],
  (streamId) => {
    // streamId puede ser undefined si el usuario cancela
    if (!streamId) return; // ← Importante!

    // Obtener el stream en offscreen document
  }
);

// ❌ MAL — No cancelar el picker si el popup se cierra
// El picker queda abierto sin handler

// ✅ BIEN — Guardar desktopCaptureId para cancelar
const captureId = chrome.desktopCapture.chooseDesktopMedia(
  ['screen', 'window', 'tab'],
  handleStreamId
);

// Si necesitas cancelar:
chrome.desktopCapture.cancelChooseDesktopMedia(captureId);
```

### 7.4 Problemas con chrome.storage Limits

```javascript
// ❌ MAL — Guardar blobs grandes en chrome.storage
await chrome.storage.local.set({
  screenshot: base64EncodedImage // Puede ser 5-30 MB!
});

// ✅ BIEN — Usar chrome.downloads o IndexedDB para blobs
// chrome.storage es para metadata y settings

// ❌ MAL — Muchas escrituras rápidas
for (const item of items) {
  await chrome.storage.sync.set({ [item.id]: item.data });
  // Puede exceder rate limits de sync
}

// ✅ BIEN — Batch writes
const batch = {};
for (const item of items) {
  batch[item.id] = item.data;
}
await chrome.storage.sync.set(batch);

// ❌ MAL — No manejar storage lleno
await chrome.storage.local.set({ captures: hugeArray });
// Falla silenciosamente o lanza error

// ✅ BIEN — Verificar espacio y manejar error
try {
  await chrome.storage.local.set({ captures: data });
} catch (error) {
  if (error.message.includes('QUOTA_BYTES')) {
    await cleanupOldData();
    await chrome.storage.local.set({ captures: data });
  }
}
```

### 7.5 Más Anti-Patrones

#### ❌ Content script declarativo cuando no se necesita siempre

```json
// ❌ MAL — Se carga en TODAS las páginas
{
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content-script.js"],
    "css": ["content-style.css"]
  }]
}

// ✅ MEJOR — Inyectar programáticamente solo cuando se necesita
// En service-worker.js:
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/content-script.js']
  });
  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ['content/content-style.css']
  });
});
```

#### ❌ Obfuscar código innecesariamente

El Chrome Web Store puede rechazar extensiones con código obfuscado. Minificación (webpack, terser) está OK, pero no obfuscación intencional.

#### ❌ Usar `document.write()` o `innerHTML` con datos no sanitizados

Ya cubierto en la sección de seguridad, pero vale recalcar: **nunca `innerHTML` con input del usuario**.

---

## 8. AUDIT CHECKLIST para ScreenSnap

### 🔒 Seguridad

- [ ] **`<all_urls>` en host_permissions:** ¿Es realmente necesario? Considerar `activeTab` + inyección programática
- [ ] **Content script declarativo en `<all_urls>`:** Se carga en cada página. ¿Puede ser programático?
- [ ] **Sanitización de inputs:** Revisar todo uso de `innerHTML`, `document.write()`, `insertAdjacentHTML()`
- [ ] **CSP en manifest:** ¿Está definido `content_security_policy`? Si no, el default es seguro pero conviene ser explícito
- [ ] **web_accessible_resources:** `recording-controls.css` está expuesto a todas las URLs. ¿Mínimamente necesario?
- [ ] **No eval/Function:** Verificar que no hay `eval()`, `new Function()`, o `setTimeout(string)`

### ⚡ Performance

- [ ] **Variables globales en service worker:** ¿Hay estado en variables que se pierde al apagar SW?
- [ ] **MediaStream cleanup:** ¿Se detienen todos los tracks al parar grabación o al cancelar?
- [ ] **Object URL cleanup:** ¿Se llama `URL.revokeObjectURL()` después de usar cada blob URL?
- [ ] **Canvas cleanup:** ¿Se resetean las dimensiones de canvas cuando ya no se usan?
- [ ] **Event listeners cleanup:** ¿Los content scripts limpian sus listeners? ¿Usan `AbortController`?
- [ ] **Storage size:** ¿Se guardan blobs/imágenes grandes en `chrome.storage`? Migrar a downloads/IndexedDB
- [ ] **Back/forward cache:** ¿Hay `unload` listeners en content scripts? ¿WebSockets en content scripts?
- [ ] **setInterval en service worker:** ¿Hay intervalos que se pierden? Migrar a `chrome.alarms`
- [ ] **Lazy loading:** ¿Se importan módulos pesados solo cuando se necesitan?

### 🏗️ Arquitectura

- [ ] **Separación de concerns:** ¿Cada archivo tiene una responsabilidad clara?
- [ ] **Message types centralizados:** ¿Hay strings mágicos de mensajes esparcidos? Crear `constants.js`
- [ ] **Error handling consistente:** ¿Todos los handlers async tienen try/catch?
- [ ] **Message router:** ¿Hay un pattern limpio para routing de mensajes en SW?
- [ ] **ES Modules:** ¿El service worker usa `"type": "module"` para imports?
- [ ] **shared/ directory:** ¿El código compartido está centralizado?

### 📁 Estructura de Archivos

- [ ] **Naming consistency:** ¿Todos los archivos siguen kebab-case?
- [ ] **Pages agrupadas:** ¿Editor, history, settings, welcome están en una carpeta `pages/`?
- [ ] **Shared utilities:** ¿Hay código duplicado entre componentes que debería estar en `shared/`?
- [ ] **Assets organizados:** ¿Icons, styles, fonts están en subdirectorios claros?

### 📝 Código

- [ ] **JSDoc en funciones públicas:** ¿Las funciones exportadas tienen documentación?
- [ ] **Constantes:** ¿Hay magic numbers o strings hardcodeados que deberían ser constantes?
- [ ] **Error types:** ¿Se usan error types específicos o solo `throw new Error()`?
- [ ] **Logging consistente:** ¿Hay un sistema de logging o solo `console.log` dispersos?
- [ ] **Async/await consistente:** ¿Se mezclan callbacks y promises innecesariamente?

### 🎨 UX/UI

- [ ] **Loading states:** ¿Las acciones lentas muestran feedback visual?
- [ ] **Error feedback:** ¿Los errores se comunican al usuario claramente?
- [ ] **Keyboard navigation:** ¿Se puede operar la extensión sin mouse?
- [ ] **ARIA labels:** ¿Los elementos interactivos tienen labels accesibles?
- [ ] **Dark mode:** ¿Se respeta `prefers-color-scheme`?
- [ ] **Theme consistency:** ¿Se usan CSS variables centralizadas?

### 🔧 Manifest

- [ ] **`minimum_chrome_version`:** ¿Está definido? Recomendado: `"116"` para features de SW lifecycle
- [ ] **Permisos opcionales:** ¿`tabCapture`, `desktopCapture`, `notifications` pueden ser optional?
- [ ] **ES Module en SW:** ¿Falta `"type": "module"` en background?
- [ ] **i18n ready:** ¿Nombre y descripción usan `__MSG_*__`?
- [ ] **Version:** ¿Sigue semver correctamente?

### 📋 Publicación

- [ ] **Privacy policy:** ¿Existe y está actualizada?
- [ ] **Store listing:** ¿Screenshots, description, category son correctos?
- [ ] **onInstalled handler:** ¿Maneja `install` y `update` correctamente?
- [ ] **Data migration:** ¿Hay plan para migrar datos entre versiones?

### 🧪 Testing

- [ ] **Unit tests:** ¿Existen para shared modules y handlers?
- [ ] **E2E tests:** ¿Hay tests de integración con Puppeteer?
- [ ] **Error paths:** ¿Se testan los caminos de error, no solo el happy path?
- [ ] **Permissions denied:** ¿Se testa qué pasa cuando el usuario niega permisos?
- [ ] **Service worker restart:** ¿Se testa que la extensión sobrevive un reinicio del SW?

### 🚨 Específicos de ScreenSnap

- [ ] **tabCapture user gesture:** ¿Las capturas de tab siempre inician desde user gesture?
- [ ] **Chrome pages check:** ¿Se verifica que no se intente capturar `chrome://` pages?
- [ ] **desktopCapture cancel:** ¿Se maneja correctamente cuando el usuario cancela el picker?
- [ ] **Offscreen document lifecycle:** ¿Se verifica si ya existe antes de crear? ¿Se cierra cuando no se necesita?
- [ ] **Recording state recovery:** Si el SW se reinicia durante una grabación, ¿qué pasa?
- [ ] **Large capture handling:** ¿Full-page screenshots de páginas muy largas causan OOM?
- [ ] **Multi-monitor:** ¿Se manejan correctamente las capturas en setups multi-monitor?
- [ ] **Content script re-injection:** ¿Qué pasa si el content script se inyecta dos veces en la misma página?

---

## Referencias

- [Chrome Extensions Developer Guide](https://developer.chrome.com/docs/extensions/develop/)
- [Manifest V3 Overview](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Service Workers Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Message Passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [chrome.storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [chrome.offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Permission Warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings)
- [Chrome Web Store Best Practices](https://developer.chrome.com/docs/webstore/best-practices)
- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/)
- [Improve Extension Security (MV3)](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security)
- [Build a Secure Extension (Mozilla)](https://extensionworkshop.com/documentation/develop/build-a-secure-extension/)
- [activeTab Permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)

---

*Documento generado como referencia para la refactorización del proyecto ScreenSnap.*
*Última actualización: 2026-03-16*
