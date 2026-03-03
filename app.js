import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, set, onDisconnect, onValue, remove, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ייבוא הקבצים המודולריים
import { firebaseConfig, diceShapes } from "./constants.js";
import { getFlavorText } from "./messages.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let pName = "", cName = "", pColor = "#e74c3c", isMuted = false, isCooldown = false, canAnimate = false;
let activeMode = 'normal'; 

const rollSound = new Audio('./dice.mp3');
const critSound = new Audio('./crit.mp3');
const failSound = new Audio('./fail.mp3');

// פונקציית עזר לעצירת כל הסאונדים
function stopAllSounds() {
    [rollSound, critSound, failSound].forEach(s => {
        s.pause();
        s.currentTime = 0;
    });
}

// ניהול ממשק המצב (יתרון/חיסרון)
function updateModeUI() {
    const advBtn = document.getElementById('adv-btn');
    const disBtn = document.getElementById('dis-btn');
    if (!advBtn || !disBtn) return;

    [advBtn, disBtn].forEach(btn => {
        btn.style.filter = "grayscale(100%)";
        btn.style.opacity = "0.4";
        btn.style.border = "1px solid rgba(255,255,255,0.2)";
    });

    if (activeMode === 'adv') {
        advBtn.style.filter = "grayscale(0%)";
        advBtn.style.opacity = "1";
        advBtn.style.border = "2px solid white";
    } else if (activeMode === 'dis') {
        disBtn.style.filter = "grayscale(0%)";
        disBtn.style.opacity = "1";
        disBtn.style.border = "2px solid white";
    }
}

// --- הצטרפות למשחק (כאן פתרנו את ה"קליק" מהנייד) ---
document.getElementById('join-btn').onclick = () => {
    pName = document.getElementById('player-name').value.trim();
    cName = document.getElementById('char-name').value.trim();
    pColor = document.getElementById('user-color').value;
    if (!pName || !cName) return alert("מלא פרטים!");

    // "שחרור" האודיו בנייד בצורה שקטה לחלוטין
    const unlock = (s) => {
        s.muted = true; // משתיק את האלמנט ברמת המערכת
        s.play().then(() => {
            s.pause();
            s.currentTime = 0;
            s.muted = false; // מחזיר את היכולת להשמיע סאונד לאחר שהשתחרר
        }).catch(() => {});
    };
    [rollSound, critSound, failSound].forEach(unlock);

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    updateModeUI();

    const userRef = ref(db, 'online/' + pName + '_' + cName);
    set(userRef, true);
    onDisconnect(userRef).remove();
    setTimeout(() => { canAnimate = true; }, 1000);
};

// --- לוגיקת ההטלה ---
window.roll = (type, isInit = false) => {
    if (isCooldown && !isInit) return;
    const currentMode = isInit ? 'normal' : activeMode;

    if (!isInit) {
        isCooldown = true;
        const btns = document.querySelectorAll('.dice-btn, .special-roll-btn, #init-btn');
        btns.forEach(b => b.disabled = true);
        setTimeout(() => { isCooldown = false; btns.forEach(b => b.disabled = false); }, 3000);
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
        updateModeUI();
    }
    return res + mod;
};

// מאזיני כפתורים
document.getElementById('adv-btn').onclick = () => { activeMode = (activeMode === 'adv') ? 'normal' : 'adv'; updateModeUI(); };
document.getElementById('dis-btn').onclick = () => { activeMode = (activeMode === 'dis') ? 'normal' : 'dis'; updateModeUI(); };
document.getElementById('mute-btn').onclick = () => { isMuted = !isMuted; document.getElementById('mute-btn').innerText = isMuted ? "🔊 הפעל" : "🔇 השתק"; };
document.getElementById('reset-init-btn').onclick = () => { if(confirm("לאפס יוזמה?")) remove(ref(db, 'initiative')); };
document.querySelectorAll('.dice-btn').forEach(btn => { btn.onclick = () => window.roll(btn.getAttribute('data-type')); });
document.getElementById('init-btn').onclick = () => { 
    const total = window.roll('d20', true); 
    set(ref(db, 'initiative/' + cName), { score: total, color: pColor, playerName: pName }); 
};

