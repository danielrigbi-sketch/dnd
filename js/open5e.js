// js/open5e.js — Open5e API Client  (Wave 1 / E1-A)
// Provides: fetchMonsters, fetchMonsterBySlug, fetchSpells, fetchSpellBySlug
//
// Caching strategy:
//   Layer 1 — in-memory Map  (max 300 entries, per session, ~0ms hit)
//   Layer 2 — localStorage   (key prefix "o5e:", TTL 7 days, survives reload)
//
// Open5e is CC-BY 4.0 + OGL 1.0a (see Credits modal for attribution)

const API_BASE  = 'https://api.open5e.com/v1';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const LS_PREFIX = 'o5e:';
const MEM_MAX   = 300;

// ── In-memory LRU (insertion-order Map) ────────────────────────────────────────
const _mem = new Map();
function _memGet(k) {
  if (!_mem.has(k)) return null;
  // Move to end (most-recently-used)
  const v = _mem.get(k); _mem.delete(k); _mem.set(k, v);
  return v;
}
function _memSet(k, v) {
  if (_mem.has(k)) _mem.delete(k);
  _mem.set(k, v);
  if (_mem.size > MEM_MAX) _mem.delete(_mem.keys().next().value); // evict oldest
}

// ── localStorage helpers ────────────────────────────────────────────────────────
function _lsGet(k) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + k);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(LS_PREFIX + k); return null; }
    return data;
  } catch { return null; }
}
function _lsSet(k, data) {
  try { localStorage.setItem(LS_PREFIX + k, JSON.stringify({ ts: Date.now(), data })); }
  catch { /* quota exceeded — silent fail */ }
}

// ── Core fetch with two-layer cache ────────────────────────────────────────────
async function _cachedFetch(endpoint, params = {}) {
  const qs  = Object.entries(params).sort().map(([k,v]) => `${k}=${v}`).join('&');
  const key = endpoint + (qs ? '?' + qs : '');

  // L1 memory hit
  const mem = _memGet(key);
  if (mem) return mem;

  // L2 localStorage hit
  const ls = _lsGet(key);
  if (ls) { _memSet(key, ls); return ls; }

  // Fetch from network
  const url = `${API_BASE}/${endpoint}/${qs ? '?' + qs : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open5e ${res.status}: ${url}`);
  const json = await res.json();

  _memSet(key, json);
  _lsSet(key, json);
  return json;
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Fetch a page of monsters with optional filters.
 * @param {Object} opts
 *   search    {string}  — name substring filter
 *   type      {string}  — e.g. "Beast", "Undead"
 *   cr_min    {number}
 *   cr_max    {number}
 *   page      {number}  — 1-based
 *   page_size {number}  — max 100
 * @returns {Promise<{count, next, previous, results: Monster[]}>}
 */
export async function fetchMonsters(opts = {}) {
  const params = { limit: opts.page_size || 50 };
  if (opts.search)   params.search        = opts.search;
  if (opts.type)     params.type__iexact  = opts.type;
  if (opts.cr_min != null) params.cr__gte = opts.cr_min;
  if (opts.cr_max != null) params.cr__lte = opts.cr_max;
  if (opts.page  > 1)      params.offset  = (opts.page - 1) * (opts.page_size || 50);
  return _cachedFetch('monsters', params);
}

/**
 * Fetch a single monster by slug (e.g. "goblin", "adult-red-dragon")
 */
export async function fetchMonsterBySlug(slug) {
  const k = `monster:${slug}`;
  const mem = _memGet(k);
  if (mem) return mem;
  const ls = _lsGet(k);
  if (ls) { _memSet(k, ls); return ls; }

  const res = await fetch(`${API_BASE}/monsters/${slug}/`);
  if (!res.ok) throw new Error(`Open5e monster not found: ${slug}`);
  const json = await res.json();
  _memSet(k, json); _lsSet(k, json);
  return json;
}

/**
 * Fetch a page of spells with optional filters.
 * @param {Object} opts
 *   search      {string}
 *   spell_class {string}  — e.g. "Wizard"
 *   level       {number}  — 0 = cantrip
 *   school      {string}  — e.g. "Evocation"
 *   page        {number}
 */
