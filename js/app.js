// app.js v130  (S10-S16: foundation, data-health, UX, turn timer, portrait upload)

// ── Global Error Boundary ─────────────────────────────────────────────────────
// Catches unhandled promise rejections and runtime errors to prevent silent failures.
window.addEventListener('unhandledrejection', (e) => {
    console.error('[ParaDice] Unhandled promise rejection:', e.reason);
    if (typeof showToast === 'function') {
        showToast('Unexpected error — check console', 'warning', 4000);
    }
});
window.addEventListener('error', (e) => {
    // Ignore ResizeObserver loop errors (benign, caused by browser internals)
    if (e.message?.includes?.('ResizeObserver')) return;
    console.error('[ParaDice] Runtime error:', e.message, e.filename, e.lineno);
});

// Prevent browser zoom (Ctrl+scroll / Ctrl+plus/minus) — map has its own zoom
document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) e.preventDefault();
});

import { initDiceEngine, updateDiceColor, roll3DDice } from "./diceEngine.js";
import { getFlavorText } from "./messages.js";
import { unlockAudio, playRollSound, stopAllSounds, playStartRollSound, playHealSound, playDamageSound, playYourTurnSound } from "./audio.js";
import { updateModeUI, updateInitiativeUI, addLogEntry, setDiceCooldown } from "./ui.js";
import { escapeHtml } from "./core/sanitize.js";
import * as db from "./firebaseService.js";
import { pruneOrphanTokens } from "./firebaseService.js"; // S11: direct import prevents Rollup tree-shaking
import { t } from "./i18n.js";
import { npcDatabase } from "./monsters.js";
import { MapEngine } from "./mapEngine.js";
import { SceneWizard } from "./sceneWizard.js";

// ── Wave 2 imports ─────────────────────────────────────────────────────────────
import { openStatBlock, openStatBlockData, closeStatBlock } from "./statBlock.js";
import { openSpellPanel, closeSpellPanel } from "./spellPanel.js";
import { openNPCPanel, closeNPCPanel } from "./npcPanel.js";
import { generateNPC } from "./faker.js";
import { printHandout, openWatabou, captureMapCanvas } from "./handout.js"; // E7
import { iconHTML } from "./icons.js";
import { iconImg } from "./iconMap.js";
import { openDashboard } from "./accountDashboard.js";
import { getCurrentSub } from "./subscriptionService.js";
import { initMonsterBook } from "./monsterBook.js";
import { fetchMonsterBySlug, open5eToNPC } from "./open5e.js";
import { VideoLayer } from "./videoLayer.js";
import { initClassResources, onShortRest, onLongRest, WILD_SHAPES, getSelfActions, WILD_MAGIC_SURGES } from "./engine/classAbilities.js";
import { statusFlavor, healFlavor } from "./combatFlavor.js";
import { compute } from "./engine/charEngine.js";
import { skillMod, SKILL_ABILITIES, profBonus } from "./engine/combatUtils.js";
import { MusicPlayer, MUSIC_LIBRARY, MUSIC_CATEGORIES, TRACK_BY_ID } from "./musicPlayer.js";
import * as videoChat from "./videoChat.js";
import { makeDraggable, makeScrollable, ensureCloseButton } from "./core/draggable.js";
import { openActionWizard } from './engine/actionWizard.js';

// One-time migration: move old critroll_ keys to paradice_ prefix
['initBonus', 'cName'].forEach(k => {
    const v = localStorage.getItem('critroll_' + k);
    if (v) { localStorage.setItem('paradice_' + k, v); localStorage.removeItem('critroll_' + k); }
});

// Expose Wave 2 panels globally
window.openStatBlock     = openStatBlock;
window.openStatBlockData = openStatBlockData;
window.closeStatBlock    = closeStatBlock;
window.openSpellPanel    = openSpellPanel;
window.closeSpellPanel   = closeSpellPanel;
window.openNPCPanel      = openNPCPanel;
window.closeNPCPanel     = closeNPCPanel;

// Spawn NPC token from NPC panel into active scene
window._spawnNPCToken = function(npc) {
  if (!window._sceneWizardInstance) return;
  const token = {
    name:     npc.name,
    type:     npc.type || 'Humanoid',
    cr:       npc.cr || '0',
    hp:       npc.hp || 8,
    maxHp:    npc.hp || 8,
    ac:       npc.ac || 11,
    melee:    2,
    meleeDmg: '1d4',
    ranged:   0,
    rangedDmg:'1d4',
    isHidden: true,
    faction:  npc.faction || 'foe',
    img:      `https://api.dicebear.com/8.x/bottts/png?seed=${encodeURIComponent(npc.name)}&backgroundColor=7f8c8d`,
  };
  window._sceneWizardInstance._spawnToken?.(token);
};

// Upgrade toolbar icons from emoji → SVG after DOM ready
function _upgradeToolbarIcons() {
  document.querySelectorAll('.map-tb-icon.gi-tb').forEach(el => {
    const key   = el.dataset.gi;
    const color = '#ccc';
    const svg   = iconHTML(key, color, '20px');
    if (svg) { el.innerHTML = svg; el.style.display = 'flex'; el.style.alignItems = 'center'; }
  });
}

// getActiveRoom is available via db.getActiveRoom()

window.toggleDeathSave = async (targetCName, type, index) => {
    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    const saves = p.deathSaves || { successes: [false,false,false], failures: [false,false,false] };
    saves[type][index] = !saves[type][index];
    // Check win/lose conditions
    const wins  = saves.successes.filter(Boolean).length;
    const fails = saves.failures.filter(Boolean).length;
    if (wins >= 3) {
        saves.stable = true;
        db.saveRollToDB({ cName: targetCName, type: "STATUS", status: t('combat_stable').replace('{name}', targetCName), ts: Date.now() });
    }
    if (fails >= 3) {
        saves.dead = true;
        db.saveRollToDB({ cName: targetCName, type: "STATUS", status: t('combat_died').replace('{name}', targetCName), ts: Date.now() });
    }
    db.updateDeathSavesInDB(targetCName, saves);
};

window.resetDeathSaves = async (targetCName) => {
    db.updateDeathSavesInDB(targetCName, { successes: [false,false,false], failures: [false,false,false], stable: false, dead: false });
};

// ── Automated death save roll (D&D 5e rules) ────────────────────────────────
window.rollDeathSave = async (targetCName) => {
    if (isCooldown || !isDiceBoxReady) return;
    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    const saves = p.deathSaves || { successes: [false,false,false], failures: [false,false,false] };
    if (saves.stable || saves.dead) return;

    isCooldown = true; setDiceCooldown(true); playStartRollSound(isMuted);
    await updateDiceColor(p.pColor || '#e74c3c');
    let roll;
    try { roll = (await roll3DDice('1d20'))[0].value; }
    catch { isCooldown = false; setDiceCooldown(false); return; }

    let flavor = '';
    if (roll === 20) {
        // Nat 20: regain 1 HP, consciousness restored
        saves.successes = [false, false, false];
        saves.failures = [false, false, false];
        saves.stable = false;
        saves.dead = false;
        db.updatePlayerHPInDB(targetCName, 1);
        db.removeStatus(targetCName, 'Unconscious');
        flavor = `🎉 ${targetCName} ${t('death_save_nat20') || 'rolled a natural 20 — regains 1 HP!'}`;
    } else if (roll === 1) {
        // Nat 1: 2 failures
        let added = 0;
        for (let i = 0; i < 3 && added < 2; i++) { if (!saves.failures[i]) { saves.failures[i] = true; added++; } }
        flavor = `💀 ${targetCName} ${t('death_save_nat1') || 'rolled a natural 1 — 2 death save failures!'}`;
    } else if (roll >= 10) {
        // Success
        for (let i = 0; i < 3; i++) { if (!saves.successes[i]) { saves.successes[i] = true; break; } }
        flavor = `✅ ${targetCName} ${t('death_save_success') || 'succeeds a death save'} (${roll})`;
    } else {
        // Failure
        for (let i = 0; i < 3; i++) { if (!saves.failures[i]) { saves.failures[i] = true; break; } }
        flavor = `❌ ${targetCName} ${t('death_save_fail') || 'fails a death save'} (${roll})`;
    }

    // Check win/lose after roll
    const wins  = saves.successes.filter(Boolean).length;
    const fails = saves.failures.filter(Boolean).length;
    if (wins >= 3) { saves.stable = true; flavor += ` — ${t('combat_stable')?.replace('{name}', targetCName) || 'stabilized!'}`; }
    if (fails >= 3) { saves.dead = true; flavor += ` — ${t('combat_died')?.replace('{name}', targetCName) || 'dead!'}`; }

    db.updateDeathSavesInDB(targetCName, saves);
    db.saveRollToDB({ cName: targetCName, type: 'DEATH_SAVE', res: roll, color: p.pColor, flavor, ts: Date.now() });
    setTimeout(() => { isCooldown = false; setDiceCooldown(false); }, 1000);
};

window.toggleConcentration = async (targetCName) => {
    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    const newVal = !p.concentrating;
    db.updateConcentrationInDB(targetCName, newVal);
    db.saveRollToDB({ cName: targetCName, type: "STATUS", status: newVal ? `${iconImg('🔮','14px')} ${targetCName} is concentrating!` : `${iconImg('🔮','14px')} ${targetCName} lost concentration.`, ts: Date.now() });

    // Remove summoned creature when concentration breaks
    if (!newVal && p.summonName) {
        db.removePlayerFromDB(p.summonName);
        db.patchPlayerInDB(targetCName, { summonName: null, concentratingSpell: null, concentratingTarget: null });
        db.saveRollToDB({ cName: targetCName, type: 'STATUS', status: `${p.summonName} vanishes (concentration lost)`, ts: Date.now() });
    }
};

window.useSpellSlot = async (targetCName, level) => {
    const p = await db.getPlayerData(targetCName);
    if (!p || !p.spellSlots) return;
    const max  = p.spellSlots.max  || {};
    const used = p.spellSlots.used || {};
    const currentUsed = used[level] || 0;
    const maxForLevel = max[level]  || 0;
    if (currentUsed >= maxForLevel) return; // already exhausted
    const newUsed = { ...used, [level]: currentUsed + 1 };
    db.updateSpellSlotsInDB(targetCName, { max, used: newUsed });
    db.saveRollToDB({ cName: targetCName, type: "STATUS", status: t('combat_spell_used').replace('{name}', targetCName).replace('{level}', level).replace('{remaining}', maxForLevel - currentUsed - 1), ts: Date.now() });
};

window.restoreSpellSlot = async (targetCName, level) => {
    const p = await db.getPlayerData(targetCName);
    if (!p || !p.spellSlots) return;
    const max  = p.spellSlots.max  || {};
    const used = p.spellSlots.used || {};
    const currentUsed = used[level] || 0;
    if (currentUsed <= 0) return; // nothing to restore
    const newUsed = { ...used, [level]: currentUsed - 1 };
    db.updateSpellSlotsInDB(targetCName, { max, used: newUsed });
};

window.onSpellAdd = (spell) => {
    const target = window._spellAddTarget || cName || (userRole === 'dm' && activeRoller?.cName);
    if (!target) return;
    window._spellAddTarget = null; // one-shot override
    // Get vault IDs for cross-session persistence
    const targetPlayer = mapEngine?.S?.players?.[target] || {};
    const vaultUid = targetPlayer._vaultUid || window._vaultUid;
    const vaultId  = targetPlayer._vaultId  || window._vaultId;
    db.addSpellToBook(target, {
        slug:         spell.slug || spell.name,
        name:         spell.name,
        level:        spell.level_int ?? 0,
        school:       spell.school?.name || spell.school || '',
        range:        spell.range || '30 feet',
        casting_time: spell.casting_time || '1 action',
        damage_dice:   spell.damage?.damage_dice || '',
        attack_type:   spell.attack_type || '',
        dc_type:       spell.dc?.dc_type?.name || '',
        concentration: spell.concentration || false,
        higher_level:  spell.higher_level || '',
    }, vaultUid, vaultId);
    db.saveRollToDB({ cName: target, type: 'STATUS', status: statusFlavor('spellLearned', target, null, spell.name), ts: Date.now() });
};

window.removeSpellFromBook = (targetCName, slug) => {
    db.removeSpellFromBook(targetCName, slug);
};

// ── Inventory Management ────────────────────────────────────────────────────
window.addInventoryItem = async (cName) => {
    const name = prompt(t('inventory_add_name') || 'Item name:');
    if (!name) return;
    const qty = parseInt(prompt(t('inventory_add_qty') || 'Quantity:', '1')) || 1;
    const p = await db.getPlayerData(cName);
    const inv = Array.isArray(p?.inventory) ? [...p.inventory] : Object.values(p?.inventory || {});
    inv.push({ name, qty });
    db.patchPlayerInDB(cName, { inventory: inv });
};

window.removeInventoryItem = async (cName, idx) => {
    const p = await db.getPlayerData(cName);
    const inv = Array.isArray(p?.inventory) ? [...p.inventory] : Object.values(p?.inventory || {});
    inv.splice(idx, 1);
    db.patchPlayerInDB(cName, { inventory: inv });
};

// ── DM Spell Slot Editor ─────────────────────────────────────────────────────
window.editSpellSlots = async (targetCName) => {
    const p = await db.getPlayerData(targetCName);
    const current = p?.spellSlots?.max || {};
    const input = prompt(
        'Set max spell slots per level (1-9):\n' +
        'Format: level:max, level:max\n' +
        'Example: 1:4, 2:3, 3:2\n\n' +
        'Current: ' + (Object.entries(current).length
            ? Object.entries(current).sort(([a],[b])=>a-b).map(([l,m])=>`L${l}:${m}`).join(', ')
            : 'none'),
        Object.entries(current).sort(([a],[b])=>a-b).map(([l,m])=>`${l}:${m}`).join(', ')
    );
    if (!input) return;
    const max = {};
    input.split(',').forEach(part => {
        const [lv, slots] = part.trim().split(':').map(v => parseInt(v.trim()));
        if (lv >= 1 && lv <= 9 && slots > 0) max[lv] = slots;
    });
    if (!Object.keys(max).length) return;
    const used = p?.spellSlots?.used || {};
    db.updateSpellSlotsInDB(targetCName, { max, used });
    showToast(`${targetCName} spell slots updated`, 'success');
};

// ── Class Resources ────────────────────────────────────────────────────────────
window.patchClassResources = (targetCName, patch) => {
    db.patchClassResources(targetCName, patch);
};

