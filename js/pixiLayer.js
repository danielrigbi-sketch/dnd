// js/pixiLayer.js — PixiJS v8 GPU Renderer  (E2-A/B/C)
//
// Hybrid architecture: PixiJS WebGL overlay canvas handles
// token sprites + combat particles. Canvas 2D handles grid/fog/AoE.
//
// This gives GPU-accelerated rendering where it matters (many tokens,
// glow effects, particle bursts) with zero risk to existing Canvas 2D code.
//
// License: pixi.js (MIT)

import {
  Application, Assets, Sprite, Graphics, Container,
  Filter, BlurFilter, ColorMatrixFilter,
  Text, TextStyle, Ticker, ParticleContainer,
  Texture, RenderTexture, ImageSource,
} from 'pixi.js';
import { getTileSize, getVisualScale, footprintsOverlap } from './engine/sizeUtils.js';

// ── Constants ────────────────────────────────────────────────────────
const GLOW_COLOR    = 0xf1c40f;
const DEAD_TINT     = 0x442222;
const GHOST_ALPHA   = 0.45;
const PARTICLE_LIFE = 900;   // ms

// ── Particle palette ─────────────────────────────────────────────────
const HIT_COLORS    = [0xe74c3c, 0xc0392b, 0xff6b6b, 0xffffff];
const HEAL_COLORS   = [0x2ecc71, 0x27ae60, 0x55efc4, 0xffffff];
const SPELL_COLORS  = [0x9b59b6, 0x8e44ad, 0xd7bde2, 0xffffff];
const CRIT_COLORS   = [0xf39c12, 0xe67e22, 0xffd700, 0xffffff];

// ──────────────────────────────────────────────────────────────────────

