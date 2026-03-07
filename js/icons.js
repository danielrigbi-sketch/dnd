// js/icons.js — Game-Icons.net Icon Manifest  (Wave 1 / E5-A)
//
// Attribution (CC-BY 3.0 REQUIRED):
//   Icons sourced from Game-Icons.net (https://game-icons.net/)
//   Icons by Lorc, Delapouite, Skoll, and contributors.
//   Licensed under Creative Commons Attribution 3.0.
//   See the Credits modal (ⓘ button in sidebar) for full attribution.
//
// Usage:
//   import { ICONS, getIconClass } from './icons.js';
//   element.innerHTML = `<span class="gi-icon gi-${getIconClass('Poisoned')}"></span>`;
//
// The CSS mask-image approach lets the colour be set via background-color:currentColor
// so all existing S12 colour codes remain valid.

/** Map: condition / action name → SVG filename (without .svg extension) */
export const ICONS = {
  // ── Conditions ────────────────────────────────────────────────────────────
  'Poisoned':      'poisoned',
  'Charmed':       'charmed',
  'Unconscious':   'unconscious',
  'Frightened':    'frightened',
  'Paralyzed':     'paralyzed',
  'Restrained':    'restrained',
  'Blinded':       'blinded',
  'Prone':         'prone',
  'Stunned':       'stunned',
  'Incapacitated': 'incapacitated',
  'Invisible':     'invisible',
  'Exhausted':     'exhausted',
  'Deafened':      'deafened',
  'Grappled':      'grappled',
  'Raging':        'raging',
  'Hasted':        'hasted',
  'Blessed':       'blessed',
  'Concentrating': 'concentrating',
};

/**
 * Return the icon slug for a given condition name.
 * Falls back to null if no icon found (caller should fall back to emoji).
 */
export function getIconSlug(name) {
  return ICONS[name] || null;
}

/**
 * Build an <img>-free SVG icon element string for use inside innerHTML.
 * Colour is injected via inline style so it inherits the badge colour.
 *
 * @param {string} name   — condition name e.g. "Poisoned"
 * @param {string} color  — hex color e.g. "#27ae60"
 * @param {string} size   — CSS size e.g. "14px"
 * @returns {string} HTML string with <span> using CSS mask-image
 */
export function iconHTML(name, color = 'currentColor', size = '14px') {
  const slug = ICONS[name];
  if (!slug) return '';   // caller uses emoji fallback
  return `<span class="gi-icon" style="` +
    `display:inline-block;` +
    `width:${size};height:${size};` +
    `background-color:${color};` +
    `-webkit-mask-image:url(/icons/${slug}.svg);` +
    `mask-image:url(/icons/${slug}.svg);` +
    `-webkit-mask-size:contain;mask-size:contain;` +
    `-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;` +
    `-webkit-mask-position:center;mask-position:center;` +
    `vertical-align:-2px;flex-shrink:0;` +
    `" aria-hidden="true" title="${name}"></span>`;
}
