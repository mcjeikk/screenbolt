/**
 * @file ScreenBolt — Editor v0.6.0
 * Full annotation editor with canvas-based drawing tools, PDF export,
 * undo/redo, crop, and history integration. Canvas API + TypeScript.
 */

import { getTimestamp } from '../utils/helpers.js';
import type { HistoryEntry, Settings } from '../utils/types.js';

// ── Annotation Types ────────────────────────────

interface Point {
  x: number;
  y: number;
}

interface BaseAnnotation {
  color: string;
  strokeWidth: number;
  opacity: number;
}

interface ArrowAnnotation extends BaseAnnotation {
  type: 'arrow';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface RectAnnotation extends BaseAnnotation {
  type: 'rect';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface CircleAnnotation extends BaseAnnotation {
  type: 'circle';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface LineAnnotation extends BaseAnnotation {
  type: 'line';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface FreehandAnnotation extends BaseAnnotation {
  type: 'freehand';
  points: Point[];
}

interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  startX: number;
  startY: number;
  text: string;
  fontSize: number;
}

interface BlurAnnotation extends BaseAnnotation {
  type: 'blur';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface HighlightAnnotation extends BaseAnnotation {
  type: 'highlight';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface CropAnnotation extends BaseAnnotation {
  type: 'crop';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

type Annotation =
  | ArrowAnnotation
  | RectAnnotation
  | CircleAnnotation
  | LineAnnotation
  | FreehandAnnotation
  | TextAnnotation
  | BlurAnnotation
  | HighlightAnnotation
  | CropAnnotation;

/** Annotation types that use start/end coordinate pairs for dragging. */
type DragAnnotation = Exclude<Annotation, FreehandAnnotation | TextAnnotation>;

type ToolName = Annotation['type'];

// ── Constants ───────────────────────────────────

const LOG_PREFIX = '[ScreenBolt][Editor]';
const MIN_DRAG_DISTANCE = 3;
const MIN_BLUR_SIZE = 2;
const RECT_CORNER_RADIUS = 8;
const HIGHLIGHT_COLOR = 'rgba(255, 214, 0, 0.35)';
const TOAST_DURATION_MS = 2500;
const JPEG_EXPORT_QUALITY = 0.92;
const THUMBNAIL_QUALITY = 0.6;
const THUMBNAIL_MAX_WIDTH = 320;
const THUMBNAIL_MAX_HEIGHT = 200;
const MAX_HISTORY_DATAURL_SIZE = 500_000;

const EDITOR_SHORTCUTS: Readonly<Record<string, ToolName>> = Object.freeze({
  a: 'arrow',
  r: 'rect',
  e: 'circle',
  l: 'line',
  p: 'freehand',
  t: 'text',
  b: 'blur',
  h: 'highlight',
  c: 'crop',
});

const TEXT_FONT_SIZES: Readonly<Record<number, number>> = Object.freeze({
  2: 16,
  4: 24,
  6: 36,
});

// ── DOM Refs ────────────────────────────────────

const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const canvasWrapper = document.getElementById('canvas-wrapper') as HTMLDivElement;
const colorPicker = document.getElementById('color-picker') as HTMLInputElement;
const colorPreview = document.getElementById('color-preview') as HTMLSpanElement;
const strokeSelect = document.getElementById('stroke-width') as HTMLSelectElement;
const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
const btnCropApply = document.getElementById('btn-crop-apply') as HTMLButtonElement;
const textOverlay = document.getElementById('text-input-overlay') as HTMLTextAreaElement;
const opacitySlider = document.getElementById('tool-opacity') as HTMLInputElement;
const opacityValueLabel = document.getElementById('opacity-value') as HTMLSpanElement;
const statusDimensions = document.getElementById('status-dimensions') as HTMLSpanElement;
const statusTool = document.getElementById('status-tool') as HTMLSpanElement;
const statusSize = document.getElementById('status-size') as HTMLSpanElement;

// ── State ───────────────────────────────────────

let baseImage: HTMLImageElement | null = null;
let annotations: Annotation[] = [];
let redoStack: Annotation[] = [];
let currentTool: ToolName | null = null;
let drawing = false;
let pendingAnnotation: Annotation | null = null;
let rafId: number | null = null;
let loadedDataUrl: string | null = null;

// ── Helpers ─────────────────────────────────────

const getColor = (): string => colorPicker.value;

const getStrokeWidth = (): number => parseInt(strokeSelect.value, 10);

const getOpacity = (): number => parseInt(opacitySlider.value, 10) / 100;

/** Convert mouse event coordinates to canvas coordinates. */
function canvasCoords(e: MouseEvent): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

// ── Render Pipeline ─────────────────────────────

/** Render the full canvas: base image + all annotations + pending annotation. */
function render(): void {
  if (!baseImage) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

  for (const ann of annotations) {
    drawAnnotation(ann);
  }

  if (pendingAnnotation) {
    drawAnnotation(pendingAnnotation);
  }
}

/** Schedule a render on the next animation frame (prevents double-calls). */
function requestRender(): void {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    render();
  });
}

// ── Drawing Individual Annotation Types ─────────

/** Draw a single annotation on the canvas. */
function drawAnnotation(ann: Annotation): void {
  ctx.save();
  // Blur and crop always draw at full opacity
  if (ann.type !== 'blur' && ann.type !== 'crop') {
    ctx.globalAlpha = ann.opacity;
  }
  ctx.strokeStyle = ann.color;
  ctx.fillStyle = ann.color;
  ctx.lineWidth = ann.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (ann.type) {
    case 'arrow':
      drawArrow(ann);
      break;
    case 'rect':
      drawRect(ann);
      break;
    case 'circle':
      drawEllipse(ann);
      break;
    case 'line':
      drawLine(ann);
      break;
    case 'freehand':
      drawFreehand(ann);
      break;
    case 'text':
      drawText(ann);
      break;
    case 'blur':
      drawBlur(ann);
      break;
    case 'highlight':
      drawHighlight(ann);
      break;
    case 'crop':
      drawCropPreview(ann);
      break;
  }

  ctx.restore();
}

function drawArrow(a: ArrowAnnotation): void {
  const headLen = Math.max(12, a.strokeWidth * 4);
  const angle = Math.atan2(a.endY - a.startY, a.endX - a.startX);
  ctx.beginPath();
  ctx.moveTo(a.startX, a.startY);
  ctx.lineTo(a.endX, a.endY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(a.endX, a.endY);
  ctx.lineTo(a.endX - headLen * Math.cos(angle - Math.PI / 6), a.endY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(a.endX - headLen * Math.cos(angle + Math.PI / 6), a.endY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawRect(a: RectAnnotation): void {
  const x = Math.min(a.startX, a.endX);
  const y = Math.min(a.startY, a.endY);
  const w = Math.abs(a.endX - a.startX);
  const h = Math.abs(a.endY - a.startY);
  const r = Math.min(RECT_CORNER_RADIUS, Math.min(w, h) / 4);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.stroke();
}

function drawEllipse(a: CircleAnnotation): void {
  const cx = (a.startX + a.endX) / 2;
  const cy = (a.startY + a.endY) / 2;
  const rx = Math.abs(a.endX - a.startX) / 2;
  const ry = Math.abs(a.endY - a.startY) / 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawLine(a: LineAnnotation): void {
  ctx.beginPath();
  ctx.moveTo(a.startX, a.startY);
  ctx.lineTo(a.endX, a.endY);
  ctx.stroke();
}

function drawFreehand(a: FreehandAnnotation): void {
  if (!a.points || a.points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(a.points[0].x, a.points[0].y);
  for (let i = 1; i < a.points.length; i++) {
    ctx.lineTo(a.points[i].x, a.points[i].y);
  }
  ctx.stroke();
}

function drawText(a: TextAnnotation): void {
  ctx.font = `${a.fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
  ctx.fillStyle = a.color;
  ctx.textBaseline = 'top';
  const lines = (a.text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], a.startX, a.startY + i * (a.fontSize * 1.2));
  }
}

function drawBlur(a: BlurAnnotation): void {
  const x = Math.min(a.startX, a.endX);
  const y = Math.min(a.startY, a.endY);
  const w = Math.abs(a.endX - a.startX);
  const h = Math.abs(a.endY - a.startY);
  if (w < MIN_BLUR_SIZE || h < MIN_BLUR_SIZE) return;

  const pixelSize = Math.max(6, Math.round(Math.min(w, h) / 12));
  const imgData = ctx.getImageData(x, y, w, h);

  for (let py = 0; py < h; py += pixelSize) {
    for (let px = 0; px < w; px += pixelSize) {
      let r = 0,
        g = 0,
        b = 0,
        count = 0;
      for (let dy = 0; dy < pixelSize && py + dy < h; dy++) {
        for (let dx = 0; dx < pixelSize && px + dx < w; dx++) {
          const idx = ((py + dy) * w + (px + dx)) * 4;
          r += imgData.data[idx];
          g += imgData.data[idx + 1];
          b += imgData.data[idx + 2];
          count++;
        }
      }
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + px, y + py, Math.min(pixelSize, w - px), Math.min(pixelSize, h - py));
    }
  }
}

function drawHighlight(a: HighlightAnnotation): void {
  const x = Math.min(a.startX, a.endX);
  const y = Math.min(a.startY, a.endY);
  ctx.fillStyle = HIGHLIGHT_COLOR;
  ctx.fillRect(x, y, Math.abs(a.endX - a.startX), Math.abs(a.endY - a.startY));
}

function drawCropPreview(a: CropAnnotation): void {
  const x = Math.min(a.startX, a.endX);
  const y = Math.min(a.startY, a.endY);
  const w = Math.abs(a.endX - a.startX);
  const h = Math.abs(a.endY - a.startY);

  // Dim areas outside crop
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, canvas.width, y);
  ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h);
  ctx.fillRect(0, y, x, h);
  ctx.fillRect(x + w, y, canvas.width - x - w, h);

  // Dashed border
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}

// ── History Management ──────────────────────────

/** Commit an annotation to the history stack. */
function commitAnnotation(ann: Annotation): void {
  annotations.push(ann);
  redoStack = [];
  updateUndoRedoButtons();
}

function undo(): void {
  if (annotations.length === 0) return;
  redoStack.push(annotations.pop()!);
  updateUndoRedoButtons();
  requestRender();
}

function redo(): void {
  if (redoStack.length === 0) return;
  annotations.push(redoStack.pop()!);
  updateUndoRedoButtons();
  requestRender();
}

function updateUndoRedoButtons(): void {
  btnUndo.disabled = annotations.length === 0;
  btnRedo.disabled = redoStack.length === 0;
  btnUndo.setAttribute('aria-disabled', String(annotations.length === 0));
  btnRedo.setAttribute('aria-disabled', String(redoStack.length === 0));
}

// ── Tool Selection ──────────────────────────────

/** Set the active annotation tool. */
function setTool(name: ToolName | null): void {
  cancelPending();
  currentTool = name;

  document.querySelectorAll<HTMLButtonElement>('.tool-btn[data-tool]').forEach((btn) => {
    const isActive = btn.dataset.tool === name;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  canvas.className = '';
  if (name === 'text') canvas.classList.add('cursor-text');
  else if (name === 'crop') canvas.classList.add('cursor-crop');
  else if (name) canvas.classList.add('cursor-crosshair');

  statusTool.textContent = name ? `Tool: ${name.charAt(0).toUpperCase() + name.slice(1)}` : 'Tool: None';
}

/** Cancel any pending annotation in progress. */
function cancelPending(): void {
  drawing = false;
  pendingAnnotation = null;
  btnCropApply.style.display = 'none';
  textOverlay.style.display = 'none';
  requestRender();
}

// ── Mouse Event Handlers ────────────────────────

function onMouseDown(e: MouseEvent): void {
  if (!currentTool || e.button !== 0) return;
  const { x, y } = canvasCoords(e);

  if (currentTool === 'text') {
    showTextInput(e, x, y);
    return;
  }

  drawing = true;

  if (currentTool === 'freehand') {
    pendingAnnotation = {
      type: 'freehand',
      points: [{ x, y }],
      color: getColor(),
      strokeWidth: getStrokeWidth(),
      opacity: getOpacity(),
    };
  } else {
    pendingAnnotation = {
      type: currentTool,
      startX: x,
      startY: y,
      endX: x,
      endY: y,
      color: getColor(),
      strokeWidth: getStrokeWidth(),
      opacity: getOpacity(),
    } as DragAnnotation;
  }
}

function onMouseMove(e: MouseEvent): void {
  if (!drawing || !pendingAnnotation) return;
  const { x, y } = canvasCoords(e);

  if (pendingAnnotation.type === 'freehand') {
    pendingAnnotation.points.push({ x, y });
  } else {
    const bounds = pendingAnnotation as DragAnnotation;
    bounds.endX = x;
    bounds.endY = y;
  }

  requestRender();
}

function onMouseUp(e: MouseEvent): void {
  if (!drawing || !pendingAnnotation) return;
  drawing = false;

  const { x, y } = canvasCoords(e);

  if (pendingAnnotation.type === 'freehand') {
    pendingAnnotation.points.push({ x, y });
  } else {
    const bounds = pendingAnnotation as DragAnnotation;
    bounds.endX = x;
    bounds.endY = y;
  }

  // Special handling for crop
  if (pendingAnnotation.type === 'crop') {
    const w = Math.abs(pendingAnnotation.endX - pendingAnnotation.startX);
    const h = Math.abs(pendingAnnotation.endY - pendingAnnotation.startY);
    if (w > MIN_DRAG_DISTANCE && h > MIN_DRAG_DISTANCE) {
      btnCropApply.style.display = 'block';
      requestRender();
    } else {
      pendingAnnotation = null;
      requestRender();
    }
    return;
  }

  // Validate minimum size for non-freehand shapes
  if (pendingAnnotation.type !== 'freehand') {
    const bounds = pendingAnnotation as DragAnnotation;
    const w = Math.abs(bounds.endX - bounds.startX);
    const h = Math.abs(bounds.endY - bounds.startY);
    if (w < MIN_DRAG_DISTANCE && h < MIN_DRAG_DISTANCE) {
      pendingAnnotation = null;
      requestRender();
      return;
    }
  }

  commitAnnotation(pendingAnnotation);
  pendingAnnotation = null;
  requestRender();
}

// ── Text Input ──────────────────────────────────

/** Show the text input overlay at the click position. */
function showTextInput(mouseEvent: MouseEvent, canvasX: number, canvasY: number): void {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const wrapperRect = canvasWrapper.getBoundingClientRect();
  const left = mouseEvent.clientX - wrapperRect.left + canvasWrapper.scrollLeft;
  const top = mouseEvent.clientY - wrapperRect.top + canvasWrapper.scrollTop;

  textOverlay.style.display = 'block';
  textOverlay.style.left = `${left}px`;
  textOverlay.style.top = `${top}px`;
  textOverlay.style.color = getColor();
  textOverlay.style.fontSize = `${Math.round(getTextFontSize() / scaleX)}px`;
  textOverlay.value = '';
  textOverlay.focus();
  textOverlay.dataset.cx = String(canvasX);
  textOverlay.dataset.cy = String(canvasY);
}

/** Commit the current text input as a text annotation. */
function commitTextInput(): void {
  const text = textOverlay.value.trim();
  if (text) {
    commitAnnotation({
      type: 'text',
      startX: parseFloat(textOverlay.dataset.cx!),
      startY: parseFloat(textOverlay.dataset.cy!),
      text,
      color: getColor(),
      strokeWidth: getStrokeWidth(),
      opacity: getOpacity(),
      fontSize: getTextFontSize(),
    });
    requestRender();
  }
  textOverlay.style.display = 'none';
  textOverlay.value = '';
}

/** Get font size based on current stroke width setting. */
function getTextFontSize(): number {
  const sw = getStrokeWidth();
  return TEXT_FONT_SIZES[sw] || 24;
}

// ── Crop ────────────────────────────────────────

/** Apply the pending crop operation. */
function applyCrop(): void {
  if (!pendingAnnotation || pendingAnnotation.type !== 'crop') return;

  const x = Math.max(0, Math.round(Math.min(pendingAnnotation.startX, pendingAnnotation.endX)));
  const y = Math.max(0, Math.round(Math.min(pendingAnnotation.startY, pendingAnnotation.endY)));
  const w = Math.min(canvas.width - x, Math.round(Math.abs(pendingAnnotation.endX - pendingAnnotation.startX)));
  const h = Math.min(canvas.height - y, Math.round(Math.abs(pendingAnnotation.endY - pendingAnnotation.startY)));

  if (w < MIN_BLUR_SIZE || h < MIN_BLUR_SIZE) {
    cancelPending();
    return;
  }

  pendingAnnotation = null;
  render();

  const imageData = ctx.getImageData(x, y, w, h);
  canvas.width = w;
  canvas.height = h;
  ctx.putImageData(imageData, 0, 0);

  // Create new base image from the cropped result
  const newImg = new Image();
  newImg.onload = () => {
    baseImage = newImg;
    annotations = [];
    redoStack = [];
    updateUndoRedoButtons();
    updateStatusDimensions();
    requestRender();
  };
  newImg.src = canvas.toDataURL('image/png');

  btnCropApply.style.display = 'none';
  showToast('Crop applied \u2702\uFE0F');
}

// ── Keyboard Shortcuts ──────────────────────────

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    cancelPending();
    setTool(null);
    return;
  }

  // Enter commits text input
  if (
    e.key === 'Enter' &&
    !e.shiftKey &&
    textOverlay.style.display !== 'none' &&
    document.activeElement === textOverlay
  ) {
    e.preventDefault();
    commitTextInput();
    return;
  }

  // Don't intercept while typing text
  if (document.activeElement === textOverlay) return;

  // Undo/Redo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    redo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    e.preventDefault();
    redo();
    return;
  }

  // Tool shortcuts
  if (EDITOR_SHORTCUTS[e.key] && !e.ctrlKey && !e.metaKey) {
    setTool(EDITOR_SHORTCUTS[e.key]);
  }
}

// ── Color / Stroke Sync ─────────────────────────

colorPicker.addEventListener('input', () => {
  colorPreview.style.background = colorPicker.value;
});

colorPreview.addEventListener('click', () => colorPicker.click());

opacitySlider.addEventListener('input', () => {
  opacityValueLabel.textContent = `${opacitySlider.value}%`;
});

// ── Button Setup ────────────────────────────────

/** Bind all editor action buttons. */
function setupButtons(): void {
  document.getElementById('btn-copy')!.addEventListener('click', copyToClipboard);
  document.getElementById('btn-save-png')!.addEventListener('click', () => saveAs('png'));
  document.getElementById('btn-save-jpg')!.addEventListener('click', () => saveAs('jpeg'));
  document.getElementById('btn-save-pdf')!.addEventListener('click', exportPDF);
  document.getElementById('btn-download')!.addEventListener('click', () => saveAs('png'));
  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);
  btnCropApply.addEventListener('click', applyCrop);

  document.querySelectorAll<HTMLButtonElement>('.tool-btn[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool as ToolName));
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('role', 'button');
  });

  textOverlay.addEventListener('blur', () => {
    setTimeout(() => {
      if (textOverlay.style.display !== 'none') commitTextInput();
    }, 150);
  });
}

// ── Image Loading ───────────────────────────────

/** Initialize the editor: load pending capture and set up event listeners. */
async function init(): Promise<void> {
  try {
    const result = await chrome.storage.local.get('pendingCapture') as { pendingCapture?: string };
    if (result.pendingCapture) {
      loadedDataUrl = result.pendingCapture;
      await loadImage(result.pendingCapture);
      await chrome.storage.local.remove('pendingCapture');
      await saveToHistory(result.pendingCapture);
    } else {
      statusDimensions.textContent = 'No capture loaded';
    }
  } catch (err) {
    console.error(LOG_PREFIX, 'Failed to load capture:', err);
    statusDimensions.textContent = 'Load failed';
  }

  setupButtons();
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);
  colorPreview.style.background = colorPicker.value;
}

/** Load an image data URL into the canvas. */
function loadImage(dataUrl: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      baseImage = img;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      updateStatusDimensions();
      estimateSize(dataUrl);
      resolve();
    };
    img.onerror = () => {
      console.error(LOG_PREFIX, 'Failed to load image');
      resolve();
    };
    img.src = dataUrl;
  });
}

/** Update the status bar with canvas dimensions. */
function updateStatusDimensions(): void {
  statusDimensions.textContent = `${canvas.width} \u00D7 ${canvas.height}px`;
}

/** Estimate and display the image file size. */
function estimateSize(dataUrl: string): void {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) return;
  const base64Length = dataUrl.length - commaIndex - 1;
  const sizeKB = Math.round((base64Length * 3) / 4 / 1024);
  statusSize.textContent = sizeKB > 1024 ? `~${(sizeKB / 1024).toFixed(1)} MB` : `~${sizeKB} KB`;
}

// ── Save to History ─────────────────────────────

/** Save the current capture to the extension's history. */
async function saveToHistory(dataUrl: string): Promise<void> {
  try {
    const settings = await getSyncSettings();
    if (settings.keepHistory === 'off') return;

    const maxHistory = settings.maxHistory || 100;
    const result = await chrome.storage.local.get('historyEntries') as { historyEntries?: HistoryEntry[] };
    const entries: HistoryEntry[] = result.historyEntries || [];

    const thumbnail = await generateThumbnail(dataUrl, THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT);

    const commaIndex = dataUrl.indexOf(',');
    const base64Len = commaIndex !== -1 ? dataUrl.length - commaIndex - 1 : 0;
    const sizeBytes = Math.round((base64Len * 3) / 4);

    // Only store full dataUrl for small screenshots
    const storeDataUrl = sizeBytes < MAX_HISTORY_DATAURL_SIZE ? dataUrl : null;

    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      type: 'screenshot',
      name: `ScreenBolt_${getTimestamp()}.png`,
      timestamp: Date.now(),
      width: canvas.width,
      height: canvas.height,
      sizeBytes,
      format: 'png',
      thumbnail,
      dataUrl: storeDataUrl,
      duration: null,
    };

    entries.unshift(entry);
    while (entries.length > maxHistory) entries.pop();

    await chrome.storage.local.set({ historyEntries: entries });
  } catch (err) {
    console.warn(LOG_PREFIX, 'Failed to save to history:', err);
  }
}

/** Generate a compressed JPEG thumbnail from a data URL. */
function generateThumbnail(dataUrl: string, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const result = c.toDataURL('image/jpeg', THUMBNAIL_QUALITY);

      // Cleanup thumbnail canvas
      c.width = 0;
      c.height = 0;

      resolve(result);
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

/** Load settings from sync storage. */
async function getSyncSettings(): Promise<Partial<Settings>> {
  try {
    const result = await chrome.storage.sync.get('settings') as { settings?: Partial<Settings> };
    return result.settings || {};
  } catch {
    return {};
  }
}

// ── Export Functions ─────────────────────────────

/** Finalize the canvas for export by cancelling any pending operation. */
function renderForExport(): void {
  cancelPending();
  render();
}

/** Copy the current canvas to the clipboard as PNG. */
async function copyToClipboard(): Promise<void> {
  try {
    renderForExport();
    const blob = await canvasToBlob('image/png');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showToast('Copied to clipboard! \uD83D\uDCCB');
  } catch (err) {
    console.error(LOG_PREFIX, 'Clipboard copy failed:', err);
    showToast('Copy failed \u2014 try downloading instead', true);
  }
}

/** Save the canvas as an image file. */
async function saveAs(format: 'png' | 'jpeg'): Promise<void> {
  renderForExport();
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const quality = format === 'jpeg' ? JPEG_EXPORT_QUALITY : undefined;
  const dataUrl = canvas.toDataURL(mimeType, quality);
  const filename = `ScreenBolt_${getTimestamp()}.${ext}`;

  try {
    await chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
    showToast(`Saved as ${filename} \uD83D\uDCBE`);
  } catch {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
    showToast(`Downloaded ${filename} \uD83D\uDCBE`);
  }
}

// ── PDF Export (vanilla -- no dependencies) ─────

/** Export the canvas as a PDF with embedded JPEG. */
async function exportPDF(): Promise<void> {
  try {
    renderForExport();
    showToast('Generating PDF\u2026');

    const jpegDataUrl = canvas.toDataURL('image/jpeg', JPEG_EXPORT_QUALITY);
    const jpegBase64 = jpegDataUrl.split(',')[1];
    const jpegBytes = base64ToBytes(jpegBase64);

    const pageW = canvas.width;
    const pageH = canvas.height;
    const pdf = buildPDF(jpegBytes, pageW, pageH, canvas.width, canvas.height);
    const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const filename = `ScreenBolt_${getTimestamp()}.pdf`;

    try {
      await chrome.downloads.download({ url, filename, saveAs: true });
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }

    // Revoke the Object URL after a delay to ensure download starts
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast(`Saved as ${filename} \uD83D\uDCC4`);
  } catch (err) {
    console.error(LOG_PREFIX, 'PDF export failed:', err);
    showToast('PDF export failed', true);
  }
}

/**
 * Build a minimal valid PDF containing a single JPEG image.
 * Constructs the PDF byte-by-byte: catalog, page tree, page,
 * content stream, image XObject, xref table, and trailer.
 */
function buildPDF(
  jpegBytes: Uint8Array,
  pageW: number,
  pageH: number,
  imgW: number,
  imgH: number,
): Uint8Array {
  const offsets: number[] = [];
  let content = '';

  function addObject(id: number, data: string): void {
    offsets[id] = content.length;
    content += `${id} 0 obj\n${data}\nendobj\n`;
  }

  content = '%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n';

  addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  addObject(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Img0 5 0 R >> >> >>`,
  );

  const streamContent = `q ${pageW} 0 0 ${pageH} 0 0 cm /Img0 Do Q`;
  addObject(4, `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`);

  const imgDict = `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>`;

  const beforeImage = content;
  const obj5Header = `5 0 obj\n${imgDict}\nstream\n`;
  const obj5Footer = '\nendstream\nendobj\n';

  const encoder = new TextEncoder();
  const beforeImageBytes = encoder.encode(beforeImage);
  const obj5HeaderBytes = encoder.encode(obj5Header);
  const obj5FooterBytes = encoder.encode(obj5Footer);

  offsets[5] = beforeImageBytes.length;
  const afterObj5Offset =
    beforeImageBytes.length + obj5HeaderBytes.length + jpegBytes.length + obj5FooterBytes.length;

  const numObjects = 5;
  let xref = 'xref\n';
  xref += `0 ${numObjects + 1}\n`;
  xref += '0000000000 65535 f \n';
  for (let i = 1; i <= numObjects; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }

  const xrefOffset = afterObj5Offset;
  const trailer = `trailer\n<< /Size ${numObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const xrefBytes = encoder.encode(xref);
  const trailerBytes = encoder.encode(trailer);

  const totalLength =
    beforeImageBytes.length +
    obj5HeaderBytes.length +
    jpegBytes.length +
    obj5FooterBytes.length +
    xrefBytes.length +
    trailerBytes.length;
  const result = new Uint8Array(totalLength);
  let offset = 0;

  result.set(beforeImageBytes, offset);
  offset += beforeImageBytes.length;
  result.set(obj5HeaderBytes, offset);
  offset += obj5HeaderBytes.length;
  result.set(jpegBytes, offset);
  offset += jpegBytes.length;
  result.set(obj5FooterBytes, offset);
  offset += obj5FooterBytes.length;
  result.set(xrefBytes, offset);
  offset += xrefBytes.length;
  result.set(trailerBytes, offset);

  return result;
}

/** Convert a base64 string to a Uint8Array. */
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Convert the canvas to a Blob. */
function canvasToBlob(mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), mimeType, quality));
}

// ── Utilities ───────────────────────────────────

/** Show a temporary toast notification. */
function showToast(message: string, isError = false): void {
  document.querySelectorAll('.toast').forEach((t) => t.remove());

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 48px; left: 50%; transform: translateX(-50%);
    padding: 10px 20px; background: ${isError ? '#DC2626' : '#059669'};
    color: white; border-radius: 8px; font-size: 13px; font-weight: 500;
    z-index: 9999; animation: fadeInUp 0.3s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, TOAST_DURATION_MS);
}

// ── Boot ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
