#!/usr/bin/env node
// scripts/genIcons.cjs — Generate individual icons via OpenAI DALL-E 3
// Usage: node scripts/genIcons.cjs
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.argv[2] || process.env.OPENAI_API_KEY;
if (!API_KEY) { console.error('Usage: node genIcons.cjs <OPENAI_API_KEY>'); process.exit(1); }

const BASE = path.resolve(__dirname, '..', 'public', 'assets', 'icons');
const STYLE = `Rendered in the style of classic Dungeons and Dragons 3rd/3.5 edition rulebook fantasy illustration. Oil painting style with rich textures, visible brushstrokes, and dramatic chiaroscuro lighting. Dark moody background with warm candlelight or firelight. Fantasy realism, gritty and atmospheric like artwork by Larry Elmore, Jeff Easley, or Todd Lockwood. Absolutely NO text, NO words, NO letters, NO numbers, NO watermarks anywhere in the image. Single centered iconic object, square composition.`;

const ICONS = [
  // ── Toolbar ──
  { name: 'dice',      dir: 'toolbar', prompt: `A magnificent polished amber crystal twenty-sided die (icosahedron shape) glowing with inner arcane fire, resting on dark velvet cloth. Warm orange light emanates from within, casting dramatic shadows. Arcane runes subtly etched on each triangular face.` },
  { name: 'combat',    dir: 'toolbar', prompt: `Two crossed medieval longswords with ornate golden crossguards and leather-wrapped grips, blades gleaming with reflected firelight. Dramatic sparks where the blades cross. Dark smoky battlefield background.` },
  { name: 'initiative', dir: 'toolbar', prompt: `A crackling bolt of golden-white lightning striking downward, captured mid-flash against a dark stormy sky. Electric energy arcs and branches outward. Dramatic and powerful, with warm amber and electric blue tones.` },
  { name: 'npc',       dir: 'toolbar', prompt: `A mysterious ornate Venetian masquerade mask, half comedy half tragedy, made of burnished gold and dark leather. One eye hole glows with warm amber light, the other is shadowed. Theatrical and enigmatic.` },
  { name: 'monsters',  dir: 'toolbar', prompt: `An ancient leather-bound bestiary tome, thick and weathered, with a fearsome dragon embossed in gold leaf on the cover. The book is slightly open, with an eerie green-gold glow emanating from between the pages. Metal clasps and corner protectors.` },
  { name: 'scene',     dir: 'toolbar', prompt: `A weathered treasure map made of aged yellowed parchment, partially unrolled, with a detailed compass rose in the corner. Ink illustrations of coastlines and an X marks the spot. Warm candlelight illuminates it from above. A small brass spyglass rests on the corner.` },
  { name: 'music',     dir: 'toolbar', prompt: `A beautifully crafted medieval lute or mandolin with polished dark wood body and golden tuning pegs, resting against a tavern wall. Warm firelight reflects off the lacquered surface. Faint magical golden musical notes drift upward like embers.` },
  { name: 'log',       dir: 'toolbar', prompt: `An aged parchment scroll, partially unrolled, with a dark red wax seal bearing a dragon crest. A feathered quill pen rests across it, ink still wet. Warm candlelight from the side. The parchment has subtle ink markings suggesting writing without any legible text.` },
  { name: 'spells',    dir: 'toolbar', prompt: `A luminous crystal ball sitting on an ornate bronze dragon-claw stand, swirling with purple and blue arcane energy inside. Ethereal magical mist surrounds it. The glass surface reflects warm ambient firelight while the interior glows with otherworldly power.` },
  { name: 'mute',      dir: 'toolbar', prompt: `A single ornate brass candle holder with a candle that has just been snuffed out — a thin wisp of smoke curling upward from the dark wick. The scene is dark and moody, with the last dying ember barely visible. Atmospheric and quiet.` },
  { name: 'unmute',    dir: 'toolbar', prompt: `A single ornate brass candle holder with a brightly burning candle flame, warm golden light radiating outward and illuminating the surrounding darkness. The flame is vivid and alive, casting dancing shadows. Warm and inviting atmosphere.` },
  { name: 'rest',      dir: 'toolbar', prompt: `A medieval adventurer's campsite at night — a bedroll near dying campfire embers, with a crescent moon visible in the dark sky above. Stars twinkle. The warm orange glow of the last embers contrasts with cool blue moonlight. Peaceful and atmospheric.` },
  { name: 'table',     dir: 'toolbar', prompt: `A rustic medieval tavern table made of thick dark oak planks, seen from a slight angle. A single pewter tankard of ale sits on it, with warm firelight reflecting off the wet surface. The wood is scarred with years of use. Atmospheric tavern setting.` },
  { name: 'present',   dir: 'toolbar', prompt: `An ornate gilded picture frame, baroque style with carved flourishes, mounted on a dark stone wall. Inside the frame is a dramatic landscape of fantasy mountains and a dragon silhouette. Warm torchlight illuminates the golden frame edges.` },
  { name: 'campaign',  dir: 'toolbar', prompt: `A towering medieval fantasy castle with multiple spires and towers, seen against a dramatic sunset sky with clouds lit in gold and crimson. Banners fly from the battlements. The castle is built of dark stone with warm light glowing from arrow slits and windows.` },
  { name: 'notes',     dir: 'toolbar', prompt: `A pristine white feather quill pen with the tip dipped in dark ink, hovering over a piece of aged parchment. A small glass inkwell sits nearby. Warm candlelight illuminates the scene. The quill has iridescent detail on the feather barbs.` },
  { name: 'editor',    dir: 'toolbar', prompt: `A craftsman's workbench with drafting tools — a brass compass (the drawing kind), a straight-edge ruler, and a fine-tipped pen arranged neatly. Warm lamplight from above. Precise and scholarly atmosphere, suggesting careful planning and design.` },
  { name: 'broadcast', dir: 'toolbar', prompt: `A magnificent medieval war horn (oliphant) made of carved ivory and brass, with intricate Celtic knotwork engravings. Sound waves visually emanate from the bell in golden concentric rings. Dark dramatic background.` },
  { name: 'character', dir: 'toolbar', prompt: `A detailed adventurer's character sheet on aged parchment, pinned to a wooden clipboard. The parchment shows an illustrated portrait sketch of a fantasy warrior in a small frame at the top, with lines of handwritten statistics below (no legible text). A quill pen rests across it.` },
  { name: 'abilities', dir: 'toolbar', prompt: `A burst of pure magical energy — golden and violet arcane sparkles radiating outward from a central point like a starburst. Ethereal magical particles and motes of light scatter in all directions. Dark background. Mystical and powerful, suggesting unleashed magical potential.` },
  { name: 'advantage', dir: 'toolbar', prompt: `A four-leaf clover made of luminous emerald green leaves, glowing with subtle golden good-luck magic. Tiny golden sparkles and motes of light surround it. Set against a dark background. The clover is detailed and realistic, touched by warm magical light.` },
  { name: 'disadvantage', dir: 'toolbar', prompt: `A weathered human skull with dark empty eye sockets, one cracked. A faint cursed red-purple glow emanates from within. Dark cobwebs cling to it. Ominous and foreboding atmosphere with deep shadows. A symbol of death and misfortune.` },
  { name: 'save',      dir: 'toolbar', prompt: `A large dark red wax seal stamped with a royal crest (shield and dragon), pressed onto aged parchment. The wax is glossy and detailed with visible texture. A coiled ribbon emerges from beneath. Warm firelight highlights the raised seal impression.` },
  { name: 'party',     dir: 'toolbar', prompt: `Three medieval fantasy adventurer silhouettes standing shoulder to shoulder — a warrior with sword, a robed wizard with staff, and a cloaked rogue with daggers. Backlit by warm golden tavern light. Heroic and united, suggesting fellowship and camaraderie.` },
  { name: 'close',     dir: 'toolbar', prompt: `A heavy medieval iron door with rivets and a large X-shaped iron brace across it, symbolizing a closed or barred entrance. Dark stone doorframe. A single torch on the wall casts flickering warm light across the surface. Imposing and final.` },
];