// ── Class Ability Dispatcher ───────────────────────────────────────────────────
window.useClassAbility = async (targetCName, slug, extraCName = null) => {
    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    const cr  = p.classResources || {};
    const lvl = p.level || 1;

    switch (slug) {
        // ── Barbarian ──
        case 'rage': {
            if ((cr.rageUses ?? 0) <= 0) return;
            db.patchClassResources(targetCName, { raging: true, rageUses: (cr.rageUses ?? 1) - 1 });
            window.toggleStatus?.(targetCName, 'Raging');
            db.saveRollToDB({ cName: targetCName, type: 'STATUS', status: statusFlavor('rage', targetCName), ts: Date.now() });
            break;
        }
        case 'endRage': {
            db.patchClassResources(targetCName, { raging: false });
            // Remove Raging status if present
            const fresh = await db.getPlayerData(targetCName);
            if (Array.isArray(fresh?.statuses) && fresh.statuses.includes('Raging')) {
                window.toggleStatus?.(targetCName, 'Raging');
            }
            db.saveRollToDB({ cName: targetCName, type: 'STATUS', status: statusFlavor('endRage', targetCName), ts: Date.now() });
            break;
        }

        // ── Fighter ──
        case 'secondWind': {
            if ((cr.secondWind ?? 0) <= 0) return;
            const roll = Math.floor(Math.random() * 10) + 1 + lvl;
            const newHp = Math.min(p.maxHp || 999, (p.hp || 0) + roll);
            await db.updatePlayerHPInDB(targetCName, newHp);
            db.patchClassResources(targetCName, { secondWind: 0 });
            db.saveRollToDB({ cName: targetCName, type: 'HEAL', res: roll, newHp, maxHp: p.maxHp || newHp,
                color: '#2ecc71', flavor: statusFlavor('secondWind', targetCName), ts: Date.now() });
            showToast(`Second Wind: +${roll} HP → ${newHp}`, 'success');
            break;
        }
        case 'actionSurge': {
            if ((cr.actionSurge ?? 0) <= 0) return;
            db.patchClassResources(targetCName, { actionSurge: 0 });
            window.toggleStatus?.(targetCName, 'Hasted');
            db.saveRollToDB({ cName: targetCName, type: 'STATUS', status: statusFlavor('actionSurge', targetCName), ts: Date.now() });
            break;
        }

        // ── Rogue ──
        case 'hide': {
            window.toggleStatus?.(targetCName, 'Invisible');
            db.saveRollToDB({ cName: targetCName, type: 'STATUS', status: statusFlavor('hide', targetCName), ts: Date.now() });
            break;
        }

        // ── Ranger ──
        case 'huntersMark': {
            const prevMark = cr.huntersMark;
            if (prevMark && prevMark !== extraCName) {
                db.saveRollToDB({ cName: targetCName, type: 'STATUS', status: statusFlavor('moveHuntersMark', targetCName, extraCName), ts: Date.now() });
            } else if (!prevMark) {
                window.toggleStatus?.(targetCName, 'Concentrating');
                db.saveRollToDB({ cName: targetCName, type: 'STATUS', status: statusFlavor('huntersMark', targetCName, extraCName), ts: Date.now() });
            }
            db.patchClassResources(targetCName, { huntersMark: extraCName, huntingConc: true });
            break;
        }

        // ── Warlock ──
        case 'hex': {
            const prevHex = cr.hexTarget;
            if (prevHex && prevHex !== extraCName) {
                db.saveRollToDB({ cName: targetCName, type: 'STATUS', status: statusFlavor('moveHex', targetCName, extraCName), ts: Date.now() });
            } else if (!prevHex) {
                window.toggleStatus?.(targetCName, 'Concentrating');
                db.saveRollToDB({ cName: targetCName, type: 'STATUS', status: statusFlavor('hex', targetCName, extraCName), ts: Date.now() });
            }
            db.patchClassResources(targetCName, { hexTarget: extraCName, hexConc: true });
            break;
        }

        // ── Druid — Wild Shape ──
        case 'wildShape': {
            if ((cr.wildShapeUses ?? 0) <= 0) return;
            _openWildShapeModal(targetCName, false);
            break;
        }
        case 'endWildShape': {
            if (!cr.wildShapeOrig) return;
            const orig = cr.wildShapeOrig;
            db.updatePlayerHPInDB(targetCName, orig.hp);
            db.updatePlayerField(targetCName, 'maxHp',   orig.maxHp);
            db.updatePlayerField(targetCName, 'ac',      orig.ac);
            db.updatePlayerField(targetCName, 'melee',   orig.melee);
            db.updatePlayerField(targetCName, 'meleeDmg', orig.meleeDmg);
            db.updatePlayerField(targetCName, 'speed',   orig.speed);
            db.updatePlayerField(targetCName, 'portrait', orig.portrait);
            db.patchClassResources(targetCName, {
                wildShapeActive: false, wildShapeOrig: null,
                wildShapeUses: Math.max(0, (cr.wildShapeUses ?? 0) - 1),
            });
            // Remove Concentrating status used as shape indicator
            const freshD = await db.getPlayerData(targetCName);
            if (Array.isArray(freshD?.statuses) && freshD.statuses.includes('Concentrating')) {
                window.toggleStatus?.(targetCName, 'Concentrating');
            }
            db.saveRollToDB({ cName: targetCName, type: 'STATUS', status: statusFlavor('endWildShape', targetCName), ts: Date.now() });
            break;
        }

        // ── Druid — Summon Animal (DM only) ──
        case 'summonAnimal': {
            if (userRole !== 'dm' && targetCName !== cName) return;
            _openWildShapeModal(targetCName, true);
            break;
        }

        // ── Sorcerer — Wild Magic ──
        case 'tidesOfChaos': {
            const toc = cr.tidesOfChaos;
            const remaining = typeof toc === 'object' ? (toc.remaining ?? 0) : (toc ?? 0);
            if (remaining <= 0) return;
            const newToc = typeof toc === 'object'
                ? { ...toc, remaining: remaining - 1 }
                : { total: 1, remaining: 0 };
            db.patchClassResources(targetCName, { tidesOfChaos: newToc });
            db.saveRollToDB({ cName: targetCName, type: 'STATUS',
                status: t('combat_tides_chaos').replace('{name}', targetCName), ts: Date.now() });
            break;
        }
        case 'wildMagicSurge': {
            const surgeRoll = Math.floor(Math.random() * 20);
            const surgeText = WILD_MAGIC_SURGES[surgeRoll];
            db.saveRollToDB({ cName: targetCName, type: 'STATUS',
                status: `${iconImg('💥','14px')} Wild Magic Surge (d20=${surgeRoll + 1}): ${surgeText}`, ts: Date.now() });
            showToast(`Wild Magic Surge! ${surgeText}`, 'warning', 8000);
            break;
        }

        // ── Paladin — Sacred Weapon / Holy Nimbus ──
        case 'sacredWeapon': {
            window.toggleStatus?.(targetCName, 'Concentrating');
            db.patchClassResources(targetCName, { sacredWeaponActive: true });
            db.saveRollToDB({ cName: targetCName, type: 'STATUS',
                status: t('combat_divine_weapon').replace('{name}', targetCName).replace('{bonus}', profBonus(lvl)), ts: Date.now() });
            break;
        }

        // ── Paladin / Vengeance — Vow of Enmity ──
        case 'vowOfEnmity': {
            db.patchClassResources(targetCName, { vowTarget: extraCName });
            db.saveRollToDB({ cName: targetCName, type: 'STATUS',
                status: t('combat_vow_enmity').replace('{name}', targetCName).replace('{target}', extraCName || 'target'), ts: Date.now() });
            break;
        }

        // ── War Cleric — War Priest bonus attack ──
        case 'warPriest': {
            const wisModWP = p._resolved?.mods?.wis ?? 0;
            const wpUses   = cr.warPriestAttacks?.remaining ?? wisModWP;
            if (wpUses <= 0) { showToast(t('toast_war_priest_spent'), 'warning'); return; }
            const wpPatch  = typeof cr.warPriestAttacks === 'object'
                ? { warPriestAttacks: { ...cr.warPriestAttacks, remaining: wpUses - 1 } }
                : { warPriestAttacks: { total: wisModWP, remaining: wisModWP - 1 } };
            db.patchClassResources(targetCName, wpPatch);
            db.saveRollToDB({ cName: targetCName, type: 'STATUS',
                status: t('combat_war_priest').replace('{name}', targetCName).replace('{target}', extraCName || 'target'), ts: Date.now() });
            break;
        }

        // ── Ranger — Horde Breaker extra attack ──
        case 'hordeBreaker': {
            db.saveRollToDB({ cName: targetCName, type: 'STATUS',
                status: t('combat_horde_breaker').replace('{name}', targetCName).replace('{target}', extraCName || 'target'), ts: Date.now() });
            break;
        }

        // ── Ranger — Gloom Stalker Dread Ambusher ──
        case 'dreadAmbusher': {
            db.saveRollToDB({ cName: targetCName, type: 'STATUS',
                status: t('combat_dread_ambusher').replace('{name}', targetCName), ts: Date.now() });
            break;
        }

        // ── Beast Master — Command Companion ──
        case 'summonCompanion': {
            _openWildShapeModal(targetCName, true);
            break;
        }
        case 'companionAttack': {
            db.saveRollToDB({ cName: targetCName, type: 'STATUS',
                status: t('combat_companion_attack').replace('{name}', targetCName).replace('{target}', extraCName || 'target'), ts: Date.now() });
            break;
        }

        // ── Berserker — Frenzy ──
        case 'frenzy': {
            if (!(cr.raging)) { showToast(t('toast_frenzy_need_rage'), 'warning'); return; }
            db.patchClassResources(targetCName, { frenzyActive: true });
            db.saveRollToDB({ cName: targetCName, type: 'STATUS',
                status: t('combat_frenzy').replace('{name}', targetCName), ts: Date.now() });
            break;
        }

        // ── Berserker — Intimidating Presence ──
        case 'intimidatingPresence': {
            db.saveRollToDB({ cName: targetCName, type: 'STATUS',
                status: t('combat_intimidate').replace('{name}', targetCName).replace('{dc}', 8 + profBonus(lvl) + (p._resolved?.mods?.cha ?? 0)), ts: Date.now() });
            break;
        }

        // ── Archfey Warlock — Fey Presence ──
        case 'feyPresence': {
            db.saveRollToDB({ cName: targetCName, type: 'STATUS',
                status: t('combat_fey_presence').replace('{name}', targetCName).replace('{dc}', 8 + profBonus(lvl) + (p._resolved?.mods?.cha ?? 0)), ts: Date.now() });
            break;
        }

        // ── Archfey Warlock — Misty Escape ──
        case 'mistyEscape': {
            window.toggleStatus?.(targetCName, 'Invisible');
            db.saveRollToDB({ cName: targetCName, type: 'STATUS',
                status: t('combat_misty_escape').replace('{name}', targetCName), ts: Date.now() });
            break;
        }

        // ── Tempest Cleric — Wrath of the Storm / Warding Flare ──
        case 'wrathOfStorm': {
            const dcWoS = 8 + profBonus(lvl) + (p._resolved?.mods?.wis ?? 0);
            db.patchClassResources(targetCName, { channelDivinity: Math.max(0, (cr.channelDivinity ?? 0) - 1) });
            db.saveRollToDB({ cName: targetCName, type: 'STATUS',
                status: t('combat_wrath_storm').replace('{target}', extraCName || 'target').replace('{dc}', dcWoS), ts: Date.now() });
            break;
        }
        case 'wardingFlare': {
            db.saveRollToDB({ cName: targetCName, type: 'STATUS',
                status: t('combat_warding_flare').replace('{target}', extraCName || 'target'), ts: Date.now() });
            break;
        }

        // ── Monk ki abilities ──
        case 'flurryOfBlows': {
            if ((cr.kiPoints ?? 0) < 2) return;
            db.patchClassResources(targetCName, { kiPoints: Math.max(0, (cr.kiPoints ?? 0) - 2) });
            db.saveRollToDB({ cName: targetCName, type: 'RESOURCE', resourceName: `${iconImg('🥊','14px')} Flurry of Blows`,
                msg: `${targetCName} spends 2 ki — make 2 bonus unarmed strikes.`, ts: Date.now() });
            break;
        }
        case 'patientDefense': {
            if ((cr.kiPoints ?? 0) < 1) return;
            db.patchClassResources(targetCName, { kiPoints: Math.max(0, (cr.kiPoints ?? 0) - 1) });
            db.saveRollToDB({ cName: targetCName, type: 'RESOURCE', resourceName: `${iconImg('🛡️','14px')} Patient Defense`,
                msg: `${targetCName} spends 1 ki — take Dodge action as bonus action.`, ts: Date.now() });
            break;
        }
        case 'stepOfWind': {
            if ((cr.kiPoints ?? 0) < 1) return;
            db.patchClassResources(targetCName, { kiPoints: Math.max(0, (cr.kiPoints ?? 0) - 1) });
            db.saveRollToDB({ cName: targetCName, type: 'RESOURCE', resourceName: `${iconImg('💨','14px')} Step of the Wind`,
                msg: `${targetCName} spends 1 ki — Dash/Disengage as bonus action, jump distance doubled.`, ts: Date.now() });
            break;
        }
        case 'stunningStrike': {
            if ((cr.kiPoints ?? 0) < 1) return;
            const ssDC = 8 + profBonus(lvl) + (p._resolved?.mods?.wis ?? 0);
            db.patchClassResources(targetCName, { kiPoints: Math.max(0, (cr.kiPoints ?? 0) - 1) });
            db.saveRollToDB({ cName: targetCName, type: 'RESOURCE', resourceName: `${iconImg('⚡','14px')} Stunning Strike`,
                msg: `${targetCName} spends 1 ki — ${extraCName || 'target'} must CON save DC ${ssDC} or be Stunned until end of next turn.`, ts: Date.now() });
            break;
        }

        // ── Bard ──
        case 'bardicInspiration': {
            if ((cr.bardicInspiration ?? 0) <= 0) return;
            db.patchClassResources(targetCName, { bardicInspiration: Math.max(0, (cr.bardicInspiration ?? 1) - 1) });
            db.saveRollToDB({ cName: targetCName, type: 'RESOURCE', resourceName: `${iconImg('🎵','14px')} Bardic Inspiration`,
                msg: `${targetCName} grants Bardic Inspiration to ${extraCName || 'an ally'} — add the die to one roll.`, ts: Date.now() });
            break;
        }

        // ── Cleric ──
        case 'channelDivinity': {
            if ((cr.channelDivinity ?? 0) <= 0) return;
            db.patchClassResources(targetCName, { channelDivinity: Math.max(0, (cr.channelDivinity ?? 1) - 1) });
            db.saveRollToDB({ cName: targetCName, type: 'RESOURCE', resourceName: `${iconImg('✨','14px')} Channel Divinity`,
                msg: `${targetCName} channels divine power.`, ts: Date.now() });
            break;
        }

        // ── Paladin ──
        case 'layOnHands': {
            const loh = cr.layOnHandsHp ?? 0;
            if (loh <= 0) return;
            const healAmt = Math.min(loh, parseInt(prompt(`Lay on Hands: heal how many HP? (up to ${loh})`) || '0') || 0);
            if (healAmt <= 0) break;
            const curHp = p.hp || 0;
            const maxHpLoh = p._resolved?.maxHp ?? p.maxHp ?? 999;
            const newHpLoh = Math.min(maxHpLoh, curHp + healAmt);
            await db.updatePlayerHPInDB(targetCName, newHpLoh);
            db.patchClassResources(targetCName, { layOnHandsHp: loh - healAmt });
            db.saveRollToDB({ cName: targetCName, type: 'HEAL', res: healAmt, newHp: newHpLoh, maxHp: maxHpLoh,
                color: '#2ecc71', flavor: `${iconImg('🙏','14px')} ${targetCName} uses Lay on Hands — restored ${healAmt} HP (pool: ${loh-healAmt} remaining).`, ts: Date.now() });
            break;
        }
        case 'divineSense': {
            if ((cr.divineSense ?? 0) <= 0) return;
            db.patchClassResources(targetCName, { divineSense: Math.max(0, (cr.divineSense ?? 1) - 1) });
            db.saveRollToDB({ cName: targetCName, type: 'RESOURCE', resourceName: `${iconImg('👁️','14px')} Divine Sense`,
                msg: `${targetCName} uses Divine Sense — detects celestials, fiends, and undead within 60 ft until end of next turn.`, ts: Date.now() });
            break;
        }

        // ── Wizard ──
        case 'arcaneRecovery': {
            if ((cr.arcaneRecovery ?? 0) <= 0) return;
            db.patchClassResources(targetCName, { arcaneRecovery: 0 });
            db.saveRollToDB({ cName: targetCName, type: 'RESOURCE', resourceName: `${iconImg('📚','14px')} Arcane Recovery`,
                msg: `${targetCName} uses Arcane Recovery — regain spell slots totaling up to ${Math.ceil(lvl/2)} levels (short rest).`, ts: Date.now() });
            showToast(`Arcane Recovery: restore spell slots totaling ${Math.ceil(lvl/2)} levels`, 'info');
            break;
        }

        // ── Shadow Monk — Shadow Step ──
        case 'shadowStep': {
            if ((cr.kiPoints ?? 0) < 2) return;
            db.patchClassResources(targetCName, { kiPoints: Math.max(0, (cr.kiPoints ?? 0) - 2) });
            window.toggleStatus?.(targetCName, 'Invisible');
            db.saveRollToDB({ cName: targetCName, type: 'STATUS',
                status: t('combat_shadow_step').replace('{name}', targetCName), ts: Date.now() });
            break;
        }

        // ── Open Hand Monk — Wholeness of Body ──
        case 'wholenessOfBody': {
            const wbHeal = (p._resolved?.maxHp ?? p.maxHp ?? 1) * 3;
            const newHpWB = Math.min(p._resolved?.maxHp ?? p.maxHp ?? 999, (p.hp || 0) + wbHeal);
            await db.updatePlayerHPInDB(targetCName, newHpWB);
            db.saveRollToDB({ cName: targetCName, type: 'HEAL', res: wbHeal, newHp: newHpWB, maxHp: p._resolved?.maxHp ?? p.maxHp,
                color: '#2ecc71', flavor: `${iconImg('✨','14px')} Wholeness of Body: ${targetCName} regains ${wbHeal} HP!`, ts: Date.now() });
            break;
        }

        default: break;
    }
};

// ── Roll Save Check (from save-chip click in tracker card) ───────────────────
window.rollSaveCheck = async (cName, ability) => {
    const p = await db.getPlayerData(cName);
    if (!p) return;
    const resolved = p._resolved;
    const ab = ability.toLowerCase();
    const saveVal = resolved?.saves?.[ab] ?? Math.floor(((p['_'+ab] || 10) - 10) / 2);
    const roll = Math.floor(Math.random() * 20) + 1;
    // Resistance bonus: +1d4 to saving throws (one-use, then consumed)
    let resistBonus = 0;
    if (p.spellSaveBonus) {
        const match = p.spellSaveBonus.match(/(\d+)d(\d+)/);
        if (match) resistBonus = Math.floor(Math.random() * parseInt(match[2])) + 1;
        db.patchPlayerInDB?.(cName, { spellSaveBonus: null }); // consume
    }
    const total = roll + saveVal + resistBonus;
    const bonusNote = resistBonus ? ` +${resistBonus} Resistance` : '';
    db.saveRollToDB({ cName, type: 'ABILITY_CHECK', ability: `${ability} Save`,
        res: roll, mod: saveVal, total, color: p.pColor, ...(bonusNote ? { flavor: bonusNote } : {}), ts: Date.now() });
};

// ── Portent die use (Divination Wizard) ──────────────────────────────────────
window.usePortentDie = async (cName, dieIndex) => {
    const p = await db.getPlayerData(cName);
    if (!p) return;
    const pd = p.classResources?.portentDice;
    if (!pd?.rolls) return;
    const used = [...(pd.used || [])];
    if (used.includes(dieIndex)) return;
    used.push(dieIndex);
    db.patchClassResources(cName, { 'portentDice/used': used });
    db.saveRollToDB({ cName, type: 'PORTENT', portentValue: pd.rolls[dieIndex], color: p.pColor, ts: Date.now() });
    showToast(`Portent die [${pd.rolls[dieIndex]}] used — replace any d20 roll with this value`, 'info');
};

// ── EK/AT subclass spell slot tracking ───────────────────────────────────────
window.useSubclassSpellSlot = async (cName, level) => {
    const p = await db.getPlayerData(cName);
    if (!p) return;
    const subSlots = p._resolved?.subclassSpellSlots;
    if (!subSlots?.[level]) return;
    const usedObj = { ...(p.subclassSpellSlotsUsed || {}) };
    const max = subSlots[level];
    const used = (usedObj[level] || 0) + 1;
    if (used > max) return;
    usedObj[level] = used;
    db.patchPlayerInDB(cName, { subclassSpellSlotsUsed: usedObj });
};

window.restoreSubclassSpellSlot = async (cName, level) => {
    const p = await db.getPlayerData(cName);
    if (!p) return;
    const usedObj = { ...(p.subclassSpellSlotsUsed || {}) };
    if (!usedObj[level]) return;
    usedObj[level] = Math.max(0, (usedObj[level] || 0) - 1);
    db.patchPlayerInDB(cName, { subclassSpellSlotsUsed: usedObj });
};

// ── Wild Shape modal helper ────────────────────────────────────────────────────
function _openWildShapeModal(forCName, summonMode) {
    const modal = document.getElementById('wild-shape-modal');
    if (!modal) return;
    document.getElementById('ws-modal-title').textContent = summonMode ? t('ws_summon_title') : t('ws_title');
    const list = document.getElementById('ws-beast-list');
    list.innerHTML = WILD_SHAPES.map(b => `
      <div class="ws-beast-card" data-id="${b.id}" style="background:#2a1a3e;border:1px solid #8e44ad;border-radius:8px;padding:12px;cursor:pointer;text-align:center;">
        <div style="font-size:1.4rem;">${_beastEmoji(b.id)}</div>
        <div style="font-weight:700;color:#e8d5ff;">${b.name}</div>
        <div style="font-size:0.78rem;color:#aaa;">HP ${b.hp} · AC ${b.ac} · +${b.melee} (${b.meleeDmg})</div>
        <div style="font-size:0.72rem;color:#888;">CR ${b.cr} · Speed ${b.speed}ft</div>
      </div>
    `).join('');
    modal.style.display = 'flex';
    list.querySelectorAll('.ws-beast-card').forEach(card => {
        card.addEventListener('click', async () => {
            modal.style.display = 'none';
            const beast = WILD_SHAPES.find(b => b.id === card.dataset.id);
            if (!beast) return;
            if (summonMode) {
                // Spawn as NPC token
                window._spawnNPCToken?.({
                    name: beast.name, hp: beast.hp, maxHp: beast.maxHp,
                    ac: beast.ac, melee: beast.melee, meleeDmg: beast.meleeDmg,
                    speed: beast.speed, portrait: `https://api.dicebear.com/7.x/adventurer/svg?seed=${beast.portrait}`,
                    size: 'Medium', isHidden: false,
                });
                db.saveRollToDB({ cName: forCName, type: 'STATUS',
                    status: statusFlavor('summonAnimal', forCName, null, beast.name), ts: Date.now() });
            } else {
                // Transform player
                const p = await db.getPlayerData(forCName);
                if (!p) return;
                const orig = {
                    hp: p.hp, maxHp: p.maxHp, ac: p.ac,
                    melee: p.melee, meleeDmg: p.meleeDmg,
                    speed: p.speed, portrait: p.portrait,
                };
                db.updatePlayerHPInDB(forCName, beast.hp);
                db.updatePlayerField(forCName, 'maxHp',    beast.maxHp);
                db.updatePlayerField(forCName, 'ac',       beast.ac);
                db.updatePlayerField(forCName, 'melee',    beast.melee);
                db.updatePlayerField(forCName, 'meleeDmg', beast.meleeDmg);
                db.updatePlayerField(forCName, 'speed',    beast.speed);
                db.updatePlayerField(forCName, 'portrait', `https://api.dicebear.com/7.x/adventurer/svg?seed=${beast.portrait}`);
                db.patchClassResources(forCName, { wildShapeActive: true, wildShapeOrig: orig });
                window.toggleStatus?.(forCName, 'Concentrating');
                db.saveRollToDB({ cName: forCName, type: 'STATUS',
                    status: statusFlavor('wildShape', forCName, null, beast.name), ts: Date.now() });
            }
        });
    });
    // Close on backdrop click
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; }, { once: true });
}

function _beastEmoji(id) {
    const map = { wolf: '🐺', brown_bear: '🐻', panther: '🐆', eagle: '🦅' };
    const emoji = map[id] || '🐾';
    return iconImg(emoji, '28px');
}

window.longRest = async (targetCName) => {
    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    // Restore HP to max
    db.updatePlayerHPInDB(targetCName, p.maxHp);
    // Restore all spell slots
    if (p.spellSlots) db.updateSpellSlotsInDB(targetCName, { max: p.spellSlots.max, used: {} });
    // Remove dying state
    db.updateDeathSavesInDB(targetCName, { successes:[false,false,false], failures:[false,false,false], stable:false, dead:false });
    // Reset class resources
    const lrPatch = onLongRest(p);
    if (Object.keys(lrPatch).length) db.patchClassResources(targetCName, lrPatch);
    // Restore hit dice (regain up to half total on long rest) and clear temp HP
    const totalHD = p.level || 1;
    const currentHD = p.hdRemaining ?? p.hdLeft ?? totalHD;
    const regained  = Math.max(1, Math.floor(totalHD / 2));
    db.patchPlayerInDB(targetCName, {
        hdRemaining: Math.min(totalHD, currentHD + regained),
        hdLeft:      Math.min(totalHD, currentHD + regained),
        tempHp: 0,
    });
    db.saveRollToDB({ cName: targetCName, type: "STATUS", status: statusFlavor('longRest', targetCName), ts: Date.now() });
};

window.rerollAllInitiatives = async () => {
    if (userRole !== 'dm') return;
    const ok = await crConfirm(t('reroll_confirm_msg'), t('reroll_confirm_title'), iconImg('🎲','18px'), t('reroll_confirm_ok'), t('confirm_cancel'));
    if (!ok) return;
    // Reset turn to 0
    currentActiveTurn  = 0;
    currentRoundNumber = 1;
    db.setActiveTurn(0, 1);
    // Re-roll each non-DM combatant
    for (const c of sortedCombatants) {
        const p = await db.getPlayerData(c.name);
        if (!p) continue;
        const initBonus = p.initBonus || 0;
        const newScore  = Math.floor(Math.random() * 20) + 1 + initBonus;
        db.setPlayerInitiativeInDB(c.name, p.pName || c.name, newScore, p.pColor || '#e74c3c');
    }
    db.saveRollToDB({ cName: "DM", type: "STATUS", status: `${iconImg('🎲','14px')} Initiatives re-rolled! Round 1`, ts: Date.now() });
};


// =====================================================================
// UI SYSTEM — Toast, Spinner, ConfirmModal (Sprint 12)
// =====================================================================
let _confirmResolve = null;

// Show a non-blocking toast notification
// type: 'success' | 'error' | 'info' | 'warning'
let _lastToastMsg = '', _lastToastTime = 0;
export function showToast(msg, type='info', durationMs=3000) {
    // Deduplicate identical toasts within 2 seconds
    const now = Date.now();
    if (msg === _lastToastMsg && now - _lastToastTime < 2000) return;
    _lastToastMsg = msg; _lastToastTime = now;
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success:'/assets/icons/toolbar/advantage.png', error:'/assets/icons/toolbar/disadvantage.png', info:'/assets/icons/toolbar/spells.png', warning:'/assets/icons/toolbar/combat.png' };
    const el = document.createElement('div');
    el.className = `cr-toast ${type}`;
    el.innerHTML = `<span><img src="${icons[type]||icons.info}" alt="${type}" class="custom-icon" style="width:18px;height:18px;" loading="lazy"></span><span>${msg}</span>`;
    container.appendChild(el);
    const remove = () => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 320); };
    const timer = setTimeout(remove, durationMs);
    el.addEventListener('click', () => { clearTimeout(timer); remove(); });
}
window.showToast = showToast;

/** Lair action prompt — shown to DM at the top of each round for lair-capable monsters. */
function _showLairActionPrompt(npcName, lairActions) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const esc = s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const el = document.createElement('div');
    el.className = 'cr-toast lair-prompt';
    el.style.cssText = 'cursor:default; min-width:220px; max-width:280px; padding:10px 12px;';
    const shown = lairActions.slice(0, 4);
    el.innerHTML = `
        <div style="font-weight:700; margin-bottom:5px;">${iconImg('🏰', '18px', 'Lair')} Lair Actions — ${esc(npcName)}</div>
        <div style="display:flex; flex-direction:column; gap:4px;">
            ${shown.map((a, i) => `
                <button class="lair-action-btn" data-idx="${i}"
                    style="text-align:left; padding:5px 8px; background:rgba(52,152,219,0.15);
                           border:1px solid rgba(52,152,219,0.4); color:white; border-radius:5px;
                           cursor:pointer; font-size:11px; line-height:1.3;"
                    title="${esc(a.desc || '')}">
                    ${esc(a.name)}
                </button>`).join('')}
            <button class="lair-skip-btn"
                style="padding:4px; background:transparent; border:1px solid rgba(255,255,255,0.15);
                       color:#888; border-radius:5px; cursor:pointer; font-size:11px;">
                ✗ Skip
            </button>
        </div>
    `;
    container.appendChild(el);
    const remove = () => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 320); };
    const timer = setTimeout(remove, 12000);
    el.querySelectorAll('.lair-action-btn').forEach(btn => {
        btn.onclick = () => {
            const action = shown[parseInt(btn.dataset.idx)];
            db.saveRollToDB({ cName: npcName, type: 'STATUS',
                status: `${iconImg('🏰','14px')} Lair Action: ${action.name}${action.desc ? ' — ' + action.desc.slice(0, 80) + (action.desc.length > 80 ? '…' : '') : ''}`,
                ts: Date.now() });
            clearTimeout(timer); remove();
        };
    });
    el.querySelector('.lair-skip-btn').onclick = () => { clearTimeout(timer); remove(); };
}

/** Opportunity attack prompt — shown to DM when a hostile token leaves threat range. */
function _showOAPrompt(attackerName, targetName, onAttack) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const esc = s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const el = document.createElement('div');
    el.className = 'cr-toast oa-prompt';
    el.style.cssText = 'cursor:default; min-width:210px; padding:10px 12px;';
    el.innerHTML = `
        <div style="font-weight:700; margin-bottom:5px;">${iconImg('🗡️', '18px', 'Dagger')} Opportunity Attack!</div>
        <div style="font-size:12px; margin-bottom:8px; opacity:0.9;">
            <strong>${esc(attackerName)}</strong> → <strong>${esc(targetName)}</strong> is leaving!
        </div>
        <div style="display:flex; gap:6px;">
            <button class="oa-yes-btn" style="flex:1; padding:5px; background:#e74c3c; border:none; color:white; border-radius:5px; cursor:pointer; font-weight:700; font-size:12px;">${iconImg('⚔️', '14px', 'Attack')} Attack!</button>
            <button class="oa-no-btn"  style="flex:1; padding:5px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.25); color:white; border-radius:5px; cursor:pointer; font-size:12px;">✗ Skip</button>
        </div>
    `;
    container.appendChild(el);
    const remove = () => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 320); };
    const timer = setTimeout(remove, 8000);
    el.querySelector('.oa-yes-btn').onclick = () => { clearTimeout(timer); remove(); onAttack(); };
    el.querySelector('.oa-no-btn').onclick  = () => { clearTimeout(timer); remove(); };
}

