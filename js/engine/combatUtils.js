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
  if (aSts.includes('Poisoned'))      { disadvantage = true; reasons.push('poisoned');      }
  if (aSts.includes('Frightened'))    { disadvantage = true; reasons.push('frightened');    }
  if (aSts.includes('Blinded'))       { disadvantage = true; reasons.push('blinded');       }
  if (aSts.includes('Restrained'))    { disadvantage = true; reasons.push('restrained');    }
  if (aSts.includes('Prone'))         { disadvantage = true; reasons.push('prone');         }
  // Exhaustion level 3+ → disadvantage on attack rolls
  if ((attacker.exhaustion || 0) >= 3){ disadvantage = true; reasons.push('exhaustion 3+'); }

  // Incapacitated/Stunned/Unconscious/Petrified → cannot attack (treat as auto-miss via disadvantage flag + reason)
  if (aSts.includes('Incapacitated')){ disadvantage = true; reasons.push('incapacitated (cannot act)'); }
  if (aSts.includes('Stunned'))      { disadvantage = true; reasons.push('stunned (cannot act)');       }
  if (aSts.includes('Unconscious'))  { disadvantage = true; reasons.push('unconscious (cannot act)');   }
  if (aSts.includes('Petrified'))    { disadvantage = true; reasons.push('petrified (cannot act)');     }

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
  // Stunned target → advantage on attacks against
  if (tSts.includes('Stunned'))    { advantage = true; reasons.push('target stunned');    }
  // Unconscious target → advantage + auto-crit if melee within 5ft
  if (tSts.includes('Unconscious')) {
    advantage = true; reasons.push('target unconscious');
    if (isMelee && distFt <= 5) { autoCrit = true; reasons.push('auto-crit (unconscious melee)'); }
  }
  // Petrified target → advantage on attacks against
  if (tSts.includes('Petrified'))  { advantage = true; reasons.push('target petrified'); }

  // Invisible attacker → advantage
  if (aSts.includes('Invisible'))  { advantage = true; reasons.push('invisible'); }

  // D&D 5e rule: advantage and disadvantage cancel each other
  if (advantage && disadvantage) { advantage = false; disadvantage = false; }

  return { advantage, disadvantage, autoCrit, reasons };
}

/**
 * Get saving throw modifiers from conditions.
 * @param {object} saver — the character making the save
 * @param {string} ability — 'str'|'dex'|'con'|'int'|'wis'|'cha'
 * @returns {{ advantage: boolean, disadvantage: boolean, autoFail: boolean, reasons: string[] }}
 */
export function getSaveModifiers(saver, ability) {
  const sts = saver.statuses || [];
  let advantage = false, disadvantage = false, autoFail = false;
  const reasons = [];

  // Poisoned → disadvantage on ability checks (not saves, but often confused; included for completeness)
  // Restrained → disadvantage on DEX saves
  if (sts.includes('Restrained') && ability === 'dex')  { disadvantage = true; reasons.push('restrained → DEX save disadvantage'); }
  // Paralyzed → auto-fail STR and DEX saves
  if (sts.includes('Paralyzed') && (ability === 'str' || ability === 'dex')) { autoFail = true; reasons.push('paralyzed → auto-fail STR/DEX'); }
  // Stunned → auto-fail STR and DEX saves
  if (sts.includes('Stunned') && (ability === 'str' || ability === 'dex')) { autoFail = true; reasons.push('stunned → auto-fail STR/DEX'); }
  // Unconscious → auto-fail STR and DEX saves
  if (sts.includes('Unconscious') && (ability === 'str' || ability === 'dex')) { autoFail = true; reasons.push('unconscious → auto-fail STR/DEX'); }
  // Petrified → auto-fail STR and DEX saves, resistance to all damage
  if (sts.includes('Petrified') && (ability === 'str' || ability === 'dex')) { autoFail = true; reasons.push('petrified → auto-fail STR/DEX'); }
  // Exhaustion level 3+ → disadvantage on saving throws
  if ((saver.exhaustion || 0) >= 3) { disadvantage = true; reasons.push('exhaustion 3+ → save disadvantage'); }

  if (advantage && disadvantage) { advantage = false; disadvantage = false; }
  return { advantage, disadvantage, autoFail, reasons };
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

/** D&D 5e skill → governing ability (lowercase 3-letter key). */
export const SKILL_ABILITIES = {
  acrobatics:        'dex',
  'animal handling': 'wis',
  arcana:            'int',
  athletics:         'str',
  deception:         'cha',
  history:           'int',
  insight:           'wis',
  intimidation:      'cha',
  investigation:     'int',
  medicine:          'wis',
  nature:            'int',
  perception:        'wis',
  performance:       'cha',
  persuasion:        'cha',
  religion:          'int',
  'sleight of hand': 'dex',
  stealth:           'dex',
  survival:          'wis',
};

/**
 * Compute skill modifier for a character.
 * Uses pre-computed bonus from player.skills if present (Open5e NPCs),
 * otherwise adds proficiency bonus if the skill is flagged, else raw ability mod.
 * @param {string} skillName - lowercase skill name e.g. "perception"
 * @param {Object} player
 * @returns {number}
 */
export function skillMod(skillName, player) {
  const ability  = SKILL_ABILITIES[skillName] || 'str';
  const score    = player[`_${ability}`] ?? player[ability] ?? 10;
  const abilityM = Math.floor((score - 10) / 2);
  const pb       = profBonus(player.level || 1);
  if (!player.skills) {
    // Jack of All Trades: Bard feature — half proficiency to non-proficient skills
    if (player.jackOfAllTrades) return abilityM + Math.floor(pb / 2);
    return abilityM;
  }
  // Open5e stores "animal handling" or "animal_handling" — try both
  const keyU = skillName.replace(/\s+/g, '_');
  const val  = player.skills[skillName] ?? player.skills[keyU];
  if (typeof val === 'number') return val;              // pre-computed (NPC)
  if (val === 'expert') return abilityM + pb * 2;       // expertise (double proficiency)
  if (val) return abilityM + pb;                        // proficient
  // Jack of All Trades applies to non-proficient skills
  if (player.jackOfAllTrades) return abilityM + Math.floor(pb / 2);
  return abilityM;
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
