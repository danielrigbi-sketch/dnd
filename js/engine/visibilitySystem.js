// js/engine/visibilitySystem.js — FOV + Trigger Detection
// Extracted from mapEngine.js v129 (methods: _visionR, _revealForToken, _checkTrigger)
// Owns: currentFov computation, newly-seen-cell persistence, trap/trigger checking.
// ─────────────────────────────────────────────────────────────────────────────

import { FOV } from 'rot-js';

const FT_PER_SQ = 5;

function ck(gx, gy) { return `${Math.floor(gx)}_${Math.floor(gy)}`; }

export class VisibilitySystem {
  /** @param {import('./mapEngine.js').MapEngine} engine */
  constructor(engine) {
    this.e = engine;
  }

  // ── Vision radius for a character ────────────────────────────────────
  // Respects per-character darkvision field (feet → tiles).
  // Default: 30 ft = 6 tiles.
  visionRadius(cn) {
    const pl = this.e.S.players[cn] || {};
    const dvFt = Number(pl.darkvision) || 0;
    if (dvFt > 0) return Math.ceil(dvFt / FT_PER_SQ);
    return Math.ceil(30 / FT_PER_SQ);
  }

  // ── ROT.js RecursiveShadowcasting FOV ─────────────────────────────────
  // Updates L.currentFov (local rendering set) AND persists newly-seen
  // cells to Firebase. DM bypasses FOV and always sees all cells.
  revealForToken(cn, gx, gy, r) {
    const { e } = this;
    if (!e.db) return;
    const vr = r || this.visionRadius(cn);
    const pl = e.S.players[cn] || {};
    if (pl.userRole === 'dm') return; // DM sees all

    const passable = (x, y) => !e.S.obstacles[ck(x, y)];
    const visible = {};
    const fov = new FOV.RecursiveShadowcasting(passable);
    fov.compute(gx, gy, vr, (x, y) => { visible[ck(x, y)] = true; });

    // Update local currentFov for three-state rendering
    if (cn === e.cName) {
      e.L.currentFov = new Set(Object.keys(visible));
      e._dirty();
    }

    // Persist only newly-seen cells to Firebase (avoid redundant writes)
    const newCells = {};
    Object.keys(visible).forEach(k => {
      if (!e.S.fog[k]) newCells[k] = true;
    });
    if (Object.keys(newCells).length > 0) {
      e.db.revealFogCells(e.activeRoom, e.S.activeScene, newCells);
      // Emit bus event for fog flash animation
      e.bus.emit('fog:revealed', { cells: new Set(Object.keys(newCells)) });
    }
  }

  // ── Trigger zone check ────────────────────────────────────────────────
  // Fires on token movement — checks if the destination cell has an
  // unresolved trigger. Plays a descending siren and logs to Firebase.
  checkTrigger(gx, gy, cn) {
    const { e } = this;
    const key = ck(gx, gy);
    const t = e.S.triggers[key];
    if (!t || t.fired || e.L.firedLocal.has(key)) return;
    e.L.firedLocal.add(key);
    if (e.db) {
      e.db.fireTrigger(e.activeRoom, e.S.activeScene, key);
      e.db.saveRollToDB({
        cName: 'DM', type: 'STATUS',
        status: `⚠️ TRIGGER "${t.label || 'Trap'}" — ${cn} at [${gx},${gy}]!`,
        ts: Date.now()
      });
    }
    // Descending siren sound effect
    if (!e.isMuted) {
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        [440, 330, 220].forEach((f, i) => {
          const o = ac.createOscillator(), g = ac.createGain();
          o.connect(g); g.connect(ac.destination);
          o.type = 'sawtooth'; o.frequency.value = f;
          const t0 = ac.currentTime + i * 0.15;
          g.gain.setValueAtTime(0.25, t0);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
          o.start(t0); o.stop(t0 + 0.35);
        });
      } catch (_) {}
    }
  }
}