async function generateIcon(icon) {
  const fullPrompt = `${icon.prompt} ${STYLE}`;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'dall-e-3',
      prompt: fullPrompt,
      n: 1,
      size: '1024x1024',
      quality: 'hd',
    });

    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/images/generations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error.message));
            return;
          }
          const url = json.data?.[0]?.url;
          if (!url) { reject(new Error('No URL in response: ' + data.slice(0, 200))); return; }
          resolve(url);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
  });
}

async function main() {
  // Process specific icons or all
  const filter = process.argv[3];
  const icons = filter ? ICONS.filter(i => i.name === filter) : ICONS;

  console.log(`Generating ${icons.length} icons via DALL-E 3...\n`);

  for (let i = 0; i < icons.length; i++) {
    const icon = icons[i];
    const outDir = path.join(BASE, icon.dir);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${icon.name}.png`);

    console.log(`[${i+1}/${icons.length}] ${icon.dir}/${icon.name}...`);

    try {
      const url = await generateIcon(icon);
      await downloadFile(url, outPath);
      const size = fs.statSync(outPath).size;
      console.log(`  ✓ ${(size/1024).toFixed(0)} KB\n`);
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}\n`);
    }

    // Small delay between requests to avoid rate limiting
    if (i < icons.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log('\nDone! Check public/assets/icons/ for results.');
}

main().catch(err => { console.error(err); process.exit(1); });