export class PixiLayer {
  constructor() {
    this._app         = null;
    this._ready       = false;
    this._tokens      = new Map();   // cName → { container, portrait, ring, ... }
    this._particles   = [];          // active particle emitters
    this._textCache   = new Map();   // texture URL → Texture
    this._root        = null;        // root Container (world-space transform)
    this._particleRoot = null;       // screen-space particle overlay
    this._canvas      = null;        // the PixiJS canvas element
    this._dirtyFn     = null;        // callback → mapEngine._dirty()
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Initialize PixiJS and attach canvas to the map container.
   * @param {HTMLElement} container — the #map-canvas-container element
   */
  async init(container) {
    if (this._ready) return;

    this._app = new Application();
    await this._app.init({
      width:           container.clientWidth  || 800,
      height:          container.clientHeight || 600,
      backgroundAlpha: 0,          // transparent — Canvas 2D shows beneath
      antialias:       true,
      resolution:      Math.min(window.devicePixelRatio || 1, 2),
      autoDensity:     true,
      preference:      'webgl',    // request WebGL; falls back to Canvas if unavailable
    });

    this._canvas = this._app.canvas;
    this._canvas.style.cssText = [
      'position:absolute', 'top:0', 'left:0',
      'width:100%', 'height:100%',
      'pointer-events:none',       // Canvas 2D handles all input
      'z-index:2',                 // above map (z=1), below fog (z=3)
    ].join(';');
    container.appendChild(this._canvas);

    // World-space root (receives same translate+scale as Canvas 2D vx/vy/vs)
    this._root = new Container();
    this._app.stage.addChild(this._root);

    // Screen-space particle layer (not affected by pan/zoom)
    this._particleRoot = new Container();
    this._app.stage.addChild(this._particleRoot);

    // Ticker for particles — starts stopped, runs only when particles are active
    this._app.ticker.add(() => this._tick());
    this._app.ticker.stop();

    // Handle resize
    this._ro = new ResizeObserver(() => this._resize(container));
    this._ro.observe(container);

    this._ready = true;
  }

  get isReady() { return this._ready; }

  destroy() {
    this._ro?.disconnect();
    this._app?.destroy(true);
    this._ready = false;
  }

  /** Highlight a token with a pulsing cyan ring (auto-clears after 3s). */
  highlightToken(cn) {
    this._highlightName = cn;
    if (this._dirtyFn) this._dirtyFn();
    clearTimeout(this._hlTimer);
    this._hlTimer = setTimeout(() => { this._highlightName = null; if (this._dirtyFn) this._dirtyFn(); }, 3000);
  }

  // ── Sync API (called each frame by mapEngine) ──────────────────────

  /**
   * Sync the PixiJS view transform with mapEngine pan/zoom.
   * @param {number} vx — mapEngine this.vx
   * @param {number} vy — mapEngine this.vy
   * @param {number} vs — mapEngine this.vs
   */
  setTransform(vx, vy, vs) {
    if (!this._ready) return;
    this._root.x = vx;
    this._root.y = vy;
    this._root.scale.set(vs);
  }

  /**
   * Sync all token sprites from mapEngine state.
   * Call this after Canvas 2D tokens are drawn to overlay GPU tokens.
   *
   * @param {object} tokens   — mapEngine S.tokens { cName: {gx,gy,usedMv} }
   * @param {object} players  — mapEngine S.players { cName: {portrait, pColor, hp, maxHp, ...} }
   * @param {string} activeName — name of token whose turn it is
   * @param {object} cfg      — mapEngine S.cfg { pps, ox, oy }
   * @param {string} draggingName — token being dragged (rendered ghost, skip normal)
   */
  syncTokens(tokens, players, activeName, cfg, draggingName, dirtyFn) {
    if (!this._ready) return;
    if (dirtyFn) this._dirtyFn = dirtyFn;
    const { pps, ox, oy } = cfg;

    // Remove tokens that no longer exist
    for (const [cn, obj] of this._tokens) {
      if (!tokens[cn]) {
        this._root.removeChild(obj.container);
        obj.container.destroy({ children: true, texture: false });
        this._tokens.delete(cn);
      }
    }

    // Pass 1: compute token screen centres for label offset calculation
    const _centres = {};
    for (const [cn, tk] of Object.entries(tokens)) {
      const pl = players[cn] || {};
      const tileSize    = getTileSize(pl.size);
      const visualScale = getVisualScale(pl.size);
      const renderSize  = Math.round(tileSize * pps * visualScale);
      const tinyOff = tileSize === 1 ? Math.round((pps - renderSize) / 2) : 0;
      _centres[cn] = {
        cx: ox + tk.gx * pps + tinyOff + renderSize / 2,
        cy: oy + tk.gy * pps + tinyOff + renderSize / 2,
        size: renderSize,
      };
    }

    // Pass 2: for each token, compute a label direction vector that pushes away from neighbours
    const _labelOffsets = {};
    for (const cn of Object.keys(tokens)) {
      const { cx, cy } = _centres[cn];
      let fdx = 0, fdy = 0;
      for (const [other, { cx: ocx, cy: ocy }] of Object.entries(_centres)) {
        if (other === cn) continue;
        const ddx = cx - ocx, ddy = cy - ocy;
        const dist = Math.hypot(ddx, ddy);
        const threshold = pps * 2.5;
        if (dist < threshold && dist > 0) {
          const w = 1 - dist / threshold; // stronger push when closer
          fdx += (ddx / dist) * w;
          fdy += (ddy / dist) * w;
        }
      }
      // Bias toward straight-down so label stays below when no neighbours
      fdy += 0.6;
      const len = Math.hypot(fdx, fdy) || 1;
      _labelOffsets[cn] = { dx: fdx / len, dy: fdy / len, extra: 0 };
    }

    // Pass 2b: push overlapping labels further apart
    const names = Object.keys(tokens);
    for (let a = 0; a < names.length; a++) {
      for (let b = a + 1; b < names.length; b++) {
        const ca = _centres[names[a]], cb = _centres[names[b]];
        if (!ca || !cb) continue;
        const dist = Math.hypot(ca.cx - cb.cx, ca.cy - cb.cy);
        if (dist < pps * 1.5) {
          // Labels likely overlap — nudge both further out (use pps-relative offset)
          const nudge = pps * 0.2;
          _labelOffsets[names[a]].extra = Math.max(_labelOffsets[names[a]].extra, nudge);
          _labelOffsets[names[b]].extra = Math.max(_labelOffsets[names[b]].extra, nudge);
        }
      }
    }

    // Pass 3: create or update each token sprite
    for (const [cn, tk] of Object.entries(tokens)) {
      const pl = players[cn] || {};
      const isActive = cn === activeName;
      const isGhost  = cn === draggingName;
      // Only "dying" when hp is explicitly a number set to 0 — avoids false positives on fresh tokens
      const isDying  = typeof pl.hp === 'number' && pl.maxHp > 0 && pl.hp <= 0;

      // Multi-tile sizing
      const tileSize   = getTileSize(pl.size);
      const visualScale = getVisualScale(pl.size);
      const renderSize  = Math.round(tileSize * pps * visualScale);
      // Tiny: centre within the 1-tile cell
      const tinyOff = tileSize === 1 ? Math.round((pps - renderSize) / 2) : 0;
      const px = ox + tk.gx * pps + tinyOff;
      const py = oy + tk.gy * pps + tinyOff;

      // Stacking badge: count other tokens at same anchor cell
      const stackCount = Object.values(tokens).filter(
        other => other !== tk && other.gx === tk.gx && other.gy === tk.gy
      ).length;

      if (!this._tokens.has(cn)) {
        this._tokens.set(cn, this._createTokenSprite(cn, pl, renderSize));
      }

      const obj = this._tokens.get(cn);
      // Recreate sprite if renderSize changed (size category changed)
      if (obj.size !== renderSize) {
        this._root.removeChild(obj.container);
        obj.container.destroy({ children: true });
        this._tokens.set(cn, this._createTokenSprite(cn, pl, renderSize));
      }

      this._updateTokenSprite(this._tokens.get(cn), cn, pl, tk, px, py, renderSize, isActive, isGhost, isDying, stackCount, _labelOffsets[cn]);
    }
  }

  // ── Particle effects (E2-C) ────────────────────────────────────────

  /**
   * Burst particles at a grid cell (world-space).
   * @param {number} wx  — pixel X (world space)
   * @param {number} wy  — pixel Y (world space)
   * @param {'hit'|'heal'|'spell'|'crit'} type
   * @param {string|number} [label] — damage number or text
   */
  emitParticles(wx, wy, type = 'hit', label = '') {
    if (!this._ready) return;

    // Convert world-space to screen-space using current root transform
    const sx = this._root.x + wx * this._root.scale.x;
    const sy = this._root.y + wy * this._root.scale.y;

    const palette = type === 'heal'  ? HEAL_COLORS
                  : type === 'spell' ? SPELL_COLORS
                  : type === 'crit'  ? CRIT_COLORS
                  :                    HIT_COLORS;

    // Spawn 12 radial sparks
    const count = type === 'crit' ? 20 : 12;
    for (let i = 0; i < count; i++) {
      this._spawnSpark(sx, sy, palette, type);
    }

    // Floating damage number
    if (label) {
      this._spawnDamageNumber(sx, sy, String(label), palette[0], type);
    }

    // Ensure ticker is running while particles are active
    if (!this._app.ticker.started) this._app.ticker.start();
  }

  /**
   * Call from mapEngine when a token's HP changes.
   * Automatically chooses particle type.
   *
   * @param {string} cName
   * @param {number} oldHp
   * @param {number} newHp
   * @param {object} cfg — mapEngine S.cfg
   * @param {object} token — mapEngine S.tokens[cName]
   */
  onHPChange(cName, oldHp, newHp, cfg, token) {
    if (!this._ready || !token) return;
    const { pps, ox, oy } = cfg;
    const cx = ox + (token.gx + 0.5) * pps;
    const cy = oy + (token.gy + 0.5) * pps;
    const delta = newHp - oldHp;
    if (delta === 0) return;
    const type = delta > 0 ? 'heal' : (Math.abs(delta) >= 10 ? 'crit' : 'hit');
    this.emitParticles(cx, cy, type, delta > 0 ? `+${delta}` : `${delta}`);
  }

  // ── Private: Token sprites ─────────────────────────────────────────

  _createTokenSprite(cn, pl, size) {
    const container = new Container();

    // Drop shadow disc
    const shadow = new Graphics();
    container.addChild(shadow);

    // Glow ring (behind portrait)
    const glow = new Graphics();
    container.addChild(glow);

    // Portrait sprite (circle clipped via mask)
    const portrait = new Sprite(Texture.WHITE);
    portrait.width = size;
    portrait.height = size;
    const mask = new Graphics();
    mask.circle(size / 2, size / 2, size * 0.44).fill(0xffffff);
    portrait.mask = mask;
    container.addChild(mask);
    container.addChild(portrait);

    // Initial-letter fallback (shown when no portrait image)
    const initialText = new Text({ text: '', style: new TextStyle({
      fontFamily: 'Arial', fontSize: Math.max(20, size * 0.42),
      fontWeight: 'bold', fill: 0xffffff,
      stroke: { color: 0x00000, width: 3 },
    })});
    initialText.anchor.set(0.5, 0.5);
    initialText.x = size / 2;
    initialText.y = size / 2;
    container.addChild(initialText);

    // HP bar (sits just below the disc, above the name pill)
    const hpBar = new Graphics();
    container.addChild(hpBar);

    // Leader line from token centre to label (shown when label is offset sideways)
    const leaderLine = new Graphics();
    container.addChild(leaderLine);

    // Name badge (pill background + text)
    const nameBadge = new Graphics();
    container.addChild(nameBadge);
    const nameText = new Text({ text: cn, style: new TextStyle({
      fontFamily: 'Arial', fontSize: Math.max(13, size * 0.22),
      fontWeight: 'bold', fill: 0xffffff,
      stroke: { color: 0x000000, width: 4 },
    })});
    nameText.anchor.set(0.5, 0.5);
    nameText.x = size / 2;
    nameText.y = size + 28;
    container.addChild(nameText);

    // Stacking badge (top-right corner)
    const stackBadge = new Graphics();
    container.addChild(stackBadge);
    const stackText = new Text({ text: '', style: new TextStyle({
      fontFamily: 'Arial', fontSize: Math.max(9, size * 0.18),
      fontWeight: 'bold', fill: 0xffffff,
    })});
    stackText.anchor.set(0.5, 0.5);
    container.addChild(stackText);

    this._root.addChild(container);
    return { container, shadow, glow, portrait, mask, initialText, hpBar, leaderLine, nameBadge, nameText, stackBadge, stackText, size, lastPortrait: null };
  }

  _updateTokenSprite(obj, cn, pl, tk, px, py, size, isActive, isGhost, isDying, stackCount = 0, labelOffset = { dx: 0, dy: 1 }) {
    const { container, shadow, glow, portrait, mask, initialText, hpBar, leaderLine, nameBadge, nameText, stackBadge, stackText } = obj;

    // vs = current map zoom; UI elements divided by vs so they stay constant screen-size
    const vs = Math.max(0.15, this._root.scale.x);

    container.x = px;
    container.y = py;
    container.alpha = isGhost ? GHOST_ALPHA : 1;

    // ── Drop shadow ──
    shadow.clear();
    shadow.circle(size / 2 + 3, size / 2 + 4, size * 0.44)
          .fill({ color: 0x000000, alpha: 0.45 });

    // ── Glow ring — stroke width is constant screen-pixels ──
    glow.clear();
    const isHighlighted = this._highlightName === cn;
    if (isHighlighted) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
      const r = size * 0.46 + 8 / vs;
      glow.circle(size / 2, size / 2, r)
          .fill({ color: 0x00e5ff, alpha: 0.15 + pulse * 0.15 });
      glow.circle(size / 2, size / 2, r)
          .stroke({ color: 0x00e5ff, alpha: 0.9, width: 4 / vs });
    } else if (isActive) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
      const r = size * 0.44 + 6 / vs;
      glow.circle(size / 2, size / 2, r)
          .fill({ color: GLOW_COLOR, alpha: 0.25 + pulse * 0.15 });
      glow.circle(size / 2, size / 2, r)
          .stroke({ color: GLOW_COLOR, alpha: 0.9, width: 3 / vs });
    } else {
      const col = _hexColor(pl.pColor || '#3498db');
      glow.circle(size / 2, size / 2, size * 0.44)
          .stroke({ color: isDying ? 0xe74c3c : col, alpha: 1, width: 3 / vs });
    }

