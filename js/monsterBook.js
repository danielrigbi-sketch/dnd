// js/monsterBook.js — Monster Book Modal
// Allows DM to browse Open5e monster compendium and spawn monsters to the map.
// Reuses: fetchMonsters + open5eToNPC from open5e.js
//         window.addNPCFromWizard() registered in app.js
//
// Architecture: filters UI is rendered ONCE on open; only #mb-results is
// replaced on each fetch so the search input never loses focus or listeners.

import { fetchMonsters, open5eToNPC, normaliseType, fetchSpellcastingSpellbook, parseSpellcastingDesc } from './open5e.js';
import { t } from './i18n.js';
import { translateIfHe, translateAllIfHe } from './translator.js';
import { tmt2mtUrl, tmt2mtAlternatives, tmt2mtThumbHtml } from './tmt.js';

// ── State ─────────────────────────────────────────────────────────────────────
let _search     = '';
let _crFilter   = 'all';
let _typeFilter = '';
let _debounce   = null;
let _results    = [];
let _spawned    = new Set();
let _fetchId    = 0;   // cancel stale fetches
let _isOpen     = false; // guard: skip fetch/render when modal is closed

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
  _isOpen     = true;
  _search     = '';
  _crFilter   = 'all';
  _typeFilter = '';
  _spawned    = new Set();
  _results    = [];
  _initUI();
  _fetchAndRender();
}

