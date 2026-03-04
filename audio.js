const rollSound = new Audio('./dice.mp3');
const critSound = new Audio('./crit.mp3');
const failSound = new Audio('./fail.mp3');

// פונקציית עזר לעצירת כל הסאונדים
export function stopAllSounds() {
    [rollSound, critSound, failSound].forEach(s => {
        s.pause();
        s.currentTime = 0;
    });
}

// "שחרור" האודיו בנייד בצורה שקטה
export function unlockAudio() {
    [rollSound, critSound, failSound].forEach(s => {
        s.muted = true;
        s.play().then(() => {
            s.pause();
            s.currentTime = 0;
            s.muted = false;
        }).catch(() => {});
    });
}

// ניגון סאונד בהתאם לתוצאה
// --- חדש: ניגון סאונד הגלגול מיד בלחיצה ---
export function playStartRollSound(isMuted) {
    if (isMuted) return;
    stopAllSounds();
    rollSound.play().catch(() => {});
}

// ניגון סאונד בהתאם לתוצאה (רק ל-20 או 1)
export function playRollSound(type, res, isMuted) {
    if (isMuted) return;
    
    stopAllSounds();
    
    if (type === 'd20' && res === 20) {
        critSound.play().catch(() => {});
    } else if (type === 'd20' && res === 1) {
        failSound.play().catch(() => {});
    }
    // ה-else שהיה כאן הוסר, כי סאונד הגלגול כבר התנגן בהתחלה
}
