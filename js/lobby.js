// lobby.js - Welcome screen and Authentication Controller
// lobby.js v130 (S14: portrait upload via Firebase Storage)
import * as db from "./firebaseService.js";
import { uploadPortrait } from "./firebaseService.js"; // S14: direct import
import { startGame, setUid, showToast } from "./app.js";
import { setLanguage, getLang, t, tg, updateDOM } from "./i18n.js";
import { tmt2mtPlayerTokens } from "./tmt.js";
import { initCampaigns } from "./campaign.js";
import { compute } from "./engine/charEngine.js";
import { SUBCLASS_MECHANICS, BACKGROUND_MECHANICS, FEAT_MECHANICS, ARMOR_TABLE, RACE_MECHANICS } from "../data/mechanics.js";
import { generateNPCName } from "./faker.js";
import { listenToSubscription, checkCanCreateCharacter, checkCanCreateRoom, getCurrentSub } from "./subscriptionService.js";
import "./bugReport.js";
import "./a11y.js";
import { CLASS_ICONS, classIconImg, iconImg } from './iconMap.js';
import { roll3DDice, clearDice } from './diceEngine.js';
import { initDashboard, openDashboard } from './accountDashboard.js';
import { initCommunityHub } from './communityHub.js';
import { ensureProfile } from './userProfile.js';

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

// ── Account Dashboard trigger ──
document.getElementById('account-dashboard-btn')?.addEventListener('click', () => openDashboard());
document.getElementById('account-dashboard-btn')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDashboard(); }
});

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
const _WIZ_TOTAL = 8;
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
    // Step 1 = Identity (name required)
    if (n === 1) {
        const name = document.getElementById('cb-name')?.value.trim();
        if (!name) { _shakeAndFocus('cb-name'); showToast(t('cb_val_enter_name'), 'warning'); return false; }
    }
    // Step 2 = Race (race required)
    if (n === 2) {
        const race = document.getElementById('cb-race')?.value;
        if (!race) { _shakeAndFocus('cb-race-grid'); showToast(t('cb_val_pick_race'), 'warning'); return false; }
    }
    // Step 3 = Class (class required)
    if (n === 3) {
        const cls = document.getElementById('cb-class')?.value;
        if (!cls) { _shakeAndFocus('cb-class-grid'); showToast(t('cb_val_pick_class'), 'warning'); return false; }
    }
    // Step 4 = Abilities (all 6 scores ≥ 3)
    if (n === 4) {
        const ids = ['cb-str','cb-dex','cb-con','cb-int','cb-wis','cb-cha'];
        for (const id of ids) {
            const v = +(document.getElementById(id)?.value);
            if (!v || v < 3) { _shakeAndFocus(id); showToast(t('cb_val_set_abilities'), 'warning'); return false; }
        }
    }
    // Step 6 = Belief (must pick one)
    if (n === 6) {
        const beliefCard = document.querySelector('#cb-belief-grid [data-belief].selected');
        if (!beliefCard) { showToast(t('cb_val_pick_belief') || 'Pick a belief stance', 'warning'); return false; }
    }
    // Step 8 = Portrait (must have one before save)
    if (n === 8) {
        if (!selectedPortrait) { showToast(t('cb_val_pick_portrait') || 'Pick a portrait', 'warning'); return false; }
    }
    return true;
}

function _validateSave() {
    const missing = [];
    if (!document.getElementById('cb-race')?.value) missing.push(t('wizard_step_race'));
    if (!document.getElementById('cb-name')?.value.trim()) missing.push(t('wizard_step_identity'));
    if (!document.getElementById('cb-class')?.value) missing.push(t('wizard_step_class'));
    const str = +(document.getElementById('cb-str')?.value);
    if (!str || str < 3) missing.push(t('wizard_step_abilities'));
    if (missing.length) {
        showToast(`${t('cb_val_missing')}: ${missing.join(', ')}`, 'warning', 5000);
        return false;
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
const _RACE_SIZE = {
    'human':'Medium','variant-human':'Medium','high-elf':'Medium','wood-elf':'Medium','dark-elf':'Medium',
    'hill-dwarf':'Medium','mountain-dwarf':'Medium','half-elf':'Medium','half-orc':'Medium',
    'tiefling':'Medium','dragonborn':'Medium','aasimar':'Medium',
    'lightfoot-halfling':'Small','stout-halfling':'Small','forest-gnome':'Small','rock-gnome':'Small',
    'halfling':'Small','gnome':'Small'
};

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
    const _diePrefix = getLang() === 'he' ? 'ק' : 'd';
    if (hdDisp) hdDisp.textContent = _CLASS_HIT_DIE[cls] ? `${_diePrefix}${_CLASS_HIT_DIE[cls]}` : '—';

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

    // Size ← race (auto)
    const sizeEl = document.getElementById('cb-size');
    const sizeVis = document.getElementById('cb-size-visible');
    const raceSize = _RACE_SIZE[race] || 'Medium';
    if (sizeEl) sizeEl.value = raceSize;
    if (sizeVis) sizeVis.value = raceSize;
    const sizeBadge = document.getElementById('cb-size-auto-badge');
    if (sizeBadge && race) sizeBadge.style.display = 'inline-block';

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
        racePreview.textContent = race ? `${t('cb_speed')}: ${sp}ft${dv ? ` · ${t('cb_darkvision')}: ${dv}ft` : ''}` : '';
    }

    // Auto-set class saving throw profs whenever class changes
    const saves = ['str','dex','con','int','wis','cha'];
    if (_CLASS_SAVE_PROFS[cls]) {
        saves.forEach(ab => {
            const el = document.getElementById(`cb-save-${ab}`);
            if (el) el.checked = _CLASS_SAVE_PROFS[cls].includes(ab);
        });
    }

    // ── Auto-calculate AC from armor + DEX + shield ──
    const armorVal = document.getElementById('cb-armor')?.value;
    const shieldChecked = document.getElementById('cb-shield')?.checked;
    const acEl = document.getElementById('cb-ac');
    const acPreview = document.getElementById('cb-ac-preview');
    if (acEl && armorVal !== undefined) {
        const dexMod = _abMod(document.getElementById('cb-dex')?.value);
        let ac = 10 + dexMod; // unarmored default
        let desc = `10 + DEX(${_abSign(dexMod)})`;
        if (armorVal) {
            try {
                const armor = JSON.parse(armorVal);
                if (armor.type === 'light') { ac = armor.baseAC + dexMod; desc = `${armor.name} ${armor.baseAC} + DEX(${_abSign(dexMod)})`; }
                else if (armor.type === 'medium') { ac = armor.baseAC + Math.min(dexMod, 2); desc = `${armor.name} ${armor.baseAC} + DEX(${_abSign(Math.min(dexMod, 2))})`; }
                else if (armor.type === 'heavy') { ac = armor.baseAC; desc = `${armor.name} ${armor.baseAC}`; }
            } catch {}
        }
        if (shieldChecked) { ac += 2; desc += ' +🛡️2'; }
        acEl.value = ac;
        if (acPreview) acPreview.textContent = desc;
    }

    // ── Auto-populate spell slots from class + level ──
    const _SPELL_SLOTS_TABLE = {
        1:[2],2:[3],3:[4,2],4:[4,3],5:[4,3,2],6:[4,3,3],7:[4,3,3,1],8:[4,3,3,2],
        9:[4,3,3,3,1],10:[4,3,3,3,2],11:[4,3,3,3,2,1],12:[4,3,3,3,2,1],
        13:[4,3,3,3,2,1,1],14:[4,3,3,3,2,1,1],15:[4,3,3,3,2,1,1,1],
        16:[4,3,3,3,2,1,1,1],17:[4,3,3,3,2,1,1,1,1],18:[4,3,3,3,3,1,1,1,1],
        19:[4,3,3,3,3,2,1,1,1],20:[4,3,3,3,3,2,2,1,1]
    };
    const _HALF_CASTERS = new Set(['paladin','ranger']);
    if (_CASTER_CLASSES.has(cls)) {
        const effectiveLevel = _HALF_CASTERS.has(cls) ? Math.max(1, Math.floor(level / 2)) : level;
        const slots = _SPELL_SLOTS_TABLE[effectiveLevel] || [];
        for (let i = 1; i <= 9; i++) {
            const slotEl = document.getElementById(`cb-spell-${i}`);
            if (slotEl) slotEl.value = slots[i - 1] || 0;
        }
    }

    // ── Auto-calculate hit modifiers ──
    const strMod = _abMod(document.getElementById('cb-str')?.value);
    const dexMod2 = _abMod(document.getElementById('cb-dex')?.value);
    const meleeEl = document.getElementById('cb-melee');
    const rangedEl = document.getElementById('cb-ranged');
    const spellAtkEl = document.getElementById('cb-spell-atk');
    if (meleeEl && !meleeEl.dataset.manuallyEdited) meleeEl.value = strMod + pb;
    if (rangedEl && !rangedEl.dataset.manuallyEdited) rangedEl.value = dexMod2 + pb;
    // Spell attack: CHA for bard/paladin/sorcerer/warlock, WIS for cleric/druid/ranger, INT for wizard
    const _SPELL_AB = { bard:'cha', cleric:'wis', druid:'wis', paladin:'cha', ranger:'wis', sorcerer:'cha', warlock:'cha', wizard:'int' };
    if (spellAtkEl && !spellAtkEl.dataset.manuallyEdited && _SPELL_AB[cls]) {
        spellAtkEl.value = _abMod(document.getElementById(`cb-${_SPELL_AB[cls]}`)?.value) + pb;
    }
}

