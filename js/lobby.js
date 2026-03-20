// lobby.js - Welcome screen and Authentication Controller
// lobby.js v130 (S14: portrait upload via Firebase Storage)
import * as db from "./firebaseService.js";
import { uploadPortrait } from "./firebaseService.js"; // S14: direct import
import { startGame, setUid } from "./app.js";
import { setLanguage, getLang, t, updateDOM } from "./i18n.js";
import { tmt2mtPlayerTokens } from "./tmt.js";
import { initCampaigns } from "./campaign.js";
import { compute } from "./engine/charEngine.js";
import { SUBCLASS_MECHANICS, BACKGROUND_MECHANICS, FEAT_MECHANICS, ARMOR_TABLE } from "../data/mechanics.js";
import { CLASS_ICONS, classIconImg, iconImg } from './iconMap.js';

const langToggleBtn = document.getElementById('lang-toggle-btn');
langToggleBtn.innerText = getLang() === 'he' ? 'English' : 'עברית';
langToggleBtn.onclick = () => {
    const newLang = getLang() === 'he' ? 'en' : 'he';
    setLanguage(newLang);
    langToggleBtn.innerText = newLang === 'he' ? 'English' : 'עברית';
    if(currentUserUid) { renderVault(currentVaultCharacters); }
};

const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const loginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');

// Wire the Google login button
if (loginBtn) {
    loginBtn.onclick = () => {
        db.loginWithGoogle().catch(err => {
            console.error('Login error:', err);
            if (typeof showToast === 'function') showToast(t('alert_login_fail'), 'warning');
        });
    };
}

// Pick up any pending Google redirect result (mobile fallback flow).
// popup-first means this rarely fires, but it's the safety net.
db.checkRedirectResult().then(result => {
    if (result?.user) {
        // onAuthStateChanged will fire automatically — nothing else needed
        console.log('[Auth] Redirect sign-in resolved:', result.user.email);
    }
}).catch(err => {
    console.warn('[Auth] checkRedirectResult failed:', err?.code);
    // Show user-visible error if the auth loop persists
    const authErr = document.getElementById('auth-error');
    if (authErr) {
        authErr.textContent = t('alert_login_fail');
        authErr.style.display = 'block';
    }
});
const userDisplayName = document.getElementById('user-display-name');
const userEmail = document.getElementById('user-email');
const userAvatar = document.getElementById('user-avatar');
const builderModal = document.getElementById('char-builder-modal');
const closeBuilderBtn = document.getElementById('close-builder-btn');
const saveCharBtn = document.getElementById('save-char-btn');
const vaultList = document.getElementById('vault-list');
const newCharBtn = document.getElementById('new-char-btn');
const addAttackBtn = document.getElementById('add-custom-attack-btn');
const attacksList = document.getElementById('custom-attacks-list');

let currentEditCharId = null;

const tabPreset = document.getElementById('tab-portrait-preset');
const tabTmt   = document.getElementById('tab-portrait-2mt');
const tabUrl = document.getElementById('tab-portrait-url');
const tabFile = document.getElementById('tab-portrait-file');
const areaPreset = document.getElementById('portrait-preset-area');
const areaTmt  = document.getElementById('portrait-2mt-area');
const areaUrl = document.getElementById('portrait-url-area');
const areaFile = document.getElementById('portrait-file-area');
const previewImg = document.getElementById('portrait-preview');
const inputUrl = document.getElementById('cb-portrait-url');
const inputFile = document.getElementById('cb-portrait-file');

const TMT_DEFAULT = 'https://tools.2minutetabletop.com/token-editor/token-uploads/humanoid/humanfighter3/preview.png';
let selectedPortrait = TMT_DEFAULT;

function _isTmtUrl(url) { return typeof url === 'string' && url.includes('tools.2minutetabletop.com'); }
function _setPreview(url) {
    selectedPortrait = url;
    if (!previewImg) return;
    previewImg.src = url;
    previewImg.style.borderRadius = _isTmtUrl(url) ? '0' : '50%';
    previewImg.style.background   = _isTmtUrl(url) ? 'transparent' : '#222';
}

function switchPortraitTab(activeTab, activeArea) {
    [tabPreset, tabTmt, tabUrl, tabFile].forEach(t => t && t.classList.remove('active'));
    [areaPreset, areaTmt, areaUrl, areaFile].forEach(a => a && (a.style.display = 'none'));
    activeTab.classList.add('active');
    activeArea.style.display = 'flex';
}

if(tabPreset) tabPreset.onclick = () => switchPortraitTab(tabPreset, areaPreset);
if(tabTmt)   tabTmt.onclick   = () => { switchPortraitTab(tabTmt, areaTmt); _refreshTmtTab(); };
if(tabUrl) tabUrl.onclick = () => switchPortraitTab(tabUrl, areaUrl);
if(tabFile) tabFile.onclick = () => switchPortraitTab(tabFile, areaFile);

// Token Art is the default tab
if(tabTmt && areaTmt) switchPortraitTab(tabTmt, areaTmt);

document.querySelectorAll('.builder-portrait-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.builder-portrait-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _setPreview(btn.src);
    };
});

// ── Dynamic 2MT tab: refresh tokens when class/race/gender changes ─────────────
function _refreshTmtTab() {
    if (!areaTmt) return;
    const cls    = document.getElementById('cb-class')?.value  || '';
    const race   = document.getElementById('cb-race')?.value   || '';
    const gender = document.getElementById('cb-gender')?.value || 'male';
    const urls   = tmt2mtPlayerTokens(cls, race, gender);
    if (!urls.length) return;

    // Replace the dynamic section inside areaTmt (keep attribution header)
    const header = areaTmt.querySelector('.tmt-attr');
    const dyn    = areaTmt.querySelector('.tmt-dynamic');
    if (!dyn) return;

    const label  = [cls, race, gender].filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' · ');
    dyn.innerHTML = `
        <div style="font-size:9px;color:#aaa;text-align:center;letter-spacing:.5px;margin-bottom:3px;">${label}</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center;">
            ${urls.map(u => `<img src="${u}" data-src="${u}" class="builder-portrait-btn tmt"
                onerror="this.style.display='none'" loading="lazy" title="${cls} ${race}">`).join('')}
        </div>`;

    dyn.querySelectorAll('.builder-portrait-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.builder-portrait-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _setPreview(btn.dataset.src);
        };
    });
}

// Listen for class/race/gender changes to update portrait tab + subclass dropdown
['cb-class','cb-race','cb-gender'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
        if (tabTmt?.classList.contains('active')) _refreshTmtTab();
        if (id === 'cb-class') _populateSubclassDropdown();
        _updateAcPreview();
    });
});

// Equipment changes → live AC preview
['cb-armor','cb-shield'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', _updateAcPreview);
});
document.getElementById('cb-background')?.addEventListener('change', _updateBackgroundSkillsPreview);
document.getElementById('cb-subclass')?.addEventListener('change', () => {
    _updateSubclassChoicesUI(document.getElementById('cb-subclass')?.value || '', {});
});
document.getElementById('cb-add-feat-btn')?.addEventListener('click', _openFeatPicker);
document.getElementById('feat-search')?.addEventListener('input', e => _renderFeatList(e.target.value));

// ── Wizard Navigation ──────────────────────────────────────────────────
const _WIZ_TOTAL = 5;
let _wizStep = 1;

function _gotoStep(n) {
    if (n < 1 || n > _WIZ_TOTAL) return;
    _wizStep = n;
    document.querySelectorAll('.cb-wizard-step').forEach(el => {
        el.classList.toggle('active', +el.dataset.step === n);
    });
    document.querySelectorAll('.cb-step-dot').forEach(el => {
        const s = +el.dataset.step;
        el.classList.toggle('active', s === n);
        el.classList.toggle('done', s < n);
    });
    const back = document.getElementById('cb-back-btn');
    if (back) back.style.visibility = n === 1 ? 'hidden' : 'visible';
    const nextBtn = document.getElementById('cb-next-btn');
    const saveBtn = document.getElementById('save-char-btn');
    if (nextBtn) nextBtn.style.display = n < _WIZ_TOTAL ? '' : 'none';
    if (saveBtn) saveBtn.style.display = n === _WIZ_TOTAL ? '' : 'none';
    const counter = document.getElementById('cb-step-counter');
    if (counter) counter.textContent = `${n} / ${_WIZ_TOTAL}`;
    document.querySelector(`.cb-wizard-step[data-step="${n}"]`)?.scrollTo(0, 0);
    _applySmartDefaults();
}

