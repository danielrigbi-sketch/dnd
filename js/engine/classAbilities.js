// js/engine/classAbilities.js — Class-Specific Mechanics (pure logic, no DOM/Firebase)
// Exports: initClassResources, getSelfActions, getCombatActions, getAllyActions,
//          applyMeleeModifier, onShortRest, WILD_SHAPES
// All fn() implementations fire via window.useClassAbility dispatched from app.js.
// ─────────────────────────────────────────────────────────────────────────────

import { rollDice, profBonus } from './combatUtils.js';
import { statusFlavor } from '../combatFlavor.js';
import { getResolved } from './charEngine.js';
import { iconImg } from '../iconMap.js';
import { t } from '../i18n.js';

// ── Wild Magic Surge Table (20-entry simplified) ──────────────────────────────
export const WILD_MAGIC_SURGES = [
  'A bolt of lightning strikes you and each creature within 30 ft (2d6, DC 15 DEX)',
  'You regain 2d10 hit points.',
  'You are stunned until the end of your next turn.',
  'For 1 minute, any creature that ends its turn within 5 ft of you gains 1d6 HP.',
  'You turn invisible until the end of your next turn.',
  'You teleport up to 60 ft to a random unoccupied space you can see.',
  'You cast Confusion centered on yourself (DC 15, 1 min).',
  'Your skin turns an iridescent color for 24 hours. (Cosmetic)',
  'A unicorn appears within 5 ft, acts as an ally, and vanishes after 1 minute.',
  'You cast Lightning Bolt (3rd-level) targeting a random creature you can see.',
  'All expended spell slots are restored.',
  'You take 2d10 necrotic damage and cannot regain HP until your next turn.',
  'You grow a long beard of feathers that disappears after 24 hours. (Cosmetic)',
  'All creatures within 30 ft take 1d10 force damage (no save).',
  'You age 1d10 years. (Cosmetic, reversible with Greater Restoration)',
  'You cannot speak for 1 minute.',
  'You cast Grease centered on yourself (DC 12).',
  'Butterflies and flower petals pour from you for 1 minute. (Cosmetic)',
  'You gain Truesight (60 ft) until the end of your next turn.',
  'You cast Fireball (5th-level, 8d6) centered on yourself.',
];

// ── Beast presets for Druid Wild Shape / Summon Animal ────────────────────────
export const WILD_SHAPES = [
  { id: 'wolf',       name: 'Wolf',       hp: 11, maxHp: 11, ac: 13, melee: 4, meleeDmg: '2d4+2', speed: 40, portrait: 'wolf',        cr: '1/4' },
  { id: 'brown_bear', name: 'Brown Bear', hp: 34, maxHp: 34, ac: 11, melee: 5, meleeDmg: '2d6+4', speed: 40, portrait: 'brown-bear',   cr: '1'   },
  { id: 'panther',    name: 'Panther',    hp: 13, maxHp: 13, ac: 12, melee: 4, meleeDmg: '1d6+2', speed: 50, portrait: 'panther',      cr: '1/4' },
  { id: 'eagle',      name: 'Eagle',      hp: 4,  maxHp: 4,  ac: 12, melee: 4, meleeDmg: '1d4+2', speed: 10, portrait: 'eagle',        cr: '0'   },
];

// ── Default classResources for each class ─────────────────────────────────────
// Accepts either a player object (new API) or a class name string (backward compat).
export function initClassResources(playerOrClass, level = 1) {
  const player   = (playerOrClass && typeof playerOrClass === 'object') ? playerOrClass : null;
  const cls      = player ? (player.class || '').toLowerCase() : (playerOrClass || '').toLowerCase();
  const lvl      = Math.max(1, Math.min(20, parseInt(player?.level ?? level) || 1));
  const resolved = player ? getResolved(player) : null;

  let result;
  switch (cls) {
    case 'barbarian': result = { rageUses: Math.min(6, 2 + Math.floor(lvl / 4)), raging: false }; break;
    case 'fighter':   result = { secondWind: 1, actionSurge: lvl >= 2 ? 1 : 0 }; break;
    case 'rogue':     result = { sneakUsedThisTurn: false }; break;
    case 'paladin':   result = { divineSense: 3 }; break;
    case 'ranger':    result = { huntersMark: null, huntingConc: false }; break;
    case 'druid':     result = { wildShapeUses: 2, wildShapeActive: false, wildShapeOrig: null }; break;
    case 'cleric':    result = { channelDivinity: 1 }; break;
    case 'bard':      result = { bardicInspiration: Math.max(1, Math.floor(lvl / 5) + 3) }; break;
    case 'monk':      result = { kiPoints: lvl, maxKiPoints: lvl }; break;
    case 'warlock':   result = { hexTarget: null, hexConc: false }; break;
    default:          result = {}; break;
  }

  // Merge subclass resources from compute() (Battle Master dice, Portent, Arcane Ward, etc.)
  if (resolved?.resources?.length) {
    resolved.resources.forEach(res => {
      if (res.name === 'portentDice') {
        if (!result.portentDice) {
          result.portentDice = {
            rolls: [Math.floor(Math.random() * 20) + 1, Math.floor(Math.random() * 20) + 1],
            used: [],
          };
        }
      } else if (res.name === 'arcaneWard') {
        result.arcaneWardHp = 2 * lvl + (resolved.mods?.int ?? 0);
      } else {
        // Generic resource: superiorityDice, tidesOfChaos, transmutationStone, etc.
        if (result[res.name] === undefined) {
          result[res.name] = { total: res.count, remaining: res.count, die: res.die };
        }
      }
    });
  }

  return result;
}

