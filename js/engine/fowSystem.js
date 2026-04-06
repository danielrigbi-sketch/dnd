// js/engine/fowSystem.js — Fog-of-War Renderer
// Extracted from mapEngine.js v129 (methods: _rFow, _rFowDM, _rWizFog, _rPhantomGrid)
// Owns: all FOW canvas composite operations and reveal flash queue.
//
// Three fog states (E3-B):
//   State 1 — currentFov  : fully transparent (token sees right now)
//   State 2 — previously seen: 40% punch + dark desaturation tint
//   State 3 — never seen  : solid black
// ─────────────────────────────────────────────────────────────────────────────

const FOW_ALPHA   = 0.88;
const GRID_PHANTOM = 'rgba(50,230,100,0.75)';
const MAP_W_DEFAULT = 30;
const MAP_H_DEFAULT = 20;

function ck(gx, gy) { return `${Math.floor(gx)}_${Math.floor(gy)}`; }
function kp(k) { const [x, y] = k.split('_').map(Number); return { gx: x, gy: y }; }

export class FowSystem {
  /** @param {import('./mapEngine.js').MapEngine} engine */
  constructor(engine) {
    this.e = engine;
    // Subscribe to fog:revealed events for flash animation
    engine.bus.on('fog:revealed', ({ cells }) => {
      const now = Date.now();
      for (const k of cells) {
        const { gx, gy } = kp(k);
        engine.L.fogRevQ.push({ gx, gy, t: now });
      }
      // Keep queue bounded to prevent memory bloat in long sessions
      if (engine.L.fogRevQ.length > 200) {
        engine.L.fogRevQ.splice(0, engine.L.fogRevQ.length - 200);
      }
      engine._dirty();
    });
  }

  // ── Main dispatch ─────────────────────────────────────────────────────
  render() {
    const { e } = this;
    const m = e.L.mode;
    if (m === 'wizFog' || m === 'wizFogHide') {
      this._renderWizFog();
    } else if (e.userRole !== 'dm') {
      this._renderPlayer();
    } else {
      this._renderDM();
    }
  }

  // ── Player FOW (3 states) ─────────────────────────────────────────────
  _renderPlayer() {
    const { e } = this;
    const { fw, fc, cv } = e;
    const W = cv.width, H = cv.height;
    if (fw.width !== W || fw.height !== H) { fw.width = W; fw.height = H; }
    fc.clearRect(0, 0, W, H);

    // Layer A — solid black base (never-seen)
    fc.fillStyle = `rgba(0,0,0,${FOW_ALPHA})`;
    fc.fillRect(0, 0, W, H);

    fc.save();
    fc.globalCompositeOperation = 'destination-out';
    fc.translate(e.vx, e.vy);
    fc.scale(e.vs, e.vs);
    const { pps, ox, oy } = e.S.cfg;
    const half = pps / 2;

    // Punch a feathered hole at the given alpha
    const punchCell = (gx, gy, alpha) => {
      const cx = ox + gx * pps + half, cy = oy + gy * pps + half;
      const r = pps * 0.78;
      const g = fc.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0,   `rgba(255,255,255,${alpha})`);
      g.addColorStop(0.6, `rgba(255,255,255,${alpha * 0.97})`);
      g.addColorStop(1,   'rgba(255,255,255,0)');
      fc.fillStyle = g;
      fc.fillRect(cx - r, cy - r, r * 2, r * 2);
    };

    // Previously-seen cells — punch at 40%
    Object.keys(e.S.fog).forEach(k => {
      if (!e.L.currentFov.has(k)) {
        const { gx, gy } = kp(k);
        punchCell(gx, gy, 0.40);
      }
    });

    // Current FOV cells — fully transparent
    e.L.currentFov.forEach(k => {
      const { gx, gy } = kp(k);
      punchCell(gx, gy, 1.0);
    });

    // Light sources — punch circular holes independent of player FOV
    Object.values(e.S.lights || {}).forEach(({ gx: lgx, gy: lgy, radius = 6, dimRadius }) => {
      const dr = dimRadius ?? Math.ceil(radius * 1.5);
      const cx = ox + (lgx + 0.5) * pps, cy = oy + (lgy + 0.5) * pps;
      const bPx = radius * pps, dPx = dr * pps;
      // Dim outer ring (partial erasure → dim appearance)
      if (dPx > bPx) {
        const gd = fc.createRadialGradient(cx, cy, 0, cx, cy, dPx);
        const split = radius / dr;
        gd.addColorStop(0,           'rgba(255,255,255,0.55)');
        gd.addColorStop(split - 0.01,'rgba(255,255,255,0.55)');
        gd.addColorStop(split + 0.01,'rgba(255,255,255,0.45)');
        gd.addColorStop(0.92,        'rgba(255,255,255,0.22)');
        gd.addColorStop(1,           'rgba(255,255,255,0)');
        fc.fillStyle = gd;
        fc.beginPath(); fc.arc(cx, cy, dPx, 0, Math.PI * 2); fc.fill();
      }
      // Bright inner circle (full erasure → fully visible)
      const gb = fc.createRadialGradient(cx, cy, 0, cx, cy, bPx);
      gb.addColorStop(0,    'rgba(255,255,255,1.0)');
      gb.addColorStop(0.75, 'rgba(255,255,255,1.0)');
      gb.addColorStop(1,    'rgba(255,255,255,0)');
      fc.fillStyle = gb;
      fc.beginPath(); fc.arc(cx, cy, bPx, 0, Math.PI * 2); fc.fill();
    });

