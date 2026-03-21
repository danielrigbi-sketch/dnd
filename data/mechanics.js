/**
 * mechanics.js — All D&D 5e SRD rules as structured effect objects.
 * No eval(). Closed-vocabulary effect types. Generic evaluator in charEngine.js.
 *
 * Architecture: DnD Beyond style — adding a subclass feature = one data entry here.
 */

// ── Hit Dice by Class ─────────────────────────────────────────────────────────
export const CLASS_HD = {
  barbarian: 12,
  fighter:   10,
  paladin:   10,
  ranger:    10,
  bard:       8,
  cleric:     8,
  druid:      8,
  monk:       8,
  rogue:      8,
  warlock:    8,
  sorcerer:   6,
  wizard:     6,
};

// ── Spellcasting Ability by Class ─────────────────────────────────────────────
export const SPELL_ABILITY = {
  bard:     'cha',
  cleric:   'wis',
  druid:    'wis',
  paladin:  'cha',
  ranger:   'wis',
  sorcerer: 'cha',
  warlock:  'cha',
  wizard:   'int',
};

// ── Saving Throw Proficiencies by Class ───────────────────────────────────────
export const CLASS_SAVE_PROFS = {
  barbarian: ['str', 'con'],
  bard:      ['dex', 'cha'],
  cleric:    ['wis', 'cha'],
  druid:     ['int', 'wis'],
  fighter:   ['str', 'con'],
  monk:      ['str', 'dex'],
  paladin:   ['wis', 'cha'],
  ranger:    ['str', 'dex'],
  rogue:     ['dex', 'int'],
  sorcerer:  ['con', 'cha'],
  warlock:   ['wis', 'cha'],
  wizard:    ['int', 'wis'],
};

// ── Class Skill Proficiency Counts ────────────────────────────────────────────
export const CLASS_SKILL_COUNT = {
  barbarian: 2, bard: 3, cleric: 2, druid: 2, fighter: 2,
  monk: 2, paladin: 2, ranger: 3, rogue: 4, sorcerer: 2,
  warlock: 2, wizard: 2,
};

// ── Race Mechanics ────────────────────────────────────────────────────────────
// All 9 base races + key subraces from the SRD
export const RACE_MECHANICS = {
  // Dwarf
  'hill-dwarf': {
    abilBonus: { con: 2, wis: 1 },
    speed: 25,
    traits: ['darkvision60', 'dwarven_resilience', 'stonecunning', 'dwarven_combat_training'],
  },
  'mountain-dwarf': {
    abilBonus: { str: 2, con: 2 },
    speed: 25,
    traits: ['darkvision60', 'dwarven_resilience', 'stonecunning', 'dwarven_combat_training', 'dwarven_armor_training'],
  },
  // Elf
  'high-elf': {
    abilBonus: { dex: 2, int: 1 },
    speed: 30,
    traits: ['darkvision60', 'keen_senses', 'fey_ancestry', 'trance', 'elf_weapon_training', 'cantrip'],
  },
  'wood-elf': {
    abilBonus: { dex: 2, wis: 1 },
    speed: 35,
    traits: ['darkvision60', 'keen_senses', 'fey_ancestry', 'trance', 'elf_weapon_training', 'fleet_of_foot', 'mask_of_the_wild'],
  },
  'dark-elf': {
    abilBonus: { dex: 2, cha: 1 },
    speed: 30,
    traits: ['superior_darkvision', 'keen_senses', 'fey_ancestry', 'trance', 'sunlight_sensitivity', 'drow_magic', 'drow_weapon_training'],
  },
  // Halfling
  'lightfoot-halfling': {
    abilBonus: { dex: 2, cha: 1 },
    speed: 25,
    traits: ['lucky', 'brave', 'halfling_nimbleness', 'naturally_stealthy'],
  },
  'stout-halfling': {
    abilBonus: { dex: 2, con: 1 },
    speed: 25,
    traits: ['lucky', 'brave', 'halfling_nimbleness', 'stout_resilience'],
  },
  // Human
  'human': {
    abilBonus: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    speed: 30,
    traits: [],
  },
  'variant-human': {
    abilBonusFree: 2,
    featPick: 1,
    skillPick: 1,
    speed: 30,
    traits: [],
  },
  // Half-Elf
  'half-elf': {
    abilBonus: { cha: 2 },
    abilBonusFree: 2,
    speed: 30,
    traits: ['darkvision60', 'fey_ancestry', 'skill_versatility'],
  },
  // Half-Orc
  'half-orc': {
    abilBonus: { str: 2, con: 1 },
    speed: 30,
    traits: ['darkvision60', 'menacing', 'relentless_endurance', 'savage_attacks'],
  },
  // Tiefling
  'tiefling': {
    abilBonus: { int: 1, cha: 2 },
    speed: 30,
    traits: ['darkvision60', 'hellish_resistance', 'infernal_legacy'],
  },
  // Dragonborn
  'dragonborn': {
    abilBonus: { str: 2, cha: 1 },
    speed: 30,
    traits: ['draconic_ancestry', 'breath_weapon', 'damage_resistance'],
  },
  // Gnome
  'forest-gnome': {
    abilBonus: { int: 2, dex: 1 },
    speed: 25,
    traits: ['darkvision60', 'gnome_cunning', 'natural_illusionist', 'speak_with_small_beasts'],
  },
  'rock-gnome': {
    abilBonus: { int: 2, con: 1 },
    speed: 25,
    traits: ['darkvision60', 'gnome_cunning', 'artificers_lore', 'tinker'],
  },
  // Aasimar (common SRD addition)
  'aasimar': {
    abilBonus: { cha: 2 },
    speed: 30,
    traits: ['darkvision60', 'celestial_resistance', 'healing_hands', 'light_bearer'],
  },
};

