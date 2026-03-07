// js/handout.js — Printable Dungeon Handout  (E7-A/B/C)
//
// Generates a one-page dungeon handout that can be printed or saved as PDF.
// Inspired by Watabou's One Page Dungeon format (MIT / CC-BY).
//
// Attribution:
//   One Page Dungeon concept by Watabou (https://watabou.github.io/one-page-dungeon/)
//   Licensed under MIT. See Credits modal (ⓘ) for full attribution.
//
// This module:
//   openWatabou(seed)          → open Watabou OPD in new tab with matching seed
//   printHandout(opts)         → open print-ready HTML page in new tab
//   captureMapCanvas(engine)   → returns base64 PNG of current map canvas

import { generateRoomEntry, generateTavernName, generateRumor } from './faker.js';

const WATABOU_BASE = 'https://watabou.github.io/one-page-dungeon/';

// ── Public API ───────────────────────────────────────────────────────

/**
 * Open Watabou's One Page Dungeon in a new tab.
 * Passes the room code as a numeric seed for reproducibility.
 *
 * @param {string|number} seed — room code or integer seed
 */
export function openWatabou(seed) {
  const n = seed
    ? (typeof seed === 'string' ? Math.abs(parseInt(seed, 36)) % 999999 : seed)
    : Math.floor(Math.random() * 999999);
  const url = `${WATABOU_BASE}?seed=${n}&tight=true&rooms=6`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Capture the current map engine canvas as a base64 PNG.
 * @param {MapEngine} engine
 * @returns {string} base64 data URL or empty string
 */
export function captureMapCanvas(engine) {
  try {
    return engine?.cv?.toDataURL('image/png') || '';
  } catch {
    return ''; // cross-origin bg image blocks toDataURL
  }
}

/**
 * Open a print-ready dungeon handout in a new tab.
 *
 * @param {object} opts
 *   roomCode   — room code string (for seed + header)
 *   sceneName  — name of the current scene
 *   dungeonData — output from generateDungeon() (optional)
 *   mapImageB64 — base64 PNG of the map canvas (optional)
 *   engine     — MapEngine instance (to capture canvas if no mapImageB64)
 */
export function printHandout({ roomCode = '', sceneName = 'Unnamed Dungeon', dungeonData = null, mapImageB64 = '', engine = null } = {}) {
  // Try to capture map if not provided
  if (!mapImageB64 && engine) {
    mapImageB64 = captureMapCanvas(engine);
  }

  // Build room entries from dungeonData or fallback
  const rooms = dungeonData?.rooms?.length > 0
    ? dungeonData.rooms.map((r, i) => generateRoomEntry(r, i))
    : _fallbackRooms(roomCode);

  // Generate handout HTML
  const html = _buildHandoutHTML({
    roomCode,
    sceneName,
    rooms,
    mapImageB64,
    seed: dungeonData?.seed || parseInt(roomCode, 36) || 0,
  });

  // Open in new window for printing
  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) {
    console.warn('Handout: popup blocked — trying direct download');
    _downloadHTML(html, `handout-${roomCode || 'dungeon'}.html`);
    return;
  }
  win.document.write(html);
  win.document.close();
  // Auto-open print dialog after page loads
  win.onload = () => { win.focus(); win.print(); };
}

// ── Private helpers ──────────────────────────────────────────────────

