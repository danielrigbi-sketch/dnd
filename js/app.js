// app.js - הבקר הראשי (Controller)

import { initDiceEngine, updateDiceColor, roll3DDice, clearDice } from "./diceEngine.js";
import { getFlavorText } from "./messages.js";
import { unlockAudio, playRollSound, stopAllSounds, playStartRollSound, playHealSound, playDamageSound } from "./audio.js";
import { updateModeUI, updateInitiativeUI, addLogEntry, setDiceCooldown } from "./ui.js";
import * as db from "./firebaseService.js";

let isDiceBoxReady = false;
let pName = "", cName = "", pColor = "#8B0000", userRole = "player", charPortrait = "";
let isMuted = false, isCooldown = false, canAnimate = false;
let activeMode = 'normal'; 

window.addEventListener('DOMContentLoaded', () => {
    const colorOptions = document.querySelectorAll('.color-opt');
    const colorInput = document.getElementById('user-color');
    const setActiveColor = (color) => {
        colorOptions.forEach(opt => {
            if (opt.getAttribute('data-color') === color) {
                colorOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                if(colorInput) colorInput.value = color;
                pColor = color;
            }
        });
    };
    colorOptions.forEach(opt => {
        opt.addEventListener('click', () => setActiveColor(opt.getAttribute('data-color')));
    });

    const savedStats = {
        pName: localStorage.getItem('critroll_pName'),
        cName: localStorage.getItem('critroll_cName'),
        color: localStorage.getItem('critroll_pColor'),
        role: localStorage.getItem('critroll_role'),
        race: localStorage.getItem('critroll_race'),
        class: localStorage.getItem('critroll_class'),
        ac: localStorage.getItem('critroll_ac'),
        speed: localStorage.getItem('critroll_speed'),
        pp: localStorage.getItem('critroll_pp'),
        initBonus: localStorage.getItem('critroll_initBonus'),
        maxHp: localStorage.getItem('critroll_maxHp'),
        currHp: localStorage.getItem('critroll_currHp'),
        portrait: localStorage.getItem('critroll_portrait')
    };

    if (savedStats.pName) document.getElementById('player-name').value = savedStats.pName;
    if (savedStats.cName) document.getElementById('char-name').value = savedStats.cName;
    if (savedStats.role) document.getElementById('user-role').value = savedStats.role;
    if (savedStats.color) setActiveColor(savedStats.color);
    if (savedStats.race) document.getElementById('char-race').value = savedStats.race;
    if (savedStats.class) document.getElementById('char-class').value = savedStats.class;
    if (savedStats.ac) document.getElementById('char-ac').value = savedStats.ac;
    if (savedStats.speed) document.getElementById('char-speed').value = savedStats.speed;
    if (savedStats.pp) document.getElementById('char-pp').value = savedStats.pp;
    if (savedStats.initBonus) document.getElementById('init-bonus').value = savedStats.initBonus;
    if (savedStats.maxHp) document.getElementById('max-hp').value = savedStats.maxHp;
    if (savedStats.currHp) document.getElementById('curr-hp').value = savedStats.currHp;
    if (savedStats.portrait) charPortrait = savedStats.portrait;

    document.getElementById('user-role').onchange = toggleRoleFields;
    toggleRoleFields();
});

function toggleRoleFields() {
    const role = document.getElementById('user-role').value;
    const playerFields = document.getElementById('player-only-fields');
    playerFields.style.display = (role === 'dm') ? 'none' : 'block';
}

document.getElementById('char-portrait').onchange = function(e) {
    const file = e.target.files[0];
    if (!file || file.size > 600000) return alert("בחר תמונה קטנה מ-500KB");
    const reader = new FileReader();
    reader.onload = (event) => {
        charPortrait = event.target.result;
        localStorage.setItem('critroll_portrait', charPortrait);
    };
    reader.readAsDataURL(file);
};

document.getElementById('join-btn').onclick = async () => {
    pName = document.getElementById('player-name').value.trim();
    userRole = document.getElementById('user-role').value;
    pColor = document.getElementById('user-color').value;

    if (userRole === 'player') {
        cName = document.getElementById('char-name').value.trim();
        if (!pName || !cName) return alert("מלא פרטי שחקן ודמות!");
    } else {
        cName = "DM_" + pName;
    }

    const stats = (userRole === 'player') ? {
        race: document.getElementById('char-race').value,
        class: document.getElementById('char-class').value,
        ac: document.getElementById('char-ac').value,
        speed: document.getElementById('char-speed').value,
        pp: document.getElementById('char-pp').value,
        initBonus: parseInt(document.getElementById('init-bonus').value) || 0,
        maxHp: parseInt(document.getElementById('max-hp').value) || 10,
        hp: parseInt(document.getElementById('curr-hp').value) || 10
    } : {};

    localStorage.setItem('critroll_pName', pName);
    localStorage.setItem('critroll_cName', cName);
    localStorage.setItem('critroll_pColor', pColor);
    localStorage.setItem('critroll_role', userRole);
    if(userRole === 'player') Object.keys(stats).forEach(k => localStorage.setItem('critroll_' + k, stats[k]));

    unlockAudio();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';

    try { await initDiceEngine(); isDiceBoxReady = true; } catch (e) { console.error(e); }

    if (userRole === 'dm') {
        document.getElementById('master-combat-btn').style.display = 'block';
        document.getElementById('dm-npc-controls').style.display = 'flex';
    }

    db.joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, stats);

    setTimeout(() => { canAnimate = true; }, 1000);
};