// Fallback for old coarse race strings (backward compat)
export const RACE_SLUG_MAP = {
  'dwarf':    'hill-dwarf',
  'elf':      'high-elf',
  'halfling': 'lightfoot-halfling',
  'human':    'human',
  'half-elf': 'half-elf',
  'half-orc': 'half-orc',
  'tiefling': 'tiefling',
  'gnome':    'rock-gnome',
  'dragonborn': 'dragonborn',
};

// ── Subclass Mechanics ────────────────────────────────────────────────────────
// Features keyed by minimum level they unlock.
// Effects use the closed-vocabulary schema from charEngine.js.
export const SUBCLASS_MECHANICS = {
  // ── Fighter ─────────────────────────────────────────────────────────────────
  'champion': {
    class: 'fighter',
    features: {
      3:  [{ type: 'crit_threshold', value: 19 }],
      15: [{ type: 'crit_threshold', value: 18 }],
    },
  },
  'battle-master': {
    class: 'fighter',
    features: {
      3: [
        { type: 'resource', name: 'superiorityDice', count: 4, die: 'd8' },
        { type: 'maneuver_picks', count: 3, pool: 'battle_master_maneuvers' },
      ],
      7: [
        { type: 'resource_count_bonus', name: 'superiorityDice', add: 1 },
        { type: 'maneuver_picks', count: 2 },
      ],
      10: [{ type: 'resource_die_upgrade', name: 'superiorityDice', to: 'd10' }],
      15: [
        { type: 'resource_count_bonus', name: 'superiorityDice', add: 1 },
        { type: 'maneuver_picks', count: 2 },
      ],
      18: [{ type: 'resource_die_upgrade', name: 'superiorityDice', to: 'd12' }],
    },
  },
  'eldritch-knight': {
    class: 'fighter',
    features: {
      3: [{ type: 'spellcasting', list: 'wizard', slots: 'ek_table' }],
    },
  },

  // ── Barbarian ───────────────────────────────────────────────────────────────
  'berserker': {
    class: 'barbarian',
    features: {
      3:  [{ type: 'self_action', slug: 'frenzy' }],
      6:  [{ type: 'tag', name: 'mindless_rage' }],
      10: [{ type: 'self_action', slug: 'intimidating_presence' }],
      14: [{ type: 'tag', name: 'retaliation' }],
    },
  },
  'totem-warrior': {
    class: 'barbarian',
    features: {
      3:  [{ type: 'totem_choice', options: ['bear', 'eagle', 'wolf'] }],
      6:  [{ type: 'totem_choice', options: ['bear', 'eagle', 'wolf'] }],
      14: [{ type: 'totem_choice', options: ['bear', 'eagle', 'wolf'] }],
    },
  },

  // ── Rogue ────────────────────────────────────────────────────────────────────
  'thief': {
    class: 'rogue',
    features: {
      3:  [{ type: 'tag', name: 'fast_hands' }],
      9:  [{ type: 'tag', name: 'supreme_sneak' }],
      13: [{ type: 'tag', name: 'use_magic_device' }],
      17: [{ type: 'tag', name: 'thief_reflexes' }],
    },
  },
  'assassin': {
    class: 'rogue',
    features: {
      3:  [{ type: 'tag', name: 'assassinate' }],
      9:  [{ type: 'tag', name: 'infiltration_expertise' }],
      13: [{ type: 'tag', name: 'impostor' }],
      17: [{ type: 'tag', name: 'death_strike' }],
    },
  },
  'arcane-trickster': {
    class: 'rogue',
    features: {
      3: [{ type: 'spellcasting', list: 'wizard', slots: 'at_table' }],
    },
  },

  // ── Cleric ───────────────────────────────────────────────────────────────────
  'life': {
    class: 'cleric',
    features: {
      1: [{ type: 'tag', name: 'disciple_of_life' }],
      2: [{ type: 'tag', name: 'preserve_life' }],
      6: [{ type: 'tag', name: 'blessed_healer' }],
      8: [{ type: 'combat_action', slug: 'divine_strike_radiant' }],
      17:[{ type: 'tag', name: 'supreme_healing' }],
    },
  },
  'light': {
    class: 'cleric',
    features: {
      1: [{ type: 'combat_action', slug: 'warding_flare' }],
      2: [{ type: 'tag', name: 'radiance_of_dawn' }],
      6: [{ type: 'tag', name: 'improved_flare' }],
      8: [{ type: 'combat_action', slug: 'divine_strike_fire' }],
      17:[{ type: 'tag', name: 'corona_of_light' }],
    },
  },
  'tempest': {
    class: 'cleric',
    features: {
      1: [{ type: 'combat_action', slug: 'wrath_of_storm' }],
      2: [{ type: 'tag', name: 'destructive_wrath' }],
      6: [{ type: 'tag', name: 'thunderbolt_strike' }],
      8: [{ type: 'combat_action', slug: 'divine_strike_thunder' }],
      17:[{ type: 'tag', name: 'stormborn' }],
    },
  },
  'war': {
    class: 'cleric',
    features: {
      1: [
        { type: 'combat_action', slug: 'war_priest' },
        { type: 'resource', name: 'warPriestAttacks', count: 0, formulaMax: 'wis_mod' },
      ],
      2: [{ type: 'self_action', slug: 'guided_strike' }],
      6: [{ type: 'tag', name: 'war_gods_blessing' }],
      8: [{ type: 'combat_action', slug: 'divine_strike_weapon' }],
      17:[{ type: 'tag', name: 'avatar_of_battle' }],
    },
  },
  'knowledge': {
    class: 'cleric',
    features: {
      1: [{ type: 'tag', name: 'blessings_of_knowledge' }],
      2: [{ type: 'tag', name: 'knowledge_of_the_ages' }],
      6: [{ type: 'tag', name: 'read_thoughts' }],
      8: [{ type: 'tag', name: 'potent_spellcasting' }],
    },
  },
  'nature': {
    class: 'cleric',
    features: {
      1: [{ type: 'tag', name: 'acolyte_of_nature' }],
      2: [{ type: 'tag', name: 'charm_animals_and_plants' }],
      6: [{ type: 'tag', name: 'dampen_elements' }],
      8: [{ type: 'combat_action', slug: 'divine_strike_elemental' }],
    },
  },
  'trickery': {
    class: 'cleric',
    features: {
      1: [{ type: 'tag', name: 'blessing_of_the_trickster' }],
      2: [{ type: 'self_action', slug: 'invoke_duplicity' }],
      6: [{ type: 'tag', name: 'cloak_of_shadows' }],
      8: [{ type: 'combat_action', slug: 'divine_strike_poison' }],
    },
  },

  // ── Druid ────────────────────────────────────────────────────────────────────
  'land': {
    class: 'druid',
    features: {
      2: [{ type: 'tag', name: 'natural_recovery' }],
      6: [{ type: 'tag', name: 'land_stride' }],
      10:[{ type: 'tag', name: 'natures_ward' }],
      14:[{ type: 'tag', name: 'natures_sanctuary' }],
    },
  },
  'moon': {
    class: 'druid',
    features: {
      2: [
        { type: 'wild_shape_cr_override', formula: 'max(1, floor(level/3))' },
        { type: 'tag', name: 'combat_wild_shape' },
      ],
      6: [{ type: 'tag', name: 'primal_strike' }],
      10:[{ type: 'tag', name: 'elemental_wild_shape' }],
      18:[{ type: 'tag', name: 'thousand_forms' }],
    },
  },

  // ── Paladin ──────────────────────────────────────────────────────────────────
  'devotion': {
    class: 'paladin',
    features: {
      3:  [{ type: 'self_action', slug: 'sacred_weapon' }],
      7:  [{ type: 'tag', name: 'aura_of_devotion' }],
      15: [{ type: 'tag', name: 'purity_of_spirit' }],
      20: [{ type: 'self_action', slug: 'holy_nimbus' }],
    },
  },
  'ancients': {
    class: 'paladin',
    features: {
      3:  [{ type: 'self_action', slug: 'natures_wrath' }],
      7:  [{ type: 'tag', name: 'aura_of_warding' }],
      15: [{ type: 'tag', name: 'undying_sentinel' }],
      20: [{ type: 'tag', name: 'elder_champion' }],
    },
  },
  'vengeance': {
    class: 'paladin',
    features: {
      3:  [{ type: 'combat_action', slug: 'vow_of_enmity' }],
      7:  [{ type: 'tag', name: 'relentless_avenger' }],
      15: [{ type: 'tag', name: 'soul_of_vengeance' }],
      20: [{ type: 'tag', name: 'avenging_angel' }],
    },
  },

  // ── Ranger ───────────────────────────────────────────────────────────────────
  'hunter': {
    class: 'ranger',
    features: {
      3: [{
        type: 'pick_one',
        options: [
          { type: 'combat_action', slug: 'colossus_slayer' },
          { type: 'combat_action', slug: 'giant_killer' },
          { type: 'combat_action', slug: 'horde_breaker' },
        ],
      }],
      7: [{
        type: 'pick_one',
        options: [
          { type: 'tag', name: 'escape_the_horde' },
          { type: 'tag', name: 'multiattack_defense' },
          { type: 'tag', name: 'steel_will' },
        ],
      }],
      11: [{
        type: 'pick_one',
        options: [
          { type: 'tag', name: 'volley' },
          { type: 'tag', name: 'whirlwind_attack' },
        ],
      }],
      15: [{
        type: 'pick_one',
        options: [
          { type: 'tag', name: 'evasion' },
          { type: 'tag', name: 'stand_against_the_tide' },
          { type: 'tag', name: 'uncanny_dodge' },
        ],
      }],
    },
  },
  'gloom-stalker': {
    class: 'ranger',
    features: {
      3: [
        { type: 'tag', name: 'dread_ambusher' },
        { type: 'initiative_bonus', value: 'wis_mod' },
        { type: 'darkvision', range: 60 },
        { type: 'combat_action', slug: 'dread_ambusher_attack' },
      ],
      7:  [{ type: 'tag', name: 'iron_mind' }],
      11: [{ type: 'tag', name: 'stalkers_flurry' }],
      15: [{ type: 'tag', name: 'shadowy_dodge' }],
    },
  },
  'beast-master': {
    class: 'ranger',
    features: {
      3:  [{ type: 'tag', name: 'rangers_companion' }, { type: 'self_action', slug: 'summon_companion' }],
      7:  [{ type: 'tag', name: 'exceptional_training' }],
      11: [{ type: 'tag', name: 'bestial_fury' }],
      15: [{ type: 'tag', name: 'share_spells' }],
    },
  },

  // ── Monk ─────────────────────────────────────────────────────────────────────
  'open-hand': {
    class: 'monk',
    features: {
      3:  [{ type: 'tag', name: 'open_hand_technique' }],
      6:  [{ type: 'tag', name: 'wholeness_of_body' }],
      11: [{ type: 'tag', name: 'tranquility' }],
      17: [{ type: 'tag', name: 'quivering_palm' }],
    },
  },
  'shadow': {
    class: 'monk',
    features: {
      3:  [{ type: 'ki_spells', spells: ['minor_illusion', 'darkness', 'darkvision', 'pass_without_trace', 'silence'] }],
      6:  [{ type: 'tag', name: 'shadow_step' }],
      11: [{ type: 'tag', name: 'cloak_of_shadows' }],
      17: [{ type: 'tag', name: 'opportunist' }],
    },
  },
  'four-elements': {
    class: 'monk',
    features: {
      3: [{ type: 'discipline_picks', count: 2 }],
      6: [{ type: 'discipline_picks', count: 1 }],
      11:[{ type: 'discipline_picks', count: 1 }],
      17:[{ type: 'discipline_picks', count: 1 }],
    },
  },

  // ── Bard ─────────────────────────────────────────────────────────────────────
  'lore': {
    class: 'bard',
    features: {
      3:  [
        { type: 'skill_prof', count: 3, choose: true },
        { type: 'combat_action', slug: 'cutting_words' },
      ],
      6:  [{ type: 'tag', name: 'additional_magical_secrets' }],
      14: [{ type: 'tag', name: 'peerless_skill' }],
    },
  },
  'valor': {
    class: 'bard',
    features: {
      3: [{ type: 'tag', name: 'combat_inspiration_weapon' }],
      6: [{ type: 'extra_attack', count: 1 }],
      14:[{ type: 'tag', name: 'battle_magic' }],
    },
  },

  // ── Sorcerer ─────────────────────────────────────────────────────────────────
  'draconic': {
    class: 'sorcerer',
    features: {
      1: [
        { type: 'ac_formula', formula: '13+dex' },
        { type: 'max_hp_bonus', perLevel: 1 },
        { type: 'tag', name: 'draconic_resilience' },
      ],
      6:  [{ type: 'tag', name: 'elemental_affinity' }],
      14: [{ type: 'tag', name: 'dragon_wings' }],
      18: [{ type: 'tag', name: 'draconic_presence' }],
    },
  },
  'wild-magic': {
    class: 'sorcerer',
    features: {
      1: [
        { type: 'tag', name: 'wild_magic_surge' },
        { type: 'resource', name: 'tidesOfChaos', count: 1 },
      ],
      6:  [{ type: 'tag', name: 'bend_luck' }],
      14: [{ type: 'tag', name: 'controlled_chaos' }],
      18: [{ type: 'tag', name: 'spell_bombardment' }],
    },
  },

  // ── Warlock ──────────────────────────────────────────────────────────────────
  'archfey': {
    class: 'warlock',
    features: {
      1:  [{ type: 'self_action', slug: 'fey_presence' }],
      6:  [{ type: 'tag', name: 'misty_escape' }],
      10: [{ type: 'tag', name: 'beguiling_defenses' }],
      14: [{ type: 'tag', name: 'dark_delirium' }],
    },
  },
  'fiend': {
    class: 'warlock',
    features: {
      1:  [{ type: 'on_kill', slug: 'dark_one_blessing' }],
      6:  [{ type: 'tag', name: 'dark_ones_own_luck' }],
      10: [{ type: 'tag', name: 'fiendish_resilience' }],
      14: [{ type: 'tag', name: 'hurl_through_hell' }],
    },
  },
  'great-old-one': {
    class: 'warlock',
    features: {
      1:  [{ type: 'tag', name: 'awakened_mind' }],
      6:  [{ type: 'tag', name: 'entropic_ward' }],
      10: [{ type: 'tag', name: 'thought_shield' }],
      14: [{ type: 'tag', name: 'create_thrall' }],
    },
  },

  // ── Wizard ───────────────────────────────────────────────────────────────────
  'evocation': {
    class: 'wizard',
    features: {
      2:  [{ type: 'tag', name: 'sculpt_spells' }],
      6:  [{ type: 'tag', name: 'potent_cantrip' }],
      10: [{ type: 'tag', name: 'empowered_evocation' }],
      14: [{ type: 'tag', name: 'overchannel' }],
    },
  },
  'divination': {
    class: 'wizard',
    features: {
      2: [{ type: 'resource', name: 'portentDice', count: 2 }],
      6: [{ type: 'tag', name: 'expert_divination' }],
      10:[{ type: 'tag', name: 'the_third_eye' }],
      14:[{ type: 'resource_count_bonus', name: 'portentDice', add: 1 }],
    },
  },
  'abjuration': {
    class: 'wizard',
    features: {
      2: [{ type: 'resource', name: 'arcaneWard', count: 0, formulaMax: '2*level+int_mod' }],
      6: [{ type: 'tag', name: 'projected_ward' }],
      10:[{ type: 'tag', name: 'improved_abjuration' }],
      14:[{ type: 'tag', name: 'spell_resistance' }],
    },
  },
  'necromancy': {
    class: 'wizard',
    features: {
      2: [{ type: 'tag', name: 'grim_harvest' }],
      6: [{ type: 'tag', name: 'undead_thralls' }],
      10:[{ type: 'tag', name: 'inured_to_undeath' }],
      14:[{ type: 'tag', name: 'command_undead' }],
    },
  },
  'illusion': {
    class: 'wizard',
    features: {
      2: [{ type: 'tag', name: 'improved_minor_illusion' }],
      6: [{ type: 'tag', name: 'malleable_illusions' }],
      10:[{ type: 'tag', name: 'illusory_self' }],
      14:[{ type: 'tag', name: 'illusory_reality' }],
    },
  },
  'enchantment': {
    class: 'wizard',
    features: {
      2: [{ type: 'tag', name: 'hypnotic_gaze' }],
      6: [{ type: 'tag', name: 'instinctive_charm' }],
      10:[{ type: 'tag', name: 'split_enchantment' }],
      14:[{ type: 'tag', name: 'alter_memories' }],
    },
  },
  'conjuration': {
    class: 'wizard',
    features: {
      2: [{ type: 'tag', name: 'benign_transposition' }],
      6: [{ type: 'tag', name: 'focused_conjuration' }],
      10:[{ type: 'tag', name: 'durable_summons' }],
      14:[{ type: 'tag', name: 'overchannel' }],
    },
  },
  'transmutation': {
    class: 'wizard',
    features: {
      2: [{ type: 'resource', name: 'transmutationStone', count: 1 }],
      6: [{ type: 'tag', name: 'transmuters_formula' }],
      10:[{ type: 'tag', name: 'shapechanger' }],
      14:[{ type: 'tag', name: 'master_transmuter' }],
    },
  },
};