// ── Self-targeted action buttons (character card) ─────────────────────────────
// Returns array of { label, cls, available, fn(cName, eng) }
export function getSelfActions(player) {
  const cls  = (player.class || '').toLowerCase();
  const cr   = player.classResources || {};
  const lvl  = player.level || 1;
  const actions = [];

  // ── Weapon attack actions (auto-generated from equipment) ──────────
  const eq = player.equipment;
  if (eq) {
    const pb = Math.ceil(lvl / 4) + 1; // proficiency bonus
    const strMod = Math.floor(((player._str || 10) - 10) / 2);
    const dexMod = Math.floor(((player._dex || 10) - 10) / 2);
    if (eq.mainHand?.name) {
      const isFinesse = (eq.mainHand.properties || '').toLowerCase().includes('finesse');
      const mod = isFinesse ? Math.max(strMod, dexMod) : strMod;
      const hitBonus = pb + mod;
      const dmg = eq.mainHand.damageDice || '1d6';
      actions.push({
        label: `${iconImg('⚔️','14px')} ${eq.mainHand.name} — ${t('weapon_hit')} +${hitBonus}`,
        cls: 'attack', available: true,
        fn: (cn) => window.rollMacro?.(cn, eq.mainHand.name, hitBonus)
      });
      actions.push({
        label: `${iconImg('💥','14px')} ${eq.mainHand.name} — ${t('weapon_dmg')} ${dmg}+${mod}`,
        cls: 'attack damage', available: true,
        fn: (cn) => window.rollDamageMacro?.(cn, eq.mainHand.name, dmg, mod)
      });
    }
    if (eq.ranged?.name) {
      const hitBonus = pb + dexMod;
      const dmg = eq.ranged.damageDice || '1d6';
      actions.push({
        label: `${iconImg('🏹','14px')} ${eq.ranged.name} — ${t('weapon_hit')} +${hitBonus}`,
        cls: 'attack', available: true,
        fn: (cn) => window.rollMacro?.(cn, eq.ranged.name, hitBonus)
      });
      actions.push({
        label: `${iconImg('💥','14px')} ${eq.ranged.name} — ${t('weapon_dmg')} ${dmg}+${dexMod}`,
        cls: 'attack damage', available: true,
        fn: (cn) => window.rollDamageMacro?.(cn, eq.ranged.name, dmg, dexMod)
      });
    }
    if (eq.offHand?.name && !eq.shield) {
      const isFinesse = (eq.offHand.properties || '').toLowerCase().includes('finesse');
      const mod = isFinesse ? Math.max(strMod, dexMod) : strMod;
      const hitBonus = pb + mod;
      const dmg = eq.offHand.damageDice || '1d6';
      actions.push({
        label: `${iconImg('🗡️','14px')} ${eq.offHand.name} (${t('weapon_off')}) — ${t('weapon_hit')} +${hitBonus}`,
        cls: 'attack bonus', available: true,
        fn: (cn) => window.rollMacro?.(cn, eq.offHand.name, hitBonus)
      });
      actions.push({
        label: `${iconImg('💥','14px')} ${eq.offHand.name} (${t('weapon_off')}) — ${t('weapon_dmg')} ${dmg}+${mod}`,
        cls: 'attack damage bonus', available: true,
        fn: (cn) => window.rollDamageMacro?.(cn, eq.offHand.name, dmg, mod)
      });
    }
    if (actions.length > 0) actions.push({ label: '──────────────', cls: 'disabled', available: false, fn: null });
  }

  switch (cls) {
    case 'barbarian': {
      if (cr.raging) {
        actions.push({ label: `${iconImg('🔥','14px')} End Rage`, cls: 'ability', available: true,
          fn: (cn) => window.useClassAbility(cn, 'endRage') });
      } else {
        actions.push({ label: `${iconImg('🔥','14px')} Rage (${cr.rageUses ?? 0} left)`, cls: (cr.rageUses ?? 0) > 0 ? 'ability' : 'disabled',
          available: (cr.rageUses ?? 0) > 0,
          fn: (cn) => window.useClassAbility(cn, 'rage') });
      }
      break;
    }

    case 'fighter': {
      actions.push({
        label: `${iconImg('💨','14px')} Second Wind (${cr.secondWind ?? 0} left)`,
        cls:  (cr.secondWind ?? 0) > 0 ? 'heal' : 'disabled',
        available: (cr.secondWind ?? 0) > 0,
        fn: (cn) => window.useClassAbility(cn, 'secondWind'),
      });
      if (lvl >= 2) {
        actions.push({
          label: `${iconImg('⚡','14px')} Action Surge (${cr.actionSurge ?? 0} left)`,
          cls:  (cr.actionSurge ?? 0) > 0 ? 'ability' : 'disabled',
          available: (cr.actionSurge ?? 0) > 0,
          fn: (cn) => window.useClassAbility(cn, 'actionSurge'),
        });
      }
      break;
    }

    case 'rogue': {
      actions.push({ label: `${iconImg('🤫','14px')} Hide (Invisible)`, cls: 'ability', available: true,
        fn: (cn) => window.useClassAbility(cn, 'hide') });
      break;
    }

    case 'druid': {
      if (cr.wildShapeActive) {
        actions.push({ label: `${iconImg('🐾','14px')} End Wild Shape`, cls: 'ability', available: true,
          fn: (cn) => window.useClassAbility(cn, 'endWildShape') });
      } else {
        actions.push({
          label: `${iconImg('🐾','14px')} Wild Shape (${cr.wildShapeUses ?? 0} left)`,
          cls:  (cr.wildShapeUses ?? 0) > 0 ? 'ability' : 'disabled',
          available: (cr.wildShapeUses ?? 0) > 0,
          fn: (cn) => window.useClassAbility(cn, 'wildShape'),
        });
      }
      actions.push({ label: `${iconImg('🐺','14px')} Summon Animal (DM)`, cls: 'ability', available: true,
        fn: (cn) => window.useClassAbility(cn, 'summonAnimal') });
      break;
    }

    default: break;
  }

  // Tag-based self-action buttons (checked directly from resolved.tags)
  const resolvedS = getResolved(player);
  if (resolvedS?.tags?.has('wild_magic_surge')) {
    const toc = cr.tidesOfChaos;
    const remaining = typeof toc === 'object' ? (toc.remaining ?? 0) : (toc ?? 0);
    actions.push({
      label: `${iconImg('🌀','14px')} Tides of Chaos (${remaining} left)`,
      cls:  remaining > 0 ? 'ability' : 'disabled',
      available: remaining > 0,
      fn: (cn) => window.useClassAbility(cn, 'tidesOfChaos'),
    });
    actions.push({ label: `${iconImg('💥','14px')} Wild Magic Surge (d20)`, cls: 'ability', available: true,
      fn: (cn) => window.useClassAbility(cn, 'wildMagicSurge') });
  }
  if (resolvedS?.tags?.has('misty_escape')) {
    actions.push({ label: `${iconImg('👻','14px')} Misty Escape (reaction)`, cls: 'ability', available: true,
      fn: (cn) => window.useClassAbility(cn, 'mistyEscape') });
  }
  if (resolvedS?.tags?.has('rangers_companion')) {
    actions.push({ label: `${iconImg('🐾','14px')} Companion: Command Attack`, cls: 'ability', available: true,
      fn: (cn) => window.useClassAbility(cn, 'companionAttack') });
  }
  if (resolvedS?.tags?.has('shadow_step') && cls === 'monk') {
    actions.push({ label: `${iconImg('🌑','14px')} Shadow Step (Ki: 2)`, cls: (cr.kiPoints ?? 0) >= 2 ? 'ability' : 'disabled',
      available: (cr.kiPoints ?? 0) >= 2,
      fn: (cn) => window.useClassAbility(cn, 'shadowStep') });
  }
  if (resolvedS?.tags?.has('wholeness_of_body') && cls === 'monk') {
    actions.push({ label: `${iconImg('✨','14px')} Wholeness of Body`, cls: 'ability', available: true,
      fn: (cn) => window.useClassAbility(cn, 'wholenessOfBody') });
  }
  if (resolvedS?.tags?.has('open_hand_technique')) {
    // Also show as a note that it activates on Flurry hits (auto-tracked)
    actions.push({ label: `${iconImg('👐','14px')} Open Hand Technique (auto on Flurry)`, cls: 'info', available: false, fn: () => {} });
  }

  // Subclass self-action slugs (from compute() → _resolved.selfSlugs)
  const resolved = getResolved(player);
  (resolved?.selfSlugs || []).forEach(slug => {
    switch (slug) {
      case 'frenzy':
        // Frenzy is only meaningful while raging; show when rage is active
        if (cr.raging && !cr.frenzyActive) {
          actions.push({ label: `${iconImg('😤','14px')} Frenzy (1 Exhaustion)`, cls: 'ability', available: true,
            fn: (cn) => window.useClassAbility(cn, 'frenzy') });
        }
        break;
      case 'intimidating_presence':
        actions.push({ label: `${iconImg('😠','14px')} Intimidating Presence`, cls: 'ability', available: true,
          fn: (cn) => window.useClassAbility(cn, 'intimidatingPresence') });
        break;
      case 'sacred_weapon':
        actions.push({ label: `${iconImg('✨','14px')} Sacred Weapon`, cls: 'ability', available: true,
          fn: (cn) => window.useClassAbility(cn, 'sacredWeapon') });
        break;
      case 'fey_presence':
        actions.push({ label: `${iconImg('🧚','14px')} Fey Presence`, cls: 'ability', available: true,
          fn: (cn) => window.useClassAbility(cn, 'feyPresence') });
        break;
      default: break;
    }
  });

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
          label: `${iconImg('🗡️','14px')} Sneak Attack (+${snkDice})`,
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
          label: `${iconImg('✨','14px')} Divine Smite (${undead ? '×2 ' : ''}${smiteDice} radiant)`,
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
        label: alreadyMarked ? `${iconImg('🎯','14px')} Move Hunter's Mark` : `${iconImg('🎯','14px')} Hunter's Mark (+1d6)`,
        cls: 'ability', available: true,
        fn: (cn, tc, eng) => window.useClassAbility(cn, 'huntersMark', tc),
      });
      break;
    }

    case 'cleric': {
      const isUndead = (target.monsterType || '').toLowerCase().includes('undead');
      if (isUndead && (cr.channelDivinity ?? 0) > 0) {
        actions.push({
          label: `${iconImg('✝️','14px')} Turn Undead`,
          cls: 'attack', available: true,
          fn: (cn, tc, eng) => _doTurnUndead(cn, tc, eng, lvl),
        });
      }
      break;
    }

    case 'monk': {
      if (distFt <= 5 && (cr.kiPoints ?? 0) > 0) {
        actions.push({
          label: `${iconImg('🥋','14px')} Flurry of Blows (${cr.kiPoints} ki left)`,
          cls: 'attack', available: true,
          fn: (cn, tc, eng) => _doFlurryOfBlows(cn, tc, eng),
        });
      }
      break;
    }

    case 'warlock': {
      const isHexed = cr.hexTarget != null;
      actions.push({
        label: isHexed ? `${iconImg('🔮','14px')} Move Hex` : `${iconImg('🔮','14px')} Hex (+1d6 necrotic)`,
        cls: 'ability', available: true,
        fn: (cn, tc, eng) => window.useClassAbility(cn, 'hex', tc),
      });
      break;
    }

    default: break;
  }

  // Subclass combat-action slugs (from compute() → _resolved.combatSlugs)
  const resolvedA = getResolved(attacker);
  (resolvedA?.combatSlugs || []).forEach(slug => {
    switch (slug) {
      case 'colossus_slayer': {
        const tMaxHp = target._resolved?.maxHp ?? target.maxHp ?? 999;
        const tHp    = target.hp ?? tMaxHp;
        if (tHp < tMaxHp) {
          actions.push({ label: `${iconImg('🏹','14px')} Colossus Slayer (+1d8)`, cls: 'attack', available: true,
            fn: (cn, tc, eng) => _doColossusSlayer(cn, tc, eng) });
        }
        break;
      }
      case 'giant_killer':
        // Giant Killer: reaction when Large+ creature misses you — not automatable here, show as reminder
        break;
      case 'horde_breaker':
        actions.push({ label: `${iconImg('⚔️','14px')} Horde Breaker (extra attack)`, cls: 'attack', available: true,
          fn: (cn, tc, eng) => window.useClassAbility(cn, 'hordeBreaker', tc) });
        break;
      case 'cutting_words':
        actions.push({
          label: `${iconImg('✂️','14px')} Cutting Words (${cr.bardicInspiration ?? 0} left)`,
          cls:  (cr.bardicInspiration ?? 0) > 0 ? 'ability' : 'disabled',
          available: (cr.bardicInspiration ?? 0) > 0,
          fn: (cn, tc, eng) => _doCuttingWords(cn, tc, eng),
        });
        break;
      case 'vow_of_enmity':
        actions.push({ label: `${iconImg('⚔️','14px')} Vow of Enmity (Advantage)`, cls: 'ability', available: true,
          fn: (cn, tc, eng) => window.useClassAbility(cn, 'vowOfEnmity', tc) });
        break;
      case 'war_priest':
        actions.push({ label: `${iconImg('⚔️','14px')} War Priest (bonus attack)`, cls: 'attack', available: true,
          fn: (cn, tc, eng) => window.useClassAbility(cn, 'warPriest', tc) });
        break;
      case 'warding_flare':
        actions.push({ label: `${iconImg('🌟','14px')} Warding Flare (impose disadv)`, cls: 'ability', available: true,
          fn: (cn, tc, eng) => window.useClassAbility(cn, 'wardingFlare', tc) });
        break;
      case 'wrath_of_storm':
        if ((cr.channelDivinity ?? 0) > 0) {
          actions.push({ label: `${iconImg('⛈️','14px')} Wrath of the Storm`, cls: 'attack', available: true,
            fn: (cn, tc, eng) => window.useClassAbility(cn, 'wrathOfStorm', tc) });
        }
        break;
      case 'divine_strike_radiant':
      case 'divine_strike_fire':
      case 'divine_strike_thunder': {
        if (lvl >= 8 && distFt <= 5) {
          const dmgType = slug.replace('divine_strike_', '');
          const dice    = lvl >= 14 ? '2d8' : '1d8';
          actions.push({ label: `${iconImg('✝️','14px')} Divine Strike (${dice} ${dmgType})`, cls: 'attack', available: true,
            fn: (cn, tc, eng) => _doDivineStrike(cn, tc, eng, dice, dmgType) });
        }
        break;
      }
      default: break;
    }
  });

  // ── Battle Master Maneuvers ──────────────────────────────────────────────────
  {
    const sdCr = cr.superiorityDice;
    const sdRemaining = typeof sdCr === 'object' ? (sdCr.remaining ?? 0) : 0;
    const sdDie = typeof sdCr === 'object' ? (sdCr.die || 'd8') : 'd8';
    const maneuvers = attacker.subclassChoices?.maneuvers || [];
    if (maneuvers.length > 0) {
      maneuvers.forEach(maneuver => {
        const available = sdRemaining > 0;
        const label = _maneuverLabel(maneuver, sdDie, sdRemaining);
        if (label) {
          actions.push({
            label, cls: available ? 'attack' : 'disabled', available,
            fn: (cn, tc, eng) => _doManeuver(cn, tc, eng, maneuver, sdDie),
          });
        }
      });
    }
  }

  // Tag-based combat actions
  if (resolvedA?.tags?.has('dread_ambusher')) {
    actions.push({ label: `${iconImg('🌑','14px')} Dread Ambusher (+1d8, first turn)`, cls: 'attack', available: true,
      fn: (cn, tc, eng) => _doDreadAmbusher(cn, tc, eng) });
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
      label: `${iconImg('🎵','14px')} Bardic Inspiration (${cr.bardicInspiration ?? 0} left)`,
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
  const cls      = (player.class || '').toLowerCase();
  const cr       = player.classResources || {};
  const lvl      = player.level || 1;
  const resolved = getResolved(player);
  const patch    = {};

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
    case 'warlock':
      // Warlocks regain spell slots on short rest
      // (handled by longRest in app.js too, but also reset here)
      break;
    default: break;
  }

  // Battle Master: superiority dice recharge on short rest
  if (cr.superiorityDice && typeof cr.superiorityDice === 'object') {
    patch.superiorityDice = { ...cr.superiorityDice, remaining: cr.superiorityDice.total ?? cr.superiorityDice.count ?? 4 };
  }
  // Wild Magic: tidesOfChaos is expended manually, does NOT recharge on short rest

  return patch;
}

