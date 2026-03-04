// audio.js - ניהול סאונד CritRoll

const rollSound = new Audio('./dice-3.wav');
const critSound = new Audio('./17.mp3');
const failSound = new Audio('./game_over_bad_chest.wav');
const healSound = new Audio('./heal.wav');
const damageSound = new Audio('./playerhit.mp3');

let rollSoundTimeout; 

// פונקציית עזר לעצירת כל הסאונדים
export function stopAllSounds() {
    [rollSound, critSound, failSound, healSound, damageSound].forEach(s => {
        s.pause();
        s.currentTime = 0;
    });
}

// "שחרור" האודיו בנייד בצורה שקטה
export function unlockAudio() {
    [rollSound, critSound, failSound, healSound, damageSound].forEach(s => {
        s.muted = true;
        s.play().then(() => {
            s.pause();
            s.currentTime = 0;
            s.muted = false;
        }).catch(() => {});
    });
}

// ניגון סאונד הגלגול עם דיליי (מסונכרן לאנימציה)
export function playStartRollSound(isMuted) {
    if (isMuted) return;
    
    stopAllSounds();
    if (rollSoundTimeout) clearTimeout(rollSoundTimeout);
    
    // דיליי של 500 מילישניות מרגיש טבעי יותר עם נפילת הקוביות
    rollSoundTimeout = setTimeout(() => {
        rollSound.play().catch(() => {});
    }, 500); 
}

// ניגון סאונד בהתאם לתוצאה (רק ל-20 או 1)
export function playRollSound(type, res, isMuted) {
    if (isMuted) return;
    
    if (rollSoundTimeout) clearTimeout(rollSoundTimeout);
    
    if (type === 'd20' && res === 20) {
        critSound.play().catch(() => {});
    } else if (type === 'd20' && res === 1) {
        failSound.play().catch(() => {});
    }
}

// פונקציות סאונד למכניקת חיים
export function playHealSound(isMuted) {
    if (isMuted) return;
    healSound.play().catch(() => {});
}

export function playDamageSound(isMuted) {
    if (isMuted) return;
    damageSound.play().catch(() => {});
}
