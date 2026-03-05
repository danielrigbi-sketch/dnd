// firebaseService.js - ניהול התקשורת מול מסד הנתונים

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, set, onDisconnect, onValue, remove, query, limitToLast, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { firebaseConfig } from "./constants.js";

// אתחול Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================
// פונקציות כתיבה (שליחת נתונים למסד)
// ==========================================

export function joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, stats) {
    const playerRef = ref(db, 'players/' + cName);
    const dataToSet = { pName, pColor, userRole, portrait: charPortrait, score: 0, ...stats };
    set(playerRef, dataToSet);
    
    // מפלצות (NPC) נוצרות על ידי השה"מ, ולכן לא נרצה שיימחקו אם הוא מרפרש את העמוד
    if (userRole !== 'npc') {
        onDisconnect(playerRef).remove();
    }

    if (userRole !== 'npc') {
        const onlineRef = ref(db, 'online/' + pName + '_' + cName);
        set(onlineRef, { role: userRole });
        onDisconnect(onlineRef).remove();
    }
}

export function saveRollToDB(rollData) {
    push(ref(db, 'rolls'), rollData);
}

export async function getPlayerData(cName) {
    const snap = await get(ref(db, 'players/' + cName));
    return snap.val();
}

export function updatePlayerHPInDB(cName, newHp) {
    update(ref(db, 'players/' + cName), { hp: newHp });
}

export function updatePlayerStatusesInDB(cName, statuses) {
    update(ref(db, 'players/' + cName), { statuses });
}

export async function resetInitiativeInDB() {
    remove(ref(db, 'initiative'));
    const snap = await get(ref(db, 'players'));
    const players = snap.val();
    if (players) {
        Object.keys(players).forEach(n => update(ref(db, 'players/' + n), { score: 0 }));
    }
}

export async function getCombatStatus() {
    const snap = await get(ref(db, 'combat_active'));
    return snap.val() || false;
}

export function setCombatStatus(isActive) {
    set(ref(db, 'combat_active'), isActive);
}

export function setPlayerInitiativeInDB(cName, pName, score, pColor) {
    update(ref(db, 'players/' + cName), { score: score });
    set(ref(db, 'initiative/' + cName), { score: score, color: pColor, playerName: pName });
}

// פונקציה חדשה: מחיקת שחקן/מפלצת מהמסד
export function removePlayerFromDB(cName) {
    remove(ref(db, 'players/' + cName));
    remove(ref(db, 'initiative/' + cName));
}

// ==========================================
// פונקציות האזנה (קריאת נתונים בזמן אמת)
// ==========================================

export function listenToCombatStatus(callback) {
    onValue(ref(db, 'combat_active'), (snap) => callback(snap.val()));
}

export function listenToPlayerInitiative(cName, callback) {
    onValue(ref(db, 'initiative/' + cName), (snap) => callback(snap.exists()), { onlyOnce: true });
}

export function listenToPlayers(callback) {
    onValue(ref(db, 'players'), (snapshot) => callback(snapshot.val()));
}

export function listenToNewRolls(callback) {
    onChildAdded(query(ref(db, 'rolls'), limitToLast(1)), (snapshot) => callback(snapshot.val()));
}
