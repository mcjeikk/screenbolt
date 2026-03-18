// ScreenBolt — History Page
// Displays all captured screenshots and recordings with filtering, search,
// sorting, and pagination. Uses safe DOM construction (no innerHTML for user data).

import { formatDuration } from '../utils/helpers.js';
import type { HistoryEntry } from '../utils/types.js';

// ── Constants ───────────────────────────────────
const PAGE_SIZE = 24;

// ── State ───────────────────────────────────────
let allEntries: HistoryEntry[] = [];
let filteredEntries: HistoryEntry[] = [];
let currentFilter = 'all';
let currentSort = 'date-desc';
let searchQuery = '';
let displayedCount = 0;
let selectionMode = false;
const selectedIds = new Set<string>();

// ── DOM Refs ──
const grid = document.getElementById('history-grid')!;
const emptyState = document.getElementById('empty-state') as HTMLElement;
const countLabel = document.getElementById('count-label')!;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const sortSelect = document.getElementById('sort-select') as HTMLSelectElement;
const loadMoreContainer = document.getElementById('load-more-container') as HTMLElement;
const btnLoadMore = document.getElementById('btn-load-more') as HTMLButtonElement;
const btnClearAll = document.getElementById('btn-clear-all') as HTMLButtonElement;
const btnSelectMode = document.getElementById('btn-select-mode') as HTMLButtonElement;
const btnSelectAll = document.getElementById('btn-select-all') as HTMLButtonElement;
const btnDeleteSelected = document.getElementById('btn-delete-selected') as HTMLButtonElement;

// ── Init ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadEntries();
  applyFilters();
  setupEvents();
});

// Load history entries from chrome.storage.local.
async function loadEntries(): Promise<void> {
  try {
    const result = await chrome.storage.local.get('historyEntries');
    allEntries = (result.historyEntries as HistoryEntry[] | undefined) || [];
  } catch (err) {
    console.error('[ScreenBolt][History] Failed to load entries:', err);
    allEntries = [];
  }
}

// ── Event Setup ─────────────────────────────────

// Bind all interactive elements.
function setupEvents(): void {
  // Filter tabs
  document.querySelectorAll<HTMLButtonElement>('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelector('.filter-btn.active')?.classList.remove('active');
      btn.classList.add('active');
      currentFilter = btn.dataset.filter ?? 'all';
      applyFilters();
    });
  });

  // Search with debounce
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;
  searchInput.addEventListener('input', () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = searchInput.value.toLowerCase().trim();
      applyFilters();
    }, 200);
  });

  // Sort
  sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    applyFilters();
  });

  // Load more
  btnLoadMore.addEventListener('click', renderMore);

  // Clear all
  btnClearAll.addEventListener('click', () => {
    showConfirmDialog(
      'Clear All History',
      'This will permanently delete all history entries. This action cannot be undone.',
      async () => {
        allEntries = [];
        await chrome.storage.local.set({ historyEntries: [] });
        applyFilters();
      },
    );
  });

  // Toggle selection mode
  btnSelectMode.addEventListener('click', () => {
    selectionMode = !selectionMode;
    selectedIds.clear();
    updateSelectionUI();
    applyFilters();
  });

  // Select all / Deselect all
  btnSelectAll.addEventListener('click', () => {
    if (selectedIds.size === filteredEntries.length) {
      selectedIds.clear();
    } else {
      filteredEntries.forEach((e) => selectedIds.add(e.id));
    }
    updateSelectionUI();
    syncCheckboxes();
  });

  // Delete selected
  btnDeleteSelected.addEventListener('click', () => {
    const count = selectedIds.size;
    if (count === 0) return;
    showConfirmDialog(
      'Delete Selected',
      `This will permanently delete ${count} item${count !== 1 ? 's' : ''}. This action cannot be undone.`,
      async () => {
        allEntries = allEntries.filter((e) => !selectedIds.has(e.id));
        await chrome.storage.local.set({ historyEntries: allEntries });
        selectedIds.clear();
        applyFilters();
        updateSelectionUI();
      },
    );
  });
}

// ── Filtering & Sorting ─────────────────────────

// Apply current filter, search, and sort then re-render.
function applyFilters(): void {
  let entries = allEntries;

  // Filter by type
  if (currentFilter !== 'all') {
    entries = entries.filter((e) => e.type === currentFilter);
  }

  // Search by name
  if (searchQuery) {
    entries = entries.filter((e) => e.name && e.name.toLowerCase().includes(searchQuery));
  }

  // Sort
  entries = [...entries];
  switch (currentSort) {
    case 'date-desc':
      entries.sort((a, b) => b.timestamp - a.timestamp);
      break;
    case 'date-asc':
      entries.sort((a, b) => a.timestamp - b.timestamp);
      break;
    case 'size-desc':
      entries.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
      break;
    case 'size-asc':
      entries.sort((a, b) => (a.sizeBytes || 0) - (b.sizeBytes || 0));
      break;
    case 'name-asc':
      entries.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      break;
    case 'name-desc':
      entries.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      break;
  }

  filteredEntries = entries;
  displayedCount = 0;

  // Clear grid safely
  while (grid.firstChild) grid.removeChild(grid.firstChild);

  renderMore();
  updateUI();
}

