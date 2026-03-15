// js/tmt.js — 2 Minute Tabletop token utilities
// All tokens from the 2MT public token editor CDN (CC-BY 4.0)
// Attribution: https://2minutetabletop.com

export const TMT_BASE = 'https://tools.2minutetabletop.com/token-editor/token-uploads/';
const H = 'humanoid'; // most tokens live here

// ── Helpers ───────────────────────────────────────────────────────────────────
const url = (cat, name) => `${TMT_BASE}${cat}/${name}/preview.png`;
const h   = name        => url(H, name);

// Normalise class / race strings coming from app data
function norm(s = '') {
  return s.toLowerCase()
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .replace('_', '')
    .replace('arcane', '')
    .replace('blood', '')
    .replace('wild magic', 'sorcerer')
    .replace(/\d+$/, '');
}

// ── Portrait map: class → race → { m, f, nb, any } ───────────────────────────
// Keys are normalised (lowercase, no spaces/dashes).
// m/f/nb = confirmed-gender tokens; any = unverified / neutral.
// All names are 2MT humanoid token folder names (preview.png assumed).

const P = {

  fighter: {
    human:     { any: ['humanfighter1','humanfighter2','humanfighter3','humanfighter4'] },
    elf:       { any: ['elffighter','elffighter1','elffighter2','elffighter3','elffighter4','elffighter6','elffighter7','elffighter8'] },
    halfelf:   { f:   ['halfelffighter3','halfelffighter5'],
                 any: ['halfelffighter','halfelffighter2','halfelffighter4','halfelffighter6'] },
    dwarf:     { any: ['dwarffighter2','dwarffighter4'] },
    halfling:  { any: ['halflingfighter','halflingfighter2'] },
    halforc:   { m:   ['halforcfighter1'],
                 f:   ['halforcfighter3'],
                 any: ['halforcfighter1','halforcfighter3'] },
    tiefling:  { any: ['tieflingfighter2','tieflingfighter3','tieflingfighter4'] },
    dragonborn:{ any: ['dragonbornfighter'] },
    orc:       { any: ['orccleric'] }, // fallback — no dedicated orc fighter found
  },

  paladin: {
    human:     { any: ['humanpaladin1','humanpaladin2','humanpaladin3'] },
    halfelf:   { any: ['halfelfpaladin','halfelfpaladin2','halfelfpaladin3','halfelfpaladin4'] },
    dwarf:     { any: ['dwarfpaladin','dwarfpaladin3','dwarfpaladin4'] },
    tiefling:  { m:   ['maletieflingpaladin'], any: ['maletieflingpaladin'] },
    gnome:     { f:   ['gnomepaladin3'], any: ['gnomepaladin3'] },
    goliath:   { f:   ['goliathpaladin1'], any: ['goliathpaladin1'] },
    goblin:    { m:   ['goblinpaladin2'], f: ['goblinpaladin1'],
                 any: ['goblinpaladin1','goblinpaladin2','goblinpaladin5','goblinpaladin6'] },
    legendary: { any: ['legendarypaladin2'] },
    dragonborn:{ any: ['legendarypaladin2'] },
  },

  barbarian: {
    human:     { any: ['humanbarbarian1','humanbarbarian2','humanbarbarian3'] },
    halfelf:   { any: ['halfelfbarbarian2','halfelfbarbarian3','halfelfbarbarian4'] },
    dwarf:     { any: ['dwarfbarbarian','dwarfbarbarian1','dwarfbarbarian2','dwarfbarbarian4'] },
    dragonborn:{ m:   ['dragonbornbarbarian3'], any: ['dragonbornbarbarian3'] },
    tiefling:  { nb:  ['nonbinarytieflingbarbarian'], any: ['nonbinarytieflingbarbarian'] },
    kobold:    { f:   ['koboldbarbarian1'], m: ['koboldbarbarian2'],
                 any: ['koboldbarbarian1','koboldbarbarian2'] },
    firbolg:   { f:   ['firbolgbarbarian1'], m: ['firbolgbarbarian2'],
                 any: ['firbolgbarbarian1','firbolgbarbarian2'] },
    yuanti:    { any: ['yuantipurebloodbarbarian1'] },
    warforged: { any: ['warforgedbarbarian2'] },
    rabbitfolk:{ f:   ['rabbitfolkbarbarian1'], m: ['rabbitfolkbarbarian2'],
                 any: ['rabbitfolkbarbarian1','rabbitfolkbarbarian2'] },
  },

  ranger: {
    human:     { any: ['humanranger1','humanranger2','humanranger4'] },
    halfelf:   { any: ['halfelfranger','halfelfranger2','halfelfranger3','halfelfranger4'] },
    dwarf:     { f:   ['dwarfranger3'], any: ['dwarfranger2','dwarfranger3','dwarfranger4'] },
    halforc:   { f:   ['halforcranger3'], m: ['halforcranger4'],
                 any: ['halforcranger3','halforcranger4'] },
    dragonborn:{ f:   ['dragonbornranger3'], m: ['dragonbornranger4'],
                 any: ['dragonbornranger3','dragonbornranger4'] },
    triton:    { any: ['tritonranger1','tritonranger2'] },
    aasimar:   { f:   ['aasimarranger1'], any: ['aasimarranger1'] },
    firbolg:   { f:   ['firbolgranger1'], m: ['firbolgranger2'],
                 any: ['firbolgranger1','firbolgranger2'] },
    yuanti:    { any: ['yuantipurebloodranger2'] },
    warforged: { any: ['warforgedranger2'] },
    legendary: { any: ['legendaryranger2'] },
  },

  monk: {
    human:     { any: ['humanmonk1','humanmonk2','humanmonk3','monk'] },
    gnome:     { any: ['gnomemonk1','gnomemonk3','gnomemonk4'] },
    halforc:   { any: ['halforcmonk4'] },
    tiefling:  { f:   ['femaletieflingmonk'], any: ['femaletieflingmonk','tieflingmonk2'] },
    aasimar:   { any: ['aasimarmonk1','aasimarmonk2'] },
    goliath:   { any: ['goliathmonk1','goliathmonk2'] },
    goblin:    { any: ['goblinmonk2'] },
    warforged: { any: ['warforgedmonk1','warforgedmonk2'] },
    firbolg:   { any: ['firbolgmonk2'] },
    monkeyfolk:{ any: ['monkeyfolkmonk1','monkeyfolkmonk2'] },
  },

  wizard: {
    human:     { any: ['humanwizard1','humanwizard2'] },
    elf:       { any: ['elfwizard4'] },
    halfelf:   { any: ['halfelfwizard','halfelfwizard2','halfelfwizard3','halfelfwizard4'] },
    dwarf:     { f:   ['dwarfwizard3'], m: ['dwarfwizard4'],
                 any: ['dwarfwizard','dwarfwizard2','dwarfwizard3','dwarfwizard4'] },
    owlfolk:   { f:   ['owlfolkwizard1','owlfolkwizard2','owlfolkwizard5'],
                 m:   ['owlfolkwizard6'],
                 any: ['owlfolkwizard1','owlfolkwizard2'] },
    monkeyfolk:{ any: ['monkeyfolkwizard1','monkeyfolkwizard2'] },
  },

  sorcerer: {
    human:     { any: ['humansorcerer1','humansorcerer2','humansorcerer3','humansorcerer4','sorcerer'] },
    elf:       { any: ['elfsorcerer2','elfsorcerer3','elfsorcerer4'] },
    halfelf:   { any: ['halfelfsorcerer','halfelfsorcerer2','halfelfsorcerer3','halfelfsorcerer4'] },
    dwarf:     { any: ['dwarfsorcerer2','dwarfsorcerer3','dwarfsorcerer4'] },
    halfling:  { any: ['halflingsorcerer','halflingsorcerer2'] },
    tiefling:  { f:   ['femaletieflingsorcerer'], m: ['maletieflingsorcerer'],
                 any: ['tieflingsorcerer1','tieflingsorcerer2','tieflingsorcerer3','femaletieflingsorcerer','maletieflingsorcerer'] },
    dragonborn:{ any: ['dragonbornsorcerer','dragonbornsorcerer3','brassdragonbornsorcerer2'] },
    halforc:   { any: ['halforcsorcerer1','halforcsorcerer2','halforcsorcerer4'] },
    gnome:     { any: ['gnomesorcerer1','gnomesorcerer2','gnomesorcerer4'] },
    goblin:    { any: ['goblinsorcerrer1'] },
    aasimar:   { any: ['aasimarsorcerer1','aasimarsorcerer2'] },
  },

  warlock: {
    human:     { any: ['humanwarlock1','humanwarlock2'] },
    elf:       { any: ['elfwarlock3','elfwarlock4'] },
    halfelf:   { any: ['halfelfwarlock','halfelfwarlock2','halfelfwarlock3','halfelfwarlock4'] },
    dwarf:     { any: ['dwarfwarlock3','dwarfwarlock4'] },
    tiefling:  { f:   ['femaletieflingwarlock'], m: ['maletieflingwarlock'],
                 nb:  ['nonbinarytieflingwarlock'],
                 any: ['tieflingwarlock1','tieflingwarlock2','femaletieflingwarlock','maletieflingwarlock','nonbinarytieflingwarlock'] },
    dragonborn:{ any: ['dragonbornwarlock3'] },
    halforc:   { any: ['halforcwarlock3','halforcwarlock4'] },
    gnome:     { any: ['gnomewarlock3','gnomewarlock4'] },
    aasimar:   { any: ['aasimarwarlock1','aasimarwarlock2'] },
    goliath:   { any: ['goliathwarlock1','goliathwarlock2'] },
    goblin:    { any: ['goblinwarlock1','goblinwarlock2'] },
    firbolg:   { any: ['firbolgwarlock1','firbolgwarlock2'] },
    warforged: { any: ['warforgedwarlock1','warforgedwarlock2'] },
  },

  cleric: {
    human:     { any: ['humancleric1','humancleric2','humancleric3','humancleric4'] },
    halfelf:   { any: ['halfelfcleric','halfelfcleric2','halfelfcleric3','halfelfcleric4'] },
    dwarf:     { any: ['dwarfcleric','dwarfcleric2','dwarfcleric3','dwarfcleric4'] },
    halforc:   { f:   ['halforccleric3'], m: ['halforccleric4'],
                 any: ['halforccleric1','halforccleric2','halforccleric3','halforccleric4'] },
    orc:       { any: ['orccleric','orccleric1','orccleric2'] },
    aasimar:   { any: ['aarakocracleric1','aarakocracleric2','aarakocracleric3','aarakocracleric4'] },
    monkeyfolk:{ f:   ['monkeyfolkcleric1'], any: ['monkeyfolkcleric1','monkeyfolkcleric2'] },
  },

  druid: {
    human:     { any: ['humandruid1','humandruid2','humandruid3','humandruid4'] },
    elf:       { any: ['elfdruid','elfdruid2','elfdruid3','elfdruid4'] },
    halfelf:   { any: ['halfelfdruid2','halfelfdruid3','halfelfdruid4'] },
    dwarf:     { any: ['dwarfdruid','dwarfdruid2','dwarfdruid3'] },
    halfling:  { any: ['halflingdruid','halflingdruid2'] },
    halforc:   { any: ['halforcdruid1','halforcdruid2','halforcdruid3','halforcdruid4'] },
    tiefling:  { f:   ['femaletieflingdruid'], nb: ['nonbinarytieflingdruid'],
                 any: ['tieflingdruid3','tieflingdruid4','femaletieflingdruid','nonbinarytieflingdruid'] },
    dragonborn:{ any: ['dragonborndruid','dragonborndruid2'] },
    gnome:     { any: ['gnomedruid1','gnomedruid2'] },
    aasimar:   { any: ['aasimardruid1'] },
    warforged: { any: ['warforgeddruid1','warforgeddruid2'] },
    firbolg:   { any: ['firbolgdruid1','firbolgdruid2'] },
    yuanti:    { any: ['yuantipureblooddruid1','yuantipureblooddruid2'] },
    legendary: { any: ['legendarydruid1','legendarydruid2'] },
  },

  rogue: {
    human:     { any: ['humanrogue1','humanrogue2','humanrogue3','rogue','winterroguehero'] },
    elf:       { any: ['elfrogue2'] },
    halfelf:   { any: ['halfelfrogue','halfelfrogue2','halfelfrogue3','halfelfrogue4'] },
    dwarf:     { any: ['dwarfrogue3','dwarfrogue4'] },
    halforc:   { any: ['halforcrogue1','halforcrogue2'] },
    dragonborn:{ any: ['dragonbornrogue2'] },
    satyr:     { any: ['satyrrogue1','satyrrogue2'] },
    lizardfolk:{ f:   ['lizardfolkroguefemael'], m: ['lizardfolkroguemale'],
                 any: ['lizardfolkroguemale','lizardfolkroguefemael'] },
    firbolg:   { f:   ['firbolgrogue1'], any: ['firbolgrogue1'] },
    orc:       { any: ['orcrogue'] },
  },

  bard: {
    human:     { any: ['humanbard1','humanbard2','humanbard3','humanbard4'] },
    halfelf:   { any: ['halfelfbard2','halfelfbard3','halfelfbard4'] },
    dwarf:     { any: ['dwarfbard3','dwarfbard4'] },
    satyr:     { any: ['satyrbard1'] },
    firbolg:   { f:   ['firbolgbard1'], any: ['firbolgbard1'] },
    dragonborn:{ f:   ['dragonbornbard3'], m: ['dragonbornbard4'],
                 any: ['dragonbornbard3','dragonbornbard4'] },
    tiefling:  { nb:  ['nonbinarytieflingbard'], any: ['nonbinarytieflingbard'] },
    goblin:    { m:   ['goblinbard2'], any: ['goblinbard2'] },
    kobold:    { f:   ['koboldbard1'], any: ['koboldbard1'] },
    rabbitfolk:{ f:   ['rabbitfolkbard1'], m: ['rabbitfolkbardmale'],
                 any: ['rabbitfolkbard1','rabbitfolkbardmale'] },
  },
};

