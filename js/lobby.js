// lobby.js - Welcome screen and Authentication Controller

import * as db from "./firebaseService.js";
import { startGame } from "./app.js"; // Importing the new function to start the game!

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
let currentVaultCharacters = {}; // Store characters to easily access them when "Select" is clicked

db.listenToAuthState((user) => {
    if (user) {
        currentUserUid = user.uid;
        authScreen.style.display = 'none';
        lobbyScreen.style.display = 'block';
        
        userDisplayName.innerText = user.displayName || "הרפתקן";
        userEmail.innerText = user.email || "";
        if (user.photoURL) userAvatar.src = user.photoURL;

        db.listenToUserCharacters(user.uid, renderVault);
    } else {
        currentUserUid = null;
        lobbyScreen.style.display = 'none';
        authScreen.style.display = 'block';
    }
});

function renderVault(characters) {
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

    // Add click listeners to the "Select" buttons
    document.querySelectorAll('.vault-select-btn').forEach(btn => {
        btn.onclick = (e) => {
            const charId = e.target.getAttribute('data-charid');
            const selectedChar = currentVaultCharacters[charId];
            const roomCode = document.getElementById('room-code-input').value.trim() || "CRIT";
            
            // Hide lobby and launch the game as a player
            lobbyScreen.style.display = 'none';
            startGame('player', selectedChar, roomCode);
        };
    });
}

loginBtn.addEventListener('click', async () => {
    try {
        loginBtn.innerText = "מתחבר...";
        loginBtn.disabled = true;
        await db.loginWithGoogle();
    } catch (error) {
        console.error("Login Error:", error);
        alert("אופס! ההתחברות נכשלה. ודא שאישרת את גוגל במסוף הפיירבייס.");
        loginBtn.innerText = "התחבר באמצעות Google";
        loginBtn.disabled = false;
    }
});

logoutBtn.addEventListener('click', async () => {
    try { await db.logoutUser(); } catch (error) { console.error(error); }
});

document.getElementById('new-char-btn').onclick = () => {
    builderModal.style.display = 'flex';
    selectedPortrait = "";
    document.querySelectorAll('.builder-portrait-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.builder-input').forEach(input => input.value = '');
};

closeBuilderBtn.onclick = () => {
    builderModal.style.display = 'none';
};

document.querySelectorAll('.builder-portrait-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.builder-portrait-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPortrait = btn.src;
    };
});

saveCharBtn.onclick = async () => {
    if (!currentUserUid) return;

    const name = document.getElementById('cb-name').value.trim();
    const charRace = document.getElementById('cb-race').value;
    const charClass = document.getElementById('cb-class').value;
    const ac = document.getElementById('cb-ac').value;
    const speed = document.getElementById('cb-speed').value;
    const pp = document.getElementById('cb-pp').value;
    const init = document.getElementById('cb-init').value;
    const hp = document.getElementById('cb-hp').value;
    const melee = document.getElementById('cb-melee').value;
    const ranged = document.getElementById('cb-ranged').value;

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
        builderModal.style.display = 'none';
    } catch (err) {
        console.error("Error saving character:", err);
        alert("שגיאה בשמירת הדמות.");
    } finally {
        saveCharBtn.innerText = "שמור לכספת";
        saveCharBtn.disabled = false;
    }
};

// Start Game as DM
document.getElementById('create-room-btn').onclick = () => {
    // Generate a random 4-digit room code
    const randomCode = Math.floor(1000 + Math.random() * 9000).toString(); 
    alert(`החדר שלך נוצר בהצלחה! 👑\nקוד החדר להזמנת שחקנים הוא: ${randomCode}`);
    
    lobbyScreen.style.display = 'none';
    startGame('dm', null, randomCode);
};
