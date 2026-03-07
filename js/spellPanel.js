// js/spellPanel.js — Spell Lookup Panel  (Wave 2 / E1-D)
//
// Floating modal that lets players search the SRD spell list.
// Features:
//   • Real-time search with 350ms debounce (same pattern as sceneWizard)
//   • Filter by school and spell level
//   • Shimmer skeletons while fetching
//   • Click a spell → expand inline with full description, range, components, etc.
//   • "Add to character" hook (fires window.onSpellAdd(spell) if defined)
//
// Usage:
//   import { openSpellPanel, closeSpellPanel } from './spellPanel.js';
//   window.openSpellPanel = openSpellPanel;

import { fetchSpells, fetchSpellBySlug } from './open5e.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const SCHOOLS = ['Abjuration','Conjuration','Divination','Enchantment',
                 'Evocation','Illusion','Necromancy','Transmutation'];

const SCHOOL_COLOURS = {
  Abjuration:   '#3498db',
  Conjuration:  '#8e44ad',
  Divination:   '#f39c12',
  Enchantment:  '#e91e8c',
  Evocation:    '#e74c3c',
  Illusion:     '#16a085',
  Necromancy:   '#2c3e50',
  Transmutation:'#27ae60',
};

// ── DOM bootstrap ─────────────────────────────────────────────────────────────

