// js/miniAssembler.js — Race × Class × Gender → Three.js 3D Miniature
//
// Uses Kenney.nl Blocky Characters 2.0 (CC0, kenney.nl/assets/blocky-characters)
// 18 fully-animated GLB models, each with 27 clips:
//   idle · walk · sprint · die · attack-melee-right · attack-melee-left ·
//   attack-kick-right · emote-yes · emote-no · interact-right · holding-right ·
//   holding-right-shoot · pick-up · sit · drive … and more
//
// Character visual mapping (determined from preview images):
//   a → brown/green traveller     (Ranger male)
//   b → red/blue warrior          (Fighter male)
//   c → green scout               (Rogue female / Ranger female)
//   d → yellow/orange armoured    (Paladin female / Fighter heavy)
//   e → purple robes              (Wizard male / Warlock male)
//   f → dark green, dark skin     (Druid male)
//   g → blue/pink striped armour  (Cleric female / Bard male)
//   h → purple full plate         (Paladin male)
//   i → light blue/pink robes     (Wizard female / Cleric female)
//   j → navy uniform              (Cleric male / Fighter alt)
//   k → red/brown casual, fur     (Barbarian male)
//   l → green adventurer          (Ranger female / Druid female)
//   m → teal/green robes          (Druid female / Cleric alt)
//   n → teal/pink dress           (Bard female / Sorcerer female)
//   o → teal adventurer dark skin (Barbarian female)
//   p → blue suit                 (Bard male / Warlock alt)
//   q → dark formal               (Warlock female / Rogue male)
//   r → black ninja               (Rogue male / Monk)

import * as THREE     from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ── Asset map: class × gender → GLB filename ──────────────────────────────────

const MODEL_MAP = {
  // [class][gender] → filename (without .glb)
  Fighter:   { male: 'character-b', female: 'character-g',  nonbinary: 'character-d' },
  Paladin:   { male: 'character-h', female: 'character-d',  nonbinary: 'character-j' },
  Wizard:    { male: 'character-e', female: 'character-i',  nonbinary: 'character-e' },
  Sorcerer:  { male: 'character-e', female: 'character-i',  nonbinary: 'character-p' },
  Warlock:   { male: 'character-q', female: 'character-e',  nonbinary: 'character-p' },
  Rogue:     { male: 'character-r', female: 'character-c',  nonbinary: 'character-q' },
  Ranger:    { male: 'character-a', female: 'character-l',  nonbinary: 'character-c' },
  Cleric:    { male: 'character-j', female: 'character-m',  nonbinary: 'character-g' },
  Barbarian: { male: 'character-k', female: 'character-o',  nonbinary: 'character-k' },
  Bard:      { male: 'character-p', female: 'character-n',  nonbinary: 'character-g' },
  Druid:     { male: 'character-f', female: 'character-m',  nonbinary: 'character-l' },
  Monk:      { male: 'character-r', female: 'character-r',  nonbinary: 'character-r' },
  // Monster-type fallbacks (used when class is absent)
  _undead:   { male: 'character-h', female: 'character-h',  nonbinary: 'character-h' },
  _beast:    { male: 'character-f', female: 'character-f',  nonbinary: 'character-f' },
  _fiend:    { male: 'character-q', female: 'character-q',  nonbinary: 'character-q' },
  _dragon:   { male: 'character-d', female: 'character-d',  nonbinary: 'character-d' },
  _default:  { male: 'character-a', female: 'character-i',  nonbinary: 'character-c' },
};

// Race → tint applied on top of the model's own colours via MeshToonMaterial.color
// (subtle — keeps the original texture visible but shifts the hue)
const RACE_TINT = {
  Elf:        null,            // default colours look good
  Dwarf:      null,
  Tiefling:   0xd4a0d4,       // light purple tint
  Gnome:      null,
  Dragonborn: 0xa8d8a8,       // pale green tint
  Human:      null,
  'Half-Orc': 0xb0c8a0,       // pale green tint
  Halfling:   null,
};

// Race → Y scale modifier (Dwarf/Gnome/Halfling shorter)
const RACE_SCALE = {
  Dwarf:    0.80,
  Gnome:    0.74,
  Halfling: 0.77,
  default:  1.0,
};

