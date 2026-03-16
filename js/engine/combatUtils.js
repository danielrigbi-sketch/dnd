// js/engine/combatUtils.js — D&D 5e Combat Utilities
// Used by tokenSystem.js for on-map attack interactions.
// ─────────────────────────────────────────────────────────────────────────────

/** Chebyshev tile distance between two tokens (diagonal counts as 1). */
export function tileDistance(tok1, tok2) {
  return Math.max(Math.abs((tok1.gx ?? 0) - (tok2.gx ?? 0)), Math.abs((tok1.gy ?? 0) - (tok2.gy ?? 0)));
}

/** Convert tile distance to feet (5 ft per tile). */
export function feetDistance(tok1, tok2) {
  return tileDistance(tok1, tok2) * 5;
}

/**
 * Parse a dice notation string like "2d6+3" into { count, sides, mod }.
 * Returns null if unparseable.
 */
export function parseDice(notation) {
  if (!notation) return null;
  const m = String(notation).match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!m) return null;
  return { count: parseInt(m[1]), sides: parseInt(m[2]), mod: parseInt(m[3] || '0') };
}

/**
 * Roll NdS+mod using Math.random(). Returns { rolls: number[], total: number }.
 * Pass crit=true to double the dice count (D&D critical hit rule).
 */
export function rollDice(notation, crit = false) {
  const parsed = parseDice(notation);
  if (!parsed) return { rolls: [0], total: 0 };
  const { count, sides, mod } = parsed;
  const numDice = crit ? count * 2 : count;
  const rolls = Array.from({ length: numDice }, () => Math.floor(Math.random() * sides) + 1);
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) + mod };
}

/** Proficiency bonus by character level (D&D 5e). */
export function profBonus(level) {
  return Math.ceil(level / 4) + 1;
}

/**
 * Parse an Open5e spell range string to feet.
 * e.g. "30 feet" → 30, "Touch" → 5, "Self" → 0, "Sight" → 9999
 */
export function parseSpellRangeFt(rangeStr) {
  if (!rangeStr) return 30;
  if (/touch/i.test(rangeStr)) return 5;
  if (/^self$/i.test(rangeStr)) return 0;
  if (/sight|unlimited|special/i.test(rangeStr)) return 9999;
  const m = rangeStr.match(/(\d+)/);
  return m ? parseInt(m[1]) : 30;
}
