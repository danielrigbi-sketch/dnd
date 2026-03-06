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
// ── Security helpers ──────────────────────────────────────────────────
// Sanitise character name for use as a Firebase RTDB key.
// Firebase keys must not contain: . # $ [ ] /
export function sanitizeCName(name) {
    if (!name) return 'unknown';
    return String(name)
        .replace(/\./g, '_')
        .replace(/[#$\[\]\/]/g, '_')
        .trim() || 'unknown';
}

// Returns the current Firebase auth UID (null if not signed in).
export function getAuthUid() {
    return auth.currentUser?.uid || null;
}

// DM registers their uid so server-side rules can verify DM operations.
export function setDmUid(roomCode, uid) {
    if (!roomCode || !uid) return;
    set(ref(db, `rooms/${roomCode}/dm_uid`), uid);
}


export function loginWithGoogle()              { return signInWithPopup(auth, googleProvider); }
export function logoutUser()                   { return signOut(auth); }
export function listenToAuthState(callback)    { onAuthStateChanged(auth, user => callback(user)); }
export function saveCharacterToVault(uid, d)   { return set(push(ref(db, `users/${uid}/characters`)), d); }
export function listenToUserCharacters(uid, cb){ onValue(ref(db, `users/${uid}/characters`), s => cb(s.val())); }

// ==========================================
// Game Room
// ==========================================
export async function joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, stats) {
    cName = sanitizeCName(cName);
    const playerRef = ref(db, `rooms/${activeRoom}/players/${cName}`);
    const existing  = await get(playerRef);
    let preservedHp = null, preservedStatuses = null;
    if (existing.exists()) {
        preservedHp       = existing.val().hp      ?? null;
        preservedStatuses = existing.val().statuses ?? null;
    }
    const authUid = auth.currentUser?.uid || null;
    const data = { pName, pColor, userRole, portrait: charPortrait, score: 0, authUid, ...stats };
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
export function updatePlayerHPInDB(cName, hp)       { update(ref(db, `rooms/${activeRoom}/players/${sanitizeCName(cName)}`), { hp }); }
export function updatePlayerStatusesInDB(cName, st) { update(ref(db, `rooms/${activeRoom}/players/${sanitizeCName(cName)}`), { statuses: st }); }
export function updatePlayerVisibilityInDB(cName,v) { update(ref(db, `rooms/${activeRoom}/players/${sanitizeCName(cName)}`), { isHidden: v }); }
export function removePlayerFromDB(cName)           { const k=sanitizeCName(cName); remove(ref(db, `rooms/${activeRoom}/players/${k}`)); remove(ref(db, `rooms/${activeRoom}/initiative/${k}`)); }

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
    const k = sanitizeCName(cName);
    update(ref(db, `rooms/${activeRoom}/players/${k}`), { score });
    set(ref(db, `rooms/${activeRoom}/initiative/${k}`), { score, color: pColor, playerName: pName });
}

// ==========================================
export function setActiveTurn(index, roundNumber) {
    set(ref(db, `rooms/${activeRoom}/active_turn`), index);
    if (roundNumber !== undefined) set(ref(db, `rooms/${activeRoom}/round_number`), roundNumber);
}
export function listenToActiveTurn(cb)  { onValue(ref(db, `rooms/${activeRoom}/active_turn`),  s => cb(s.val())); }
export function listenToRoundNumber(cb) { onValue(ref(db, `rooms/${activeRoom}/round_number`), s => cb(s.val() || 0)); }

// ==========================================
export async function loadRecentRolls(n = 20) {
    const snap = await get(query(ref(db, `rooms/${activeRoom}/rolls`), limitToLast(n)));
    if (!snap.exists()) return [];
    // Firebase returns object keyed by push-id; sort by key (chronological)
    return Object.entries(snap.val())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([, v]) => v);
}

// Purge roll log: keep only the most recent MAX_ROLLS entries.
// Call once on game start to prevent unbounded growth.
const MAX_ROLLS = 200;
export async function purgeOldRolls() {
    try {
        const rollsRef = ref(db, `rooms/${activeRoom}/rolls`);
        const snap = await get(query(rollsRef, orderByKey()));
        if (!snap.exists()) return;
        const keys = Object.keys(snap.val());
        if (keys.length <= MAX_ROLLS) return;
        const toDelete = keys.slice(0, keys.length - MAX_ROLLS);
        const deletions = toDelete.map(k => remove(ref(db, `rooms/${activeRoom}/rolls/${k}`)));
        await Promise.all(deletions);
        console.info(`[CritRoll] Purged ${toDelete.length} old roll log entries.`);
    } catch (e) {
        console.warn('[CritRoll] purgeOldRolls failed:', e);
    }
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
export function updateDeathSavesInDB(cName, saves) {
    update(ref(db, `rooms/${activeRoom}/players/${sanitizeCName(cName)}`), { deathSaves: saves });
}
export function updateConcentrationInDB(cName, isConcentrating) {
    update(ref(db, `rooms/${activeRoom}/players/${sanitizeCName(cName)}`), { concentrating: isConcentrating });
}

// ==========================================
export function updateSpellSlotsInDB(cName, slots) {
    // slots = { max: {1:4,2:3,...}, used: {1:1,2:0,...} }
    update(ref(db, `rooms/${activeRoom}/players/${sanitizeCName(cName)}`), { spellSlots: slots });
}
export function restoreAllSpellSlotsInDB(cName, maxSlots) {
    // Restore used slots back to 0 (long rest)
    update(ref(db, `rooms/${activeRoom}/players/${sanitizeCName(cName)}`), { 'spellSlots/used': {} });
}

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

// ==========================================
export async function saveSceneToVault(uid, sceneId, data) {
    await set(ref(db, `users/${uid}/scenes/${sceneId}`), data);
}
export function listenToUserScenes(uid, cb) {
    return onValue(ref(db, `users/${uid}/scenes`), s => cb(s.val()));
}
export async function getUserScenesOnce(uid) {
    const snap = await get(ref(db, `users/${uid}/scenes`));
    return snap.val();
}
export async function deleteSceneFromVault(uid, sceneId) {
    await remove(ref(db, `users/${uid}/scenes/${sceneId}`));
}

// Atmosphere sync (room-wide)
export function setAtmosphere(room, atmosphere) {
    set(ref(db, `rooms/${room}/map/atmosphere`), atmosphere);
}
export function listenAtmosphere(room, cb) {
    return onValue(ref(db, `rooms/${room}/map/atmosphere`), s => cb(s.val()));
}
