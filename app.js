import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, set, onDisconnect, onValue, remove, query, limitToLast, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ייבוא מנוע הקוביות והממשק
import { initDiceEngine, updateDiceColor, roll3DDice, clearDice } from "./diceEngine.js";
import { firebaseConfig } from "./constants.js?v=11";
import { getFlavorText } from "./messages.js?v=11";
import { unlockAudio, playRollSound, stopAllSounds, playStartRollSound } from "./audio.js?v=11";
import { updateModeUI, updateInitiativeUI, addLogEntry, setDiceCooldown } from "./ui.js?v=11";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let isDiceBoxReady = false;
let pName = "", cName = "", pColor = "#8B0000", userRole = "player", charPortrait = "";
let isMuted = false, isCooldown = false, canAnimate = false;
let activeMode = 'normal'; 

// סאונדים חדשים
const damageSound = new Audio('./damage.mp3');
const healSound = new Audio('./heal.mp3');

// --- 1. אתחול ובדיקות כניסה ---
window.addEventListener('DOMContentLoaded', () => {
    // לוגיקת בחירת צבע
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

    // טעינת זיכרון מורחב
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

    // מאזין לשינוי תפקיד (DM/Player)
    document.getElementById('user-role').onchange = toggleRoleFields;
    toggleRoleFields();
});

// פונקציה להצגת/הסתרת שדות לפי תפקיד
function toggleRoleFields() {
    const role = document.getElementById('user-role').value;
    const playerFields = document.getElementById('player-only-fields');
    playerFields.style.display = (role === 'dm') ? 'none' : 'block';
}

// טיפול בהעלאת תמונה (פורטרט)
document.getElementById('char-portrait').onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 600000) return alert("התמונה גדולה מדי! בחר תמונה קטנה מ-500KB");

    const reader = new FileReader();
    reader.onload = (event) => {
        charPortrait = event.target.result;
        localStorage.setItem('critroll_portrait', charPortrait);
    };
    reader.readAsDataURL(file);
};

// --- 2. הצטרפות למשחק (כולל בדיקת שה"מ) ---
document.getElementById('join-btn').onclick = async () => {
    pName = document.getElementById('player-name').value.trim();
    userRole = document.getElementById('user-role').value;
    pColor = document.getElementById('user-color').value;

    if (userRole === 'player') {
        cName = document.getElementById('char-name').value.trim();
        if (!pName || !cName) return alert("מלא שם שחקן ודמות!");
    } else {
        cName = "DM_" + pName;
    }

    // איסוף נתונים לשמירה
    const stats = {
        race: document.getElementById('char-race').value,
        class: document.getElementById('char-class').value,
        ac: document.getElementById('char-ac').value,
        speed: document.getElementById('char-speed').value,
        pp: document.getElementById('char-pp').value,
        initBonus: parseInt(document.getElementById('init-bonus').value) || 0,
        maxHp: parseInt(document.getElementById('max-hp').value) || 10,
        hp: parseInt(document.getElementById('curr-hp').value) || 10,
        portrait: charPortrait
    };

    localStorage.setItem('critroll_pName', pName);
    localStorage.setItem('critroll_cName', cName);
    localStorage.setItem('critroll_pColor', pColor);
    localStorage.setItem('critroll_role', userRole);
    if(userRole === 'player') Object.keys(stats).forEach(k => localStorage.setItem('critroll_' + k, stats[k]));

    unlockAudio();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';

    try { await initDiceEngine(); isDiceBoxReady = true; } catch (e) {}

    // חשיפת כפתורי ניהול לשה"מ
    if (userRole === 'dm') {
        document.getElementById('reset-init-btn').style.display = 'block';
        document.getElementById('master-combat-btn').style.display = 'block';
    }

    // רישום ב-Firebase
    const playerRef = ref(db, 'players/' + cName);
    const dataToSet = { pName, pColor, userRole, score: 0 };
    if (userRole === 'player') Object.assign(dataToSet, stats);
    
    set(playerRef, dataToSet);
    onDisconnect(playerRef).remove();

    const userOnlineRef = ref(db, 'online/' + pName + '_' + cName);
    set(userOnlineRef, { role: userRole });
    onDisconnect(userOnlineRef).remove();

    setTimeout(() => { canAnimate = true; }, 1000);
};

