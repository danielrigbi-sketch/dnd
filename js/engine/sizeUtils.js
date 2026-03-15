// js/engine/sizeUtils.js — D&D 5e creature size helpers
// Used by tokenSystem.js, pixiLayer.js, mapEngine.js, movementSystem.js

/**
 * Returns the grid footprint (tiles per dimension) for a D&D 5e size category.
 * Tiny = 1 (snaps to single tile, rendered smaller)
 * Small/Medium = 1
 * Large = 2  (2×2 tiles = 10 ft)
 * Huge  = 3  (3×3 tiles = 15 ft)
 * Gargantuan = 4  (4×4 tiles = 20 ft)
 */
export function getTileSize(size) {
  const s = (size || '').toLowerCase();
  if (s === 'large')       return 2;
  if (s === 'huge')        return 3;
  if (s === 'gargantuan')  return 4;
  return 1; // tiny / small / medium / unknown
}

/**
 * Visual scale within the tile footprint.
 * Tiny creatures render at 65% of a tile — still snap to 1-tile grid.
 */
export function getVisualScale(size) {
  return (size || '').toLowerCase() === 'tiny' ? 0.65 : 1.0;
}

/**
 * Returns every {gx, gy} cell occupied by a token whose top-left anchor is (gx, gy)
 * and whose footprint is tileSize × tileSize.
 */
export function occupiedCells(gx, gy, tileSize) {
  const cells = [];
  for (let dx = 0; dx < tileSize; dx++)
    for (let dy = 0; dy < tileSize; dy++)
      cells.push({ gx: gx + dx, gy: gy + dy });
  return cells;
}

/**
 * Returns true if the footprint of token A (at ax,ay with sizeA) overlaps
 * the footprint of token B (at bx,by with sizeB).
 */
export function footprintsOverlap(ax, ay, sizeA, bx, by, sizeB) {
  return ax < bx + sizeB && ax + sizeA > bx &&
         ay < by + sizeB && ay + sizeA > by;
}
