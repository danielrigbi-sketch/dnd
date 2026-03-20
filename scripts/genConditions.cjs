#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.argv[2];
if (!API_KEY) { console.error('Usage: node genConditions.cjs <KEY>'); process.exit(1); }

const BASE = path.resolve(__dirname, '..', 'public', 'assets', 'icons', 'toolbar');
const STYLE = `Rendered in the style of classic Dungeons and Dragons 3rd/3.5 edition rulebook fantasy illustration. Oil painting style with rich textures, visible brushstrokes, and dramatic chiaroscuro lighting. Dark moody background. Fantasy realism, gritty and atmospheric. Absolutely NO text, NO words, NO letters, NO numbers anywhere in the image. Single centered iconic symbol, square composition.`;

const ICONS = [
  { name: 'poisoned',      prompt: `A glass vial of sickly green bubbling poison liquid, corked with wax, with wisps of toxic green vapor escaping. The liquid glows faintly. Small etched warning symbols on the glass. Dark alchemist lab background with warm candlelight.` },
  { name: 'charmed',       prompt: `A glowing pink-golden heart shape formed from swirling enchantment magic, floating in midair. Tiny sparkling motes of charm magic drift around it. Mesmerizing and hypnotic. Warm rosy light against a dark background. Enchantment aura.` },
  { name: 'unconscious',   prompt: `A medieval adventurer's empty steel helmet lying on its side on cold stone, with a faint ghostly wisp of dream energy drifting upward from it. Stars and sleep symbols suggested by tiny motes of light. Dark quiet atmosphere, suggesting deep magical sleep.` },
  { name: 'frightened',    prompt: `A single wide-open eye with a dilated pupil reflecting a terrifying shadow, surrounded by an aura of dark purple fear magic. Cracks of panic radiate outward. The iris shows amber-gold catching firelight. Intense and unsettling terror atmosphere.` },
  { name: 'paralyzed',     prompt: `A medieval gauntlet frozen mid-reach, encased in crackling blue-white lightning and magical energy that has locked it in place. Electric arcs hold the fingers rigid. The metal is frosted. Tense and immobilized. Dark background with electric blue lighting.` },
  { name: 'restrained',    prompt: `Heavy iron chains and shackles with a large rusty padlock, draped over dark stone. The chains are thick and imposing. A single warm torchlight catches the metal links. Dungeon atmosphere, confined and bound. Dark oppressive background.` },
  { name: 'blinded',       prompt: `A dark cloth blindfold made of black silk, tied in a knot, floating against a dark background. Faint magical darkness emanates from it. The surrounding area is in deep shadow with only the faintest light at the edges. Loss of sight, darkness magic.` },
  { name: 'prone',         prompt: `A fallen knight's helmet and shield lying on muddy ground after a fall, with a broken lance nearby. Boot marks in the mud. Low angle perspective. Warm afternoon light from the side. Suggests being knocked down in battle. Atmospheric and dramatic.` },
  { name: 'stunned',       prompt: `Concentric rings of golden-white impact energy radiating outward from a central point, like a shockwave. Stars and bright flashes of light spin in the pattern. Disorienting and overwhelming visual effect. Dark background with the stun effect brilliantly bright.` },
  { name: 'incapacitated', prompt: `A medieval puppet with cut strings, slumped and lifeless on a dark wooden stage. The strings dangle uselessly from above. Warm stage footlight illuminates the puppet from below. Loss of control and helplessness. Eerie theatrical atmosphere.` },
  { name: 'invisible',     prompt: `A shimmering translucent outline of a cloaked figure, barely visible like heat distortion in air. The background is visible through the figure. Faint magical sparkles trace the edges of the invisible form. Mysterious and ethereal. Dark stone corridor background.` },
  { name: 'exhausted',     prompt: `A burnt-out torch lying on stone ground, its flame completely dead, with the last wisp of smoke curling upward. The charred end is still faintly warm with a tiny ember. Spent and depleted. Dark cold atmosphere. Energy completely drained.` },
  { name: 'deafened',      prompt: `A broken medieval brass bell with a visible crack running through it, lying on its side. No sound emanates — complete silence suggested by the stillness. Dark stone chapel background with a single candle. Silence and loss of hearing.` },
  { name: 'grappled',      prompt: `A powerful closed fist gripping a thick rope or chain, knuckles white with effort. The hand is armored with a leather bracer. Tense and straining. Warm torchlight catches the tendons and effort. Close-up dramatic angle. Dark wrestling arena background.` },
  { name: 'raging',        prompt: `A pair of fierce predator eyes — amber and burning with inner fire — glaring from darkness. The eyes glow with supernatural fury and primal rage. Faint tribal war paint patterns visible on the dark face around them. Terrifying and savage intensity.` },
  { name: 'hasted',        prompt: `A pair of winged boots with small ethereal golden wings spread in flight, magical speed lines trailing behind them. The boots hover above the ground, crackling with time-acceleration magic. Golden-white speed energy. Dark background with motion blur.` },
  { name: 'blessed',       prompt: `A golden halo of divine light, circular and radiant, floating with gentle warmth. Sacred geometric patterns are subtly visible within the golden glow. Tiny motes of holy light drift downward like gentle snow. Peaceful divine blessing atmosphere. Dark background.` },
  { name: 'concentrating', prompt: `A wizard's hand held steady in a precise magical gesture, fingers forming a complex arcane mudra. A small focused orb of blue-purple magical energy hovers perfectly still above the palm. Extreme concentration and focus. Candlelit dark study background.` },
];

async function generateIcon(icon) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'dall-e-3', prompt: `${icon.prompt} ${STYLE}`,
      n: 1, size: '1024x1024', quality: 'hd',
    });
    const req = https.request({
      hostname: 'api.openai.com', path: '/v1/images/generations', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}`, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.error) { reject(new Error(j.error.message)); return; }
          resolve(j.data?.[0]?.url || '');
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) { download(res.headers.location, dest).then(resolve).catch(reject); return; }
      res.pipe(file); file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { recursive: true });
  console.log(`Generating ${ICONS.length} condition icons via DALL-E 3...\n`);
  for (let i = 0; i < ICONS.length; i++) {
    const icon = ICONS[i];
    const outPath = path.join(BASE, `${icon.name}.png`);
    console.log(`[${i+1}/${ICONS.length}] ${icon.name}...`);
    try {
      const url = await generateIcon(icon);
      await download(url, outPath);
      console.log(`  ✓ ${(fs.statSync(outPath).size/1024).toFixed(0)} KB\n`);
    } catch (err) { console.error(`  ✗ FAILED: ${err.message}\n`); }
    if (i < ICONS.length - 1) await new Promise(r => setTimeout(r, 1500));
  }
  console.log('\nDone!');
}
main().catch(e => { console.error(e); process.exit(1); });
