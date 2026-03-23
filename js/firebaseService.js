// firebaseService.js v130  (S11: getActiveRoom+pruneOrphanTokens, S14: uploadPortrait)
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref, push, onChildAdded, onChildRemoved, set, onDisconnect, onValue, remove, query, limitToLast, orderByKey, orderByChild, update, get, off } from "firebase/database";
import { firebaseConfig } from "./constants.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app); // internal only — do not re-export raw db (ARCH-5)
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


// Use popup everywhere (iOS 16.4+ and Android Chrome support it).
// If popup is blocked → fallback to redirect.
export async function loginWithGoogle() {
    try {
        return await signInWithPopup(auth, googleProvider);
    } catch (err) {
        // popup blocked or closed — fall back to redirect flow
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
            return signInWithRedirect(auth, googleProvider);
        }
        throw err;
    }
}
// Always call on startup to pick up any pending redirect result.
export async function checkRedirectResult() {
    try {
        const result = await getRedirectResult(auth);
        return result; // null if no pending redirect
    } catch (err) {
        console.warn('[Auth] getRedirectResult error:', err.code);
        return null;
    }
}
export function logoutUser()                   { return signOut(auth); }
export function listenToAuthState(callback)    { onAuthStateChanged(auth, user => callback(user)); }
export function patchUser(uid, data)           { return update(ref(db, `users/${uid}`), data); }
export function saveCharacterToVault(uid, d)   { return set(push(ref(db, `users/${uid}/characters`)), d); }
export function listenToUserCharacters(uid, cb){ onValue(ref(db, `users/${uid}/characters`), s => cb(s.val())); }

// ==========================================
// Game Room
// ==========================================
export async function joinPlayerToDB(cName, pName, pColor, userRole, charPortrait, stats, isCampaign = false) {
    cName = sanitizeCName(cName);
    const playerRef = ref(db, `rooms/${activeRoom}/players/${cName}`);
    const existing  = await get(playerRef);
    const authUid = auth.currentUser?.uid || null;

    if (isCampaign && existing.exists()) {
        // Campaign mode: preserve ALL existing state, only refresh connection fields
        await update(playerRef, { online: true, pName, pColor, portrait: charPortrait, authUid });
    } else {
        // Quick room: write fresh, but preserve hp/statuses if character is rejoining
        let preservedHp = null, preservedStatuses = null;
        if (existing.exists()) {
            preservedHp       = existing.val().hp      ?? null;
            preservedStatuses = existing.val().statuses ?? null;
        }
        const data = { pName, pColor, userRole, portrait: charPortrait, score: 0, authUid, ...stats };
        if (preservedHp       !== null) data.hp       = preservedHp;
        if (preservedStatuses !== null) data.statuses = preservedStatuses;
        if (isCampaign) data.online = true;
        set(playerRef, data);
    }

    if (userRole !== 'npc') {
        if (isCampaign) {
            // Campaign: mark offline on disconnect but keep all data
            onDisconnect(playerRef).update({ online: false });
        } else {
            onDisconnect(playerRef).remove();
        }
        const onlineRef = ref(db, `rooms/${activeRoom}/online/${pName}_${cName}`);
        set(onlineRef, { role: userRole });
        onDisconnect(onlineRef).remove();
    }
}

// ==========================================
// Campaign CRUD
// ==========================================

export async function createCampaign(campaignId, meta) {
    const fullMeta = { ...meta, created: Date.now(), lastSession: Date.now() };
    await set(ref(db, `campaigns/${campaignId}/meta`), fullMeta);
    // Store reference under DM's own user record so we can list without collection-level read
    await set(ref(db, `users/${meta.dmUid}/dmCampaigns/${campaignId}`), {
        name: meta.name, dmName: meta.dmName, lastSession: fullMeta.lastSession
    });
}

export async function getCampaignMeta(campaignId) {
    const snap = await get(ref(db, `campaigns/${campaignId}/meta`));
    return snap.val();
}

export function listenToCampaignMeta(campaignId, cb) {
    return onValue(ref(db, `campaigns/${campaignId}/meta`), s => cb(s.val()));
}