// ── Long Rest reset ────────────────────────────────────────────────────────────
export function onLongRest(player) {
  const cls      = (player.class || '').toLowerCase();
  const lvl      = player.level || 1;
  const cr       = player.classResources || {};
  const resolved = getResolved(player);
  const patch    = {};

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

  // Battle Master superiority dice — recharge on long rest
  if (cr.superiorityDice && typeof cr.superiorityDice === 'object') {
    patch.superiorityDice = { ...cr.superiorityDice, remaining: cr.superiorityDice.total ?? 4 };
  }

  // Tides of Chaos — recharges on long rest
  if (cr.tidesOfChaos !== undefined) {
    if (typeof cr.tidesOfChaos === 'object') {
      patch.tidesOfChaos = { ...cr.tidesOfChaos, remaining: cr.tidesOfChaos.total ?? 1 };
    } else {
      patch.tidesOfChaos = { total: 1, remaining: 1 };
    }
  }

  // Portent Dice (Divination Wizard) — re-roll on long rest
  if (cr.portentDice) {
    patch.portentDice = {
      rolls: [Math.floor(Math.random() * 20) + 1, Math.floor(Math.random() * 20) + 1],
      used: [],
    };
    if (resolved?.resources?.find(r => r.name === 'portentDice')?.count === 3) {
      patch.portentDice.rolls.push(Math.floor(Math.random() * 20) + 1);
    }
  }

  // Arcane Ward (Abjuration Wizard) — refresh to max on long rest
  if (cr.arcaneWardHp !== undefined && resolved) {
    patch.arcaneWardHp = 2 * lvl + (resolved.mods?.int ?? 0);
  }

  return patch;
}

