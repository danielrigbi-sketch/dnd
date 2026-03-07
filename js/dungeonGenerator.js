// js/dungeonGenerator.js — Rot.js Dungeon Generator  (E3-D / E3-G)
//
// Wraps ROT.Map.Digger / Cellular / BSP to produce CritRoll-compatible
// dungeon data: obstacle grid, fog grid, room metadata.
//
// Seeded via ROT.RNG so the same roomCode always produces the same dungeon.
//
// Attribution: Rot.js (github.com/ondras/rot.js) — BSD-3-Clause. Copyright (c) Ondrej Zara.

import { Map as RotMap, RNG as RotRNG } from 'rot-js';

// ── Size presets ──────────────────────────────────────────────────────
const SIZES = {
  S: { w: 24, h: 16 },
  M: { w: 36, h: 24 },
  L: { w: 48, h: 32 },
};

// ── Style → generator class ───────────────────────────────────────────
const STYLES = {
  dungeon:  'Digger',    // rooms + corridors (default)
  cave:     'Cellular',  // organic cave walls
  fort:     'BSP',       // symmetric fortress rooms
};

/**
 * Generate a dungeon layout seeded from roomCode.
 *
 * @param {object} opts
 *   size   — 'S' | 'M' | 'L'  (default 'M')
 *   style  — 'dungeon' | 'cave' | 'fort'  (default 'dungeon')
 *   seed   — number seed (pass parseInt(roomCode,36) for reproducibility)
 *
 * @returns {{
 *   width:  number,
 *   height: number,
 *   tiles:  number[][],   // 0 = floor, 1 = wall
 *   rooms:  Array<{id,x,y,w,h,cx,cy,type}>,
 *   doors:  Array<{x,y}>,
 *   seed:   number,
 * }}
 */
export function generateDungeon({ size = 'M', style = 'dungeon', seed } = {}) {
  const { w, h } = SIZES[size] || SIZES.M;

  // Seed the RNG
  const usedSeed = seed ?? Math.floor(Math.random() * 1e9);
  RotRNG.setSeed(usedSeed);

  // Build tile grid (all walls initially)
  const tiles = Array.from({ length: h }, () => new Array(w).fill(1));

  const mapGen = _buildGenerator(style, w, h);

  // Collect floor cells
  mapGen.create((x, y, wall) => {
    if (x >= 0 && x < w && y >= 0 && y < h) {
      tiles[y][x] = wall ? 1 : 0;
    }
  });

  // Extract rooms (Digger / BSP only — Cellular has no rooms)
  const rooms = [];
  if (mapGen.getRooms) {
    mapGen.getRooms().forEach((room, idx) => {
      const x1 = room.getLeft();
      const y1 = room.getTop();
      const x2 = room.getRight();
      const y2 = room.getBottom();
      rooms.push({
        id: `room_${idx + 1}`,
        x: x1, y: y1,
        w: x2 - x1 + 1,
        h: y2 - y1 + 1,
        cx: Math.floor((x1 + x2) / 2),
        cy: Math.floor((y1 + y2) / 2),
        type: _assignRoomType(idx, mapGen.getRooms().length),
      });
    });
  }

  // Extract doors (Digger only)
  const doors = [];
  if (mapGen.getDoors) {
    mapGen.getDoors().forEach(door => {
      doors.push({ x: door.x, y: door.y });
    });
  }

  return { width: w, height: h, tiles, rooms, doors, seed: usedSeed };
}

/** Convert dungeon tiles array → CritRoll obstacle key-map { "x,y": true } */
export function tilesToObstacleGrid(tiles) {
  const obs = {};
  tiles.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell === 1) obs[`${x},${y}`] = true;
    });
  });
  return obs;
}

/** Build initial fog key-map (all tiles hidden) */
export function tilesToFogGrid(tiles) {
  const fog = {};
  // Start all fogged — DM will reveal as players explore
  tiles.forEach((row, y) => {
    row.forEach((_, x) => {
      // Only floor tiles need fog entries (walls are always dark)
      // We fog everything; the FOV system reveals floor tiles on movement
    });
  });
  return fog; // empty = all fogged (matching CritRoll fog convention)
}

/**
 * Seed the global Rot.js RNG from a room code string.
 * Call once when a DM creates or enters a room.
 * @param {string} roomCode
 */
export function seedFromRoomCode(roomCode) {
  if (!roomCode) return;
  const seed = parseInt(roomCode, 36) % 2147483647; // keep within 32-bit
  RotRNG.setSeed(Math.abs(seed) || 1);
}

// ── Private helpers ───────────────────────────────────────────────────

function _buildGenerator(style, w, h) {
  const cls = STYLES[style] || 'Digger';
  switch (cls) {
    case 'Cellular': {
      const gen = new RotMap.Cellular(w, h, { born: [5,6,7,8], survive: [4,5,6,7,8] });
      gen.randomize(0.5);
      // Run 4 smoothing passes
      for (let i = 0; i < 4; i++) gen.create();
      return gen;
    }
    case 'BSP':
      return new RotMap.Rogue(w, h);
    case 'Digger':
    default:
      return new RotMap.Digger(w, h, {
        roomWidth:  [4, 9],
        roomHeight: [3, 7],
        corridorLength: [2, 6],
        dugPercentage: 0.3,
      });
  }
}

// Assign a thematic room type based on position in the dungeon
const ROOM_TYPES = [
  'entrance', 'guardroom', 'corridor', 'barracks', 'treasury',
  'throne', 'armory', 'chapel', 'dungeon_cell', 'ritual_chamber',
];
function _assignRoomType(idx, total) {
  if (idx === 0) return 'entrance';
  if (idx === total - 1) return 'boss_chamber';
  return ROOM_TYPES[idx % ROOM_TYPES.length];
}