window.roll = async (type, isInit = false) => {
    if (isCooldown && !isInit) return;
    if (!isDiceBoxReady) return;

    const currentMode = isInit ? 'normal' : activeMode;
    if (!isInit) { isCooldown = true; setDiceCooldown(true); }

    playStartRollSound(isMuted);
    await updateDiceColor(pColor);

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
    const rollData = { pName, cName, type, res: finalRes, mod, color: pColor, mode: currentMode, ts: Date.now() };
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

    if (targetCName === cName) localStorage.setItem('critroll_currHp', newHp);
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
    }
};

document.getElementById('adv-btn').onclick = () => { activeMode = (activeMode === 'adv') ? 'normal' : 'adv'; updateModeUI(activeMode); };
document.getElementById('dis-btn').onclick = () => { activeMode = (activeMode === 'dis') ? 'normal' : 'dis'; updateModeUI(activeMode); };
document.getElementById('mute-btn').onclick = () => { isMuted = !isMuted; document.getElementById('mute-btn').innerText = isMuted ? "🔊" : "🔇"; };

// ==========================================
// ניהול מפלצות לשה"מ (NPC Generator)
// ==========================================

const npcDatabase = {
    "goblin": { name: "גובלין", hp: 7, init: 2, img: "https://cdn-icons-png.flaticon.com/512/3408/3408509.png" },
    "skeleton": { name: "שלד", hp: 13, init: 2, img: "https://cdn-icons-png.flaticon.com/512/1043/1043372.png" },
    "zombie": { name: "זומבי", hp: 22, init: -2, img: "https://cdn-icons-png.flaticon.com/512/3408/3408546.png" },
    "orc": { name: "אורק", hp: 15, init: 1, img: "https://cdn-icons-png.flaticon.com/512/1703/1703061.png" },
    "wolf": { name: "זאב נורא", hp: 37, init: 2, img: "https://cdn-icons-png.flaticon.com/512/3504/3504481.png" },
    "bandit": { name: "שודד", hp: 11, init: 1, img: "https://cdn-icons-png.flaticon.com/512/2613/2613149.png" },
    "spider": { name: "עכביש ענק", hp: 26, init: 3, img: "https://cdn-icons-png.flaticon.com/512/1673/1673181.png" },
    "dragon": { name: "דרקון צעיר", hp: 110, init: 4, img: "https://cdn-icons-png.flaticon.com/512/1531/1531858.png" }
};

document.getElementById('npc-preset').addEventListener('change', (e) => {
    const val = e.target.value;
    if(val === 'custom') {
        document.getElementById('npc-name').value = "";
        document.getElementById('npc-hp').value = "";
        document.getElementById('npc-init').value = "";
    } else {
        const data = npcDatabase[val];
        document.getElementById('npc-name').value = data.name;
        document.getElementById('npc-hp').value = data.hp;
        document.getElementById('npc-init').value = data.init;
    }
});

document.getElementById('add-npc-btn').onclick = () => {
    if (userRole !== 'dm') return;
    const presetVal = document.getElementById('npc-preset').value;
    const baseName = document.getElementById('npc-name').value.trim() || "מפלצת";
    const npcHp = parseInt(document.getElementById('npc-hp').value) || 10;
    const npcInitBonus = parseInt(document.getElementById('npc-init').value) || 0;
    const count = parseInt(document.getElementById('npc-count').value) || 1;

    let portrait = "https://via.placeholder.com/50/c0392b/ffffff?text=NPC";
    if (presetVal !== 'custom' && npcDatabase[presetVal]) {
        portrait = npcDatabase[presetVal].img;
    }

    for(let i = 1; i <= count; i++) {
        // אם מוסיפים יותר מאחד, מוסיפים מספר סידורי לשם (גובלין 1, גובלין 2)
        const finalName = count > 1 ? `${baseName} ${i}` : baseName;
        
        // גלגול יוזמה אוטומטי (D20 + תוסף)
        const d20 = Math.floor(Math.random() * 20) + 1;
        const finalInit = d20 + npcInitBonus;

        const stats = { maxHp: npcHp, hp: npcHp, ac: 10, speed: 30, pp: 10 };
        
        db.joinPlayerToDB(finalName, "DM", "#c0392b", "npc", portrait, stats);
        db.setPlayerInitiativeInDB(finalName, "DM", finalInit, "#c0392b");
        
        // דיווח ללוג שהמפלצת נוספה (עם הפירוט של היוזמה)
        const time = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
        db.saveRollToDB({
            cName: "שליט המבוך", type: "STATUS", status: `הוסיף את ⚔️ ${finalName} (יוזמה: ${finalInit})`, ts: Date.now()
        });
    }

    // איפוס השדות אחרי ההוספה
    document.getElementById('npc-preset').value = "custom";
    document.getElementById('npc-name').value = "";
    document.getElementById('npc-hp').value = "";
    document.getElementById('npc-init').value = "";
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

db.listenToPlayers((playersData) => updateInitiativeUI(playersData, userRole));

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
