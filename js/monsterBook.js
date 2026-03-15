// js/monsterBook.js — Monster Book Modal
// Allows DM to browse Open5e monster compendium and spawn monsters to the map.
// Reuses: fetchMonsters + open5eToNPC from open5e.js
//         window.addNPCFromWizard() registered in app.js
//
// Architecture: filters UI is rendered ONCE on open; only #mb-results is
// replaced on each fetch so the search input never loses focus or listeners.

import { fetchMonsters, open5eToNPC, normaliseType } from './open5e.js';
import { t } from './i18n.js';

// ── State ─────────────────────────────────────────────────────────────────────
let _search     = '';
let _crFilter   = 'all';
let _typeFilter = '';
let _debounce   = null;
let _results    = [];
let _spawned    = new Set();
let _fetchId    = 0;   // cancel stale fetches

// CR filter bands
const CR_BANDS = {
  all:  [0, 30], low:  [0, 0.5],
  med:  [1, 4],  high: [5, 10], epic: [11, 30],
};

const TYPES = [
  'Humanoid','Beast','Undead','Dragon','Fiend','Aberration',
  'Construct','Giant','Celestial','Elemental','Fey','Ooze','Plant',
];

const TYPE_COLOR = {
  Undead: '#8e44ad', Beast: '#27ae60', Dragon: '#e74c3c', Fiend: '#c0392b',
  Aberration: '#2980b9', Humanoid: '#d35400', Construct: '#7f8c8d',
  Giant: '#e67e22', Celestial: '#f1c40f', Elemental: '#1abc9c',
  Fey: '#9b59b6', Ooze: '#2ecc71', Plant: '#16a085',
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
  _search     = '';
  _crFilter   = 'all';
  _typeFilter = '';
  _spawned    = new Set();
  _results    = [];
  _initUI();
  _fetchAndRender();
}

function closeMonsterBook() {
  const modal = document.getElementById('monster-book-modal');
  if (modal) modal.style.display = 'none';
}

// ── UI Init (called once per open) ───────────────────────────────────────────

function _initUI() {
  const el = document.getElementById('monster-book-content');
  if (!el) return;

  const crLabels = { all: 'All', low: 'CR ¼-½', med: 'CR 1-4', high: 'CR 5-10', epic: 'CR 11+' };
  const crPills = Object.entries(crLabels).map(([k, label]) =>
    `<button class="mb-cr-btn" data-cr="${k}"
       style="padding:4px 9px; border-radius:12px; font-size:11px; cursor:pointer; font-weight:700;
              border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.06); color:#aaa;">
       ${label}
     </button>`
  ).join('');

  const typePills = [`<button class="mb-type-btn" data-type=""
    style="padding:3px 8px; border-radius:10px; font-size:10px; cursor:pointer; font-weight:700;
           border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.06); color:#aaa;">
    ${t('mb_all_types') || 'All Types'}
  </button>`].concat(
    TYPES.map(tp => {
      const col = TYPE_COLOR[tp] || '#c0392b';
      return `<button class="mb-type-btn" data-type="${tp}"
        style="padding:3px 8px; border-radius:10px; font-size:10px; cursor:pointer; font-weight:700;
               border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.06); color:#aaa;">
        ${tp}
      </button>`;
    })
  ).join('');

  el.innerHTML = `
    <div id="mb-filters" style="margin-bottom:10px;">
      <input id="mb-search" type="text"
        placeholder="🔍 ${t('wiz_search_monster') || 'Search monsters...'}"
        style="width:100%; box-sizing:border-box; background:rgba(255,255,255,0.08);
               border:1px solid rgba(255,255,255,0.2); color:white; border-radius:7px;
               padding:8px 10px; font-size:13px; outline:none; margin-bottom:8px;">
      <div id="mb-cr-pills" style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:5px;">${crPills}</div>
      <div id="mb-type-pills" style="display:flex; flex-wrap:wrap; gap:4px;">${typePills}</div>
    </div>
    <div id="mb-results"></div>
  `;

  // Wire search input — listener attached ONCE, input never replaced
  const searchEl = el.querySelector('#mb-search');
  searchEl?.addEventListener('input', e => {
    clearTimeout(_debounce);
    _search = e.target.value;
    _debounce = setTimeout(() => _fetchAndRender(), 380);
  });
  searchEl?.focus();

  // Wire CR pills — delegated
  el.querySelector('#mb-cr-pills')?.addEventListener('click', e => {
    const btn = e.target.closest('.mb-cr-btn');
    if (!btn) return;
    _crFilter = btn.dataset.cr;
    _updateCrPills();
    clearTimeout(_debounce);
    _fetchAndRender();
  });

  // Wire type pills — delegated
  el.querySelector('#mb-type-pills')?.addEventListener('click', e => {
    const btn = e.target.closest('.mb-type-btn');
    if (!btn) return;
    _typeFilter = btn.dataset.type;
    _updateTypePills();
    clearTimeout(_debounce);
    _fetchAndRender();
  });
}

