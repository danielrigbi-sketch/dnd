// app.js - הבקר הראשי (Controller)

import { initDiceEngine, updateDiceColor, roll3DDice, clearDice } from "./diceEngine.js";
import { getFlavorText } from "./messages.js";
import { unlockAudio, playRollSound, stopAllSounds, playStartRollSound, playHealSound, playDamageSound } from "./audio.js";
import { updateModeUI, updateInitiativeUI, addLogEntry, setDiceCooldown } from "./ui.js";
import * as db from "./firebaseService.js"; // ייבוא שירות מסד הנתונים החדש שיצרנו

let isDiceBoxReady = false;
let pName = "", cName = "", pColor = "#8B0000", userRole = "player", charPortrait = "";
let isMuted = false, isCooldown = false, canAnimate = false;
let activeMode = 'normal'; 

// --- 1. אתחול וטעינת נתונים ---
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

// --- 2. כניסה למשחק ---
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
        document.getElementById('reset-init-btn').style.display = 'block';
        document.getElementById('master-combat-btn').style.display = 'block';
    }

    // שימוש בשירות ה-Firebase החדש במקום כתיבה ישירה למסד
    db.joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, stats);

    setTimeout(() => { canAnimate = true; }, 1000);
};

// --- 3. לוגיקת הטלה מתוקנת ---
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

    // שמירת ההטלה דרך הקובץ הייעודי
    db.saveRollToDB(rollData);

    if (!isInit) {
        activeMode = 'normal'; updateModeUI(activeMode);
        setTimeout(() => { isCooldown = false; setDiceCooldown(false); }, 1000);
    }
    return finalRes + mod;
};

// --- 4. עריכה וניהול משחק ---

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

// --- 5. סנכרון ואירועים ---

document.getElementById('reset-init-btn
