// audio.js - Sound management ParaDice v120

const rollSound   = new Audio('assets/dice-3.wav');
const critSound   = new Audio('assets/17.mp3');
const failSound   = new Audio('assets/game_over_bad_chest.wav');
const healSound   = new Audio('assets/heal.wav');
const damageSound = new Audio('assets/playerhit.mp3');

let rollSoundTimeout;

export function stopAllSounds() {
    [rollSound, critSound, failSound, healSound, damageSound].forEach(s => {
        s.pause(); s.currentTime = 0;
    });
}

export function unlockAudio() {
    [rollSound, critSound, failSound, healSound, damageSound].forEach(s => {
        s.muted = true;
        s.play().then(() => { s.pause(); s.currentTime = 0; s.muted = false; }).catch(() => {});
    });
}

export function playStartRollSound(isMuted) {
    if (isMuted) return;
    stopAllSounds();
    if (rollSoundTimeout) clearTimeout(rollSoundTimeout);
    rollSoundTimeout = setTimeout(() => { rollSound.play().catch(() => {}); }, 500);
}

export function playRollSound(type, res, isMuted) {
    if (isMuted) return;
    if (rollSoundTimeout) clearTimeout(rollSoundTimeout);
    if (type === 'd20' && res === 20) critSound.play().catch(() => {});
    else if (type === 'd20' && res === 1)  failSound.play().catch(() => {});
}

export function playHealSound(isMuted) {
    if (isMuted) return;
    healSound.play().catch(() => {});
}

export function playDamageSound(isMuted) {
    if (isMuted) return;
    damageSound.play().catch(() => {});
}

// =====================================================================
// Sprint 4 — Your Turn ping (synthesised, no file needed)
// =====================================================================
let _audioCtx = null;
function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
}

export function playYourTurnSound() {
    try {
        const ctx = getAudioCtx();
        // Two ascending tones — classic "it's your turn" chime
        const notes = [523.25, 783.99]; // C5 → G5
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            const start = ctx.currentTime + i * 0.18;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.35, start + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
            osc.start(start);
            osc.stop(start + 0.4);
        });
    } catch(e) { /* fail silently */ }
}