function _validateStep(n) {
    if (n === 1) {
        const name = document.getElementById('cb-name')?.value.trim();
        if (!name) { _shakeAndFocus('cb-name'); return false; }
    }
    if (n === 2) {
        const cls = document.getElementById('cb-class')?.value;
        if (!cls) { _shakeAndFocus('cb-class-grid'); return false; }
    }
    return true;
}

function _shakeAndFocus(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.animation = 'cb-shake 0.4s';
    el.focus?.();
    setTimeout(() => { el.style.animation = ''; }, 450);
}

document.getElementById('cb-next-btn')?.addEventListener('click', () => {
    if (_validateStep(_wizStep)) _gotoStep(_wizStep + 1);
});
document.getElementById('cb-back-btn')?.addEventListener('click', () => _gotoStep(_wizStep - 1));

// ── Smart Auto-fills ───────────────────────────────────────────────────
const _CLASS_HIT_DIE = {
    barbarian:12, fighter:10, paladin:10, ranger:10,
    monk:8, bard:8, cleric:8, druid:8, rogue:8, warlock:8,
    sorcerer:6, wizard:6
};
const _CLASS_SAVE_PROFS = {
    barbarian:['str','con'], fighter:['str','con'], monk:['str','dex'],
    ranger:['str','dex'], rogue:['dex','int'], bard:['dex','cha'],
    cleric:['wis','cha'], druid:['int','wis'], paladin:['wis','cha'],
    sorcerer:['con','cha'], warlock:['wis','cha'], wizard:['int','wis']
};
const _CASTER_CLASSES = new Set(['bard','cleric','druid','paladin','ranger','sorcerer','warlock','wizard']);
const _RACE_DARKVISION = {
    'high-elf':60,'wood-elf':60,'dark-elf':120,'hill-dwarf':60,'mountain-dwarf':60,
    'half-elf':60,'half-orc':60,'tiefling':60,'aasimar':60,'forest-gnome':60,'rock-gnome':60
};
const _SLOW_RACES = new Set(['hill-dwarf','mountain-dwarf','lightfoot-halfling','stout-halfling','forest-gnome','rock-gnome']);

function _abMod(score) { return Math.floor(((+score || 10) - 10) / 2); }
function _abSign(n) { return n >= 0 ? `+${n}` : `${n}`; }

function _applySmartDefaults() {
    const cls   = (document.getElementById('cb-class')?.value || '').toLowerCase();
    const race  = document.getElementById('cb-race')?.value || '';
    const level = +(document.getElementById('cb-level')?.value) || 1;
    const pb    = Math.ceil(level / 4) + 1;

    // Proficiency bonus + Hit die display
    const pbDisp = document.getElementById('cb-prof-bonus-display');
    if (pbDisp) pbDisp.textContent = `+${pb}`;
    const hdDisp = document.getElementById('cb-hit-die-display');
    if (hdDisp) hdDisp.textContent = _CLASS_HIT_DIE[cls] ? `d${_CLASS_HIT_DIE[cls]}` : '—';

    // Ability modifier badges
    ['str','dex','con','int','wis','cha'].forEach(ab => {
        const val = document.getElementById(`cb-${ab}`)?.value;
        const el  = document.getElementById(`cb-${ab}-mod`);
        if (!el) return;
        const m = _abMod(val);
        el.textContent = _abSign(m);
        el.className = `cb-ability-mod${m > 0 ? ' positive' : m < 0 ? ' negative' : ''}`;
    });

    // Initiative ← DEX mod (if not manually edited)
    const initEl = document.getElementById('cb-init');
    if (initEl && !initEl.dataset.manuallyEdited) {
        initEl.value = _abMod(document.getElementById('cb-dex')?.value);
        const badge = document.getElementById('cb-init-auto-badge');
        if (badge) badge.style.display = 'inline-block';
    }

    // Passive Perception ← 10 + WIS mod + perception prof bonus
    const ppEl = document.getElementById('cb-pp');
    if (ppEl && !ppEl.dataset.manuallyEdited) {
        const percProf = document.getElementById('cb-skill-perception')?.value || '';
        const percBonus = percProf === 'expert' ? pb * 2 : percProf === 'prof' ? pb : 0;
        ppEl.value = 10 + _abMod(document.getElementById('cb-wis')?.value) + percBonus;
        const badge = document.getElementById('cb-pp-auto-badge');
        if (badge) badge.style.display = 'inline-block';
    }

    // Darkvision ← race (if not manually edited)
    const dvEl = document.getElementById('cb-darkvision');
    if (dvEl && !dvEl.dataset.manuallyEdited) {
        dvEl.value = _RACE_DARKVISION[race] || 0;
        const badge = document.getElementById('cb-darkvision-auto-badge');
        if (badge) badge.style.display = _RACE_DARKVISION[race] ? 'inline-block' : 'none';
    }

    // Speed ← race (if not manually edited)
    const spEl = document.getElementById('cb-speed');
    if (spEl && !spEl.dataset.manuallyEdited) {
        spEl.value = _SLOW_RACES.has(race) ? 25 : 30;
        const badge = document.getElementById('cb-speed-auto-badge');
        if (badge) badge.style.display = 'inline-block';
    }

    // Show/hide spell slots section
    const spellSec = document.getElementById('cb-spell-slots-section');
    if (spellSec) spellSec.style.display = _CASTER_CLASSES.has(cls) ? '' : 'none';

    // Race traits preview
    const racePreview = document.getElementById('cb-race-traits-preview');
    if (racePreview) {
        const dv = _RACE_DARKVISION[race];
        const sp = _SLOW_RACES.has(race) ? 25 : 30;
        racePreview.textContent = race ? `Speed: ${sp}ft${dv ? ` · Darkvision: ${dv}ft` : ''}` : '';
    }

    // Auto-check class saving throw profs — only if ALL saves currently unchecked
    const saves = ['str','dex','con','int','wis','cha'];
    const anySaveChecked = saves.some(ab => document.getElementById(`cb-save-${ab}`)?.checked);
    if (!anySaveChecked && _CLASS_SAVE_PROFS[cls]) {
        _CLASS_SAVE_PROFS[cls].forEach(ab => {
            const el = document.getElementById(`cb-save-${ab}`);
            if (el) el.checked = true;
        });
    }
}

// Prevent auto-overwrite when user manually edits these fields
['cb-init','cb-pp','cb-darkvision','cb-speed'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', function () {
        this.dataset.manuallyEdited = '1';
        const badge = document.getElementById(`${id}-auto-badge`);
        if (badge) badge.style.display = 'none';
    });
});

// Re-run defaults when key fields change
['cb-class','cb-race','cb-level','cb-str','cb-dex','cb-con','cb-int','cb-wis','cb-cha','cb-skill-perception'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', _applySmartDefaults);
    document.getElementById(id)?.addEventListener('input', _applySmartDefaults);
});

// HP auto-calculate button
document.getElementById('cb-hp-auto-btn')?.addEventListener('click', () => {
    const cls    = (document.getElementById('cb-class')?.value || '').toLowerCase();
    const level  = +(document.getElementById('cb-level')?.value) || 1;
    const hd     = _CLASS_HIT_DIE[cls] || 8;
    const conMod = _abMod(document.getElementById('cb-con')?.value);
    const avg    = Math.floor(hd / 2) + 1;
    const hp     = hd + conMod + (level - 1) * (avg + conMod);
    const hpEl   = document.getElementById('cb-hp');
    if (hpEl) hpEl.value = Math.max(1, hp);
});

