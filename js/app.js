// app.js v130  (S10-S16: foundation, data-health, UX, turn timer, portrait upload)
import { initDiceEngine, updateDiceColor, roll3DDice } from "./diceEngine.js";
import { getFlavorText } from "./messages.js";
import { unlockAudio, playRollSound, stopAllSounds, playStartRollSound, playHealSound, playDamageSound, playYourTurnSound } from "./audio.js";
import { updateModeUI, updateInitiativeUI, addLogEntry, setDiceCooldown } from "./ui.js";
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
import { initMonsterBook } from "./monsterBook.js";
import { fetchMonsterBySlug, open5eToNPC } from "./open5e.js";
import { VideoLayer } from "./videoLayer.js";
import { initClassResources, onShortRest, onLongRest, WILD_SHAPES } from "./engine/classAbilities.js";
import { statusFlavor, healFlavor } from "./combatFlavor.js";
import { MusicPlayer, MUSIC_LIBRARY, MUSIC_CATEGORIES, TRACK_BY_ID } from "./musicPlayer.js";

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
        db.saveRollToDB({ cName: targetCName, type: "STATUS", status: `💚 ${targetCName} is STABLE!`, ts: Date.now() });
    }
    if (fails >= 3) {
        saves.dead = true;
        db.saveRollToDB({ cName: targetCName, type: "STATUS", status: `💀 ${targetCName} has DIED!`, ts: Date.now() });
    }
    db.updateDeathSavesInDB(targetCName, saves);
};

window.resetDeathSaves = async (targetCName) => {
    db.updateDeathSavesInDB(targetCName, { successes: [false,false,false], failures: [false,false,false], stable: false, dead: false });
};

window.toggleConcentration = async (targetCName) => {
    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    const newVal = !p.concentrating;
    db.updateConcentrationInDB(targetCName, newVal);
    db.saveRollToDB({ cName: targetCName, type: "STATUS", status: newVal ? `🔮 ${targetCName} is concentrating!` : `🔮 ${targetCName} lost concentration.`, ts: Date.now() });
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
    db.saveRollToDB({ cName: targetCName, type: "STATUS", status: `🔮 ${targetCName} used a level ${level} spell slot (${maxForLevel - currentUsed - 1} remaining).`, ts: Date.now() });
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
    const target = cName || (userRole === 'dm' && activeRoller?.cName);
    if (!target) return;
    db.addSpellToBook(target, {
        slug:         spell.slug || spell.name,
        name:         spell.name,
        level:        spell.level_int ?? 0,
        school:       spell.school?.name || spell.school || '',
        range:        spell.range || '30 feet',
        casting_time: spell.casting_time || '1 action',
        damage_dice:  spell.damage?.damage_dice || '',
        attack_type:  spell.attack_type || '',
        dc_type:      spell.dc?.dc_type?.name || '',
        concentration: spell.concentration || false,
    });
    db.saveRollToDB({ cName: target, type: 'STATUS', status: statusFlavor('spellLearned', target, null, spell.name), ts: Date.now() });
};

window.removeSpellFromBook = (targetCName, slug) => {
    db.removeSpellFromBook(targetCName, slug);
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

        default: break;
    }
};

// ── Wild Shape modal helper ────────────────────────────────────────────────────
function _openWildShapeModal(forCName, summonMode) {
    const modal = document.getElementById('wild-shape-modal');
    if (!modal) return;
    document.getElementById('ws-modal-title').textContent = summonMode ? 'Summon Animal' : 'Choose Wild Shape';
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
    return { wolf: '🐺', brown_bear: '🐻', panther: '🐆', eagle: '🦅' }[id] || '🐾';
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
    db.saveRollToDB({ cName: targetCName, type: "STATUS", status: statusFlavor('longRest', targetCName), ts: Date.now() });
};

window.rerollAllInitiatives = async () => {
    if (userRole !== 'dm') return;
    const ok = await crConfirm(t('reroll_confirm_msg'), t('reroll_confirm_title'), '🎲', t('reroll_confirm_ok'), t('confirm_cancel'));
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
    db.saveRollToDB({ cName: "DM", type: "STATUS", status: `🎲 Initiatives re-rolled! Round 1`, ts: Date.now() });
};


// =====================================================================
// UI SYSTEM — Toast, Spinner, ConfirmModal (Sprint 12)
// =====================================================================
let _confirmResolve = null;