function _updateCrPills() {
  document.querySelectorAll('.mb-cr-btn').forEach(btn => {
    const active = btn.dataset.cr === _crFilter;
    btn.style.border      = `1px solid ${active ? '#e74c3c' : 'rgba(255,255,255,0.2)'}`;
    btn.style.background  = active ? 'rgba(231,76,60,0.3)' : 'rgba(255,255,255,0.06)';
    btn.style.color       = active ? '#f1948a' : '#aaa';
  });
}

function _updateTypePills() {
  document.querySelectorAll('.mb-type-btn').forEach(btn => {
    const active = btn.dataset.type === _typeFilter;
    const col    = TYPE_COLOR[btn.dataset.type] || '#e74c3c';
    btn.style.border      = `1px solid ${active ? col : 'rgba(255,255,255,0.2)'}`;
    btn.style.background  = active ? `${col}33` : 'rgba(255,255,255,0.06)';
    btn.style.color       = active ? col : '#aaa';
  });
}

// ── Fetch (only updates #mb-results) ─────────────────────────────────────────

async function _fetchAndRender() {
  const myId = ++_fetchId;

  _renderResults('<div id="mb-skeleton">' +
    Array.from({ length: 6 }, () =>
      `<div style="height:44px; background:rgba(255,255,255,0.06); border-radius:8px; margin-bottom:6px;"></div>`
    ).join('') + '</div>');

  try {
    const [crMin, crMax] = CR_BANDS[_crFilter] || [0, 30];
    const opts = { page_size: 50 };
    if (_search)             opts.search = _search;
    if (_crFilter !== 'all') { opts.cr_min = crMin; opts.cr_max = crMax; }
    if (_typeFilter)         opts.type   = _typeFilter;

    const data = await fetchMonsters(opts);
    if (myId !== _fetchId) return; // stale fetch — discard
    _results = data.results || [];
  } catch (err) {
    if (myId !== _fetchId) return;
    _results = [];
    console.warn('Monster Book fetch failed:', err);
  }

  _renderResults(_buildList());
}

function _renderResults(html) {
  const el = document.getElementById('mb-results');
  if (el) el.innerHTML = html;
  _wireSpawnButtons();
}

function _wireSpawnButtons() {
  document.querySelectorAll('.mb-spawn-btn').forEach(btn => {
    btn.addEventListener('click', () => _showCustomizeForm(btn.dataset.slug));
  });
}

// ── List builder ──────────────────────────────────────────────────────────────

