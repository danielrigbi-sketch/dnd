// js/sceneWizard.js — Scene Creation Wizard v125
// Guides DM through 6-step scene setup.
// Uses a temporary MapEngine for live preview.
// On save: writes to users/${uid}/scenes + optionally goes live in room.
// =====================================================================
import { MapEngine } from './mapEngine.js?v=125';

const STEPS = [
  { id: 'image',      icon: '🖼',  title: 'Set the Stage',       sub: 'Load your battlefield image' },
  { id: 'grid',       icon: '🔲',  title: 'Align the Grid',      sub: 'Calibrate squares to your map' },
  { id: 'populate',   icon: '⚔️',  title: 'Build Your World',    sub: 'Place obstacles, traps & tokens' },
  { id: 'fog',        icon: '🌑',  title: 'Shroud in Mystery',   sub: 'Configure Fog of War' },
  { id: 'atmosphere', icon: '🌩',  title: 'Set the Mood',        sub: 'Weather, light & vision' },
  { id: 'save',       icon: '💾',  title: 'Name & Save',         sub: 'Save to your scene collection' },
];

export class SceneWizard {
  constructor(opts = {}) {
    this.uid       = opts.uid || null;
    this.cName     = opts.cName || 'DM';
    this.activeRoom= opts.activeRoom || 'public';
    this.db        = opts.db || null;
    this.onSaved   = opts.onSaved || null;   // cb(sceneId, sceneData)
    this.onGoLive  = opts.onGoLive || null;  // cb(sceneId, sceneData)
    this.players   = opts.players || {};

    this._step = 0;
    this._engine = null;
    this._container = null;

    this._data = {
      name: 'New Scene',
      bgUrl: '',
      config: { pps: 64, ox: 0, oy: 0, locked: false, mapW: 30, mapH: 20 },
      atmosphere: { weather: 'none', ambientLight: 'bright', globalDarkvision: 0 },
      fog: {}, obstacles: {}, triggers: {},
    };

    this._modal = document.getElementById('scene-wizard-modal');
    this._cvWrap = document.getElementById('wizard-canvas-wrap');
    this._cv = document.getElementById('wizard-canvas');
    this._fow = document.getElementById('wizard-fow-canvas');
    this._leftPanel = document.getElementById('wizard-left-panel');
    this._rightPanel = document.getElementById('wizard-right-panel');

    this._bound = { resize: this._resize.bind(this) };
  }

  open(existingData = null) {
    if (existingData) this._data = JSON.parse(JSON.stringify(existingData));
    this._step = 0;
    this._modal.classList.remove('wiz-hidden');
    this._modal.classList.add('wiz-open');
    window.addEventListener('resize', this._bound.resize);
    this._initEngine();
    this._render();
  }

  close() {
    this._modal.classList.add('wiz-hidden');
    this._modal.classList.remove('wiz-open');
    window.removeEventListener('resize', this._bound.resize);
    if (this._engine) { this._engine.destroy(); this._engine = null; }
  }

  // ── Engine ───────────────────────────────────────────────────────────
  _initEngine() {
    if (this._engine) { this._engine.destroy(); }
    this._resize();
    this._engine = new MapEngine(this._cv, this._fow, {
      cName: this.cName, userRole: 'dm', activeRoom: this.activeRoom,
    });
    this._engine.S.cfg = { ...this._engine.S.cfg, ...this._data.config };
    this._engine.S.obstacles = { ...this._data.obstacles };
    this._engine.S.triggers  = { ...this._data.triggers };
    this._engine.S.fog       = { ...this._data.fog };
    this._engine.setPlayers(this.players);
    if (this._data.bgUrl) this._engine._loadBg(this._data.bgUrl);
    if (this._data.atmosphere) this._engine.setAtmosphere(this._data.atmosphere);
    this._engine._dirty();
  }

  _resize() {
    const wrap = this._cvWrap;
    if (!wrap) return;
    const w = wrap.clientWidth || 800;
    const h = wrap.clientHeight || 500;
    this._cv.width  = w; this._cv.height  = h;
    this._fow.width = w; this._fow.height = h;
    this._engine?.resize(w, h);
  }

