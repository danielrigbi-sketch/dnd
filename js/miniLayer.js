// js/miniLayer.js — 3D Miniature Overlay Layer
//
// Renders one toon-shaded Three.js 3D mini per token on a transparent canvas
// above PixiJS. Synced to the same pan / zoom transform each frame.
//
// Assets: Kenney.nl Blocky Characters 2.0 (CC0) — 18 models × 27 animations.
// Animation clips used:
//   idle              — default standing loop
//   walk / sprint     — movement (future use)
//   die               — triggered when hp drops to 0
//   attack-melee-right — triggered on attack events (future use)
//   emote-yes / emote-no — (future use)
//
// PixiJS still owns: HP bars, name pills, glow ring, status icons.
// This layer owns: 3D geometry + idle/die animation + base disc.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assembleModel } from './miniAssembler.js';

// ── Config ─────────────────────────────────────────────────────────────────────

// Below this zoom the 3D layer hides — PixiJS 2D tokens take over
const MIN_ZOOM_FOR_3D = 0.45;

// Model height relative to one grid tile (1.0 = fills tile top-to-bottom)
const MINI_SCALE = 0.88;

// How strongly the camera tilts for a "tabletop" perspective feel (radians)
// 0 = pure top-down ortho, 0.45 = subtle tilt
const CAMERA_TILT = 0.0;   // start at 0; can increase for isometric look

// ── State ──────────────────────────────────────────────────────────────────────

let _renderer  = null;
let _scene     = null;
let _camera    = null;
let _canvas    = null;
let _lastTick  = 0;   // replaces THREE.Clock (deprecated in r183)
let _raf       = null;
let _w = 1, _h = 1;

// Per-token: cn → { group, mixer, clips, isDying, baseDisc, lastKey }
const _tokens = new Map();

// Shared model source cache: configKey → { scene, animations }
const _modelCache = new Map();

// Current view transform
let _vx = 0, _vy = 0, _vs = 1, _ox = 0, _oy = 0;

// ── Init ───────────────────────────────────────────────────────────────────────

export function initMiniLayer(containerEl) {
  if (_renderer) return;

  _canvas = document.createElement('canvas');
  _canvas.id = 'mini-layer';
  _canvas.style.cssText = [
    'position:absolute', 'top:0', 'left:0',
    'width:100%', 'height:100%',
    'pointer-events:none',
    'z-index:4',
  ].join(';');
  containerEl.appendChild(_canvas);

  _w = containerEl.clientWidth  || 800;
  _h = containerEl.clientHeight || 600;

  _renderer = new THREE.WebGLRenderer({
    canvas: _canvas, alpha: true, antialias: true, premultipliedAlpha: false,
  });
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _renderer.setSize(_w, _h, false);
  _renderer.setClearColor(0x000000, 0);

  _scene  = new THREE.Scene();
  _camera = _makeCamera(_w, _h);

  // Lighting rig
  _scene.add(new THREE.AmbientLight(0xffffff, 1.1));

  const key = new THREE.DirectionalLight(0xfff8e7, 2.0);  // warm top-front key
  key.position.set(-1, 3, 2);
  _scene.add(key);

  const rim = new THREE.DirectionalLight(0xb0d0ff, 1.2);  // cool blue rim from behind
  rim.position.set(1.5, 1.5, -3);
  _scene.add(rim);

  const fill = new THREE.DirectionalLight(0xffffff, 0.5); // soft fill
  fill.position.set(2, 1, 1);
  _scene.add(fill);

  // Resize
  const ro = new ResizeObserver(() => {
    _w = containerEl.clientWidth  || 800;
    _h = containerEl.clientHeight || 600;
    _renderer.setSize(_w, _h, false);
    _camera.left = -_w / 2; _camera.right  =  _w / 2;
    _camera.top  =  _h / 2; _camera.bottom = -_h / 2;
    _camera.updateProjectionMatrix();
  });
  ro.observe(containerEl);

  _startLoop();
}

function _makeCamera(w, h) {
  const cam = new THREE.OrthographicCamera(-w/2, w/2, h/2, -h/2, 0.1, 5000);
  cam.position.set(0, 0, 2000);
  cam.lookAt(0, 0, 0);
  return cam;
}

// ── Public sync (called from mapEngine each frame) ─────────────────────────────

