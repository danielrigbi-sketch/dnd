// lobby.js - Welcome screen and Authentication Controller

import * as db from "./firebaseService.js?v=113";
import { startGame } from "./app.js?v=113";
import { setLanguage, getLang, t, updateDOM } from "./i18n.js?v=113";

const langToggleBtn = document.getElementById('lang-toggle-btn');
langToggleBtn.innerText = getLang() === 'he' ? 'English' : 'עברית';

langToggleBtn.onclick = () => {
    const newLang = getLang() === 'he' ? 'en' : 'he';
    setLanguage(newLang); 
    langToggleBtn.innerText = newLang === 'he' ? 'English' : 'עברית';
    
    if(currentUserUid) {
        renderVault(currentVaultCharacters);
    }
};

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const loginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');

const userDisplayName = document.getElementById('user-display-name');
const userEmail = document.getElementById('user-email');
const userAvatar = document.getElementById('user-avatar');

const builderModal = document.getElementById('char-builder-modal');
const closeBuilderBtn = document.getElementById('close-builder-btn');
const saveCharBtn = document.getElementById('save-char-btn');
const vaultList = document.getElementById('vault-list');

// THE FIX: Added the missing button declaration!
const newCharBtn = document.getElementById('new-char-btn');

const addAttackBtn = document.getElementById('add-custom-attack-btn');
const attacksList = document.getElementById('custom-attacks-list');

// Edit Tracker
let currentEditCharId = null;

// Portrait Logic
const tabPreset = document.getElementById('tab-portrait-preset');
const tabUrl = document.getElementById('tab-portrait-url');
const tabFile = document.getElementById('tab-portrait-file');
const areaPreset = document.getElementById('portrait-preset-area');
const areaUrl = document.getElementById('portrait-url-area');
const areaFile = document.getElementById('portrait-file-area');
const previewImg = document.getElementById('portrait-preview');
const inputUrl = document.getElementById('cb-portrait-url');
const inputFile = document.getElementById('cb-portrait-file');

let selectedPortrait = "https://api.dicebear.com/8.x/adventurer/svg?seed=human_m&backgroundColor=f1c40f";

function switchPortraitTab(activeTab, activeArea) {
    [tabPreset, tabUrl, tabFile].forEach(t => t.classList.remove('active'));
    [areaPreset, areaUrl, areaFile].forEach(a => a.style.display = 'none');
    activeTab.classList.add('active');
    activeArea.style.display = 'flex';
}

if(tabPreset) tabPreset.onclick = () => switchPortraitTab(tabPreset, areaPreset);
if(tabUrl) tabUrl.onclick = () => switchPortraitTab(tabUrl, areaUrl);
if(tabFile) tabFile.onclick = () => switchPortraitTab(tabFile, areaFile);

document.querySelectorAll('.builder-portrait-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.builder-portrait-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPortrait = btn.src;
        if(previewImg) previewImg.src = selectedPortrait;
    };
});

if(inputUrl) {
    inputUrl.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if(val) {
            selectedPortrait = val;
            if(previewImg) previewImg.src = val;
        }
    });
}

if(inputFile) {
    inputFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                selectedPortrait = event.target.result;
                if(previewImg) previewImg.src = selectedPortrait;
            };
            reader.readAsDataURL(file);
        }
    });
}

if (addAttackBtn) {
    addAttackBtn.onclick = () => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '5px';
        row.innerHTML = `
            <input type="text" class="builder-input atk-name" placeholder="${t('ph_atk_name')}" style="width: 40%; font-size:12px; padding:6px;">
            <input type="number" class="builder-input atk-bonus" placeholder="${t('ph_atk_bonus')}" style="width: 20%; font-size:12px; padding:6px;">
            <input type="text" class="builder-input atk-dmg" placeholder="${t('ph_atk_dmg')}" style="width: 30%; font-size:12px; padding:6px;">
            <button type="button" onclick="this.parentElement.remove()" style="background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer; width:10%; font-weight:bold;">X</button>
        `;
        attacksList.appendChild(row);
    };
}

let currentUserUid = null;
let currentVaultCharacters = {};

updateDOM();