// ── Background Mechanics ──────────────────────────────────────────────────────
export const BACKGROUND_MECHANICS = {
  'acolyte':      { skills: ['insight', 'religion'],           languages: 2 },
  'charlatan':    { skills: ['deception', 'sleight_of_hand'],  tools: ['disguise_kit', 'forgery_kit'] },
  'criminal':     { skills: ['deception', 'stealth'],          tools: ['thieves_tools'] },
  'entertainer':  { skills: ['acrobatics', 'performance'],     tools: ['disguise_kit'] },
  'folk-hero':    { skills: ['animal_handling', 'survival'],   tools: ['artisans_tools', 'vehicles_land'] },
  'guild-artisan':{ skills: ['insight', 'persuasion'],         tools: ['artisans_tools'], languages: 1 },
  'hermit':       { skills: ['medicine', 'religion'],          tools: ['herbalism_kit'], languages: 1 },
  'noble':        { skills: ['history', 'persuasion'],         tools: ['gaming_set'], languages: 1 },
  'outlander':    { skills: ['athletics', 'survival'],         tools: ['musical_instrument'], languages: 1 },
  'sage':         { skills: ['arcana', 'history'],             languages: 2 },
  'sailor':       { skills: ['athletics', 'perception'],       tools: ['navigators_tools', 'vehicles_water'] },
  'soldier':      { skills: ['athletics', 'intimidation'],     tools: ['gaming_set', 'vehicles_land'] },
  'urchin':       { skills: ['sleight_of_hand', 'stealth'],    tools: ['disguise_kit', 'thieves_tools'] },
};