/** Save prompt — shown to a player when another player/DM targets them with a save spell. */
function _showSavePrompt(data) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    // Remove old save prompt if any
    container.querySelector('.save-prompt')?.remove();

    const el = document.createElement('div');
    el.className = 'cr-toast save-prompt';
    el.style.cssText = 'min-width:240px; padding:12px 14px; cursor:default;';

    const saveType = (data.saveType || 'wis').toUpperCase();
    const dc = data.dc || 10;

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700; margin-bottom:6px; color:#e6b800;';
    title.textContent = '\u2728 ' + (t('wizard_save_roll') || 'Saving Throw');
    el.appendChild(title);

    const info = document.createElement('div');
    info.style.cssText = 'font-size:13px; margin-bottom:8px; color:#ddd;';
    info.textContent = `${data.casterCName} \u2192 ${data.spellName || 'Spell'}`;
    el.appendChild(info);

    const dcLine = document.createElement('div');
    dcLine.style.cssText = 'font-size:12px; color:#aaa; margin-bottom:10px;';
    dcLine.textContent = `DC ${dc} ${saveType} Save`;
    el.appendChild(dcLine);

    const btn = document.createElement('button');
    btn.style.cssText = 'width:100%; padding:10px; background:#8e44ad; border:none; color:white; border-radius:6px; cursor:pointer; font-weight:700; font-size:14px;';
    btn.textContent = '\uD83C\uDFB2 ' + (t('wizard_save_roll') || 'Roll Save');
    btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = '\uD83C\uDFB2...';
        const p = await db.getPlayerData(cName);
        const saveMod = p?.savingThrows?.[data.saveType] ?? Math.floor(((p?.['_' + data.saveType] || 10) - 10) / 2);
        await updateDiceColor(p?.pColor || '#3498db');
        let rollVal;
        try { rollVal = (await roll3DDice('1d20'))[0].value; }
        catch { rollVal = Math.floor(Math.random() * 20) + 1; }
        const total = rollVal + saveMod;
        const saved = total >= dc;

        // Show result on own screen
        const resultEl = document.createElement('div');
        resultEl.style.cssText = `font-size:14px; font-weight:700; margin-top:8px; color:${saved ? '#2ecc71' : '#e74c3c'};`;
        resultEl.textContent = `[${rollVal}]+${saveMod}=${total} vs DC ${dc} \u2014 ${saved ? '\u2713 Saved!' : '\u2717 Failed!'}`;
        el.appendChild(resultEl);

        // Submit result to Firebase for caster's wizard
        db.submitSaveResult(cName, { roll: rollVal, mod: saveMod, total, saved });

        // Log to combat log
        db.saveRollToDB({ cName, type: 'SAVE', ability: `${saveType} Save`, res: rollVal, mod: saveMod, total, color: p?.pColor, ts: Date.now() });

        // Remove prompt after 3 seconds
        setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 320); }, 3000);
    };
    el.appendChild(btn);

    container.appendChild(el);

    // Auto-remove after 30 seconds if not acted on
    setTimeout(() => { if (el.parentElement) { el.classList.add('fade-out'); setTimeout(() => el.remove(), 320); } }, 30000);
}

/** Reaction prompt — shown to a player when they can react (Shield, Uncanny Dodge) to an incoming attack. */
function _showReactionPrompt(data) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    container.querySelector('.reaction-prompt')?.remove();

    const el = document.createElement('div');
    el.className = 'cr-toast reaction-prompt';
    el.style.cssText = 'min-width:240px; padding:12px 14px; cursor:default;';

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700; margin-bottom:6px; color:#e67e22;';
    title.textContent = '\u26A1 Reaction Available!';
    el.appendChild(title);

    const info = document.createElement('div');
    info.style.cssText = 'font-size:13px; margin-bottom:8px; color:#ddd;';
    info.textContent = `${data.attackerCName} attacks you \u2014 ${data.reactionName || 'Use reaction?'}`;
    el.appendChild(info);

    const btnYes = document.createElement('button');
    btnYes.style.cssText = 'width:48%; padding:8px; background:#e67e22; border:none; color:white; border-radius:6px; cursor:pointer; font-weight:700; margin-right:4%;';
    btnYes.textContent = '\u2713 Use ' + (data.reactionName || 'Reaction');
    btnYes.onclick = async () => {
        btnYes.disabled = true;
        // Submit reaction result
        db.submitReactionResult(cName, { used: true, reactionType: data.reactionType });
        // Consume resource (spell slot, reaction action)
        if (data.slotLevel) window.useSpellSlot?.(cName, data.slotLevel);
        db.patchPlayerInDB(cName, { reactionUsed: true });

        const result = document.createElement('div');
        result.style.cssText = 'margin-top:8px; font-weight:700; color:#e67e22;';
        result.textContent = `${data.reactionName} used!`;
        el.appendChild(result);
        setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 320); }, 2000);
    };
    el.appendChild(btnYes);

    const btnNo = document.createElement('button');
    btnNo.style.cssText = 'width:48%; padding:8px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.3); color:#aaa; border-radius:6px; cursor:pointer;';
    btnNo.textContent = '\u2717 Skip';
    btnNo.onclick = () => {
        db.submitReactionResult(cName, { used: false });
        el.classList.add('fade-out');
        setTimeout(() => el.remove(), 320);
    };
    el.appendChild(btnNo);

    container.appendChild(el);

    // Auto-skip after 15 seconds
    setTimeout(() => {
        if (el.parentElement && !el.querySelector('[disabled]')) {
            db.submitReactionResult(cName, { used: false, timeout: true });
            el.classList.add('fade-out');
            setTimeout(() => el.remove(), 320);
        }
    }, 15000);
}

// Show/hide the loading spinner overlay
export function showSpinner(label='Loading…') {
    const el = document.getElementById('cr-spinner-overlay');
    const lbl = document.getElementById('cr-spinner-label');
    if (lbl) lbl.textContent = label;
    el?.classList.add('active');
}
export function hideSpinner() {
    document.getElementById('cr-spinner-overlay')?.classList.remove('active');
}
window.showSpinner = showSpinner;
window.hideSpinner = hideSpinner;

// Styled replacement for native confirm()
// Returns a Promise<boolean>
export function crConfirm(msg, title='Are you sure?', icon=iconImg('⚠️','18px'), okLabel='Confirm', cancelLabel='Cancel') {
    return new Promise(resolve => {
        const overlay = document.getElementById('cr-confirm-overlay');
        if (!overlay) { resolve(window.confirm(msg)); return; }  // fallback
        document.getElementById('cr-confirm-icon').innerHTML     = iconImg(icon, '28px');
        document.getElementById('cr-confirm-title').textContent = title;
        document.getElementById('cr-confirm-msg').textContent   = msg;
        document.getElementById('cr-confirm-ok').textContent     = okLabel;
        document.getElementById('cr-confirm-cancel').textContent = cancelLabel;
        overlay.classList.add('open');
        _confirmResolve = resolve;
        // Focus the cancel button by default (safer)
        setTimeout(() => document.getElementById('cr-confirm-cancel')?.focus(), 50);
    });
}
window.crConfirm = crConfirm;

// Wire confirm modal buttons (called once on DOM ready)
function _initConfirmModal() {
    document.getElementById('cr-confirm-ok')?.addEventListener('click', () => {
        document.getElementById('cr-confirm-overlay').classList.remove('open');
        _confirmResolve?.(true);
    });
    document.getElementById('cr-confirm-cancel')?.addEventListener('click', () => {
        document.getElementById('cr-confirm-overlay').classList.remove('open');
        _confirmResolve?.(false);
    });
    // ESC key closes confirm modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('cr-confirm-overlay');
            if (overlay?.classList.contains('open')) {
                overlay.classList.remove('open');
                _confirmResolve?.(false);
            }
            if (document.getElementById('scene-wizard-modal')?.classList.contains('wiz-open')) {
                window._wizard?.close();
            }
        }
        // S12: Enter key rolls the active die when not typing in an input
        if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey) {
            const tag = document.activeElement?.tagName;
            if (['INPUT','TEXTAREA','SELECT','BUTTON'].includes(tag)) return;
            const btn = document.querySelector('.dice-btn.active') ||
                        document.getElementById('roll-d20-btn') ||
                        document.querySelector('.dice-btn');
            if (btn) { e.preventDefault(); btn.click(); }
        }
    });
}
document.addEventListener('DOMContentLoaded', _initConfirmModal);
document.addEventListener('DOMContentLoaded', _upgradeToolbarIcons);
document.addEventListener('DOMContentLoaded', () => {
    // Clone dice buttons from hidden #custom-dice-menu into HUD toolbar dice zone
    const diceSrc  = document.getElementById('custom-dice-menu');
    const diceDest = document.getElementById('hud-dice-zone');
    if (diceSrc && diceDest) {
        diceSrc.querySelectorAll('.dice-btn').forEach(btn => {
            diceDest.appendChild(btn.cloneNode(true));
        });
    }
    // Populate dice popup grid (same source, close popup on click)
    const dicePopupGrid = document.getElementById('dice-popup-grid');
    if (diceSrc && dicePopupGrid) {
        diceSrc.querySelectorAll('.dice-btn').forEach(btn => {
            const clone = btn.cloneNode(true);
            const orig = clone.getAttribute('onclick') || '';
            clone.setAttribute('onclick', orig + '; window.closeDicePopup();');
            dicePopupGrid.appendChild(clone);
        });
    }
    // Dice popup controls
    window.toggleDicePopup = () => {
        const panel    = document.getElementById('dice-popup-panel');
        const backdrop = document.getElementById('dice-popup-backdrop');
        if (!panel) return;
        const wasHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !wasHidden);
        if (backdrop) backdrop.classList.toggle('hidden', !wasHidden);
    };
    window.closeDicePopup = () => {
        document.getElementById('dice-popup-panel')?.classList.add('hidden');
        document.getElementById('dice-popup-backdrop')?.classList.add('hidden');
    };
    window.setDiceMult = (n) => {
        diceMultiplier = n;
        const badge = document.getElementById('dice-mult-badge');
        if (badge) badge.textContent = `×${n}`;
        document.querySelectorAll('.mult-btn').forEach(b => {
            b.classList.toggle('active', parseInt(b.dataset.mult) === n);
        });
    };
    // DM-only tool buttons: hide for non-DM (role assigned later, so re-hide on role set)
    window._applyDMVisibility = (isDM) => {
        document.querySelectorAll('.hud-tool-btn.dm-only').forEach(btn => {
            btn.style.display = isDM ? '' : 'none';
        });
    };

    // Numeral keyboard shortcuts: 1–9 → trigger custom action slot
    document.addEventListener('keydown', (e) => {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        const n = parseInt(e.key);
        if (!isNaN(n) && n >= 1 && n <= 9) window.triggerAction?.(n - 1);
    });
});

// =====================================================================
// GLOBALS
// =====================================================================
let uid = null;   // set by lobby.js via setUid() after auth
export function setUid(u) { uid = u; }

let isDiceBoxReady = false;
let pName = "", cName = "", pColor = "#3498db", userRole = "player", charPortrait = "";
let isMuted = false, isCooldown = false, canAnimate = false;
let activeMode = 'normal';
let activeRoller = null;
let diceMultiplier = 1;

let currentActiveTurn  = null;
let currentRoundNumber = 0;
let sortedCombatants   = [];
let prevActiveTurn     = null;   // track changes for YOUR TURN detection
// ── Map Engine (Sprint 7) ──────────────────────────────────────────────
let mapEngine = null;
let sceneWizard = null;
let activeSceneId = null;
// App-level Firebase listener unsubscribers (cleaned up on logout/room change)
let _appUnsubs = [];

// ── Background Music ──────────────────────────────────────────────────────────
const musicPlayer = new MusicPlayer();
musicPlayer.onBlocked(() => showToast('Click anywhere to start music', 'info'));
// Unlock pending autoplay on the first user gesture — self-removing via { once: true }
const _unlockMusic = () => musicPlayer.unlock();
document.addEventListener('click',      _unlockMusic, { once: true });
document.addEventListener('keydown',    _unlockMusic, { once: true });
document.addEventListener('touchstart', _unlockMusic, { once: true, passive: true });
let _musicPanelOpen = false;
let _musicActiveCat = 'battle';
let _musicPanelBuilt = false;

function _buildMusicPanel() {
    if (_musicPanelBuilt) return;
    _musicPanelBuilt = true;

    // Category tabs
    const tabContainer = document.getElementById('music-cat-tabs');
    if (!tabContainer) return;
    MUSIC_CATEGORIES.forEach(cat => {
        const btn = document.createElement('button');
        btn.dataset.cat = cat.id;
        btn.textContent = cat.label;
        btn.style.cssText = 'background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);color:#ccc;border-radius:20px;padding:3px 10px;font-size:11px;cursor:pointer;transition:all .15s;';
        btn.onclick = () => { _musicActiveCat = cat.id; _renderMusicTracks(); _highlightMusicCat(); };
        tabContainer.appendChild(btn);
    });
    _renderMusicTracks();
    _highlightMusicCat();
    _updateMusicNowPlaying();

    musicPlayer.onChange(() => {
        _updateMusicNowPlaying();
        _renderMusicTracks();
    });
    musicPlayer.onError(track => showToast(`Track unavailable: ${track.title}`, 'warning'));
}

function _highlightMusicCat() {
    document.querySelectorAll('#music-cat-tabs button').forEach(btn => {
        const active = btn.dataset.cat === _musicActiveCat;
        btn.style.background  = active ? 'rgba(155,89,182,0.35)' : 'rgba(255,255,255,0.07)';
        btn.style.borderColor = active ? 'rgba(155,89,182,0.7)'  : 'rgba(255,255,255,0.15)';
        btn.style.color       = active ? '#d7b8f3' : '#ccc';
    });
}

