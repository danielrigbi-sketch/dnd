// js/engine/combatUtils.js — D&D 5e Combat Utilities
// Used by tokenSystem.js for on-map attack interactions.
// ─────────────────────────────────────────────────────────────────────────────

// ── Damage type matching ──────────────────────────────────────────────────────
function _matchType(types, dt) {
  // Check if damage type starts any immunity/resistance/vulnerability entry
  // (handles "bludgeoning from nonmagical attacks" matching "bludgeoning")
  return types.some(t => t === dt || t.startsWith(dt + ' '));
}

/**
 * Apply damage immunity / resistance / vulnerability from D&D 5e rules.
 * @param {number} damage
 * @param {string|null} damageType - e.g. "fire", "slashing", null = skip
 * @param {Object} target - player/NPC state with damageImmunities/Resistances/Vulnerabilities strings
 * @returns {{ damage: number, modifier: 'immune'|'resistant'|'vulnerable'|'normal', note: string }}
 */
export function applyDamageModifiers(damage, damageType, target) {
  if (!damageType || !target) return { damage, modifier: 'normal', note: '' };
  const dt = damageType.toLowerCase().trim();
  const parse = str => (str || '').toLowerCase().replace(/\s+and\s+/g, ', ').split(/[,;]/).map(s => s.trim()).filter(Boolean);

  const immunities      = parse(target.damageImmunities);
  const resistances     = parse(target.damageResistances);
  const vulnerabilities = parse(target.damageVulnerabilities);

  if (_matchType(immunities, dt))
    return { damage: 0, modifier: 'immune', note: `🛡️ immune to ${damageType}` };
  if (_matchType(vulnerabilities, dt))
    return { damage: damage * 2, modifier: 'vulnerable', note: `💥 vulnerable (×2)` };
  if (_matchType(resistances, dt))
    return { damage: Math.floor(damage / 2), modifier: 'resistant', note: `🔰 resistant (½)` };
  return { damage, modifier: 'normal', note: '' };
}

/**
 * Get D&D 5e condition-based roll modifiers for an attack.
 * @param {Object} attacker - has .statuses array
 * @param {Object} target   - has .statuses array
 * @param {boolean} isMelee - true for melee, false for ranged
 * @param {number}  distFt  - distance in feet (for Paralyzed auto-crit)
 * @returns {{ advantage: bool, disadvantage: bool, autoCrit: bool, reasons: string[] }}
 */
export function getConditionModifiers(attacker, target, isMelee = true, distFt = 5) {
  const aSts = attacker.statuses || [];
  const tSts = target.statuses   || [];
  let advantage = false, disadvantage = false, autoCrit = false;
  const reasons = [];

  // Attacker conditions → disadvantage
  if (aSts.includes('Poisoned'))   { disadvantage = true; reasons.push('poisoned');   }
  if (aSts.includes('Frightened')) { disadvantage = true; reasons.push('frightened'); }
  if (aSts.includes('Blinded'))    { disadvantage = true; reasons.push('blinded');    }
  if (aSts.includes('Restrained')) { disadvantage = true; reasons.push('restrained'); }

  // Prone attacker: disadvantage on all attacks
  if (aSts.includes('Prone'))      { disadvantage = true; reasons.push('prone');      }

  // Target conditions
  if (tSts.includes('Prone')) {
    if (isMelee) { advantage    = true; reasons.push('target prone');         }
    else         { disadvantage = true; reasons.push('target prone (ranged)'); }
  }
  if (tSts.includes('Blinded'))    { advantage = true; reasons.push('target blinded');    }
  if (tSts.includes('Restrained')) { advantage = true; reasons.push('target restrained'); }
  if (tSts.includes('Paralyzed') && isMelee && distFt <= 5) {
    autoCrit = true; advantage = true; reasons.push('target paralyzed');
  }

  // Invisible attacker → advantage
  if (aSts.includes('Invisible'))  { advantage = true; reasons.push('invisible'); }

  // D&D 5e rule: advantage and disadvantage cancel each other
  if (advantage && disadvantage) { advantage = false; disadvantage = false; }

  return { advantage, disadvantage, autoCrit, reasons };
}

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
