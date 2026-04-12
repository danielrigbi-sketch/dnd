// js/engine/tokenSystem.js — Token Rendering + Input Handling
// Extracted from mapEngine.js v129 (_rTokens, _rToken, _tokenAt, _updateDashTokenList,
// _md, _mm, _mu, _mw, _ts, _tm, _te, _isMyTurn, _paintObs, _placeTrigger,
// _revealCell, _hideCell, _showTriggerForm)
// Owns: all mouse/touch input routing, drag state, token canvas rendering.
// ─────────────────────────────────────────────────────────────────────────────

import { typeColor } from '../monsters.js';
import { escapeJSString } from '../core/sanitize.js';
import { t } from '../i18n.js';
import { getTileSize, getVisualScale, footprintsOverlap } from './sizeUtils.js';
import { tileDistance, rollDice, parseSpellRangeFt, applyDamageModifiers, getConditionModifiers, contestedCheck, skillMod } from './combatUtils.js';
import { getCombatActions, getAllyActions, getSelfActions, applyMeleeModifier, onKill } from './classAbilities.js';
import { openActionWizard } from './actionWizard.js';
import { SPELL_EFFECTS } from '../../data/spellEffects.js';

const STS_ICON = {
  Poisoned: '☠', Charmed: '♥', Unconscious: '💤', Frightened: '😱',
  Paralyzed: '⚡', Restrained: '⛓', Blinded: '🚫', Prone: '⬇', Stunned: '💫',
  Incapacitated: '🚷', Petrified: '🗿', Deafened: '🔇', Grappled: '🤝',
  Concentrating: '🔮',
};

const ALL_CONDITIONS = ['Poisoned','Charmed','Unconscious','Frightened','Paralyzed','Restrained','Blinded','Prone','Stunned','Incapacitated','Petrified','Deafened','Grappled'];

/** Scale cantrip damage dice by character level (5/11/17 breakpoints). */
function _cantripDice(baseDice, charLevel) {
    const match = baseDice.match(/(\d*)d(\d+)/);
    if (!match) return baseDice;
    const sides = parseInt(match[2]);
    const count = charLevel >= 17 ? 4 : charLevel >= 11 ? 3 : charLevel >= 5 ? 2 : 1;
    return `${count}d${sides}`;
}

// Action menu icon helper — uses PNG icons from public/assets/icons/
function _actIcon(path, size = '14px') {
    return `<img src="/assets/icons/${path}" alt="" style="width:${size};height:${size};vertical-align:middle;margin-inline-end:4px;" class="custom-icon">`;
}

function ck(gx, gy) { return `${Math.floor(gx)}_${Math.floor(gy)}`; }
function cheb(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }

// ── Concentration check (2B) ──────────────────────────────────────────────────
/** Roll CON save when a concentrating target takes damage. DC = max(10, floor(dmg/2)). */
function _checkConcentration(eng, targetCName, target, damage) {
  if (!target.concentrating || damage <= 0) return;
  const dc = Math.max(10, Math.floor(damage / 2));
  const conScore = target._con ?? target.constitution ?? 10;
  const conMod   = target.savingThrows?.constitution ?? Math.floor((conScore - 10) / 2);
  const roll     = Math.floor(Math.random() * 20) + 1;
  const total    = roll + conMod;
  const saved    = total >= dc;
  if (!saved) window.toggleConcentration?.(targetCName, false);
  eng.db?.saveRollToDB({
    type: 'CONCENTRATION', cName: targetCName,
    pName: target.pName || targetCName,
    conRoll: roll, conMod, conTotal: total, dc, saved,
    color: target.pColor || '#9b59b6', ts: Date.now(),
  });
}

// ── Spell upcast extra dice (4D) ──────────────────────────────────────────────
/**
 * Parse extra damage dice from a higher_level text for a given cast level.
 * e.g. "damage increases by 1d6 for each slot level above 1st" at castLevel=5, baseLevel=3
 *   → levelsAbove=2 → "2d6"
 * Returns "" if unparseable or no bonus.
 */
function _upcastExtraDice(higherLevelText, baseLevel, castLevel) {
  if (!higherLevelText || castLevel <= baseLevel) return '';
  const levelsAbove = castLevel - baseLevel;
  const m = higherLevelText.match(/(\d+d\d+)\s+for\s+each\s+(?:slot\s+)?level\s+above/i);
  if (!m) return '';
  const [count, sides] = m[1].split('d').map(Number);
  return `${count * levelsAbove}d${sides}`;
}

// ── Auto-unconscious on 0 HP (4C) ─────────────────────────────────────────────
/** Apply Unconscious status + log when a target drops to 0 HP. */
function _applyUnconscious(eng, targetCName, target, newHp) {
  if (newHp > 0) return;
  const statuses = target.statuses || [];
  if (statuses.includes('Unconscious')) return;
  eng.db?.patchPlayerInDB(targetCName, { statuses: [...statuses, 'Unconscious'] });
  eng.db?.saveRollToDB({
    type: 'FALL', cName: targetCName,
    pName: target.pName || targetCName,
    color: target.pColor || '#e74c3c', ts: Date.now(),
  });
}

// ── Monster action helpers ────────────────────────────────────────────────────
/** Build damage dice string from Open5e action (handles split damage_dice + damage_bonus) */
function _normActionDmg(action) {
  const dice = action?.damage_dice;
  if (!dice) return null;
  const bonus = action.damage_bonus;
  if (!bonus || /[+\-]/.test(dice)) return dice;
  return bonus >= 0 ? `${dice}+${bonus}` : `${dice}${bonus}`;
}
function _isRangedAction(action) {
  return action.attack_type === 'ranged' ||
    (action.desc || '').toLowerCase().includes('ranged weapon') ||
    (action.desc || '').toLowerCase().includes('ranged attack');
}
/** Extract short range (ft) from action description; melee default = 5 */
function _actionRangeFt(action) {
  if (!_isRangedAction(action)) return 5;
  const m = (action.desc || '').match(/range\s+(\d+)/i);
  return m ? parseInt(m[1]) : 60;
}
function _actionEmoji(action) {
  const name = (action.name || '').toLowerCase();
  if (name.includes('bite')) return '🦷';
  if (name.includes('claw') || name.includes('talon')) return '🐾';
  if (name.includes('breath')) return '💨';
  if (name.includes('sting')) return '🦂';
  if (name.includes('tentacle')) return '🐙';
  if (name.includes('tail')) return '🦴';
  if (name.includes('slam') || name.includes('smash')) return '👊';
  if (_isRangedAction(action)) return '🏹';
  return '⚔️';
}

/**
 * Parse multiattack desc into OPTIONS — detects "or" for choice-based multiattack.
 * Returns array of options: [ [action, action], [action, action] ]
 * Each option is a sequence of actions to execute together.
 */
function _parseMultiattack(desc, allActions) {
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, a: 1, an: 1 };
  const _parse = (text) => {
    const res = [];
    const re = /(one|two|three|four|five|a|an)\s+(?:with(?:\s+its)?\s+)?(\w+)/gi;
    let m2;
    while ((m2 = re.exec(text)) !== null) {
      const count = WORDS[m2[1].toLowerCase()] || 1;
      const kw = m2[2].toLowerCase();
      const act = allActions.find(a =>
        a.name?.toLowerCase() !== 'multiattack' && a.attack_bonus != null && a.name?.toLowerCase().includes(kw)
      );
      if (act) for (let i = 0; i < count; i++) res.push(act);
    }
    return res;
  };
  // Detect "or" → split into choices
  if (desc.toLowerCase().includes(' or ')) {
    const parts = desc.split(/\bor\b/i);
    const opts = parts.map(p => _parse(p)).filter(o => o.length > 0);
    if (opts.length > 1) return opts;
  }
  // Single sequence
  const seq = _parse(desc);
  if (!seq.length) {
    return [allActions.filter(a => a.name?.toLowerCase() !== 'multiattack' && a.attack_bonus != null).slice(0, 6)];
  }
  return [seq.slice(0, 6)];
}

/** Extract legendary action cost from name, e.g. "Wing Attack (Costs 2 Actions)" → 2 */
function _legendaryCost(la) {
  const m = (la.name || '').match(/costs?\s+(\d+)\s+action/i);
  return m ? parseInt(m[1]) : 1;
}

export class TokenSystem {
  /** @param {import('./mapEngine.js').MapEngine} engine */
  constructor(engine) {
    this.e = engine;
    this._evs = {};
  }

  // ── Canvas input binding ──────────────────────────────────────────────
  bindInput(canvas) {
    const evs = {
      mousedown:   this._md.bind(this),
      mousemove:   this._mm.bind(this),
      mouseup:     this._mu.bind(this),
      wheel:       this._mw.bind(this),
      contextmenu: e => { e.preventDefault(); this._rightClick(e); },
      touchstart:  this._ts.bind(this),
      touchmove:   this._tm.bind(this),
      touchend:    this._te.bind(this),
    };
    Object.entries(evs).forEach(([ev, fn]) => {
      canvas.addEventListener(ev, fn, { passive: false });
      this._evs[ev] = fn;
    });
  }

  unbindInput(canvas) {
    Object.entries(this._evs).forEach(([ev, fn]) => canvas.removeEventListener(ev, fn));
    this._evs = {};
  }

  // ── Pointer helpers ───────────────────────────────────────────────────
  _cp(e) {
    const r = this.e.cv.getBoundingClientRect();
    const cl = e.touches ? e.touches[0] : e;
    return { sx: cl.clientX - r.left, sy: cl.clientY - r.top };
  }
  _sw(sx, sy) { return { x: (sx - this.e.vx) / this.e.vs, y: (sy - this.e.vy) / this.e.vs }; }
  _wg(wx, wy) {
    const { pps, ox, oy } = this.e.S.cfg;
    return { gx: Math.floor((wx - ox) / pps), gy: Math.floor((wy - oy) / pps) };
  }
  _gw(gx, gy) {
    const { pps, ox, oy } = this.e.S.cfg;
    return { wx: ox + gx * pps, wy: oy + gy * pps };
  }

  tokenAt(wx, wy) {
    const { gx: qx, gy: qy } = this._wg(wx, wy);
    for (const [cn, t] of Object.entries(this.e.S.tokens)) {
      const ts = getTileSize(this.e.S.players[cn]?.size);
      if (qx >= t.gx && qx < t.gx + ts && qy >= t.gy && qy < t.gy + ts) return cn;
    }
    return null;
  }

  _isMyTurn(cn) {
    return cn === this.e.cName && this.e.L.sc[this.e.L.ati]?.name === this.e.cName;
  }

  // ── Mouse events ──────────────────────────────────────────────────────
  _md(e) {
    e.preventDefault();
    const { sx, sy } = this._cp(e);
    const { x: wx, y: wy } = this._sw(sx, sy);
    const { gx, gy } = this._wg(wx, wy);
    const eng = this.e;
    eng.L.mw = { x: wx, y: wy };
    eng.L.ms = { x: sx, y: sy };
    const m = eng.L.mode, isDM = eng.userRole === 'dm';

    // Middle/right = pan
    if (e.button === 1 || e.button === 2) {
      eng.L.pan = { on: true, sx, sy, vx0: eng.vx, vy0: eng.vy };
      return;
    }

    // Placing token
    if (isDM && eng.L.placing) {
      eng.placeToken(eng.L.placing, gx, gy);
      eng.L.placing = null;
      this.updateDashTokenList();
      return;
    }

    if (m === 'ruler') { eng.L.rulerA = { x: wx, y: wy }; eng.L.rulerB = null; eng._dirty(); return; }
    if (m === 'aoe')   { eng.L.rulerA = { x: wx, y: wy }; eng._dirty(); return; }

    // Calibrate: click+drag to define one tile → sets pps + snaps origin
    if (isDM && m === 'calibrate') {
      eng.L.calibAnchor = { x: wx, y: wy };
      eng.L.calibDrag   = null;
      eng._dirty();
      return;
    }

    if (isDM && m === 'obstacle') { eng.L.painting = true; this._paintObs(gx, gy); return; }
    if (isDM && m === 'trigger')  { this._placeTrigger(gx, gy); return; }
    if (isDM && m === 'light')    { this._placeLight(gx, gy); return; }
    if (isDM && (m === 'fogReveal' || m === 'wizFog')) { eng.L.painting = true; eng._revealCell(gx, gy); return; }
    if (isDM && (m === 'fogHide'  || m === 'wizFogHide')) { eng.L.painting = true; eng._hideCell(gx, gy); return; }

    // Token drag — DM can drag any token; players can only drag on their turn
    const tn = this.tokenAt(wx, wy);
    if (tn) {
      const inCombat = eng.L.sc?.length > 0 && eng.L.ati !== null;
      const ok = isDM || (tn === eng.cName && (!inCombat || this._isMyTurn(tn)));
      if (!ok && tn === eng.cName && inCombat && !this._isMyTurn(tn)) {
        eng.bus.emit('ui:toast', { msg: t('toast_not_your_turn'), type: 'warning' });
      }
      if (ok) {
        const tk = eng.S.tokens[tn];
        eng.L.drag = { cName: tn, startGX: tk.gx, startGY: tk.gy, curGX: tk.gx, curGY: tk.gy, path: [[tk.gx, tk.gy]] };
        eng.bus.emit('drag:start', { cName: tn, gx: tk.gx, gy: tk.gy });
        eng._dirty();
        return;
      }
    }

    // E6-C: Click-to-move (player clicks empty floor cell on their turn)
    if (m === 'view' && !isDM && eng.cName) {
      const inCombat = eng.L.sc?.length > 0 && eng.L.ati !== null;
      if (inCombat && !this._isMyTurn(eng.cName)) {
        eng.bus.emit('ui:toast', { msg: t('toast_not_your_turn'), type: 'warning' });
        return;
      }
      const myTk = eng.S.tokens[eng.cName];
      if (myTk && !this.tokenAt(wx, wy)) {
        const { cols = 40, rows = 30 } = eng.S.cfg;
        if (!eng._pf.isReady) eng._pf.setGrid(eng.S.obstacles, cols, rows);
        eng._pf.find(myTk.gx, myTk.gy, gx, gy).then(path => {
          if (!path || path.length < 2) return;
          const fakeDrag = {
            cName: eng.cName,
            startGX: myTk.gx, startGY: myTk.gy,
            curGX: path[path.length - 1][0], curGY: path[path.length - 1][1],
            path,
          };
          eng.L.drag = fakeDrag;
          eng.movement.endDrag();
        });
        return;
      }
    }

    // Default pan
    if (m === 'view' || m === 'calibrate' || m === 'phantom') {
      eng.L.pan = { on: true, sx, sy, vx0: eng.vx, vy0: eng.vy };
    }
  }

