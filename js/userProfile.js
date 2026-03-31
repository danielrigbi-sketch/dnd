// userProfile.js — Player profile editor + public sync for Community Hub
import { escapeHtml } from './core/sanitize.js';
import { t } from './i18n.js';
import { saveUserProfile, getUserProfilePrivate, syncPublicProfile, getPublicProfile, getAuthUid } from './firebaseService.js';

const GAME_STYLES = ['roleplay', 'combat', 'exploration', 'social', 'horror', 'mixed'];
const EXP_LEVELS = ['beginner', 'intermediate', 'advanced'];

let _uid = null;
let _profileCache = null;

/** Derive an age-range bucket from birth year (never expose exact age publicly). */
function _ageRange(birthYear) {
    if (!birthYear) return null;
    const age = new Date().getFullYear() - birthYear;
    if (age < 18) return 'under18';
    if (age <= 25) return '18-25';
    if (age <= 35) return '26-35';
    return '36+';
}

/** Open the profile editor modal. Creates the modal HTML on first call. */
export async function openProfileEditor(uid) {
    _uid = uid || getAuthUid();
    if (!_uid) return;

    // Fetch current profile
    _profileCache = await getUserProfilePrivate(_uid) || {};

    let modal = document.getElementById('profile-editor-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'profile-editor-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:5000;display:none;justify-content:center;align-items:center;';
        document.body.appendChild(modal);
    }

    const p = _profileCache;
    const stylesHtml = GAME_STYLES.map(s => {
        const checked = (p.preferredStyles || []).includes(s) ? 'checked' : '';
        return `<label><input type="checkbox" name="prof-style" value="${s}" ${checked}> ${t('hub_style_' + s)}</label>`;
    }).join('');

    const expOptions = EXP_LEVELS.map(e =>
        `<option value="${e}" ${p.experienceLevel === e ? 'selected' : ''}>${t('hub_' + e)}</option>`
    ).join('');

    modal.innerHTML = `
        <div class="modal-content profile-editor-modal" style="background:var(--pd-bg-dark,#1a1a2e);border:1px solid rgba(200,135,58,0.3);border-radius:12px;padding:24px;width:90%;max-width:450px;max-height:80vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(200,135,58,0.15);">
                <h2 style="color:#f1c40f;margin:0;font-size:18px;">${t('profile_title')}</h2>
                <button id="profile-close-btn" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;">&times;</button>
            </div>
            <div class="profile-editor-form">
                <div class="editor-field">
                    <label>${t('profile_birth_year')}</label>
                    <input type="number" id="prof-birth-year" min="1940" max="${new Date().getFullYear()}" value="${p.birthYear || ''}" placeholder="1995">
                </div>
                <div class="editor-field">
                    <label>${t('profile_experience')}</label>
                    <select id="prof-experience">
                        <option value="">${t('hub_all')}</option>
                        ${expOptions}
                    </select>
                </div>
                <div class="editor-field">
                    <label>${t('profile_styles')}</label>
                    <div class="editor-checkbox-group">${stylesHtml}</div>
                </div>
                <div class="editor-field">
                    <label>${t('profile_bio')}</label>
                    <textarea id="prof-bio" maxlength="200" placeholder="${escapeHtml(t('profile_bio_ph'))}">${escapeHtml(p.bio || '')}</textarea>
                </div>
                <div class="editor-field">
                    <label>${t('profile_language')}</label>
                    <select id="prof-language">
                        <option value="he" ${p.language === 'he' ? 'selected' : ''}>${t('editor_lang_he')}</option>
                        <option value="en" ${p.language === 'en' ? 'selected' : ''}>${t('editor_lang_en')}</option>
                        <option value="both" ${p.language === 'both' ? 'selected' : ''}>${t('editor_lang_both')}</option>
                    </select>
                </div>
                <div class="editor-field">
                    <label>${t('profile_lfg')}</label>
                    <div class="profile-lfg-toggle">
                        <div class="toggle-switch ${p.lfg ? 'active' : ''}" id="prof-lfg-toggle"></div>
                        <span id="prof-lfg-label" style="color:#ccc;font-size:12px;">${p.lfg ? t('profile_lfg_on') : t('profile_lfg_off')}</span>
                    </div>
                </div>
                <div class="editor-actions">
                    <button id="profile-cancel-btn" class="hover-btn" style="background:transparent;color:#ccc;border:1px solid #555;padding:8px 16px;border-radius:6px;">${t('editor_cancel')}</button>
                    <button id="profile-save-btn" class="hover-btn" style="background:#e74c3c;color:white;padding:8px 20px;border-radius:6px;font-weight:bold;">${t('profile_save')}</button>
                </div>
            </div>
        </div>
    `;
    modal.style.display = 'flex';

    // Event wiring
    const lfgToggle = document.getElementById('prof-lfg-toggle');
    let lfgState = !!p.lfg;
    lfgToggle.addEventListener('click', () => {
        lfgState = !lfgState;
        lfgToggle.classList.toggle('active', lfgState);
        document.getElementById('prof-lfg-label').textContent = lfgState ? t('profile_lfg_on') : t('profile_lfg_off');
    });

    document.getElementById('profile-close-btn').addEventListener('click', () => { modal.style.display = 'none'; });
    document.getElementById('profile-cancel-btn').addEventListener('click', () => { modal.style.display = 'none'; });
    document.getElementById('profile-save-btn').addEventListener('click', () => _saveProfile(lfgState));
}