export async function isCampaignPlayer(campaignId, uid) {
    if (!uid) return false;
    const snap = await get(ref(db, `campaigns/${campaignId}/allowedPlayers/${uid}`));
    return snap.exists() && snap.val().approved === true;
}

export async function getCampaignPlayerData(campaignId, uid) {
    if (!uid) return null;
    const snap = await get(ref(db, `campaigns/${campaignId}/allowedPlayers/${uid}`));
    return snap.exists() ? snap.val() : null;
}

// Must be called from the PLAYER's own client — writes to their own users/ node.
// approveCampaignPlayer cannot do this because it runs on the DM's client (wrong auth UID).
export async function savePlayerCampaignIndex(campaignId, uid) {
    const [metaSnap, playerSnap] = await Promise.all([
        get(ref(db, `campaigns/${campaignId}/meta`)),
        get(ref(db, `campaigns/${campaignId}/allowedPlayers/${uid}`))
    ]);
    const meta   = metaSnap.val()   || {};
    const player = playerSnap.val() || {};
    await set(ref(db, `users/${uid}/playerCampaigns/${campaignId}`), {
        name: meta.name || campaignId, dmName: meta.dmName || '?',
        charName: player.charName || '', lastSession: meta.lastSession || Date.now()
    });
}

export async function requestCampaignAccess(campaignId, uid, playerName, charName) {
    await set(ref(db, `campaigns/${campaignId}/pendingRequests/${uid}`), {
        playerName, charName, requestedAt: Date.now()
    });
}

export async function hasPendingRequest(campaignId, uid) {
    const snap = await get(ref(db, `campaigns/${campaignId}/pendingRequests/${uid}`));
    return snap.exists();
}

export async function approveCampaignPlayer(campaignId, uid) {
    const [reqSnap, metaSnap] = await Promise.all([
        get(ref(db, `campaigns/${campaignId}/pendingRequests/${uid}`)),
        get(ref(db, `campaigns/${campaignId}/meta`))
    ]);
    const req  = reqSnap.val();
    const meta = metaSnap.val();
    if (!req) return;
    await set(ref(db, `campaigns/${campaignId}/allowedPlayers/${uid}`), {
        playerName: req.playerName, charName: req.charName, approved: true
    });
    await remove(ref(db, `campaigns/${campaignId}/pendingRequests/${uid}`));
    // Note: users/{uid}/playerCampaigns is written by the PLAYER's own client on approval
    // (in campaign.js _showWaitingScreen → listenToApprovalStatus callback)
    // Cannot be written here — Firebase rules block DM from writing to other users' nodes.
}

export async function denyCampaignRequest(campaignId, uid) {
    await remove(ref(db, `campaigns/${campaignId}/pendingRequests/${uid}`));
}

export async function isBannedFromCampaign(campaignId, uid) {
    if (!uid) return false;
    const snap = await get(ref(db, `campaigns/${campaignId}/bannedPlayers/${uid}`));
    return snap.exists();
}

export async function banCampaignPlayer(campaignId, uid) {
    // Read player data before removing
    const playerSnap = await get(ref(db, `campaigns/${campaignId}/allowedPlayers/${uid}`));
    const playerData = playerSnap.val() || {};
    // Write to ban list
    await set(ref(db, `campaigns/${campaignId}/bannedPlayers/${uid}`), {
        playerName: playerData.playerName || 'Unknown',
        charName: playerData.charName || '',
        bannedAt: Date.now(),
    });
    // Then kick (removes from allowedPlayers, room, initiative, tokens)
    await kickCampaignPlayer(campaignId, uid);
}

export async function unbanCampaignPlayer(campaignId, uid) {
    await remove(ref(db, `campaigns/${campaignId}/bannedPlayers/${uid}`));
}

export async function kickCampaignPlayer(campaignId, uid) {
    // Get the player's charName so we can remove them from the room too
    const playerSnap = await get(ref(db, `campaigns/${campaignId}/allowedPlayers/${uid}`));
    const charName = playerSnap.val()?.charName;

    await remove(ref(db, `campaigns/${campaignId}/allowedPlayers/${uid}`));

    // Remove from room players list + initiative + map tokens (campaign room ID = campaign ID)
    if (charName) {
        const safeName = sanitizeCName(charName);
        await remove(ref(db, `rooms/${campaignId}/players/${safeName}`)).catch(() => {});
        await remove(ref(db, `rooms/${campaignId}/initiative/${safeName}`)).catch(() => {});
        await remove(ref(db, `rooms/${campaignId}/map/tokens/${safeName}`)).catch(() => {});
    }
    // Note: cannot remove users/{uid}/playerCampaigns from DM's client (Firebase rules block it).
    // The kicked player's campaign card will remain until they leave manually or the listener detects removal.
}