// ── Feat Mechanics ────────────────────────────────────────────────────────────
export const FEAT_MECHANICS = {
  'alert':               { initiative: 5, tags: ['alert_no_surprise'] },
  'tough':               { max_hp_bonus: { perLevel: 2 } },
  'toughness':           { max_hp_bonus: { perLevel: 2 } }, // alt name
  'lucky':               { tags: ['lucky'] },
  'war-caster':          { tags: ['war_caster'] },
  'sentinel':            { tags: ['sentinel'] },
  'great-weapon-master': { tags: ['gwm'] },
  'sharpshooter':        { tags: ['sharpshooter'] },
  'polearm-master':      { tags: ['pam'] },
  'mage-slayer':         { tags: ['mage_slayer'] },
  'mobile':              { speed: 10, tags: ['mobile'] },
  'resilient':           { savingThrowProf: 'choose' },
  'skilled':             { skillPick: 3 },
  'actor':               { abilBonus: { cha: 1 }, tags: ['actor'] },
  'athlete':             { abilBonus: { str: 1 }, tags: ['athlete'] },
  'charger':             { tags: ['charger'] },
  'crossbow-expert':     { tags: ['crossbow_expert'] },
  'defensive-duelist':   { tags: ['defensive_duelist'] },
  'dual-wielder':        { tags: ['dual_wielder'] },
  'dungeon-delver':      { tags: ['dungeon_delver'] },
  'durable':             { abilBonus: { con: 1 } },
  'elemental-adept':     { tags: ['elemental_adept'] },
  'grappler':            { tags: ['grappler'] },
  'healer':              { tags: ['healer'] },
  'heavily-armored':     { abilBonus: { str: 1 }, tags: ['heavily_armored'] },
  'heavy-armor-master':  { abilBonus: { str: 1 }, tags: ['heavy_armor_master'] },
  'inspiring-leader':    { tags: ['inspiring_leader'] },
  'keen-mind':           { abilBonus: { int: 1 }, tags: ['keen_mind'] },
  'linguist':            { abilBonus: { int: 1 } },
  'lightly-armored':     { abilBonus: { dex: 1 }, tags: ['lightly_armored'] },
  'magic-initiate':      { tags: ['magic_initiate'] },
  'martial-adept':       { resource: { name: 'superiorityDice', count: 1, die: 'd6' } },
  'moderately-armored':  { abilBonus: { dex: 1 }, tags: ['moderately_armored'] },
  'mounted-combatant':   { tags: ['mounted_combatant'] },
  'observant':           { abilBonus: { wis: 1 }, passivePerceptionBonus: 5 },
  'savage-attacker':     { tags: ['savage_attacker'] },
  'shield-master':       { tags: ['shield_master'] },
  'skulker':             { tags: ['skulker'] },
  'spell-sniper':        { tags: ['spell_sniper'] },
  'tavern-brawler':      { abilBonus: { str: 1 }, tags: ['tavern_brawler'] },
  'tracker':             { abilBonus: { wis: 1 }, tags: ['tracker'] },
  'war-caster':          { tags: ['war_caster'] },
  'weapon-master':       { abilBonus: { str: 1 }, tags: ['weapon_master'] },
  // Ability Score Improvement — values filled by user during character creation
  'ability-score-improvement': { abilBonusFree: 2 },
};

