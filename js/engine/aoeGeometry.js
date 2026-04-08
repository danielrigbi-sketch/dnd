// js/engine/aoeGeometry.js — AoE geometry calculations for spell targeting

/**
 * Get all grid tiles within a circular area.
 * @param {number} cx - Center tile X
 * @param {number} cy - Center tile Y
 * @param {number} radiusFt - Radius in feet
 * @returns {Array<{gx: number, gy: number}>}
 */
export function tilesInCircle(cx, cy, radiusFt) {
  const r = radiusFt / 5; // tiles
  const tiles = [];
  for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      if (Math.sqrt(dx * dx + dy * dy) <= r + 0.5) { // +0.5 for center-of-tile inclusion
        tiles.push({ gx: cx + dx, gy: cy + dy });
      }
    }
  }
  return tiles;
}

/**
 * Get all grid tiles within a cone.
 * @param {number} ox - Origin tile X (caster)
 * @param {number} oy - Origin tile Y (caster)
 * @param {number} tx - Target tile X (direction)
 * @param {number} ty - Target tile Y (direction)
 * @param {number} lengthFt - Cone length in feet
 * @returns {Array<{gx: number, gy: number}>}
 */
export function tilesInCone(ox, oy, tx, ty, lengthFt) {
  const r = lengthFt / 5;
  const angle = Math.atan2(ty - oy, tx - ox);
  const halfAngle = Math.PI / 6; // 30 degrees = 60 degree cone
  const tiles = [];
  for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      if (dx === 0 && dy === 0) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > r + 0.5) continue;
      const tileAngle = Math.atan2(dy, dx);
      let angleDiff = Math.abs(tileAngle - angle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      if (angleDiff <= halfAngle) {
        tiles.push({ gx: ox + dx, gy: oy + dy });
      }
    }
  }
  return tiles;
}

/**
 * Get all grid tiles within a line.
 * @param {number} ox - Origin tile X
 * @param {number} oy - Origin tile Y
 * @param {number} tx - Target tile X (direction)
 * @param {number} ty - Target tile Y (direction)
 * @param {number} lengthFt - Line length in feet
 * @param {number} widthFt - Line width in feet (default 5)
 * @returns {Array<{gx: number, gy: number}>}
 */
export function tilesInLine(ox, oy, tx, ty, lengthFt, widthFt = 5) {
  const len = lengthFt / 5;
  const wid = widthFt / 5 / 2; // half-width in tiles
  const angle = Math.atan2(ty - oy, tx - ox);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const tiles = [];
  for (let dx = -Math.ceil(len); dx <= Math.ceil(len); dx++) {
    for (let dy = -Math.ceil(len); dy <= Math.ceil(len); dy++) {
      // Project onto line direction
      const along = dx * cos + dy * sin;
      const perp = Math.abs(-dx * sin + dy * cos);
      if (along >= 0 && along <= len + 0.5 && perp <= wid + 0.5) {
        tiles.push({ gx: ox + dx, gy: oy + dy });
      }
    }
  }
  return tiles;
}

/**
 * Get all grid tiles within a cube/square.
 * @param {number} cx - Anchor tile X
 * @param {number} cy - Anchor tile Y
 * @param {number} sizeFt - Side length in feet
 * @returns {Array<{gx: number, gy: number}>}
 */
export function tilesInCube(cx, cy, sizeFt) {
  const s = Math.ceil(sizeFt / 5);
  const half = Math.floor(s / 2);
  const tiles = [];
  for (let dx = -half; dx < s - half; dx++) {
    for (let dy = -half; dy < s - half; dy++) {
      tiles.push({ gx: cx + dx, gy: cy + dy });
    }
  }
  return tiles;
}

/**
 * Find all tokens within a set of tiles.
 * @param {Array<{gx, gy}>} tiles
 * @param {Object} tokensMap - mapEngine.S.tokens
 * @returns {string[]} - array of cName
 */
export function tokensInTiles(tiles, tokensMap) {
  const tileSet = new Set(tiles.map(t => `${t.gx}_${t.gy}`));
  const found = [];
  for (const [cName, tok] of Object.entries(tokensMap || {})) {
    if (tileSet.has(`${tok.gx}_${tok.gy}`)) {
      found.push(cName);
    }
  }
  return found;
}