// ── On-kill hooks (exported; called from tokenSystem after target HP hits 0) ───
export function onKill(attackerCName, targetCName, eng) {
  const attacker = eng.S.players[attackerCName] || {};
  const resolved = getResolved(attacker);
  if (!resolved?.onKillSlugs?.length) return;

  resolved.onKillSlugs.forEach(slug => {
    switch (slug) {
      case 'dark_one_blessing': {
        const tempHp = Math.max(1, (resolved.mods?.cha ?? 0) + (attacker.level || 1));
        eng.db?.patchPlayerInDB(attackerCName, { tempHp });
        eng.db?.saveRollToDB({
          type: 'STATUS', cName: attackerCName,
          status: `${iconImg('😈','14px')} Dark One's Blessing: ${attackerCName} gains ${tempHp} temp HP!`,
          ts: Date.now(),
        });
        break;
      }
      default: break;
    }
  });
}

// ── Internal helpers (called from fn closures) ─────────────────────────────────

function _doColossusSlayer(attackerCName, targetCName, eng) {
  const attacker = eng.S.players[attackerCName] || {};
  const target   = eng.S.players[targetCName]   || {};
  const bonus    = attacker.melee ?? 0;
  const ac       = target._resolved?.ac ?? target.ac ?? 10;

  const rawRoll = Math.floor(Math.random() * 20) + 1;
  const total   = rawRoll + bonus;
  const crit    = rawRoll === 20;
  const miss    = rawRoll === 1;
  const hit     = crit || (!miss && total >= ac);

  const dmgDice = attacker.meleeDmg || '1d6';
  let damage = 0;
  if (hit) {
    const { total: baseDmg } = rollDice(dmgDice, crit);
    const { total: bonusDmg } = rollDice('1d8', crit);
    damage = Math.max(1, baseDmg + bonusDmg);
    const newHp = Math.max(0, (target.hp ?? target.maxHp ?? 0) - damage);
    eng.db?.updatePlayerHPInDB(targetCName, newHp);
    if (newHp <= 0) onKill(attackerCName, targetCName, eng);
  }

  eng.db?.saveRollToDB({
    type: 'ATTACK', cName: attackerCName, pName: attacker.pName || attackerCName,
    target: targetCName, rawRoll, total, ac, hit, crit, miss,
    damage, dmgDice: `${dmgDice}+1d8 colossus`,
    color: '#27ae60', flavor: statusFlavor('attack', attackerCName, targetCName), ts: Date.now(),
  });

  const atkTk = eng.S.tokens[attackerCName], tarTk = eng.S.tokens[targetCName];
  if (tarTk) eng.anim?.trigger(crit ? 'MELEE_CRIT' : hit ? 'MELEE_HIT' : 'MELEE_MISS', atkTk, tarTk);
}

