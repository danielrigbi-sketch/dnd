// js/statBlock.js — Monster Stat Block Drawer  (Wave 2 / E1-C)
//
// Renders a slide-in drawer showing the full SRD stat block for any creature.
// Can be opened from:
//   • The compendium gallery (Wave 1 sceneWizard)
//   • Combat tracker token context
//   • Direct call:  openStatBlock(slug)  or  openStatBlockData(monsterObj)
//
// Dependencies: open5e.js (fetchMonsterBySlug)

import { fetchMonsterBySlug } from './open5e.js';

// ── DOM bootstrap (idempotent) ─────────────────────────────────────────────────

function ensureDrawer() {
  if (document.getElementById('stat-block-drawer')) return;

  const drawer = document.createElement('div');
  drawer.id    = 'stat-block-drawer';
  drawer.innerHTML = `
    <div id="stat-block-backdrop" onclick="window.closeStatBlock()"></div>
    <aside id="stat-block-panel" role="dialog" aria-label="Monster stat block">
      <button id="stat-block-close" onclick="window.closeStatBlock()" aria-label="Close">✕</button>
      <div id="stat-block-content">
        <div class="sb-loading">
          <div class="sb-shimmer" style="width:60%;height:28px;margin-bottom:8px;"></div>
          <div class="sb-shimmer" style="width:40%;height:16px;margin-bottom:20px;"></div>
          <div class="sb-shimmer" style="height:6px;margin-bottom:16px;"></div>
          <div class="sb-shimmer" style="width:80%;height:14px;margin-bottom:8px;"></div>
          <div class="sb-shimmer" style="width:70%;height:14px;margin-bottom:8px;"></div>
          <div class="sb-shimmer" style="width:75%;height:14px;"></div>
        </div>
      </div>
    </aside>`;

  // Inject CSS once
  if (!document.getElementById('stat-block-css')) {
    const style = document.createElement('style');
    style.id = 'stat-block-css';
    style.textContent = `
      #stat-block-backdrop {
        display:none; position:fixed; inset:0;
        background:rgba(0,0,0,0.55); z-index:4000;
        animation:sbFadeIn 0.15s ease;
      }
      #stat-block-panel {
        display:none; position:fixed; top:0; right:-420px;
        width:min(420px,100vw); height:100dvh;
        background:#1a1a2e; border-left:2px solid #8e44ad;
        z-index:4001; overflow-y:auto; padding:20px 18px 80px;
        transition:right 0.28s cubic-bezier(.4,0,.2,1);
        box-sizing:border-box;
      }
      #stat-block-panel.open { right:0; }
      #stat-block-close {
        position:absolute; top:12px; right:14px;
        background:none; border:none; color:#aaa;
        font-size:22px; cursor:pointer; line-height:1; padding:4px;
      }
      #stat-block-close:hover { color:#fff; }

      .sb-name {
        font-size:22px; font-weight:700;
        color:#e6b800; margin:0 0 2px; padding-right:36px;
      }
      .sb-meta {
        font-size:13px; color:#aaa; font-style:italic; margin-bottom:12px;
      }
      .sb-divider {
        height:4px; background:linear-gradient(90deg,#8e44ad,#c0392b);
        border-radius:2px; margin:10px 0;
      }
      .sb-scores {
        display:grid; grid-template-columns:repeat(6,1fr);
        gap:6px; text-align:center; margin:12px 0;
      }
      .sb-score-box { background:#16213e; border-radius:6px; padding:6px 2px; }
      .sb-score-label { font-size:10px; color:#8e44ad; font-weight:700; text-transform:uppercase; }
      .sb-score-val   { font-size:17px; font-weight:700; color:#e6b800; }
      .sb-score-mod   { font-size:11px; color:#ccc; }

      .sb-props { font-size:13px; line-height:1.7; color:#ddd; margin:10px 0; }
      .sb-props strong { color:#e6b800; }

      .sb-section { margin-top:14px; }
      .sb-section-title {
        font-size:14px; font-weight:700;
        color:#c0392b; border-bottom:1px solid #c0392b;
        padding-bottom:3px; margin-bottom:8px; letter-spacing:.5px;
        text-transform:uppercase;
      }
      .sb-trait  { font-size:13px; color:#ddd; margin-bottom:8px; }
      .sb-trait em { color:#e6b800; font-weight:700; font-style:normal; }

      .sb-action { font-size:13px; color:#ddd; margin-bottom:10px; }
      .sb-action em { color:#e6b800; font-weight:700; font-style:normal; }

      .sb-shimmer {
        background:linear-gradient(90deg,#16213e 25%,#1d2d50 50%,#16213e 75%);
        background-size:200% 100%; border-radius:4px;
        animation:sbShimmer 1.4s infinite;
      }
      @keyframes sbShimmer {
        0%{background-position:200% 0} 100%{background-position:-200% 0}
      }
      @keyframes sbFadeIn { from{opacity:0} to{opacity:1} }

      .sb-cr-badge {
        display:inline-block; background:#8e44ad;
        color:#fff; font-size:11px; font-weight:700;
        border-radius:4px; padding:2px 7px; margin-left:8px;
        vertical-align:middle;
      }
      .sb-open-link {
        display:inline-block; margin-top:14px;
        font-size:12px; color:#8e44ad; text-decoration:underline;
        cursor:pointer;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(drawer);
}

// ── Modifier helper ────────────────────────────────────────────────────────────

function mod(score) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : String(m);
}

// ── Renderer ───────────────────────────────────────────────────────────────────

function renderStatBlock(m) {
  const ac = Array.isArray(m.armor_class)
    ? `${m.armor_class[0]?.value ?? m.armor_class[0]} (${m.armor_class[0]?.type ?? ''})`
    : (m.armor_class || '—');

  const speed = typeof m.speed === 'object'
    ? Object.entries(m.speed).map(([k,v]) => k === 'walk' ? v : `${k} ${v}`).join(', ')
    : (m.speed || '—');

  const cr    = m.challenge_rating || '—';
  const xp    = m.xp ? `${m.xp.toLocaleString()} XP` : '';

  const saves = m.strength_save != null
    ? ['Str','Dex','Con','Int','Wis','Cha']
        .map((label,i) => {
          const keys = ['strength_save','dexterity_save','constitution_save',
                        'intelligence_save','wisdom_save','charisma_save'];
          const v = m[keys[i]];
          return v != null ? `${label} +${v}` : null;
        }).filter(Boolean).join(', ')
    : null;

  const skills = m.skills
    ? Object.entries(m.skills).map(([k,v]) => `${k} +${v}`).join(', ')
    : null;

  const traits  = m.special_abilities || [];
  const actions = m.actions           || [];
  const bonus   = m.bonus_actions      || [];
  const react   = m.reactions          || [];
  const legend  = m.legendary_actions  || [];

  const propsHTML = `
    <div class="sb-props">
      <div><strong>Armour Class</strong> ${ac}</div>
      <div><strong>Hit Points</strong>   ${m.hit_points || '—'} (${m.hit_dice || '—'})</div>
      <div><strong>Speed</strong>        ${speed}</div>
      ${saves  ? `<div><strong>Saving Throws</strong> ${saves}</div>` : ''}
      ${skills ? `<div><strong>Skills</strong> ${skills}</div>` : ''}
      ${m.damage_immunities       ? `<div><strong>Damage Immunities</strong>   ${m.damage_immunities}</div>`     : ''}
      ${m.damage_resistances      ? `<div><strong>Damage Resistances</strong>  ${m.damage_resistances}</div>`    : ''}
      ${m.damage_vulnerabilities  ? `<div><strong>Vulnerabilities</strong>     ${m.damage_vulnerabilities}</div>`  : ''}
      ${m.condition_immunities    ? `<div><strong>Condition Immunities</strong>${m.condition_immunities}</div>`  : ''}
      ${m.senses                  ? `<div><strong>Senses</strong>  ${m.senses}</div>`                            : ''}
      ${m.languages               ? `<div><strong>Languages</strong> ${m.languages}</div>`                       : ''}
      <div><strong>Challenge</strong> ${cr} ${xp}</div>
    </div>`;

  function renderActions(list) {
    return list.map(a => `
      <div class="sb-action">
        <em>${a.name}.</em>
        ${a.desc || ''}
      </div>`).join('');
  }

  const scoresHTML = ['strength','dexterity','constitution','intelligence','wisdom','charisma']
    .map(stat => {
      const val = m[stat] || 10;
      return `<div class="sb-score-box">
        <div class="sb-score-label">${stat.slice(0,3).toUpperCase()}</div>
        <div class="sb-score-val">${val}</div>
        <div class="sb-score-mod">${mod(val)}</div>
      </div>`;
    }).join('');

  return `
    <h2 class="sb-name">
      ${m.name || 'Unknown'}
      <span class="sb-cr-badge">CR ${cr}</span>
    </h2>
    <div class="sb-meta">${m.size || ''} ${m.type || ''}, ${m.alignment || 'unaligned'}</div>
    <div class="sb-divider"></div>
    ${propsHTML}
    <div class="sb-divider"></div>
    <div class="sb-scores">${scoresHTML}</div>
    <div class="sb-divider"></div>

    ${traits.length ? `
    <div class="sb-section">
      ${traits.map(t => `<div class="sb-trait"><em>${t.name}.</em> ${t.desc}</div>`).join('')}
    </div>` : ''}

    ${actions.length ? `
    <div class="sb-section">
      <div class="sb-section-title">Actions</div>
      ${renderActions(actions)}
    </div>` : ''}

    ${bonus.length ? `
    <div class="sb-section">
      <div class="sb-section-title">Bonus Actions</div>
      ${renderActions(bonus)}
    </div>` : ''}

    ${react.length ? `
    <div class="sb-section">
      <div class="sb-section-title">Reactions</div>
      ${renderActions(react)}
    </div>` : ''}

    ${legend.length ? `
    <div class="sb-section">
      <div class="sb-section-title">Legendary Actions</div>
      ${renderActions(legend)}
    </div>` : ''}

    <div class="sb-open-link" onclick="window.open('https://api.open5e.com/v1/monsters/${m.slug}/', '_blank')" title="View raw JSON">
      📖 Open5e source ↗
    </div>`;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Open drawer by Open5e slug — fetches from API + cache */
export async function openStatBlock(slug) {
  ensureDrawer();
  _showDrawer();

  // Show shimmer while loading
  document.getElementById('stat-block-content').innerHTML = `
    <div class="sb-loading">
      <div class="sb-shimmer" style="width:60%;height:28px;margin-bottom:8px;"></div>
      <div class="sb-shimmer" style="width:40%;height:16px;margin-bottom:20px;"></div>
      <div class="sb-shimmer" style="height:6px;margin-bottom:16px;"></div>
      <div class="sb-shimmer" style="width:80%;height:14px;margin-bottom:8px;"></div>
      <div class="sb-shimmer" style="width:70%;height:14px;margin-bottom:8px;"></div>
      <div class="sb-shimmer" style="width:75%;height:14px;margin-bottom:8px;"></div>
      <div class="sb-shimmer" style="width:85%;height:14px;"></div>
    </div>`;

  try {
    const m = await fetchMonsterBySlug(slug);
    document.getElementById('stat-block-content').innerHTML = renderStatBlock(m);
  } catch (err) {
    document.getElementById('stat-block-content').innerHTML =
      `<p style="color:#e74c3c;padding:20px">Failed to load stat block.<br>${err.message}</p>`;
  }
}

/** Open drawer with a pre-fetched monster object (no API call needed) */
export function openStatBlockData(m) {
  ensureDrawer();
  _showDrawer();
  document.getElementById('stat-block-content').innerHTML = renderStatBlock(m);
}

/** Close and hide the drawer */
export function closeStatBlock() {
  const panel = document.getElementById('stat-block-panel');
  const back  = document.getElementById('stat-block-backdrop');
  if (!panel) return;
  panel.classList.remove('open');
  setTimeout(() => {
    panel.style.display    = 'none';
    if (back) back.style.display = 'none';
  }, 300);
}

function _showDrawer() {
  const panel = document.getElementById('stat-block-panel');
  const back  = document.getElementById('stat-block-backdrop');
  panel.style.display = 'block';
  if (back) back.style.display = 'block';
  requestAnimationFrame(() => panel.classList.add('open'));
}

// Expose to window for inline onclick handlers
window.closeStatBlock = closeStatBlock;