// ── Class Card Grid ────────────────────────────────────────────────────
const _CLASS_CARDS = [
    { value:'Barbarian', icon:'barbarian' }, { value:'Bard',     icon:'bard' },
    { value:'Cleric',    icon:'cleric' },    { value:'Druid',    icon:'druid' },
    { value:'Fighter',   icon:'fighter' },   { value:'Monk',     icon:'monk' },
    { value:'Paladin',   icon:'paladin' },   { value:'Ranger',   icon:'ranger' },
    { value:'Rogue',     icon:'rogue' },     { value:'Sorcerer', icon:'sorcerer' },
    { value:'Warlock',   icon:'warlock' },   { value:'Wizard',   icon:'wizard' },
];

function _renderClassCards(selectedValue = '') {
    const grid = document.getElementById('cb-class-grid');
    if (!grid) return;
    grid.innerHTML = _CLASS_CARDS.map(c =>
        `<div class="cb-class-card${c.value === selectedValue ? ' selected' : ''}"
              data-value="${c.value}" onclick="window._selectClassCard('${c.value}')">
            <span class="cb-class-card-icon"><img src="/assets/icons/class/${c.icon}.png" alt="${c.value}" class="custom-icon" style="width:32px;height:32px;"></span>
            <span class="cb-class-card-name">${c.value}</span>
        </div>`
    ).join('');
}

window._selectClassCard = function(value) {
    document.querySelectorAll('.cb-class-card').forEach(el =>
        el.classList.toggle('selected', el.dataset.value === value)
    );
    const sel = document.getElementById('cb-class');
    if (sel) { sel.value = value; sel.dispatchEvent(new Event('change')); }
    _populateSubclassDropdown();
    _applySmartDefaults();
};

// Initialise class grid on load
_renderClassCards('');

/** Populate the subclass dropdown based on the currently selected class. */
function _populateSubclassDropdown() {
    const sel = document.getElementById('cb-subclass');
    if (!sel) return;
    const cls = (document.getElementById('cb-class')?.value || '').toLowerCase();
    // Clear and add placeholder
    sel.innerHTML = `<option value="" data-i18n="cb_subclass_ph">${t('cb_subclass_ph') || 'Subclass…'}</option>`;
    if (!cls) return;
    Object.entries(SUBCLASS_MECHANICS)
        .filter(([, mech]) => mech.class === cls)
        .forEach(([slug, ]) => {
            const name = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            const opt = document.createElement('option');
            opt.value = slug;
            opt.textContent = name;
            sel.appendChild(opt);
        });
}

/** Show auto-granted background skill proficiencies as a preview. */
function _updateBackgroundSkillsPreview() {
    const bgKey = (document.getElementById('cb-background')?.value || '').toLowerCase();
    const preview = document.getElementById('cb-background-skills-preview');
    if (!preview) return;
    const skills = BACKGROUND_MECHANICS[bgKey]?.skills || [];
    preview.textContent = skills.length
        ? `✓ Auto-grants: ${skills.map(s => s.replace(/_/g,' ')).join(', ')}`
        : '';
}

/** Render subclass-specific choice pickers inside #cb-subclass-choices. */
const _MANEUVER_SLUGS = [
    'trip_attack','disarming_attack','pushing_attack','menacing_attack',
    'riposte','precision_attack','commanders_strike','distracting_strike',
    'evasive_footwork','feinting_attack','goading_attack','lunging_attack',
    'maneuvering_attack','rally','sweeping_attack'
];
function _updateSubclassChoicesUI(slug, existing = {}) {
    const el = document.getElementById('cb-subclass-choices');
    if (!el) return;
    el.innerHTML = '';

    const save = () => {
        const choices = _readSubclassChoices(slug, el);
        el.dataset.choices = JSON.stringify(choices);
    };

    if (slug === 'battle-master') {
        const selected = existing.maneuvers || [];
        el.innerHTML = `<div style="font-size:10px;color:#e67e22;font-weight:bold;margin-bottom:4px;">⚔️ Choose maneuvers (3):</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;">
                ${_MANEUVER_SLUGS.map(s => {
                    const name = s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
                    return `<label style="font-size:10px;color:#ccc;display:flex;align-items:center;gap:3px;">
                        <input type="checkbox" value="${s}" ${selected.includes(s)?'checked':''} onchange="window._bmManeuverChange(this)"> ${name}
                    </label>`;
                }).join('')}
            </div>`;
        window._bmManeuverChange = function(cb) {
            const allChecked = el.querySelectorAll('input[type=checkbox]:checked');
            if (allChecked.length > 3) { cb.checked = false; return; }
            save();
        };
        save();
    } else if (slug === 'totem-warrior') {
        const chosen = existing.totem || '';
        el.innerHTML = `<div style="font-size:10px;color:#e67e22;font-weight:bold;margin-bottom:4px;">🐻 Totem Animal:</div>
            <div style="display:flex;gap:8px;">
                ${['bear','eagle','wolf'].map(t => `<label style="font-size:11px;color:#ccc;display:flex;align-items:center;gap:3px;">
                    <input type="radio" name="totem-choice" value="${t}" ${chosen===t?'checked':''} onchange="document.getElementById('cb-subclass-choices').dataset.choices=JSON.stringify({totem:'${t}'})">
                    ${t.charAt(0).toUpperCase()+t.slice(1)}
                </label>`).join('')}
            </div>`;
    } else if (slug === 'draconic') {
        const chosen = existing.dragonAncestry || '';
        el.innerHTML = `<div style="font-size:10px;color:#e67e22;font-weight:bold;margin-bottom:4px;">🐲 Dragon Ancestry:</div>
            <select style="background:#2c3e50;color:white;border:1px solid #555;border-radius:4px;padding:3px 6px;font-size:11px;" onchange="document.getElementById('cb-subclass-choices').dataset.choices=JSON.stringify({dragonAncestry:this.value})">
                <option value="">Choose…</option>
                ${['acid','cold','fire','lightning','poison'].map(d =>
                    `<option value="${d}" ${chosen===d?'selected':''}>${d.charAt(0).toUpperCase()+d.slice(1)}</option>`
                ).join('')}
            </select>`;
    } else if (slug === 'hunter') {
        const chosen = existing.hunterChoice || '';
        el.innerHTML = `<div style="font-size:10px;color:#e67e22;font-weight:bold;margin-bottom:4px;">🏹 Hunter's Prey:</div>
            <div style="display:flex;flex-direction:column;gap:3px;">
                ${[['colossus_slayer','Colossus Slayer'],['giant_killer','Giant Killer'],['horde_breaker','Horde Breaker']].map(([v,n]) =>
                    `<label style="font-size:11px;color:#ccc;display:flex;align-items:center;gap:3px;">
                        <input type="radio" name="hunter-choice" value="${v}" ${chosen===v?'checked':''} onchange="document.getElementById('cb-subclass-choices').dataset.choices=JSON.stringify({hunterChoice:'${v}'})">
                        ${n}
                    </label>`
                ).join('')}
            </div>`;
    } else if (slug === 'divination') {
        el.innerHTML = `<div style="font-size:10px;color:#9b59b6;font-style:italic;">🎲 Portent dice are rolled automatically on long rest.</div>`;
        el.dataset.choices = '{}';
    } else {
        el.dataset.choices = JSON.stringify(existing);
    }
}

function _readSubclassChoices(slug, el) {
    if (slug === 'battle-master') {
        const checked = Array.from(el.querySelectorAll('input[type=checkbox]:checked')).map(c => c.value);
        return { maneuvers: checked };
    }
    try { return JSON.parse(el.dataset.choices || '{}'); } catch { return {}; }
}