function _doCuttingWords(attackerCName, targetCName, eng) {
  const attacker = eng.S.players[attackerCName] || {};
  const cr       = attacker.classResources || {};
  const resolved = getResolved(attacker);
  const level    = attacker.level || 1;

  // Determine bardic die size by level
  const dieSizes = [[5,'1d6'],[10,'1d8'],[15,'1d10'],[Infinity,'1d12']];
  const die = dieSizes.find(([lvl]) => level <= lvl)?.[1] ?? '1d6';

  const { total: penalty } = rollDice(die);
  window.patchClassResources?.(targetCName, { cuttingWordsPenalty: penalty });
  window.patchClassResources?.(attackerCName, { bardicInspiration: Math.max(0, (cr.bardicInspiration ?? 0) - 1) });

  eng.db?.saveRollToDB({
    type: 'STATUS', cName: attackerCName,
    status: statusFlavor('bardicInspiration', attackerCName, targetCName)
      + ` ${iconImg('🎵','14px')} Cutting Words: ${targetCName} -${penalty} to next roll (${die})`,
    ts: Date.now(),
  });
}

function _doDivineStrike(attackerCName, targetCName, eng, dice, dmgType) {
  const attacker = eng.S.players[attackerCName] || {};
  const target   = eng.S.players[targetCName]   || {};
  const bonus    = attacker.melee ?? 0;
  const ac       = target._resolved?.ac ?? target.ac ?? 10;

  const rawRoll = Math.floor(Math.random() * 20) + 1;
  const total   = rawRoll + bonus;
  const crit    = rawRoll === 20;
  const miss    = rawRoll === 1;
  const hit     = crit || (!miss && total >= ac);

  const dmgDice = attacker.meleeDmg || '1d6';
  let damage = 0;
  if (hit) {
    const { total: meleeDmg  } = rollDice(dmgDice, crit);
    const { total: strikeDmg } = rollDice(dice, crit);
    damage = Math.max(1, meleeDmg + strikeDmg);
    const newHp = Math.max(0, (target.hp ?? target.maxHp ?? 0) - damage);
    eng.db?.updatePlayerHPInDB(targetCName, newHp);
    if (newHp <= 0) onKill(attackerCName, targetCName, eng);
  }

  eng.db?.saveRollToDB({
    type: 'ATTACK', cName: attackerCName, pName: attacker.pName || attackerCName,
    target: targetCName, rawRoll, total, ac, hit, crit, miss,
    damage, dmgDice: `${dmgDice}+${dice} ${dmgType}`,
    color: '#f39c12', flavor: statusFlavor('attack', attackerCName, targetCName), ts: Date.now(),
  });

  const atkTk = eng.S.tokens[attackerCName], tarTk = eng.S.tokens[targetCName];
  if (tarTk) eng.anim?.trigger(crit ? 'MELEE_CRIT' : hit ? 'MELEE_HIT' : 'MELEE_MISS', atkTk, tarTk);
}

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
      color: '#e67e22', flavor: i === 0 ? statusFlavor('flurryOfBlows', attackerCName, targetCName) : `${iconImg('🥋','14px')} Strike 2 lands.`, ts: Date.now(),
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

