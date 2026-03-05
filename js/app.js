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

// The Database of Monsters remains here for the DM Panel
const npcDatabase = {
    "goblin": { name: "גובלין", hp: 7, init: 2, melee: 4, ranged: 4, img: "https://api.dicebear.com/8.x/bottts/svg?seed=goblin&backgroundColor=c0392b" },
    "skeleton": { name: "שלד", hp: 13, init: 2, melee: 4, ranged: 4, img: "https://api.dicebear.com/8.x/bottts/svg?seed=skeleton&backgroundColor=bdc3c7" },
    "zombie": { name: "זומבי", hp: 22, init: -2, melee: 3, ranged: 0, img: "https://api.dicebear.com/8.x/bottts/svg?seed=zombie&backgroundColor=27ae60" },
    "orc": { name: "אורק", hp: 15, init: 1, melee: 5, ranged: 3, img: "https://api.dicebear.com/8.x/bottts/svg?seed=orc&backgroundColor=2c3e50" },
    "wolf": { name: "זאב נורא", hp: 37, init: 2, melee: 5, ranged: 0, img: "https://api.dicebear.com/8.x/bottts/svg?seed=wolf&backgroundColor=7f8c8d" },
    "bandit": { name: "שודד", hp: 11, init: 1, melee: 3, ranged: 3, img: "https://api.dicebear.com/8.x/bottts/svg?seed=bandit&backgroundColor=f39c12" },
    "spider": { name: "עכביש ענק", hp: 26, init: 3, melee: 5, ranged: 5, img: "https://api.dicebear.com/8.x/bottts/svg?seed=spider&backgroundColor=8e44ad" },
    "dragon": { name: "דרקון צעיר", hp: 110, init: 4, melee: 7, ranged: 0, img: "https://api.dicebear.com/8.x/bottts/svg?seed=dragon&backgroundColor=e67e22" },
    "owlbear": { name: "דוב-ינשוף", hp: 59, init: 1, melee: 7, ranged: 0, img: "https://api.dicebear.com/8.x/bottts/svg?seed=owlbear&backgroundColor=8b4513" },
    "troll": { name: "טרול", hp: 84, init: 1, melee: 7, ranged: 0, img: "https://api.dicebear.com/8.x/bottts/svg?seed=troll&backgroundColor=16a085" },
    "beholder": { name: "ביהולדר", hp: 180, init: 2, melee: 5, ranged: 12, img: "https://api.dicebear.com/8.x/bottts/svg?seed=beholder&backgroundColor=9b59b6" },
    "mindflayer": { name: "מצליף מוח", hp: 71, init: 1, melee: 7, ranged: 7, img: "https://api.dicebear.com/8.x/bottts/svg?seed=mindflayer&backgroundColor=8e44ad" },
    "vampire": { name: "ערפד", hp: 144, init: 4, melee: 9, ranged: 0, img: "https://api.dicebear.com/8.x/bottts/svg?seed=vampire&backgroundColor=c0392b" },
    "lich": { name: "ליץ'", hp: 135, init: 3, melee: 9, ranged: 12, img: "https://api.dicebear.com/8.x/bottts/svg?seed=lich&backgroundColor=2c3e50" }
};

// =====================================================================
// NEW: Start Game Function (Called from lobby.js)
// =====================================================================
export async function startGame(role, charData, roomCode) {
    db.setRoom(roomCode); // Point database to this specific room!
    userRole = role;
    
    // Update the UI header to show the room code
    const titleHeader = document.querySelector('#side-panel h3');
    if(titleHeader) titleHeader.innerText = `חבורת ההרפתקנים (חדר: ${roomCode})`;

    document.getElementById('game-screen').style.display = 'flex';

    if (userRole === 'player') {
        pName = document.getElementById('user-display-name').innerText;
        cName = charData.name;
        pColor = "#3498db"; // Default player color for now
        charPortrait = charData.portrait;
        
        // Save the char data locally so dice rolls can read initBonus easily
        localStorage.setItem('critroll_initBonus', charData.initBonus || 0);

        db.joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, charData);
    } else {
        // DM Setup
        pName = document.getElementById('user-display-name').innerText;
        cName = "DM_" + pName;
        pColor = "#c0392b";
        charPortrait = document.getElementById('user-avatar').src;
        
        document.getElementById('master-combat-btn').style.display = 'block';
        document.getElementById('dm-npc-controls').style.display = 'flex';
        
        db.joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, { isHidden: true });
    }

    unlockAudio();
    try { await initDiceEngine(); isDiceBoxReady = true; } catch (e) { console.error(e); }
    setTimeout(() => { canAnimate = true; }, 1000);
}


// =====================================================================
// Game Mechanics & Listeners
// =====================================================================

