// js/iconMap.js — Emoji → Custom Icon replacement manifest
//
// Central mapping of emojis/slugs to Canva-generated PNG icons.
// Used by ui.js, lobby.js, app.js to replace emoji text with <img> tags.

const BASE = '/assets/icons';

/* ── Toolbar / HUD icons ──────────────────────────────────────────────── */
export const TOOLBAR_ICONS = {
  '🎲': `${BASE}/toolbar/dice.png`,
  '⚔️': `${BASE}/toolbar/combat.png`,
  '⚡': `${BASE}/toolbar/initiative.png`,
  '🎭': `${BASE}/toolbar/npc.png`,
  '📖': `${BASE}/toolbar/monsters.png`,
  '🗺️': `${BASE}/toolbar/scene.png`,
  '🗺':  `${BASE}/toolbar/scene.png`,
  '🎵': `${BASE}/toolbar/music.png`,
  '📜': `${BASE}/toolbar/log.png`,
  '🔮': `${BASE}/toolbar/spells.png`,
  '🔇': `${BASE}/toolbar/mute.png`,
  '🔊': `${BASE}/toolbar/unmute.png`,
  '😴': `${BASE}/toolbar/rest.png`,
  '🪵': `${BASE}/toolbar/table.png`,
  '🖼️': `${BASE}/toolbar/present.png`,
  '🖼':  `${BASE}/toolbar/present.png`,
  '🏰': `${BASE}/toolbar/campaign.png`,
  '📝': `${BASE}/toolbar/notes.png`,
  '✏️': `${BASE}/toolbar/editor.png`,
  '📡': `${BASE}/toolbar/broadcast.png`,
  '📋': `${BASE}/toolbar/character.png`,
  '✨': `${BASE}/toolbar/abilities.png`,
  '🍀': `${BASE}/toolbar/advantage.png`,
  '💀': `${BASE}/toolbar/disadvantage.png`,
  '👥': `${BASE}/toolbar/party.png`,
  '💾': `${BASE}/toolbar/save.png`,
  '✕':  `${BASE}/toolbar/close.png`,
  '🔲': `${BASE}/toolbar/calibrate.png`,
  '🎬': `${BASE}/toolbar/video.png`,
  '🗑️': `${BASE}/toolbar/trash.png`,
  '🗑':  `${BASE}/toolbar/trash.png`,
  '🏳️': `${BASE}/toolbar/surrender.png`,
  '🏳':  `${BASE}/toolbar/surrender.png`,
  '🚪': `${BASE}/toolbar/door.png`,
  '♿': `${BASE}/toolbar/calibrate.png`,
};

/* ── D&D class icons (keyed by class name) ────────────────────────────── */
export const CLASS_ICONS = {
  'Barbarian': `${BASE}/class/barbarian.png`,
  'Bard':      `${BASE}/class/bard.png`,
  'Cleric':    `${BASE}/class/cleric.png`,
  'Druid':     `${BASE}/class/druid.png`,
  'Fighter':   `${BASE}/class/fighter.png`,
  'Monk':      `${BASE}/class/monk.png`,
  'Paladin':   `${BASE}/class/paladin.png`,
  'Ranger':    `${BASE}/class/ranger.png`,
  'Rogue':     `${BASE}/class/rogue.png`,
  'Sorcerer':  `${BASE}/class/sorcerer.png`,
  'Warlock':   `${BASE}/class/warlock.png`,
  'Wizard':    `${BASE}/class/wizard.png`,
};

/* ── Class emoji → class name reverse-lookup ──────────────────────────── */
export const CLASS_EMOJI_MAP = {
  '🪓': 'Barbarian',
  '🎸': 'Bard',
  '⛪': 'Cleric',
  '🌿': 'Druid',
  '⚔️': 'Fighter',
  '👊': 'Monk',
  '🛡️': 'Paladin',
  '🛡':  'Paladin',
  '🏹': 'Ranger',
  '🗡️': 'Rogue',
  '🗡':  'Rogue',
  '💥': 'Sorcerer',
  '👁️': 'Warlock',
  '👁':  'Warlock',
  '📖': 'Wizard',
};

