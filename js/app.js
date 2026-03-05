// app.js - Main Game Controller (HARDWIRED VERSION)

import { initDiceEngine, updateDiceColor, roll3DDice, clearDice } from "./diceEngine.js?v=101";
import { getFlavorText } from "./messages.js?v=101";
import { unlockAudio, playRollSound, stopAllSounds, playStartRollSound, playHealSound, playDamageSound } from "./audio.js?v=101";
import { updateModeUI, updateInitiativeUI, addLogEntry, setDiceCooldown } from "./ui.js?v=101";
import * as db from "./firebaseService.js?v=101";

// =====================================================================
// GLOBALS
// =====================================================================
let isDiceBoxReady = false;
let pName = "", cName = "", pColor = "#3498db", userRole = "player", charPortrait = "";
let isMuted = false, isCooldown = false, canAnimate = false;
let activeMode = 'normal';
let activeRoller = null;

const npcDatabase = {
    "goblin": { name: "גובלין", hp: 7, init: 2, melee: 4, ranged: 4, img: "https://api.dicebear.com/8.x/bottts/svg?seed=goblin&backgroundColor=c0392b" },
    "skeleton": { name: "שלד", hp: 13, init: 2, melee: 4, ranged: 4, img: "https://api.dicebear.com/8.x/bottts/svg?seed=skeleton&backgroundColor=bdc3c7" }
};

// =====================================================================
// START GAME FUNCTION
// =====================================================================

export async function startGame(role, charData, roomCode) {
    db.setRoom(roomCode);
    userRole = role;

    const lobbyWrapper = document.getElementById('lobby-wrapper');
    if (lobbyWrapper) lobbyWrapper.style.display = 'none';

    const gameScreen = document.getElementById('game-screen');
    if (gameScreen) gameScreen.style.display = 'flex';

    const titleHeader = document.querySelector('#side-panel h3');
    if(titleHeader) titleHeader.innerText = `חבורת ההרפתקנים (חדר: ${roomCode})`;

    if (userRole === 'player') {
        pName = document.getElementById('user-display-name')?.innerText || "Player";
        cName = charData.name;
        pColor = "#3498db";
        charPortrait = charData.portrait;
        localStorage.setItem('critroll_initBonus', charData.initBonus || 0);
        db.joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, charData);
    } else {
        pName = document.getElementById('user-display-name')?.innerText || "DM";
        cName = "DM_" + pName;
        pColor = "#c0392b";
        charPortrait = document.getElementById('user-avatar')?.src || "assets/logo.png";

        const combatBtn = document.getElementById('master-combat-btn');
        const npcControls = document.getElementById('dm-npc-controls');
        if(combatBtn) combatBtn.style.display = 'block';
        if(npcControls) npcControls.style.display = 'flex';

        db.joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, { isHidden: true });
    }

    unlockAudio();
    try {
        await initDiceEngine();
        isDiceBoxReady = true;
    } catch (e) {
        console.error("Dice engine failed to load:", e);
    }
    setTimeout(() => { canAnimate = true; }, 1000);
}

// =====================================================================
// HARDWIRED WINDOW FUNCTIONS (Called directly from HTML onclick)
// =====================================================================

