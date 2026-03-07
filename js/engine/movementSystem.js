// js/engine/movementSystem.js — Movement, Pathfinding, Range + HUD
// Extracted from mapEngine.js v129 (_buildPath, _endDrag, _rPath, _rMoveRange, _rHUD)
// Owns: path state, movement budget tracking, visual overlays, drag commit.
// ─────────────────────────────────────────────────────────────────────────────

const FT_PER_SQ = 5;
const MAP_W_DEFAULT = 30;

function ck(gx, gy) { return `${Math.floor(gx)}_${Math.floor(gy)}`; }

export class MovementSystem {
  /** @param {import('./mapEngine.js').MapEngine} engine */
  constructor(engine) {
    this.e = engine;
  }

  // ── A* + greedy fallback pathfinding ──────────────────────────────────
  // Returns an immediate greedy path for visual feedback while EasyStar
  // resolves async and updates L.drag.path in the background.
  buildPath(sx, sy, ex, ey, cName) {
    const { e } = this;
    const { cols = 40, rows = 30 } = e.S.cfg;

    if (!e._pf.isReady) {
      e._pf.setGrid(e.S.obstacles, cols, rows);
    }

    // Async A* — update path when ready
    e._pf.find(sx, sy, ex, ey).then(path => {
      if (path && e.L.drag && e.L.drag.cName === cName) {
        e.L.drag.path = path;
        e._dirty();
      }
    });

    // Synchronous greedy Chebyshev fallback (immediate frame)
    const cells = [[sx, sy]];
    let cx = sx, cy = sy;
    while ((cx !== ex || cy !== ey) && cells.length < 120) {
      const dx = Math.sign(ex - cx), dy = Math.sign(ey - cy);
      const opts = [[cx + dx, cy + dy], [cx + dx, cy], [cx, cy + dy]];
      const next = opts.find(([nx, ny]) =>
        !e.S.obstacles[ck(nx, ny)] && (nx !== cx || ny !== cy)
      );
      if (!next) break;
      [cx, cy] = next;
      cells.push([cx, cy]);
    }
    return cells;
  }

  // ── Commit drag — write to Firebase + trigger vision reveal ──────────
  endDrag() {
    const { e } = this;
    const dt = e.L.drag;
    e.L.drag = null;
    if (!dt || (dt.curGX === dt.startGX && dt.curGY === dt.startGY)) {
      e._dirty();
      return;
    }

    const isDM = e.userRole === 'dm';
    const pl = e.S.players[dt.cName] || {};
    const speed = pl.speed || MAP_W_DEFAULT;
    const sq = (dt.path?.length || 1) - 1;
    const prevUsed = e.S.tokens[dt.cName]?.usedMv || 0;
    const newUsed = prevUsed + sq * FT_PER_SQ;

    if (!isDM && newUsed > speed) { e._dirty(); return; } // reject over-limit

    if (e.db) {
      e.db.moveMapToken(e.activeRoom, dt.cName, dt.curGX, dt.curGY, isDM ? prevUsed : newUsed);

      // Emit bus event — VisibilitySystem subscribes
      e.bus.emit('token:moved', {
        cName: dt.cName,
        gx: dt.curGX,
        gy: dt.curGY,
        prevGx: dt.startGX,
        prevGy: dt.startGY,
      });
    }
    e._dirty();
  }

