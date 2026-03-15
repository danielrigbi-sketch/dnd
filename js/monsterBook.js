// js/monsterBook.js — Monster Book Modal
// Allows DM to browse Open5e monster compendium and spawn monsters to the map.
// Reuses: fetchMonsters + open5eToNPC from open5e.js
//         window.addNPCFromWizard() registered in app.js

import { fetchMonsters, open5eToNPC, normaliseType } from './open5e.js';
import { t } from './i18n.js';

// ── State ─────────────────────────────────────────────────────────────────────
let _search    = '';
let _crFilter  = 'all';
let _debounce  = null;
let _results   = [];
let _loading   = false;
let _spawned   = new Set(); // track names spawned this session

// CR filter bands (same as sceneWizard)
const CR_BANDS = {
  all:  [0, 30],
  low:  [0, 0.5],
  med:  [1, 4],
  high: [5, 10],
  epic: [11, 30],
};

// Type colour map (same as sceneWizard/tokenSystem)
const TYPE_COLOR = {
  Undead: '#8e44ad', Beast: '#27ae60', Dragon: '#e74c3c', Fiend: '#c0392b',
  Aberration: '#2980b9', Humanoid: '#d35400', Construct: '#7f8c8d',
};

// ── Public API ────────────────────────────────────────────────────────────────

export function initMonsterBook() {
  window.openMonsterBook  = openMonsterBook;
  window.closeMonsterBook = closeMonsterBook;
}

function openMonsterBook() {
  const modal = document.getElementById('monster-book-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  _search   = '';
  _crFilter = 'all';
  _spawned  = new Set();
  _fetchAndRender();
}

function closeMonsterBook() {
  const modal = document.getElementById('monster-book-modal');
  if (modal) modal.style.display = 'none';
}

// ── Fetch + Render ────────────────────────────────────────────────────────────

async function _fetchAndRender() {
  _loading = true;
  _renderContent();

  try {
    const [crMin, crMax] = CR_BANDS[_crFilter] || [0, 30];
    const opts = { page_size: 50 };
    if (_search)           opts.search = _search;
    if (_crFilter !== 'all') { opts.cr_min = crMin; opts.cr_max = crMax; }

    const data = await fetchMonsters(opts);
    _results = data.results || [];
  } catch (err) {
    _results = [];
    console.warn('Monster Book fetch failed:', err);
  }

  _loading = false;
  _renderContent();
}

function _renderContent() {
  const el = document.getElementById('monster-book-content');
  if (!el) return;

  el.innerHTML = `
    ${_buildFilters()}
    ${_loading ? _buildSkeleton() : _buildList()}
  `;

  // Wire filter inputs
  const searchEl = el.querySelector('#mb-search');
  if (searchEl) {
    searchEl.value = _search;
    searchEl.addEventListener('input', e => {
      clearTimeout(_debounce);
      _search = e.target.value;
      _debounce = setTimeout(() => _fetchAndRender(), 380);
    });
    searchEl.focus();
  }

  el.querySelectorAll('.mb-cr-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _crFilter = btn.dataset.cr;
      _fetchAndRender();
    });
  });

  el.querySelectorAll('.mb-spawn-btn').forEach(btn => {
    btn.addEventListener('click', () => _spawnMonster(btn.dataset.slug));
  });
}

function _buildFilters() {
  const crLabels = { all: 'All', low: 'CR ¼-½', med: 'CR 1-4', high: 'CR 5-10', epic: 'CR 11+' };
  const crPills = Object.entries(crLabels).map(([k, label]) => `
    <button class="mb-cr-btn" data-cr="${k}"
      style="padding:4px 9px; border-radius:12px; font-size:11px; cursor:pointer; font-weight:700;
             border:1px solid ${_crFilter === k ? '#e74c3c' : 'rgba(255,255,255,0.2)'};
             background:${_crFilter === k ? 'rgba(231,76,60,0.3)' : 'rgba(255,255,255,0.06)'};
             color:${_crFilter === k ? '#f1948a' : '#aaa'};">
      ${label}
    </button>
  `).join('');

  return `
    <div style="margin-bottom:10px;">
      <input id="mb-search" type="text" placeholder="🔍 ${t('wiz_search_monster') || 'Search monsters...'}"
        style="width:100%; box-sizing:border-box; background:rgba(255,255,255,0.08);
               border:1px solid rgba(255,255,255,0.2); color:white; border-radius:7px;
               padding:8px 10px; font-size:13px; outline:none; margin-bottom:8px;">
      <div style="display:flex; flex-wrap:wrap; gap:5px;">${crPills}</div>
    </div>
  `;
}

function _buildSkeleton() {
  return Array.from({ length: 6 }, () => `
    <div style="height:44px; background:rgba(255,255,255,0.06); border-radius:8px; margin-bottom:6px; animation:pulse 1.2s infinite;"></div>
  `).join('');
}

function _buildList() {
  if (!_results.length) {
    return `<div style="text-align:center; color:#888; padding:30px; font-style:italic;">
      ${t('no_results') || 'No monsters found'}
    </div>`;
  }

  return _results.map(m => {
    const type  = normaliseType(m.type);
    const col   = TYPE_COLOR[type] || '#c0392b';
    const cr    = m.challenge_rating ?? '?';
    const hp    = m.hit_points ?? '?';
    const wasSpawned = _spawned.has(m.slug);

    return `
      <div style="display:flex; align-items:center; gap:10px; padding:8px 10px;
                  background:rgba(255,255,255,0.04); border-radius:8px; margin-bottom:5px;
                  border-left:3px solid ${col};">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:700; font-size:13px; color:white; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m.name}</div>
          <div style="font-size:11px; color:#aaa;">CR ${cr} · ${m.type || 'Unknown'} · ❤️ ${hp}</div>
        </div>
        <button class="mb-spawn-btn" data-slug="${m.slug}"
          style="padding:5px 11px; border-radius:7px; font-size:11px; font-weight:700; cursor:pointer;
                 border:1px solid ${wasSpawned ? '#27ae60' : col};
                 background:${wasSpawned ? 'rgba(39,174,96,0.2)' : `rgba(${_hexToRgb(col)},0.2)`};
                 color:${wasSpawned ? '#82e0aa' : '#f1948a'}; white-space:nowrap;">
          ${wasSpawned ? '✓ ' + (t('spawned') || 'Spawned') : '➕ ' + (t('add_to_map') || 'הוסף למפה')}
        </button>
      </div>
    `;
  }).join('');
}

// ── Spawn ─────────────────────────────────────────────────────────────────────

function _spawnMonster(slug) {
  const m = _results.find(r => r.slug === slug);
  if (!m) return;

  const type  = normaliseType(m.type);
  const col   = TYPE_COLOR[type] || '#c0392b';
  const stats = open5eToNPC(m);

  // Build a unique name if already on map
  const baseName = m.name;
  let finalName  = baseName;
  let idx = 2;
  while (_spawned.has(finalName)) { finalName = `${baseName} ${idx++}`; }
  _spawned.add(finalName);

  const initBonus = Math.floor(((m.dexterity || 10) - 10) / 2);
  const init      = Math.floor(Math.random() * 20) + 1 + initBonus;
  const portrait  = `https://api.dicebear.com/8.x/bottts/svg?seed=${slug}&backgroundColor=${col.replace('#', '')}`;

  if (typeof window.addNPCFromWizard === 'function') {
    window.addNPCFromWizard(finalName, col, portrait, init, stats);
  }

  // Re-render to show ✓ state
  _renderContent();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