export function syncMinis(vx, vy, vs, ox, oy, pps, tokens, players, activeName) {
  if (!_renderer) return;
  _vx = vx; _vy = vy; _vs = vs; _ox = ox; _oy = oy;

  const show3D = vs >= MIN_ZOOM_FOR_3D;
  _canvas.style.display = show3D ? 'block' : 'none';
  if (!show3D) return;

  // Remove stale tokens
  for (const cn of [..._tokens.keys()]) {
    if (!tokens[cn]) _removeToken(cn);
  }

  // Add / update
  for (const [cn, tk] of Object.entries(tokens)) {
    const pl = players[cn] || {};
    if (!_tokens.has(cn)) _addToken(cn, pl);
    _updateToken(cn, tk, pl, pps, activeName);
  }
}

// ── Token lifecycle ────────────────────────────────────────────────────────────

async function _addToken(cn, pl) {
  const group = new THREE.Group();
  group.visible = false;
  _scene.add(group);

  const entry = {
    group,
    mixer:    null,
    clips:    {},   // name → THREE.AnimationClip
    isDying:  false,
    baseDisc: null,
    lastKey:  null,
  };
  _tokens.set(cn, entry);

  await _loadModelInto(entry, pl);
}

async function _loadModelInto(entry, pl) {
  const key = _configKey(pl);
  entry.lastKey = '__loading__';

  let model;
  try {
    model = await _getModel(pl);
  } catch (e) {
    console.warn('[MiniLayer] model load failed, using placeholder:', e.message);
    model = _makePlaceholder(pl.pColor || '#3498db');
  }

  if (!entry.group.parent) return; // removed while loading

  // Clear old geometry
  [...entry.group.children].forEach(c => {
    if (c !== entry.baseDisc) entry.group.remove(c);
  });
  entry.group.add(model);
  entry.group.visible = true;

  // Animation mixer — use real clip names from Kenney pack
  if (model.animations?.length) {
    const mixer = new THREE.AnimationMixer(model);
    const byName = {};
    model.animations.forEach(clip => { byName[clip.name] = clip; });

    entry.mixer = mixer;
    entry.clips = byName;

    // Start idle loop
    const idleClip = byName['idle'] || byName['static'] || model.animations[0];
    if (idleClip) {
      mixer.clipAction(idleClip).play();
    }
  }

  // Base disc (emissive glow matching player colour)
  if (!entry.baseDisc) {
    entry.baseDisc = _makeBaseDisc(pl.pColor || '#3498db');
    entry.group.add(entry.baseDisc);
  }

  entry.lastKey = key;
}

function _removeToken(cn) {
  const entry = _tokens.get(cn);
  if (!entry) return;
  entry.mixer?.stopAllAction();
  _scene.remove(entry.group);
  entry.group.traverse(obj => {
    obj.geometry?.dispose();
    if (obj.material) {
      (Array.isArray(obj.material) ? obj.material : [obj.material])
        .forEach(m => m.dispose());
    }
  });
  _tokens.delete(cn);
}

