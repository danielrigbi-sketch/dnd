// app.js - Main Game Controller

import { initDiceEngine, updateDiceColor, roll3DDice, clearDice } from "./diceEngine.js";
import { getFlavorText } from "./messages.js";
import { unlockAudio, playRollSound, stopAllSounds, playStartRollSound, playHealSound, playDamageSound } from "./audio.js";
import { updateModeUI, updateInitiativeUI, addLogEntry, setDiceCooldown } from "./ui.js";
import * as db from "./firebaseService.js";

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
// Start Game Function (Triggered by Lobby)
// =====================================================================
export async function startGame(role, charData, roomCode) {
    db.setRoom(roomCode); 
    userRole = role;
    
    // Hide Lobby completely, show Game Screen
    const lobbyWrapper = document.getElementById('lobby-wrapper');
    if (lobbyWrapper) lobbyWrapper.style.display = 'none';
    
    const gameScreen = document.getElementById('game-screen');
    if (gameScreen) gameScreen.style.display = 'flex';

    // Update Room Header
    const titleHeader = document.querySelector('#side-panel h3');
    if(titleHeader) titleHeader.innerText = `חבורת ההרפתקנים (חדר: ${roomCode})`;

    // Initialize Role specific data
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
        
        document.getElementById('master-combat-btn').style.display = 'block';
        document.getElementById('dm-npc-controls').style.display = 'flex';
        
        db.joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, { isHidden: true });
    }

    // Now safely initialize the 3D dice (because #dice-box-canvas is visible)
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
// Game Mechanics
// =====================================================================

window.impersonate = async (targetCName) => {
    if (userRole !== 'dm') return;
    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    activeRoller = { cName: targetCName, pName: "שליט המבוך", color: p.pColor || "#c0392b" };
    
    document.getElementById('active-roller-banner').style.display = 'flex';
    document.getElementById('active-roller-name').innerText = targetCName;
    updateDiceColor(activeRoller.color); 
};

function safeBindClick(elementId, callback) {
    const el = document.getElementById(elementId);
    if (el) el.onclick = callback;
}

safeBindClick('reset-roller-btn', () => {
    activeRoller = null;
    document.getElementById('active-roller-banner').style.display = 'none';
    updateDiceColor(pColor); 
});

safeBindClick('adv-btn', () => { activeMode = (activeMode === 'adv') ? 'normal' : 'adv'; updateModeUI(activeMode); });
safeBindClick('dis-btn', () => { activeMode = (activeMode === 'dis') ? 'normal' : 'dis'; updateModeUI(activeMode); });
safeBindClick('mute-btn', () => { 
    isMuted = !isMuted; 
    document.getElementById('mute-btn').innerText = isMuted ? "🔊" : "🔇"; 
});

const presetSelect = document.getElementById('npc-preset');
if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if(val === 'custom') {
            document.getElementById('npc-name').value = "";
            document.getElementById('npc-hp').value = "";
            document.getElementById('npc-init').value = "";
            document.getElementById('npc-melee').value = "";
            document.getElementById('npc-ranged').value = "";
        } else {
            const data = npcDatabase[val];
            if(!data) return;
            document.getElementById('npc-name').value = data.name;
            document.getElementById('npc-hp').value = data.hp;
            document.getElementById('npc-init').value = data.init;
            document.getElementById('npc-melee').value = data.melee || 0;
            document.getElementById('npc-ranged').value = data.ranged || 0;
        }
    });
}

safeBindClick('add-npc-btn', () => {
    if (userRole !== 'dm') return;
    const presetVal = document.getElementById('npc-preset').value;
    const baseName = document.getElementById('npc-name').value.trim() || "מפלצת";
    const npcClass = document.getElementById('npc-class').value.trim();
    const npcHp = parseInt(document.getElementById('npc-hp').value) || 10;
    const npcInitBonus = parseInt(document.getElementById('npc-init').value) || 0;
    const npcMelee = parseInt(document.getElementById('npc-melee').value) || 0;
    const npcRanged = parseInt(document.getElementById('npc-ranged').value) || 0;
    const count = parseInt(document.getElementById('npc-count').value) || 1;
    const isHidden = document.getElementById('npc-hidden').checked;

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
});

safeBindClick('master-combat-btn', async () => {
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
});

safeBindClick('init-btn', async () => {
    const isCombat = await db.getCombatStatus();
    if (!isCombat) return alert("השה\"מ טרם פתח את הקרב!");
    document.getElementById('init-btn').disabled = true;
    const rollResult = await window.roll('d20', true); 
    db.setPlayerInitiativeInDB(cName, pName, rollResult, pColor);
});

document.querySelectorAll('.dice-btn').forEach(btn => {
    btn.onclick = () => window.roll(btn.getAttribute('data-type'));
});

// Database Listeners
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
        document.getElementById('empty-state').style.display = 'none';
        document.getElementById('dice-visual').style.display = 'flex';
        
        const resultText = document.getElementById('result-text');
        const arena = document.getElementById('dice-arena');
        
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
    
    addLogEntry(data, time, data.flavor || getFlavorText(data.type, data.res, (data.res+data.mod), 20));
});

window.roll3DDice = roll3DDice;