// Render the next page of items.
function renderMore(): void {
  const end = Math.min(displayedCount + PAGE_SIZE, filteredEntries.length);
  for (let i = displayedCount; i < end; i++) {
    grid.appendChild(createItemCard(filteredEntries[i]));
  }
  displayedCount = end;
  updateUI();
}

// Update count label, empty state, and load-more visibility.
function updateUI(): void {
  const total = filteredEntries.length;
  countLabel.textContent = `${total} item${total !== 1 ? 's' : ''}`;
  emptyState.style.display = total === 0 ? 'block' : 'none';
  grid.style.display = total === 0 ? 'none' : 'grid';
  loadMoreContainer.style.display = displayedCount < total ? 'block' : 'none';
}

// ── Card Rendering (safe DOM construction) ──────

// Create a history item card element.
function createItemCard(entry: HistoryEntry): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'history-item';
  card.dataset.entryId = entry.id;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${entry.name} — ${entry.type}`);

  if (selectionMode && selectedIds.has(entry.id)) {
    card.classList.add('selected');
  }

  card.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.item-delete') || target.closest('.item-name-input')) return;
    if (selectionMode) {
      toggleSelect(entry.id, card);
      return;
    }
    openEntry(entry);
  });
  card.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (selectionMode) {
        toggleSelect(entry.id, card);
      } else {
        openEntry(entry);
      }
    }
  });

  // Thumbnail
  const thumb = document.createElement('img');
  thumb.className = 'item-thumbnail';
  thumb.src = entry.thumbnail || generatePlaceholderSvg();
  thumb.alt = entry.name || 'Capture thumbnail';
  thumb.loading = 'lazy';
  card.appendChild(thumb);

  // Duration overlay for recordings
  if (entry.type === 'recording' && entry.duration) {
    const dur = document.createElement('span');
    dur.className = 'item-duration';
    dur.textContent = formatDuration(entry.duration);
    dur.setAttribute('aria-label', `Duration: ${formatDuration(entry.duration)}`);
    card.appendChild(dur);
  }

  // Delete button
  const del = document.createElement('button');
  del.className = 'item-delete';
  del.textContent = '\u2715';
  del.title = 'Delete this item';
  del.setAttribute('aria-label', `Delete ${entry.name}`);
  del.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    deleteEntry(entry.id);
  });
  card.appendChild(del);

  // Selection checkbox (shown only in selection mode)
  if (selectionMode) {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'item-select-cb';
    cb.checked = selectedIds.has(entry.id);
    cb.setAttribute('aria-label', `Select ${entry.name}`);
    cb.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      toggleSelect(entry.id, card);
    });
    card.appendChild(cb);
  }

  // Info section
  const info = document.createElement('div');
  info.className = 'item-info';

  const nameEl = document.createElement('div');
  nameEl.className = 'item-name';
  nameEl.textContent = entry.name || 'Untitled';
  nameEl.title = entry.name || '';
  nameEl.addEventListener('dblclick', (e: MouseEvent) => {
    e.stopPropagation();
    if (selectionMode) return;
    startInlineRename(nameEl, entry);
  });
  info.appendChild(nameEl);

  const meta = document.createElement('div');
  meta.className = 'item-meta';

  const badge = document.createElement('span');
  badge.className = `item-type-badge ${entry.type === 'recording' ? 'recording' : ''}`;
  badge.textContent = entry.type === 'screenshot' ? '\uD83D\uDCF8 IMG' : '\uD83C\uDFA5 VID';
  meta.appendChild(badge);

  const details = document.createElement('span');
  const dateStr = new Date(entry.timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const sizeStr = entry.sizeBytes ? formatSize(entry.sizeBytes) : '';
  details.textContent = `${dateStr}${sizeStr ? ' \u00B7 ' + sizeStr : ''}`;
  meta.appendChild(details);

  info.appendChild(meta);
  card.appendChild(info);

  return card;
}

// Generate a placeholder SVG data URL for items without thumbnails.
function generatePlaceholderSvg(): string {
  return (
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160">' +
        '<rect fill="#334155" width="240" height="160"/>' +
        '<text x="120" y="85" text-anchor="middle" fill="#94A3B8" font-size="14">No preview</text>' +
        '</svg>',
    )
  );
}

// ── Actions ─────────────────────────────────────

// Open a history entry (screenshot in editor, recording shows info).
function openEntry(entry: HistoryEntry): void {
  if (entry.type === 'screenshot' && entry.dataUrl) {
    chrome.storage.local.set({ pendingCapture: entry.dataUrl }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('editor/editor.html') });
    });
  } else if (entry.type === 'recording') {
    showToast('Recording files are saved in your Downloads folder');
  }
}

// Delete a single history entry by ID.
async function deleteEntry(id: string): Promise<void> {
  allEntries = allEntries.filter((e) => e.id !== id);
  await chrome.storage.local.set({ historyEntries: allEntries });
  applyFilters();
}

// ── Confirm Dialog (safe DOM construction) ──────

// Show a confirmation dialog.
function showConfirmDialog(title: string, message: string, onConfirm: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);

  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';

  const h3 = document.createElement('h3');
  h3.textContent = title;
  dialog.appendChild(h3);

  const p = document.createElement('p');
  p.textContent = message;
  dialog.appendChild(p);

  const buttons = document.createElement('div');
  buttons.className = 'dialog-buttons';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-confirm-no';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());
  buttons.appendChild(cancelBtn);

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn-confirm-yes';
  confirmBtn.textContent = 'Delete';
  confirmBtn.addEventListener('click', () => {
    onConfirm();
    overlay.remove();
  });
  buttons.appendChild(confirmBtn);

  dialog.appendChild(buttons);
  overlay.appendChild(dialog);

  overlay.addEventListener('click', (e: MouseEvent) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
  cancelBtn.focus();
}

// ── Selection Helpers ────────────────────────────

// Toggle selection of a single item.
function toggleSelect(id: string, card: HTMLDivElement): void {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    card.classList.remove('selected');
  } else {
    selectedIds.add(id);
    card.classList.add('selected');
  }
  const cb = card.querySelector<HTMLInputElement>('.item-select-cb');
  if (cb) cb.checked = selectedIds.has(id);
  updateSelectionUI();
}

// Update selection mode button states and visibility.
function updateSelectionUI(): void {
  btnSelectMode.textContent = selectionMode ? 'Exit Select' : '\u2611 Select';
  btnSelectAll.style.display = selectionMode ? '' : 'none';
  btnDeleteSelected.style.display = selectionMode ? '' : 'none';

  if (selectionMode) {
    const allSelected = filteredEntries.length > 0 && selectedIds.size === filteredEntries.length;
    btnSelectAll.textContent = allSelected ? 'Deselect All' : 'Select All';
    btnDeleteSelected.textContent = `Delete Selected (${selectedIds.size})`;
    btnDeleteSelected.disabled = selectedIds.size === 0;
  }
}

// Sync all visible checkboxes with the selectedIds set.
function syncCheckboxes(): void {
  grid.querySelectorAll<HTMLDivElement>('.history-item').forEach((card) => {
    const id = card.dataset.entryId;
    if (!id) return;
    const cb = card.querySelector<HTMLInputElement>('.item-select-cb');
    if (cb) cb.checked = selectedIds.has(id);
    card.classList.toggle('selected', selectedIds.has(id));
  });
}

// ── Inline Rename ───────────────────────────────

// Start inline rename on a name element.
function startInlineRename(nameEl: HTMLDivElement, entry: HistoryEntry): void {
  // Prevent opening the entry while renaming
  const card = nameEl.closest('.history-item') as HTMLElement | null;
  if (!card) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'item-name-input';
  input.value = entry.name || '';
  input.setAttribute('aria-label', 'Rename capture');

  const originalText = nameEl.textContent || '';
  nameEl.textContent = '';
  nameEl.appendChild(input);
  input.focus();
  input.select();

  let committed = false;

  const commit = async (): Promise<void> => {
    if (committed) return;
    committed = true;
    const newName = input.value.trim() || originalText;
    nameEl.textContent = newName;
    nameEl.title = newName;

    // Persist to storage
    entry.name = newName;
    const idx = allEntries.findIndex((e) => e.id === entry.id);
    if (idx !== -1) {
      allEntries[idx].name = newName;
      await chrome.storage.local.set({ historyEntries: allEntries });
    }
  };

  const cancel = (): void => {
    if (committed) return;
    committed = true;
    nameEl.textContent = originalText;
    nameEl.title = originalText;
  };

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
    e.stopPropagation();
  });

  input.addEventListener('blur', () => {
    if (!committed) commit();
  });

  // Prevent card click from firing while editing
  input.addEventListener('click', (e: MouseEvent) => e.stopPropagation());
}

// ── Helpers ─────────────────────────────────────

// Format bytes into a human-readable size string.
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// Show a temporary toast notification.
function showToast(message: string): void {
  document.querySelectorAll('.toast').forEach((t) => t.remove());

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
