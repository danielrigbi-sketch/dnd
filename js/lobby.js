// lobby.js - Welcome screen and Authentication Controller
// lobby.js v130 (S14: portrait upload via Firebase Storage)
import * as db from "./firebaseService.js";
import { uploadPortrait } from "./firebaseService.js"; // S14: direct import
import { startGame, setUid } from "./app.js";
import { setLanguage, getLang, t, updateDOM } from "./i18n.js";
import { tmt2mtPlayerTokens } from "./tmt.js";
import { initCampaigns } from "./campaign.js";

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
        authErr.textContent = 'התחברות נכשלה — נסה שוב או פתח בדפדפן אחר';
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

// Listen for class/race/gender changes to update the tab if it's open
['cb-class','cb-race','cb-gender'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
        if (tabTmt?.classList.contains('active')) _refreshTmtTab();
    });
});

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
            if (progressEl) { progressEl.textContent = '⚠ upload failed'; setTimeout(() => { progressEl.style.display = 'none'; }, 2500); }
        }
    });
}

if (addAttackBtn) {
    addAttackBtn.onclick = () => {
        const row = document.createElement('div');
        row.className = 'flex-row';
        row.innerHTML = `
            <input type="text" class="builder-input atk-name flex-1" placeholder="${t('ph_atk_name')}" style="padding:6px; font-size:12px; width: 40%;">
            <input type="number" class="builder-input atk-bonus flex-1" placeholder="${t('ph_atk_bonus')}" style="padding:6px; font-size:12px; width: 20%;">
            <input type="text" class="builder-input atk-dmg flex-1" placeholder="${t('ph_atk_dmg')}" style="padding:6px; font-size:12px; width: 30%;">
            <button type="button" class="delete-atk-btn" onclick="this.parentElement.remove()" aria-label="מחק התקפה">X</button>
        `;
        attacksList.appendChild(row);
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

db.listenToAuthState((user) => {
    if (user) {
        currentUserUid = user.uid;
        setUid(user.uid);
        if(authScreen) authScreen.style.display = 'none';
        if(lobbyScreen) lobbyScreen.style.display = 'block';
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
            <img src="${c.portrait || 'assets/logo.png'}" class="vault-card-img" style="border: 2px solid ${c.color || '#3498db'}">
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
    document.getElementById('cb-melee').value = c.melee || "";
    document.getElementById('cb-melee-dmg').value = c.meleeDmg || "1d6";
    document.getElementById('cb-ranged').value = c.ranged || "";
    document.getElementById('cb-ranged-dmg').value = c.rangedDmg || "1d6";
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
    if (c.customAttacks && c.customAttacks.length > 0) {        c.customAttacks.forEach(atk => {
            const row = document.createElement('div');
            row.className = 'flex-row';
            row.innerHTML = `
                <input type="text" class="builder-input atk-name flex-1" value="${atk.name}" style="padding:6px; font-size:12px; width: 40%;">
                <input type="number" class="builder-input atk-bonus flex-1" value="${atk.bonus}" style="padding:6px; font-size:12px; width: 20%;">
                <input type="text" class="builder-input atk-dmg flex-1" value="${atk.dmg}" style="padding:6px; font-size:12px; width: 30%;">
                <button type="button" class="delete-atk-btn" onclick="this.parentElement.remove()" aria-label="מחק התקפה">X</button>
            `;
            attacksList.appendChild(row);
        });
    }
}

if(newCharBtn) {
    newCharBtn.onclick = () => {
        currentEditCharId = null;
        if(builderModal) builderModal.style.display = 'flex';
        document.getElementById('cb-main-title').innerText = t('cb_title');
        document.getElementById('save-char-btn').innerText = t('cb_save_btn');
        document.querySelectorAll('.builder-input').forEach(input => {
            if(input.tagName === 'INPUT' && input.type !== 'file') input.value = '';
            if(input.tagName === 'SELECT') input.selectedIndex = 0;
        });
        document.getElementById('cb-color').value = "#3498db";
        _setPreview(TMT_DEFAULT);
        switchPortraitTab(tabTmt, areaTmt);
        _refreshTmtTab();
        if (attacksList) attacksList.innerHTML = '';
    
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
            const meleeDmg = document.getElementById('cb-melee-dmg')?.value;
            const ranged = document.getElementById('cb-ranged')?.value;
            const rangedDmg = document.getElementById('cb-ranged-dmg')?.value;
            const color = document.getElementById('cb-color')?.value;
            const customAttacks = [];
            if (attacksList) {
                attacksList.querySelectorAll('div').forEach(row => {
                    const aName = row.querySelector('.atk-name')?.value.trim();
                    const aBonus = parseInt(row.querySelector('.atk-bonus')?.value) || 0;
                    const aDmg = row.querySelector('.atk-dmg')?.value.trim();
                    if (aName) { customAttacks.push({ name: aName, bonus: aBonus, dmg: aDmg }); }
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
                'cb-melee': melee,
                'cb-ranged': ranged,
            });
            if (!isValid || !selectedPortrait) return;

            const charLevel = Math.max(1, Math.min(20, parseInt(document.getElementById('cb-level')?.value) || 1));
            const charData = {
                name, race: charRace, class: charClass, gender: charGender, size: charSize,
                level: charLevel,
                ac: parseInt(ac), speed: parseInt(speed), pp: parseInt(pp), darkvision: parseInt(darkvision)||0,
                initBonus: parseInt(init), maxHp: parseInt(hp), hp: parseInt(hp),
                melee: parseInt(melee), meleeDmg: meleeDmg,
                ranged: parseInt(ranged), rangedDmg: rangedDmg,
                customAttacks: customAttacks, color: color, portrait: selectedPortrait, createdAt: Date.now()
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