// Class name aliases (normalise input strings to our P keys)
const CLASS_ALIASES = {
  fighter: 'fighter', warrior: 'fighter', soldier: 'fighter', knight: 'fighter',
  paladin: 'paladin', holy: 'paladin',
  barbarian: 'barbarian', berserker: 'barbarian',
  ranger: 'ranger', hunter: 'ranger', archer: 'ranger',
  monk: 'monk',
  wizard: 'wizard', mage: 'wizard', arcanist: 'wizard',
  sorcerer: 'sorcerer',
  warlock: 'warlock',
  cleric: 'cleric', priest: 'cleric', healer: 'cleric',
  druid: 'druid', shaman: 'druid',
  rogue: 'rogue', thief: 'rogue', assassin: 'rogue',
  bard: 'bard',
};

// Race name aliases
const RACE_ALIASES = {
  human: 'human', folk: 'human',
  elf: 'elf', highelf: 'elf', woodelf: 'elf', sunelf: 'elf', moonelf: 'elf',
  halfelf: 'halfelf', 'half-elf': 'halfelf',
  dwarf: 'dwarf', mountaindwarf: 'dwarf', hilldwarf: 'dwarf',
  halfling: 'halfling', lightfoot: 'halfling', stout: 'halfling',
  halforc: 'halforc', 'half-orc': 'halforc',
  orc: 'orc',
  gnome: 'gnome', forestgnome: 'gnome', rockgnome: 'gnome',
  tiefling: 'tiefling',
  dragonborn: 'dragonborn',
  aasimar: 'aasimar',
  goliath: 'goliath',
  firbolg: 'firbolg',
  warforged: 'warforged',
  yuanti: 'yuanti', 'yuan-ti': 'yuanti',
  kobold: 'kobold',
  triton: 'triton',
  satyr: 'satyr',
  goblin: 'goblin',
  hobgoblin: 'hobgoblin',
  gnoll: 'gnoll',
};