// Player removes themselves from their own campaign list (e.g. after DM deleted the campaign)
export async function removePlayerCampaignIndex(campaignId, uid) {
    await remove(ref(db, `users/${uid}/playerCampaigns/${campaignId}`));
}

// DM deletes entire campaign. Cannot remove players' own index entries (Firebase rules),
// but those will show gracefully until players manually remove them.
export async function deleteCampaign(campaignId, dmUid) {
    await remove(ref(db, `campaigns/${campaignId}`));
    await remove(ref(db, `users/${dmUid}/dmCampaigns/${campaignId}`));
    // Room data also cleaned up
    await remove(ref(db, `rooms/${campaignId}`));
}

export function listenToPendingRequests(campaignId, cb) {
    return onValue(ref(db, `campaigns/${campaignId}/pendingRequests`), s => cb(s.val()));
}

export function listenToCampaignAllowedPlayers(campaignId, cb) {
    return onValue(ref(db, `campaigns/${campaignId}/allowedPlayers`), s => cb(s.val()));
}

// Listen for a single player's approval status (used by waiting lobby)
export function listenToApprovalStatus(campaignId, uid, cb) {
    return onValue(ref(db, `campaigns/${campaignId}/allowedPlayers/${uid}`), s => cb(s.val()));
}

// ── Session Archive (stored under users/{dmUid} — no extra rules needed) ──────
export async function saveSession(campaignId, dmUid, sessionData) {
    const ts = Date.now();
    await set(ref(db, `users/${dmUid}/campaignSessions/${campaignId}/${ts}`), { ...sessionData, ts });
    // Keep only last 5 sessions
    const allSnap = await get(ref(db, `users/${dmUid}/campaignSessions/${campaignId}`));
    if (allSnap.exists()) {
        const keys = Object.keys(allSnap.val()).sort();
        if (keys.length > 5) {
            await Promise.all(
                keys.slice(0, keys.length - 5).map(k =>
                    remove(ref(db, `users/${dmUid}/campaignSessions/${campaignId}/${k}`))
                )
            );
        }
    }
    return ts;
}

export async function getRecentSessions(campaignId, dmUid) {
    const snap = await get(ref(db, `users/${dmUid}/campaignSessions/${campaignId}`));
    if (!snap.exists()) return [];
    return Object.entries(snap.val())
        .sort(([a], [b]) => Number(b) - Number(a))
        .slice(0, 5)
        .map(([ts, data]) => ({ ts: Number(ts), ...data }));
}

export function listenToCampaignsByDM(dmUid, cb) {
    // Read from user's own dmCampaigns index — no collection-level read needed
    return onValue(ref(db, `users/${dmUid}/dmCampaigns`), async snap => {
        const index = snap.val() || {};
        if (!Object.keys(index).length) { cb({}); return; }
        const results = {};
        await Promise.all(Object.keys(index).map(async id => {
            const metaSnap = await get(ref(db, `campaigns/${id}/meta`));
            const apSnap   = await get(ref(db, `campaigns/${id}/allowedPlayers`));
            if (metaSnap.exists()) {
                results[id] = { meta: metaSnap.val(), allowedPlayers: apSnap.val() || {} };
            }
        }));
        cb(results);
    });
}

export function listenToCampaignsByPlayer(uid, cb) {
    // Read from user's own playerCampaigns index — no collection-level read needed
    return onValue(ref(db, `users/${uid}/playerCampaigns`), async snap => {
        const index = snap.val() || {};
        if (!Object.keys(index).length) { cb({}); return; }
        const results = {};
        await Promise.all(Object.keys(index).map(async id => {
            const metaSnap = await get(ref(db, `campaigns/${id}/meta`));
            const apSnap   = await get(ref(db, `campaigns/${id}/allowedPlayers/${uid}`));
            if (metaSnap.exists()) {
                results[id] = {
                    meta: metaSnap.val(),
                    allowedPlayers: { [uid]: apSnap.val() || {} }
                };
            }
        }));
        cb(results);
    });
}

