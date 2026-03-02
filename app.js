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

// הגדרת שלושת הסאונדים מהקבצים שהעלית
const rollSound = new Audio('./dice.mp3');
const critSound = new Audio('./crit.mp3');
const failSound = new Audio('./fail.mp3'); // הסאונד החדש שהוספת
rollSound.preload = 'auto';
critSound.preload = 'auto';
failSound.preload = 'auto';

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

    // "דריכת" כל הסאונדים (כולל ה-fail) לעקיפת חסימות Autoplay
    const unlock = (s) => { s.play().then(() => { s.pause(); s.currentTime = 0; }).catch(()=>{}); };
    unlock(rollSound);
    unlock(critSound);
    unlock(failSound);

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
    push(ref(db, 'rolls'), { 
        player: pName, char: cName, type, res, mod, color: pColor,
        time: new Date().toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit' })
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

onValue(ref(db, 'online'), s => document.getElementById('online-count').innerText = s.numChildren());
onValue(ref(db, 'initiative'), s => {
