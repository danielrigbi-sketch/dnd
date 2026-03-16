// js/engine/animationSystem.js — Canvas2D combat hit animations
// Triggered by tokenSystem.js combat methods; ticked from mapEngine._render().
// All drawing is in world-space (ctx already has translate+scale applied).
// ─────────────────────────────────────────────────────────────────────────────

const DURATIONS = {
  MELEE_HIT:   0.45,
  MELEE_CRIT:  0.85,
  MELEE_MISS:  0.42,
  RANGED_HIT:  0.38,
  RANGED_MISS: 0.38,
  SPELL_HIT:   0.62,
  SPELL_SAVE:  0.52,
};

export class AnimationSystem {
  /** @param {import('../mapEngine.js').MapEngine} engine */
  constructor(engine) {
    this.e = engine;
    this._pool = [];
    this._last = performance.now();
  }

  /**
   * Trigger a combat animation.
   * @param {string} type  — one of MELEE_HIT | MELEE_CRIT | MELEE_MISS |
   *                          RANGED_HIT | RANGED_MISS | SPELL_HIT | SPELL_SAVE
   * @param {object} fromTk — token object { gx, gy } (attacker, may be null)
   * @param {object} toTk   — token object { gx, gy } (target)
   */
  trigger(type, fromTk, toTk) {
    const { pps, ox, oy } = this.e.S.cfg;
    const wx = (tk) => ox + (tk.gx + 0.5) * pps;
    const wy = (tk) => oy + (tk.gy + 0.5) * pps;
    this._pool.push({
      type,
      t: 0,
      duration: DURATIONS[type] ?? 0.5,
      from: fromTk ? { x: wx(fromTk), y: wy(fromTk) } : null,
      to:   { x: wx(toTk), y: wy(toTk) },
      pps,
    });
    this.e._dirty();
  }

  /** Called each frame from mapEngine._render() while inside the world transform. */
  tick(ctx) {
    if (!this._pool.length) return;
    const now = performance.now();
    const dt  = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;

    for (const a of this._pool) a.t += dt;
    for (const a of this._pool) this._draw(ctx, a);
    this._pool = this._pool.filter(a => a.t < a.duration);
    if (this._pool.length) this.e._dirty();
  }

  // ── Dispatching ──────────────────────────────────────────────────────
  _draw(ctx, a) {
    const p = Math.min(1, a.t / a.duration);
    switch (a.type) {
      case 'MELEE_HIT':   this._meleeFlash(ctx, a.to, p, a.pps, '#e74c3c'); break;
      case 'MELEE_CRIT':  this._meleeFlash(ctx, a.to, p, a.pps, '#f1c40f');
                          this._critBurst(ctx, a.to, p, a.pps); break;
      case 'MELEE_MISS':  this._floatText(ctx, a.to, p, a.pps, 'MISS', '#95a5a6'); break;
      case 'RANGED_HIT':  this._arrow(ctx, a.from, a.to, p, a.pps, true); break;
      case 'RANGED_MISS': this._arrow(ctx, a.from, a.to, p, a.pps, false); break;
      case 'SPELL_HIT':   this._spellRings(ctx, a.to, p, a.pps, '#9b59b6'); break;
      case 'SPELL_SAVE':  this._spellRings(ctx, a.to, p, a.pps, '#f1c40f'); break;
    }
  }