    // Reveal flash queue (SD-2)
    const now = Date.now();
    const FLASH_DUR = 600;
    e.L.fogRevQ = e.L.fogRevQ.filter(ev => {
      const elapsed = now - ev.t;
      if (elapsed > FLASH_DUR) return false;
      const flashAlpha = (1 - (elapsed / FLASH_DUR)) * 0.9;
      const cx = ox + ev.gx * pps + half, cy = oy + ev.gy * pps + half;
      const r = pps * 1.1;
      const fg = fc.createRadialGradient(cx, cy, 0, cx, cy, r);
      fg.addColorStop(0, `rgba(255,255,255,${flashAlpha})`);
      fg.addColorStop(1, 'rgba(255,255,255,0)');
      fc.fillStyle = fg;
      fc.fillRect(cx - r, cy - r, r * 2, r * 2);
      return true;
    });
    if (e.L.fogRevQ.length > 0) e._dirty();

    fc.restore();

    // Blit FOW canvas onto main canvas
    e.ctx.drawImage(fw, 0, 0);

    // Layer B — dark blue desaturation tint over explored-but-not-current cells
    if (e.L.currentFov.size > 0 || Object.keys(e.S.fog).length > 0) {
      const mc = e.ctx;
      mc.save();
      mc.translate(e.vx, e.vy);
      mc.scale(e.vs, e.vs);
      const { pps: p, ox: ox2, oy: oy2 } = e.S.cfg;
      mc.fillStyle = 'rgba(10,10,40,0.38)';
      Object.keys(e.S.fog).forEach(k => {
        if (!e.L.currentFov.has(k)) {
          const { gx, gy } = kp(k);
          mc.fillRect(ox2 + gx * p + 1, oy2 + gy * p + 1, p - 2, p - 2);
        }
      });
      mc.restore();
    }
  }

  // ── DM ghost fog ─────────────────────────────────────────────────────
  _renderDM() {
    const { e } = this;
    const { ctx } = e;
    // fow.render() is called after ctx.restore() so ctx is in screen-space.
    // Re-apply viewport transform so world-space tile coords map correctly.
    ctx.save();
    ctx.translate(e.vx, e.vy);
    ctx.scale(e.vs, e.vs);
    const { pps, ox, oy, mapW: mw, mapH: mh } = e.S.cfg;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    for (let gx = 0; gx < (mw || MAP_W_DEFAULT); gx++) {
      for (let gy = 0; gy < (mh || MAP_H_DEFAULT); gy++) {
        if (!e.S.fog[ck(gx, gy)]) {
          ctx.fillRect(ox + gx * pps, oy + gy * pps, pps, pps);
        }
      }
    }
    ctx.restore();
  }

  // ── Wizard FOW (step 4 — thick grey-white unrevealed tiles) ──────────
  _renderWizFog() {
    const { e } = this;
    const { ctx } = e;
    const { pps, ox, oy, mapW: mw, mapH: mh } = e.S.cfg;
    ctx.save();
    ctx.translate(e.vx, e.vy);
    ctx.scale(e.vs, e.vs);
    const cols = mw || MAP_W_DEFAULT, rows = mh || MAP_H_DEFAULT;
    for (let gx = 0; gx < cols; gx++) {
      for (let gy = 0; gy < rows; gy++) {
        if (!e.S.fog[ck(gx, gy)]) {
          const px = ox + gx * pps, py = oy + gy * pps;
          ctx.fillStyle = 'rgba(205,212,218,0.94)';
          ctx.fillRect(px, py, pps, pps);
          ctx.fillStyle = 'rgba(160,168,175,0.30)';
          ctx.fillRect(px + 2, py + 2, pps - 4, pps - 4);
        }
      }
    }
    ctx.restore();
  }

  // ── Phantom green grid (wizard step 2 calibration) ───────────────────
  // Rendered as top layer in world space (inside save/restore in mapEngine).
  renderPhantomGrid() {
    const { e } = this;
    if (e.L.mode !== 'phantom') return;
    const { ctx } = e;
    const { pps, ox, oy } = e.S.cfg;

    const fit = e._getBgFit();
    const cols = Math.max(1, Math.floor(fit.w / pps));
    const rows = Math.max(1, Math.floor(fit.h / pps));

    // Store computed phantom dims locally (not in S.cfg — avoid render-loop mutation)
    e.L._phantomCols = cols;
    e.L._phantomRows = rows;

    // Tint over image
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(ox, oy, cols * pps, rows * pps);

    ctx.save();
    ctx.strokeStyle = GRID_PHANTOM;
    ctx.lineWidth = 2 / e.vs;
    ctx.shadowColor = 'rgba(40,255,90,0.55)';
    ctx.shadowBlur = 6 / e.vs;
    ctx.beginPath();
    for (let x = 0; x <= cols; x++) {
      const px = ox + x * pps;
      ctx.moveTo(px, oy); ctx.lineTo(px, oy + rows * pps);
    }
    for (let y = 0; y <= rows; y++) {
      const py = oy + y * pps;
      ctx.moveTo(ox, py); ctx.lineTo(ox + cols * pps, py);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(60,255,110,0.90)';
    ctx.shadowColor = 'rgba(40,255,90,0.7)';
    ctx.shadowBlur = 4 / e.vs;
    const dr = 2.5 / e.vs;
    for (let x = 0; x <= cols; x++) {
      for (let y = 0; y <= rows; y++) {
        ctx.beginPath();
        ctx.arc(ox + x * pps, oy + y * pps, dr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
