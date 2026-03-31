// js/core/firebasePaths.js — Centralized Firebase RTDB path builders
//
// Eliminates scattered `rooms/${code}/...` string interpolation across the codebase.
// All path segments are validated to prevent Firebase illegal-character errors.

/**
 * Strip characters illegal in Firebase RTDB keys: . # $ [ ] /
 * @param {string} s
 * @returns {string}
 */
export function sanitizeKey(s) {
    return String(s || '').replace(/[.#$\[\]/]/g, '_');
}

// ── Room paths ──────────────────────────────────────────────────────────

export const roomPath          = (code)             => `rooms/${code}`;
export const playerPath        = (code, cName)      => `rooms/${code}/players/${sanitizeKey(cName)}`;
export const initiativePath    = (code, cName)      => `rooms/${code}/initiative/${sanitizeKey(cName)}`;
export const rollsPath         = (code)             => `rooms/${code}/rolls`;
export const onlinePath        = (code, key)        => `rooms/${code}/online/${key}`;
export const tokenPath         = (code, cName)      => `rooms/${code}/map/tokens/${sanitizeKey(cName)}`;
export const mapConfigPath     = (code)             => `rooms/${code}/map/config`;
export const activeScenePath   = (code)             => `rooms/${code}/map/activeScene`;
export const atmospherePath    = (code)             => `rooms/${code}/map/atmosphere`;
export const scenePath         = (code, sceneId)    => `rooms/${code}/scenes/${sceneId}`;
export const sceneFogPath      = (code, sceneId)    => `rooms/${code}/scenes/${sceneId}/fog`;
export const combatActivePath  = (code)             => `rooms/${code}/combat_active`;
export const activeTurnPath    = (code)             => `rooms/${code}/active_turn`;
export const roundNumberPath   = (code)             => `rooms/${code}/round_number`;
export const dmNotesPath       = (code)             => `rooms/${code}/dm_notes`;
export const dmUidPath         = (code)             => `rooms/${code}/dm_uid`;
export const mechanicsPath     = (code)             => `rooms/${code}/mechanics`;

// ── WebRTC paths ────────────────────────────────────────────────────────

export const webrtcParticipantsPath = (code)            => `rooms/${code}/webrtc/participants`;
export const webrtcSignalPath       = (code, from, to)  => `rooms/${code}/webrtc/signals/${from}_${to}`;
export const webrtcIcePath          = (code, from, to)  => `rooms/${code}/webrtc/ice/${from}_${to}`;

// ── User paths ──────────────────────────────────────────────────────────

export const userPath           = (uid)              => `users/${uid}`;
export const userCharsPath      = (uid)              => `users/${uid}/characters`;
export const userCharPath       = (uid, cId)         => `users/${uid}/characters/${cId}`;
export const userSubscriptionPath = (uid)            => `users/${uid}/subscription`;
export const userProfilePath    = (uid)              => `users/${uid}/profile`;
export const userDmCampaignsPath = (uid)             => `users/${uid}/dmCampaigns`;
export const userPlayerCampaignsPath = (uid)         => `users/${uid}/playerCampaigns`;

// ── Campaign paths ──────────────────────────────────────────────────────

export const campaignPath       = (id)               => `campaigns/${id}`;
export const campaignMetaPath   = (id)               => `campaigns/${id}/meta`;
export const campaignAllowedPath = (id, uid)         => `campaigns/${id}/allowedPlayers/${uid}`;
export const campaignPendingPath = (id, uid)         => `campaigns/${id}/pendingRequests/${uid}`;
export const campaignBannedPath  = (id, uid)         => `campaigns/${id}/bannedPlayers/${uid}`;
export const campaignNotesPath   = (id)              => `campaigns/${id}/dm_notes`;
export const campaignSessionsPath = (id)             => `campaigns/${id}/sessions`;

// ── Admin paths ─────────────────────────────────────────────────────────

export const webhookLogPath     = ()                 => `admin/webhookLog`;
export const pendingActivationsPath = ()             => `admin/pendingActivations`;
export const founderCountPath   = ()                 => `admin/founderCount`;
export const emailIndexPath     = (email)            => `admin/emailIndex/${sanitizeKey(email)}`;

// ── Community Hub paths ─────────────────────────────────────────────────

export const listingsPath       = ()                 => `communityHub/listings`;
export const listingPath        = (id)               => `communityHub/listings/${id}`;
export const communityProfilePath = (uid)            => `communityHub/userProfiles/${uid}`;