function _updateToken(cn, tk, pl, pps, activeName) {
  const entry = _tokens.get(cn);
  if (!entry) return;

  // ── Position & scale ────────────────────────────────────────────────────────
  const tileSize  = _getTileSize(pl.size);
  const pixelSize = pps * tileSize * _vs * MINI_SCALE;

  // Screen-space centre of this token's footprint
  // Transform mirrors PixiJS: translate(vx,vy) then scale(vs) → screen = vx + (ox + world)*vs
  const sx = _vx + (_ox + (tk.gx + tileSize / 2) * pps) * _vs;
  const sy = _vy + (_oy + (tk.gy + tileSize / 2) * pps) * _vs;

  // Three.js world: centre-origin, Y-up
  entry.group.position.set(sx - _w / 2, _h / 2 - sy, 0);
  entry.group.scale.setScalar(pixelSize);

  // ── Base disc ───────────────────────────────────────────────────────────────
  if (entry.baseDisc) {
    const col = new THREE.Color(pl.pColor || '#3498db');
    entry.baseDisc.material.color.set(col);
    entry.baseDisc.material.emissive.set(col);
    const isActive = cn === activeName;
    entry.baseDisc.material.emissiveIntensity = isActive
      ? 0.7 + 0.35 * Math.sin(Date.now() * 0.006)
      : 0.3;
  }

  // ── Death state ─────────────────────────────────────────────────────────────
  const dying = typeof pl.hp === 'number' && pl.maxHp > 0 && pl.hp <= 0;
  if (dying !== entry.isDying) {
    entry.isDying = dying;
    if (dying && entry.mixer && entry.clips['die']) {
      entry.mixer.stopAllAction();
      const dieAction = entry.mixer.clipAction(entry.clips['die']);
      dieAction.setLoop(THREE.LoopOnce, 1);
      dieAction.clampWhenFinished = true;
      dieAction.play();
    } else if (!dying && entry.mixer) {
      // Revived — return to idle
      entry.mixer.stopAllAction();
      const idleClip = entry.clips['idle'] || entry.clips['static'];
      if (idleClip) entry.mixer.clipAction(idleClip).play();
    }
  }

  // Grey-out tint when dying
  if (entry.group.visible) {
    entry.group.traverse(obj => {
      if (!obj.isMesh || obj === entry.baseDisc) return;
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(mat => {
        if (mat.isMeshToonMaterial || mat.isMeshBasicMaterial) {
          // preserve original hue, just desaturate+darken
          if (dying) {
            mat.color.setRGB(0.28, 0.28, 0.28);
          }
          // Note: resurrection tint reset happens via model reload
        }
      });
    });
  }

  // ── Reload if race/class/gender changed ────────────────────────────────────
  const newKey = _configKey(pl);
  if (newKey !== entry.lastKey && entry.lastKey !== '__loading__') {
    _loadModelInto(entry, pl);
  }
}

// ── Model cache / assembly ─────────────────────────────────────────────────────

async function _getModel(pl) {
  const key = _configKey(pl);
  if (_modelCache.has(key)) {
    const src = _modelCache.get(key);
    const clone = src.clone(true);
    clone.animations = src.animations;  // share clip refs
    return clone;
  }
  const model = await assembleModel(pl);
  _modelCache.set(key, model);
  const clone = model.clone(true);
  clone.animations = model.animations;
  return clone;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _configKey(pl) {
  return `${pl.race || 'Human'}_${pl.class || ''}_${pl.gender || 'male'}`;
}

function _getTileSize(size) {
  const s = (size || '').toLowerCase();
  if (s === 'large')      return 2;
  if (s === 'huge')       return 3;
  if (s === 'gargantuan') return 4;
  return 1;
}

function _makeBaseDisc(colorHex) {
  const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 32);
  const mat = new THREE.MeshStandardMaterial({
    color:              new THREE.Color(colorHex),
    emissive:           new THREE.Color(colorHex),
    emissiveIntensity:  0.4,
    roughness:          0.5,
    metalness:          0.25,
  });
  const disc = new THREE.Mesh(geo, mat);
  disc.position.y = -0.5;  // at feet
  return disc;
}

// Coloured capsule placeholder — shown before GLB is loaded
function _makePlaceholder(colorHex) {
  const g = new THREE.Group();
  const mat = new THREE.MeshToonMaterial({ color: new THREE.Color(colorHex) });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 8), mat);
  body.position.y = 0.5;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat.clone());
  head.position.y = 1.0;
  g.add(head);
  // Outline
  const oMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  const ob = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.52, 4, 8), oMat);
  ob.position.y = 0.5; g.add(ob);
  const oh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), oMat.clone());
  oh.position.y = 1.0; g.add(oh);
  g.animations = [];
  return g;
}

// ── Render loop ────────────────────────────────────────────────────────────────

function _startLoop() {
  const tick = (now) => {
    _raf = requestAnimationFrame(tick);
    const dt = _lastTick ? (now - _lastTick) / 1000 : 0;
    _lastTick = now;
    for (const e of _tokens.values()) e.mixer?.update(dt);
    _renderer.render(_scene, _camera);
  };
  requestAnimationFrame(tick);
}

export function destroyMiniLayer() {
  if (_raf) cancelAnimationFrame(_raf);
  for (const cn of [..._tokens.keys()]) _removeToken(cn);
  _renderer?.dispose();
  _canvas?.remove();
  _renderer = null; _scene = null; _camera = null; _canvas = null; _lastTick = 0;
}
