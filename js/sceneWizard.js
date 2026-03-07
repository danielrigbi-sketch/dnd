// js/sceneWizard.js — Scene Wizard v128
// 6-step guided scene creation for CritRoll DM.
//
// FIXES v128 (Sprint SB):
//   SB-2: Step dots replaced with labeled pill bar (icon + name + checkmark)
//   SB-2: goTo(n) method added for direct step navigation from pills
//   SB-2: Keyboard nav: Alt+← / Alt+→, Escape to close
//   SB-3: Right panel replaced with contextual help cards per step
// =====================================================================
import { MapEngine } from './mapEngine.js';
import { t, getLang } from './i18n.js';

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
    this.db         = opts.db   || null;
    this.onSaved    = opts.onSaved  || null;
    this.onGoLive   = opts.onGoLive || null;
    this.players    = opts.players  || {};

    this._step   = 0;
    this._engine = null;

    this._data = {
      _id: null,
      name: '',
      bgUrl: '',
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
        _id: null, name: '', bgUrl: '',
        bgBase64: '', bgThumb: '',   // SA-1
        _bgBlob: null,
        config: { pps: 64, ox: 0, oy: 0, locked: false, mapW: 30, mapH: 20 },
        atmosphere: { weather: 'none', ambientLight: 'bright', globalDarkvision: 0 },
        fog: {}, obstacles: {}, triggers: {}, createdAt: null,
      };
    }
    this._step = 0;
    this._modal.classList.add('wiz-open');   // SA-3: single class toggle
    this._modal.dir = getLang() === 'he' ? 'rtl' : 'ltr';
    // SB-2: keyboard navigation
    this._boundKey = this._onKey.bind(this);
    window.addEventListener('keydown', this._boundKey);
    window.addEventListener('resize', this._bound.resize);
    this._initEngine();
    this._render();
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
    if (bgSrc) this._engine._loadBg(bgSrc);
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
    this._data.obstacles = { ...this._engine.S.obstacles };
    this._data.triggers  = { ...this._engine.S.triggers };
    this._data.fog       = { ...this._engine.S.fog };
  }

  // ── Step navigation ───────────────────────────────────────────────────
  next() { this._syncFromEngine(); if (this._step < 5) { this._step++; this._render(); } }
  back() { this._syncFromEngine(); if (this._step > 0) { this._step--; this._render(); } }

  // ── Render ────────────────────────────────────────────────────────────
  _render() {
    const ICONS  = ['🖼','🔲','⚔️','🌑','🌩','💾'];
    const LABELS = ['Image','Grid','World','Fog','Vibe','Save'];
    const TITLES = ['wiz_t0','wiz_t1','wiz_t2','wiz_t3','wiz_t4','wiz_t5'];
    const SUBS   = ['wiz_s0','wiz_s1','wiz_s2','wiz_s3','wiz_s4','wiz_s5'];

    // SB-2: Update pill bar instead of dots
    document.querySelectorAll('.wiz-pill').forEach((pill, i) => {
      pill.classList.toggle('active', i === this._step);
      pill.classList.toggle('done',   i < this._step);
    });

    document.getElementById('wiz-step-title').textContent = `${ICONS[this._step]}  ${t(TITLES[this._step])}`;
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
    const modes = ['view', 'phantom', 'obstacle', 'wizFog', 'view', 'view'];
    this._engine?.setMode(modes[this._step] || 'view');
  }

  // ── Left Panel HTML ───────────────────────────────────────────────────
  _buildLeft() {
    const cfg = this._data.config;
    const atm = this._data.atmosphere;
    switch (this._step) {

      // ──── Step 0: Image only ─────────────────────────────────────────
      case 0: return `
        <div class="wiz-section">${t('wiz_l0_image')}</div>
        <input id="wiz-bg-url" class="wiz-input" type="url"
          placeholder="${t('wiz_l0_url_ph')}"
          value="${this._data.bgUrl||''}">
        <button id="wiz-bg-load" class="wiz-btn gold">🖼 ${t('wiz_l0_load_url')}</button>
        <div class="wiz-divider">${t('wiz_or')}</div>
        <label class="wiz-file-label" style="cursor:pointer;">
          📂 ${t('wiz_l0_upload')}
          <input id="wiz-bg-file" type="file" accept="image/*" style="display:none">
        </label>
        ${(this._data.bgBase64||this._data.bgUrl||this._data._bgBlob)?`
          <div class="wiz-ok-badge">✓ ${t('wiz_l0_loaded')}</div>
          ${this._data.bgThumb ? `<img src="${this._data.bgThumb}" style="width:100%;max-height:100px;object-fit:cover;border-radius:6px;margin-top:8px;border:1px solid rgba(241,196,15,0.3);">` : ''}
        `:''}
        <div class="wiz-tip" style="margin-top:12px;">${t('wiz_l0_tip')}</div>`;

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

      // ──── Step 2: Build world ─────────────────────────────────────────
      case 2: return `
        <div class="wiz-section">${t('wiz_l2_tool')}</div>
        <div class="wiz-tool-grid">
          <button class="wiz-tool-btn" id="wt-obs"  data-mode="obstacle">🧱 ${t('wiz_l2_obstacle')}</button>
          <button class="wiz-tool-btn" id="wt-trig" data-mode="trigger">⚠️ ${t('wiz_l2_trap')}</button>
          <button class="wiz-tool-btn" id="wt-view" data-mode="view">👆 ${t('wiz_l2_select')}</button>
          <button class="wiz-tool-btn" id="wt-ruler" data-mode="ruler">📏 ${t('wiz_l2_ruler')}</button>
        </div>
        <div class="wiz-section" style="margin-top:10px;">${t('wiz_l2_brush')}</div>
        <div style="display:flex;gap:5px;margin-top:5px;">
          <button class="wiz-tool-btn active" id="wt-paint" data-tool="paint" style="flex:1;">🖌 ${t('wiz_l2_paint')}</button>
          <button class="wiz-tool-btn" id="wt-erase" data-tool="erase" style="flex:1;">🧹 ${t('wiz_l2_erase')}</button>
        </div>
        <div class="wiz-section" style="margin-top:12px;">${t('wiz_l2_tokens')}</div>
        <div id="wiz-token-list" style="display:flex;flex-direction:column;gap:4px;margin-top:5px;">
          ${Object.entries(this.players).filter(([,p])=>p.userRole!=='dm').map(([cn,p])=>`
            <div style="display:flex;align-items:center;gap:6px;padding:3px 0;">
              <img src="${p.portrait||'assets/logo.png'}"
                style="width:22px;height:22px;border-radius:50%;border:2px solid ${p.pColor||'#fff'}">
              <span style="flex:1;font-size:11px;color:#ddd;">${cn}</span>
              <button onclick="window._wizard?.startPlacing('${cn}')" class="wiz-tiny-btn">📍</button>
            </div>
          `).join('') || `<div style="font-size:11px;color:#555;">${t('wiz_l2_no_players')}</div>`}
        </div>`;

      // ──── Step 3: Fog of War ──────────────────────────────────────────
      case 3: return `
        <div class="wiz-section">${t('wiz_l3_brush')}</div>
        <div class="wiz-tool-grid">
          <button class="wiz-tool-btn" id="wt-reveal" data-mode="wizFog">🌟 ${t('wiz_l3_reveal')}</button>
          <button class="wiz-tool-btn active" id="wt-fogHide" data-mode="wizFogHide">🌑 ${t('wiz_l3_hide')}</button>
        </div>
        <div class="wiz-section" style="margin-top:14px;">${t('wiz_l3_quick')}</div>
        <button id="wiz-reveal-all" class="wiz-btn gold" style="margin-top:5px;">🌅 ${t('wiz_l3_reveal_all')}</button>
        <button id="wiz-hide-all"   class="wiz-btn danger" style="margin-top:5px;">🌑 ${t('wiz_l3_hide_all')}</button>
        <div class="wiz-tip" style="margin-top:12px;">${t('wiz_l3_tip')}</div>`;

      // ──── Step 4: Atmosphere ──────────────────────────────────────────
      case 4: return `
        <div class="wiz-section">${t('wiz_l4_weather')}</div>
        <select id="wiz-weather" class="wiz-select">
          <option value="none"       ${atm.weather==='none'?'selected':''}>☀️ ${t('wiz_w_clear')}</option>
          <option value="light_rain" ${atm.weather==='light_rain'?'selected':''}>🌦 ${t('wiz_w_rain')}</option>
          <option value="heavy_rain" ${atm.weather==='heavy_rain'?'selected':''}>⛈ ${t('wiz_w_hrain')}</option>
          <option value="fog"        ${atm.weather==='fog'?'selected':''}>🌫 ${t('wiz_w_fog')}</option>
          <option value="blizzard"   ${atm.weather==='blizzard'?'selected':''}>❄️ ${t('wiz_w_bliz')}</option>
          <option value="sandstorm"  ${atm.weather==='sandstorm'?'selected':''}>🌪 ${t('wiz_w_sand')}</option>
          <option value="darkness"   ${atm.weather==='darkness'?'selected':''}>🌑 ${t('wiz_w_dark')}</option>
        </select>
        <div class="wiz-section" style="margin-top:12px;">${t('wiz_l4_light')}</div>
        <select id="wiz-light" class="wiz-select">
          <option value="bright" ${atm.ambientLight==='bright'?'selected':''}>☀️ ${t('wiz_l_bright')}</option>
          <option value="dim"    ${atm.ambientLight==='dim'?'selected':''}>🕯 ${t('wiz_l_dim')}</option>
          <option value="dark"   ${atm.ambientLight==='dark'?'selected':''}>🌑 ${t('wiz_l_dark')}</option>
        </select>
        <div class="wiz-section" style="margin-top:12px;">${t('wiz_l4_dv')}</div>
        <select id="wiz-dv" class="wiz-select">
          <option value="0"  ${atm.globalDarkvision===0?'selected':''}>👁 ${t('wiz_dv_per')}</option>
          <option value="30" ${atm.globalDarkvision===30?'selected':''}>🦅 ${t('wiz_dv_30')}</option>
          <option value="60" ${atm.globalDarkvision===60?'selected':''}>🐱 ${t('wiz_dv_60')}</option>
        </select>`;

      // ──── Step 5: Save ────────────────────────────────────────────────
      case 5: return `
        <div class="wiz-section">${t('wiz_l5_name')}</div>
        <input id="wiz-scene-name" class="wiz-input"
          placeholder="${t('wiz_l5_name_ph')}"
          value="${this._data.name||''}">
        <div class="wiz-tip" style="margin-top:14px;">
          💾 <b>${t('wiz_l5_save_only')}</b> — ${t('wiz_l5_save_only_tip')}<br><br>
          ⚔️ <b>${t('wiz_l5_go_live')}</b> — ${t('wiz_l5_go_live_tip')}
        </div>`;

      default: return '';
    }
  }

  _buildRight() {
    // SB-2: Richer contextual help card per step
    const cards = [
      { icon:'💡', title:'Tips', body: t('wiz_tip0') },
      { icon:'🎯', title:'Align Grid', body: t('wiz_tip1') },
      { icon:'🗺', title:'Build World', body: t('wiz_tip2') },
      { icon:'👁', title:'Fog of War', body: t('wiz_tip3') },
      { icon:'🌩', title:'Atmosphere', body: t('wiz_tip4') },
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
  _wireStep() {
    const eng = this._engine;
    const cfg = this._data.config;
    const atm = this._data.atmosphere;

    // ── Step 0: Image ────────────────────────────────────────────────────
    document.getElementById('wiz-bg-load')?.addEventListener('click', () => {
      const url = document.getElementById('wiz-bg-url')?.value.trim();
      if (!url) return;
      this._data.bgUrl   = url;
      this._data._bgBlob = null;
      eng?._loadBg(url);
      this._leftPanel.innerHTML = this._buildLeft();
      this._wireStep();
    });
    document.getElementById('wiz-bg-file')?.addEventListener('change', async e => {
      const file = e.target.files?.[0];
      if (!file) return;

      // SA-1: enforce 4MB cap
      if (file.size > 4 * 1024 * 1024) {
        if (window.showToast) showToast('Image too large (max 4 MB). Use an external URL instead.', 'warning');
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

    // ── Step 3: Fog ───────────────────────────────────────────────────────
    document.getElementById('wiz-reveal-all')?.addEventListener('click', () => {
      const { mapW:mw, mapH:mh } = cfg;
      const fog = {};
      for (let x=0; x<(mw||30); x++) for (let y=0; y<(mh||20); y++) fog[`${x}_${y}`] = true;
      this._data.fog = fog;
      if (eng) { eng.S.fog = { ...fog }; eng._dirty(); }
    });
    document.getElementById('wiz-hide-all')?.addEventListener('click', () => {
      this._data.fog = {};
      if (eng) { eng.S.fog = {}; eng._dirty(); }
    });

    // ── Step 4: Atmosphere (live preview) ────────────────────────────────
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

    // ── Step 5: Save ──────────────────────────────────────────────────────
    document.getElementById('wiz-scene-name')?.addEventListener('input', e => {
      this._data.name = e.target.value;
    });
    document.getElementById('wiz-save-only')?.addEventListener('click', () => this._save(false));
    document.getElementById('wiz-go-live')?.addEventListener('click',   () => this._save(true));
  }

  startPlacing(cn) { this._engine?.startPlacing(cn); }

  // ── Save ───────────────────────────────────────────────────────────────
  async _save(goLive) {
    this._syncFromEngine();

    const rawName = document.getElementById('wiz-scene-name')?.value.trim()
                    || this._data.name;
    if (!rawName) {
        if (window.showToast) showToast('Please give your scene a name first.', 'warning');
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
      bgUrl:      this._data.bgUrl    || '',
      bgBase64:   this._data.bgBase64 || '',   // SA-1: persisted for reload
      bgThumb:    this._data.bgThumb  || '',   // SA-1: gallery thumbnail
    };

    if (this.db && this.uid) {
      await this.db.saveSceneToVault(this.uid, sceneId, sceneData);
    }

    if (window.hideSpinner) hideSpinner();
    if (window.showToast) showToast('Scene saved! ✨', 'success');
    this.onSaved?.(sceneId, sceneData);

    if (goLive && this.db) {
      this.db.setMapCfg(this.activeRoom, { ...sceneData.config, bgUrl: sceneData.bgUrl });
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
