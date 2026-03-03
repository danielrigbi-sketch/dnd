import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, set, onDisconnect, onValue, remove, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBmKG3lCfoHK4bTdjUFSMR2YLmgbXtTmbM",
    authDomain: "dnd-dice-room.firebaseapp.com",
    databaseURL: "https://dnd-dice-room-default-rtdb.firebaseio.com",
    projectId: "dnd-dice-room",
    storageBucket: "dnd-dice-room.firebasestorage.app",
    messagingSenderId: "365914207851", appId: "1:365914207851:web:777478485eabf5bf1f632e"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
let pName, cName, pColor, isMuted = false, isCooldown = false, canAnimate = false;

// משתנה למצב ההטלה הנוכחי
let activeMode = 'normal'; 

const rollSound = new Audio('./dice.mp3');
const critSound = new Audio('./crit.mp3');
const failSound = new Audio('./fail.mp3');

const diceShapes = {
    d4: '<polygon points="50,5 95,85 5,85" stroke="black" fill-opacity="0.95"/>',
    d6: '<rect x="15" y="15" width="70" height="70" rx="8" stroke="black" fill-opacity="0.95"/>',
    d8: '<polygon points="50,5 90,50 50,95 10,50" stroke="black" fill-opacity="0.95"/>',
    d10: '<polygon points="50,5 95,45 50,95 5,45" stroke="black" fill-opacity="0.95"/>',
    d12: '<polygon points="50,5 90,30 75,85 25,85 10,30" stroke="black" fill-opacity="0.95"/>',
    d20: '<polygon points="50,5 95,25 95,75 50,95 5,75 5,25" stroke="black" fill-opacity="0.95"/>'
};

// פונקציה לעדכון ויזואלי של כפתורי המצב
function updateModeUI() {
    const advBtn = document.getElementById('adv-btn');
    const disBtn = document.getElementById('dis-btn');
    
    // איפוס עיצוב (אפור)
    advBtn.style.filter = "grayscale(100%)";
    advBtn.style.opacity = "0.5";
    disBtn.style.filter = "grayscale(100%)";
    disBtn.style.opacity = "0.5";

    // הדלקת הכפתור הפעיל
    if (activeMode === 'adv') {
        advBtn.style.filter = "grayscale(0%)";
        advBtn.style.opacity = "1";
    } else if (activeMode === 'dis') {
        disBtn.style.filter = "grayscale(0%)";
        disBtn.style.opacity = "1";
    }
}

document.getElementById('join-btn').onclick = () => {
    pName = document.getElementById('player-name').value.trim();
    cName = document.getElementById('char-name').value.trim();
    pColor = document.getElementById('user-color').value;
    if (!pName || !cName) return alert("מלא פרטים!");

    const prep = (s) => { s.play().then(() => { s.pause(); s.currentTime = 0; }).catch(()=>{}); };
    [rollSound, critSound, failSound].forEach(prep);

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    
    // אתחול כפתורי מצב
    updateModeUI();

    const userRef = ref(db, 'online/' + pName + '_' + cName);
    set(userRef, true);
    onDisconnect(userRef).remove();
    setTimeout(() => { canAnimate = true; }, 1000);
};

window.roll = (type, isInit = false) => {
    if (isCooldown && !isInit) return;
    
    // קביעת המצב עבור ההטלה הנוכחית
    const currentMode = isInit ? 'normal' : activeMode;

    if (!isInit) {
        isCooldown = true;
        const btns = document.querySelectorAll('.dice-btn, .special-roll-btn, #init-btn');
        btns.forEach(b => b.disabled = true);
        setTimeout(() => { 
            isCooldown = false; 
            btns.forEach(b => b.disabled = false); 
        }, 3000);
    }

    const max = parseInt(type.replace('d', ''));
    const mod = parseInt(document.getElementById('mod-input').value) || 0;
    
    let res, res1, res2;

    if (currentMode === 'normal') {
        res = Math.floor(Math.random() * max) + 1;
    } else {
        res1 = Math.floor(Math.random() * max) + 1;
        res2 = Math.floor(Math.random() * max) + 1;
        res = (currentMode === 'adv') ? Math.max(res1, res2) : Math.min(res1, res2);
    }
    
    push(ref(db, 'rolls'), { 
        pName, cName, type, res, mod, color: pColor, 
        mode: currentMode, res1, res2,
        ts: Date.now()
    });

    // איפוס המצב לנורמל אחרי הטלה
    if (!isInit) {
        activeMode = 'normal';
        updateModeUI();
    }

    return res + mod;
};