  // ── E6-B: BFS movement range overlay ────────────────────────────────
  // Renders a subtle cyan tint on all tiles reachable within remaining movement.
  renderRange() {
    const { e } = this;
    const dt = e.L.drag;
    if (!dt) return;
    const pl = e.S.players[dt.cName] || {};
    const speedFt = Number(pl.speed) || 30;
    const speedSq = Math.ceil(speedFt / FT_PER_SQ);
    const usedMv = e.S.tokens[dt.cName]?.usedMv || 0;
    const remaining = Math.max(0, speedSq - usedMv);
    if (remaining <= 0) return;

    const { ctx } = e;
    const { pps, ox, oy } = e.S.cfg;
    ctx.save();
    ctx.translate(e.vx, e.vy);
    ctx.scale(e.vs, e.vs);

    // BFS flood-fill (Chebyshev) within remaining squares
    const visited = new Set();
    const queue = [[dt.startGX, dt.startGY, 0]];
    while (queue.length > 0) {
      const [cx, cy, dist] = queue.shift();
      const k = `${cx},${cy}`;
      if (visited.has(k)) continue;
      visited.add(k);
      if (dist > remaining) continue;
      ctx.fillStyle = 'rgba(80,200,255,0.10)';
      ctx.fillRect(ox + cx * pps + 1, oy + cy * pps + 1, pps - 2, pps - 2);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx, ny = cy + dy;
          const nk = `${nx},${ny}`;
          if (!visited.has(nk) && !e.S.obstacles[nk]) {
            queue.push([nx, ny, dist + 1]);
          }
        }
      }
    }
    ctx.restore();
  }

  // ── E6-B: Path preview with colour coding ────────────────────────────
  // Green=within speed, Orange=dash, Red=over limit.
  renderPath() {
    const { e } = this;
    const dt = e.L.drag;
    if (!dt || !dt.path || dt.path.length < 2) return;
    const { ctx } = e;
    const { pps, ox, oy } = e.S.cfg;
    const sq = (dt.path.length - 1);
    const ft = sq * FT_PER_SQ;

    const pl = e.S.players[dt.cName] || {};
    const speedFt = Number(pl.speed) || 30;
    const speedSq = Math.ceil(speedFt / FT_PER_SQ);
    const usedMv = e.S.tokens[dt.cName]?.usedMv || 0;
    const remaining = Math.max(0, speedSq - usedMv);

    const stroke = sq <= remaining   ? 'rgba(80,200,255,0.90)'
                 : sq <= speedSq * 2 ? 'rgba(230,126,34,0.90)'
                 :                     'rgba(231,76,60,0.90)';

    ctx.save();
    ctx.translate(e.vx, e.vy);
    ctx.scale(e.vs, e.vs);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3 / e.vs;
    ctx.setLineDash([8 / e.vs, 4 / e.vs]);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    dt.path.forEach(([gx, gy], i) => {
      const wx = ox + (gx + 0.5) * pps, wy = oy + (gy + 0.5) * pps;
      i === 0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Destination label
    const last = dt.path[dt.path.length - 1];
    const wx = ox + (last[0] + 0.5) * pps, wy = oy + (last[1] + 0.5) * pps;
    const label = `${ft}ft`;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    const tw = 44 / e.vs;
    ctx.fillRect(wx - tw / 2, wy - 18 / e.vs, tw, 15 / e.vs);
    ctx.fillStyle = stroke;
    ctx.font = `bold ${11 / e.vs}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, wx, wy - 11 / e.vs);
    ctx.restore();
  }

  // ── Movement HUD (bottom-left) ────────────────────────────────────────
  renderHUD() {
    const { e } = this;
    const dt = e.L.drag;
    if (!dt) return;
    const { ctx, cv } = e;
    const pl = e.S.players[dt.cName] || {};
    const speed = pl.speed || MAP_W_DEFAULT;
    const sq = (dt.path?.length || 1) - 1;
    const prevUsed = e.S.tokens[dt.cName]?.usedMv || 0;
    const used = prevUsed + sq * FT_PER_SQ;
    const rem = Math.max(0, speed - used);
    const pct = rem / speed;
    const over = used > speed;
    const hx = 10, hy = cv.height - 64;

    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(hx, hy, 230, 54);
    ctx.strokeStyle = over ? '#e74c3c' : '#2ecc71';
    ctx.lineWidth = 2;
    ctx.strokeRect(hx, hy, 230, 54);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`⚡ ${rem}/${speed} ft remaining`, hx + 10, hy + 8);
    if (over) {
      ctx.fillStyle = '#e74c3c';
      ctx.fillText('Over speed limit!', hx + 10, hy + 26);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(hx + 10, hy + 40, 210, 8);
    ctx.fillStyle = pct > 0.5 ? '#2ecc71' : pct > 0.2 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(hx + 10, hy + 40, 210 * Math.min(1, rem / speed), 8);
  }
}