// ── Player portrait lookup ────────────────────────────────────────────────────

/**
 * Returns an ordered array of 2MT token URLs for a player character.
 * Gender-specific tokens come first, then neutral/any.
 * @param {string} charClass  e.g. 'fighter', 'Wizard', 'wild magic sorcerer'
 * @param {string} race       e.g. 'elf', 'Half-Orc', 'Tiefling'
 * @param {string} gender     'male' | 'female' | 'nonbinary'
 * @returns {string[]} up to 8 preview.png URLs
 */
export function tmt2mtPlayerTokens(charClass = '', race = '', gender = '') {
  const cls  = CLASS_ALIASES[norm(charClass)] || null;
  const rc   = RACE_ALIASES[norm(race)]       || null;
  const gKey = gender === 'female' ? 'f' : gender === 'nonbinary' ? 'nb' : 'm';

  const classMap = cls ? P[cls] : null;
  const raceMap  = classMap
    ? (classMap[rc] || classMap.human || classMap[Object.keys(classMap)[0]])
    : null;

  let tokens = [];

  if (raceMap) {
    const specific = raceMap[gKey] || [];
    const neutral  = raceMap.any   || [];
    tokens = [...new Set([...specific, ...neutral])];
  } else if (classMap) {
    // No race match — gather all tokens in this class
    Object.values(classMap).forEach(rm => {
      const specific = rm[gKey] || [];
      const neutral  = rm.any   || [];
      [...new Set([...specific, ...neutral])].forEach(n => {
        if (!tokens.includes(n)) tokens.push(n);
      });
    });
  }

  // Fallback: return generic tokens by type
  if (!tokens.length) tokens = GENERIC_BY_CLASS[cls] || GENERIC_FALLBACK;

  return tokens.slice(0, 8).map(name => h(name));
}

