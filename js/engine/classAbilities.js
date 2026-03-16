// js/engine/classAbilities.js — Class-Specific Mechanics (pure logic, no DOM/Firebase)
// Exports: initClassResources, getSelfActions, getCombatActions, getAllyActions,
//          applyMeleeModifier, onShortRest, WILD_SHAPES
// All fn() implementations fire via window.useClassAbility dispatched from app.js.
// ─────────────────────────────────────────────────────────────────────────────

import { rollDice, profBonus } from './combatUtils.js';
import { statusFlavor } from '../combatFlavor.js';

// ── Beast presets for Druid Wild Shape / Summon Animal ────────────────────────
export const WILD_SHAPES = [
  { id: 'wolf',       name: 'Wolf',       hp: 11, maxHp: 11, ac: 13, melee: 4, meleeDmg: '2d4+2', speed: 40, portrait: 'wolf',        cr: '1/4' },
  { id: 'brown_bear', name: 'Brown Bear', hp: 34, maxHp: 34, ac: 11, melee: 5, meleeDmg: '2d6+4', speed: 40, portrait: 'brown-bear',   cr: '1'   },
  { id: 'panther',    name: 'Panther',    hp: 13, maxHp: 13, ac: 12, melee: 4, meleeDmg: '1d6+2', speed: 50, portrait: 'panther',      cr: '1/4' },
  { id: 'eagle',      name: 'Eagle',      hp: 4,  maxHp: 4,  ac: 12, melee: 4, meleeDmg: '1d4+2', speed: 10, portrait: 'eagle',        cr: '0'   },
];

// ── Default classResources for each class ─────────────────────────────────────
export function initClassResources(className, level = 1) {
  const cls = (className || '').toLowerCase();
  const lvl = Math.max(1, Math.min(20, parseInt(level) || 1));

  switch (cls) {
    case 'barbarian': return { rageUses: Math.min(6, 2 + Math.floor(lvl / 4)), raging: false };
    case 'fighter':   return { secondWind: 1, actionSurge: lvl >= 2 ? 1 : 0 };
    case 'rogue':     return { sneakUsedThisTurn: false };
    case 'paladin':   return { divineSense: 3 };
    case 'ranger':    return { huntersMark: null, huntingConc: false };
    case 'druid':     return { wildShapeUses: 2, wildShapeActive: false, wildShapeOrig: null };
    case 'cleric':    return { channelDivinity: 1 };
    case 'bard':      return { bardicInspiration: Math.max(1, Math.floor(lvl / 5) + 3) };
    case 'monk':      return { kiPoints: lvl, maxKiPoints: lvl };
    case 'warlock':   return { hexTarget: null, hexConc: false };
    default:          return {};
  }
}

// ── Self-targeted action buttons (character card) ─────────────────────────────
// Returns array of { label, cls, available, fn(cName, eng) }
export function getSelfActions(player) {
  const cls  = (player.class || '').toLowerCase();
  const cr   = player.classResources || {};
  const lvl  = player.level || 1;
  const actions = [];

  switch (cls) {
    case 'barbarian': {
      if (cr.raging) {
        actions.push({ label: '🔥 End Rage', cls: 'ability', available: true,
          fn: (cn) => window.useClassAbility(cn, 'endRage') });
      } else {
        actions.push({ label: `🔥 Rage (${cr.rageUses ?? 0} left)`, cls: (cr.rageUses ?? 0) > 0 ? 'ability' : 'disabled',
          available: (cr.rageUses ?? 0) > 0,
          fn: (cn) => window.useClassAbility(cn, 'rage') });
      }
      break;
    }

    case 'fighter': {
      actions.push({
        label: `💨 Second Wind (${cr.secondWind ?? 0} left)`,
        cls:  (cr.secondWind ?? 0) > 0 ? 'heal' : 'disabled',
        available: (cr.secondWind ?? 0) > 0,
        fn: (cn) => window.useClassAbility(cn, 'secondWind'),
      });
      if (lvl >= 2) {
        actions.push({
          label: `⚡ Action Surge (${cr.actionSurge ?? 0} left)`,
          cls:  (cr.actionSurge ?? 0) > 0 ? 'ability' : 'disabled',
          available: (cr.actionSurge ?? 0) > 0,
          fn: (cn) => window.useClassAbility(cn, 'actionSurge'),
        });
      }
      break;
    }

    case 'rogue': {
      actions.push({ label: '🤫 Hide (Invisible)', cls: 'ability', available: true,
        fn: (cn) => window.useClassAbility(cn, 'hide') });
      break;
    }

    case 'druid': {
      if (cr.wildShapeActive) {
        actions.push({ label: '🐾 End Wild Shape', cls: 'ability', available: true,
          fn: (cn) => window.useClassAbility(cn, 'endWildShape') });
      } else {
        actions.push({
          label: `🐾 Wild Shape (${cr.wildShapeUses ?? 0} left)`,
          cls:  (cr.wildShapeUses ?? 0) > 0 ? 'ability' : 'disabled',
          available: (cr.wildShapeUses ?? 0) > 0,
          fn: (cn) => window.useClassAbility(cn, 'wildShape'),
        });
      }
      actions.push({ label: '🐺 Summon Animal (DM)', cls: 'ability', available: true,
        fn: (cn) => window.useClassAbility(cn, 'summonAnimal') });
      break;
    }

    default: break;
  }

  return actions;
}