function _renderMusicTracks() {
    const list = document.getElementById('music-track-list');
    if (!list) return;
    const tracks = MUSIC_LIBRARY[_musicActiveCat] || [];
    list.innerHTML = '';
    tracks.forEach(track => {
        const isPlaying = musicPlayer.currentId === track.id && musicPlayer.playing;
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;cursor:pointer;
            background:${isPlaying ? 'rgba(155,89,182,0.25)' : 'rgba(255,255,255,0.04)'};
            border:1px solid ${isPlaying ? 'rgba(155,89,182,0.5)' : 'rgba(255,255,255,0.08)'};
            transition:background .15s;`;
        row.innerHTML = `
            <span style="font-size:18px;flex-shrink:0;">${isPlaying ? '▶' : '▷'}</span>
            <div style="flex:1;min-width:0;">
                <div style="color:${isPlaying ? '#d7b8f3' : 'white'};font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</div>
                <div style="color:rgba(255,255,255,0.4);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.artist}</div>
            </div>`;
        row.onclick = () => window._musicPlay(track.id);
        list.appendChild(row);
    });
}

function _updateMusicNowPlaying() {
    const el = document.getElementById('music-now-playing');
    const muteBtn = document.getElementById('music-mute-btn');
    if (!el) return;
    const track = TRACK_BY_ID[musicPlayer.currentId];
    if (track && musicPlayer.playing) {
        el.textContent = `▶ ${track.title}`;
    } else if (musicPlayer.currentId && !musicPlayer.playing) {
        el.textContent = `⏸ ${TRACK_BY_ID[musicPlayer.currentId]?.title || ''}`;
    } else {
        el.textContent = t('music_no_track');
    }
    if (muteBtn) muteBtn.innerHTML = musicPlayer.localMuted ? iconImg('🔇', '18px', 'Muted') : iconImg('🔊', '18px', 'Unmuted');
    // Player music button — visible when music is active (all roles)
    const playerBtn = document.getElementById('player-music-btn');
    if (playerBtn) {
        const hasTrack = !!musicPlayer.currentId;
        // Hide for DM (they use the toolbar button); show for everyone else when music is active
        const isDM = document.getElementById('map-toolbar')?.style.display !== 'none';
        playerBtn.style.display = (hasTrack && !isDM) ? 'flex' : 'none';
        playerBtn.style.alignItems = 'center';
        playerBtn.style.justifyContent = 'center';
        playerBtn.innerHTML = musicPlayer.localMuted ? iconImg('🔇', '18px', 'Muted') : iconImg('🔊', '18px', 'Unmuted');
    }
}

window._toggleMusicPanel = () => {
    _musicPanelOpen = !_musicPanelOpen;
    const panel = document.getElementById('music-panel');
    if (!panel) return;
    panel.style.display = _musicPanelOpen ? 'block' : 'none';
    if (_musicPanelOpen) _buildMusicPanel();
    document.getElementById('btn-music')?.classList.toggle('active', _musicPanelOpen);
};

window._musicPlay = (trackId) => {
    if (userRole !== 'dm') return;
    const vol = parseInt(document.getElementById('music-volume')?.value ?? 50);
    db.setMusic(db.getActiveRoom(), { trackId, playing: true, volume: vol / 100, ts: Date.now() });
};

window._musicStop = () => {
    if (userRole !== 'dm') return;
    db.setMusic(db.getActiveRoom(), { trackId: null, playing: false, volume: musicPlayer.volume, ts: Date.now() });
};

window._musicVolumeChange = (val) => {
    musicPlayer.volume = val / 100;
    if (userRole === 'dm') {
        db.setMusic(db.getActiveRoom(), { trackId: musicPlayer.currentId, playing: musicPlayer.playing, volume: val / 100, ts: Date.now() });
    }
};

window._musicLocalMute = () => {
    musicPlayer.setLocalMute(!musicPlayer.localMuted);
    _updateMusicNowPlaying();
};

function populateMonsterSelect() {
    const select = document.getElementById('npc-preset');
    if (!select) return;
    select.innerHTML = `<option value="custom">${t('custom_npc')}</option>`;
    for (const key of Object.keys(npcDatabase)) {
        select.innerHTML += `<option value="${key}">${t("mon_" + key) || key}</option>`;
    }
}

// =====================================================================
// YOUR TURN NOTIFICATION
// =====================================================================
let yourTurnTimer = null;

function showYourTurnBanner(name) {
    const banner = document.getElementById('your-turn-banner');
    const nameEl = document.getElementById('your-turn-name');
    if (!banner) return;
    if (nameEl) nameEl.innerText = name;
    banner.classList.remove('hidden');
    banner.classList.add('visible');
    if (yourTurnTimer) clearTimeout(yourTurnTimer);
    yourTurnTimer = setTimeout(() => hideYourTurnBanner(), 4000);
}

function hideYourTurnBanner() {
    const banner = document.getElementById('your-turn-banner');
    if (!banner) return;
    banner.classList.remove('visible');
    banner.classList.add('hidden');
}

window.dismissYourTurn = hideYourTurnBanner;

// =====================================================================
// START GAME
// =====================================================================
export function cleanupAppListeners() {
    _appUnsubs.forEach(u => { try { u?.(); } catch(_){} });
    _appUnsubs = [];
    if (_dmNotesUnsub) { try { _dmNotesUnsub(); } catch(_){} _dmNotesUnsub = null; }
    videoChat.destroyVideoChat();
}

// Clean up on page close / navigation away / logout to prevent Firebase listener leaks
window.addEventListener('beforeunload', cleanupAppListeners);
window.addEventListener('pagehide', cleanupAppListeners);
window.addEventListener('paradice:logout', cleanupAppListeners);


// =====================================================================
// SHORT REST MECHANIC (Sprint 16)
// Allows players to spend Hit Dice to recover HP between encounters.
// =====================================================================
const HIT_DICE_BY_CLASS = {
    'Barbarian':12, 'Fighter':10, 'Paladin':10, 'Ranger':10, 'Cleric':8,
    'Druid':8, 'Monk':8, 'Rogue':8, 'Bard':8, 'Warlock':8,
    'Sorcerer':6, 'Wizard':6, 'default':8
};

window.openShortRest = async function() {
    if (userRole !== 'player') return;

    const playerData = await db.getPlayerData(cName);
    if (!playerData) return;

    const charClass  = playerData.charClass || playerData.class || 'default';
    const hdType     = HIT_DICE_BY_CLASS[charClass] || HIT_DICE_BY_CLASS['default'];
    const hdMax      = playerData.hdMax  !== undefined ? playerData.hdMax  : Math.max(1, Math.floor((playerData.level||1)));
    const hdLeft     = playerData.hdLeft !== undefined ? playerData.hdLeft : hdMax;
    const currentHp  = playerData.hp  || 1;
    const maxHp      = playerData.maxHp || currentHp;
    const conMod     = playerData.conMod || 0;

    if (hdLeft <= 0) {
        showToast(t('toast_no_hit_dice'), 'warning');
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'short-rest-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:4500;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:var(--cr-bg-dark);border:2px solid var(--cr-border-gold);border-radius:14px;padding:28px 32px;max-width:380px;width:90%;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">😴</div>
        <div style="color:var(--cr-gold);font-size:18px;font-weight:800;margin-bottom:10px;">Short Rest</div>
        <div style="color:#ccc;font-size:14px;margin-bottom:16px;">
          HP: <b style="color:var(--cr-hp-high)">${currentHp}</b> / ${maxHp} &nbsp;|&nbsp;
          Hit Dice: <b>${hdLeft}</b>d${hdType} remaining
        </div>
        <div style="margin-bottom:20px;">
          <label style="color:#aaa;font-size:13px;">Spend how many Hit Dice? (max ${hdLeft})</label><br>
          <input id="sr-dice-count" type="number" min="0" max="${hdLeft}" value="1"
            style="margin-top:8px;padding:8px;width:80px;text-align:center;border-radius:8px;border:2px solid var(--cr-border-gold);background:rgba(0,0,0,0.4);color:#fff;font-size:18px;">
        </div>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button id="sr-cancel" style="padding:10px 24px;border-radius:8px;background:rgba(255,255,255,0.1);color:#ccc;border:1px solid rgba(255,255,255,0.2);font-weight:700;cursor:pointer;">Cancel</button>
          <button id="sr-roll" style="padding:10px 24px;border-radius:8px;background:var(--cr-green);color:#fff;border:none;font-weight:700;cursor:pointer;">${iconImg('🎲', '16px', 'Dice')} Roll & Rest</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('sr-cancel').onclick = () => modal.remove();
    document.getElementById('sr-roll').onclick = async () => {
        const dice  = Math.min(hdLeft, Math.max(0, parseInt(document.getElementById('sr-dice-count').value) || 0));
        if (dice <= 0) { modal.remove(); return; }

        let gained = conMod * dice;
        for (let i = 0; i < dice; i++) {
            gained += Math.floor(Math.random() * hdType) + 1;
        }
        const newHp    = Math.min(maxHp, currentHp + gained);
        const newHdLeft = hdLeft - dice;

        await db.updatePlayerHPInDB(cName, newHp);

        // Reset class resources that recharge on short rest
        const srPatch = onShortRest(playerData);
        if (Object.keys(srPatch).length) db.patchClassResources(cName, srPatch);

        showToast(`Rested for +${gained} HP (${dice}d${hdType}${conMod>=0?'+':''}${conMod*dice}). HP: ${newHp}/${maxHp}`, 'success', 5000);
        modal.remove();
    };
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
};

// Track campaign mode globally (used by disconnect handlers and UI)
export let isCampaignMode = false;

export async function startGame(role, charData, roomCode, isCampaign = false) {
    isCampaignMode = isCampaign;
    db.setRoom(roomCode);
    userRole = role;

    // Monitor Firebase connection status
    _appUnsubs.push(db.listenToConnectionStatus((isConnected) => {
        let banner = document.getElementById('connection-banner');
        if (!isConnected) {
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'connection-banner';
                banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#e74c3c;color:#fff;text-align:center;padding:6px;font-size:13px;font-weight:bold;';
                banner.textContent = t('connection_lost') || 'Connection lost — reconnecting...';
                document.body.prepend(banner);
            }
        } else if (banner) {
            banner.remove();
        }
    }));
    const lobbyWrapper = document.getElementById('lobby-wrapper');
    if (lobbyWrapper) lobbyWrapper.style.display = 'none';
    const gameScreen = document.getElementById('game-screen');
    if (gameScreen) gameScreen.style.display = 'flex';
    // Show in-game settings button
    const _settingsBtn = document.getElementById('game-settings-btn');
    if (_settingsBtn) {
        _settingsBtn.style.display = 'flex';
        _settingsBtn.onclick = () => openDashboard(isCampaign ? roomCode : null, role === 'dm');
    }
    const titleHeader = document.querySelector('#side-panel h3');
    const modeLabel   = isCampaign ? iconImg('⚔️', '18px', 'Campaign') + ' ' : '';
    if (titleHeader) titleHeader.innerHTML = `${modeLabel}${escapeHtml(t('party_title'))} (${escapeHtml(roomCode)})`;

    // Init HUD roller identity
    const _hudName = document.getElementById('hud-roller-name');
    if (_hudName) _hudName.innerText = userRole === 'dm' ? 'DM' : (charData?.name || '—');

    // Init D20 HP holder
    if (userRole === 'player' && charData) {
        const startHp    = charData.hp    ?? charData.maxHp ?? 0;
        const startMaxHp = charData.maxHp ?? 0;
        const startPct   = startMaxHp > 0 ? (startHp / startMaxHp * 100) : 100;
        window.updateHPGlobe?.(startPct, startHp, startMaxHp);
    }

    if (userRole === 'player') {
        pName       = document.getElementById('user-display-name')?.innerText || "Player";
        cName       = charData.name;
        pColor      = charData.color || "#3498db";
        charPortrait = charData.portrait;
        // Store vault IDs for cross-session spell persistence
        window._vaultUid = charData._vaultUid || null;
        window._vaultId  = charData._vaultId  || null;
        localStorage.setItem('paradice_initBonus', charData.initBonus || 0);
        localStorage.setItem('paradice_cName', cName);
        db.joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, charData, isCampaign);
        // Initialize classResources if not already set (pass full charData so subclass resources are included)
        if (!charData.classResources && charData.class) {
            db.patchClassResources(cName, initClassResources(charData, charData.level));
        }
        // Seed EK/AT spell slots from subclass table if not manually set in builder
        if (!charData.spellSlots) {
            const resolvedForSlots = compute(charData);
            if (resolvedForSlots?.subclassSpellSlots) {
                db.updateSpellSlotsInDB?.(cName, { max: resolvedForSlots.subclassSpellSlots, used: {} });
            }
        }
        // Hide DM-only HUD tools for players
        window._applyDMVisibility?.(false);
        // Switch to player toolbar
        const _dmToolbar = document.getElementById('hud-toolbar');
        const _ptToolbar = document.getElementById('player-toolbar');
        if (_dmToolbar) _dmToolbar.style.display = 'none';
        if (_ptToolbar) _ptToolbar.style.display = 'block';
        // Player view class — used by CSS for panel offsets and map viewport
        document.body.classList.add('player-view');
        // Expose cName for character sheet slot
        window._ptCName = charData.name;
        // Viewport insets for map engine (toolbar 30% reduced = 10.9375vw)
        const _tbH = Math.round(window.innerWidth * 0.109375);
        mapEngine?.setViewportInsets?.({ left: 80, bottom: _tbH });
        // Populate custom action slots from charData
        window.initCharActionSlots?.(charData);
        // Init player toolbar (HP display + assignable slots)
        window.initPlayerToolbar?.(charData);
    } else {
        pName        = document.getElementById('user-display-name')?.innerText || "DM";
        cName        = "DM_" + pName;
        window._dmCName = cName;
        pColor       = "#c0392b";
        charPortrait = document.getElementById('user-avatar')?.src || "assets/logo.webp";
        document.body.classList.remove('player-view');
        document.body.classList.add('dm-view');
        _dmIsCampaign = !!isCampaign;
        // DM toolbar height = 10.9375vw
        const dmToolbarH = Math.round(window.innerWidth * 0.109375);
        mapEngine?.setViewportInsets?.({ left: 0, bottom: dmToolbarH });
        document.getElementById('master-combat-btn').style.display    = 'block';
        document.getElementById('dm-turn-controls').style.display     = 'none';
        document.getElementById('reroll-initiatives-btn').style.display = 'block';
        document.getElementById('npc-gen-btn').style.display          = 'block';
        document.getElementById('monster-book-btn').style.display     = 'block';
        document.getElementById('refresh-npcs-btn').style.display     = 'block';
        document.getElementById('dm-music-btn').style.display         = 'block';
        document.getElementById('short-rest-btn').style.display       = 'none';
        localStorage.setItem('paradice_cName', 'DM');
        initMonsterBook();
        populateMonsterSelect();
        db.joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, { isHidden: true }, isCampaign);
        // Show DM-only HUD tools
        window._applyDMVisibility?.(true);

        // Campaign: show campaign management panel + watch for pending requests
        if (isCampaign) {
            _initCampaignPanel(roomCode);
            import('./campaign.js').then(({ watchPendingRequestsInGame }) => {
                watchPendingRequestsInGame(roomCode,
                    (uid, req) => showToast(`${req.playerName} (${req.charName})`, 'success'),
                    (uid, req) => showToast(`${req.playerName}`, 'info')
                );
            });
        }
    }

    showSpinner('Joining room…');
    setupDatabaseListeners();
    initMap();
    unlockAudio();

    // Listen for incoming save prompts (for player characters)
    if (userRole === 'player' && cName) {
        _appUnsubs.push(db.listenToPendingSave(cName, (data) => {
            if (!data || data.result) return; // already resolved or no pending
            _showSavePrompt(data);
        }));
    }

    // Listen for incoming reaction prompts (for player characters)
    if (userRole === 'player' && cName) {
        _appUnsubs.push(db.listenToPendingReaction(cName, (data) => {
            if (!data || data.result) return;
            _showReactionPrompt(data);
        }));
    }

    // Purge roll log on game start (keep last 200 entries)
    db.purgeOldRolls().catch(e => console.warn('purgeOldRolls:', e));

    try {
        const recentRolls = await db.loadRecentRolls(20);
        // Replay oldest-first silently (canAnimate is still false)
        recentRolls.forEach(data => {
            const time = new Date(data.ts || Date.now()).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
            addLogEntry(data, time, data.flavor || getFlavorText(data.type, data.res, (data.res + data.mod), 20), true);
        });
    } catch(e) { console.warn('Could not load roll history:', e); }

    // Safety timeout — hide spinner after 15s max even if dice engine hangs
    const spinnerTimeout = setTimeout(() => { hideSpinner(); console.warn('[Game] Spinner timeout — forced hide'); }, 15000);
    try { await initDiceEngine(); isDiceBoxReady = true; }
    catch (e) { console.error("Dice engine failed:", e); }
    clearTimeout(spinnerTimeout);
    hideSpinner();
    showToast(t('toast_joined'), 'success');
    setTimeout(() => { canAnimate = true; }, 800);

    // ── Video Chat init ──────────────────────────────────────────────
    if (typeof RTCPeerConnection !== 'undefined') {
        const vcUid = db.getAuthUid() || cName;
        const vcName = userRole === 'dm' ? 'DM' : (charData?.name || pName || 'Player');
        videoChat.initVideoChat(roomCode, vcUid, vcName, userRole);
    }
}

// =====================================================================
// CAMPAIGN IN-GAME PANEL (DM only)
// =====================================================================
function _initCampaignPanel(campaignId) {
    // Find or create the campaign accordion in the DM side panel
    const sidePanel = document.getElementById('side-panel');
    if (!sidePanel) return;

    // Avoid duplicate
    if (document.getElementById('campaign-mgmt-accordion')) return;

    const section = document.createElement('details');
    section.id = 'campaign-mgmt-accordion';
    section.className = 'accordion-item campaign-accordion';
    section.innerHTML = `
        <summary class="accordion-header">${t('campaign_mgmt_title')}</summary>
        <div class="accordion-body" id="campaign-mgmt-body">
            <div style="margin-bottom:8px;">
                <label style="color:#aaa;font-size:11px;">${t('campaign_name_label')}</label>
                <div style="display:flex;gap:6px;margin-top:3px;">
                    <input type="text" id="ingame-campaign-name" class="input-padded" style="flex:1;font-size:12px;" maxlength="50">
                    <button class="hover-btn" id="ingame-campaign-name-save" style="background:#9b59b6;color:white;padding:4px 8px;border-radius:4px;font-size:11px;">${t('campaign_save')}</button>
                </div>
            </div>
            <div style="margin-bottom:8px;">
                <label style="color:#aaa;font-size:11px;">${t('campaign_notes_label')}</label>
                <textarea id="ingame-campaign-notes" class="input-padded" rows="3" style="width:100%;font-size:11px;resize:vertical;margin-top:3px;" placeholder="${t('campaign_notes_ingame_ph')}" maxlength="1000"></textarea>
                <button class="hover-btn" id="ingame-campaign-notes-save" style="margin-top:4px;background:#555;color:white;padding:4px 10px;border-radius:4px;font-size:11px;">${t('campaign_notes_save')}</button>
            </div>
            <div style="margin-bottom:8px;">
                <div style="color:#aaa;font-size:11px;margin-bottom:4px;">${t('campaign_scenes_title')}</div>
                <div id="ingame-scenes-list" style="display:flex;flex-direction:column;gap:3px;max-height:120px;overflow-y:auto;"></div>
            </div>
            <div style="margin-bottom:8px;">
                <div style="color:#aaa;font-size:11px;margin-bottom:4px;">${t('campaign_approved_players')}</div>
                <div id="ingame-player-roster"></div>
            </div>
            <div id="ingame-pending-section" style="display:none;margin-bottom:8px;">
                <div style="color:#f1c40f;font-size:11px;margin-bottom:4px;">${t('campaign_pending_requests')}</div>
                <div id="ingame-pending-list"></div>
            </div>
            <div style="border-top:1px solid #333;padding-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
                <button class="hover-btn" id="ingame-long-rest-btn" style="background:#2980b9;color:white;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:bold;flex:1;">${t('campaign_long_rest_btn')}</button>
                <button class="hover-btn" id="ingame-copy-code-btn" style="background:#2c3e50;color:#ccc;padding:6px 10px;border-radius:6px;font-size:11px;flex:1;">📋 ${campaignId}</button>
                <button class="hover-btn" id="ingame-end-session-btn" style="background:#6c3483;color:white;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:bold;flex:1;">${t('campaign_end_session_btn')}</button>
            </div>
        </div>
    `;
    // Insert at the top of the side panel (after header)
    const firstChild = sidePanel.firstElementChild;
    sidePanel.insertBefore(section, firstChild?.nextElementSibling || firstChild);

    // Load current meta
    db.getCampaignMeta(campaignId).then(meta => {
        if (!meta) return;
        const nameEl  = document.getElementById('ingame-campaign-name');
        const notesEl = document.getElementById('ingame-campaign-notes');
        if (nameEl)  nameEl.value  = meta.name || '';
        if (notesEl) notesEl.value = meta.description || '';
    });

    document.getElementById('ingame-campaign-name-save')?.addEventListener('click', async () => {
        const n = document.getElementById('ingame-campaign-name')?.value.trim();
        if (!n) return;
        await db.updateCampaignMeta(campaignId, { name: n });
        showToast(t('campaign_name_updated'), 'success');
    });

    document.getElementById('ingame-campaign-notes-save')?.addEventListener('click', async () => {
        const notes = document.getElementById('ingame-campaign-notes')?.value || '';
        await db.updateCampaignMeta(campaignId, { description: notes });
        showToast(t('campaign_notes_saved'), 'success');
    });

    document.getElementById('ingame-copy-code-btn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(campaignId).then(() => showToast(t('campaign_code_copied'), 'success'));
    });

    document.getElementById('ingame-long-rest-btn')?.addEventListener('click', async () => {
        if (!confirm(t('campaign_long_rest_confirm'))) return;
        await db.longRestCampaign(campaignId);
        showToast(t('campaign_long_rest_success'), 'success');
    });

    document.getElementById('ingame-end-session-btn')?.addEventListener('click', async () => {
        const notes = prompt(t('campaign_end_session_notes_ph')) ?? null;
        if (notes === null) return; // cancelled
        try {
            const meta = await db.getCampaignMeta(campaignId);
            const dmUid = meta?.dmUid;
            if (!dmUid) { showToast(t('campaign_err_no_dm'), 'error'); return; }
            // Snapshot last 50 rolls
            const rollsSnap = await db.getRecentRolls(campaignId, 50);
            const sessionData = {
                notes: notes || '',
                rollCount: rollsSnap ? Object.keys(rollsSnap).length : 0,
                rollLogSnapshot: rollsSnap || {}
            };
            await db.saveSession(campaignId, dmUid, sessionData);
            await db.updateCampaignMeta(campaignId, { lastSession: Date.now() });
            showToast(t('campaign_session_saved'), 'success');
        } catch (e) {
            console.error('End session error:', e);
            showToast(t('campaign_session_err'), 'error');
        }
    });

    // Listen to players roster
    _appUnsubs.push(db.listenToCampaignAllowedPlayers(campaignId, players => {
        const roster = document.getElementById('ingame-player-roster');
        if (!roster) return;
        if (!players || !Object.keys(players).length) {
            roster.innerHTML = `<div style="color:#555;font-size:11px;">${t('campaign_no_players_yet')}</div>`;
            return;
        }
        roster.innerHTML = Object.entries(players).map(([uid, p]) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 6px;border-radius:4px;background:rgba(255,255,255,0.04);margin-bottom:3px;">
                <span style="color:white;font-size:11px;"><strong>${p.playerName || '?'}</strong> · ${p.charName || '?'}</span>
                <div style="display:flex;gap:3px;">
                    <button class="hover-btn" onclick="window.__campaignKick('${campaignId}','${uid}')" style="background:#c0392b;color:white;padding:2px 6px;border-radius:3px;font-size:10px;">${t('campaign_kick')}</button>
                    <button class="hover-btn" onclick="window.__campaignBan('${campaignId}','${uid}')" style="background:#8e44ad;color:white;padding:2px 6px;border-radius:3px;font-size:10px;">🚫</button>
                </div>
            </div>`).join('');
    }));

    // Listen to pending requests (in-game)
    _appUnsubs.push(db.listenToPendingRequests(campaignId, pending => {
        // Update badge on toolbar slot
        window._updateDMCampaignBadge(pending ? Object.keys(pending).length : 0);

        const section  = document.getElementById('ingame-pending-section');
        const container = document.getElementById('ingame-pending-list');
        if (!section || !container) return;
        if (!pending || !Object.keys(pending).length) { section.style.display = 'none'; return; }
        section.style.display = 'block';
        container.innerHTML = Object.entries(pending).map(([uid, r]) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 6px;border-radius:4px;background:rgba(241,196,15,0.07);margin-bottom:3px;">
                <span style="color:#f1c40f;font-size:11px;"><strong>${r.playerName || '?'}</strong> · ${r.charName || '?'}</span>
                <div style="display:flex;gap:4px;">
                    <button class="hover-btn" onclick="window.__campaignApprove('${campaignId}','${uid}')" style="background:#27ae60;color:white;padding:2px 6px;border-radius:3px;font-size:10px;">${t('campaign_approve_btn')}</button>
                    <button class="hover-btn" onclick="window.__campaignDeny('${campaignId}','${uid}')" style="background:#666;color:white;padding:2px 6px;border-radius:3px;font-size:10px;">${t('campaign_deny_btn')}</button>
                </div>
            </div>`).join('');
    }));

    // Scene switcher — lets DM switch active scene from campaign panel
    let _activeSceneId = null;
    _appUnsubs.push(db.listenActiveScene(campaignId, id => { _activeSceneId = id; _renderSceneList(); }));
    _appUnsubs.push(db.listenScenes(campaignId, scenes => {
        _allScenes = scenes;
        _renderSceneList();
    }));
    let _allScenes = null;
    function _renderSceneList() {
        const list = document.getElementById('ingame-scenes-list');
        if (!list) return;
        if (!_allScenes || !Object.keys(_allScenes).length) {
            list.innerHTML = `<div style="color:#555;font-size:11px;">${t('campaign_no_scenes')}</div>`;
            return;
        }
        list.innerHTML = Object.entries(_allScenes).map(([sid, s]) => {
            const isActive = sid === _activeSceneId;
            return `<button class="hover-btn" onclick="window.__campaignSetScene('${campaignId}','${sid}')"
                style="text-align:left;padding:5px 8px;border-radius:4px;font-size:11px;
                       background:${isActive ? 'rgba(46,204,113,0.2)' : 'rgba(255,255,255,0.04)'};
                       border:1px solid ${isActive ? '#2ecc71' : 'transparent'};
                       color:${isActive ? '#2ecc71' : '#ccc'};width:100%;">
                ${isActive ? '▶ ' : ''}${s.meta?.name || sid}
            </button>`;
        }).join('');
    }
    window.__campaignSetScene = (cId, sceneId) => {
        db.setActiveScene(cId, sceneId);
        showToast(`${_allScenes?.[sceneId]?.meta?.name || sceneId}`, 'success');
    };
}

// =====================================================================
// TURN TRACKER
// =====================================================================
window.nextTurn = () => {
    if (userRole !== 'dm' || sortedCombatants.length === 0) return;

    // Reset per-turn resources for the combatant whose turn is ending
    const endingName = currentActiveTurn !== null ? sortedCombatants[currentActiveTurn]?.name : null;
    if (endingName && mapEngine) {
        const p = mapEngine.S.players[endingName] || {};
        const patch = {};
        if (p.actionUsed)       patch.actionUsed       = false;
        if (p.bonusActionUsed)  patch.bonusActionUsed  = false;
        if (p.reactionUsed)     patch.reactionUsed     = false;
        // Legendary resets at start of that creature's OWN next turn
        if (p.legendaryMax > 0) patch.legendaryUsed = 0;
        // Reset sneak attack per-turn flag
        if (p.classResources?.sneakUsedThisTurn) patch['classResources/sneakUsedThisTurn'] = false;
        if (p.dashUsed)     patch.dashUsed     = false;
        if (p.disengaged)   patch.disengaged   = false;
        if (p.dodging)      patch.dodging      = false;
        if (p.helpedBy)     patch.helpedBy     = null;
        if (p.speedPenalty)     patch.speedPenalty     = null;
        if (p.speedHalved)      patch.speedHalved      = null;
        if (p.speedZero)        patch.speedZero        = null;
        if (p.noHealUntil)      patch.noHealUntil      = null;
        if (p.noReactions)      patch.noReactions       = null;
        if (p.disadvNextAttack) patch.disadvNextAttack  = null;
        if (p.disadvNextSave)   patch.disadvNextSave    = null;
        if (p.advNextAttack)    patch.advNextAttack     = null;
        if (p.spellCheckBonus)  patch.spellCheckBonus   = null;
        if (p.spellSaveBonus)   patch.spellSaveBonus    = null;
        if (p.resistBPS)        patch.resistBPS         = null;
        if (Object.keys(patch).length) db.patchPlayerInDB?.(endingName, patch);
    }

    let next = (currentActiveTurn === null ? 0 : currentActiveTurn + 1);
    let round = currentRoundNumber;
    if (next >= sortedCombatants.length) {
        next = 0;
        round++;
        db.saveRollToDB({ cName: "DM", type: "STATUS", status: `⚔️ Round ${round}!`, ts: Date.now() });
        // Lair Actions fire at initiative count 20 — top of each round (3C)
        if (mapEngine) {
            Object.entries(mapEngine.S.players).forEach(([name, p]) => {
                if ((p.lairActions || []).length > 0) _showLairActionPrompt(name, p.lairActions);
            });
        }
    }
    currentActiveTurn  = next;
    currentRoundNumber = round;
    db.setActiveTurn(next, round);
    updateTurnUI();
    // S16: restart turn timer if active
    if (_turnTimerActive) _startTurnTimer(_turnTimerDuration);
};

window.prevTurn = () => {
    if (userRole !== 'dm' || sortedCombatants.length === 0) return;
    let prev  = (currentActiveTurn === null ? 0 : currentActiveTurn - 1);
    let round = currentRoundNumber;
    if (prev < 0) { prev = sortedCombatants.length - 1; round = Math.max(1, round - 1); }
    currentActiveTurn  = prev;
    currentRoundNumber = round;
    db.setActiveTurn(prev, round);
    updateTurnUI();
};

// =====================================================================
// S16: TURN TIMER — DM-controlled per-turn countdown
// =====================================================================
let _turnTimerActive = false;
let _turnTimerDuration = 60;   // seconds, configurable via setTimerDuration()
let _turnTimerEnd = 0;
let _turnTimerRaf = null;

function _startTurnTimer(secs = _turnTimerDuration) {
    _turnTimerActive = true;
    _turnTimerEnd = Date.now() + secs * 1000;
    cancelAnimationFrame(_turnTimerRaf);
    _tickTurnTimer();
}

function _stopTurnTimer() {
    _turnTimerActive = false;
    cancelAnimationFrame(_turnTimerRaf);
    _renderTimerDisplay(null);
}

function _tickTurnTimer() {
    const rem = Math.max(0, Math.ceil((_turnTimerEnd - Date.now()) / 1000));
    _renderTimerDisplay(rem);
    if (rem > 0) {
        _turnTimerRaf = requestAnimationFrame(_tickTurnTimer);
    } else {
        showToast("⏰ Time's up!", 'error');
        if (userRole === 'dm') window.nextTurn();
    }
}

function _renderTimerDisplay(rem) {
    const el = document.getElementById('turn-timer-display');
    if (!el) return;
    if (rem === null) { el.textContent = ''; el.className = 'turn-timer'; return; }
    el.textContent = rem + 's';
    el.className = 'turn-timer' + (rem <= 10 ? ' urgent' : rem <= 20 ? ' warn' : '');
}

window.toggleTurnTimer = () => {
    if (_turnTimerActive) {
        _stopTurnTimer();
        document.getElementById('timer-toggle-btn')?.classList.remove('active');
        showToast(t('toast_timer_off'), 'info');
    } else {
        _startTurnTimer();
        document.getElementById('timer-toggle-btn')?.classList.add('active');
        showToast(`Timer: ${_turnTimerDuration}s per turn`, 'success');
    }
};

window.setTimerDuration = (secs) => {
    _turnTimerDuration = Math.max(10, Math.min(300, secs));
    if (_turnTimerActive) _startTurnTimer(_turnTimerDuration);
};

function updateTurnUI() {
    const roundEl  = document.getElementById('round-counter');
    const activeEl = document.getElementById('active-turn-name');
    const name = sortedCombatants[currentActiveTurn]?.name || '';
    if (roundEl)  roundEl.innerText  = currentRoundNumber > 0 ? `${t('round_label')} ${currentRoundNumber}` : '';
    if (activeEl) activeEl.innerText = name;
    // Sync HUD combat controls
    const hudRound = document.getElementById('hud-round-counter');
    const hudControls = document.getElementById('hud-combat-controls');
    if (hudRound)    hudRound.innerText = currentRoundNumber > 0 ? `${t('round_label')} ${currentRoundNumber}` : '';
    if (hudControls) hudControls.classList.toggle('hidden', currentRoundNumber <= 0);
    // Sync DM toolbar combat popup
    window._syncDMCombatPopup?.(currentRoundNumber > 0, currentRoundNumber);
}

// =====================================================================
// DICE & COMBAT FUNCTIONS
// =====================================================================
window.roll = async (type, isInit = false) => {
    if (isCooldown && !isInit) return;
    if (!isDiceBoxReady) return;
    const currentMode = isInit ? 'normal' : activeMode;
    if (!isInit) { isCooldown = true; setDiceCooldown(true); }
    playStartRollSound(isMuted);
    let rollCName = cName, rollPName = pName, rollColor = pColor;
    if (userRole === 'dm' && activeRoller) {
        rollCName = activeRoller.cName; rollPName = activeRoller.pName; rollColor = activeRoller.color;
        await updateDiceColor(rollColor);
    } else { await updateDiceColor(pColor); }
    let finalRes, res1 = null, res2 = null;
    try {
        if (currentMode !== 'normal') {
            const r = await roll3DDice(`2${type}`);
            res1 = r[0].value; res2 = r[1].value;
            finalRes = currentMode === 'adv' ? Math.max(res1, res2) : Math.min(res1, res2);
        } else {
            const mult = isInit ? 1 : diceMultiplier;
            const dice = await roll3DDice(`${mult}${type}`);
            finalRes = dice.reduce((sum, d) => sum + d.value, 0);
        }
    } catch { isCooldown = false; setDiceCooldown(false); return; }
    const mod = isInit
        ? (parseInt(localStorage.getItem('paradice_initBonus')) || 0)
        : (() => {
            const dmMod = parseInt(document.getElementById('mod-input')?.value) || 0;
            const ptMod = parseInt(document.getElementById('pt-mod-input')?.value) || 0;
            return dmMod || ptMod;
          })();
    const rollData = { pName: rollPName, cName: rollCName, type, res: finalRes, mod, color: rollColor, mode: currentMode, ts: Date.now() };
    if (res1 !== null) { rollData.res1 = res1; rollData.res2 = res2; }
    db.saveRollToDB(rollData);
    if (!isInit) { activeMode = 'normal'; updateModeUI(activeMode); setTimeout(() => { isCooldown = false; setDiceCooldown(false); }, 1000); }
    return finalRes + mod;
};

window.rollMacro = async (targetCName, attackName, bonus) => {
    if (isCooldown || !isDiceBoxReady) return;
    const currentMode = activeMode;
    isCooldown = true; setDiceCooldown(true); playStartRollSound(isMuted);
    const p = await db.getPlayerData(targetCName);
    const macroColor = p?.pColor || "#e74c3c";
    await updateDiceColor(macroColor);
    let finalRes, res1 = null, res2 = null;
    try {
        if (currentMode !== 'normal') {
            const r = await roll3DDice('2d20');
            res1 = r[0].value; res2 = r[1].value;
            finalRes = currentMode === 'adv' ? Math.max(res1, res2) : Math.min(res1, res2);
        } else { finalRes = (await roll3DDice('1d20'))[0].value; }
    } catch { isCooldown = false; setDiceCooldown(false); return; }
    const rollData = { pName: p?.pName || "DM", cName: targetCName, type: 'd20', res: finalRes, mod: parseInt(bonus)||0, color: macroColor, mode: currentMode, flavor: `${t('log_attack')} ${attackName}!`, ts: Date.now() };
    if (res1 !== null) { rollData.res1 = res1; rollData.res2 = res2; }
    db.saveRollToDB(rollData);
    activeMode = 'normal'; updateModeUI(activeMode);
    setTimeout(() => { isCooldown = false; setDiceCooldown(false); }, 1000);
};

// Custom action slots — populated from charData.customActions on game start (up to 5)
let _charActions = [];
window.initCharActionSlots = (charData) => {
    if (!charData) return;
    _charActions = charData.customActions || (charData.customAttacks?.map(a => ({
        name: a.name, hitType: 'melee', hitMod: a.bonus || 0,
        damageDice: (a.dmg||'').replace(/[+\-]\d+$/, ''), damageMult: 1, icon: '⚔️'
    })) || []);
    const zone = document.getElementById('hud-actions-zone');
    if (!zone) return;
    zone.innerHTML = '';
    _charActions.slice(0, 5).forEach((action, idx) => {
        const btn = document.createElement('button');
        btn.className = 'diablo-slot diablo-slot--action';
        btn.title = action.name;
        btn.innerHTML = `
            <span class="slot-key-num">${idx + 1}</span>
            <span class="slot-icon">${iconImg(action.icon || '⚔️', '20px', 'Action')}</span>
            <span class="slot-label">${(action.name || 'ACT').toUpperCase().slice(0, 6)}</span>
        `;
        btn.onclick = () => window.triggerAction(idx);
        zone.appendChild(btn);
    });
    zone.style.display = _charActions.length > 0 ? 'flex' : 'none';
};
window.triggerAction = async (idx) => {
    const action = _charActions[idx];
    if (!action || isCooldown || !isDiceBoxReady) return;
    const mult = parseInt(action.damageMult) || 1;
    const dmgStr = action.damageDice
        ? (mult > 1 ? action.damageDice.replace(/^\d+/, n => String(parseInt(n) * mult)) : action.damageDice)
        : '';
    if (action.hitType === 'always') {
        showToast(`🎯 ${action.name} — Auto Hit!`, 'info');
    } else if (action.hitType !== 'none') {
        await window.rollMacro(cName, action.name, parseInt(action.hitMod) || 0);
    }
    if (dmgStr) {
        await window.rollDamageMacro(cName, action.name, dmgStr, 0);
    }
    if (action.hitType === 'none' && !dmgStr) {
        showToast(`⚡ ${action.name} used!`, 'info');
    }
};
// Backward compat
window.initCharActionBtn = window.initCharActionSlots;
window.triggerCharAction = () => window.triggerAction(0);

window.rollDamageMacro = async (targetCName, attackName, diceString, bonus, actionType = 'damage') => {
    if (isCooldown || !isDiceBoxReady) return;
    if (!diceString || diceString === '0') { showToast(t('alert_no_dmg'), 'error'); return; }
    isCooldown = true; setDiceCooldown(true); playStartRollSound(isMuted);
    const p = await db.getPlayerData(targetCName);
    const isHeal = actionType === 'heal';
    const macroColor = isHeal ? '#27ae60' : (p?.pColor || "#e74c3c");
    await updateDiceColor(macroColor);
    let finalRes = 0;
    try { finalRes = (await roll3DDice(diceString)).reduce((s, d) => s + d.value, 0); }
    catch { isCooldown = false; setDiceCooldown(false); return; }
    const flavor = isHeal
        ? `${iconImg('💚','14px')} ${attackName} — ${t('pt_action_type_heal')}!`
        : `${t('log_roll_dmg')} ${attackName}!`;
    db.saveRollToDB({ pName: p?.pName || "DM", cName: targetCName, type: diceString, res: finalRes, mod: parseInt(bonus)||0, color: macroColor, mode: 'normal', flavor, ts: Date.now() });
    setTimeout(() => { isCooldown = false; setDiceCooldown(false); }, 1000);
};

window.rollAbilityCheck = async (targetCName, ability, score) => {
    if (isCooldown || !isDiceBoxReady) return;
    const mod = Math.floor((score - 10) / 2);
    isCooldown = true; setDiceCooldown(true); playStartRollSound(isMuted);
    const p = await db.getPlayerData(targetCName);
    const color = p?.pColor || '#3498db';
    await updateDiceColor(color);
    let finalRes;
    try { finalRes = (await roll3DDice('1d20'))[0].value; }
    catch { isCooldown = false; setDiceCooldown(false); return; }
    db.saveRollToDB({ pName: p?.pName || targetCName, cName: targetCName, type: 'ABILITY_CHECK', ability, score, mod, res: finalRes, total: finalRes + mod, color, ts: Date.now() });
    setTimeout(() => { isCooldown = false; setDiceCooldown(false); }, 1000);
};

window.rollSkillCheck = async (targetCName, skillName) => {
    if (isCooldown || !isDiceBoxReady) return;
    isCooldown = true; setDiceCooldown(true); playStartRollSound(isMuted);
    const p = await db.getPlayerData(targetCName);
    let mod = skillMod(skillName, p || {});
    // Guidance bonus: +1d4 to ability checks (one-use, then consumed)
    let guidanceBonus = 0;
    if (p?.spellCheckBonus) {
        const match = p.spellCheckBonus.match(/(\d+)d(\d+)/);
        if (match) guidanceBonus = Math.floor(Math.random() * parseInt(match[2])) + 1;
        db.patchPlayerInDB?.(targetCName, { spellCheckBonus: null }); // consume
    }
    const color = p?.pColor || '#27ae60';
    await updateDiceColor(color);
    let finalRes;
    try { finalRes = (await roll3DDice('1d20'))[0].value; }
    catch { isCooldown = false; setDiceCooldown(false); return; }
    const total = finalRes + mod + guidanceBonus;
    const bonusNote = guidanceBonus ? ` +${guidanceBonus} Guidance` : '';
    db.saveRollToDB({ pName: p?.pName || targetCName, cName: targetCName, type: 'SKILL', skillName, mod, res: finalRes, total, color, ...(bonusNote ? { flavor: bonusNote } : {}), ts: Date.now() });
    setTimeout(() => { isCooldown = false; setDiceCooldown(false); }, 1000);
};

window.editMaxHp = async (name, current) => {
    const newMax = parseInt(prompt(t('edit_max_hp_prompt') || 'New Max HP:', current || 10));
    if (!newMax || newMax < 1) return;
    db.updatePlayerField(name, 'maxHp', newMax);
    showToast(`${name} Max HP → ${newMax}`, 'info');
};

window.changeHP = async (targetCName, isPlus) => {
    const inputField = document.getElementById(`hp-input-${targetCName}`);
    const amount = parseInt(inputField?.value) || 1;
    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    let delta = isPlus ? amount : -amount;
    // Temp HP absorbs damage first (not healing)
    if (delta < 0 && p.tempHp > 0) {
        const absorbed = Math.min(p.tempHp, Math.abs(delta));
        db.patchPlayerInDB(targetCName, { tempHp: p.tempHp - absorbed });
        delta += absorbed;
        if (delta >= 0) {
            if (inputField) inputField.value = 1;
            db.saveRollToDB({ cName: targetCName, type: "DAMAGE", res: amount, newHp: p.hp || 0, color: "#e74c3c", flavor: `🛡️ ${t('log_takes_dmg')} (${amount} ${t('log_points')}) — absorbed by temp HP`, ts: Date.now() });
            return;
        }
    }
    const newHp = Math.max(0, Math.min(p.maxHp, (p.hp || 0) + delta));
    db.updatePlayerHPInDB(targetCName, newHp);
    // Concentration check on damage (D&D 5e: CON save DC = max(10, damage/2))
    if (!isPlus && p.concentrating) {
        if (newHp <= 0) {
            // Auto-break at 0 HP
            db.updateConcentrationInDB(targetCName, false);
            db.saveRollToDB({ cName: targetCName, type: "STATUS", status: t('combat_lost_concentration').replace('{name}', targetCName), ts: Date.now() });
        } else {
            const concDC = Math.max(10, Math.floor(amount / 2));
            db.saveRollToDB({ cName: targetCName, type: "STATUS", status: (t('combat_conc_save') || '{name} must make a CON save DC {dc} to maintain concentration!').replace('{name}', targetCName).replace('{dc}', concDC), ts: Date.now() });
        }
    }
    // Auto-apply Unconscious on 0 HP (4C)
    if (newHp <= 0 && !(p.statuses || []).includes('Unconscious')) {
        db.patchPlayerInDB(targetCName, { statuses: [...(p.statuses || []), 'Unconscious'] });
        db.saveRollToDB({ type: 'FALL', cName: targetCName, pName: p.pName || targetCName, color: p.pColor || '#e74c3c', ts: Date.now() });
    }
    db.saveRollToDB({ cName: targetCName, type: isPlus ? "HEAL" : "DAMAGE", res: amount, newHp, color: isPlus ? "#2ecc71" : "#e74c3c", flavor: (isPlus ? t('log_heals') : t('log_takes_dmg')) + ` (${amount} ${t('log_points')})`, ts: Date.now() });
    if (inputField) inputField.value = 1;
};

window.toggleStatus = async (targetCName, status) => {
    if (userRole !== 'dm') return;
    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    let statuses = p.statuses || [];
    if (statuses.includes(status)) statuses = statuses.filter(s => s !== status);
    else { statuses.push(status); db.saveRollToDB({ cName: targetCName, type: "STATUS", status, ts: Date.now() }); }
    db.updatePlayerStatusesInDB(targetCName, statuses);
};

// ── Exhaustion (levels 1-6) ──────────────────────────────────────────────
window.setExhaustion = async (targetCName, level) => {
    if (userRole !== 'dm') return;
    const clamped = Math.max(0, Math.min(6, parseInt(level) || 0));
    db.patchPlayerInDB(targetCName, { exhaustion: clamped });
    if (clamped > 0) {
        db.saveRollToDB({ cName: targetCName, type: "STATUS", status: (t('combat_exhaustion') || '{name} has exhaustion level {level}').replace('{name}', targetCName).replace('{level}', clamped), ts: Date.now() });
    }
};

// ── Inspiration (DM grants, player spends for advantage) ────────────────
window.toggleInspiration = async (targetCName) => {
    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    const newVal = !p.inspiration;
    db.patchPlayerInDB(targetCName, { inspiration: newVal });
    db.saveRollToDB({ cName: targetCName, type: "STATUS", status: newVal ? (t('combat_inspiration_gained') || '{name} gained inspiration!').replace('{name}', targetCName) : (t('combat_inspiration_used') || '{name} used inspiration.').replace('{name}', targetCName), ts: Date.now() });
};

window.removeNPC = async (targetCName) => {
    if (userRole !== 'dm') return;
    if (await crConfirm(`${t('remove_confirm_msg')||'Remove'} ${targetCName}?`, t('remove_char_title')||'Remove Character', iconImg('🗑️','18px'), t('remove_confirm_ok'), t('confirm_cancel'))) {
        db.removePlayerFromDB(targetCName);
        if (activeRoller?.cName === targetCName) window.resetRoller();
        if (currentActiveTurn !== null && sortedCombatants.length > 1) {
            currentActiveTurn = Math.min(currentActiveTurn, sortedCombatants.length - 2);
            db.setActiveTurn(currentActiveTurn, currentRoundNumber);
        }
    }
};

window.reorderInitiative = (fromName, toName) => {
    if (userRole !== 'dm') return;
    const fromC = sortedCombatants.find(c => c.name === fromName);
    const toC   = sortedCombatants.find(c => c.name === toName);
    if (!fromC || !toC) return;
    // Swap scores so Firebase sort reflects new order
    const tmp = fromC.score;
    db.setPlayerInitiativeInDB(fromName, fromC.pName, toC.score,   fromC.pColor);
    db.setPlayerInitiativeInDB(toName,   toC.pName,   tmp,          toC.pColor);
};

window.toggleVisibility = (targetCName, current) => {
    if (userRole !== 'dm') return;
    db.updatePlayerVisibilityInDB(targetCName, !current);
    if (current) db.saveRollToDB({ cName: "DM", type: "STATUS", status: `${t('log_revealed')} ${targetCName}!`, ts: Date.now() });
};

window.impersonate = async (targetCName) => {
    if (userRole !== 'dm') return;
    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    activeRoller = { cName: targetCName, pName: "DM", color: p.pColor || "#c0392b" };
    if (mapEngine) mapEngine._dmRoller = activeRoller; // expose to tokenSystem
    document.getElementById('active-roller-banner').style.display = 'flex';
    document.getElementById('active-roller-name').innerText = targetCName;
    // Sync HUD identity
    const hudName = document.getElementById('hud-roller-name');
    if (hudName) hudName.innerText = targetCName;
    updateDiceColor(activeRoller.color);
};
window.resetRoller = () => {
    activeRoller = null;
    if (mapEngine) mapEngine._dmRoller = null;
    document.getElementById('active-roller-banner').style.display = 'none';
    // Restore HUD identity to own character name
    const myLabel = localStorage.getItem('paradice_cName') || '—';
    const hudName = document.getElementById('hud-roller-name');
    if (hudName) hudName.innerText = myLabel;
    updateDiceColor(pColor);
};

window.setMode      = (mode) => { activeMode = activeMode === mode ? 'normal' : mode; updateModeUI(activeMode); };
window.getCombatMode = () => activeMode;
window.toggleVideoChat = () => {
    if (videoChat.isInCall()) videoChat.leaveCall();
    else videoChat.joinCall();
};

window.toggleMute = () => {
    isMuted = !isMuted;
    const btn = document.getElementById('mute-btn');
    if (btn) btn.innerHTML = isMuted
        ? `${iconImg('🔊', '16px', 'Unmute')} ${t('unmute_sound').replace(/^[\u{1F500}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]+\s*/u, '')}`
        : `${iconImg('🔇', '16px', 'Mute')} ${t('mute_sound').replace(/^[\u{1F500}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]+\s*/u, '')}`;
};

window.toggleCombat = async () => {
    if (userRole !== 'dm') return;
    if (await db.getCombatStatus()) {
        if (await crConfirm(t('alert_end_combat'), t('end_combat_title')||'End Combat', '⚔️', t('end_combat_confirm_ok'), t('confirm_cancel'))) {
            db.setCombatStatus(false);
            db.resetInitiativeInDB();
            currentActiveTurn = null; currentRoundNumber = 0; sortedCombatants = [];
            document.getElementById('dm-turn-controls').style.display = 'none';
            document.getElementById('round-counter').innerText = '';
            window._syncDMCombatPopup?.(false, 0);
        }
    } else { db.setCombatStatus(true); }
};

window.rollInit = async () => {
    const btn = document.getElementById('init-btn');
    if (btn) btn.disabled = true;
    try {
    // DM must have combat started to roll for NPCs; players can pre-roll
    if (userRole !== 'player' && !await db.getCombatStatus()) {
        showToast(t('alert_not_started'), 'error'); return;
    }
    // When DM acts as a monster, roll initiative for that monster
    const targetName  = (userRole === 'dm' && activeRoller) ? activeRoller.cName  : cName;
    const targetPName = (userRole === 'dm' && activeRoller) ? activeRoller.pName  : pName;
    const targetColor = (userRole === 'dm' && activeRoller) ? activeRoller.color  : pColor;
    let rollResult;
    if (isDiceBoxReady) {
        rollResult = await window.roll('d20', true);
    } else {
        // Fallback: plain random d20 when 3D dice box not yet ready (e.g. late-joining player)
        const mod = parseInt(localStorage.getItem('paradice_initBonus')) || 0;
        rollResult = Math.ceil(Math.random() * 20) + mod;
    }
    if (rollResult == null) { return; }
    db.setPlayerInitiativeInDB(targetName, targetPName, rollResult, targetColor);
    } finally {
        if (btn) btn.disabled = false;
    }
};

window.handlePresetChange = (val) => {
    const fields = { 'npc-name': null, 'npc-hp': null, 'npc-init': null, 'npc-melee': null, 'npc-melee-dmg': null, 'npc-ranged': null, 'npc-ranged-dmg': null };
    if (val === 'custom') { Object.keys(fields).forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; }); return; }
    const d = npcDatabase[val]; if (!d) return;
    const vals = { 'npc-name': t("mon_" + val), 'npc-hp': d.hp, 'npc-init': d.init, 'npc-melee': d.melee||0, 'npc-melee-dmg': d.meleeDmg||'1d4', 'npc-ranged': d.ranged||0, 'npc-ranged-dmg': d.rangedDmg||'1d4' };
    Object.entries(vals).forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.value = v; });
};

window.addNPC = () => {
    if (userRole !== 'dm') return;
    const presetVal = document.getElementById('npc-preset')?.value;
    let baseName = document.getElementById('npc-name')?.value.trim() || (presetVal !== 'custom' ? t("mon_"+presetVal) : t("default_monster"));
    const npcClass = document.getElementById('npc-class')?.value.trim();
    const npcHp = parseInt(document.getElementById('npc-hp')?.value)||10;
    const npcInitBonus = parseInt(document.getElementById('npc-init')?.value)||0;
    const npcMelee = parseInt(document.getElementById('npc-melee')?.value)||0;
    const npcMeleeDmg = document.getElementById('npc-melee-dmg')?.value||'1d6';
    const npcRanged = parseInt(document.getElementById('npc-ranged')?.value)||0;
    const npcRangedDmg = document.getElementById('npc-ranged-dmg')?.value||'1d6';
    const count = parseInt(document.getElementById('npc-count')?.value)||1;
    const isHidden = document.getElementById('npc-hidden')?.checked;
    const portrait = (presetVal !== 'custom' && npcDatabase[presetVal]) ? npcDatabase[presetVal].img : "https://placehold.co/50/c0392b/ffffff?text=NPC";
    for (let i = 1; i <= count; i++) {
        const finalName = count > 1 ? `${baseName} ${i}` : baseName;
        const finalInit = Math.floor(Math.random()*20)+1 + npcInitBonus;
        const stats = { maxHp:npcHp, hp:npcHp, ac:10, speed:30, pp:10, isHidden, melee:npcMelee, meleeDmg:npcMeleeDmg, ranged:npcRanged, rangedDmg:npcRangedDmg };
        if (npcClass) stats.class = npcClass;
        db.joinPlayerToDB(finalName, "DM", "#c0392b", "npc", portrait, stats);
        db.setPlayerInitiativeInDB(finalName, "DM", finalInit, "#c0392b");
        db.saveRollToDB({ cName:"DM", type:"STATUS", status:`${t('log_added')} ${finalName}${isHidden?t('log_hidden_tag'):''} [${t('log_init')} ${finalInit}]`, ts:Date.now() });
    }
    ['npc-preset','npc-name','npc-class','npc-hp','npc-init','npc-melee','npc-melee-dmg','npc-ranged','npc-ranged-dmg'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=id==='npc-preset'?'custom':'';});
    const countEl = document.getElementById('npc-count'); if(countEl) countEl.value="1";
};

// SC: Wizard NPC spawner — called by sceneWizard._spawnNPC() with pre-built stats
// Reuses the same Firebase write path as addNPC() without touching any form elements.
window.addNPCFromWizard = (name, color, portrait, init, stats) => {
    if (userRole !== 'dm') return;
    db.joinPlayerToDB(name, "DM", color, "npc", portrait, stats);
    db.setPlayerInitiativeInDB(name, "DM", init, color);
    db.saveRollToDB({ cName:"DM", type:"STATUS",
        status:`${t('log_added')} ${name} [${t('log_init')} ${init}]`, ts:Date.now() });
    // SC: also write monsterType into the player record for token ring colour
    if (stats.monsterType) {
        db.updatePlayerField?.(name, 'monsterType', stats.monsterType);
    }
};

window.roll3DDice = roll3DDice;

// ── Edit NPC stats (DM only) ─────────────────────────────────────────────────
window.editNPC = async (name) => {
    if (userRole !== 'dm') return;
    const p = await db.getPlayerData(name);
    if (!p) return;
    const fields = [
        { key: 'maxHp',  label: 'Max HP',  val: p.maxHp ?? 10 },
        { key: 'ac',     label: 'AC',      val: p.ac ?? 10 },
        { key: 'speed',  label: 'Speed',   val: p.speed ?? 30 },
        { key: 'melee',  label: 'Melee +', val: p.melee ?? 0 },
        { key: 'ranged', label: 'Ranged +', val: p.ranged ?? 0 },
        { key: 'pp',     label: 'Pass. Perception', val: p.pp ?? 10 },
    ];
    const input = prompt(
        fields.map(f => `${f.label}: ${f.val}`).join('\n') +
        '\n\nEdit as: maxHp,ac,speed,melee,ranged,pp',
        fields.map(f => f.val).join(',')
    );
    if (!input) return;
    const vals = input.split(',').map(v => parseInt(v.trim()));
    const updates = {};
    fields.forEach((f, idx) => {
        const v = vals[idx];
        if (!isNaN(v)) updates[f.key] = v;
    });
    if (updates.maxHp && (!p.hp || p.hp > updates.maxHp)) updates.hp = updates.maxHp;
    Object.entries(updates).forEach(([k, v]) => db.updatePlayerField(name, k, v));
    showToast(`${name} updated`, 'success');
};

// ── Duplicate NPC (DM only) ──────────────────────────────────────────────────
window.duplicateNPC = async (name) => {
    if (userRole !== 'dm') return;
    const p = await db.getPlayerData(name);
    if (!p) return;
    // Generate unique name with incrementing suffix
    const baseName = name.replace(/\s*\d+$/, '').trim();
    const existing = Object.keys(sortedCombatants.reduce((a,c)=>{a[c.name]=1;return a;},{}));
    let num = 2;
    while (existing.includes(`${baseName} ${num}`)) num++;
    const newName = `${baseName} ${num}`;
    const init = Math.floor(Math.random()*20)+1 + (p.initBonus||0);
    const stats = { ...p };
    // Reset HP to max, remove transient state
    stats.hp = stats.maxHp || stats.hp;
    delete stats.score; delete stats.statuses; delete stats.deathSaves;
    delete stats.concentrating; delete stats.online;
    db.joinPlayerToDB(newName, "DM", p.pColor || "#c0392b", "npc", p.portrait, stats);
    db.setPlayerInitiativeInDB(newName, "DM", init, p.pColor || "#c0392b");
    db.saveRollToDB({ cName:"DM", type:"STATUS", status:`${t('log_added')} ${newName} [${t('log_init')} ${init}]`, ts:Date.now() });
    showToast(`${newName} created`, 'success');
};

// ── Refresh all Open5e NPCs in current room ───────────────────────────────────
// Re-fetches each NPC with _open5eSlug from Open5e API (bypasses LS cache),
// patches their stat data in Firebase while preserving hp/statuses/initiative.
window.refreshNPCsFromOpen5e = async () => {
    if (userRole !== 'dm') return;
    const players = mapEngine?.S?.players || {};
    const npcs = Object.entries(players).filter(([, p]) => p._open5eSlug);
    if (!npcs.length) { showToast('No Open5e monsters found in this session.', 'warning'); return; }

    const btn = document.getElementById('refresh-npcs-btn');
    if (btn) { btn.disabled = true; btn.textContent = t('npc_refreshing'); }

    // Fields to preserve (combat state)
    const KEEP = new Set(['hp', 'maxHp', 'statuses', 'score', 'pName', 'pColor', 'role',
                          'isHidden', 'portrait', 'spellSlots', 'classResources',
                          'legendaryUsed', 'bonusActionUsed']);

    let done = 0, failed = 0;
    for (const [name, p] of npcs) {
        try {
            // Bust localStorage cache so we get latest Open5e data
            localStorage.removeItem(`o5e:monster:${p._open5eSlug}`);
            const fresh = await fetchMonsterBySlug(p._open5eSlug);
            const newStats = open5eToNPC(fresh);
            // Strip combat-state fields — keep existing values
            for (const k of KEEP) delete newStats[k];
            db.patchPlayerInDB(name, newStats);
            done++;
        } catch {
            failed++;
        }
    }

    if (btn) { btn.disabled = false; btn.textContent = t('npc_refresh_btn'); }
    showToast(`Refreshed ${done} NPC${done !== 1 ? 's' : ''}${failed ? ` (${failed} failed)` : ''}`, done > 0 ? 'success' : 'error');
};

// ── Chat ──────────────────────────────────────────────────────────────────────
window._sendChatMsg = () => {
    const input = document.getElementById('chat-input');
    const msg = (input?.value || '').trim();
    if (!msg || !cName) return;
    db.saveRollToDB({ type: "CHAT", cName, pName, msg, color: pColor, ts: Date.now() });
    if (input) input.value = '';
};

function initMap() {
    if (mapEngine) return; // guard: only init once

    const cv  = document.getElementById('map-canvas');
    const fwc = document.getElementById('fow-canvas');
    if (!cv || !fwc) return;

    const container = document.getElementById('map-canvas-container');
    const resize = () => {
        const w = container.clientWidth || 800;
        const h = container.clientHeight || 500;
        cv.width = w; cv.height = h; fwc.width = w; fwc.height = h;
        mapEngine?.resize(w, h);
    };

    mapEngine = new MapEngine(cv, fwc, { cName, userRole, activeRoom: db.getActiveRoom() });
    window._mapEng = mapEngine;
    // Forward ui:toast bus events to showToast
    mapEngine.bus.on('ui:toast', ({ msg, type }) => showToast(msg, type || 'info'));

    // ── Wire up static zoom controls (shown/hidden by _activateMapCanvas / deactivateScene) ──
    document.getElementById('zoom-in-btn')?.addEventListener('click', () => mapEngine.zoomBy(1.25));
    document.getElementById('zoom-fit-btn')?.addEventListener('click', () => mapEngine.fitToView());
    document.getElementById('zoom-out-btn')?.addEventListener('click', () => mapEngine.zoomBy(0.8));

    // ── Keep canvas sized to container (ResizeObserver) ──────────────
    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    // ── Opportunity Attack detection (3B) ──────────────────────────────
    mapEngine.bus.on('token:moved', ({ cName: moverCName, gx, gy, prevGx, prevGy }) => {
      if (userRole !== 'dm') return;
      const players = mapEngine.S.players;
      const tokens  = mapEngine.S.tokens;
      const mover   = players[moverCName];
      if (!mover) return;
      Object.entries(tokens).forEach(([cName, tok]) => {
        if (cName === moverCName) return;
        const p = players[cName];
        if (!p) return;
        // Hostile check: different factions (ally vs foe, or either vs neutral moving away from foe)
        const moverFaction = mover.faction || (mover.userRole === 'npc' ? 'foe' : 'ally');
        const threaterFaction = p.faction || (p.userRole === 'npc' ? 'foe' : 'ally');
        if (moverFaction === threaterFaction) return; // same faction = no OA
        // Threatening creature must not be incapacitated
        const sts = p.statuses || [];
        if (sts.some(s => ['Unconscious','Paralyzed','Stunned','Incapacitated'].includes(s))) return;
        // Was adjacent before, not adjacent now
        const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
        const wasAdj = cheb(prevGx, prevGy, tok.gx, tok.gy) <= 1;
        const isAdj  = cheb(gx,     gy,     tok.gx, tok.gy) <= 1;
        if (wasAdj && !isAdj) {
          // Skip if reaction already used this round
          if (p.reactionUsed) return;
          if (mover.disengaged) return; // Disengage suppresses OA
          _showOAPrompt(cName, moverCName, () => {
            db.patchPlayerInDB?.(cName, { reactionUsed: true });
            const atkData = mapEngine.S.players[cName] || {};
            const tgtData = mapEngine.S.players[moverCName] || {};
            openActionWizard({ type: 'melee', attackerCName: cName, targetCName: moverCName, attacker: atkData, target: tgtData, eng: mapEngine, distFt: 5 });
          });
        }
      });
    });

    // Initialise the YouTube video background layer
    mapEngine.initVideo(container);
    resize();
    window.addEventListener('resize', resize);
    // Also observe the container directly — catches layout changes (e.g. side panel expanding)
    // that don't fire a window resize event
    new ResizeObserver(resize).observe(container);

    // Show scene manager for DM
    if (userRole === 'dm') {
        document.getElementById('scene-manager-section').style.display = 'block';
        _initSceneManager();
    }

    // E7: Handout + Watabou toolbar buttons
    window._handoutBtn = () => {
      const eng = window._mapEng;
      const roomCode = window._activeRoom || '';
      const sceneName = eng?.S?.cfg?.name || 'Dungeon';
      printHandout({
        roomCode,
        sceneName,
        dungeonData: window._lastDungeonData || null,
        engine: eng,
      });
    };
    window._watabouBtn = () => {
      openWatabou(window._activeRoom || Math.floor(Math.random()*999999));
    };

    // Wire compact toolbar
    window._mapToolBtn = (btn) => {
        document.querySelectorAll('.map-tb-btn[data-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        mapEngine?.setMode(mode);
        // Show/hide calibration panel
        const panel = document.getElementById('map-calib-panel');
        if (panel) {
            panel.style.display = mode === 'calibrate' ? 'block' : 'none';
            if (mode === 'calibrate') window._calibRefresh();
        }
    };

    // Calibration panel helpers
    window._calibRefresh = () => {
        const cfg = window._mapEng?.S?.cfg;
        if (!cfg) return;
        document.getElementById('calib-pps').textContent = Math.round(cfg.pps);
        document.getElementById('calib-ox').textContent  = Math.round(cfg.ox);
        document.getElementById('calib-oy').textContent  = Math.round(cfg.oy);
    };
    window._calibNudge = (field, delta) => {
        const eng = window._mapEng;
        if (!eng) return;
        if (field === 'pps') {
            eng.S.cfg.pps = Math.max(16, Math.min(200, eng.S.cfg.pps + delta));
        } else {
            eng.S.cfg[field] = (eng.S.cfg[field] || 0) + delta;
        }
        eng.saveGridToFirebase();
        eng._dirty();
        window._calibRefresh();
    };
    window._calibDone = () => {
        const btn = document.querySelector('.map-tb-btn[data-mode="view"]');
        if (btn) btn.click();
    };

    // Video background toolbar button — show clip dialog or stop video
    window._videoToggleBtn = () => {
        const eng = window._mapEng;
        if (!eng) return;
        _showVideoClipDialog(eng);
    };

    // ── Video clip dialog (replaces bare prompt) ─────────────────────────────
    function _showVideoClipDialog(eng) {
        const existing = document.getElementById('video-clip-dialog');
        if (existing) existing.remove();

        const isActive = eng._video?.isActive();
        const currentUrl = eng.S.cfg.bgVideoUrl || '';

        const dlg = document.createElement('div');
        dlg.id = 'video-clip-dialog';
        dlg.style.cssText = [
            'position:fixed', 'top:50%', 'left:50%',
            'transform:translate(-50%,-50%)',
            'background:rgba(13,10,30,0.98)',
            'border:1.5px solid rgba(241,196,15,0.5)',
            'border-radius:12px', 'padding:18px 20px', 'z-index:9999',
            'min-width:320px', 'max-width:380px',
            'box-shadow:0 12px 48px rgba(0,0,0,0.85)',
            'font-family:Assistant,sans-serif', 'color:#eee',
        ].join(';');

        dlg.innerHTML = `
            <div style="font-weight:bold;font-size:14px;color:#f1c40f;margin-bottom:12px;">${iconImg('🎬', '18px', 'Video')} Animated Map Background</div>
            <label style="font-size:11px;color:#aaa;display:block;margin-bottom:3px;">YouTube URL</label>
            <input id="vcd-url" type="text" placeholder="https://youtu.be/…" value="${currentUrl.split('?')[0]}"
                style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.2);
                color:#fff;border-radius:6px;padding:6px 8px;font-size:12px;outline:none;margin-bottom:10px;">
            <div style="display:flex;gap:10px;margin-bottom:12px;">
                <div style="flex:1;">
                    <label style="font-size:11px;color:#aaa;display:block;margin-bottom:3px;">Start (seconds)</label>
                    <input id="vcd-start" type="number" min="0" value="30" placeholder="30"
                        style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.2);
                        color:#fff;border-radius:6px;padding:6px 8px;font-size:12px;outline:none;">
                </div>
                <div style="flex:1;">
                    <label style="font-size:11px;color:#aaa;display:block;margin-bottom:3px;">Duration (seconds)</label>
                    <input id="vcd-dur" type="number" min="5" max="300" value="30" placeholder="30"
                        style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.2);
                        color:#fff;border-radius:6px;padding:6px 8px;font-size:12px;outline:none;">
                </div>
            </div>
            <div style="font-size:10px;color:#666;margin-bottom:12px;">
                Tip: short clips (30s) loop cleanly and stay HD. Start = seconds into the video for the best scene.
            </div>
            <div style="display:flex;gap:8px;">
                <button id="vcd-play" style="flex:2;background:rgba(241,196,15,0.2);border:1px solid rgba(241,196,15,0.5);
                    color:#f1c40f;border-radius:7px;padding:8px;font-size:12px;font-weight:bold;cursor:pointer;">▶ Play Clip</button>
                ${isActive ? `<button id="vcd-stop" style="flex:1;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.4);
                    color:#e74c3c;border-radius:7px;padding:8px;font-size:12px;cursor:pointer;">⏹ Stop</button>` : ''}
                <button id="vcd-cancel" style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);
                    color:#aaa;border-radius:7px;padding:8px;font-size:12px;cursor:pointer;">✕</button>
            </div>
        `;
        document.body.appendChild(dlg);

        // Auto-detect t= timestamp from pasted URL and update start field
        const urlInput = dlg.querySelector('#vcd-url');
        urlInput.addEventListener('input', () => {
            const { start } = VideoLayer.parseClipParams(urlInput.value);
            if (start > 0) dlg.querySelector('#vcd-start').value = start;
        });
        urlInput.addEventListener('paste', (e) => {
            setTimeout(() => {
                const { start } = VideoLayer.parseClipParams(urlInput.value);
                if (start > 0) dlg.querySelector('#vcd-start').value = start;
            }, 0);
        });

        dlg.querySelector('#vcd-play').addEventListener('click', () => {
            const rawUrl = dlg.querySelector('#vcd-url').value.trim();
            const start  = Math.max(0, parseInt(dlg.querySelector('#vcd-start').value) || 0);
            const dur    = Math.max(5, parseInt(dlg.querySelector('#vcd-dur').value)   || 30);
            const end    = start + dur;
            if (!rawUrl) return;

            // Build a URL with embedded clip params
            const id = VideoLayer.parseVideoId(rawUrl);
            if (!id) { showToast('Invalid YouTube URL', 'warning'); return; }
            const clipUrl = `https://youtu.be/${id}?start=${start}&end=${end}`;
            eng.loadBgVideo(clipUrl);
            document.getElementById('btn-video-bg').style.display = '';
            dlg.remove();
        });

        dlg.querySelector('#vcd-stop')?.addEventListener('click', () => {
            eng.loadBgVideo('');
            eng._video?.unload();
            eng.S.cfg.bgVideoUrl = '';
            if (eng.db) eng.db.setMapCfg(eng.activeRoom, { ...eng.S.cfg, bgVideoUrl: '', bgUrl: eng.S.cfg.bgUrl });
            document.getElementById('btn-video-bg').style.display = 'none';
            dlg.remove();
        });

        dlg.querySelector('#vcd-cancel').addEventListener('click', () => dlg.remove());

        // Pre-fill start/end from existing clip URL
        if (currentUrl) {
            const { start, end } = VideoLayer.parseClipParams(currentUrl);
            if (start > 0) dlg.querySelector('#vcd-start').value = start;
            if (end > 0)   dlg.querySelector('#vcd-dur').value   = end - start;
        }

        // Close on outside click
        setTimeout(() => {
            const outside = e => { if (!dlg.contains(e.target)) { dlg.remove(); document.removeEventListener('click', outside); } };
            document.addEventListener('click', outside);
        }, 0);
    }

    // Show/hide the video toolbar button based on whether a video is active
    // Exposed so scene activation can call it after loading a scene with bgVideoUrl
    window._syncVideoToolbarBtn = () => {
        const btn = document.getElementById('btn-video-bg');
        if (!btn) return;
        btn.style.display = window._mapEng?._video?.isActive() ? '' : 'none';
    };

    // SB-3: Keyboard shortcuts for toolbar — only active when map is visible
    window._mapKeyHandler = (e) => {
        const mapActive = document.getElementById('map-toolbar')?.style.display !== 'none';
        if (!mapActive) return;
        // Skip if typing in an input
        if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
        const keyMap = { v:'view', o:'obstacle', t:'trigger', f:'fogReveal', h:'fogHide', r:'ruler', a:'aoe', c:'calibrate', l:'light' };
        // Arrow keys for calibration nudge when in calibrate mode
        if (window._mapEng?.L?.mode === 'calibrate') {
            const arrowMap = {
                ArrowLeft: () => window._calibNudge('ox', e.shiftKey ? -5 : -1),
                ArrowRight:() => window._calibNudge('ox', e.shiftKey ?  5 :  1),
                ArrowUp:   () => window._calibNudge('oy', e.shiftKey ? -5 : -1),
                ArrowDown: () => window._calibNudge('oy', e.shiftKey ?  5 :  1),
                PageUp:    () => window._calibNudge('pps', e.shiftKey ? 5 : 1),
                PageDown:  () => window._calibNudge('pps', e.shiftKey ? -5 : -1),
            };
            if (arrowMap[e.key]) { e.preventDefault(); arrowMap[e.key](); return; }
        }
        const mode = keyMap[e.key.toLowerCase()];
        if (mode) {
            const btn = document.querySelector(`.map-tb-btn[data-mode="${mode}"]`);
            if (btn) btn.click();
        }
    };
    document.addEventListener('keydown', window._mapKeyHandler);

    window.toggleTokenRoster = () => {
        const el = document.getElementById('map-token-roster-popup');
        const isVisible = el.style.display !== 'none';
        el.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) _updateTokenRoster();
    };
}