// מאזיני כפתורי מצב (Toggle)
document.getElementById('adv-btn').onclick = () => {
    activeMode = (activeMode === 'adv') ? 'normal' : 'adv';
    updateModeUI();
};
document.getElementById('dis-btn').onclick = () => {
    activeMode = (activeMode === 'dis') ? 'normal' : 'dis';
    updateModeUI();
};

document.getElementById('mute-btn').onclick = () => { 
    isMuted = !isMuted; 
    document.getElementById('mute-btn').innerText = isMuted ? "🔊 הפעל" : "🔇 השתק"; 
};

document.getElementById('reset-init-btn').onclick = () => { if(confirm("לאפס יוזמה?")) remove(ref(db, 'initiative')); };

// קישור כפתורי הקוביות
document.querySelectorAll('.dice-btn').forEach(btn => { 
    btn.onclick = () => window.roll(btn.getAttribute('data-type')); 
});

document.getElementById('init-btn').onclick = () => { 
    const total = window.roll('d20', true); 
    set(ref(db, 'initiative/' + cName), { score: total, color: pColor, playerName: pName }); 
};

onValue(ref(db, 'online'), s => {
    const countEl = document.getElementById('online-count');
    if(countEl) countEl.innerText = s.numChildren();
});

onValue(ref(db, 'initiative'), s => {
    const list = document.getElementById('init-list');
    list.innerHTML = ""; const items = [];
    s.forEach(c => items.push({name: c.key, ...c.val()}));
    items.sort((a,b) => b.score - a.score).forEach(i => {
        const div = document.createElement('div'); div.className = 'tracker-item'; div.style.borderRightColor = i.color;
        div.innerHTML = `<span>${i.name}(${i.playerName || ''})</span><b>${i.score}</b>`; list.appendChild(div);
    });
});

const getRandomMsg = (msgs) => msgs[Math.floor(Math.random() * msgs.length)];

onChildAdded(query(ref(db, 'rolls'), limitToLast(20)), (snapshot) => {
    const data = snapshot.val();
    const time = new Date(data.ts || Date.now()).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const stage = document.getElementById('dice-visual');
    const body = document.getElementById('main-body');
    const log = document.getElementById('roll-log');

    if (!canAnimate) return;

    document.getElementById('empty-state').style.display = 'none';
    stage.style.display = 'block';
    stage.classList.remove('shake', 'crit-glow');
    body.classList.remove('screen-shake');

    if (!isMuted) {
        if (data.type === 'd20' && data.res === 20) {
            critSound.currentTime = 0; critSound.play().catch(()=>{});
            stage.classList.add('crit-glow'); body.classList.add('screen-shake');
        } else if (data.type === 'd20' && data.res === 1) {
            failSound.currentTime = 0; failSound.play().catch(()=>{});
        } else {
            rollSound.currentTime = 0; rollSound.play().catch(()=>{});
        }
    }

    stage.classList.add('shake');
    document.getElementById('dice-svg').innerHTML = diceShapes[data.type];
    document.getElementById('dice-svg').firstChild.style.fill = data.color;
    document.getElementById('result-text').innerText = "";

    const maxVal = parseInt(data.type.replace('d', ''));
    const total = data.res + (data.mod || 0);
    let flavorText = "";

    // לוגיקת המיקרו-קופי נשארת כפי שהייתה
    if (data.type === 'd20') {
        if (data.res === 20) flavorText = getRandomMsg(["האלים עצמם מריעים לך! 🌟", "פגיעה קטלנית!", "אגדה נולדה!"]);
        else if (data.res === 1) flavorText = getRandomMsg(["זה הולך לכאוב... מאוד. 💀", "אולי תפרוש בשיא?", "יום רע להיות הרפתקן."]);
        else if (total >= 25) flavorText = "מעשה גבורה שייכתב בדברי הימים!";
        else if (total >= 18) flavorText = "מכה מרשימה ביותר!";
        else if (total >= 12) flavorText = "תוצאה סולידית, לא רע.";
        else flavorText = "אולי כדאי לנסות שוב... בחיים הבאים.";
    } else {
        if (total >= maxVal + 5) flavorText = "מעבר לכל הציפיות! 🔥";
        else if (data.res === maxVal) flavorText = "מקסימום עוצמה!";
        else flavorText = "זה יעשה את העבודה.";
    }

    setTimeout(() => {
        stage.classList.remove('shake');
        document.getElementById('result-text').innerText = total;

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        
        const modeLabel = data.mode === 'adv' ? '<span style="color:#4e6e5d;">(ביתרון)</span>' : (data.mode === 'dis' ? '<span style="color:#e74c3c;">(בחיסרון)</span>' : '');
        const diceBreakdown = (data.mode !== 'normal' && data.mode) ? `<small style="opacity:0.6;"> [${data.res1}, ${data.res2}]</small>` : '';

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