// Prevent auto-overwrite when user manually edits these fields
['cb-init','cb-pp','cb-darkvision','cb-speed','cb-melee','cb-ranged','cb-spell-atk'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', function () {
        this.dataset.manuallyEdited = '1';
        const badge = document.getElementById(`${id}-auto-badge`);
        if (badge) badge.style.display = 'none';
    });
});

// Re-run defaults when key fields change
['cb-class','cb-race','cb-level','cb-str','cb-dex','cb-con','cb-int','cb-wis','cb-cha','cb-skill-perception','cb-armor','cb-shield','cb-offhand'].forEach(id => {
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

// ── Ability Score Methods ──────────────────────────────────────────────
const _STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
// Class-optimized standard arrays: [STR, DEX, CON, INT, WIS, CHA]
const _CLASS_STANDARD_ARRAYS = {
    barbarian: [15, 14, 13, 10, 12, 8],  // STR > DEX > CON
    fighter:   [15, 14, 13, 10, 12, 8],  // STR > DEX > CON
    paladin:   [15, 10, 13, 8, 12, 14],  // STR > CON > CHA
    ranger:    [10, 15, 13, 8, 14, 12],  // DEX > WIS > CON
    rogue:     [10, 15, 13, 12, 14, 8],  // DEX > WIS > CON
    monk:      [10, 15, 13, 8, 14, 12],  // DEX > WIS > CON
    bard:      [8, 14, 13, 10, 12, 15],  // CHA > DEX > CON
    cleric:    [10, 12, 14, 8, 15, 13],  // WIS > CON > CHA
    druid:     [10, 12, 14, 8, 15, 13],  // WIS > CON > CHA
    sorcerer:  [8, 14, 13, 10, 12, 15],  // CHA > DEX > CON
    warlock:   [8, 14, 13, 10, 12, 15],  // CHA > DEX > CON
    wizard:    [8, 14, 13, 15, 12, 10],  // INT > CON > WIS
};
const _ABILITY_IDS = ['cb-str', 'cb-dex', 'cb-con', 'cb-int', 'cb-wis', 'cb-cha'];
let _abilityMethod = 'standard';

document.getElementById('cb-ability-method')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-method]');
    if (!btn) return;
    _abilityMethod = btn.dataset.method;
    document.querySelectorAll('.cb-ability-method-btn').forEach(el =>
        el.classList.toggle('active', el.dataset.method === _abilityMethod)
    );
    // Toggle input editability
    _ABILITY_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.readOnly = (_abilityMethod === 'standard');
    });
});

// Standard Array: apply class-optimized array (or generic if no class selected)
window._applyStandardArray = function() {
    const cls = (document.getElementById('cb-class')?.value || '').toLowerCase();
    const arr = _CLASS_STANDARD_ARRAYS[cls] || _STANDARD_ARRAY;
    _ABILITY_IDS.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el) el.value = arr[i];
    });
    _applySmartDefaults();
};