let _sceneUnsub = null;
function _initSceneManager() {
    if (!uid) return;
    if (_sceneUnsub) _sceneUnsub(); // remove old listener
    _sceneUnsub = db.listenToUserScenes(uid, (scenes) => {
        _renderSceneGallery(scenes || {});
    });
}

function _renderSceneGallery(scenes) {
    const gallery = document.getElementById('scene-gallery');
    if (!gallery) return;

    // SA-2: dedup — if two entries share same name+createdAt bucket (within 5s), keep newer id
    const seen = new Map();  // key: name+bucket → [id, createdAt]
    const deduped = {};
    Object.entries(scenes).forEach(([id, s]) => {
        const bucket = (s.name||'') + '_' + Math.floor((s.createdAt||0) / 5000);
        const prev = seen.get(bucket);
        if (prev) {
            // keep whichever id is lexicographically newer (scene_<timestamp> → larger = newer)
            const keepId = id > prev ? id : prev;
            const dropId = id > prev ? prev : id;
            seen.set(bucket, keepId);
            deduped[keepId] = scenes[keepId] || scenes[id];
            delete deduped[dropId];
        } else {
            seen.set(bucket, id);
            deduped[id] = s;
        }
    });

    const entries = Object.entries(deduped).sort(([,a],[,b]) => (b.createdAt||0)-(a.createdAt||0));
    if (!entries.length) {
        gallery.innerHTML = `<div style="font-size:11px;color:#555;font-style:italic;padding:4px 0;">${t('gallery_empty')}</div>`;
        return;
    }
    gallery.innerHTML = entries.map(([id, s]) => {
        // SA-1: show thumbnail if available; for video scenes use YouTube thumbnail; else emoji
        let thumbHtml;
        if (s.bgThumb) {
            thumbHtml = `<img src="${s.bgThumb}" class="scene-thumb-img" alt="${s.name||'Scene'}">`;
        } else if (s.bgVideoUrl) {
            // Extract video ID from any YouTube URL format for the thumbnail
            let ytId = null;
            try {
                const u = new URL(s.bgVideoUrl);
                if (u.hostname === 'youtu.be') ytId = u.pathname.replace(/^\//, '').split('/')[0];
                else if (u.searchParams.get('v')) ytId = u.searchParams.get('v');
                else if (u.pathname.includes('/embed/')) ytId = u.pathname.split('/embed/')[1]?.split('?')[0];
            } catch (_) { ytId = /^[A-Za-z0-9_\-]{11}$/.test(s.bgVideoUrl) ? s.bgVideoUrl : null; }
            thumbHtml = ytId
                ? `<img src="https://img.youtube.com/vi/${ytId}/mqdefault.jpg" class="scene-thumb-img" alt="${s.name||'Scene'}" onerror="this.style.display='none'">`
                : `<div class="scene-thumb">${iconImg('🎬', '28px', 'Video')}</div>`;
        } else {
            const _weatherIcon = s.atmosphere?.weather==='fog'?iconImg('🌫','14px'):s.atmosphere?.weather==='heavy_rain'?iconImg('⛈','14px'):s.atmosphere?.weather==='blizzard'?iconImg('❄️','14px'):iconImg('🗺️','14px');
            thumbHtml = `<div class="scene-thumb">${iconImg(_weatherIcon, '28px', 'Scene')}</div>`;
        }
        const isLive = id === activeSceneId;
        return `
        <div class="scene-gallery-card ${isLive?'active':''}" id="sgc-${id}">
            ${thumbHtml}
            ${isLive ? `<div class="scene-live-badge">${iconImg('🎲', '14px', 'Live')} LIVE</div>` : ''}
            <div class="scene-card-info">
                <div class="scene-card-name">${s.name||'Unnamed'}</div>
                <div class="scene-card-sub">${new Date(s.createdAt||0).toLocaleDateString()}</div>
            </div>
            <div class="scene-card-btns">
                <button class="scene-card-btn live"  title="Go Live"  onclick="window.activateScene('${id}')">▶</button>
                <button class="scene-card-btn edit"  title="Edit"     onclick="window.editScene('${id}')">✎</button>
                <button class="scene-card-btn del"   title="Delete"   onclick="window.deleteScene('${id}')">${iconImg('🗑️','14px')}</button>
            </div>
        </div>`;
    }).join('');

    // SD-4: Gallery card parallax tilt on mouse hover
    gallery.querySelectorAll('.scene-gallery-card').forEach(card => {
        card.addEventListener('mousemove', e => {
            const r = card.getBoundingClientRect();
            const nx = (e.clientX - r.left) / r.width  - 0.5;
            const ny = (e.clientY - r.top)  / r.height - 0.5;
            card.style.transform = `perspective(300px) rotateY(${nx*12}deg) rotateX(${-ny*10}deg) scale(1.05)`;
        });
        card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
}

function _updateTokenRoster() {
    const roster = document.getElementById('map-token-roster');
    if (!roster) return;
    roster.innerHTML = '';
    sortedCombatants.forEach(c => {
        const onMap = !!mapEngine?.S.tokens[c.name];
        const row = document.createElement('div');
        row.className = 'map-token-row';
        row.innerHTML = `
            <img src="${c.portrait||'assets/logo.webp'}" style="width:22px;height:22px;border-radius:50%;border:2px solid ${c.pColor||'#fff'}">
            <span style="flex:1;font-size:11px;color:white;">${c.name}</span>
            ${onMap
                ? `<button onclick="window._mapEng?.removeToken('${escapeHtml(c.name)}')" class="map-dash-btn danger">✕</button>`
                : `<button onclick="window._mapEng?.startPlacing('${escapeHtml(c.name)}')" class="map-dash-btn">📍</button>`
            }
        `;
        roster.appendChild(row);
    });
}

window.openSceneWizard = (existingData=null) => {
    if (!sceneWizard) {
        sceneWizard = new SceneWizard({
            uid, cName, activeRoom: db.getActiveRoom(), roomCode: db.getActiveRoom(), db, // E7: roomCode for handout seed
            players: sortedCombatants.reduce((a,c)=>{a[c.name]=c;return a;},{}),
            onSaved: (id, data) => {
                _initSceneManager();  // SA-2: refresh gallery so new card appears immediately
            },
            onGoLive: (id, data) => {
                activeSceneId = id;
                _activateMapCanvas(data);
                // Auto-broadcast scene to all players
                db.setDisplay(db.getActiveRoom(), { mode: 'scene', sceneId: id });
                _syncBcBar('scene');
            },
        });
    } else {
        // Refresh players
        sceneWizard.players = sortedCombatants.reduce((a,c)=>{a[c.name]=c;return a;},{});
    }
    sceneWizard.open(existingData);
};

window.activateScene = async (sceneId) => {
    if (!uid) return;
    const scenes = await db.getUserScenesOnce(uid);
    const s = scenes?.[sceneId];
    if (!s) return;
    activeSceneId = sceneId;
    const room = db.getActiveRoom();
    // Propagate all background fields (matching wizard goLive logic)
    db.setMapCfg(room, {
        ...s.config,
        bgUrl:      s.bgVideoUrl ? '' : (s.bgUrl || ''),
        bgVideoUrl: s.bgVideoUrl || '',
        bgBase64:   s.bgVideoUrl ? '' : (s.bgBase64 || ''),
    });
    if (s.atmosphere) db.setAtmosphere(room, s.atmosphere);
    // Write fog, obstacles, and triggers from saved scene
    if (s.fog && Object.keys(s.fog).length)
        db.revealFogCells(room, sceneId, s.fog);
    if (s.obstacles)
        Object.keys(s.obstacles).forEach(k => db.setObstacle(room, sceneId, k, true));
    if (s.triggers)
        Object.keys(s.triggers).forEach(k => db.setTrigger(room, sceneId, k, s.triggers[k]));
    db.setActiveScene(room, sceneId);
    _activateMapCanvas(s);
    document.querySelectorAll('.scene-gallery-card').forEach(c => c.classList.remove('active'));
    document.getElementById('sgc-'+sceneId)?.classList.add('active');
};

window.editScene = async (sceneId) => {
    if (!uid) return;
    const scenes = await db.getUserScenesOnce(uid);
    const s = scenes?.[sceneId];
    if (!s) return;
    window.openSceneWizard({ ...s, _id: sceneId });
};

window.deleteScene = async (sceneId) => {
    if (!uid) return;
    if (!(await crConfirm('This cannot be undone.', 'Delete Scene?', '🗺️', 'Delete', 'Cancel'))) return;
    db.deleteSceneFromVault(uid, sceneId);
    showToast(t('toast_scene_deleted'), 'info');
    if (activeSceneId === sceneId) window.deactivateScene();
};

window.deactivateScene = () => {
    activeSceneId = null;
    const container = document.getElementById('map-canvas-container');
    container?.classList.remove('map-bg-active');
    container?.classList.add('map-bg-hidden');
    document.getElementById('dice-arena')?.classList.remove('map-active');
    document.getElementById('map-toolbar').style.display = 'none';
    document.getElementById('zoom-controls').style.display = 'none';
    document.getElementById('dm-slot-11')?.classList.remove('dm-slot--active');
    document.getElementById('map-token-roster-popup').style.display = 'none';
    document.querySelectorAll('.scene-gallery-card').forEach(c => c.classList.remove('active'));
};

// ── DM Broadcast Display ──────────────────────────────────────────────────────
function _applyDisplay(data) {
    const overlay = document.getElementById('present-overlay');
    if (!overlay) return;
    if (!data || data.mode !== 'present') {
        overlay.className = 'present-hidden';
        overlay.innerHTML = '';
        return;
    }
    const closeBtn = userRole === 'dm'
        ? `<button id="present-close-btn" onclick="window._closePresentMode()" title="Stop presenting">✕</button>`
        : '';
    let media = '';
    if (data.mediaType === 'video') {
        // Extract video ID from any YouTube URL format
        const ytMatch = data.url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_\-]{11})/);
        const vid = ytMatch ? ytMatch[1] : null;
        if (vid) {
            const src = `https://www.youtube.com/embed/${vid}?autoplay=1&mute=1&loop=1&playlist=${vid}&controls=1&modestbranding=1&vq=hd1080&hd=1`;
            media = `<iframe src="${src}" allowfullscreen allow="autoplay"></iframe>`;
        }
    } else {
        media = `<img src="${data.url}" alt="DM presentation">`;
    }
    overlay.innerHTML = closeBtn + media;
    overlay.className = 'present-active';
}

