// js/engine/actionWizard.js — Step-by-step Action Roll Wizard
// Replaces auto-calc combat with guided 3D dice rolling.
// Each step is committed immediately to prevent roll manipulation.
// Note: innerHTML is used with i18n labels and numeric values only (no user input).

import { roll3DDice, updateDiceColor, clearDice } from '../diceEngine.js';
import { applyDamageModifiers, getConditionModifiers, skillMod } from './combatUtils.js';
import { t } from '../i18n.js';
import { SPELL_EFFECTS } from '../../data/spellEffects.js';

function _upcastExtra(higherLevel, baseLevel, castLevel) {
  if (!higherLevel || castLevel <= baseLevel) return '';
  const m = higherLevel.match(/(\d+d\d+)\s+for\s+each\s+(?:slot\s+)?level\s+above/i);
  if (!m) return '';
  const perLevel = m[1];
  const levelsAbove = castLevel - baseLevel;
  const match = perLevel.match(/(\d+)d(\d+)/);
  if (!match) return '';
  return `${parseInt(match[1]) * levelsAbove}d${match[2]}`;
}

let _activeWizard = null;

/**
 * Open the Action Wizard for a combat action.
 */
export async function openActionWizard(opts) {
  if (_activeWizard) return;
  const wiz = new ActionWizard(opts);
  _activeWizard = wiz;
  try { await wiz.run(); }
  finally { _activeWizard = null; }
}

class ActionWizard {
  constructor(opts) {
    this.opts = opts;
    this.eng = opts.eng;
    this.db = opts.eng?.db;
    this.attackerCName = opts.attackerCName;
    this.targetCName = opts.targetCName;
    this.attacker = opts.attacker || {};
    this.target = opts.target || {};
    this.type = opts.type;
    this.action = opts.action || null;
    this.cancelled = false;
    this._halfDmg = false;
    this._resolve = null;
    this._el = document.getElementById('action-wizard');
    this._header = document.getElementById('action-wizard-header');
    this._body = document.getElementById('action-wizard-body');
    this._footer = document.getElementById('action-wizard-footer');
  }