function ensurePanel() {
  if (document.getElementById('spell-panel-modal')) return;

  const modal = document.createElement('div');
  modal.id    = 'spell-panel-modal';
  modal.innerHTML = `
    <div id="spell-panel-backdrop" onclick="window.closeSpellPanel()"></div>
    <div id="spell-panel-dialog" role="dialog" aria-label="Spell lookup">
      <div id="spell-panel-header">
        <span style="font-size:18px;font-weight:700;color:#e6b800">🔮 Spell Compendium</span>
        <button onclick="window.closeSpellPanel()" style="background:none;border:none;color:#aaa;font-size:22px;cursor:pointer;padding:4px;line-height:1;" aria-label="Close">✕</button>
      </div>

      <div id="spell-panel-filters">
        <input id="spell-search-input" type="search" placeholder="Search spells…" autocomplete="off"
          style="flex:1;min-width:0;padding:8px 12px;background:#16213e;border:1px solid #8e44ad;
                 border-radius:6px;color:#eee;font-size:14px;outline:none;">
        <select id="spell-level-filter"
          style="padding:7px 10px;background:#16213e;border:1px solid #555;border-radius:6px;
                 color:#eee;font-size:13px;cursor:pointer;max-width:90px;">
          <option value="">All levels</option>
          ${[0,1,2,3,4,5,6,7,8,9].map(l =>
            `<option value="${l}">${l === 0 ? 'Cantrip' : `Level ${l}`}</option>`
          ).join('')}
        </select>
        <select id="spell-school-filter"
          style="padding:7px 10px;background:#16213e;border:1px solid #555;border-radius:6px;
                 color:#eee;font-size:13px;cursor:pointer;max-width:120px;">
          <option value="">All schools</option>
          ${SCHOOLS.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>

      <div id="spell-list-wrap">
        <div id="spell-list"></div>
        <div id="spell-list-footer"></div>
      </div>
    </div>`;

  if (!document.getElementById('spell-panel-css')) {
    const style = document.createElement('style');
    style.id    = 'spell-panel-css';
    style.textContent = `
      #spell-panel-backdrop {
        display:none; position:fixed; inset:0;
        background:rgba(0,0,0,0.6); z-index:5000;
      }
      #spell-panel-dialog {
        display:none; position:fixed;
        top:50%; left:50%; transform:translate(-50%,-50%);
        width:min(680px,96vw); max-height:85dvh;
        background:#1a1a2e; border:1px solid #8e44ad;
        border-radius:12px; z-index:5001;
        display:none; flex-direction:column;
        box-shadow:0 20px 60px rgba(0,0,0,0.7);
        overflow:hidden;
      }
      #spell-panel-dialog.open { display:flex !important; }
      #spell-panel-header {
        display:flex; justify-content:space-between; align-items:center;
        padding:16px 18px 10px; border-bottom:1px solid #2d2d4e; flex-shrink:0;
      }
      #spell-panel-filters {
        display:flex; gap:8px; align-items:center;
        padding:10px 14px; border-bottom:1px solid #2d2d4e; flex-shrink:0;
        flex-wrap:wrap;
      }
      #spell-list-wrap { overflow-y:auto; flex:1; padding:8px 14px 16px; }

      .sp-shimmer {
        background:linear-gradient(90deg,#16213e 25%,#1d2d50 50%,#16213e 75%);
        background-size:200% 100%; border-radius:6px;
        animation:spShimmer 1.4s infinite; margin-bottom:8px;
      }
      @keyframes spShimmer {
        0%{background-position:200% 0} 100%{background-position:-200% 0}
      }

      .sp-card {
        background:#16213e; border-radius:8px;
        border-left:3px solid #555;
        padding:10px 13px; margin-bottom:7px; cursor:pointer;
        transition:background .15s;
      }
      .sp-card:hover { background:#1d2d50; }
      .sp-card-header {
        display:flex; align-items:center; gap:8px;
      }
      .sp-name { font-size:15px; font-weight:700; color:#e6b800; flex:1; }
      .sp-school-badge {
        font-size:10px; font-weight:700; border-radius:4px;
        padding:2px 7px; color:#fff; flex-shrink:0;
      }
      .sp-level-badge {
        font-size:11px; color:#aaa; flex-shrink:0;
      }
      .sp-meta { font-size:12px; color:#aaa; margin-top:4px; }

      /* Expanded detail block */
      .sp-detail {
        margin-top:10px; padding-top:10px;
        border-top:1px solid #2d2d4e; font-size:13px; color:#ddd; line-height:1.6;
      }
      .sp-detail strong { color:#e6b800; }
      .sp-detail-props { display:flex; flex-wrap:wrap; gap:14px; margin-bottom:8px; }
      .sp-detail-prop strong { color:#8e44ad; font-size:11px; text-transform:uppercase; display:block; }
      .sp-add-btn {
        margin-top:10px; padding:6px 16px;
        background:#8e44ad; border:none; border-radius:6px;
        color:#fff; font-size:13px; font-weight:700; cursor:pointer;
      }
      .sp-add-btn:hover { background:#a55fc2; }

      #spell-list-footer { font-size:12px; color:#666; text-align:center; padding:8px 0 0; }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(modal);

  // Wire up filter events
  let debounceTimer;
  const onFilterChange = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(_fetchAndRender, 350);
  };

  document.getElementById('spell-search-input').addEventListener('input',  onFilterChange);
  document.getElementById('spell-level-filter').addEventListener('change', onFilterChange);
  document.getElementById('spell-school-filter').addEventListener('change', onFilterChange);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function _shimmerRows(n = 6) {
  return Array.from({length: n}, (_, i) =>
    `<div class="sp-shimmer" style="height:${i%3===0?52:42}px;opacity:${1-(i*0.1)}"></div>`
  ).join('');
}

let _expandedSlug = null;

function _renderSpellCard(s) {
  const school     = (s.school || 'Unknown').replace(/^\w/, c => c.toUpperCase());
  const colour     = SCHOOL_COLOURS[school] || '#666';
  const lvlLabel   = s.level_int === 0 ? 'Cantrip' : `Level ${s.level_int}`;
  const isExpanded = _expandedSlug === s.slug;

  const classes = (s.spell_lists || []).join(', ');
  const meta    = [lvlLabel, classes].filter(Boolean).join(' · ');

  const detailHTML = isExpanded ? `
    <div class="sp-detail">
      <div class="sp-detail-props">
        <div class="sp-detail-prop"><strong>Casting Time</strong>${s.casting_time || '—'}</div>
        <div class="sp-detail-prop"><strong>Range</strong>${s.range || '—'}</div>
        <div class="sp-detail-prop"><strong>Duration</strong>${s.duration || '—'}</div>
        <div class="sp-detail-prop"><strong>Components</strong>${s.components || '—'}</div>
        ${s.concentration ? '<div class="sp-detail-prop"><strong>Concentration</strong>Yes</div>' : ''}
        ${s.ritual        ? '<div class="sp-detail-prop"><strong>Ritual</strong>Yes</div>'        : ''}
      </div>
      <div style="margin-bottom:8px">${s.desc || ''}</div>
      ${s.higher_level ? `<div><strong>At Higher Levels.</strong> ${s.higher_level}</div>` : ''}
      ${typeof window.onSpellAdd === 'function'
        ? `<button class="sp-add-btn" onclick="window._spAddCurrent()">+ Add to Character</button>`
        : ''}
    </div>` : '';

  return `
    <div class="sp-card" id="sp-card-${s.slug}"
         style="border-left-color:${colour}"
         onclick="window._spellCardClick('${s.slug}')">
      <div class="sp-card-header">
        <span class="sp-name">${s.name}</span>
        <span class="sp-school-badge" style="background:${colour}">${school}</span>
        <span class="sp-level-badge">${lvlLabel}</span>
      </div>
      <div class="sp-meta">${meta}</div>
      ${detailHTML}
    </div>`;
}

let _lastResults = [];

async function _fetchAndRender() {
  const list   = document.getElementById('spell-list');
  const footer = document.getElementById('spell-list-footer');
  if (!list) return;

  list.innerHTML = _shimmerRows();
  footer.textContent = '';

  const q      = document.getElementById('spell-search-input')?.value.trim() || '';
  const level  = document.getElementById('spell-level-filter')?.value ?? '';
  const school = document.getElementById('spell-school-filter')?.value || '';

  try {
    const opts = { page_size: 50 };
    if (q)      opts.search       = q;
    if (level !== '') opts.level  = parseInt(level);
    if (school) opts.school       = school.toLowerCase();

    const data     = await fetchSpells(opts);
    _lastResults   = data.results || data;
    const total    = data.count ?? _lastResults.length;

    _expandedSlug  = null;   // collapse on new search

    list.innerHTML  = _lastResults.length
      ? _lastResults.map(_renderSpellCard).join('')
      : '<p style="color:#666;text-align:center;padding:20px">No spells found.</p>';

    footer.textContent = total > _lastResults.length
      ? `Showing ${_lastResults.length} of ${total} — refine search to narrow results`
      : `${_lastResults.length} spell${_lastResults.length !== 1 ? 's' : ''}`;
  } catch (err) {
    list.innerHTML = `<p style="color:#e74c3c;padding:20px">Failed to load spells: ${err.message}</p>`;
  }
}

// Expose card click
window._spellCardClick = async function(slug) {
  if (_expandedSlug === slug) {
    _expandedSlug = null;
  } else {
    _expandedSlug = slug;
    // If detail data not yet cached, fetch full spell
    const cached = _lastResults.find(s => s.slug === slug);
    if (cached && !cached.desc) {
      try {
        const full = await fetchSpellBySlug(slug);
        Object.assign(cached, full);
      } catch { /* use partial data */ }
    }
  }

  // Re-render list with expanded state
  const list = document.getElementById('spell-list');
  if (list) list.innerHTML = _lastResults.map(_renderSpellCard).join('');
};

window._spAddCurrent = function() {
  if (!_expandedSlug) return;
  const spell = _lastResults.find(s => s.slug === _expandedSlug);
  if (spell && typeof window.onSpellAdd === 'function') {
    window.onSpellAdd(spell);
  }
};

// ── Public API ─────────────────────────────────────────────────────────────────

export function openSpellPanel() {
  ensurePanel();
  const dialog = document.getElementById('spell-panel-dialog');
  const back   = document.getElementById('spell-panel-backdrop');
  dialog.classList.add('open');
  back.style.display = 'block';

  // Load spells on first open (or reset search)
  document.getElementById('spell-search-input').value = '';
  document.getElementById('spell-level-filter').value = '';
  document.getElementById('spell-school-filter').value = '';
  _fetchAndRender();
}

export function closeSpellPanel() {
  const dialog = document.getElementById('spell-panel-dialog');
  const back   = document.getElementById('spell-panel-backdrop');
  if (!dialog) return;
  dialog.classList.remove('open');
  if (back) back.style.display = 'none';
}

// Expose to window
window.closeSpellPanel = closeSpellPanel;
window.openSpellPanel  = openSpellPanel;
