// firebaseService.js - Database and Authentication communication management
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, set, onDisconnect, onValue, remove, query, limitToLast, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { firebaseConfig } from "./constants.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// --- Room Namespacing ---
let activeRoom = 'public';
export function setRoom(roomCode) {
    activeRoom = roomCode || 'public';
}

// ==========================================
// User Authentication & Vault
// ==========================================
export function loginWithGoogle() { return signInWithPopup(auth, googleProvider); }
export function logoutUser() { return signOut(auth); }
export function listenToAuthState(callback) { onAuthStateChanged(auth, (user) => callback(user)); }
export function saveCharacterToVault(uid, charData) {
    const newCharRef = push(ref(db, `users/${uid}/characters`));
    return set(newCharRef, charData);
}
export function listenToUserCharacters(uid, callback) {
    onValue(ref(db, `users/${uid}/characters`), (snapshot) => { callback(snapshot.val()); });
}

// ==========================================
// Game Room Functions
// ==========================================
export async function joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, stats) {
    const playerRef = ref(db, `rooms/${activeRoom}/players/${cName}`);
    const existing = await get(playerRef);
    let preservedHp = null, preservedStatuses = null;
    if (existing.exists()) {
        const existingData = existing.val();
        preservedHp = existingData.hp ?? null;
        preservedStatuses = existingData.statuses ?? null;
    }
    const dataToSet = { pName, pColor, userRole, portrait: charPortrait, score: 0, ...stats };
    if (preservedHp !== null) dataToSet.hp = preservedHp;
    if (preservedStatuses !== null) dataToSet.statuses = preservedStatuses;
    set(playerRef, dataToSet);
    if (userRole !== 'npc') {
        onDisconnect(playerRef).remove();
        const onlineRef = ref(db, `rooms/${activeRoom}/online/${pName}_${cName}`);
        set(onlineRef, { role: userRole });
        onDisconnect(onlineRef).remove();
    }
}

export function saveRollToDB(rollData) { push(ref(db, `rooms/${activeRoom}/rolls`), rollData); }
export async function getPlayerData(cName) {
    const snap = await get(ref(db, `rooms/${activeRoom}/players/${cName}`));
    return snap.val();
}
export function updatePlayerHPInDB(cName, newHp) { update(ref(db, `rooms/${activeRoom}/players/${cName}`), { hp: newHp }); }
export function updatePlayerStatusesInDB(cName, statuses) { update(ref(db, `rooms/${activeRoom}/players/${cName}`), { statuses }); }
export function updatePlayerVisibilityInDB(cName, isHidden) { update(ref(db, `rooms/${activeRoom}/players/${cName}`), { isHidden }); }

export async function resetInitiativeInDB() {
    remove(ref(db, `rooms/${activeRoom}/initiative`));
    set(ref(db, `rooms/${activeRoom}/active_turn`), null);
    set(ref(db, `rooms/${activeRoom}/round_number`), null);
    const snap = await get(ref(db, `rooms/${activeRoom}/players`));
    const players = snap.val();
    if (players) {
        Object.keys(players).forEach(n => update(ref(db, `rooms/${activeRoom}/players/${n}`), { score: 0 }));
    }
}

export async function getCombatStatus() {
    const snap = await get(ref(db, `rooms/${activeRoom}/combat_active`));
    return snap.val() || false;
}
export function setCombatStatus(isActive) { set(ref(db, `rooms/${activeRoom}/combat_active`), isActive); }
export function setPlayerInitiativeInDB(cName, pName, score, pColor) {
    update(ref(db, `rooms/${activeRoom}/players/${cName}`), { score });
    set(ref(db, `rooms/${activeRoom}/initiative/${cName}`), { score, color: pColor, playerName: pName });
}
export function removePlayerFromDB(cName) {
    remove(ref(db, `rooms/${activeRoom}/players/${cName}`));
    remove(ref(db, `rooms/${activeRoom}/initiative/${cName}`));
}

// ==========================================
// Sprint 3 — Active Turn Tracker
// ==========================================
export function setActiveTurn(index, roundNumber) {
    set(ref(db, `rooms/${activeRoom}/active_turn`), index);
    if (roundNumber !== undefined) set(ref(db, `rooms/${activeRoom}/round_number`), roundNumber);
}
export function listenToActiveTurn(callback) {
    onValue(ref(db, `rooms/${activeRoom}/active_turn`), (snap) => callback(snap.val()));
}
export function listenToRoundNumber(callback) {
    onValue(ref(db, `rooms/${activeRoom}/round_number`), (snap) => callback(snap.val() || 0));
}

// ==========================================
// Listeners
// ==========================================
export function listenToCombatStatus(callback) { onValue(ref(db, `rooms/${activeRoom}/combat_active`), (snap) => callback(snap.val())); }
export function listenToPlayerInitiative(cName, callback) { onValue(ref(db, `rooms/${activeRoom}/initiative/${cName}`), (snap) => callback(snap.exists()), { onlyOnce: true }); }
export function listenToPlayers(callback) { onValue(ref(db, `rooms/${activeRoom}/players`), (snapshot) => callback(snapshot.val())); }
export function listenToNewRolls(callback) { onChildAdded(query(ref(db, `rooms/${activeRoom}/rolls`), limitToLast(1)), (snapshot) => callback(snapshot.val())); }
export async function deleteCharacterFromVault(uid, charId) {
    await remove(ref(getDatabase(), `users/${uid}/characters/${charId}`));
}
export async function updateCharacterInVault(uid, charId, charData) {
    await update(ref(getDatabase(), `users/${uid}/characters/${charId}`), charData);
}
