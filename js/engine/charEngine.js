/**
 * charEngine.js — Pure D&D 5e character formula engine.
 *
 * compute(raw) takes a raw Firebase character blob and returns a fully-resolved
 * stats object. No side effects, no Firebase calls, no eval().
 * NPCs pass through unchanged (type === 'npc').
 *
 * Consumed by: ui.js, app.js (setupDatabaseListeners), tokenSystem.js
 */

import { profBonus, SKILL_ABILITIES } from './combatUtils.js';
import {
  CLASS_HD,
  CLASS_SAVE_PROFS,
  SPELL_ABILITY,
  RACE_MECHANICS,
  RACE_SLUG_MAP,
  SUBCLASS_MECHANICS,
  BACKGROUND_MECHANICS,
  FEAT_MECHANICS,
  THIRD_CASTER_SLOTS,
} from '../../data/mechanics.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalize a skill name to the key format used in SKILL_ABILITIES (spaces, lowercase). */
function _skillKey(name) {
  // Input may use underscores (background data) or spaces (UI)
  return name.toLowerCase().replace(/_/g, ' ');
}

/** Resolve race slug — handles legacy coarse names stored in old Firebase chars. */
function _resolveRaceSlug(raw) {
  const slug = (raw.race || 'human').toLowerCase().trim();
  return RACE_MECHANICS[slug]
    ? slug
    : (RACE_SLUG_MAP[slug] || 'human');
}

/** Get all active subclass effects at or below the character's level. */
function _activeSubclassEffects(subMech, level) {
  if (!subMech?.features) return [];
  return Object.entries(subMech.features)
    .filter(([lvl]) => parseInt(lvl) <= level)
    .flatMap(([, effects]) => effects);
}

// ── AC Formula Evaluator (closed set — no eval) ────────────────────────────────
function _evalAcFormula(formula, mods) {
  switch (formula) {
    case '13+dex':     return 13 + mods.dex;
    case '10+dex+wis': return 10 + mods.dex + mods.wis;
    case '10+dex+con': return 10 + mods.dex + mods.con;
    case '10+dex':     return 10 + mods.dex;
    default:           return 10;
  }
}

/** Derive the unarmored AC formula for a class or subclass, if applicable. */
function _getUnarmoredFormula(cls, subMech, level) {
  // Draconic Sorcerer (level 1 feature)
  const draconicAc = _activeSubclassEffects(subMech, level).find(e => e.type === 'ac_formula');
  if (draconicAc) return draconicAc.formula;
  // Monk Unarmored Defense
  if (cls === 'monk') return '10+dex+wis';
  // Barbarian Unarmored Defense
  if (cls === 'barbarian') return '10+dex+con';
  return null;
}

// ── Main compute() ────────────────────────────────────────────────────────────

/**
 * Resolve all computed stats for a player character.
 * @param {Object} raw - Raw Firebase character blob.
 * @returns {Object} resolved - All derived stats, or raw passthrough for NPCs.
 */
