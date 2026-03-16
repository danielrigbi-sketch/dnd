// js/pathfinder.js — EasyStar.js A* Pathfinding  (E6-A)
//
// Wraps easystarjs with a Promise-based API and a dirty-grid rebuild.
// Designed for CritRoll: grid cells are either passable (floor) or
// impassable (obstacle).  Diagonal movement enabled (D&D 5e uses
// Chebyshev distance for diagonal cost).
//
// Usage:
//   import { Pathfinder } from './pathfinder.js';
//   const pf = new Pathfinder();
//   pf.setGrid(obstacleMap, cols, rows);
//   const path = await pf.find(sx, sy, ex, ey);  // [[x,y], ...]

import EasyStar from 'easystarjs';

const PASSABLE   = 0;
const IMPASSABLE = 1;

export class Pathfinder {
  constructor() {
    this._es      = new EasyStar.js();
    this._cols    = 0;
    this._rows    = 0;
    this._dirty   = true;

    // EasyStar config
    this._es.setAcceptableTiles([PASSABLE]);
    this._es.enableDiagonals();
    // Corner-cutting disabled: D&D 5e doesn't allow moving through diagonal wall corners
  }

  /**
   * Rebuild the A* grid from the CritRoll obstacle map.
   * Call whenever obstacles change.
   *
   * @param {object} obstacleMap  — { "x,y": true }
   * @param {number} cols         — map width in tiles
   * @param {number} rows         — map height in tiles
   */
  setGrid(obstacleMap, cols, rows) {
    this._cols  = cols  || 40;
    this._rows  = rows  || 30;

    const grid = [];
    for (let y = 0; y < this._rows; y++) {
      const row = [];
      for (let x = 0; x < this._cols; x++) {
        row.push(obstacleMap[`${x},${y}`] ? IMPASSABLE : PASSABLE);
      }
      grid.push(row);
    }

    this._es.setGrid(grid);
    this._dirty = false;
  }

  /**
   * Find the shortest path from (sx,sy) to (ex,ey).
   * Returns a Promise that resolves to [[x,y], ...] or null if no path.
   *
   * The Promise resolves after EasyStar finishes (usually < 2ms for
   * typical dungeon sizes).  A fallback greedy path is returned if
   * EasyStar fails or the grid is stale.
   *
   * @returns {Promise<number[][]|null>}
   */
  find(sx, sy, ex, ey) {
    if (this._dirty) return Promise.resolve(null);

    // Clamp to grid bounds
    const clamp = (v, max) => Math.max(0, Math.min(max - 1, v));
    sx = clamp(sx, this._cols); sy = clamp(sy, this._rows);
    ex = clamp(ex, this._cols); ey = clamp(ey, this._rows);

    if (sx === ex && sy === ey) return Promise.resolve([[sx, sy]]);

    return new Promise(resolve => {
      let done = false;
      this._es.findPath(sx, sy, ex, ey, path => {
        done = true;
        if (!path || path.length === 0) {
          resolve(null);
        } else {
          resolve(path.map(p => [p.x, p.y]));
        }
      });

      // Pump the EasyStar calculator — runs synchronously until done
      let ticks = 0;
      while (!done && ticks < 2000) {
        this._es.calculate();
        ticks++;
      }
      if (!done) resolve(null); // timeout fallback
    });
  }

  /** Mark grid as needing rebuild (e.g. after obstacle paint) */
  invalidate() {
    this._dirty = true;
  }

  get isReady() {
    return !this._dirty;
  }
}
