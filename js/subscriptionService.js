// subscriptionService.js — Client-side subscription tier management
import { getDatabase, ref, onValue, get } from "firebase/database";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "./constants.js";

const db = getDatabase(initializeApp(firebaseConfig, 'sub-reader'));

const TIER_LIMITS = {
    player:  { maxChars: 3, maxCampaigns: 0, canCreateRoom: false, hasAI: false },
    dm:      { maxChars: Infinity, maxCampaigns: 5, canCreateRoom: true, hasAI: true },
    founder: { maxChars: Infinity, maxCampaigns: Infinity, canCreateRoom: true, hasAI: true },
};

let _currentSub = { tier: 'player', status: 'active', plan: null, trialEnd: 0, currentPeriodEnd: 0, gracePeriodEnd: 0 };
let _listeners = [];

export function listenToSubscription(uid, callback) {
    if (!uid) return;
    const subRef = ref(db, `users/${uid}/subscription`);
    onValue(subRef, (snap) => {
        const data = snap.val() || {};
        _currentSub = {
            tier: data.tier || 'player',
            status: data.status || 'active',
            plan: data.plan || null,
            trialEnd: data.trialEnd || 0,
            currentPeriodEnd: data.currentPeriodEnd || 0,
            gracePeriodEnd: data.gracePeriodEnd || 0,
        };
        const resolved = resolveAccess(_currentSub);
        callback(resolved);
        _listeners.forEach(fn => fn(resolved));
    });
}

export function onSubscriptionChange(fn) { _listeners.push(fn); }

export function resolveAccess(sub) {
    const now = Date.now();
    const inTrial = sub.status === 'trial' && sub.trialEnd > now;
    const inGrace = sub.gracePeriodEnd > now;
    const periodActive = sub.currentPeriodEnd > now;
    const isActive = sub.tier !== 'player' && (sub.status === 'active' || inTrial || inGrace || periodActive);

    return {
        tier: isActive ? sub.tier : 'player',
        isActive,
        inTrial,
        inGrace,
        daysLeft: inTrial ? Math.ceil((sub.trialEnd - now) / 86400000) : 0,
        plan: sub.plan,
        limits: TIER_LIMITS[isActive ? sub.tier : 'player'],
    };
}

export function getTierLimits(tier) {
    return TIER_LIMITS[tier] || TIER_LIMITS.player;
}

export function getCurrentSub() {
    return resolveAccess(_currentSub);
}

export function checkCanCreateCharacter(currentCount) {
    return currentCount < getCurrentSub().limits.maxChars;
}

export function checkCanCreateCampaign(currentCount) {
    return currentCount < getCurrentSub().limits.maxCampaigns;
}

export function checkCanCreateRoom() {
    return getCurrentSub().limits.canCreateRoom;
}
