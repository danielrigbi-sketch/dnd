// communityHub.js — Community Hub browse & join for ParaDice VTT
import { escapeHtml } from './core/sanitize.js';
import { t } from './i18n.js';
import { listenToListings, rsvpToListing, cancelRsvp, getAuthUid, requestCampaignAccess } from './firebaseService.js';
import { openListingEditor } from './listingEditor.js';
import { openProfileEditor, hasProfileBirthYear, getProfileBirthYear } from './userProfile.js';
import { listenToLFGPlayers } from './firebaseService.js';

let _uid = null;
let _userName = '';
let _allListings = {};
let _filters = { search: '', style: '', experience: '', language: '', schedule: '' };
let _sort = 'newest';
let _unsubListings = null;
let _unsubLFG = null;

function _statusLabel(isFull, status) {
    if (isFull) return t('hub_full');
    switch (status) {
        case 'full': return t('hub_full');
        case 'in_progress': return t('hub_in_progress');
        case 'closed': return t('hub_closed');
        default: return t('hub_open_anytime');
    }
}

/** Initialize the Community Hub. Call once after auth. */
export function initCommunityHub(uid, userName) {
    _uid = uid;
    _userName = userName;

    const container = document.getElementById('community-hub-content');
    if (!container) return;

    container.innerHTML = `
        <div class="hub-header">
            <h2>${t('hub_title')}</h2>
            <button id="hub-profile-btn" class="hover-btn" style="background:transparent;color:#c8873a;border:1px solid rgba(200,135,58,0.3);padding:6px 12px;border-radius:6px;font-size:12px;">${t('profile_edit_btn')}</button>
        </div>
        <div class="hub-header-subtitle">${t('hub_subtitle')}</div>

        <div class="hub-filter-bar">
            <input type="text" class="hub-search-input" id="hub-search" placeholder="${escapeHtml(t('hub_search_ph'))}">
            <select class="hub-filter-select" id="hub-filter-style">
                <option value="">${t('hub_filter_style')}: ${t('hub_all')}</option>
                <option value="roleplay">${t('hub_style_roleplay')}</option>
                <option value="combat">${t('hub_style_combat')}</option>
                <option value="exploration">${t('hub_style_exploration')}</option>
                <option value="social">${t('hub_style_social')}</option>
                <option value="horror">${t('hub_style_horror')}</option>
                <option value="mixed">${t('hub_style_mixed')}</option>
            </select>
            <select class="hub-filter-select" id="hub-filter-exp">
                <option value="">${t('hub_filter_experience')}: ${t('hub_all')}</option>
                <option value="beginner">${t('hub_beginner')}</option>
                <option value="intermediate">${t('hub_intermediate')}</option>
                <option value="advanced">${t('hub_advanced')}</option>
                <option value="all">${t('hub_all_levels')}</option>
            </select>
            <select class="hub-filter-select" id="hub-filter-lang">
                <option value="">${t('hub_filter_language')}: ${t('hub_all')}</option>
                <option value="he">${t('editor_lang_he')}</option>
                <option value="en">${t('editor_lang_en')}</option>
                <option value="both">${t('editor_lang_both')}</option>
            </select>
            <select class="hub-filter-select" id="hub-filter-sched">
                <option value="">${t('hub_filter_schedule')}: ${t('hub_all')}</option>
                <option value="oneshot">${t('hub_oneshot')}</option>
                <option value="recurring">${t('hub_recurring')}</option>
                <option value="open">${t('hub_open_anytime')}</option>
            </select>
            <select class="hub-sort-select" id="hub-sort">
                <option value="newest">${t('hub_sort_newest')}</option>
                <option value="starting_soon">${t('hub_sort_starting_soon')}</option>
                <option value="most_players">${t('hub_sort_most_players')}</option>
            </select>
            <button class="hub-clear-filters-btn" id="hub-clear-filters">${t('hub_clear_filters')}</button>
        </div>

        <div class="hub-listings-grid" id="hub-listings-grid">
            <div class="hub-empty-state">${t('hub_loading')}</div>
        </div>

        <div class="lfg-section" id="hub-lfg-section" style="display:none;">
            <div class="lfg-section-title">${t('lfg_title')}</div>
            <div class="lfg-players-grid" id="hub-lfg-grid"></div>
        </div>
    `;

    // Wire filter events
    document.getElementById('hub-search').addEventListener('input', e => { _filters.search = e.target.value.toLowerCase(); _render(); });
    document.getElementById('hub-filter-style').addEventListener('change', e => { _filters.style = e.target.value; _render(); });
    document.getElementById('hub-filter-exp').addEventListener('change', e => { _filters.experience = e.target.value; _render(); });
    document.getElementById('hub-filter-lang').addEventListener('change', e => { _filters.language = e.target.value; _render(); });
    document.getElementById('hub-filter-sched').addEventListener('change', e => { _filters.schedule = e.target.value; _render(); });
    document.getElementById('hub-sort').addEventListener('change', e => { _sort = e.target.value; _render(); });
    document.getElementById('hub-clear-filters').addEventListener('click', _clearFilters);
    document.getElementById('hub-profile-btn').addEventListener('click', () => openProfileEditor(_uid));

    // Start listening
    _unsubListings = listenToListings(listings => {
        _allListings = listings || {};
        _render();
    });

    _unsubLFG = listenToLFGPlayers(players => {
        _renderLFG(players);
    });
}