function _buildHandoutHTML({ roomCode, sceneName, rooms, mapImageB64, seed }) {
  const tavernName = generateTavernName();
  const rumors = [generateRumor(), generateRumor()];
  const date = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  const watabouUrl = `${WATABOU_BASE}?seed=${Math.abs(seed) % 999999}&tight=true`;

  const roomRows = rooms.map(r => `
    <tr>
      <td class="room-id">${r.id.replace('room_','')}</td>
      <td class="room-name">${r.name.replace(/^Room \d+ — /,'')}</td>
      <td class="room-desc">${r.description}</td>
    </tr>`).join('');

  const mapSection = mapImageB64
    ? `<div class="map-container"><img src="${mapImageB64}" alt="Dungeon Map" class="map-img"></div>`
    : `<div class="map-placeholder">
        <div class="map-placeholder-inner">
          <p>🗺 Interactive map in CritRoll</p>
          <p style="font-size:11px;margin-top:4px;">Room code: <strong>${roomCode || '—'}</strong></p>
          <a href="${watabouUrl}" target="_blank" style="color:#9b59b6;font-size:10px;">
            Open in Watabou OPD ↗
          </a>
        </div>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${sceneName} — CritRoll Handout</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=Share+Tech+Mono&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Crimson Text', Georgia, serif;
    background: #f5f0e8;
    color: #2c1f0e;
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 12mm 14mm;
  }

  /* ── Header ── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px double #8b6c42;
    padding-bottom: 6px;
    margin-bottom: 10px;
  }
  .header-title h1 {
    font-size: 24pt;
    font-weight: 600;
    letter-spacing: 1px;
    line-height: 1.1;
  }
  .header-title .sub {
    font-size: 10pt;
    color: #7a5c35;
    font-style: italic;
  }
  .header-meta {
    text-align: right;
    font-size: 8pt;
    color: #8b6c42;
    line-height: 1.6;
    font-family: 'Share Tech Mono', monospace;
  }
  .seal {
    width: 48px; height: 48px;
    border: 2px solid #8b6c42;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 22pt;
    margin-left: 10px;
    flex-shrink: 0;
  }

  /* ── Two-column layout ── */
  .body-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 8px;
  }
  .col-left { display: flex; flex-direction: column; gap: 8px; }
  .col-right { display: flex; flex-direction: column; gap: 8px; }

  /* ── Map ── */
  .map-container {
    border: 2px solid #8b6c42;
    background: #1a1510;
    border-radius: 4px;
    overflow: hidden;
    aspect-ratio: 4/3;
  }
  .map-img { width: 100%; height: 100%; object-fit: cover; }
  .map-placeholder {
    border: 2px dashed #8b6c42;
    aspect-ratio: 4/3;
    display: flex; align-items: center; justify-content: center;
    background: #ede5d4;
    border-radius: 4px;
    text-align: center;
    color: #7a5c35;
  }

  /* ── Section boxes ── */
  .section {
    border: 1px solid #c4a472;
    border-radius: 4px;
    padding: 6px 8px;
    background: #faf7f0;
  }
  .section-title {
    font-size: 9pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #7a5c35;
    border-bottom: 1px solid #c4a472;
    padding-bottom: 3px;
    margin-bottom: 5px;
  }

  /* ── Room table ── */
  .rooms-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.5pt;
  }
  .rooms-table th {
    text-align: left;
    font-weight: 600;
    font-size: 8pt;
    color: #7a5c35;
    border-bottom: 1px solid #c4a472;
    padding: 2px 4px;
  }
  .rooms-table td { padding: 3px 4px; vertical-align: top; }
  .rooms-table tr:nth-child(even) td { background: rgba(139,108,66,0.07); }
  .room-id { width: 20px; font-weight: 700; color: #8b6c42; }
  .room-name { width: 30%; font-style: italic; }
  .room-desc { color: #3d2b10; line-height: 1.35; }

  /* ── Rumors ── */
  .rumor-item {
    font-size: 8.5pt;
    font-style: italic;
    line-height: 1.45;
    padding: 3px 0;
    border-bottom: 1px dotted #c4a472;
    color: #3d2b10;
  }
  .rumor-item:last-child { border-bottom: none; }
  .rumor-item::before { content: '"'; color: #8b6c42; font-size: 14pt; line-height: 0; vertical-align: -4px; }
  .rumor-item::after  { content: '"'; color: #8b6c42; font-size: 14pt; line-height: 0; vertical-align: -4px; }

  /* ── Footer ── */
  .footer {
    margin-top: 10px;
    padding-top: 5px;
    border-top: 1px solid #c4a472;
    display: flex;
    justify-content: space-between;
    font-size: 7pt;
    color: #a08060;
    font-family: 'Share Tech Mono', monospace;
  }

  /* ── Print overrides ── */
  @media print {
    body { background: white; padding: 8mm 10mm; }
    @page { size: A4; margin: 0; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-title">
    <h1>${sceneName}</h1>
    <div class="sub">A One-Page Dungeon Handout • ${tavernName}</div>
  </div>
  <div style="display:flex;align-items:center;gap:8px;">
    <div class="header-meta">
      Room: ${roomCode || '—'}<br>
      Seed: ${Math.abs(seed) % 999999}<br>
      ${date}
    </div>
    <div class="seal">⚔️</div>
  </div>
</div>

<div class="body-cols">
  <div class="col-left">
    ${mapSection}

    <div class="section">
      <div class="section-title">📜 Dungeon Lore</div>
      ${rumors.map(r => `<div class="rumor-item">${r}</div>`).join('')}
    </div>

    <div class="section">
      <div class="section-title">⚠️ DM Notes</div>
      <div style="font-size:8pt;line-height:1.5;color:#555;">
        <div>• All rooms start fogged — revealed by token movement</div>
        <div>• Obstacles block line-of-sight (Rot.js RecursiveShadowcasting)</div>
        <div>• A* pathfinding active — click floor to move</div>
        <div>• Watabou reference: <span style="font-family:monospace;font-size:7pt;">${Math.abs(seed)%999999}</span></div>
      </div>
    </div>
  </div>

  <div class="col-right">
    <div class="section" style="flex:1;">
      <div class="section-title">🗺 Room Index</div>
      <table class="rooms-table">
        <thead>
          <tr><th>#</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>${roomRows}</tbody>
      </table>
    </div>
  </div>
</div>

<div class="footer">
  <span>Generated by CritRoll VTT • critroll.app</span>
  <span>One Page Dungeon concept by Watabou (MIT/CC-BY) • watabou.github.io/one-page-dungeon</span>
  <span>Seed ${Math.abs(seed)%999999} • ${date}</span>
</div>

</body>
</html>`;
}

function _fallbackRooms(roomCode) {
  const seed = parseInt(roomCode || '0', 36) || 0;
  const types = ['entrance','guardroom','corridor','treasury','boss_chamber'];
  return types.map((type, i) => generateRoomEntry({ id:`room_${i+1}`, type, x:i*3, y:i*2 }, i));
}

function _downloadHTML(html, filename) {
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