// Roll 4d6 drop lowest (using Math.random for instant results; dice engine for animation is optional)
window._rollAbilityScores = async function() {
    const results = [];
    try {
        // Roll 4d6 six times using 3D dice engine (visual on-screen rolls)
        for (let i = 0; i < 6; i++) {
            const rollResult = await roll3DDice('4d6');
            if (rollResult && Array.isArray(rollResult)) {
                const dice = rollResult.map(r => r.value).sort((a, b) => b - a);
                results.push(dice[0] + dice[1] + dice[2]); // drop lowest
            } else {
                // Fallback if dice engine unavailable
                const dice = [1,2,3,4].map(() => Math.floor(Math.random() * 6) + 1).sort((a, b) => b - a);
                results.push(dice[0] + dice[1] + dice[2]);
            }
        }
    } catch {
        // Fallback: Math.random if dice engine fails
        for (let i = results.length; i < 6; i++) {
            const dice = [1,2,3,4].map(() => Math.floor(Math.random() * 6) + 1).sort((a, b) => b - a);
            results.push(dice[0] + dice[1] + dice[2]);
        }
    }
    clearDice();
    results.sort((a, b) => b - a); // highest first
    _ABILITY_IDS.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el) el.value = results[i];
    });
    _applySmartDefaults();
};

// ── Race Card Grid ────────────────────────────────────────────────────
const _RACE_CARDS = [
    { value:'human',     icon:'<img src="/assets/icons/race/human.png" alt="Human" class="custom-icon" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy">', he:'חיים קצרים, שאיפות אינסופיות — הכל אפשרי', en:'Short lives, endless ambition — anything goes' },
    { value:'elf',       icon:'<img src="/assets/icons/race/elf.png" alt="Elf" class="custom-icon" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy">', he:'אלף שנות חן, חוכמה וחרב חדה כתער', en:'A thousand years of grace, wisdom, and razor-sharp steel' },
    { value:'dwarf',     icon:'<img src="/assets/icons/race/dwarf.png" alt="Dwarf" class="custom-icon" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy">', he:'לא גבוהים, אבל תנסו להזיז אותנו', en:'Not tall, but good luck moving us' },
    { value:'halfling',  icon:'<img src="/assets/icons/race/halfling.png" alt="Halfling" class="custom-icon" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy">', he:'קטנים? כן. מפחדים? בחיים לא', en:'Small? Yes. Scared? Not a chance' },
    { value:'half-elf',  icon:'<img src="/assets/icons/race/half-elf.png" alt="Half-Elf" class="custom-icon" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy">', he:'חצי אלף, חצי אדם, כפול כריזמה', en:'Half elf, half human, double the charm' },
    { value:'half-orc',  icon:'<img src="/assets/icons/race/half-orc.png" alt="Half-Orc" class="custom-icon" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy">', he:'ניבים בולטים, אגרופים בולטים יותר', en:'Tusks stand out, fists stand out more' },
    { value:'tiefling',  icon:'<img src="/assets/icons/race/tiefling.png" alt="Tiefling" class="custom-icon" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy">', he:'קרניים, זנב, וחיוך שאומר ״אני יודע משהו שאתה לא״', en:'Horns, tail, and a smile that says "I know something you don\'t"' },
    { value:'dragonborn', icon:'<img src="/assets/icons/race/dragonborn.png" alt="Dragonborn" class="custom-icon" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy">', he:'דם דרקוני בעורקים — כבוד לפני הכל', en:'Dragon blood in the veins — honor above all' },
    { value:'gnome',     icon:'<img src="/assets/icons/race/gnome.png" alt="Gnome" class="custom-icon" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy">', he:'הראש קטן אבל הרעיונות ענקיים', en:'Tiny head, enormous ideas' },
    { value:'aasimar',   icon:'<img src="/assets/icons/race/aasimar.png" alt="Aasimar" class="custom-icon" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy">', he:'זוהר שמימי מבפנים — אור שלא נכבה', en:'Celestial glow from within — a light that never fades' },
];

const _RACE_SUBRACES = {
    'human':    [{ slug:'human', key:'race_human', icon:'human', he:'+1 לכל דבר — אין התמחות, יש הכל', en:'+1 to everything — no specialty, all potential' },
                 { slug:'variant-human', key:'race_variant_human', icon:'human', he:'כישרון מולד וניסיון שקשה להתעלם ממנו', en:'Born talented, with experience hard to ignore' }],
    'elf':      [{ slug:'high-elf', key:'race_high_elf', icon:'elf', he:'לחש על השפתיים וחרב ביד — אלגנטיות קטלנית', en:'Cantrip on the lips, blade in hand — lethal elegance' },
                 { slug:'wood-elf', key:'race_wood_elf', icon:'elf', he:'מהירים כצבי, שקטים כרוח ביער', en:'Fast as a deer, silent as the forest wind' },
                 { slug:'dark-elf', key:'race_dark_elf', icon:'elf', he:'מהאנדרדארק עולה משהו — ותרוצו כשתראו מה', en:'Something rises from the Underdark — run when you see it' }],
    'dwarf':    [{ slug:'hill-dwarf', key:'race_hill_dwarf', icon:'dwarf', he:'חוכמת ההרים זורמת בדם — סבלני ועמיד', en:'Mountain wisdom in the blood — patient and tough' },
                 { slug:'mountain-dwarf', key:'race_mountain_dwarf', icon:'dwarf', he:'נולדנו בשריון ועם פטיש ביד', en:'Born in armor, hammer already in hand' }],
    'halfling': [{ slug:'lightfoot-halfling', key:'race_lightfoot_halfling', icon:'halfling', he:'פשוט נעלם — אל תחפש, לא תמצא', en:'Simply vanishes — don\'t bother looking' },
                 { slug:'stout-halfling', key:'race_stout_halfling', icon:'halfling', he:'שותה גמדים מתחת לשולחן ועדיין עומד', en:'Drinks dwarves under the table and still stands' }],
    'gnome':    [{ slug:'forest-gnome', key:'race_forest_gnome', icon:'gnome', he:'מדבר עם חיות ויוצר אשליות — ביום רגיל', en:'Talks to animals and creates illusions — on a normal day' },
                 { slug:'rock-gnome', key:'race_rock_gnome', icon:'gnome', he:'אם זה לא עובד, תן לננס — יתקן ויוסיף כנפיים', en:'Broken? Give it to the gnome — fixed with wings added' }],
    'dragonborn':[
        { slug:'dragonborn-black',  key:'race_dragonborn_black',  icon:'dragonborn', he:'חומצה — קו 5×30 רגל (הצלה DEX)', en:'Acid — 5×30 ft line (DEX save)' },
        { slug:'dragonborn-blue',   key:'race_dragonborn_blue',   icon:'dragonborn', he:'ברק — קו 5×30 רגל (הצלה DEX)', en:'Lightning — 5×30 ft line (DEX save)' },
        { slug:'dragonborn-brass',  key:'race_dragonborn_brass',  icon:'dragonborn', he:'אש — קו 5×30 רגל (הצלה DEX)', en:'Fire — 5×30 ft line (DEX save)' },
        { slug:'dragonborn-bronze', key:'race_dragonborn_bronze', icon:'dragonborn', he:'ברק — קו 5×30 רגל (הצלה DEX)', en:'Lightning — 5×30 ft line (DEX save)' },
        { slug:'dragonborn-copper', key:'race_dragonborn_copper', icon:'dragonborn', he:'חומצה — קו 5×30 רגל (הצלה DEX)', en:'Acid — 5×30 ft line (DEX save)' },
        { slug:'dragonborn-gold',   key:'race_dragonborn_gold',   icon:'dragonborn', he:'אש — חרוט 15 רגל (הצלה DEX)', en:'Fire — 15 ft cone (DEX save)' },
        { slug:'dragonborn-green',  key:'race_dragonborn_green',  icon:'dragonborn', he:'רעל — חרוט 15 רגל (הצלה CON)', en:'Poison — 15 ft cone (CON save)' },
        { slug:'dragonborn-red',    key:'race_dragonborn_red',    icon:'dragonborn', he:'אש — חרוט 15 רגל (הצלה DEX)', en:'Fire — 15 ft cone (DEX save)' },
        { slug:'dragonborn-silver', key:'race_dragonborn_silver', icon:'dragonborn', he:'קור — חרוט 15 רגל (הצלה CON)', en:'Cold — 15 ft cone (CON save)' },
        { slug:'dragonborn-white',  key:'race_dragonborn_white',  icon:'dragonborn', he:'קור — חרוט 15 רגל (הצלה CON)', en:'Cold — 15 ft cone (CON save)' },
    ],
    'half-elf':  null, 'half-orc': null, 'tiefling': null, 'aasimar': null,
};