export async function updateCampaignMeta(campaignId, patch) {
    await update(ref(db, `campaigns/${campaignId}/meta`), patch);
}

export async function updateCampaignLastSession(campaignId) {
    const ts = Date.now();
    await update(ref(db, `campaigns/${campaignId}/meta`), { lastSession: ts });
    // Propagate to DM index — look up dmUid first
    const metaSnap = await get(ref(db, `campaigns/${campaignId}/meta/dmUid`));
    const dmUid = metaSnap.val();
    if (dmUid) update(ref(db, `users/${dmUid}/dmCampaigns/${campaignId}`), { lastSession: ts });
}

export async function longRestCampaign(campaignId) {
    // Restore all player HP and spell slots in the room
    const snap = await get(ref(db, `rooms/${campaignId}/players`));
    if (!snap.exists()) return;
    const players = snap.val();
    const patches = Object.entries(players).map(([k, p]) => {
        const patch = {};
        if (p.maxHp)       patch.hp = p.maxHp;
        if (p.spellSlots)  patch['spellSlots/used'] = {};
        if (p.classResources) {
            Object.keys(p.classResources).forEach(res => {
                if (res.endsWith('_used')) patch[`classResources/${res}`] = 0;
            });
        }
        return update(ref(db, `rooms/${campaignId}/players/${k}`), patch);
    });
    await Promise.all(patches);
}

export function saveRollToDB(rollData)              { push(ref(db, `rooms/${activeRoom}/rolls`), rollData); }
export async function getPlayerData(cName)          { return (await get(ref(db, `rooms/${activeRoom}/players/${sanitizeCName(cName)}`))).val(); }
export function updatePlayerHPInDB(cName, hp)       { update(ref(db, `rooms/${activeRoom}/players/${sanitizeCName(cName)}`), { hp }); }
export function patchPlayerInDB(cName, fields)      { update(ref(db, `rooms/${activeRoom}/players/${sanitizeCName(cName)}`), fields); }
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
export async function getRecentRolls(campaignId, n = 50) {
    const snap = await get(query(ref(db, `rooms/${campaignId}/rolls`), limitToLast(n)));
    if (!snap.exists()) return null;
    return snap.val();
}

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
        console.info(`[ParaDice] Purged ${toDelete.length} old roll log entries.`);
    } catch (e) {
        console.warn('[ParaDice] purgeOldRolls failed:', e);
    }
}

