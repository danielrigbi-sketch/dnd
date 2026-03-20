#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.argv[2];
if (!API_KEY) { console.error('Usage: node genClasses.cjs <KEY>'); process.exit(1); }

const BASE = path.resolve(__dirname, '..', 'public', 'assets', 'icons');
const STYLE = `Rendered in the style of classic Dungeons and Dragons 3rd/3.5 edition rulebook fantasy illustration. Oil painting style with rich textures, visible brushstrokes, and dramatic chiaroscuro lighting. Dark moody background with warm firelight. Fantasy realism, gritty and atmospheric like artwork by Larry Elmore, Jeff Easley, or Todd Lockwood. Absolutely NO text, NO words, NO letters, NO numbers anywhere in the image. Single centered iconic object or symbol, square composition.`;

const ICONS = [
  { name: 'barbarian', dir: 'class', prompt: `A massive double-headed greataxe with a crude iron blade, nicked and battle-scarred, embedded in a bloodstained wooden stump. Primal tribal carvings on the haft. Fiery rage energy glows along the blade edges. Savage and untamed atmosphere, dark wilderness background.` },
  { name: 'bard',      dir: 'class', prompt: `An exquisite medieval lute with a polished rosewood body and pearl inlays, resting against velvet cushions in a dimly lit tavern. Magical golden musical notes and shimmering sound waves drift upward like enchanted embers. Warm, theatrical atmosphere.` },
  { name: 'cleric',    dir: 'class', prompt: `A radiant holy symbol — a golden sunburst medallion on a silver chain — floating in midair, emanating warm divine white-gold light and healing energy. Sacred rays extend outward. Stone cathedral background with candlelight. Reverent and powerful divine atmosphere.` },
  { name: 'druid',     dir: 'class', prompt: `A gnarled ancient oak staff topped with a living green gemstone wrapped in growing vines and leaves. Tiny flowers bloom along the wood. A crescent moon glows behind it. Mystical forest clearing with moonlight filtering through canopy. Nature magic, primal and ancient.` },
  { name: 'fighter',   dir: 'class', prompt: `A knight's steel longsword and a battered iron heater shield with a lion rampant heraldic device, crossed and propped against a stone wall. Battle damage visible — dents, scratches, worn leather grip. Torch-lit armory background. Sturdy, martial, and dependable.` },
  { name: 'monk',      dir: 'class', prompt: `A pair of wrapped martial arts hand wraps and a wooden meditation staff, arranged on a smooth stone in a tranquil zen temple garden. Faint blue-white ki energy swirls around the fists area. Cherry blossoms drift through warm golden light. Disciplined inner peace and power.` },
  { name: 'paladin',   dir: 'class', prompt: `A magnificent holy avenger longsword standing upright, blade glowing with brilliant white-gold divine light, with angel wings subtly visible in the radiance behind it. Ornate golden crossguard with religious motifs. Dark background makes the divine glow more dramatic. Righteous and noble.` },
  { name: 'ranger',    dir: 'class', prompt: `A finely crafted longbow with a single arrow nocked, made of yew wood with carved antler tips. Resting against a moss-covered tree trunk in a misty ancient forest. A wolf's pawprint visible in the mud nearby. Dappled green-gold forest light. Wilderness tracker atmosphere.` },
  { name: 'rogue',     dir: 'class', prompt: `A pair of curved daggers with dark leather-wrapped hilts, crossed in an X pattern, emerging from deep shadows. One blade catches a sliver of moonlight. A coiled lockpick set and a small pouch of coins visible nearby. Dark alley atmosphere, mysterious and dangerous.` },
  { name: 'sorcerer',  dir: 'class', prompt: `Raw magical energy erupting from an outstretched hand — swirling fire, crackling lightning, and arcane purple force spiraling together in a chaotic but beautiful vortex. Wild magic made visible. The hand has faint draconic scale patterns. Dark dramatic background with energy illuminating everything.` },
  { name: 'warlock',   dir: 'class', prompt: `An ancient eldritch tome bound in dark leather with a single glowing eye embossed on the cover, the eye looking directly at the viewer. Tendrils of dark purple-green otherworldly energy seep from between the pages. Eerie candlelight. Forbidden knowledge and dark pacts atmosphere.` },
  { name: 'wizard',    dir: 'class', prompt: `A weathered leather-bound spellbook lying open on a cluttered desk, with arcane circles and mystical diagrams drawn on the pages. A crystal-topped wizard's staff leans nearby. Floating magical glyphs hover above the pages in soft blue light. Scholarly tower study with candlelight.` },
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
  console.log(`Generating ${ICONS.length} class icons via DALL-E 3...\n`);
  for (let i = 0; i < ICONS.length; i++) {
    const icon = ICONS[i];
    const outDir = path.join(BASE, icon.dir);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${icon.name}.png`);
    console.log(`[${i+1}/${ICONS.length}] ${icon.dir}/${icon.name}...`);
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