function _clearFilters() {
    _filters = { search: '', style: '', experience: '', language: '', schedule: '' };
    document.getElementById('hub-search').value = '';
    document.getElementById('hub-filter-style').value = '';
    document.getElementById('hub-filter-exp').value = '';
    document.getElementById('hub-filter-lang').value = '';
    document.getElementById('hub-filter-sched').value = '';
    _render();
}

function _filterAndSort() {
    let entries = Object.entries(_allListings).filter(([, l]) => l.status !== 'closed');

    // Text search
    if (_filters.search) {
        entries = entries.filter(([, l]) =>
            (l.title || '').toLowerCase().includes(_filters.search) ||
            (l.description || '').toLowerCase().includes(_filters.search) ||
            (l.dmName || '').toLowerCase().includes(_filters.search) ||
            (l.tags || []).some(tag => tag.toLowerCase().includes(_filters.search))
        );
    }
    // Style filter
    if (_filters.style) {
        entries = entries.filter(([, l]) => (l.gameStyle || []).includes(_filters.style));
    }
    // Experience filter
    if (_filters.experience) {
        entries = entries.filter(([, l]) => l.experienceLevel === _filters.experience || l.experienceLevel === 'all');
    }
    // Language filter
    if (_filters.language) {
        entries = entries.filter(([, l]) => l.language === _filters.language || l.language === 'both');
    }
    // Schedule filter
    if (_filters.schedule) {
        entries = entries.filter(([, l]) => l.schedule?.type === _filters.schedule);
    }

    // Sort
    if (_sort === 'newest') {
        entries.sort(([, a], [, b]) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (_sort === 'starting_soon') {
        entries.sort(([, a], [, b]) => {
            const aDate = a.schedule?.date || Infinity;
            const bDate = b.schedule?.date || Infinity;
            return aDate - bDate;
        });
    } else if (_sort === 'most_players') {
        entries.sort(([, a], [, b]) => (b.currentPlayers || 0) - (a.currentPlayers || 0));
    }

    return entries;
}

function _render() {
    const grid = document.getElementById('hub-listings-grid');
    if (!grid) return;

    const entries = _filterAndSort();

    if (entries.length === 0) {
        grid.innerHTML = `<div class="hub-empty-state">${t('hub_no_listings')}</div>`;
        return;
    }

    grid.innerHTML = entries.map(([id, l]) => _renderCard(id, l)).join('');

    // Wire card click events
    grid.querySelectorAll('.hub-listing-card').forEach(card => {
        card.addEventListener('click', e => {
            // Don't open detail if clicking a button
            if (e.target.closest('.hub-join-btn')) return;
            _openDetail(card.dataset.id);
        });
    });

    // Wire join buttons
    grid.querySelectorAll('.hub-join-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const id = btn.closest('.hub-listing-card').dataset.id;
            _handleJoin(id);
        });
    });
}