// ── Combat actions for enemy targeting (right-click popup) ────────────────────
// Returns array of action objects to append to the popup.
export function getCombatActions(attacker, target, distFt, myCName) {
  const cls  = (attacker.class || '').toLowerCase();
  const cr   = attacker.classResources || {};
  const lvl  = attacker.level || 1;
  const actions = [];

  switch (cls) {
    case 'rogue': {
      const hasInvis = Array.isArray(attacker.statuses) && attacker.statuses.includes('Invisible');
      const hasAdv   = hasInvis || cr.huntersMark != null;
      const snkDice  = `${Math.max(1, Math.ceil(lvl / 2))}d6`;
      if (hasAdv && !cr.sneakUsedThisTurn) {
        actions.push({
          label: `🗡️ Sneak Attack (+${snkDice})`,
          cls: 'attack', available: true,
          fn: (cn, tc, eng) => _doSneakAttack(cn, tc, eng, snkDice),
        });
      }
      break;
    }

    case 'paladin': {
      const slots    = attacker.spellSlots || {};
      const used     = slots.used || {};
      const max      = slots.max  || {};
      const lowestSlot = [1,2,3,4,5].find(l => (max[l] || 0) - (used[l] || 0) > 0);
      if (lowestSlot && distFt <= 5) {
        const smiteDice = `${lowestSlot + 1}d8`;
        const undead    = (target.monsterType || '').toLowerCase().includes('undead')
                       || (target.monsterType || '').toLowerCase().includes('fiend');
        actions.push({
          label: `✨ Divine Smite (${undead ? '×2 ' : ''}${smiteDice} radiant)`,
          cls: 'attack', available: true,
          fn: (cn, tc, eng) => _doDivineSmite(cn, tc, eng, lowestSlot, undead),
        });
      }
      break;
    }

    case 'ranger': {
      const isMarked  = cr.huntersMark === myCName + '_target'; // hack: we pass targetCName via closure
      const alreadyMarked = cr.huntersMark != null;
      actions.push({
        label: alreadyMarked ? '🎯 Move Hunter\'s Mark' : '🎯 Hunter\'s Mark (+1d6)',
        cls: 'ability', available: true,
        fn: (cn, tc, eng) => window.useClassAbility(cn, 'huntersMark', tc),
      });
      break;
    }

    case 'cleric': {
      const isUndead = (target.monsterType || '').toLowerCase().includes('undead');
      if (isUndead && (cr.channelDivinity ?? 0) > 0) {
        actions.push({
          label: '✝️ Turn Undead',
          cls: 'attack', available: true,
          fn: (cn, tc, eng) => _doTurnUndead(cn, tc, eng, lvl),
        });
      }
      break;
    }

    case 'monk': {
      if (distFt <= 5 && (cr.kiPoints ?? 0) > 0) {
        actions.push({
          label: `🥋 Flurry of Blows (${cr.kiPoints} ki left)`,
          cls: 'attack', available: true,
          fn: (cn, tc, eng) => _doFlurryOfBlows(cn, tc, eng),
        });
      }
      break;
    }

    case 'warlock': {
      const isHexed = cr.hexTarget != null;
      actions.push({
        label: isHexed ? '🔮 Move Hex' : '🔮 Hex (+1d6 necrotic)',
        cls: 'ability', available: true,
        fn: (cn, tc, eng) => window.useClassAbility(cn, 'hex', tc),
      });
      break;
    }

    default: break;
  }

  return actions;
}

// ── Ally-targeted actions (right-click on teammate) ───────────────────────────
export function getAllyActions(attacker, ally) {
  const cls  = (attacker.class || '').toLowerCase();
  const cr   = attacker.classResources || {};
  const actions = [];

  if (cls === 'bard') {
    actions.push({
      label: `🎵 Bardic Inspiration (${cr.bardicInspiration ?? 0} left)`,
      cls:  (cr.bardicInspiration ?? 0) > 0 ? 'heal' : 'disabled',
      available: (cr.bardicInspiration ?? 0) > 0,
      fn: (cn, tc, eng) => _doBardicInspiration(cn, tc, eng),
    });
  }

  return actions;
}

