// js/faker.js — Faker.js NPC Generator  (Wave 2 / E8-A)
//
// Wraps @faker-js/faker with D&D-appropriate name tables and personality traits.
// All randomisation uses faker's seeded engine so results are reproducible.
//
// Exports:
//   generateNPCName(race?)         → string
//   generateNPCBackground()        → { occupation, bond, flaw, ideal }
//   generateNPCDescription()       → string (one-line physical description)
//   generateNPC(opts?)             → full NPC object
//   generateTavernName()           → string
//   generateRumor()                → string

import { faker } from '@faker-js/faker';

// ── D&D Name Tables ────────────────────────────────────────────────────────────

const NAMES = {
  Human: {
    male:   ['Aldric','Bram','Cedric','Dorian','Edric','Finn','Gareth','Harlan',
             'Idris','Jorin','Kael','Loras','Maren','Noric','Oswin','Perun',
             'Quill','Rylan','Soren','Tavin','Ulric','Vander','Wren','Xander',
             'Yorick','Zane','Aldous','Beren','Caspian','Davan'],
    female: ['Aela','Brynn','Cora','Dara','Elara','Faelyn','Gwen','Hilde',
             'Isla','Jora','Kira','Lyra','Mira','Nessa','Orla','Petra',
             'Quinn','Rowan','Sela','Tara','Una','Vera','Willa','Xyla',
             'Yara','Zora','Anya','Brea','Clara','Dwyn'],
    family: ['Ashford','Blackwood','Crane','Dunmore','Evander','Falcrest',
             'Graves','Holloway','Ironsong','Jasper','Kelwyn','Longstride',
             'Moorfield','Nighthollow','Oakheart','Penrose','Quickfingers',
             'Ravenscroft','Silverstone','Thornwood','Underhill','Vale',
             'Westmarch','Yew','Coldwater','Dunwall','Embers','Frostborn'],
  },
  Elf: {
    male:   ['Arannis','Berrian','Caelynn','Dayereth','Erevan','Fenmarel',
             'Galinndan','Hadarai','Immeral','Jendar','Kaeldur','Laucian',
             'Mindartis','Naeris','Orym','Paelias','Quarion','Riardon',
             'Soveliss','Thamior','Varis','Adran','Aelar','Aramil','Carric'],
    female: ['Adrie','Althaea','Anastrianna','Andraste','Antinua','Bethrynna',
             'Birel','Caelynn','Drusilia','Enna','Felosial','Irann','Keyleth',
             'Leshanna','Lia','Mialee','Naivara','Quelenna','Sariel','Shanairra',
             'Shava','Silaqui','Theodosya','Vadania','Valanthe','Xanaphia'],
    family: ['Amakiir','Amastacia','Galanodel','Holimion','Ilphelkiir','Liadon',
             'Meliamne','Naïlo','Siannodel','Xiloscient','Miritar','Evenwood'],
  },
  Dwarf: {
    male:   ['Adrik','Alberich','Baern','Barendd','Brottor','Bruenor','Dain',
             'Darrak','Delg','Eberk','Einkil','Fargrim','Flint','Gardain',
             'Harbek','Kildrak','Morgran','Orsik','Oskar','Rangrim','Rurik',
             'Taklinn','Thoradin','Thorin','Tordek','Traubon','Travok','Ulfgar'],
    female: ['Amber','Artin','Audhild','Bardryn','Dagnal','Diesa','Eldeth',
             'Falkrunn','Finellen','Gunnloda','Gurdis','Helja','Hlin','Kathra',
             'Kristryd','Ilde','Liftrasa','Mardred','Riswynn','Sannl','Torbera',
             'Torgga','Vistra'],
    family: ['Balderk','Dankil','Gorunn','Hamarakkad','Holderhek','Loderr',
             'Lutgehr','Rumnaheim','Strakeln','Torunn','Ungart'],
  },
  Halfling: {
    male:   ['Alton','Ander','Cade','Corrin','Eldon','Errich','Finnan','Garret',
             'Lindal','Lyle','Merric','Milo','Osborn','Perrin','Reed','Roscoe',
             'Wellby'],
    female: ['Andry','Bree','Callie','Cora','Euphemia','Jillian','Kithri','Lavinia',
             'Lidda','Merla','Nedda','Paela','Portia','Seraphina','Shaena',
             'Trym','Vani','Verna','Wella'],
    family: ['Brushgather','Goodbarrel','Greenbottle','High-hill','Hilltopple',
             'Leagallow','Tealeaf','Thorngage','Tosscobble','Underbough'],
  },
  Tiefling: {
    male:   ['Akmenos','Amnon','Barakas','Damakos','Ekemon','Iados','Kairon',
             'Leucis','Melech','Mordai','Morthos','Pelaios','Skamos','Therai'],
    female: ['Akta','Anakis','Bryseis','Criella','Damaia','Ea','Kallista','Lerissa',
             'Makaria','Nemeia','Orianna','Phelaia','Rieta'],
    virtue: ['Art','Carrion','Chant','Creed','Despair','Excellence','Fear',
             'Glory','Hope','Ideal','Music','Nowhere','Open','Poetry','Quest',
             'Random','Reverence','Sorrow','Temerity','Torment','Weary'],
  },
  Gnome: {
    male:   ['Alston','Alvyn','Boddynock','Brocc','Burgell','Dimble','Eldon',
             'Erky','Fonkin','Frug','Gerbo','Gimble','Glim','Jebeddo','Kellen'],
    female: ['Bimpnottin','Breena','Caramip','Carlin','Donella','Duvamil',
             'Ella','Ellyjobell','Ellywick','Lilli','Loopmottin','Lorilla',
             'Mardnab','Nissa','Nyx','Oda','Orla','Roywyn','Shamil','Tana'],
    family: ['Beren','Daergel','Folkor','Garrick','Nackle','Murnig','Ningel',
             'Raulnor','Scheppen','Timbers','Turen'],
  },
  Dragonborn: {
    male:   ['Arjhan','Balasar','Bharash','Donaar','Ghesh','Heskan','Kriv',
             'Medrash','Mehen','Nadarr','Pandjed','Patrin','Rhogar','Shamash',
             'Shedinn','Tarhun','Torinn'],
    female: ['Akra','Biri','Daar','Farideh','Harann','Havilar','Jheri','Kava',
             'Korinn','Mishann','Nala','Perra','Raiann','Sora','Surina','Thava',
             'Uadjit'],
    clan:   ['Clethtinthiallor','Daardendrian','Delmirev','Drachedandion',
             'Fenkenkabradon','Kepeshkmolik','Kerrhylon','Kimbatuul','Linxakasendalor',
             'Myastan','Nemmonis','Norixius','Ophinshtalajiir','Prexijandilin',
             'Shestendeliath','Turnuroth','Verthisathurgiesh','Yarjerit'],
  },
  Orc: {
    male:   ['Dench','Feng','Gell','Henk','Holg','Imsh','Keth','Krusk',
             'Mhurren','Ront','Shump','Thokk'],
    female: ['Baggi','Emen','Engong','Kansif','Myev','Neega','Ovak','Ownka',
             'Shautha','Sutha','Vola','Volen','Yevelda'],
    clan:   ['Doomcrusher','Eyegouger','Bonecruncher','Bloodspear','Foulspawn',
             'Ironaxe','Skullcleaver','Stonefist','Thunderfist','Warchief'],
  },
};