window.roll = async (type, isInit = false) => {
    if (isCooldown && !isInit) return;
    if (!isDiceBoxReady) return;

    const currentMode = isInit ? 'normal' : activeMode;
    if (!isInit) { isCooldown = true; setDiceCooldown(true); }

    playStartRollSound(isMuted);

    let rollCName = cName;
    let rollPName = pName;
    let rollColor = pColor;

    if (userRole === 'dm' && activeRoller && !isInit) {
        rollCName = activeRoller.cName;
        rollPName = activeRoller.pName;
        rollColor = activeRoller.color;
    } else {
        await updateDiceColor(pColor);
    }

    let finalRes, res1 = null, res2 = null;
    try {
        if (currentMode !== 'normal') {
            const results = await roll3DDice(`2${type}`);
            res1 = results[0].value; res2 = results[1].value;
            finalRes = (currentMode === 'adv') ? Math.max(res1, res2) : Math.min(res1, res2);
        } else {
            const results = await roll3DDice(`1${type}`);
            finalRes = results[0].value;
        }
    } catch (err) {
        isCooldown = false;
        setDiceCooldown(false);
        return;
    }

    const mod = (isInit) ? (parseInt(localStorage.getItem('critroll_initBonus')) || 0) : (parseInt(document.getElementById('mod-input')?.value) || 0);
    const rollData = { pName: rollPName, cName: rollCName, type, res: finalRes, mod, color: rollColor, mode: currentMode, ts: Date.now() };
    if (res1 !== null) { rollData.res1 = res1; rollData.res2 = res2; }

    db.saveRollToDB(rollData);

    if (!isInit) {
        activeMode = 'normal'; updateModeUI(activeMode);
        setTimeout(() => { isCooldown = false; setDiceCooldown(false); }, 1000);
    }
    return finalRes + mod;
};

window.changeHP = async (targetCName, isPlus) => {
    const inputField = document.getElementById(`hp-input-${targetCName}`);
    const amount = parseInt(inputField?.value) || 1;
    const finalAmount = isPlus ? amount : -amount;

    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    const newHp = Math.max(0, Math.min(p.maxHp, (p.hp || 0) + finalAmount));

    db.updatePlayerHPInDB(targetCName, newHp);

    const flavor = (isPlus ? "זוכה לריפוי!" : "סופג פגיעה!") + ` (${amount} נק')`;
    db.saveRollToDB({
        cName: targetCName, type: isPlus ? "HEAL" : "DAMAGE",
        res: amount, newHp, color: isPlus ? "#2ecc71" : "#e74c3c",
        flavor, ts: Date.now()
    });
    if(inputField) inputField.value = 1;
};

window.toggleStatus = async (targetCName, status) => {
    if (userRole !== 'dm') return;
    const p = await db.getPlayerData(targetCName);
    if(!p) return;

    let statuses = p.statuses || [];
    if (statuses.includes(status)) {
        statuses = statuses.filter(s => s !== status);
    } else {
        statuses.push(status);
        db.saveRollToDB({ cName: targetCName, type: "STATUS", status, ts: Date.now() });
    }
    db.updatePlayerStatusesInDB(targetCName, statuses);
};

window.removeNPC = (targetCName) => {
    if (userRole !== 'dm') return;
    if (confirm(`האם אתה בטוח שברצונך למחוק את ${targetCName} מהלוח?`)) {
        db.removePlayerFromDB(targetCName);
        if (activeRoller && activeRoller.cName === targetCName) {
            window.resetRoller();
        }
    }
};

window.toggleVisibility = (targetCName, currentHiddenStatus) => {
    if (userRole !== 'dm') return;
    const newStatus = !currentHiddenStatus;
    db.updatePlayerVisibilityInDB(targetCName, newStatus);

    if (!newStatus) {
        db.saveRollToDB({
            cName: "שליט המבוך", type: "STATUS", status: `חשף מהצללים את 👁️ ${targetCName}!`, ts: Date.now()
        });
    }
};

window.impersonate = async (targetCName) => {
    if (userRole !== 'dm') return;
    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    activeRoller = { cName: targetCName, pName: "שליט המבוך", color: p.pColor || "#c0392b" };

    const banner = document.getElementById('active-roller-banner');
    const nameEl = document.getElementById('active-roller-name');
    if(banner) banner.style.display = 'flex';
    if(nameEl) nameEl.innerText = targetCName;
    updateDiceColor(activeRoller.color);
};

window.resetRoller = () => {
    activeRoller = null;
    const banner = document.getElementById('active-roller-banner');
    if(banner) banner.style.display = 'none';
    updateDiceColor(pColor);
};