function _renderCard(id, l) {
    const isFull = l.status === 'full' || (l.currentPlayers || 0) >= (l.maxPlayers || 4);
    const statusClass = isFull ? 'full' : (l.status || 'open');

    // Schedule label
    let schedLabel = t('hub_open_anytime');
    if (l.schedule?.type === 'oneshot' && l.schedule.date) {
        schedLabel = t('hub_starts_at').replace('{date}', new Date(l.schedule.date).toLocaleDateString());
    } else if (l.schedule?.type === 'recurring') {
        const dayKey = 'day_' + ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][l.schedule.dayOfWeek || 0];
        schedLabel = t('hub_every_week').replace('{day}', t(dayKey)).replace('{time}', l.schedule.time || '20:00');
    }

    // Fee label
    const feeLabel = (l.entranceFee && l.entranceFee > 0)
        ? t('hub_paid').replace('{amount}', l.entranceFee)
        : t('hub_free');
    const feeClass = (l.entranceFee && l.entranceFee > 0) ? 'fee' : 'fee free';

    // Join button
    let joinBtnClass = 'hub-join-btn';
    let joinBtnText = '';
    if (isFull) {
        joinBtnClass += ' full';
        joinBtnText = t('hub_full');
    } else if (l.schedule?.type === 'oneshot') {
        joinBtnClass += ' rsvp';
        joinBtnText = t('hub_rsvp_btn');
    } else if (l.accessMode === 'approval') {
        joinBtnClass += ' approval';
        joinBtnText = t('hub_request_btn');
    } else {
        joinBtnClass += ' auto';
        joinBtnText = t('hub_join_btn');
    }

    // Experience label
    const expLabel = l.experienceLevel && l.experienceLevel !== 'all' ? t('hub_' + l.experienceLevel) : t('hub_all_levels');

    // Primary style
    const primaryStyle = (l.gameStyle || [])[0];
    const styleLabel = primaryStyle ? t('hub_style_' + primaryStyle) : '';

    return `
        <div class="hub-listing-card" data-id="${escapeHtml(id)}">
            <span class="hub-status-badge ${statusClass}">${_statusLabel(isFull, l.status)}</span>
            <div class="hub-listing-card-header">
                <div class="hub-listing-card-title">${escapeHtml(l.title)}</div>
                <span class="hub-listing-card-type ${l.type}">${l.type === 'campaign' ? t('hub_campaign_type') : t('hub_quick_room_type')}</span>
            </div>
            <div class="hub-listing-card-dm">
                <span>${t('hub_dm_label')}: ${escapeHtml(l.dmName)}</span>
            </div>
            ${l.description ? `<div class="hub-listing-card-desc">${escapeHtml(l.description)}</div>` : ''}
            <div class="hub-listing-card-meta">
                ${styleLabel ? `<span class="hub-badge style">${styleLabel}</span>` : ''}
                <span class="hub-badge exp">${expLabel}</span>
                <span class="hub-badge lang">${l.language === 'he' ? t('editor_lang_he') : l.language === 'en' ? t('editor_lang_en') : t('editor_lang_both')}</span>
                <span class="hub-badge schedule">${schedLabel}</span>
                <span class="hub-badge ${feeClass}">${feeLabel}</span>
                ${l.ageMin || l.ageMax ? `<span class="hub-badge age">${t('hub_age_range').replace('{min}', l.ageMin || 0).replace('{max}', l.ageMax || '∞')}</span>` : ''}
            </div>
            <div class="hub-listing-card-footer">
                <span class="hub-listing-card-players">${t('hub_players_count').replace('{current}', l.currentPlayers || 0).replace('{max}', l.maxPlayers || 4)}</span>
                <button class="${joinBtnClass}" ${isFull ? 'disabled' : ''}>${joinBtnText}</button>
            </div>
        </div>
    `;
}

