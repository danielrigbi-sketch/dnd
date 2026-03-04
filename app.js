import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, set, onDisconnect, onValue, remove, query, limitToLast, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ייבוא מנוע הקוביות והממשק
import { initDiceEngine, updateDiceColor, roll3DDice, clearDice } from "./diceEngine.js";
import { firebaseConfig } from "./constants.js?v=10";
import { getFlavorText } from "./messages.js?v=10";
import { unlockAudio, playRollSound, stopAllSounds, playStartRollSound } from "./audio.js?v=10";
import { updateModeUI, updateInitiativeUI, addLogEntry, setDiceCooldown } from "./ui.js?v=10";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let isDiceBoxReady = false;

// --- 1. טיפול בבחירת צבעים וטעינת זיכרון מורחב ---
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
        opt.addEventListener('click', () => {
            const selectedColor = opt.getAttribute('data-color');
            setActiveColor(selectedColor);
        });
    });

    // טעינת זיכרון מורחב (דף דמות)
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
        currHp: localStorage.getItem('critroll_currHp')
    };

    if (savedStats.pName) document.getElementById('player-name').value = savedStats.pName;
    if (savedStats.cName) document.getElementById('char-name').value = savedStats.cName;
    if (savedStats.role) document.getElementById('user-role').value = savedStats.role;
    if (savedStats.color) setActiveColor(savedStats.color);
    
    // מילוי שדות דף הדמות
    if (savedStats.race) document.getElementById('char-race').value = savedStats.race;
    if (savedStats.class) document.getElementById('char-class').value = savedStats.class;
    if (savedStats.ac) document.getElementById('char-ac').value = savedStats.ac;
    if (savedStats.speed) document.getElementById('char-speed').value = savedStats.speed;
    if (savedStats.pp) document.getElementById('char-pp').value = savedStats.pp;
    if (savedStats.initBonus) document.getElementById('init-bonus').value = savedStats.initBonus;
    if (savedStats.maxHp) document.getElementById('max-hp').value = savedStats.maxHp;
    if (savedStats.currHp) document.getElementById('curr-hp').value = savedStats.currHp;
});

// משתנים גלובליים
let pName = "", cName = "", pColor = "#8B0000", userRole = "player";
let isMuted = false, isCooldown = false, canAnimate = false;
let activeMode = 'normal'; 

// --- 2. הצטרפות למשחק (רישום משתתף מלא) ---
document.getElementById('join-btn').onclick = async () => {
    pName = document.getElementById('player-name').value.trim();
    cName = document.getElementById('char-name').value.trim();
    pColor = document.getElementById('user-color') ? document.getElementById('user-color').value : pColor;
    userRole = document.getElementById('user-role').value;

    if (!pName || !cName) return alert("מלא לפחות שם שחקן ודמות!");

    // איסוף נתונים מורחבים
    const stats = {
        race: document.getElementById('char-race').value,
        class: document.getElementById('char-class').value,
        ac: document.getElementById('char-ac').value,
        speed: document.getElementById('char-speed').value,
        pp: document.getElementById('char-pp').value,
        initBonus: parseInt(document.getElementById('init-bonus').value) || 0,
        maxHp: parseInt(document.getElementById('max-hp').value) || 10,
        hp: parseInt(document.getElementById('curr-hp').value) || 10
    };

    // שמירה ב-LocalStorage
    localStorage.setItem('critroll_pName', pName);
    localStorage.setItem('critroll_cName', cName);
    localStorage.setItem('critroll_pColor', pColor);
    localStorage.setItem('critroll_role', userRole);
    Object.keys(stats).forEach(key => localStorage.setItem('critroll_' + key, stats[key]));

    unlockAudio(); 

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    
    try {
        await initDiceEngine();
        isDiceBoxReady = true;
    } catch (e) { console.error(e); }

    // הגדרות שה"מ
    const dmOnlyBtn = document.getElementById('reset-init-btn');
    const masterCombatBtn = document.getElementById('master-combat-btn');
    if (userRole === 'dm') {
        dmOnlyBtn.style.display = 'block';
        masterCombatBtn.style.display = 'block';
    }

    updateModeUI(activeMode);

    // רישום המשתתף ב-Firebase (תחת players)
    const playerRef = ref(db, 'players/' + cName);
    set(playerRef, {
        pName, pColor, ...stats,
        score: 0 // טרם גולגלה יוזמה
    });
    onDisconnect(playerRef).remove();

    // רישום לסטטוס אונליין (לספירה)
    const userRef = ref(db, 'online/' + pName + '_' + cName);
    set(userRef, true);
    onDisconnect(userRef).remove();
    
    setTimeout(() => { canAnimate = true; }, 1000);
};

// --- 3. לוגיקת ההטלה ---
window.roll = async (type, isInit = false) => {
    if (isCooldown && !isInit) return;
    if (!isDiceBoxReady) return;

    const currentMode = isInit ? 'normal' : activeMode;
    if (!isInit) {
        isCooldown = true;
        setDiceCooldown(true);
    }

    playStartRollSound(isMuted);
    await updateDiceColor(pColor);

    let finalRes, res1 = null, res2 = null;

    try {
        if (currentMode !== 'normal' && type === 'd20') {
            const results = await roll3DDice("2d20");
            res1 = results[0].value;
            res2 = results[1].value;
            finalRes = (currentMode === 'adv') ? Math.max(res1, res2) : Math.min(res1, res2);
        } else {
            const results = await roll3DDice(`1${type}`);
            finalRes = results[0].value;
        }
    } catch (err) {
        console.error(err);
        isCooldown = false;
        setDiceCooldown(false);
        return;
    }
    
    const mod = parseInt(document.getElementById('mod-input').value) || 0;
    const rollData = { pName, cName, type, res: finalRes, mod, color: pColor, mode: currentMode, ts: Date.now() };
    if (res1 !== null) rollData.res1 = res1;
    if (res2 !== null) rollData.res2 = res2;

    push(ref(db, 'rolls'), rollData);

    if (!isInit) {
        activeMode = 'normal';
        updateModeUI(activeMode);
        setTimeout(() => { 
            isCooldown = false; 
            setDiceCooldown(false); 
        }, 1000);
    }
    return finalRes + mod;
};