window.setMode = (mode) => { 
    activeMode = (activeMode === mode) ? 'normal' : mode; 
    updateModeUI(activeMode); 
};

window.toggleMute = () => {
    isMuted = !isMuted;
    const btn = document.getElementById('mute-btn');
    if(btn) btn.innerText = isMuted ? "🔊" : "🔇 השתק סאונד";
};

window.toggleCombat = async () => {
    if (userRole !== 'dm') return;
    const current = await db.getCombatStatus();
    if (current) {
        if (confirm("האם אתה בטוח שברצונך לסיים את הקרב ולאפס את היוזמה?")) {
            db.setCombatStatus(false);
            db.resetInitiativeInDB();
        }
    } else {
        db.setCombatStatus(true);
    }
};

window.rollInit = async () => {
    const isCombat = await db.getCombatStatus();
    if (!isCombat) return alert("השה\"מ טרם פתח את הקרב!");
    const btn = document.getElementById('init-btn');
    if(btn) btn.disabled = true;
    const rollResult = await window.roll('d20', true);
    db.setPlayerInitiativeInDB(cName, pName, rollResult, pColor);
};

window.handlePresetChange = (val) => {
    const nameEl = document.getElementById('npc-name');
    const hpEl = document.getElementById('npc-hp');
    const initEl = document.getElementById('npc-init');
    const meleeEl = document.getElementById('npc-melee');
    const rangedEl = document.getElementById('npc-ranged');

    if(val === 'custom') {
        if(nameEl) nameEl.value = "";
        if(hpEl) hpEl.value = "";
        if(initEl) initEl.value = "";
        if(meleeEl) meleeEl.value = "";
        if(rangedEl) rangedEl.value = "";
    } else {
        const data = npcDatabase[val];
        if(!data) return;
        if(nameEl) nameEl.value = data.name;
        if(hpEl) hpEl.value = data.hp;
        if(initEl) initEl.value = data.init;
        if(meleeEl) meleeEl.value = data.melee || 0;
        if(rangedEl) rangedEl.value = data.ranged || 0;
    }
};

window.addNPC = () => {
    if (userRole !== 'dm') return;
    const presetVal = document.getElementById('npc-preset')?.value;
    const baseName = document.getElementById('npc-name')?.value.trim() || "מפלצת";
    const npcClass = document.getElementById('npc-class')?.value.trim();
    const npcHp = parseInt(document.getElementById('npc-hp')?.value) || 10;
    const npcInitBonus = parseInt(document.getElementById('npc-init')?.value) || 0;
    const npcMelee = parseInt(document.getElementById('npc-melee')?.value) || 0;
    const npcRanged = parseInt(document.getElementById('npc-ranged')?.value) || 0;
    const count = parseInt(document.getElementById('npc-count')?.value) || 1;
    const isHidden = document.getElementById('npc-hidden')?.checked;

    let portrait = "https://via.placeholder.com/50/c0392b/ffffff?text=NPC";
    if (presetVal !== 'custom' && npcDatabase[presetVal]) {
        portrait = npcDatabase[presetVal].img;
    }

    for(let i = 1; i <= count; i++) {
        const finalName = count > 1 ? `${baseName} ${i}` : baseName;
        const d20 = Math.floor(Math.random() * 20) + 1;
        const finalInit = d20 + npcInitBonus;

        const stats = {
            maxHp: npcHp, hp: npcHp, ac: 10, speed: 30, pp: 10,
            isHidden: isHidden, melee: npcMelee, ranged: npcRanged
        };
        if (npcClass) stats.class = npcClass;

        db.joinPlayerToDB(finalName, "DM", "#c0392b", "npc", portrait, stats);
        db.setPlayerInitiativeInDB(finalName, "DM", finalInit, "#c0392b");

        const hiddenText = isHidden ? " (מוסתרת)" : "";
        db.saveRollToDB({ cName: "שליט המבוך", type: "STATUS", status: `הוסיף את ⚔️ ${finalName}${hiddenText} [יוזמה: ${finalInit}]`, ts: Date.now() });
    }
    
    if(document.getElementById('npc-preset')) document.getElementById('npc-preset').value = "custom";
    if(document.getElementById('npc-name')) document.getElementById('npc-name').value = "";
    if(document.getElementById('npc-class')) document.getElementById('npc-class').value = "";
    if(document.getElementById('npc-hp')) document.getElementById('npc-hp').value = "";
    if(document.getElementById('npc-init')) document.getElementById('npc-init').value = "";
    if(document.getElementById('npc-melee')) document.getElementById('npc-melee').value = "";
    if(document.getElementById('npc-ranged')) document.getElementById('npc-ranged').value = "";
    if(document.getElementById('npc-count')) document.getElementById('npc-count').value = "1";
};

