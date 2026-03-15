// js/musicPlayer.js — Background Music Library + Player
// Kevin MacLeod (incompetech.com) — CC BY 4.0 (attribution required)
// FreePD.com — CC0 public domain (no attribution required)
//
// Autoplay policy: browsers block audio without a user gesture.
// MusicPlayer stores a pending track and resumes on the first
// user interaction via unlock() — called from app.js.

const KM  = 'Kevin MacLeod (CC BY 4.0)';
const FP  = 'FreePD (CC0)';
// incompetech.com serves direct MP3 downloads — stable 20+ years, CC BY 4.0 licensed
const KM_BASE = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/';
const FP_BASE = 'https://freepd.com/music/';

export const MUSIC_CATEGORIES = [
  { id: 'battle',   label: '⚔️ Battle',   auto: true },
  { id: 'tavern',   label: '🍺 Tavern' },
  { id: 'forest',   label: '🌲 Forest' },
  { id: 'desert',   label: '🏜️ Desert' },
  { id: 'city',     label: '🏙️ City' },
  { id: 'village',  label: '🏘️ Village' },
  { id: 'openroad', label: '🛤️ Open Road' },
  { id: 'cave',     label: '🦇 Cave' },
  { id: 'dungeon',  label: '💀 Dungeon' },
  { id: 'rainy',    label: '🌧️ Rainy Day' },
];

export const MUSIC_LIBRARY = {
  battle: [
    { id: 'battle_1', title: 'Battle of Pogs',    artist: KM, url: KM_BASE + 'Battle%20of%20Pogs.mp3' },
    { id: 'battle_2', title: 'Clash Defiant',     artist: KM, url: KM_BASE + 'Clash%20Defiant.mp3' },
    { id: 'battle_3', title: 'Aggressor',         artist: KM, url: KM_BASE + 'Aggressor.mp3' },
    { id: 'battle_4', title: 'Impact Moderato',  artist: KM, url: KM_BASE + 'Impact%20Moderato.mp3' },
  ],
  tavern: [
    { id: 'tavern_1', title: 'Scheming Weasel',  artist: KM, url: KM_BASE + 'Scheming%20Weasel%20%28faster%29.mp3' },
    { id: 'tavern_2', title: 'Fluffing a Duck',  artist: KM, url: KM_BASE + 'Fluffing%20a%20Duck.mp3' },
    { id: 'tavern_3', title: 'Merry Go',         artist: KM, url: KM_BASE + 'Merry%20Go.mp3' },
    { id: 'tavern_4', title: 'Bossa Antigua',    artist: FP, url: FP_BASE + 'Bossa%20Antigua.mp3' },
  ],
  forest: [
    { id: 'forest_1', title: 'Long Note Four',         artist: KM, url: KM_BASE + 'Long%20Note%20Four.mp3' },
    { id: 'forest_2', title: 'Crossing the Divide',    artist: KM, url: KM_BASE + 'Crossing%20the%20Divide.mp3' },
    { id: 'forest_3', title: 'At Rest',                artist: KM, url: KM_BASE + 'At%20Rest.mp3' },
  ],
  desert: [
    { id: 'desert_1', title: 'Middle East',      artist: KM, url: KM_BASE + 'Middle%20East.mp3' },
    { id: 'desert_2', title: 'Ethnic Chill',     artist: KM, url: KM_BASE + 'Ethnic%20Chill.mp3' },
    { id: 'desert_3', title: 'Sunshine',         artist: FP, url: FP_BASE + 'Sunshine.mp3' },
  ],
  city: [
    { id: 'city_1', title: 'Rynos Theme',        artist: KM, url: KM_BASE + 'Rynos%20Theme.mp3' },
    { id: 'city_2', title: 'George Street Shuffle', artist: KM, url: KM_BASE + 'George%20Street%20Shuffle.mp3' },
    { id: 'city_3', title: 'Digital Lemonade',   artist: FP, url: FP_BASE + 'Digital%20Lemonade.mp3' },
  ],
  village: [
    { id: 'village_1', title: 'Carefree',         artist: KM, url: KM_BASE + 'Carefree.mp3' },
    { id: 'village_2', title: 'Comfortable Mystery', artist: KM, url: KM_BASE + 'Comfortable%20Mystery.mp3' },
    { id: 'village_3', title: 'Acoustic Breeze',  artist: FP, url: FP_BASE + 'Acoustic%20Breeze.mp3' },
  ],
  openroad: [
    { id: 'road_1', title: 'Long Road Ahead',    artist: KM, url: KM_BASE + 'Long%20Road%20Ahead%20%28v2%29.mp3' },
    { id: 'road_2', title: 'Overworld',          artist: KM, url: KM_BASE + 'Overworld.mp3' },
    { id: 'road_3', title: 'March of the King',  artist: FP, url: FP_BASE + 'March%20of%20the%20King.mp3' },
  ],
  cave: [
    { id: 'cave_1', title: 'Long Note One',      artist: KM, url: KM_BASE + 'Long%20Note%20One.mp3' },
    { id: 'cave_2', title: 'Deep Haze',          artist: KM, url: KM_BASE + 'Deep%20Haze.mp3' },
    { id: 'cave_3', title: 'Long Note Two',      artist: KM, url: KM_BASE + 'Long%20Note%20Two.mp3' },
  ],
  dungeon: [
    { id: 'dungeon_1', title: 'Oppressive Gloom', artist: KM, url: KM_BASE + 'Oppressive%20Gloom.mp3' },
    { id: 'dungeon_2', title: 'Darkest Child',    artist: KM, url: KM_BASE + 'Darkest%20Child%20A.mp3' },
    { id: 'dungeon_3', title: 'Dark Walk',        artist: KM, url: KM_BASE + 'Dark%20Walk.mp3' },
  ],
  rainy: [
    { id: 'rainy_1', title: 'Peaceful Journey',  artist: KM, url: KM_BASE + 'Peaceful%20Journey.mp3' },
    { id: 'rainy_2', title: 'Meditation Impromptu 02', artist: KM, url: KM_BASE + 'Meditation%20Impromptu%2002.mp3' },
    { id: 'rainy_3', title: 'Soaring',           artist: KM, url: KM_BASE + 'Soaring.mp3' },
  ],
};

