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
// ניגון סאונד בהתאם לתוצאה (רק לתוצאות מיוחדות, הגלגול עצמו מנוהל על ידי מנוע ה-3D)
export function playRollSound(type, res, isMuted) {
    if (isMuted) return;
    
    // עוצרים סאונדים מיוחדים קודמים אם יש
    stopAllSounds();
    
    if (type === 'd20' && res === 20) {
        critSound.play().catch(() => {});
    } else if (type === 'd20' && res === 1) {
        failSound.play().catch(() => {});
    }
    // הוסר ה-else שניגן את rollSound.play(), כי מנוע התלת-ממד עושה את זה תוך כדי תנועה!
}
