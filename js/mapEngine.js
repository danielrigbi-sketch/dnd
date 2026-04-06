// js/mapEngine.js — Tactical Battlefield v130 (REFACTORED)
// Slim orchestrator. Rendering systems extracted to:
//   engine/tokenSystem.js    — token render + all mouse/touch input
//   engine/movementSystem.js — A* pathfinding, BFS range, path/HUD render
//   engine/visibilitySystem.js — ROT.js FOV + trigger check
//   engine/fowSystem.js      — FOW canvas compositing + reveal flash
//   core/eventBus.js         — decoupled pub/sub
//
// This file owns: render loop, weather, backgrounds, grid, obstacles,
//   triggers, ruler, AOE, iris wipe, Firebase setup, DM tool APIs.
// ─────────────────────────────────────────────────────────────────────────────

import { typeColor } from './monsters.js';
import { TileEngine } from './tileEngine.js';
import { Pathfinder } from './pathfinder.js';
import { PixiLayer } from './pixiLayer.js';
import { VideoLayer } from './videoLayer.js';

import { mapBus }           from './core/eventBus.js';
import { TokenSystem }      from './engine/tokenSystem.js';
import { MovementSystem }   from './engine/movementSystem.js';
import { VisibilitySystem } from './engine/visibilitySystem.js';
import { FowSystem }        from './engine/fowSystem.js';
import { AnimationSystem }  from './engine/animationSystem.js';
import { getTileSize, footprintsOverlap } from './engine/sizeUtils.js';

// ── Constants ─────────────────────────────────────────────────────────
const FT_PER_SQ     = 5;
const MAP_W_DEFAULT = 30;
const MAP_H_DEFAULT = 20;
const DEF_PPS       = 64;
const MIN_PPS       = 16;
const MAX_PPS       = 200;
const GRID_NORMAL   = 'rgba(0,0,0,0.40)';
const GRID_LOCKED   = 'rgba(20,20,20,0.45)';
const GRID_CALIB    = 'rgba(255,220,60,0.50)';
const OBS_FILL      = 'rgba(160,0,0,0.55)';
const TRIG_FILL     = 'rgba(255,180,0,0.40)';
const TRIG_FIRED    = 'rgba(255,80,0,0.70)';
const AOE_COLS = {
  circle: 'rgba(255,70,0,0.32)',  cone: 'rgba(255,200,0,0.32)',
  cube:   'rgba(0,140,255,0.32)', line: 'rgba(200,0,220,0.45)',
};

function _debounce(fn, ms) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function ck(gx, gy) { return `${Math.floor(gx)}_${Math.floor(gy)}`; }
function kp(k) { const [x, y] = k.split('_').map(Number); return { gx: x, gy: y }; }

