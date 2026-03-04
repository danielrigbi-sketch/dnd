import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, set, onDisconnect, onValue, remove, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ייבוא מנוע הקוביות החדש שיצרנו (במקום הספרייה הישירה)
import { initDiceEngine, updateDiceColor, roll3DDice, clearDice } from "./diceEngine.js";

// שימוש בגרסה מעודכנת של הקבצים למניעת קאש
import { firebaseConfig } from "./constants.js?v=9";
import { getFlavorText } from "./messages.js?v=9";
import { unlockAudio, playRollSound, stopAllSounds } from "./audio.js?v=9";
import { updateModeUI, updateInitiativeUI, addLogEntry, setDiceCooldown } from "./ui.js?v=9";
import { unlockAudio, playRollSound, stopAllSounds, playStartRollSound } from "./audio.js?v=9";
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let isDiceBoxReady = false;

// --- 1. טיפול בבחירת צבעים וטעינת זיכרון ---
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

    const savedPName = localStorage.getItem('critroll_pName');
    const savedCName = localStorage.getItem('critroll_cName');
    const savedColor = localStorage.getItem('critroll_pColor');
    const savedRole = localStorage.getItem('critroll_role');

    if (savedPName) document.getElementById('player-name').value = savedPName;
    if (savedCName) document.getElementById('char-name').value = savedCName;
    if (savedRole) document.getElementById('user-role').value = savedRole;
    if (savedColor) setActiveColor(savedColor);
});

// משתנים גלובליים
let pName = "", cName = "", pColor = "#8B0000", userRole = "player";
let isMuted = false, isCooldown = false, canAnimate = false;
let activeMode = 'normal'; 

// --- 2. הצטרפות למשחק ואתחול המנוע ---
document.getElementById('join-btn').onclick = async () => {
    pName = document.getElementById('player-name').value.trim();
    cName = document.getElementById('char-name').value.trim();
    pColor = document.getElementById('user-color') ? document.getElementById('user-color').value : pColor;
    userRole = document.getElementById('user-role').value;

    if (!pName || !cName) return alert("מלא פרטים!");

    localStorage.setItem('critroll_pName', pName);
    localStorage.setItem('critroll_cName', cName);
    localStorage.setItem('critroll_pColor', pColor);
    localStorage.setItem('critroll_role', userRole);

    unlockAudio(); 

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    
    try {
        // שימוש בפונקציית האתחול מהקובץ החיצוני
        await initDiceEngine();
        isDiceBoxReady = true;
        console.log("3D Engine Ready");
    } catch (e) {
        console.error("DiceBox failed to load:", e);
    }

    const dmOnlyBtn = document.getElementById('reset-init-btn');
    if (userRole === 'dm') {
        dmOnlyBtn.style.display = 'block';
    } else {
        dmOnlyBtn.style.display = 'none';
    }

    updateModeUI(activeMode);

    const userRef = ref(db, 'online/' + pName + '_' + cName);
    set(userRef, true);
    onDisconnect(userRef).remove();
    setTimeout(() => { canAnimate = true; }, 1000);
};

// --- לוגיקת ההטלה המעודכנת (עם ניקוי שולחן וזריקה חזקה למרכז) ---
// --- לוגיקת ההטלה המעודכנת (מתוקנת מבאג ההיעלמות) ---
window.roll = async (type, isInit = false) => {
    if (isCooldown && !isInit) return;
    if (!isDiceBoxReady) return console.warn("מנוע הקוביות עדיין בטעינה...");

    const currentMode = isInit ? 'normal' : activeMode;

    if (!isInit) {
        isCooldown = true;
        setDiceCooldown(true);
    }

    // עדכון צבע הקוביות דרך הפונקציה המיובאת
    await updateDiceColor(pColor);

    let finalRes, res1 = null, res2 = null;

    try {
        // הערה: הוסרו rollOptions והקריאה ל-clearDice() שגרמו לקריסת המנוע.
        // אנו סומכים על הגדרות הזריקה למרכז וניקוי המסך האוטומטי של הספרייה.

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
        console.error("Roll failed:", err);
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

// מאזיני כפתורים
document.getElementById('adv-btn').onclick = () => { activeMode = (activeMode === 'adv') ? 'normal' : 'adv'; updateModeUI(activeMode); };
document.getElementById('dis-btn').onclick = () => { activeMode = (activeMode === 'dis') ? 'normal' : 'dis'; updateModeUI(activeMode); };
document.getElementById('mute-btn').onclick = () => { isMuted = !isMuted; document.getElementById('mute-btn').innerText = isMuted ? "🔊 הפעל" : "🔇 השתק"; };
document.getElementById('reset-init-btn').onclick = () => { if(confirm("לאפס יוזמה?")) remove(ref(db, 'initiative')); };
document.querySelectorAll('.dice-btn').forEach(btn => { btn.onclick = () => window.roll(btn.getAttribute('data-type')); });

document.getElementById('init-btn').onclick = async () => { 
    const total = await window.roll('d20', true); 
    set(ref(db, 'initiative/' + (cName || pName)), { score: total, color: pColor, playerName: pName }); 
};

// טיפול בנתונים
onValue(ref(db, 'online'), (snapshot) => {
    const countEl = document.getElementById('online-count');
    if (countEl) countEl.innerText = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
});

onValue(ref(db, 'initiative'), (snapshot) => {
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

    setTimeout(() => {
        const total = (data.res || 0) + (data.mod || 0);
        const maxVal = parseInt(data.type.replace('d', '')) || 20;
        const flavorText = getFlavorText(data.type, data.res, total, maxVal);

        resultText.innerText = total;
        resultText.style.color = data.color;
        resultText.classList.add('show');
        
        addLogEntry(data, time, flavorText);
    }, 1500); 
});