function _renderRaceCards(selectedBase = '') {
    const grid = document.getElementById('cb-race-grid');
    if (!grid) return;
    const lang = getLang();
    grid.innerHTML = _RACE_CARDS.map(r =>
        `<div class="cb-class-card${r.value === selectedBase ? ' selected' : ''}"
              data-value="${r.value}" onclick="window._selectRaceCard('${r.value}')">
            <span class="cb-class-card-icon">${r.icon}</span>
            <span class="cb-class-card-name">${t('race_' + r.value.replace('-','_')) || r.value}</span>
            <span class="cb-card-tagline">${lang === 'he' ? r.he : r.en}</span>
        </div>`
    ).join('');
    // Show/hide subrace grid
    _renderSubraceCards(selectedBase);
}

function _renderSubraceCards(baseRace) {
    const grid = document.getElementById('cb-subrace-grid');
    const preview = document.getElementById('cb-race-traits-preview');
    if (!grid) return;
    const subs = _RACE_SUBRACES[baseRace];
    if (!subs) {
        grid.style.display = 'none';
        // No subraces — set the hidden select directly to the base race slug
        const sel = document.getElementById('cb-race');
        if (sel && baseRace) { sel.value = baseRace; sel.dispatchEvent(new Event('change')); }
        _showRaceTraits(baseRace);
        return;
    }
    grid.style.display = '';
    const lang = getLang();
    const currentRace = document.getElementById('cb-race')?.value || '';
    grid.innerHTML = `<div style="font-size:11px;color:#aaa;margin-bottom:4px;" data-i18n="cb_subrace_label">${t('cb_subrace_label')}</div>` +
        subs.map(s =>
        `<div class="cb-class-card${s.slug === currentRace ? ' selected' : ''}"
              data-value="${s.slug}" onclick="window._selectSubrace('${s.slug}')">
            <span class="cb-class-card-icon"><img src="/assets/icons/race/${s.icon}.png" alt="${t(s.key)}" class="custom-icon" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy"></span>
            <span class="cb-class-card-name">${t(s.key) || s.slug}</span>
            <span class="cb-card-tagline">${lang === 'he' ? s.he : s.en}</span>
        </div>`
    ).join('');
}

function _showRaceTraits(raceSlug) {
    const preview = document.getElementById('cb-race-traits-preview');
    if (!preview) return;
    if (!raceSlug || !RACE_MECHANICS?.[raceSlug]) { preview.style.display = 'none'; return; }
    const mech = RACE_MECHANICS[raceSlug];
    const traits = (mech.traits || []).map(tr => t('trait_' + tr) || tr).join(' · ');
    const bonuses = Object.entries(mech.abilBonus || {}).map(([ab, v]) => `+${v} ${t('ab_' + ab)}`).join(', ');
    const speed = mech.speed || 30;
    preview.style.display = '';
    preview.innerHTML = `<div style="font-size:11px;color:#2ecc71;margin-top:6px;">${bonuses ? bonuses + ' · ' : ''}${t('cb_speed')}: ${speed}</div>` +
        (traits ? `<div style="font-size:10px;color:#888;margin-top:3px;">${traits}</div>` : '');
}

window._selectRaceCard = function(baseRace) {
    document.querySelectorAll('#cb-race-grid .cb-class-card').forEach(el =>
        el.classList.toggle('selected', el.dataset.value === baseRace)
    );
    const subs = _RACE_SUBRACES[baseRace];
    if (!subs) {
        // No subraces — set directly
        const sel = document.getElementById('cb-race');
        if (sel) { sel.value = baseRace; sel.dispatchEvent(new Event('change')); }
    }
    _renderSubraceCards(baseRace);
};

window._selectSubrace = function(slug) {
    document.querySelectorAll('#cb-subrace-grid .cb-class-card').forEach(el =>
        el.classList.toggle('selected', el.dataset.value === slug)
    );
    const sel = document.getElementById('cb-race');
    if (sel) { sel.value = slug; sel.dispatchEvent(new Event('change')); }
    _showRaceTraits(slug);
    _applySmartDefaults();
};

// Init race grid
_renderRaceCards('');

// ── Name Generator ────────────────────────────────────────────────────
const _RACE_NAME_MAP = {
    'human':'Human', 'variant-human':'Human',
    'high-elf':'Elf', 'wood-elf':'Elf', 'dark-elf':'Elf',
    'hill-dwarf':'Dwarf', 'mountain-dwarf':'Dwarf',
    'lightfoot-halfling':'Halfling', 'stout-halfling':'Halfling',
    'half-elf':'Elf', 'half-orc':'Orc',
    'tiefling':'Tiefling', 'dragonborn':'Dragonborn',
    'forest-gnome':'Gnome', 'rock-gnome':'Gnome',
    'aasimar':'Human',
};

