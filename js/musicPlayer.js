// js/musicPlayer.js — Background Music Library + Player
// All tracks are free-use: Kevin MacLeod (CC BY 4.0) or FreePD (CC0)
// Kevin MacLeod: credit "Kevin MacLeod (incompetech.com)" under CC BY 4.0
// FreePD: CC0 public domain, no attribution required

const KM = 'Kevin MacLeod (CC BY 4.0)';
const FP = 'FreePD (CC0)';
const KM_BASE = 'https://archive.org/download/Kevin_MacLeod_Loopable_vids/';
const FP_BASE = 'https://freepd.com/music/';

export const MUSIC_CATEGORIES = [
  { id: 'battle',   label: '⚔️ Battle',   auto: true },   // auto-plays when combat starts
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
    { id: 'battle_1', title: 'Battle of Pogs',      artist: KM, url: KM_BASE + 'Battle%20of%20Pogs.mp3' },
    { id: 'battle_2', title: 'Clash Defiant',        artist: KM, url: KM_BASE + 'Clash%20Defiant.mp3' },
    { id: 'battle_3', title: 'Aggressor',            artist: KM, url: KM_BASE + 'Aggressor.mp3' },
    { id: 'battle_4', title: 'Heavy Metal Fight',    artist: FP, url: FP_BASE + 'Heavy%20Metal%20Fight%20Song.mp3' },
  ],
  tavern: [
    { id: 'tavern_1', title: 'Scheming Weasel',     artist: KM, url: KM_BASE + 'Scheming%20Weasel%20(faster).mp3' },
    { id: 'tavern_2', title: 'Fluffing a Duck',     artist: KM, url: KM_BASE + 'Fluffing%20a%20Duck.mp3' },
    { id: 'tavern_3', title: 'Merry Go',            artist: KM, url: KM_BASE + 'Merry%20Go.mp3' },
    { id: 'tavern_4', title: 'Bossa Antigua',       artist: FP, url: FP_BASE + 'Bossa%20Antigua.mp3' },
  ],
  forest: [
    { id: 'forest_1', title: 'Long Note Four',      artist: KM, url: KM_BASE + 'Long%20Note%20Four.mp3' },
    { id: 'forest_2', title: 'Crossing the Divide', artist: KM, url: KM_BASE + 'Crossing%20the%20Divide.mp3' },
    { id: 'forest_3', title: 'Forest Night',        artist: FP, url: FP_BASE + 'Forest%20Night.mp3' },
  ],
  desert: [
    { id: 'desert_1', title: 'Middle East',         artist: KM, url: KM_BASE + 'Middle%20East.mp3' },
    { id: 'desert_2', title: 'Ethnic Chill',        artist: KM, url: KM_BASE + 'Ethnic%20Chill.mp3' },
    { id: 'desert_3', title: 'Sahara',              artist: FP, url: FP_BASE + 'Sahara.mp3' },
  ],
  city: [
    { id: 'city_1',  title: 'Rynos Theme',          artist: KM, url: KM_BASE + 'Rynos%20Theme.mp3' },
    { id: 'city_2',  title: 'Marketplace',          artist: FP, url: FP_BASE + 'Marketplace.mp3' },
    { id: 'city_3',  title: 'Funky Chunk',          artist: FP, url: FP_BASE + 'Funky%20Chunk.mp3' },
  ],
  village: [
    { id: 'village_1', title: 'Carefree',           artist: KM, url: KM_BASE + 'Carefree.mp3' },
    { id: 'village_2', title: 'George Street Shuffle', artist: KM, url: KM_BASE + 'George%20Street%20Shuffle.mp3' },
    { id: 'village_3', title: 'Acoustic Breeze',    artist: FP, url: FP_BASE + 'Acoustic%20Breeze.mp3' },
  ],
  openroad: [
    { id: 'road_1',  title: 'Long Road Ahead',      artist: KM, url: KM_BASE + 'Long%20Road%20Ahead%20(v2).mp3' },
    { id: 'road_2',  title: 'Overworld',            artist: KM, url: KM_BASE + 'Overworld.mp3' },
    { id: 'road_3',  title: 'March of the King',    artist: FP, url: FP_BASE + 'March%20of%20the%20King.mp3' },
  ],
  cave: [
    { id: 'cave_1',  title: 'Long Note One',        artist: KM, url: KM_BASE + 'Long%20Note%20One.mp3' },
    { id: 'cave_2',  title: 'Deep Haze',            artist: KM, url: KM_BASE + 'Deep%20Haze.mp3' },
    { id: 'cave_3',  title: 'Cave Ambience',        artist: FP, url: FP_BASE + 'Cave%20Ambience.mp3' },
  ],
  dungeon: [
    { id: 'dungeon_1', title: 'Oppressive Gloom',   artist: KM, url: KM_BASE + 'Oppressive%20Gloom.mp3' },
    { id: 'dungeon_2', title: 'Darkest Child',      artist: KM, url: KM_BASE + 'Darkest%20Child.mp3' },
    { id: 'dungeon_3', title: 'Horror Ambient 14',  artist: FP, url: FP_BASE + 'Horror%20Ambient%2014.mp3' },
  ],
  rainy: [
    { id: 'rainy_1',  title: 'Peaceful Journey',   artist: KM, url: KM_BASE + 'Peaceful%20Journey.mp3' },
    { id: 'rainy_2',  title: 'Meditation 02',       artist: KM, url: KM_BASE + 'Meditation%20Impromptu%2002.mp3' },
    { id: 'rainy_3',  title: 'Raindrops',           artist: FP, url: FP_BASE + 'Raindrops.mp3' },
  ],
};

// Flat map: trackId → track object
export const TRACK_BY_ID = {};
for (const tracks of Object.values(MUSIC_LIBRARY)) {
  for (const t of tracks) TRACK_BY_ID[t.id] = t;
}

// ─── Player class ──────────────────────────────────────────────────────────────

export class MusicPlayer {
  constructor() {
    this._audio       = new Audio();
    this._audio.loop  = true;
    this._audio.volume = 0.5;
    this._currentId   = null;
    this._localMuted  = false;
    this._onErrorFn   = null;
    this._onChangeFn  = null;

    this._audio.addEventListener('error', () => {
      const t = TRACK_BY_ID[this._currentId];
      if (t) this._onErrorFn?.(t);
    });
  }

  get volume()     { return this._audio.volume; }
  set volume(v)    { this._audio.volume = Math.max(0, Math.min(1, v)); }
  get currentId()  { return this._currentId; }
  get playing()    { return !this._audio.paused; }
  get localMuted() { return this._localMuted; }

  play(trackId) {
    const track = TRACK_BY_ID[trackId];
    if (!track) { this.stop(); return; }
    if (this._currentId === trackId && !this._audio.paused) return; // already playing
    if (this._currentId !== trackId) {
      this._audio.src = track.url;
      this._audio.currentTime = 0;
      this._currentId = trackId;
    }
    if (!this._localMuted) {
      this._audio.play().catch(err => {
        console.warn('[Music] autoplay blocked — user interaction required', err);
      });
    }
    this._onChangeFn?.();
  }

  stop() {
    this._audio.pause();
    this._audio.src = '';
    this._currentId = null;
    this._onChangeFn?.();
  }

  setLocalMute(muted) {
    this._localMuted = muted;
    if (muted) {
      this._audio.pause();
    } else if (this._currentId) {
      this._audio.play().catch(() => {});
    }
    this._onChangeFn?.();
  }

  onChange(fn) { this._onChangeFn = fn; }
  onError(fn)  { this._onErrorFn  = fn; }
}
