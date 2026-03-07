// js/npcPanel.js — NPC Generator Panel  (Wave 2 / E8-B)
//
// DM tool: generates random D&D NPCs with personality, name, background hooks.
// Features:
//   • Race picker (random or specific)
//   • One-click "Generate NPC" button with animated shimmer
//   • Displays name, race, occupation, appearance, personality, ideal, bond, flaw
//   • "Spawn in Scene" button uses sceneWizard._spawnToken if active
//   • "Copy" button for markdown export
//   • Rumour generator (bonus tool)
//   • Tavern name generator (bonus tool)
//   • History stack: last 5 NPCs for reference
//
// Usage:
//   import { openNPCPanel, closeNPCPanel } from './npcPanel.js';

import { generateNPC, generateTavernName, generateRumor, RACES } from './faker.js';

// ── DOM bootstrap ──────────────────────────────────────────────────────────────

function ensurePanel() {
  if (document.getElementById('npc-panel-modal')) return;

  const modal = document.createElement('div');
  modal.id    = 'npc-panel-modal';
  modal.innerHTML = `
    <div id="npc-panel-backdrop" onclick="window.closeNPCPanel()"></div>
    <div id="npc-panel-dialog" role="dialog" aria-label="NPC Generator">
      <div id="npc-panel-header">
        <span style="font-size:18px;font-weight:700;color:#e6b800">🎲 NPC Generator</span>
        <button onclick="window.closeNPCPanel()"
          style="background:none;border:none;color:#aaa;font-size:22px;cursor:pointer;padding:4px;"
          aria-label="Close">✕</button>
      </div>

      <div id="npc-panel-controls">
        <select id="npc-race-select"
          style="padding:8px 12px;background:#16213e;border:1px solid #555;border-radius:6px;
                 color:#eee;font-size:13px;cursor:pointer;flex:1;">
          <option value="">Random race</option>
          ${RACES.map(r => `<option value="${r}">${r}</option>`).join('')}
        </select>
        <select id="npc-gender-select"
          style="padding:8px 10px;background:#16213e;border:1px solid #555;border-radius:6px;
                 color:#eee;font-size:13px;cursor:pointer;max-width:110px;">
          <option value="">Any gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
        <button id="npc-gen-btn" onclick="window._genNPC()"
          style="padding:8px 18px;background:#8e44ad;border:none;border-radius:6px;
                 color:#fff;font-size:14px;font-weight:700;cursor:pointer;flex-shrink:0;
                 transition:background .15s;">
          ✦ Generate
        </button>
      </div>

      <div id="npc-panel-main">
        <div id="npc-card-area">
          <div id="npc-empty-state" style="color:#555;text-align:center;padding:40px 20px;font-size:15px;">
            Press <strong style="color:#8e44ad">✦ Generate</strong> to create an NPC
          </div>
        </div>

        <div id="npc-history" style="display:none;">
          <div style="font-size:11px;color:#666;margin-top:14px;margin-bottom:6px;
                      text-transform:uppercase;letter-spacing:.5px;">Recent</div>
          <div id="npc-history-list"></div>
        </div>
      </div>

      <div id="npc-panel-tools">
        <button onclick="window._genTavern()" class="npc-tool-btn">🍺 Tavern Name</button>
        <button onclick="window._genRumour()" class="npc-tool-btn">💬 Rumour</button>
      </div>
      <div id="npc-tool-output" style="display:none;"></div>
    </div>`;

  if (!document.getElementById('npc-panel-css')) {
    const style = document.createElement('style');
    style.id    = 'npc-panel-css';
    style.textContent = `
      #npc-panel-backdrop {
        display:none; position:fixed; inset:0;
        background:rgba(0,0,0,0.6); z-index:5200;
      }
      #npc-panel-dialog {
        display:none; position:fixed;
        top:50%; left:50%; transform:translate(-50%,-50%);
        width:min(560px,96vw); max-height:85dvh;
        background:#1a1a2e; border:1px solid #8e44ad;
        border-radius:12px; z-index:5201; flex-direction:column;
        box-shadow:0 20px 60px rgba(0,0,0,0.7); overflow:hidden;
      }
      #npc-panel-dialog.open { display:flex !important; }
      #npc-panel-header {
        display:flex; justify-content:space-between; align-items:center;
        padding:16px 18px 10px; border-bottom:1px solid #2d2d4e; flex-shrink:0;
      }
      #npc-panel-controls {
        display:flex; gap:8px; align-items:center; padding:10px 14px;
        border-bottom:1px solid #2d2d4e; flex-shrink:0; flex-wrap:wrap;
      }
      #npc-gen-btn:hover { background:#a55fc2 !important; }
      #npc-panel-main { overflow-y:auto; flex:1; padding:14px; }

      .npc-card {
        background:#16213e; border-radius:10px; border:1px solid #2d2d4e;
        padding:16px; animation:npcFadeIn .3s ease;
      }
      @keyframes npcFadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
      .npc-name {
        font-size:20px; font-weight:700; color:#e6b800; margin-bottom:2px;
      }
      .npc-race-line { font-size:13px; color:#aaa; margin-bottom:10px; }
      .npc-desc { font-size:13px; color:#ccc; font-style:italic; margin-bottom:12px; }
      .npc-section { margin-bottom:8px; font-size:13px; }
      .npc-label {
        font-size:10px; color:#8e44ad; text-transform:uppercase;
        font-weight:700; letter-spacing:.5px; display:block;
      }
      .npc-value { color:#ddd; }

      .npc-actions { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }
      .npc-act-btn {
        padding:6px 14px; border:1px solid #555; border-radius:6px;
        background:#1d2d50; color:#ccc; font-size:12px; cursor:pointer;
        transition:all .15s;
      }
      .npc-act-btn:hover { background:#2d3d60; color:#fff; }
      .npc-act-btn.primary { background:#8e44ad; border-color:#8e44ad; color:#fff; }
      .npc-act-btn.primary:hover { background:#a55fc2; }

      .npc-history-item {
        display:flex; align-items:center; gap:8px; padding:6px 8px;
        border-radius:6px; cursor:pointer; transition:background .15s;
        font-size:13px; color:#ccc;
      }
      .npc-history-item:hover { background:#16213e; }
      .npc-history-name { flex:1; color:#e6b800; font-weight:600; }
      .npc-history-sub  { font-size:11px; color:#666; }

      #npc-panel-tools {
        display:flex; gap:8px; padding:10px 14px;
        border-top:1px solid #2d2d4e; flex-shrink:0; flex-wrap:wrap;
      }
      .npc-tool-btn {
        padding:7px 14px; background:#16213e; border:1px solid #555;
        border-radius:6px; color:#ccc; font-size:13px; cursor:pointer;
        transition:all .15s; flex:1;
      }
      .npc-tool-btn:hover { background:#1d2d50; color:#fff; }

      #npc-tool-output {
        margin:0 14px 12px; padding:10px 14px;
        background:#16213e; border-radius:8px;
        font-size:14px; color:#e6b800;
        border-left:3px solid #8e44ad;
        animation:npcFadeIn .25s ease;
      }

      .npc-shimmer {
        background:linear-gradient(90deg,#16213e 25%,#1d2d50 50%,#16213e 75%);
        background-size:200% 100%; border-radius:4px;
        animation:npcShimmer 1.2s infinite;
      }
      @keyframes npcShimmer {
        0%{background-position:200% 0} 100%{background-position:-200% 0}
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(modal);
}

// ── State ─────────────────────────────────────────────────────────────────────

const _history = [];   // max 5 NPCs

// ── Render helpers ─────────────────────────────────────────────────────────────

function _renderNPCCard(npc) {
  return `
    <div class="npc-card" id="npc-current-card">
      <div class="npc-name">${npc.name}</div>
      <div class="npc-race-line">${npc.race} · ${npc.occupation}</div>
      <div class="npc-desc">${npc.description[0].toUpperCase() + npc.description.slice(1)}.</div>

      <div class="npc-section">
        <span class="npc-label">Personality</span>
        <span class="npc-value">${npc.personality}</span>
      </div>
      <div class="npc-section">
        <span class="npc-label">Ideal</span>
        <span class="npc-value">${npc.ideal}</span>
      </div>
      <div class="npc-section">
        <span class="npc-label">Bond</span>
        <span class="npc-value">${npc.bond}</span>
      </div>
      <div class="npc-section">
        <span class="npc-label">Flaw</span>
        <span class="npc-value">${npc.flaw}</span>
      </div>

      <div class="npc-actions">
        <button class="npc-act-btn" onclick="window._copyNPC()" title="Copy as markdown">📋 Copy</button>
        <button class="npc-act-btn" onclick="window._genNPC()" title="Regenerate">🔄 Reroll</button>
        ${_canSpawn() ? `<button class="npc-act-btn primary" onclick="window._spawnNPC()">⚔ Spawn in Scene</button>` : ''}
      </div>
    </div>`;
}

function _renderHistory() {
  const el = document.getElementById('npc-history');
  const list = document.getElementById('npc-history-list');
  if (!el || !list || _history.length === 0) {
    if (el) el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  list.innerHTML = _history.slice().reverse().map((npc, i) => `
    <div class="npc-history-item" onclick="window._loadHistoryNPC(${_history.length - 1 - i})">
      <span class="npc-history-name">${npc.name}</span>
      <span class="npc-history-sub">${npc.race} · ${npc.occupation}</span>
    </div>`).join('');
}

let _currentNPC = null;

// ── Globals ────────────────────────────────────────────────────────────────────

window._genNPC = function() {
  ensurePanel();
  const area   = document.getElementById('npc-card-area');
  if (!area) return;

  // Shimmer
  area.innerHTML = `
    <div class="npc-card">
      <div class="npc-shimmer" style="width:55%;height:24px;margin-bottom:8px;"></div>
      <div class="npc-shimmer" style="width:35%;height:14px;margin-bottom:14px;"></div>
      <div class="npc-shimmer" style="width:90%;height:13px;margin-bottom:8px;"></div>
      <div class="npc-shimmer" style="width:80%;height:13px;margin-bottom:8px;"></div>
      <div class="npc-shimmer" style="width:85%;height:13px;margin-bottom:8px;"></div>
      <div class="npc-shimmer" style="width:75%;height:13px;"></div>
    </div>`;

  // Small delay for UX feedback, then generate synchronously
  setTimeout(() => {
    const race   = document.getElementById('npc-race-select')?.value || undefined;
    const gender = document.getElementById('npc-gender-select')?.value || undefined;
    const npc    = generateNPC({ race, gender });

    _currentNPC = npc;
    _history.push(npc);
    if (_history.length > 5) _history.shift();

    area.innerHTML = _renderNPCCard(npc);
    _renderHistory();
  }, 280);
};

window._loadHistoryNPC = function(idx) {
  const npc = _history[idx];
  if (!npc) return;
  _currentNPC = npc;
  const area = document.getElementById('npc-card-area');
  if (area) area.innerHTML = _renderNPCCard(npc);
};

window._copyNPC = function() {
  if (!_currentNPC) return;
  const n = _currentNPC;
  const md = `## ${n.name}\n*${n.race} ${n.occupation} — ${n.description}.*\n\n`
           + `**Personality:** ${n.personality}\n`
           + `**Ideal:** ${n.ideal}\n`
           + `**Bond:** ${n.bond}\n`
           + `**Flaw:** ${n.flaw}\n`;
  navigator.clipboard?.writeText(md).catch(() => {});

  // Quick feedback
  const btn = document.querySelector('.npc-act-btn[onclick*="_copyNPC"]');
  if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = '📋 Copy'; }, 1500); }
};