// Show a non-blocking toast notification
// type: 'success' | 'error' | 'info' | 'warning'
export function showToast(msg, type='info', durationMs=3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
    const el = document.createElement('div');
    el.className = `cr-toast ${type}`;
    el.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
    container.appendChild(el);
    const remove = () => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 320); };
    const timer = setTimeout(remove, durationMs);
    el.addEventListener('click', () => { clearTimeout(timer); remove(); });
}
window.showToast = showToast;

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
export function crConfirm(msg, title='Are you sure?', icon='⚠️', okLabel='Confirm', cancelLabel='Cancel') {
    return new Promise(resolve => {
        const overlay = document.getElementById('cr-confirm-overlay');
        if (!overlay) { resolve(window.confirm(msg)); return; }  // fallback
        document.getElementById('cr-confirm-icon').textContent  = icon;
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
musicPlayer.onBlocked(() => showToast('🎵 Click anywhere to start music', 'info'));
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
    musicPlayer.onError(track => showToast(`⚠️ Track unavailable: ${track.title}`, 'warning'));
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
        el.textContent = 'No track playing';
    }
    if (muteBtn) muteBtn.textContent = musicPlayer.localMuted ? '🔇' : '🔊';
    // Player music button — visible when music is active (all roles)
    const playerBtn = document.getElementById('player-music-btn');
    if (playerBtn) {
        const hasTrack = !!musicPlayer.currentId;
        // Hide for DM (they use the toolbar button); show for everyone else when music is active
        const isDM = document.getElementById('map-toolbar')?.style.display !== 'none';
        playerBtn.style.display = (hasTrack && !isDM) ? 'flex' : 'none';
        playerBtn.style.alignItems = 'center';
        playerBtn.style.justifyContent = 'center';
        playerBtn.textContent = musicPlayer.localMuted ? '🔇' : '🔊';
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
}


// =====================================================================
// SHORT REST MECHANIC (Sprint 16)
// Allows players to spend Hit Dice to recover HP between encounters.
// =====================================================================
const HIT_DICE_BY_CLASS = {
    'Barbarian':6, 'Fighter':5, 'Paladin':5, 'Ranger':5, 'Cleric':4,
    'Druid':4, 'Monk':4, 'Rogue':4, 'Bard':3, 'Warlock':3,
    'Sorcerer':3, 'Wizard':2, 'default':4
};

window.openShortRest = async function() {
    if (userRole !== 'player') return;

    const playerData = await db.getPlayerData(cName);
    if (!playerData) return;

    const charClass  = playerData.charClass || 'default';
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
          <button id="sr-roll" style="padding:10px 24px;border-radius:8px;background:var(--cr-green);color:#fff;border:none;font-weight:700;cursor:pointer;">🎲 Roll & Rest</button>
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

export async function startGame(role, charData, roomCode) {
    db.setRoom(roomCode);
    userRole = role;
    const lobbyWrapper = document.getElementById('lobby-wrapper');
    if (lobbyWrapper) lobbyWrapper.style.display = 'none';
    const gameScreen = document.getElementById('game-screen');
    if (gameScreen) gameScreen.style.display = 'flex';
    const titleHeader = document.querySelector('#side-panel h3');
    if (titleHeader) titleHeader.innerText = `${t('party_title')} (${roomCode})`;

    if (userRole === 'player') {
        pName       = document.getElementById('user-display-name')?.innerText || "Player";
        cName       = charData.name;
        pColor      = charData.color || "#3498db";
        charPortrait = charData.portrait;
        localStorage.setItem('critroll_initBonus', charData.initBonus || 0);
        localStorage.setItem('critroll_cName', cName);
        db.joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, charData);
        // Initialize classResources if not already set
        if (!charData.classResources && charData.class) {
            db.patchClassResources(cName, initClassResources(charData.class, charData.level));
        }
    } else {
        pName        = document.getElementById('user-display-name')?.innerText || "DM";
        cName        = "DM_" + pName;
        pColor       = "#c0392b";
        charPortrait = document.getElementById('user-avatar')?.src || "assets/logo.png";
        document.getElementById('master-combat-btn').style.display    = 'block';
        document.getElementById('dm-turn-controls').style.display     = 'none';
        document.getElementById('reroll-initiatives-btn').style.display = 'block';
        document.getElementById('npc-gen-btn').style.display          = 'block';
        document.getElementById('monster-book-btn').style.display     = 'block';
        document.getElementById('refresh-npcs-btn').style.display     = 'block';
        document.getElementById('dm-music-btn').style.display         = 'block';
        document.getElementById('short-rest-btn').style.display       = 'none';
        localStorage.setItem('critroll_cName', 'DM');
        initMonsterBook();
        populateMonsterSelect();
        db.joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, { isHidden: true });
    }

    showSpinner('Joining room…');
    setupDatabaseListeners();
    initMap();
    unlockAudio();
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

    try { await initDiceEngine(); isDiceBoxReady = true; }
    catch (e) { console.error("Dice engine failed:", e); }
    hideSpinner();
    showToast(t('toast_joined'), 'success');
    setTimeout(() => { canAnimate = true; }, 800);
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
        if (p.bonusActionUsed)  patch.bonusActionUsed  = false;
        // Legendary resets at start of that creature's OWN next turn
        if (p.legendaryMax > 0) patch.legendaryUsed = 0;
        if (Object.keys(patch).length) db.patchPlayerInDB?.(endingName, patch);
    }

    let next = (currentActiveTurn === null ? 0 : currentActiveTurn + 1);
    let round = currentRoundNumber;
    if (next >= sortedCombatants.length) {
        next = 0;
        round++;
        db.saveRollToDB({ cName: "DM", type: "STATUS", status: `⚔️ Round ${round}!`, ts: Date.now() });
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
    if (roundEl)  roundEl.innerText  = currentRoundNumber > 0 ? `Round ${currentRoundNumber}` : '';
    if (activeEl) activeEl.innerText = name;
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
        } else { finalRes = (await roll3DDice(`1${type}`))[0].value; }
    } catch { isCooldown = false; setDiceCooldown(false); return; }
    const mod = isInit
        ? (parseInt(localStorage.getItem('critroll_initBonus')) || 0)
        : (parseInt(document.getElementById('mod-input')?.value) || 0);
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