function _doDreadAmbusher(attackerCName, targetCName, eng) {
  const attacker = eng.S.players[attackerCName] || {};
  const target   = eng.S.players[targetCName]   || {};
  const bonus    = attacker.melee ?? 0;
  const ac       = target._resolved?.ac ?? target.ac ?? 10;

  const rawRoll = Math.floor(Math.random() * 20) + 1;
  const total   = rawRoll + bonus;
  const crit    = rawRoll === 20;
  const miss    = rawRoll === 1;
  const hit     = crit || (!miss && total >= ac);

  const dmgDice = attacker.meleeDmg || '1d6';
  let damage = 0;
  if (hit) {
    const { total: baseDmg  } = rollDice(dmgDice, crit);
    const { total: bonusDmg } = rollDice('1d8',   crit);
    damage = Math.max(1, baseDmg + bonusDmg);
    const newHp = Math.max(0, (target.hp ?? target.maxHp ?? 0) - damage);
    eng.db?.updatePlayerHPInDB(targetCName, newHp);
    if (newHp <= 0) onKill(attackerCName, targetCName, eng);
  }

  eng.db?.saveRollToDB({
    type: 'ATTACK', cName: attackerCName, pName: attacker.pName || attackerCName,
    target: targetCName, rawRoll, total, ac, hit, crit, miss,
    damage, dmgDice: `${dmgDice}+1d8 dread_ambusher`,
    color: '#2c3e50', flavor: `${iconImg('🌑','14px')} Dread Ambusher strikes from the dark!`, ts: Date.now(),
  });

  const atkTkDA = eng.S.tokens[attackerCName], tarTkDA = eng.S.tokens[targetCName];
  if (tarTkDA) eng.anim?.trigger(crit ? 'MELEE_CRIT' : hit ? 'MELEE_HIT' : 'MELEE_MISS', atkTkDA, tarTkDA);
}

