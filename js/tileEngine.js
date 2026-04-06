// js/tileEngine.js — Dungeon Tile Painter  (E4-A / E4-B)
//
// Renders a per-cell tile layer beneath the tactical map.
// Tiles come from /tiles/dungeon.png (CC0 procedural tileset).
//
// Architecture:
//   TileEngine owns an offscreen <canvas> that mapEngine composites
//   before drawing tokens/fog.  Only dirty cells are re-painted.
//
// Grid data is stored as:
//   tileGrid: { "gx,gy": tileKey }   — persisted to Firebase
//   e.g.  { "3,4": "wall_n", "5,2": "floor" }
//
// Usage:
//   const te = new TileEngine(manifest);
//   await te.load();
//   te.resize(canvasW, canvasH);
//   te.render(ctx, cfg, viewX, viewY, viewScale);
//   te.setTile(gx, gy, 'floor');
//   te.getTileGrid();   // → plain object for Firebase

import MANIFEST from '../public/tiles/manifest.json' assert { type: 'json' };

// ── Constants ────────────────────────────────────────────────────────
const SHEET_SRC = '/tiles/dungeon_2x.png';
const SRC_TILE  = MANIFEST.tileSize * 2;   // tiles in 2× sheet = 32px

// Auto-theme: which tile to use for obstacle vs floor
export const AUTO_THEME = {
  dungeon: { floor: 'floor',      wall: 'wall_n',  door: 'door_closed' },
  cave:    { floor: 'dirt',       wall: 'wall_rough', door: 'door_open' },
  fort:    { floor: 'stone_floor', wall: 'pillar',  door: 'door_locked' },
  grass:   { floor: 'grass',      wall: 'pillar',  door: 'door_open'   },
};

export class TileEngine {
  constructor() {
    this._img       = null;
    this._ready     = false;
    this._grid      = {};   // "gx,gy" → tileKey
    this._offscreen = document.createElement('canvas');
    this._dirty     = true;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /** Load the spritesheet. Resolves when image is ready to paint. */
  load() {
    return new Promise((res, rej) => {
      if (this._ready) { res(); return; }
      const img = new Image();
      img.src = SHEET_SRC;
      img.onload  = () => { this._img = img; this._ready = true; res(); };
      img.onerror = () => rej(new Error('TileEngine: failed to load ' + SHEET_SRC));
    });
  }

  /** True after load() resolves */
  get ready() { return this._ready; }

  // ── Grid API ─────────────────────────────────────────────────────────

  setTile(gx, gy, tileKey) {
    const k = `${gx},${gy}`;
    if (tileKey === null || tileKey === 'void') {
      delete this._grid[k];
    } else {
      this._grid[k] = tileKey;
    }
    this._dirty = true;
  }

  getTile(gx, gy) {
    return this._grid[`${gx},${gy}`] || null;
  }

  /** Replace entire grid (call with Firebase snapshot) */
  setGrid(gridObj) {
    this._grid  = gridObj ? { ...gridObj } : {};
    this._dirty = true;
  }

  getTileGrid() {
    return { ...this._grid };
  }

  clearGrid() {
    this._grid  = {};
    this._dirty = true;
  }

  /**
   * Auto-populate a tile grid from dungeonGenerator output.
   * @param {object} dungeonData — result from generateDungeon()
   * @param {string} theme       — 'dungeon' | 'cave' | 'fort' | 'grass'
   */
  applyDungeon(dungeonData, theme = 'dungeon') {
    this._grid = {};
    const th = AUTO_THEME[theme] || AUTO_THEME.dungeon;
    const { tiles } = dungeonData;
    tiles.forEach((row, y) => {
      row.forEach((cell, x) => {
        this._grid[`${x},${y}`] = cell === 1 ? th.wall : th.floor;
      });
    });
    // Place doors at dungeon door positions
    if (dungeonData.doors) {
      dungeonData.doors.forEach(({ x, y }) => {
        this._grid[`${x},${y}`] = th.door;
      });
    }
    this._dirty = true;
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  /**
   * Render tile layer onto provided context.
   * Call this BEFORE drawing tokens/fog (composites below them).
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} cfg  — mapEngine S.cfg {pps, ox, oy, cols, rows}
   * @param {number} vx   — mapEngine view translate X
   * @param {number} vy   — view translate Y
   * @param {number} vs   — view scale
   */
  render(ctx, cfg, vx, vy, vs) {
    if (!this._ready || !this._img) return;
    const { pps, ox, oy } = cfg;

    ctx.save();
    ctx.translate(vx, vy);
    ctx.scale(vs, vs);

    for (const [key, tileKey] of Object.entries(this._grid)) {
      const [gx, gy] = key.split(',').map(Number);
      const def = MANIFEST.tiles[tileKey];
      if (!def) continue;

      const sx = def.col * SRC_TILE;
      const sy = def.row * SRC_TILE;
      const dx = ox + gx * pps;
      const dy = oy + gy * pps;

      ctx.drawImage(
        this._img,
        sx, sy, SRC_TILE, SRC_TILE,   // source rect
        dx, dy, pps, pps               // dest rect
      );
    }

    ctx.restore();
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /** List of all available tile keys */
  static get tileKeys() {
    return Object.keys(MANIFEST.tiles);
  }

  /** Grouped tiles for the tile picker UI */
  static get tileGroups() {
    return {
      '<img src="/assets/icons/action/floor.png" alt="" class="custom-icon" style="width:12px;height:12px;vertical-align:middle;" loading="lazy"> Floor':  ['floor','floor_alt','dirt','stone_floor','wood_floor','grass'],
      '<img src="/assets/icons/action/wall.png" alt="" class="custom-icon" style="width:12px;height:12px;vertical-align:middle;" loading="lazy"> Walls':  ['wall_n','wall_s','wall_e','wall_w','wall_rough','wall_corner','pillar','void'],
      '<img src="/assets/icons/toolbar/door.png" alt="" class="custom-icon" style="width:12px;height:12px;vertical-align:middle;" loading="lazy"> Doors':  ['door_closed','door_open','door_locked'],
      '<img src="/assets/icons/action/props.png" alt="" class="custom-icon" style="width:12px;height:12px;vertical-align:middle;" loading="lazy"> Props':   ['stairs_down','stairs_up','chest_closed','chest_open','altar','shrine','torch','barrel'],
    };
  }
}