window.rollDamageMacro = async (targetCName, attackName, diceString, bonus) => {
    if (isCooldown || !isDiceBoxReady) return;
    if (!diceString || diceString === '0') { showToast(t('alert_no_dmg'), 'error'); return; }
    isCooldown = true; setDiceCooldown(true); playStartRollSound(isMuted);
    const p = await db.getPlayerData(targetCName);
    const macroColor = p?.pColor || "#e74c3c";
    await updateDiceColor(macroColor);
    let finalRes = 0;
    try { finalRes = (await roll3DDice(diceString)).reduce((s, d) => s + d.value, 0); }
    catch { isCooldown = false; setDiceCooldown(false); return; }
    db.saveRollToDB({ pName: p?.pName || "DM", cName: targetCName, type: diceString, res: finalRes, mod: parseInt(bonus)||0, color: macroColor, mode: 'normal', flavor: `${t('log_roll_dmg')} ${attackName}!`, ts: Date.now() });
    setTimeout(() => { isCooldown = false; setDiceCooldown(false); }, 1000);
};

window.changeHP = async (targetCName, isPlus) => {
    const inputField = document.getElementById(`hp-input-${targetCName}`);
    const amount = parseInt(inputField?.value) || 1;
    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    const newHp = Math.max(0, Math.min(p.maxHp, (p.hp || 0) + (isPlus ? amount : -amount)));
    db.updatePlayerHPInDB(targetCName, newHp);
    // Auto-break concentration on damage
    if (!isPlus && p.concentrating) {
        db.updateConcentrationInDB(targetCName, false);
        db.saveRollToDB({ cName: targetCName, type: "STATUS", status: `🔮 ${targetCName} lost concentration! (took damage)`, ts: Date.now() });
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

window.removeNPC = async (targetCName) => {
    if (userRole !== 'dm') return;
    if (await crConfirm(`${t('remove_confirm_msg')||'Remove'} ${targetCName}?`, t('remove_char_title')||'Remove Character', '🗑️', t('remove_confirm_ok'), t('confirm_cancel'))) {
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
    document.getElementById('active-roller-banner').style.display = 'flex';
    document.getElementById('active-roller-name').innerText = targetCName;
    updateDiceColor(activeRoller.color);
};
window.resetRoller = () => {
    activeRoller = null;
    document.getElementById('active-roller-banner').style.display = 'none';
    updateDiceColor(pColor);
};

window.setMode      = (mode) => { activeMode = activeMode === mode ? 'normal' : mode; updateModeUI(activeMode); };
window.getCombatMode = () => activeMode;
window.toggleMute = () => { isMuted = !isMuted; document.getElementById('mute-btn').innerText = isMuted ? t('unmute_sound') : t('mute_sound'); };

window.toggleCombat = async () => {
    if (userRole !== 'dm') return;
    if (await db.getCombatStatus()) {
        if (await crConfirm(t('alert_end_combat'), t('end_combat_title')||'End Combat', '⚔️', t('end_combat_confirm_ok'), t('confirm_cancel'))) {
            db.setCombatStatus(false);
            db.resetInitiativeInDB();
            currentActiveTurn = null; currentRoundNumber = 0; sortedCombatants = [];
            document.getElementById('dm-turn-controls').style.display = 'none';
            document.getElementById('round-counter').innerText = '';
        }
    } else { db.setCombatStatus(true); }
};

window.rollInit = async () => {
    const btn = document.getElementById('init-btn');
    if (btn) btn.disabled = true;
    if (!await db.getCombatStatus()) { if (btn) btn.disabled = false; showToast(t('alert_not_started'), 'error'); return; }
    // When DM acts as a monster, roll initiative for that monster
    const targetName  = (userRole === 'dm' && activeRoller) ? activeRoller.cName  : cName;
    const targetPName = (userRole === 'dm' && activeRoller) ? activeRoller.pName  : pName;
    const targetColor = (userRole === 'dm' && activeRoller) ? activeRoller.color  : pColor;
    let rollResult;
    if (isDiceBoxReady) {
        rollResult = await window.roll('d20', true);
    } else {
        // Fallback: plain random d20 when 3D dice box not yet ready (e.g. late-joining player)
        const mod = parseInt(localStorage.getItem('critroll_initBonus')) || 0;
        rollResult = Math.ceil(Math.random() * 20) + mod;
    }
    if (rollResult == null) { if (btn) btn.disabled = false; return; }
    db.setPlayerInitiativeInDB(targetName, targetPName, rollResult, targetColor);
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

// ── Refresh all Open5e NPCs in current room ───────────────────────────────────
// Re-fetches each NPC with _open5eSlug from Open5e API (bypasses LS cache),
// patches their stat data in Firebase while preserving hp/statuses/initiative.
window.refreshNPCsFromOpen5e = async () => {
    if (userRole !== 'dm') return;
    const players = mapEngine?.S?.players || {};
    const npcs = Object.entries(players).filter(([, p]) => p._open5eSlug);
    if (!npcs.length) { showToast('No Open5e monsters found in this session.', 'warning'); return; }

    const btn = document.getElementById('refresh-npcs-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Refreshing…'; }

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

    if (btn) { btn.disabled = false; btn.textContent = '🔄 Refresh NPCs'; }
    showToast(`✅ Refreshed ${done} NPC${done !== 1 ? 's' : ''}${failed ? ` (${failed} failed)` : ''}`, done > 0 ? 'success' : 'error');
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
            <div style="font-weight:bold;font-size:14px;color:#f1c40f;margin-bottom:12px;">🎬 Animated Map Background</div>
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
        gallery.innerHTML = '<div style="font-size:11px;color:#555;font-style:italic;padding:4px 0;">No scenes yet. Create your first!</div>';
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
                : `<div class="scene-thumb">🎬</div>`;
        } else {
            thumbHtml = `<div class="scene-thumb">${s.atmosphere?.weather==='fog'?'🌫':s.atmosphere?.weather==='heavy_rain'?'⛈':s.atmosphere?.weather==='blizzard'?'❄️':'🗺'}</div>`;
        }
        const isLive = id === activeSceneId;
        return `
        <div class="scene-gallery-card ${isLive?'active':''}" id="sgc-${id}">
            ${thumbHtml}
            ${isLive ? '<div class="scene-live-badge">🎲 LIVE</div>' : ''}
            <div class="scene-card-info">
                <div class="scene-card-name">${s.name||'Unnamed'}</div>
                <div class="scene-card-sub">${new Date(s.createdAt||0).toLocaleDateString()}</div>
            </div>
            <div class="scene-card-btns">
                <button class="scene-card-btn live"  title="Go Live"  onclick="window.activateScene('${id}')">▶</button>
                <button class="scene-card-btn edit"  title="Edit"     onclick="window.editScene('${id}')">✎</button>
                <button class="scene-card-btn del"   title="Delete"   onclick="window.deleteScene('${id}')">🗑</button>
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
            <img src="${c.portrait||'assets/logo.png'}" style="width:22px;height:22px;border-radius:50%;border:2px solid ${c.pColor||'#fff'}">
            <span style="flex:1;font-size:11px;color:white;">${c.name}</span>
            ${onMap
                ? `<button onclick="window._mapEng?.removeToken('${c.name}')" class="map-dash-btn danger">✕</button>`
                : `<button onclick="window._mapEng?.startPlacing('${c.name}')" class="map-dash-btn">📍</button>`
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
    db.setMapCfg(db.getActiveRoom(), { ...s.config, bgUrl: s.bgUrl||'' });
    if (s.atmosphere) db.setAtmosphere(db.getActiveRoom(), s.atmosphere);
    db.setActiveScene(db.getActiveRoom(), sceneId);
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
    ['default','scene','present'].forEach(m => {
        document.getElementById(`bc-${m}`)?.classList.toggle('bc-active', m === mode);
    });
}

window._broadcastDefault  = () => { db.setDisplay(db.getActiveRoom(), { mode: 'default' }); _syncBcBar('default'); };
window._broadcastScene    = () => { db.setDisplay(db.getActiveRoom(), { mode: 'scene'   }); _syncBcBar('scene'); };
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
    if (userRole === 'dm') {
        document.getElementById('map-toolbar').style.display = 'flex';
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
