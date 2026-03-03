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

// טעינת הקבצים מהשרת שלך
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

document.getElementById('join-btn').onclick = () => {
    pName = document.getElementById('player-name').value.trim();
    cName = document.getElementById('char-name').value.trim();
    pColor = document.getElementById('user-color').value;
    if (!pName || !cName) return alert("מלא פרטים!");

    const prep = (s) => { s.play().then(() => { s.pause(); s.currentTime = 0; }).catch(()=>{}); };
    [rollSound, critSound, failSound].forEach(prep);

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    const userRef = ref(db, 'online/' + pName + '_' + cName);
    set(userRef, true);
    onDisconnect(userRef).remove();
    setTimeout(() => { canAnimate = true; }, 1000);
};

window.roll = (type, isInit = false) => {
    if (isCooldown && !isInit) return;
    if (!isInit) {
        isCooldown = true;
        const btns = document.querySelectorAll('.dice-btn');
        btns.forEach(b => b.disabled = true);
        setTimeout(() => { isCooldown = false; btns.forEach(b => b.disabled = false); }, 3000);
    }
    const res = Math.floor(Math.random() * parseInt(type.replace('d', ''))) + 1;
    const mod = parseInt(document.getElementById('mod-input').value) || 0;
    
    // שמירה לבסיס הנתונים עם שמות שמתאימים ללוג
    push(ref(db, 'rolls'), { 
        pName: pName, 
        cName: cName, 
        type: type, 
        res: res, 
        mod: mod, 
        color: pColor,
        ts: Date.now() // הוספת חותמת זמן לחישוב שעה
    });
    return res + mod;
};

document.getElementById('mute-btn').onclick = () => { 
    isMuted = !isMuted; 
    document.getElementById('mute-btn').innerText = isMuted ? "🔊 הפעל" : "🔇 השתק"; 
};

document.getElementById('reset-init-btn').onclick = () => { if(confirm("לאפס יוזמה?")) remove(ref(db, 'initiative')); };
document.querySelectorAll('.dice-btn').forEach(btn => { btn.onclick = () => window.roll(btn.getAttribute('data-type')); });
document.getElementById('init-btn').onclick = () => { const total = window.roll('d20', true); set(ref(db, 'initiative/' + cName), { score: total, color: pColor, playerName: pName }); };

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

onChildAdded(query(ref(db, 'rolls'), limitToLast(20)), (snapshot) => {
    const data = snapshot.val();
    const time = new Date(data.ts || Date.now()).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const stage = document.getElementById('dice-visual');
    const body = document.getElementById('main-body');
    const emptyState = document.getElementById('empty-state');
    const log = document.getElementById('roll-log');

    if (!canAnimate) return;

    emptyState.style.display = 'none';
    stage.style.display = 'block';
    stage.classList.remove('shake', 'crit-glow');
    body.classList.remove('screen-shake');

    // ניהול סאונד ואפקטים
    if (!isMuted) {
        if (data.type === 'd20' && data.res === 20) {
            critSound.currentTime = 0;
            critSound.play().catch(()=>{});
            stage.classList.add('crit-glow'); 
            body.classList.add('screen-shake');
        } else if (data.type === 'd20' && data.res === 1) {
            failSound.currentTime = 0;
            failSound.play().catch(()=>{});
        } else {
            rollSound.currentTime = 0;
            rollSound.play().catch(()=>{});
        }
    }

    stage.classList.add('shake');
    document.getElementById('dice-svg').innerHTML = diceShapes[data.type];
    document.getElementById('dice-svg').firstChild.style.fill = data.color;
    document.getElementById('result-text').innerText = "";

    // מנוע המיקרו-קופי
    const maxVal = parseInt(data.type.replace('d', ''));
    const total = data.res + (data.mod || 0);
    let flavorText = "";

    if (data.type === 'd20') {
        if (data.res === 20) flavorText = "האלים עצמם לא יכלו לקוות לטוב יותר! 🌟";
        else if (data.res === 1) flavorText = "זה הולך לכאוב... מאוד. 💀";
        else if (total >= 25) flavorText = "מעשה גבורה שייכתב בדברי הימים!";
        else if (total >= 15) flavorText = "זה טוב, אבל האם זה טוב מספיק?";
        else if (total >= 10) flavorText = "תוצאה סולידית, לא רע בכלל.";
        else flavorText = "אולי כדאי לנסות שוב... בחיים הבאים.";
    } else {
        if (total >= maxVal + 5) flavorText = "מעבר לכל הציפיות! כוח מתפרץ!";
        else if (data.res === maxVal) flavorText = "מקסימום עוצמה! מכה מדויקת.";
        else if (total > maxVal / 2) flavorText = "נחמד, זה בטח יזיז משהו.";
        else flavorText = "היה עדיף להישאר במיטה היום.";
    }

    setTimeout(() => {
        stage.classList.remove('shake');
        document.getElementById('result-text').innerText = total;

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `
            <div style="margin-bottom: 12px; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); border-radius: 6px;">
                <span style="color: #aaa; font-size: 11px;">[${time}]</span> 
                <strong style="color: var(--primary);">${data.cName || 'גיבור'}</strong> 
                <span style="font-size: 12px;">(${data.pName || 'שחקן'})</span><br>
                הטיל <strong style="color: #fff;">${data.type.toUpperCase()}</strong> וקיבל 
                <span style="color: ${data.res === 20 ? '#f1c40f' : (data.res === 1 ? '#e74c3c' : '#fff')}; font-weight: bold; font-size: 1.1em;">
                    ${data.res === 20 ? '20 טבעי!' : data.res}
                </span>
                <small style="opacity: 0.7;">(${data.res}${data.mod >= 0 ? '+' : ''}${data.mod})</small><br>
                <i style="color: var(--accent); font-size: 13px; display: block; margin-top: 4px;">"${flavorText}"</i>
            </div>
        `;

        log.insertBefore(entry, log.firstChild);
        if (log.children.length > 20) log.removeChild(log.lastChild);
    }, 600);
});