  // ── Melee flash + slash arcs ─────────────────────────────────────────
  _meleeFlash(ctx, pos, p, pps, color) {
    const r    = pps * 0.54;
    const fade = p < 0.5 ? p * 2 : (1 - p) * 2;

    ctx.save();

    // Blood/impact circle
    ctx.globalAlpha = fade * 0.42;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Three diagonal slash lines
    ctx.globalAlpha = fade * 0.92;
    ctx.strokeStyle = color;
    ctx.lineWidth   = pps * 0.065;
    ctx.lineCap     = 'round';
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * pps * 0.20;
      ctx.beginPath();
      ctx.moveTo(pos.x - r * 0.68 + offset, pos.y - r * 0.52);
      ctx.bezierCurveTo(
        pos.x + offset,          pos.y - r * 0.08,
        pos.x + offset,          pos.y + r * 0.08,
        pos.x + r * 0.68 + offset, pos.y + r * 0.52,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Crit starburst + text ────────────────────────────────────────────
  _critBurst(ctx, pos, p, pps) {
    const rays   = 8;
    const len    = pps * 1.15 * p;
    const fade   = p > 0.65 ? (1 - p) / 0.35 : 1;

    ctx.save();
    ctx.globalAlpha = fade * 0.88;
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth   = pps * 0.055;
    ctx.lineCap     = 'round';
    for (let i = 0; i < rays; i++) {
      const ang = (i / rays) * Math.PI * 2;
      const inner = pps * 0.28;
      ctx.beginPath();
      ctx.moveTo(pos.x + Math.cos(ang) * inner, pos.y + Math.sin(ang) * inner);
      ctx.lineTo(pos.x + Math.cos(ang) * len,   pos.y + Math.sin(ang) * len);
      ctx.stroke();
    }

    // "CRIT!" label rising upward
    if (p > 0.08 && p < 0.92) {
      ctx.globalAlpha = fade;
      ctx.fillStyle   = '#f1c40f';
      ctx.font        = `bold ${pps * 0.46}px Arial`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle  = '#000';
      ctx.lineWidth    = pps * 0.03;
      const ty = pos.y - pps * (0.75 + p * 0.55);
      ctx.strokeText('CRIT!', pos.x, ty);
      ctx.fillText('CRIT!', pos.x, ty);
    }
    ctx.restore();
  }

  // ── Floating text (MISS, etc.) ───────────────────────────────────────
  _floatText(ctx, pos, p, pps, text, color) {
    const fade = p < 0.20 ? p / 0.20 : p > 0.65 ? (1 - p) / 0.35 : 1;
    ctx.save();
    ctx.globalAlpha  = fade * 0.88;
    ctx.fillStyle    = color;
    ctx.strokeStyle  = 'rgba(0,0,0,0.6)';
    ctx.lineWidth    = pps * 0.025;
    ctx.font         = `bold ${pps * 0.40}px Arial`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const ty = pos.y - pps * (0.45 + p * 0.80);
    ctx.strokeText(text, pos.x, ty);
    ctx.fillText(text, pos.x, ty);
    ctx.restore();
  }

  // ── Ranged arrow/bolt ────────────────────────────────────────────────
  _arrow(ctx, from, to, p, pps, hit) {
    if (!from) return;
    const travel = Math.min(1, p / 0.72);
    const ex     = from.x + (to.x - from.x) * travel;
    const ey     = from.y + (to.y - from.y) * travel;
    const fade   = p > 0.78 ? (1 - p) / 0.22 : 1;
    const angle  = Math.atan2(to.y - from.y, to.x - from.x);
    const col    = hit ? '#e67e22' : '#7f8c8d';

    ctx.save();
    ctx.globalAlpha = fade * 0.92;
    ctx.strokeStyle = col;
    ctx.lineWidth   = pps * 0.055;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Arrowhead
    const ah = pps * 0.22;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ah * Math.cos(angle - 0.42), ey - ah * Math.sin(angle - 0.42));
    ctx.lineTo(ex - ah * Math.cos(angle + 0.42), ey - ah * Math.sin(angle + 0.42));
    ctx.closePath();
    ctx.fill();

    // Miss: show "MISS" when arrow arrives
    if (!hit && travel >= 1 && p > 0.45) {
      this._floatText(ctx, to, (p - 0.45) / 0.55, pps, 'MISS', '#7f8c8d');
    }
    ctx.restore();
  }

  // ── Spell rings + particles ──────────────────────────────────────────
  _spellRings(ctx, pos, p, pps, color) {
    ctx.save();

    // 3 concentric expanding rings staggered in time
    for (let i = 0; i < 3; i++) {
      const rp = Math.max(0, p - i * 0.13);
      if (rp <= 0) continue;
      const r     = pps * 0.65 * rp;
      const alpha = (1 - rp) * 0.72;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth   = pps * 0.065;
      ctx.stroke();
    }

    // Orbiting particles
    const count   = 8;
    const maxDist = pps * 0.82 * p;
    const pFade   = p < 0.5 ? 1 : (1 - p) * 2;
    ctx.globalAlpha = pFade * 0.88;
    ctx.fillStyle   = color;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + p * Math.PI * 1.5;
      ctx.beginPath();
      ctx.arc(
        pos.x + Math.cos(ang) * maxDist,
        pos.y + Math.sin(ang) * maxDist,
        pps * 0.065, 0, Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  }
}