const RACES    = Object.keys(NAMES);
const GENDERS  = ['male', 'female', 'nonbinary'];

// ── Personality Tables ─────────────────────────────────────────────────────────

const OCCUPATIONS = [
  'blacksmith','innkeeper','merchant','soldier','farmer','priest','wizard apprentice',
  'thief','herbalist','sailor','bard','scholar','guard','alchemist','beggar',
  'cartwright','fisherman','hunter','miller','scribe','tailor','shepherd',
  'jeweller','leatherworker','dockworker','gravedigger','glassblower','midwife',
  'spy','healer','arena fighter','bounty hunter','caravan guard','tax collector',
];

const PERSONALITY_TRAITS = [
  'I always have a plan for what to do when things go wrong.',
  'I speak rarely but my words carry weight.',
  'I am incredibly direct and say exactly what I mean.',
  'I find humour in even the darkest of situations.',
  'I pepper my speech with proverbs my grandmother taught me.',
  'I bluntly say what others are only thinking.',
  'I am always calm, no matter the situation.',
  'I take great pains to look my very best at all times.',
  'I misquote famous adventurers constantly.',
  'I have a tendency to wink at strangers I like.',
  'I judge people by their deeds, never their words.',
  'I believe the best way to get something done is to do it yourself.',
  'I cannot keep a secret to save my life.',
  'I get uncomfortable around long silences.',
  'I hum to myself when I think no one is listening.',
];

