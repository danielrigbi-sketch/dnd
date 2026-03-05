// lobby.js - Welcome screen and Authentication Controller

import * as db from "./firebaseService.js?v=109";
import { startGame } from "./app.js?v=109";
import { setLanguage, getLang, t, updateDOM } from "./i18n.js?v=109";

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

let currentUserUid = null;
let selectedPortrait = "";
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
        
        const raceStr = c.race || "";
        const classStr = c.class || "";
        
        const hasHebrew = /[\u0590-\u05FF]/;
        const displayRace = hasHebrew.test(raceStr) ? raceStr : t("race_" + raceStr.toLowerCase());
        const displayClass = hasHebrew.test(classStr) ? classStr : t("class_" + classStr.toLowerCase());

        card.innerHTML = `
            <img src="${c.portrait || 'assets/logo.png'}" class="vault-card-img">
            <div class="vault-card-info">
                <div class="vault-card-name">${c.name}</div>
                <div class="vault-card-sub">${displayRace} ${displayClass}</div>
            </div>
            <button class="vault-select-btn" data-charid="${charId}">${t("select_btn")}</button>
        `;
        vaultList.appendChild(card);
    });

    document.querySelectorAll('.vault-select-btn').forEach(btn => {
        btn.onclick = (e) => {
            const charId = e.target.getAttribute('data-charid');
            const selectedChar = currentVaultCharacters[charId];
            const roomCodeInput = document.getElementById('room-code-input');
            const roomCode = roomCodeInput && roomCodeInput.value.trim() ? roomCodeInput.value.trim() : "CRIT";
            
            langToggleBtn.style.display = 'none'; 
            if(lobbyScreen) lobbyScreen.style.display = 'none';
            startGame('player', selectedChar, roomCode);
        };
    });
}

if(loginBtn) {
    loginBtn.addEventListener('click', async () => {
        try {
            loginBtn.innerText = "...";
            loginBtn.disabled = true;
            await db.loginWithGoogle();
        } catch (error) {
            console.error("Login Error Details:", error);
            alert(`${t('alert_login_fail')}\n${error.message}`);
            loginBtn.innerHTML = `
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style="width:20px; height:20px;">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.7 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.2-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
                <span data-i18n="login_google">${t('login_google')}</span>
            `;
            loginBtn.disabled = false;
        }
    });
}

if(logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try { await db.logoutUser(); } catch (error) { console.error(error); }
    });
}

const newCharBtn = document.getElementById('new-char-btn');
if(newCharBtn) {
    newCharBtn.onclick = () => {
        if(builderModal) builderModal.style.display = 'flex';
        selectedPortrait = "";
        document.querySelectorAll('.builder-portrait-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.builder-input').forEach(input => input.value = '');
    };
}

if(closeBuilderBtn) {
    closeBuilderBtn.onclick = () => {
        if(builderModal) builderModal.style.display = 'none';
    };
}

document.querySelectorAll('.builder-portrait-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.builder-portrait-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPortrait = btn.src;
    };
});

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

        if (!name || !charRace || !charClass || !ac || !speed || !pp || !init || !hp || !melee || !ranged || !selectedPortrait) {
            return alert(t('alert_missing'));
        }

        const charData = {
            name, race: charRace, class: charClass, ac: parseInt(ac), speed: parseInt(speed),
            pp: parseInt(pp), initBonus: parseInt(init), maxHp: parseInt(hp), hp: parseInt(hp),
            melee: parseInt(melee), meleeDmg: meleeDmg, 
            ranged: parseInt(ranged), rangedDmg: rangedDmg, 
            portrait: selectedPortrait, createdAt: Date.now()
        };

        saveCharBtn.innerText = t("cb_saving");
        saveCharBtn.disabled = true;

        try {
            await db.saveCharacterToVault(currentUserUid, charData);
            if(builderModal) builderModal.style.display = 'none';
        } catch (err) {
            console.error(err);
            alert(t('alert_save_err'));
        } finally {
            saveCharBtn.innerText = t("cb_save_btn");
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