/** Compute and display live AC preview from current form state. */
function _updateAcPreview() {
    const preview = document.getElementById('cb-ac-preview');
    if (!preview) return;
    const armorVal = document.getElementById('cb-armor')?.value;
    const shieldOn = document.getElementById('cb-shield')?.checked;
    const dex = parseInt(document.getElementById('cb-dex')?.value) || 10;
    const wis = parseInt(document.getElementById('cb-wis')?.value) || 10;
    const con = parseInt(document.getElementById('cb-con')?.value) || 10;
    const dexMod = Math.floor((dex - 10) / 2);
    const wisMod = Math.floor((wis - 10) / 2);
    const conMod = Math.floor((con - 10) / 2);
    const cls = (document.getElementById('cb-class')?.value || '').toLowerCase();
    const subclass = (document.getElementById('cb-subclass')?.value || '').toLowerCase();
    let ac;
    if (armorVal) {
        try {
            const armor = JSON.parse(armorVal);
            if (armor.type === 'light')  ac = armor.baseAC + dexMod;
            else if (armor.type === 'medium') ac = armor.baseAC + Math.min(dexMod, 2);
            else ac = armor.baseAC;
        } catch { ac = 10; }
    } else if (subclass === 'draconic') {
        ac = 13 + dexMod;
    } else if (cls === 'monk') {
        ac = 10 + dexMod + wisMod;
    } else if (cls === 'barbarian') {
        ac = 10 + dexMod + conMod;
    } else {
        ac = 10 + dexMod;
    }
    if (shieldOn) ac += 2;
    preview.textContent = `⚡ ${t('cb_ac_preview') || 'Computed AC'}: ${ac}`;
}

/** Open the feat picker modal and render the list. */
function _openFeatPicker() {
    const modal = document.getElementById('feat-picker-modal');
    if (!modal) return;
    modal.style.display = 'block';
    document.getElementById('feat-search').value = '';
    _renderFeatList('');
}

/** Render filtered feat list inside the picker. */
function _renderFeatList(query) {
    const list = document.getElementById('feat-picker-list');
    if (!list) return;
    const q = query.toLowerCase();
    const entries = Object.keys(FEAT_MECHANICS)
        .filter(slug => !q || slug.includes(q))
        .sort();
    list.innerHTML = entries.map(slug => {
        const name = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const fm = FEAT_MECHANICS[slug];
        const effects = [];
        if (fm.initiative)          effects.push(`+${fm.initiative} initiative`);
        if (fm.max_hp_bonus?.perLevel) effects.push(`+${fm.max_hp_bonus.perLevel} HP/level`);
        if (fm.speed)               effects.push(`+${fm.speed} ft speed`);
        if (fm.abilBonus)           effects.push(Object.entries(fm.abilBonus).map(([a,v]) => `+${v} ${a.toUpperCase()}`).join(', '));
        const desc = effects.length ? `<span style="font-size:10px;color:#aaa;"> — ${effects.join(', ')}</span>` : '';
        return `<button type="button" onclick="window._addFeatChip('${slug}')"
            style="text-align:left;background:rgba(155,89,182,0.1);border:1px solid rgba(155,89,182,0.3);color:#d7bde2;border-radius:5px;padding:5px 8px;cursor:pointer;font-size:12px;">
            ${name}${desc}</button>`;
    }).join('');
}

/** Add a feat chip to the feat chips container. */
window._addFeatChip = function(slug) {
    const chips = document.getElementById('cb-feat-chips');
    if (!chips) return;
    const feats = JSON.parse(chips.dataset.feats || '[]');
    if (feats.find(f => f.name === slug)) return; // no dupes
    const name = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    feats.push({ name: slug });
    chips.dataset.feats = JSON.stringify(feats);
    const chip = document.createElement('span');
    chip.className = 'feat-chip';
    chip.innerHTML = `${name} <button type="button" onclick="window._removeFeatChip('${slug}')" style="background:none;border:none;color:#e74c3c;cursor:pointer;padding:0 2px;font-size:13px;">×</button>`;
    chips.appendChild(chip);
    document.getElementById('feat-picker-modal').style.display = 'none';
    _updateAcPreview();
};

/** Remove a feat chip. */
window._removeFeatChip = function(slug) {
    const chips = document.getElementById('cb-feat-chips');
    if (!chips) return;
    let feats = JSON.parse(chips.dataset.feats || '[]');
    feats = feats.filter(f => f.name !== slug);
    chips.dataset.feats = JSON.stringify(feats);
    chips.querySelectorAll('.feat-chip').forEach(c => {
        if (c.textContent.trim().startsWith(slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))) {
            c.remove();
        }
    });
    _updateAcPreview();
};

if(inputUrl) {
    inputUrl.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if(val) { _setPreview(val); }
    });
}


if(inputFile) {
    inputFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        // S14: show instant local preview, then upload to Firebase Storage
        const reader = new FileReader();
        reader.onload = evt => {
            _setPreview(evt.target.result);   // base64 preview while uploading
        };
        reader.readAsDataURL(file);
        // Upload — show progress badge next to file input
        const progressEl = document.getElementById('portrait-upload-progress');
        if (progressEl) { progressEl.textContent = '⬆ 0%'; progressEl.style.display = 'inline'; }
        try {
            const uid = currentUserUid;
            if (uid) {
                const url = await uploadPortrait(uid, file, pct => {
                    if (progressEl) progressEl.textContent = `⬆ ${pct}%`;
                });
                _setPreview(url);    // swap preview for durable URL
                if (progressEl) { progressEl.textContent = '✅'; setTimeout(() => { progressEl.style.display = 'none'; }, 1500); }
            }
        } catch (err) {
            if (progressEl) { progressEl.textContent = t('toast_upload_failed'); setTimeout(() => { progressEl.style.display = 'none'; }, 2500); }
        }
    });
}

const ACTION_ICONS = ['melee','ranged','wand','fire','ice','lightning','wind','shield','bomb','dagger','arcane','death','nature','blood','holy','water'];
const DAMAGE_DICE_OPTIONS = ['','1d4','1d6','1d8','1d10','1d12','2d6','2d8','2d10','2d12','3d6','4d6'];

