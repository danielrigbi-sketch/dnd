// monsters.js - NPC & Monster Database
// SC: Added cr, type, emoji fields for wizard picker

export const npcDatabase = {
    // ── Humanoids ──────────────────────────────────────────────────────
    "goblin":     { cr:"1/4",  type:"Humanoid", emoji:"👺", hp:7,   ac:15, init:2,  melee:4, meleeDmg:"1d6+2",  ranged:4, rangedDmg:"1d6+2", img:"https://api.dicebear.com/8.x/bottts/svg?seed=goblin&backgroundColor=c0392b" },
    "bandit":     { cr:"1/8",  type:"Humanoid", emoji:"🗡️", hp:11,  ac:12, init:1,  melee:3, meleeDmg:"1d6+1",  ranged:3, rangedDmg:"1d8+1", img:"https://api.dicebear.com/8.x/bottts/svg?seed=bandit&backgroundColor=f39c12" },
    "orc":        { cr:"1/2",  type:"Humanoid", emoji:"💪", hp:15,  ac:13, init:1,  melee:5, meleeDmg:"1d12+3", ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=orc&backgroundColor=2c3e50" },
    "thug":       { cr:"1/2",  type:"Humanoid", emoji:"🥊", hp:32,  ac:11, init:0,  melee:4, meleeDmg:"2d6+2",  ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=thug&backgroundColor=7f8c8d" },
    "cultist":    { cr:"1/8",  type:"Humanoid", emoji:"🔮", hp:9,   ac:12, init:0,  melee:3, meleeDmg:"1d6+1",  ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=cultist&backgroundColor=8e44ad" },
    "knight":     { cr:"3",    type:"Humanoid", emoji:"⚔️", hp:52,  ac:18, init:0,  melee:5, meleeDmg:"2d8+3",  ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=knight&backgroundColor=2c3e50" },
    "assassin":   { cr:"8",    type:"Humanoid", emoji:"🥷", hp:78,  ac:15, init:3,  melee:6, meleeDmg:"7d6+3",  ranged:6, rangedDmg:"7d6+3",  img:"https://api.dicebear.com/8.x/bottts/svg?seed=assassin&backgroundColor=1a1a2e" },
    // ── Undead ─────────────────────────────────────────────────────────
    "skeleton":   { cr:"1/4",  type:"Undead",   emoji:"💀", hp:13,  ac:13, init:2,  melee:4, meleeDmg:"1d6+2",  ranged:4, rangedDmg:"1d6+2", img:"https://api.dicebear.com/8.x/bottts/svg?seed=skeleton&backgroundColor=bdc3c7" },
    "zombie":     { cr:"1/4",  type:"Undead",   emoji:"🧟", hp:22,  ac:8,  init:-2, melee:3, meleeDmg:"1d6+1",  ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=zombie&backgroundColor=27ae60" },
    "ghoul":      { cr:"1",    type:"Undead",   emoji:"😱", hp:22,  ac:12, init:2,  melee:4, meleeDmg:"2d6+2",  ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=ghoul&backgroundColor=34495e" },
    "vampire":    { cr:"13",   type:"Undead",   emoji:"🧛", hp:144, ac:16, init:4,  melee:9, meleeDmg:"1d8+4",  ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=vampire&backgroundColor=c0392b" },
    "lich":       { cr:"21",   type:"Undead",   emoji:"☠️", hp:135, ac:17, init:3,  melee:9, meleeDmg:"3d6",    ranged:12,rangedDmg:"4d6",    img:"https://api.dicebear.com/8.x/bottts/svg?seed=lich&backgroundColor=2c3e50" },
    // ── Beasts ─────────────────────────────────────────────────────────
    "wolf":       { cr:"1/4",  type:"Beast",    emoji:"🐺", hp:11,  ac:13, init:2,  melee:4, meleeDmg:"2d4+2",  ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=wolf&backgroundColor=7f8c8d" },
    "spider":     { cr:"1/4",  type:"Beast",    emoji:"🕷️", hp:26,  ac:12, init:3,  melee:5, meleeDmg:"1d8",    ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=spider&backgroundColor=8e44ad" },
    "owlbear":    { cr:"3",    type:"Beast",    emoji:"🦅", hp:59,  ac:13, init:1,  melee:7, meleeDmg:"2d8+5",  ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=owlbear&backgroundColor=8b4513" },
    "roc":        { cr:"11",   type:"Beast",    emoji:"🦅", hp:248, ac:15, init:1,  melee:9, meleeDmg:"4d8+9",  ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=roc&backgroundColor=795548" },
    // ── Fiends ─────────────────────────────────────────────────────────
    "imp":        { cr:"1",    type:"Fiend",    emoji:"😈", hp:10,  ac:13, init:3,  melee:3, meleeDmg:"1d4+3",  ranged:3, rangedDmg:"3d4",    img:"https://api.dicebear.com/8.x/bottts/svg?seed=imp&backgroundColor=c0392b" },
    "incubus":    { cr:"4",    type:"Fiend",    emoji:"🔥", hp:66,  ac:13, init:3,  melee:5, meleeDmg:"2d8+3",  ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=incubus&backgroundColor=e74c3c" },
    "pit_fiend":  { cr:"20",   type:"Fiend",    emoji:"👿", hp:300, ac:19, init:5,  melee:14,meleeDmg:"4d6+10", ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=pitfiend&backgroundColor=c0392b" },
    // ── Dragons ────────────────────────────────────────────────────────
    "dragon":     { cr:"17",   type:"Dragon",   emoji:"🐉", hp:256, ac:19, init:4,  melee:11,meleeDmg:"2d10+7", ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=dragon&backgroundColor=e67e22" },
    "wyvern":     { cr:"6",    type:"Dragon",   emoji:"🦎", hp:110, ac:13, init:0,  melee:7, meleeDmg:"2d8+4",  ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=wyvern&backgroundColor=16a085" },
    "pseudodragon":{ cr:"1/4", type:"Dragon",   emoji:"🦕", hp:7,   ac:13, init:3,  melee:4, meleeDmg:"1d4+2",  ranged:3, rangedDmg:"1d4+2",  img:"https://api.dicebear.com/8.x/bottts/svg?seed=pseudodragon&backgroundColor=f39c12" },
    // ── Aberrations ────────────────────────────────────────────────────
    "beholder":   { cr:"13",   type:"Aberration",emoji:"👁️", hp:180, ac:18, init:2,  melee:5, meleeDmg:"1d6+2",  ranged:12,rangedDmg:"2d8",    img:"https://api.dicebear.com/8.x/bottts/svg?seed=beholder&backgroundColor=9b59b6" },
    "mindflayer": { cr:"7",    type:"Aberration",emoji:"🦑", hp:71,  ac:15, init:1,  melee:7, meleeDmg:"2d10+4", ranged:7, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=mindflayer&backgroundColor=8e44ad" },
    // ── Giants ─────────────────────────────────────────────────────────
    "troll":      { cr:"5",    type:"Giant",    emoji:"🧌", hp:84,  ac:15, init:1,  melee:7, meleeDmg:"2d6+4",  ranged:0, rangedDmg:"0",      img:"https://api.dicebear.com/8.x/bottts/svg?seed=troll&backgroundColor=16a085" },
    "ogre":       { cr:"2",    type:"Giant",    emoji:"👹", hp:59,  ac:11, init:-1, melee:6, meleeDmg:"2d8+4",  ranged:5, rangedDmg:"2d8+4",  img:"https://api.dicebear.com/8.x/bottts/svg?seed=ogre&backgroundColor=8b4513" },
    "giant":      { cr:"7",    type:"Giant",    emoji:"🏔️", hp:114, ac:13, init:-1, melee:9, meleeDmg:"3d8+6",  ranged:9, rangedDmg:"3d8+6",  img:"https://api.dicebear.com/8.x/bottts/svg?seed=giant&backgroundColor=607d8b" },
};

/** Return numeric CR for range comparisons (handles "1/4", "1/2" etc.) */
export function parseCR(cr) {
    if (!cr) return 0;
    if (cr.includes('/')) { const [n,d]=cr.split('/'); return parseInt(n)/parseInt(d); }
    return parseFloat(cr) || 0;
}

/** Type → ring colour for token rendering */
export const typeColor = {
    Humanoid:   '#3498db',
    Undead:     '#95a5a6',
    Beast:      '#27ae60',
    Fiend:      '#e74c3c',
    Dragon:     '#e67e22',
    Aberration: '#8e44ad',
    Giant:      '#7f8c8d',
};
