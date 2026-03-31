// accountDashboard.js — Account Dashboard (Profile, Settings, Billing, Mechanics)
import { escapeHtml } from './core/sanitize.js';
import { t, setLanguage, getLang, updateDOM } from './i18n.js';
import { iconImg } from './iconMap.js';
import {
    logoutUser, listenToUserCharacters,
    getUserPreferences, setUserPreference,
    getCampaignMechanics, setCampaignMechanic
} from './firebaseService.js';
import { getCurrentSub, onSubscriptionChange } from './subscriptionService.js';
import { getAuth } from 'firebase/auth';
import { getApp } from 'firebase/app';

// ── State ──
let _uid = null;
let _user = null;        // Firebase Auth user
let _prefs = {};
let _subResolved = null;  // from resolveAccess()
let _activeCampaignId = null;
let _isDM = false;
let _charCount = 0;

// ── Default preferences ──
const PREF_DEFAULTS = {
    language: 'he',
    diceColor: '#c8873a',
    diceScale: 'medium',
    compactTracker: false,
    showHpNumbers: true,
    autoScrollLog: true,
    soundEffects: true,
    reducedAnimations: false,
    toastDuration: 3000,
};

// ── Mechanic keys with defaults ──
const MECHANICS = [
    { key: 'feats',              default: true },
    { key: 'multiclassing',      default: false },
    { key: 'flanking',           default: false },
    { key: 'variantEncumbrance', default: false },
    { key: 'grittyRealism',      default: false },
    { key: 'bonusActionPotions', default: false },
    { key: 'milestoneLeveling',  default: false },
    { key: 'maxCritDice',        default: false },
    { key: 'lingeringInjuries',  default: false },
    { key: 'cleave',             default: false },
];

// i18n key map for mechanics
const MECH_I18N = {
    feats:              'acct_mech_feats',
    multiclassing:      'acct_mech_multiclass',
    flanking:           'acct_mech_flanking',
    variantEncumbrance: 'acct_mech_encumbrance',
    grittyRealism:      'acct_mech_gritty',
    bonusActionPotions: 'acct_mech_ba_potions',
    milestoneLeveling:  'acct_mech_milestone',
    maxCritDice:        'acct_mech_max_crit',
    lingeringInjuries:  'acct_mech_lingering',
    cleave:             'acct_mech_cleave',
};

// ================================================================
// Init & Open/Close
// ================================================================

export function initDashboard(uid, user) {
    _uid = uid;
    _user = user;

    // Listen to char count
    listenToUserCharacters(uid, chars => {
        _charCount = chars ? Object.keys(chars).length : 0;
    });

    // Listen to subscription
    _subResolved = getCurrentSub();
    onSubscriptionChange(resolved => {
        _subResolved = resolved;
    });

    // Load preferences from Firebase (with localStorage migration)
    _loadAndApplyPrefs(uid);

    // Wire close & tabs
    document.getElementById('acct-close-btn')?.addEventListener('click', closeDashboard);
    document.getElementById('acct-logout-btn')?.addEventListener('click', async () => {
        closeDashboard();
        window.dispatchEvent(new CustomEvent('paradice:logout'));
        await logoutUser();
    });

    const modal = document.getElementById('account-dashboard-modal');
    modal?.addEventListener('click', e => {
        if (e.target === modal) closeDashboard();
    });

    document.querySelectorAll('.acct-tab').forEach(tab => {
        tab.addEventListener('click', () => _switchTab(tab.dataset.acctTab));
    });

    // Wire settings controls
    _wireSettingsControls(uid);
}

export function openDashboard(campaignId, isDM) {
    _activeCampaignId = campaignId || null;
    _isDM = !!isDM;

    const auth = getAuth(getApp());
    _user = auth.currentUser;
    _uid = _user?.uid;

    // Refresh header
    const avatarEl = document.getElementById('acct-avatar');
    const nameEl = document.getElementById('acct-display-name');
    const emailEl = document.getElementById('acct-email');
    if (avatarEl) avatarEl.src = _user?.photoURL || '/assets/icons/toolbar/campaign.png';
    if (nameEl) nameEl.textContent = _user?.displayName || '';
    if (emailEl) emailEl.textContent = _user?.email || '';

    // Tier badge
    _renderTierBadge();

    // Render panels
    _renderProfile();
    _renderSettingsState();
    _renderBilling();
    _renderMechanics();

    // Show modal
    const modal = document.getElementById('account-dashboard-modal');
    if (modal) {
        modal.classList.add('open');
        // Focus first tab for keyboard nav
        modal.querySelector('.acct-tab.active')?.focus();
    }

    // ESC to close
    document.addEventListener('keydown', _onEsc);
}

