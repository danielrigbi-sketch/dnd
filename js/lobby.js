// lobby.js - Welcome screen and Authentication Controller

import * as db from "./firebaseService.js?v=103";
import { startGame } from "./app.js?v=102";

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

db.listenToAuthState((user) => {
    if (user) {
        currentUserUid = user.uid;
        if(authScreen) authScreen.style.display = 'none';
        if(lobbyScreen) lobbyScreen.style.display = 'block';
        
        if(userDisplayName) userDisplayName.innerText = user.displayName || "הרפתקן";
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
    
    if (!characters) {
        vaultList.innerHTML = `<div style="text-align: center; color: #888; font-style: italic; padding: 20px 0;">עדיין אין לך דמויות בכספת.<br>צור את הדמות הראשונה שלך!</div>`;
        return;
    }

    Object.keys(characters).forEach(charId => {
        const c = characters[charId];
        const card = document.createElement('div');
        card.className = 'vault-card';
        card.innerHTML = `
            <img src="${c.portrait || 'assets/logo.png'}" class="vault-card-img">
            <div class="vault-card-info">
                <div class="vault-card-name">${c.name}</div>
                <div class="vault-card-sub">${c.race} ${c.class}</div>
            </div>
            <button class="vault-select-btn" data-charid="${charId}">בחר</button>
        `;
        vaultList.appendChild(card);
    });

    document.querySelectorAll('.vault-select-btn').forEach(btn => {
        btn.onclick = (e) => {
            const charId = e.target.getAttribute('data-charid');
            const selectedChar = currentVaultCharacters[charId];
            const roomCodeInput = document.getElementById('room-code-input');
            const roomCode = roomCodeInput && roomCodeInput.value.trim() ? roomCodeInput.value.trim() : "CRIT";
            
            if(lobbyScreen) lobbyScreen.style.display = 'none';
            startGame('player', selectedChar, roomCode);
        };
    });
}

if(loginBtn) {
    loginBtn.addEventListener('click', async () => {
        try {
            loginBtn.innerText = "מתחבר...";
            loginBtn.disabled = true;
            await db.loginWithGoogle();
        } catch (error) {
            console.error("Login Error Details:", error);
            alert(`ההתחברות נכשלה!\nסיבה: ${error.message}\n(קוד שגיאה: ${error.code})`);
            loginBtn.innerHTML = `
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style="width:20px; height:20px;">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.7 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.2-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
                התחבר באמצעות Google
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
        const ranged = document.getElementById('cb-ranged')?.value;

        let missing = [];
        if (!name) missing.push("שם");
        if (!charRace) missing.push("גזע");
        if (!charClass) missing.push("מקצוע");
        if (!ac) missing.push("AC");
        if (!speed) missing.push("מהירות");
        if (!pp) missing.push("הבחנה פסיבית");
        if (!init) missing.push("יוזמה");
        if (!hp) missing.push("חיים");
        if (!melee) missing.push("קפא״פ");
        if (!ranged) missing.push("מרחוק");
        if (!selectedPortrait) missing.push("תמונת דמות (בחר מהמאגר)");

        if (missing.length > 0) {
            return alert("חסרים פרטים!\n" + missing.join(", "));
        }

        const charData = {
            name, race: charRace, class: charClass, ac: parseInt(ac), speed: parseInt(speed),
            pp: parseInt(pp), initBonus: parseInt(init), maxHp: parseInt(hp), hp: parseInt(hp),
            melee: parseInt(melee), ranged: parseInt(ranged), portrait: selectedPortrait, createdAt: Date.now()
        };

        saveCharBtn.innerText = "שומר...";
        saveCharBtn.disabled = true;

        try {
            await db.saveCharacterToVault(currentUserUid, charData);
            if(builderModal) builderModal.style.display = 'none';
        } catch (err) {
            console.error("Error saving character:", err);
            alert("שגיאה בשמירת הדמות.");
        } finally {
            saveCharBtn.innerText = "שמור לכספת";
            saveCharBtn.disabled = false;
        }
    };
}

const createRoomBtn = document.getElementById('create-room-btn');
if(createRoomBtn) {
    createRoomBtn.onclick = () => {
        const randomCode = Math.floor(1000 + Math.random() * 9000).toString(); 
        alert(`החדר שלך נוצר בהצלחה! 👑\nקוד החדר להזמנת שחקנים הוא: ${randomCode}`);
        
        if(lobbyScreen) lobbyScreen.style.display = 'none';
        startGame('dm', null, randomCode);
    };
}
