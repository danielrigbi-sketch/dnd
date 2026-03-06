// monsters.js - NPC & Monster Database

export const npcDatabase = {
    "goblin": { hp: 7, init: 2, melee: 4, meleeDmg: '1d6', ranged: 4, rangedDmg: '1d6', img: "https://api.dicebear.com/8.x/bottts/svg?seed=goblin&backgroundColor=c0392b" },
    "skeleton": { hp: 13, init: 2, melee: 4, meleeDmg: '1d6', ranged: 4, rangedDmg: '1d6', img: "https://api.dicebear.com/8.x/bottts/svg?seed=skeleton&backgroundColor=bdc3c7" },
    "zombie": { hp: 22, init: -2, melee: 3, meleeDmg: '1d6', ranged: 0, rangedDmg: '0', img: "https://api.dicebear.com/8.x/bottts/svg?seed=zombie&backgroundColor=27ae60" },
    "orc": { hp: 15, init: 1, melee: 5, meleeDmg: '1d12', ranged: 3, rangedDmg: '1d6', img: "https://api.dicebear.com/8.x/bottts/svg?seed=orc&backgroundColor=2c3e50" },
    "wolf": { hp: 37, init: 2, melee: 5, meleeDmg: '2d4', ranged: 0, rangedDmg: '0', img: "https://api.dicebear.com/8.x/bottts/svg?seed=wolf&backgroundColor=7f8c8d" },
    "bandit": { hp: 11, init: 1, melee: 3, meleeDmg: '1d6', ranged: 3, rangedDmg: '1d8', img: "https://api.dicebear.com/8.x/bottts/svg?seed=bandit&backgroundColor=f39c12" },
    "spider": { hp: 26, init: 3, melee: 5, meleeDmg: '1d8', ranged: 5, rangedDmg: '0', img: "https://api.dicebear.com/8.x/bottts/svg?seed=spider&backgroundColor=8e44ad" },
    "owlbear": { hp: 59, init: 1, melee: 7, meleeDmg: '2d8', ranged: 0, rangedDmg: '0', img: "https://api.dicebear.com/8.x/bottts/svg?seed=owlbear&backgroundColor=8b4513" },
    "troll": { hp: 84, init: 1, melee: 7, meleeDmg: '2d6', ranged: 0, rangedDmg: '0', img: "https://api.dicebear.com/8.x/bottts/svg?seed=troll&backgroundColor=16a085" },
    "vampire": { hp: 144, init: 4, melee: 9, meleeDmg: '1d8', ranged: 0, rangedDmg: '0', img: "https://api.dicebear.com/8.x/bottts/svg?seed=vampire&backgroundColor=c0392b" },
    "dragon": { hp: 110, init: 4, melee: 7, meleeDmg: '2d10', ranged: 0, rangedDmg: '0', img: "https://api.dicebear.com/8.x/bottts/svg?seed=dragon&backgroundColor=e67e22" },
    "beholder": { hp: 180, init: 2, melee: 5, meleeDmg: '1d6', ranged: 12, rangedDmg: '2d8', img: "https://api.dicebear.com/8.x/bottts/svg?seed=beholder&backgroundColor=9b59b6" },
    "mindflayer": { hp: 71, init: 1, melee: 7, meleeDmg: '2d10', ranged: 7, rangedDmg: '0', img: "https://api.dicebear.com/8.x/bottts/svg?seed=mindflayer&backgroundColor=8e44ad" },
    "lich": { hp: 135, init: 3, melee: 9, meleeDmg: '3d6', ranged: 12, rangedDmg: '4d6', img: "https://api.dicebear.com/8.x/bottts/svg?seed=lich&backgroundColor=2c3e50" }
};