// Flat map: trackId → track object
export const TRACK_BY_ID = {};
for (const tracks of Object.values(MUSIC_LIBRARY)) {
  for (const t of tracks) TRACK_BY_ID[t.id] = t;
}

// ─── Player ────────────────────────────────────────────────────────────────────

export class MusicPlayer {
  constructor() {
    this._audio        = new Audio();
    this._audio.loop   = true;
    this._audio.volume = 0.5;
    this._currentId    = null;
    this._pendingPlay  = false;  // true when autoplay was blocked by browser
    this._localMuted   = false;
    this._onErrorFn    = null;
    this._onBlockedFn  = null;   // called when autoplay is blocked
    this._onChangeFn   = null;

    this._audio.addEventListener('error', () => {
      const track = TRACK_BY_ID[this._currentId];
      if (track) this._onErrorFn?.(track);
    });
  }

  get volume()       { return this._audio.volume; }
  set volume(v)      { this._audio.volume = Math.max(0, Math.min(1, v)); }
  get currentId()    { return this._currentId; }
  get playing()      { return !this._audio.paused; }
  get localMuted()   { return this._localMuted; }
  get pendingPlay()  { return this._pendingPlay; }

  // Play a track. If browser blocks autoplay, stores pending state.
  // Call unlock() after the next user gesture to resume.
  play(trackId) {
    const track = TRACK_BY_ID[trackId];
    if (!track) { this.stop(); return; }

    // Switch source only when track actually changes
    if (this._currentId !== trackId) {
      this._audio.src = track.url;
      this._audio.currentTime = 0;
      this._currentId = trackId;
    }

    this._pendingPlay = false;
    if (this._localMuted) { this._onChangeFn?.(); return; }

    this._audio.play().then(() => {
      this._pendingPlay = false;
      this._onChangeFn?.();
    }).catch(err => {
      if (err.name === 'NotAllowedError') {
        // Browser autoplay policy — queue until next user gesture
        this._pendingPlay = true;
        this._onBlockedFn?.();
      } else {
        // URL unavailable (NotSupportedError / NetworkError)
        this._onErrorFn?.(track);
      }
      this._onChangeFn?.();
    });
  }

  // Call on any user gesture (click / keydown) to resume pending playback
  unlock() {
    if (!this._pendingPlay || !this._currentId || this._localMuted) return;
    this._pendingPlay = false;
    this._audio.play().catch(() => {});
  }

  // Play a raw URL directly (DM custom paste)
  playUrl(url, label) {
    this._audio.src = url;
    this._audio.currentTime = 0;
    this._currentId = '__custom__';
    TRACK_BY_ID['__custom__'] = { id: '__custom__', title: label || 'Custom track', artist: 'Custom', url };
    this._pendingPlay = false;
    if (!this._localMuted) {
      this._audio.play().catch(err => {
        if (err.name === 'NotAllowedError') { this._pendingPlay = true; this._onBlockedFn?.(); }
        else this._onErrorFn?.(TRACK_BY_ID['__custom__']);
        this._onChangeFn?.();
      });
    }
    this._onChangeFn?.();
  }

  stop() {
    this._audio.pause();
    this._audio.src = '';
    this._currentId   = null;
    this._pendingPlay = false;
    this._onChangeFn?.();
  }

  setLocalMute(muted) {
    this._localMuted = muted;
    if (muted) {
      this._audio.pause();
    } else if (this._currentId && !this._pendingPlay) {
      this._audio.play().catch(() => {});
    }
    this._onChangeFn?.();
  }

  onChange(fn)  { this._onChangeFn  = fn; }
  onError(fn)   { this._onErrorFn   = fn; }
  onBlocked(fn) { this._onBlockedFn = fn; }
}
