// firebaseService.js v120
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, set, onDisconnect, onValue, remove, query, limitToLast, orderByKey, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { firebaseConfig } from "./constants.js";

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

let activeRoom = 'public';
export function setRoom(roomCode) { activeRoom = roomCode || 'public'; }

// ==========================================
// Auth & Vault
// ==========================================
export function loginWithGoogle()              { return signInWithPopup(auth, googleProvider); }
export function logoutUser()                   { return signOut(auth); }
export function listenToAuthState(callback)    { onAuthStateChanged(auth, user => callback(user)); }
export function saveCharacterToVault(uid, d)   { return set(push(ref(db, `users/${uid}/characters`)), d); }
export function listenToUserCharacters(uid, cb){ onValue(ref(db, `users/${uid}/characters`), s => cb(s.val())); }

// ==========================================
// Game Room
// ==========================================
export async function joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, stats) {
    const playerRef = ref(db, `rooms/${activeRoom}/players/${cName}`);
    const existing  = await get(playerRef);
    let preservedHp = null, preservedStatuses = null;
    if (existing.exists()) {
        preservedHp       = existing.val().hp      ?? null;
        preservedStatuses = existing.val().statuses ?? null;
    }
    const data = { pName, pColor, userRole, portrait: charPortrait, score: 0, ...stats };
    if (preservedHp       !== null) data.hp       = preservedHp;
    if (preservedStatuses !== null) data.statuses = preservedStatuses;
    set(playerRef, data);
    if (userRole !== 'npc') {
        onDisconnect(playerRef).remove();
        const onlineRef = ref(db, `rooms/${activeRoom}/online/${pName}_${cName}`);
        set(onlineRef, { role: userRole });
        onDisconnect(onlineRef).remove();
    }
}

export function saveRollToDB(rollData)              { push(ref(db, `rooms/${activeRoom}/rolls`), rollData); }
export async function getPlayerData(cName)          { return (await get(ref(db, `rooms/${activeRoom}/players/${cName}`))).val(); }
export function updatePlayerHPInDB(cName, hp)       { update(ref(db, `rooms/${activeRoom}/players/${cName}`), { hp }); }
export function updatePlayerStatusesInDB(cName, st) { update(ref(db, `rooms/${activeRoom}/players/${cName}`), { statuses: st }); }
export function updatePlayerVisibilityInDB(cName,v) { update(ref(db, `rooms/${activeRoom}/players/${cName}`), { isHidden: v }); }
export function removePlayerFromDB(cName)           { remove(ref(db, `rooms/${activeRoom}/players/${cName}`)); remove(ref(db, `rooms/${activeRoom}/initiative/${cName}`)); }

export async function resetInitiativeInDB() {
    remove(ref(db, `rooms/${activeRoom}/initiative`));
    set(ref(db, `rooms/${activeRoom}/active_turn`),   null);
    set(ref(db, `rooms/${activeRoom}/round_number`),  null);
    const snap = await get(ref(db, `rooms/${activeRoom}/players`));
    if (snap.val()) Object.keys(snap.val()).forEach(n => update(ref(db, `rooms/${activeRoom}/players/${n}`), { score: 0 }));
}

export async function getCombatStatus() { return (await get(ref(db, `rooms/${activeRoom}/combat_active`))).val() || false; }
export function setCombatStatus(v)      { set(ref(db, `rooms/${activeRoom}/combat_active`), v); }

export function setPlayerInitiativeInDB(cName, pName, score, pColor) {
    update(ref(db, `rooms/${activeRoom}/players/${cName}`), { score });
    set(ref(db, `rooms/${activeRoom}/initiative/${cName}`), { score, color: pColor, playerName: pName });
}

// ==========================================
// Sprint 3 — Turn Tracker
// ==========================================
export function setActiveTurn(index, roundNumber) {
    set(ref(db, `rooms/${activeRoom}/active_turn`), index);
    if (roundNumber !== undefined) set(ref(db, `rooms/${activeRoom}/round_number`), roundNumber);
}
export function listenToActiveTurn(cb)  { onValue(ref(db, `rooms/${activeRoom}/active_turn`),  s => cb(s.val())); }
export function listenToRoundNumber(cb) { onValue(ref(db, `rooms/${activeRoom}/round_number`), s => cb(s.val() || 0)); }

// ==========================================
// Sprint 4 — Roll Log Persistence
// ==========================================
export async function loadRecentRolls(n = 20) {
    const snap = await get(query(ref(db, `rooms/${activeRoom}/rolls`), limitToLast(n)));
    if (!snap.exists()) return [];
    // Firebase returns object keyed by push-id; sort by key (chronological)
    return Object.entries(snap.val())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([, v]) => v);
}

