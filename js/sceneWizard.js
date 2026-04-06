// js/sceneWizard.js — Scene Wizard v129 + Wave 1 (E1-B: Open5e monster gallery)
import { iconImg } from './iconMap.js';
import { escapeJSString } from './core/sanitize.js';
// 6-step guided scene creation for ParaDice DM.
//
// FIXES v129 (Sprint SC):
//   SC-1: Monster/NPC picker panel in Step 2 (search, CR filter, type chips)
//   SC-2: Spawned monsters write full statblock into Firebase via addNPCFromWizard()
//   SC-2: Monster tokens use type-colour ring (red/green/purple/blue per type)
//   SC-2: HP bar on tokens via existing maxHp system (no new infra needed)
// W1/E1-B: Open5e API replaces local 28-monster list
//   — 450+ SRD monsters, skeleton loading, CR slider, type chips, search debounce
// =====================================================================
import { MapEngine } from './mapEngine.js';
import { TMT_MAPS, TMT_MAP_TAGS } from './tmtMaps.js';
import { VideoLayer } from './videoLayer.js';
import { t, getLang } from './i18n.js';
import { npcDatabase, parseCR, typeColor } from './monsters.js';
import { fetchMonsters, open5eToNPC, normaliseType } from './open5e.js';
import { generateDungeon, tilesToObstacleGrid, seedFromRoomCode } from './dungeonGenerator.js'; // E3-E
import { TileEngine, AUTO_THEME } from './tileEngine.js'; // E4-B
import { printHandout, openWatabou } from './handout.js'; // E7

// ── Image helpers ──────────────────────────────────────────────────────────────
/** Convert a base64 data URL to a 300px wide JPEG thumbnail (base64 data URL) */
async function _makeThumbnail(dataUrl, maxW = 300) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

export class SceneWizard {
  constructor(opts = {}) {
    this.uid        = opts.uid  || null;
    this.cName      = opts.cName || 'DM';
    this.activeRoom = opts.activeRoom || 'public';
    this._roomCode  = opts.roomCode  || opts.activeRoom || ''; // E7
    this.db         = opts.db   || null;
    this.onSaved    = opts.onSaved  || null;
    this.onGoLive   = opts.onGoLive || null;
    this.players    = opts.players  || {};

    this._step   = 0;
    this._engine = null;
    // SC: monster picker filter state
    this._monSearch   = '';
    this._monCRFilter = 'all';
    this._monTypes    = new Set();   // empty = show all types
    this._spawnedNPCs = [];          // [{key, name, uid}] — tracked for save step
    this._dungeonGenerated = false;  // E3-E: true after Quick Dungeon generate
    this._selectedTile     = 'floor'; // E4-B: active tile in tile painter
    this._tileEngine       = null;    // E4-B: shared TileEngine instance
    this._dungeonInfo      = '';     // E3-E: e.g. "M Dungeon — 8 rooms"
    this._dungeonData      = null;   // E3-E: last generateDungeon() result
    // E1-B: Open5e state
    this._o5eResults  = null;        // cached page of Open5e results
    this._o5eLoading  = false;
    this._o5eTotal    = 0;
    this._o5ePage     = 1;
    this._o5eDebounce = null;
    this._o5eMonMap   = {};          // slug → open5e monster object

    this._data = {
      _id: null,
      name: '',
      bgUrl: '',
      bgVideoUrl: '',  // YouTube animated background URL
      bgBase64: '',   // SA-1: persisted base64 image (survives reload)
      bgThumb: '',    // SA-1: 300px JPEG thumbnail for gallery cards
      _bgBlob: null,  // local blob URL (legacy, kept for URL-load path)
      config: { pps: 64, ox: 0, oy: 0, locked: false, mapW: 30, mapH: 20 },
      atmosphere: { weather: 'none', ambientLight: 'bright', globalDarkvision: 0 },
      fog: {}, obstacles: {}, triggers: {},
      createdAt: null,
    };

    this._modal      = document.getElementById('scene-wizard-modal');
    this._cvWrap     = document.getElementById('wizard-canvas-wrap');
    this._cv         = document.getElementById('wizard-canvas');
    this._fow        = document.getElementById('wizard-fow-canvas');
    this._leftPanel  = document.getElementById('wizard-left-panel');
    this._rightPanel = document.getElementById('wizard-right-panel');
    this._bound      = { resize: this._onResize.bind(this) };
  }

  // ── Public ────────────────────────────────────────────────────────────
  open(existingData = null) {
    if (existingData) {
      this._data = JSON.parse(JSON.stringify(existingData));
    } else {
      this._data = {
        _id: null, name: '', bgUrl: '', bgVideoUrl: '',
        bgBase64: '', bgThumb: '',   // SA-1
        _bgBlob: null,
        config: { pps: 64, ox: 0, oy: 0, locked: false, mapW: 30, mapH: 20 },
        atmosphere: { weather: 'none', ambientLight: 'bright', globalDarkvision: 0 },
        fog: {}, obstacles: {}, triggers: {}, createdAt: null,
      };
    }
    this._step = 0;
    // E4-B: init TileEngine shared instance
    if(!this._tileEngine){
      this._tileEngine = new TileEngine();
      this._tileEngine.load().catch(e => console.warn('Wizard TileEngine:', e));
    }
    // Share tileEngine with mapEngine
    if(this._engine) this._engine.tileEngine = this._tileEngine;
    this._modal.classList.add('wiz-open');   // SA-3: single class toggle
    this._modal.dir = getLang() === 'he' ? 'rtl' : 'ltr';
    // SB-2: keyboard navigation
    this._boundKey = this._onKey.bind(this);
    window.addEventListener('keydown', this._boundKey);
    window.addEventListener('resize', this._bound.resize);
    // Wait one frame so the modal is painted before measuring canvas dimensions
    requestAnimationFrame(() => {
      this._initEngine();
      this._render();
    });
  }

  close() {
    this._modal.classList.remove('wiz-open');   // SA-3: single class toggle
    window.removeEventListener('resize', this._bound.resize);
    window.removeEventListener('keydown', this._boundKey);   // SB-2
    if (this._engine) { this._engine.destroy(); this._engine = null; }
    window._wizard = null;
    window._wizEng = null;
  }

  // SB-2: direct step jump (used by pill bar clicks)
  goTo(n) {
    this._syncFromEngine();
    if (n >= 0 && n <= 5) { this._step = n; this._render(); }
  }