  // ── Step nav ─────────────────────────────────────────────────────────
  next() {
    this._syncFromEngine();
    if (this._step < STEPS.length - 1) { this._step++; this._render(); }
  }
  back() {
    this._syncFromEngine();
    if (this._step > 0) { this._step--; this._render(); }
  }
  goTo(n) { this._syncFromEngine(); this._step = n; this._render(); }

  _syncFromEngine() {
    if (!this._engine) return;
    this._data.config    = { ...this._engine.S.cfg };
    this._data.obstacles = { ...this._engine.S.obstacles };
    this._data.triggers  = { ...this._engine.S.triggers };
    this._data.fog       = { ...this._engine.S.fog };
  }

  // ── Render step ───────────────────────────────────────────────────────
  _render() {
    const s = STEPS[this._step];
    // Header progress
    document.getElementById('wiz-step-title').textContent = `${s.icon}  ${s.title}`;
    document.getElementById('wiz-step-sub').textContent = s.sub;
    document.querySelectorAll('.wiz-dot').forEach((d, i) => {
      d.classList.toggle('active', i === this._step);
      d.classList.toggle('done',   i < this._step);
    });
    // Nav
    document.getElementById('wiz-back-btn').style.visibility = this._step === 0 ? 'hidden' : 'visible';
    const isLast = this._step === STEPS.length - 1;
    document.getElementById('wiz-next-btn').style.display = isLast ? 'none' : 'inline-flex';
    document.getElementById('wiz-save-row').style.display = isLast ? 'flex' : 'none';

    // Panels
    this._leftPanel.innerHTML  = this._buildLeft();
    this._rightPanel.innerHTML = this._buildRight();
    this._wireStep();

    // Map engine mode
    const modes = ['view', 'calibrate', 'obstacle', 'fogReveal', 'view', 'view'];
    this._engine?.setMode(modes[this._step] || 'view');
  }