// ── Battle Master Maneuver Helpers ────────────────────────────────────────────

const MANEUVER_META = {
  trip_attack:       { label: `${iconImg('⬇️','14px')} Trip Attack`,        note: 'STR save or Prone' },
  disarming_attack:  { label: `${iconImg('🗡️','14px')} Disarming Attack`,   note: 'STR save or drop item' },
  pushing_attack:    { label: `${iconImg('💨','14px')} Pushing Attack`,      note: 'STR save or pushed 15ft' },
  menacing_attack:   { label: `${iconImg('😨','14px')} Menacing Attack`,     note: 'WIS save or Frightened' },
  goading_attack:    { label: `${iconImg('😤','14px')} Goading Attack`,      note: 'WIS save or disadv vs others' },
  distracting_strike:{ label: `${iconImg('👁️','14px')} Distracting Strike`,  note: 'next attack vs target has Adv' },
  sweeping_attack:   { label: `${iconImg('🌪️','14px')} Sweeping Attack`,     note: '+1d8 to adjacent creature' },
  feinting_attack:   { label: `${iconImg('🎭','14px')} Feinting Attack`,     note: 'Adv on next attack vs target' },
  maneuvering_attack:{ label: `${iconImg('⚔️','14px')} Maneuvering Attack`,  note: 'ally can move half speed safely' },
  lunging_attack:    { label: `${iconImg('🤺','14px')} Lunging Attack`,       note: '+5ft reach, on hit +1d8' },
  precision_attack:  { label: `${iconImg('🎯','14px')} Precision Attack`,    note: '+1d8 to attack roll' },
  riposte:           { label: `${iconImg('🔄','14px')} Riposte`,             note: 'reaction after being missed' },
  parry:             { label: `${iconImg('🛡️','14px')} Parry`,               note: 'reaction, reduce damage by 1d8+DEX' },
  rally:             { label: `${iconImg('📣','14px')} Rally`,               note: 'give ally 1d8+CHA temp HP' },
  commanders_strike: { label: `${iconImg('📢','14px')} Commander's Strike`,  note: 'bonus action: ally attacks +1d8' },
};