window._spawnNPC = function() {
  if (!_currentNPC || !window._spawnNPCToken) return;
  window._spawnNPCToken(_currentNPC);
};

function _canSpawn() {
  return typeof window._spawnNPCToken === 'function';
}

window._genTavern = function() {
  const out = document.getElementById('npc-tool-output');
  if (!out) return;
  out.style.display = 'block';
  out.innerHTML = `🍺 <strong>Tavern:</strong> ${generateTavernName()}`;
};

window._genRumour = function() {
  const out = document.getElementById('npc-tool-output');
  if (!out) return;
  out.style.display = 'block';
  out.innerHTML = `💬 <em>${generateRumor()}</em>`;
};

// ── Public API ─────────────────────────────────────────────────────────────────

export function openNPCPanel() {
  ensurePanel();
  const dialog = document.getElementById('npc-panel-dialog');
  const back   = document.getElementById('npc-panel-backdrop');
  dialog.classList.add('open');
  back.style.display = 'block';
}

export function closeNPCPanel() {
  const dialog = document.getElementById('npc-panel-dialog');
  const back   = document.getElementById('npc-panel-backdrop');
  if (!dialog) return;
  dialog.classList.remove('open');
  if (back) back.style.display = 'none';
}

window.closeNPCPanel = closeNPCPanel;
window.openNPCPanel  = openNPCPanel;