  // ── Left panel content per step ───────────────────────────────────────
  _buildLeft() {
    switch (this._step) {
      case 0: return `
        <div class="wiz-section">Map Image</div>
        <input id="wiz-bg-url" class="wiz-input" type="url" placeholder="https://…/map.jpg"
          value="${this._data.bgUrl||''}">
        <button id="wiz-bg-load" class="wiz-btn gold">🖼 Load URL</button>
        <div class="wiz-divider">or</div>
        <label class="wiz-file-label">
          📂 Upload File
          <input id="wiz-bg-file" type="file" accept="image/*" style="display:none">
        </label>
        <div class="wiz-section" style="margin-top:14px;">Grid Size</div>
        <div class="wiz-row">
          <span class="wiz-lbl">Columns</span>
          <button class="wiz-tiny-btn" id="wiz-mw-m">−</button>
          <span id="wiz-mw-val" class="wiz-val">${this._data.config.mapW||30}</span>
          <button class="wiz-tiny-btn" id="wiz-mw-p">+</button>
        </div>
        <div class="wiz-row">
          <span class="wiz-lbl">Rows</span>
          <button class="wiz-tiny-btn" id="wiz-mh-m">−</button>
          <span id="wiz-mh-val" class="wiz-val">${this._data.config.mapH||20}</span>
          <button class="wiz-tiny-btn" id="wiz-mh-p">+</button>
        </div>`;

      case 1: return `
        <div class="wiz-section">Square Size (px)</div>
        <div class="wiz-row">
          <button class="wiz-tiny-btn" id="wiz-pps-m">−</button>
          <span id="wiz-pps-val" class="wiz-val">${this._data.config.pps||64}px</span>
          <button class="wiz-tiny-btn" id="wiz-pps-p">+</button>
        </div>
        <div class="wiz-section" style="margin-top:10px;">X Offset</div>
        <div class="wiz-row">
          <button class="wiz-tiny-btn" id="wiz-ox-m">←</button>
          <span id="wiz-ox-val" class="wiz-val">${this._data.config.ox||0}</span>
          <button class="wiz-tiny-btn" id="wiz-ox-p">→</button>
        </div>
        <div class="wiz-section" style="margin-top:10px;">Y Offset</div>
        <div class="wiz-row">
          <button class="wiz-tiny-btn" id="wiz-oy-m">↑</button>
          <span id="wiz-oy-val" class="wiz-val">${this._data.config.oy||0}</span>
          <button class="wiz-tiny-btn" id="wiz-oy-p">↓</button>
        </div>
        <button id="wiz-lock-grid" class="wiz-btn gold" style="margin-top:14px;">
          ${this._data.config.locked ? '🔒 Grid Locked ✓' : '🔓 Lock Grid'}
        </button>`;

      case 2: return `
        <div class="wiz-section">Tool</div>
        <div class="wiz-tool-grid">
          <button class="wiz-tool-btn active" id="wt-view" data-mode="view">👆 Select</button>
          <button class="wiz-tool-btn" id="wt-obs" data-mode="obstacle">🧱 Obstacle</button>
          <button class="wiz-tool-btn" id="wt-trig" data-mode="trigger">⚠️ Trap</button>
          <button class="wiz-tool-btn" id="wt-ruler" data-mode="ruler">📏 Ruler</button>
        </div>
        <div class="wiz-section" style="margin-top:12px;">Brush</div>
        <div class="wiz-row">
          <button class="wiz-tool-btn active" id="wt-paint" data-tool="paint">🖌 Paint</button>
          <button class="wiz-tool-btn" id="wt-erase" data-tool="erase">🧹 Erase</button>
        </div>
        <div class="wiz-section" style="margin-top:12px;">Tokens</div>
        <div id="wiz-token-list" style="display:flex;flex-direction:column;gap:4px;">
          ${Object.entries(this.players).filter(([,p])=>p.userRole!=='dm').map(([cn,p])=>`
            <div class="wiz-token-row">
              <img src="${p.portrait||'assets/logo.png'}" style="width:22px;height:22px;border-radius:50%;border:2px solid ${p.pColor||'#fff'}">
              <span style="flex:1;font-size:11px;color:#ddd;">${cn}</span>
              <button onclick="window._wizard?.startPlacing('${cn}')" class="wiz-tiny-btn">📍</button>
            </div>
          `).join('')||'<div style="font-size:11px;color:#555;">No players yet</div>'}
        </div>`;

      case 3: return `
        <div class="wiz-section">Fog Brush</div>
        <div class="wiz-tool-grid">
          <button class="wiz-tool-btn active" id="wt-reveal" data-mode="fogReveal">🌟 Reveal</button>
          <button class="wiz-tool-btn" id="wt-hide" data-mode="fogHide">🌑 Hide</button>
        </div>
        <div class="wiz-section" style="margin-top:12px;">Quick Actions</div>
        <button id="wiz-reveal-all" class="wiz-btn gold">🌅 Reveal All</button>
        <button id="wiz-hide-all" class="wiz-btn danger" style="margin-top:6px;">🌑 Hide All</button>
        <div class="wiz-tip" style="margin-top:12px;">
          Players auto-reveal based on position:<br>
          Normal = 30ft · Darkvision = 60ft
        </div>`;

      case 4: return `
        <div class="wiz-section">Weather</div>
        <select id="wiz-weather" class="wiz-input">
          ${['none','light_rain','heavy_rain','fog','blizzard','sandstorm','darkness'].map(w=>
            `<option value="${w}" ${(this._data.atmosphere.weather===w)?'selected':''}>${{
              none:'☀️ Clear', light_rain:'🌦 Light Rain', heavy_rain:'⛈ Heavy Rain',
              fog:'🌫 Dense Fog', blizzard:'❄️ Blizzard', sandstorm:'🌪 Sandstorm', darkness:'🌑 Magical Darkness'
            }[w]||w}</option>`
          ).join('')}
        </select>
        <div class="wiz-section" style="margin-top:10px;">Ambient Light</div>
        <select id="wiz-light" class="wiz-input">
          <option value="bright" ${this._data.atmosphere.ambientLight==='bright'?'selected':''}>☀️ Bright Light</option>
          <option value="dim"    ${this._data.atmosphere.ambientLight==='dim'   ?'selected':''}>🕯 Dim Light</option>
          <option value="dark"   ${this._data.atmosphere.ambientLight==='dark'  ?'selected':''}>🌑 Darkness</option>
        </select>
        <div class="wiz-section" style="margin-top:10px;">Global Darkvision</div>
        <select id="wiz-dv" class="wiz-input">
          <option value="0"  ${!this._data.atmosphere.globalDarkvision?'selected':''}>👁 Per-Character</option>
          <option value="30" ${this._data.atmosphere.globalDarkvision===30?'selected':''}>🦅 30 ft (everyone)</option>
          <option value="60" ${this._data.atmosphere.globalDarkvision===60?'selected':''}>🐱 60 ft (everyone)</option>
        </select>`;

      case 5: return `
        <div class="wiz-section">Scene Name</div>
        <input id="wiz-scene-name" class="wiz-input" placeholder="e.g. Dungeon Entrance"
          value="${this._data.name||'New Scene'}">
        <div class="wiz-tip" style="margin-top:10px;">
          💾 <b>Save Only</b> — adds to your collection for later.<br><br>
          ⚔️ <b>Go Live</b> — saves and immediately activates the scene in the room, replacing the table background for all players.
        </div>`;

      default: return '';
    }
  }

