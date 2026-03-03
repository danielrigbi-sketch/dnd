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
let pName = "", cName = "", pColor = "#e74c3c", isMuted = false, isCooldown = false, canAnimate = false;
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

document.getElementById('join-btn').onclick = () => {
    pName = document.getElementById('player-name').value.trim();
    cName = document.getElementById('char-name').value.trim();
    pColor = document.getElementById('user-color').value;
    if (!pName || !cName) return alert("מלא פרטים!");

    const prep = (s) => { s.play().then(() => { s.pause(); s.currentTime = 0; }).catch(()=>{}); };
    [rollSound, critSound, failSound].forEach(prep);

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    updateModeUI();

    const userRef = ref(db, 'online/' + pName + '_' + cName);
    set(userRef, true);
    onDisconnect(userRef).remove();
    setTimeout(() => { canAnimate = true; }, 1000);
};

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
    
    const rollData = { 
        pName: pName, cName: cName, type, res, mod, 
        color: pColor, mode: currentMode, ts: Date.now()
    };

    // הוספת תוצאות נוספות רק אם הן קיימות באמת (מונע שגיאת undefined)
    if (res1 !== null) rollData.res1 = res1;
    if (res2 !== null) rollData.res2 = res2;

    push(ref(db, 'rolls'), rollData);

    if (!isInit) {
        activeMode = 'normal';
        updateModeUI();
    }
    return res + mod;
};

document.getElementById('adv-btn').onclick = () => { activeMode = (activeMode === 'adv') ? 'normal' : 'adv'; updateModeUI(); };
document.getElementById('dis-btn').onclick = () => { activeMode = (activeMode === 'dis') ? 'normal' : 'dis'; updateModeUI(); };
document.getElementById('mute-btn').onclick = () => { isMuted = !isMuted; document.getElementById('mute-btn').innerText = isMuted ? "🔊 הפעל" : "🔇 השתק"; };
document.getElementById('reset-init-btn').onclick = () => { if(confirm("לאפס יוזמה?")) remove(ref(db, 'initiative')); };
document.querySelectorAll('.dice-btn').forEach(btn => { btn.onclick = () => window.roll(btn.getAttribute('data-type')); });
document.getElementById('init-btn').onclick = () => { 
    const total = window.roll('d20', true); 
    set(ref(db, 'initiative/' + cName), { score: total, color: pColor, playerName: pName }); 
};

// תיקון שגיאת numChildren
onValue(ref(db, 'online'), s => {
    const countEl = document.getElementById('online-count');
    if(countEl) {
        let count = 0;
        s.forEach(() => { count++; }); // דרך בטוחה לספור ילדים
        countEl.innerText = count;
    }
});

onValue(ref(db, 'initiative'), s => {
    const list = document.getElementById('init-list');
    if(!list) return;
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
    document.getElementById('dice-svg').innerHTML = diceShapes[data.type] || diceShapes.d20;
    document.getElementById('dice-svg').firstChild.style.fill = data.color;
    document.getElementById('result-text').innerText = "";

    const maxVal = parseInt(data.type.replace('d', '')) || 20;
    const total = (data.res || 0) + (data.mod || 0);
    let flavorText = "הטלה מעניינת...";

    if (data.type === 'd20') {
        if (data.res === 20) flavorText = getRandomMsg(["האלים מריעים לך! 🌟", "פגיעה קטלנית!", "אגדה נולדה!"]);
        else if (data.res === 1) flavorText = getRandomMsg(["זה הולך לכאוב... 💀", "יום רע להיות הרפתקן.", "החרב החליקה?"]);
        else if (total >= 18) flavorText = "מכה מרשימה ביותר!";
        else flavorText = "זה יעשה את העבודה.";
    }

    setTimeout(() => {
        stage.classList.remove('shake');
        document.getElementById('result-text').innerText = total;

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        const modeLabel = data.mode === 'adv' ? '<span style="color:#4e6e5d;">(ביתרון)</span>' : (data.mode === 'dis' ? '<span style="color:#e74c3c;">(בחיסרון)</span>' : '');
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
