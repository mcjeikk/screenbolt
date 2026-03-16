/**
 * ScreenSnap — History Page v0.4.0
 * Displays all captured screenshots and recordings with filtering, search, and sorting.
 */

(() => {
  'use strict';

  // ── State ──
  let allEntries = [];
  let filteredEntries = [];
  let currentFilter = 'all';
  let currentSort = 'date-desc';
  let searchQuery = '';
  let displayedCount = 0;
  const PAGE_SIZE = 24;

  // ── DOM ──
  const grid = document.getElementById('history-grid');
  const emptyState = document.getElementById('empty-state');
  const countLabel = document.getElementById('count-label');
  const searchInput = document.getElementById('search-input');
  const sortSelect = document.getElementById('sort-select');
  const loadMoreContainer = document.getElementById('load-more-container');
  const btnLoadMore = document.getElementById('btn-load-more');
  const btnClearAll = document.getElementById('btn-clear-all');

  // ── Init ──
  document.addEventListener('DOMContentLoaded', async () => {
    await loadEntries();
    applyFilters();
    setupEvents();
  });

  async function loadEntries() {
    try {
      const result = await chrome.storage.local.get('historyEntries');
      allEntries = result.historyEntries || [];
    } catch (e) {
      console.error('[History] Failed to load entries:', e);
      allEntries = [];
    }
  }

  // ── Event Setup ──
  function setupEvents() {
    // Filter tabs
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelector('.filter-btn.active')?.classList.remove('active');
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        applyFilters();
      });
    });

    // Search
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.toLowerCase().trim();
      applyFilters();
    });

    // Sort
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      applyFilters();
    });

    // Load more
    btnLoadMore.addEventListener('click', () => {
      renderMore();
    });

    // Clear all
    btnClearAll.addEventListener('click', () => {
      showConfirmDialog('Clear All History', 'This will permanently delete all history entries. This action cannot be undone.', async () => {
        allEntries = [];
        await chrome.storage.local.set({ historyEntries: [] });
        applyFilters();
      });
    });
  }

  // ── Filtering & Sorting ──
  function applyFilters() {
    // Filter by type
    let entries = allEntries;
    if (currentFilter !== 'all') {
      entries = entries.filter(e => e.type === currentFilter);
    }

    // Search by name
    if (searchQuery) {
      entries = entries.filter(e => e.name.toLowerCase().includes(searchQuery));
    }

    // Sort
    entries = [...entries];
    switch (currentSort) {
      case 'date-desc': entries.sort((a, b) => b.timestamp - a.timestamp); break;
      case 'date-asc': entries.sort((a, b) => a.timestamp - b.timestamp); break;
      case 'size-desc': entries.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0)); break;
      case 'size-asc': entries.sort((a, b) => (a.sizeBytes || 0) - (b.sizeBytes || 0)); break;
      case 'name-asc': entries.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'name-desc': entries.sort((a, b) => b.name.localeCompare(a.name)); break;
    }

    filteredEntries = entries;
    displayedCount = 0;
    grid.innerHTML = '';
    renderMore();
    updateUI();
  }

  function renderMore() {
    const end = Math.min(displayedCount + PAGE_SIZE, filteredEntries.length);
    for (let i = displayedCount; i < end; i++) {
      grid.appendChild(createItemCard(filteredEntries[i]));
    }
    displayedCount = end;
    updateUI();
  }

  function updateUI() {
    const total = filteredEntries.length;
    countLabel.textContent = `${total} item${total !== 1 ? 's' : ''}`;
    emptyState.style.display = total === 0 ? 'block' : 'none';
    grid.style.display = total === 0 ? 'none' : 'grid';
    loadMoreContainer.style.display = displayedCount < total ? 'block' : 'none';
  }

  // ── Card Rendering ──
  function createItemCard(entry) {
    const card = document.createElement('div');
    card.className = 'history-item';
    card.addEventListener('click', (e) => {
      if (e.target.closest('.item-delete')) return;
      openEntry(entry);
    });

    // Thumbnail
    const thumb = document.createElement('img');
    thumb.className = 'item-thumbnail';
    thumb.src = entry.thumbnail || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect fill="%23334155" width="240" height="160"/><text x="120" y="85" text-anchor="middle" fill="%2394A3B8" font-size="14">No preview</text></svg>';
    thumb.alt = entry.name;
    thumb.loading = 'lazy';
    card.appendChild(thumb);

    // Duration overlay for recordings
    if (entry.type === 'recording' && entry.duration) {
      const dur = document.createElement('span');
      dur.className = 'item-duration';
      dur.textContent = formatDuration(entry.duration);
      card.appendChild(dur);
    }

    // Delete button
    const del = document.createElement('button');
    del.className = 'item-delete';
    del.textContent = '✕';
    del.title = 'Delete';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteEntry(entry.id);
    });
    card.appendChild(del);

    // Info
    const info = document.createElement('div');
    info.className = 'item-info';

    const name = document.createElement('div');
    name.className = 'item-name';
    name.textContent = entry.name;
    name.title = entry.name;
    info.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'item-meta';

    const badge = document.createElement('span');
    badge.className = `item-type-badge ${entry.type === 'recording' ? 'recording' : ''}`;
    badge.textContent = entry.type === 'screenshot' ? '📸 IMG' : '🎥 VID';
    meta.appendChild(badge);

    const details = document.createElement('span');
    const dateStr = new Date(entry.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const sizeStr = entry.sizeBytes ? formatSize(entry.sizeBytes) : '';
    details.textContent = `${dateStr}${sizeStr ? ' · ' + sizeStr : ''}`;
    meta.appendChild(details);

    info.appendChild(meta);
    card.appendChild(info);

    return card;
  }

  // ── Actions ──
  function openEntry(entry) {
    if (entry.type === 'screenshot' && entry.dataUrl) {
      // Open in editor
      chrome.storage.local.set({ pendingCapture: entry.dataUrl }, () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('editor/editor.html') });
      });
    } else if (entry.type === 'recording') {
      // Can't reopen video from history (only metadata saved), show toast
      showToast('Recording files are saved in your Downloads folder');
    }
  }

  async function deleteEntry(id) {
    allEntries = allEntries.filter(e => e.id !== id);
    await chrome.storage.local.set({ historyEntries: allEntries });
    applyFilters();
  }

  // ── Confirm Dialog ──
  function showConfirmDialog(title, message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="dialog-buttons">
          <button class="btn-confirm-no">Cancel</button>
          <button class="btn-confirm-yes">Delete All</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.btn-confirm-no').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.btn-confirm-yes').addEventListener('click', () => {
      onConfirm();
      overlay.remove();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ── Helpers ──
  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function showToast(message) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
      padding: 12px 24px; background: var(--ss-primary); color: white;
      border-radius: 8px; font-size: 14px; font-weight: 500; z-index: 9999;
      box-shadow: var(--ss-shadow-lg);
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
})();