function _syncBcBar(mode) {
    const stopBtn = document.getElementById('bc-stop');
    const presentBtn = document.getElementById('bc-present');
    if (stopBtn) stopBtn.style.display = (mode !== 'default') ? '' : 'none';
    if (presentBtn) presentBtn.classList.toggle('bc-active', mode === 'present');
}

window._broadcastDefault  = () => { db.setDisplay(db.getActiveRoom(), { mode: 'default' }); _syncBcBar('default'); showToast(t('dm_broadcast_toast_table') || '📡 Broadcast stopped', 'info'); };
window._broadcastScene    = () => { db.setDisplay(db.getActiveRoom(), { mode: 'scene', sceneId: activeSceneId }); _syncBcBar('scene'); showToast(t('dm_broadcast_toast_scene') || '📡 Scene live', 'info'); };
window._broadcastPresent  = () => {
    const url = window.prompt('Paste an image URL or a YouTube URL to present to all players:');
    if (!url || !url.trim()) return;
    const isYt = /youtu/i.test(url);
    db.setDisplay(db.getActiveRoom(), { mode: 'present', url: url.trim(), mediaType: isYt ? 'video' : 'image' });
    _syncBcBar('present');
};
window._closePresentMode  = () => window._broadcastDefault();

window.toggleScenePanel = () => {
    const panel = document.getElementById('scene-panel');
    const chev  = document.getElementById('scene-mgr-chevron');
    const open  = panel.style.display === 'none';
    panel.style.display = open ? 'flex' : 'none';
    if (chev) chev.textContent = open ? '▲' : '▼';
};