  // SB-2: keyboard navigation
  _onKey(e) {
    if (!this._modal.classList.contains('wiz-open')) return;
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); this.next(); }
    else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); this.back(); }
    else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
  }

  // ── Engine (localOnly — no Firebase, paints directly to S state) ─────
  _initEngine() {
    if (this._engine) this._engine.destroy();
    this._onResize();
    this._engine = new MapEngine(this._cv, this._fow, {
      cName: this.cName, userRole: 'dm', activeRoom: this.activeRoom,
      localOnly: true,
    });
    const d = this._data;
    this._engine.S.cfg       = { ...this._engine.S.cfg, ...d.config };
    this._engine.S.obstacles = { ...d.obstacles };
    this._engine.S.triggers  = { ...d.triggers };
    this._engine.S.fog       = { ...d.fog };
    this._engine.setPlayers(this.players);
    const bgSrc = d.bgBase64 || d._bgBlob || d.bgUrl;   // SA-1: base64 wins
    if (bgSrc) {
      this._engine._loadBg(bgSrc);
    } else if (d.bgVideoUrl) {
      // No static image — load YouTube thumbnail as canvas background so obstacles can be painted
      const ytId = VideoLayer.parseVideoId(d.bgVideoUrl);
      if (ytId) this._engine._loadBg(`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`);
    }
    if (d.bgVideoUrl) {
      // Init video layer using wizard canvas wrap, then load
      const wrap = document.getElementById('wizard-canvas-wrap');
      if (wrap) this._engine.initVideo(wrap);
      this._engine.loadBgVideo(d.bgVideoUrl);
    }
    if (d.atmosphere) this._engine.setAtmosphere(d.atmosphere);
    this._engine._dirty();
    window._wizard = this;
    window._wizEng = this._engine;
  }

  _onResize() {
    const wrap = this._cvWrap;
    if (!wrap) return;
    const w = wrap.clientWidth  || 800;
    const h = wrap.clientHeight || 500;
    this._cv.width   = w; this._cv.height  = h;
    this._fow.width  = w; this._fow.height = h;
    this._engine?.resize(w, h);
  }

  _syncFromEngine() {
    if (!this._engine) return;
    this._data.config    = { ...this._engine.S.cfg };
    // Use phantom grid dimensions if available (computed from bg image, not mutated in S.cfg)
    if (this._engine.L._phantomCols != null) this._data.config.mapW = this._engine.L._phantomCols;
    if (this._engine.L._phantomRows != null) this._data.config.mapH = this._engine.L._phantomRows;
    this._data.obstacles = { ...this._engine.S.obstacles };
    this._data.triggers  = { ...this._engine.S.triggers };
    this._data.fog       = { ...this._engine.S.fog };
  }

  // ── Step navigation ───────────────────────────────────────────────────
  next() { this._syncFromEngine(); if (this._step < 5) { this._step++; this._render(); } }
  back() { this._syncFromEngine(); if (this._step > 0) { this._step--; this._render(); } }

  // ── Render ────────────────────────────────────────────────────────────
  _render() {
    const ICONS  = [iconImg('🖼️','16px'),iconImg('🔲','16px'),iconImg('⚔️','16px'),iconImg('🌩','16px'),iconImg('🌑','16px'),iconImg('💾','16px')];
    const LABELS = ['Image','Grid','World','Vibe','Fog','Save'];
    const TITLES = ['wiz_t0','wiz_t1','wiz_t2','wiz_t4','wiz_t3','wiz_t5'];
    const SUBS   = ['wiz_s0','wiz_s1','wiz_s2','wiz_s4','wiz_s3','wiz_s5'];

    // SB-2: Update pill bar instead of dots
    document.querySelectorAll('.wiz-pill').forEach((pill, i) => {
      pill.classList.toggle('active', i === this._step);
      pill.classList.toggle('done',   i < this._step);
    });

    document.getElementById('wiz-step-title').innerHTML = `${ICONS[this._step]}  ${t(TITLES[this._step])}`;
    document.getElementById('wiz-step-sub').textContent   = t(SUBS[this._step]);
    this._modal.dir = getLang() === 'he' ? 'rtl' : 'ltr';

    const isLast = this._step === 5;
    document.getElementById('wiz-back-btn').style.visibility = this._step === 0 ? 'hidden' : 'visible';
    document.getElementById('wiz-next-btn').style.display    = isLast ? 'none' : 'inline-flex';
    document.getElementById('wiz-save-row').style.display    = isLast ? 'flex' : 'none';

    this._leftPanel.innerHTML  = this._buildLeft();
    this._rightPanel.innerHTML = this._buildRight();
    this._wireStep();

    // Engine mode per step
    const modes = ['view', 'phantom', 'obstacle', 'view', 'wizFog', 'view'];
    this._engine?.setMode(modes[this._step] || 'view');
    // E1-B: auto-fetch when step 2 is rendered and no results yet
    if (this._step === 2 && this._o5eResults === null && !this._o5eLoading) {
      this._o5eFetch();
    }
  }

  // ── Left Panel HTML ───────────────────────────────────────────────────
  _buildLeft() {
    const cfg = this._data.config;
    const atm = this._data.atmosphere;
    switch (this._step) {

      // ──── Step 0: Image only ─────────────────────────────────────────
      case 0: {
        const isVideo   = !!this._data.bgVideoUrl;
        const ytId      = isVideo ? VideoLayer.parseVideoId(this._data.bgVideoUrl) : null;
        const hasStatic = !!(this._data.bgBase64 || this._data.bgUrl || this._data._bgBlob);
        return `
        <!-- Background type toggle -->
        <div class="wiz-section">${t('wiz_l0_image')}</div>
        <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;color:#ccc;padding:5px 9px;border-radius:8px;border:1px solid ${!isVideo?'rgba(241,196,15,0.55)':'rgba(255,255,255,0.12)'};background:${!isVideo?'rgba(241,196,15,0.08)':'transparent'};">
            <input type="radio" name="wiz-bg-type" value="static" ${!isVideo?'checked':''} style="accent-color:#f1c40f;"> 🖼 Static Image
          </label>
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;color:#ccc;padding:5px 9px;border-radius:8px;border:1px solid ${isVideo?'rgba(241,196,15,0.55)':'rgba(255,255,255,0.12)'};background:${isVideo?'rgba(241,196,15,0.08)':'transparent'};">
            <input type="radio" name="wiz-bg-type" value="video" ${isVideo?'checked':''} style="accent-color:#f1c40f;"> 🎬 Animated (YouTube)
          </label>
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;color:#ccc;padding:5px 9px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:transparent;" id="wiz-tmt-label">
            <input type="radio" name="wiz-bg-type" value="tmt" style="accent-color:#f1c40f;"> 🗺️ 2MT Maps
          </label>
        </div>

        <!-- Static image panel -->
        <div id="wiz-static-bg-panel" style="display:${isVideo?'none':'block'};">
          <input id="wiz-bg-url" class="wiz-input" type="url"
            placeholder="${t('wiz_l0_url_ph')}"
            value="${this._data.bgUrl||''}">
          <button id="wiz-bg-load" class="wiz-btn gold">🖼 ${t('wiz_l0_load_url')}</button>
          <div class="wiz-divider">${t('wiz_or')}</div>
          <label class="wiz-file-label" style="cursor:pointer;">
            📂 ${t('wiz_l0_upload')}
            <input id="wiz-bg-file" type="file" accept="image/*" style="display:none">
          </label>
          ${hasStatic ? `
            <div class="wiz-ok-badge">✓ ${t('wiz_l0_loaded')}</div>
            ${this._data.bgThumb ? `<img src="${this._data.bgThumb}" style="width:100%;max-height:100px;object-fit:cover;border-radius:6px;margin-top:8px;border:1px solid rgba(241,196,15,0.3);">` : ''}
          ` : ''}
          <div class="wiz-tip" style="margin-top:12px;">${t('wiz_l0_tip')}</div>
        </div>

        <!-- YouTube animated map panel -->
        <div id="wiz-video-bg-panel" style="display:${isVideo?'block':'none'};">
          <div style="color:#aaa;font-size:11px;margin-bottom:6px;">Paste a YouTube URL to use an animated battle map as your scene background.</div>
          <input id="wiz-yt-url" class="wiz-input" type="url" dir="ltr"
            placeholder="https://www.youtube.com/watch?v=…"
            value="${this._data.bgVideoUrl||''}">
          <button id="wiz-yt-load" class="wiz-btn gold" style="margin-top:5px;">▶ Load &amp; Preview</button>
          ${isVideo && ytId ? `
            <div class="wiz-ok-badge" style="margin-top:8px;">✓ YouTube video set</div>
            <img src="https://img.youtube.com/vi/${ytId}/mqdefault.jpg"
              style="width:100%;border-radius:6px;margin-top:6px;border:1px solid rgba(241,196,15,0.3);"
              onerror="this.style.display='none'" alt="Video thumbnail">
          ` : ''}
          <div class="wiz-tip" style="margin-top:10px;">Video autoplays muted &amp; loops for all players in real time. Works best with ambient animated battle map loops from YouTube.</div>
        </div>

        <!-- 2MT Battle Map Gallery panel -->
        <div id="wiz-tmt-maps-panel" style="display:none;">
          <div style="color:#aaa;font-size:11px;margin-bottom:8px;">Browse free CC0 battle maps by <a href="https://2minutetabletop.com" target="_blank" style="color:#f1c40f;text-decoration:none;">2-Minute Tabletop</a>. Click a map to use it as your scene background.</div>
          <div id="wiz-tmt-tag-row" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">
            ${TMT_MAP_TAGS.map(tag => `<button class="wiz-type-chip ${tag==='all'?'active':''}" data-tmt-tag="${tag}" style="${tag==='all'?'background:rgba(241,196,15,0.15);border-color:#f1c40f;color:#f1c40f;':''}">${tag}</button>`).join('')}
          </div>
          <div id="wiz-tmt-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:320px;overflow-y:auto;padding-right:2px;">
            ${TMT_MAPS.map(m => `
              <div class="wiz-tmt-card" data-slug="${m.slug}" data-full="${m.full}" data-tags="${m.tags.join(',')}"
                title="${m.name} (${m.w}×${m.h} tiles)"
                style="cursor:pointer;border-radius:7px;overflow:hidden;border:2px solid transparent;position:relative;transition:border-color 0.15s;">
                <img src="${m.thumb}" loading="lazy" alt="${m.name}"
                  style="width:100%;aspect-ratio:1;object-fit:cover;display:block;"
                  onerror="this.closest('.wiz-tmt-card').style.display='none'">
                <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,0.75));padding:4px 5px;font-size:9px;color:#eee;line-height:1.2;">${m.name}</div>
              </div>`).join('')}
          </div>
        </div>

        <!-- Quick dungeon generator (available for both bg types) -->
        <div class="wiz-divider" style="margin-top:16px;">${t('wiz_or')}</div>
        <div class="wiz-section">🗺 ${t('wiz_quick_dungeon')}</div>
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <select id="wiz-dng-size" class="wiz-input" style="flex:1;">
            <option value="S">S (24×16)</option>
            <option value="M" selected>M (36×24)</option>
            <option value="L">L (48×32)</option>
          </select>
          <select id="wiz-dng-style" class="wiz-input" style="flex:1;">
            <option value="dungeon" selected>⛏ ${t('wiz_dng_dungeon')}</option>
            <option value="cave">🌿 ${t('wiz_dng_cave')}</option>
            <option value="fort">🏰 ${t('wiz_dng_fort')}</option>
          </select>
        </div>
        <button id="wiz-gen-dungeon" class="wiz-btn" style="background:rgba(155,89,182,0.25);border-color:#9b59b6;color:#d7bde2;">
          🎲 ${t('wiz_gen_dungeon_btn')}
        </button>
        ${this._dungeonGenerated ? `<div class="wiz-ok-badge" style="margin-top:6px;">✓ ${t('wiz_dungeon_ready')} — ${this._dungeonInfo||''}</div>` : ''}
        `; }

      // ──── Step 1: Phantom grid calibration ───────────────────────────
      case 1: return `
        <div class="wiz-section">${t('wiz_l1_sq_size')}</div>
        <div class="wiz-pps-row">
          <button class="wiz-big-btn" id="wiz-pps-m">−</button>
          <span id="wiz-pps-val" class="wiz-pps-val">${cfg.pps}<small>px</small></span>
          <button class="wiz-big-btn" id="wiz-pps-p">+</button>
        </div>
        <div id="wiz-tile-count" class="wiz-tile-count" style="text-align:center;margin-top:6px;font-size:12px;color:#6ef29a;font-weight:700;letter-spacing:0.5px;">
          &nbsp;
        </div>
        <div class="wiz-tip" style="margin-top:4px;text-align:center;">${t('wiz_l1_sq_tip')}</div>

        <div class="wiz-section" style="margin-top:14px;">${t('wiz_l1_nudge')}</div>
        <div class="wiz-nudge-grid">
          <div></div>
          <button class="wiz-tiny-btn" id="wiz-oy-m">↑</button>
          <div></div>
          <button class="wiz-tiny-btn" id="wiz-ox-m">←</button>
          <span class="wiz-nudge-c">${t('wiz_l1_nudge_lbl')}</span>
          <button class="wiz-tiny-btn" id="wiz-ox-p">→</button>
          <div></div>
          <button class="wiz-tiny-btn" id="wiz-oy-p">↓</button>
          <div></div>
        </div>

        <button id="wiz-approve-grid" class="wiz-btn wiz-approve-btn" style="margin-top:16px;">
          ${cfg.locked ? '✓ '+t('wiz_l1_approved') : '✓ '+t('wiz_l1_approve')}
        </button>`;

      // ──── Step 2: Build world + Open5e Monster Gallery (E1-B) ─────
      case 2: {
        const typeList = ['Humanoid','Undead','Beast','Fiend','Dragon','Aberration','Giant',
                          'Celestial','Elemental','Fey','Construct','Ooze','Plant'];
        const spawnedCounts = {};
        this._spawnedNPCs.forEach(s => { spawnedCounts[s.key] = (spawnedCounts[s.key]||0) + 1; });
        const crLabels = { all:'All CR', low:'CR ½', med:'CR 1–4', high:'CR 5–10', epic:'CR 11+' };

        // Build monster rows HTML
        let monstersHTML = '';
        if (this._o5eLoading) {
          monstersHTML = Array(6).fill(0).map(() => `
            <div class="wiz-monster-row wiz-skeleton">
              <div class="wiz-skel-icon"></div>
              <div class="wiz-mon-info">
                <div class="wiz-skel-name"></div>
                <div class="wiz-skel-meta"></div>
              </div>
            </div>`).join('');
        } else if (this._o5eResults && this._o5eResults.length > 0) {
          monstersHTML = this._o5eResults.map(m => {
            const type  = normaliseType(m.type);
            const col   = typeColor[type] || '#888';
            const cr    = m.challenge_rating || '?';
            const hp    = m.hit_points || '?';
            const count = spawnedCounts[m.slug] || 0;
            return `
              <div class="wiz-monster-row" data-slug="${m.slug}" data-o5e="1">
                <span class="wiz-mon-type-dot" style="background:${col};width:8px;height:8px;border-radius:50%;flex-shrink:0;"></span>
                <div class="wiz-mon-info">
                  <span class="wiz-mon-name">${m.name}</span>
                  <span class="wiz-mon-meta">CR ${cr} · ${type} · ${hp}hp</span>
                </div>
                ${count > 0 ? `<span class="wiz-mon-count">${count}</span>` : ''}
                <button class="wiz-mon-info-btn" data-slug="${m.slug}" data-o5e="1" title="View stat block" style="background:none;border:1px solid #555;border-radius:4px;color:#aaa;font-size:11px;cursor:pointer;padding:3px 6px;margin-right:2px;">📖</button>
                <button class="wiz-mon-spawn-btn" data-slug="${m.slug}" data-o5e="1" title="Spawn on map">+</button>
              </div>`;
          }).join('');
          if (this._o5eTotal > this._o5eResults.length) {
            monstersHTML += `<div class="wiz-mon-more">${t('wiz_showing_of').replace('{shown}', this._o5eResults.length).replace('{total}', this._o5eTotal)}</div>`;
          }
        } else if (this._o5eResults !== null) {
          monstersHTML = `<div style="font-size:10px;color:#555;text-align:center;padding:8px;">${t('wiz_no_monsters_match')}</div>`;
        } else {
          // Initial — show local fallback while fetching
          monstersHTML = Object.entries(npcDatabase).slice(0, 6).map(([key, m]) => {
            const col = typeColor[m.type] || '#888';
            return `
              <div class="wiz-monster-row" data-key="${key}">
                <span class="wiz-mon-type-dot" style="background:${col};width:8px;height:8px;border-radius:50%;flex-shrink:0;"></span>
                <div class="wiz-mon-info">
                  <span class="wiz-mon-name">${key}</span>
                  <span class="wiz-mon-meta">CR ${m.cr} · ${m.type} · ${m.hp}hp</span>
                </div>
                <button class="wiz-mon-spawn-btn" data-key="${key}" title="Spawn on map">+</button>
              </div>`;
          }).join('') + `<div class="wiz-mon-more" style="color:#f1c40f;">${t('wiz_loading_srd')}</div>`;
        }

        return `
          <div class="wiz-section">${t('wiz_l2_tool')}</div>
          <div class="wiz-tool-grid">
            <button class="wiz-tool-btn" id="wt-obs"  data-mode="obstacle">${iconImg('🧱','14px')} ${t('wiz_l2_obstacle')}</button>
            <button class="wiz-tool-btn" id="wt-trig" data-mode="trigger">⚠️ ${t('wiz_l2_trap')}</button>
            <button class="wiz-tool-btn" id="wt-view" data-mode="view">👆 ${t('wiz_l2_select')}</button>
            <button class="wiz-tool-btn" id="wt-ruler" data-mode="ruler">📏 ${t('wiz_l2_ruler')}</button>
          </div>
          <div style="display:flex;gap:4px;margin-top:5px;">
            <button class="wiz-tool-btn active" id="wt-paint" data-tool="paint" style="flex:1;">🖌 ${t('wiz_l2_paint')}</button>
            <button class="wiz-tool-btn" id="wt-erase" data-tool="erase" style="flex:1;">🧹 ${t('wiz_l2_erase')}</button>
          </div>

          <div class="wiz-section" style="margin-top:12px;">🗺 ${t('wiz_tile_painter')}</div>
          <div id="wiz-tile-picker" style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;">
            ${Object.entries(TileEngine.tileGroups).map(([grp, keys]) => `
              <div style="width:100%;font-size:9px;color:#888;margin-top:4px;">${grp}</div>
              ${keys.map(k => `
                <button class="wiz-tile-btn ${this._selectedTile===k?'active':''}" data-tile="${k}"
                  title="${k}"
                  style="${this._selectedTile===k?'border-color:#f1c40f;background:rgba(241,196,15,0.2);':''}font-size:9px;padding:3px 5px;">
                  ${k.replace(/_/g,' ')}
                </button>`).join('')}
            `).join('')}
          </div>

          <div class="wiz-section" style="margin-top:12px;">⚔️ MONSTERS
            <span style="font-size:9px;color:#888;font-weight:400;">${this._o5eTotal ? `· ${this._o5eTotal} SRD` : ''}</span>
          </div>

          <input id="wiz-mon-search" class="wiz-input" placeholder="🔍 Search 450+ SRD monsters…"
            value="${this._monSearch}" style="margin-top:5px;font-size:11px;padding:5px 7px;">

          <div class="wiz-cr-filter">
            ${['all','low','med','high','epic'].map(r => `
              <button class="wiz-cr-btn ${this._monCRFilter===r?'active':''}" data-cr="${r}">
                ${crLabels[r]}
              </button>`).join('')}
          </div>

          <div class="wiz-type-chips">
            ${typeList.map(type => {
              const col    = typeColor[type] || '#888';
              const active = this._monTypes.has(type);
              return `<button class="wiz-type-chip ${active?'active':''}" data-type="${type}"
                style="${active?`background:${col}22;border-color:${col};color:${col}`:''}">
                ${type}</button>`;
            }).join('')}
          </div>

          <div id="wiz-monster-list" class="wiz-monster-list">${monstersHTML}</div>

          <div class="wiz-section" style="margin-top:8px;">${t('wiz_l2_tokens')}</div>
          <div id="wiz-token-list" style="display:flex;flex-direction:column;gap:3px;margin-top:4px;">
            ${Object.entries(this.players).filter(([,p])=>p.userRole!=='dm').map(([cn,p])=>`
              <div class="wiz-token-row">
                <img src="${p.portrait||'assets/logo.webp'}"
                  style="width:20px;height:20px;border-radius:50%;border:2px solid ${p.pColor||'#fff'};flex-shrink:0;">
                <span style="flex:1;font-size:10px;color:#ddd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cn}</span>
                <button onclick="window._wizard?.startPlacing('${escapeJSString(cn)}')" class="wiz-tiny-btn" title="Place on map">📍</button>
              </div>
            `).join('') || `<div style="font-size:10px;color:#555;">${t('wiz_l2_no_players')}</div>`}
          </div>`;
      }

      // ──── Step 3: Atmosphere (FOW toggle + vision rules — set BEFORE painting fog) ──
      case 3: return `
        <div class="wiz-section">${t('wiz_l4_weather')}</div>
        <select id="wiz-weather" class="wiz-select">
          <option value="none"       ${atm.weather==='none'?'selected':''}>☀️ ${t('wiz_w_clear')}</option>
          <option value="light_rain" ${atm.weather==='light_rain'?'selected':''}>🌦 ${t('wiz_w_rain')}</option>
          <option value="heavy_rain" ${atm.weather==='heavy_rain'?'selected':''}>${iconImg('⛈','12px')} ${t('wiz_w_hrain')}</option>
          <option value="fog"        ${atm.weather==='fog'?'selected':''}>${iconImg('🌫','12px')} ${t('wiz_w_fog')}</option>
          <option value="blizzard"   ${atm.weather==='blizzard'?'selected':''}>❄️ ${t('wiz_w_bliz')}</option>
          <option value="sandstorm"  ${atm.weather==='sandstorm'?'selected':''}>🌪 ${t('wiz_w_sand')}</option>
          <option value="darkness"   ${atm.weather==='darkness'?'selected':''}>🌑 ${t('wiz_w_dark')}</option>
        </select>
        <div class="wiz-section" style="margin-top:12px;">${t('wiz_l4_light')}</div>
        <select id="wiz-light" class="wiz-select">
          <option value="bright" ${atm.ambientLight==='bright'?'selected':''}>☀️ ${t('wiz_l_bright')}</option>
          <option value="dim"    ${atm.ambientLight==='dim'?'selected':''}>${iconImg('🕯️','12px')} ${t('wiz_l_dim')}</option>
          <option value="dark"   ${atm.ambientLight==='dark'?'selected':''}>🌑 ${t('wiz_l_dark')}</option>
        </select>
        <div class="wiz-section" style="margin-top:12px;">${t('wiz_l4_dv')}</div>
        <select id="wiz-dv" class="wiz-select">
          <option value="0"  ${atm.globalDarkvision===0?'selected':''}>👁 ${t('wiz_dv_per')}</option>
          <option value="30" ${atm.globalDarkvision===30?'selected':''}>🦅 ${t('wiz_dv_30')}</option>
          <option value="60" ${atm.globalDarkvision===60?'selected':''}>🐱 ${t('wiz_dv_60')}</option>
        </select>
        <div class="wiz-section" style="margin-top:16px;">Fog of War</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:#ccc;">
          <input type="checkbox" id="wiz-fow-enabled" ${this._data.config?.fowEnabled ? 'checked' : ''}
            style="width:16px;height:16px;cursor:pointer;">
          Enable Fog of War &amp; Line-of-Sight
        </label>
        <div class="wiz-tip" style="margin-top:6px;">When off, all tiles are fully visible to all players. Turn on for stealth-heavy sessions where exploration matters.</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:#ccc;margin-top:10px;">
          <input type="checkbox" id="wiz-collision-enabled" ${this._data.config?.collisionEnabled ? 'checked' : ''}
            style="width:16px;height:16px;cursor:pointer;">
          Enforce tile collision (tokens block each other's movement)
        </label>
        <div class="wiz-tip" style="margin-top:6px;">Off by default — tokens can freely share spaces. Enable for strict D&amp;D 5e positioning where creatures block passage.</div>`;

      // ──── Step 4: Fog of War (paint fog after enabling it in step 3) ──
      case 4: return `
        <div class="wiz-section">${t('wiz_l3_brush')}</div>
        <div class="wiz-tool-grid">
          <button class="wiz-tool-btn" id="wt-reveal" data-mode="wizFog">🌟 ${t('wiz_l3_reveal')}</button>
          <button class="wiz-tool-btn active" id="wt-fogHide" data-mode="wizFogHide">🌑 ${t('wiz_l3_hide')}</button>
        </div>
        <div class="wiz-section" style="margin-top:14px;">${t('wiz_l3_quick')}</div>
        <button id="wiz-reveal-all" class="wiz-btn gold" style="margin-top:5px;">🌅 ${t('wiz_l3_reveal_all')}</button>
        <button id="wiz-hide-all"   class="wiz-btn danger" style="margin-top:5px;">🌑 ${t('wiz_l3_hide_all')}</button>
        <div class="wiz-tip" style="margin-top:12px;">${t('wiz_l3_tip')}</div>`;

      // ──── Step 5: Save ────────────────────────────────────────────────
      case 5: return `
        <div class="wiz-section">${t('wiz_l5_name')}</div>
        <input id="wiz-scene-name" class="wiz-input"
          placeholder="${t('wiz_l5_name_ph')}"
          value="${this._data.name||''}">
        <div class="wiz-tip" style="margin-top:14px;">
          💾 <b>${t('wiz_l5_save_only')}</b> — ${t('wiz_l5_save_only_tip')}<br><br>
          ⚔️ <b>${t('wiz_l5_go_live')}</b> — ${t('wiz_l5_go_live_tip')}
        </div>

        <div class="wiz-divider" style="margin-top:14px;">${t('wiz_or')}</div>
        <div class="wiz-section" style="margin-top:10px;">📜 ${t('wiz_handout')}</div>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button id="wiz-print-handout" class="wiz-btn" style="flex:1;background:rgba(46,204,113,0.2);border-color:#2ecc71;color:#2ecc71;">
            📜 ${t('wiz_print_handout')}
          </button>
          <button id="wiz-open-watabou" class="wiz-btn" style="flex:1;background:rgba(155,89,182,0.2);border-color:#9b59b6;color:#d7bde2;">
            🗺 Watabou
          </button>
        </div>
        ${this._dungeonData ? `<div class="wiz-ok-badge" style="margin-top:4px;">${t('wiz_rooms_indexed').replace('{count}', this._dungeonData.rooms?.length||0)}</div>` : ''}
        `;

      default: return '';
    }
  }

  _buildRight() {
    // SB-2: Richer contextual help card per step
    const cards = [
      { icon:'💡', title:'Tips', body: t('wiz_tip0') },
      { icon:'🎯', title:'Align Grid', body: t('wiz_tip1') },
      { icon:'🗺', title:'Build World', body: t('wiz_tip2') },
      { icon:iconImg('🌩','16px'), title:'Atmosphere', body: t('wiz_tip4') },
      { icon:'👁', title:'Fog of War', body: t('wiz_tip3') },
      { icon:'💾', title:'Ready to Save', body: t('wiz_tip5') },
    ];
    const c = cards[this._step] || cards[0];
    return `
      <div class="wiz-help-card">
        <div class="wiz-help-icon">${c.icon}</div>
        <div class="wiz-help-title">${c.title}</div>
        <div class="wiz-help-body">${c.body}</div>
        <div class="wiz-help-shortcuts">
          <div class="wiz-shortcut-row"><kbd>Alt+→</kbd><span>Next step</span></div>
          <div class="wiz-shortcut-row"><kbd>Alt+←</kbd><span>Back</span></div>
          <div class="wiz-shortcut-row"><kbd>Esc</kbd><span>Close wizard</span></div>
        </div>
      </div>`;
  }

  // ── Wire controls ──────────────────────────────────────────────────────
  // E3-E: Generate dungeon and apply obstacle + fog grids
  async _generateQuickDungeon() {
    const size  = document.getElementById('wiz-dng-size')?.value  || 'M';
    const style = document.getElementById('wiz-dng-style')?.value || 'dungeon';
    const seed  = this._roomCode ? (parseInt(this._roomCode, 36) % 2147483647) : undefined;

    const btn = document.getElementById('wiz-gen-dungeon');
    if (btn) { btn.disabled = true; btn.textContent = t('wiz_generating'); }

    try {
      const dng = generateDungeon({ size, style, seed });
      this._dungeonData = dng;
      window._lastDungeonData = dng; // E7: available for handout export

      // Apply obstacle grid to map engine
      const obsGrid = tilesToObstacleGrid(dng.tiles);
      if (this._engine) {
        this._engine.S.obstacles = obsGrid;
        // Resize map to dungeon dimensions
        this._engine.S.cfg = {
          ...this._engine.S.cfg,
          cols: dng.width,
          rows: dng.height,
        };
        this._engine._dirty();
      }
      // E4-B: Auto-apply tiles from dungeon data
      const theme = style === 'cave' ? 'cave' : style === 'fort' ? 'fort' : 'dungeon';
      if(this._tileEngine) {
        this._tileEngine.applyDungeon(dng, theme);
        if(this._engine) this._engine.tileEngine = this._tileEngine;
      }

      this._dungeonGenerated = true;
      const roomCount = dng.rooms.length;
      this._dungeonInfo = `${size} ${style} — ${roomCount > 0 ? roomCount + ' ' + t('wiz_rooms_label') : t('wiz_organic_cave')}`;
      this._render();
    } catch(e) {
      console.error('Dungeon gen error:', e);
      if (btn) { btn.disabled = false; btn.textContent = '🎲 ' + t('wiz_gen_dungeon_btn'); }
    }
  }

  _wireStep() {
    const eng = this._engine;
    const cfg = this._data.config;
    const atm = this._data.atmosphere;

    // ── Step 0: Image ────────────────────────────────────────────────────
    // E7: Print Handout + Watabou buttons (Step 5)
    document.getElementById('wiz-print-handout')?.addEventListener('click', () => {
      printHandout({
        roomCode:   this._roomCode || '',
        sceneName:  document.getElementById('wiz-scene-name')?.value || 'Dungeon',
        dungeonData: this._dungeonData,
        engine:     this._engine,
      });
    });
    document.getElementById('wiz-open-watabou')?.addEventListener('click', () => {
      openWatabou(this._roomCode || this._dungeonData?.seed);
    });

    // E4-B: Tile picker buttons
    document.querySelectorAll('.wiz-tile-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        this._selectedTile = btn.dataset.tile;
        // Highlight active
        document.querySelectorAll('.wiz-tile-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // E4-B: Canvas click when tile mode active — paint tile
    if(this._step === 1) { /* tile painting wired in mapEngine via mode */ }

    // E3-E: Quick Dungeon generate button
    document.getElementById('wiz-gen-dungeon')?.addEventListener('click', () => {
      this._generateQuickDungeon();
    });

    // Background type radio toggle (static / video / tmt)
    document.querySelectorAll('input[name="wiz-bg-type"]').forEach(radio => {
      radio.addEventListener('change', e => {
        const val     = e.target.value;
        const isVideo = val === 'video';
        const isTmt   = val === 'tmt';
        const staticP = document.getElementById('wiz-static-bg-panel');
        const videoP  = document.getElementById('wiz-video-bg-panel');
        const tmtP    = document.getElementById('wiz-tmt-maps-panel');
        if (staticP) staticP.style.display = (!isVideo && !isTmt) ? 'block' : 'none';
        if (videoP)  videoP.style.display  = isVideo ? 'block' : 'none';
        if (tmtP)    tmtP.style.display    = isTmt   ? 'block' : 'none';
        // Update label highlight styles
        document.querySelectorAll('input[name="wiz-bg-type"]').forEach(r => {
          const lbl = r.closest('label');
          if (!lbl) return;
          const active = r.value === e.target.value;
          lbl.style.border      = `1px solid ${active ? 'rgba(241,196,15,0.55)' : 'rgba(255,255,255,0.12)'}`;
          lbl.style.background  = active ? 'rgba(241,196,15,0.08)' : 'transparent';
        });
      });
    });

    // YouTube: Load & Preview
    document.getElementById('wiz-yt-load')?.addEventListener('click', () => {
      const url = document.getElementById('wiz-yt-url')?.value.trim();
      if (!url) return;
      const id = VideoLayer.parseVideoId(url);
      if (!id) {
        if (window.showToast) showToast('Invalid YouTube URL — please paste a youtube.com or youtu.be link.', 'warning');
        return;
      }
      this._data.bgVideoUrl = url;
      this._data.bgUrl      = '';
      this._data.bgBase64   = '';
      this._data._bgBlob    = null;
      // Live preview in wizard engine: load thumbnail as static canvas bg
      if (eng) {
        eng._loadBg(`https://img.youtube.com/vi/${id}/hqdefault.jpg`);
        const wrap = document.getElementById('wizard-canvas-wrap');
        if (wrap && !eng._video?.isActive()) eng.initVideo(wrap);
        eng.loadBgVideo(url);
      }
      // Rebuild to show thumbnail + badge
      this._leftPanel.innerHTML = this._buildLeft();
      this._wireStep();
    });

    document.getElementById('wiz-bg-load')?.addEventListener('click', () => {
      const url = document.getElementById('wiz-bg-url')?.value.trim();
      if (!url) return;
      this._data.bgUrl      = url;
      this._data.bgVideoUrl = '';
      this._data._bgBlob    = null;
      eng?._video?.unload();
      eng?._loadBg(url);
      this._leftPanel.innerHTML = this._buildLeft();
      this._wireStep();
    });
    document.getElementById('wiz-bg-file')?.addEventListener('change', async e => {
      const file = e.target.files?.[0];
      if (!file) return;

      // SA-1: enforce 4MB cap
      if (file.size > 4 * 1024 * 1024) {
        if (window.showToast) showToast(t('toast_img_too_large'), 'warning');
        else alert('Image too large (max 4 MB). Please use an external URL instead.');
        return;
      }

      // SA-1: convert to base64 for Firebase persistence
      const reader = new FileReader();
      reader.onload = async ev => {
        const dataUrl = ev.target.result;

        // Revoke old blob if any
        if (this._data._bgBlob) { URL.revokeObjectURL(this._data._bgBlob); }
        this._data._bgBlob   = null;
        this._data.bgUrl     = '';
        this._data.bgBase64  = dataUrl;
        this._data.bgThumb   = await _makeThumbnail(dataUrl, 300);

        eng?._loadBg(dataUrl);
        this._leftPanel.innerHTML = this._buildLeft();
        this._wireStep();
      };
      reader.readAsDataURL(file);
    });

    // ── 2MT Map Gallery ──────────────────────────────────────────────────
    // Tag filter chips
    document.getElementById('wiz-tmt-tag-row')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-tmt-tag]');
      if (!btn) return;
      const tag = btn.dataset.tmtTag;
      // Update chip styles
      document.querySelectorAll('[data-tmt-tag]').forEach(b => {
        const active = b.dataset.tmtTag === tag;
        b.classList.toggle('active', active);
        b.style.background   = active ? 'rgba(241,196,15,0.15)' : '';
        b.style.borderColor  = active ? '#f1c40f' : '';
        b.style.color        = active ? '#f1c40f' : '';
      });
      // Filter map cards
      document.querySelectorAll('.wiz-tmt-card').forEach(card => {
        const cardTags = (card.dataset.tags || '').split(',');
        card.style.display = (tag === 'all' || cardTags.includes(tag)) ? '' : 'none';
      });
    });
    // Map card click → load as background
    document.getElementById('wiz-tmt-grid')?.addEventListener('click', e => {
      const card = e.target.closest('.wiz-tmt-card');
      if (!card) return;
      const url = card.dataset.full;
      if (!url) return;
      // Deselect all, select this
      document.querySelectorAll('.wiz-tmt-card').forEach(c => { c.style.borderColor = 'transparent'; });
      card.style.borderColor = '#f1c40f';
      // Set background
      this._data.bgUrl      = url;
      this._data.bgVideoUrl = '';
      this._data.bgBase64   = '';
      this._data._bgBlob    = null;
      eng?._video?.unload();
      eng?._loadBg(url);
    });

    // ── Step 1: Phantom grid ──────────────────────────────────────────────
    const syncCfg = () => {
      if (eng) eng.S.cfg = { ...eng.S.cfg, ...cfg };
      eng?._dirty();
    };
    const _refreshPps = () => {
      const el = document.getElementById('wiz-pps-val');
      if (el) el.innerHTML = `${cfg.pps}<small>px</small>`;
      // Show live tile count from engine
      const tc = eng?.getBgTileCount?.();
      const tcEl = document.getElementById('wiz-tile-count');
      if (tcEl) {
        tcEl.textContent = tc ? `${tc.cols} × ${tc.rows} tiles` : '';
      }
    };
    document.getElementById('wiz-pps-m')?.addEventListener('click', () => {
      cfg.pps = Math.max(8, cfg.pps - 4); syncCfg(); _refreshPps();
    });
    document.getElementById('wiz-pps-p')?.addEventListener('click', () => {
      cfg.pps = Math.min(256, cfg.pps + 4); syncCfg(); _refreshPps();
    });
    // Populate on step entry
    setTimeout(_refreshPps, 50);
    document.getElementById('wiz-ox-m')?.addEventListener('click', () => { cfg.ox -= 4; syncCfg(); });
    document.getElementById('wiz-ox-p')?.addEventListener('click', () => { cfg.ox += 4; syncCfg(); });
    document.getElementById('wiz-oy-m')?.addEventListener('click', () => { cfg.oy -= 4; syncCfg(); });
    document.getElementById('wiz-oy-p')?.addEventListener('click', () => { cfg.oy += 4; syncCfg(); });
    document.getElementById('wiz-approve-grid')?.addEventListener('click', () => {
      cfg.locked = true;
      if (eng) { eng.S.cfg = { ...eng.S.cfg, ...cfg }; eng.setMode('view'); eng._dirty(); }
      const btn = document.getElementById('wiz-approve-grid');
      if (btn) {
        btn.textContent = '✓ ' + t('wiz_l1_approved');
        btn.classList.add('approved');
      }
    });

    // ── Step 2: Tools ─────────────────────────────────────────────────────
    document.querySelectorAll('.wiz-tool-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.wiz-tool-btn[data-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        eng?.setMode(btn.dataset.mode);
      });
    });
    document.querySelectorAll('.wiz-tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.wiz-tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        eng?.setTool(btn.dataset.tool);
      });
    });

    // ── E1-B: Open5e monster picker wiring ───────────────────────────────
    // Trigger initial fetch when step 2 is first rendered
    if (this._step === 2 && this._o5eResults === null && !this._o5eLoading) {
      this._o5eFetch();
    }
    // Search — 350ms debounce to avoid hammering API on each keystroke
    document.getElementById('wiz-mon-search')?.addEventListener('input', e => {
      this._monSearch = e.target.value;
      clearTimeout(this._o5eDebounce);
      this._o5eDebounce = setTimeout(() => {
        this._o5eResults = null;
        this._o5eFetch();
      }, 350);
      // Redraw immediately to show new value in input (results stay stale until fetch returns)
      this._leftPanel.innerHTML = this._buildLeft();
      this._wireStep();
    });
    // CR filter
    document.querySelectorAll('.wiz-cr-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._monCRFilter = btn.dataset.cr;
        this._o5eResults  = null;
        this._o5eFetch();
        this._leftPanel.innerHTML = this._buildLeft();
        this._wireStep();
      });
    });
    // Type chips
    document.querySelectorAll('.wiz-type-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const type = chip.dataset.type;
        if (this._monTypes.has(type)) this._monTypes.delete(type);
        else this._monTypes.add(type);
        this._o5eResults = null;
        this._o5eFetch();
        this._leftPanel.innerHTML = this._buildLeft();
        this._wireStep();
      });
    });
    // Spawn buttons — handles both local (data-key) and Open5e (data-slug + data-o5e)
    document.querySelectorAll('.wiz-mon-spawn-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.o5e) this._spawnO5eNPC(btn.dataset.slug);
        else this._spawnNPC(btn.dataset.key);
      });
    });
    // Stat block info buttons
    document.querySelectorAll('.wiz-mon-info-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.openStatBlock) window.openStatBlock(btn.dataset.slug);
      });
    });

    // ── Step 3: Atmosphere (live preview) ──────────────────────────────
    document.getElementById('wiz-weather')?.addEventListener('change', e => {
      atm.weather = e.target.value;
      eng?.setAtmosphere({ ...atm });
      eng?._dirty();
    });
    document.getElementById('wiz-light')?.addEventListener('change', e => {
      atm.ambientLight = e.target.value;
      eng?.setAtmosphere({ ...atm });
      eng?._dirty();
    });
    document.getElementById('wiz-dv')?.addEventListener('change', e => {
      atm.globalDarkvision = parseInt(e.target.value) || 0;
    });
    document.getElementById('wiz-fow-enabled')?.addEventListener('change', e => {
      this._data.config = { ...this._data.config, fowEnabled: e.target.checked };
      if (eng) { eng.S.cfg.fowEnabled = e.target.checked; eng._dirty(); }
    });
    document.getElementById('wiz-collision-enabled')?.addEventListener('change', e => {
      this._data.config = { ...this._data.config, collisionEnabled: e.target.checked };
      if (eng) { eng.S.cfg.collisionEnabled = e.target.checked; }
    });

    // ── Step 4: Fog ─────────────────────────────────────────────────────
    document.getElementById('wiz-reveal-all')?.addEventListener('click', () => {
      const { mapW:mw, mapH:mh } = cfg;
      const fog = {};
      for (let x=0; x<(mw??30); x++) for (let y=0; y<(mh??20); y++) fog[`${x}_${y}`] = true;
      this._data.fog = fog;
      if (eng) { eng.S.fog = { ...fog }; eng._dirty(); }
    });
    document.getElementById('wiz-hide-all')?.addEventListener('click', () => {
      this._data.fog = {};
      if (eng) { eng.S.fog = {}; eng._dirty(); }
    });

    // ── Step 5: Save ──────────────────────────────────────────────────────
    document.getElementById('wiz-scene-name')?.addEventListener('input', e => {
      this._data.name = e.target.value;
    });
    document.getElementById('wiz-save-only')?.addEventListener('click', () => this._save(false));
    document.getElementById('wiz-go-live')?.addEventListener('click',   () => this._save(true));
  }

  startPlacing(cn) { this._engine?.startPlacing(cn); }

  // ── E1-B: Fetch monsters from Open5e API ────────────────────────────────
  async _o5eFetch() {
    this._o5eLoading = true;
    // Redraw with skeleton loaders
    this._leftPanel.innerHTML = this._buildLeft();
    this._wireStep();

    try {
      const crRanges = { all:[0,30], low:[0,0.5], med:[1,4], high:[5,10], epic:[11,30] };
      const [crMin, crMax] = crRanges[this._monCRFilter] || [0,30];
      const opts = { page_size: 50 };
      if (this._monSearch)        opts.search = this._monSearch;
      if (this._monCRFilter !== 'all') { opts.cr_min = crMin; opts.cr_max = crMax; }
      if (this._monTypes.size === 1)   opts.type = [...this._monTypes][0];

      const data = await fetchMonsters(opts);
      this._o5eResults = data.results || [];
      this._o5eTotal   = data.count   || 0;

      // Cache slug → monster object for quick spawn lookup
      this._o5eResults.forEach(m => { this._o5eMonMap[m.slug] = m; });

      // If type filter has >1 type, filter client-side
      if (this._monTypes.size > 1) {
        this._o5eResults = this._o5eResults.filter(m => {
          const t = normaliseType(m.type);
          return this._monTypes.has(t);
        });
      }
    } catch (err) {
      console.warn('Open5e fetch failed, falling back to local:', err);
      this._o5eResults = null; // null = show fallback
    }

    this._o5eLoading = false;
    this._leftPanel.innerHTML = this._buildLeft();
    this._wireStep();
  }

  // ── E1-B: Spawn NPC from Open5e data ───────────────────────────────────
  _spawnO5eNPC(slug) {
    const m = this._o5eMonMap[slug];
    if (!m) { this._toast('⚠️ Monster data not loaded yet'); return; }

    const type  = normaliseType(m.type);
    const col   = typeColor[type] || '#c0392b';
    const npcStats = open5eToNPC(m);

    // Build unique name
    const existing = this._spawnedNPCs.filter(s => s.key === slug).length;
    const finalName = existing > 0 ? `${m.name} ${existing + 1}` : m.name;

    const init = Math.floor(Math.random() * 20) + 1 + Math.floor(((m.dexterity || 10) - 10) / 2);
    const img  = `https://api.dicebear.com/8.x/bottts/png?seed=${slug}&backgroundColor=${col.replace('#','')}`;

    if (typeof window.addNPCFromWizard === 'function') {
      window.addNPCFromWizard(finalName, col, img, init, npcStats);
    }

    this._spawnedNPCs.push({ key: slug, name: finalName });
    this._engine?.startPlacing(finalName);

    this._leftPanel.innerHTML = this._buildLeft();
    this._wireStep();
    this._toast(t('wiz_click_to_place').replace('{name}', finalName));
  }

  // ── SC: Spawn NPC from wizard ──────────────────────────────────────────
  // Creates the character in Firebase (full statblock) then enters map placing
  // mode so the DM can click where to put the token.
  _spawnNPC(key) {
    const m = npcDatabase[key];
    if (!m) return;

    // Build unique name with numeric suffix if duplicate
    const existingKeys = this._spawnedNPCs.filter(s => s.key === key).length;
    const baseName = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g,' ');
    const finalName = existingKeys > 0 ? `${baseName} ${existingKeys + 1}` : baseName;

    const col = typeColor[m.type] || '#c0392b';
    const init = Math.floor(Math.random()*20) + 1 + (m.init||0);
    const stats = {
      maxHp: m.hp, hp: m.hp, ac: m.ac||10, speed: 30, pp: 10,
      isHidden: false,
      melee: m.melee||0, meleeDmg: m.meleeDmg||'1d4',
      ranged: m.ranged||0, rangedDmg: m.rangedDmg||'1d4',
      monsterType: m.type || 'Humanoid',   // SC: stored for token ring colour
    };

    // Write to Firebase via the exposed addNPCFromWizard callback
    if (typeof window.addNPCFromWizard === 'function') {
      window.addNPCFromWizard(finalName, col, m.img, init, stats);
    }

    this._spawnedNPCs.push({ key, name: finalName });

    // Enter map placing mode immediately
    this._engine?.startPlacing(finalName);

    // Refresh left panel count badge
    this._leftPanel.innerHTML = this._buildLeft();
    this._wireStep();

    // Visual feedback toast
    this._toast(t('wiz_click_to_place').replace('{name}', finalName));
  }

  _toast(msg) {
    let el = document.getElementById('wiz-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wiz-toast';
      el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
        'background:rgba(241,196,15,0.9);color:#1a1a1a;padding:8px 16px;border-radius:8px;' +
        'font-size:12px;font-weight:bold;z-index:99999;pointer-events:none;transition:opacity 0.5s;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.style.opacity='0'; }, 2200);
  }

  // ── Save ───────────────────────────────────────────────────────────────
  async _save(goLive) {
    this._syncFromEngine();

    const rawName = document.getElementById('wiz-scene-name')?.value.trim()
                    || this._data.name;
    if (!rawName) {
        if (window.showToast) showToast(t('toast_scene_name_required'), 'warning');
        else alert('Please enter a scene name.');
        document.getElementById('wiz-scene-name')?.focus();
        return;
    }
    const name = rawName;
    this._data.name = name;

    if (window.showSpinner) showSpinner('Saving scene…');

    // SA-2: write _id back immediately so repeat saves reuse the same Firebase path
    const sceneId = this._data._id || ('scene_' + Date.now());
    this._data._id = sceneId;

    const sceneData = {
      _id:        sceneId,
      name,
      createdAt:  this._data.createdAt || Date.now(),
      config:     { ...this._data.config },
      atmosphere: { ...this._data.atmosphere },
      fog:        { ...this._data.fog },
      obstacles:  { ...this._data.obstacles },
      triggers:   { ...this._data.triggers },
      bgUrl:      this._data.bgUrl      || '',
      bgVideoUrl: this._data.bgVideoUrl || '',
      bgBase64:   this._data.bgBase64   || '',   // SA-1: persisted for reload
      bgThumb:    this._data.bgThumb    || '',   // SA-1: gallery thumbnail
    };

    if (this.db && this.uid) {
      await this.db.saveSceneToVault(this.uid, sceneId, sceneData);
    }

    if (window.hideSpinner) hideSpinner();
    if (window.showToast) showToast(t('toast_scene_saved'), 'success');
    this.onSaved?.(sceneId, sceneData);

    if (goLive && this.db) {
      this.db.setMapCfg(this.activeRoom, {
        ...sceneData.config,
        bgUrl:      sceneData.bgVideoUrl ? '' : (sceneData.bgUrl || ''),
        bgVideoUrl: sceneData.bgVideoUrl || '',
        bgBase64:   sceneData.bgVideoUrl ? '' : (sceneData.bgBase64 || ''),
      });
      if (Object.keys(sceneData.fog).length)
        this.db.revealFogCells(this.activeRoom, sceneId, sceneData.fog);
      Object.keys(sceneData.obstacles).forEach(k =>
        this.db.setObstacle(this.activeRoom, sceneId, k, true));
      Object.keys(sceneData.triggers).forEach(k =>
        this.db.setTrigger(this.activeRoom, sceneId, k, sceneData.triggers[k]));
      this.db.setAtmosphere(this.activeRoom, sceneData.atmosphere);
      this.db.setActiveScene(this.activeRoom, sceneId);
      this.onGoLive?.(sceneId, sceneData);
    }

    this.close();
  }
}
