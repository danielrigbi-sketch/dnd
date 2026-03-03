import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, set, onDisconnect, onValue, remove, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ייבוא מודולים - הוספתי את setDiceCooldown
import { firebaseConfig, diceShapes } from "./constants.js";
import { getFlavorText } from "./messages.js";
import { unlockAudio, playRollSound, stopAllSounds } from "./audio.js";
import { updateModeUI, updateInitiativeUI, addLogEntry, setDiceCooldown } from "./ui.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// משתנים גלובליים
let pName = "", cName = "", pColor = "#8B0000", userRole = "player";
let isMuted = false, isCooldown = false, canAnimate = false;
let activeMode = 'normal'; 

// --- 1. טיפול בבחירת צבעים וטעינת זיכרון ---
window.addEventListener('DOMContentLoaded', () => {
    const colorOptions = document.querySelectorAll('.color-opt');
    const colorInput = document.getElementById('user-color');

    const setActiveColor = (color) => {
        colorOptions.forEach(opt => {
            if (opt.getAttribute('data-color') === color) {
                colorOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                colorInput.value = color;
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

// --- 2. הצטרפות למשחק ---
document.getElementById('join-btn').onclick = () => {
    pName = document.getElementById('player-name').value.trim();
    cName = document.getElementById('char-name').value.trim();
    pColor = document.getElementById('user-color').value;
    userRole = document.getElementById('user-role').value;

    if (!pName || !cName) return alert("מלא פרטים!");

    localStorage.setItem('critroll_pName', pName);
    localStorage.setItem('critroll_cName', cName);
    localStorage.setItem('critroll_pColor', pColor);
    localStorage.setItem('critroll_role', userRole);

    unlockAudio(); 

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    
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

// --- לוגיקת ההטלה המעודכנת עם הקולדאון הויזואלי ---
window.roll = (type, isInit = false) => {
    if (isCooldown && !isInit) return;
    const currentMode = isInit ? 'normal' : activeMode;

   if (!isInit) {
        isCooldown = true;
        setDiceCooldown(true); // קריאה לפונקציה שאחראית על האפור!
        
        setTimeout(() => { 
            isCooldown = false; 
            setDiceCooldown(false); // החזרת הצבע
        }, 3000);
    }

    const max = parseInt(type.replace('d', '')) || 20;
    const mod = parseInt(document.getElementById('mod-input').value) || 0;
    let res, res1 = null, res2 = null;

    if (currentMode === 'normal') {
        res = Math.floor(Math.random() * max) + 1;
    } else {
        res1 = Math.floor(Math.random() * max) + 1;
        res2 = Math.floor(Math.random() * max) + 1;
        res = (currentMode === 'adv') ? Math.max(res1, res2) : Math.min(res1, res2);
    }
    
    const rollData = { pName, cName, type, res, mod, color: pColor, mode: currentMode, ts: Date.now() };
    if (res1 !== null) rollData.res1 = res1;
    if (res2 !== null) rollData.res2 = res2;

    push(ref(db, 'rolls'), rollData);

    if (!isInit) {
        activeMode = 'normal';
        updateModeUI(activeMode);
    }
    return res + mod;
};

// מאזיני כפתורים
document.getElementById('adv-btn').onclick = () => { activeMode = (activeMode === 'adv') ? 'normal' : 'adv'; updateModeUI(activeMode); };
document.getElementById('dis-btn').onclick = () => { activeMode = (activeMode === 'dis') ? 'normal' : 'dis'; updateModeUI(activeMode); };
document.getElementById('mute-btn').onclick = () => { isMuted = !isMuted; document.getElementById('mute-btn').innerText = isMuted ? "🔊 הפעל" : "🔇 השתק"; };
document.getElementById('reset-init-btn').onclick = () => { if(confirm("לאפס יוזמה?")) remove(ref(db, 'initiative')); };
document.querySelectorAll('.dice-btn').forEach(btn => { btn.onclick = () => window.roll(btn.getAttribute('data-type')); });
document.getElementById('init-btn').onclick = () => { 
    const total = window.roll('d20', true); 
    set(ref(db, 'initiative/' + cName), { score: total, color: pColor, playerName: pName }); 
};

// טיפול בנתונים - אונליין
onValue(ref(db, 'online'), (snapshot) => {
    const countEl = document.getElementById('online-count');
    if (!countEl) return;
    const data = snapshot.val();
    countEl.innerText = data ? Object.keys(data).length : 0;
});

// טיפול בנתונים - יוזמה
onValue(ref(db, 'initiative'), (snapshot) => {
    updateInitiativeUI(snapshot.val());
});

// הטלות ואנימציה
onChildAdded(query(ref(db, 'rolls'), limitToLast(20)), (snapshot) => {
    const data = snapshot.val();
    if (!data || !canAnimate) return;

    const time = new Date(data.ts || Date.now()).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const stage = document.getElementById('dice-visual');
    const resultText = document.getElementById('result-text');
    const body = document.getElementById('main-body');

    document.getElementById('empty-state').style.display = 'none';
    stage.style.display = 'block';
    
    stage.classList.remove('shake', 'crit-glow');
    body.classList.remove('screen-shake');
    resultText.classList.remove('show');
    resultText.innerText = "";

    playRollSound(data.type, data.res, isMuted);
    
    if (data.type === 'd20' && data.res === 20) {
        stage.classList.add('crit-glow'); 
        body.classList.add('screen-shake');
    }

    stage.classList.add('shake');
    document.getElementById('dice-svg').innerHTML = diceShapes[data.type] || diceShapes.d20;
    document.getElementById('dice-svg').firstChild.style.fill = data.color;

    const maxVal = parseInt(data.type.replace('d', '')) || 20;
    const total = (data.res || 0) + (data.mod || 0);
    const flavorText = getFlavorText(data.type, data.res, total, maxVal);

    setTimeout(() => {
        stage.classList.remove('shake');
        resultText.innerText = total;
        resultText.classList.add('show');
        addLogEntry(data, time, flavorText);
    }, 600);
});