window.impersonate = async (targetCName) => {
    if (userRole !== 'dm') return;
    const p = await db.getPlayerData(targetCName);
    if (!p) return;
    
    activeRoller = {
        cName: targetCName,
        pName: "שליט המבוך", 
        color: p.pColor || "#c0392b"
    };
    
    document.getElementById('active-roller-banner').style.display = 'flex';
    document.getElementById('active-roller-name').innerText = targetCName;
    updateDiceColor(activeRoller.color); 
};

document.getElementById('reset-roller-btn').onclick = () => {
    activeRoller = null;
    document.getElementById('active-roller-banner').style.display = 'none';
    updateDiceColor(pColor); 
};

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

    const mod = (isInit) ? (parseInt(localStorage.getItem('critroll_initBonus')) || 0) : (parseInt(document.getElementById('mod-input').value) || 0);
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
    const amount = parseInt(inputField.value) || 1;
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
    inputField.value = 1; 
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
            document.getElementById('reset-roller-btn').click();
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

document.getElementById('adv-btn').onclick = () => { activeMode = (activeMode === 'adv') ? 'normal' : 'adv'; updateModeUI(activeMode); };
document.getElementById('dis-btn').onclick = () => { activeMode = (activeMode === 'dis') ? 'normal' : 'dis'; updateModeUI(activeMode); };
document.getElementById('mute-btn').onclick = () => { isMuted = !isMuted; document.getElementById('mute-btn').innerText = isMuted ? "🔊" : "🔇"; };

document.getElementById('npc-preset').addEventListener('change', (e) => {
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

document.getElementById('add-npc-btn').onclick = () => {
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
        db.saveRollToDB({
            cName: "שליט המבוך", type: "STATUS", status: `הוסיף את ⚔️ ${finalName}${hiddenText} [יוזמה: ${finalInit}]`, ts: Date.now()
        });
    }

    document.getElementById('npc-preset').value = "custom";
    document.getElementById('npc-name').value = "";
    document.getElementById('npc-class').value = "";
    document.getElementById('npc-hp').value = "";
    document.getElementById('npc-init').value = "";
    document.getElementById('npc-melee').value = "";
    document.getElementById('npc-ranged').value = "";
    document.getElementById('npc-count').value = "1";
};

document.querySelectorAll('.dice-btn').forEach(btn => {
    btn.onclick = () => window.roll(btn.getAttribute('data-type'));
});

document.getElementById('master-combat-btn').onclick = async () => {
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

document.getElementById('init-btn').onclick = async () => {
    const isCombat = await db.getCombatStatus();
    if (!isCombat) return alert("השה\"מ טרם פתח את הקרב!");
    
    const btn = document.getElementById('init-btn');
    btn.disabled = true;
    const rollResult = await window.roll('d20', true); 
    db.setPlayerInitiativeInDB(cName, pName, rollResult, pColor);
};

// Listeners Setup
db.listenToCombatStatus((isCombat) => {
    const btn = document.getElementById('init-btn');
    const dmBtn = document.getElementById('master-combat-btn');
    
    if (userRole === 'dm') {
        if (isCombat) {
            dmBtn.innerText = "🛑 סיים קרב ואיפוס";
            dmBtn.style.background = "#c0392b";
        } else {
            dmBtn.innerText = "⚔️ פתח יוזמה";
            dmBtn.style.background = "#2c3e50";
        }
    }

    if (isCombat) {
        db.listenToPlayerInitiative(cName, (exists) => {
            if (exists) { btn.disabled = true; btn.innerText = "✅ רשום"; }
            else { btn.disabled = false; btn.innerText = "⚡ גלגל יוזמה!"; btn.style.opacity = "1"; }
        });
    } else {
        btn.disabled = true; btn.innerText = "⌛ ממתין לקרב"; btn.style.opacity = "0.3";
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
                resultText.style.textShadow = "";
                resultText.style.color = ""; 
            } else if (data.res === 1) {
                arena.classList.add('vfx-crit-fail', 'vfx-shake');
                resultText.classList.add('crit-fail-text');
                resultText.style.textShadow = "";
                resultText.style.color = "";
            }
        }

        setTimeout(() => resultText.classList.add('show'), 50);
        setTimeout(() => resultText.classList.remove('show'), 4000);
    }
    
    addLogEntry(data, time, data.flavor || getFlavorText(data.type, data.res, (data.res+data.mod), 20));
});

function initCreditsModal() {
    const modal = document.getElementById("creditsModal");
    const btn = document.getElementById("openCredits");
    const closeBtn = document.querySelector(".credits-close");
    if (btn && modal && closeBtn) {
        btn.onclick = (e) => { e.preventDefault(); modal.style.display = "block"; };
        closeBtn.onclick = () => modal.style.display = "none";
        window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; };
    }
}
initCreditsModal();