// ==========================================
// Listeners
// ==========================================
export function listenToCombatStatus(cb)              { onValue(ref(db, `rooms/${activeRoom}/combat_active`), s => cb(s.val())); }
export function listenToPlayerInitiative(cName, cb)   { onValue(ref(db, `rooms/${activeRoom}/initiative/${cName}`), s => cb(s.exists()), { onlyOnce: true }); }
export function listenToPlayers(cb)                   { onValue(ref(db, `rooms/${activeRoom}/players`),       s => cb(s.val())); }
export function listenToNewRolls(cb)                  { onChildAdded(query(ref(db, `rooms/${activeRoom}/rolls`), limitToLast(1)), s => cb(s.val())); }

export async function deleteCharacterFromVault(uid, id)      { await remove(ref(getDatabase(), `users/${uid}/characters/${id}`)); }
export async function updateCharacterInVault(uid, id, data)  { await update(ref(getDatabase(),  `users/${uid}/characters/${id}`), data); }

// ==========================================
// Sprint 5 — Death Saves & Concentration
// ==========================================
export function updateDeathSavesInDB(cName, saves) {
    update(ref(db, `rooms/${activeRoom}/players/${cName}`), { deathSaves: saves });
}
export function updateConcentrationInDB(cName, isConcentrating) {
    update(ref(db, `rooms/${activeRoom}/players/${cName}`), { concentrating: isConcentrating });
}

// ==========================================
// Sprint 6 — Spell Slots
// ==========================================
export function updateSpellSlotsInDB(cName, slots) {
    // slots = { max: {1:4,2:3,...}, used: {1:1,2:0,...} }
    update(ref(db, `rooms/${activeRoom}/players/${cName}`), { spellSlots: slots });
}
export function restoreAllSpellSlotsInDB(cName, maxSlots) {
    // Restore used slots back to 0 (long rest)
    update(ref(db, `rooms/${activeRoom}/players/${cName}`), { 'spellSlots/used': {} });
}

// ==========================================
// Sprint 7 — Tactical Battlefield Firebase
// ==========================================
export function listenMapCfg(room, cb) {
    return onValue(ref(db, `rooms/${room}/map/config`), s => cb(s.val()));
}
export function setMapCfg(room, cfg) {
    set(ref(db, `rooms/${room}/map/config`), cfg);
}
export function listenMapTokens(room, cb) {
    return onValue(ref(db, `rooms/${room}/map/tokens`), s => cb(s.val()));
}
export function moveMapToken(room, cName, gx, gy, usedMv) {
    update(ref(db, `rooms/${room}/map/tokens/${cName}`), { gx, gy, usedMv: usedMv||0 });
}
export function resetTokenMv(room, cName) {
    update(ref(db, `rooms/${room}/map/tokens/${cName}`), { usedMv: 0 });
}
export function removeMapToken(room, cName) {
    remove(ref(db, `rooms/${room}/map/tokens/${cName}`));
}
export function listenFog(room, scene, cb) {
    return onValue(ref(db, `rooms/${room}/scenes/${scene}/fog`), s => cb(s.val()));
}
export function revealFogCells(room, scene, cells) {
    const updates = {};
    Object.keys(cells).forEach(k => { updates[`rooms/${room}/scenes/${scene}/fog/${k}`] = true; });
    update(ref(db), updates);
}
export function hideFogCell(room, scene, key) {
    remove(ref(db, `rooms/${room}/scenes/${scene}/fog/${key}`));
}
export function resetFog(room, scene) {
    remove(ref(db, `rooms/${room}/scenes/${scene}/fog`));
}
export function listenObstacles(room, scene, cb) {
    return onValue(ref(db, `rooms/${room}/scenes/${scene}/obstacles`), s => cb(s.val()));
}
export function setObstacle(room, scene, key, val) {
    if (val) set(ref(db, `rooms/${room}/scenes/${scene}/obstacles/${key}`), true);
    else remove(ref(db, `rooms/${room}/scenes/${scene}/obstacles/${key}`));
}
export function listenTriggers(room, scene, cb) {
    return onValue(ref(db, `rooms/${room}/scenes/${scene}/triggers`), s => cb(s.val()));
}
export function setTrigger(room, scene, key, val) {
    if (val) set(ref(db, `rooms/${room}/scenes/${scene}/triggers/${key}`), val);
    else remove(ref(db, `rooms/${room}/scenes/${scene}/triggers/${key}`));
}
export function fireTrigger(room, scene, key) {
    update(ref(db, `rooms/${room}/scenes/${scene}/triggers/${key}`), { fired: true });
}
export function listenActiveScene(room, cb) {
    return onValue(ref(db, `rooms/${room}/map/activeScene`), s => cb(s.val()));
}
export function setActiveScene(room, sceneId) {
    set(ref(db, `rooms/${room}/map/activeScene`), sceneId);
}
export function saveScene(room, sceneId, data) {
    set(ref(db, `rooms/${room}/scenes/${sceneId}/meta`), { name: data.name, ts: Date.now() });
    if (data.config) set(ref(db, `rooms/${room}/scenes/${sceneId}/config`), data.config);
}
export function listenScenes(room, cb) {
    return onValue(ref(db, `rooms/${room}/scenes`), s => cb(s.val()));
}
export function getActiveRoom() { return activeRoom; }