function _maneuverLabel(slug, die, remaining) {
  const meta = MANEUVER_META[slug];
  if (!meta) return null;
  return `${meta.label} (${die}, ${remaining} left) — ${meta.note}`;
}

function _doManeuver(attackerCName, targetCName, eng, maneuver, sdDie) {
  const attacker = eng.S.players[attackerCName] || {};
  const target   = eng.S.players[targetCName]   || {};
  const cr       = attacker.classResources || {};
  const resolved = getResolved(attacker);

  // Consume 1 superiority die
  const sdCr = cr.superiorityDice;
  if (typeof sdCr === 'object') {
    window.patchClassResources?.(attackerCName, {
      superiorityDice: { ...sdCr, remaining: Math.max(0, (sdCr.remaining ?? 0) - 1) },
    });
  }

  const { total: sdRoll } = rollDice(sdDie);

  // Damage-adding maneuvers — make a weapon attack + superiority die bonus
  const dmgManeuvers = ['trip_attack','disarming_attack','pushing_attack','menacing_attack',
                        'goading_attack','distracting_strike','sweeping_attack','feinting_attack',
                        'maneuvering_attack','lunging_attack','riposte'];
  if (dmgManeuvers.includes(maneuver)) {
    const bonus   = attacker.melee ?? 0;
    const acM     = target._resolved?.ac ?? target.ac ?? 10;
    const rawRoll = Math.floor(Math.random() * 20) + 1;
    const totalM  = rawRoll + bonus;
    const crit    = rawRoll === 20;
    const miss    = rawRoll === 1;
    const hit     = crit || (!miss && totalM >= acM);

    const dmgDice = attacker.meleeDmg || '1d6';
    let damage = 0;
    if (hit) {
      const { total: baseDmg } = rollDice(dmgDice, crit);
      damage = Math.max(1, baseDmg + sdRoll);
      const newHp = Math.max(0, (target.hp ?? target.maxHp ?? 0) - damage);
      eng.db?.updatePlayerHPInDB(targetCName, newHp);
      if (newHp <= 0) onKill(attackerCName, targetCName, eng);
    }
    const meta = MANEUVER_META[maneuver];
    eng.db?.saveRollToDB({
      type: 'ATTACK', cName: attackerCName, pName: attacker.pName || attackerCName,
      target: targetCName, rawRoll, total: totalM, ac: acM, hit, crit, miss,
      damage: hit ? damage : 0, dmgDice: `${dmgDice}+${sdRoll}(${sdDie})`,
      color: '#8e44ad',
      flavor: `${iconImg('⚔️','14px')} ${meta?.label ?? maneuver}${hit ? ` — ${meta?.note ?? ''}` : ' — MISS'}`,
      ts: Date.now(),
    });
    const atkTkMnv = eng.S.tokens[attackerCName], tarTkMnv = eng.S.tokens[targetCName];
    if (tarTkMnv) eng.anim?.trigger(crit ? 'MELEE_CRIT' : hit ? 'MELEE_HIT' : 'MELEE_MISS', atkTkMnv, tarTkMnv);

  } else if (maneuver === 'precision_attack') {
    window.patchClassResources?.(attackerCName, { precisionBonus: sdRoll });
    eng.db?.saveRollToDB({ type: 'STATUS', cName: attackerCName,
      status: `${iconImg('🎯','14px')} Precision Attack: ${attackerCName} adds +${sdRoll} to the next attack roll!`, ts: Date.now() });

  } else if (maneuver === 'parry') {
    const dexMod = resolved?.mods?.dex ?? 0;
    eng.db?.saveRollToDB({ type: 'STATUS', cName: attackerCName,
      status: `${iconImg('🛡️','14px')} Parry: ${attackerCName} reduces incoming damage by ${sdRoll + dexMod} (${sdDie}=${sdRoll}+${dexMod} DEX).`, ts: Date.now() });

  } else if (maneuver === 'rally') {
    const chaMod   = resolved?.mods?.cha ?? 0;
    const tempGain = sdRoll + chaMod;
    eng.db?.patchPlayerInDB?.(targetCName, { tempHp: tempGain });
    eng.db?.saveRollToDB({ type: 'STATUS', cName: attackerCName,
      status: `${iconImg('📣','14px')} Rally: ${targetCName} gains ${tempGain} temp HP (${sdDie}=${sdRoll}+${chaMod} CHA)!`, ts: Date.now() });

  } else if (maneuver === 'commanders_strike') {
    eng.db?.saveRollToDB({ type: 'STATUS', cName: attackerCName,
      status: `${iconImg('📢','14px')} Commander's Strike: ${targetCName} makes a weapon attack with +${sdRoll} (${sdDie}) damage!`, ts: Date.now() });
  }
}