// ── MapEngine ─────────────────────────────────────────────────────────
export class MapEngine {
  constructor(canvas, fowCanvas, opts = {}) {
    this.localOnly  = opts.localOnly || false;
    this.cv         = canvas;
    this.ctx        = canvas.getContext('2d');
    this.fw         = fowCanvas;
    this.fc         = fowCanvas.getContext('2d');

    this.tileEngine = new TileEngine();
    this.tileEngine.load().catch(e => console.warn('TileEngine load:', e));
    this._pf    = new Pathfinder();
    this._pixi  = new PixiLayer();
    this._video = new VideoLayer();

    this.cName      = opts.cName      || '';
    this.userRole   = opts.userRole   || 'player';
    this.activeRoom = opts.activeRoom || 'public';
    this.isMuted    = false;
    this.db         = null;

    // View transform
    this.vx = 0; this.vy = 0; this.vs = 1;

    // UI overlay insets — usable viewport excludes these pixel widths
    this._insets = { top: 0, left: 0, bottom: 0, right: 0 };

    // Auto-fit flag: fit-to-view on first config load per scene, reset on scene switch
    this._hasFitted = false;

    // ── Shared state (Firebase-synced) ────────────────────────────────
    this.S = {
      cfg:        { bgUrl: '', bgVideoUrl: '', bgBase64: '', pps: DEF_PPS, ox: 0, oy: 0, locked: false, mapW: 30, mapH: 20, fowEnabled: false, collisionEnabled: false },
      atmosphere: { weather: 'none', ambientLight: 'bright', globalDarkvision: 0 },
      tokens:     {},
      fog:        {},
      obstacles:  {},
      triggers:   {},
      lights:     {},
      players:    {},
      scenes:     {},
      activeScene: 'default',
    };

    // ── Local only ────────────────────────────────────────────────────
    this.L = {
      mode:      'view',
      tool:      'paint',
      aoeShape:  'circle', aoeR: 20,
      rulerA:    null, rulerB: null,
      drag:      null,
      mw:        { x: 0, y: 0 }, ms: { x: 0, y: 0 },
      painting:  false,
      imgCache:  {},
      bg:        null, bgLoading: false,
      ati:       null, sc: [],
      dirty:     true, raf: null,
      pan:       { on: false, sx: 0, sy: 0, vx0: 0, vy0: 0 },
      firedLocal: new Set(),
      placing:   null,
      calibAnchor: null, calibDrag: null,
      wx:        null,
      fogRevQ:   [],
      currentFov: new Set(),
      iris:       null,
    };

    // ── Event bus (cross-subsystem communication) ─────────────────────
    this.bus = mapBus;

    // ── Subsystems ────────────────────────────────────────────────────
    this.tokens     = new TokenSystem(this);
    this.movement   = new MovementSystem(this);
    this.visibility = new VisibilitySystem(this);
    this.fow        = new FowSystem(this);
    this.anim       = new AnimationSystem(this);

    // Wire bus events that mapEngine needs to handle
    this._busUnsubs = [
      mapBus.on('token:moved', ({ cName, gx, gy }) => {
        this.visibility.revealForToken(cName, gx, gy);
        this.visibility.checkTrigger(gx, gy, cName);
      }),
    ];

    this._unsubs = [];

    // Debounced Firebase writes
    this._debouncedWriteObstacle = _debounce((key, val) => {
      if (this.db) this.db.setObstacle(this.activeRoom, this.S.activeScene, key, val);
    }, 50);
    this._debouncedWriteFog = _debounce((gx, gy, reveal) => {
      if (this.db) {
        if (reveal) this.db.revealFog(this.activeRoom, this.S.activeScene, gx, gy, 1);
        else        this.db.hideFog(this.activeRoom, this.S.activeScene, gx, gy);
      }
    }, 50);
    this._debouncedSaveGridCfg = _debounce(() => {
      if (this.db) this.db.setMapCfg(this.activeRoom, this.S.cfg);
    }, 300);

    // Bind input through TokenSystem
    this.tokens.bindInput(this.cv);
    this._loop();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────
  destroy() {
    cancelAnimationFrame(this.L.raf);
    this.tokens.unbindInput(this.cv);
    this._unsubs.forEach(u => u());
    this._busUnsubs.forEach(u => u());
    this._video?.unload();
  }

  setActiveTurn(idx, sc) { this.L.ati = idx; this.L.sc = sc || []; this._dirty(); }

  setPlayers(p) {
    const newKeys = Object.keys(p || {}).sort().join(',');
    const oldKeys = Object.keys(this.S.players).sort().join(',');
    if (this._pixi?.isReady && p) {
      Object.entries(p).forEach(([cn, pl]) => {
        const prev = this.S.players[cn];
        if (prev && typeof prev.hp === 'number' && typeof pl.hp === 'number' && prev.hp !== pl.hp) {
          this.bus.emit('hp:changed', { cName: cn, oldHp: prev.hp, newHp: pl.hp, cfg: this.S.cfg, token: this.S.tokens[cn] });
          this._pixi.onHPChange(cn, prev.hp, pl.hp, this.S.cfg, this.S.tokens[cn]);
        }
      });
    }
    this.S.players = p || {};
    this._dirty();
    if (newKeys !== oldKeys) this.tokens.updateDashTokenList();
  }

  setMuted(v) { this.isMuted = v; }

  async initPixi(containerEl) {
    try {
      await this._pixi.init(containerEl);
      console.log('[PixiLayer] WebGL overlay ready ✓');
    } catch (e) {
      console.warn('[PixiLayer] init failed, using Canvas 2D only:', e.message);
    }
  }

  initVideo(containerEl) {
    this._video.init(containerEl);
  }

  _dirty() { this.L.dirty = true; }

  // ── Firebase setup ────────────────────────────────────────────────────
  setupFirebase(db) {
    this.db = db;
    this._unsubs.forEach(u => u());
    this._unsubs = [];
    const r = this.activeRoom, sc = this.S.activeScene;

    this._unsubs.push(
      db.listenMapCfg(r, cfg => {
        if (!cfg) return;
        const wasUrl      = this.S.cfg.bgUrl;
        const wasVideoUrl = this.S.cfg.bgVideoUrl;
        const wasBase64   = this.S.cfg.bgBase64;
        this.S.cfg = { ...this.S.cfg, ...cfg };
        // Handle static background changes (base64 upload takes priority over URL)
        if (cfg.bgBase64 && cfg.bgBase64 !== wasBase64) {
          this._loadBg(cfg.bgBase64);
        } else if (cfg.bgUrl && cfg.bgUrl !== wasUrl) {
          this._loadBg(cfg.bgUrl);
        }
        // Handle video background changes
        if (cfg.bgVideoUrl && cfg.bgVideoUrl !== wasVideoUrl) {
          this._video?.load(cfg.bgVideoUrl);
        } else if (!cfg.bgVideoUrl && wasVideoUrl) {
          this._video?.unload();
          if (this.S.cfg.bgBase64) this._loadBg(this.S.cfg.bgBase64);
          else if (this.S.cfg.bgUrl) this._loadBg(this.S.cfg.bgUrl);
        }
        this._dirty();
        // Auto-fit the map to the usable viewport on first config receive per scene
        if (!this._hasFitted) { this._hasFitted = true; this.fitToView(); }
      }),
      db.listenMapTokens(r, tks => {
        this.S.tokens = tks || {};
        // Reveal vision for own token on every sync (handles load + reconnect)
        const myTk = this.S.tokens[this.cName];
        if (myTk && myTk.gx != null && this.userRole !== 'dm') {
          this.visibility.revealForToken(this.cName, myTk.gx, myTk.gy);
        }
        this._dirty();
      }),
      db.listenFog(r, sc, fog => { this.S.fog = fog || {}; this._dirty(); }),
      db.listenObstacles(r, sc, obs => {
        this.S.obstacles = obs || {};
        this._pf?.invalidate();
        this._dirty();
      }),
      db.listenTriggers(r, sc, trg => { this.S.triggers = trg || {}; this._dirty(); }),
      db.listenLights(r, sc, lights => { this.S.lights = lights || {}; this._dirty(); }),
      db.listenActiveScene(r, sid => {
        if (sid && sid !== this.S.activeScene) this._switchScene(sid);
      }),
    );
  }

  _switchScene(sid) {
    this._unsubs.forEach(u => u());
    this._unsubs = [];
    this.S.activeScene = sid;
    this.S.fog = {}; this.S.obstacles = {}; this.S.triggers = {}; this.S.lights = {};
    this.L.firedLocal.clear();
    this._hasFitted = false; // re-fit when new scene config arrives
    if (this.db) this.setupFirebase(this.db);
    this.bus.emit('scene:switched', { sceneId: sid });
    this._dirty();
  }

  // ── Render loop ───────────────────────────────────────────────────────
  _loop() {
    const tick = () => {
      if (this.L.dirty) { this._render(); this.L.dirty = false; }
      this.L.raf = requestAnimationFrame(tick);
    };
    this.L.raf = requestAnimationFrame(tick);
  }

  _render() {
    const { ctx, cv } = this;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.translate(this.vx, this.vy);
    ctx.scale(this.vs, this.vs);

    this._rBg();
    this._rGrid();
    this._rObstacles();
    if (this.userRole === 'dm') this._rTriggers();
    this._rLights();
    this.tokens.render(!!this._pixi?.isReady);
    this.movement.renderRange();
    if (this._pixi?.isReady) {
      const activeName = this.L.sc?.[this.L.ati]?.name;
      const dragging   = this.L.drag?.cName;
      this._pixi.setTransform(this.vx, this.vy, this.vs);
      this._pixi.syncTokens(this.S.tokens, this.S.players, activeName, this.S.cfg, dragging, () => this._dirty());
      this._pixi.renderFrame(); // PixiJS ticker is stopped; force render each frame
    }
    this.movement.renderPath();
    this.anim.tick(ctx);
    this._rRuler();
    this._rAoe();
    this.fow.renderPhantomGrid();

    ctx.restore();

    // Sync video iframe transform to match canvas world transform (runs in screen space)
    if (this._video?.isActive()) {
      const { pps, ox, oy, mapW, mapH } = this.S.cfg;
      this._video.syncTransform(this.vx, this.vy, this.vs, ox, oy, pps, mapW ?? MAP_W_DEFAULT, mapH ?? MAP_H_DEFAULT);
    }

    if (this.tileEngine?.ready) {
      this.tileEngine.render(this.ctx, this.S.cfg, this.vx, this.vy, this.vs);
    }

    if (this.S.cfg.fowEnabled) this.fow.render();
    this._rWeather();
    this.movement.renderHUD();
    this._rModeHUD();
    this._rIris();
  }

  // ── Background ────────────────────────────────────────────────────────
  _getBgFit() {
    const cw = this.cv.width, ch = this.cv.height;
    if (!this.L.bg) return { w: cw, h: ch };
    const nw = this.L.bg.naturalWidth || this.L.bg.width || cw;
    const nh = this.L.bg.naturalHeight || this.L.bg.height || ch;
    const scale = Math.min(cw / nw, ch / nh, 1);
    return { w: Math.round(nw * scale), h: Math.round(nh * scale) };
  }

  _rBg() {
    // When a YouTube video is active it fills the layer beneath — skip static bg rendering
    if (this._video?.isActive()) return;
    const { ctx } = this;
    const { pps, ox, oy, mapW: mw, mapH: mh } = this.S.cfg;
    if (this.L.mode === 'phantom') {
      const fit = this._getBgFit();
      ctx.fillStyle = '#0d0a1e';
      ctx.fillRect(ox, oy, fit.w, fit.h);
      if (this.L.bg) ctx.drawImage(this.L.bg, ox, oy, fit.w, fit.h);
      return;
    }
    for (let gx = 0; gx < (mw ?? MAP_W_DEFAULT); gx++) {
      for (let gy = 0; gy < (mh ?? MAP_H_DEFAULT); gy++) {
        ctx.fillStyle = (gx + gy) % 2 === 0 ? '#1e1b3a' : '#2a2550';
        ctx.fillRect(ox + gx * pps, oy + gy * pps, pps, pps);
      }
    }
    if (this.L.bg) ctx.drawImage(this.L.bg, ox, oy, (mw ?? MAP_W_DEFAULT) * pps, (mh ?? MAP_H_DEFAULT) * pps);
  }

  _rGrid() {
    if (this.L.mode === 'phantom') return;
    const { ctx } = this;
    const { pps, ox, oy, mapW: mw, mapH: mh, locked } = this.S.cfg;
    const m = this.L.mode;
    ctx.strokeStyle = m === 'calibrate' ? GRID_CALIB : locked ? GRID_LOCKED : GRID_NORMAL;
    ctx.lineWidth = (m === 'calibrate' ? 1.5 : 0.6) / this.vs;
    ctx.beginPath();
    for (let x = 0; x <= (mw ?? MAP_W_DEFAULT); x++) {
      const px = ox + x * pps; ctx.moveTo(px, oy); ctx.lineTo(px, oy + (mh ?? MAP_H_DEFAULT) * pps);
    }
    for (let y = 0; y <= (mh ?? MAP_H_DEFAULT); y++) {
      const py = oy + y * pps; ctx.moveTo(ox, py); ctx.lineTo(ox + (mw ?? MAP_W_DEFAULT) * pps, py);
    }
    ctx.stroke();
    if (m === 'calibrate') {
      // Dot markers at every 5th grid intersection
      ctx.fillStyle = GRID_CALIB;
      for (let x = 0; x <= (mw ?? MAP_W_DEFAULT); x += 5) {
        for (let y = 0; y <= (mh ?? MAP_H_DEFAULT); y += 5) {
          ctx.fillRect(ox + x * pps - 3 / this.vs, oy + y * pps - 3 / this.vs, 6 / this.vs, 6 / this.vs);
        }
      }
      // Live tile drag preview
      if (this.L.calibAnchor) {
        const a  = this.L.calibAnchor;
        const b  = this.L.calibDrag || this.L.mw;
        const dw = b.x - a.x, dh = b.y - a.y;
        const sz = Math.max(16, Math.round(Math.max(Math.abs(dw), Math.abs(dh))));
        ctx.save();
        ctx.fillStyle   = 'rgba(255,220,60,0.18)';
        ctx.fillRect(a.x, a.y, dw, dh);
        ctx.strokeStyle = 'rgba(255,220,60,1)';
        ctx.lineWidth   = 2.5 / this.vs;
        ctx.strokeRect(a.x, a.y, dw, dh);
        // Size label inside the rectangle
        ctx.fillStyle    = '#fff176';
        ctx.font         = `bold ${Math.max(10, 14 / this.vs)}px Arial`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${sz}px/tile`, a.x + dw / 2, a.y + dh / 2);
        ctx.restore();
      }
    }
  }

  _rObstacles() {
    const { ctx } = this;
    const { pps, ox, oy } = this.S.cfg;
    Object.keys(this.S.obstacles).forEach(k => {
      const { gx, gy } = kp(k);
      const px = ox + gx * pps, py = oy + gy * pps;
      ctx.fillStyle = OBS_FILL; ctx.fillRect(px, py, pps, pps);
      ctx.font = `${pps * 0.45}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🧱', px + pps / 2, py + pps / 2);
    });
  }

  _rLights() {
    if (Object.keys(this.S.lights).length === 0) return;
    const { ctx } = this;
    const { pps, ox, oy } = this.S.cfg;
    const EMOJIS = { torch: '🔥', lantern: '🏮', candle: '🕯️', magic: '✨' };
    Object.values(this.S.lights).forEach(({ gx, gy, type = 'torch' }) => {
      const px = ox + gx * pps, py = oy + gy * pps;
      const cx = px + pps / 2, cy = py + pps / 2;
      ctx.save();
      // Warm glow ring
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pps * 0.7);
      grad.addColorStop(0,   'rgba(255,200,60,0.35)');
      grad.addColorStop(0.6, 'rgba(255,160,20,0.18)');
      grad.addColorStop(1,   'rgba(255,140,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, pps * 0.7, 0, Math.PI * 2); ctx.fill();
      // Gold border ring
      ctx.beginPath(); ctx.arc(cx, cy, pps * 0.44, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,180,40,0.70)'; ctx.lineWidth = 1.5 / this.vs; ctx.stroke();
      // Emoji
      ctx.font = `${Math.max(12, pps * 0.52)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(EMOJIS[type] || '🔥', cx, cy);
      ctx.restore();
    });
  }

  _rTriggers() {
    const { ctx } = this;
    const { pps, ox, oy } = this.S.cfg;
    Object.entries(this.S.triggers).forEach(([k, t]) => {
      const { gx, gy } = kp(k);
      const px = ox + gx * pps, py = oy + gy * pps;
      ctx.fillStyle = t.fired ? TRIG_FIRED : TRIG_FILL; ctx.fillRect(px, py, pps, pps);
      ctx.font = `${pps * 0.4}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚠', px + pps / 2, py + pps / 2);
      if (t.label) {
        ctx.fillStyle = 'rgba(255,220,0,0.9)';
        ctx.font = `bold ${Math.max(8, pps * 0.15)}px Arial`;
        ctx.fillText(t.label, px + pps / 2, py + pps * 0.88);
      }
    });
  }

  _rRuler() {
    if (this.L.mode !== 'ruler' || !this.L.rulerA) return;
    const { ctx } = this;
    const { pps } = this.S.cfg;
    const a = this.L.rulerA, b = this.L.rulerB || this.L.mw;
    const dx = (b.x - a.x) / pps, dy = (b.y - a.y) / pps;
    const ft = Math.round(Math.sqrt(dx * dx + dy * dy) * FT_PER_SQ);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,0,0.9)'; ctx.lineWidth = 2 / this.vs;
    ctx.setLineDash([8 / this.vs, 4 / this.vs]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
    [a, b].forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4 / this.vs, 0, Math.PI * 2); ctx.fillStyle = '#f1c40f'; ctx.fill(); });
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const fs = Math.max(10, 13 / this.vs);
    ctx.font = `bold ${fs}px Arial`;
    const tw = ctx.measureText(`${ft} ft`).width;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(mx - tw / 2 - 4 / this.vs, my - fs - 3 / this.vs, tw + 8 / this.vs, fs + 6 / this.vs);
    ctx.fillStyle = '#f1c40f'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${ft} ft`, mx, my + 2 / this.vs);
    ctx.restore();
  }

  _rAoe() {
    if (this.L.mode !== 'aoe') return;
    const { ctx } = this;
    const { pps } = this.S.cfg;
    const pos = this.L.mw, shape = this.L.aoeShape;
    const rPx = (this.L.aoeR / FT_PER_SQ) * pps;
    const col = AOE_COLS[shape] || AOE_COLS.circle;
    const bord = col.replace(/[\d.]+\)$/, '0.9)');
    ctx.save();
    ctx.fillStyle = col; ctx.strokeStyle = bord; ctx.lineWidth = 2 / this.vs;
    if (shape === 'circle') { ctx.beginPath(); ctx.arc(pos.x, pos.y, rPx, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    else if (shape === 'cube') { ctx.fillRect(pos.x - rPx, pos.y - rPx, rPx * 2, rPx * 2); ctx.strokeRect(pos.x - rPx, pos.y - rPx, rPx * 2, rPx * 2); }
    else if (shape === 'cone') {
      const ang = Math.atan2(pos.y - (this.L.rulerA?.y || pos.y - 1), pos.x - (this.L.rulerA?.x || pos.x));
      const origin = this.L.rulerA || { x: pos.x, y: pos.y - rPx };
      ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.arc(origin.x, origin.y, rPx, ang - Math.PI / 6, ang + Math.PI / 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (shape === 'line') {
      const lw = pps * 0.5;
      ctx.fillRect(pos.x - lw / 2, pos.y - rPx, lw, rPx * 2); ctx.strokeRect(pos.x - lw / 2, pos.y - rPx, lw, rPx * 2);
    }
    const fs = Math.max(9, 11 / this.vs);
    ctx.fillStyle = 'white'; ctx.font = `bold ${fs}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${this.L.aoeR}ft`, pos.x, pos.y - rPx - 3 / this.vs);
    ctx.restore();
  }

  // ── Weather ───────────────────────────────────────────────────────────
  _initWx(W, H) {
    if (this.L.wx) return;
    const rng = (min, max) => min + Math.random() * (max - min);
    const rain   = Array.from({ length: 280 }, () => ({ x: Math.random() * W, y: Math.random() * H, vy: rng(10, 20), vx: rng(-2, -0.5), len: rng(8, 18), alpha: rng(0.3, 0.7), w: rng(0.5, 1.5) }));
    const snow   = Array.from({ length: 220 }, () => ({ x: Math.random() * W, y: Math.random() * H, vy: rng(0.8, 2.5), vx: rng(-0.8, 0.8), r: rng(1, 3.5), alpha: rng(0.5, 0.95), drift: rng(0.5, 2), driftPhase: Math.random() * Math.PI * 2 }));
    const wisps  = Array.from({ length: 12 },  () => ({ x: Math.random() * W, y: rng(H * 0.1, H * 0.9), vx: rng(0.12, 0.35) * (Math.random() < 0.5 ? -1 : 1), vy: rng(-0.04, 0.04), rx: rng(60, 130), ry: rng(20, 45), alpha: rng(0.04, 0.11), phase: Math.random() * Math.PI * 2 }));
    const embers = Array.from({ length: 140 }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: rng(2, 6), vy: rng(-1.5, 1.5), r: rng(1, 2.5), alpha: rng(0.4, 0.85), life: Math.random() }));
    this.L.wx = { rain, snow, wisps, embers, lt: 0 };
  }

  _rWeather() {
    const a = this.S.atmosphere;
    if (!a || a.weather === 'none') {
      if (a?.ambientLight === 'dark')  { this.ctx.fillStyle = 'rgba(0,0,0,0.65)'; this.ctx.fillRect(0, 0, this.cv.width, this.cv.height); }
      else if (a?.ambientLight === 'dim') { this.ctx.fillStyle = 'rgba(0,0,0,0.32)'; this.ctx.fillRect(0, 0, this.cv.width, this.cv.height); }
      return;
    }
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx;
    const now = Date.now();
    this._initWx(W, H);
    const wx = this.L.wx;
    switch (a.weather) {
      case 'light_rain': this._rRain(ctx, W, H, wx.rain, now, 0.38, '#8ab4cc', 80);  break;
      case 'heavy_rain': this._rRain(ctx, W, H, wx.rain, now, 0.62, '#6080a8', 280); this._rLightning(ctx, W, H, now); break;
      case 'blizzard':   this._rSnowSD(ctx, W, H, wx.snow, now); break;
      case 'sandstorm':  ctx.fillStyle = 'rgba(200,150,50,0.32)'; ctx.fillRect(0, 0, W, H); this._rEmbers(ctx, W, H, wx.embers); break;
      case 'fog':        this._rFogWisps(ctx, W, H, wx.wisps, now); break;
      case 'darkness':   ctx.fillStyle = 'rgba(0,0,20,0.80)'; ctx.fillRect(0, 0, W, H); break;
    }
    if (a.ambientLight === 'dark')  { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H); }
    else if (a.ambientLight === 'dim') { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 0, W, H); }
    if (a.weather !== 'none' && a.weather !== 'darkness') this._dirty();
  }

  _rRain(ctx, W, H, pool, now, baseAlpha, col, count) {
    ctx.save(); ctx.strokeStyle = col;
    for (let i = 0; i < count && i < pool.length; i++) {
      const p = pool[i]; p.x = (p.x + p.vx + W) % W; p.y = (p.y + p.vy + H) % H;
      ctx.globalAlpha = p.alpha * baseAlpha; ctx.lineWidth = p.w;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * p.len / p.vy, p.y + p.len); ctx.stroke();
    }
    ctx.restore();
  }
  _rLightning(ctx, W, H, now) {
    if (!this.L.wx) return;
    const wx = this.L.wx;
    if (Math.random() < 0.0017) wx.lt = now;
    const age = now - wx.lt;
    if (age < 80) { const f = age < 20 ? 0.35 : age < 50 ? 0.18 : 0.08; ctx.fillStyle = `rgba(220,230,255,${f})`; ctx.fillRect(0, 0, W, H); }
  }
  _rSnowSD(ctx, W, H, pool, now) {
    ctx.save(); ctx.fillStyle = 'rgba(240,246,255,1)';
    for (const p of pool) { p.x = (p.x + p.vx + Math.sin(now * 0.001 * p.drift + p.driftPhase) * 0.8 + W) % W; p.y = (p.y + p.vy + H) % H; ctx.globalAlpha = p.alpha; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  _rFogWisps(ctx, W, H, pool, now) {
    ctx.fillStyle = 'rgba(195,210,220,0.40)'; ctx.fillRect(0, 0, W, H); ctx.save();
    for (const p of pool) {
      p.x = (p.x + p.vx + W * 2) % (W * 1.4) - W * 0.2; p.y += Math.sin(now * 0.0003 + p.phase) * 0.15;
      const breathe = 0.5 + 0.5 * Math.sin(now * 0.0008 + p.phase); const a = p.alpha * (0.6 + 0.4 * breathe);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.rx); g.addColorStop(0, `rgba(210,220,228,${a})`); g.addColorStop(1, 'rgba(210,220,228,0)');
      ctx.fillStyle = g; ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, p.ry / p.rx); ctx.translate(-p.x, -p.y); ctx.beginPath(); ctx.arc(p.x, p.y, p.rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }
  _rEmbers(ctx, W, H, pool) {
    ctx.save();
    for (const p of pool) {
      p.x = (p.x + p.vx + W) % W; p.y = (p.y + p.vy + H) % H; p.life = (p.life + 0.008) % 1;
      const a = p.alpha * Math.sin(p.life * Math.PI);
      ctx.globalAlpha = a; ctx.shadowColor = 'rgba(255,160,40,0.8)'; ctx.shadowBlur = 4;
      ctx.fillStyle = 'rgba(255,180,60,1)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 2, p.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  _rModeHUD() {
    if (this.userRole !== 'dm') return;
    const { ctx, cv } = this; const m = this.L.mode; if (m === 'view') return;
    const labels = { obstacle: '🧱 Painting Obstacles', trigger: '⚠️ Placing Triggers', fogReveal: '🌟 Revealing Fog', fogHide: '🌑 Hiding Fog', ruler: '📏 Measuring', aoe: '💥 AOE Template', calibrate: '🔲 Calibrating Grid', light: '🕯️ Placing Lights' };
    const label = labels[m] || m;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(cv.width / 2 - 120, 6, 240, 32);
    ctx.strokeStyle = 'rgba(241,196,15,0.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(cv.width / 2 - 120, 6, 240, 32);
    ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cv.width / 2, 22);
  }

  startIris(phase = 'open') { this.L.iris = { start: Date.now(), phase }; this._dirty(); }

  _rIris() {
    const iris = this.L.iris; if (!iris) return;
    const W = this.cv.width, H = this.cv.height; const ctx = this.ctx;
    const maxR = Math.hypot(W, H) / 2 + 20; const DUR = 900;
    const elapsed = Date.now() - iris.start; const t = Math.min(1, elapsed / DUR);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const r = iris.phase === 'open' ? maxR * ease : maxR * (1 - ease);
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,1)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.max(0, r), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (elapsed < DUR) this._dirty(); else this.L.iris = null;
  }

  // ── Public API ────────────────────────────────────────────────────────
  _revealCell(gx, gy, r = 1) {
    const cells = {};
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= r) cells[ck(gx + dx, gy + dy)] = true;
    }
    if (this.localOnly) { Object.assign(this.S.fog, cells); this._dirty(); return; }
    if (!this.db) return;
    this.db.revealFogCells(this.activeRoom, this.S.activeScene, cells);
  }

  _hideCell(gx, gy) {
    if (this.localOnly) { delete this.S.fog[ck(gx, gy)]; this._dirty(); return; }
    if (!this.db) return;
    this.db.hideFogCell(this.activeRoom, this.S.activeScene, ck(gx, gy));
  }

  revealAll() {
    if (!this.db) return;
    const { mapW: mw, mapH: mh } = this.S.cfg;
    const cells = {};
    for (let gx = 0; gx < (mw ?? MAP_W_DEFAULT); gx++) for (let gy = 0; gy < (mh ?? MAP_H_DEFAULT); gy++) cells[ck(gx, gy)] = true;
    this.db.revealFogCells(this.activeRoom, this.S.activeScene, cells);
  }

  hideAll()           { if (this.db) this.db.resetFog(this.activeRoom, this.S.activeScene); }
  getBgTileCount()    { if (this.L.mode !== 'phantom') return null; const fit = this._getBgFit(); const { pps } = this.S.cfg; return { cols: Math.max(1, Math.floor(fit.w / pps)), rows: Math.max(1, Math.floor(fit.h / pps)) }; }

  _loadBg(url) {
    // Reject YouTube URLs — those must go through loadBgVideo(), not here
    if (/youtu\.?be/i.test(url)) {
      if (typeof window.showToast === 'function') window.showToast('Use the Animated (YouTube) option in the Scene Wizard for YouTube links.', 'warning');
      this.L.bgLoading = false;
      return;
    }
    // Keep the old image visible while the new one loads (prevents checkerboard flash)
    this.L.bgLoading = true;

    // Try CORS-safe first (keeps canvas un-tainted). If server has no CORS headers, retry
    // without crossOrigin so the image still displays (canvas reads will be disabled but
    // we never read pixels from the background).
    const _try = (withCors) => {
      const img = new Image();
      if (withCors) img.crossOrigin = 'anonymous';
      img.onload  = () => { this.L.bg = img; this.L.bgLoading = false; this._dirty(); };
      img.onerror = () => {
        if (withCors) { _try(false); return; } // silent CORS fallback
        this.L.bgLoading = false;
        if (typeof window.showToast === 'function') window.showToast('Could not load background image — check the URL.', 'warning');
        this._dirty();
      };
      img.src = url;
    };
    _try(true);
  }

  loadBgUrl(url) {
    this._video?.unload();
    this.S.cfg.bgVideoUrl = '';
    this._loadBg(url);
    if (this.db) this.db.setMapCfg(this.activeRoom, { ...this.S.cfg, bgUrl: url, bgVideoUrl: '' });
  }

  loadBgVideo(url) {
    this.L.bg = null;
    this.S.cfg.bgVideoUrl = url;
    this.S.cfg.bgUrl      = '';
    this._video?.load(url);
    if (this.db) this.db.setMapCfg(this.activeRoom, { ...this.S.cfg, bgUrl: '', bgVideoUrl: url });
  }

  loadBgFile(file){ const r = new FileReader(); r.onload = e => { const img = new Image(); img.onload = () => { this.L.bg = img; this._dirty(); }; img.src = e.target.result; }; r.readAsDataURL(file); }

  /** Allow callers (e.g. player UI) to declare pixel insets for overlay panels,
   *  so the map's min-zoom and pan limits respect the truly visible area. */
  setViewportInsets(insets) {
    this._insets = { ...this._insets, ...insets };
    this._dirty();
  }

  /** Zoom and center the map so it fills the usable viewport exactly (max zoom-out view). */
  fitToView() {
    const ins = this._insets;
    const W = this.cv.width, H = this.cv.height;
    const { ox, oy, pps, mapW, mapH } = this.S.cfg;
    const usableW = Math.max(1, W - ins.left - ins.right);
    const usableH = Math.max(1, H - ins.top  - ins.bottom);
    // Math.max = "cover" behaviour: whichever axis fills the usable area, the map fills the screen.
    const vsFill = Math.max(
      usableW / Math.max(1, (mapW ?? MAP_W_DEFAULT) * pps),
      usableH / Math.max(1, (mapH ?? MAP_H_DEFAULT) * pps)
    );
    this.vs = vsFill;
    const mW  = (mapW  || MAP_W_DEFAULT) * pps * this.vs;
    const mH  = (mapH  || MAP_H_DEFAULT) * pps * this.vs;
    const oxS = ox * this.vs, oyS = oy * this.vs;
    // Center within usable area (excess will be off-screen, pannable)
    this.vx = ins.left + (usableW - mW) / 2 - oxS;
    this.vy = ins.top  + (usableH - mH) / 2 - oyS;
    this._dirty();
  }

  /** Clamp vx/vy so the map never slides fully outside the usable (non-overlay) area.
   *  Insets allow the edge of the map to reach the inner edge of the overlay. */
  _clampPan() {
    const ins = this._insets;
    const W = this.cv.width, H = this.cv.height;
    const { ox, oy, pps, mapW, mapH } = this.S.cfg;
    const mW = (mapW ?? MAP_W_DEFAULT) * pps * this.vs;
    const mH = (mapH ?? MAP_H_DEFAULT) * pps * this.vs;
    const oxS = ox * this.vs, oyS = oy * this.vs;
    // Allow panning so the map edge can reach just inside the usable (non-overlay) area
    const vxMax = -oxS + ins.left;
    const vxMin = (W - ins.right) - oxS - mW;
    const vyMax = -oyS + ins.top;
    const vyMin = (H - ins.bottom) - oyS - mH;
    this.vx = Math.min(vxMax, Math.max(vxMin, this.vx));
    this.vy = Math.min(vyMax, Math.max(vyMin, this.vy));
  }

  /** Pan the map to center on a specific token. */
  panToToken(cn) {
    const tk = this.S.tokens?.[cn];
    if (!tk) return;
    const { pps, ox, oy } = this.S.cfg;
    const cx = ox + (tk.gx + 0.5) * pps;
    const cy = oy + (tk.gy + 0.5) * pps;
    this.vx = this.cv.width / 2 - cx * this.vs;
    this.vy = this.cv.height / 2 - cy * this.vs;
    this._clampPan();
    this._dirty();
  }

  nudgeGrid(dpps, dox, doy) {
    if (this.S.cfg.locked) return;
    const pps = Math.min(MAX_PPS, Math.max(MIN_PPS, this.S.cfg.pps + (dpps || 0)));
    this.S.cfg = { ...this.S.cfg, pps, ox: this.S.cfg.ox + (dox || 0), oy: this.S.cfg.oy + (doy || 0) };
    this._dirty();
  }

  lockGrid()          { if (this.db) this.db.setMapCfg(this.activeRoom, { ...this.S.cfg, locked: true }); }
  unlockGrid()        { if (this.db) this.db.setMapCfg(this.activeRoom, { ...this.S.cfg, locked: false }); }
  saveGridToFirebase(){ if (this.db) this.db.setMapCfg(this.activeRoom, this.S.cfg); }

  placeToken(cn, gx, gy) {
    if (!this.db) return;
    // Optional collision guard — block placement if any footprint cell is occupied
    if (this.S.cfg.collisionEnabled) {
      const ts = getTileSize(this.S.players[cn]?.size);
      const blocked = Object.entries(this.S.tokens).some(([name, t]) => {
        if (name === cn) return false;
        const ots = getTileSize(this.S.players[name]?.size);
        return footprintsOverlap(gx, gy, ts, t.gx, t.gy, ots);
      });
      if (blocked) {
        if (typeof window.showToast === 'function') window.showToast('Cell occupied — collision enforcement is on.', 'warning');
        return;
      }
    }
    // Optimistic local update so the token renders immediately (before Firebase echoes back)
    this.S.tokens[cn] = { ...(this.S.tokens[cn] || {}), gx, gy, usedMv: 0 };
    this.db.moveMapToken(this.activeRoom, cn, gx, gy, 0);
    this.visibility.revealForToken(cn, gx, gy);
    this._dirty();
  }

  removeToken(cn)      { if (this.db) { this.db.removeMapToken(this.activeRoom, cn); this._dirty(); } }
  resetAllMovement()   { if (this.db) Object.keys(this.S.tokens).forEach(cn => this.db.resetTokenMv(this.activeRoom, cn)); }

  createScene(name, bgUrl = '') {
    if (!this.db) return;
    const sid = 'scene_' + Date.now();
    this.db.saveScene(this.activeRoom, sid, { name, config: { ...this.S.cfg, bgUrl } });
    this.db.setActiveScene(this.activeRoom, sid);
    return sid;
  }

  loadScene(sid) { if (this.db) this.db.setActiveScene(this.activeRoom, sid); }

  setAtmosphere(a) { this.S.atmosphere = { ...this.S.atmosphere, ...(a || {}) }; this._dirty(); }
  setMode(m)       { this.L.mode = m; this._dirty(); }
  setTool(t)       { this.L.tool = t; }
  setAoeShape(s)   { this.L.aoeShape = s; this._dirty(); }
  setAoeRadius(r)  { this.L.aoeR = r; this._dirty(); }
  startPlacing(cn) { this.L.placing = cn; this.L.mode = 'view'; this._dirty(); }
  cancelPlacing()  { this.L.placing = null; this._dirty(); }
  resize(w, h)     { this.cv.width = w; this.cv.height = h; this.fw.width = w; this.fw.height = h; this._dirty(); }

  _updateDashTokenList() { this.tokens.updateDashTokenList(); }
}