// ── Battle Master Maneuvers ───────────────────────────────────────────────────
// Used by Session 3 classAbilities to wire up combat buttons
export const BATTLE_MASTER_MANEUVERS = [
  'commanders_strike', 'disarming_attack', 'distracting_strike',
  'evasive_footwork', 'feinting_attack', 'goading_attack',
  'lunging_attack', 'maneuvering_attack', 'menacing_attack',
  'parry', 'precision_attack', 'pushing_attack',
  'rally', 'riposte', 'sweeping_attack',
  'trip_attack',
];

// ── 1/3 Caster Spell Slot Table (Eldritch Knight, Arcane Trickster) ──────────
// Index by class level (1-20). Returns { max: { 1: N, 2: N, ... } } or null if no slots.
export const THIRD_CASTER_SLOTS = [
  null,       // level 0 (unused)
  null,       // 1
  null,       // 2
  { 1: 2 },   // 3
  { 1: 3 },   // 4
  { 1: 3 },   // 5
  { 1: 3 },   // 6
  { 1: 4, 2: 2 }, // 7
  { 1: 4, 2: 2 }, // 8
  { 1: 4, 2: 2 }, // 9
  { 1: 4, 2: 3 }, // 10
  { 1: 4, 2: 3 }, // 11
  { 1: 4, 2: 3 }, // 12
  { 1: 4, 2: 3, 3: 2 }, // 13
  { 1: 4, 2: 3, 3: 2 }, // 14
  { 1: 4, 2: 3, 3: 2 }, // 15
  { 1: 4, 2: 3, 3: 3 }, // 16
  { 1: 4, 2: 3, 3: 3 }, // 17
  { 1: 4, 2: 3, 3: 3 }, // 18
  { 1: 4, 2: 3, 3: 3, 4: 1 }, // 19
  { 1: 4, 2: 3, 3: 3, 4: 1 }, // 20
];