export function closeDashboard() {
    document.getElementById('account-dashboard-modal')?.classList.remove('open');
    document.removeEventListener('keydown', _onEsc);
}

function _onEsc(e) {
    if (e.key === 'Escape') closeDashboard();
}

// ================================================================
// Tab switching
// ================================================================

function _switchTab(tabName) {
    document.querySelectorAll('.acct-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.acctTab === tabName));
    document.querySelectorAll('.acct-panel').forEach(p => p.classList.toggle('active', p.id === `acct-panel-${tabName}`));
}

// ================================================================
// Tier badge
// ================================================================

function _renderTierBadge() {
    const badge = document.getElementById('acct-tier-badge');
    if (!badge) return;
    const tier = _subResolved?.tier || 'player';
    badge.className = `acct-tier-badge tier-${tier}`;
    const tierKeys = { player: 'acct_tier_player', dm: 'acct_tier_dm', founder: 'acct_tier_founder' };
    badge.textContent = t(tierKeys[tier] || 'acct_tier_player');
}

// ================================================================
// Profile panel
// ================================================================

function _renderProfile() {
    const container = document.getElementById('acct-profile-stats');
    if (!container) return;

    const createdAt = _user?.metadata?.creationTime
        ? new Date(_user.metadata.creationTime).toLocaleDateString(getLang() === 'he' ? 'he-IL' : 'en-US')
        : '—';

    container.innerHTML = `
        <div class="acct-stat-row">
            <span class="acct-stat-label">${t('acct_display_name')}</span>
            <span class="acct-stat-value">${escapeHtml(_user?.displayName || '—')}</span>
        </div>
        <div class="acct-stat-row">
            <span class="acct-stat-label">${t('acct_email')}</span>
            <span class="acct-stat-value">${escapeHtml(_user?.email || '—')}</span>
        </div>
        <div class="acct-stat-row">
            <span class="acct-stat-label">${t('acct_member_since')}</span>
            <span class="acct-stat-value">${createdAt}</span>
        </div>
        <div class="acct-stat-row">
            <span class="acct-stat-label">${t('acct_chars_count')}</span>
            <span class="acct-stat-value">${_charCount}</span>
        </div>
        <div class="acct-stat-row">
            <span class="acct-stat-label">${t('acct_current_plan')}</span>
            <span class="acct-stat-value">${_planLabel()}</span>
        </div>
    `;
}

// ================================================================
// Settings panel
// ================================================================

function _renderSettingsState() {
    // Language
    const langRadios = document.querySelectorAll('input[name="acct-lang"]');
    langRadios.forEach(r => { r.checked = r.value === (_prefs.language || getLang()); });

    // Dice color
    const colorInput = document.getElementById('acct-dice-color');
    if (colorInput) colorInput.value = _prefs.diceColor || PREF_DEFAULTS.diceColor;

    // Dice scale
    const scaleSelect = document.getElementById('acct-dice-scale');
    if (scaleSelect) scaleSelect.value = _prefs.diceScale || PREF_DEFAULTS.diceScale;

    // Toggles
    _setToggle('acct-compact-tracker', _prefs.compactTracker);
    _setToggle('acct-show-hp', _prefs.showHpNumbers ?? PREF_DEFAULTS.showHpNumbers);
    _setToggle('acct-auto-scroll', _prefs.autoScrollLog ?? PREF_DEFAULTS.autoScrollLog);
    _setToggle('acct-sound-fx', _prefs.soundEffects ?? PREF_DEFAULTS.soundEffects);
    _setToggle('acct-reduced-anim', _prefs.reducedAnimations);

    // Toast duration
    const toastSelect = document.getElementById('acct-toast-duration');
    if (toastSelect) toastSelect.value = String(_prefs.toastDuration || PREF_DEFAULTS.toastDuration);
}

function _setToggle(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
}

function _wireSettingsControls(uid) {
    // Language
    document.querySelectorAll('input[name="acct-lang"]').forEach(r => {
        r.addEventListener('change', () => {
            if (!r.checked) return;
            setLanguage(r.value);
            setUserPreference(uid, 'language', r.value);
            _prefs.language = r.value;
            updateDOM();
            // Re-render panels that use t()
            _renderProfile();
            _renderBilling();
            _renderMechanics();
            _renderTierBadge();
        });
    });

    // Dice color
    document.getElementById('acct-dice-color')?.addEventListener('input', _debounce(e => {
        const color = e.target.value;
        _prefs.diceColor = color;
        setUserPreference(uid, 'diceColor', color);
        // Apply dice color if diceBox is available
        if (window._diceBox) window._diceBox.updateConfig({ themeColor: color });
    }, 300));

    // Dice scale
    document.getElementById('acct-dice-scale')?.addEventListener('change', e => {
        _prefs.diceScale = e.target.value;
        setUserPreference(uid, 'diceScale', e.target.value);
    });

    // Toggle wiring
    const toggles = [
        { id: 'acct-compact-tracker', key: 'compactTracker' },
        { id: 'acct-show-hp',        key: 'showHpNumbers' },
        { id: 'acct-auto-scroll',    key: 'autoScrollLog' },
        { id: 'acct-sound-fx',       key: 'soundEffects' },
        { id: 'acct-reduced-anim',   key: 'reducedAnimations' },
    ];
    toggles.forEach(({ id, key }) => {
        document.getElementById(id)?.addEventListener('change', e => {
            _prefs[key] = e.target.checked;
            setUserPreference(uid, key, e.target.checked);
            applyPreferences(_prefs);
        });
    });

    // Toast duration
    document.getElementById('acct-toast-duration')?.addEventListener('change', e => {
        const val = parseInt(e.target.value, 10);
        _prefs.toastDuration = val;
        setUserPreference(uid, 'toastDuration', val);
    });
}

// ================================================================
// Billing panel
// ================================================================

function _renderBilling() {
    const container = document.getElementById('acct-billing-content');
    if (!container) return;

    const tier = _subResolved?.tier || 'player';
    const statusKey = _subResolved?.inTrial ? 'acct_status_trial'
        : _subResolved?.inGrace ? 'acct_status_grace'
        : _subResolved?.isActive ? 'acct_status_active'
        : 'acct_status_expired';
    const daysLeft = _subResolved?.daysLeft || 0;

    let statusLine = t(statusKey);
    if (daysLeft > 0 && (_subResolved?.inTrial || _subResolved?.inGrace)) {
        statusLine += ` — ${t('acct_days_left').replace('{days}', daysLeft)}`;
    }

    const tierIcons = { player: iconImg('🛡️','36px'), dm: iconImg('🏰','36px'), founder: iconImg('⚔️','36px') };
    const tierColors = { player: '#ccc', dm: '#f1c40f', founder: '#d7bde2' };
    const tierKeys = { player: 'acct_tier_player', dm: 'acct_tier_dm', founder: 'acct_tier_founder' };

    container.innerHTML = `
        <div style="text-align:center; padding:12px 0;">
            <div style="font-size:36px;">${tierIcons[tier]}</div>
            <div style="font-size:18px; font-weight:800; color:${tierColors[tier]}; margin:6px 0;">${t(tierKeys[tier])}</div>
            <div style="color:#888; font-size:13px;">${statusLine}</div>
            <div style="color:#666; font-size:12px; margin-top:4px;">${t('acct_current_plan')}: ${_planLabel()}</div>
        </div>

        <div class="acct-section-title">${t('acct_feature_chars')}</div>
        <div class="acct-features-grid">
            ${_featureCol('player', tier)}
            ${_featureCol('dm', tier)}
            ${_featureCol('founder', tier)}
        </div>

        ${tier === 'player' ? `<button class="acct-btn acct-btn-upgrade" id="acct-upgrade-btn">${t('acct_upgrade_btn')}</button>` : ''}
        ${tier !== 'player' ? `<button class="acct-btn acct-btn-manage" id="acct-manage-btn">${t('acct_manage_sub')}</button>` : ''}
        <div style="text-align:center; color:#555; font-size:11px; margin-top:10px;">${t('acct_receipts_note')}</div>
    `;

    document.getElementById('acct-upgrade-btn')?.addEventListener('click', () => {
        if (window._startCheckout) window._startCheckout('monthly');
    });
    document.getElementById('acct-manage-btn')?.addEventListener('click', () => {
        window.open('https://danielrigbi.co.il/account/my-subscriptions', '_blank');
    });
}

function _featureCol(colTier, currentTier) {
    const tierKeys = { player: 'acct_tier_player', dm: 'acct_tier_dm', founder: 'acct_tier_founder' };
    const limits = {
        player:  { chars: '3', campaigns: '0', rooms: '—', ai: '—' },
        dm:      { chars: t('acct_unlimited'), campaigns: '5', rooms: '✓', ai: '✓' },
        founder: { chars: t('acct_unlimited'), campaigns: t('acct_unlimited'), rooms: '✓', ai: '✓' },
    };
    const l = limits[colTier];
    const isCurrent = colTier === currentTier;
    return `
        <div class="acct-feature-col ${isCurrent ? 'current' : ''}">
            <div class="acct-feature-tier" style="color:${colTier === 'dm' ? '#f1c40f' : colTier === 'founder' ? '#d7bde2' : '#ccc'}">${t(tierKeys[colTier])}</div>
            <div class="acct-feature-item">${t('acct_feature_chars')}: ${l.chars}</div>
            <div class="acct-feature-item">${t('acct_feature_campaigns')}: ${l.campaigns}</div>
            <div class="acct-feature-item">${t('acct_feature_rooms')}: ${l.rooms}</div>
            <div class="acct-feature-item">${t('acct_feature_ai')}: ${l.ai}</div>
        </div>
    `;
}

// ================================================================
// Mechanics panel
// ================================================================

async function _renderMechanics() {
    const container = document.getElementById('acct-mechanics-content');
    if (!container) return;

    if (!_activeCampaignId) {
        container.innerHTML = `<p style="color:#888; text-align:center; padding:20px 0;">${t('acct_mech_no_campaign')}</p>`;
        return;
    }

    const mechanics = await getCampaignMechanics(_activeCampaignId);

    let html = `<p style="color:#888; font-size:12px; margin-bottom:12px;">${t('acct_mech_intro')}</p>`;
    if (!_isDM) {
        html += `<p style="color:#666; font-size:11px; font-style:italic; margin-bottom:12px;">${t('acct_mech_read_only')}</p>`;
    }

    MECHANICS.forEach(m => {
        const val = mechanics[m.key] !== undefined ? mechanics[m.key] : m.default;
        const nameKey = MECH_I18N[m.key];
        const descKey = nameKey + '_desc';
        html += `
            <div class="acct-mechanic-card">
                <div style="flex:1; min-width:0;">
                    <div class="acct-mechanic-name">${t(nameKey)}</div>
                    <div class="acct-mechanic-desc">${t(descKey)}</div>
                </div>
                <label class="acct-toggle">
                    <input type="checkbox" data-mech-key="${m.key}" ${val ? 'checked' : ''} ${!_isDM ? 'disabled' : ''}>
                    <span class="acct-toggle-track"></span>
                </label>
            </div>
        `;
    });

    container.innerHTML = html;

    // Wire mechanic toggles (DM only)
    if (_isDM && _activeCampaignId) {
        container.querySelectorAll('input[data-mech-key]').forEach(input => {
            input.addEventListener('change', () => {
                setCampaignMechanic(_activeCampaignId, input.dataset.mechKey, input.checked);
            });
        });
    }
}

// ================================================================
// Preferences load/apply
// ================================================================

async function _loadAndApplyPrefs(uid) {
    // Load from Firebase
    let fbPrefs = {};
    try {
        fbPrefs = await getUserPreferences(uid);
    } catch (e) {
        console.warn('[AcctDash] Failed to load prefs from Firebase:', e.message);
    }

    // Migrate localStorage language if no Firebase pref exists
    if (!fbPrefs.language) {
        const lsLang = localStorage.getItem('critroll_lang');
        if (lsLang && lsLang !== PREF_DEFAULTS.language) {
            fbPrefs.language = lsLang;
            setUserPreference(uid, 'language', lsLang);
        }
    }

    _prefs = { ...PREF_DEFAULTS, ...fbPrefs };

    // Apply
    applyPreferences(_prefs);

    // Cache to localStorage for offline fallback
    try { localStorage.setItem('paradice_prefs', JSON.stringify(_prefs)); } catch { /* quota */ }
}

export function applyPreferences(prefs) {
    if (!prefs) return;

    // Language
    if (prefs.language && prefs.language !== getLang()) {
        setLanguage(prefs.language);
    }

    // Reduced animations
    if (prefs.reducedAnimations) {
        document.documentElement.classList.add('reduce-motion');
    } else {
        document.documentElement.classList.remove('reduce-motion');
    }

    // Dice color
    if (prefs.diceColor && window._diceBox) {
        window._diceBox.updateConfig({ themeColor: prefs.diceColor });
    }

    // Store globally for other modules to read
    window._paradicePrefs = prefs;
}

export function getPreference(key) {
    return _prefs[key] ?? PREF_DEFAULTS[key];
}

// ================================================================
// Helpers
// ================================================================

function _planLabel() {
    const plan = _subResolved?.plan;
    if (!plan) return t('acct_plan_free');
    const planKeys = { monthly: 'acct_plan_monthly', yearly: 'acct_plan_yearly', lifetime: 'acct_plan_lifetime' };
    return t(planKeys[plan] || 'acct_plan_free');
}

function _debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}