document.getElementById('cb-name-gen-btn')?.addEventListener('click', () => {
    const raceSlug = document.getElementById('cb-race')?.value || '';
    const gender = document.getElementById('cb-gender')?.value || 'male';
    const fakerRace = _RACE_NAME_MAP[raceSlug] || 'Human';
    const g = gender === 'nonbinary' ? (Math.random() > 0.5 ? 'male' : 'female') : gender;
    const name = generateNPCName(fakerRace, g, getLang());
    const nameEl = document.getElementById('cb-name');
    if (nameEl && name) nameEl.value = name;
});

// ── Belief System ─────────────────────────────────────────────────────
const _BELIEF_CARDS = [
    { value: 'agnostic', icon: 'toolbar/agnostic', nameKey: 'cb_belief_agnostic', tagKey: 'cb_belief_agnostic_tag' },
    { value: 'believer', icon: 'toolbar/believer', nameKey: 'cb_belief_believer', tagKey: 'cb_belief_believer_tag' },
    { value: 'atheist',  icon: 'toolbar/atheist', nameKey: 'cb_belief_atheist', tagKey: 'cb_belief_atheist_tag' },
];

function _renderBeliefCards(selectedBelief = '') {
    const grid = document.getElementById('cb-belief-grid');
    if (!grid) return;
    grid.innerHTML = _BELIEF_CARDS.map(b =>
        `<div class="cb-class-card${b.value === selectedBelief ? ' selected' : ''}" data-belief="${b.value}">
            <span class="cb-class-card-icon"><img src="/assets/icons/${b.icon}.png" alt="${t(b.nameKey)}" class="custom-icon" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy"></span>
            <span class="cb-class-card-name">${t(b.nameKey)}</span>
            <span class="cb-card-tagline">${t(b.tagKey)}</span>
        </div>`
    ).join('');
}
_renderBeliefCards();

document.getElementById('cb-belief-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-belief]');
    if (!card) return;
    document.querySelectorAll('#cb-belief-grid [data-belief]').forEach(el =>
        el.classList.toggle('selected', el === card)
    );
    const belief = card.dataset.belief;
    const deitySection = document.getElementById('cb-deity-section');
    if (deitySection) deitySection.style.display = belief === 'believer' ? '' : 'none';
    _updateDeityFlavor();
});

// Show holy symbol picker for cleric/paladin, update flavor text
function _updateDeityFlavor() {
    const cls = (document.getElementById('cb-class')?.value || '').toLowerCase();
    const holySection = document.getElementById('cb-holy-symbol-section');
    const flavorEl = document.getElementById('cb-deity-flavor');
    const isDivine = ['cleric', 'paladin'].includes(cls);
    if (holySection) holySection.style.display = isDivine ? '' : 'none';

    if (!flavorEl) return;
    const deity = document.getElementById('cb-deity')?.value?.trim();
    const charName = document.getElementById('cb-name')?.value?.trim() || '???';
    if (!deity) { flavorEl.textContent = ''; return; }

    const symbolSel = document.getElementById('cb-holy-symbol');
    const symbolVal = symbolSel?.value;
    const symbolName = symbolVal ? t(`holy_${symbolVal}`) : '';

    let key = 'cb_deity_flavor_other';
    if (cls === 'cleric') key = 'cb_deity_flavor_cleric';
    else if (cls === 'paladin') key = 'cb_deity_flavor_paladin';

    let text = t(key);
    text = text.replace('{name}', charName).replace('{deity}', deity).replace('{symbol}', symbolName);
    flavorEl.textContent = text;
}

document.getElementById('cb-deity')?.addEventListener('input', _updateDeityFlavor);
document.getElementById('cb-holy-symbol')?.addEventListener('change', _updateDeityFlavor);

document.getElementById('cb-holy-symbol-grid')?.addEventListener('click', (e) => {
    const sym = e.target.closest('.holy-symbol-btn');
    if (!sym) return;
    document.querySelectorAll('.holy-symbol-btn').forEach(el => el.classList.remove('selected'));
    sym.classList.add('selected');
});

// ── Level Up Modal (subscription upgrade) ──────────────────────────
function _showLevelUpModal() {
    const modal = document.getElementById('level-up-modal');
    if (modal) modal.style.display = 'flex';
}
window._closeLevelUpModal = function() {
    const modal = document.getElementById('level-up-modal');
    if (modal) modal.style.display = 'none';
};
// Wix Pricing Plan IDs (created via Wix API)
const _WIX_PLAN_IDS = {
    monthly:  'fa255208-eb22-4cca-aa0e-bfc143e6b1c3',
    yearly:   'f5ff7be1-1467-476c-b97f-064790d819f1',
    lifetime: '4a2d50ef-684f-4ebc-bf6d-d5620299f6c2',
};
// Wix site pricing page — update this with your actual Wix site URL
const _WIX_PRICING_URL = 'https://www.danielrigbi.co.il/pricing-plans';

window._startCheckout = function(plan) {
    const planId = _WIX_PLAN_IDS[plan];
    if (!planId) return;
    // Redirect to Wix pricing page — Wix handles payment, receipts, and subscription management
    window.open(`${_WIX_PRICING_URL}?planSlug=${plan === 'monthly' ? 'paradice-dm-hwdsy' : plan === 'yearly' ? 'paradice-dm-snty' : 'paradice-founder-pack-hbylt-myysdym'}`, '_blank');
};

// ── Sync visible gender/size selects to hidden originals ──
document.getElementById('cb-gender-visible')?.addEventListener('change', (e) => {
    const hidden = document.getElementById('cb-gender');
    if (hidden) { hidden.value = e.target.value; hidden.dispatchEvent(new Event('change')); }
});
document.getElementById('cb-size-visible')?.addEventListener('change', (e) => {
    const hidden = document.getElementById('cb-size');
    if (hidden) { hidden.value = e.target.value; hidden.dispatchEvent(new Event('change')); }
});

// ── Level picker sync (Step 1 level-step1 ↔ Step 3 cb-level) ──────────
document.getElementById('cb-level-step1')?.addEventListener('input', (e) => {
    const cbLevel = document.getElementById('cb-level');
    if (cbLevel) { cbLevel.value = e.target.value; cbLevel.dispatchEvent(new Event('change')); }
});
document.getElementById('cb-level')?.addEventListener('input', (e) => {
    const step1 = document.getElementById('cb-level-step1');
    if (step1) step1.value = e.target.value;
});

