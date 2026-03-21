# ParaDice — AI Video Assets

Drop your generated video files in this folder. The app will use them automatically.
If files are missing, the existing CSS fire-glow backgrounds serve as fallback — nothing breaks.

---

## Files needed

| Filename | Duration | Type | Used on |
|---|---|---|---|
| `tavern-exterior.webm` + `.mp4` | 4–6s loop | Background | Login screen |
| `door-open.webm` + `.mp4` | 2–3s one-shot | Transition | Login → Lobby |
| `tavern-interior.webm` + `.mp4` | 6–8s loop | Background | Lobby screen |

---

## AI Video Prompts

### tavern-exterior (login background loop)
> Exterior of a medieval fantasy tavern at night, old wooden door with iron hinges,
> two flickering torch sconces on either side, a hanging wooden sign above the door,
> warm amber candlelight seeping through the cracks of the door, stone wall facade,
> light dust particles floating in the torchlight, cinematic dark fantasy, Diablo style,
> seamless loop, no text, no characters

### door-open (login transition — plays once)
> Old heavy wooden tavern door swinging open slowly from outside view, revealing a warm
> amber-lit tavern interior, fireplace glow flooding through the doorway, smoke and ember
> particles floating in, dramatic cinematic lighting, dark fantasy, first-person perspective,
> Baldur's Gate 3 / Diablo style, no text, no characters

### tavern-interior (lobby background loop)
> Interior of a medieval fantasy tavern, crackling fireplace in the back wall, hooded
> adventurer NPCs sitting at wooden tables, mugs on tables, candlelight on every surface,
> warm amber and deep shadow atmosphere, stone floor, heavy wooden ceiling beams,
> Diablo 2 / Baldur's Gate tavern atmosphere, cinematic, seamless loop, no text

---

## Recommended Tools (fastest results)

| Tool | URL | Best for |
|---|---|---|
| Kling AI | klingai.com | Loops (exterior + interior) — free tier |
| Runway Gen-3 | runwayml.com | Door-open action clip |
| Pika 2.0 | pika.art | Fast iteration |
| Luma Dream Machine | lumalabs.ai | Natural motion loops |

## Export settings
- Format: `.webm` (VP9) preferred, `.mp4` (H.264) as fallback
- Resolution: 1280×720 minimum, 1920×1080 ideal
- No audio needed (videos are muted by the player)
- For loops: trim so the last frame matches the first frame