function _buildActionRow(data) {
    const d = data || {};
    const selectedIcon = d.icon || 'melee';
    const hitType = d.hitType || 'melee';
    const actionType = d.actionType || 'damage';
    const isHitDisabled = hitType === 'always' || hitType === 'none';

    const row = document.createElement('div');
    row.className = 'action-row';
    row.innerHTML = `
        <div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap;">
            <input type="text" class="builder-input act-name" value="${d.name||''}" placeholder="Action name" style="flex:2; min-width:100px; padding:5px; font-size:12px;">
            <select class="builder-input act-hit-type" style="flex:1.5; min-width:95px; padding:5px; font-size:11px;">
                <option value="melee">⚔️ Melee</option>
                <option value="ranged">🏹 Ranged</option>
                <option value="spell">✨ Spell</option>
                <option value="always">🎯 Always Hit</option>
                <option value="none">— No Roll</option>
            </select>
            <input type="number" class="builder-input act-hit-mod" value="${parseInt(d.hitMod)||0}" min="0" max="15"
                   style="width:50px; padding:5px; font-size:12px; text-align:center;" title="Hit bonus (+0 to +15)">
            <span style="font-size:9px; color:#aaa; white-space:nowrap;">+hit</span>
        </div>
        <div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap; margin-top:5px;">
            <select class="builder-input act-dmg-dice" style="flex:1.5; min-width:95px; padding:5px; font-size:11px;">
                ${DAMAGE_DICE_OPTIONS.map(opt => `<option value="${opt}">${opt || '— No Dmg'}</option>`).join('')}
            </select>
            <span style="font-size:10px; color:#888;">×</span>
            <input type="number" class="builder-input act-dmg-mult" value="${parseInt(d.damageMult)||1}" min="1" max="15"
                   style="width:45px; padding:5px; font-size:12px; text-align:center;" title="Dice count multiplier (1–15)">
            <select class="builder-input act-action-type" style="width:90px; padding:5px; font-size:11px;" title="Damage or Heal">
                <option value="damage">⚔️ Damage</option>
                <option value="heal">💚 Heal</option>
            </select>
            <input type="hidden" class="act-icon" value="${selectedIcon}">
            <button type="button" class="delete-atk-btn" onclick="this.closest('.action-row').remove()" aria-label="Delete action">✕</button>
        </div>
        <div class="act-icon-gallery"></div>
    `;

    // Set selects to saved values
    row.querySelector('.act-hit-type').value = hitType;
    row.querySelector('.act-dmg-dice').value = d.damageDice || '';
    row.querySelector('.act-action-type').value = actionType;

    // Enable/disable hit mod
    const hitModInput = row.querySelector('.act-hit-mod');
    if (isHitDisabled) hitModInput.disabled = true;
    row.querySelector('.act-hit-type').addEventListener('change', e => {
        hitModInput.disabled = e.target.value === 'always' || e.target.value === 'none';
    });

    // Build icon gallery
    const gallery = row.querySelector('.act-icon-gallery');
    const hiddenIcon = row.querySelector('.act-icon');
    ACTION_ICONS.forEach(ic => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'act-icon-btn' + (ic === selectedIcon ? ' selected' : '');
        btn.innerHTML = `<img src="/assets/icons/action/${ic}.png" alt="${ic}" class="custom-icon" style="width:20px;height:20px;">`;
        btn.onclick = () => {
            hiddenIcon.value = ic;
            gallery.querySelectorAll('.act-icon-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        };
        gallery.appendChild(btn);
    });
    return row;
}

if (addAttackBtn) {
    addAttackBtn.onclick = () => {
        if (attacksList.querySelectorAll('.action-row').length >= 5) return;
        attacksList.appendChild(_buildActionRow());
    };
}

let currentUserUid = null;
let currentVaultCharacters = {};

updateDOM();

// ── Lobby tab switching ───────────────────────────────────────────────────────
function _switchLobbyTab(tabName) {
    document.querySelectorAll('.lobby-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.lobby-tab-content').forEach(c => { c.classList.remove('active'); c.style.display = 'none'; });
    const btn = document.querySelector(`.lobby-tab[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');
    const panel = document.getElementById(`lobby-tab-${tabName}`);
    if (panel) { panel.classList.add('active'); panel.style.display = tabName === 'quick-room' ? 'flex' : 'block'; }
}

function _initLobbyTabs() {
    document.querySelectorAll('.lobby-tab').forEach(btn => {
        btn.addEventListener('click', () => _switchLobbyTab(btn.dataset.tab));
    });
}
_initLobbyTabs();

// ── URL param: ?campaign=XXXX auto-fills join code and switches to campaign tab
const _urlCampaignCode = new URLSearchParams(window.location.search).get('campaign');
if (_urlCampaignCode) {
    // Wait for auth + lobby render, then switch tab and pre-fill code
    const _applyUrlCampaign = () => {
        _switchLobbyTab('campaigns');
        const codeInput = document.getElementById('campaign-join-code');
        if (codeInput) codeInput.value = _urlCampaignCode.toUpperCase();
        // Clean URL so reload doesn't re-trigger
        window.history.replaceState({}, '', window.location.pathname);
    };
    // Auth listener fires before renderVault; campaigns tab may not exist yet — wait for it
    const _waitForCampaignTab = setInterval(() => {
        if (document.getElementById('campaign-join-code')) {
            clearInterval(_waitForCampaignTab);
            _applyUrlCampaign();
        }
    }, 200);
    // Give up after 10s
    setTimeout(() => clearInterval(_waitForCampaignTab), 10000);
}

async function _tavernEntrance() {
    const loginBgVideo  = document.getElementById('login-bg-video');
    const doorVideo     = document.getElementById('door-open-video');
    const authOverlay   = document.getElementById('auth-scene-overlay');
    const lobbyBgVideo  = document.getElementById('lobby-bg-video');

    if (doorVideo && doorVideo.readyState >= 1) {
        // Fade out login bg, fade in door-open video
        if (loginBgVideo) { loginBgVideo.style.transition = 'opacity 0.4s'; loginBgVideo.style.opacity = '0'; }
        if (authOverlay)  { authOverlay.style.transition  = 'opacity 0.4s'; authOverlay.style.opacity  = '0'; }
        doorVideo.style.display = '';
        requestAnimationFrame(() => { doorVideo.style.opacity = '1'; });
        doorVideo.play().catch(() => {});
        await new Promise(r => { doorVideo.onended = r; setTimeout(r, 3500); });
    }

    const lobbyOverlay = document.getElementById('lobby-scene-overlay');

    if (authScreen)   authScreen.style.display   = 'none';
    if (loginBgVideo) loginBgVideo.style.display  = 'none';
    if (doorVideo)    doorVideo.style.display     = 'none';
    if (authOverlay)  authOverlay.style.display   = 'none';
    if (lobbyBgVideo) { lobbyBgVideo.style.display = ''; lobbyBgVideo.play().catch(() => {}); }
    if (lobbyOverlay) lobbyOverlay.style.display  = '';

    if (lobbyScreen) {
        lobbyScreen.style.opacity = '0';
        lobbyScreen.style.transition = 'opacity 0.8s ease';
        lobbyScreen.style.display = 'block';
        requestAnimationFrame(() => { lobbyScreen.style.opacity = '1'; });
    }
}

db.listenToAuthState((user) => {
    if (user) {
        currentUserUid = user.uid;
        setUid(user.uid);
        _tavernEntrance();
        if(userDisplayName) userDisplayName.innerText = user.displayName || "Player";
        if(userEmail) userEmail.innerText = user.email || "";
        if (user.photoURL && userAvatar) userAvatar.src = user.photoURL;
        db.listenToUserCharacters(user.uid, renderVault);

        // Init campaign tab
        initCampaigns(user.uid, user.displayName || 'Player', (role, charData, campaignId, isCampaign) => {
            langToggleBtn.style.display = 'none';
            if (lobbyScreen) lobbyScreen.style.display = 'none';
            showSpinner('Joining campaign…');
            startGame(role, charData, campaignId, isCampaign);
            if (role === 'dm' && currentUserUid) db.setDmUid(campaignId, currentUserUid);
        });
    } else {
        currentUserUid = null;
        if(lobbyScreen) lobbyScreen.style.display = 'none';
        if(authScreen) authScreen.style.display = 'block';
    }
});

function renderVault(characters) {
    if(!vaultList) return;
    vaultList.innerHTML = "";
    currentVaultCharacters = characters || {};
    if (!characters || Object.keys(characters).length === 0) {
        vaultList.innerHTML = `<div style="text-align: center; color: #888; font-style: italic; padding: 20px 0;">${t("empty_vault")}</div>`;
        return;
    }
    Object.keys(characters).forEach(charId => {
        const c = characters[charId];
        const card = document.createElement('div');
        card.className = 'vault-card';
        card.style.position = 'relative';
        const raceStr = c.race || "";
        const classStr = c.class || "";
        let displayRace = raceStr;
        if (raceStr) { let translated = t("race_" + raceStr.toLowerCase()); displayRace = translated !== "race_" + raceStr.toLowerCase() ? translated : raceStr; }
        let displayClass = classStr;
        if (classStr) { let translated = t("class_" + classStr.toLowerCase()); displayClass = translated !== "class_" + classStr.toLowerCase() ? translated : classStr; }
        card.innerHTML = `
            <div class="vault-card-actions">
                <button class="vault-action-btn edit" data-action="edit" data-id="${charId}" title="ערוך">✏️</button>
                <button class="vault-action-btn delete" data-action="delete" data-id="${charId}" data-name="${c.name}" title="מחק">🗑️</button>
            </div>
            <img src="${c.portrait || 'assets/logo.webp'}" class="vault-card-img" style="border: 2px solid ${c.color || '#3498db'}">
            <div class="vault-card-info" style="flex: 1;">
                <div class="vault-card-name">${c.name}</div>
                <div class="vault-card-sub">${displayRace} ${displayClass}</div>
                <div style="font-size: 11px; color: #aaa; margin-top: 4px; background: rgba(0,0,0,0.4); padding: 2px 6px; border-radius: 4px; display: inline-block;">
                    🛡️ AC: ${c.ac || 10} | ❤️ HP: ${c.maxHp || 10}
                </div>
            </div>
            <button class="vault-select-btn hover-btn" data-charid="${charId}" style="align-self: center;">${t("select_btn")}</button>
        `;
        vaultList.appendChild(card);
    });
    document.querySelectorAll('.vault-action-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const action = btn.getAttribute('data-action');
            const charId = btn.getAttribute('data-id');
            const charName = btn.getAttribute('data-name');
            if (action === 'delete') {
                if(confirm(`${t('delete_confirm')} (${charName})`)) { await db.deleteCharacterFromVault(currentUserUid, charId); }
            } else if (action === 'edit') { openBuilderForEdit(charId); }
        };
    });
    document.querySelectorAll('.vault-select-btn').forEach(btn => {
        btn.onclick = (e) => {
            const charId = e.target.getAttribute('data-charid');
            const selectedChar = currentVaultCharacters[charId];
            const roomCodeInput = document.getElementById('room-code-input');
            let roomCode = roomCodeInput && roomCodeInput.value.trim() ? roomCodeInput.value.trim() : "";
            if(!roomCode) { showToast(t("alert_no_room_code") || 'Enter a room code.', 'warning'); return; }
            // Sanitise input — strip spaces, uppercase
            roomCode = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            if(!roomCode) { showToast(t("alert_no_room_code") || 'Enter a room code.', 'warning'); return; }
            langToggleBtn.style.display = 'none';
            if(lobbyScreen) lobbyScreen.style.display = 'none';
            showSpinner('Joining room…');
            startGame('player', selectedChar, roomCode);
        };
    });
}

function openBuilderForEdit(charId) {
    const c = currentVaultCharacters[charId];
    if(!c) return;
    currentEditCharId = charId;
    if(builderModal) builderModal.style.display = 'flex';
    document.getElementById('cb-main-title').innerText = t('title_edit_char');
    document.getElementById('save-char-btn').innerText = t('btn_update_char');
    document.getElementById('cb-name').value = c.name || "";
    document.getElementById('cb-race').value   = c.race   || "";
    document.getElementById('cb-class').value  = c.class  || "";
    document.getElementById('cb-gender').value = c.gender || 'male';
    document.getElementById('cb-size').value   = c.size   || 'Medium';
    document.getElementById('cb-ac').value = c.ac || "";
    document.getElementById('cb-speed').value = c.speed || "";
    document.getElementById('cb-level').value = c.level || "1";
    document.getElementById('cb-darkvision').value = c.darkvision || "0";
    document.getElementById('cb-pp').value = c.pp || "";
    document.getElementById('cb-init').value = c.initBonus || "";
    document.getElementById('cb-hp').value = c.maxHp || "";
    document.getElementById('cb-melee').value = c.melee ?? '';
    document.getElementById('cb-ranged').value = c.ranged ?? '';
    const spellAtkEl = document.getElementById('cb-spell-atk');
    if (spellAtkEl) spellAtkEl.value = c.spellAtkMod ?? '';
    const meleeDmgModEl = document.getElementById('cb-melee-dmg-mod');
    if (meleeDmgModEl) meleeDmgModEl.value = c.meleeDmgMod ?? '';
    const rangedDmgModEl = document.getElementById('cb-ranged-dmg-mod');
    if (rangedDmgModEl) rangedDmgModEl.value = c.rangedDmgMod ?? '';
    document.getElementById('cb-color').value = c.color || "#3498db";
    _setPreview(c.portrait || TMT_DEFAULT);
    if (selectedPortrait.startsWith("data:image")) { switchPortraitTab(tabFile, areaFile); }
    else if (selectedPortrait.includes("tools.2minutetabletop.com")) {
        switchPortraitTab(tabTmt, areaTmt);
        _refreshTmtTab();
        document.querySelectorAll('.builder-portrait-btn').forEach(btn => { btn.classList.remove('active'); if (btn.src === selectedPortrait) btn.classList.add('active'); });
    }
    else if (!selectedPortrait.includes("dicebear.com/8.x/adventurer")) { switchPortraitTab(tabUrl, areaUrl); if(inputUrl) inputUrl.value = selectedPortrait; }
    else {
        switchPortraitTab(tabPreset, areaPreset);
        document.querySelectorAll('.builder-portrait-btn').forEach(btn => { btn.classList.remove('active'); if (btn.src === selectedPortrait) btn.classList.add('active'); });
    }

    // Ability scores
    document.getElementById('cb-str').value = c._str || '';
    document.getElementById('cb-dex').value = c._dex || '';
    document.getElementById('cb-con').value = c._con || '';
    document.getElementById('cb-int').value = c._int || '';
    document.getElementById('cb-wis').value = c._wis || '';
    document.getElementById('cb-cha').value = c._cha || '';

    // Saving throw proficiencies — check box if savingThrows[ab] is set
    ['str','dex','con','int','wis','cha'].forEach(ab => {
        const el = document.getElementById('cb-save-'+ab);
        if (el) el.checked = !!(c.savingThrows?.[ab]);
    });

    // Skill proficiencies
    const SKILL_ID_MAP_EDIT = {
        'cb-skill-acrobatics': 'acrobatics',
        'cb-skill-animal_handling': 'animal handling',
        'cb-skill-arcana': 'arcana',
        'cb-skill-athletics': 'athletics',
        'cb-skill-deception': 'deception',
        'cb-skill-history': 'history',
        'cb-skill-insight': 'insight',
        'cb-skill-intimidation': 'intimidation',
        'cb-skill-investigation': 'investigation',
        'cb-skill-medicine': 'medicine',
        'cb-skill-nature': 'nature',
        'cb-skill-perception': 'perception',
        'cb-skill-performance': 'performance',
        'cb-skill-persuasion': 'persuasion',
        'cb-skill-religion': 'religion',
        'cb-skill-sleight_of_hand': 'sleight of hand',
        'cb-skill-stealth': 'stealth',
        'cb-skill-survival': 'survival',
    };
    Object.entries(SKILL_ID_MAP_EDIT).forEach(([id, skillKey]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = c.skills?.[skillKey];
        el.value = val === 'expert' ? 'expert' : val ? 'prof' : '';
    });
    const joatEl = document.getElementById('cb-jack-of-all-trades');
    if (joatEl) joatEl.checked = !!c.jackOfAllTrades;

    // Languages, resistances, immunities, loot
    const langEl = document.getElementById('cb-languages');
    if (langEl) langEl.value = c.languages || '';
    const resEl = document.getElementById('cb-resistances');
    if (resEl) resEl.value = c.damageResistances || '';
    const immEl = document.getElementById('cb-immunities');
    if (immEl) immEl.value = c.damageImmunities || '';
    const lootEl = document.getElementById('cb-loot');
    if (lootEl) lootEl.value = c.loot || '';

    if (attacksList) attacksList.innerHTML = '';
    // Spell slots
    for (let lv = 1; lv <= 9; lv++) {
        const el = document.getElementById('cb-spell-'+lv);
        if (el) el.value = (c.spellSlots?.max?.[lv]) || '';
    }
    // Populate custom actions (new system)
    const actionsToLoad = c.customActions || (c.customAttacks?.map(a => ({
        name: a.name, hitType: 'melee', hitMod: a.bonus || 0,
        damageDice: (a.dmg || '').replace(/[+\-]\d+$/, '') || '', damageMult: 1, icon: '⚔️'
    })) || []);
    actionsToLoad.slice(0, 5).forEach(action => {
        if (attacksList) attacksList.appendChild(_buildActionRow(action));
    });

    // Background & Subclass
    const bgEl = document.getElementById('cb-background');
    if (bgEl) { bgEl.value = c.background || ''; _updateBackgroundSkillsPreview(); }
    _populateSubclassDropdown();
    const subEl = document.getElementById('cb-subclass');
    if (subEl) subEl.value = c.subclass || '';
    _updateSubclassChoicesUI(c.subclass || '', c.subclassChoices || {});

    // Equipment slots
    const armorEl = document.getElementById('cb-armor');
    if (armorEl && c.equipment?.armor) {
        // Find matching option by name
        Array.from(armorEl.options).forEach(opt => {
            try { if (JSON.parse(opt.value)?.name === c.equipment.armor.name) armorEl.value = opt.value; } catch {}
        });
    } else if (armorEl) { armorEl.value = ''; }
    const shieldEl = document.getElementById('cb-shield');
    if (shieldEl) shieldEl.checked = !!c.equipment?.shield;
    const mainHandEl = document.getElementById('cb-main-hand');
    if (mainHandEl && c.equipment?.mainHand) {
        Array.from(mainHandEl.options).forEach(opt => {
            try { if (JSON.parse(opt.value)?.name === c.equipment.mainHand.name) mainHandEl.value = opt.value; } catch {}
        });
    } else if (mainHandEl) { mainHandEl.value = ''; }
    const rangedEl = document.getElementById('cb-ranged-weapon');
    if (rangedEl && c.equipment?.ranged) {
        Array.from(rangedEl.options).forEach(opt => {
            try { if (JSON.parse(opt.value)?.name === c.equipment.ranged.name) rangedEl.value = opt.value; } catch {}
        });
    } else if (rangedEl) { rangedEl.value = ''; }

    // Feats
    const featsEl2 = document.getElementById('cb-feat-chips');
    if (featsEl2) {
        featsEl2.innerHTML = '';
        featsEl2.dataset.feats = JSON.stringify(c.feats || []);
        (c.feats || []).forEach(f => {
            const slug = f.name || '';
            const name = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            const chip = document.createElement('span');
            chip.className = 'feat-chip';
            chip.innerHTML = `${name} <button type="button" onclick="window._removeFeatChip('${slug}')" style="background:none;border:none;color:#e74c3c;cursor:pointer;padding:0 2px;font-size:13px;">×</button>`;
            featsEl2.appendChild(chip);
        });
    }

    // HD Remaining & Temp HP
    const hdRemainingEl2 = document.getElementById('cb-hd-remaining');
    if (hdRemainingEl2) hdRemainingEl2.value = c.hdRemaining ?? c.hdLeft ?? c.level ?? '';
    const tempHpEl2 = document.getElementById('cb-temp-hp');
    if (tempHpEl2) tempHpEl2.value = c.tempHp || 0;

    _updateAcPreview();

    // Wizard: render class cards, go to step 1, run smart defaults, clear manual-edit flags
    _renderClassCards(c.class || '');
    ['cb-init','cb-pp','cb-darkvision','cb-speed'].forEach(id => {
        const el = document.getElementById(id);
        if (el) delete el.dataset.manuallyEdited;
    });
    _gotoStep(1);
    _applySmartDefaults();
}

if(newCharBtn) {
    newCharBtn.onclick = () => {
        currentEditCharId = null;
        if(builderModal) builderModal.style.display = 'flex';
        document.getElementById('cb-main-title').innerText = t('cb_title');
        // save-char-btn text not needed — now a nav button managed by _gotoStep
        document.querySelectorAll('.builder-input').forEach(input => {
            if(input.tagName === 'INPUT' && input.type !== 'file') input.value = '';
            if(input.tagName === 'SELECT') input.selectedIndex = 0;
        });
        document.getElementById('cb-color').value = "#3498db";
        _setPreview(TMT_DEFAULT);
        switchPortraitTab(tabTmt, areaTmt);
        _refreshTmtTab();
        if (attacksList) attacksList.innerHTML = '';
        // Reset new fields
        const featChipsEl = document.getElementById('cb-feat-chips');
        if (featChipsEl) { featChipsEl.innerHTML = ''; featChipsEl.dataset.feats = '[]'; }
        _updateSubclassChoicesUI('', {});
        const bgPreview = document.getElementById('cb-background-skills-preview');
        if (bgPreview) bgPreview.textContent = '';
        const acPreview = document.getElementById('cb-ac-preview');
        if (acPreview) acPreview.textContent = '';
        _populateSubclassDropdown();
        // Wizard reset
        _renderClassCards('');
        ['cb-init','cb-pp','cb-darkvision','cb-speed'].forEach(id => {
            const el = document.getElementById(id);
            if (el) delete el.dataset.manuallyEdited;
        });
        _gotoStep(1);
        _applySmartDefaults();
    };
}

if(closeBuilderBtn) { closeBuilderBtn.onclick = () => { if(builderModal) builderModal.style.display = 'none'; }; }

// =====================================================================
// Smart Form Validation - highlights missing fields instead of alert
// =====================================================================
function highlightMissingFields(fieldsMap) {
    const missing = [];
    for (const [id, value] of Object.entries(fieldsMap)) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (!value) {
            el.style.border = "2px solid #e74c3c";
            el.style.boxShadow = "0 0 6px rgba(231,76,60,0.5)";
            el.addEventListener('input', () => {
                el.style.border = "";
                el.style.boxShadow = "";
            }, { once: true });
            missing.push(el);
        } else {
            el.style.border = "";
            el.style.boxShadow = "";
        }
    }
    if (missing.length > 0) {
        missing[0].focus();
        missing[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return missing.length === 0;
}

/** Parse an equipment slot select value (JSON string) into an object, or return null. */
function _parseEquipSlot(val) {
    if (!val) return null;
    try { return JSON.parse(val); } catch { return null; }
}

if(saveCharBtn) {
    const form = document.getElementById('char-builder-form');
    if(form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            if (!currentUserUid) return;
            const name = document.getElementById('cb-name')?.value.trim();
            const charRace   = document.getElementById('cb-race')?.value;
            const charClass  = document.getElementById('cb-class')?.value;
            const charGender = document.getElementById('cb-gender')?.value || 'male';
            const charSize   = document.getElementById('cb-size')?.value   || 'Medium';
            const ac = document.getElementById('cb-ac')?.value;
            const speed = document.getElementById('cb-speed')?.value;
            const darkvision = document.getElementById('cb-darkvision')?.value;
            const pp = document.getElementById('cb-pp')?.value;
            const init = document.getElementById('cb-init')?.value;
            const hp = document.getElementById('cb-hp')?.value;
            const melee = document.getElementById('cb-melee')?.value;
            const ranged = document.getElementById('cb-ranged')?.value;
            const spellAtkMod = parseInt(document.getElementById('cb-spell-atk')?.value) || 0;
            const meleeDmgMod = parseInt(document.getElementById('cb-melee-dmg-mod')?.value) || 0;
            const rangedDmgMod = parseInt(document.getElementById('cb-ranged-dmg-mod')?.value) || 0;
            const color = document.getElementById('cb-color')?.value;
            const customActions = [];
            if (attacksList) {
                attacksList.querySelectorAll('.action-row').forEach(row => {
                    const aName = row.querySelector('.act-name')?.value.trim();
                    if (!aName) return;
                    customActions.push({
                        name: aName,
                        hitType: row.querySelector('.act-hit-type')?.value || 'melee',
                        hitMod: parseInt(row.querySelector('.act-hit-mod')?.value) || 0,
                        damageDice: row.querySelector('.act-dmg-dice')?.value || '',
                        damageMult: parseInt(row.querySelector('.act-dmg-mult')?.value) || 1,
                        actionType: row.querySelector('.act-action-type')?.value || 'damage',
                        icon: row.querySelector('.act-icon')?.value || '⚔️'
                    });
                });
            }

            // Smart validation — highlight missing fields instead of generic alert
            const isValid = highlightMissingFields({
                'cb-name': name,
                'cb-race': charRace,
                'cb-class': charClass,
                'cb-ac': ac,
                'cb-speed': speed,
                'cb-pp': pp,
                'cb-init': init,
                'cb-hp': hp,
            });
            if (!isValid || !selectedPortrait) return;

            const charLevel = Math.max(1, Math.min(20, parseInt(document.getElementById('cb-level')?.value) || 1));
            const charData = {
                name, race: charRace, class: charClass, gender: charGender, size: charSize,
                level: charLevel,
                ac: parseInt(ac), speed: parseInt(speed), pp: parseInt(pp), darkvision: parseInt(darkvision)||0,
                initBonus: parseInt(init), maxHp: parseInt(hp), hp: parseInt(hp),
                melee: parseInt(melee)||0, ranged: parseInt(ranged)||0,
                spellAtkMod, meleeDmgMod, rangedDmgMod,
                customActions: customActions, color: color, portrait: selectedPortrait, createdAt: Date.now()
            };

            // Ability scores
            const _str = parseInt(document.getElementById('cb-str')?.value) || 0;
            const _dex = parseInt(document.getElementById('cb-dex')?.value) || 0;
            const _con = parseInt(document.getElementById('cb-con')?.value) || 0;
            const _int = parseInt(document.getElementById('cb-int')?.value) || 0;
            const _wis = parseInt(document.getElementById('cb-wis')?.value) || 0;
            const _cha = parseInt(document.getElementById('cb-cha')?.value) || 0;
            if (_str || _dex || _con || _int || _wis || _cha) {
                if (_str) charData._str = _str;
                if (_dex) charData._dex = _dex;
                if (_con) charData._con = _con;
                if (_int) charData._int = _int;
                if (_wis) charData._wis = _wis;
                if (_cha) charData._cha = _cha;
            }

            // Saving throw proficiencies — store as numeric bonus = abilityMod + profBonus
            const profB = charLevel < 5 ? 2 : charLevel < 9 ? 3 : charLevel < 13 ? 4 : charLevel < 17 ? 5 : 6;
            const saveAbilScores = { str: _str||10, dex: _dex||10, con: _con||10, int: _int||10, wis: _wis||10, cha: _cha||10 };
            const savingThrows = {};
            ['str','dex','con','int','wis','cha'].forEach(ab => {
                if (document.getElementById('cb-save-'+ab)?.checked) {
                    savingThrows[ab] = Math.floor((saveAbilScores[ab] - 10) / 2) + profB;
                }
            });
            if (Object.keys(savingThrows).length > 0) charData.savingThrows = savingThrows;

            // Skill proficiencies — store as { skillName: true } matching SKILL_ABILITIES keys
            const SKILL_ID_MAP = {
                'cb-skill-acrobatics': 'acrobatics',
                'cb-skill-animal_handling': 'animal handling',
                'cb-skill-arcana': 'arcana',
                'cb-skill-athletics': 'athletics',
                'cb-skill-deception': 'deception',
                'cb-skill-history': 'history',
                'cb-skill-insight': 'insight',
                'cb-skill-intimidation': 'intimidation',
                'cb-skill-investigation': 'investigation',
                'cb-skill-medicine': 'medicine',
                'cb-skill-nature': 'nature',
                'cb-skill-perception': 'perception',
                'cb-skill-performance': 'performance',
                'cb-skill-persuasion': 'persuasion',
                'cb-skill-religion': 'religion',
                'cb-skill-sleight_of_hand': 'sleight of hand',
                'cb-skill-stealth': 'stealth',
                'cb-skill-survival': 'survival',
            };
            const skills = {};
            Object.entries(SKILL_ID_MAP).forEach(([id, skillKey]) => {
                const val = document.getElementById(id)?.value;
                if (val === 'expert') skills[skillKey] = 'expert';
                else if (val === 'prof') skills[skillKey] = true;
            });
            if (Object.keys(skills).length > 0) charData.skills = skills;
            if (document.getElementById('cb-jack-of-all-trades')?.checked) charData.jackOfAllTrades = true;

            // Hit Dice and short-rest fields (required by openShortRest + charEngine)
            const conMod = Math.floor(((_con || 10) - 10) / 2);
            const hdRemainingInput = parseInt(document.getElementById('cb-hd-remaining')?.value);
            charData.hdMax       = charLevel;
            charData.hdLeft      = isNaN(hdRemainingInput) ? charLevel : hdRemainingInput;
            charData.hdRemaining = isNaN(hdRemainingInput) ? charLevel : hdRemainingInput;
            charData.conMod      = conMod;
            charData.tempHp      = parseInt(document.getElementById('cb-temp-hp')?.value) || 0;

            // Background, subclass, equipment, feats
            const bg = document.getElementById('cb-background')?.value || '';
            if (bg) charData.background = bg;
            const sub = document.getElementById('cb-subclass')?.value || '';
            if (sub) charData.subclass = sub;
            const subChoicesEl = document.getElementById('cb-subclass-choices');
            const subChoices = JSON.parse(subChoicesEl?.dataset.choices || '{}');
            if (Object.keys(subChoices).length) charData.subclassChoices = subChoices;

            // Equipment slots
            const armorVal = document.getElementById('cb-armor')?.value;
            const mainHandVal = document.getElementById('cb-main-hand')?.value;
            const rangedWeaponVal = document.getElementById('cb-ranged-weapon')?.value;
            const shieldOn = document.getElementById('cb-shield')?.checked;
            const equipment = {
                armor:   armorVal   ? _parseEquipSlot(armorVal)   : null,
                shield:  shieldOn   ? { name: 'Shield', acBonus: 2 }  : null,
                mainHand: mainHandVal ? _parseEquipSlot(mainHandVal) : null,
                ranged:  rangedWeaponVal ? _parseEquipSlot(rangedWeaponVal) : null,
                offHand: null,
                items:   [],
            };
            charData.equipment = equipment;

            // Feats
            const featsEl = document.getElementById('cb-feat-chips');
            const feats = JSON.parse(featsEl?.dataset.feats || '[]');
            if (feats.length) charData.feats = feats;

            // Languages, resistances, immunities, loot
            const languages = document.getElementById('cb-languages')?.value.trim();
            if (languages) charData.languages = languages;
            const resistances = document.getElementById('cb-resistances')?.value.trim();
            if (resistances) charData.damageResistances = resistances;
            const immunities = document.getElementById('cb-immunities')?.value.trim();
            if (immunities) charData.damageImmunities = immunities;
            const loot = document.getElementById('cb-loot')?.value.trim();
            if (loot) charData.loot = loot;

            // Spell slots (only include levels with > 0 max)
            const spellMax = {};
            for (let lv = 1; lv <= 9; lv++) {
                const val = parseInt(document.getElementById('cb-spell-'+lv)?.value) || 0;
                if (val > 0) spellMax[lv] = val;
            }
            if (Object.keys(spellMax).length > 0) {
                charData.spellSlots = { max: spellMax, used: {} };
            }
            saveCharBtn.innerText = t("cb_saving");
            saveCharBtn.disabled = true;
            try {
                if (currentEditCharId) { await db.updateCharacterInVault(currentUserUid, currentEditCharId, charData); }
                else { await db.saveCharacterToVault(currentUserUid, charData); }
                if(builderModal) builderModal.style.display = 'none';
            } catch (err) { console.error(err); showToast(t('alert_save_err'), 'warning'); }
            finally { saveCharBtn.innerText = currentEditCharId ? t("btn_update_char") : t("cb_save_btn"); saveCharBtn.disabled = false; }
        };
    }
}

// =====================================================================
// Room Code Modal — replaces the old alert()
// =====================================================================
function showRoomCodeModal(code, onEnter) {
    const overlay = document.getElementById('room-code-modal');
    const codeDisplay = document.getElementById('room-code-display');
    const copyBtn = document.getElementById('room-code-copy-btn');
    const enterBtn = document.getElementById('room-code-enter-btn');
    if (!overlay || !codeDisplay) return;

    codeDisplay.innerText = code;
    overlay.style.display = 'flex';

    copyBtn.onclick = () => {
        navigator.clipboard.writeText(code).then(() => {
            copyBtn.innerText = t('alert_room_copied');
            copyBtn.style.background = '#27ae60';
            setTimeout(() => {
                copyBtn.innerText = t('alert_room_copy');
                copyBtn.style.background = '';
            }, 2000);
        }).catch(() => {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = code;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            copyBtn.innerText = t('alert_room_copied');
        });
    };

    enterBtn.onclick = () => {
        overlay.style.display = 'none';
        onEnter();
    };
}

const createRoomBtn = document.getElementById('create-room-btn');
if(createRoomBtn) {
    createRoomBtn.onclick = () => {
        // 6-character alphanumeric room code (36^6 ≈ 2.2 billion combinations)
        const _chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
        const randomCode = Array.from({length:6}, () => _chars[Math.floor(Math.random()*_chars.length)]).join('');
        showRoomCodeModal(randomCode, () => {
            langToggleBtn.style.display = 'none';
            if(lobbyScreen) lobbyScreen.style.display = 'none';
            startGame('dm', null, randomCode);
            // Register DM uid so Firebase rules can verify DM-only writes
            if (currentUserUid) db.setDmUid(randomCode, currentUserUid);
        });
    };
}