async function _saveProfile(lfgState) {
    const birthYear = parseInt(document.getElementById('prof-birth-year').value) || null;
    const experienceLevel = document.getElementById('prof-experience').value || null;
    const bio = document.getElementById('prof-bio').value.trim().slice(0, 200);
    const language = document.getElementById('prof-language').value;
    const preferredStyles = Array.from(document.querySelectorAll('input[name="prof-style"]:checked')).map(cb => cb.value);

    const privateProfile = {
        birthYear,
        experienceLevel,
        preferredStyles,
        bio,
        language,
        lfg: lfgState,
        updatedAt: Date.now()
    };

    // Public profile — no raw birthYear, just ageRange bucket
    const publicProfile = {
        displayName: _profileCache?.displayName || '',
        avatar: _profileCache?.avatar || '',
        ageRange: _ageRange(birthYear),
        experienceLevel,
        preferredStyles,
        bio,
        language,
        lfg: lfgState,
        memberSince: _profileCache?.memberSince || Date.now(),
        lastActive: Date.now()
    };

    try {
        await saveUserProfile(_uid, privateProfile);
        await syncPublicProfile(_uid, publicProfile);
        _profileCache = { ...privateProfile, displayName: publicProfile.displayName, avatar: publicProfile.avatar, memberSince: publicProfile.memberSince };

        // Show success toast
        if (window.showToast) window.showToast(t('profile_saved'), 'success');
        document.getElementById('profile-editor-modal').style.display = 'none';
    } catch (e) {
        console.error('[Profile] save failed:', e);
        if (window.showToast) window.showToast(t('hub_err_save_failed'), 'error');
    }
}

/** Ensure user has a public profile entry (call on login). Sets displayName/avatar if missing. */
export async function ensureProfile(uid, displayName, avatar) {
    _uid = uid;
    const existing = await getPublicProfile(uid);
    if (existing) {
        // Update lastActive + basic info
        await syncPublicProfile(uid, { ...existing, displayName: displayName || existing.displayName, avatar: avatar || existing.avatar, lastActive: Date.now() });
        _profileCache = await getUserProfilePrivate(uid) || {};
        _profileCache.displayName = displayName;
        _profileCache.avatar = avatar;
        return existing;
    }
    // First-time: create minimal public profile
    const publicProfile = {
        displayName: displayName || '',
        avatar: avatar || '',
        ageRange: null,
        experienceLevel: null,
        preferredStyles: [],
        bio: '',
        language: 'he',
        lfg: false,
        memberSince: Date.now(),
        lastActive: Date.now()
    };
    await syncPublicProfile(uid, publicProfile);
    _profileCache = { displayName, avatar, memberSince: publicProfile.memberSince };
    return publicProfile;
}

/** Check if profile has birth year set (needed for age-gated listings). */
export function hasProfileBirthYear() {
    return !!(_profileCache && _profileCache.birthYear);
}

/** Get the user's birth year from cached private profile. */
export function getProfileBirthYear() {
    return _profileCache?.birthYear || null;
}

/** Get cached profile data. */
export function getCachedProfile() {
    return _profileCache;
}
