// app.js v127
import { initDiceEngine, updateDiceColor, roll3DDice } from "./diceEngine.js?v=127";
import { getFlavorText } from "./messages.js?v=127";
import { unlockAudio, playRollSound, stopAllSounds, playStartRollSound, playHealSound, playDamageSound, playYourTurnSound } from "./audio.js?v=127";
import { updateModeUI, updateInitiativeUI, addLogEntry, setDiceCooldown } from "./ui.js?v=127";
import * as db from "./firebaseService.js?v=127";
// getActiveRoom is available via db.getActiveRoom()

// =====================================================================
// SPRINT 5 — Death Saves & Concentration
// =====================================================================
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

// =====================================================================
// SPRINT 6 — Spell Slots
// =====================================================================
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

window.longRest = async (targetCName) => {
    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    // Restore HP to max
    db.updatePlayerHPInDB(targetCName, p.maxHp);
    // Restore all spell slots
    if (p.spellSlots) db.updateSpellSlotsInDB(targetCName, { max: p.spellSlots.max, used: {} });
    // Remove dying state
    db.updateDeathSavesInDB(targetCName, { successes:[false,false,false], failures:[false,false,false], stable:false, dead:false });
    db.saveRollToDB({ cName: targetCName, type: "STATUS", status: `🌙 ${targetCName} took a Long Rest — fully restored!`, ts: Date.now() });
};

// =====================================================================
// SPRINT 6 — Re-roll All Initiatives (DM mid-combat)
// =====================================================================
window.rerollAllInitiatives = async () => {
    if (userRole !== 'dm') return;
    if (!confirm('Re-roll all initiatives? This will reset the current order.')) return;
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
import { t } from "./i18n.js?v=127";
import { npcDatabase } from "./monsters.js?v=127";
import { MapEngine } from "./mapEngine.js?v=127";
import { SceneWizard } from "./sceneWizard.js?v=127";

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
    } else {
        pName        = document.getElementById('user-display-name')?.innerText || "DM";
        cName        = "DM_" + pName;
        pColor       = "#c0392b";
        charPortrait = document.getElementById('user-avatar')?.src || "assets/logo.png";
        document.getElementById('master-combat-btn').style.display = 'block';
        document.getElementById('dm-npc-controls').style.display   = 'flex';
        document.getElementById('dm-turn-controls').style.display  = 'none';
        localStorage.setItem('critroll_cName', 'DM');
        populateMonsterSelect();
        db.joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, { isHidden: true });
        // Register DM uid for Firebase security rules
        if (uid) db.setDmUid(roomCode, uid);
    }

    setupDatabaseListeners();
    initMap();
    unlockAudio();

    // ── Sprint 4: load persisted roll log ──
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
    setTimeout(() => { canAnimate = true; }, 800);
}

