// הגדרות Firebase
export const firebaseConfig = {
    apiKey: "AIzaSyBmKG3lCfoHK4bTdjUFSMR2YLmgbXtTmbM",
    authDomain: "dnd-dice-room.firebaseapp.com",
    databaseURL: "https://dnd-dice-room-default-rtdb.firebaseio.com",
    projectId: "dnd-dice-room",
    storageBucket: "dnd-dice-room.firebasestorage.app",
    messagingSenderId: "365914207851", 
    appId: "1:365914207851:web:777478485eabf5bf1f632e"
};

// צורות הקוביות ב-SVG
export const diceShapes = {
    d4: '<polygon points="50,5 95,85 5,85" stroke="black" fill-opacity="0.95"/>',
    d6: '<rect x="15" y="15" width="70" height="70" rx="8" stroke="black" fill-opacity="0.95"/>',
    d8: '<polygon points="50,5 90,50 50,95 10,50" stroke="black" fill-opacity="0.95"/>',
    d10: '<polygon points="50,5 95,45 50,95 5,45" stroke="black" fill-opacity="0.95"/>',
    d12: '<polygon points="50,5 90,30 75,85 25,85 10,30" stroke="black" fill-opacity="0.95"/>',
    d20: '<polygon points="50,5 95,25 95,75 50,95 5,75 5,25" stroke="black" fill-opacity="0.95"/>'
};
