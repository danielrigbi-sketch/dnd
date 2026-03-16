// js/engine/tokenSystem.js — Token Rendering + Input Handling
// Extracted from mapEngine.js v129 (_rTokens, _rToken, _tokenAt, _updateDashTokenList,
// _md, _mm, _mu, _mw, _ts, _tm, _te, _isMyTurn, _paintObs, _placeTrigger,
// _revealCell, _hideCell, _showTriggerForm)
// Owns: all mouse/touch input routing, drag state, token canvas rendering.
// ─────────────────────────────────────────────────────────────────────────────

import { typeColor } from '../monsters.js';
import { getTileSize, getVisualScale, footprintsOverlap } from './sizeUtils.js';
import { tileDistance, rollDice, parseSpellRangeFt } from './combatUtils.js';
import { getCombatActions, getAllyActions, getSelfActions, applyMeleeModifier } from './classAbilities.js';

const STS_ICON = {
  Poisoned: '☠', Charmed: '♥', Unconscious: '💤', Frightened: '😱',
  Paralyzed: '⚡', Restrained: '⛓', Blinded: '🚫', Prone: '⬇', Stunned: '💫',
  Concentrating: '🔮',
};

function ck(gx, gy) { return `${Math.floor(gx)}_${Math.floor(gy)}`; }
function cheb(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }

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
        eng.bus.emit('ui:toast', { msg: "It's not your turn!", type: 'warning' });
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
        eng.bus.emit('ui:toast', { msg: "It's not your turn!", type: 'warning' });
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
    const { sx, sy } = this._cp(e);
    const delta = e.deltaY < 0 ? 1.1 : 0.91;
    const eng = this.e;
    // Minimum zoom: map must fill at least the canvas in both dimensions
    const { mapW = 30, mapH = 20, pps } = eng.S.cfg;
    const vsMin = Math.min(
      eng.cv.width  / Math.max(1, (mapW || 30) * pps),
      eng.cv.height / Math.max(1, (mapH || 20) * pps)
    );
    const ns = Math.min(4, Math.max(vsMin, eng.vs * delta));
    eng.vx = sx - (sx - eng.vx) * (ns / eng.vs);
    eng.vy = sy - (sy - eng.vy) * (ns / eng.vs);
    eng.vs = ns;
    eng._clampPan();
    eng._dirty();
  }

  _ts(e) { e.preventDefault(); this._md({ ...e, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, button: 0 }); }
  _tm(e) { e.preventDefault(); this._mm({ ...e, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }); }
  _te(e) { e.preventDefault(); this._mu(e); }

  // ── Right-click context action menu ───────────────────────────────────
  _rightClick(e) {
    const { sx, sy } = this._cp(e);
    const { x: wx, y: wy } = this._sw(sx, sy);
    const eng = this.e;
    const targetCName = this.tokenAt(wx, wy);
    if (!targetCName) return;

    const isDM = eng.userRole === 'dm';
    const myCName = eng.cName;

    // Self right-click — show self abilities popup
    if (!isDM && targetCName === myCName) {
      const selfPlayer = eng.S.players[myCName] || {};
      const selfActions = getSelfActions(selfPlayer);
      if (!selfActions.length) return;

      const popup = document.getElementById('action-popup');
      if (!popup) return;
      document.getElementById('action-popup-header').innerHTML = `<span>🧙 ${myCName} — Self</span>`;
      const body = document.getElementById('action-popup-body');
      body.innerHTML = selfActions.map((a, i) =>
        `<button class="action-btn ${a.cls}" ${a.available && a.fn ? `data-idx="${i}"` : 'disabled'}>${a.label}</button>`
      ).join('');
      body.querySelectorAll('.action-btn[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
          selfActions[parseInt(btn.dataset.idx)].fn?.(myCName, eng);
          popup.style.display = 'none';
        });
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

    const popup = document.getElementById('action-popup');
    if (!popup) return;
    const header = document.getElementById('action-popup-header');
    const body   = document.getElementById('action-popup-body');

    const fromLabel = myCName || 'DM';
    header.innerHTML = `<span>⚔️ ${fromLabel} → ${targetCName}</span><span class="action-dist-badge">${distFt === Infinity ? '?' : distFt} ft</span>`;

    const actions = [];
    const rangedRangeFt = attacker.rangedRange || 80; // ft, default shortbow

    if (!isDM || attTk) {
      // Melee (≤ 5ft)
      if (dist <= 1) {
        actions.push({ label: '⚔️ Melee Attack', cls: 'attack',
          fn: () => this._doMeleeAttack(myCName, targetCName) });
      } else {
        actions.push({ label: `⚔️ Out of melee reach (${distFt} ft)`, cls: 'disabled', fn: null });
      }

      // Ranged
      const hasRanged = !!(attacker.rangedDmg && attacker.rangedDmg !== '0');
      if (hasRanged) {
        if (distFt <= rangedRangeFt) {
          const pointBlank = dist <= 1;
          actions.push({
            label: pointBlank ? `🏹 Ranged Attack ⚠️ Disadv` : `🏹 Ranged Attack`,
            cls: 'attack',
            fn: () => this._doRangedAttack(myCName, targetCName, pointBlank),
          });
        } else {
          actions.push({ label: `🏹 Out of range (${distFt}/${rangedRangeFt} ft)`, cls: 'disabled', fn: null });
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
          const remaining = (maxSlots[sp.level] || 0) - (usedSlots[sp.level] || 0);
          return remaining > 0;
        })
        .sort((a, b) => (a.level || 0) - (b.level || 0))
        .slice(0, 4); // max 4 spells shown

      if (castableSpells.length) {
        if (actions.length) actions.push({ label: '── 🔮 Spells ──', cls: 'disabled', fn: null });
        castableSpells.forEach(sp => {
          const lvlTag = sp.level === 0 ? 'Cantrip' : `Lv${sp.level}`;
          actions.push({ label: `🔮 ${sp.name} (${lvlTag})`, cls: 'attack',
            fn: () => this._doCastSpell(myCName, targetCName, sp) });
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

    if (isDM) {
      actions.push({ label: '🩹 Heal (1d4)', cls: 'heal', fn: () => {
        const roll = Math.floor(Math.random() * 4) + 1;
        const newHp = Math.min(target.maxHp || 999, (target.hp || 0) + roll);
        eng.db?.updatePlayerHPInDB(targetCName, newHp);
        eng.db?.saveRollToDB({ cName: targetCName, type: 'HEAL', res: roll, newHp,
          color: '#2ecc71', flavor: `DM heals ${targetCName} for ${roll} HP`, ts: Date.now() });
      }});
    }

    if (!actions.length) return;

    body.innerHTML = actions.map((a, i) =>
      `<button class="action-btn ${a.cls}" ${a.fn ? `data-idx="${i}"` : 'disabled'}>${a.label}</button>`
    ).join('');
    body.querySelectorAll('.action-btn[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        actions[parseInt(btn.dataset.idx)].fn?.();
        popup.style.display = 'none';
      });
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

  _doMeleeAttack(attackerCName, targetCName) {
    const eng = this.e;
    const attacker = eng.S.players[attackerCName] || {};
    const target   = eng.S.players[targetCName]   || {};
    const bonus    = attacker.melee ?? 0;
    const ac       = target.ac ?? 10;
    const rawRoll  = Math.floor(Math.random() * 20) + 1;
    const total    = rawRoll + bonus;
    const crit     = rawRoll === 20;
    const miss     = rawRoll === 1;
    const hit      = crit || (!miss && total >= ac);

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
    }

    eng.db?.saveRollToDB({
      type: 'ATTACK', cName: attackerCName, pName: attacker.pName || attackerCName,
      target: targetCName, rawRoll, total: total + bardicBonus, ac, hit, crit, miss,
      damage: hit ? damage : 0, dmgDice: dmgDice + bonusDmgNote,
      color: attacker.pColor || '#e74c3c', ts: Date.now(),
    });

    // Visual animation
    const atkTk = eng.S.tokens[attackerCName], tarTk = eng.S.tokens[targetCName];
    if (tarTk) eng.anim?.trigger(crit ? 'MELEE_CRIT' : hit ? 'MELEE_HIT' : 'MELEE_MISS', atkTk, tarTk);
  }

  _doRangedAttack(attackerCName, targetCName, disadvantage = false) {
    const eng = this.e;
    const attacker = eng.S.players[attackerCName] || {};
    const target   = eng.S.players[targetCName]   || {};
    const bonus    = attacker.ranged ?? 0;
    const ac       = target.ac ?? 10;

    // Disadvantage = roll 2d20, take lower
    const r1 = Math.floor(Math.random() * 20) + 1;
    const r2 = disadvantage ? Math.floor(Math.random() * 20) + 1 : r1;
    const rawRoll = disadvantage ? Math.min(r1, r2) : r1;
    const total   = rawRoll + bonus;
    const crit    = rawRoll === 20;
    const miss    = rawRoll === 1;
    const hit     = crit || (!miss && total >= ac);

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
    }

    eng.db?.saveRollToDB({
      type: 'ATTACK', attackType: 'ranged',
      cName: attackerCName, pName: attacker.pName || attackerCName,
      target: targetCName, rawRoll, total, ac, hit, crit, miss, disadvantage,
      damage: hit ? damage : 0, dmgDice: dmgDice + rBonusDmgNote, color: attacker.pColor || '#3498db', ts: Date.now(),
    });

    // Visual animation
    const atkTk2 = eng.S.tokens[attackerCName], tarTk2 = eng.S.tokens[targetCName];
    if (tarTk2) eng.anim?.trigger(hit ? 'RANGED_HIT' : 'RANGED_MISS', atkTk2, tarTk2);
  }

  _doCastSpell(attackerCName, targetCName, spell) {
    const eng = this.e;
    const attacker = eng.S.players[attackerCName] || {};
    const target   = eng.S.players[targetCName]   || {};
    const spellAttackBonus = attacker.spellAttackBonus ?? 0;
    const spellSaveDC      = attacker.spellSaveDC ?? 8;
    const ac = target.ac ?? 10;
    const dmgDice = spell.damage_dice || '';
    const isCantrip = (spell.level || 0) === 0;

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
        const { total: dmgTotal } = rollDice(dmgDice, crit);
        damage = Math.max(1, dmgTotal);
        const newHp = Math.max(0, (target.hp ?? target.maxHp ?? 0) - damage);
        eng.db?.updatePlayerHPInDB(targetCName, newHp);
      }
    } else if (spell.dc_type && dmgDice) {
      // Saving throw — target rolls flat d20 vs spellSaveDC
      savingThrow = true;
      saveRoll = Math.floor(Math.random() * 20) + 1;
      savedHalf = saveRoll >= spellSaveDC;
      const { total: dmgTotal } = rollDice(dmgDice, false);
      damage = savedHalf ? Math.floor(dmgTotal / 2) : dmgTotal;
      if (damage > 0) {
        const newHp = Math.max(0, (target.hp ?? target.maxHp ?? 0) - damage);
        eng.db?.updatePlayerHPInDB(targetCName, newHp);
      }
      hit = true; // always "fires"
    } else {
      // Utility / no-damage spell
      hit = true;
    }

    // Consume slot
    if (!isCantrip) window.useSpellSlot?.(attackerCName, spell.level);

    eng.db?.saveRollToDB({
      type: 'SPELL', cName: attackerCName, pName: attacker.pName || attackerCName,
      target: targetCName, spellName: spell.name, spellLevel: spell.level || 0,
      rawRoll, total, ac, hit, crit, miss,
      savingThrow, saveRoll, savedHalf, spellSaveDC,
      damage, dmgDice, color: attacker.pColor || '#9b59b6', ts: Date.now(),
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
      // Active: thin yellow ring on top of the image
      if (isActive) {
        ctx.beginPath(); ctx.arc(cx, cy, r + 2 / this.e.vs, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(241,196,15,0.92)';
        ctx.lineWidth = 2.5 / this.e.vs; ctx.stroke();
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

    desired.forEach(cn => {
      const p = players[cn];
      const onMap = !!tokens[cn];
      let row = list.querySelector(`[data-cn="${CSS.escape(cn)}"]`);
      if (!row) {
        row = document.createElement('div');
        row.className = 'map-token-row';
        row.dataset.cn = cn;
        list.appendChild(row);
      }
      const prevOnMap = row.dataset.onmap === '1';
      if (prevOnMap === onMap && row.dataset.rendered === '1') return;
      row.dataset.onmap = onMap ? '1' : '0';
      row.dataset.rendered = '1';
      row.innerHTML = `
        <img src="${p?.portrait || 'assets/logo.png'}" style="width:24px;height:24px;border-radius:50%;border:2px solid ${p?.pColor || '#fff'}">
        <span style="flex:1;font-size:12px;color:white;">${cn}</span>
        ${onMap
          ? `<button onclick="window._mapEng.removeToken('${cn}')" class="map-dash-btn" style="width:auto;padding:3px 7px;background:rgba(231,76,60,0.4);border-color:#e74c3c;">✕</button>`
          : `<button onclick="window._mapEng.startPlacing('${cn}')" class="map-dash-btn" style="width:auto;padding:3px 7px;">📍</button>`
        }
      `;
    });
  }
}
