// js/miniPreview.js — Live 3D mini preview inside the character builder
// Spins up a tiny Three.js scene inside #cb-mini-canvas-wrap (96×96 px).
// Re-renders whenever race / class / gender changes.

import * as THREE from 'three';
import { assembleModel } from './miniAssembler.js';

// Canvas is sized dynamically to the container; these are the initial defaults
const W = 480, H = 400;

let _renderer = null;
let _scene    = null;
let _camera   = null;
let _mixer    = null;
let _model    = null;
let _lastTick = 0;
let _raf      = null;
let _pending  = false; // true while a model load is in flight

// ── Init ───────────────────────────────────────────────────────────────────────

export function initMiniPreview(wrapEl) {
  if (_renderer) return;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;border-radius:6px;';
  wrapEl.appendChild(canvas);

  // Match physical canvas to the container size
  const cw = wrapEl.clientWidth  || W;
  const ch = wrapEl.clientHeight || H;

  _renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _renderer.setSize(cw, ch, false);
  _renderer.setClearColor(0x111118, 1);   // dark bg so model is visible

  _scene  = new THREE.Scene();

  // Camera frames a 1-unit-tall character: tight FOV, camera centred on torso
  _camera = new THREE.PerspectiveCamera(32, cw / ch, 0.1, 100);
  _camera.position.set(0, 0.55, 2.2);
  _camera.lookAt(0, 0.5, 0);

  // Lighting (matches miniLayer rig)
  _scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xfff8e7, 2.0);
  key.position.set(-1, 3, 2);
  _scene.add(key);
  const rim = new THREE.DirectionalLight(0xb0d0ff, 1.2);
  rim.position.set(1.5, 1.5, -3);
  _scene.add(rim);

  _startLoop();
}

// ── Update (call when race / class / gender changes) ──────────────────────────

export async function updateMiniPreview(pl) {
  if (!_renderer) return;
  if (_pending) return; // debounce: ignore rapid changes while loading
  _pending = true;

  try {
    const model = await assembleModel(pl);

    // Remove previous model
    if (_model) {
      _mixer?.stopAllAction();
      _mixer = null;
      _scene.remove(_model);
      _model.traverse(obj => {
        obj.geometry?.dispose();
        if (obj.material) {
          (Array.isArray(obj.material) ? obj.material : [obj.material])
            .forEach(m => m.dispose());
        }
      });
    }

    _model = model;
    _scene.add(model);

    // Idle animation
    if (model.animations?.length) {
      _mixer = new THREE.AnimationMixer(model);
      const idle = model.animations.find(c => c.name === 'idle') || model.animations[0];
      if (idle) _mixer.clipAction(idle).play();
    }
  } catch (e) {
    console.warn('[MiniPreview] load failed:', e.message);
  } finally {
    _pending = false;
  }
}

// ── Render loop ────────────────────────────────────────────────────────────────

function _startLoop() {
  const tick = (now) => {
    _raf = requestAnimationFrame(tick);
    const dt = _lastTick ? Math.min((now - _lastTick) / 1000, 0.1) : 0;
    _lastTick = now;
    if (_model) {
      _mixer?.update(dt);
      _model.rotation.y += dt * 0.6; // slow auto-spin
    }
    _renderer.render(_scene, _camera);
  };
  requestAnimationFrame(tick);
}

export function destroyMiniPreview() {
  if (_raf) cancelAnimationFrame(_raf);
  _renderer?.dispose();
  _renderer = null; _scene = null; _camera = null; _mixer = null; _model = null;
}
