// lobby.js - Welcome screen and Authentication Controller

import * as db from "./firebaseService.js";

const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const loginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');

const userDisplayName = document.getElementById('user-display-name');
const userEmail = document.getElementById('user-email');
const userAvatar = document.getElementById('user-avatar');

// Listen to the user's authentication state as soon as the page loads
db.listenToAuthState((user) => {
    if (user) {
        // User is logged in
        authScreen.style.display = 'none';
        lobbyScreen.style.display = 'block';
        
        // Update user display details from Google
        userDisplayName.innerText = user.displayName || "הרפתקן";
        userEmail.innerText = user.email || "";
        if (user.photoURL) {
            userAvatar.src = user.photoURL;
        }

        console.log("User logged in:", user.uid);
        // In the next step, we will load their character list from the DB using their uid here
        
    } else {
        // User is logged out
        lobbyScreen.style.display = 'none';
        authScreen.style.display = 'block';
    }
});

// Login
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

// Logout
logoutBtn.addEventListener('click', async () => {
    try {
        await db.logoutUser();
    } catch (error) {
        console.error("Logout Error:", error);
    }
});

// Lobby Buttons (Placeholders for the next step)
document.getElementById('create-room-btn').onclick = () => {
    alert("בשלב הבא נייצר לך חדר DM משלך!");
};

document.getElementById('join-room-btn').onclick = () => {
    alert("בשלב הבא תוכל לבחור דמות מהכספת ולהיכנס איתה לחדר המשחק!");
};

document.getElementById('new-char-btn').onclick = () => {
    alert("בשלב הבא נפתח כאן את טופס יצירת הדמות המלא (כולל התקפות ומאקרואים) שישמר ישר לכספת שלך.");
};