// =====================================================================
// TURN TRACKER
// =====================================================================
window.nextTurn = () => {
    if (userRole !== 'dm' || sortedCombatants.length === 0) return;
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
    if (userRole === 'dm' && activeRoller && !isInit) {
        rollCName = activeRoller.cName; rollPName = activeRoller.pName; rollColor = activeRoller.color;
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
    if (!diceString || diceString === '0') return alert(t('alert_no_dmg'));
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

window.removeNPC = (targetCName) => {
    if (userRole !== 'dm') return;
    if (confirm(t('alert_delete_npc_1') + targetCName + t('alert_delete_npc_2'))) {
        db.removePlayerFromDB(targetCName);
        if (activeRoller?.cName === targetCName) window.resetRoller();
        if (currentActiveTurn !== null && sortedCombatants.length > 1) {
            currentActiveTurn = Math.min(currentActiveTurn, sortedCombatants.length - 2);
            db.setActiveTurn(currentActiveTurn, currentRoundNumber);
        }
    }
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

window.setMode   = (mode) => { activeMode = activeMode === mode ? 'normal' : mode; updateModeUI(activeMode); };
window.toggleMute = () => { isMuted = !isMuted; document.getElementById('mute-btn').innerText = isMuted ? t('unmute_sound') : t('mute_sound'); };

window.toggleCombat = async () => {
    if (userRole !== 'dm') return;
    if (await db.getCombatStatus()) {
        if (confirm(t('alert_end_combat'))) {
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
    if (!await db.getCombatStatus()) { if (btn) btn.disabled = false; return alert(t('alert_not_started')); }
    const rollResult = await window.roll('d20', true);
    db.setPlayerInitiativeInDB(cName, pName, rollResult, pColor);
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
    const portrait = (presetVal !== 'custom' && npcDatabase[presetVal]) ? npcDatabase[presetVal].img : "https://via.placeholder.com/50/c0392b/ffffff?text=NPC";
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

window.roll3DDice = roll3DDice;

// =====================================================================
// SPRINT 7 — MAP ENGINE INIT
// =====================================================================
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
    resize();
    window.addEventListener('resize', resize);

    // Show scene manager for DM
    if (userRole === 'dm') {
        document.getElementById('scene-manager-section').style.display = 'block';
        _initSceneManager();
    }

    // Wire compact toolbar
    window._mapToolBtn = (btn) => {
        document.querySelectorAll('.map-tb-btn[data-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        mapEngine?.setMode(btn.dataset.mode);
    };
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
    const entries = Object.entries(scenes).sort(([,a],[,b]) => (b.createdAt||0)-(a.createdAt||0));
    if (!entries.length) {
        gallery.innerHTML = '<div style="font-size:11px;color:#555;font-style:italic;padding:4px 0;">No scenes yet. Create your first!</div>';
        return;
    }
    gallery.innerHTML = entries.map(([id, s]) => `
        <div class="scene-gallery-card ${id===activeSceneId?'active':''}" id="sgc-${id}">
            <div class="scene-thumb">${s.atmosphere?.weather==='fog'?'🌫':s.atmosphere?.weather==='heavy_rain'?'⛈':s.atmosphere?.weather==='blizzard'?'❄️':'🗺'}</div>
            <div class="scene-card-info">
                <div class="scene-card-name">${s.name||'Unnamed'}</div>
                <div class="scene-card-sub">${new Date(s.createdAt||0).toLocaleDateString()}</div>
            </div>
            <div class="scene-card-btns">
                <button class="scene-card-btn live"  title="Go Live"  onclick="window.activateScene('${id}')">▶</button>
                <button class="scene-card-btn edit"  title="Edit"     onclick="window.editScene('${id}')">✎</button>
                <button class="scene-card-btn del"   title="Delete"   onclick="window.deleteScene('${id}')">🗑</button>
            </div>
        </div>
    `).join('');
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

function _initDashDrag() {
    const dash = document.getElementById('dm-map-dash');
    const hdr  = document.getElementById('dm-map-dash-header');
    let dragging=false, ox=0, oy=0, lx=0, ly=0;
    hdr.addEventListener('mousedown', e=>{
        dragging=true; ox=e.clientX-lx; oy=e.clientY-ly;
    });
    document.addEventListener('mousemove', e=>{
        if(!dragging) return;
        lx=e.clientX-ox; ly=e.clientY-oy;
        dash.style.left=lx+'px'; dash.style.top=ly+'px';
    });
    document.addEventListener('mouseup', ()=>{ dragging=false; });
}

function _initDashTabs() {
    document.querySelectorAll('.map-dash-tab').forEach(tab=>{
        tab.onclick=()=>{
            document.querySelectorAll('.map-dash-tab').forEach(t=>t.classList.remove('active'));
            document.querySelectorAll('.map-dash-panel').forEach(p=>p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('map-panel-'+tab.dataset.tab)?.classList.add('active');
        };
    });
}

function _initDashControls() {
    // Mode buttons
    document.querySelectorAll('.map-mode-btn').forEach(btn=>{
        btn.onclick=()=>{
            const mode=btn.dataset.mode;
            mapEngine?.setMode(mode);
            document.querySelectorAll('.map-mode-btn').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            // Update cursor
            const cursors={view:'cursor-grab',obstacle:'cursor-paint',trigger:'cursor-paint',
                           fogReveal:'cursor-reveal',fogHide:'cursor-hide',ruler:'cursor-ruler',aoe:'cursor-ruler',calibrate:'cursor-grab'};
            const container=document.getElementById('map-canvas-container');
            if(container){
                // Remove only cursor classes, preserve layout classes
                ['cursor-grab','cursor-paint','cursor-reveal','cursor-hide','cursor-ruler','cursor-place']
                    .forEach(c=>container.classList.remove(c));
                if(cursors[mode]) container.classList.add(cursors[mode]);
            }
        };
    });
    // Tool buttons
    document.querySelectorAll('.map-tool-btn').forEach(btn=>{
        btn.onclick=()=>{
            mapEngine?.setTool(btn.dataset.tool);
            document.querySelectorAll('.map-tool-btn').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
        };
    });
    // AOE shape
    document.querySelectorAll('.aoe-shape-btn').forEach(btn=>{
        btn.onclick=()=>{
            mapEngine?.setAoeShape(btn.dataset.shape);
            document.querySelectorAll('.aoe-shape-btn').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
        };
    });
    // AOE radius
    document.getElementById('aoe-radius-input')?.addEventListener('input', e=>{
        mapEngine?.setAoeRadius(parseInt(e.target.value)||20);
    });
    // Background URL
    document.getElementById('map-bg-load-btn')?.addEventListener('click', ()=>{
        const url=document.getElementById('map-bg-url').value.trim();
        if(url) mapEngine?.loadBgUrl(url);
    });
    // Background file
    document.getElementById('map-bg-file')?.addEventListener('change', e=>{
        const file=e.target.files[0];
        if(file) mapEngine?.loadBgFile(file);
    });
    // Grid calibration
    document.getElementById('calib-pps-plus')?.addEventListener('click',()=>{ mapEngine?.nudgeGrid(4,0,0); _updateCalibDisplay(); });
    document.getElementById('calib-pps-minus')?.addEventListener('click',()=>{ mapEngine?.nudgeGrid(-4,0,0); _updateCalibDisplay(); });
    document.getElementById('calib-ox-plus')?.addEventListener('click',()=>{ mapEngine?.nudgeGrid(0,4,0); _updateCalibDisplay(); });
    document.getElementById('calib-ox-minus')?.addEventListener('click',()=>{ mapEngine?.nudgeGrid(0,-4,0); _updateCalibDisplay(); });
    document.getElementById('calib-oy-plus')?.addEventListener('click',()=>{ mapEngine?.nudgeGrid(0,0,4); _updateCalibDisplay(); });
    document.getElementById('calib-oy-minus')?.addEventListener('click',()=>{ mapEngine?.nudgeGrid(0,0,-4); _updateCalibDisplay(); });
    document.getElementById('calib-lock-btn')?.addEventListener('click',()=>{
        mapEngine?.lockGrid(); mapEngine?.saveGridToFirebase();
        document.getElementById('calib-lock-btn').textContent='🔒 Locked!';
    });
    document.getElementById('calib-unlock-btn')?.addEventListener('click',()=>{
        mapEngine?.unlockGrid(); mapEngine?.saveGridToFirebase();
        document.getElementById('calib-lock-btn').textContent='🔒 Lock Grid';
    });
    document.getElementById('calib-save-btn')?.addEventListener('click',()=>{ mapEngine?.saveGridToFirebase(); });
    // Scene
    document.getElementById('map-new-scene-btn')?.addEventListener('click',()=>{
        const name=document.getElementById('map-scene-name')?.value.trim()||'Scene 1';
        mapEngine?.createScene(name);
    });
    // Fog tools
    document.getElementById('map-reveal-all')?.addEventListener('click',()=>mapEngine?.revealAll());
    document.getElementById('map-hide-all')?.addEventListener('click',()=>mapEngine?.hideAll());
    // Reset movement (called at turn start)
    document.getElementById('map-reset-mv')?.addEventListener('click',()=>mapEngine?.resetAllMovement());
}

function _updateCalibDisplay() {
    if (!mapEngine) return;
    const cfg = mapEngine.S.cfg;
    const el = document.getElementById('calib-pps-val');
    if (el) el.textContent = cfg.pps + 'px';
    const oxEl = document.getElementById('calib-ox-val');
    if (oxEl) oxEl.textContent = cfg.ox;
    const oyEl = document.getElementById('calib-oy-val');
    if (oyEl) oyEl.textContent = cfg.oy;
}

window.openSceneWizard = (existingData=null) => {
    if (!sceneWizard) {
        sceneWizard = new SceneWizard({
            uid, cName, activeRoom: db.getActiveRoom(), db,
            players: sortedCombatants.reduce((a,c)=>{a[c.name]=c;return a;},{}),
            onSaved: (id, data) => {
                console.log('Scene saved:', id);
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

window.deleteScene = (sceneId) => {
    if (!uid || !confirm('Delete this scene?')) return;
    db.deleteSceneFromVault(uid, sceneId);
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

window.toggleScenePanel = () => {
    const panel = document.getElementById('scene-panel');
    const chev  = document.getElementById('scene-mgr-chevron');
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
    if (sceneData.bgUrl) mapEngine.loadBgUrl(sceneData.bgUrl);
    if (sceneData.atmosphere) mapEngine.setAtmosphere(sceneData.atmosphere);
    const container = document.getElementById('map-canvas-container');
    container?.classList.remove('map-bg-hidden');
    container?.classList.add('map-bg-active');
    document.getElementById('dice-arena')?.classList.add('map-active');
    if (userRole === 'dm') {
        document.getElementById('map-toolbar').style.display = 'flex';
    }
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
    db.listenToCombatStatus((isCombat) => {
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
        } else {
            if (btn) { btn.disabled = true; btn.innerText = t('waiting_combat'); btn.style.opacity = "0.3"; }
        }
    });

    db.listenToPlayers((playersData) => {
        if (playersData) {
            sortedCombatants = Object.keys(playersData)
                .map(k => ({ name: k, ...playersData[k] }))
                .filter(p => p.userRole !== 'dm')
                .sort((a, b) => (b.score||0) - (a.score||0));
        } else { sortedCombatants = []; }
        updateInitiativeUI(playersData, userRole, activeRoller, currentActiveTurn, sortedCombatants);
        // Sync to map engine
        if (mapEngine) { mapEngine.setPlayers(playersData||{}); _updateTokenRoster(); }
    });

    // ── Sprint 4: YOUR TURN detection ──
    db.listenToActiveTurn((turnIndex) => {
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
    });

    db.listenToRoundNumber((round) => {
        currentRoundNumber = round;
        const el = document.getElementById('round-counter');
        if (el) el.innerText = round > 0 ? `Round ${round}` : '';
    });

    db.listenToNewRolls((data) => {
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
    });
}
