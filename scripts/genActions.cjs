#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.argv[2];
if (!API_KEY) { console.error('Usage: node genActions.cjs <KEY>'); process.exit(1); }

const BASE = path.resolve(__dirname, '..', 'public', 'assets', 'icons');
const STYLE = `Rendered in the style of classic Dungeons and Dragons 3rd/3.5 edition rulebook fantasy illustration. Oil painting style with rich textures, visible brushstrokes, and dramatic chiaroscuro lighting. Dark moody background with warm firelight. Fantasy realism, gritty and atmospheric like artwork by Larry Elmore, Jeff Easley, or Todd Lockwood. Absolutely NO text, NO words, NO letters, NO numbers anywhere in the image. Single centered iconic object or symbol, square composition.`;

const ICONS = [
  { name: 'melee',     dir: 'action', prompt: `A massive two-handed greatsword mid-swing, trailing an arc of silver light through the air. The blade is finely forged steel with fuller groove and leather-wrapped grip. Motion blur and sparks suggest powerful impact. Dark battlefield smoke background.` },
  { name: 'ranged',    dir: 'action', prompt: `A single arrow in flight, captured mid-air with its white fletching feathers still vibrating. The steel broadhead arrowhead catches torchlight. Motion trails suggest incredible speed. Dark archery range background with a distant target dimly visible.` },
  { name: 'wand',      dir: 'action', prompt: `An ornate magical wand made of twisted dark wood with a glowing crystal tip, emitting a stream of golden and blue arcane sparkles. The crystal pulses with inner light. Enchanted and elegant, suggesting precise magical channeling. Dark study background.` },
  { name: 'fire',      dir: 'action', prompt: `A roaring fireball — a sphere of intense orange and yellow flame with swirling heat distortion, hovering in midair. Inner core is white-hot. Embers and sparks scatter outward. Dark background makes the fire brilliantly vivid. Magical and destructive.` },
  { name: 'ice',       dir: 'action', prompt: `A perfect crystalline ice shard, jagged and razor-sharp, floating in midair with frost vapor curling around it. The ice refracts light into blue and white prismatic colors. Frost crystals form on nearby surfaces. Cold blue dramatic lighting against dark background.` },
  { name: 'lightning', dir: 'action', prompt: `A concentrated bolt of electric blue-white lightning, crackling with raw power, arcing between two points. Branching tendrils of electricity spread outward. The air around it glows with ionized purple-blue light. Thunder and storm energy. Dark stormy background.` },
  { name: 'wind',      dir: 'action', prompt: `A powerful whirlwind vortex of swirling silver-white air and magical force energy, spiraling upward. Leaves, dust, and debris caught in the cyclone. Visible wind currents rendered as flowing translucent streams. Dark background with the wind glowing faintly.` },
  { name: 'shield',    dir: 'action', prompt: `A magnificent tower shield of polished steel with a golden lion emblem, angled to deflect an incoming attack. Magical blue protective runes glow along its surface. Sparks fly where an unseen blow has just struck it. Defensive and stalwart. Dark background.` },
  { name: 'bomb',      dir: 'action', prompt: `A classic alchemist's round bomb with a lit sparking fuse, the black iron sphere sitting on a wooden table among scattered alchemical supplies. The fuse throws off golden sparks. Warm orange light from the burning fuse. Dangerous and volatile atmosphere.` },
  { name: 'dagger',    dir: 'action', prompt: `A wickedly curved assassin's dagger with a serrated edge and dark leather-wrapped handle, lying on black silk. The polished blade catches a sliver of moonlight. A single drop of dark liquid on the tip. Mysterious, lethal, and precise. Dark dramatic lighting.` },
  { name: 'arcane',    dir: 'action', prompt: `A glowing arcane rune circle floating in midair, made of intricate interlocking geometric patterns and mystical symbols that pulse with soft blue and purple light. Magical energy flows along the pattern lines. Ethereal and scholarly. Dark chamber background.` },
  { name: 'death',     dir: 'action', prompt: `An ancient bone-white scythe with a curved blade that has an eerie green-black necrotic glow along its edge. Dark shadowy mist coils around the haft. The weapon hovers ominously. Foreboding and supernatural, suggesting dark necromantic power. Very dark background.` },
  { name: 'nature',    dir: 'action', prompt: `A living vine covered in thorns and small white flowers, coiled in a spiral. The vine pulses with soft green life energy. Tiny motes of golden pollen drift around it. Earthy, primal nature magic. Forest floor background with moss and fallen leaves in warm light.` },
  { name: 'blood',     dir: 'action', prompt: `A medieval healer's mortar and pestle made of dark stone, with deep crimson herbs and dried red flowers being ground inside. A vial of dark red liquid sits nearby. Atmospheric apothecary setting with warm candlelight. Suggests the thin line between healing and harm.` },
  { name: 'holy',      dir: 'action', prompt: `A brilliant radiant sunburst of pure golden-white divine light, with warm rays extending outward in all directions. The center is intensely bright. Gentle warmth and sacred power. Suggests divine intervention and holy power. Dark surroundings amplify the sacred glow.` },
  { name: 'water',     dir: 'action', prompt: `A sphere of swirling crystal-clear water magically suspended in midair, with small waves and currents visible within it. Blue-green light refracts through the liquid. Water droplets orbit around it. Magical and serene yet powerful. Dark background with blue-teal lighting.` },
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
  console.log(`Generating ${ICONS.length} action icons via DALL-E 3...\n`);
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