function _openDetail(listingId) {
    const l = _allListings[listingId];
    if (!l) return;

    let modal = document.getElementById('listing-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'listing-detail-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:5000;display:none;justify-content:center;align-items:center;';
        document.body.appendChild(modal);
    }

    const isFull = l.status === 'full' || (l.currentPlayers || 0) >= (l.maxPlayers || 4);
    const feeLabel = (l.entranceFee && l.entranceFee > 0) ? t('hub_paid').replace('{amount}', l.entranceFee) : t('hub_free');

    // Schedule display
    let schedDisplay = t('hub_open_anytime');
    if (l.schedule?.type === 'oneshot' && l.schedule.date) {
        schedDisplay = new Date(l.schedule.date).toLocaleString();
    } else if (l.schedule?.type === 'recurring') {
        const dayKey = 'day_' + ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][l.schedule.dayOfWeek || 0];
        schedDisplay = t('hub_every_week').replace('{day}', t(dayKey)).replace('{time}', l.schedule.time || '20:00');
    }

    const expLabel = l.experienceLevel && l.experienceLevel !== 'all' ? t('hub_' + l.experienceLevel) : t('hub_all_levels');
    const stylesStr = (l.gameStyle || []).map(s => t('hub_style_' + s)).join(', ') || '-';
    const tagsStr = (l.tags || []).join(', ') || '-';
    const langLabel = l.language === 'he' ? t('editor_lang_he') : l.language === 'en' ? t('editor_lang_en') : t('editor_lang_both');

    modal.innerHTML = `
        <div class="modal-content listing-detail-modal" style="background:var(--pd-bg-dark,#1a1a2e);border:1px solid rgba(200,135,58,0.3);border-radius:12px;padding:24px;width:90%;max-width:520px;">
            <div class="listing-detail-header">
                <h2>${escapeHtml(l.title)}</h2>
                <button id="detail-close-btn" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;">&times;</button>
            </div>
            <div style="color:#999;font-size:12px;margin-bottom:12px;">${t('hub_dm_label')}: ${escapeHtml(l.dmName)} · ${l.type === 'campaign' ? t('hub_campaign_type') : t('hub_quick_room_type')}</div>
            ${l.description ? `<div class="listing-detail-description">${escapeHtml(l.description)}</div>` : ''}
            <div class="listing-detail-meta-grid">
                <div class="listing-detail-meta-item"><label>${t('hub_detail_players')}</label><span>${(l.currentPlayers || 0)}/${l.maxPlayers || 4}</span></div>
                <div class="listing-detail-meta-item"><label>${t('hub_detail_style')}</label><span>${stylesStr}</span></div>
                <div class="listing-detail-meta-item"><label>${t('hub_detail_experience')}</label><span>${expLabel}</span></div>
                <div class="listing-detail-meta-item"><label>${t('hub_detail_language')}</label><span>${langLabel}</span></div>
                <div class="listing-detail-meta-item"><label>${t('hub_detail_schedule')}</label><span>${schedDisplay}</span></div>
                <div class="listing-detail-meta-item"><label>${t('hub_detail_access')}</label><span>${l.accessMode === 'auto' ? t('hub_auto_join') : t('hub_approval')}</span></div>
                <div class="listing-detail-meta-item"><label>${t('hub_detail_fee')}</label><span>${feeLabel}</span></div>
                ${l.ageMin || l.ageMax ? `<div class="listing-detail-meta-item"><label>${t('hub_detail_age')}</label><span>${l.ageMin || 0}–${l.ageMax || '∞'}</span></div>` : ''}
            </div>
            ${tagsStr !== '-' ? `<div style="color:#777;font-size:11px;margin-bottom:12px;">${t('hub_detail_tags')}: ${escapeHtml(tagsStr)}</div>` : ''}
            <div class="listing-detail-actions">
                <button id="detail-cancel-btn" class="hover-btn" style="background:transparent;color:#ccc;border:1px solid #555;padding:8px 16px;border-radius:6px;">${t('editor_cancel')}</button>
                ${!isFull ? `<button id="detail-join-btn" class="hover-btn" style="background:#e74c3c;color:white;padding:8px 20px;border-radius:6px;font-weight:bold;">${l.accessMode === 'approval' ? t('hub_request_btn') : t('hub_join_btn')}</button>` : ''}
            </div>
        </div>
    `;
    modal.style.display = 'flex';

    document.getElementById('detail-close-btn').addEventListener('click', () => { modal.style.display = 'none'; });
    document.getElementById('detail-cancel-btn').addEventListener('click', () => { modal.style.display = 'none'; });
    const joinBtn = document.getElementById('detail-join-btn');
    if (joinBtn) {
        joinBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            _handleJoin(listingId);
        });
    }
}