// ==========================================
// Listeners
// ==========================================
export function listenToCombatStatus(cb)              { onValue(ref(db, `rooms/${activeRoom}/combat_active`), s => cb(s.val())); }
export function listenToPlayerInitiative(cName, cb)   { onValue(ref(db, `rooms/${activeRoom}/initiative/${sanitizeCName(cName)}`), s => cb(s.exists()), { onlyOnce: true }); }
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
export function addSpellToBook(cName, spell) {
    const k = sanitizeCName(cName);
    const slug = (spell.slug || spell.name || '').replace(/[.#$[\]]/g, '_');
    update(ref(db, `rooms/${activeRoom}/players/${k}/spellbook`), { [slug]: spell });
}
export function removeSpellFromBook(cName, slug) {
    const k = sanitizeCName(cName);
    const safeSlug = slug.replace(/[.#$[\]]/g, '_');
    remove(ref(db, `rooms/${activeRoom}/players/${k}/spellbook/${safeSlug}`));
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
    update(ref(db, `rooms/${room}/map/tokens/${sanitizeCName(cName)}`), { gx, gy, usedMv: usedMv||0 });
}
export function resetTokenMv(room, cName) {
    update(ref(db, `rooms/${room}/map/tokens/${sanitizeCName(cName)}`), { usedMv: 0 });
}
export function removeMapToken(room, cName) {
    remove(ref(db, `rooms/${room}/map/tokens/${sanitizeCName(cName)}`));
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
// ── DM Broadcast Display ──────────────────────────────────────────────────────
export function setDisplay(room, data) { set(ref(db, `rooms/${room}/display`), data ?? null); }
export function listenDisplay(room, cb) { return onValue(ref(db, `rooms/${room}/display`), s => cb(s.val())); }

export function listenLights(room, scene, cb) {
    return onValue(ref(db, `rooms/${room}/scenes/${scene}/lights`), s => cb(s.val()));
}
export function setLight(room, scene, key, data) {
    set(ref(db, `rooms/${room}/scenes/${scene}/lights/${key}`), data);
}
export function removeLight(room, scene, key) {
    remove(ref(db, `rooms/${room}/scenes/${scene}/lights/${key}`));
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

// ── Background Music ──────────────────────────────────────────────────────────
export function setMusic(room, state) {
    set(ref(db, `rooms/${room}/music`), state ?? null);
}
export function listenMusic(room, cb) {
    return onValue(ref(db, `rooms/${room}/music`), s => cb(s.val()));
}

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

// ── S11: Data Health ─────────────────────────────────────────────────────────

/** S11: Remove map tokens for players no longer in the room's players/ node.
 *  Safe to call on every player-list update; no-ops if no orphans.
 */
export async function pruneOrphanTokens(room, activeNames) {
    if (!room) return;
    try {
        const snap = await get(ref(db, `rooms/${room}/map/tokens`));
        const tokens = snap.val() || {};
        const activeSet = new Set(activeNames.map(n => sanitizeCName(n)));
        const orphans = Object.keys(tokens).filter(k => !activeSet.has(k));
        await Promise.all(orphans.map(k => remove(ref(db, `rooms/${room}/map/tokens/${k}`))));
    } catch (e) { /* silent — best effort */ }
}

/** S11: Patch a single field on any player record (used by wizard NPC spawner). */
export function updatePlayerField(cName, field, value) {
    update(ref(db, `rooms/${activeRoom}/players/${sanitizeCName(cName)}`), { [field]: value });
}

/** Patch individual fields under classResources/ for a character. */
export function patchClassResources(cName, patch) {
    const k = sanitizeCName(cName);
    const flatPatch = {};
    for (const [key, val] of Object.entries(patch)) {
        flatPatch[`classResources/${key}`] = val;
    }
    update(ref(db, `rooms/${activeRoom}/players/${k}`), flatPatch);
}

// ── S15: DM Session Notes ─────────────────────────────────────────────────────

/**
 * S15: Get the Firebase ref for DM notes in the current room/campaign.
 * @param {boolean} isCampaign
 * @param {string}  [noteId]   — omit for the collection ref
 */
function _dmNoteRef(isCampaign, noteId) {
    const base = isCampaign
        ? `campaigns/${activeRoom}/dm_notes`
        : `rooms/${activeRoom}/dm_notes`;
    return noteId ? ref(db, `${base}/${noteId}`) : ref(db, base);
}

/**
 * Save (create or overwrite) a DM note.
 * @param {string}  id
 * @param {{ title:string, content:string, tag:string }} noteData
 * @param {boolean} isCampaign
 */
export function saveDMNote(id, noteData, isCampaign) {
    return set(_dmNoteRef(isCampaign, id), { ...noteData, id, updatedAt: Date.now() });
}

/**
 * Delete a DM note by id.
 * @param {string}  id
 * @param {boolean} isCampaign
 */
export function deleteDMNote(id, isCampaign) {
    return remove(_dmNoteRef(isCampaign, id));
}

/**
 * Subscribe to DM notes (real-time). Returns an unsubscribe function.
 * @param {function} cb          — called with an array of note objects on each change
 * @param {boolean}  isCampaign
 * @returns {function}  unsubscribe
 */
export function listenDMNotes(cb, isCampaign) {
    const r = _dmNoteRef(isCampaign);
    const unsub = onValue(r, snap => {
        const notes = [];
        if (snap.exists()) {
            snap.forEach(child => notes.push(child.val()));
        }
        notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        cb(notes);
    });
    return unsub;
}

// ── S14: Portrait Upload ──────────────────────────────────────────────────────

const _storage = getStorage();

/**
 * S14: Upload a portrait File to Firebase Storage → return download URL.
 * Path: portraits/{uid}/{timestamp}_{random}.{ext}
 * @param {string}   uid        — Firebase Auth UID
 * @param {File}     file       — image file from <input type="file">
 * @param {Function} onProgress — optional callback(0–100)
 * @returns {Promise<string>} public download URL
 */
// ==========================================
// User Preferences
// ==========================================
export async function getUserPreferences(uid) {
    if (!uid) return {};
    const snap = await get(ref(db, `users/${uid}/preferences`));
    return snap.val() || {};
}
export function setUserPreference(uid, key, value) {
    if (!uid || !key) return;
    return update(ref(db, `users/${uid}/preferences`), { [key]: value });
}
export function listenToUserPreferences(uid, cb) {
    if (!uid) return;
    return onValue(ref(db, `users/${uid}/preferences`), s => cb(s.val() || {}));
}

// ==========================================
// Campaign Mechanics (variant rules)
// ==========================================
export async function getCampaignMechanics(campaignId) {
    if (!campaignId) return {};
    const snap = await get(ref(db, `campaigns/${campaignId}/mechanics`));
    return snap.val() || {};
}
export function setCampaignMechanic(campaignId, key, value) {
    if (!campaignId || !key) return;
    return update(ref(db, `campaigns/${campaignId}/mechanics`), { [key]: value });
}
export function setRoomMechanics(roomCode, mechanics) {
    if (!roomCode) return;
    return set(ref(db, `rooms/${roomCode}/mechanics`), mechanics);
}
export async function getRoomMechanics(roomCode) {
    if (!roomCode) return {};
    const snap = await get(ref(db, `rooms/${roomCode}/mechanics`));
    return snap.val() || {};
}

// ==========================================
// Portrait Upload
// ==========================================
// ==========================================
// Community Hub — Listings
// ==========================================

export async function createListing(listingId, data) {
    await set(ref(db, `communityHub/listings/${listingId}`), data);
}

export async function updateListing(listingId, updates) {
    await update(ref(db, `communityHub/listings/${listingId}`), updates);
}

export async function deleteListing(listingId) {
    await remove(ref(db, `communityHub/listings/${listingId}`));
}

export function listenToListings(cb) {
    return onValue(
        query(ref(db, 'communityHub/listings'), orderByChild('createdAt')),
        s => cb(s.val())
    );
}

export async function getListing(listingId) {
    const snap = await get(ref(db, `communityHub/listings/${listingId}`));
    return snap.val();
}

export async function rsvpToListing(listingId, uid, data) {
    await set(ref(db, `communityHub/listings/${listingId}/rsvps/${uid}`), data);
}

export async function cancelRsvp(listingId, uid) {
    await remove(ref(db, `communityHub/listings/${listingId}/rsvps/${uid}`));
}

export async function updateListingPlayerCount(listingId, count) {
    await update(ref(db, `communityHub/listings/${listingId}`), { currentPlayers: count });
}

// ==========================================
// Community Hub — User Profiles
// ==========================================

export async function saveUserProfile(uid, data) {
    await set(ref(db, `users/${uid}/profile`), data);
}

export async function getUserProfilePrivate(uid) {
    const snap = await get(ref(db, `users/${uid}/profile`));
    return snap.val();
}

export async function syncPublicProfile(uid, publicData) {
    await set(ref(db, `communityHub/userProfiles/${uid}`), publicData);
}

export async function getPublicProfile(uid) {
    const snap = await get(ref(db, `communityHub/userProfiles/${uid}`));
    return snap.val();
}

export function listenToLFGPlayers(cb) {
    return onValue(ref(db, 'communityHub/userProfiles'), s => {
        const all = s.val() || {};
        const lfg = {};
        for (const [uid, profile] of Object.entries(all)) {
            if (profile.lfg) lfg[uid] = profile;
        }
        cb(lfg);
    });
}

/** Close all public listings by a specific DM (e.g. on subscription downgrade). */
export async function closeAllListings(dmUid) {
    const snap = await get(ref(db, 'communityHub/listings'));
    if (!snap.exists()) return;
    const updates = {};
    snap.forEach(child => {
        if (child.val().dmUid === dmUid) {
            updates[`communityHub/listings/${child.key}/status`] = 'closed';
        }
    });
    if (Object.keys(updates).length) await update(ref(db), updates);
}

export function uploadPortrait(uid, file, onProgress) {
    return new Promise((resolve, reject) => {
        const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `portraits/${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const task = uploadBytesResumable(sRef(_storage, path), file, { contentType: file.type });
        task.on('state_changed',
            snap => { if (onProgress) onProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)); },
            err  => reject(err),
            async () => resolve(await getDownloadURL(task.snapshot.ref))
        );
    });
}

// ==========================================
// Video Chat — WebRTC signaling via RTDB
// ==========================================

export function setVideoChatParticipant(roomCode, uid, data) {
    const pRef = ref(db, `rooms/${roomCode}/webrtc/participants/${uid}`);
    set(pRef, data);
    onDisconnect(pRef).remove();
}

export function updateVideoChatParticipant(roomCode, uid, updates) {
    update(ref(db, `rooms/${roomCode}/webrtc/participants/${uid}`), updates);
}

export function removeVideoChatParticipant(roomCode, uid) {
    remove(ref(db, `rooms/${roomCode}/webrtc/participants/${uid}`));
}

export function listenToVideoChatParticipants(roomCode, onAdded, onRemoved) {
    const pRef = ref(db, `rooms/${roomCode}/webrtc/participants`);
    const addUnsub = onChildAdded(pRef, snap => onAdded(snap.key, snap.val()));
    const remUnsub = onChildRemoved(pRef, snap => onRemoved(snap.key));
    return () => { addUnsub(); remUnsub(); };
}

export function listenToVideoChatParticipantChanges(roomCode, uid, cb) {
    const pRef = ref(db, `rooms/${roomCode}/webrtc/participants/${uid}`);
    return onValue(pRef, snap => cb(snap.val()));
}

export function writeSignal(roomCode, fromUid, toUid, signal) {
    set(ref(db, `rooms/${roomCode}/webrtc/signals/${fromUid}_${toUid}`), signal);
}

export function listenToSignal(roomCode, fromUid, toUid, cb) {
    const sRef2 = ref(db, `rooms/${roomCode}/webrtc/signals/${fromUid}_${toUid}`);
    return onValue(sRef2, snap => { if (snap.exists()) cb(snap.val()); });
}

export function pushIceCandidate(roomCode, fromUid, toUid, candidate) {
    push(ref(db, `rooms/${roomCode}/webrtc/ice/${fromUid}_${toUid}`), candidate);
}

export function listenToIceCandidates(roomCode, fromUid, toUid, cb) {
    const iRef = ref(db, `rooms/${roomCode}/webrtc/ice/${fromUid}_${toUid}`);
    return onChildAdded(iRef, snap => cb(snap.val()));
}

export function clearWebRTCSignaling(roomCode, uid) {
    // Remove own participant + all signal/ice paths involving this uid
    remove(ref(db, `rooms/${roomCode}/webrtc/participants/${uid}`));
}

export function clearWebRTCPeerSignaling(roomCode, localUid, remoteUid) {
    remove(ref(db, `rooms/${roomCode}/webrtc/signals/${localUid}_${remoteUid}`));
    remove(ref(db, `rooms/${roomCode}/webrtc/signals/${remoteUid}_${localUid}`));
    remove(ref(db, `rooms/${roomCode}/webrtc/ice/${localUid}_${remoteUid}`));
    remove(ref(db, `rooms/${roomCode}/webrtc/ice/${remoteUid}_${localUid}`));
}

export function setVideoChatEnabled(roomCode, enabled) {
    set(ref(db, `rooms/${roomCode}/webrtc/enabled`), enabled);
}

export function listenToVideoChatEnabled(roomCode, cb) {
    const eRef = ref(db, `rooms/${roomCode}/webrtc/enabled`);
    return onValue(eRef, snap => cb(snap.val() ?? true));
}

export function setVideoChatMuteAll(roomCode, muteAll) {
    set(ref(db, `rooms/${roomCode}/webrtc/muteAll`), muteAll);
}

export function listenToVideoChatMuteAll(roomCode, cb) {
    const mRef = ref(db, `rooms/${roomCode}/webrtc/muteAll`);
    return onValue(mRef, snap => cb(snap.val() ?? false));
}