// --- 3. לוגיקת הטלה ---
window.roll = async (type, isInit = false) => {
    if (isCooldown && !isInit) return;
    if (!isDiceBoxReady) return;

    const currentMode = isInit ? 'normal' : activeMode;
    if (!isInit) { isCooldown = true; setDiceCooldown(true); }

    playStartRollSound(isMuted);
    await updateDiceColor(pColor);

    let finalRes, res1 = null, res2 = null;
    try {
        if (currentMode !== 'normal' && type === 'd20') {
            const results = await roll3DDice("2d20");
            res1 = results[0].value; res2 = results[1].value;
            finalRes = (currentMode === 'adv') ? Math.max(res1, res2) : Math.min(res1, res2);
        } else {
            const results = await roll3DDice(`1${type}`);
            finalRes = results[0].value;
        }
    } catch (err) { isCooldown = false; setDiceCooldown(false); return; }

    const mod = parseInt(document.getElementById('mod-input').value) || 0;
    const rollData = { pName, cName, type, res: finalRes, mod, color: pColor, mode: currentMode, ts: Date.now() };
    if (res1 !== null) { rollData.res1 = res1; rollData.res2 = res2; }

    push(ref(db, 'rolls'), rollData);

    if (!isInit) {
        activeMode = 'normal'; updateModeUI(activeMode);
        setTimeout(() => { isCooldown = false; setDiceCooldown(false); }, 1000);
    }
    return finalRes + mod;
};

// --- 4. עריכת חיים, סטטוסים ומיקרו-קופי ---

// פונקציית עזר למיקרו-קופי רנדומלי
const getHpMicroCopy = (isHeal, char, amount) => {
    const healMsgs = [`ניצוצות קסם אופפים את ${char}!`, `${char} מרגיש כוחות מתחדשים.`, `מרפא אלוהי נגע ב${char}.` ];
    const dmgMsgs = [`מכה קשה נחתה על ${char}!`, `האדמה רועדת... ${char} ספג פגיעה.`, `${char} נאנק מכאב.`];
    const base = isHeal ? healMsgs : dmgMsgs;
    return base[Math.floor(Math.random() * base.length)] + ` (${Math.abs(amount)} נק')`;
};

// עדכון HP גלובלי (ייקרא מה-UI)
window.changeHP = (targetCName, amount) => {
    const pRef = ref(db, 'players/' + targetCName);
    onValue(pRef, (snap) => {
        const p = snap.val();
        if (!p) return;
        const newHp = Math.max(0, Math.min(p.maxHp, (p.hp || 0) + amount));
        
        update(pRef, { hp: newHp });
        
        // שליחת אירוע ללוג
        push(ref(db, 'rolls'), {
            cName: targetCName,
            type: amount > 0 ? "HEAL" : "DAMAGE",
            res: Math.abs(amount),
            newHp: newHp,
            color: amount > 0 ? "#2ecc71" : "#e74c3c",
            flavor: getHpMicroCopy(amount > 0, targetCName, amount),
            ts: Date.now()
        });

        // שמירה מקומית אם זה אני
        if (targetCName === cName) localStorage.setItem('critroll_currHp', newHp);

    }, { onlyOnce: true });
};

// ניהול סטטוסים (ייקרא מה-UI)
window.toggleStatus = (targetCName, status) => {
    if (userRole !== 'dm') return; // רק שה"מ מחלק סטטוסים
    const pRef = ref(db, 'players/' + targetCName);
    onValue(pRef, (snap) => {
        const p = snap.val();
        let statuses = p.statuses || [];
        if (statuses.includes(status)) {
            statuses = statuses.filter(s => s !== status);
        } else {
            statuses.push(status);
            push(ref(db, 'rolls'), { cName: targetCName, type: "STATUS", status: status, ts: Date.now() });
        }
        update(pRef, { statuses: statuses });
    }, { onlyOnce: true });
};

// --- 5. סנכרון כפתורים ואירועים ---

// תיקון באג איפוס
document.getElementById('reset-init-btn').onclick = () => {
    if (confirm("לאפס יוזמה לכולם?")) {
        remove(ref(db, 'initiative'));
        onValue(ref(db, 'players'), (snap) => {
            const players = snap.val();
            if (players) {
                Object.keys(players).forEach(name => update(ref(db, 'players/' + name), { score: 0 }));
            }
        }, { onlyOnce: true });
        // ניקוי UI מקומי למניעת "שאריות"
        updateInitiativeUI(null);
    }
};