function _buildList() {
  if (!_results.length) {
    return `<div style="text-align:center; color:#888; padding:30px; font-style:italic;">
      ${t('no_results') || 'No monsters found'}
    </div>`;
  }

  return _results.map(m => {
    const type       = normaliseType(m.type);
    const col        = TYPE_COLOR[type] || '#c0392b';
    const cr         = m.challenge_rating ?? '?';
    const hp         = m.hit_points ?? '?';
    const wasSpawned = _spawned.has(m.slug);

    return `
      <div style="display:flex; align-items:center; gap:10px; padding:8px 10px;
                  background:rgba(255,255,255,0.04); border-radius:8px; margin-bottom:5px;
                  border-left:3px solid ${col};">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:700; font-size:13px; color:white;
                      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m.name}</div>
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

// ── Pre-Spawn Customization Form ──────────────────────────────────────────────

let _selectedPortrait = '';

function _showCustomizeForm(slug) {
  const m = _results.find(r => r.slug === slug);
  if (!m) return;

  const type  = normaliseType(m.type);
  const col   = TYPE_COLOR[type] || '#c0392b';
  const stats = open5eToNPC(m);

  _selectedPortrait = `https://api.dicebear.com/8.x/adventurer/svg?seed=${slug}`;

  const inputStyle = `
    width:100%; box-sizing:border-box; padding:5px 8px; border-radius:5px;
    background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2);
    color:white; font-size:12px; margin-top:3px; outline:none;
  `;
  const labelStyle = `font-size:11px; color:#aaa; display:block;`;

  _renderResults(`
    <div style="padding:4px;">
      <button id="mb-back-btn"
        style="padding:4px 10px; border-radius:6px; font-size:11px; cursor:pointer;
               background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.2);
               color:#aaa; margin-bottom:10px;">
        ← ${t('mb_back') || 'חזור'}
      </button>

      <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
        <img id="mb-portrait-preview" src="${_selectedPortrait}"
          style="width:64px; height:64px; border-radius:50%; object-fit:cover;
                 border:2px solid ${col}; flex-shrink:0;">
        <div>
          <div style="font-weight:700; font-size:15px; color:white;">${m.name}</div>
          <div style="font-size:11px; color:#aaa;">
            CR ${m.challenge_rating ?? '?'} · ${m.type || 'Unknown'} · ${m.size || ''} · ❤️ ${m.hit_points ?? '?'}
          </div>
          ${m.alignment ? `<div style="font-size:10px; color:#777; margin-top:2px;">${m.alignment}</div>` : ''}
        </div>
      </div>

      <!-- Portrait picker -->
      <div style="margin-bottom:10px;">
        <div style="font-size:11px; color:#aaa; margin-bottom:5px;">
          🖼️ ${t('mb_choose_portrait') || 'בחר דיוקן'} <span style="color:#555; font-size:10px;">(Lexica.art AI)</span>
        </div>
        <div id="mb-portrait-grid" style="display:flex; flex-wrap:wrap; gap:5px;">
          <div style="color:#666; font-size:11px; font-style:italic;">${t('loading') || 'טוען...'}</div>
        </div>
      </div>

      <!-- Editable fields -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
        <label style="${labelStyle}">${t('mb_name') || 'שם'}
          <input id="mb-c-name" value="${m.name.replace(/"/g, '&quot;')}" style="${inputStyle}">
        </label>
        <label style="${labelStyle}">${t('mb_hp') || 'HP'}
          <input id="mb-c-hp" type="number" value="${stats.maxHp}" style="${inputStyle}">
        </label>
        <label style="${labelStyle}">${t('mb_ac') || 'AC'}
          <input id="mb-c-ac" type="number" value="${stats.ac}" style="${inputStyle}">
        </label>
        <label style="${labelStyle}">${t('mb_speed') || 'מהירות'} (ft)
          <input id="mb-c-speed" type="number" value="${stats.speed}" style="${inputStyle}">
        </label>
        <label style="${labelStyle}">${t('mb_melee') || 'ניגוף'} (+)
          <input id="mb-c-melee" type="number" value="${stats.melee}" style="${inputStyle}">
        </label>
        <label style="${labelStyle}">${t('mb_melee_dmg') || 'נזק ניגוף'}
          <input id="mb-c-meleeDmg" value="${stats.meleeDmg}" style="${inputStyle}">
        </label>
      </div>

      ${m.special_abilities?.length ? `
        <div style="font-size:10px; color:#666; margin-bottom:8px; padding:6px 8px;
                    background:rgba(255,255,255,0.03); border-radius:5px; border-left:2px solid ${col};">
          <strong style="color:#888;">${t('mb_abilities') || 'יכולות מיוחדות'}:</strong>
          ${m.special_abilities.slice(0,3).map(a => `<span style="color:#777;"> ${a.name}.</span>`).join('')}
          ${m.special_abilities.length > 3 ? `<span style="color:#555;"> +${m.special_abilities.length - 3} more</span>` : ''}
        </div>
      ` : ''}

      <button id="mb-spawn-confirm"
        style="width:100%; padding:10px; border-radius:8px; font-size:13px; font-weight:700;
               cursor:pointer; border:1px solid ${col};
               background:rgba(${_hexToRgb(col)},0.25); color:#f1948a;">
        ➕ ${t('mb_spawn_confirm') || 'הוסף למפה'}
      </button>
    </div>
  `);

  document.getElementById('mb-back-btn').onclick = () => _renderResults(_buildList());

  document.getElementById('mb-spawn-confirm').onclick = () => {
    const finalName = (document.getElementById('mb-c-name').value.trim()) || m.name;
    const overrides = {
      maxHp:    +(document.getElementById('mb-c-hp').value)    || stats.maxHp,
      hp:       +(document.getElementById('mb-c-hp').value)    || stats.hp,
      ac:       +(document.getElementById('mb-c-ac').value)    || stats.ac,
      speed:    +(document.getElementById('mb-c-speed').value) || stats.speed,
      melee:    +(document.getElementById('mb-c-melee').value),
      meleeDmg:  document.getElementById('mb-c-meleeDmg').value || stats.meleeDmg,
    };
    _doSpawn(m, finalName, { ...stats, ...overrides }, col);
  };

  // Load portrait options asynchronously — doesn't block form
  _loadPortraitPicker(slug, m.name);
}

async function _loadPortraitPicker(slug, name) {
  const grid = document.getElementById('mb-portrait-grid');
  if (!grid) return;
  try {
    const res  = await fetch(
      `https://lexica.art/api/v1/search?q=${encodeURIComponent(name + ' DnD fantasy monster portrait')}`
    );
    if (!res.ok) throw new Error('Lexica API error');
    const data = await res.json();
    const imgs = (data.images || []).slice(0, 8);

    if (!imgs.length) {
      grid.innerHTML = `<span style="color:#666; font-size:11px;">${t('mb_no_portraits') || 'No portraits found'}</span>`;
      return;
    }

    grid.innerHTML = imgs.map(img =>
      `<img src="${img.src}" data-src="${img.src}"
        class="mb-portrait-opt"
        style="width:54px; height:54px; border-radius:8px; object-fit:cover; cursor:pointer;
               border:2px solid transparent; transition:border-color 0.15s;"
        onerror="this.style.display='none'">`
    ).join('');

    grid.querySelectorAll('.mb-portrait-opt').forEach(el => {
      el.addEventListener('click', () => {
        grid.querySelectorAll('.mb-portrait-opt').forEach(i => i.style.border = '2px solid transparent');
        el.style.border = '2px solid #e74c3c';
        _selectedPortrait = el.dataset.src;
        const prev = document.getElementById('mb-portrait-preview');
        if (prev) prev.src = _selectedPortrait;
      });
    });
  } catch {
    if (grid) grid.innerHTML = `<span style="color:#555; font-size:11px; font-style:italic;">${t('mb_no_portraits') || 'Could not load portraits'}</span>`;
  }
}

// ── Spawn ─────────────────────────────────────────────────────────────────────

function _doSpawn(m, finalName, stats, col) {
  // Deduplicate name if already spawned
  let name = finalName;
  let idx  = 2;
  while (_spawned.has(name)) { name = `${finalName} ${idx++}`; }
  _spawned.add(name);

  const initBonus = Math.floor(((m.dexterity || 10) - 10) / 2);
  const init      = Math.floor(Math.random() * 20) + 1 + initBonus;
  const portrait  = _selectedPortrait ||
    `https://api.dicebear.com/8.x/adventurer/svg?seed=${m.slug}`;

  if (typeof window.addNPCFromWizard === 'function') {
    window.addNPCFromWizard(name, col, portrait, init, stats);
  }

  _renderResults(_buildList()); // refresh ✓ state without touching search input
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