window.toggleNPCPanel = () => {
    if (userRole !== 'dm') return;
    const panel = document.getElementById('dm-npc-controls');
    const chev  = document.getElementById('npc-panel-chevron');
    const open  = panel.style.display === 'none';
    panel.style.display = open ? 'flex' : 'none';
    if (chev) chev.textContent = open ? '▲' : '▼';
};

function _activateMapCanvas(sceneData) {
    if (!mapEngine) initMap();
    if (!mapEngine._fbConnected) {
        mapEngine._fbConnected = true;
        mapEngine.setupFirebase(db);
    }
    // Load background — video takes priority over static image
    if (sceneData.bgVideoUrl) {
        mapEngine.loadBgVideo(sceneData.bgVideoUrl);
    } else if (sceneData.bgUrl) {
        mapEngine.loadBgUrl(sceneData.bgUrl);
    }
    if (sceneData.atmosphere) mapEngine.setAtmosphere(sceneData.atmosphere);
    // Apply scene-level FOW toggle (default off when not explicitly set)
    mapEngine.S.cfg.fowEnabled = !!(sceneData.config?.fowEnabled);
    const container = document.getElementById('map-canvas-container');
    container?.classList.remove('map-bg-hidden');
    container?.classList.add('map-bg-active');
    document.getElementById('dice-arena')?.classList.add('map-active');
    document.getElementById('zoom-controls').style.display = 'flex';
    if (userRole === 'dm') {
        document.getElementById('map-toolbar').style.display = 'flex';
        document.getElementById('dm-slot-11')?.classList.add('dm-slot--active');
    }
    // E2-A: Initialize PixiJS overlay (lazy — only once)
    if (!mapEngine._pixiInited) {
      mapEngine._pixiInited = true;
      mapEngine.initPixi(container); // async, non-blocking
    }
    // SD-3: Iris wipe — cinematic reveal when scene loads
    mapEngine.startIris('open');
    // Sync video toolbar button visibility after a short delay (YT player needs time to init)
    setTimeout(() => window._syncVideoToolbarBtn?.(), 1500);
    // Sync players & turn
    const playerMap = sortedCombatants.reduce((acc,c)=>{acc[c.name]=c;return acc;},{});
    mapEngine.setPlayers(playerMap);
    mapEngine.setActiveTurn(currentActiveTurn, sortedCombatants);
}