// מאזיני כפתורים כלליים
document.getElementById('adv-btn').onclick = () => { activeMode = (activeMode === 'adv') ? 'normal' : 'adv'; updateModeUI(activeMode); };
document.getElementById('dis-btn').onclick = () => { activeMode = (activeMode === 'dis') ? 'normal' : 'dis'; updateModeUI(activeMode); };
document.getElementById('mute-btn').onclick = () => { isMuted = !isMuted; document.getElementById('mute-btn').innerText = isMuted ? "🔊" : "🔇"; };
document.getElementById('reset-init-btn').onclick = () => { if(confirm("לאפס יוזמה לכולם?")) remove(ref(db, 'initiative')); };
document.querySelectorAll('.dice-btn').forEach(btn => { btn.onclick = () => window.roll(btn.getAttribute('data-type')); });

// --- 4. בקרת שה"מ (Master Switch) ---
const masterCombatBtn = document.getElementById('master-combat-btn');
if (masterCombatBtn) {
    masterCombatBtn.onclick = () => {
        const combatRef = ref(db, 'combat_active');
        onValue(combatRef, (snap) => {
            const current = snap.val() || false;
            set(combatRef, !current); // שינוי מצב הקרב
            
            // אם פתחנו קרב חדש - מאפסים יוזמות קודמות ב-Firebase
            if (!current) {
                remove(ref(db, 'initiative'));
                // איפוס ה-score של כל השחקנים ל-0
                onValue(ref(db, 'players'), (pSnap) => {
                    const players = pSnap.val();
                    if(players) {
                        Object.keys(players).forEach(name => {
                            update(ref(db, 'players/' + name), { score: 0 });
                        });
                    }
                }, { onlyOnce: true });
            }
        }, { onlyOnce: true });
    };
}

// לחיצת שחקן על יוזמה (כולל הבונוס המובנה)
document.getElementById('init-btn').onclick = async () => { 
    const btn = document.getElementById('init-btn');
    const bonus = parseInt(localStorage.getItem('critroll_initBonus')) || 0;
    
    btn.disabled = true;
    const rollResult = await window.roll('d20', true); 
    const total = rollResult + bonus;

    // עדכון בנתיב המשתתפים ובנתיב היוזמה לסנכרון
    update(ref(db, 'players/' + cName), { score: total });
    set(ref(db, 'initiative/' + cName), { score: total, color: pColor, playerName: pName }); 
};

// --- 5. סנכרון נתונים ו-UI ---

// מאזין למצב קרב (פתיחה/סגירה של כפתור היוזמה)
onValue(ref(db, 'combat_active'), (snapshot) => {
    const isCombat = snapshot.val();
    const initBtn = document.getElementById('init-btn');
    if (!initBtn) return;

    if (isCombat) {
        // בודקים אם כבר גלגלנו בקרב הזה
        onValue(ref(db, 'initiative/' + cName), (initSnap) => {
            if (initSnap.exists()) {
                initBtn.disabled = true;
                initBtn.innerText = "✅ רשום";
                initBtn.style.opacity = "0.5";
            } else {
                initBtn.disabled = false;
                initBtn.innerText = "⚡ גלגל יוזמה!";
                initBtn.style.opacity = "1";
            }
        }, { onlyOnce: true });
    } else {
        initBtn.disabled = true;
        initBtn.innerText = "⌛ ממתין לקרב";
        initBtn.style.opacity = "0.3";
    }
});

onValue(ref(db, 'online'), (snapshot) => {
    const countEl = document.getElementById('online-count');
    if (countEl) countEl.innerText = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
});

// עדכון ה-Party Dashboard מתוך נתוני ה-Players
onValue(ref(db, 'players'), (snapshot) => {
    updateInitiativeUI(snapshot.val());
});

onChildAdded(query(ref(db, 'rolls'), limitToLast(1)), (snapshot) => {
    const data = snapshot.val();
    if (!data || !canAnimate) return;

    const time = new Date(data.ts || Date.now()).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const resultText = document.getElementById('result-text');
    const visualContainer = document.getElementById('dice-visual');

    document.getElementById('empty-state').style.display = 'none';
    visualContainer.style.display = 'flex';
    resultText.classList.remove('show');

    playRollSound(data.type, data.res, isMuted);

    const total = (data.res || 0) + (data.mod || 0);
    const maxVal = parseInt(data.type.replace('d', '')) || 20;
    const flavorText = getFlavorText(data.type, data.res, total, maxVal);

    resultText.innerText = total;
    resultText.style.color = 'white'; 
    resultText.style.textShadow = `0 0 20px ${data.color}, 0 0 40px ${data.color}, 3px 3px 10px rgba(0,0,0,0.9)`;
    
    resultText.classList.add('show');
    addLogEntry(data, time, flavorText);
});