// ── Passive damage modifier (call from _doMeleeAttack before applying damage) ──
// Returns the (possibly increased) damage value.
export function applyMeleeModifier(attacker, damage) {
  const cls = (attacker.class || '').toLowerCase();
  const cr  = attacker.classResources || {};

  if (cls === 'barbarian' && cr.raging) {
    return damage + 2;
  }
  return damage;
}

// ── Short Rest reset ──────────────────────────────────────────────────────────
// Returns a patch object to merge into classResources.
export function onShortRest(player) {
  const cls = (player.class || '').toLowerCase();
  const cr  = player.classResources || {};
  const lvl = player.level || 1;
  const patch = {};

  switch (cls) {
    case 'fighter':
      if ((cr.secondWind ?? 0) < 1) patch.secondWind = 1;
      if (lvl >= 2 && (cr.actionSurge ?? 0) < 1) patch.actionSurge = 1;
      break;
    case 'cleric':
      patch.channelDivinity = 1;
      break;
    case 'monk':
      patch.kiPoints = cr.maxKiPoints ?? lvl;
      break;
    default: break;
  }

  return patch;
}

// ── Long Rest reset ────────────────────────────────────────────────────────────
export function onLongRest(player) {
  const cls = (player.class || '').toLowerCase();
  const lvl = player.level || 1;
  const patch = {};

  switch (cls) {
    case 'barbarian': patch.rageUses = Math.min(6, 2 + Math.floor(lvl / 4)); patch.raging = false; break;
    case 'fighter':   patch.secondWind = 1; if (lvl >= 2) patch.actionSurge = 1; break;
    case 'rogue':     patch.sneakUsedThisTurn = false; break;
    case 'cleric':    patch.channelDivinity = 1; break;
    case 'bard':      patch.bardicInspiration = Math.max(1, Math.floor(lvl / 5) + 3); break;
    case 'monk':      patch.kiPoints = lvl; break;
    case 'druid':     patch.wildShapeUses = 2; break;
    default: break;
  }

  return patch;
}

// ── Internal helpers (called from fn closures) ─────────────────────────────────

function _doSneakAttack(attackerCName, targetCName, eng, snkDice) {
  const attacker = eng.S.players[attackerCName] || {};
  const target   = eng.S.players[targetCName]   || {};
  const bonus    = attacker.melee ?? 0;
  const ac       = target.ac ?? 10;

  const rawRoll = Math.floor(Math.random() * 20) + 1;
  const total   = rawRoll + bonus;
  const crit    = rawRoll === 20;
  const miss    = rawRoll === 1;
  const hit     = crit || (!miss && total >= ac);

  const dmgDice  = attacker.meleeDmg || '1d6';
  let damage = 0;
  if (hit) {
    const { total: baseDmg } = rollDice(dmgDice, crit);
    const { total: snkDmg  } = rollDice(snkDice, crit);
    damage = Math.max(1, baseDmg + snkDmg);
    const newHp = Math.max(0, (target.hp ?? target.maxHp ?? 0) - damage);
    eng.db?.updatePlayerHPInDB(targetCName, newHp);
  }

  eng.db?.saveRollToDB({
    type: 'ATTACK', cName: attackerCName, pName: attacker.pName || attackerCName,
    target: targetCName, rawRoll, total, ac, hit, crit, miss,
    damage, dmgDice: `${dmgDice}+${snkDice} sneak`,
    color: '#9b59b6', flavor: statusFlavor('sneakAttack', attackerCName, targetCName), ts: Date.now(),
  });

  // Remove Invisible after attacking
  if (Array.isArray(attacker.statuses) && attacker.statuses.includes('Invisible')) {
    window.toggleStatus?.(attackerCName, 'Invisible');
  }

  // Mark sneak used
  window.patchClassResources?.(attackerCName, { sneakUsedThisTurn: true });

  const atkTk = eng.S.tokens[attackerCName], tarTk = eng.S.tokens[targetCName];
  if (tarTk) eng.anim?.trigger(crit ? 'MELEE_CRIT' : hit ? 'MELEE_HIT' : 'MELEE_MISS', atkTk, tarTk);
}