const IDEALS = [
  'Community — we must all look out for each other.',
  'Power — gaining power is the only way to protect the weak.',
  'Freedom — shackles of any kind must be broken.',
  'Tradition — the old ways are the best ways.',
  'Change — change is the only way to improve.',
  'Aspiration — I am destined for greatness.',
  'Greater Good — sometimes a few must suffer for the many.',
  'Independence — I am the master of my own fate.',
  'Sincerity — there is no greater sin than a broken promise.',
  'Beauty — art and elegance are worth protecting.',
];

const BONDS = [
  'I would die to recover a family heirloom that was stolen.',
  'A powerful enemy once destroyed everything I loved.',
  'I protect a village that gave me shelter in my darkest hour.',
  'Someone saved my life years ago; I still owe a debt.',
  'I seek revenge on those who wronged my people.',
  'I will find my missing sibling no matter what it takes.',
  'A wise mentor shaped who I am today.',
  'I escaped a terrible fate, and now I must warn others.',
  'There is a locked chest buried somewhere that only I know about.',
  'I would do anything to keep my secret past hidden.',
];

const FLAWS = [
  'I cannot resist a pretty face.',
  'The first thing I do in a new place is note the exits.',
  'I have trouble trusting anyone who is not from my hometown.',
  'I talk too much when I am nervous.',
  'I act first and think later, often to my regret.',
  'I have a weakness for strong drink.',
  'I assume people are always lying to me.',
  'I hold grudges longer than most people hold their breath.',
  'I am prone to wild exaggeration.',
  'I am secretly convinced I know best about almost everything.',
];

const APPEARANCES = [
  'gaunt and weathered with sunken {colour} eyes',
  'stout and ruddy-faced with laugh lines',
  'tall and angular with a hawkish nose',
  'short and broad-shouldered with calloused hands',
  'slight and nervous-looking with darting {colour} eyes',
  'imposing and scarred across the left cheek',
  'clean-featured and soft-spoken in bearing',
  'heavyset with a thick grey beard',
  'willowy with silver-streaked hair',
  'compact and wiry with a sharp watchful gaze',
];

const EYE_COLOURS = ['brown','grey','green','blue','amber','hazel','silver','violet'];

// ── Tavern + Rumour Tables ─────────────────────────────────────────────────────

const TAVERN_PREFIXES = [
  'The Rusty','The Golden','The Wandering','The Howling','The Broken',
  'The Silver','The Black','The Fallen','The Hidden','The Drunken',
  'The Weeping','The Iron','The Crimson','The Blessed','The Laughing',
];

const TAVERN_SUFFIXES = [
  'Dragon','Flagon','Badger','Crow','Anvil','Anchor','Hound','Staff',
  'Tankard','Goblin','Lantern','Moon','Axe','Coin','Serpent','Mage',
];

const RUMOURS = [
  "They say {npc} hasn't been seen since the new moon.",
  "Strange lights have been spotted near the old {location} every midnight.",
  "The {faction} are quietly buying up land on the edge of town.",
  "Someone is poisoning the wells — three livestock found dead this week.",
  "A merchant was found with all his gold and a blank expression on his face.",
  "The miller's daughter went missing, but the family won't speak of it.",
  "An anonymous letter warns that the town guard has been bribed.",
  "Wolves have been howling near the cemetery. At noon.",
  "Shipments from the capital have stopped for two months running.",
  "A child claims to have seen a figure in the old watchtower at night.",
];