  _mm(e) {
    const { sx, sy } = this._cp(e);
    const { x: wx, y: wy } = this._sw(sx, sy);
    const { gx, gy } = this._wg(wx, wy);
    const eng = this.e;
    eng.L.mw = { x: wx, y: wy };
    eng.L.ms = { x: sx, y: sy };
    eng._dirty();

    if (eng.L.pan.on) {
      eng.vx = eng.L.pan.vx0 + (sx - eng.L.pan.sx);
      eng.vy = eng.L.pan.vy0 + (sy - eng.L.pan.sy);
      eng._clampPan();
      eng._dirty();
      return;
    }

    // Update calibration drag endpoint
    if (eng.L.calibAnchor) {
      eng.L.calibDrag = { x: wx, y: wy };
      eng._dirty();
      return;
    }

    if (eng.L.mode === 'ruler' && eng.L.rulerA) { eng.L.rulerB = { x: wx, y: wy }; eng._dirty(); }

    const isDM = eng.userRole === 'dm';
    if (eng.L.painting && isDM) {
      const m = eng.L.mode;
      if (m === 'obstacle')                         this._paintObs(gx, gy);
      if (m === 'fogReveal' || m === 'wizFog')      eng._revealCell(gx, gy);
      if (m === 'fogHide'   || m === 'wizFogHide')  eng._hideCell(gx, gy);
    }

    if (eng.L.drag) {
      const dt = eng.L.drag;
      if (dt.curGX !== gx || dt.curGY !== gy) {
        dt.curGX = gx; dt.curGY = gy;
        dt.path = eng.movement.buildPath(dt.startGX, dt.startGY, gx, gy, dt.cName);
        eng._dirty();
      }
    }
  }