// ── Off-hand → Shield sync ────────────────────────────────────────────
document.getElementById('cb-offhand')?.addEventListener('change', (e) => {
    const shield = document.getElementById('cb-shield');
    if (shield) shield.checked = (e.target.value === 'shield');
    _applySmartDefaults();
});

// ── Dice Color Picker ─────────────────────────────────────────────────
function _updateD20Preview(color) {
    ['cb-d20-shape','cb-d20-inner','cb-d20-text'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.setAttribute('stroke', color); el.setAttribute('fill', id === 'cb-d20-text' ? color : 'none'); }
    });
}

document.getElementById('cb-color-swatches')?.addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    const color = swatch.dataset.color;
    if (color === 'custom') {
        const picker = document.getElementById('cb-color');
        if (picker) { picker.click(); }
        return;
    }
    document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
    swatch.classList.add('selected');
    const picker = document.getElementById('cb-color');
    if (picker) picker.value = color;
    _updateD20Preview(color);
});

document.getElementById('cb-color')?.addEventListener('input', (e) => {
    const color = e.target.value;
    document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
    _updateD20Preview(color);
});

// ── Class Card Grid ────────────────────────────────────────────────────
const _CLASS_CARDS = [
    { value:'Barbarian', icon:'barbarian', he:'צועק, שובר, לא מתנצל — הזעם הוא הדלק', en:'Scream, smash, no apologies — rage is fuel' },
    { value:'Bard', icon:'bard', he:'שיר אחד מרפא, השני הורג — תלוי במצב הרוח', en:'One song heals, the next kills — depends on the mood' },
    { value:'Cleric', icon:'cleric', he:'האלים שולחים כוח — ואני מחליט איפה הוא פוגע', en:'The gods send power — I decide where it lands' },
    { value:'Druid', icon:'druid', he:'היום עץ, מחר דוב — הטבע לא מתנצל', en:'A tree today, a bear tomorrow — nature doesn\'t apologize' },
    { value:'Fighter', icon:'fighter', he:'כל נשק, כל מצב — אני מוכן', en:'Any weapon, any situation — I\'m ready' },
    { value:'Monk', icon:'monk', he:'אין צורך בנשק כשהגוף שלך הוא הנשק', en:'No weapon needed when your body IS the weapon' },
    { value:'Paladin', icon:'paladin', he:'שבועה, חרב וריפוי — צדק בגוף ראשון', en:'Oath, blade, and healing — justice in person' },
    { value:'Ranger', icon:'ranger', he:'מוצא אותך לפני שאתה יודע שהוא שם', en:'Finds you before you know they\'re there' },
    { value:'Rogue', icon:'rogue', he:'דקירה אחת בגב ובורח לפני שנופלים', en:'One backstab and gone before they hit the floor' },
    { value:'Sorcerer', icon:'sorcerer', he:'הקסם בדם — לא למדתי, נולדתי ככה', en:'Magic in the blood — not learned, born this way' },
    { value:'Warlock', icon:'warlock', he:'חתמתי עסקה עם ישות עתיקה — מה הגרוע שיקרה?', en:'Pact with an ancient being — what\'s the worst that could happen?' },
    { value:'Wizard', icon:'wizard', he:'כל לחש שקיים נמצא בספר שלי', en:'Every spell ever cast is in my book' },
];