// בדיקת שה"מ קיים בחדר
onValue(ref(db, 'online'), (snapshot) => {
    const online = snapshot.val();
    let dmFound = false;
    if (online) Object.values(online).forEach(u => { if(u.role === 'dm') dmFound = true; });
    
    const roleSelect = document.getElementById('user-role');
    const dmMsg = document.getElementById('dm-exists-msg');
    if (dmFound && userRole !== 'dm') {
        roleSelect.value = 'player';
        roleSelect.options[1].disabled = true;
        dmMsg.style.display = 'block';
    } else {
        roleSelect.options[1].disabled = false;
        dmMsg.style.display = 'none';
    }
    document.getElementById('online-count').innerText = online ? Object.keys(online).length : 0;
});

// מאזיני כפתורים
document.getElementById('adv-btn').onclick = () => { activeMode = (activeMode === 'adv') ? 'normal' : 'adv'; updateModeUI(activeMode); };
document.getElementById('dis-btn').onclick = () => { activeMode = (activeMode === 'dis') ? 'normal' : 'dis'; updateModeUI(activeMode); };
document.getElementById('mute-btn').onclick = () => { isMuted = !isMuted; document.getElementById('mute-btn').innerText = isMuted ? "🔊" : "🔇"; };
document.querySelectorAll('.dice-btn').forEach(btn => { btn.onclick = () => window.roll(btn.getAttribute('data-type')); });

// הפעלת מצב קרב
document.getElementById('master-combat-btn').onclick = () => {
    const combatRef = ref(db, 'combat_active');
    onValue(combatRef, (snap) => {
        const current = snap.val() || false;
        set(combatRef, !current);
        if (!current) {
            remove(ref(db, 'initiative'));
            onValue(ref(db, 'players'), (pSnap) => {
                const p = pSnap.val();
                if(p) Object.keys(p).forEach(n => update(ref(db, 'players/'+n), {score: 0}));
            }, {onlyOnce: true});
        }
    }, { onlyOnce: true });
};

// גלגול יוזמה
document.getElementById('init-btn').onclick = async () => {
    const btn = document.getElementById('init-btn');
    const bonus = parseInt(localStorage.getItem('critroll_initBonus')) || 0;
    btn.disabled = true;
    const res = await window.roll('d20', true);
    const total = res + bonus;
    update(ref(db, 'players/' + cName), { score: total });
    set(ref(db, 'initiative/' + cName), { score: total, color: pColor, playerName: pName });
};

// --- 6. עדכוני UI ולוג ---

onValue(ref(db, 'combat_active'), (snap) => {
    const isCombat = snap.val();
    const btn = document.getElementById('init-btn');
    if (!btn) return;
    if (isCombat) {
        onValue(ref(db, 'initiative/' + cName), (s) => {
            if (s.exists()) { btn.disabled = true; btn.innerText = "✅ רשום"; }
            else { btn.disabled = false; btn.innerText = "⚡ גלגל יוזמה!"; btn.style.opacity = "1"; }
        }, { onlyOnce: true });
    } else {
        btn.disabled = true; btn.innerText = "⌛ ממתין לקרב"; btn.style.opacity = "0.3";
    }
});

onValue(ref(db, 'players'), (snapshot) => updateInitiativeUI(snapshot.val(), userRole));

onChildAdded(query(ref(db, 'rolls'), limitToLast(1)), (snapshot) => {
    const data = snapshot.val();
    if (!data || !canAnimate) return;

    // הפעלת סאונדים לפי אירוע
    if (!isMuted) {
        if (data.type === "DAMAGE") damageSound.play();
        else if (data.type === "HEAL") healSound.play();
        else playRollSound(data.type, data.res, isMuted);
    }

    const time = new Date(data.ts || Date.now()).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const resultText = document.getElementById('result-text');
    if (data.type !== "DAMAGE" && data.type !== "HEAL" && data.type !== "STATUS") {
        document.getElementById('empty-state').style.display = 'none';
        document.getElementById('dice-visual').style.display = 'flex';
        resultText.classList.remove('show');
        const total = (data.res || 0) + (data.mod || 0);
        resultText.innerText = total;
        resultText.style.textShadow = `0 0 20px ${data.color}, 3px 3px 10px rgba(0,0,0,0.9)`;
        setTimeout(() => resultText.classList.add('show'), 50);
    }

    addLogEntry(data, time, data.flavor || getFlavorText(data.type, data.res, (data.res+data.mod), 20));
});

// לוגיקת מודאל (נשמרת מהקוד הקודם)
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