/**
 * Returns the single best token URL for a player character.
 */
export function tmt2mtPlayerUrl(charClass = '', race = '', gender = '') {
  const arr = tmt2mtPlayerTokens(charClass, race, gender);
  return arr[0] || null;
}

// ── Monster lookup (from original tmt.js) ────────────────────────────────────

const SLUG_MAP = {
  goblin:                ['humanoid', 'goblin03'],
  'goblin-boss':         ['humanoid', 'goblinpaladin1'],
  hobgoblin:             ['humanoid', 'hobgoblin3'],
  'hobgoblin-captain':   ['humanoid', 'hobgoblincleric1'],
  'hobgoblin-iron-shadow':['humanoid','hobgoblinbarbarian1'],
  bugbear:               ['humanoid', 'hobgoblinbarbarian1'],
  'bugbear-chief':       ['humanoid', 'hobgoblinbarbarian2'],
  orc:                   ['humanoid', 'orccleric'],
  'orc-war-chief':       ['humanoid', 'halforcfighter1'],
  kobold:                ['humanoid', 'koboldbarbarian1'],
  gnoll:                 ['humanoid', 'goblinmale3'],
  zombie:                ['undead',   'zombie'],
  'ogre-zombie':         ['undead',   'ogrezombie'],
  'beholder-zombie':     ['undead',   'zombie3'],
  'plague-zombie':       ['undead',   'huskzombie'],
  skeleton:              ['undead',   'skeletonfighter1'],
  'minotaur-skeleton':   ['undead',   'skeletonfighter1'],
  ghost:                 ['undead',   'ghost2'],
  shadow:                ['undead',   'cryptwalker'],
  specter:               ['undead',   'cryptwalker'],
  wraith:                ['undead',   'cryptwalker'],
  banshee:               ['undead',   'cryptwalker'],
  'death-knight':        ['undead',   'deathknight'],
  revenant:              ['undead',   'drownedassassin1'],
  wight:                 ['undead',   'skeletonpaladin1'],
  vampire:               ['undead',   'zombieelflord'],
  'vampire-spawn':       ['undead',   'zombie4'],
  lich:                  ['undead',   'skeletonsorcerer1'],
  troll:                 ['giant',    'troll4'],
  ogre:                  ['giant',    'ogre5'],
  'hill-giant':          ['giant',    'ogre5'],
  'stone-giant':         ['giant',    'ogre5'],
  'frost-giant':         ['giant',    'ogre5'],
  gargoyle:              ['construct','gargoyle4'],
  hyena:                 ['beast',    'hyena1'],
  'kuo-toa':             ['humanoid', 'kuotoa3'],
  'kuo-toa-whip':        ['humanoid', 'kuotoawhip1'],
  'kuo-toa-archpriest':  ['humanoid', 'kuotoapriest1'],
};