function _doDivineSmite(attackerCName, targetCName, eng, slotLevel, undead) {
  const attacker = eng.S.players[attackerCName] || {};
  const target   = eng.S.players[targetCName]   || {};
  const bonus    = attacker.melee ?? 0;
  const ac       = target.ac ?? 10;

  const rawRoll = Math.floor(Math.random() * 20) + 1;
  const total   = rawRoll + bonus;
  const crit    = rawRoll === 20;
  const miss    = rawRoll === 1;
  const hit     = crit || (!miss && total >= ac);

  const dmgDice   = attacker.meleeDmg || '1d6';
  const smiteDice = `${slotLevel + 1}d8`;
  let damage = 0;
  if (hit) {
    const { total: meleeDmg } = rollDice(dmgDice, crit);
    const { total: smiteDmg } = rollDice(smiteDice, crit);
    damage = Math.max(1, meleeDmg + (undead ? smiteDmg * 2 : smiteDmg));
    const newHp = Math.max(0, (target.hp ?? target.maxHp ?? 0) - damage);
    eng.db?.updatePlayerHPInDB(targetCName, newHp);
  }

  window.useSpellSlot?.(attackerCName, slotLevel);

  eng.db?.saveRollToDB({
    type: 'ATTACK', cName: attackerCName, pName: attacker.pName || attackerCName,
    target: targetCName, rawRoll, total, ac, hit, crit, miss,
    damage, dmgDice: `${dmgDice}+${smiteDice}${undead ? '×2' : ''} radiant`,
    color: '#f1c40f', flavor: statusFlavor(undead ? 'divineSmiteUndead' : 'divineSmite', attackerCName, targetCName), ts: Date.now(),
  });

  const atkTk = eng.S.tokens[attackerCName], tarTk = eng.S.tokens[targetCName];
  if (tarTk) eng.anim?.trigger(crit ? 'MELEE_CRIT' : hit ? 'MELEE_HIT' : 'MELEE_MISS', atkTk, tarTk);
}

function _doTurnUndead(attackerCName, targetCName, eng, level) {
  const attacker = eng.S.players[attackerCName] || {};
  const dc = 8 + profBonus(level);
  const saveRoll = Math.floor(Math.random() * 20) + 1;
  const saved = saveRoll >= dc;

  if (!saved) {
    window.toggleStatus?.(targetCName, 'Frightened');
  }

  window.patchClassResources?.(attackerCName, { channelDivinity: Math.max(0, (attacker.classResources?.channelDivinity ?? 1) - 1) });

  eng.db?.saveRollToDB({
    type: 'STATUS', cName: attackerCName,
    status: saved
      ? statusFlavor('turnUndeadResisted', attackerCName, targetCName) + ` (save ${saveRoll} vs DC ${dc})`
      : statusFlavor('turnUndeadFailed',   attackerCName, targetCName) + ` (save ${saveRoll} vs DC ${dc})`,
    ts: Date.now(),
  });

  const tarTk = eng.S.tokens[targetCName];
  if (tarTk) eng.anim?.trigger('SPELL_HIT', eng.S.tokens[attackerCName], tarTk);
}

function _doFlurryOfBlows(attackerCName, targetCName, eng) {
  const attacker = eng.S.players[attackerCName] || {};
  const cr = attacker.classResources || {};

  window.patchClassResources?.(attackerCName, { kiPoints: Math.max(0, (cr.kiPoints ?? 0) - 1) });

  // Two unarmed strikes
  for (let i = 0; i < 2; i++) {
    const target  = eng.S.players[targetCName] || {};
    const bonus   = attacker.melee ?? 0;
    const ac      = target.ac ?? 10;
    const rawRoll = Math.floor(Math.random() * 20) + 1;
    const total   = rawRoll + bonus;
    const crit    = rawRoll === 20;
    const miss    = rawRoll === 1;
    const hit     = crit || (!miss && total >= ac);

    let damage = 0;
    if (hit) {
      const { total: d } = rollDice('1d4', crit);
      damage = Math.max(1, d);
      // Refetch latest HP for second strike
      const currentHp = eng.S.players[targetCName]?.hp ?? target.maxHp ?? 0;
      const newHp = Math.max(0, currentHp - damage);
      eng.db?.updatePlayerHPInDB(targetCName, newHp);
    }

    eng.db?.saveRollToDB({
      type: 'ATTACK', cName: attackerCName, pName: attacker.pName || attackerCName,
      target: targetCName, rawRoll, total, ac, hit, crit, miss,
      damage, dmgDice: '1d4',
      color: '#e67e22', flavor: i === 0 ? statusFlavor('flurryOfBlows', attackerCName, targetCName) : `🥋 Strike 2 lands.`, ts: Date.now(),
    });

    const atkTk = eng.S.tokens[attackerCName], tarTk = eng.S.tokens[targetCName];
    if (tarTk) eng.anim?.trigger(hit ? 'MELEE_HIT' : 'MELEE_MISS', atkTk, tarTk);
  }
}

function _doBardicInspiration(attackerCName, targetCName, eng) {
  const attacker = eng.S.players[attackerCName] || {};
  const cr = attacker.classResources || {};

  window.patchClassResources?.(attackerCName, { bardicInspiration: Math.max(0, (cr.bardicInspiration ?? 0) - 1) });
  window.patchClassResources?.(targetCName, { bardicInspoBonus: true });

  eng.db?.saveRollToDB({
    type: 'STATUS', cName: attackerCName,
    status: statusFlavor('bardicInspiration', attackerCName, targetCName),
    ts: Date.now(),
  });
}
