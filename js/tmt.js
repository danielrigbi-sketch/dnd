// js/tmt.js — 2 Minute Tabletop token utilities
// Token images served from the public 2MT token editor CDN (CC-BY 4.0)
// Attribution: https://2minutetabletop.com

const B = 'https://tools.2minutetabletop.com/token-editor/token-uploads/';
export const TMT_BASE = B;

// ── Open5e slug → [category, tokenFolder] ────────────────────────────────────
// All names verified against the 2MT token editor search API
const SLUG_MAP = {
  // Goblinoids
  'goblin':                 ['humanoid', 'goblin03'],
  'goblin-boss':            ['humanoid', 'goblinpaladin1'],
  'hobgoblin':              ['humanoid', 'hobgoblin3'],
  'hobgoblin-captain':      ['humanoid', 'hobgoblincleric1'],
  'hobgoblin-iron-shadow':  ['humanoid', 'hobgoblinbarbarian1'],
  'bugbear':                ['humanoid', 'hobgoblinbarbarian1'],
  'bugbear-chief':          ['humanoid', 'hobgoblinbarbarian2'],

  // Orcs
  'orc':                    ['humanoid', 'orccleric'],
  'orc-war-chief':          ['humanoid', 'halforcfighter1'],
  'half-orc':               ['humanoid', 'halforcfighter1'],

  // Kobolds
  'kobold':                 ['humanoid', 'koboldbarbarian1'],

  // Undead – zombies
  'zombie':                 ['undead',   'zombie'],
  'ogre-zombie':            ['undead',   'ogrezombie'],
  'beholder-zombie':        ['undead',   'zombie3'],
  'plague-zombie':          ['undead',   'huskzombie'],

  // Undead – skeletons
  'skeleton':               ['undead',   'skeletonfighter1'],
  'minotaur-skeleton':      ['undead',   'skeletonfighter1'],
  'warhorse-skeleton':      ['undead',   'skeletonfighter1'],

  // Undead – spectral / higher
  'ghost':                  ['undead',   'ghost2'],
  'shadow':                 ['undead',   'cryptwalker'],
  'specter':                ['undead',   'cryptwalker'],
  'wraith':                 ['undead',   'cryptwalker'],
  'banshee':                ['undead',   'cryptwalker'],
  'death-knight':           ['undead',   'deathknight'],
  'revenant':               ['undead',   'drownedassassin1'],
  'wight':                  ['undead',   'skeletonpaladin1'],
  'vampire':                ['undead',   'zombieelflord'],
  'vampire-spawn':          ['undead',   'zombie4'],
  'lich':                   ['undead',   'skeletonsorcerer1'],

  // Giants
  'troll':                  ['giant',    'troll4'],
  'ogre':                   ['giant',    'ogre5'],
  'hill-giant':             ['giant',    'ogre5'],
  'stone-giant':            ['giant',    'ogre5'],
  'frost-giant':            ['giant',    'ogre5'],

  // Constructs
  'gargoyle':               ['construct','gargoyle4'],

  // Beasts
  'hyena':                  ['beast',    'hyena1'],

  // Aquatic humanoids
  'kuo-toa':                ['humanoid', 'kuotoa3'],
  'kuo-toa-whip':           ['humanoid', 'kuotoawhip1'],
  'kuo-toa-archpriest':     ['humanoid', 'kuotoapriest1'],

  // Adventurer types (player-facing slugs from NPC faker)
  'fighter':                ['humanoid', 'humanfighter3'],
  'paladin':                ['humanoid', 'legendarypaladin2'],
  'rogue':                  ['humanoid', 'rogue'],
  'wizard':                 ['humanoid', 'elfwizard4'],
  'ranger':                 ['humanoid', 'legendaryranger2'],
  'barbarian':              ['humanoid', 'yuantipurebloodbarbarian1'],
  'cleric':                 ['humanoid', 'halforccleric1'],
  'bard':                   ['humanoid', 'satyrbard1'],
};

// ── Monster type → token pool ─────────────────────────────────────────────────
// Fallback when no slug match; random pick for variety
const TYPE_POOL = {
  Humanoid:    [
    ['humanoid','goblin03'],['humanoid','hobgoblin3'],
    ['humanoid','orccleric'],['humanoid','kuotoa3'],
    ['humanoid','goblinpaladin1'],['humanoid','goblin07'],
  ],
  Undead:      [
    ['undead','zombie'],['undead','zombie2'],
    ['undead','skeletonfighter1'],['undead','ghost2'],
    ['undead','zombie4'],['undead','cryptwalker'],
  ],
  Giant:       [['giant','troll4'],['giant','ogre5']],
  Construct:   [['construct','gargoyle4']],
  Beast:       [['beast','hyena1']],
  Dragon:      [],   // uncertain naming — no fallback
  Fiend:       [],
  Aberration:  [],
  Elemental:   [],
};

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Returns the single best 2MT token URL for a monster, or null.
 * @param {string} slug  Open5e monster slug
 * @param {string} type  normalised type (Humanoid, Undead, …)
 */
export function tmt2mtUrl(slug = '', type = '') {
  const entry = SLUG_MAP[slug];
  if (entry) return `${B}${entry[0]}/${entry[1]}/preview.png`;

  // fuzzy: if the slug contains a known key
  const lc = slug.toLowerCase();
  for (const [key, [cat, name]] of Object.entries(SLUG_MAP)) {
    if (lc.startsWith(key) || key.startsWith(lc.split('-')[0])) {
      return `${B}${cat}/${name}/preview.png`;
    }
  }

  // type pool fallback
  const pool = TYPE_POOL[type];
  if (pool?.length) {
    const [cat, name] = pool[Math.floor(Math.random() * pool.length)];
    return `${B}${cat}/${name}/preview.png`;
  }

  return null;
}

/**
 * Returns an array of alternative 2MT token options for the portrait picker.
 * @returns {Array<{url: string, label: string}>}
 */
export function tmt2mtAlternatives(slug = '', type = '') {
  const seen = new Set();
  const out  = [];

  const push = (cat, name, label) => {
    const url = `${B}${cat}/${name}/preview.png`;
    if (!seen.has(url)) { seen.add(url); out.push({ url, label }); }
  };

  // Slug-specific match first
  const entry = SLUG_MAP[slug];
  if (entry) push(entry[0], entry[1], '★');

  // Full type pool
  (TYPE_POOL[type] || []).forEach(([cat, name]) => push(cat, name, type));

  return out;
}

/**
 * Returns a thumbnail <img> tag for a monster list row.
 * Uses onerror to silently hide the image if the token doesn't exist.
 */
export function tmt2mtThumbHtml(slug = '', type = '') {
  const url = tmt2mtUrl(slug, type);
  if (!url) return '';
  return `<img src="${url}"
    style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;"
    onerror="this.style.display='none'" loading="lazy">`;
}
