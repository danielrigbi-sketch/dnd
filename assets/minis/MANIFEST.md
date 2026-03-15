# CritRoll — 3D Miniature Assets Manifest

## License

All assets in this folder must be sourced from **Kenney.nl Character Kit**
(kenney.nl/assets/character-kit) which is released under **CC0** (public domain).
No attribution required.

---

## Download Instructions

1. Go to **https://kenney.nl/assets/character-kit**
2. Download the free asset pack (ZIP)
3. Extract and copy files into the subfolders below

---

## Required Files

### Body Models (place in `characters/`)

| File path | Source file in Kenney pack |
|-----------|---------------------------|
| `characters/male/body_default.glb`     | `Models/GLB/characterMedium.glb` (male variant) |
| `characters/female/body_default.glb`   | `Models/GLB/characterMedium.glb` (female variant) |
| `characters/nonbinary/body_default.glb`| Same as male (or female) |

### Accessories (place in `accessories/`)

| File path | Source |
|-----------|--------|
| `accessories/ears_pointed.glb`  | Custom / Kenney accessory pack |
| `accessories/horns_curved.glb`  | Custom / Kenney accessory pack |
| `accessories/beard_short.glb`   | Kenney accessory: beard |
| `accessories/hat_pointed.glb`   | Kenney accessory: wizard hat |
| `accessories/hood.glb`          | Kenney accessory: hood |

### Armors (place in `armor/`)

| File path | Source |
|-----------|--------|
| `armor/plate.glb`         | Kenney armor: plate |
| `armor/robe.glb`          | Kenney armor: robe |
| `armor/leather.glb`       | Kenney armor: leather |
| `armor/chainmail.glb`     | Kenney armor: chainmail |
| `armor/fur_shoulders.glb` | Kenney armor: fur |
| `armor/tunic.glb`         | Kenney armor: tunic |

### Weapons (place in `weapons/`)

| File path | Source |
|-----------|--------|
| `weapons/sword.glb`     | Kenney weapon: sword |
| `weapons/staff.glb`     | Kenney weapon: staff |
| `weapons/dagger.glb`    | Kenney weapon: dagger |
| `weapons/bow.glb`       | Kenney weapon: bow |
| `weapons/greataxe.glb`  | Kenney weapon: greataxe |
| `weapons/mace.glb`      | Kenney weapon: mace |
| `weapons/lute.glb`      | Kenney weapon: lute (instrument) |

### Shields (place in `shields/`)

| File path | Source |
|-----------|--------|
| `shields/round_shield.glb` | Kenney shield: round |

---

## Before Assets Are Installed

The system works without assets.  `miniAssembler.js` returns a **coloured
capsule placeholder** for each token so the Three.js overlay, coordinate
mapping, toon shading, and animation pipeline can be tested immediately.

Once GLB files are placed in the correct paths and `vite dev` is restarted,
real character models replace the placeholders automatically.