const RUMOUR_NPCS      = ["the old priest", "a local farmer", "the innkeeper's wife",
                           "a visiting merchant", "the blacksmith"];
const RUMOUR_LOCATIONS = ["mill", "graveyard", "forest", "abandoned mansion", "old fort"];
const RUMOUR_FACTIONS  = ["thieves guild", "merchant council", "cult", "local militia"];

// ── Helper utilities ───────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickFaker(arr) {
  return faker.helpers.arrayElement(arr);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Generate a D&D-appropriate NPC name.
 * @param {string} [race] — one of RACES, or omitted for random
 * @param {string} [gender] — 'male' | 'female' | 'nonbinary'
 * @returns {string} full name
 */
export function generateNPCName(race, gender) {
  const r = (race && NAMES[race]) ? race : pickFaker(RACES);
  const g = (gender === 'male' || gender === 'female')
    ? gender
    : pickFaker(['male', 'female']);

  const table  = NAMES[r];
  const first  = pickFaker(table[g] || table.male || table.female);
  const family = table.family
    || table.clan
    || table.virtue;

  if (!family) return first;   // some races (e.g. Tiefling virtue names) use first only
  return `${first} ${pickFaker(family)}`;
}

/**
 * Generate random NPC background / roleplay hooks.
 * @returns {{ occupation, personality, ideal, bond, flaw }}
 */
export function generateNPCBackground() {
  return {
    occupation:  pickFaker(OCCUPATIONS),
    personality: pickFaker(PERSONALITY_TRAITS),
    ideal:       pickFaker(IDEALS),
    bond:        pickFaker(BONDS),
    flaw:        pickFaker(FLAWS),
  };
}

/**
 * One-line physical description (no quotes needed).
 * @returns {string}
 */
export function generateNPCDescription() {
  const template = pickFaker(APPEARANCES);
  const colour   = pickFaker(EYE_COLOURS);
  return template.replace('{colour}', colour);
}

/**
 * Generate a full NPC object ready for the UI.
 * @param {object} [opts]
 * @param {string} [opts.race]
 * @param {string} [opts.gender]
 * @param {string} [opts.type]   — CritRoll type string for token ring colour
 * @param {number} [opts.cr]
 * @returns {object} NPC record
 */
export function generateNPC(opts = {}) {
  const race   = opts.race   || pickFaker(RACES);
  const gender = opts.gender || pickFaker(GENDERS);
  const bg     = generateNPCBackground();

  return {
    name:        generateNPCName(race, gender),
    race,
    gender,
    occupation:  bg.occupation,
    description: generateNPCDescription(),
    personality: bg.personality,
    ideal:       bg.ideal,
    bond:        bg.bond,
    flaw:        bg.flaw,
    // Randomised combat stats (CR 0 civilian)
    cr:   opts.cr   ?? '0',
    type: opts.type ?? 'Humanoid',
    hp:   faker.number.int({ min: 4,  max: 12 }),
    ac:   faker.number.int({ min: 10, max: 13 }),
  };
}

/**
 * Generate a fantasy tavern name.
 * @returns {string}
 */
export function generateTavernName() {
  return `${pickFaker(TAVERN_PREFIXES)} ${pickFaker(TAVERN_SUFFIXES)}`;
}

/**
 * Generate a local rumour string.
 * @returns {string}
 */
export function generateRumor() {
  let r = pickFaker(RUMOURS);
  r = r.replace('{npc}',      pickFaker(RUMOUR_NPCS));
  r = r.replace('{location}', pickFaker(RUMOUR_LOCATIONS));
  r = r.replace('{faction}',  pickFaker(RUMOUR_FACTIONS));
  return r;
}

/** All available races */
export { RACES, GENDERS };