// =====================================================================
// DB LISTENERS
// =====================================================================
// DB LISTENERS
// =====================================================================
function setupDatabaseListeners() {
    _appUnsubs.push(db.listenToCombatStatus((isCombat) => {
        const btn          = document.getElementById('init-btn');
        const dmBtn        = document.getElementById('master-combat-btn');
        const turnControls = document.getElementById('dm-turn-controls');
        if (userRole === 'dm' && dmBtn) { dmBtn.innerText = isCombat ? t('end_combat') : t('open_combat'); dmBtn.style.background = isCombat ? "#c0392b" : "#2c3e50"; }
        if (userRole === 'dm' && turnControls) turnControls.style.display = isCombat ? 'flex' : 'none';
        if (isCombat) {
            if (userRole === 'dm' && currentActiveTurn === null && sortedCombatants.length > 0) {
                currentActiveTurn = 0; currentRoundNumber = 1;
                db.setActiveTurn(0, 1); updateTurnUI();
            }
            db.listenToPlayerInitiative(cName, (exists) => {
                if (btn) { btn.disabled = exists; btn.innerText = exists ? t('registered') : t('roll_init_btn'); btn.style.opacity = exists ? "0.5" : "1"; }
            });
            // Auto-play battle music when combat starts (DM only, only if no music is already playing)
            if (userRole === 'dm' && !musicPlayer.playing) {
                const battleTracks = MUSIC_LIBRARY.battle || [];
                if (battleTracks.length) {
                    const pick = battleTracks[Math.floor(Math.random() * battleTracks.length)];
                    db.setMusic(db.getActiveRoom(), { trackId: pick.id, playing: true, volume: musicPlayer.volume, ts: Date.now() });
                }
            }
        } else {
            if (btn) { btn.disabled = true; btn.innerText = t('waiting_combat'); btn.style.opacity = "0.3"; }
        }
    }));

    _appUnsubs.push(db.listenToPlayers((playersData) => {
        if (playersData) {
            // Attach resolved stats so tokenSystem + ui.js can read them without recomputing
            Object.values(playersData).forEach(p => {
                if (p.type !== 'npc') p._resolved = compute(p);
            });
            sortedCombatants = Object.keys(playersData)
                .map(k => ({ name: k, ...playersData[k] }))
                .filter(p => p.userRole !== 'dm')
                .sort((a, b) => (b.score||0) - (a.score||0));
        } else { sortedCombatants = []; }
        updateInitiativeUI(playersData, userRole, activeRoller, currentActiveTurn, sortedCombatants);
        // Sync to map engine
        if (mapEngine) {
            mapEngine.setPlayers(playersData||{});
            _updateTokenRoster();
            // S11: prune orphan map tokens for players no longer in the room
            if (playersData && userRole === 'dm') {
                pruneOrphanTokens(db.getActiveRoom(), Object.keys(playersData));
            }
        }
    }));

    _appUnsubs.push(db.listenToActiveTurn((turnIndex) => {
        const wasMyTurn = prevActiveTurn !== null && sortedCombatants[prevActiveTurn]?.name === cName;
        const isMyTurn  = turnIndex !== null       && sortedCombatants[turnIndex]?.name  === cName;
        // Trigger only when turn changes TO your character (not on load)
        if (isMyTurn && !wasMyTurn && canAnimate) {
            if (!isMuted) playYourTurnSound();
            showYourTurnBanner(cName);
        }
        prevActiveTurn    = turnIndex;
        currentActiveTurn = turnIndex;
        updateTurnUI();
        // Sync to map engine
        if (mapEngine) mapEngine.setActiveTurn(currentActiveTurn, sortedCombatants);
        updateInitiativeUI(null, userRole, activeRoller, currentActiveTurn, sortedCombatants);
        if (turnIndex !== null && sortedCombatants[turnIndex]) {
            const el = document.querySelector(`[data-combatant="${CSS.escape(sortedCombatants[turnIndex].name)}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }));

    _appUnsubs.push(db.listenToRoundNumber((round) => {
        currentRoundNumber = round;
        const el = document.getElementById('round-counter');
        if (el) el.innerText = round > 0 ? `Round ${round}` : '';
    }));

    _appUnsubs.push(db.listenToNewRolls((data) => {
        if (!data || !canAnimate) return;
        if (!isMuted) {
            if      (data.type === "DAMAGE") playDamageSound(isMuted);
            else if (data.type === "HEAL")   playHealSound(isMuted);
            else                             playRollSound(data.type, data.res, isMuted);
        }
        const time = new Date(data.ts||Date.now()).toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit' });
        if (!["DAMAGE","HEAL","STATUS"].includes(data.type)) {
            const emptyState = document.getElementById('empty-state');
            const diceVisual = document.getElementById('dice-visual');
            const resultText = document.getElementById('result-text');
            const arena      = document.getElementById('dice-arena');
            if (emptyState) emptyState.style.display = 'none';
            if (diceVisual) diceVisual.style.display  = 'flex';
            if (resultText && arena) {
                resultText.classList.remove('show','crit-success-text','crit-fail-text');
                arena.classList.remove('vfx-crit-success','vfx-crit-fail','vfx-shake');
                void arena.offsetWidth;
                resultText.innerText = (data.res||0) + (data.mod||0);
                resultText.style.color = "white";
                resultText.style.textShadow = `0 0 20px ${data.color}, 3px 3px 10px rgba(0,0,0,0.9)`;
                if (data.type === 'd20') {
                    if (data.res === 20) { arena.classList.add('vfx-crit-success'); resultText.classList.add('crit-success-text'); resultText.style.textShadow=""; resultText.style.color=""; }
                    else if (data.res === 1) { arena.classList.add('vfx-crit-fail','vfx-shake'); resultText.classList.add('crit-fail-text'); resultText.style.textShadow=""; resultText.style.color=""; }
                }
                setTimeout(() => resultText.classList.add('show'), 50);
                setTimeout(() => resultText.classList.remove('show'), 4000);
            }
        }
        addLogEntry(data, time, data.flavor || getFlavorText(data.type, data.res, (data.res + data.mod), 20));
    }));

    // DM Broadcast display — all clients mirror present-overlay state
    _appUnsubs.push(db.listenDisplay(db.getActiveRoom(), (data) => _applyDisplay(data)));

    // Listen for active scene — shows map canvas for players (and DM on page refresh)
    _appUnsubs.push(db.listenActiveScene(db.getActiveRoom(), (sceneId) => {
        if (sceneId) {
            activeSceneId = sceneId;
            if (!mapEngine?._fbConnected) _activateMapCanvas({});
        } else {
            if (activeSceneId) window.deactivateScene();
            activeSceneId = null;
        }
    }));

    // Background music — all clients mirror what the DM sets
    _appUnsubs.push(db.listenMusic(db.getActiveRoom(), (state) => {
        if (!state || !state.trackId) {
            musicPlayer.stop();
        } else {
            // Sync volume (use DM's volume as base, preserve local mute)
            musicPlayer.volume = state.volume ?? 0.5;
            const volEl = document.getElementById('music-volume');
            if (volEl) volEl.value = Math.round((state.volume ?? 0.5) * 100);
            if (state.playing) {
                musicPlayer.play(state.trackId);
            } else {
                musicPlayer.stop();
            }
        }
        // Update panel UI if open
        _updateMusicNowPlaying?.();
        _renderMusicTracks?.();
    }));
}

// ── Credits Modal ────────────────────────────────────────────────────────────
const _CREDITS = [
    { n: 'Firebase', l: 'Apache 2.0', u: 'https://firebase.google.com/', d: 'Realtime database, auth, cloud storage', c: '#F5820D' },
    { n: 'Vite', l: 'MIT', u: 'https://vitejs.dev/', d: 'Build toolchain and hot-module replacement', c: '#646CFF' },
    { n: 'Open5e API', l: 'CC-BY 4.0 + OGL 1.0a', u: 'https://open5e.com/', d: 'SRD monster, spell, and item data', c: '#E74C3C', req: true },
    { n: 'PixiJS', l: 'MIT', u: 'https://pixijs.com/', d: 'WebGL 2D rendering engine', c: '#E72264' },
    { n: 'Rot.js', l: 'BSD-3-Clause', u: 'https://github.com/ondras/rot.js', d: 'FOV algorithms and procedural map generation', c: '#9B59B6' },
    { n: 'Kenney Assets', l: 'CC0 Public Domain', u: 'https://kenney.nl/', d: 'Tileset art and UI components', c: '#E67E22' },
    { n: 'Game-Icons.net', l: 'CC-BY 3.0 (Required)', u: 'https://game-icons.net/', d: 'Icons by Lorc, Delapouite & contributors', c: '#E74C3C', req: true },
    { n: 'EasyStar.js', l: 'MIT', u: 'https://github.com/prettymuchbryce/easystarjs', d: 'A* grid pathfinding', c: '#3498DB' },
    { n: "Watabou's Dungeon", l: 'MIT / CC-BY', u: 'https://github.com/watabou/one-page-dungeon', d: 'Procedural dungeon layout generator', c: '#27AE60' },
    { n: 'Faker.js', l: 'MIT', u: 'https://fakerjs.dev/', d: 'NPC name and lore generation', c: '#885522' },
    { n: 'YouTube IFrame API', l: 'YouTube Terms of Service', u: 'https://developers.google.com/youtube/iframe_api_reference', d: 'Animated battle map video backgrounds via YouTube embed', c: '#FF0000' },
    { n: 'Kevin MacLeod', l: 'CC BY 4.0 (Required)', u: 'https://incompetech.com/', d: 'Background music library — incompetech.com', c: '#1abc9c', req: true },
    { n: 'FreePD.com', l: 'CC0 Public Domain', u: 'https://freepd.com/', d: 'Additional background music tracks', c: '#27AE60' },
    { n: 'DiceBear', l: 'MIT', u: 'https://www.dicebear.com/', d: 'Avatar generation API for NPC and wild shape portraits', c: '#5B21B6' },
    { n: 'Google Fonts (Assistant)', l: 'OFL', u: 'https://fonts.google.com/', d: 'Primary UI typeface', c: '#4285F4' },
    { n: 'DOMPurify', l: 'Apache 2.0', u: 'https://github.com/cure53/DOMPurify', d: 'HTML sanitization for user-generated content', c: '#2ECC71' },
];

function _buildCreditCard(lib) {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;gap:12px;align-items:flex-start;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;' + (lib.req ? 'border-left:3px solid #e74c3c;' : '');
    const dot = document.createElement('div');
    dot.style.cssText = 'min-width:8px;height:8px;border-radius:50%;background:' + lib.c + ';margin-top:5px;flex-shrink:0;';
    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';
    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;';
    const name = document.createElement('span');
    name.style.cssText = 'color:white;font-weight:700;font-size:13px;';
    name.textContent = lib.n;
    const badge = document.createElement('span');
    badge.style.cssText = 'background:' + lib.c + '22;border:1px solid ' + lib.c + '55;color:' + lib.c + ';font-size:10px;padding:2px 8px;border-radius:10px;white-space:nowrap;';
    badge.textContent = lib.l;
    row1.append(name, badge);
    const desc = document.createElement('div');
    desc.style.cssText = 'color:#aaa;font-size:12px;margin-top:3px;';
    desc.textContent = lib.d;
    const link = document.createElement('a');
    link.href = lib.u; link.target = '_blank';
    link.style.cssText = 'color:#3498db;font-size:11px;opacity:0.8;';
    link.textContent = lib.u;
    info.append(row1, desc, link);
    div.append(dot, info);
    return div;
}

window.openCredits = () => {
    const list = document.getElementById('credits-lib-list');
    if (list && !list.children.length) {
        _CREDITS.forEach(lib => list.appendChild(_buildCreditCard(lib)));
    }
    const m = document.getElementById('credits-modal');
    if (m) m.style.display = 'flex';
};

document.addEventListener('click', (e) => {
    if (e.target === document.getElementById('credits-modal')) {
        document.getElementById('credits-modal').style.display = 'none';
    }
});

// ══════════════════════════════════════════════════════════════
// PLAYER TOOLBAR
// ══════════════════════════════════════════════════════════════

let _ptSlots = [null, null, null, null]; // indices into _charActions
let _ptCharData = null;
const PT_THRESHOLDS = [10, 15, 25, 40, 50, 60, 75, 90, 100];

window.updatePlayerHP = function(pct, current, max) {
    const safePct = Math.max(0, Math.min(100, pct || 0));
    const pick = safePct <= 0 ? 10 : (PT_THRESHOLDS.find(t => t >= safePct) ?? 100);
    const overlay = document.getElementById('pt-hp-overlay');
    const text    = document.getElementById('pt-hp-text');
    const display = document.getElementById('pt-hp-display');
    if (overlay) { overlay.src = `/assets/TOOLBAR/${pick}.webp`; overlay.style.display = ''; }
    if (text)    text.textContent = max > 0 ? `${Math.round(current)}/${max}` : '—';
    if (display) display.classList.toggle('pt-hp-critical', safePct > 0 && safePct < 30);
};

window.initPlayerToolbar = function(charData) {
    _ptCharData = charData;
    // Load persisted slot assignments
    try {
        const saved = localStorage.getItem('pt_slots_' + (charData.name || ''));
        if (saved) _ptSlots = JSON.parse(saved);
    } catch (_) {}
    // Render assignable slots 0-3
    for (let i = 0; i < 4; i++) _renderPtActionSlot(i);
    // Set initial HP
    const hp    = charData.hp    ?? charData.maxHp ?? 0;
    const maxHp = charData.maxHp ?? 0;
    window.updatePlayerHP(maxHp > 0 ? (hp / maxHp * 100) : 100, hp, maxHp);
};

function _renderPtActionSlot(idx) {
    const btn     = document.getElementById(`pt-slot-${idx}`);
    if (!btn) return;
    const actionIdx = _ptSlots[idx];
    const action    = (actionIdx != null) ? (_charActions[actionIdx] ?? null) : null;
    if (action) {
        btn.innerHTML = `
            <span class="pt-slot-key">${idx + 1}</span>
            <div class="pt-slot-inner">
                <span class="pt-slot-icon">${iconImg(action.icon || '⚔️', '20px', 'Action')}</span>
                <span class="pt-slot-label">${action.name || '?'}</span>
            </div>`;
        btn.onclick = (e) => { e.stopPropagation(); window._openActionChoice(actionIdx, btn); };
        btn.title   = action.name;
    } else {
        btn.innerHTML = `
            <span class="pt-slot-key">${idx + 1}</span>
            <div class="pt-slot-inner">
                <span class="pt-slot-icon">+</span>
                <span class="pt-slot-label">ASSIGN</span>
            </div>`;
        btn.onclick = () => window.openActionAssignPanel(idx);
        btn.title   = `Assign to slot ${idx + 1}`;
    }
}

function _savePtSlots() {
    try {
        localStorage.setItem('pt_slots_' + ((_ptCharData?.name) || ''), JSON.stringify(_ptSlots));
    } catch (_) {}
}

window._closePtPopups = function() {
    ['pt-action-picker', 'pt-special-popup', 'pt-rest-popup', 'pt-action-choice'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
    });
    document.getElementById('pt-popup-backdrop')?.classList.add('hidden');
};

function _showPtPopup(id) {
    window._closePtPopups();
    document.getElementById(id)?.classList.remove('hidden');
    document.getElementById('pt-popup-backdrop')?.classList.remove('hidden');
}

window.openActionAssignPanel = function(slotIdx) {
    const list = document.getElementById('pt-action-picker-list');
    if (!list) return;
    list.innerHTML = '';
    if (!_charActions.length) {
        list.innerHTML = `<div style="padding:8px;color:rgba(255,255,255,0.5);font-size:12px;">${t('pt_no_actions')}</div>`;
    } else {
        _charActions.forEach((action, idx) => {
            const item = document.createElement('button');
            item.className = 'pt-picker-item';
            item.innerHTML = `<span class="pt-picker-icon">${iconImg(action.icon || '⚔️', '20px', 'Action')}</span>
                <span class="pt-picker-name">${action.name}</span>
                <span class="pt-picker-meta">${action.damageDice || ''}</span>`;
            item.onclick = () => {
                _ptSlots[slotIdx] = idx;
                _savePtSlots();
                _renderPtActionSlot(slotIdx);
                window._closePtPopups();
            };
            list.appendChild(item);
        });
        // "Clear slot" option if slot is assigned
        if (_ptSlots[slotIdx] != null) {
            const clear = document.createElement('button');
            clear.className = 'pt-picker-item';
            clear.style.borderColor = 'rgba(200,60,60,0.3)';
            clear.innerHTML = `<span class="pt-picker-icon">✕</span><span class="pt-picker-name" style="color:rgba(200,100,100,0.9)">${t('pt_clear_slot')}</span>`;
            clear.onclick = () => { _ptSlots[slotIdx] = null; _savePtSlots(); _renderPtActionSlot(slotIdx); window._closePtPopups(); };
            list.appendChild(clear);
        }
    }
    // Anchor popup above its slot
    const popup  = document.getElementById('pt-action-picker');
    const slotEl = document.getElementById(`pt-slot-${slotIdx}`);
    if (popup && slotEl) {
        const rect = slotEl.getBoundingClientRect();
        popup.style.left = Math.max(4, rect.left - 10) + 'px';
        popup.style.right = 'auto';
    }
    _showPtPopup('pt-action-picker');
};

window.openSpecialAbilitiesMenu = function() {
    const list = document.getElementById('pt-special-list');
    if (!list || !_ptCharData) return;
    list.innerHTML = '';

    const playerSnapshot = { ..._ptCharData };
    // Try to pull live classResources from Firebase cache
    const liveKey = `paradice_cr_${cName}`;
    try {
        const cached = JSON.parse(localStorage.getItem(liveKey) || 'null');
        if (cached) playerSnapshot.classResources = cached;
    } catch (_) {}

    const actions = getSelfActions(playerSnapshot);

    // Dragonborn breath weapon
    if (playerSnapshot.race === 'Dragonborn') {
        actions.push({
            label: '🐉 Breath Weapon',
            cls: 'dragonborn',
            available: true,
            fn: () => window.roll('d6', false, '🐉 Breath Weapon!')
        });
    }

    if (!actions.length) {
        list.innerHTML = `<div style="padding:8px;color:rgba(255,255,255,0.5);font-size:12px;">${t('pt_no_special')}</div>`;
    } else {
        actions.forEach(ab => {
            const btn = document.createElement('button');
            btn.className = 'pt-ability-btn';
            btn.disabled  = !ab.available;
            const usesText = (ab.uses != null) ? `<span class="pt-ability-uses">${ab.uses} left</span>` : '';
            btn.innerHTML  = `${ab.label}${usesText}`;
            btn.onclick    = () => { ab.fn(cName); window._closePtPopups(); };
            list.appendChild(btn);
        });
    }

    const popup  = document.getElementById('pt-special-popup');
    const slotEl = document.getElementById('pt-slot-4');
    if (popup && slotEl) {
        const rect = slotEl.getBoundingClientRect();
        popup.style.left = Math.max(4, rect.left - 10) + 'px';
        popup.style.right = 'auto';
    }
    _showPtPopup('pt-special-popup');
};

window.openRestMenu = function() {
    const popup  = document.getElementById('pt-rest-popup');
    const slotEl = document.getElementById('pt-slot-5');
    if (popup && slotEl) {
        const rect = slotEl.getBoundingClientRect();
        popup.style.left = Math.max(4, rect.left - 10) + 'px';
        popup.style.right = 'auto';
    }
    _showPtPopup('pt-rest-popup');
};

window._ptLongRest = function() {
    if (cName) window.longRest?.(cName);
};

// ── Action Choice Popup (Bug 5) ─────────────────────────────
let _ptActiveActionIdx = null;
window._openActionChoice = function(idx, anchorEl) {
    _ptActiveActionIdx = idx;
    const action = _charActions[idx];
    const popup  = document.getElementById('pt-action-choice');
    if (!popup || !action) return;
    const hasHit = action.hitType !== 'none';
    const hasDmg = !!action.damageDice;
    document.getElementById('pt-choice-hit').style.display  = hasHit ? '' : 'none';
    document.getElementById('pt-choice-dmg').style.display  = hasDmg ? '' : 'none';
    document.getElementById('pt-choice-both').style.display = (hasHit && hasDmg) ? '' : 'none';
    // Reset per-roll modifier
    const modInp = document.getElementById('pt-action-mod-input');
    if (modInp) modInp.value = 0;
    if (anchorEl) {
        const r = anchorEl.getBoundingClientRect();
        popup.style.left = Math.max(4, r.left - 10) + 'px';
        popup.style.right = 'auto';
    }
    popup.classList.remove('hidden');
    document.getElementById('pt-popup-backdrop')?.classList.remove('hidden');
};
window._ptFireHit = async function() {
    const extraMod = parseInt(document.getElementById('pt-action-mod-input')?.value) || 0;
    window._closePtPopups();
    const action = _charActions[_ptActiveActionIdx];
    if (!action) return;
    if (action.hitType === 'always') showToast(`🎯 ${action.name} — Auto Hit!`, 'info');
    else await window.rollMacro(cName, action.name, (parseInt(action.hitMod) || 0) + extraMod);
};
window._ptFireDmg = async function() {
    const extraMod = parseInt(document.getElementById('pt-action-mod-input')?.value) || 0;
    window._closePtPopups();
    const action = _charActions[_ptActiveActionIdx];
    if (!action) return;
    const mult   = parseInt(action.damageMult) || 1;
    const dmgStr = action.damageDice
        ? (mult > 1 ? action.damageDice.replace(/^\d+/, n => String(parseInt(n) * mult)) : action.damageDice)
        : '';
    if (dmgStr) await window.rollDamageMacro(cName, action.name, dmgStr, extraMod, action.actionType || 'damage');
};
window._ptFireBoth = async function() {
    window._closePtPopups();
    await window._ptFireHit();
    await new Promise(r => setTimeout(r, 1200)); // wait for cooldown
    await window._ptFireDmg();
};

// ── Dice popup modifier helper (Bug 3) ──────────────────────
window._ptAdjMod = function(delta) {
    const inp = document.getElementById('pt-mod-input');
    if (inp) inp.value = Math.max(-10, Math.min(20, (parseInt(inp.value) || 0) + delta));
};

// ── Action choice popup modifier helper ─────────────────────
window._ptAdjActionMod = function(delta) {
    const inp = document.getElementById('pt-action-mod-input');
    if (inp) inp.value = Math.max(-20, Math.min(20, (parseInt(inp.value) || 0) + delta));
};

// ════════════════════════════════════════════════════════════
// DM TOOLBAR
// ════════════════════════════════════════════════════════════

// ── DM HP gem update (mirrors updatePlayerHP) ──────────────
window.updateDMHP = function(pct, current, max) {
    const safePct = Math.max(0, Math.min(100, pct || 0));
    const pick = safePct <= 0 ? 10 : (PT_THRESHOLDS.find(t => t >= safePct) ?? 100);
    const overlay = document.getElementById('dm-hp-overlay');
    const text    = document.getElementById('dm-hp-text');
    const display = document.getElementById('dm-hp-display');
    if (overlay) { overlay.src = `/assets/TOOLBAR/${pick}.webp`; overlay.style.display = ''; }
    if (text)    text.textContent = max > 0 ? `${Math.round(current)}/${max}` : '—';
    if (display) display.classList.toggle('dm-hp-critical', safePct > 0 && safePct < 30);
};

// ── DM Popup helpers ──────────────────────────────────────
window._closeDMPopups = function() {
    ['dm-combat-popup','dm-broadcast-popup','dm-rest-popup','dm-scenes-popup','dm-campaign-popup','dm-notes-popup'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
    });
    document.getElementById('dm-popup-backdrop')?.classList.add('hidden');
    _dmCampaignPopupUnsubs.forEach(u => u?.());
    _dmCampaignPopupUnsubs = [];
};

function _showDMPopup(id) {
    window._closeDMPopups();
    document.getElementById(id)?.classList.remove('hidden');
    document.getElementById('dm-popup-backdrop')?.classList.remove('hidden');
}

window._openDMCombatPopup    = function() { _showDMPopup('dm-combat-popup'); };
window._openDMBroadcastPopup = function() { _showDMPopup('dm-broadcast-popup'); };
window._openDMRestPopup      = function() { _showDMPopup('dm-rest-popup'); };

// ── Map Editor Toggle ────────────────────────────────────────
window._toggleMapEditor = function() {
    const toolbar = document.getElementById('map-toolbar');
    if (!toolbar) return;
    const isVisible = toolbar.style.display === 'flex';
    toolbar.style.display = isVisible ? 'none' : 'flex';
    document.getElementById('dm-slot-11')?.classList.toggle('dm-slot--active', !isVisible);
};

// ── Scenes Popup ─────────────────────────────────────────────
window._openDMScenesPopup = async function() {
    _showDMPopup('dm-scenes-popup');
    const list = document.getElementById('dm-scenes-saved-list');
    if (!list) return;
    list.innerHTML = '<div class="dm-scenes-loading">…</div>';
    const esc = s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    try {
        const scenes = await db.getUserScenesOnce(uid);
        list.innerHTML = '';
        if (!scenes || !Object.keys(scenes).length) {
            list.innerHTML = `<div class="dm-scenes-empty">${t('dm_scenes_empty') || 'No saved scenes'}</div>`;
            return;
        }
        Object.entries(scenes).forEach(([id, s]) => {
            const item = document.createElement('div');
            item.className = 'dm-scene-item';
            item.innerHTML = `
                <span class="dm-scene-name">${esc(s.name || id)}</span>
                <button class="dm-scene-act-btn" title="${t('dm_scenes_activate')||'Activate'}"
                    onclick="window.activateScene('${esc(id)}'); window._closeDMPopups();">▶</button>
                <button class="dm-scene-edit-btn" title="${t('dm_scenes_edit')||'Edit'}"
                    onclick="window.editScene('${esc(id)}'); window._closeDMPopups();"><img src="/assets/icons/toolbar/editor.png" alt="Edit" class="custom-icon" style="width:14px;height:14px;" loading="lazy"></button>`;
            list.appendChild(item);
        });
    } catch(e) {
        list.innerHTML = '<div class="dm-scenes-empty">Error loading scenes</div>';
    }
};

// ── Long rest handler for DM (triggers global long rest logic) ──
window._dmLongRest = function() {
    if (typeof onLongRest === 'function') {
        onLongRest(window._dmCName || cName, true);
    }
};

// ── Combat popup sync (called by existing toggleCombat/updateRound) ──
window._syncDMCombatPopup = function(isActive, round) {
    const btn     = document.getElementById('dm-combat-toggle-btn');
    const details = document.getElementById('dm-combat-details');
    const roundEl = document.getElementById('dm-round-display');
    if (btn) {
        btn.innerHTML = isActive
            ? (t('dm_combat_toggle_end')   || 'End Combat')
            : (t('dm_combat_toggle_start') || `${iconImg('⚔️', '14px', 'Combat')} Start Combat`);
    }
    if (details) details.classList.toggle('hidden', !isActive);
    if (roundEl && round != null) roundEl.textContent = round;
};

// ── DM Notes ─────────────────────────────────────────────────
let _dmNotesUnsub = null;
let _dmNotesCurrent = [];   // local cache of notes from Firebase
let _dmActiveNoteId = null;
let _dmNoteSaveTimer = null;
let _dmIsCampaign = false;

// ── Campaign Popup ───────────────────────────────────────────
let _dmCampaignPopupUnsubs = [];

window._openDMCampaignPopup = function() {
    _showDMPopup('dm-campaign-popup');
    const campaignId = db.getActiveRoom();
    const body    = document.getElementById('dm-campaign-popup-body');
    const nocamp  = document.getElementById('dm-campaign-popup-nocampaign');
    if (!_dmIsCampaign || !campaignId) {
        body?.classList.add('hidden');
        nocamp?.classList.remove('hidden');
        return;
    }
    body?.classList.remove('hidden');
    nocamp?.classList.add('hidden');

    const esc = s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const pendingEl = document.getElementById('dm-camp-pending-list');
    const playersEl = document.getElementById('dm-camp-players-list');

    // Live pending requests
    const unsubPending = db.listenToPendingRequests(campaignId, pending => {
        if (!pendingEl) return;
        const entries = pending ? Object.entries(pending) : [];
        if (!entries.length) {
            pendingEl.innerHTML = `<div class="dm-camp-empty">${t('dm_campaign_empty_pending')}</div>`;
        } else {
            pendingEl.innerHTML = entries.map(([uid, r]) => `
                <div class="dm-camp-item">
                    <div class="dm-camp-item-info">
                        <span class="dm-camp-name">${esc(r.playerName)}</span>
                        <span class="dm-camp-char">${esc(r.charName || '')}</span>
                    </div>
                    <button class="dm-camp-btn dm-camp-btn--approve" title="${t('dm_campaign_approve')}"
                        onclick="window.__campaignApprove('${esc(campaignId)}','${esc(uid)}')"><img src="/assets/icons/toolbar/advantage.png" alt="Approve" class="custom-icon" style="width:16px;height:16px;" loading="lazy"></button>
                    <button class="dm-camp-btn dm-camp-btn--deny" title="${t('dm_campaign_deny')}"
                        onclick="window.__campaignDeny('${esc(campaignId)}','${esc(uid)}')">✗</button>
                </div>`).join('');
        }
    });

    // Live participants
    const unsubPlayers = db.listenToCampaignAllowedPlayers(campaignId, players => {
        if (!playersEl) return;
        const entries = players ? Object.entries(players).filter(([id]) => id !== uid) : [];
        if (!entries.length) {
            playersEl.innerHTML = `<div class="dm-camp-empty">${t('dm_campaign_empty_players')}</div>`;
        } else {
            playersEl.innerHTML = entries.map(([pUid, p]) => `
                <div class="dm-camp-item">
                    <div class="dm-camp-item-info">
                        <span class="dm-camp-name">${esc(p.playerName)}</span>
                        <span class="dm-camp-char">${esc(p.charName || '')}</span>
                    </div>
                    <button class="dm-camp-btn dm-camp-btn--kick" title="${t('dm_campaign_kick')}"
                        onclick="window.__campaignKick('${esc(campaignId)}','${esc(pUid)}')">🥾</button>
                </div>`).join('');
        }
    });

    _dmCampaignPopupUnsubs = [unsubPending, unsubPlayers];
};

window._openFullCampaignManager = function() {
    window._closeDMPopups();
    const campaignId = db.getActiveRoom();
    if (campaignId && _dmIsCampaign) window.__campaignManage?.(campaignId);
};

window._updateDMCampaignBadge = function(count) {
    const badge = document.getElementById('dm-campaign-badge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
};

window._openDMNotesPopup = function() {
    _showDMPopup('dm-notes-popup');
    // Start listener if not already running
    if (!_dmNotesUnsub) {
        _dmNotesUnsub = db.listenDMNotes(_renderDMNotesList, _dmIsCampaign);
    }
};

function _renderDMNotesList(notes) {
    _dmNotesCurrent = notes;
    const list = document.getElementById('dm-notes-list');
    if (!list) return;
    list.innerHTML = '';
    notes.forEach(note => {
        const item = document.createElement('div');
        item.className = 'dm-note-item' + (note.id === _dmActiveNoteId ? ' active' : '');
        item.innerHTML = `
            <span class="dm-note-item-title">${escapeHtml(note.title || t('dm_notes_placeholder') || 'Untitled')}</span>
            <span class="dm-note-tag-badge">${escapeHtml(note.tag || '')}</span>
            <button class="dm-note-delete-btn" title="Delete" onclick="window._dmDeleteNote('${note.id}', event)">✕</button>`;
        item.addEventListener('click', e => {
            if (e.target.classList.contains('dm-note-delete-btn')) return;
            _dmLoadNoteInEditor(note);
        });
        list.appendChild(item);
    });
}

function _dmLoadNoteInEditor(note) {
    _dmActiveNoteId = note.id;
    const editor = document.getElementById('dm-notes-editor');
    const titleInp = document.getElementById('dm-note-title-input');
    const tagSel   = document.getElementById('dm-note-tag-select');
    const content  = document.getElementById('dm-note-content-input');
    if (editor)   editor.style.display = 'flex';
    if (titleInp) titleInp.value = note.title || '';
    if (tagSel)   tagSel.value   = note.tag   || 'other';
    if (content)  content.value  = note.content || '';
    // Highlight active in list
    document.querySelectorAll('.dm-note-item').forEach(el => el.classList.remove('active'));
    const items = document.querySelectorAll('.dm-note-item');
    const idx = _dmNotesCurrent.findIndex(n => n.id === note.id);
    if (items[idx]) items[idx].classList.add('active');
}

window._dmNewNote = function() {
    const id = `note_${Date.now()}`;
    const blank = { id, title: '', content: '', tag: 'other' };
    db.saveDMNote(id, blank, _dmIsCampaign)
        .then(() => _dmLoadNoteInEditor(blank))
        .catch(e => console.warn('DM note create failed:', e));
};

window._dmDeleteNote = function(id, evt) {
    if (evt) evt.stopPropagation();
    if (!confirm(t('dm_notes_delete_confirm') || 'Delete this note?')) return;
    db.deleteDMNote(id, _dmIsCampaign)
        .catch(e => console.warn('DM note delete failed:', e));
    if (_dmActiveNoteId === id) {
        _dmActiveNoteId = null;
        const editor = document.getElementById('dm-notes-editor');
        if (editor) editor.style.display = 'none';
    }
};

function _dmScheduleNoteSave() {
    if (!_dmActiveNoteId) return;
    clearTimeout(_dmNoteSaveTimer);
    _dmNoteSaveTimer = setTimeout(() => {
        const title   = document.getElementById('dm-note-title-input')?.value || '';
        const tag     = document.getElementById('dm-note-tag-select')?.value  || 'other';
        const content = document.getElementById('dm-note-content-input')?.value || '';
        db.saveDMNote(_dmActiveNoteId, { title, content, tag }, _dmIsCampaign)
            .catch(e => console.warn('DM note autosave failed:', e));
    }, 800);
}

// Attach autosave listeners once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    ['dm-note-title-input','dm-note-tag-select','dm-note-content-input'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', _dmScheduleNoteSave);
        document.getElementById(id)?.addEventListener('change', _dmScheduleNoteSave);
    });

    // ── Make all popups draggable, scrollable, closeable ────────────
    // Action popup (combat right-click)
    makeDraggable(document.getElementById('action-popup'), document.getElementById('action-popup-header'));

    // DM popups (toolbar popups)
    const dmPopups = [
        { id: 'dm-combat-popup',    header: '.dm-popup-header' },
        { id: 'dm-broadcast-popup', header: '.dm-popup-header' },
        { id: 'dm-rest-popup',      header: '.dm-popup-header' },
        { id: 'dm-scenes-popup',    header: '.dm-popup-header' },
        { id: 'dm-campaign-popup',  header: '.dm-popup-header' },
        { id: 'dm-notes-popup',     header: '.dm-popup-header' },
    ];
    dmPopups.forEach(({ id, header }) => {
        const el = document.getElementById(id);
        if (!el) return;
        const handle = el.querySelector(header);
        if (handle) makeDraggable(el, handle);
        makeScrollable(el, 70);
    });

    // Player popups
    const ptPopups = ['pt-special-popup', 'pt-rest-popup', 'pt-action-picker'];
    ptPopups.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const handle = el.querySelector('.pt-popup-header') || el.querySelector('h4') || el.firstElementChild;
        if (handle) makeDraggable(el, handle);
        makeScrollable(el, 60);
    });

    // Music panel
    const musicPanel = document.getElementById('music-panel');
    if (musicPanel) {
        const musicHeader = musicPanel.querySelector('.music-header') || musicPanel.firstElementChild;
        if (musicHeader) makeDraggable(musicPanel, musicHeader);
        ensureCloseButton(musicPanel, () => window._toggleMusicPanel?.(), '.music-close');
    }

    // Map token roster
    const roster = document.getElementById('map-token-roster-popup');
    if (roster) {
        makeScrollable(roster, 50);
        ensureCloseButton(roster, () => { roster.style.display = 'none'; });
    }

    // ── Auto-enhance dynamically created panels ──────────────────────
    // Spell panel, NPC panel, stat block — created on first open
    const _enhanced = new Set();
    new MutationObserver(() => {
        const panels = [
            { dialog: 'spell-panel-dialog',  header: 'spell-panel-header' },
            { dialog: 'npc-panel-dialog',    header: null }, // first child as handle
            { dialog: 'stat-block-panel',    header: null },
        ];
        panels.forEach(({ dialog, header }) => {
            const el = document.getElementById(dialog);
            if (!el || _enhanced.has(dialog)) return;
            _enhanced.add(dialog);
            const handle = header ? document.getElementById(header) : el.firstElementChild;
            if (handle) makeDraggable(el, handle);
        });
    }).observe(document.body, { childList: true, subtree: true });
});