function _renderClassCards(selectedValue = '') {
    const grid = document.getElementById('cb-class-grid');
    if (!grid) return;
    const lang = getLang();
    grid.innerHTML = _CLASS_CARDS.map(c => {
        const name = t('class_' + c.value.toLowerCase()) || c.value;
        const tagline = lang === 'he' ? c.he : c.en;
        return `<div class="cb-class-card${c.value === selectedValue ? ' selected' : ''}"
              data-value="${c.value}" onclick="window._selectClassCard('${c.value}')">
            <span class="cb-class-card-icon"><img src="/assets/icons/class/${c.icon}.png" alt="${c.value}" class="custom-icon" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy"></span>
            <span class="cb-class-card-name">${name}</span>
            <span class="cb-card-tagline">${tagline}</span>
        </div>`;
    }).join('');
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
        ? `${t('cb_background_skills_auto')} ${skills.map(s => t('skill_' + s) || s.replace(/_/g,' ')).join(', ')}`
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
        el.innerHTML = `<div style="font-size:10px;color:#e67e22;font-weight:bold;margin-bottom:4px;"><img src="/assets/icons/action/melee.png" alt="" class="custom-icon" style="width:14px;height:14px;vertical-align:middle;" loading="lazy"> ${t('cb_maneuver_pick')} (3):</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;">
                ${_MANEUVER_SLUGS.map(s => {
                    const name = t('maneuver_' + s) || s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
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
        el.innerHTML = `<div style="font-size:10px;color:#e67e22;font-weight:bold;margin-bottom:4px;"><img src="/assets/icons/action/nature.png" alt="" class="custom-icon" style="width:14px;height:14px;vertical-align:middle;" loading="lazy"> ${t('cb_totem_pick')}:</div>
            <div style="display:flex;gap:8px;">
                ${['bear','eagle','wolf'].map(a => `<label style="font-size:11px;color:#ccc;display:flex;align-items:center;gap:3px;">
                    <input type="radio" name="totem-choice" value="${a}" ${chosen===a?'checked':''} onchange="document.getElementById('cb-subclass-choices').dataset.choices=JSON.stringify({totem:'${a}'})">
                    ${t('totem_' + a) || a.charAt(0).toUpperCase()+a.slice(1)}
                </label>`).join('')}
            </div>`;
    } else if (slug === 'draconic') {
        const chosen = existing.dragonAncestry || '';
        el.innerHTML = `<div style="font-size:10px;color:#e67e22;font-weight:bold;margin-bottom:4px;"><img src="/assets/icons/action/fire.png" alt="" class="custom-icon" style="width:14px;height:14px;vertical-align:middle;" loading="lazy"> ${t('cb_dragon_ancestry')}:</div>
            <select style="background:#2c3e50;color:white;border:1px solid #555;border-radius:4px;padding:3px 6px;font-size:11px;" onchange="document.getElementById('cb-subclass-choices').dataset.choices=JSON.stringify({dragonAncestry:this.value})">
                <option value="">${t('cb_choose') || 'Choose…'}</option>
                ${['acid','cold','fire','lightning','poison'].map(d =>
                    `<option value="${d}" ${chosen===d?'selected':''}>${t('dmg_' + d) || d.charAt(0).toUpperCase()+d.slice(1)}</option>`
                ).join('')}
            </select>`;
    } else if (slug === 'hunter') {
        const chosen = existing.hunterChoice || '';
        el.innerHTML = `<div style="font-size:10px;color:#e67e22;font-weight:bold;margin-bottom:4px;"><img src="/assets/icons/action/ranged.png" alt="" class="custom-icon" style="width:14px;height:14px;vertical-align:middle;" loading="lazy"> ${t('cb_hunter_prey')}:</div>
            <div style="display:flex;flex-direction:column;gap:3px;">
                ${[['colossus_slayer','cb_colossus_slayer'],['giant_killer','cb_giant_killer'],['horde_breaker','cb_horde_breaker']].map(([v,k]) =>
                    `<label style="font-size:11px;color:#ccc;display:flex;align-items:center;gap:3px;">
                        <input type="radio" name="hunter-choice" value="${v}" ${chosen===v?'checked':''} onchange="document.getElementById('cb-subclass-choices').dataset.choices=JSON.stringify({hunterChoice:'${v}'})">
                        ${t(k)}
                    </label>`
                ).join('')}
            </div>`;
    } else if (slug === 'divination') {
        el.innerHTML = `<div style="font-size:10px;color:#9b59b6;font-style:italic;"><img src="/assets/icons/toolbar/dice.png" alt="" class="custom-icon" style="width:14px;height:14px;vertical-align:middle;" loading="lazy"> ${t('cb_portent_note')}</div>`;
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
    preview.textContent = `${t('cb_ac_preview')}: ${ac}`;
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
        const nameKey = `feat_${slug}`;
        const translated = t(nameKey);
        const name = (translated !== nameKey) ? translated : slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const fm = FEAT_MECHANICS[slug];
        const effects = [];
        if (fm.initiative)          effects.push(`+${fm.initiative} ${t('cb_init_label') || 'initiative'}`);
        if (fm.max_hp_bonus?.perLevel) effects.push(`+${fm.max_hp_bonus.perLevel} HP/${t('cb_level') || 'level'}`);
        if (fm.speed)               effects.push(`+${fm.speed} ft ${t('cb_speed') || 'speed'}`);
        if (fm.abilBonus)           effects.push(Object.entries(fm.abilBonus).map(([a,v]) => `+${v} ${a.toUpperCase()}`).join(', '));
        const desc = effects.length ? `<span style="font-size:10px;color:#aaa;"> — ${effects.join(', ')}</span>` : '';
        return `<button type="button" data-feat-slug="${slug}"
            style="text-align:${getLang()==='he'?'right':'left'};background:rgba(155,89,182,0.1);border:1px solid rgba(155,89,182,0.3);color:#d7bde2;border-radius:5px;padding:5px 8px;cursor:pointer;font-size:12px;">
            ${name}${desc}</button>`;
    }).join('');
    // Event delegation for feat buttons
    setTimeout(() => {
        const list = document.getElementById('feat-picker-list');
        if (list) list.addEventListener('click', e => {
            const btn = e.target.closest('[data-feat-slug]');
            if (btn) window._addFeatChip(btn.dataset.featSlug);
        });
    }, 0);
}

/** Add a feat chip to the feat chips container. */
window._addFeatChip = function(slug) {
    const chips = document.getElementById('cb-feat-chips');
    if (!chips) return;
    const feats = JSON.parse(chips.dataset.feats || '[]');
    if (feats.find(f => f.name === slug)) return; // no dupes
    const nameKey = `feat_${slug}`;
    const translated = t(nameKey);
    const name = (translated !== nameKey) ? translated : slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    feats.push({ name: slug });
    chips.dataset.feats = JSON.stringify(feats);
    const chip = document.createElement('span');
    chip.className = 'feat-chip';
    chip.textContent = name + ' ';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    Object.assign(removeBtn.style, { background:'none', border:'none', color:'#e74c3c', cursor:'pointer', padding:'0 2px', fontSize:'13px' });
    removeBtn.addEventListener('click', () => window._removeFeatChip(slug));
    chip.appendChild(removeBtn);
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
            <input type="text" class="builder-input act-name" value="${d.name||''}" placeholder="${t('cb_action_name_ph')}" style="flex:2; min-width:100px; padding:5px; font-size:12px;">
            <select class="builder-input act-hit-type" style="flex:1.5; min-width:95px; padding:5px; font-size:11px;">
                <option value="melee">${t('cb_action_melee')}</option>
                <option value="ranged">${t('cb_action_ranged')}</option>
                <option value="spell">${t('cb_action_spell')}</option>
                <option value="always">${t('cb_action_always_hit')}</option>
                <option value="none">— ${t('cb_action_no_roll')}</option>
            </select>
            <input type="number" class="builder-input act-hit-mod" value="${parseInt(d.hitMod)||0}" min="0" max="15"
                   style="width:50px; padding:5px; font-size:12px; text-align:center;" title="${t('cb_hit_bonus_title')}">
            <span style="font-size:9px; color:#aaa; white-space:nowrap;">${t('cb_hit_bonus')}</span>
        </div>
        <div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap; margin-top:5px;">
            <select class="builder-input act-dmg-dice" style="flex:1.5; min-width:95px; padding:5px; font-size:11px;">
                ${DAMAGE_DICE_OPTIONS.map(opt => `<option value="${opt}">${opt || ('— ' + t('cb_action_no_dmg'))}</option>`).join('')}
            </select>
            <span style="font-size:10px; color:#888;">×</span>
            <input type="number" class="builder-input act-dmg-mult" value="${parseInt(d.damageMult)||1}" min="1" max="15"
                   style="width:45px; padding:5px; font-size:12px; text-align:center;" title="${t('cb_dice_mult_title')}">
            <select class="builder-input act-action-type" style="width:90px; padding:5px; font-size:11px;" title="${t('cb_action_dmg_or_heal')}">
                <option value="damage">${t('cb_action_damage')}</option>
                <option value="heal">${t('cb_action_heal')}</option>
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
    gallery.setAttribute('data-label', t('cb_pick_icon') || 'בחר איור');
    ACTION_ICONS.forEach(ic => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'act-icon-btn' + (ic === selectedIcon ? ' selected' : '');
        btn.innerHTML = `<img src="/assets/icons/action/${ic}.png" alt="${ic}" class="custom-icon" loading="lazy">`;
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

db.listenToAuthState(async (user) => {
    if (user) {
        currentUserUid = user.uid;
        setUid(user.uid);
        _tavernEntrance();
        if(userDisplayName) userDisplayName.innerText = user.displayName || "Player";
        if(userEmail) userEmail.innerText = user.email || "";
        if (user.photoURL && userAvatar) userAvatar.src = user.photoURL;
        // Store email + displayName in RTDB so webhook can match Wix buyer → Firebase user
        db.patchUser(user.uid, { email: user.email || '', displayName: user.displayName || '' });
        db.listenToUserCharacters(user.uid, renderVault);

        // Init account dashboard
        initDashboard(user.uid, user);

        // Init subscription listener — MUST await so tier is resolved before UI interactions
        await listenToSubscription(user.uid, (sub) => {
            window._currentTier = sub.tier;
            // Show trial/grace banners
            const banner = document.getElementById('sub-banner');
            if (banner) {
                if (sub.inTrial) {
                    banner.textContent = t('sub_trial_days_left').replace('{n}', sub.daysLeft);
                    banner.style.display = '';
                } else if (sub.inGrace) {
                    banner.textContent = t('sub_payment_crit_miss');
                    banner.style.display = '';
                    banner.style.background = 'rgba(231,76,60,0.2)';
                } else {
                    banner.style.display = 'none';
                }
            }
        });

        // Init campaign tab
        initCampaigns(user.uid, user.displayName || 'Player', (role, charData, campaignId, isCampaign) => {
            langToggleBtn.style.display = 'none';
            if (lobbyScreen) lobbyScreen.style.display = 'none';
            showSpinner(t('campaign_session_loading'));
            startGame(role, charData, campaignId, isCampaign);
            if (role === 'dm' && currentUserUid) db.setDmUid(campaignId, currentUserUid);
        });

        // Init community hub tab
        initCommunityHub(user.uid, user.displayName || 'Player');
        ensureProfile(user.uid, user.displayName || 'Player', user.photoURL || '');
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
    const genderVis = document.getElementById('cb-gender-visible');
    if (genderVis) genderVis.value = c.gender || 'male';
    const sizeVis = document.getElementById('cb-size-visible');
    if (sizeVis) sizeVis.value = c.size || 'Medium';
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
            chip.textContent = name + ' ';
            const rmBtn = document.createElement('button');
            rmBtn.type = 'button';
            rmBtn.textContent = '×';
            Object.assign(rmBtn.style, { background:'none', border:'none', color:'#e74c3c', cursor:'pointer', padding:'0 2px', fontSize:'13px' });
            rmBtn.addEventListener('click', () => window._removeFeatChip(slug));
            chip.appendChild(rmBtn);
            featsEl2.appendChild(chip);
        });
    }

    // HD Remaining & Temp HP
    const hdRemainingEl2 = document.getElementById('cb-hd-remaining');
    if (hdRemainingEl2) hdRemainingEl2.value = c.hdRemaining ?? c.hdLeft ?? c.level ?? '';
    const tempHpEl2 = document.getElementById('cb-temp-hp');
    if (tempHpEl2) tempHpEl2.value = c.tempHp || 0;

    _updateAcPreview();

    // Belief system restore
    if (c.belief) {
        _renderBeliefCards(c.belief);
        const deitySection = document.getElementById('cb-deity-section');
        if (deitySection) deitySection.style.display = c.belief === 'believer' ? '' : 'none';
    }
    // Deity & holy symbol
    const deityEl = document.getElementById('cb-deity');
    if (deityEl) deityEl.value = c.deity?.name || '';
    const holySymEl = document.getElementById('cb-holy-symbol');
    if (holySymEl) holySymEl.value = c.deity?.symbol || '';
    // Off-hand weapon
    const offhandEl = document.getElementById('cb-offhand');
    if (offhandEl && c.equipment?.shield) {
        offhandEl.value = 'shield';
    } else if (offhandEl && c.equipment?.offHand) {
        Array.from(offhandEl.options).forEach(opt => {
            try { if (JSON.parse(opt.value)?.name === c.equipment.offHand.name) offhandEl.value = opt.value; } catch {}
        });
    }
    // Personal story
    const storyEl = document.getElementById('cb-story');
    if (storyEl) storyEl.value = c.personalStory || '';
    // Level in step 1
    const levelStep1 = document.getElementById('cb-level-step1');
    if (levelStep1) levelStep1.value = c.level || 1;

    // Wizard: render race & class cards, go to step 1, run smart defaults, clear manual-edit flags
    // Determine base race from subrace slug for race card selection
    const _baseRaceFromSlug = (slug) => {
        for (const [base, subs] of Object.entries(_RACE_SUBRACES)) {
            if (subs && subs.some(s => s.slug === slug)) return base;
            if (!subs && base === slug) return base;
        }
        return slug;
    };
    const baseRace = _baseRaceFromSlug(c.race || '');
    _renderRaceCards(baseRace);
    // Auto-select subrace if applicable
    if (baseRace !== c.race && c.race) {
        window._selectSubrace?.(c.race);
    }
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
        // Tier gate: check character limit
        const charCount = Object.keys(currentVaultCharacters || {}).length;
        if (!checkCanCreateCharacter(charCount)) {
            _showLevelUpModal();
            return;
        }
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
        _renderRaceCards('');
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
            if (!_validateSave()) return;
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
            charData.hdMax       = charLevel;
            charData.hdLeft      = charLevel;
            charData.hdRemaining = charLevel;
            charData.conMod      = conMod;
            charData.tempHp      = 0;

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
            const offhandVal = document.getElementById('cb-offhand')?.value || '';
            const offHandData = offhandVal === 'shield' ? null : _parseEquipSlot(offhandVal);
            const equipment = {
                armor:   armorVal   ? _parseEquipSlot(armorVal)   : null,
                shield:  shieldOn   ? { name: 'Shield', acBonus: 2 }  : null,
                mainHand: mainHandVal ? _parseEquipSlot(mainHandVal) : null,
                ranged:  rangedWeaponVal ? _parseEquipSlot(rangedWeaponVal) : null,
                offHand: offHandData,
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

            // Belief system
            const beliefCard = document.querySelector('#cb-belief-grid [data-belief].selected');
            if (beliefCard) {
                charData.belief = beliefCard.dataset.belief;
                if (charData.belief === 'believer') {
                    const deityName = document.getElementById('cb-deity')?.value.trim();
                    const holySym = document.getElementById('cb-holy-symbol')?.value || '';
                    if (deityName || holySym) {
                        charData.deity = { name: deityName || '', symbol: holySym };
                    }
                }
            }
            const story = document.getElementById('cb-story')?.value.trim();
            if (story) charData.personalStory = story;

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
        // Tier gate: only DM/Founder can create rooms
        if (!checkCanCreateRoom()) {
            _showLevelUpModal();
            return;
        }
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