const TYPE_POOL = {
  Humanoid:  [['humanoid','goblin03'],['humanoid','hobgoblin3'],['humanoid','orccleric'],['humanoid','kuotoa3'],['humanoid','goblinpaladin1'],['humanoid','goblin07']],
  Undead:    [['undead','zombie'],['undead','zombie2'],['undead','skeletonfighter1'],['undead','ghost2'],['undead','zombie4'],['undead','cryptwalker']],
  Giant:     [['giant','troll4'],['giant','ogre5']],
  Construct: [['construct','gargoyle4']],
  Beast:     [['beast','hyena1']],
};

export function tmt2mtUrl(slug = '', type = '') {
  const entry = SLUG_MAP[slug];
  if (entry) return url(entry[0], entry[1]);
  const lc = slug.toLowerCase();
  for (const [key, [cat, name]] of Object.entries(SLUG_MAP)) {
    if (lc.startsWith(key) || key.startsWith(lc.split('-')[0])) return url(cat, name);
  }
  const pool = TYPE_POOL[type];
  if (pool?.length) {
    const [cat, name] = pool[Math.floor(Math.random() * pool.length)];
    return url(cat, name);
  }
  return null;
}

export function tmt2mtAlternatives(slug = '', type = '') {
  const seen = new Set();
  const out  = [];
  const push = (cat, name, label) => {
    const u = url(cat, name);
    if (!seen.has(u)) { seen.add(u); out.push({ url: u, label }); }
  };
  const entry = SLUG_MAP[slug];
  if (entry) push(entry[0], entry[1], '★');
  (TYPE_POOL[type] || []).forEach(([cat, name]) => push(cat, name, type));
  return out;
}