  _mu() {
    const eng = this.e;
    eng.L.pan.on   = false;
    eng.L.painting = false;

    // Finalize calibration: compute pps from dragged distance, snap grid origin
    if (eng.L.calibAnchor && eng.L.calibDrag) {
      const { x: ax, y: ay } = eng.L.calibAnchor;
      const { x: bx, y: by } = eng.L.calibDrag;
      const newPps = Math.max(16, Math.round(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
      // Snap ox/oy so the anchor point falls exactly on a grid intersection
      const newOx  = ((ax % newPps) + newPps) % newPps;
      const newOy  = ((ay % newPps) + newPps) % newPps;
      eng.S.cfg = { ...eng.S.cfg, pps: newPps, ox: newOx, oy: newOy };
      eng.saveGridToFirebase();
      eng.setMode('view');
      // Deactivate calibrate button, activate select button in toolbar
      document.querySelectorAll('.map-tb-btn[data-mode]').forEach(b => b.classList.remove('active'));
      document.querySelector('.map-tb-btn[data-mode="view"]')?.classList.add('active');
      if (typeof window.showToast === 'function') window.showToast(`Grid calibrated: ${newPps}px per tile`, 'success');
    }
    eng.L.calibAnchor = null;
    eng.L.calibDrag   = null;

    if (eng.L.drag) eng.movement.endDrag();
  }

  _mw(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    this.e.zoomBy(factor);
  }

  _ts(e) { e.preventDefault(); this._md({ ...e, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, button: 0 }); }
  _tm(e) { e.preventDefault(); this._mm({ ...e, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }); }
  _te(e) { e.preventDefault(); this._mu(e); }

  // ── Empty tile right-click menu ─────────────────────────────────────
  _showEmptyTileMenu(e, gx, gy, wx, wy) {
    const eng = this.e;
    const isDM = eng.userRole === 'dm';
    const myCName = (isDM && eng._dmRoller?.cName) ? eng._dmRoller.cName : eng.cName;
    const myData = eng.S.players[myCName] || {};
    const distFt = this._calcDistToTile(gx, gy, myCName);

    const popup = document.getElementById('action-popup');
    if (!popup) return;
    const header = document.getElementById('action-popup-header');
    const body = document.getElementById('action-popup-body');

    header.innerHTML = `&#x1F4CD; ${t('tile_move_here') ? t('tile_move_here').split(' ')[0] : 'Tile'} (${gx}, ${gy}) <button class="wiz-close" onclick="this.parentElement.parentElement.style.display='none'">&times;</button>`;

    const actions = [];

    // Move Here (if player's token on map, in movement range)
    const myTok = eng.S.tokens?.[myCName];
    if (myTok && distFt <= (myData.speed || 30)) {
      actions.push({
        label: `${_actIcon('toolbar/hasted.png')} ${t('tile_move_here') || 'Move Here'} (${distFt}ft)`,
        cls: 'utility',
        fn: () => { eng.placeToken(myCName, gx, gy); }
      });
    }

    // AoE spells from spellbook (spells that target areas — Self: cone/radius/line/cube/sphere)
    const spellbook = Object.values(myData.spellbook || {});
    const aoeSpells = spellbook.filter(sp => {
      const range = (sp.range || '').toLowerCase();
      return range.includes('self') && (range.includes('cone') || range.includes('radius') || range.includes('line') || range.includes('cube') || range.includes('sphere'));
    });

    // Summon spells
    const summonSpells = spellbook.filter(sp => {
      const fx = SPELL_EFFECTS[sp.slug];
      return fx?.cat === 'SUMMON';
    });

    if (aoeSpells.length || summonSpells.length) {
      actions.push({ label: `── ${_actIcon('action/wand.png','14px')} ${t('sect_spells')} ──`, cls: 'disabled', fn: null });
    }

    // AoE spells
    aoeSpells.forEach(sp => {
      const fx = SPELL_EFFECTS[sp.slug];
      actions.push({
        label: `${_actIcon(fx?.icon || 'action/wand.png')} ${sp.name}`,
        cls: 'attack',
        fn: () => openActionWizard({
          type: fx?.save ? 'spell_save' : fx?.atk ? 'spell_atk' : 'buff',
          attackerCName: myCName, targetCName: myCName,
          attacker: myData, target: myData,
          eng, action: sp, spellEffect: fx,
          castLevel: sp.level, aoeCenter: { gx, gy }
        })
      });
    });

    // Summon spells
    summonSpells.forEach(sp => {
      const fx = SPELL_EFFECTS[sp.slug];
      actions.push({
        label: `${_actIcon(fx?.icon || 'action/wand.png')} ${sp.name} (summon)`,
        cls: 'attack',
        fn: () => openActionWizard({
          type: 'summon', attackerCName: myCName, targetCName: myCName,
          attacker: myData, target: myData, eng, action: sp,
          spellEffect: fx, castLevel: sp.level
        })
      });
    });

    // DM tools
    if (isDM) {
      actions.push({ label: `── ${_actIcon('toolbar/editor.png','14px')} ${t('sect_dm_tools')} ──`, cls: 'disabled', fn: null });
      actions.push({
        label: `${_actIcon('action/lantern.png')} ${t('tile_place_light') || 'Place Light'}`,
        cls: 'utility',
        fn: () => { eng.setMode('light'); }
      });
    }

    if (!actions.length) return;

    // Render — group into collapsible sections
    const SECTION_KEYS_LOCAL = [`── ${_actIcon('action/wand.png','14px')}`, `── ${_actIcon('toolbar/editor.png','14px')}`];
    const isSH = a => SECTION_KEYS_LOCAL.some(k => a.label?.startsWith(k));

    const groups = [];
    let current = { header: null, items: [] };
    actions.forEach((a, i) => {
      if (isSH(a)) {
        if (current.items.length || current.header) groups.push(current);
        current = { header: { ...a, idx: i }, items: [] };
      } else {
        current.items.push({ ...a, idx: i });
      }
    });
    if (current.items.length || current.header) groups.push(current);

    let html = '';
    groups.forEach(grp => {
      if (!grp.header) {
        grp.items.forEach(a => { html += `<button class="action-btn ${a.cls}" ${a.fn ? `data-idx="${a.idx}"` : 'disabled'}>${a.label}</button>`; });
      } else {
        html += `<details open class="action-section"><summary class="action-section-header">${grp.header.label}</summary><div class="action-section-body">`;
        grp.items.forEach(a => { html += `<button class="action-btn ${a.cls}" ${a.fn ? `data-idx="${a.idx}"` : 'disabled'}>${a.label}</button>`; });
        html += `</div></details>`;
      }
    });

    body.innerHTML = html;
    this._attachActionDelegation(body, (idx) => {
      try { actions[idx].fn?.(); } catch(err) { console.error('[Tile] Action error:', err); }
      popup.style.display = 'none';
    });

    const cc = document.getElementById('map-canvas-container');
    const rect = cc ? cc.getBoundingClientRect() : { left: 0, top: 0 };
    popup.style.left = Math.min(e.clientX - rect.left + 10, (cc?.clientWidth || 600) - 180) + 'px';
    popup.style.top = Math.max(0, e.clientY - rect.top - 20) + 'px';
    popup.style.display = 'block';
    const closeOnOutside = ev => {
      if (!popup.contains(ev.target)) { popup.style.display = 'none'; document.removeEventListener('click', closeOnOutside); }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
  }

  _calcDistToTile(gx, gy, cName) {
    const tok = this.e.S.tokens?.[cName];
    if (!tok) return Infinity;
    return Math.max(Math.abs(tok.gx - gx), Math.abs(tok.gy - gy)) * 5;
  }

  // ── Right-click context action menu ───────────────────────────────────
  _rightClick(e) {
    const { sx, sy } = this._cp(e);
    const { x: wx, y: wy } = this._sw(sx, sy);
    const eng = this.e;
    const targetCName = this.tokenAt(wx, wy);
    if (!targetCName) {
      // Empty tile right-click — show tile action menu
      const { gx, gy } = this._wg(wx, wy);
      this._showEmptyTileMenu(e, gx, gy, wx, wy);
      return;
    }

    const isDM = eng.userRole === 'dm';
    // When DM is impersonating a monster, use that as the attacker
    const myCName = (isDM && eng._dmRoller?.cName) ? eng._dmRoller.cName : eng.cName;

    // Self right-click — show self abilities popup
    if (!isDM && targetCName === myCName) {
      const selfPlayer = eng.S.players[myCName] || {};
      const selfActions = getSelfActions(selfPlayer);
      if (!selfActions.length) return;

      const popup = document.getElementById('action-popup');
      if (!popup) return;
      document.getElementById('action-popup-header').innerHTML = `<span>${_actIcon('toolbar/character.png','16px')} ${myCName}</span>`;
      // ── Standard D&D 5e Actions ──
      selfActions.push({ label: `── ${_actIcon('action/melee.png','14px')} ${t('sect_attacks')} ──`, cls: 'disabled', available: false, fn: null });
      selfActions.push({ label: `${_actIcon('action/wand.png')} ${t('act_cast_spell')}`, cls: 'utility', available: true,
          fn: (cn) => window.openSpellPanel?.()
      });
      selfActions.push({ label: `${_actIcon('toolbar/hasted.png')} ${t('act_dash')}`, cls: 'utility', available: true,
          fn: (cn, eng) => { eng.db?.patchPlayerInDB(cn, { dashUsed: true }); eng.db?.saveRollToDB({ cName: cn, type: 'STATUS', status: `${t('act_dash')}`, ts: Date.now() }); }
      });
      selfActions.push({ label: `${_actIcon('action/hide.png')} ${t('act_disengage')}`, cls: 'utility', available: true,
          fn: (cn, eng) => { eng.db?.patchPlayerInDB(cn, { disengaged: true }); eng.db?.saveRollToDB({ cName: cn, type: 'STATUS', status: `${t('act_disengage')}`, ts: Date.now() }); }
      });
      selfActions.push({ label: `${_actIcon('action/shield.png')} ${t('act_dodge')}`, cls: 'utility', available: true,
          fn: (cn, eng) => { eng.db?.patchPlayerInDB(cn, { dodging: true }); eng.db?.saveRollToDB({ cName: cn, type: 'STATUS', status: `${t('act_dodge')}`, ts: Date.now() }); }
      });
      selfActions.push({ label: `${_actIcon('toolbar/party.png')} ${t('act_help')}`, cls: 'utility', available: true,
          fn: (cn, eng) => { eng.db?.saveRollToDB({ cName: cn, type: 'STATUS', status: `${t('act_help')}`, ts: Date.now() }); }
      });
      selfActions.push({ label: `${_actIcon('action/hide.png')} ${t('act_hide')}`, cls: 'utility', available: true,
          fn: (cn) => window.rollSkillCheck?.(cn, 'Stealth')
      });
      selfActions.push({ label: `${_actIcon('toolbar/initiative.png')} ${t('act_ready')}`, cls: 'utility', available: true,
          fn: (cn, eng) => { eng.db?.saveRollToDB({ cName: cn, type: 'STATUS', status: `${t('act_ready')}`, ts: Date.now() }); }
      });
      selfActions.push({ label: `${_actIcon('action/reveal.png')} ${t('act_search')}`, cls: 'utility', available: true,
          fn: (cn) => window.rollSkillCheck?.(cn, 'Perception')
      });
      selfActions.push({ label: `${_actIcon('toolbar/dice.png')} ${t('act_use_object')}`, cls: 'utility', available: true,
          fn: (cn, eng) => { eng.db?.saveRollToDB({ cName: cn, type: 'STATUS', status: `${t('act_use_object')}`, ts: Date.now() }); }
      });
      // ── Self-target cantrip spells from spellbook ──
      const selfSpells = Object.values(selfPlayer.spellbook || {}).filter(sp => {
          if (sp.level !== 0 && sp.level_int !== 0) return false; // cantrips only for now
          const fx2 = SPELL_EFFECTS[sp.slug];
          if (!fx2) return false;
          return fx2.target === 'self' || fx2.cat === 'UTILITY' || fx2.cat === 'LIGHT';
      });
      if (selfSpells.length) {
          selfActions.push({ label: `── ${_actIcon('action/wand.png','14px')} ${t('sect_spells')} ──`, cls: 'disabled', available: false, fn: null });
          selfSpells.forEach(sp => {
              const fx2 = SPELL_EFFECTS[sp.slug] || {};
              selfActions.push({
                  label: `${_actIcon(fx2.icon || 'action/wand.png')} ${sp.name}`,
                  cls: 'attack', available: true,
                  fn: (cn, eng2) => eng2.tokens._doCastSpell(cn, cn, sp, 0)
              });
          });
      }
      // ── Skill Checks section ──
      selfActions.push({ label: `── ${_actIcon('toolbar/dice.png','14px')} ${t('sect_checks')} ──`, cls: 'disabled', available: false, fn: null });
      ['Athletics','Acrobatics','Stealth','Perception','Insight','Intimidation','Persuasion','Deception','Investigation','Medicine','Sleight of Hand','Survival','Nature','Arcana','History','Religion','Performance','Animal Handling'].forEach(skill => {
          const key = 'check_' + skill.toLowerCase().replace(/\s+/g, '_');
          selfActions.push({ label: `${_actIcon('toolbar/dice.png')} ${t(key) || skill}`, cls: 'utility', available: true,
              fn: (cn) => window.rollSkillCheck?.(cn, skill) });
      });
      const body = document.getElementById('action-popup-body');
      // Note: innerHTML used with safe i18n labels only, no user-generated content
      body.innerHTML = selfActions.map((a, i) =>
        `<button class="action-btn ${a.cls}" ${a.available && a.fn ? `data-idx="${i}"` : 'disabled'}>${a.label}</button>`
      ).join('');
      this._attachActionDelegation(body, (idx) => {
        try { selfActions[idx].fn?.(myCName, eng); } catch(e) { console.error('[VC] Self action error:', e); }
        popup.style.display = 'none';
      });
      const cc = document.getElementById('map-canvas-container');
      const rect = cc ? cc.getBoundingClientRect() : { left: 0, top: 0 };
      popup.style.left = Math.min(e.clientX - rect.left + 10, (cc?.clientWidth || 600) - 180) + 'px';
      popup.style.top  = Math.max(0, e.clientY - rect.top - 20) + 'px';
      popup.style.display = 'block';
      const closeOnOutside = ev => {
        if (!popup.contains(ev.target)) { popup.style.display = 'none'; document.removeEventListener('click', closeOnOutside); }
      };
      setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
      return;
    }

    const attTk  = myCName ? eng.S.tokens[myCName] : null;
    const tarTk  = eng.S.tokens[targetCName];
    if (!tarTk) return;

    const dist   = attTk ? tileDistance(attTk, tarTk) : Infinity;
    const distFt = dist * 5;
    const attacker = eng.S.players[myCName] || {};
    const target   = eng.S.players[targetCName] || {};

    const targetFaction = target.faction || (target.userRole === 'npc' ? 'foe' : 'ally');
    const attackerFaction = attacker.faction || (attacker.userRole === 'npc' ? 'foe' : 'ally');
    const isFoe = targetFaction !== attackerFaction && targetFaction !== 'neutral';
    const isAlly = targetFaction === attackerFaction;
    const isNeutral = targetFaction === 'neutral';

    const popup = document.getElementById('action-popup');
    if (!popup) return;
    const header = document.getElementById('action-popup-header');
    const body   = document.getElementById('action-popup-body');

    const fromLabel = myCName || 'DM';
    const factionEmoji = { ally: '🟢', neutral: '🟡', foe: '🔴' }[targetFaction] || '';
    header.innerHTML = `<span>${factionEmoji} ${fromLabel} → ${targetCName}</span><span class="action-dist-badge">${distFt === Infinity ? '?' : distFt} ft</span>`;

    const actions = [];
    const rangedRangeFt = attacker.rangedRange || 80; // ft, default shortbow

    if (!isDM || attTk) {
      // ── NPC/Monster: per-action buttons from Open5e data ─────────────────
      const npcActions = (attacker.actions || []).filter(a =>
        a.attack_bonus != null || _normActionDmg(a)
      );

      if (npcActions.length > 0) {
        // ── Multiattack button (if present) ────────────────────────────────
        const multiattackAction = (attacker.actions || []).find(a => a.name?.toLowerCase() === 'multiattack');
        if (multiattackAction) {
          const options = _parseMultiattack(multiattackAction.desc || '', attacker.actions || []);
          if (options.length > 1) {
            // Multiple choices (e.g., "1 glaive + 1 gore OR 2 shortbow")
            options.forEach((opt, oi) => {
              const names = opt.map(a => a.name).join(' + ');
              actions.push({
                label: `⚔️⚔️ Multiattack ${oi + 1}: ${names}`,
                cls: 'attack multiattack',
                fn: async () => {
                  for (const act of opt) {
                    await openActionWizard({ type: 'monster', attackerCName: myCName, targetCName, attacker, target, eng, action: act, distFt });
                  }
                },
              });
            });
          } else if (options[0]?.length > 1) {
            // Single sequence (e.g., "2 claw + 1 bite")
            const seq = options[0];
            actions.push({
              label: `⚔️⚔️ Multiattack (${seq.length}x)`,
              cls: 'attack multiattack',
              fn: async () => {
                for (const act of seq) {
                  await openActionWizard({ type: 'monster', attackerCName: myCName, targetCName, attacker, target, eng, action: act, distFt });
                }
              },
            });
          }
          if (actions.length) actions.push({ label: `── ${_actIcon('action/melee.png','14px')} ${t('sect_attacks')} ──`, cls: 'disabled', fn: null });
        }

        npcActions.forEach(action => {
          const isRanged  = _isRangedAction(action);
          const rangeFt   = _actionRangeFt(action);
          const dmg       = _normActionDmg(action);
          const emoji     = _actionEmoji(action);
          const inRange   = distFt <= rangeFt;
          const pointBlank = isRanged && dist <= 1;
          const dmgLabel  = dmg ? ` (${dmg})` : '';
          const label     = `${emoji} ${action.name}${dmgLabel}`;

          if (action.attack_bonus != null && !inRange) {
            const limitLabel = isRanged
              ? `${emoji} ${action.name} — out of range (${distFt}/${rangeFt}ft)`
              : `${emoji} ${action.name} — out of reach (${distFt}ft)`;
            actions.push({ label: limitLabel, cls: 'disabled', fn: null });
          } else {
            actions.push({
              label: pointBlank ? label + ' ⚠️ Disadv' : label,
              cls: 'attack',
              fn: () => openActionWizard({ type: 'monster', attackerCName: myCName, targetCName, attacker, target, eng, action, distFt }),
            });
          }
        });

        // ── Bonus Actions ──────────────────────────────────────────────────
        const bonusActions = (attacker.bonusActions || []).filter(a => a.attack_bonus != null || _normActionDmg(a));
        if (bonusActions.length) {
          const bonusUsed = attacker.bonusActionUsed || false;
          actions.push({ label: `── ⚡ Bonus${bonusUsed ? ' (used)' : ''} ──`, cls: 'disabled', fn: null });
          bonusActions.forEach(ba => {
            const rangeFt   = _actionRangeFt(ba);
            const inRange   = distFt <= rangeFt;
            const dmg       = _normActionDmg(ba);
            const dmgLabel  = dmg ? ` (${dmg})` : '';
            const unavail   = bonusUsed || !inRange;
            actions.push({
              label: `⚡ ${ba.name}${dmgLabel}${!inRange ? ' (out of range)' : ''}`,
              cls: unavail ? 'disabled' : 'attack bonus',
              fn: unavail ? null : () => {
                openActionWizard({ type: 'monster', attackerCName: myCName, targetCName, attacker, target, eng, action: ba, distFt });
                eng.db?.patchPlayerInDB(myCName, { bonusActionUsed: true });
              },
            });
          });
        }

        // ── Legendary Actions (DM only) ────────────────────────────────────
        const legMax = attacker.legendaryMax || 0;
        const legActions = attacker.legendaryActions || [];
        if (isDM && legMax > 0 && legActions.length) {
          const legUsed = attacker.legendaryUsed || 0;
          const legLeft = legMax - legUsed;
          actions.push({ label: `── 👑 Legendary (${legLeft}/${legMax}) ──`, cls: 'disabled', fn: null });
          legActions.forEach(la => {
            const cost    = _legendaryCost(la);
            const canUse  = legLeft >= cost;
            const dmg     = _normActionDmg(la);
            const dmgLabel = dmg ? ` (${dmg})` : '';
            actions.push({
              label: `👑 ${la.name}${dmgLabel}${cost > 1 ? ` ×${cost}` : ''}`,
              cls: canUse ? 'attack legendary' : 'disabled',
              fn: canUse ? () => {
                const cost = _legendaryCost(la);
                const newUsed = (attacker.legendaryUsed || 0) + cost;
                eng.db?.patchPlayerInDB(myCName, { legendaryUsed: newUsed });
                if (la.attack_bonus != null || _normActionDmg(la)) {
                  openActionWizard({ type: 'monster', attackerCName: myCName, targetCName, attacker, target, eng, action: la, distFt });
                } else {
                  eng.db?.saveRollToDB({ type: 'STATUS', cName: myCName, status: `👑 ${attacker.pName || myCName} uses legendary action: ${la.name}`, ts: Date.now() });
                }
              } : null,
            });
          });
        }

        // Special abilities — info only
        const specials = attacker.specialAbilities || [];
        if (specials.length) {
          actions.push({ label: '── ✨ Traits ──', cls: 'disabled', fn: null });
          specials.slice(0, 4).forEach(sa => {
            actions.push({ label: `✨ ${sa.name}`, cls: 'ability info', fn: null });
          });
        }

      } else {
        // ── Player character fallback: generic melee / ranged ───────────────
        if (dist <= 1) {
          actions.push({ label: '⚔️ Melee Attack', cls: 'attack',
            fn: () => openActionWizard({ type: 'melee', attackerCName: myCName, targetCName, attacker, target, eng, distFt }) });
        } else {
          actions.push({ label: `⚔️ Out of melee reach (${distFt} ft)`, cls: 'disabled', fn: null });
        }

        if (dist <= 1 && isFoe) {
          // Grapple
          actions.push({ label: `${_actIcon('toolbar/grappled.png')} ${t('act_grapple')}`, cls: 'attack',
              fn: () => openActionWizard({ type: 'contested', contestType: 'grapple', attackerCName: myCName, targetCName, attacker, target, eng })
          });
          // Shove
          actions.push({ label: `${_actIcon('action/wind.png')} ${t('act_shove')}`, cls: 'attack',
              fn: () => openActionWizard({ type: 'contested', contestType: 'shove', attackerCName: myCName, targetCName, attacker, target, eng })
          });
        }

        const hasRanged = !!(attacker.rangedDmg && attacker.rangedDmg !== '0');
        if (hasRanged) {
          if (distFt <= rangedRangeFt) {
            const pointBlank = dist <= 1;
            actions.push({
              label: pointBlank ? `🏹 Ranged Attack ⚠️ Disadv` : `🏹 Ranged Attack`,
              cls: 'attack',
              fn: () => openActionWizard({ type: 'ranged', attackerCName: myCName, targetCName, attacker, target, eng, distFt }),
            });
          } else {
            actions.push({ label: `🏹 Out of range (${distFt}/${rangedRangeFt} ft)`, cls: 'disabled', fn: null });
          }
        }
      }
    }

    // Spell actions from spellbook
    const spellbook = attacker.spellbook ? Object.values(attacker.spellbook) : [];
    if (spellbook.length && attTk) {
      const slots = attacker.spellSlots || {};
      const usedSlots = slots.used || {};
      const maxSlots  = slots.max  || {};

      const castableSpells = spellbook
        .filter(sp => {
          const rangeFt = parseSpellRangeFt(sp.range);
          if (rangeFt !== 9999 && rangeFt !== 0 && distFt > rangeFt) return false;
          if (sp.level === 0) return true; // cantrips always available
          // Show if ANY slot at or above the spell's level has charges
          for (let lv = sp.level; lv <= 9; lv++) {
            if ((maxSlots[lv] || 0) - (usedSlots[lv] || 0) > 0) return true;
          }
          return false;
        })
        .sort((a, b) => (a.level || 0) - (b.level || 0))
        .slice(0, 5);

      if (castableSpells.length) {
        if (actions.length) actions.push({ label: '── 🔮 Spells ──', cls: 'disabled', fn: null });
        castableSpells.forEach(sp => {
          const lvlTag = sp.level === 0 ? 'Cantrip' : `Lv${sp.level}`;
          // Show slot count for leveled spells
          let slotInfo = '';
          if (sp.level > 0) {
            const remaining = (maxSlots[sp.level] || 0) - (usedSlots[sp.level] || 0);
            const maxSl = maxSlots[sp.level] || 0;
            if (maxSl > 0) slotInfo = ` (${remaining}/${maxSl})`;
          }
          const _spFx = SPELL_EFFECTS[sp.slug];
          const _spType = _spFx?.cat === 'HEAL' ? 'heal'
            : _spFx?.cat === 'HEAL_STABILIZE' ? 'heal'
            : _spFx?.cat === 'TEMP_HP' ? 'temp_hp'
            : _spFx?.cat === 'SPECIAL' ? 'special'
            : _spFx?.cat === 'DETECT' ? 'detect'
            : _spFx?.cat === 'BUFF' ? 'buff'
            : _spFx?.cat === 'SUMMON' ? 'summon'
            : (sp.attack_type || _spFx?.atk) ? 'spell_atk'
            : (sp.dc_type || _spFx?.save) ? 'spell_save'
            : _spFx?.cat === 'CONDITION' ? 'spell_save'
            : _spFx?.cat === 'DEBUFF' ? 'spell_save'
            : null;
          actions.push({ label: `🔮 ${sp.name} (${lvlTag})${slotInfo}`, cls: 'attack',
            fn: _spType
              ? () => openActionWizard({ type: _spType, attackerCName: myCName, targetCName, attacker, target, eng, action: sp, spellEffect: _spFx, castLevel: sp.level, distFt })
              : () => this._doCastSpell(myCName, targetCName, sp, sp.level) });
          // Upcast buttons — for leveled spells with higher_level text
          if (sp.level > 0 && (sp.higher_level || _spFx?.upcastDice || _spFx?.upcastMissiles)) {
            let shown = 0;
            for (let lv = sp.level + 1; lv <= 9 && shown < 2; lv++) {
              const rem = (maxSlots[lv] || 0) - (usedSlots[lv] || 0);
              if (rem > 0) {
                const castLv = lv;
                actions.push({ label: `  ↑ ${sp.name} Lv${castLv} (${rem}/${maxSlots[castLv]||0})`, cls: 'attack',
                  fn: _spType
                    ? () => openActionWizard({ type: _spType, attackerCName: myCName, targetCName, attacker, target, eng, action: sp, spellEffect: _spFx, castLevel: castLv, distFt })
                    : () => this._doCastSpell(myCName, targetCName, sp, castLv) });
                shown++;
              }
            }
          }
        });
      }
    }

    // ── Class-specific combat actions (vs enemy) ──────────────────────────
    if (myCName && !isDM) {
      const isAlly = !!eng.S.players[targetCName] && target.role !== 'npc';
      if (isAlly) {
        // Ally targeting: Bardic Inspiration etc.
        const allyExtras = getAllyActions(attacker, target);
        if (allyExtras.length) {
          if (actions.length) actions.push({ label: '── 🤝 Ally ──', cls: 'disabled', fn: null });
          allyExtras.forEach(a => actions.push({
            label: a.label, cls: a.available ? a.cls : 'disabled', fn: a.available ? () => a.fn(myCName, targetCName, eng) : null,
          }));
        }
        // Help action (adjacent ally)
        if (dist <= 1) {
          actions.push({
            label: `${_actIcon('toolbar/party.png')} ${t('act_help')}`,
            cls: 'utility',
            fn: () => {
              eng.db?.patchPlayerInDB(targetCName, { helpedBy: myCName });
              eng.db?.saveRollToDB({ cName: myCName, type: 'STATUS',
                status: `${myCName} ${t('act_help')} → ${targetCName}`, ts: Date.now() });
            }
          });
        }
      } else {
        // Enemy targeting: class combat abilities
        const combatExtras = getCombatActions(attacker, target, distFt, myCName);
        if (combatExtras.length) {
          if (actions.length) actions.push({ label: '── ⚔ Class ──', cls: 'disabled', fn: null });
          combatExtras.forEach(a => actions.push({
            label: a.label, cls: a.available ? a.cls : 'disabled', fn: a.available ? () => a.fn(myCName, targetCName, eng) : null,
          }));
        }
      }
    }

    // ── Skill checks vs target ──
    if (myCName && attTk) {
        const checkActions = [];
        if (isFoe || isNeutral) {
            checkActions.push({ skill: 'Insight', icon: 'toolbar/concentrating.png' });
            checkActions.push({ skill: 'Intimidation', icon: 'toolbar/frightened.png' });
            if (dist <= 1) checkActions.push({ skill: 'Sleight of Hand', icon: 'action/dagger.png' });
        }
        if (isAlly || isNeutral) {
            checkActions.push({ skill: 'Persuasion', icon: 'toolbar/npc.png' });
            checkActions.push({ skill: 'Medicine', icon: 'action/heal.png' });
            if (target.hp <= 0 && dist <= 1) {
                // Medicine: Stabilize dying ally
                checkActions.push({ skill: '_stabilize', icon: 'action/heal.png' });
            }
        }
        checkActions.push({ skill: 'Perception', icon: 'action/reveal.png' });

        if (checkActions.length) {
            actions.push({ label: `── ${_actIcon('toolbar/dice.png','14px')} ${t('sect_checks')} ──`, cls: 'disabled', fn: null });
            checkActions.forEach(({ skill, icon }) => {
                if (skill === '_stabilize') {
                    actions.push({
                        label: `${_actIcon(icon)} ${t('act_medicine_stabilize')}`,
                        cls: 'heal',
                        fn: () => {
                            const mod = skillMod('Medicine', attacker);
                            const roll = Math.floor(Math.random() * 20) + 1;
                            const success = (roll + mod) >= 10;
                            if (success) {
                                const saves = target.deathSaves || {};
                                saves.stable = true;
                                eng.db?.updateDeathSavesInDB?.(targetCName, saves);
                            }
                            eng.db?.saveRollToDB({ cName: myCName, type: 'SKILL', skillName: 'Medicine',
                                mod, res: roll, total: roll + mod,
                                flavor: `${t('act_medicine_stabilize')} DC 10: ${roll}+${mod}=${roll+mod} ${success ? '✓' : '✗'}`,
                                ts: Date.now() });
                        }
                    });
                } else {
                    const key = 'check_' + skill.toLowerCase().replace(/\s+/g, '_');
                    actions.push({
                        label: `${_actIcon(icon)} ${t(key) || skill}`,
                        cls: 'utility',
                        fn: () => window.rollSkillCheck?.(myCName, skill)
                    });
                }
            });
        }
    }

    if (isDM) {
      // ── Act As (impersonate) ────────────────────────────────────
      const isImpersonating = eng._dmRoller?.cName === targetCName;
      actions.push({
        label: isImpersonating
          ? `${_actIcon('toolbar/character.png')} ${t('act_stop_impersonate') || 'Stop Acting As'}`
          : `${_actIcon('toolbar/character.png')} ${t('act_impersonate') || 'Act As'} ${targetCName}`,
        cls: 'utility',
        fn: () => isImpersonating ? window.resetRoller?.() : window.impersonate?.(targetCName)
      });
      actions.push({ label: '🩹 Heal (1d4)', cls: 'heal', fn: () => {
        const roll = Math.floor(Math.random() * 4) + 1;
        const newHp = Math.min(target.maxHp || 999, (target.hp || 0) + roll);
        eng.db?.updatePlayerHPInDB(targetCName, newHp);
        eng.db?.saveRollToDB({ cName: targetCName, type: 'HEAL', res: roll, newHp,
          color: '#2ecc71', flavor: `DM heals ${targetCName} for ${roll} HP`, ts: Date.now() });
      }});
      // ── Faction toggle (DM only) ────────────────────────────────
      const curFaction = target.faction || 'foe';
      const nextFaction = curFaction === 'ally' ? 'neutral' : curFaction === 'neutral' ? 'foe' : 'ally';
      const factionEmoji = { ally: '🟢', neutral: '🟡', foe: '🔴' };
      actions.push({
        label: `${factionEmoji[curFaction]} Faction: ${curFaction} → ${factionEmoji[nextFaction]} ${nextFaction}`,
        cls: 'utility',
        fn: () => eng.db?.setFaction(targetCName, nextFaction)
      });

      // ── Conditions quick-toggle (DM only) ───────────────────────
      actions.push({ label: '── ⚠ Conditions ──', cls: 'disabled', fn: null });
      const curStatuses = target.statuses || [];
      ALL_CONDITIONS.forEach(cond => {
        const has = curStatuses.includes(cond);
        const icon = STS_ICON[cond] || '⚠';
        actions.push({
          label: `${icon} ${has ? '✓ ' : ''}${cond}`,
          cls: has ? 'utility active' : 'utility',
          fn: () => {
            if (has) eng.db?.removeStatus(targetCName, cond);
            else eng.db?.addStatus(targetCName, cond);
          }
        });
      });
    }

    if (!actions.length) return;

    // Group actions into sections for collapsible display
    const SECTION_KEYS = [`── ${_actIcon('action/melee.png','14px')}`, '── ⚔', '── ⚡ Bonus', '── 👑 Legendary', '── 🔮 Spells ──', '── ✨ Traits ──', '── 🤝 Ally ──', '── ⚠ Conditions', `── ${_actIcon('toolbar/dice.png','14px')}`];
    const isSectionHeader = a => SECTION_KEYS.some(k => a.label.startsWith(k));

    // Split actions into groups
    const groups = [];
    let current = { header: null, items: [] };
    actions.forEach((a, i) => {
      if (isSectionHeader(a)) {
        if (current.items.length || current.header) groups.push(current);
        current = { header: { ...a, idx: i }, items: [] };
      } else {
        current.items.push({ ...a, idx: i });
      }
    });
    if (current.items.length || current.header) groups.push(current);

    let html = '';
    groups.forEach(grp => {
      if (!grp.header) {
        // Top-level actions (no section header) — always visible
        grp.items.forEach(a => {
          html += `<button class="action-btn ${a.cls}" ${a.fn ? `data-idx="${a.idx}"` : 'disabled'}>${a.label}</button>`;
        });
      } else {
        // Section with header — use <details> for collapsible
        const isSpells = grp.header.label.includes('🔮 Spells');
        const isBonus  = grp.header.label.includes('⚡ Bonus');
        const isLeg    = grp.header.label.includes('👑 Legendary');
        const isOpen   = isSpells || isBonus || isLeg; // open these by default
        html += `<details${isOpen ? ' open' : ''} class="action-section">
          <summary class="action-section-header">${grp.header.label}</summary>
          <div class="action-section-body">`;
        grp.items.forEach(a => {
          html += `<button class="action-btn ${a.cls}" ${a.fn ? `data-idx="${a.idx}"` : 'disabled'}>${a.label}</button>`;
        });
        html += `</div></details>`;
      }
    });

    body.innerHTML = html;
    this._attachActionDelegation(body, (idx) => {
      try { actions[idx].fn?.(); } catch(e) { console.error('[VC] Action error:', e); }
      popup.style.display = 'none';
    });

    const cc = document.getElementById('map-canvas-container');
    const rect = cc ? cc.getBoundingClientRect() : { left: 0, top: 0 };
    const px = e.clientX - rect.left + 10;
    const py = e.clientY - rect.top  - 20;
    popup.style.left = Math.min(px, (cc?.clientWidth || 600) - 180) + 'px';
    popup.style.top  = Math.max(0, py) + 'px';
    popup.style.display = 'block';

    // Close on next outside click
    const closeOnOutside = ev => {
      if (!popup.contains(ev.target)) { popup.style.display = 'none'; document.removeEventListener('click', closeOnOutside); }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
  }

  _attachActionDelegation(container, callback) {
    if (container._actionDelegate) {
      container.removeEventListener('click', container._actionDelegate);
    }
    container._actionDelegate = (e) => {
      const btn = e.target.closest('.action-btn[data-idx]');
      if (!btn) return;
      callback(parseInt(btn.dataset.idx));
    };
    container.addEventListener('click', container._actionDelegate);
  }

  _doMeleeAttack(attackerCName, targetCName) {
    const eng = this.e;
    const attacker = eng.S.players[attackerCName] || {};
    const target   = eng.S.players[targetCName]   || {};
    const bonus    = attacker.melee ?? 0;
    const ac       = target._resolved?.ac ?? target.ac ?? 10;

    // Condition modifiers + global adv/dis mode
    const atkTok = eng.S.tokens[attackerCName], tarTok = eng.S.tokens[targetCName];
    const distFt = tileDistance(atkTok || {}, tarTok || {}) * 5;
    const conds = getConditionModifiers(attacker, target, true, distFt);
    const globalMode = window.getCombatMode?.() || 'normal';
    const useAdv = conds.advantage  || globalMode === 'adv';
    const useDis = conds.disadvantage || globalMode === 'dis';
    const finalAdv = useAdv && !useDis, finalDis = useDis && !useAdv;
    window.setMode?.('normal');

    const r1 = Math.floor(Math.random() * 20) + 1;
    const r2 = (finalAdv || finalDis) ? Math.floor(Math.random() * 20) + 1 : r1;
    const rawRoll = conds.autoCrit ? 20 : (finalAdv ? Math.max(r1, r2) : finalDis ? Math.min(r1, r2) : r1);
    const total    = rawRoll + bonus;
    const critThreshold = attacker._resolved?.critThreshold ?? 20;
    const crit     = rawRoll >= critThreshold || conds.autoCrit ||
                     (attacker._resolved?.tags?.has('assassinate') && target.surprised);
    const miss     = rawRoll === 1 && !conds.autoCrit;
    const hit      = crit || (!miss && total >= ac);
    const condNote = conds.reasons.length ? ` (${conds.reasons.join(', ')})` : '';

    // Bardic Inspiration: +1d6 to attack roll
    let bardicBonus = 0;
    if ((attacker.classResources?.bardicInspoBonus) && hit) {
      bardicBonus = rollDice('1d6').total;
      // Clear the flag
      window.patchClassResources?.(attackerCName, { bardicInspoBonus: false });
    }

    const dmgDice  = attacker.meleeDmg || '1d6';
    let damage = 0;
    let bonusDmgNote = '';
    if (hit) {
      const { total: dmgTotal } = rollDice(dmgDice, crit);
      let baseDmg = Math.max(1, dmgTotal);
      // Class passive modifier (Rage +2 etc.)
      baseDmg = applyMeleeModifier(attacker, baseDmg);

      // Hunter's Mark bonus
      const cr = attacker.classResources || {};
      if (cr.huntersMark === targetCName) {
        const { total: markDmg } = rollDice('1d6', crit);
        baseDmg += markDmg;
        bonusDmgNote = ` +${markDmg} mark`;
      }
      // Hex bonus
      if (cr.hexTarget === targetCName) {
        const { total: hexDmg } = rollDice('1d6', crit);
        baseDmg += hexDmg;
        bonusDmgNote += ` +${hexDmg} necrotic`;
      }

      damage = baseDmg;
      const newHp = Math.max(0, (target.hp ?? target.maxHp ?? 0) - damage);
      eng.db?.updatePlayerHPInDB(targetCName, newHp);
      _checkConcentration(eng, targetCName, target, damage);
      _applyUnconscious(eng, targetCName, target, newHp);
      if (newHp <= 0) onKill(attackerCName, targetCName, eng);
    }

    eng.db?.saveRollToDB({
      type: 'ATTACK', cName: attackerCName, pName: attacker.pName || attackerCName,
      target: targetCName, rawRoll, total: total + bardicBonus, ac, hit, crit, miss,
      advantage: finalAdv, disadvantage: finalDis, condNote,
      damage: hit ? damage : 0, dmgDice: dmgDice + bonusDmgNote,
      color: attacker.pColor || '#e74c3c', ts: Date.now(),
    });

    // Visual animation
    if (tarTok) eng.anim?.trigger(crit ? 'MELEE_CRIT' : hit ? 'MELEE_HIT' : 'MELEE_MISS', atkTok, tarTok);
  }

  _doRangedAttack(attackerCName, targetCName, pointBlankDis = false) {
    const eng = this.e;
    const attacker = eng.S.players[attackerCName] || {};
    const target   = eng.S.players[targetCName]   || {};
    const bonus    = attacker.ranged ?? 0;
    const ac       = target._resolved?.ac ?? target.ac ?? 10;

    // Condition modifiers + global adv/dis + point-blank disadvantage
    const atkTok2 = eng.S.tokens[attackerCName], tarTok2 = eng.S.tokens[targetCName];
    const distFt2 = tileDistance(atkTok2 || {}, tarTok2 || {}) * 5;
    const conds2 = getConditionModifiers(attacker, target, false, distFt2);
    const globalMode2 = window.getCombatMode?.() || 'normal';
    const useAdv2 = conds2.advantage  || globalMode2 === 'adv';
    const useDis2 = conds2.disadvantage || globalMode2 === 'dis' || pointBlankDis;
    const finalAdv2 = useAdv2 && !useDis2, finalDis2 = useDis2 && !useAdv2;
    window.setMode?.('normal');

    const r1 = Math.floor(Math.random() * 20) + 1;
    const r2 = (finalAdv2 || finalDis2) ? Math.floor(Math.random() * 20) + 1 : r1;
    const rawRoll = finalAdv2 ? Math.max(r1, r2) : finalDis2 ? Math.min(r1, r2) : r1;
    const total   = rawRoll + bonus;
    const critThreshold2 = attacker._resolved?.critThreshold ?? 20;
    const crit    = rawRoll >= critThreshold2 ||
                    (attacker._resolved?.tags?.has('assassinate') && target.surprised);
    const miss    = rawRoll === 1;
    const hit     = crit || (!miss && total >= ac);
    const condNote2 = conds2.reasons.length ? ` (${conds2.reasons.join(', ')})` : '';

    const dmgDice = attacker.rangedDmg || '1d6';
    let damage = 0;
    let rBonusDmgNote = '';
    if (hit) {
      const { total: dmgTotal } = rollDice(dmgDice, crit);
      let baseDmg = Math.max(1, dmgTotal);

      // Hunter's Mark / Hex bonus on ranged attacks
      const rcr = attacker.classResources || {};
      if (rcr.huntersMark === targetCName) {
        const { total: markDmg } = rollDice('1d6', crit);
        baseDmg += markDmg;
        rBonusDmgNote = ` +${markDmg} mark`;
      }
      if (rcr.hexTarget === targetCName) {
        const { total: hexDmg } = rollDice('1d6', crit);
        baseDmg += hexDmg;
        rBonusDmgNote += ` +${hexDmg} necrotic`;
      }
      damage = baseDmg;
      const newHp = Math.max(0, (target.hp ?? target.maxHp ?? 0) - damage);
      eng.db?.updatePlayerHPInDB(targetCName, newHp);
      _checkConcentration(eng, targetCName, target, damage);
      _applyUnconscious(eng, targetCName, target, newHp);
      if (newHp <= 0) onKill(attackerCName, targetCName, eng);
    }

    eng.db?.saveRollToDB({
      type: 'ATTACK', attackType: 'ranged',
      cName: attackerCName, pName: attacker.pName || attackerCName,
      target: targetCName, rawRoll, total, ac, hit, crit, miss,
      advantage: finalAdv2, disadvantage: finalDis2, condNote: condNote2,
      damage: hit ? damage : 0, dmgDice: dmgDice + rBonusDmgNote, color: attacker.pColor || '#3498db', ts: Date.now(),
    });

    if (tarTok2) eng.anim?.trigger(hit ? 'RANGED_HIT' : 'RANGED_MISS', atkTok2, tarTok2);
  }

  /** Execute a named monster action (from Open5e actions array) */
  _doMonsterAction(attackerCName, targetCName, action, pointBlankDis = false) {
    const eng      = this.e;
    const attacker = eng.S.players[attackerCName] || {};
    const target   = eng.S.players[targetCName]   || {};
    const ac       = target._resolved?.ac ?? target.ac ?? 10;
    const isRanged = _isRangedAction(action);
    const dmgDice  = _normActionDmg(action) || '1d6';
    const dmgType  = (action.damage_type || '').toLowerCase() || null;
    const hasAttackRoll = action.attack_bonus != null;

    // Condition modifiers + global mode
    const atkTkM = eng.S.tokens[attackerCName], tarTkM = eng.S.tokens[targetCName];
    const distFtM = tileDistance(atkTkM || {}, tarTkM || {}) * 5;
    const condsM = getConditionModifiers(attacker, target, !isRanged, distFtM);
    const globalModeM = window.getCombatMode?.() || 'normal';
    const useAdvM = condsM.advantage  || globalModeM === 'adv';
    const useDisM = condsM.disadvantage || globalModeM === 'dis' || pointBlankDis;
    const finalAdvM = useAdvM && !useDisM, finalDisM = useDisM && !useAdvM;
    window.setMode?.('normal');

    let hit = true, crit = false, miss = false, rawRoll = 20, total = 20;
    if (hasAttackRoll) {
      const bonus = action.attack_bonus ?? 0;
      const r1 = Math.floor(Math.random() * 20) + 1;
      const r2 = (finalAdvM || finalDisM) ? Math.floor(Math.random() * 20) + 1 : r1;
      rawRoll = condsM.autoCrit ? 20 : (finalAdvM ? Math.max(r1, r2) : finalDisM ? Math.min(r1, r2) : r1);
      total   = rawRoll + bonus;
      const critThresholdM = attacker._resolved?.critThreshold ?? 20;
      crit    = rawRoll >= critThresholdM || condsM.autoCrit ||
                (attacker._resolved?.tags?.has('assassinate') && target.surprised);
      miss    = rawRoll === 1 && !condsM.autoCrit;
      hit     = crit || (!miss && total >= ac);
    }

    let damage = 0, dmgNote = '';
    if (hit) {
      const { total: dmgTotal } = rollDice(dmgDice, crit);
      const base = Math.max(1, dmgTotal);
      const { damage: finalDmg, note } = applyDamageModifiers(base, dmgType, target);
      damage = finalDmg;
      dmgNote = note;
      const newHp = Math.max(0, (target.hp ?? target.maxHp ?? 0) - damage);
      eng.db?.updatePlayerHPInDB(targetCName, newHp);
      _checkConcentration(eng, targetCName, target, damage);
      _applyUnconscious(eng, targetCName, target, newHp);
    }

    eng.db?.saveRollToDB({
      type: 'ATTACK', attackType: isRanged ? 'ranged' : 'melee',
      actionName: action.name, dmgNote,
      cName: attackerCName, pName: attacker.pName || attackerCName,
      target: targetCName, rawRoll, total, ac, hit, crit, miss,
      advantage: finalAdvM, disadvantage: finalDisM,
      condNote: condsM.reasons.length ? ` (${condsM.reasons.join(', ')})` : '',
      damage: hit ? damage : 0, dmgDice,
      color: attacker.pColor || '#e74c3c', ts: Date.now(),
    });

    if (tarTkM) {
      const animType = isRanged
        ? (hit ? 'RANGED_HIT' : 'RANGED_MISS')
        : (crit ? 'MELEE_CRIT' : hit ? 'MELEE_HIT' : 'MELEE_MISS');
      eng.anim?.trigger(animType, atkTkM, tarTkM);
    }
  }

  /** Execute multiattack — runs each sub-attack sequentially with 400ms gaps */
  _doMultiattack(attackerCName, targetCName, attackSequence) {
    attackSequence.forEach((action, i) => {
      setTimeout(() => this._doMonsterAction(attackerCName, targetCName, action, false), i * 400);
    });
  }

  /** Execute a legendary action — tracks usage cost */
  _doLegendaryAction(attackerCName, targetCName, la) {
    const eng      = this.e;
    const attacker = eng.S.players[attackerCName] || {};
    const cost     = _legendaryCost(la);
    const newUsed  = (attacker.legendaryUsed || 0) + cost;
    eng.db?.patchPlayerInDB(attackerCName, { legendaryUsed: newUsed });

    if (la.attack_bonus != null || _normActionDmg(la)) {
      this._doMonsterAction(attackerCName, targetCName, la, false);
    } else {
      // Non-attack legendary action — just log it
      eng.db?.saveRollToDB({
        type: 'STATUS', cName: attackerCName,
        status: `👑 ${attacker.pName || attackerCName} uses legendary action: ${la.name}`,
        ts: Date.now(),
      });
    }
  }

  _doCastSpell(attackerCName, targetCName, spell, castLevel) {
    const eng = this.e;
    const attacker = eng.S.players[attackerCName] || {};
    const target   = eng.S.players[targetCName]   || {};
    const casterLevel = attacker.level || 1;
    const pb = Math.ceil(casterLevel / 4) + 1;
    const spellMod = attacker._resolved?.spellMod ?? Math.floor(((attacker._wis || attacker._cha || attacker._int || 10) - 10) / 2);
    // Spell attack bonus: prefer stored value, fall back to proficiency + spell ability mod
    const spellAttackBonus = attacker.spellAttackBonus || (attacker._resolved?.spellAttackBonus ?? (pb + spellMod));
    // Spell save DC: prefer stored value, fall back to 8 + proficiency + spell ability mod
    const spellSaveDC = attacker.spellSaveDC || (attacker._resolved?.spellSaveDC ?? (8 + pb + spellMod));
    const ac = target.ac ?? 10;
    const baseLevel = spell.level || 0;
    const slotLevel = (castLevel != null && castLevel >= baseLevel) ? castLevel : baseLevel;
    const isCantrip = baseLevel === 0;
    const extraDice = _upcastExtraDice(spell.higher_level, baseLevel, slotLevel);
    let dmgDice   = spell.damage_dice || '';

    // ── Spell Effect Dispatcher ──────────────────────────────────────
    const fx = SPELL_EFFECTS[spell.slug];
    if (fx) {

      switch (fx.cat) {
        case 'BUFF': {
          // Apply buff to target (or self)
          const buffTarget = fx.target === 'self' ? attackerCName : targetCName;
          const patch = {};
          if (fx.effect?.checkBonus) patch.spellCheckBonus = fx.effect.checkBonus;
          if (fx.effect?.saveBonus) patch.spellSaveBonus = fx.effect.saveBonus;
          if (fx.effect?.attackBonus) patch.spellAttackBonus = fx.effect.attackBonus;
          if (fx.effect?.advNextAttack) patch.advNextAttack = true;
          if (fx.effect?.resistBPS) patch.resistBPS = true;
          if (fx.effect?.speedBonus) patch.speedBonus = fx.effect.speedBonus;
          if (fx.effect?.weaponDice) patch.shillelaghDice = fx.effect.weaponDice;
          if (fx.effect?.weaponStat) patch.shillelaghStat = fx.effect.weaponStat;
          if (fx.effect?.advChaChecks) patch.advChaChecks = true;
          if (fx.effect?.unarmedDice) patch.unarmedOverride = fx.effect.unarmedDice;
          if (fx.effect?.acBonus) patch.acBonus = fx.effect.acBonus;
          if (fx.effect?.setAC) patch.setAC = fx.effect.setAC;
          if (fx.effect?.resistElement) patch.resistElement = true;
          if (fx.effect?.bonusMeleeDmg) patch.bonusMeleeDmg = fx.effect.bonusMeleeDmg;
          if (Object.keys(patch).length) eng.db?.patchPlayerInDB(buffTarget, patch);
          if (fx.conc) {
            eng.db?.updateConcentrationInDB?.(attackerCName, true);
            eng.db?.patchPlayerInDB(attackerCName, { concentratingSpell: spell.slug, concentratingTarget: buffTarget });
          }
          eng.db?.saveRollToDB({ type: 'SPELL', cName: attackerCName, pName: attacker.pName || attackerCName,
            target: buffTarget, spellName: spell.name, spellLevel: slotLevel,
            flavor: `${spell.name} → ${buffTarget}`,
            color: attacker.pColor || '#9b59b6', ts: Date.now() });
          if (slotLevel > 0) window.useSpellSlot?.(attackerCName, slotLevel);
          return; // handled
        }

        case 'HEAL_STABILIZE': {
          if ((target.hp || 0) > 0 && fx.requireDying) {
            // Target not dying — can't stabilize
            return;
          }
          const saves = target.deathSaves || { successes: [false,false,false], failures: [false,false,false] };
          saves.stable = true;
          eng.db?.updateDeathSavesInDB?.(targetCName, saves);
          if (fx.tempHp) eng.db?.patchPlayerInDB(targetCName, { tempHp: (target.tempHp || 0) + fx.tempHp });
          eng.db?.saveRollToDB({ type: 'SPELL', cName: attackerCName, pName: attacker.pName || attackerCName,
            target: targetCName, spellName: spell.name, spellLevel: 0,
            flavor: `${spell.name} — ${targetCName} stabilized!`,
            color: '#2ecc71', ts: Date.now() });
          return;
        }

        case 'DEBUFF': {
          // Target makes save or suffers effect
          const saveType = fx.save || 'wis';
          const saveMod = target.savingThrows?.[saveType] ?? Math.floor(((target['_' + saveType] || 10) - 10) / 2);
          const saveRoll2 = Math.floor(Math.random() * 20) + 1;
          const saved = (saveRoll2 + saveMod) >= spellSaveDC;
          if (!saved && fx.onFail) {
            if (fx.onFail.condition) eng.db?.addStatus(targetCName, fx.onFail.condition);
            if (fx.onFail.disadvNextAttack) eng.db?.patchPlayerInDB(targetCName, { disadvNextAttack: true });
            if (fx.onFail.speedHalf) eng.db?.patchPlayerInDB(targetCName, { speedHalved: true });
            if (fx.onFail.speedZero) eng.db?.patchPlayerInDB(targetCName, { speedZero: true });
            if (fx.onFail.speedPenalty) eng.db?.patchPlayerInDB(targetCName, { speedPenalty: fx.onFail.speedPenalty });
          }
          if (fx.conc) {
            eng.db?.updateConcentrationInDB?.(attackerCName, true);
            eng.db?.patchPlayerInDB(attackerCName, { concentratingSpell: spell.slug, concentratingTarget: targetCName });
          }
          eng.db?.saveRollToDB({ type: 'SPELL', cName: attackerCName, pName: attacker.pName || attackerCName,
            target: targetCName, spellName: spell.name, spellLevel: slotLevel,
            savingThrow: true, saveRoll: saveRoll2 + saveMod, spellSaveDC: spellSaveDC,
            savedHalf: saved,
            flavor: `${spell.name} — ${saveType.toUpperCase()} save ${saveRoll2}+${saveMod}=${saveRoll2+saveMod} vs DC ${spellSaveDC}: ${saved ? '✓ Saved' : '✗ Failed!'}`,
            color: attacker.pColor || '#9b59b6', ts: Date.now() });
          if (slotLevel > 0) window.useSpellSlot?.(attackerCName, slotLevel);
          return;
        }

        case 'LIGHT': {
          // TODO: integrate with mapEngine light system when available
          eng.db?.saveRollToDB({ type: 'SPELL', cName: attackerCName, pName: attacker.pName || attackerCName,
            spellName: spell.name, spellLevel: 0,
            flavor: `${spell.name} cast${fx.extinguish ? ' — light extinguished' : ''}`,
            color: attacker.pColor || '#f1c40f', ts: Date.now() });
          if (fx.conc) eng.db?.updateConcentrationInDB?.(attackerCName, true);
          return;
        }

        case 'UTILITY': {
          eng.db?.saveRollToDB({ type: 'SPELL', cName: attackerCName, pName: attacker.pName || attackerCName,
            spellName: spell.name, spellLevel: 0,
            flavor: `${spell.name} cast`,
            color: attacker.pColor || '#9b59b6', ts: Date.now() });
          if (fx.conc) eng.db?.updateConcentrationInDB?.(attackerCName, true);
          if (slotLevel > 0) window.useSpellSlot?.(attackerCName, slotLevel);
          return;
        }

        case 'HEAL': {
          // Dice-based heal fallback (when wizard is not used)
          const healMod = fx.noMod ? 0 : spellMod;
          let healTotal = 0;
          if (fx.flat && fx.noMod) {
            healTotal = fx.flat;
          } else {
            let healDice = fx.dice || '1d8';
            if (fx.upcastDice && slotLevel > baseLevel) {
              const extra = slotLevel - baseLevel;
              const dm = fx.upcastDice.match(/(\d+)d(\d+)/);
              if (dm) healDice += `+${parseInt(dm[1]) * extra}d${dm[2]}`;
            }
            const dm2 = healDice.match(/(\d+)d(\d+)/g);
            if (dm2) dm2.forEach(dd => { const p = dd.match(/(\d+)d(\d+)/); if (p) for (let i=0;i<parseInt(p[1]);i++) healTotal += Math.floor(Math.random()*parseInt(p[2]))+1; });
            healTotal += healMod;
          }
          const oldHp = target.hp ?? 0;
          const maxHp = target.maxHp ?? oldHp;
          const newHp = Math.min(maxHp, oldHp + healTotal);
          eng.db?.updatePlayerHPInDB(targetCName, newHp);
          if (oldHp <= 0 && newHp > 0) {
            eng.db?.removeStatus?.(targetCName, 'Unconscious');
            const sv2 = target.deathSaves || {};
            sv2.stable = false; sv2.dead = false;
            sv2.successes = [false,false,false]; sv2.failures = [false,false,false];
            eng.db?.updateDeathSavesInDB?.(targetCName, sv2);
          }
          eng.db?.saveRollToDB({ type: 'HEAL', cName: attackerCName, pName: attacker.pName || attackerCName,
            target: targetCName, spellName: spell.name, res: healTotal, newHp,
            flavor: `${spell.name} — ${targetCName} healed ${healTotal} HP (${oldHp}→${newHp})`,
            color: '#2ecc71', ts: Date.now() });
          if (slotLevel > 0) window.useSpellSlot?.(attackerCName, slotLevel);
          return;
        }

        case 'CONDITION': {
          // Save-or-suffer condition (Charm Person, Command, Entangle, etc.)
          if (fx.noSave) {
            // No save — apply condition directly (Sleep, Color Spray: HP-based)
            eng.db?.addStatus?.(targetCName, fx.condition);
            eng.db?.saveRollToDB({ type: 'SPELL', cName: attackerCName, pName: attacker.pName || attackerCName,
              target: targetCName, spellName: spell.name,
              flavor: `${spell.name} — ${targetCName} is ${fx.condition}!`,
              color: attacker.pColor || '#9b59b6', ts: Date.now() });
          } else {
            const saveType3 = fx.save || 'wis';
            const saveMod3 = target.savingThrows?.[saveType3] ?? Math.floor(((target['_' + saveType3] || 10) - 10) / 2);
            const saveRoll3 = Math.floor(Math.random() * 20) + 1;
            const saved3 = (saveRoll3 + saveMod3) >= spellSaveDC;
            if (!saved3 && fx.condition) eng.db?.addStatus?.(targetCName, fx.condition);
            if (fx.conc) {
              eng.db?.updateConcentrationInDB?.(attackerCName, true);
              eng.db?.patchPlayerInDB(attackerCName, { concentratingSpell: spell.slug, concentratingTarget: targetCName });
            }
            eng.db?.saveRollToDB({ type: 'SPELL', cName: attackerCName, pName: attacker.pName || attackerCName,
              target: targetCName, spellName: spell.name,
              savingThrow: true, saveRoll: saveRoll3 + saveMod3, spellSaveDC,
              savedHalf: saved3,
              flavor: `${spell.name} — ${saveType3.toUpperCase()} save ${saveRoll3}+${saveMod3}=${saveRoll3+saveMod3} vs DC ${spellSaveDC}: ${saved3 ? '✓ Saved' : '✗ ' + fx.condition + '!'}`,
              color: attacker.pColor || '#9b59b6', ts: Date.now() });
          }
          if (slotLevel > 0) window.useSpellSlot?.(attackerCName, slotLevel);
          return;
        }

        case 'TEMP_HP': {
          // False Life, Heroism, etc.
          let tempAmount = 0;
          if (fx.flat === 'spellMod') {
            tempAmount = spellMod;
          } else if (fx.dice) {
            const dm3 = fx.dice.match(/(\d+)d(\d+)(?:\+(\d+))?/);
            if (dm3) {
              for (let i = 0; i < parseInt(dm3[1]); i++) tempAmount += Math.floor(Math.random() * parseInt(dm3[2])) + 1;
              if (dm3[3]) tempAmount += parseInt(dm3[3]);
            }
            if (fx.upcastFlat && slotLevel > baseLevel) tempAmount += fx.upcastFlat * (slotLevel - baseLevel);
          }
          const curTemp = target.tempHp || 0;
          if (tempAmount > curTemp) eng.db?.patchPlayerInDB(targetCName, { tempHp: tempAmount });
          if (fx.effect?.immuneTo) eng.db?.addStatus?.(targetCName, 'Immune:' + fx.effect.immuneTo);
          if (fx.conc) {
            eng.db?.updateConcentrationInDB?.(attackerCName, true);
            eng.db?.patchPlayerInDB(attackerCName, { concentratingSpell: spell.slug, concentratingTarget: targetCName });
          }
          eng.db?.saveRollToDB({ type: 'SPELL', cName: attackerCName, pName: attacker.pName || attackerCName,
            target: targetCName, spellName: spell.name,
            flavor: `${spell.name} — ${targetCName} gains ${tempAmount} temp HP`,
            color: attacker.pColor || '#9b59b6', ts: Date.now() });
          if (slotLevel > 0) window.useSpellSlot?.(attackerCName, slotLevel);
          return;
        }

        case 'SPECIAL': {
          // Magic Missile, etc.
          if (fx.autoHit && fx.missiles) {
            const numMissiles = fx.missiles + (fx.upcastMissiles && slotLevel > baseLevel ? fx.upcastMissiles * (slotLevel - baseLevel) : 0);
            let totalDmg = 0;
            const dm4 = fx.missileDice.match(/(\d+)d(\d+)(?:\+(\d+))?/);
            for (let m = 0; m < numMissiles; m++) {
              let mDmg = 0;
              if (dm4) {
                for (let i = 0; i < parseInt(dm4[1]); i++) mDmg += Math.floor(Math.random() * parseInt(dm4[2])) + 1;
                if (dm4[3]) mDmg += parseInt(dm4[3]);
              }
              totalDmg += mDmg;
            }
            const oldHp2 = target.hp ?? target.maxHp ?? 0;
            const newHp2 = Math.max(0, oldHp2 - totalDmg);
            eng.db?.updatePlayerHPInDB(targetCName, newHp2);
            if (newHp2 <= 0) eng.db?.addStatus?.(targetCName, 'Unconscious');
            eng.db?.saveRollToDB({ type: 'DAMAGE', cName: attackerCName, pName: attacker.pName || attackerCName,
              target: targetCName, spellName: spell.name, damage: totalDmg,
              flavor: `${spell.name} — ${numMissiles} missiles hit ${targetCName} for ${totalDmg} ${fx.dmgType} damage`,
              color: attacker.pColor || '#9b59b6', ts: Date.now() });
          }
          if (slotLevel > 0) window.useSpellSlot?.(attackerCName, slotLevel);
          return;
        }

        // DMG_ATK and DMG_SAVE fall through to enhance the existing damage code below
        // DMG_WEAPON falls through too
      }

      // ── Apply cantrip scaling for damage cantrips ──
      const casterLvl = attacker.level || 1;
      if (fx.scales && fx.dice) {
        const scaledDice = _cantripDice(fx.dice, casterLvl);
        dmgDice = scaledDice;
        // Toll the Dead: use altDice if target below max HP
        if (fx.altDice && fx.altIf === 'belowMax' && (target.hp || 0) < (target.maxHp || 1)) {
          dmgDice = _cantripDice(fx.altDice, casterLvl);
        }
      } else if (fx.dice) {
        dmgDice = fx.dice;
      }

      // Inject attack_type / dc_type from fx if spell data is missing them
      spell = { ...spell, damage_dice: dmgDice || spell.damage_dice };
      if (fx.atk && !spell.attack_type) spell.attack_type = fx.atk === 'melee' ? 'melee' : 'ranged';
      if (fx.save && !spell.dc_type) spell.dc_type = fx.save;
    }
    // ── End spell effect dispatcher — existing code continues below ──

    let hit = false, crit = false, miss = false, savedHalf = false;
    let rawRoll = 0, total = 0, damage = 0;
    let savingThrow = false, saveRoll = 0;

    if (spell.attack_type && dmgDice) {
      // Spell attack roll
      rawRoll = Math.floor(Math.random() * 20) + 1;
      total   = rawRoll + spellAttackBonus;
      crit    = rawRoll === 20;
      miss    = rawRoll === 1;
      hit     = crit || (!miss && total >= ac);
      if (hit) {
        const { total: base }  = rollDice(dmgDice, crit);
        const { total: extra } = extraDice ? rollDice(extraDice, false) : { total: 0 };
        damage = Math.max(1, base + extra);
        const newHp = Math.max(0, (target.hp ?? target.maxHp ?? 0) - damage);
        eng.db?.updatePlayerHPInDB(targetCName, newHp);
        _checkConcentration(eng, targetCName, target, damage);
        _applyUnconscious(eng, targetCName, target, newHp);
      }
      // Apply cantrip onHit effects (attack spells)
      if (fx?.onHit && hit) {
        if (fx.onHit.speedPenalty) eng.db?.patchPlayerInDB(targetCName, { speedPenalty: fx.onHit.speedPenalty });
        if (fx.onHit.noHealUntil) eng.db?.patchPlayerInDB(targetCName, { noHealUntil: true });
        if (fx.onHit.noReactions) eng.db?.patchPlayerInDB(targetCName, { noReactions: true });
        if (fx.onHit.pullToward) { /* TODO: move token toward caster */ }
        if (fx.onHit.push) { /* TODO: push token away */ }
        if (fx.onHit.disadvNextAttack) eng.db?.patchPlayerInDB(targetCName, { disadvNextAttack: true });
      }
    } else if (spell.dc_type && dmgDice) {
      // Saving throw — target rolls d20 + save proficiency vs spellSaveDC (2D)
      savingThrow = true;
      const saveType  = spell.dc_type.toLowerCase();
      const saveScore = target[`_${saveType}`] ?? target[saveType] ?? 10;
      const saveBonus = target.savingThrows?.[saveType] ?? Math.floor((saveScore - 10) / 2);
      saveRoll = Math.floor(Math.random() * 20) + 1 + saveBonus;
      savedHalf = saveRoll >= spellSaveDC;
      const { total: base }  = rollDice(dmgDice, false);
      const { total: extra } = extraDice ? rollDice(extraDice, false) : { total: 0 };
      const rawDmg = base + extra;
      damage = savedHalf ? Math.floor(rawDmg / 2) : rawDmg;
      if (damage > 0) {
        const newHp = Math.max(0, (target.hp ?? target.maxHp ?? 0) - damage);
        eng.db?.updatePlayerHPInDB(targetCName, newHp);
        _checkConcentration(eng, targetCName, target, damage);
        _applyUnconscious(eng, targetCName, target, newHp);
      }
      hit = true; // always "fires"
      // Apply cantrip onFail effects (save spells)
      if (fx?.onFail && !savedHalf) {
        if (fx.onFail.disadvNextAttack) eng.db?.patchPlayerInDB(targetCName, { disadvNextAttack: true });
        if (fx.onFail.condition) eng.db?.addStatus(targetCName, fx.onFail.condition);
        if (fx.onFail.speedPenalty) eng.db?.patchPlayerInDB(targetCName, { speedPenalty: fx.onFail.speedPenalty });
      }
    } else {
      // Utility / no-damage spell
      hit = true;
    }

    // Consume slot at the cast level (upcast uses higher slot)
    if (!isCantrip) window.useSpellSlot?.(attackerCName, slotLevel);

    eng.db?.saveRollToDB({
      type: 'SPELL', cName: attackerCName, pName: attacker.pName || attackerCName,
      target: targetCName, spellName: spell.name,
      spellLevel: baseLevel, castLevel: slotLevel,
      upcast: slotLevel > baseLevel,
      rawRoll, total, ac, hit, crit, miss,
      savingThrow, saveRoll, savedHalf, spellSaveDC,
      damage, dmgDice, extraDice, color: attacker.pColor || '#9b59b6', ts: Date.now(),
    });

    // Visual animation
    const atkTk3 = eng.S.tokens[attackerCName], tarTk3 = eng.S.tokens[targetCName];
    if (tarTk3) eng.anim?.trigger(savedHalf ? 'SPELL_SAVE' : 'SPELL_HIT', atkTk3, tarTk3);
  }

  // ── DM tools ──────────────────────────────────────────────────────────
  _paintObs(gx, gy) {
    const { e } = this;
    const key = ck(gx, gy);
    if (e.localOnly) {
      if (e.L.tool === 'erase') delete e.S.obstacles[key];
      else e.S.obstacles[key] = true;
      e._pf?.invalidate();
      e._dirty();
      return;
    }
    if (!e.db) return;
    e.db.setObstacle(e.activeRoom, e.S.activeScene, key, e.L.tool === 'paint' ? true : null);
    e._pf?.invalidate();
  }

  _placeTrigger(gx, gy) {
    const { e } = this;
    const key = ck(gx, gy);
    if (e.localOnly) {
      if (e.S.triggers[key]) { delete e.S.triggers[key]; e._dirty(); return; }
      e.L.pendingTrigger = { gx, gy, key };
      this._showTriggerForm(gx, gy);
      return;
    }
    if (!e.db) return;
    if (e.S.triggers[key]) { e.db.setTrigger(e.activeRoom, e.S.activeScene, key, null); return; }
    e.L.pendingTrigger = { gx, gy, key };
    this._showTriggerForm(gx, gy);
  }

  _placeLight(gx, gy) {
    const { e } = this;
    const key = `${Math.floor(gx)}_${Math.floor(gy)}`;
    if (e.S.lights?.[key]) {
      e.db?.removeLight(e.activeRoom, e.S.activeScene, key);
    } else {
      e.db?.setLight(e.activeRoom, e.S.activeScene, key,
        { gx: Math.floor(gx), gy: Math.floor(gy), radius: 6, dimRadius: 9, type: 'torch' });
    }
  }

  _showTriggerForm(gx, gy) {
    const { e } = this;
    let form = document.getElementById('map-trigger-form');
    if (!form) {
      form = document.createElement('div');
      form.id = 'map-trigger-form';
      form.style.cssText = 'position:absolute;background:rgba(13,10,30,0.97);border:1.5px solid rgba(241,196,15,0.5);border-radius:10px;padding:10px 12px;z-index:200;box-shadow:0 6px 24px rgba(0,0,0,0.7);min-width:190px;';
      document.getElementById('map-canvas-container')?.appendChild(form);
    }
    const cc = document.getElementById('map-canvas-container');
    form.style.left = (cc ? cc.clientWidth / 2 - 95 : 120) + 'px';
    form.style.top = '60px';
    form.innerHTML = `
      <div style="font-size:11px;color:#f1c40f;font-weight:bold;margin-bottom:6px;">⚠️ New Trigger at [${gx},${gy}]</div>
      <input id="map-trigger-label" type="text" value="Trap"
        style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:white;border-radius:5px;padding:5px 7px;font-size:12px;outline:none;margin-bottom:7px;">
      <div style="display:flex;gap:5px;">
        <button id="map-trigger-confirm" style="flex:1;background:rgba(241,196,15,0.2);border:1px solid rgba(241,196,15,0.5);color:#f1c40f;border-radius:5px;padding:5px;font-size:11px;font-weight:bold;cursor:pointer;">✓ Place</button>
        <button id="map-trigger-cancel"  style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#aaa;border-radius:5px;padding:5px;font-size:11px;cursor:pointer;">✕ Cancel</button>
      </div>
    `;
    form.style.display = 'block';
    const input = document.getElementById('map-trigger-label');
    input?.focus(); input?.select();
    document.getElementById('map-trigger-confirm').onclick = () => {
      const label = (input?.value.trim()) || 'Trap';
      const pt = e.L.pendingTrigger;
      if (pt) {
        if (e.localOnly) { e.S.triggers[pt.key] = { label, fired: false }; e._dirty(); }
        else if (e.db)   { e.db.setTrigger(e.activeRoom, e.S.activeScene, pt.key, { label, fired: false }); }
      }
      e.L.pendingTrigger = null;
      form.style.display = 'none';
    };
    document.getElementById('map-trigger-cancel').onclick = () => {
      e.L.pendingTrigger = null;
      form.style.display = 'none';
    };
    input?.addEventListener('keydown', ev => {
      if (ev.key === 'Enter')  document.getElementById('map-trigger-confirm')?.click();
      if (ev.key === 'Escape') document.getElementById('map-trigger-cancel')?.click();
    });
  }

  // ── Token rendering ───────────────────────────────────────────────────
  render(pixiActive = false) {
    const { e } = this;
    const activeName = e.L.sc[e.L.ati]?.name;
    Object.entries(e.S.tokens).forEach(([cn, tk]) => {
      if (!tk || tk.gx == null) return;
      if (e.L.drag?.cName === cn) return; // drawn separately as ghost
      const { pps, ox, oy } = e.S.cfg;
      this._renderToken(cn, tk, ox + tk.gx * pps, oy + tk.gy * pps, pps, cn === activeName, false, pixiActive);
    });

    // Ghost while dragging
    if (e.L.drag) {
      const dt = e.L.drag;
      const tk = e.S.tokens[dt.cName];
      if (tk) {
        const { pps, ox, oy } = e.S.cfg;
        e.ctx.globalAlpha = 0.70;
        this._renderToken(dt.cName, tk, ox + dt.curGX * pps, oy + dt.curGY * pps, pps, false, true, pixiActive);
        e.ctx.globalAlpha = 1;
      }
    }

    // Placing cursor — show full footprint of the token being placed
    if (e.L.placing) {
      const { pps, ox, oy } = e.S.cfg;
      const { x: wx, y: wy } = e.L.mw;
      const { gx, gy } = this._wg(wx, wy);
      const pl = e.S.players[e.L.placing];
      const ts = getTileSize(pl?.size);
      e.ctx.globalAlpha = 0.55;
      e.ctx.fillStyle = pl?.pColor || '#3498db';
      e.ctx.fillRect(ox + gx * pps, oy + gy * pps, ts * pps, ts * pps);
      e.ctx.globalAlpha = 1;
    }
  }

  _renderToken(cn, tk, px, py, size, isActive, isGhost, pixiActive = false) {
    const { ctx } = this.e;
    const pl = this.e.S.players[cn] || {};
    const isNPC = pl.userRole === 'npc';
    const monType = pl.monsterType || null;
    const col = (isNPC && monType && typeColor[monType]) ? typeColor[monType]
               : (pl.pColor || '#3498db');
    const portrait = pl.portrait;
    const statuses = pl.statuses || [];
    const isDying  = typeof pl.hp === 'number' && pl.maxHp > 0 && pl.hp <= 0;
    const isConc   = pl.concentrating;

    // 2MT tokens are pre-made circular PNGs — render full tile, no clip/ring
    const isTmt = typeof portrait === 'string' && portrait.includes('tools.2minutetabletop.com');

    // When Pixi is active it handles non-2MT tokens (ring, HP bar, name badge, portrait).
    // Canvas2D only needs to paint the 2MT portrait image (no CORS → can't go to WebGL).
    if (pixiActive && !isTmt) return;

    // Multi-tile sizing
    const tileSize    = getTileSize(pl.size);
    const visualScale = getVisualScale(pl.size);
    // 2MT: fill 98% of tile; standard: use visual scale (disc slightly smaller)
    const renderSize  = isTmt
      ? Math.round(tileSize * size * 0.98)
      : Math.round(tileSize * size * visualScale);
    const tinyOffset  = (!isTmt && tileSize === 1) ? (size - renderSize) / 2 : 0;
    const rpx = px + tinyOffset, rpy = py + tinyOffset;

    const cx = rpx + renderSize / 2, cy = rpy + renderSize / 2;
    const r  = renderSize * (isTmt ? 0.46 : 0.42);

    if (isTmt) {
      // ── 2MT token: full-tile PNG, transparent bg, no clip mask ─────────────
      // When Pixi is active it draws ring, HP bar, name badge, stack badge for 2MT tokens.
      // Canvas2D only draws: portrait image + death skull (Pixi can't do those).
      if (!pixiActive) {
        // Active glow / player-color halo drawn BEHIND the image
        if (isActive) {
          ctx.save();
          ctx.shadowColor = '#f1c40f'; ctx.shadowBlur = size * 0.9;
          ctx.beginPath(); ctx.arc(cx, cy, r + 4 / this.e.vs, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(241,196,15,0.22)'; ctx.fill();
          ctx.restore();
        } else {
          ctx.save();
          ctx.globalAlpha = 0.20;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = col; ctx.fill();
          ctx.restore();
        }
      }

      if (portrait && this.e.L.imgCache[portrait]) {
        ctx.drawImage(this.e.L.imgCache[portrait], rpx, rpy, renderSize, renderSize);
      } else {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        if (portrait && !this.e.L.imgCache['__L' + portrait]) {
          this.e.L.imgCache['__L' + portrait] = true;
          const img = new Image();
          img.onload  = () => { this.e.L.imgCache[portrait] = img; this.e._dirty(); };
          img.onerror = () => { this.e.L.imgCache[portrait] = false; };
          img.src = portrait;
        }
      }
      if (isDying) {
        ctx.save(); ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
        ctx.font = `${renderSize * 0.38}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('💀', cx, cy);
      }
      // Active ring on top (skip if Pixi draws it)
      if (!pixiActive && isActive) {
        ctx.beginPath(); ctx.arc(cx, cy, r + 2 / this.e.vs, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(241,196,15,0.92)';
        ctx.lineWidth = 2.5 / this.e.vs; ctx.stroke();
      }

      // Pixi handles name, HP bar, stack badge — skip Canvas2D versions
      if (pixiActive) {
        // Status icons only — Pixi doesn't render these
        const all2 = [...statuses]; if (isConc) all2.push('Concentrating');
        all2.slice(0, 6).forEach((s, i) => {
          const sz = renderSize * 0.21, col2 = Math.floor(i / 2), row2 = i % 2;
          const ix = rpx + renderSize - sz * (col2 + 1), iy = rpy + sz * row2;
          ctx.font = `${sz * 0.92}px serif`;
          ctx.textAlign = 'right'; ctx.textBaseline = 'top';
          ctx.fillText(STS_ICON[s] || '❓', ix + sz, iy);
        });
        return;
      }
    } else {
      // ── Standard circular token (DiceBear / custom URL) ────────────────────
      if (isActive) {
        ctx.save();
        ctx.shadowColor = '#f1c40f'; ctx.shadowBlur = size * 0.6;
        ctx.beginPath(); ctx.arc(cx, cy, r + 5 / this.e.vs, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(241,196,15,0.25)'; ctx.fill();
        ctx.restore();
        ctx.beginPath(); ctx.arc(cx, cy, r + 4 / this.e.vs, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(241,196,15,0.9)';
        ctx.lineWidth = 2.5 / this.e.vs; ctx.stroke();
      }

      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      if (portrait && this.e.L.imgCache[portrait]) {
        ctx.drawImage(this.e.L.imgCache[portrait], rpx, rpy, renderSize, renderSize);
      } else {
        ctx.fillStyle = col; ctx.fillRect(rpx, rpy, renderSize, renderSize);
        if (portrait && !this.e.L.imgCache['__L' + portrait]) {
          this.e.L.imgCache['__L' + portrait] = true;
          const img = new Image();
          img.onload  = () => { this.e.L.imgCache[portrait] = img; this.e._dirty(); };
          img.onerror = () => { this.e.L.imgCache[portrait] = false; };
          img.src = portrait;
        }
      }
      if (isDying) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(rpx, rpy, renderSize, renderSize);
        ctx.font = `${renderSize * 0.5}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('💀', cx, cy);
      }
      ctx.restore();

      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = isDying ? '#e74c3c' : isActive ? '#f1c40f' : col;
      ctx.lineWidth = (isActive ? 3 : 2) / this.e.vs; ctx.stroke();
    }

    // Name tag at bottom of the full footprint
    const tagH = renderSize * 0.22;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(rpx, rpy + renderSize - tagH, renderSize, tagH);
    ctx.fillStyle = 'white';
    ctx.font = `bold ${Math.max(9, renderSize * 0.14)}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const label = cn.length > 9 ? cn.slice(0, 8) + '…' : cn;
    ctx.fillText(label, cx, rpy + renderSize - 1 / this.e.vs);

    // HP bar below the footprint
    if (pl.maxHp) {
      const pct = Math.max(0, (pl.hp || 0) / pl.maxHp);
      const bw = renderSize * 0.84, bh = 4 / this.e.vs;
      const bx = rpx + (renderSize - bw) / 2, by = rpy + renderSize + 3 / this.e.vs;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = pct > 0.5 ? '#2ecc71' : pct > 0.25 ? '#f39c12' : '#e74c3c';
      ctx.fillRect(bx, by, bw * pct, bh);
    }

    // Status icons in top-right corner of footprint
    const all = [...statuses]; if (isConc) all.push('Concentrating');
    all.slice(0, 6).forEach((s, i) => {
      const sz = renderSize * 0.21, col2 = Math.floor(i / 2), row2 = i % 2;
      const ix = rpx + renderSize - sz * (col2 + 1), iy = rpy + sz * row2;
      ctx.font = `${sz * 0.92}px serif`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(STS_ICON[s] || '❓', ix + sz, iy);
    });

    // Stacking badge — shown when another token shares the same anchor cell
    const stackCount = Object.values(this.e.S.tokens).filter(
      other => other !== tk && other.gx === tk.gx && other.gy === tk.gy
    ).length;
    if (stackCount > 0) {
      const badgeText = `×${stackCount + 1}`;
      const fs = Math.max(8, renderSize * 0.18);
      ctx.font = `bold ${fs}px Arial`;
      const bw2 = ctx.measureText(badgeText).width + 6 / this.e.vs;
      const bh2 = fs + 4 / this.e.vs;
      const bx2 = rpx + renderSize - bw2 - 2 / this.e.vs;
      const by2 = rpy + 2 / this.e.vs;
      ctx.fillStyle = 'rgba(200,30,30,0.9)';
      ctx.fillRect(bx2, by2, bw2, bh2);
      ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx2 + bw2 / 2, by2 + bh2 / 2);
    }
  }

  // ── DOM roster update ─────────────────────────────────────────────────
  updateDashTokenList() {
    const { e } = this;
    const list = document.getElementById('map-token-roster');
    if (!list) return;
    const { players, tokens } = e.S;
    const desired = Object.keys(players).filter(cn => players[cn]?.userRole !== 'dm');

    list.querySelectorAll('[data-cn]').forEach(row => {
      if (!players[row.dataset.cn]) row.remove();
    });

    // Sort: DM first, then by initiative score
    const sorted = desired.slice().sort((a, b) => {
      const pa = players[a], pb = players[b];
      if (pa?.userRole === 'dm') return -1;
      if (pb?.userRole === 'dm') return 1;
      return (pb?.score || 0) - (pa?.score || 0);
    });
    let initPos = 0;
    sorted.forEach(cn => {
      const p = players[cn];
      const onMap = !!tokens[cn];
      const hasInit = (p?.score || 0) > 0;
      if (hasInit) initPos++;
      let row = list.querySelector(`[data-cn="${CSS.escape(cn)}"]`);
      if (!row) {
        row = document.createElement('div');
        row.className = 'map-token-row';
        row.dataset.cn = cn;
        list.appendChild(row);
      }
      // Re-order DOM to match sorted order
      list.appendChild(row);
      const prevOnMap = row.dataset.onmap === '1';
      if (prevOnMap === onMap && row.dataset.rendered === '1') return;
      row.dataset.onmap = onMap ? '1' : '0';
      row.dataset.rendered = '1';
      const initBadge = hasInit ? `<span style="font-size:10px;color:#f1c40f;font-weight:bold;min-width:16px;">${initPos}.</span>` : '';
      row.innerHTML = `
        <img src="${p?.portrait || 'assets/logo.webp'}" style="width:24px;height:24px;border-radius:50%;border:2px solid ${p?.pColor || '#fff'}">
        ${initBadge}
        <span style="flex:1;font-size:12px;color:white;">${cn}</span>
        ${onMap
          ? `<button onclick="window._mapEng.removeToken('${escapeJSString(cn)}')" class="map-dash-btn" style="width:auto;padding:3px 7px;background:rgba(231,76,60,0.4);border-color:#e74c3c;">✕</button>`
          : `<button onclick="window._mapEng.startPlacing('${escapeJSString(cn)}')" class="map-dash-btn" style="width:auto;padding:3px 7px;">📍</button>`
        }
      `;
    });
  }
}