window.roll3DDice = roll3DDice;


// =====================================================================
// DB LISTENERS
// =====================================================================
db.listenToCombatStatus((isCombat) => {
    const btn = document.getElementById('init-btn');
    const dmBtn = document.getElementById('master-combat-btn');
    if (userRole === 'dm' && dmBtn) {
        dmBtn.innerText = isCombat ? "🛑 סיים קרב ואיפוס" : "⚔️ פתח יוזמה";
        dmBtn.style.background = isCombat ? "#c0392b" : "#2c3e50";
    }
    if (isCombat) {
        db.listenToPlayerInitiative(cName, (exists) => {
            if (btn) {
                btn.disabled = exists;
                btn.innerText = exists ? "✅ רשום" : "⚡ גלגל יוזמה!";
                btn.style.opacity = exists ? "0.5" : "1";
            }
        });
    } else {
        if (btn) { btn.disabled = true; btn.innerText = "⌛ ממתין לקרב"; btn.style.opacity = "0.3"; }
    }
});

db.listenToPlayers((playersData) => updateInitiativeUI(playersData, userRole, activeRoller));

db.listenToNewRolls((data) => {
    if (!data || !canAnimate) return;

    if (!isMuted) {
        if (data.type === "DAMAGE") playDamageSound(isMuted);
        else if (data.type === "HEAL") playHealSound(isMuted);
        else playRollSound(data.type, data.res, isMuted);
    }

    const time = new Date(data.ts || Date.now()).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

    if (data.type !== "DAMAGE" && data.type !== "HEAL" && data.type !== "STATUS") {
        const emptyState = document.getElementById('empty-state');
        const diceVisual = document.getElementById('dice-visual');
        const resultText = document.getElementById('result-text');
        const arena = document.getElementById('dice-arena');

        if(emptyState) emptyState.style.display = 'none';
        if(diceVisual) diceVisual.style.display = 'flex';

        if(resultText && arena) {
            resultText.classList.remove('show', 'crit-success-text', 'crit-fail-text');
            arena.classList.remove('vfx-crit-success', 'vfx-crit-fail', 'vfx-shake');
            void arena.offsetWidth;

            resultText.innerText = (data.res || 0) + (data.mod || 0);
            resultText.style.color = "white";
            resultText.style.textShadow = `0 0 20px ${data.color}, 3px 3px 10px rgba(0,0,0,0.9)`;

            if (data.type === 'd20') {
                if (data.res === 20) {
                    arena.classList.add('vfx-crit-success');
                    resultText.classList.add('crit-success-text');
                    resultText.style.textShadow = ""; resultText.style.color = "";
                } else if (data.res === 1) {
                    arena.classList.add('vfx-crit-fail', 'vfx-shake');
                    resultText.classList.add('crit-fail-text');
                    resultText.style.textShadow = ""; resultText.style.color = "";
                }
            }
            setTimeout(() => resultText.classList.add('show'), 50);
            setTimeout(() => resultText.classList.remove('show'), 4000);
        }
    }

    addLogEntry(data, time, data.flavor || getFlavorText(data.type, data.res, (data.res+data.mod), 20));
});