async function _handleJoin(listingId) {
    const l = _allListings[listingId];
    if (!l) return;

    // Age gate check
    if (l.ageMin || l.ageMax) {
        if (!hasProfileBirthYear()) {
            if (window.showToast) window.showToast(t('hub_err_birth_year_required'), 'warning');
            openProfileEditor(_uid);
            return;
        }
        const birthYear = getProfileBirthYear();
        const age = new Date().getFullYear() - birthYear;
        if ((l.ageMin && age < l.ageMin) || (l.ageMax && age > l.ageMax)) {
            if (window.showToast) window.showToast(
                t('hub_err_age_restricted').replace('{min}', l.ageMin || 0).replace('{max}', l.ageMax || '∞'),
                'error'
            );
            return;
        }
    }

    // Full check
    if ((l.currentPlayers || 0) >= (l.maxPlayers || 4)) {
        if (window.showToast) window.showToast(t('hub_err_listing_full'), 'error');
        return;
    }

    // RSVP for one-shots
    if (l.schedule?.type === 'oneshot') {
        try {
            await rsvpToListing(listingId, _uid, { name: _userName, rsvpAt: Date.now() });
            if (window.showToast) window.showToast(t('hub_detail_rsvp_confirmed'), 'success');
        } catch (e) {
            if (window.showToast) window.showToast(t('hub_err_join_failed'), 'error');
        }
        return;
    }

    // Campaign with approval
    if (l.type === 'campaign' && l.accessMode === 'approval') {
        try {
            await requestCampaignAccess(l.roomCode, _uid, _userName, '');
            if (window.showToast) window.showToast(t('hub_detail_request_sent'), 'success');
        } catch (e) {
            if (window.showToast) window.showToast(t('hub_err_join_failed'), 'error');
        }
        return;
    }

    // Auto-join: fill the room code input and trigger join
    const roomInput = document.getElementById('room-code-input');
    if (roomInput) {
        roomInput.value = l.roomCode;
        // Switch to quick-room tab and focus the join button
        const quickTab = document.getElementById('tab-quick-room');
        if (quickTab) quickTab.click();
        // Trigger visual feedback
        roomInput.focus();
        if (window.showToast) window.showToast(t('hub_detail_join_confirm'), 'info');
    }
}

function _renderLFG(players) {
    const section = document.getElementById('hub-lfg-section');
    const grid = document.getElementById('hub-lfg-grid');
    if (!section || !grid) return;

    const entries = Object.entries(players || {}).filter(([uid]) => uid !== _uid);
    if (entries.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    grid.innerHTML = entries.map(([uid, p]) => {
        const stylesStr = (p.preferredStyles || []).map(s => t('hub_style_' + s)).join(', ') || '-';
        const expLabel = p.experienceLevel ? t('hub_' + p.experienceLevel) : '';
        return `
            <div class="lfg-player-card" data-uid="${escapeHtml(uid)}">
                <img src="${escapeHtml(p.avatar || '/assets/icons/toolbar/campaign.png')}" alt="">
                <div class="lfg-player-info">
                    <div class="name">${escapeHtml(p.displayName)}</div>
                    <div class="meta">${expLabel}${expLabel && stylesStr !== '-' ? ' · ' : ''}${stylesStr !== '-' ? stylesStr : ''}</div>
                </div>
            </div>
        `;
    }).join('');
}

/** Cleanup listeners. */
export function destroyCommunityHub() {
    if (_unsubListings) { _unsubListings(); _unsubListings = null; }
    if (_unsubLFG) { _unsubLFG(); _unsubLFG = null; }
}