// טיפול בנתונים
onValue(ref(db, 'online'), (snapshot) => {
    const countEl = document.getElementById('online-count');
    if (!countEl) return;
    const data = snapshot.val();
    const count = data ? Object.keys(data).length : 0;
    countEl.innerText = count;
});

onValue(ref(db, 'initiative'), (snapshot) => {
    const list = document.getElementById('init-list');
    if (!list) return;
    list.innerHTML = "";
    const data = snapshot.val();
    if (!data) return;
    const items = Object.keys(data).map(key => ({ name: key, ...data[key] }));
    items.sort((a,b) => b.score - a.score).forEach(i => {
        const div = document.createElement('div');
        div.className = 'tracker-item';
        div.style.borderRightColor = i.color;
        div.innerHTML = `<span>${i.name}(${i.playerName || ''})</span><b>${i.score}</b>`;
        list.appendChild(div);
    });
});

// הטלות ואנימציה
onChildAdded(query(ref(db, 'rolls'), limitToLast(20)), (snapshot) => {
    const data = snapshot.val();
    if (!data || !canAnimate) return;

    const time = new Date(data.ts || Date.now()).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const stage = document.getElementById('dice-visual');
    const body = document.getElementById('main-body');
    const log = document.getElementById('roll-log');

    document.getElementById('empty-state').style.display = 'none';
    stage.style.display = 'block';
    stage.classList.remove('shake', 'crit-glow');
    body.classList.remove('screen-shake');

    if (!isMuted) {
        stopAllSounds();
        if (data.type === 'd20' && data.res === 20) {
            critSound.play().catch(()=>{});
            stage.classList.add('crit-glow'); body.classList.add('screen-shake');
        } else if (data.type === 'd20' && data.res === 1) {
            failSound.play().catch(()=>{});
        } else {
            rollSound.play().catch(()=>{});
        }
    }

    stage.classList.add('shake');
    document.getElementById('dice-svg').innerHTML = diceShapes[data.type] || diceShapes.d20;
    document.getElementById('dice-svg').firstChild.style.fill = data.color;
    document.getElementById('result-text').innerText = "";

    const maxVal = parseInt(data.type.replace('d', '')) || 20;
    const total = (data.res || 0) + (data.mod || 0);
    const flavorText = getFlavorText(data.type, data.res, total, maxVal);

    setTimeout(() => {
        stage.classList.remove('shake');
        document.getElementById('result-text').innerText = total;

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        const modeLabel = data.mode === 'adv' ? '<span style="color:#4e6e5d;">(יתרון)</span>' : (data.mode === 'dis' ? '<span style="color:#e74c3c;">(חיסרון)</span>' : '');
        const diceBreakdown = (data.res1 && data.res2) ? `<small style="opacity:0.6;"> [${data.res1}, ${data.res2}]</small>` : '';

        entry.innerHTML = `
            <div style="margin-bottom: 12px; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); border-radius: 6px;">
                <span style="color: #aaa; font-size: 11px;">[${time}]</span> 
                <strong style="color: var(--primary);">${data.cName || 'גיבור'}</strong><br>
                הטיל <strong style="color: #fff;">${data.type.toUpperCase()}</strong> ${modeLabel} וקיבל 
                <span style="color: ${data.res === 20 ? '#f1c40f' : (data.res === 1 ? '#e74c3c' : '#fff')}; font-weight: bold;">
                    ${data.res === 20 ? '20 טבעי!' : data.res}
                </span>
                ${diceBreakdown}
                <small style="opacity: 0.7;">(${data.res}${data.mod >= 0 ? '+' : ''}${data.mod})</small><br>
                <i style="color: var(--accent); font-size: 13px;">"${flavorText}"</i>
            </div>
        `;
        log.insertBefore(entry, log.firstChild);
        if (log.children.length > 20) log.removeChild(log.lastChild);
    }, 600);
});
