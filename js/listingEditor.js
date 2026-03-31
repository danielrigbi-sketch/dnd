// listingEditor.js — DM modal for publishing games to Community Hub
import { escapeHtml } from './core/sanitize.js';
import { t } from './i18n.js';
import { createListing, updateListing, deleteListing, getListing, getAuthUid } from './firebaseService.js';
import { checkCanCreateListing } from './subscriptionService.js';

const GAME_STYLES = ['roleplay', 'combat', 'exploration', 'social', 'horror', 'mixed'];
const EXP_LEVELS = ['beginner', 'intermediate', 'advanced', 'all'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Open the listing editor modal.
 * @param {Object} prefill — { type:'campaign'|'quickRoom', roomCode, title, dmUid, dmName, listingId? }
 * @param {Function} [onSaved] — callback after save
 */
export async function openListingEditor(prefill = {}, onSaved) {
    if (!checkCanCreateListing()) {
        if (window.showToast) window.showToast(t('hub_err_dm_only'), 'error');
        return;
    }

    const listingId = prefill.listingId || prefill.roomCode || Date.now().toString(36);
    const existing = prefill.listingId ? await getListing(prefill.listingId) : null;
    const d = existing || {};

    let modal = document.getElementById('listing-editor-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'listing-editor-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:5000;display:none;justify-content:center;align-items:center;';
        document.body.appendChild(modal);
    }

    const stylesHtml = GAME_STYLES.map(s => {
        const checked = (d.gameStyle || []).includes(s) ? 'checked' : '';
        return `<label><input type="checkbox" name="ed-style" value="${s}" ${checked}> ${t('hub_style_' + s)}</label>`;
    }).join('');

    const expOptions = EXP_LEVELS.map(e =>
        `<option value="${e}" ${d.experienceLevel === e ? 'selected' : ''}>${t('hub_' + e)}</option>`
    ).join('');

    const dayOptions = DAYS.map((day, i) =>
        `<option value="${i}" ${(d.schedule?.dayOfWeek === i) ? 'selected' : ''}>${t('day_' + day)}</option>`
    ).join('');

    const schedType = d.schedule?.type || 'open';

    modal.innerHTML = `
        <div class="modal-content listing-editor-modal" style="background:var(--pd-bg-dark,#1a1a2e);border:1px solid rgba(200,135,58,0.3);border-radius:12px;padding:24px;width:90%;max-width:520px;max-height:80vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(200,135,58,0.15);">
                <h2 style="color:#f1c40f;margin:0;font-size:18px;">${existing ? t('editor_update') : t('editor_title')}</h2>
                <button id="ed-close-btn" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;">&times;</button>
            </div>
            <div class="listing-editor-form">
                <div class="editor-field">
                    <label>${t('editor_listing_title')}</label>
                    <input type="text" id="ed-title" value="${escapeHtml(d.title || prefill.title || '')}" placeholder="${escapeHtml(t('editor_title_ph'))}" maxlength="80">
                </div>
                <div class="editor-field">
                    <label>${t('editor_description')}</label>
                    <textarea id="ed-desc" placeholder="${escapeHtml(t('editor_description_ph'))}" maxlength="500">${escapeHtml(d.description || '')}</textarea>
                </div>
                <div class="editor-field">
                    <label>${t('editor_max_players')}</label>
                    <input type="number" id="ed-max-players" min="2" max="8" value="${d.maxPlayers || 4}">
                </div>
                <div class="editor-field">
                    <label>${t('editor_access_mode')}</label>
                    <select id="ed-access">
                        <option value="auto" ${d.accessMode === 'auto' ? 'selected' : ''}>${t('editor_auto_join')}</option>
                        <option value="approval" ${d.accessMode !== 'auto' ? 'selected' : ''}>${t('editor_approval_required')}</option>
                    </select>
                </div>
                <div class="editor-field">
                    <label>${t('editor_game_style')}</label>
                    <div class="editor-checkbox-group">${stylesHtml}</div>
                </div>
                <div class="editor-field">
                    <label>${t('editor_experience')}</label>
                    <select id="ed-experience">${expOptions}</select>
                </div>
                <div class="editor-field">
                    <label>${t('editor_language')}</label>
                    <select id="ed-language">
                        <option value="he" ${d.language === 'he' ? 'selected' : ''}>${t('editor_lang_he')}</option>
                        <option value="en" ${d.language === 'en' ? 'selected' : ''}>${t('editor_lang_en')}</option>
                        <option value="both" ${(d.language || 'he') === 'both' ? 'selected' : ''}>${t('editor_lang_both')}</option>
                    </select>
                </div>
                <div class="editor-field">
                    <label>${t('editor_schedule')}</label>
                    <select id="ed-sched-type">
                        <option value="open" ${schedType === 'open' ? 'selected' : ''}>${t('editor_schedule_open')}</option>
                        <option value="oneshot" ${schedType === 'oneshot' ? 'selected' : ''}>${t('editor_schedule_oneshot')}</option>
                        <option value="recurring" ${schedType === 'recurring' ? 'selected' : ''}>${t('editor_schedule_recurring')}</option>
                    </select>
                </div>
                <div id="ed-sched-fields" class="editor-schedule-fields" style="display:${schedType === 'open' ? 'none' : 'flex'};">
                    <div class="editor-field" id="ed-date-field" style="display:${schedType === 'oneshot' ? 'block' : 'none'};">
                        <label>${t('editor_date')}</label>
                        <input type="date" id="ed-date" value="${d.schedule?.date ? new Date(d.schedule.date).toISOString().split('T')[0] : ''}">
                    </div>
                    <div class="editor-field" id="ed-day-field" style="display:${schedType === 'recurring' ? 'block' : 'none'};">
                        <label>${t('editor_day')}</label>
                        <select id="ed-day">${dayOptions}</select>
                    </div>
                    <div class="editor-field" id="ed-time-field" style="display:${schedType !== 'open' ? 'block' : 'none'};">
                        <label>${t('editor_time')}</label>
                        <input type="time" id="ed-time" value="${d.schedule?.time || '20:00'}">
                    </div>
                </div>
                <div class="editor-field">
                    <label>${t('editor_age_min')}</label>
                    <input type="number" id="ed-age-min" min="0" max="99" value="${d.ageMin || ''}" placeholder="0">
                </div>
                <div class="editor-field">
                    <label>${t('editor_age_max')}</label>
                    <input type="number" id="ed-age-max" min="0" max="99" value="${d.ageMax || ''}" placeholder="99">
                </div>
                <div class="editor-field">
                    <label>${t('editor_fee')}</label>
                    <input type="number" id="ed-fee" min="0" step="1" value="${d.entranceFee || 0}" placeholder="0">
                </div>
                <div class="editor-field">
                    <label>${t('editor_tags')}</label>
                    <input type="text" id="ed-tags" value="${escapeHtml((d.tags || []).join(', '))}" placeholder="${escapeHtml(t('editor_tags_ph'))}">
                </div>
                <div class="editor-actions">
                    <button id="ed-cancel-btn" class="hover-btn" style="background:transparent;color:#ccc;border:1px solid #555;padding:8px 16px;border-radius:6px;">${t('editor_cancel')}</button>
                    <button id="ed-save-btn" class="hover-btn" style="background:#e74c3c;color:white;padding:8px 20px;border-radius:6px;font-weight:bold;">${existing ? t('editor_update') : t('editor_save')}</button>
                </div>
            </div>
        </div>
    `;
    modal.style.display = 'flex';

    // Schedule type toggle
    document.getElementById('ed-sched-type').addEventListener('change', e => {
        const type = e.target.value;
        document.getElementById('ed-sched-fields').style.display = type === 'open' ? 'none' : 'flex';
        document.getElementById('ed-date-field').style.display = type === 'oneshot' ? 'block' : 'none';
        document.getElementById('ed-day-field').style.display = type === 'recurring' ? 'block' : 'none';
        document.getElementById('ed-time-field').style.display = type !== 'open' ? 'block' : 'none';
    });

    document.getElementById('ed-close-btn').addEventListener('click', () => { modal.style.display = 'none'; });
    document.getElementById('ed-cancel-btn').addEventListener('click', () => { modal.style.display = 'none'; });
    document.getElementById('ed-save-btn').addEventListener('click', () => _saveListing(listingId, prefill, existing, onSaved));
}

async function _saveListing(listingId, prefill, existing, onSaved) {
    const title = document.getElementById('ed-title').value.trim();
    if (!title) { document.getElementById('ed-title').focus(); return; }

    const gameStyle = Array.from(document.querySelectorAll('input[name="ed-style"]:checked')).map(cb => cb.value);
    const schedType = document.getElementById('ed-sched-type').value;

    const schedule = { type: schedType, timezone: 'Asia/Jerusalem' };
    if (schedType === 'oneshot') {
        const dateVal = document.getElementById('ed-date').value;
        schedule.date = dateVal ? new Date(dateVal + 'T' + (document.getElementById('ed-time').value || '20:00')).getTime() : null;
        schedule.time = document.getElementById('ed-time').value || '20:00';
    } else if (schedType === 'recurring') {
        schedule.dayOfWeek = parseInt(document.getElementById('ed-day').value);
        schedule.time = document.getElementById('ed-time').value || '20:00';
    }

    const tagsRaw = document.getElementById('ed-tags').value;
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

    const data = {
        type: prefill.type || 'quickRoom',
        title,
        description: document.getElementById('ed-desc').value.trim().slice(0, 500),
        dmUid: prefill.dmUid || getAuthUid(),
        dmName: prefill.dmName || '',
        roomCode: prefill.roomCode || listingId,
        maxPlayers: parseInt(document.getElementById('ed-max-players').value) || 4,
        currentPlayers: existing?.currentPlayers || 0,
        accessMode: document.getElementById('ed-access').value,
        gameStyle,
        experienceLevel: document.getElementById('ed-experience').value,
        language: document.getElementById('ed-language').value,
        schedule,
        ageMin: parseInt(document.getElementById('ed-age-min').value) || null,
        ageMax: parseInt(document.getElementById('ed-age-max').value) || null,
        entranceFee: parseInt(document.getElementById('ed-fee').value) || 0,
        tags,
        status: existing?.status || 'open',
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now()
    };

    try {
        if (existing) {
            await updateListing(listingId, data);
        } else {
            await createListing(listingId, data);
        }
        if (window.showToast) window.showToast(t('editor_published'), 'success');
        document.getElementById('listing-editor-modal').style.display = 'none';
        if (onSaved) onSaved(listingId, data);
    } catch (e) {
        console.error('[ListingEditor] save failed:', e);
        if (window.showToast) window.showToast(t('hub_err_save_failed'), 'error');
    }
}

/** Remove a listing from the hub. */
export async function unpublishListing(listingId) {
    try {
        await deleteListing(listingId);
        if (window.showToast) window.showToast(t('editor_unpublished'), 'info');
    } catch (e) {
        console.error('[ListingEditor] unpublish failed:', e);
    }
}

/** Update a listing's metadata to match current campaign meta (call on campaign save). */
export async function updateListingFromCampaign(campaignId, campaignMeta) {
    const existing = await getListing(campaignId);
    if (!existing) return; // not published
    await updateListing(campaignId, {
        title: campaignMeta.name || existing.title,
        dmName: campaignMeta.dmName || existing.dmName,
        updatedAt: Date.now()
    });
}