db.listenToAuthState((user) => {
    if (user) {
        currentUserUid = user.uid;
        if(authScreen) authScreen.style.display = 'none';
        if(lobbyScreen) lobbyScreen.style.display = 'block';
        
        if(userDisplayName) userDisplayName.innerText = user.displayName || "Player";
        if(userEmail) userEmail.innerText = user.email || "";
        if (user.photoURL && userAvatar) userAvatar.src = user.photoURL;

        db.listenToUserCharacters(user.uid, renderVault);
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
        
        // Bulletproof Translation Fallback
        let displayRace = raceStr;
        if (raceStr) {
            let translated = t("race_" + raceStr.toLowerCase());
            displayRace = translated !== "race_" + raceStr.toLowerCase() ? translated : raceStr;
        }

        let displayClass = classStr;
        if (classStr) {
            let translated = t("class_" + classStr.toLowerCase());
            displayClass = translated !== "class_" + classStr.toLowerCase() ? translated : classStr;
        }

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
            <button class="vault-select-btn" data-charid="${charId}" style="align-self: center;">${t("select_btn")}</button>
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
                if(confirm(`${t('delete_confirm')} (${charName})`)) {
                    await db.deleteCharacterFromVault(currentUserUid, charId);
                }
            } else if (action === 'edit') {
                openBuilderForEdit(charId);
            }
        };
    });

    document.querySelectorAll('.vault-select-btn').forEach(btn => {
        btn.onclick = (e) => {
            const charId = e.target.getAttribute('data-charid');
            const selectedChar = currentVaultCharacters[charId];
            const roomCodeInput = document.getElementById('room-code-input');
            const roomCode = roomCodeInput && roomCodeInput.value.trim() ? roomCodeInput.value.trim() : "";
            
            if(!roomCode) {
                alert(t("alert_no_room_code"));
                return;
            }
            
            langToggleBtn.style.display = 'none'; 
            if(lobbyScreen) lobbyScreen.style.display = 'none';
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
    document.getElementById('cb-race').value = c.race || "";
    document.getElementById('cb-class').value = c.class || "";
    document.getElementById('cb-ac').value = c.ac || "";
    document.getElementById('cb-speed').value = c.speed || "";
    document.getElementById('cb-pp').value = c.pp || "";
    document.getElementById('cb-init').value = c.initBonus || "";
    document.getElementById('cb-hp').value = c.maxHp || "";
    document.getElementById('cb-melee').value = c.melee || "";
    document.getElementById('cb-melee-dmg').value = c.meleeDmg || "1d6";
    document.getElementById('cb-ranged').value = c.ranged || "";
    document.getElementById('cb-ranged-dmg').value = c.rangedDmg || "1d6";
    document.getElementById('cb-color').value = c.color || "#3498db";
    
    selectedPortrait = c.portrait || "https://api.dicebear.com/8.x/adventurer/svg?seed=human_m&backgroundColor=f1c40f";
    if(previewImg) previewImg.src = selectedPortrait;
    
    // Check if portrait is a URL or Data URI (File) to open the correct tab
    if (selectedPortrait.startsWith("data:image")) {
        switchPortraitTab(tabFile, areaFile);
    } else if (!selectedPortrait.includes("dicebear.com/8.x/adventurer")) {
        switchPortraitTab(tabUrl, areaUrl);
        if(inputUrl) inputUrl.value = selectedPortrait;
    } else {
        switchPortraitTab(tabPreset, areaPreset);
        document.querySelectorAll('.builder-portrait-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.src === selectedPortrait) btn.classList.add('active');
        });
    }
    
    if (attacksList) attacksList.innerHTML = '';
    if (c.customAttacks && c.customAttacks.length > 0) {
        c.customAttacks.forEach(atk => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.gap = '5px';
            row.innerHTML = `
                <input type="text" class="builder-input atk-name" value="${atk.name}" style="width: 40%; font-size:12px; padding:6px;">
                <input type="number" class="builder-input atk-bonus" value="${atk.bonus}" style="width: 20%; font-size:12px; padding:6px;">
                <input type="text" class="builder-input atk-dmg" value="${atk.dmg}" style="width: 30%; font-size:12px; padding:6px;">
                <button type="button" onclick="this.parentElement.remove()" style="background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer; width:10%; font-weight:bold;">X</button>
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
        
        switchPortraitTab(tabPreset, areaPreset);
        selectedPortrait = "https://api.dicebear.com/8.x/adventurer/svg?seed=human_m&backgroundColor=f1c40f";
        if(previewImg) previewImg.src = selectedPortrait;
        document.querySelectorAll('.builder-portrait-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.builder-portrait-btn').classList.add('active'); // default first
        
        if (attacksList) attacksList.innerHTML = '';
    };
}

if(closeBuilderBtn) {
    closeBuilderBtn.onclick = () => {
        if(builderModal) builderModal.style.display = 'none';
    };
}

if(saveCharBtn) {
    saveCharBtn.onclick = async () => {
        if (!currentUserUid) return;

        const name = document.getElementById('cb-name')?.value.trim();
        const charRace = document.getElementById('cb-race')?.value;
        const charClass = document.getElementById('cb-class')?.value;
        const ac = document.getElementById('cb-ac')?.value;
        const speed = document.getElementById('cb-speed')?.value;
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
                if (aName) {
                    customAttacks.push({ name: aName, bonus: aBonus, dmg: aDmg });
                }
            });
        }

        if (!name || !charRace || !charClass || !ac || !speed || !pp || !init || !hp || !melee || !ranged || !selectedPortrait) {
            return alert(t('alert_missing'));
        }

        const charData = {
            name, race: charRace, class: charClass, ac: parseInt(ac), speed: parseInt(speed),
            pp: parseInt(pp), initBonus: parseInt(init), maxHp: parseInt(hp), hp: parseInt(hp),
            melee: parseInt(melee), meleeDmg: meleeDmg, 
            ranged: parseInt(ranged), rangedDmg: rangedDmg, 
            customAttacks: customAttacks,
            color: color, 
            portrait: selectedPortrait, 
            createdAt: Date.now()
        };

        saveCharBtn.innerText = t("cb_saving");
        saveCharBtn.disabled = true;

        try {
            if (currentEditCharId) {
                await db.updateCharacterInVault(currentUserUid, currentEditCharId, charData);
            } else {
                await db.saveCharacterToVault(currentUserUid, charData);
            }
            if(builderModal) builderModal.style.display = 'none';
        } catch (err) {
            console.error(err);
            alert(t('alert_save_err'));
        } finally {
            saveCharBtn.innerText = currentEditCharId ? t("btn_update_char") : t("cb_save_btn");
            saveCharBtn.disabled = false;
        }
    };
}

const createRoomBtn = document.getElementById('create-room-btn');
if(createRoomBtn) {
    createRoomBtn.onclick = () => {
        const randomCode = Math.floor(1000 + Math.random() * 9000).toString(); 
        alert(`${t('alert_room_created')} ${randomCode}`);
        
        langToggleBtn.style.display = 'none';
        if(lobbyScreen) lobbyScreen.style.display = 'none';
        startGame('dm', null, randomCode);
    };
}