    // ── Portrait texture ──
    const url = pl.portrait;
    // 2MT CDN has no CORS headers — uploading their images to WebGL throws a SecurityError.
    // Canvas2D (tokenSystem.js isTmt branch) handles 2MT portrait rendering entirely.
    // PixiJS provides only glow ring, HP bar, and name badge for these tokens.
    const isTmt = !!(url && url.includes('tools.2minutetabletop.com'));
    if (isTmt) {
      portrait.alpha = 0;
      if (url !== obj.lastPortrait) {
        obj.lastPortrait = url;
        obj._hasPortrait = false;
      }
    } else if (url && url !== obj.lastPortrait) {
      portrait.alpha = 1;
      obj.lastPortrait = url;
      obj._hasPortrait = false;
      const _loadImg = (withCors) => {
        const img = new Image();
        if (withCors) img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (!withCors) {
            // Image loaded without CORS — tainted for WebGL; keep letter fallback
            obj._hasPortrait = false;
            return;
          }
          try {
            const source = new ImageSource({ resource: img });
            const tex = new Texture({ source });
            portrait.texture = tex;
            portrait.width = size;
            portrait.height = size;
            mask.clear();
            mask.circle(size / 2, size / 2, size * 0.44).fill(0xffffff);
            obj._hasPortrait = true;
            this._dirtyFn?.(); // trigger re-render so portrait appears immediately
          } catch (_) {
            if (withCors) _loadImg(false); else obj._hasPortrait = false;
          }
        };
        img.onerror = () => {
          if (withCors) _loadImg(false); else obj._hasPortrait = false;
        };
        img.src = url;
      };
      _loadImg(true);
    } else if (!url) {
      portrait.alpha = 1;
      portrait.texture = Texture.WHITE;
      portrait.width = size;
      portrait.height = size;
    }

    // Tint: dying = dark red overlay; no portrait = player color disc; normal = no tint
    if (!isTmt) {
      if (isDying) {
        portrait.tint = DEAD_TINT;
      } else if (!obj._hasPortrait) {
        portrait.tint = _hexColor(pl.pColor || '#3498db');
      } else {
        portrait.tint = 0xffffff;
      }
    }

    // ── Initial letter (shown when no portrait and not a 2MT token) ──
    initialText.style.fontSize = Math.max(20, size * 0.42);
    if (obj._hasPortrait || isTmt) {
      initialText.visible = false;
    } else {
      // First letter of the token name, uppercased
      initialText.text = (cn[0] || '?').toUpperCase();
      initialText.x = size / 2;
      initialText.y = size / 2;
      initialText.visible = true;
    }

    // ── HP bar — height and gap are constant screen-pixels ──
    hpBar.clear();
    if (pl.maxHp) {
      const pct = Math.max(0, (pl.hp || 0) / pl.maxHp);
      const bh = Math.max(1, 7 / vs);        // always ~7 screen-px tall
      const bw = size * 0.84;
      const bx = (size - bw) / 2;
      const by = size + 3 / vs;              // 3px gap below disc
      const r  = bh / 2;
      hpBar.roundRect(bx, by, bw, bh, r).fill({ color: 0x000000, alpha: 0.70 });
      const barCol = pct > 0.5 ? 0x2ecc71 : pct > 0.25 ? 0xf39c12 : 0xe74c3c;
      hpBar.roundRect(bx, by, Math.max(bh, bw * pct), bh, r).fill(barCol);
    }

    // ── Name badge — font size and pill are constant screen-pixels ──
    const label = cn.length > 16 ? cn.slice(0, 15) + '…' : cn;
    if (nameText.text !== label) nameText.text = label;
    // Use integer font sizes for crisp rendering (avoid sub-pixel blur)
    const nameFontSz = Math.max(11, Math.round(13 / vs));
    if (Math.abs(nameText.style.fontSize - nameFontSz) > 0.4) nameText.style.fontSize = nameFontSz;
    // Label placement: disc-edge + constant screen gap + overlap nudge
    const labelRadius = size * 0.5 + 26 / vs + (labelOffset.extra || 0);
    const hpNudge     = pl.maxHp ? (10 / vs) : 0;
    const lx = size / 2 + labelOffset.dx * labelRadius;
    const ly = size / 2 + labelOffset.dy * labelRadius + hpNudge;
    nameText.x = lx;
    nameText.y = ly;
    // Pill behind text — padding in screen-px
    nameBadge.clear();
    const tw = nameText.width + 10 / vs, th = nameText.height + 6 / vs;
    nameBadge.roundRect(lx - tw / 2, ly - th / 2, tw, th, 5 / vs)
             .fill({ color: 0x000000, alpha: 0.82 });
    // Leader line — visible when label is pushed sideways
    leaderLine.clear();
    const isDefaultPos = Math.abs(labelOffset.dx) < 0.15 && labelOffset.dy > 0.7;
    if (!isDefaultPos) {
      leaderLine.moveTo(size / 2, size / 2)
                .lineTo(lx, ly)
                .stroke({ color: 0xffffff, alpha: 0.35, width: 1.5 / vs });
    }

    // ── Stacking badge — constant screen size ──
    stackBadge.clear();
    if (stackCount > 0) {
      const slabel = `×${stackCount + 1}`;
      stackText.text = slabel;
      const stackFontSz = Math.round((10 / vs) * 2) / 2;
      if (Math.abs(stackText.style.fontSize - stackFontSz) > 0.4) stackText.style.fontSize = stackFontSz;
      const sw = stackText.width + 6 / vs, sh = stackText.height + 4 / vs;
      const sx = size - sw - 2 / vs, sy = 2 / vs;
      stackBadge.roundRect(sx, sy, sw, sh, 3 / vs).fill({ color: 0xc0392b, alpha: 0.92 });
      stackText.x = sx + sw / 2;
      stackText.y = sy + sh / 2;
      stackText.visible = true;
    } else {
      stackText.visible = false;
    }

    // Request re-render if active (pulsing glow)
    if (isActive) this._dirty = true;
  }

  // ── Private: Particles ─────────────────────────────────────────────

  _spawnSpark(sx, sy, palette, type) {
    const g = new Graphics();
    const col = palette[Math.floor(Math.random() * palette.length)];
    const r = 3 + Math.random() * 3;
    g.circle(0, 0, r).fill(col);
    g.x = sx; g.y = sy;
    this._particleRoot.addChild(g);

    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 100;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - (type === 'heal' ? 40 : 0);
    const born = Date.now();
    const life = PARTICLE_LIFE * (0.7 + Math.random() * 0.6);

    this._particles.push({
      g, vx, vy, born, life,
      gravity: type === 'heal' ? -60 : 120,
    });
  }

  _spawnDamageNumber(sx, sy, label, color, type) {
    const style = new TextStyle({
      fontFamily: 'Arial', fontWeight: 'bold',
      fontSize: type === 'crit' ? 28 : 20,
      fill: color, stroke: { color: 0x000000, width: 3 },
    });
    const t = new Text({ text: label, style });
    t.anchor.set(0.5);
    t.x = sx + (Math.random() - 0.5) * 20;
    t.y = sy;
    this._particleRoot.addChild(t);

    const born = Date.now();
    const life = PARTICLE_LIFE * 1.2;
    this._particles.push({
      g: t, vx: (Math.random() - 0.5) * 30, vy: -80,
      born, life, gravity: 30, isLabel: true,
    });
  }

  // ── Ticker ─────────────────────────────────────────────────────────

  _tick() {
    const now = Date.now();
    this._particles = this._particles.filter(p => {
      const elapsed = now - p.born;
      if (elapsed >= p.life) {
        this._particleRoot.removeChild(p.g);
        p.g.destroy();
        return false;
      }
      const dt = this._app.ticker.deltaMS / 1000;
      p.vx *= 0.96;
      p.vy += (p.gravity || 120) * dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.g.alpha = 1 - elapsed / p.life;
      if (!p.isLabel) p.g.scale.set(1 - elapsed / p.life * 0.5);
      return true;
    });

    // Stop ticker when no more particles to save CPU
    if (this._particles.length === 0) {
      this._dirty = false;
      this._app.ticker.stop();
    }
  }

  /** Force PixiJS to render the current scene tree to its canvas.
   *  Must be called each frame — the ticker is stopped by default (only runs for particles). */
  renderFrame() {
    if (!this._ready) return;
    this._app.renderer.render(this._app.stage);
  }

  _resize(container) {
    if (!this._ready) return;
    this._app.renderer.resize(container.clientWidth, container.clientHeight);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Convert CSS hex color string to PIXI numeric color */
function _hexColor(cssHex) {
  const hex = cssHex.replace('#', '');
  return parseInt(hex.length === 3
    ? hex.split('').map(c => c + c).join('')
    : hex, 16);
}