export async function fetchSpells(opts = {}) {
  const params = { limit: opts.page_size || 50 };
  if (opts.search)      params.search          = opts.search;
  if (opts.spell_class) params.spell_lists      = opts.spell_class.toLowerCase();
  if (opts.level != null) params.level_int      = opts.level;
  if (opts.school)      params.school__icontains = opts.school;
  if (opts.page > 1)    params.offset           = (opts.page - 1) * (opts.page_size || 50);
  return _cachedFetch('spells', params);
}

/**
 * Fetch a single spell by slug
 */
export async function fetchSpellBySlug(slug) {
  const k = `spell:${slug}`;
  const mem = _memGet(k);
  if (mem) return mem;
  const ls = _lsGet(k);
  if (ls) { _memSet(k, ls); return ls; }

  const res = await fetch(`${API_BASE}/spells/${slug}/`);
  if (!res.ok) throw new Error(`Open5e spell not found: ${slug}`);
  const json = await res.json();
  _memSet(k, json); _lsSet(k, json);
  return json;
}

// ── Spellcasting parsing (3A) ──────────────────────────────────────────────────

function _spellNameToSlug(name) {
  return name.toLowerCase()
    .replace(/['']/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Parse "Spellcasting" or "Innate Spellcasting" from a special_abilities array.
 * Returns { found, spellsByLevel: {0: [...cantrips], 1: [...], ...}, saveDC, attackBonus }
 */
export function parseSpellcastingDesc(specialAbilities) {
  const sa = (specialAbilities || []).find(a =>
    /^(innate )?spellcasting$/i.test((a.name || '').trim())
  );
  if (!sa) return { found: false, spellsByLevel: {} };

  const desc = sa.desc || '';
  const dcMatch  = desc.match(/spell save DC (\d+)/i);
  const atkMatch = desc.match(/([+-]?\d+) to hit with spell attacks/i);
  const spellsByLevel = {};

  // Cantrips (at will): spell1, spell2
  const cantripM = desc.match(/cantrips?\s*\(at will\)\s*:\s*([^\n]+)/i);
  if (cantripM) {
    spellsByLevel[0] = cantripM[1].split(/,\s*/).map(s => s.trim()).filter(Boolean);
  }

  // Nth level (N slots): spell1, spell2
  const levelRe = /(\d+)(?:st|nd|rd|th)\s+level\s*\([^)]+\)\s*:\s*([^\n]+)/gi;
  let m;
  while ((m = levelRe.exec(desc)) !== null) {
    spellsByLevel[parseInt(m[1])] = m[2].split(/,\s*/).map(s => s.trim()).filter(Boolean);
  }

  // Innate spellcasting fallback: "At will: …" / "3/day each: …"
  if (Object.keys(spellsByLevel).length === 0) {
    const aw = desc.match(/at will\s*:\s*([^\n]+)/i);
    if (aw) spellsByLevel[0] = aw[1].split(/,\s*/).map(s => s.trim()).filter(Boolean);
    const dayRe = /(\d+)\/day(?:\s+each)?\s*:\s*([^\n]+)/gi;
    while ((m = dayRe.exec(desc)) !== null) {
      spellsByLevel[0] = [...(spellsByLevel[0] || []),
        ...m[2].split(/,\s*/).map(s => s.trim()).filter(Boolean)];
    }
  }

  return {
    found:       Object.keys(spellsByLevel).length > 0,
    spellsByLevel,
    saveDC:      dcMatch  ? parseInt(dcMatch[1])  : null,
    attackBonus: atkMatch ? parseInt(atkMatch[1]) : null,
  };
}

/**
 * Fetch all spells from a monster's Spellcasting ability.
 * Returns a spellbook object { [slug]: entry } in CritRoll format.
 */
export async function fetchSpellcastingSpellbook(specialAbilities) {
  const parsed = parseSpellcastingDesc(specialAbilities);
  if (!parsed.found) return {};

  const allSpells = Object.entries(parsed.spellsByLevel).flatMap(
    ([lvl, names]) => names.map(name => ({ name, level: isNaN(lvl) ? 0 : parseInt(lvl) }))
  );

  const spellbook = {};
  await Promise.allSettled(allSpells.map(async ({ name, level }) => {
    try {
      const slug = _spellNameToSlug(name);
      let spell;
      try {
        spell = await fetchSpellBySlug(slug);
      } catch {
        // Slug guess failed — fall back to search by name
        const res = await fetchSpells({ search: name, page_size: 5 });
        const match = (res.results || []).find(
          s => s.name.toLowerCase() === name.toLowerCase()
        );
        if (!match) return;
        spell = await fetchSpellBySlug(match.slug);
      }
      spellbook[spell.slug] = {
        slug:         spell.slug,
        name:         spell.name,
        level:        spell.level_int ?? level,
        school:       spell.school?.name || spell.school || '',
        range:        spell.range || '30 feet',
        casting_time: spell.casting_time || '1 action',
        damage_dice:  spell.damage?.damage_dice || '',
        attack_type:  spell.attack_type || '',
        dc_type:      spell.dc?.dc_type?.name?.toLowerCase() || '',
        concentration: spell.concentration || false,
        higher_level: spell.higher_level || '',
      };
    } catch { /* skip unavailable */ }
  }));

  return spellbook;
}

/**
 * Map Open5e monster data → CritRoll player record shape
 * (used when spawning from Open5e picker)
 */
export function open5eToNPC(m) {
  // Parse AC — Open5e returns array [{type, value}] or just a number
  const ac = Array.isArray(m.armor_class)
    ? (m.armor_class[0]?.value || 10)
    : (m.armor_class || 10);

  // Parse speed — "30 ft." or { walk: "30 ft." }
  const speedStr = (typeof m.speed === 'string' ? m.speed : m.speed?.walk) || '30 ft.';
  const speed    = parseInt(speedStr) || 30;

  // Parse CR — "1/4", "1/2", or number
  const parseCR = cr => {
    if (!cr) return 0;
    if (String(cr).includes('/')) { const [a,b] = String(cr).split('/'); return parseInt(a)/parseInt(b); }
    return parseFloat(cr) || 0;
  };

  // Combine damage_dice + damage_bonus into a single dice string (e.g. "2d6" + 3 → "2d6+3")
  const normDmg = (a) => {
    if (!a) return null;
    const dice = a.damage_dice;
    if (!dice) return null;
    const bonus = a.damage_bonus;
    if (!bonus || /[+\-]/.test(dice)) return dice;
    return bonus >= 0 ? `${dice}+${bonus}` : `${dice}${bonus}`;
  };

  // Open5e actions have no attack_type field — detect via desc text.
  // Ranged: desc contains "Ranged Weapon Attack" or "Ranged Spell Attack".
  // Melee: has attack_bonus and is NOT ranged and NOT Multiattack.
  const _isRangedDesc = d => {
    const dl = (d || '').toLowerCase();
    return dl.includes('ranged weapon attack') || dl.includes('ranged spell attack') || dl.includes('ranged attack:');
  };
  const _isMeleeDesc = d => {
    const dl = (d || '').toLowerCase();
    return dl.includes('melee weapon attack') || dl.includes('melee spell attack') || dl.includes('melee attack:');
  };

  // Primary melee action (first action with attack_bonus whose desc marks it as melee)
  const meleeAction  = (m.actions || []).find(a =>
    a.attack_bonus != null &&
    !_isRangedDesc(a.desc) &&
    (a.name?.toLowerCase() !== 'multiattack')
  );
  // Primary ranged action
  const rangedAction = (m.actions || []).find(a =>
    a.attack_bonus != null &&
    _isRangedDesc(a.desc)
  );

  // Build customAttacks for the initiative-tracker card macro buttons
  // (one entry per attack action so players see named buttons like "Bite", "Claw")
  const customAttacks = (m.actions || [])
    .filter(a => a.attack_bonus != null && (a.name || '').toLowerCase() !== 'multiattack')
    .map(a => ({ name: a.name, bonus: a.attack_bonus, dmg: normDmg(a) || '' }));

  // Parse legendaryMax from legendary_desc (e.g. "can take 3 legendary actions")
  const legendaryMax = (() => {
    const desc = m.legendary_desc || '';
    const match = desc.match(/can take\s+(\d+)\s+legendary/i) || desc.match(/(\d+)\s+legendary action/i);
    if (match) return parseInt(match[1]);
    return (m.legendary_actions?.length > 0) ? 3 : 0;
  })();

  return {
    // ── Core combat ──────────────────────────────────────────────────────────
    maxHp:       m.hit_points || 10,
    hp:          m.hit_points || 10,
    ac:          ac,
    speed:       speed,
    pp:          10 + Math.floor(((m.wisdom || 10) - 10) / 2),
    isHidden:    false,
    melee:       meleeAction?.attack_bonus  ?? 0,
    meleeDmg:    normDmg(meleeAction)       || '1d6',
    ranged:      rangedAction?.attack_bonus ?? 0,
    rangedDmg:   normDmg(rangedAction)      || '1d6',

    // ── Identity ─────────────────────────────────────────────────────────────
    monsterType: m.type        || 'Humanoid',
    size:        m.size        || 'Medium',
    alignment:   m.alignment   || '',
    cr:          parseCR(m.challenge_rating),
    xp:          m.xp          || 0,
    hitDice:     m.hit_dice    || '',

    // ── Ability scores ───────────────────────────────────────────────────────
    _str: m.strength      || 10, _dex: m.dexterity     || 10,
    _con: m.constitution  || 10, _int: m.intelligence   || 10,
    _wis: m.wisdom        || 10, _cha: m.charisma       || 10,

    // ── Saving throws (null = not proficient, use raw ability mod) ───────────
    savingThrows: {
      str: m.strength_save,     dex: m.dexterity_save,
      con: m.constitution_save, int: m.intelligence_save,
      wis: m.wisdom_save,       cha: m.charisma_save,
    },

    // ── Skills ───────────────────────────────────────────────────────────────
    skills: m.skills || {},

    // ── Damage modifiers ─────────────────────────────────────────────────────
    damageImmunities:      m.damage_immunities      || '',
    damageResistances:     m.damage_resistances     || '',
    damageVulnerabilities: m.damage_vulnerabilities || '',
    conditionImmunities:   m.condition_immunities   || '',

    // ── Senses & language ────────────────────────────────────────────────────
    senses:    m.senses    || '',
    languages: m.languages || '',

    // ── Full action lists ─────────────────────────────────────────────────────
    actions:          m.actions           || [],
    bonusActions:     m.bonus_actions     || [],
    reactions:        m.reactions         || [],
    legendaryActions: m.legendary_actions || [],
    legendaryMax:     legendaryMax,
    legendaryUsed:    0,
    bonusActionUsed:  false,
    specialAbilities: m.special_abilities || [],

    // ── Lair actions (3C) ────────────────────────────────────────────────────
    lairActions: (() => {
      if (Array.isArray(m.lair_actions) && m.lair_actions.length) return m.lair_actions;
      // Fallback: special ability with "Lair Actions" in the name
      const la = (m.special_abilities || []).find(a => /lair\s+actions?/i.test(a.name || ''));
      if (la?.desc) {
        const items = la.desc.split(/\n/).map(s => s.trim()).filter(s => s && !/^on initiative/i.test(s));
        return items.map((d, i) => ({ name: `Lair Action ${i + 1}`, desc: d }));
      }
      return [];
    })(),

    // ── Player card quick-roll macros (named per-attack buttons) ─────────────
    customAttacks,

    // ── Spellcasting (DC / attack bonus parsed from special abilities) ────────
    ...(() => {
      const sc = parseSpellcastingDesc(m.special_abilities);
      return sc.found ? {
        spellSaveDC:      sc.saveDC      ?? (8 + Math.floor(((m.intelligence || 10) - 10) / 2)),
        spellAttackBonus: sc.attackBonus ?? Math.floor(((m.intelligence || 10) - 10) / 2),
      } : {};
    })(),

    // ── Meta ──────────────────────────────────────────────────────────────────
    _open5eSlug: m.slug,
  };
}

/** Return the CritRoll typeColor key for an Open5e type string */
export function normaliseType(rawType) {
  if (!rawType) return 'Humanoid';
  const t = rawType.toLowerCase();
  if (t.includes('undead'))     return 'Undead';
  if (t.includes('beast'))      return 'Beast';
  if (t.includes('dragon'))     return 'Dragon';
  if (t.includes('fiend'))      return 'Fiend';
  if (t.includes('aberration')) return 'Aberration';
  if (t.includes('giant'))      return 'Giant';
  if (t.includes('celestial'))  return 'Celestial';
  if (t.includes('elemental'))  return 'Elemental';
  if (t.includes('fey'))        return 'Fey';
  if (t.includes('construct'))  return 'Construct';
  if (t.includes('ooze'))       return 'Ooze';
  if (t.includes('plant'))      return 'Plant';
  return 'Humanoid';
}