// ── Three.js setup ─────────────────────────────────────────────────────────────

const _loader   = new GLTFLoader();
const _glbCache = new Map();  // filename → THREE.Group + animations

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Build a Three.js Group for this player/NPC.
 * Returns the group with `group.animations` array populated.
 *
 * Normalised space: model stands feet-at-y=0, head near y=1.
 */
export async function assembleModel(pl) {
  const cls    = pl.class       || '';
  const gender = pl.gender      || 'male';
  const race   = pl.race        || 'Human';
  const mType  = (pl.monsterType || '').toLowerCase();

  // Pick the right character file
  const classCfg = MODEL_MAP[cls]
    || (mType && _monsterTypeCfg(mType))
    || MODEL_MAP._default;

  const filename = classCfg[gender] || classCfg.male || 'character-a';
  const url = `assets/minis/${filename}.glb`;

  const source = await _loadGLB(url);
  const group  = source.clone(true);
  group.animations = source.animations;   // share clip references (don't clone)

  // Deep-clone materials so per-token tinting doesn't bleed
  group.traverse(obj => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const toon = mats.map(m => {
      const t = new THREE.MeshToonMaterial({
        gradientMap: _gradientMap(),
        map:         m.map ?? null,
        color:       m.color?.clone() ?? new THREE.Color(1, 1, 1),
      });
      // Subtle race tint
      const tintHex = RACE_TINT[race];
      if (tintHex) t.color.multiply(new THREE.Color(tintHex));
      return t;
    });
    obj.material = toon.length === 1 ? toon[0] : toon;
  });

  // Inverted-hull outline pass
  _addOutline(group);

  // Normalise: scale so model height = 1 unit, feet at y = 0
  const box    = new THREE.Box3().setFromObject(group);
  const height = (box.max.y - box.min.y) || 1;
  const invH   = 1 / height;
  group.scale.setScalar(invH);
  group.position.y = -box.min.y * invH;

  // Race height modifier
  const raceScaleY = RACE_SCALE[race] ?? RACE_SCALE.default;
  group.scale.y *= raceScaleY;

  return group;
}

// ── Outline (inverted hull) ────────────────────────────────────────────────────

function _addOutline(group) {
  const outlineMat = new THREE.MeshBasicMaterial({
    color:      0x000000,
    side:       THREE.BackSide,
    transparent: true,
    opacity:    0.85,
  });
  const meshes = [];
  group.traverse(obj => { if (obj.isMesh) meshes.push(obj); });
  meshes.forEach(mesh => {
    const outline = new THREE.Mesh(mesh.geometry, outlineMat.clone());
    outline.scale.setScalar(1.08);   // slightly larger = visible rim
    outline.raycast = () => {};       // not interactive
    mesh.parent.add(outline);
  });
}

// ── GLB cache ──────────────────────────────────────────────────────────────────

function _loadGLB(url) {
  if (_glbCache.has(url)) return Promise.resolve(_glbCache.get(url));
  return new Promise((resolve, reject) => {
    _loader.load(
      url,
      gltf => {
        gltf.scene.animations = gltf.animations;
        _glbCache.set(url, gltf.scene);
        resolve(gltf.scene);
      },
      undefined,
      reject
    );
  });
}

// ── Toon gradient map (3-band cel shading) ────────────────────────────────────

let _gradTex = null;
function _gradientMap() {
  if (_gradTex) return _gradTex;
  const data = new Uint8Array([80, 148, 220]);   // dark / mid / bright bands
  const tex  = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  _gradTex = tex;
  return _gradTex;
}

// ── Monster-type → model config ────────────────────────────────────────────────

function _monsterTypeCfg(mType) {
  if (mType.includes('undead'))   return MODEL_MAP._undead;
  if (mType.includes('dragon'))   return MODEL_MAP._dragon;
  if (mType.includes('fiend') || mType.includes('demon') || mType.includes('devil'))
                                  return MODEL_MAP._fiend;
  if (mType.includes('beast') || mType.includes('monstrosity'))
                                  return MODEL_MAP._beast;
  return null;
}