export function tmt2mtThumbHtml(slug = '', type = '') {
  const u = tmt2mtUrl(slug, type);
  if (!u) return '';
  return `<img src="${u}"
    style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;"
    onerror="this.style.display='none'" loading="lazy">`;
}

// ── Generic fallbacks ─────────────────────────────────────────────────────────
const GENERIC_BY_CLASS = {
  fighter:   ['humanfighter3','tieflingfighter4','elffighter2','halforcfighter1','dragonbornfighter'],
  paladin:   ['legendarypaladin2','humanpaladin1','halfelfpaladin','maletieflingpaladin','goblinpaladin2'],
  barbarian: ['humanbarbarian1','dragonbornbarbarian3','dwarfbarbarian','firbolgbarbarian2','yuantipurebloodbarbarian1'],
  ranger:    ['legendaryranger2','humanranger1','halfelfranger','warforgedranger2','tritonranger1'],
  monk:      ['monk','humanmonk1','aasimarmonk1','goliathmonk1','warforgedmonk1'],
  wizard:    ['elfwizard4','humanwizard1','halfelfwizard','dwarfwizard4','owlfolkwizard1'],
  sorcerer:  ['humansorcerer3','elfsorcerer4','tieflingsorcerer1','dragonbornsorcerer','halfelfsorcerer'],
  warlock:   ['humanwarlock1','elfwarlock4','tieflingwarlock2','gnomewarlock3','goliathwarlock2'],
  cleric:    ['humancleric1','halforccleric1','dwarfcleric','halfelfcleric','orccleric'],
  druid:     ['humandruid3','elfdruid2','legendarydruid2','firbolgdruid1','halfelfdruid3'],
  rogue:     ['rogue','humanrogue3','winterroguehero','halfelfrogue','elfrogue2'],
  bard:      ['humanbard2','satyrbard1','halfelfbard3','dragonbornbard4','firbolgbard1'],
};
const GENERIC_FALLBACK = ['humanfighter3','rogue','elfwizard4','humancleric1','humanranger1'];