  run() {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._show();
      this._buildAndRender();
    });
  }

  _show() {
    if (this._el) {
      this._el.style.display = 'flex';
      const popup = document.getElementById('action-popup');
      if (popup) popup.style.display = 'none';
      // Make draggable via header
      const hdr = this._header;
      if (hdr && !hdr._dragBound) {
        hdr._dragBound = true;
        let dx=0, dy=0, dragging=false;
        hdr.addEventListener('mousedown', (e) => {
          if (e.target.closest('button')) return;
          dragging = true; dx = e.clientX - this._el.offsetLeft; dy = e.clientY - this._el.offsetTop; e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => { if (!dragging) return; this._el.style.left = (e.clientX-dx)+'px'; this._el.style.top = (e.clientY-dy)+'px'; this._el.style.transform = 'none'; });
        document.addEventListener('mouseup', () => { dragging = false; });
      }
    }
  }

  _hide() {
    if (this._el) this._el.style.display = 'none';
    clearDice();
    this._resolve?.();
  }

  // Safe HTML setters — values are from i18n/game data, not user input
  _setHeader(s) { if (this._header) this._header.innerHTML = s; }
  _setBody(s) { if (this._body) this._body.innerHTML = s; }
  _setFooter(s) { if (this._footer) this._footer.innerHTML = s; }
  _appendBody(s) { if (this._body) this._body.insertAdjacentHTML('beforeend', s); }

  async _buildAndRender() {
    switch (this.type) {
      case 'melee': case 'ranged': await this._flowAttack(); break;
      case 'monster': await this._flowMonsterAction(); break;
      case 'spell_atk': await this._flowSpellAttack(); break;
      case 'spell_save': await this._flowSpellSave(); break;
      case 'heal': await this._flowHeal(); break;
      case 'buff': await this._flowBuff(); break;
      case 'temp_hp': await this._flowTempHp(); break;
      case 'special': await this._flowSpecial(); break;
      case 'detect': await this._flowDetect(); break;
      case 'summon': await this._flowSummon(); break;
      case 'contested': await this._flowContested(); break;
      case 'skill': await this._flowSkillCheck(); break;
      default: this._hide();
    }
  }

  // ── MELEE / RANGED ATTACK ────────────────────────────────────────────
  async _flowAttack() {
    const cantAct = ['Unconscious','Incapacitated','Stunned','Petrified'].some(s => (this.attacker.statuses||[]).includes(s));
    if (cantAct) {
      this._setBody(`<div class="wiz-result wiz-miss">${this.attackerCName} cannot act!</div>`);
      await this._closeButton();
      return this._hide();
    }
    if ((this.target.hp ?? this.target.maxHp ?? 1) <= 0 && this.type !== 'skill') {
      this._setBody(`<div class="wiz-result wiz-miss">${this.targetCName} is already down!</div>`);
      await this._closeButton();
      return this._hide();
    }
    const isMelee = this.type === 'melee';
    const a = this.attacker, tgt = this.target;
    const distFt = this.opts.distFt || 5;
    const conds = getConditionModifiers(a, tgt, isMelee, distFt);
    const mode = window.getCombatMode?.() || 'normal';
    let adv = conds.advantage || mode === 'adv';
    let dis = conds.disadvantage || mode === 'dis';
    if (adv && dis) { adv = false; dis = false; }
    const bonus = isMelee ? (parseInt(a.melee) || 0) : (parseInt(a.ranged) || 0);
    const ac = tgt.ac ?? 10;
    const dmgDice = this.opts.overrideDmgDice || (isMelee ? (a.meleeDmg || '1d6') : (a.rangedDmg || '1d6'));
    const critThresh = a._resolved?.critThreshold ?? 20;
    const weapon = this.opts.overrideWeaponName || (isMelee ? (a.equipment?.mainHand?.name || t('act_melee_attack')) : (a.equipment?.ranged?.name || t('act_ranged_attack')));

    // Detect active buffs
    const buffs = [];
    if (a.classResources?.raging && isMelee) buffs.push('Rage +2 dmg');
    if (a.classResources?.huntersMark === this.targetCName) buffs.push("Hunter's Mark +1d6");
    if (a.classResources?.hexTarget === this.targetCName) buffs.push('Hex +1d6');
    if (a.advNextAttack) buffs.push('True Strike (advantage)');
    const buffNote = buffs.length ? buffs.join(', ') : '';
    const condNotes = [conds.reasons.join(', '), buffNote].filter(Boolean).join(' | ');

    this._setHeader(`${isMelee ? '&#x2694;' : '&#x1F3F9;'} ${weapon} <button class="wiz-close" id="wiz-x">&#x2715;</button>`);
    this._renderInfo(`${this.attackerCName} &#x2192; ${this.targetCName}`, `+${bonus} vs AC ${ac}`, condNotes, adv, dis);
    this._bindCancel();

    // Roll attack
    await updateDiceColor(a.pColor || '#e74c3c');
    const rollLabel = (adv ? `${t('wizard_roll_attack') || 'Roll Attack'} (${t('wizard_advantage') || 'ADV'} - 2d20)` :
                       dis ? `${t('wizard_roll_attack') || 'Roll Attack'} (${t('wizard_disadvantage') || 'DIS'} - 2d20)` :
                       t('wizard_roll_attack') || 'Roll Attack');
    const d20 = await this._rollStep((adv || dis) ? '2d20' : '1d20', rollLabel);
    if (this.cancelled) return this._hide();

    let raw;
    if (adv || dis) {
      const r1 = d20[0].value, r2 = d20[1].value;
      raw = conds.autoCrit ? 20 : (adv ? Math.max(r1, r2) : Math.min(r1, r2));
      this._appendBody(`<div class="wiz-advdis">[${r1}] [${r2}] &#x2192; ${raw}</div>`);
    } else {
      raw = conds.autoCrit ? 20 : d20[0].value;
    }
    const total = raw + bonus;
    const crit = raw >= critThresh;
    const miss = raw === 1 && !conds.autoCrit;
    const hit = crit || (!miss && total >= ac);

    this.db?.saveRollToDB({ type:'ATTACK', attackType: isMelee?'melee':'ranged', cName:this.attackerCName, pName:a.pName||this.attackerCName, target:this.targetCName, res:raw, rawRoll:raw, total, ac, hit, crit, miss, advantage:adv, disadvantage:dis, condNote:conds.reasons.length?` (${conds.reasons.join(', ')})`:'', color:a.pColor||'#e74c3c', ts:Date.now() });

    this._showHitMiss(raw, bonus, total, ac, hit, crit, miss);

    if (!hit) { await this._closeButton(); return this._hide(); }

    // Reaction window — DM inline buttons for NPC targets, Firebase prompt for player targets
    if (hit) {
        const isPlayerTarget = !!(tgt.authUid && tgt.userRole === 'player');
        const isDM = this.eng?.userRole === 'dm';
        const tgtSpells = Object.values(tgt.spellbook || {});
        const hasShield = tgtSpells.some(s => s.slug === 'shield' || s.name?.toLowerCase() === 'shield');
        const hasUncannyDodge = (tgt.class || '').toLowerCase() === 'rogue' && (tgt.level || 1) >= 5;

        if (isDM && !isPlayerTarget) {
            // DM-controlled NPC target: show inline reaction buttons
            const reactions = [];
            if (hasShield) {
                const newAc = ac + 5;
                if (total < newAc) {
                    reactions.push({ label: `\uD83D\uDEE1 Shield (+5 AC = ${newAc}, MISS!)`, turns_miss: true });
                } else {
                    reactions.push({ label: `\uD83D\uDEE1 Shield (+5 AC = ${newAc}, still hit)`, turns_miss: false });
                }
            }
            if (hasUncannyDodge) {
                reactions.push({ label: '\uD83E\uDD38 Uncanny Dodge (half damage)', half_dmg: true });
            }
            if (reactions.length) {
                for (const r of reactions) {
                    const rBtn = document.createElement('button');
                    rBtn.className = 'wiz-roll-btn wiz-btn-save';
                    rBtn.textContent = r.label;
                    this._body.appendChild(rBtn);
                    const used = await new Promise(resolve => {
                        rBtn.onclick = () => resolve(true);
                        const skipBtn = document.createElement('button');
                        skipBtn.className = 'wiz-roll-btn';
                        skipBtn.textContent = 'Skip Reactions';
                        skipBtn.style.cssText = 'font-size:11px; padding:6px; opacity:0.7;';
                        this._body.appendChild(skipBtn);
                        skipBtn.onclick = () => { skipBtn.remove(); rBtn.remove(); resolve(false); };
                    });
                    if (used) {
                        if (r.turns_miss) {
                            this._appendBody('<div class="wiz-result wiz-miss">\uD83D\uDEE1 Shield cast! Attack becomes MISS!</div>');
                            window.useSpellSlot?.(this.targetCName, 1);
                            this.db?.saveRollToDB({ type: 'SPELL', cName: this.targetCName, spellName: 'Shield', flavor: 'Reaction: Shield (+5 AC)', ts: Date.now() });
                            await this._closeButton();
                            return this._hide();
                        }
                        if (r.half_dmg) {
                            this._halfDmg = true;
                            this._appendBody('<div class="wiz-result wiz-saved">\uD83E\uDD38 Uncanny Dodge! Damage will be halved.</div>');
                            this.db?.patchPlayerInDB(this.targetCName, { reactionUsed: true });
                        }
                        rBtn.remove();
                    }
                }
            }
        } else if (isPlayerTarget && (hasShield || hasUncannyDodge)) {
            // Player target: send reaction prompt via Firebase and wait for response
            const reactionType = hasShield ? 'shield' : 'uncanny_dodge';
            this.db?.sendPendingReaction?.(this.targetCName, {
                attackerCName: this.attackerCName,
                reactionName: hasShield ? 'Shield (+5 AC)' : 'Uncanny Dodge',
                reactionType,
                slotLevel: hasShield ? 1 : null,
                currentTotal: total,
                currentAC: ac,
            });

            this._appendBody('<div class="wiz-info-conds" style="color:#e67e22; margin:10px 0;">&#x23F3; Waiting for ' + this.targetCName + ' to respond...</div>');
            const response = await new Promise(resolve => {
                const unsub = this.db?.listenToPendingReaction?.(this.targetCName, (data) => {
                    if (data?.result) { unsub?.(); resolve(data.result); }
                });
                setTimeout(() => { unsub?.(); resolve({ used: false, timeout: true }); }, 15000);
            });
            this.db?.clearPendingReaction?.(this.targetCName);

            if (response?.used) {
                if (response.reactionType === 'shield') {
                    const newAC = ac + 5;
                    if (total < newAC) {
                        this._appendBody('<div class="wiz-result wiz-miss">\uD83D\uDEE1 Shield cast! Attack becomes MISS!</div>');
                        await this._closeButton(); return this._hide();
                    } else {
                        this._appendBody('<div class="wiz-result wiz-saved">\uD83D\uDEE1 Shield cast (+5 AC), still hit.</div>');
                    }
                } else if (response.reactionType === 'uncanny_dodge') {
                    this._halfDmg = true;
                    this._appendBody('<div class="wiz-result wiz-saved">\uD83E\uDD38 Uncanny Dodge! Damage halved.</div>');
                }
            } else if (response?.timeout) {
                this._appendBody('<div class="wiz-info-conds" style="color:#aaa;">(No reaction \u2014 timed out)</div>');
            }
        }
    }

    // Pre-action callback (e.g., consume spell slot for Divine Smite)
    if (this.opts.preAction) this.opts.preAction();

    // Roll damage
    await this._delay(300); clearDice();
    const cd = crit ? this._doubleDice(dmgDice) : dmgDice;
    const dmg = await this._rollStep(cd, t('wizard_roll_damage') || 'Roll Damage');
    if (this.cancelled) return this._hide();

    let damage = Math.max(1, dmg.reduce((s,d) => s+d.value, 0));

    // Bonus damage (Sneak Attack, Divine Smite, Colossus Slayer, etc.)
    let bonusDmg = 0;
    if (this.opts.bonusDice) {
      await this._delay(200); clearDice();
      const bonusCd = crit ? this._doubleDice(this.opts.bonusDice) : this.opts.bonusDice;
      const bonusRoll = await this._rollStep(bonusCd, `\uD83C\uDFB2 ${this.opts.bonusLabel || 'Bonus Damage'}`);
      if (this.cancelled) return this._hide();
      bonusDmg = bonusRoll.reduce((s,d) => s+d.value, 0);
    }
    if (this.opts.bonusFlat) bonusDmg += this.opts.bonusFlat;
    const totalDamage = damage + bonusDmg;

    if (this._halfDmg) damage = Math.floor(totalDamage / 2); else damage = totalDamage;
    const bonusNote = this.opts.bonusLabel ? ` +${this.opts.bonusLabel}` : '';
    const { newHp, absorbed, oldHp, maxHp } = await this._applyDamage(this.targetCName, tgt, damage);
    this.db?.saveRollToDB({ type:'DAMAGE', cName:this.attackerCName, target:this.targetCName, damage, dmgDice:cd + (this.opts.bonusDice ? `+${this.opts.bonusDice}` : ''), crit, color:a.pColor||'#e74c3c', ts:Date.now() });
    this._showDmg(damage, cd + (this.opts.bonusDice ? `+${this.opts.bonusDice}` : '') + bonusNote + (this._halfDmg ? ' (halved)' : '') + (absorbed ? ` (${absorbed} absorbed)` : ''), oldHp, newHp, maxHp);

    // Post-action callback (e.g., mark sneak used, remove Invisible)
    if (this.opts.postAction) this.opts.postAction();

    await this._closeButton(); this._hide();
    window.setMode?.('normal');
  }

  // ── MONSTER ACTION ───────────────────────────────────────────────────
  async _flowMonsterAction() {
    const cantAct = ['Unconscious','Incapacitated','Stunned','Petrified'].some(s => (this.attacker.statuses||[]).includes(s));
    if (cantAct) {
      this._setBody(`<div class="wiz-result wiz-miss">${this.attackerCName} cannot act!</div>`);
      await this._closeButton();
      return this._hide();
    }
    if ((this.target.hp ?? this.target.maxHp ?? 1) <= 0 && this.type !== 'skill') {
      this._setBody(`<div class="wiz-result wiz-miss">${this.targetCName} is already down!</div>`);
      await this._closeButton();
      return this._hide();
    }
    const act = this.action; if (!act) return this._hide();
    const a = this.attacker, tgt = this.target;
    const bonus = act.attack_bonus ?? 0;
    const ac = tgt.ac ?? 10;
    const dmgDice = _normDmg(act) || '1d6';
    const dmgType = _dmgType(act);

    this._setHeader(`&#x2694; ${act.name} <button class="wiz-close" id="wiz-x">&#x2715;</button>`);
    this._renderInfo(`${this.attackerCName} &#x2192; ${this.targetCName}`, `+${bonus} vs AC ${ac}`, '', false, false);
    this._bindCancel();

    await updateDiceColor(a.pColor || '#e74c3c');
    const d20 = await this._rollStep('1d20', t('wizard_roll_attack') || 'Roll Attack');
    if (this.cancelled) return this._hide();

    const raw = d20[0].value, total = raw + bonus;
    const crit = raw >= (a._resolved?.critThreshold ?? 20), miss = raw === 1, hit = crit || (!miss && total >= ac);

    this.db?.saveRollToDB({ type:'ATTACK', attackType:'melee', actionName:act.name, cName:this.attackerCName, pName:a.pName||this.attackerCName, target:this.targetCName, res:raw, rawRoll:raw, total, ac, hit, crit, miss, color:a.pColor||'#e74c3c', ts:Date.now() });
    this._showHitMiss(raw, bonus, total, ac, hit, crit, miss);

    if (!hit) { await this._closeButton(); return this._hide(); }

    // Reaction window — DM inline buttons for NPC targets, Firebase prompt for player targets
    if (hit) {
        const isPlayerTarget = !!(tgt.authUid && tgt.userRole === 'player');
        const isDM = this.eng?.userRole === 'dm';
        const tgtSpells = Object.values(tgt.spellbook || {});
        const hasShield = tgtSpells.some(s => s.slug === 'shield' || s.name?.toLowerCase() === 'shield');
        const hasUncannyDodge = (tgt.class || '').toLowerCase() === 'rogue' && (tgt.level || 1) >= 5;

        if (isDM && !isPlayerTarget) {
            // DM-controlled NPC target: show inline reaction buttons
            const reactions = [];
            if (hasShield) {
                const newAc = ac + 5;
                if (total < newAc) {
                    reactions.push({ label: `\uD83D\uDEE1 Shield (+5 AC = ${newAc}, MISS!)`, turns_miss: true });
                } else {
                    reactions.push({ label: `\uD83D\uDEE1 Shield (+5 AC = ${newAc}, still hit)`, turns_miss: false });
                }
            }
            if (hasUncannyDodge) {
                reactions.push({ label: '\uD83E\uDD38 Uncanny Dodge (half damage)', half_dmg: true });
            }
            if (reactions.length) {
                for (const r of reactions) {
                    const rBtn = document.createElement('button');
                    rBtn.className = 'wiz-roll-btn wiz-btn-save';
                    rBtn.textContent = r.label;
                    this._body.appendChild(rBtn);
                    const used = await new Promise(resolve => {
                        rBtn.onclick = () => resolve(true);
                        const skipBtn = document.createElement('button');
                        skipBtn.className = 'wiz-roll-btn';
                        skipBtn.textContent = 'Skip Reactions';
                        skipBtn.style.cssText = 'font-size:11px; padding:6px; opacity:0.7;';
                        this._body.appendChild(skipBtn);
                        skipBtn.onclick = () => { skipBtn.remove(); rBtn.remove(); resolve(false); };
                    });
                    if (used) {
                        if (r.turns_miss) {
                            this._appendBody('<div class="wiz-result wiz-miss">\uD83D\uDEE1 Shield cast! Attack becomes MISS!</div>');
                            window.useSpellSlot?.(this.targetCName, 1);
                            this.db?.saveRollToDB({ type: 'SPELL', cName: this.targetCName, spellName: 'Shield', flavor: 'Reaction: Shield (+5 AC)', ts: Date.now() });
                            await this._closeButton();
                            return this._hide();
                        }
                        if (r.half_dmg) {
                            this._halfDmg = true;
                            this._appendBody('<div class="wiz-result wiz-saved">\uD83E\uDD38 Uncanny Dodge! Damage will be halved.</div>');
                            this.db?.patchPlayerInDB(this.targetCName, { reactionUsed: true });
                        }
                        rBtn.remove();
                    }
                }
            }
        } else if (isPlayerTarget && (hasShield || hasUncannyDodge)) {
            // Player target: send reaction prompt via Firebase and wait for response
            const reactionType = hasShield ? 'shield' : 'uncanny_dodge';
            this.db?.sendPendingReaction?.(this.targetCName, {
                attackerCName: this.attackerCName,
                reactionName: hasShield ? 'Shield (+5 AC)' : 'Uncanny Dodge',
                reactionType,
                slotLevel: hasShield ? 1 : null,
                currentTotal: total,
                currentAC: ac,
            });

            this._appendBody('<div class="wiz-info-conds" style="color:#e67e22; margin:10px 0;">&#x23F3; Waiting for ' + this.targetCName + ' to respond...</div>');
            const response = await new Promise(resolve => {
                const unsub = this.db?.listenToPendingReaction?.(this.targetCName, (data) => {
                    if (data?.result) { unsub?.(); resolve(data.result); }
                });
                setTimeout(() => { unsub?.(); resolve({ used: false, timeout: true }); }, 15000);
            });
            this.db?.clearPendingReaction?.(this.targetCName);

            if (response?.used) {
                if (response.reactionType === 'shield') {
                    const newAC = ac + 5;
                    if (total < newAC) {
                        this._appendBody('<div class="wiz-result wiz-miss">\uD83D\uDEE1 Shield cast! Attack becomes MISS!</div>');
                        await this._closeButton(); return this._hide();
                    } else {
                        this._appendBody('<div class="wiz-result wiz-saved">\uD83D\uDEE1 Shield cast (+5 AC), still hit.</div>');
                    }
                } else if (response.reactionType === 'uncanny_dodge') {
                    this._halfDmg = true;
                    this._appendBody('<div class="wiz-result wiz-saved">\uD83E\uDD38 Uncanny Dodge! Damage halved.</div>');
                }
            } else if (response?.timeout) {
                this._appendBody('<div class="wiz-info-conds" style="color:#aaa;">(No reaction \u2014 timed out)</div>');
            }
        }
    }

    await this._delay(300); clearDice();
    const cd = crit ? this._doubleDice(dmgDice) : dmgDice;
    const dmg = await this._rollStep(cd, t('wizard_roll_damage') || 'Roll Damage');
    if (this.cancelled) return this._hide();

    let damage = Math.max(1, dmg.reduce((s,d) => s+d.value, 0));
    if (this._halfDmg) damage = Math.floor(damage / 2);
    let note = '';
    if (dmgType) { const r = applyDamageModifiers(damage, dmgType, tgt); damage = r.damage; note = r.note; }
    const { newHp, absorbed, oldHp, maxHp } = await this._applyDamage(this.targetCName, tgt, damage);
    this.db?.saveRollToDB({ type:'DAMAGE', cName:this.attackerCName, target:this.targetCName, damage, dmgDice:cd, dmgNote:note, crit, color:a.pColor||'#e74c3c', ts:Date.now() });
    this._showDmg(damage, cd + (this._halfDmg ? ' (halved)' : '') + (note ? ' '+note : '') + (absorbed ? ` (${absorbed} absorbed)` : ''), oldHp, newHp, maxHp);

    await this._closeButton(); this._hide();
  }

  // ── SPELL ATTACK ─────────────────────────────────────────────────────
  async _flowSpellAttack() {
    const cantAct = ['Unconscious','Incapacitated','Stunned','Petrified'].some(s => (this.attacker.statuses||[]).includes(s));
    if (cantAct) {
      this._setBody(`<div class="wiz-result wiz-miss">${this.attackerCName} cannot act!</div>`);
      await this._closeButton();
      return this._hide();
    }
    if ((this.target.hp ?? this.target.maxHp ?? 1) <= 0 && this.type !== 'skill') {
      this._setBody(`<div class="wiz-result wiz-miss">${this.targetCName} is already down!</div>`);
      await this._closeButton();
      return this._hide();
    }
    const spell = this.action; if (!spell) return this._hide();
    const a = this.attacker, tgt = this.target, lvl = a.level || 1;
    const pb = Math.ceil(lvl/4)+1;
    const sm = a._resolved?.spellMod ?? Math.floor(((a._wis||a._cha||a._int||10)-10)/2);
    const bonus = a.spellAttackBonus || (a._resolved?.spellAttackBonus ?? (pb + sm));
    const ac = tgt.ac ?? 10;
    const fx = SPELL_EFFECTS[spell.slug];
    let dmgDice = spell.damage_dice || fx?.dice || '1d8';
    if (fx?.scales && fx.dice) { const s=parseInt(fx.dice.match(/d(\d+)/)?.[1]||8); const c=lvl>=17?4:lvl>=11?3:lvl>=5?2:1; dmgDice=`${c}d${s}`; }
    let extraDice = _upcastExtra(spell.higher_level, spell.level || 0, this.opts.castLevel || spell.level || 0);
    // Fallback: use fx.upcastDice if higher_level text didn't parse
    if (!extraDice && fx?.upcastDice && (this.opts.castLevel || spell.level || 0) > (spell.level || 0)) {
      const uc = fx.upcastDice.match(/(\d+)d(\d+)/);
      if (uc) extraDice = `${parseInt(uc[1]) * ((this.opts.castLevel || spell.level) - (spell.level || 0))}d${uc[2]}`;
    }

    // Detect active spell buffs
    const spBuffs = [];
    if (a.classResources?.hexTarget === this.targetCName) spBuffs.push('Hex +1d6');
    if (a.advNextAttack) spBuffs.push('True Strike (advantage)');
    const spBuffNote = spBuffs.length ? spBuffs.join(', ') : '';

    this._setHeader(`&#x1F52E; ${spell.name} <button class="wiz-close" id="wiz-x">&#x2715;</button>`);
    this._renderInfo(`${this.attackerCName} &#x2192; ${this.targetCName}`, `Spell +${bonus} vs AC ${ac}`, spBuffNote, false, false);
    this._bindCancel();

    await updateDiceColor(a.pColor || '#9b59b6');
    const d20 = await this._rollStep('1d20', t('wizard_roll_attack') || 'Roll Attack');
    if (this.cancelled) return this._hide();

    if ((spell.level||0)>0) window.useSpellSlot?.(this.attackerCName, this.opts.castLevel||spell.level);

    const raw=d20[0].value, total=raw+bonus, crit=raw===20, miss=raw===1, hit=crit||(!miss&&total>=ac);
    this.db?.saveRollToDB({ type:'SPELL', cName:this.attackerCName, pName:a.pName||this.attackerCName, target:this.targetCName, spellName:spell.name, res:raw, rawRoll:raw, total, ac, hit, crit, miss, color:a.pColor||'#9b59b6', ts:Date.now() });
    this._showHitMiss(raw, bonus, total, ac, hit, crit, miss);

    if (!hit) { await this._closeButton(); return this._hide(); }

    await this._delay(300); clearDice();
    let cd = crit ? this._doubleDice(dmgDice) : dmgDice;
    if (extraDice) cd += '+' + (crit ? this._doubleDice(extraDice) : extraDice);
    const dmg = await this._rollStep(cd, t('wizard_roll_damage') || 'Roll Damage');
    if (this.cancelled) return this._hide();

    const damage = Math.max(1, dmg.reduce((s,d)=>s+d.value,0));
    const { newHp, absorbed, oldHp, maxHp } = await this._applyDamage(this.targetCName, tgt, damage);
    this.db?.saveRollToDB({ type:'DAMAGE', cName:this.attackerCName, target:this.targetCName, spellName:spell.name, damage, dmgDice:cd, crit, color:a.pColor||'#9b59b6', ts:Date.now() });
    this._showDmg(damage, cd + (absorbed ? ` (${absorbed} absorbed)` : ''), oldHp, newHp, maxHp);
    if (fx?.onHit) { if (fx.onHit.speedPenalty) this.db?.patchPlayerInDB(this.targetCName,{speedPenalty:fx.onHit.speedPenalty}); if (fx.onHit.noHealUntil) this.db?.patchPlayerInDB(this.targetCName,{noHealUntil:true}); if (fx.onHit.noReactions) this.db?.patchPlayerInDB(this.targetCName,{noReactions:true}); if (fx.onHit.grantAdvantage) this.db?.patchPlayerInDB(this.targetCName,{grantAdvantage:true}); }

    await this._closeButton(); this._hide();
  }

  // ── SPELL SAVE ───────────────────────────────────────────────────────
  async _flowSpellSave() {
    const cantAct = ['Unconscious','Incapacitated','Stunned','Petrified'].some(s => (this.attacker.statuses||[]).includes(s));
    if (cantAct) {
      this._setBody(`<div class="wiz-result wiz-miss">${this.attackerCName} cannot act!</div>`);
      await this._closeButton();
      return this._hide();
    }
    if ((this.target.hp ?? this.target.maxHp ?? 1) <= 0 && this.type !== 'skill') {
      this._setBody(`<div class="wiz-result wiz-miss">${this.targetCName} is already down!</div>`);
      await this._closeButton();
      return this._hide();
    }
    const spell = this.action; if (!spell) return this._hide();
    const a = this.attacker, tgt = this.target, lvl = a.level||1;
    const pb = Math.ceil(lvl/4)+1;
    const sm = a._resolved?.spellMod ?? Math.floor(((a._wis||a._cha||a._int||10)-10)/2);
    const dc = a.spellSaveDC || (a._resolved?.spellSaveDC ?? (8+pb+sm));
    const fx = SPELL_EFFECTS[spell.slug];
    const saveType = (spell.dc_type || fx?.save || 'wis').toLowerCase();
    const saveMod = tgt.savingThrows?.[saveType] ?? Math.floor(((tgt['_'+saveType]||10)-10)/2);

    let dmgDice = spell.damage_dice || fx?.dice || '';
    if (fx?.scales && fx.dice) { const s=parseInt(fx.dice.match(/d(\d+)/)?.[1]||8); const c=lvl>=17?4:lvl>=11?3:lvl>=5?2:1; dmgDice=`${c}d${s}`; }
    if (fx?.altDice && fx.altIf==='belowMax' && (tgt.hp||0)<(tgt.maxHp||1)) { const s=parseInt(fx.altDice.match(/d(\d+)/)?.[1]||12); const c=lvl>=17?4:lvl>=11?3:lvl>=5?2:1; dmgDice=`${c}d${s}`; }
    let extraDice = _upcastExtra(spell.higher_level, spell.level || 0, this.opts.castLevel || spell.level || 0);
    // Fallback: use fx.upcastDice if higher_level text didn't parse
    if (!extraDice && fx?.upcastDice && (this.opts.castLevel || spell.level || 0) > (spell.level || 0)) {
      const uc = fx.upcastDice.match(/(\d+)d(\d+)/);
      if (uc) extraDice = `${parseInt(uc[1]) * ((this.opts.castLevel || spell.level) - (spell.level || 0))}d${uc[2]}`;
    }
    if (extraDice && dmgDice) dmgDice += '+' + extraDice;

    this._setHeader(`&#x1F52E; ${spell.name} <button class="wiz-close" id="wiz-x">&#x2715;</button>`);
    this._renderInfo(`${this.attackerCName} &#x2192; ${this.targetCName}`, `DC ${dc} ${saveType.toUpperCase()} Save (${this.targetCName} +${saveMod})`, '', false, false);
    this._bindCancel();

    // Determine if target is a player character (not controlled by the caster)
    const isPlayerTarget = !!(this.target.authUid && this.target.userRole === 'player');
    const isSamePlayer = isPlayerTarget && this.target.authUid === this.attacker.authUid;

    let svRaw, svTotal, saved;

    if (isPlayerTarget && !isSamePlayer) {
      // Cross-player save: send prompt to the target player and wait for their roll
      this.db?.sendPendingSave(this.targetCName, { casterCName: this.attackerCName, spellName: spell.name, saveType, dc });
      this._appendBody(`<div class="wiz-info-conds" style="color:#e6b800; margin:10px 0;">&#x23F3; Waiting for ${this.targetCName} to roll ${saveType.toUpperCase()} save...</div>`);

      const result = await new Promise((resolve) => {
        const unsub = this.db?.listenToPendingSave(this.targetCName, (data) => {
          if (data?.result) {
            if (unsub) unsub();
            resolve(data.result);
          }
        });
        // Timeout after 60 seconds — auto-roll for them
        setTimeout(() => {
          if (unsub) unsub();
          const autoRoll = Math.floor(Math.random() * 20) + 1;
          resolve({ roll: autoRoll, mod: saveMod, total: autoRoll + saveMod, saved: (autoRoll + saveMod) >= dc, auto: true });
        }, 60000);
      });

      this.db?.clearPendingSave(this.targetCName);

      svRaw = result.roll;
      svTotal = result.total;
      saved = result.saved;

      if (result.auto) {
        this._appendBody(`<div class="wiz-info-conds" style="color:#aaa;">(Auto-rolled — player did not respond)</div>`);
      }
    } else {
      // NPC target or self-cast: DM/caster rolls in wizard as before
      await updateDiceColor(tgt.pColor || '#3498db');
      const sv = await this._rollStep('1d20', `${this.targetCName}: ${t('wizard_save_roll') || 'Roll Save'}`);
      if (this.cancelled) return this._hide();
      svRaw = sv[0].value;
      svTotal = svRaw + saveMod;
      saved = svTotal >= dc;
    }

    if ((spell.level||0)>0) window.useSpellSlot?.(this.attackerCName, this.opts.castLevel||spell.level);
    this._appendBody(`<div class="wiz-result ${saved?'wiz-saved':'wiz-failed'}">${saveType.toUpperCase()} Save: [${svRaw}]+${saveMod}=${svTotal} vs DC ${dc}<br><strong>${saved ? '&#x2713; Saved!' : '&#x2717; Failed!'}</strong></div>`);
    this.db?.saveRollToDB({ type:'SPELL', cName:this.attackerCName, pName:a.pName||this.attackerCName, target:this.targetCName, spellName:spell.name, savingThrow:true, saveRoll:svTotal, spellSaveDC:dc, savedHalf:saved, color:a.pColor||'#9b59b6', ts:Date.now() });

    if (dmgDice) {
      await this._delay(300); clearDice();
      await updateDiceColor(a.pColor || '#9b59b6');
      const dmg = await this._rollStep(dmgDice, t('wizard_roll_damage') || 'Roll Damage');
      if (this.cancelled) return this._hide();
      let damage = Math.max(1, dmg.reduce((s,d)=>s+d.value,0));
      if (saved) damage = Math.floor(damage/2);
      const { newHp, absorbed, oldHp, maxHp } = await this._applyDamage(this.targetCName, tgt, damage);
      this.db?.saveRollToDB({ type:'DAMAGE', cName:this.attackerCName, target:this.targetCName, spellName:spell.name, damage, dmgDice, savedHalf:saved, color:a.pColor||'#9b59b6', ts:Date.now() });
      this._showDmg(damage, dmgDice+(saved?' (halved)':'') + (absorbed ? ` (${absorbed} absorbed)` : ''), oldHp, newHp, maxHp);
    }

    if (!saved && fx?.onFail) {
      if (fx.onFail.condition) this.db?.addStatus?.(this.targetCName, fx.onFail.condition);
      if (fx.onFail.disadvNextAttack) this.db?.patchPlayerInDB(this.targetCName, {disadvNextAttack:true});
      if (fx.onFail.speedPenalty) this.db?.patchPlayerInDB(this.targetCName, {speedPenalty:fx.onFail.speedPenalty});
      if (fx.onFail.push) this.db?.patchPlayerInDB(this.targetCName, {pushedBack:fx.onFail.push});
      if (fx.onFail.grantAdvantage) this.db?.patchPlayerInDB(this.targetCName, {grantAdvantage:true});
    }

    await this._closeButton(); this._hide();
  }

  // ── HEAL SPELL ───────────────────────────────────────────────────────
  async _flowHeal() {
    const spell = this.action; if (!spell) return this._hide();
    const a = this.attacker, tgt = this.target;
    const fx = SPELL_EFFECTS[spell.slug];
    const lvl = a.level || 1;
    const pb = Math.ceil(lvl / 4) + 1;
    const spellMod = a._resolved?.spellMod ?? Math.floor(((a._wis || a._cha || a._int || 10) - 10) / 2);

    // Goodberry and similar flat-heal spells
    if (fx?.noMod && fx?.flat) {
      this._setHeader(`&#x2764; ${spell.name} <button class="wiz-close" id="wiz-x">&#x2715;</button>`);
      this._renderInfo(`${this.attackerCName} &#x2192; ${this.targetCName}`, `Heal: ${fx.flat} HP`, '', false, false);
      this._bindCancel();

      if ((spell.level || 0) > 0) window.useSpellSlot?.(this.attackerCName, this.opts.castLevel || spell.level);

      const healTotal = fx.flat;
      const oldHp = tgt.hp ?? 0;
      const maxHp = tgt.maxHp ?? oldHp;
      const newHp = Math.min(maxHp, oldHp + healTotal);

      this.db?.updatePlayerHPInDB(this.targetCName, newHp);
      this.db?.saveRollToDB({
        type: 'HEAL', cName: this.attackerCName, target: this.targetCName,
        spellName: spell.name, res: healTotal, newHp,
        color: '#2ecc71', ts: Date.now()
      });

      this._appendBody(`<div class="wiz-result wiz-hit">&#x2764; Healed: ${healTotal} HP<br>${this.targetCName}: ${oldHp} &#x2192; ${newHp}/${maxHp} HP</div>`);

      if (oldHp <= 0 && newHp > 0) {
        this.db?.removeStatus?.(this.targetCName, 'Unconscious');
        const saves = tgt.deathSaves || {};
        saves.stable = false; saves.dead = false;
        saves.successes = [false, false, false]; saves.failures = [false, false, false];
        this.db?.updateDeathSavesInDB?.(this.targetCName, saves);
      }

      await this._closeButton();
      return this._hide();
    }

    // Dice-based heal spells (Cure Wounds, Healing Word, etc.)
    let healDice = fx?.dice || spell.heal_at_slot_level?.[String(spell.level)] || '1d8';
    const castLevel = this.opts.castLevel || spell.level || 1;
    if (fx?.upcastDice && castLevel > (spell.level || 1)) {
      const extra = castLevel - (spell.level || 1);
      const match = fx.upcastDice.match(/(\d+)d(\d+)/);
      if (match) healDice += `+${parseInt(match[1]) * extra}d${match[2]}`;
    }

    this._setHeader(`&#x2764; ${spell.name} <button class="wiz-close" id="wiz-x">&#x2715;</button>`);
    this._renderInfo(`${this.attackerCName} &#x2192; ${this.targetCName}`, `Heal: ${healDice}+${spellMod}`, '', false, false);
    this._bindCancel();

    if ((spell.level || 0) > 0) window.useSpellSlot?.(this.attackerCName, this.opts.castLevel || spell.level);

    await updateDiceColor('#2ecc71');
    const roll = await this._rollStep(healDice, '&#x2764; Roll Healing');
    if (this.cancelled) return this._hide();

    const healTotal = roll.reduce((s, d) => s + d.value, 0) + spellMod;
    const oldHp = tgt.hp ?? 0;
    const maxHp = tgt.maxHp ?? oldHp;
    const newHp = Math.min(maxHp, oldHp + healTotal);

    this.db?.updatePlayerHPInDB(this.targetCName, newHp);
    this.db?.saveRollToDB({
      type: 'HEAL', cName: this.attackerCName, target: this.targetCName,
      spellName: spell.name, res: healTotal, newHp,
      color: '#2ecc71', ts: Date.now()
    });

    this._appendBody(`<div class="wiz-result wiz-hit">&#x2764; Healed: ${healTotal} HP<br>${this.targetCName}: ${oldHp} &#x2192; ${newHp}/${maxHp} HP</div>`);

    // Remove Unconscious if healed above 0
    if (oldHp <= 0 && newHp > 0) {
      this.db?.removeStatus?.(this.targetCName, 'Unconscious');
      const saves = tgt.deathSaves || {};
      saves.stable = false; saves.dead = false;
      saves.successes = [false, false, false]; saves.failures = [false, false, false];
      this.db?.updateDeathSavesInDB?.(this.targetCName, saves);
    }

    await this._closeButton();
    this._hide();
  }

  // ── CONTESTED CHECK ──────────────────────────────────────────────────
  async _flowContested() {
    const a = this.attacker, tgt = this.target;
    const type = this.opts.contestType || 'grapple';
    const aMod = skillMod('Athletics', a);
    const dMod = Math.max(skillMod('Athletics', tgt), skillMod('Acrobatics', tgt));

    this._setHeader(`&#x1F93C; ${type==='grapple' ? t('act_grapple') : t('act_shove')} <button class="wiz-close" id="wiz-x">&#x2715;</button>`);
    this._renderInfo(`${this.attackerCName} vs ${this.targetCName}`, `Athletics +${aMod} vs +${dMod}`, '', false, false);
    this._bindCancel();

    await updateDiceColor(a.pColor || '#e74c3c');
    const ar = await this._rollStep('1d20', `${this.attackerCName}: Roll`);
    if (this.cancelled) return this._hide();
    const aTotal = ar[0].value + aMod;
    this._appendBody(`<div class="wiz-result">${this.attackerCName}: [${ar[0].value}]+${aMod}=<strong>${aTotal}</strong></div>`);

    await this._delay(300); clearDice();
    await updateDiceColor(tgt.pColor || '#3498db');
    const dr = await this._rollStep('1d20', `${this.targetCName}: Roll`);
    if (this.cancelled) return this._hide();
    const dTotal = dr[0].value + dMod;
    const win = aTotal >= dTotal;
    this._appendBody(`<div class="wiz-result">${this.targetCName}: [${dr[0].value}]+${dMod}=<strong>${dTotal}</strong></div><div class="wiz-result ${win?'wiz-hit':'wiz-miss'}"><strong>${win?'&#x2713; Success!':'&#x2717; Failed!'}</strong></div>`);

    if (win) this.db?.addStatus?.(this.targetCName, type==='grapple'?'Grappled':'Prone');
    this.db?.saveRollToDB({ type:'CONTEST', cName:this.attackerCName, target:this.targetCName, status:`${type}: ${aTotal} vs ${dTotal} ${win?'&#x2713;':'&#x2717;'}`, ts:Date.now() });

    await this._closeButton(); this._hide();
  }

  // ── SKILL CHECK ──────────────────────────────────────────────────────
  async _flowSkillCheck() {
    const skill = this.opts.skillName || 'Perception';
    const roller = this.opts.rollerCName || this.attackerCName;
    const rd = this.opts.rollerData || this.attacker;
    const mod = skillMod(skill, rd);

    this._setHeader(`&#x1F3B2; ${skill} <button class="wiz-close" id="wiz-x">&#x2715;</button>`);
    this._renderInfo(roller, `${skill} +${mod}`, '', false, false);
    this._bindCancel();

    await updateDiceColor(rd.pColor || '#27ae60');
    const r = await this._rollStep('1d20', 'Roll');
    if (this.cancelled) return this._hide();
    const total = r[0].value + mod;
    this._appendBody(`<div class="wiz-result wiz-hit">[${r[0].value}]+${mod}=<strong>${total}</strong></div>`);
    this.db?.saveRollToDB({ type:'SKILL', cName:roller, pName:rd.pName||roller, skillName:skill, mod, res:r[0].value, total, color:rd.pColor||'#27ae60', ts:Date.now() });

    await this._closeButton(); this._hide();
  }

  async _dropOldConcentration(casterCName) {
    // If already concentrating, drop the old spell first
    const caster = this.eng?.S?.players?.[casterCName];
    if (caster?.concentrating) {
      // Drop old concentration
      this.db?.updateConcentrationInDB?.(casterCName, false);
      // Remove summoned creature if any
      if (caster.summonName) {
        this.db?.removePlayerFromDB?.(caster.summonName);
        this.db?.saveRollToDB({ cName: casterCName, type: 'STATUS',
          status: `${caster.summonName} vanishes (new concentration)`, ts: Date.now() });
      }
      this.db?.patchPlayerInDB(casterCName, {
        summonName: null, concentratingSpell: null, concentratingTarget: null
      });
    }
  }

  // ── CONCENTRATION CHECK ──────────────────────────────────────────────
  _checkConcentration(targetCName, target, damage) {
    if (!target.concentrating || damage <= 0) return;
    const dc = Math.max(10, Math.floor(damage / 2));
    const conScore = target._con ?? target.constitution ?? 10;
    const conMod = target.savingThrows?.constitution ?? Math.floor((conScore - 10) / 2);
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + conMod;
    const saved = total >= dc;
    if (!saved) window.toggleConcentration?.(targetCName, false);
    this.db?.saveRollToDB({
      type: 'CONCENTRATION', cName: targetCName,
      pName: target.pName || targetCName,
      conRoll: roll, conMod, conTotal: total, dc, saved,
      color: target.pColor || '#9b59b6', ts: Date.now(),
    });
  }

  // ── TEMP HP + DAMAGE APPLICATION ────────────────────────────────────
  async _applyDamage(targetCName, target, damage) {
    // Fetch fresh HP from Firebase to avoid stale data
    let currentHp = target.hp ?? target.maxHp ?? 0;
    let currentMaxHp = target.maxHp ?? currentHp;
    let tempHp = target.tempHp || 0;
    try {
      const fresh = await this.db?.getPlayerData?.(targetCName);
      if (fresh) {
        currentHp = fresh.hp ?? fresh.maxHp ?? currentHp;
        currentMaxHp = fresh.maxHp ?? currentMaxHp;
        tempHp = fresh.tempHp || 0;
      }
    } catch (_) { /* use cached values */ }

    const absorbed = Math.min(tempHp, damage);
    const realDmg = damage - absorbed;
    const newTempHp = tempHp - absorbed;
    const newHp = Math.max(0, currentHp - realDmg);
    this.db?.updatePlayerHPInDB(targetCName, newHp);
    if (newTempHp !== tempHp) this.db?.patchPlayerInDB(targetCName, { tempHp: newTempHp });
    this._checkConcentration(targetCName, target, damage);
    if (newHp <= 0) this.db?.addStatus?.(targetCName, 'Unconscious');
    return { newHp, absorbed, realDmg, oldHp: currentHp, maxHp: currentMaxHp };
  }

  // ── BUFF SPELL ────────────────────────────────────────────────────────
  async _flowBuff() {
    const spell = this.action; if (!spell) return this._hide();
    const a = this.attacker;
    const fx = SPELL_EFFECTS[spell.slug];
    const target = fx?.target === 'self' ? this.attackerCName : this.targetCName;

    this._setHeader(`\u2728 ${spell.name} <button class="wiz-close" id="wiz-x">\u2715</button>`);
    const effectDesc = Object.entries(fx?.effect || {}).map(([k,v]) => `${k}: ${v}`).join(', ');
    this._renderInfo(`${this.attackerCName} \u2192 ${target}`, effectDesc || 'Buff applied', '', false, false);
    this._bindCancel();

    if ((spell.level || 0) > 0) window.useSpellSlot?.(this.attackerCName, this.opts.castLevel || spell.level);

    // Apply buff effects
    const patch = {};
    const eff = fx?.effect || {};
    if (eff.acBonus) patch.acBonus = (patch.acBonus || 0) + eff.acBonus;
    if (eff.acBonusRanged) patch.acBonusRanged = eff.acBonusRanged;
    if (eff.setAC) patch.overrideAC = eff.setAC;
    if (eff.advNextAttack) patch.advNextAttack = true;
    if (eff.advStealth) patch.advStealth = true;
    if (eff.advPerception) patch.advPerception = true;
    if (eff.advPersuasion) patch.advPersuasion = true;
    if (eff.advSaves) patch.advSaves = true;
    if (eff.resistBPS) patch.resistBPS = true;
    if (eff.immuneTo) this.db?.addStatus?.(target, 'Immune:' + eff.immuneTo);
    if (eff.speedBonus) patch.speedBonus = eff.speedBonus;
    if (eff.noOA) patch.disengaged = true;
    if (eff.weaponBonusDice) patch.weaponBonusDice = eff.weaponBonusDice;
    if (eff.weaponBonusType) patch.weaponBonusType = eff.weaponBonusType;
    if (eff.weaponBonus) patch.weaponBonus = eff.weaponBonus;
    if (eff.checkBonus) patch.spellCheckBonus = eff.checkBonus;
    if (eff.saveBonus) patch.spellSaveBonus = eff.saveBonus;
    if (eff.attackBonus) patch.blessBonus = eff.attackBonus;

    if (Object.keys(patch).length) this.db?.patchPlayerInDB(target, patch);
    await this._dropOldConcentration(this.attackerCName);
    if (fx?.conc) {
      this.db?.updateConcentrationInDB?.(this.attackerCName, true);
      this.db?.patchPlayerInDB(this.attackerCName, { concentratingSpell: spell.slug, concentratingTarget: target });
    }

    this.db?.saveRollToDB({ type: 'SPELL', cName: this.attackerCName, pName: a.pName || this.attackerCName,
      target, spellName: spell.name, flavor: `${spell.name} \u2192 ${target}`,
      color: a.pColor || '#9b59b6', ts: Date.now() });

    this._appendBody(`<div class="wiz-result wiz-hit">\u2728 ${spell.name} applied to ${target}</div>`);
    await this._closeButton(); this._hide();
  }

  // ── TEMP HP SPELL ────────────────────────────────────────────────────
  async _flowTempHp() {
    const spell = this.action; if (!spell) return this._hide();
    const a = this.attacker, tgt = this.target;
    const fx = SPELL_EFFECTS[spell.slug];
    const target = fx?.target === 'self' ? this.attackerCName : this.targetCName;

    this._setHeader(`\uD83D\uDEE1 ${spell.name} <button class="wiz-close" id="wiz-x">\u2715</button>`);
    this._bindCancel();

    if ((spell.level || 0) > 0) window.useSpellSlot?.(this.attackerCName, this.opts.castLevel || spell.level);

    let tempHpGain = 0;
    if (fx?.dice) {
      this._renderInfo(`${this.attackerCName} \u2192 ${target}`, `Temp HP: ${fx.dice}`, '', false, false);
      await updateDiceColor('#f39c12');
      const roll = await this._rollStep(fx.dice, '\uD83D\uDEE1 Roll Temp HP');
      if (this.cancelled) return this._hide();
      tempHpGain = roll.reduce((s,d) => s + d.value, 0);
    } else if (fx?.flat) {
      const spellMod = a._resolved?.spellMod ?? Math.floor(((a._wis||a._cha||a._int||10)-10)/2);
      tempHpGain = fx.flat === 'spellMod' ? spellMod : (typeof fx.flat === 'number' ? fx.flat : 0);
      this._renderInfo(`${this.attackerCName} \u2192 ${target}`, `Temp HP: ${tempHpGain}`, '', false, false);
    }

    // Upcast bonus
    const castLevel = this.opts.castLevel || spell.level || 1;
    if (fx?.upcastFlat && castLevel > (spell.level || 1)) {
      tempHpGain += fx.upcastFlat * (castLevel - (spell.level || 1));
    }

    this.db?.patchPlayerInDB(target, { tempHp: Math.max(tempHpGain, (tgt.tempHp || 0)) });

    this.db?.saveRollToDB({ type: 'SPELL', cName: this.attackerCName, pName: a.pName || this.attackerCName,
      target, spellName: spell.name, flavor: `${spell.name}: +${tempHpGain} temp HP`,
      color: '#f39c12', ts: Date.now() });

    this._appendBody(`<div class="wiz-result wiz-hit">\uD83D\uDEE1 +${tempHpGain} Temporary HP</div>`);
    await this._dropOldConcentration(this.attackerCName);
    if (fx?.conc) this.db?.updateConcentrationInDB?.(this.attackerCName, true);

    await this._closeButton(); this._hide();
  }

  // ── SPECIAL SPELL (Magic Missile etc.) ───────────────────────────────
  async _flowSpecial() {
    const spell = this.action; if (!spell) return this._hide();
    const a = this.attacker, tgt = this.target;
    const fx = SPELL_EFFECTS[spell.slug];

    this._setHeader(`\u2728 ${spell.name} <button class="wiz-close" id="wiz-x">\u2715</button>`);
    this._bindCancel();

    if ((spell.level || 0) > 0) window.useSpellSlot?.(this.attackerCName, this.opts.castLevel || spell.level);

    if (fx?.autoHit && fx?.missiles) {
      // Magic Missile style: auto-hit missiles
      const castLevel = this.opts.castLevel || spell.level || 1;
      const numMissiles = fx.missiles + (fx.upcastMissiles || 0) * Math.max(0, castLevel - (spell.level || 1));
      this._renderInfo(`${this.attackerCName} \u2192 ${this.targetCName}`, `${numMissiles} missiles (auto-hit)`, '', false, false);

      await updateDiceColor(a.pColor || '#9b59b6');
      let totalDmg = 0;
      for (let i = 0; i < numMissiles; i++) {
        if (i > 0) { await this._delay(200); clearDice(); }
        const roll = await this._rollStep(fx.missileDice || '1d4+1', `Missile ${i+1}`);
        if (this.cancelled) return this._hide();
        const dmg = roll.reduce((s,d) => s + d.value, 0);
        totalDmg += dmg;
      }

      const { newHp, oldHp, maxHp } = await this._applyDamage(this.targetCName, tgt, totalDmg);
      this.db?.saveRollToDB({ type: 'SPELL', cName: this.attackerCName, target: this.targetCName,
        spellName: spell.name, damage: totalDmg, color: a.pColor || '#9b59b6', ts: Date.now() });
      this._showDmg(totalDmg, `${numMissiles}x ${fx.missileDice}`, oldHp, newHp, maxHp);
    }

    await this._closeButton(); this._hide();
  }

  // ── DETECT SPELL ─────────────────────────────────────────────────────
  async _flowDetect() {
    const spell = this.action; if (!spell) return this._hide();
    const a = this.attacker;
    const fx = SPELL_EFFECTS[spell.slug];

    this._setHeader(`\uD83D\uDD0D ${spell.name} <button class="wiz-close" id="wiz-x">\u2715</button>`);
    this._renderInfo(this.attackerCName, `Detecting: ${fx?.detects || 'magic'}`, '', false, false);
    this._bindCancel();

    if ((spell.level || 0) > 0) window.useSpellSlot?.(this.attackerCName, this.opts.castLevel || spell.level);
    await this._dropOldConcentration(this.attackerCName);
    if (fx?.conc) this.db?.updateConcentrationInDB?.(this.attackerCName, true);

    this.db?.addStatus?.(this.attackerCName, 'Detecting');
    this.db?.saveRollToDB({ type: 'SPELL', cName: this.attackerCName, pName: a.pName || this.attackerCName,
      spellName: spell.name, flavor: `${spell.name} active`,
      color: a.pColor || '#9b59b6', ts: Date.now() });

    this._appendBody(`<div class="wiz-result wiz-hit">\uD83D\uDD0D ${spell.name} active \u2014 detecting ${fx?.detects || 'magic'}</div>`);
    await this._closeButton(); this._hide();
  }

  // ── SUMMON SPELL ──────────────────────────────────────────────────────
  async _flowSummon() {
    const spell = this.action; if (!spell) return this._hide();
    const a = this.attacker;
    const fx = SPELL_EFFECTS[spell.slug];
    const summon = fx?.summon || { name: spell.name, hp: 1, ac: 10, speed: 30, type: 'creature' };

    this._setHeader(`\u2728 ${spell.name} <button class="wiz-close" id="wiz-x">\u2715</button>`);
    this._renderInfo(this.attackerCName, `Summon: ${summon.name}`, `HP: ${summon.hp}, AC: ${summon.ac}, Speed: ${summon.speed}ft`, false, false);
    this._bindCancel();

    if ((spell.level || 0) > 0) window.useSpellSlot?.(this.attackerCName, this.opts.castLevel || spell.level);

    // Spawn the creature as an NPC token
    const rollInit = Math.floor(Math.random() * 20) + 1;
    const tokenData = {
      name: summon.name,
      hp: summon.hp || 1,
      maxHp: summon.hp || 1,
      ac: summon.ac || 10,
      speed: summon.speed || 30,
      type: summon.type || 'beast',
      faction: 'ally',
      controller: this.attackerCName,
      summonedBy: this.attackerCName,
      isHidden: false,
      portrait: `https://api.dicebear.com/8.x/bottts/png?seed=${encodeURIComponent(summon.name)}`,
    };

    // Use the existing NPC spawn system
    if (typeof window.addNPCFromWizard === 'function') {
      window.addNPCFromWizard(summon.name, a.pColor || '#2ecc71', tokenData.portrait, rollInit, tokenData);
    }

    // Set concentration if spell requires it
    await this._dropOldConcentration(this.attackerCName);
    if (fx?.conc) {
      this.db?.updateConcentrationInDB?.(this.attackerCName, true);
      this.db?.patchPlayerInDB(this.attackerCName, {
        concentratingSpell: spell.slug,
        concentratingTarget: summon.name,
        summonName: summon.name
      });
    }

    this.db?.saveRollToDB({ type: 'SPELL', cName: this.attackerCName, pName: a.pName || this.attackerCName,
      spellName: spell.name, flavor: `Summoned ${summon.name} (Init: ${rollInit})`,
      color: a.pColor || '#2ecc71', ts: Date.now() });

    this._appendBody(`<div class="wiz-result wiz-hit">\u2728 ${summon.name} summoned! (Init: ${rollInit})</div>`);
    await this._closeButton(); this._hide();
  }

  // ── UI HELPERS ───────────────────────────────────────────────────────
  _renderInfo(title, sub, conds, adv, dis) {
    let h = `<div class="wiz-info-title">${title}</div><div class="wiz-info-sub">${sub}</div>`;
    if (conds) h += `<div class="wiz-info-conds">${conds}</div>`;
    if (adv) h += `<div class="wiz-info-mode wiz-adv">${t('wizard_advantage')||'Advantage'}</div>`;
    if (dis) h += `<div class="wiz-info-mode wiz-dis">${t('wizard_disadvantage')||'Disadvantage'}</div>`;
    this._setBody(h);
  }

  _showHitMiss(raw, bonus, total, ac, hit, crit, miss) {
    const cls = crit?'wiz-crit':hit?'wiz-hit':'wiz-miss';
    const lbl = crit?(t('wizard_crit')||'CRITICAL HIT!'):hit?(t('wizard_hit')||'HIT!'):(t('wizard_miss')||'MISS!');
    this._appendBody(`<div class="wiz-result ${cls}">[${raw}]+${bonus}=${total} vs AC ${ac}<br><strong>${lbl}</strong></div>`);
  }

  _showDmg(dmg, dice, oldHp, newHp, maxHp) {
    this._appendBody(`<div class="wiz-result wiz-dmg">${t('wizard_damage_roll')||'Damage'}: <strong>${dmg}</strong> (${dice})<br>${this.targetCName}: ${oldHp} &#x2192; ${newHp}/${maxHp||'?'} HP</div>`);
  }

  async _rollStep(notation, label) {
    return new Promise((resolve) => {
      const btn = document.createElement('button');
      btn.className = 'wiz-roll-btn';
      btn.textContent = `\uD83C\uDFB2 ${label}`;
      this._body.appendChild(btn);
      btn.onclick = async () => {
        btn.disabled = true; btn.textContent = '\uD83C\uDFB2...';
        try { resolve(await roll3DDice(notation)); }
        catch(e) {
          console.error('[Wizard] Dice error:', e);
          const m = notation.match(/(\d+)d(\d+)/);
          if (m) resolve(Array.from({length:parseInt(m[1])},()=>({value:Math.floor(Math.random()*parseInt(m[2]))+1})));
          else resolve([{value:Math.floor(Math.random()*20)+1}]);
        }
      };
    });
  }

  async _closeButton() {
    return new Promise(r => {
      const btn = document.createElement('button');
      btn.className = 'wiz-roll-btn wiz-btn-done';
      btn.textContent = t('wizard_close') || 'Done';
      this._body.appendChild(btn);
      btn.onclick = () => r();
    });
  }

  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  _doubleDice(d) { return d.replace(/^(\d+)/, m => String(parseInt(m)*2)); }

  _bindCancel() {
    const onCancel = () => {
      this.cancelled = true;
      this.db?.clearPendingReaction?.(this.targetCName);
      this.db?.clearPendingSave?.(this.targetCName);
      this._hide();
    };
    const bind = (q) => { const el = this._el?.querySelector(q); if (el) el.onclick = onCancel; };
    bind('#wiz-x'); bind('#wiz-cancel-btn2');
    this._el?.querySelectorAll('.wiz-close').forEach(el => { el.onclick = onCancel; });
  }
}

function _normDmg(a) { if (a.damage_dice) return a.damage_dice; const m = (a.desc||'').match(/(\d+d\d+(?:\s*\+\s*\d+)?)/); return m ? m[1].replace(/\s/g,'') : ''; }
function _dmgType(a) { const m = (a.desc||'').match(/(\w+)\s+damage/i); return m ? m[1].toLowerCase() : ''; }
