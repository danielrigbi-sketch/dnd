const rollSound = new Audio('./dice.mp3');
const critSound = new Audio('./crit.mp3');
const failSound = new Audio('./fail.mp3');

let rollSoundTimeout; // משתנה לשמירת הטיימר כדי שנוכל לבטל אותו במידת הצורך

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

// ניגון סאונד הגלגול עם דיליי של שנייה מרגע הלחיצה
export function playStartRollSound(isMuted) {
    if (isMuted) return;
    
    // מיד עוצרים סאונדים קודמים שאולי מתנגנים
    stopAllSounds();
    
    // אם יש טיימר קודם שעדיין לא הפעיל את הסאונד (לחיצות מהירות), נבטל אותו
    if (rollSoundTimeout) clearTimeout(rollSoundTimeout);
    
    // מפעילים טיימר של 1000 מילישניות (שנייה אחת) לפני הניגון
    rollSoundTimeout = setTimeout(() => {
        rollSound.play().catch(() => {});
    }, 1000); 
}

// ניגון סאונד בהתאם לתוצאה (רק ל-20 או 1)
export function playRollSound(type, res, isMuted) {
    if (isMuted) return;
    
    // עוצרים את טיימר הגלגול אם איכשהו הוא עדיין באוויר
    if (rollSoundTimeout) clearTimeout(rollSoundTimeout);
    stopAllSounds();
    
    if (type === 'd20' && res === 20) {
        critSound.play().catch(() => {});
    } else if (type === 'd20' && res === 1) {
        failSound.play().catch(() => {});
    }
}