  _buildRight() {
    const tips = [
      `🗺 Tip: You can load any image by URL — battle maps from online D&D resources work great. The map stays private until you Go Live.`,
      `🔲 Tip: Aim to align grid lines with the map's printed squares. Lock when aligned — all players will see the same grid.`,
      `⚔️ Tip: Paint obstacles for walls and pits. Place traps as triggers — players won't see them until they step on them.`,
      `🌑 Tip: Start the scene fully hidden — players see only what their character can see based on position and darkvision.`,
      `🌩 Tip: Heavy Rain gives disadvantage on Perception (Wisdom) checks. Darkness can be used for Silence spells or dungeon interiors.`,
      `✅ Your scene is ready! It will be saved to your personal vault. You can load it in future games with the Scene Manager.`,
    ];
    return `<div class="wiz-tip-box">${tips[this._step]||''}</div>`;
  }

  // ── Wire step controls ─────────────────────────────────────────────────
  _wireStep() {
    const eng = this._engine;
    const _cfg = () => this._data.config;
    const _upd = () => eng && (eng.S.cfg = { ...eng.S.cfg, ..._cfg() });

    // Step 0
    document.getElementById('wiz-bg-load')?.addEventListener('click', () => {
      const url = document.getElementById('wiz-bg-url')?.value.trim();
      if (url) { this._data.bgUrl = url; eng?._loadBg(url); }
    });
    document.getElementById('wiz-bg-file')?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const r = new FileReader();
      r.onload = ev => { eng?.loadBgFile(file); };
      r.readAsDataURL(file);
    });
    this._wireNumCtrl('wiz-mw', 'mapW', 5, 100, 1, _upd);
    this._wireNumCtrl('wiz-mh', 'mapH', 4, 60,  1, _upd);

    // Step 1
    this._wireNumCtrl2('wiz-pps', 4, v => { _cfg().pps=v; _upd(); document.getElementById('wiz-pps-val').textContent=v+'px'; }, _cfg().pps||64, 8, 256);
    this._wireNumCtrl2('wiz-ox', 4, v => { _cfg().ox=v; _upd(); document.getElementById('wiz-ox-val').textContent=v; }, _cfg().ox||0, -200, 200);
    this._wireNumCtrl2('wiz-oy', 4, v => { _cfg().oy=v; _upd(); document.getElementById('wiz-oy-val').textContent=v; }, _cfg().oy||0, -200, 200);
    document.getElementById('wiz-lock-grid')?.addEventListener('click', () => {
      _cfg().locked = !_cfg().locked; _upd();
      document.getElementById('wiz-lock-grid').textContent = _cfg().locked ? '🔒 Grid Locked ✓' : '🔓 Lock Grid';
    });

    // Step 2 — tool buttons
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

    // Step 3 — fog
    document.getElementById('wiz-reveal-all')?.addEventListener('click', () => this._revealAll());
    document.getElementById('wiz-hide-all')?.addEventListener('click',   () => this._hideAll());

    // Step 4 — atmosphere
    document.getElementById('wiz-weather')?.addEventListener('change', e => {
      this._data.atmosphere.weather = e.target.value;
      eng?.setAtmosphere(this._data.atmosphere);
    });
    document.getElementById('wiz-light')?.addEventListener('change', e => {
      this._data.atmosphere.ambientLight = e.target.value;
      eng?.setAtmosphere(this._data.atmosphere);
    });
    document.getElementById('wiz-dv')?.addEventListener('change', e => {
      this._data.atmosphere.globalDarkvision = parseInt(e.target.value)||0;
    });

    // Step 5 — save
    document.getElementById('wiz-scene-name')?.addEventListener('input', e => {
      this._data.name = e.target.value;
    });
    document.getElementById('wiz-save-only')?.addEventListener('click', () => this._save(false));
    document.getElementById('wiz-go-live')?.addEventListener('click',   () => this._save(true));

    // Expose placing helper
    window._wizard = this;
  }

  _wireNumCtrl(prefix, key, min, max, step, cb) {
    const vm = document.getElementById(`${prefix}-m`);
    const vp = document.getElementById(`${prefix}-p`);
    const vv = document.getElementById(`${prefix}-val`);
    vm?.addEventListener('click', () => {
      this._data.config[key] = Math.max(min, (this._data.config[key]||0) - step);
      if(vv) vv.textContent = this._data.config[key]; cb();
    });
    vp?.addEventListener('click', () => {
      this._data.config[key] = Math.min(max, (this._data.config[key]||0) + step);
      if(vv) vv.textContent = this._data.config[key]; cb();
    });
  }

  _wireNumCtrl2(prefix, step, cb, init, min, max) {
    let val = init;
    document.getElementById(`${prefix}-m`)?.addEventListener('click', () => {
      val = Math.max(min, val - step); cb(val);
    });
    document.getElementById(`${prefix}-p`)?.addEventListener('click', () => {
      val = Math.min(max, val + step); cb(val);
    });
  }

  startPlacing(cn) { this._engine?.startPlacing(cn); }

  _revealAll() {
    const {mapW:mw,mapH:mh} = this._data.config;
    for (let gx=0; gx<(mw||30); gx++) for (let gy=0; gy<(mh||20); gy++)
      this._data.fog[`${gx}_${gy}`] = true;
    if (this._engine) this._engine.S.fog = { ...this._data.fog };
    this._engine?._dirty();
  }

  _hideAll() {
    this._data.fog = {};
    if (this._engine) this._engine.S.fog = {};
    this._engine?._dirty();
  }

  // ── Save ──────────────────────────────────────────────────────────────
  async _save(goLive) {
    this._syncFromEngine();
    const name = document.getElementById('wiz-scene-name')?.value.trim() || this._data.name || 'Unnamed Scene';
    this._data.name = name;

    const sceneData = {
      name,
      createdAt: Date.now(),
      config: this._data.config,
      atmosphere: this._data.atmosphere,
      fog: this._data.fog || {},
      obstacles: this._data.obstacles || {},
      triggers: this._data.triggers || {},
      bgUrl: this._data.bgUrl || '',
    };

    let sceneId = this._data._id || ('scene_' + Date.now());
    sceneData._id = sceneId;

    // Save to user vault
    if (this.db && this.uid) {
      await this.db.saveSceneToVault(this.uid, sceneId, sceneData);
    }

    this.onSaved?.(sceneId, sceneData);

    if (goLive && this.db) {
      this.db.setMapCfg(this.activeRoom, { ...sceneData.config, bgUrl: sceneData.bgUrl });
      if (sceneData.fog)       this.db.revealFogCells(this.activeRoom, sceneId, sceneData.fog);
      if (sceneData.obstacles) Object.keys(sceneData.obstacles).forEach(k => this.db.setObstacle(this.activeRoom, sceneId, k, true));
      if (sceneData.triggers)  Object.keys(sceneData.triggers).forEach(k => this.db.setTrigger(this.activeRoom, sceneId, k, sceneData.triggers[k]));
      this.db.setAtmosphere(this.activeRoom, sceneData.atmosphere);
      this.db.setActiveScene(this.activeRoom, sceneId);
      this.onGoLive?.(sceneId, sceneData);
    }

    this.close();
  }
}