export function compute(raw) {
  if (!raw) return raw;
  // NPCs use raw Open5e values directly — no formula engine needed
  if (raw.type === 'npc') return raw;
  // Must have at minimum a level to compute anything meaningful
  if (!raw.level && !raw._str) return raw;

  const r = {};
  const level = parseInt(raw.level) || 1;
  const cls   = (raw.class || '').toLowerCase().trim();

  // ── 1. Ability Scores ───────────────────────────────────────────────────────
  const raceSlug = _resolveRaceSlug(raw);
  const race     = RACE_MECHANICS[raceSlug] || RACE_MECHANICS['human'];

  const abilFinal = {
    str: parseInt(raw._str) || 10,
    dex: parseInt(raw._dex) || 10,
    con: parseInt(raw._con) || 10,
    int: parseInt(raw._int) || 10,
    wis: parseInt(raw._wis) || 10,
    cha: parseInt(raw._cha) || 10,
  };

  // Apply racial ability bonuses
  if (race.abilBonus) {
    Object.entries(race.abilBonus).forEach(([ab, v]) => {
      abilFinal[ab] = (abilFinal[ab] || 10) + v;
    });
  }

  // Apply feat ability bonuses
  (raw.feats || []).forEach(feat => {
    const key = (feat.name || '').toLowerCase().replace(/\s+/g, '-');
    const fm  = FEAT_MECHANICS[key];
    if (fm?.abilBonus) {
      Object.entries(fm.abilBonus).forEach(([ab, v]) => {
        abilFinal[ab] = (abilFinal[ab] || 10) + v;
      });
    }
    // Ability Score Improvement — user-set values stored on the feat object
    if (fm?.abilBonusFree && feat.choices) {
      Object.entries(feat.choices).forEach(([ab, v]) => {
        if (abilFinal[ab] !== undefined) abilFinal[ab] += parseInt(v) || 0;
      });
    }
  });

  // Variant Human free ability bonus stored as raw.variantAbilBonus
  if (raceSlug === 'variant-human' && raw.variantAbilBonus) {
    Object.entries(raw.variantAbilBonus).forEach(([ab, v]) => {
      if (abilFinal[ab] !== undefined) abilFinal[ab] += parseInt(v) || 0;
    });
  }
  // Half-Elf free +1 to two ability scores stored as raw.halfElfAbilBonus
  if (raceSlug === 'half-elf' && raw.halfElfAbilBonus) {
    Object.entries(raw.halfElfAbilBonus).forEach(([ab, v]) => {
      if (abilFinal[ab] !== undefined) abilFinal[ab] += parseInt(v) || 0;
    });
  }

  r.abilities = abilFinal;

  // ── 2. Ability Modifiers ────────────────────────────────────────────────────
  const mod = ab => Math.floor((abilFinal[ab] - 10) / 2);
  r.mods = {
    str: mod('str'), dex: mod('dex'), con: mod('con'),
    int: mod('int'), wis: mod('wis'), cha: mod('cha'),
  };

  // ── 3. Proficiency Bonus ────────────────────────────────────────────────────
  const pb = profBonus(level);
  r.pb = pb;

  // ── 4. Saving Throw Mods ────────────────────────────────────────────────────
  // Class save proficiencies + any stored manual overrides
  const classSaveProfs = CLASS_SAVE_PROFS[cls] || [];
  const rawSaveProfs   = raw.savingThrows || {};
  r.saves = {};
  ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ab => {
    const prof = classSaveProfs.includes(ab) || rawSaveProfs[ab];
    r.saves[ab] = r.mods[ab] + (prof ? pb : 0);
  });

  // ── 5. Skill Mods ───────────────────────────────────────────────────────────
  // Start with whatever the player has ticked in the form
  const rawSkills = raw.skills || {};

  // Background auto-grants skills (additive only — never removes existing profs)
  const bgKey  = (raw.background || '').toLowerCase().replace(/\s+/g, '-');
  const bgMech = BACKGROUND_MECHANICS[bgKey];
  const bgProfs = (bgMech?.skills || []).map(_skillKey);

  // Build merged skill map (raw form ticks + background auto-grants)
  const mergedSkills = { ...rawSkills };
  bgProfs.forEach(s => {
    if (!mergedSkills[s] && !mergedSkills[s.replace(/ /g, '_')]) {
      mergedSkills[s] = true;
    }
  });

  // Jack of All Trades — Bard class feature
  const jackOfAllTrades = cls === 'bard' && level >= 2;

  r.skills = {};
  Object.entries(SKILL_ABILITIES).forEach(([skill, ab]) => {
    const altKey = skill.replace(/ /g, '_');
    const prof   = mergedSkills[skill] ?? mergedSkills[altKey];
    let bonus    = r.mods[ab];
    if (prof === 'expert') bonus += pb * 2;
    else if (prof)         bonus += pb;
    else if (jackOfAllTrades) bonus += Math.floor(pb / 2);
    r.skills[skill] = bonus;
    // Also store underscore key for legacy code that uses underscores
    r.skills[altKey] = bonus;
  });

  // ── 6. Passive Perception ───────────────────────────────────────────────────
  let ppBonus = 0;
  (raw.feats || []).forEach(feat => {
    const key = (feat.name || '').toLowerCase().replace(/\s+/g, '-');
    const fm  = FEAT_MECHANICS[key];
    if (fm?.passivePerceptionBonus) ppBonus += fm.passivePerceptionBonus;
  });
  r.pp = 10 + r.skills['perception'] + ppBonus;

  // ── 7. Speed ────────────────────────────────────────────────────────────────
  r.speed = race.speed || 30;
  (raw.feats || []).forEach(feat => {
    const key = (feat.name || '').toLowerCase().replace(/\s+/g, '-');
    const fm  = FEAT_MECHANICS[key];
    if (fm?.speed) r.speed += fm.speed;
  });

  // ── 8. Initiative ───────────────────────────────────────────────────────────
  r.initiative = r.mods.dex;
  (raw.feats || []).forEach(feat => {
    const key = (feat.name || '').toLowerCase().replace(/\s+/g, '-');
    const fm  = FEAT_MECHANICS[key];
    if (fm?.initiative) r.initiative += fm.initiative;
  });
  // Subclass initiative bonuses (e.g. Gloom Stalker Dread Ambusher: +Wis to initiative)
  _activeSubclassEffects(subMech, level).forEach(e => {
    if (e.type === 'initiative_bonus') {
      if (typeof e.value === 'number')    r.initiative += e.value;
      else if (e.value === 'wis_mod')     r.initiative += r.mods.wis;
      else if (e.value === 'dex_mod')     r.initiative += r.mods.dex;
      else if (e.value === 'cha_mod')     r.initiative += r.mods.cha;
      else if (e.value === 'int_mod')     r.initiative += r.mods.int;
    }
  });

  // ── 9. Max HP ───────────────────────────────────────────────────────────────
  const hd = CLASS_HD[cls] || 8;
  // Level 1: full HD + con mod. Level 2+: average HD roll (hd/2 + 1) + con mod per level
  let maxHp = hd + r.mods.con;
  if (level > 1) maxHp += (Math.floor(hd / 2) + 1 + r.mods.con) * (level - 1);

  // Feat max HP bonuses (Tough, Toughness)
  (raw.feats || []).forEach(feat => {
    const key = (feat.name || '').toLowerCase().replace(/\s+/g, '-');
    const fm  = FEAT_MECHANICS[key];
    if (fm?.max_hp_bonus?.perLevel) maxHp += fm.max_hp_bonus.perLevel * level;
  });

  // Subclass max HP bonus (Draconic Sorcerer +1/level)
  const subMech = SUBCLASS_MECHANICS[(raw.subclass || '').toLowerCase().trim()];
  _activeSubclassEffects(subMech, 1).forEach(e => {
    // Only level-1 features for max_hp_bonus (applies from level 1)
    if (e.type === 'max_hp_bonus') maxHp += e.perLevel * level;
  });

  // Backward compat: if character has no ability scores filled in yet, use stored maxHp
  const hasAbilityScores = raw._str || raw._con || raw._dex;
  r.maxHp = hasAbilityScores ? maxHp : (raw.maxHp ?? maxHp);

  // ── 10. Hit Dice ────────────────────────────────────────────────────────────
  r.hd = {
    total:     level,
    remaining: raw.hdRemaining ?? raw.hdLeft ?? level,
    die:       `d${hd}`,
  };

  // ── 11. AC ──────────────────────────────────────────────────────────────────
  const equip = raw.equipment;
  if (equip?.armor) {
    // Armor equipped — compute from armor type + possible shield
    const armor = equip.armor;
    let ac = armor.baseAC ?? 10;
    if (armor.type === 'light')  ac = armor.baseAC + r.mods.dex;
    if (armor.type === 'medium') ac = armor.baseAC + Math.min(r.mods.dex, 2);
    // heavy: baseAC only, dex ignored
    if (equip.shield) ac += equip.shield.acBonus ?? 2;
    r.ac = ac;
  } else {
    // No armor — check unarmored defense or fall back to stored value
    const formula = _getUnarmoredFormula(cls, subMech, level);
    r.ac = formula ? _evalAcFormula(formula, r.mods) : (raw.ac ?? 10);
    if (equip?.shield) r.ac += equip.shield.acBonus ?? 2;
  }

  // ── 12. Temp HP (pass-through — managed by app.js changeHP) ─────────────────
  r.tempHp = raw.tempHp ?? 0;

  // ── 13. Crit Threshold ──────────────────────────────────────────────────────
  r.critThreshold = 20;
  _activeSubclassEffects(subMech, level).forEach(e => {
    if (e.type === 'crit_threshold') r.critThreshold = Math.min(r.critThreshold, e.value);
  });

  // ── 14. Spell Stats ─────────────────────────────────────────────────────────
  const spellAb = SPELL_ABILITY[cls];
  if (spellAb) {
    r.spellMod = r.mods[spellAb];
    r.spellDC  = 8 + pb + r.mods[spellAb];
    r.spellAtk = pb + r.mods[spellAb];
  }

  // Subclass spellcasting (Eldritch Knight, Arcane Trickster = 1/3 caster)
  // Sets r.subclassSpellSlots for use by initClassResources to seed spellSlots if unset.
  const spellcastingEffect = _activeSubclassEffects(subMech, level).find(e => e.type === 'spellcasting');
  if (spellcastingEffect) {
    const slotKey = spellcastingEffect.slots;
    if (slotKey === 'ek_table' || slotKey === 'at_table') {
      r.subclassSpellSlots = THIRD_CASTER_SLOTS[Math.min(level, 20)] ?? null;
    }
    // Spell ability defaults to Int for EK/AT (wizard list)
    if (!r.spellMod) {
      r.spellMod = r.mods.int;
      r.spellDC  = 8 + pb + r.mods.int;
      r.spellAtk = pb + r.mods.int;
    }
  }

  // ── 15. Tags ────────────────────────────────────────────────────────────────
  r.tags = new Set();
  (race.traits || []).forEach(t => r.tags.add(t));
  _activeSubclassEffects(subMech, level).forEach(e => {
    if (e.type === 'tag') r.tags.add(e.name);
  });
  (raw.feats || []).forEach(feat => {
    const key = (feat.name || '').toLowerCase().replace(/\s+/g, '-');
    const fm  = FEAT_MECHANICS[key];
    (fm?.tags || []).forEach(t => r.tags.add(t));
  });

  // ── 16. Active Subclass Slugs ────────────────────────────────────────────────
  r.combatSlugs = [];
  r.selfSlugs   = [];
  r.onKillSlugs = [];
  _activeSubclassEffects(subMech, level).forEach(e => {
    if (e.type === 'combat_action') r.combatSlugs.push(e.slug);
    if (e.type === 'self_action')   r.selfSlugs.push(e.slug);
    if (e.type === 'on_kill')       r.onKillSlugs.push(e.slug);
    // pick_one — use the choice stored in subclassChoices
    if (e.type === 'pick_one' && raw.subclassChoices?.hunterConclave) {
      const choice = e.options.find(o => o.slug === raw.subclassChoices.hunterConclave);
      if (choice?.type === 'combat_action') r.combatSlugs.push(choice.slug);
    }
  });

  // ── 17. Subclass Resources ───────────────────────────────────────────────────
  // Collect resource effects for initClassResources() to reference in Session 3
  r.resources = [];
  _activeSubclassEffects(subMech, level).forEach(e => {
    if (e.type === 'resource') {
      // Merge count upgrades for Battle Master
      const existing = r.resources.find(res => res.name === e.name);
      if (existing) {
        existing.count = Math.max(existing.count, e.count);
      } else {
        r.resources.push({ name: e.name, count: e.count, die: e.die });
      }
    }
    if (e.type === 'resource_count_bonus') {
      const existing = r.resources.find(res => res.name === e.name);
      if (existing) existing.count += e.add;
    }
    if (e.type === 'resource_die_upgrade') {
      const existing = r.resources.find(res => res.name === e.name);
      if (existing) existing.die = e.to;
    }
  });

  // ── 18. Extra Attacks ────────────────────────────────────────────────────────
  // Base extra attack from class level; subclass can add more
  let extraAttacks = 0;
  if (['fighter', 'paladin', 'ranger', 'barbarian', 'monk'].includes(cls) && level >= 5) extraAttacks = 1;
  if (cls === 'fighter' && level >= 11) extraAttacks = 2;
  if (cls === 'fighter' && level >= 20) extraAttacks = 3;
  _activeSubclassEffects(subMech, level).forEach(e => {
    if (e.type === 'extra_attack') extraAttacks += e.count;
  });
  r.extraAttacks = extraAttacks;

  return r;
}

/**
 * Get the resolved stats for a player, preferring an already-attached _resolved
 * to avoid recomputing every render cycle.
 * @param {Object} player
 * @returns {Object}
 */
export function getResolved(player) {
  if (!player) return player;
  if (player.type === 'npc') return player;
  return player._resolved || compute(player);
}