function closeMonsterBook() {
  _isOpen = false;
  clearTimeout(_debounce);
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
  if (!_isOpen) return;
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

    const thumb = tmt2mtThumbHtml(m.slug, type);
    return `
      <div style="display:flex; align-items:center; gap:10px; padding:8px 10px;
                  background:rgba(255,255,255,0.04); border-radius:8px; margin-bottom:5px;
                  border-left:3px solid ${col};">
        ${thumb}
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

async function _showCustomizeForm(slug) {
  const m = _results.find(r => r.slug === slug);
  if (!m) return;

  const type  = normaliseType(m.type);
  const col   = TYPE_COLOR[type] || '#c0392b';
  const stats = open5eToNPC(m);

  _selectedPortrait = tmt2mtUrl(slug, type)
    || `https://api.dicebear.com/8.x/adventurer/png?seed=${slug}`;

  const inputStyle = `
    width:100%; box-sizing:border-box; padding:5px 8px; border-radius:5px;
    background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2);
    color:white; font-size:12px; margin-top:3px; outline:none;
  `;
  const labelStyle = `font-size:11px; color:#aaa; display:block;`;

  // Render the skeleton form immediately so the user isn't waiting
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

      <!-- Lore / depiction placeholder — filled by async translation -->
      <div id="mb-lore-section" style="margin-bottom:10px;">
        ${m.desc ? `<div style="color:#555; font-size:11px; font-style:italic;">${t('loading') || 'טוען...'}</div>` : ''}
      </div>

      <!-- Portrait picker -->
      <div style="margin-bottom:10px;">
        <div style="font-size:11px; color:#aaa; margin-bottom:5px;">
          🖼️ ${t('mb_choose_portrait') || 'בחר דיוקן'}
        </div>
        <div id="mb-portrait-grid" style="display:flex; flex-wrap:wrap; gap:5px;">
          <div style="color:#666; font-size:11px; font-style:italic;">${t('loading') || 'טוען...'}</div>
        </div>
      </div>

      <!-- Editable fields — core combat -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
        <label style="${labelStyle}">${t('mb_name') || 'Name'}
          <input id="mb-c-name" value="${m.name.replace(/"/g, '&quot;')}" style="${inputStyle}">
        </label>
        <label style="${labelStyle}">${t('gender_label') || 'Gender'}
          <select id="mb-c-gender" style="${inputStyle}">
            <option value="male"${(stats.gender||'male')==='male'?' selected':''}>♂ Male</option>
            <option value="female"${(stats.gender||'')==='female'?' selected':''}>♀ Female</option>
            <option value="nonbinary"${(stats.gender||'')==='nonbinary'?' selected':''}>⚧ Non-binary</option>
          </select>
        </label>
        <label style="${labelStyle}">Size
          <select id="mb-c-size" style="${inputStyle}">
            <option value="Tiny"${stats.size==='Tiny'?' selected':''}>Tiny (½×½)</option>
            <option value="Small"${stats.size==='Small'?' selected':''}>Small (1×1)</option>
            <option value="Medium"${(!stats.size||stats.size==='Medium')?' selected':''}>Medium (1×1)</option>
            <option value="Large"${stats.size==='Large'?' selected':''}>Large (2×2)</option>
            <option value="Huge"${stats.size==='Huge'?' selected':''}>Huge (3×3)</option>
            <option value="Gargantuan"${stats.size==='Gargantuan'?' selected':''}>Gargantuan (4×4)</option>
          </select>
        </label>
        <label style="${labelStyle}">HP (Max)
          <input id="mb-c-hp" type="number" value="${stats.maxHp}" min="1" style="${inputStyle}">
        </label>
        <label style="${labelStyle}">AC
          <input id="mb-c-ac" type="number" value="${stats.ac}" min="1" style="${inputStyle}">
        </label>
        <label style="${labelStyle}">Speed (ft)
          <input id="mb-c-speed" type="number" value="${stats.speed}" min="0" style="${inputStyle}">
        </label>
        <label style="${labelStyle}">Melee Attack (+)
          <input id="mb-c-melee" type="number" value="${stats.melee}" style="${inputStyle}">
        </label>
        <label style="${labelStyle}">Melee Damage
          <input id="mb-c-meleeDmg" value="${stats.meleeDmg}" style="${inputStyle}">
        </label>
        <label style="${labelStyle}">Ranged Attack (+)
          <input id="mb-c-ranged" type="number" value="${stats.ranged}" style="${inputStyle}">
        </label>
        <label style="${labelStyle}">Ranged Damage
          <input id="mb-c-rangedDmg" value="${stats.rangedDmg}" style="${inputStyle}">
        </label>
      </div>

      <!-- Ability scores — 6-column micro-grid -->
      <div style="font-size:10px; font-weight:700; color:#888; margin-bottom:4px; letter-spacing:0.5px;">
        📊 ABILITY SCORES
      </div>
      <div style="display:grid; grid-template-columns:repeat(6,1fr); gap:5px; margin-bottom:8px;">
        ${['STR','DEX','CON','INT','WIS','CHA'].map((ab, i) => {
          const keys = ['_str','_dex','_con','_int','_wis','_cha'];
          const val  = stats[keys[i]] ?? 10;
          const mod  = Math.floor((val - 10) / 2);
          const sign = mod >= 0 ? '+' : '';
          return `<label style="text-align:center; font-size:10px; color:#aaa; display:block;">
            <div style="font-weight:700; color:#ddd; font-size:10px;">${ab}</div>
            <input id="mb-c-${keys[i]}" type="number" value="${val}" min="1" max="30"
              style="width:100%; box-sizing:border-box; padding:3px 2px; border-radius:5px; text-align:center;
                     background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2);
                     color:white; font-size:12px; margin-top:2px; outline:none;">
            <div style="font-size:9px; color:#888; margin-top:1px;">${sign}${mod}</div>
          </label>`;
        }).join('')}
      </div>

      <!-- Special abilities placeholder — filled by async translation -->
      <div id="mb-abilities-section" style="margin-bottom:8px;">
        ${m.special_abilities?.length ? `<div style="color:#555; font-size:11px; font-style:italic;">${t('loading') || 'טוען...'}</div>` : ''}
      </div>

      <!-- Actions placeholder -->
      <div id="mb-actions-section" style="margin-bottom:10px;"></div>

      <!-- Spellbook placeholder — filled async if monster is a spellcaster -->
      <div id="mb-spellbook-section"></div>

      <button id="mb-spawn-confirm"
        style="width:100%; padding:10px; border-radius:8px; font-size:13px; font-weight:700;
               cursor:pointer; border:1px solid ${col};
               background:rgba(${_hexToRgb(col)},0.25); color:#f1948a;">
        ➕ ${t('mb_spawn_confirm') || 'הוסף למפה'}
      </button>
    </div>
  `);

  document.getElementById('mb-back-btn').onclick = () => _renderResults(_buildList());

  // Live ability-modifier display update when any score is edited
  ['_str','_dex','_con','_int','_wis','_cha'].forEach(key => {
    const inp = document.getElementById(`mb-c-${key}`);
    if (!inp) return;
    inp.addEventListener('input', () => {
      const v   = parseInt(inp.value) || 10;
      const mod = Math.floor((v - 10) / 2);
      const modEl = inp.nextElementSibling;
      if (modEl) modEl.textContent = (mod >= 0 ? '+' : '') + mod;
    });
  });

  document.getElementById('mb-spawn-confirm').onclick = () => {
    const finalName = (document.getElementById('mb-c-name').value.trim()) || m.name;
    const _n = id => +(document.getElementById(id)?.value ?? 0);
    const _s = id => document.getElementById(id)?.value || '';
    // Read ability scores — update init bonus from edited DEX
    const newDex    = _n('mb-c-_dex') || 10;
    const initBonus = Math.floor((newDex - 10) / 2);
    const overrides = {
      gender:   document.getElementById('mb-c-gender')?.value || 'male',
      size:     document.getElementById('mb-c-size')?.value   || stats.size || 'Medium',
      maxHp:    _n('mb-c-hp')       || stats.maxHp,
      hp:       _n('mb-c-hp')       || stats.hp,
      ac:       _n('mb-c-ac')       || stats.ac,
      speed:    _n('mb-c-speed'),
      melee:    _n('mb-c-melee'),
      meleeDmg: _s('mb-c-meleeDmg')    || stats.meleeDmg,
      ranged:   _n('mb-c-ranged'),
      rangedDmg:_s('mb-c-rangedDmg')   || stats.rangedDmg,
      _str:     _n('mb-c-_str')     || stats._str,
      _dex:     newDex,
      _con:     _n('mb-c-_con')     || stats._con,
      _int:     _n('mb-c-_int')     || stats._int,
      _wis:     _n('mb-c-_wis')     || stats._wis,
      _cha:     _n('mb-c-_cha')     || stats._cha,
      initBonus,
    };
    _doSpawn(m, finalName, { ...stats, ...overrides }, col, initBonus);
  };

  // Run translations + portrait load in parallel — all non-blocking
  _loadPortraitPicker(slug, m.name, type);
  _loadLoreSection(m, col);
  _loadAbilitiesSection(m, col);
  _loadSpellbookSection(m, stats, col);
}

// ── Async lore & abilities loaders ────────────────────────────────────────────

async function _loadLoreSection(m, col) {
  const el = document.getElementById('mb-lore-section');
  if (!el || !m.desc) return;

  const lore = await translateIfHe(m.desc);
  if (!document.getElementById('mb-lore-section')) return; // user navigated away

  el.innerHTML = `
    <div style="padding:8px 10px; background:rgba(255,255,255,0.03); border-radius:6px;
                border-left:3px solid ${col}; margin-bottom:4px;">
      <div style="font-size:10px; font-weight:700; color:#888; margin-bottom:4px; letter-spacing:0.5px;">
        ${t('mb_lore') || '📜 רקע ותיאור'}
      </div>
      <div style="font-size:11px; color:#bbb; line-height:1.55; max-height:100px; overflow-y:auto;">
        ${lore}
      </div>
    </div>
  `;
}

async function _loadAbilitiesSection(m, col) {
  const abEl = document.getElementById('mb-abilities-section');
  const acEl = document.getElementById('mb-actions-section');

  // Translate special abilities
  if (abEl && m.special_abilities?.length) {
    const abilities = m.special_abilities.slice(0, 5);
    const descs     = await translateAllIfHe(abilities.map(a => a.desc || ''));
    if (!document.getElementById('mb-abilities-section')) return;

    abEl.innerHTML = `
      <div style="font-size:10px; font-weight:700; color:#888; margin-bottom:4px; letter-spacing:0.5px;">
        ✨ ${t('mb_abilities') || 'יכולות מיוחדות'}
      </div>
      ${abilities.map((a, i) => `
        <div style="margin-bottom:5px; padding:5px 8px; background:rgba(255,255,255,0.03);
                    border-radius:5px; border-left:2px solid ${col}88;">
          <div style="font-size:11px; font-weight:700; color:#ddd;">${a.name}</div>
          ${descs[i] ? `<div style="font-size:10px; color:#888; margin-top:2px; line-height:1.4;">${descs[i]}</div>` : ''}
        </div>
      `).join('')}
      ${m.special_abilities.length > 5 ? `<div style="font-size:10px; color:#555; padding:2px 8px;">+${m.special_abilities.length - 5} more…</div>` : ''}
    `;
  }

  // Translate main actions
  if (acEl && m.actions?.length) {
    const actions = m.actions.slice(0, 4);
    const descs   = await translateAllIfHe(actions.map(a => a.desc || ''));
    if (!document.getElementById('mb-actions-section')) return;

    acEl.innerHTML = `
      <div style="font-size:10px; font-weight:700; color:#888; margin-bottom:4px; letter-spacing:0.5px;">
        ⚔️ ${t('mb_actions') || 'פעולות'}
      </div>
      ${actions.map((a, i) => `
        <div style="margin-bottom:5px; padding:5px 8px; background:rgba(255,255,255,0.03);
                    border-radius:5px; border-left:2px solid #e74c3c55;">
          <div style="font-size:11px; font-weight:700; color:#ddd;">
            ${a.name}${a.attack_bonus != null ? ` <span style="color:#f1948a; font-weight:400;">(+${a.attack_bonus})</span>` : ''}
            ${a.damage_dice ? ` <span style="color:#aaa; font-size:10px;">${a.damage_dice}</span>` : ''}
          </div>
          ${descs[i] ? `<div style="font-size:10px; color:#888; margin-top:2px; line-height:1.4;">${descs[i]}</div>` : ''}
        </div>
      `).join('')}
    `;
  }
}

async function _loadSpellbookSection(m, stats, col) {
  const el = document.getElementById('mb-spellbook-section');
  if (!el) return;

  // Quick check — does this monster even have a spellcasting ability?
  const parsed = parseSpellcastingDesc(m.special_abilities);
  if (!parsed.found) return;

  const spellCount = Object.values(parsed.spellsByLevel).reduce((n, arr) => n + arr.length, 0);
  el.innerHTML = `<div style="font-size:11px; color:#9b59b6; padding:6px 0; font-style:italic;">🔮 Loading ${spellCount} spells…</div>`;

  const spellbook = await fetchSpellcastingSpellbook(m.special_abilities);
  if (!document.getElementById('mb-spellbook-section')) return; // user navigated away

  const count = Object.keys(spellbook).length;
  // Mutate stats in place — the spawn button's closure captures the same object
  stats.spellbook = spellbook;

  if (count === 0) { el.innerHTML = ''; return; }

  const SCHOOL_COLOR = { Evocation:'#e74c3c', Necromancy:'#8e44ad', Illusion:'#2980b9',
    Conjuration:'#27ae60', Transmutation:'#e67e22', Divination:'#f39c12',
    Enchantment:'#e91e8c', Abjuration:'#1abc9c' };

  el.innerHTML = `
    <div style="margin-bottom:10px; padding:8px; background:rgba(155,89,182,0.08);
                border-radius:6px; border:1px solid rgba(155,89,182,0.25);">
      <div style="font-size:10px; font-weight:700; color:#9b59b6; margin-bottom:6px; letter-spacing:0.5px;">
        🔮 Spellbook (${count} spells loaded)
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:3px;">
        ${Object.values(spellbook).sort((a,b)=>(a.level||0)-(b.level||0)).map(sp => {
          const sc = SCHOOL_COLOR[sp.school] || '#888';
          return `<span style="font-size:10px; padding:1px 6px; border-radius:10px;
            background:${sc}22; border:1px solid ${sc}55; color:#ddd;"
            title="Lv${sp.level} ${sp.school}">
            ${sp.level === 0 ? 'C' : sp.level} ${sp.name}
          </span>`;
        }).join('')}
      </div>
    </div>
  `;
}

async function _loadPortraitPicker(slug, name, type) {
  const grid = document.getElementById('mb-portrait-grid');
  if (!grid) return;

  // ── 1. Show 2MT tokens immediately (no network wait) ─────────────────────
  const tmtOptions = tmt2mtAlternatives(slug, type);
  const tmtHtml = tmtOptions.length
    ? tmtOptions.map(({ url }) =>
        `<img src="${url}" data-src="${url}"
          class="mb-portrait-opt"
          style="width:54px;height:54px;border-radius:50%;object-fit:cover;cursor:pointer;
                 border:2px solid ${url === _selectedPortrait ? '#f1c40f' : 'transparent'};
                 transition:border-color 0.15s;"
          onerror="this.parentElement && (this.style.display='none')" loading="lazy">`
      ).join('')
    : '';

  grid.innerHTML = tmtHtml
    || `<span style="color:#666;font-size:11px;">${t('loading') || 'טוען...'}</span>`;

  _wirePortraitClicks(grid);

}

function _wirePortraitClicks(grid) {
  grid.querySelectorAll('.mb-portrait-opt').forEach(el => {
    el.onclick = () => {
      grid.querySelectorAll('.mb-portrait-opt').forEach(i => i.style.border = '2px solid transparent');
      el.style.border = '2px solid #f1c40f';
      _selectedPortrait = el.dataset.src;
      const prev = document.getElementById('mb-portrait-preview');
      if (prev) prev.src = _selectedPortrait;
    };
  });
}

// ── Spawn ─────────────────────────────────────────────────────────────────────

function _doSpawn(m, finalName, stats, col, initBonus) {
  // Deduplicate name if already spawned
  let name = finalName;
  let idx  = 2;
  while (_spawned.has(name)) { name = `${finalName} ${idx++}`; }
  _spawned.add(name);

  // initBonus from caller (may reflect edited DEX); fall back to raw monster DEX
  if (initBonus == null) initBonus = Math.floor(((m.dexterity || 10) - 10) / 2);
  const init = Math.floor(Math.random() * 20) + 1 + initBonus;
  const portrait  = _selectedPortrait ||
    `https://api.dicebear.com/8.x/adventurer/png?seed=${m.slug}`;

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