// ── Armor Base AC Table ───────────────────────────────────────────────────────
// Used as fallback if equipment.json hasn't been fetched yet
export const ARMOR_TABLE = {
  // Light
  'padded':        { type: 'light',  baseAC: 11, stealthDisadv: true  },
  'leather':       { type: 'light',  baseAC: 11, stealthDisadv: false },
  'studded-leather':{ type:'light',  baseAC: 12, stealthDisadv: false },
  // Medium
  'hide':          { type: 'medium', baseAC: 12, stealthDisadv: false },
  'chain-shirt':   { type: 'medium', baseAC: 13, stealthDisadv: false },
  'scale-mail':    { type: 'medium', baseAC: 14, stealthDisadv: true  },
  'breastplate':   { type: 'medium', baseAC: 14, stealthDisadv: false },
  'half-plate':    { type: 'medium', baseAC: 15, stealthDisadv: true  },
  // Heavy
  'ring-mail':     { type: 'heavy',  baseAC: 14, stealthDisadv: true  },
  'chain-mail':    { type: 'heavy',  baseAC: 16, stealthDisadv: true  },
  'splint':        { type: 'heavy',  baseAC: 17, stealthDisadv: true  },
  'plate':         { type: 'heavy',  baseAC: 18, stealthDisadv: true  },
};