/* ── Combat action icons (keyed by emoji) ─────────────────────────────── */
export const ACTION_ICONS = {
  '⚔️': `${BASE}/action/melee.png`,
  '🏹': `${BASE}/action/ranged.png`,
  '🪄': `${BASE}/action/wand.png`,
  '🔥': `${BASE}/action/fire.png`,
  '❄️': `${BASE}/action/ice.png`,
  '⚡': `${BASE}/action/lightning.png`,
  '🌪️': `${BASE}/action/wind.png`,
  '🛡️': `${BASE}/action/shield.png`,
  '🛡':  `${BASE}/action/shield.png`,
  '💣': `${BASE}/action/bomb.png`,
  '🗡️': `${BASE}/action/dagger.png`,
  '🗡':  `${BASE}/action/dagger.png`,
  '🔮': `${BASE}/action/arcane.png`,
  '💀': `${BASE}/action/death.png`,
  '🌿': `${BASE}/action/nature.png`,
  '🩸': `${BASE}/action/blood.png`,
  '☀️': `${BASE}/action/holy.png`,
  '🌊': `${BASE}/action/water.png`,
  '💚': `${BASE}/action/heal.png`,
  '🏮': `${BASE}/action/lantern.png`,
  '🕯️': `${BASE}/action/candle.png`,
  '🕯':  `${BASE}/action/candle.png`,
  '🧱': `${BASE}/action/wall.png`,
  '🪨': `${BASE}/action/floor.png`,
  '🗝️': `${BASE}/action/props.png`,
  '🗝':  `${BASE}/action/props.png`,
  '⚠️': `${BASE}/action/warning.png`,
  '⚠':  `${BASE}/action/warning.png`,
  '🌟': `${BASE}/action/reveal.png`,
  '🌑': `${BASE}/action/hide.png`,
  '📏': `${BASE}/action/ruler.png`,
  '💥': `${BASE}/action/aoe.png`,
  '🌩️': `${BASE}/action/weather.png`,
  '🌩':  `${BASE}/action/weather.png`,
  '🌫️': `${BASE}/action/fog.png`,
  '🌫':  `${BASE}/action/fog.png`,
  '⛈️': `${BASE}/action/rain.png`,
  '⛈':  `${BASE}/action/rain.png`,
  '🔻': `${BASE}/toolbar/prone.png`,
  '😵': `${BASE}/toolbar/exhausted.png`,
  '🙈': `${BASE}/toolbar/invisible.png`,
};

/* ── Class-ability button emojis → icon paths ─────────────────────────── */
export const ABILITY_ICONS = {
  '🔥': `${BASE}/action/fire.png`,
  '💨': `${BASE}/toolbar/rest.png`,       // reuse rest/wind icon
  '🤫': `${BASE}/action/dagger.png`,      // stealth → dagger
  '🐾': `${BASE}/action/nature.png`,      // wild shape → nature
  '🐺': `${BASE}/action/nature.png`,      // companion → nature
  '🐻': `${BASE}/action/nature.png`,      // bear → nature
  '🐆': `${BASE}/action/nature.png`,      // panther → nature
  '🦅': `${BASE}/action/nature.png`,      // eagle → nature
  '🌀': `${BASE}/action/arcane.png`,      // tides of chaos → arcane
  '💥': `${BASE}/action/fire.png`,         // wild magic → fire
  '👻': `${BASE}/action/death.png`,        // misty escape → death
  '🌑': `${BASE}/action/death.png`,        // shadow step → death
  '✨': `${BASE}/toolbar/abilities.png`,
  '😤': `${BASE}/action/fire.png`,         // frenzy → fire
  '😠': `${BASE}/action/death.png`,        // intimidate → death
  '🧚': `${BASE}/action/arcane.png`,       // fey presence → arcane
  '🗡️': `${BASE}/action/dagger.png`,
  '🎯': `${BASE}/action/ranged.png`,       // hunter's mark → ranged
  '🥊': `${BASE}/action/melee.png`,        // flurry → melee
  '🛡️': `${BASE}/action/shield.png`,
  '🎵': `${BASE}/toolbar/music.png`,       // bardic inspiration → music
  '✝️': `${BASE}/action/holy.png`,          // turn undead → holy
  '🙏': `${BASE}/action/holy.png`,         // lay on hands → holy
  '👁️': `${BASE}/action/arcane.png`,       // divine sense → arcane
  '📚': `${BASE}/toolbar/monsters.png`,    // arcane recovery → book
  '🔮': `${BASE}/action/arcane.png`,
  '🩸': `${BASE}/action/blood.png`,
};

/* ── All icon maps merged (for generic lookups) ───────────────────────── */
const ALL_ICONS = { ...TOOLBAR_ICONS, ...ACTION_ICONS, ...ABILITY_ICONS };

/**
 * Return an <img> tag for a given emoji, or fall back to the emoji string.
 * Safe to use inside innerHTML template literals.
 *
 * @param {string} emoji  — the emoji character(s) to replace
 * @param {string} size   — CSS size for width/height (default '20px')
 * @param {string} alt    — alt text (defaults to the emoji itself)
 * @returns {string} HTML <img> tag or the original emoji if no mapping found
 */
export function iconImg(emoji, size = '20px', alt = '') {
  const src = ALL_ICONS[emoji];
  if (!src) return emoji;                          // graceful fallback
  return `<img src="${src}" alt="${alt || emoji}" class="custom-icon" `
       + `style="width:${size};height:${size};" loading="lazy">`;
}

/**
 * Return an <img> tag for a D&D class name.
 *
 * @param {string} className — e.g. "Barbarian", "Wizard"
 * @param {string} size      — CSS size (default '24px')
 * @returns {string} HTML <img> tag or empty string
 */
export function classIconImg(className, size = '24px') {
  const src = CLASS_ICONS[className];
  if (!src) return '';
  return `<img src="${src}" alt="${className}" class="custom-icon" `
       + `style="width:${size};height:${size};" loading="lazy">`;
}
