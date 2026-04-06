// ui.js v119 + W1/E5-B: SVG condition icons via Game-Icons.net
import { t } from "./i18n.js";
import { iconHTML } from "./icons.js";
import { attackFlavor, spellFlavor, healFlavor } from "./combatFlavor.js";
import { SKILL_ABILITIES, skillMod } from "./engine/combatUtils.js";
import { compute } from "./engine/charEngine.js";
import { iconImg, classIconImg } from './iconMap.js';
import { escapeHtml } from './core/sanitize.js';

// Backward-compat re-export so app.js `import { _esc } from "./ui.js"` keeps working
export { escapeHtml as _esc } from './core/sanitize.js';

let expandedCardId = null;
let _lastPlayersData = null;
let _openCharPanelName = null;

window.toggleCardExpand = (name) => {
    expandedCardId = expandedCardId === name ? null : name;
    document.querySelectorAll('.card-details').forEach(el => el.classList.remove('open'));
    document.querySelectorAll('.expand-btn').forEach(el => el.classList.remove('open'));
    if (expandedCardId) {
        const detailsObj = document.getElementById(`details-${name}`);
        const btnObj = document.getElementById(`expand-btn-${name}`);
        if (detailsObj) detailsObj.classList.add('open');
        if (btnObj) btnObj.classList.add('open');
        // Highlight token on map
        window._mapEng?.pixi?.highlightToken(name);
    }
};
// Double-click tracker item → pan map to that token
window.panToToken = (name) => {
    window._mapEng?.panToToken?.(name);
};

export function updateModeUI(activeMode) {
    const advBtn = document.getElementById('adv-btn');
    const disBtn = document.getElementById('dis-btn');
    if (!advBtn || !disBtn) return;
    [advBtn, disBtn].forEach(btn => {
        btn.classList.remove('active');
        btn.style.filter = '';
        btn.style.opacity = '';
        btn.style.border = '';
        btn.style.boxShadow = '';
    });
    // Update only the label span (preserve slot-icon span structure)
    const advLabel = advBtn.querySelector('.slot-label') || advBtn;
    const disLabel = disBtn.querySelector('.slot-label') || disBtn;
    advLabel.textContent = t('adv');
    disLabel.textContent = t('dis');
    if (activeMode === 'adv') {
        advBtn.classList.add('active');
        advLabel.textContent = t('adv_active');
    } else if (activeMode === 'dis') {
        disBtn.classList.add('active');
        disLabel.textContent = t('dis_active');
    }
    // Sync player toolbar dice popup ADV/DIS buttons
    const ptAdv = document.getElementById('pt-adv-btn');
    const ptDis = document.getElementById('pt-dis-btn');
    if (ptAdv) { ptAdv.classList.toggle('active', activeMode === 'adv'); ptAdv.textContent = activeMode === 'adv' ? t('adv_active') : t('adv'); }
    if (ptDis) { ptDis.classList.toggle('active', activeMode === 'dis'); ptDis.textContent = activeMode === 'dis' ? t('dis_active') : t('dis'); }
}

// ── D20 HP Orb SVG builder ──────────────────────────────────────
function buildHPOrb(hpPercent, name) {
    const pct      = Math.max(0, Math.min(100, hpPercent || 0));
    const fillY    = 100 - pct;
    const color    = pct > 60 ? '#38993e' : pct > 30 ? '#b87a14' : '#c02828';
    const safeName = name.replace(/[^a-z0-9]/gi, '_');
    return `<svg class="hp-orb" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="d20c_${safeName}">
      <polygon points="50,4 96,27 96,73 50,96 4,73 4,27"/>
    </clipPath>
  </defs>
  <polygon points="50,4 96,27 96,73 50,96 4,73 4,27" fill="#0a0402"/>
  <rect class="orb-liquid" x="0" y="${fillY}" width="100" height="${pct}"
        fill="${color}" clip-path="url(#d20c_${safeName})"
        style="transition:y .4s ease,height .4s ease,fill .4s ease;"/>
  <ellipse cx="50" cy="${fillY}" rx="28" ry="3.5"
           fill="rgba(255,255,255,0.14)" clip-path="url(#d20c_${safeName})"/>
  <line x1="50" y1="4"  x2="4"  y2="27" stroke="rgba(200,135,58,0.22)" stroke-width="0.6"/>
  <line x1="50" y1="4"  x2="96" y2="27" stroke="rgba(200,135,58,0.22)" stroke-width="0.6"/>
  <line x1="50" y1="4"  x2="50" y2="52" stroke="rgba(200,135,58,0.12)" stroke-width="0.6"/>
  <line x1="4"  y1="27" x2="50" y2="52" stroke="rgba(200,135,58,0.10)" stroke-width="0.5"/>
  <line x1="96" y1="27" x2="50" y2="52" stroke="rgba(200,135,58,0.10)" stroke-width="0.5"/>
  <polygon points="50,4 96,27 96,73 50,96 4,73 4,27"
           fill="none" stroke="rgba(200,135,58,0.75)" stroke-width="2"/>
  <text x="50" y="56" text-anchor="middle" fill="white"
        font-size="19" font-weight="900" font-family="serif">${Math.round(pct)}%</text>
</svg>`;
}

// ── D20 HUD glass liquid HP holder sync ─────────────────────────
window.updateHPGlobe = function(hpPercent, currentHp, maxHp) {
    const pct         = Math.max(0, Math.min(100, hpPercent || 0));
    const liquidRect  = document.getElementById('d20-liquid-rect');
    const waveEllipse = document.getElementById('d20-wave-ellipse');
    const hpText      = document.getElementById('d20-hp-text');
    const holder      = document.getElementById('d20-hp-holder');

    if (liquidRect) {
        const totalH = 138;
        const fillH  = totalH * pct / 100;
        const fillY  = totalH - fillH;
        liquidRect.setAttribute('y', fillY);
        liquidRect.setAttribute('height', fillH);
        if (waveEllipse) waveEllipse.setAttribute('cy', fillY);
        liquidRect.setAttribute('fill',
            pct < 30 ? 'rgba(255,30,30,0.92)' :
            pct < 60 ? 'rgba(200,80,20,0.90)' :
                       'rgba(200,30,30,0.88)');
    }
    if (hpText) {
        hpText.textContent = maxHp > 0 ? `${Math.round(currentHp)}/${maxHp}` : '—';
    }
    if (holder) {
        holder.classList.toggle('hp-critical', pct > 0 && pct < 30);
    }
    // Sync player toolbar HP display
    window.updatePlayerHP?.(pct, currentHp, maxHp);
    // Sync DM toolbar HP display (when DM rolls as a character)
    window.updateDMHP?.(pct, currentHp, maxHp);
};

// ── Portrait gallery renderer ────────────────────────────────────
function renderPortraitGallery(items, isDM, myCName, activeCombatantName) {
    const gallery = document.getElementById('portrait-gallery');
    if (!gallery) return;
    let html = '';
    items.forEach(i => {
        if (i.isHidden && !isDM && i.name !== myCName) return;
        const _saves    = i.deathSaves || { successes:[false,false,false], failures:[false,false,false] };
        const isDying   = (i.hp || 0) <= 0;
        const isDead    = _saves.dead || false;
        const hpPct     = (i.maxHp > 0) ? ((i.hp || 0) / i.maxHp * 100) : 100;
        const isActive  = (i.name === activeCombatantName);
        const safeName  = escapeHtml(i.name);
        const firstChar = (i.name || '?')[0].toUpperCase();
        const portraitEl = i.portrait
            ? `<img class="portrait-img" src="${i.portrait}" alt="${safeName}" loading="lazy">`
            : `<div class="portrait-img portrait-img--placeholder">${firstChar}</div>`;
        const statuses  = (i.statuses || []).slice(0, 2);
        const badges    = statuses.map(s => `<span class="portrait-status-badge">${s}</span>`).join('');
        const factionDot = { ally: '🟢', neutral: '🟡', foe: '🔴' }[i.faction] || '';
        const slotClass = [
            'portrait-slot',
            isActive  ? 'portrait-slot--active' : '',
            isDead    ? 'portrait-slot--dead'   : '',
        ].join(' ');
        html += `<div class="${slotClass}" onclick="window.openCharPanel('${safeName}')">
  <div class="portrait-ring">${portraitEl}</div>
  <div class="portrait-orb-wrap">${buildHPOrb(isDead ? 0 : hpPct, i.name)}</div>
  <div class="portrait-name">${factionDot} ${(i.name || '').split(' ')[0]}</div>
  ${badges}
</div>`;
    });
    gallery.innerHTML = html;

    // Update D20 HP holder for own character
    const myData = items.find(i => i.name === myCName);
    if (myData) {
        const hpPct = myData.maxHp > 0 ? (myData.hp / myData.maxHp * 100) : 100;
        window.updateHPGlobe(hpPct, myData.hp || 0, myData.maxHp || 0);
    }
    // Real-time refresh of open character quick panel (Bug 4)
    if (_openCharPanelName) {
        const freshItem = document.querySelector(`#init-list [data-cname="${CSS.escape(_openCharPanelName)}"]`);
        const content   = document.getElementById('char-panel-content');
        if (freshItem && content) {
            content.innerHTML = freshItem.innerHTML;
            content.querySelectorAll('.card-details').forEach(el => el.classList.add('open'));
            content.querySelectorAll('.expand-btn').forEach(el => { el.style.display = 'none'; });
        }
        const freshData = _lastPlayersData?.[_openCharPanelName];
        if (freshData) {
            const hpPct = freshData.maxHp > 0 ? (freshData.hp / freshData.maxHp * 100) : 100;
            window.updateHPGlobe(hpPct, freshData.hp || 0, freshData.maxHp || 0);
        }
    }
}

// ── Character quick-panel ────────────────────────────────────────
window.openCharPanel = function(name) {
    const panel   = document.getElementById('char-quick-panel');
    const content = document.getElementById('char-panel-content');
    if (!panel || !content) return;
    // Pull content from hidden #init-list tracker item
    const item = document.querySelector(`#init-list [data-cname="${CSS.escape(name)}"]`);
    content.innerHTML = item ? item.innerHTML : `<p style="color:rgba(200,135,58,0.6);padding:12px;">${name}</p>`;
    // Auto-expand all collapsible detail sections; hide the expand toggle (not needed here)
    content.querySelectorAll('.card-details').forEach(el => el.classList.add('open'));
    content.querySelectorAll('.expand-btn').forEach(el => { el.style.display = 'none'; });
    panel.classList.remove('char-quick-panel--hidden');
    panel.classList.add('char-quick-panel--open');
    _openCharPanelName = name;
    // Highlight token on map when card is opened
    window._mapEng?.pixi?.highlightToken(name);
    document.querySelectorAll('.portrait-slot').forEach(el => el.classList.remove('portrait-slot--selected'));
    const slot = document.querySelector(`.portrait-slot[onclick*="${CSS.escape(name)}"]`);
    if (slot) slot.classList.add('portrait-slot--selected');
    // Update D20 HP holder for clicked character
    const pData = _lastPlayersData?.[name];
    if (pData) {
        const hpPct = pData.maxHp > 0 ? (pData.hp / pData.maxHp * 100) : 100;
        window.updateHPGlobe(hpPct, pData.hp || 0, pData.maxHp || 0);
    }
};

window.closeCharPanel = function() {
    const panel = document.getElementById('char-quick-panel');
    if (!panel) return;
    panel.classList.remove('char-quick-panel--open');
    panel.classList.add('char-quick-panel--hidden');
    _openCharPanelName = null;
    document.querySelectorAll('.portrait-slot').forEach(el => el.classList.remove('portrait-slot--selected'));
};

window.toggleLogPanel = function() {
    const log = document.getElementById('log-container');
    if (!log) return;
    log.classList.toggle('log-panel--visible');
    const btn = document.getElementById('hud-log-toggle');
    if (btn) btn.classList.toggle('active-tool', log.classList.contains('log-panel--visible'));
};

// activeTurnIndex: index in sortedCombatants that is currently active
// sortedCombatants: the sorted array from app.js
export function updateInitiativeUI(data, currentUserRole, activeRoller = null, activeTurnIndex = null, sortedCombatants = []) {
    const list = document.getElementById('init-list');
    if (!list) return;

    // If data is null, re-use last known data (called from activeTurn listener)
    if (data !== null) _lastPlayersData = data;
    const playersData = _lastPlayersData;
    if (!playersData) return;

    list.innerHTML = "";
    const items = Object.keys(playersData).map(key => ({ name: key, ...playersData[key] }));
    const isDM = currentUserRole === 'dm';
    const myCName = localStorage.getItem('paradice_cName');

    // Get the active combatant's name
    const activeCombatantName = (activeTurnIndex !== null && sortedCombatants[activeTurnIndex])
        ? sortedCombatants[activeTurnIndex].name : null;

    // Sort: DM always first, then by initiative score descending
    items.sort((a, b) => {
        if (a.userRole === 'dm') return -1;
        if (b.userRole === 'dm') return 1;
        return (b.score || 0) - (a.score || 0);
    });
    let combatPos = 0;
    items.forEach((i, index) => {
        if (i.isHidden && !isDM && i.name !== myCName) return;
        if (i.score > 0 && i.userRole !== 'dm') combatPos++;

        const isActiveTurn = (i.name === activeCombatantName);
        const div = document.createElement('div');
        const isThisCharDM = i.userRole === 'dm';
        // Hoist death-save state so it's available for extraClasses
        const _saves   = i.deathSaves || { successes:[false,false,false], failures:[false,false,false] };
        const isDying  = (i.hp || 0) <= 0;
        const isStable = _saves.stable || false;
        const isDead   = _saves.dead   || false;
        const isOffline = (i.online === false) && (i.userRole === 'player'); // campaign mode
        let extraClasses = '';
        if (isThisCharDM) extraClasses = 'dm-item';
        if (activeRoller && activeRoller.cName === i.name) extraClasses += ' active-control';
        if (isActiveTurn) extraClasses += ' active-turn';
        if (isDying && !isStable && !isDead) extraClasses += ' dying';
        if (isOffline) extraClasses += ' offline';

        div.className = `tracker-item ${extraClasses}`;
        div.setAttribute('data-combatant', i.name);
        div.dataset.cname = i.name;
        if (isDM) div.draggable = true;

        const playerColor = i.pColor || '#e74c3c';
        div.style.borderRight = `4px solid ${playerColor}`;
        if (i.isHidden) { div.style.opacity = '0.6'; div.style.borderStyle = 'dashed'; div.style.background = 'rgba(0,0,0,0.7)'; }

        if (isThisCharDM) {
            div.innerHTML = `
                <div style="display:flex; gap:10px; align-items:center;">
                    <img src="${i.portrait || 'assets/logo.webp'}" class="char-portrait" style="border-color:#f1c40f;">
                    <div>
                        <div style="font-weight:900; color:#f1c40f; font-size:1.1em;">DM</div>
                        <div style="font-size:0.75em; opacity:0.8; color:white;">${i.pName}</div>
                    </div>
                </div>
            `;
        } else {
            // Prefer pre-attached _resolved; compute if missing (fallback for first render)
            // NPCs use raw data directly — charEngine.compute() doesn't handle NPC stats
            const resolved = (i.userRole !== 'npc' && i.type !== 'npc' && i._str != null)
                ? (i._resolved || compute(i))
                : i;
            const resolvedMaxHp = resolved.maxHp ?? i.maxHp;
            const hpPercent = (resolvedMaxHp > 0) ? ((i.hp || 0) / resolvedMaxHp * 100) : 100;
            if (!isDying && hpPercent < 30) div.classList.add('hp-low');
            else if (!isDying && hpPercent < 60) div.classList.add('hp-mid');
            const isOwner = myCName === i.name;
            const isNPC = i.userRole === 'npc';
            const isOpen = expandedCardId === i.name;
            const saves = _saves; // already computed above
            const deleteBtn = isDM ? `<button onclick="window.removeNPC('${escapeHtml(i.name)}')" style="background:none; border:none; color:#ff7675; cursor:pointer; font-size:16px; padding:0 3px;">${iconImg('🗑️','16px')}</button>` : '';
            const visibilityBtn = isDM ? `<button onclick="window.toggleVisibility('${escapeHtml(i.name)}', ${!!i.isHidden})" style="background:none; border:none; cursor:pointer; font-size:16px; padding:0 3px;">${i.isHidden ? iconImg('🙈','16px') : iconImg('👁️','16px')}</button>` : '';
            const impersonateBtn = isDM ? `<button onclick="window.impersonate('${escapeHtml(i.name)}')" style="background:none; border:none; color:#9b59b6; cursor:pointer; font-size:16px; padding:0 3px;">${iconImg('🎭','16px')}</button>` : '';
            const editNpcBtn = (isDM && isNPC) ? `<button onclick="window.editNPC('${escapeHtml(i.name)}')" title="Edit" style="background:none;border:none;color:#f39c12;cursor:pointer;font-size:16px;padding:0 3px;">${iconImg('✎','16px')}</button>` : '';
            const dupeNpcBtn = (isDM && isNPC) ? `<button onclick="window.duplicateNPC('${escapeHtml(i.name)}')" title="Duplicate" style="background:none;border:none;color:#3498db;cursor:pointer;font-size:16px;padding:0 3px;">${iconImg('📋','16px')}</button>` : '';
            // Only show status dot in campaign mode (when online field exists)
            const offlineDot = i.online === false ? `<span class="offline-dot" title="לא מחובר"></span>`
                             : i.online === true  ? `<span class="online-dot"  title="מחובר"></span>`
                             : '';

            const raceStr = i.race || "";
            const classStr = i.class || "";
            const hasHebrew = /[\u0590-\u05FF]/;
            const displayRace = hasHebrew.test(raceStr) ? raceStr : t("race_" + raceStr.toLowerCase());
            const displayClass = hasHebrew.test(classStr) ? classStr : t("class_" + classStr.toLowerCase());
            let subtext = isNPC ? `${iconImg('⚔️','14px')} ${i.class ? i.class : t("default_monster")}` : `${displayRace} ${displayClass}`;

            const canViewStats = isDM || isOwner;
            // Build custom actions buttons for the card
            let customAttacksHTML = '';
            const actions = i.customActions || (i.customAttacks?.map(a => ({
                name: a.name, hitType: a.hitType || 'melee', hitMod: a.bonus || 0,
                damageDice: (a.dmg||'').replace(/[+\-]\d+$/, ''), damageMult: 1,
                icon: a.hitType === 'always' ? iconImg('🎯','14px') : iconImg('⚔️','14px'),
                dc: a.dc || 0
            })) || []);
            if (actions.length > 0) {
                const hitIcons = { melee:iconImg('⚔️','14px'), ranged:iconImg('🏹','14px'), spell:iconImg('✨','14px'), always:iconImg('🎯','14px'), none:'—' };
                customAttacksHTML = actions.map(atk => {
                    const mult = parseInt(atk.damageMult) || 1;
                    const dmgStr = atk.damageDice
                        ? (mult > 1 ? atk.damageDice.replace(/^\d+/, n => String(parseInt(n)*mult)) : atk.damageDice)
                        : '';
                    const icon = atk.icon || hitIcons[atk.hitType||'melee'] || iconImg('⚔️','14px');
                    const hitBtn = atk.hitType === 'none' ? ''
                        : atk.hitType === 'always'
                            ? `<span style="font-size:10px; color:#7aff8a; padding:3px 8px; background:rgba(0,200,80,0.12); border:1px solid rgba(0,200,80,0.3); border-radius:5px;">${iconImg('🎯','14px')} ${atk.dc ? `DC ${atk.dc}` : 'Auto-hit'} ${escapeHtml(atk.name)}</span>`
                            : `<button class="macro-btn melee" onclick="window.rollMacro('${escapeHtml(i.name)}', '${escapeHtml(atk.name)}', ${parseInt(atk.hitMod)||0})">${icon} ${escapeHtml(atk.name)}</button>`;
                    const dmgBtn = dmgStr
                        ? `<button class="macro-btn" style="background:rgba(192,57,43,0.4); border-color:#c0392b;" onclick="window.rollDamageMacro('${escapeHtml(i.name)}', '${escapeHtml(atk.name)}', '${dmgStr}', 0)">${iconImg('🩸','14px')} ${dmgStr}</button>`
                        : '';
                    return `<div style="display:flex; gap:5px; margin-top:5px; align-items:center;">${hitBtn}${dmgBtn}</div>`;
                }).join('');
            }

            // Active turn badge
            const activeBadge = isActiveTurn ? `<span class="active-turn-badge">${iconImg('⚔️','14px')} NOW</span>` : '';
            // Concentration badge
            const concBadge = i.concentrating ? `<span class="conc-badge">${iconImg('🔮','14px')}</span>` : '';
            // Crit threshold badge (Champion lvl3+ crits on 19+, lvl15+ on 18+)
            const critBadge = (resolved?.critThreshold != null && resolved.critThreshold < 20)
                ? `<span class="crit-badge" title="Crits on ${resolved.critThreshold}+">${iconImg('⚔️','14px')}${resolved.critThreshold}+</span>`
                : '';
            // Portrait ring colour: gold=active, red=dying, default
            const portraitStyle = isActiveTurn
                ? 'border-color:#f1c40f; box-shadow:0 0 10px #f1c40f;'
                : isDying && !isStable
                    ? 'border-color:#e74c3c; box-shadow:0 0 8px rgba(231,76,60,0.6);'
                    : '';

            // ── HP / Death-saves block ──
            const hpBlock = isDying ? `
                <div class="death-saves-block" style="margin-top:8px;">
                    ${isStable ? `
                        <div class="ds-stable-badge">${iconImg('💚','14px')} STABLE</div>
                        ${(isDM||isOwner) ? `<button onclick="window.resetDeathSaves('${escapeHtml(i.name)}')" class="ds-reset-btn">↺ Reset</button>` : ''}
                    ` : isDead ? `
                        <div class="ds-dead-badge">${iconImg('💀','14px')} DEAD</div>
                        ${(isDM||isOwner) ? `<button onclick="window.resetDeathSaves('${escapeHtml(i.name)}')" class="ds-reset-btn">↺ Reset</button>` : ''}
                    ` : `
                        <div style="font-size:10px; color:#ff7675; font-weight:bold; margin-bottom:5px;">${iconImg('💀','14px')} Death Saves</div>
                        <div style="display:flex; gap:8px; align-items:center; justify-content:space-between;">
                            <div style="display:flex; align-items:center; gap:3px;">
                                <span style="font-size:9px; color:#2ecc71; margin-left:2px;">${iconImg('✔','12px')}</span>
                                ${saves.successes.map((s,idx) => `
                                    <button class="ds-btn ds-success ${s?'active':''}" onclick="window.toggleDeathSave('${escapeHtml(i.name)}','successes',${idx})" ${isDM||isOwner?'':' disabled'}></button>
                                `).join('')}
                            </div>
                            <div style="display:flex; align-items:center; gap:3px;">
                                <span style="font-size:9px; color:#e74c3c; margin-left:2px;">${iconImg('✖','12px')}</span>
                                ${saves.failures.map((f,idx) => `
                                    <button class="ds-btn ds-fail ${f?'active':''}" onclick="window.toggleDeathSave('${escapeHtml(i.name)}','failures',${idx})" ${isDM||isOwner?'':' disabled'}></button>
                                `).join('')}
                            </div>
                            ${(isDM||isOwner) ? `
                                <div class="hp-controls">
                                    <input type="number" id="hp-input-${i.name}" class="hp-amount-input" value="1" min="1">
                                    <button class="hp-edit-btn plus" onclick="window.changeHP('${escapeHtml(i.name)}', true)" title="Heal">+</button>
                                </div>
                            ` : ''}
                        </div>
                        ${(isDM||isOwner) ? `<button onclick="window.rollDeathSave('${escapeHtml(i.name)}')" style="margin-top:4px;width:100%;padding:4px;border-radius:4px;background:rgba(231,76,60,0.2);border:1px solid #e74c3c;color:#e74c3c;cursor:pointer;font-size:11px;">🎲 Roll Death Save</button>` : ''}
                    `}
                </div>
            ` : `
                <div style="margin-top:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-size:10px; font-weight:bold; color:${hpPercent > 30 ? '#2ecc71' : '#ff7675'}">
                            ${iconImg('❤️','14px')} ${i.hp}/${resolvedMaxHp}${resolved.tempHp > 0 ? ` <span style="color:#3498db; font-size:9px;">+${resolved.tempHp} tmp</span>` : ''}${isDM ? `<button onclick="window.editMaxHp('${escapeHtml(i.name)}',${resolvedMaxHp||0})" title="Edit Max HP" style="background:none;border:none;color:#888;cursor:pointer;font-size:9px;padding:0 2px;vertical-align:middle;">✎</button>` : ''}
                        </span>
                        ${(isDM||isOwner) ? `
                            <div class="hp-controls">
                                <input type="number" id="hp-input-${i.name}" class="hp-amount-input" value="1" min="1">
                                <button class="hp-edit-btn minus" onclick="window.changeHP('${escapeHtml(i.name)}', false)">-</button>
                                <button class="hp-edit-btn plus"  onclick="window.changeHP('${escapeHtml(i.name)}', true)">+</button>
                            </div>
                        ` : ''}
                    </div>
                    <div class="hp-bar-track" style="background:#333; height:6px; border-radius:3px; overflow:hidden; border:1px solid rgba(255,255,255,0.1); position:relative;">
                        <div class="hp-bar-fill" style="width:${hpPercent}%; height:100%; background:${hpPercent > 30 ? '#2ecc71' : '#e74c3c'}; transition:width 0.4s ease-out;"></div>
                        ${resolved.tempHp > 0 ? `<div style="position:absolute; right:0; top:0; width:${Math.min(25, resolved.tempHp / resolvedMaxHp * 100)}%; height:100%; background:#3498db; opacity:0.85;"></div>` : ''}
                    </div>
                </div>
            `;

            div.innerHTML = `
                <div style="display:flex; gap:10px; align-items:center; ${isDead?'opacity:0.55;':''}">
                    <div class="portrait-wrap">
                        <img src="${i.portrait || 'https://placehold.co/50x50/555/fff?text=?'}" class="char-portrait" style="${portraitStyle}">
                        ${offlineDot}
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:4px;">
                            <span class="char-name-label" style="font-weight:900; color:white; font-size:1.05em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                ${i.score > 0 && i.userRole !== 'dm' ? combatPos + '. ' : ''}${i.name}${isOffline ? ' <span style="color:#777;font-size:10px;font-weight:normal;">(לא מחובר)</span>' : ''}
                            </span>
                            <div style="display:flex; align-items:center; gap:2px; flex-shrink:0;">
                                ${activeBadge}${concBadge}${critBadge}
                                <span class="init-score">${i.score > 0 ? i.score : '--'}</span>
                                <button id="expand-btn-${i.name}" class="expand-btn ${isOpen ? 'open' : ''}" onclick="window.toggleCardExpand('${escapeHtml(i.name)}')">▼</button>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
                            <div style="font-size:0.7em; color:#f3e5ab; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${subtext}</div>
                            <div style="display:flex; align-items:center; gap:2px; flex-shrink:0;">${editNpcBtn}${dupeNpcBtn}${impersonateBtn}${visibilityBtn}${deleteBtn}</div>
                        </div>
                    </div>
                </div>
                ${hpBlock}
                <div class="status-container">
                    ${(i.statuses || []).map(s => {
                        const _SC={Poisoned:'#27ae60',Charmed:'#e91e8c',Unconscious:'#636e72',Frightened:'#e67e22',Paralyzed:'#f39c12',Restrained:'#8e44ad',Blinded:'#7f8c8d',Prone:'#c0392b',Stunned:'#d35400',Incapacitated:'#2c3e50',Invisible:'#3498db',Exhausted:'#95a5a6',Deafened:'#7f8c8d',Grappled:'#e74c3c',Raging:'#c0392b',Hasted:'#2ecc71',Blessed:'#f1c40f',Concentrating:'#9b59b6'};
                        const _SI={Poisoned:iconImg('🤢','13px'),Charmed:iconImg('💕','13px'),Unconscious:iconImg('💀','13px'),Frightened:iconImg('😨','13px'),Paralyzed:iconImg('⚡','13px'),Restrained:iconImg('🕸️','13px'),Blinded:iconImg('👁️','13px'),Prone:iconImg('🔻','13px'),Stunned:iconImg('💫','13px'),Incapacitated:iconImg('💤','13px'),Invisible:iconImg('👻','13px'),Exhausted:iconImg('😵','13px'),Deafened:iconImg('👂','13px'),Grappled:iconImg('🤼','13px'),Raging:iconImg('😤','13px'),Hasted:iconImg('🏃','13px'),Blessed:iconImg('✨','13px'),Concentrating:iconImg('🔮','13px')};
                        const _SD={Poisoned:'Disadvantage on attacks & ability checks',Charmed:'Cannot attack the charmer',Unconscious:'Incapacitated; auto-crit on melee ≤5ft',Frightened:'Disadvantage on attacks while source visible',Paralyzed:'Incapacitated; auto-crit on melee ≤5ft; fail STR/DEX saves',Restrained:'Speed 0; attackers have advantage vs you',Blinded:'Attackers have advantage; you have disadvantage',Prone:'Melee vs you: advantage; ranged vs you: disadvantage',Stunned:'Incapacitated; fail STR/DEX saves',Incapacitated:'Cannot take actions or reactions',Invisible:'Your attacks have advantage; others have disadvantage vs you',Exhausted:'Cumulative penalty (see Exhaustion rules)',Deafened:'Auto-fail hearing-based checks',Grappled:'Speed becomes 0',Raging:'Bonus damage; resistance to physical damage',Hasted:'Extra action; double speed; +2 AC',Blessed:'+1d4 to attack rolls and saving throws',Concentrating:'Maintaining a concentration spell'};
                        const col=_SC[s]||'#636e72', ico=_SI[s]||'';
                        const svgIcon = iconHTML(s, col, '13px');
                        const displayIcon = svgIcon || ico;
                        const tip = _SD[s] ? _SD[s] : s;
                        return `<span class="status-badge" title="${tip}" style="background:${col}22;border-color:${col}66;color:${col};display:inline-flex;align-items:center;gap:3px;">${displayIcon} ${s}</span>`;
                    }).join('')}
                    ${isDM ? `
                        <button onclick="toggleStatusPicker('${escapeHtml(i.name)}')" style="background:none; border:none; color:#f1c40f; cursor:pointer; font-size:14px; padding:0;">${iconImg('✨','14px')}+</button>
                        <button onclick="window.toggleConcentration('${escapeHtml(i.name)}')" title="Toggle Concentration" style="background:none; border:none; cursor:pointer; font-size:14px; padding:0; opacity:${i.concentrating?1:0.4};">${iconImg('🔮','14px')}</button>
                    ` : ''}
                </div>
                <div id="status-picker-${i.name}" style="display:none; position:absolute; background:#2c3e50; border:1px solid #444; padding:5px; border-radius:8px; z-index:100; right:0; top:20px; box-shadow:0 5px 15px rgba(0,0,0,0.5);">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
                        ${[
                            {n:'Poisoned',icon:iconImg('🤢','14px'),c:'#27ae60'},{n:'Charmed',icon:iconImg('💕','14px'),c:'#e91e8c'},
                            {n:'Unconscious',icon:iconImg('💀','14px'),c:'#636e72'},{n:'Frightened',icon:iconImg('😨','14px'),c:'#e67e22'},
                            {n:'Paralyzed',icon:iconImg('⚡','14px'),c:'#f39c12'},{n:'Restrained',icon:iconImg('🕸️','14px'),c:'#8e44ad'},
                            {n:'Blinded',icon:iconImg('👁️','14px'),c:'#7f8c8d'},{n:'Prone',icon:iconImg('🔻','14px'),c:'#c0392b'},
                            {n:'Stunned',icon:iconImg('💫','14px'),c:'#d35400'},{n:'Incapacitated',icon:iconImg('💤','14px'),c:'#2c3e50'},
                            {n:'Invisible',icon:iconImg('👻','14px'),c:'#3498db'},{n:'Exhausted',icon:iconImg('😵','14px'),c:'#95a5a6'},
                            {n:'Deafened',icon:iconImg('👂','14px'),c:'#7f8c8d'},{n:'Grappled',icon:iconImg('🤼','14px'),c:'#e74c3c'},
                            {n:'Raging',icon:iconImg('😤','14px'),c:'#c0392b'},{n:'Hasted',icon:iconImg('🏃','14px'),c:'#2ecc71'},
                            {n:'Blessed',icon:iconImg('✨','14px'),c:'#f1c40f'},{n:'Concentrating',icon:iconImg('🔮','14px'),c:'#9b59b6'}
                        ].map(c => {
                            const active = (i.statuses||[]).includes(c.n);
                            return `<button onclick="window.toggleStatus('${escapeHtml(i.name)}', '${c.n}'); document.getElementById('status-picker-${i.name}').style.display='none';"
                              title="${c.n}" style="font-size:11px; padding:4px 6px; background:${active ? c.c : 'rgba(255,255,255,0.06)'}; color:white; border:1px solid ${active ? c.c : 'rgba(255,255,255,0.1)'}; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:3px; transition:all 0.15s;">
                              <span>${c.icon}</span><span style="font-size:9px;font-weight:${active?'700':'400'}">${c.n}</span></button>`;
                        }).join('')}
                    </div>
                </div>
                <div id="details-${i.name}" class="card-details ${isOpen ? 'open' : ''}">
                    ${canViewStats ? `
                        <div class="stats-grid">
                            <div class="stat-box"><span>${t('card_defense')}</span>${iconImg('🛡️','14px')} ${resolved.ac ?? i.ac ?? 10}</div>
                            <div class="stat-box"><span>${t('card_speed')}</span>${iconImg('🏃','14px')} ${resolved.speed ?? i.speed ?? 30}</div>
                            <div class="stat-box"><span>${t('card_perc')}</span>${iconImg('👁️','14px')} ${resolved.pp ?? i.pp ?? 10}</div>
                            <div class="stat-box"><span>${t('card_init')}</span>${iconImg('⚡','14px')} ${resolved.initiative != null ? (resolved.initiative >= 0 ? '+'+resolved.initiative : resolved.initiative) : (i.initBonus >= 0 ? '+'+(i.initBonus||0) : i.initBonus)}</div>
                            <div class="stat-box" style="color:#e74c3c;"><span>${iconImg('⚔️','14px')} Hit</span>${(i.melee||0)>=0?'+':''}${i.melee||0}</div>
                            <div class="stat-box" style="color:#3498db;"><span>${iconImg('🏹','14px')} Hit</span>${(i.ranged||0)>=0?'+':''}${i.ranged||0}</div>
                            ${(resolved.spellAtk ?? i.spellAtkMod) != null ? `<div class="stat-box" style="color:#9b59b6;"><span>${iconImg('✨','14px')} Atk</span>+${resolved.spellAtk ?? i.spellAtkMod ?? 0}</div>` : ''}
                            ${resolved.spellDC ? `<div class="stat-box" style="color:#9b59b6;"><span>${iconImg('✨','14px')} DC</span>${resolved.spellDC}</div>` : ''}
                        </div>
                        ${[['ab_str',i._str],['ab_dex',i._dex],['ab_con',i._con],['ab_int',i._int],['ab_wis',i._wis],['ab_cha',i._cha]].some(([,v])=>v) ? `
                        <div class="card-section-label">${t('card_abilities_label')}</div>
                        <div class="ability-row">
                            ${[['ab_str',i._str,'STR'],['ab_dex',i._dex,'DEX'],['ab_con',i._con,'CON'],['ab_int',i._int,'INT'],['ab_wis',i._wis,'WIS'],['ab_cha',i._cha,'CHA']].map(([key,score,raw]) => {
                                if (!score) return '';
                                const mod = Math.floor((score - 10) / 2);
                                return `<button class="ability-btn" onclick="window.rollAbilityCheck('${escapeHtml(i.name)}','${raw}',${score})" title="${t(key)} check">
                                    <span class="ab-name">${t(key)}</span>
                                    <span class="ab-score">${score}</span>
                                    <span class="ab-mod">${mod >= 0 ? '+'+mod : mod}</span>
                                </button>`;
                            }).join('')}
                        </div>
                        <div style="margin-top:4px;">
                            <div class="card-section-label">${t('card_skills_label')}</div>
                            <div class="skills-grid">
                                ${Object.entries(SKILL_ABILITIES).sort().map(([skill, abil]) => {
                                    const mod = resolved.skills?.[skill] ?? skillMod(skill, i);
                                    const modStr = mod >= 0 ? '+'+mod : String(mod);
                                    const keyU = skill.replace(/\s+/g, '_');
                                    const skillVal = i.skills?.[skill] ?? i.skills?.[keyU];
                                    const isExpert = skillVal === 'expert';
                                    const isProf = isExpert || typeof skillVal === 'number' || !!skillVal;
                                    const dispName = t('skill_' + keyU);
                                    return `<button class="skill-btn${isExpert ? ' expert' : isProf ? ' prof' : ''}"
                                        onclick="window.rollSkillCheck('${escapeHtml(i.name)}','${skill}')"
                                        title="${dispName} (${t('ab_' + abil)})">
                                        <span class="sk-name">${dispName}</span>
                                        <span class="sk-mod">${modStr}</span>
                                    </button>`;
                                }).join('')}
                            </div>
                        </div>
                        <div style="margin-top:6px;">
                            <div class="card-section-label">${t('card_saves_label')}</div>
                            <div class="saves-row">
                                ${['str','dex','con','int','wis','cha'].map(ab => {
                                    const sVal = resolved.saves?.[ab] ?? Math.floor(((i['_'+ab]||10)-10)/2);
                                    const sProf = i.savingThrows?.[ab];
                                    return `<button class="save-chip${sProf?' prof':''}" onclick="window.rollSaveCheck('${escapeHtml(i.name)}','${ab.toUpperCase()}')" title="${ab.toUpperCase()} Save">${ab.toUpperCase()} ${sVal>=0?'+':''}${sVal}</button>`;
                                }).join('')}
                            </div>
                        </div>` : ''}
                        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.1);">
                            <div style="font-size:10px; color:#aaa; margin-bottom:6px;">${t('card_macros_title')}</div>
                            <!-- Combat modifier chips -->
                            <div style="display:flex; gap:5px; flex-wrap:wrap; margin-bottom:8px;">
                                <span class="combat-mod-chip">${iconImg('⚔️','14px')} ${(i.melee||0)>=0?'+':''}${i.melee||0}</span>
                                <span class="combat-mod-chip">${iconImg('🏹','14px')} ${(i.ranged||0)>=0?'+':''}${i.ranged||0}</span>
                                ${i.spellAtkMod != null ? `<span class="combat-mod-chip">${iconImg('✨','14px')} ${i.spellAtkMod>=0?'+':''}${i.spellAtkMod}</span>` : ''}
                                ${i.meleeDmgMod ? `<span class="combat-mod-chip">${iconImg('💪','14px')} ${i.meleeDmgMod>0?'+':''}${i.meleeDmgMod}</span>` : ''}
                                ${i.rangedDmgMod ? `<span class="combat-mod-chip">${iconImg('🎯','14px')} ${i.rangedDmgMod>0?'+':''}${i.rangedDmgMod}</span>` : ''}
                            </div>
                            <!-- Custom action macro buttons -->
                            <div style="display:flex; flex-direction:column; gap:4px;">
                                ${customAttacksHTML}
                            </div>
                            ${_renderMonsterActions(i, isDM)}
                        </div>
                        ${i.spellSlots && Object.keys(i.spellSlots.max || {}).length > 0 ? `
                        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.1);">
                            <div class="card-section-label" style="color:#9b59b6;">${iconImg('🔮','14px')} ${t('spell_slots')}</div>
                            <div class="spell-slots-grid">
                                ${Object.entries(i.spellSlots.max).sort(([a],[b]) => a-b).map(([lv, max]) => {
                                    const used = (i.spellSlots.used || {})[lv] || 0;
                                    const remaining = max - used;
                                    const pips = Array.from({length: max}, (_, idx) => {
                                        const isUsed = idx >= remaining;
                                        return `<span class="slot-pip ${isUsed ? 'used' : 'avail'}"></span>`;
                                    }).join('');
                                    return `
                                        <div class="spell-level-row">
                                            <span class="spell-level-label">Lv ${lv}</span>
                                            <div class="slot-pips">${pips}</div>
                                            <span class="slot-count">${remaining}/${max}</span>
                                            ${canViewStats ? `
                                                <button class="slot-btn use" onclick="window.useSpellSlot('${escapeHtml(i.name)}',${lv})" ${remaining<=0?'disabled':''} title="Use slot">–</button>
                                                <button class="slot-btn restore" onclick="window.restoreSpellSlot('${escapeHtml(i.name)}',${lv})" ${used<=0?'disabled':''} title="Restore slot">+</button>
                                            ` : ''}
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                            ${canViewStats ? `
                                <div style="display:flex;gap:4px;margin-top:4px;">
                                    <button onclick="window.longRest('${escapeHtml(i.name)}')" class="long-rest-btn">${iconImg('🌙','14px')} ${t('long_rest')}</button>
                                    ${isDM ? `<button onclick="window.editSpellSlots('${escapeHtml(i.name)}')" style="background:rgba(155,89,182,0.15);border:1px solid rgba(155,89,182,0.3);color:#9b59b6;cursor:pointer;font-size:10px;padding:4px 8px;border-radius:5px;">✎ Slots</button>` : ''}
                                </div>
                            ` : ''}
                        </div>
                        ` : canViewStats ? `
                        <div style="margin-top:8px; padding-top:8px; border-top:1px dashed rgba(255,255,255,0.1);">
                            <div style="display:flex;gap:4px;">
                                ${isDM ? `<button onclick="window.longRest('${escapeHtml(i.name)}')" class="long-rest-btn">${iconImg('🌙','14px')} ${t('long_rest')}</button>` : ''}
                                ${isDM ? `<button onclick="window.editSpellSlots('${escapeHtml(i.name)}')" style="background:rgba(155,89,182,0.15);border:1px solid rgba(155,89,182,0.3);color:#9b59b6;cursor:pointer;font-size:10px;padding:4px 8px;border-radius:5px;">✎ Slots</button>` : ''}
                            </div>
                        </div>
                        ` : ''}
                        ${(() => {
                            const subSlots = resolved?.subclassSpellSlots;
                            if (!subSlots || !canViewStats) return '';
                            const usedObj = (i.subclassSpellSlotsUsed || {});
                            return `<div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(155,89,182,0.2);">
                                <div class="card-section-label" style="color:#8e44ad;">${iconImg('⚔️','14px')}${iconImg('🔮','14px')} EK/AT Slots</div>
                                <div class="spell-slots-grid">
                                    ${Object.entries(subSlots).sort(([a],[b])=>a-b).map(([lv,max]) => {
                                        const used = usedObj[lv] || 0;
                                        const rem = max - used;
                                        const pips = Array.from({length:max},(_,idx) =>
                                            `<span class="slot-pip ${idx>=rem?'used':'avail'}"></span>`
                                        ).join('');
                                        return `<div class="spell-level-row">
                                            <span class="spell-level-label">Lv ${lv}</span>
                                            <div class="slot-pips">${pips}</div>
                                            <span class="slot-count">${rem}/${max}</span>
                                            ${canViewStats ? `
                                                <button class="slot-btn use" onclick="window.useSubclassSpellSlot('${escapeHtml(i.name)}',${lv})" ${rem<=0?'disabled':''} title="Use slot">–</button>
                                                <button class="slot-btn restore" onclick="window.restoreSubclassSpellSlot('${escapeHtml(i.name)}',${lv})" ${used<=0?'disabled':''} title="Restore slot">+</button>
                                            ` : ''}
                                        </div>`;
                                    }).join('')}
                                </div>
                            </div>`;
                        })()}
                        ${canViewStats ? (() => {
                            const spells = i.spellbook ? Object.values(i.spellbook) : [];
                            const hasSpells = spells.length > 0;
                            const addBtn = (isDM || isOwner) ? `<button onclick="window._spellAddTarget='${escapeHtml(i.name)}';window.openSpellPanel();" style="background:rgba(155,89,182,0.15);border:1px solid rgba(155,89,182,0.3);color:#9b59b6;cursor:pointer;font-size:10px;padding:3px 8px;border-radius:5px;margin-top:4px;">+ ${t('add_spell') || 'Add Spell'}</button>` : '';
                            if (!hasSpells) return addBtn ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed rgba(155,89,182,0.3);"><div style="font-size:10px;color:#9b59b6;font-weight:bold;margin-bottom:4px;">${iconImg('📖','14px')} Spellbook</div><div style="font-size:10px;color:#777;font-style:italic;margin-bottom:4px;">${t('no_spells') || 'No spells yet'}</div>${addBtn}</div>` : '';
                            return `<div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(155,89,182,0.3);">
                                <div style="font-size:10px; color:#9b59b6; font-weight:bold; margin-bottom:6px;">${iconImg('📖','14px')} Spellbook (${spells.length})</div>
                                <div style="display:flex; flex-direction:column; gap:3px;">
                                    ${spells.sort((a,b) => (a.level||0)-(b.level||0)).map(sp => `
                                        <div style="display:flex; align-items:center; gap:5px; padding:3px 5px; background:rgba(155,89,182,0.08); border-radius:5px; border:1px solid rgba(155,89,182,0.2);">
                                            <span style="font-size:10px; color:#9b59b6; font-weight:bold; min-width:14px;">${sp.level === 0 ? 'C' : sp.level}</span>
                                            <span style="font-size:11px; color:white; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${sp.name}">${t('spell_' + (sp.slug || '').replace(/[^a-z0-9-]/g, '-')) || sp.name}</span>
                                            <span style="font-size:9px; color:#888;">${sp.range || ''}</span>
                                            ${(isDM || isOwner) ? `<button onclick="window.removeSpellFromBook('${escapeHtml(i.name)}','${escapeHtml(sp.slug)}')" style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:11px;padding:0 2px;" title="Remove">${iconImg('✕','12px')}</button>` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                                ${addBtn}
                            </div>`;
                        })() : ''}
                        ${canViewStats && i.equipment ? (() => {
                            const eq = i.equipment;
                            const rows = [];
                            if (eq.armor) rows.push(`<div style="display:flex;align-items:center;gap:5px;padding:3px 5px;background:rgba(52,152,219,0.08);border-radius:5px;border:1px solid rgba(52,152,219,0.15);">${iconImg('🛡️','12px')} <span style="font-size:11px;color:white;flex:1;">${escapeHtml(eq.armor.name || t('card_armor'))}</span><span style="font-size:10px;color:#3498db;">AC ${eq.armor.baseAC || '?'}</span></div>`);
                            if (eq.shield) rows.push(`<div style="display:flex;align-items:center;gap:5px;padding:3px 5px;background:rgba(52,152,219,0.08);border-radius:5px;border:1px solid rgba(52,152,219,0.15);">${iconImg('🛡️','12px')} <span style="font-size:11px;color:white;flex:1;">${t('card_shield') || 'Shield'}</span><span style="font-size:10px;color:#3498db;">+${eq.shield.acBonus ?? 2}</span></div>`);
                            if (eq.mainHand) rows.push(`<div style="display:flex;align-items:center;gap:5px;padding:3px 5px;background:rgba(231,76,60,0.08);border-radius:5px;border:1px solid rgba(231,76,60,0.15);">${iconImg('⚔️','12px')} <span style="font-size:11px;color:white;">${escapeHtml(eq.mainHand.name || 'Weapon')}</span></div>`);
                            if (eq.ranged) rows.push(`<div style="display:flex;align-items:center;gap:5px;padding:3px 5px;background:rgba(231,76,60,0.08);border-radius:5px;border:1px solid rgba(231,76,60,0.15);">${iconImg('🏹','12px')} <span style="font-size:11px;color:white;">${escapeHtml(eq.ranged.name || 'Ranged')}</span></div>`);
                            if (eq.offHand && !eq.shield) rows.push(`<div style="display:flex;align-items:center;gap:5px;padding:3px 5px;background:rgba(231,76,60,0.08);border-radius:5px;border:1px solid rgba(231,76,60,0.15);">${iconImg('🗡️','12px')} <span style="font-size:11px;color:white;">${escapeHtml(eq.offHand.name || 'Off-hand')}</span></div>`);
                            if (!rows.length) return '';
                            return `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed rgba(52,152,219,0.3);">
                                <div style="font-size:10px;color:#3498db;font-weight:bold;margin-bottom:6px;">${iconImg('🎒','14px')} ${t('card_equipment') || 'Equipment'}</div>
                                <div style="display:flex;flex-direction:column;gap:3px;">${rows.join('')}</div>
                                ${i.loot ? `<div style="margin-top:4px;font-size:10px;color:#f1c40f;">${iconImg('💰','12px')} ${escapeHtml(String(i.loot))}</div>` : ''}
                            </div>`;
                        })() : ''}
                        ${canViewStats && isOwner ? _renderClassAbilities(i) : ''}
                        ${canViewStats && isOwner ? _renderWeaponActions(i) : ''}
                    ` : `
                        <div style="text-align:center; padding:10px 0; color:#888; font-style:italic; font-size:11px;">${t('hidden_data')}</div>
                    `}
                </div>
            `;
            if (isDead) div.style.background = "rgba(231,76,60,0.15)";
        }
        list.appendChild(div);
    });

    // ── Drag-to-reorder (DM only) ──────────────────────────────────────────
    if (isDM) {
        let _dragSrc = null;
        list.querySelectorAll('.tracker-item[draggable]').forEach(row => {
            row.addEventListener('dragstart', e => {
                _dragSrc = row;
                row.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'move';
            });
            row.addEventListener('dragend', () => {
                _dragSrc = null;
                list.querySelectorAll('.tracker-item').forEach(r => {
                    r.style.opacity = '';
                    r.style.borderTop = '';
                });
            });
            row.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                list.querySelectorAll('.tracker-item').forEach(r => r.style.borderTop = '');
                if (row !== _dragSrc) row.style.borderTop = '2px solid #f1c40f';
            });
            row.addEventListener('drop', e => {
                e.preventDefault();
                if (!_dragSrc || _dragSrc === row) return;
                const from = _dragSrc.dataset.combatant;
                const to   = row.dataset.combatant;
                window.reorderInitiative?.(from, to);
            });
        });
    }

    // Double-click any tracker item → pan map to that token
    list.querySelectorAll('.tracker-item').forEach(row => {
        row.addEventListener('dblclick', () => {
            const cn = row.dataset.cname;
            if (cn) window.panToToken(cn);
        });
    });

    // Render portrait gallery from same sorted items
    const sortedItems = items.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    renderPortraitGallery(sortedItems, isDM, myCName, activeCombatantName);
}

window.toggleStatusPicker = (name) => {
    const el = document.getElementById(`status-picker-${name}`);
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

// ── Monster full action lists (Open5e data) ─────────────────────────────────
function _renderMonsterActions(player, isDM) {
    if (!isDM) return '';
    const sections = [
        { key: 'actions',          label: 'Actions',           color: '#e74c3c' },
        { key: 'bonusActions',     label: 'Bonus Actions',     color: '#f39c12' },
        { key: 'reactions',        label: 'Reactions',         color: '#3498db' },
        { key: 'legendaryActions', label: 'Legendary Actions', color: '#9b59b6' },
        { key: 'specialAbilities', label: 'Special Abilities', color: '#2ecc71' },
    ];
    let html = '';
    for (const sec of sections) {
        const list = player[sec.key];
        if (!list || !list.length) continue;
        html += `<div style="margin-top:8px;">
            <div style="font-size:9px;font-weight:bold;color:${sec.color};margin-bottom:3px;cursor:pointer;"
                 onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
                ${sec.label} (${list.length}) ▾
            </div>
            <div style="display:none;font-size:10px;color:#ccc;">
                ${list.map(a => `<div style="margin-bottom:4px;padding:3px 5px;background:rgba(255,255,255,0.04);border-radius:4px;border-left:2px solid ${sec.color};">
                    <b style="color:white;">${escapeHtml(a.name)}</b>${a.attack_bonus != null ? ` <span style="color:${sec.color};">+${a.attack_bonus}</span>` : ''}${a.damage_dice ? ` <span style="color:#e67e22;">${a.damage_dice}</span>` : ''}
                    <div style="color:#999;font-size:9px;margin-top:1px;">${escapeHtml((a.desc || '').slice(0, 150))}${(a.desc || '').length > 150 ? '...' : ''}</div>
                </div>`).join('')}
            </div>
        </div>`;
    }
    return html;
}

// ── Resource pip row helper ───────────────────────────────────────────────────
function _pipRow(label, current, max, colorClass = '') {
    if (!max) return '';
    const pips = Array.from({length: max}, (_, idx) =>
        `<span class="resource-pip${idx < current ? ' filled' + (colorClass ? ' ' + colorClass : '') : ' empty'}"></span>`
    ).join('');
    return `<div class="resource-row">${label} (${current}/${max}) ${pips}</div>`;
}

// ── Class Abilities section for character card ────────────────────────────────
function _renderClassAbilities(player) {
    const cls = (player.class || '').toLowerCase();
    const cr  = player.classResources || {};
    const lvl = player.level || 1;
    const cn  = player.name;
    const resolved = player._resolved;

    // Build buttons based on class
    const btns = [];

    switch (cls) {
        case 'barbarian':
            if (cr.raging) {
                btns.push(`<button class="class-ability-btn active" onclick="window.useClassAbility('${escapeHtml(cn)}','endRage')">${iconImg('🔥','14px')} End Rage</button>`);
            } else {
                btns.push(`<button class="class-ability-btn${(cr.rageUses ?? 0) <= 0 ? ' disabled' : ''}" onclick="window.useClassAbility('${escapeHtml(cn)}','rage')" ${(cr.rageUses ?? 0) <= 0 ? 'disabled' : ''}>${iconImg('🔥','14px')} Rage (${cr.rageUses ?? 0})</button>`);
            }
            break;
        case 'fighter':
            btns.push(`<button class="class-ability-btn${(cr.secondWind ?? 0) <= 0 ? ' disabled' : ''}" onclick="window.useClassAbility('${escapeHtml(cn)}','secondWind')" ${(cr.secondWind ?? 0) <= 0 ? 'disabled' : ''}>${iconImg('💨','14px')} Second Wind (${cr.secondWind ?? 0})</button>`);
            if (lvl >= 2) btns.push(`<button class="class-ability-btn${(cr.actionSurge ?? 0) <= 0 ? ' disabled' : ''}" onclick="window.useClassAbility('${escapeHtml(cn)}','actionSurge')" ${(cr.actionSurge ?? 0) <= 0 ? 'disabled' : ''}>${iconImg('⚡','14px')} Action Surge (${cr.actionSurge ?? 0})</button>`);
            break;
        case 'rogue':
            btns.push(`<button class="class-ability-btn" onclick="window.useClassAbility('${escapeHtml(cn)}','hide')">${iconImg('🤫','14px')} Hide</button>`);
            break;
        case 'druid':
            if (cr.wildShapeActive) {
                btns.push(`<button class="class-ability-btn active" onclick="window.useClassAbility('${escapeHtml(cn)}','endWildShape')">${iconImg('🐾','14px')} End Wild Shape</button>`);
            } else {
                btns.push(`<button class="class-ability-btn${(cr.wildShapeUses ?? 0) <= 0 ? ' disabled' : ''}" onclick="window.useClassAbility('${escapeHtml(cn)}','wildShape')" ${(cr.wildShapeUses ?? 0) <= 0 ? 'disabled' : ''}>${iconImg('🐾','14px')} Wild Shape (${cr.wildShapeUses ?? 0})</button>`);
            }
            btns.push(`<button class="class-ability-btn" onclick="window.useClassAbility('${escapeHtml(cn)}','summonAnimal')">${iconImg('🐺','14px')} Summon Animal</button>`);
            break;
        case 'monk': {
            const ki = cr.kiPoints ?? 0;
            const kiMax = cr.maxKiPoints ?? lvl;
            btns.push(_pipRow(`${iconImg('🌀','14px')} Ki`, ki, kiMax));
            const noKi = ki <= 0;
            btns.push(`<button class="class-ability-btn${noKi||ki<2?' disabled':''}" onclick="window.useClassAbility('${escapeHtml(cn)}','flurryOfBlows')" ${noKi||ki<2?'disabled':''}>${iconImg('🥊','14px')} Flurry (2 ki)</button>`);
            btns.push(`<button class="class-ability-btn${noKi?' disabled':''}" onclick="window.useClassAbility('${escapeHtml(cn)}','patientDefense')" ${noKi?'disabled':''}>${iconImg('🛡️','14px')} Patient Defense (1 ki)</button>`);
            btns.push(`<button class="class-ability-btn${noKi?' disabled':''}" onclick="window.useClassAbility('${escapeHtml(cn)}','stepOfWind')" ${noKi?'disabled':''}>${iconImg('💨','14px')} Step of Wind (1 ki)</button>`);
            if (lvl >= 5) btns.push(`<button class="class-ability-btn${noKi?' disabled':''}" onclick="window.useClassAbility('${escapeHtml(cn)}','stunningStrike')" ${noKi?'disabled':''}>${iconImg('⚡','14px')} Stunning Strike (1 ki)</button>`);
            break;
        }
        case 'bard': {
            const bi = cr.bardicInspiration ?? 0;
            const biMax = cr.maxBardicInspiration ?? Math.max(1, Math.floor(((player._cha||10)-10)/2));
            btns.push(_pipRow(`${iconImg('🎵','14px')} Inspiration`, bi, biMax));
            btns.push(`<button class="class-ability-btn${bi <= 0 ? ' disabled' : ''}" onclick="window.useClassAbility('${escapeHtml(cn)}','bardicInspiration')" ${bi<=0?'disabled':''}>${iconImg('🎵','14px')} Give Inspiration</button>`);
            break;
        }
        case 'cleric': {
            const cd = cr.channelDivinity ?? 0;
            btns.push(`<button class="class-ability-btn${cd <= 0 ? ' disabled' : ''}" onclick="window.useClassAbility('${escapeHtml(cn)}','channelDivinity')" ${cd<=0?'disabled':''}>${iconImg('✨','14px')} Channel Divinity (${cd})</button>`);
            break;
        }
        case 'paladin': {
            const loh = cr.layOnHandsHp ?? (lvl * 5);
            btns.push(`<div class="resource-row">${iconImg('🙏','14px')} Lay on Hands: ${loh} HP</div>`);
            btns.push(`<button class="class-ability-btn${loh <= 0 ? ' disabled' : ''}" onclick="window.useClassAbility('${escapeHtml(cn)}','layOnHands')" ${loh<=0?'disabled':''}>${iconImg('🙏','14px')} Lay on Hands</button>`);
            const ds = cr.divineSense ?? (1 + Math.max(0, Math.floor(((player._cha||10)-10)/2)));
            btns.push(`<button class="class-ability-btn${ds <= 0 ? ' disabled' : ''}" onclick="window.useClassAbility('${escapeHtml(cn)}','divineSense')" ${ds<=0?'disabled':''}>${iconImg('👁️','14px')} Divine Sense (${ds})</button>`);
            break;
        }
        case 'ranger': {
            if (cr.huntersMark) btns.push(`<div class="resource-row">${iconImg('🎯','14px')} Hunter's Mark → ${cr.huntersMark}</div>`);
            btns.push(`<button class="class-ability-btn" onclick="window.useClassAbility('${escapeHtml(cn)}','huntersMark')">${iconImg('🎯','14px')} Hunter's Mark</button>`);
            break;
        }
        case 'warlock': {
            if (cr.hexTarget) btns.push(`<div class="resource-row">${iconImg('🔮','14px')} Hex → ${cr.hexTarget}</div>`);
            btns.push(`<button class="class-ability-btn" onclick="window.useClassAbility('${escapeHtml(cn)}','hex')">${iconImg('🔮','14px')} Hex</button>`);
            break;
        }
        case 'sorcerer': {
            const sp = cr.sorceryPoints ?? 0;
            const spMax = cr.maxSorceryPoints ?? lvl;
            btns.push(_pipRow(`${iconImg('💠','14px')} Sorcery Pts`, sp, spMax));
            break;
        }
        case 'wizard': {
            if (lvl >= 2) {
                const ar = cr.arcaneRecovery ?? 1;
                btns.push(`<button class="class-ability-btn${ar <= 0 ? ' disabled' : ''}" onclick="window.useClassAbility('${escapeHtml(cn)}','arcaneRecovery')" ${ar<=0?'disabled':''}>${iconImg('📚','14px')} Arcane Recovery (${ar})</button>`);
            }
            break;
        }
        default:
            break;
    }

    // Subclass resources (superiority dice, portent, tides of chaos, etc.)
    const subHtml = _renderSubclassResources(player, cr, resolved, lvl);

    if (!btns.length && !subHtml) return '';

    return `
        <details open class="class-ability-section" style="margin-top:8px;border-top:1px dashed rgba(200,128,58,0.3);padding-top:8px;">
            <summary style="font-size:10px; color:#c9aa71; font-weight:bold; cursor:pointer; user-select:none; letter-spacing:0.5px;">${iconImg('⚔️','14px')} CLASS ABILITIES</summary>
            <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:6px;">${btns.join('')}</div>
            ${subHtml}
        </details>
    `;
}

// ── Weapon attacks section for character card ─────────────────────────────────
function _renderWeaponActions(player) {
    const eq = player.equipment;
    if (!eq) return '';
    const lvl = player.level || 1;
    const pb = Math.ceil(lvl / 4) + 1;
    const strMod = Math.floor(((player._str || 10) - 10) / 2);
    const dexMod = Math.floor(((player._dex || 10) - 10) / 2);
    const cn = escapeHtml(player.name);
    const rows = [];

    if (eq.mainHand?.name) {
        const isFinesse = (eq.mainHand.properties || '').toLowerCase().includes('finesse');
        const mod = isFinesse ? Math.max(strMod, dexMod) : strMod;
        const hit = pb + mod;
        const dmg = eq.mainHand.damageDice || '1d6';
        rows.push(`<div style="display:flex;gap:4px;">
            <button class="class-ability-btn" onclick="window.rollMacro('${cn}','${escapeHtml(eq.mainHand.name)}',${hit})">${iconImg('⚔️','12px')} ${escapeHtml(eq.mainHand.name)} +${hit}</button>
            <button class="class-ability-btn" onclick="window.rollDamageMacro('${cn}','${escapeHtml(eq.mainHand.name)}','${dmg}',${mod})">${iconImg('💥','12px')} ${dmg}+${mod}</button>
        </div>`);
    }
    if (eq.ranged?.name) {
        const hit = pb + dexMod;
        const dmg = eq.ranged.damageDice || '1d6';
        rows.push(`<div style="display:flex;gap:4px;">
            <button class="class-ability-btn" onclick="window.rollMacro('${cn}','${escapeHtml(eq.ranged.name)}',${hit})">${iconImg('🏹','12px')} ${escapeHtml(eq.ranged.name)} +${hit}</button>
            <button class="class-ability-btn" onclick="window.rollDamageMacro('${cn}','${escapeHtml(eq.ranged.name)}','${dmg}',${dexMod})">${iconImg('💥','12px')} ${dmg}+${dexMod}</button>
        </div>`);
    }
    if (!rows.length) return '';
    return `
        <details style="margin-top:8px;border-top:1px dashed rgba(200,128,58,0.3);padding-top:8px;">
            <summary style="font-size:10px;color:#e74c3c;font-weight:bold;cursor:pointer;user-select:none;">${iconImg('⚔️','14px')} ATTACKS</summary>
            <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">${rows.join('')}</div>
        </details>
    `;
}

// ── Subclass resource display helper ─────────────────────────────────────────
function _renderSubclassResources(player, cr, resolved, lvl) {
    const cn = player.name;
    const lines = [];

    // Battle Master — superiority dice pips
    if (cr.superiorityDice && typeof cr.superiorityDice === 'object') {
        const sd = cr.superiorityDice;
        const sdRem = sd.remaining ?? 0;
        const sdTot = sd.total ?? 0;
        const sdDie = sd.die || 'd8';
        lines.push(_pipRow(`${iconImg('⚔️','14px')} SD ${sdDie}`, sdRem, sdTot, 'sd'));
    }

    // Portent dice (Divination Wizard)
    if (cr.portentDice && cr.portentDice.rolls) {
        const rolls = cr.portentDice.rolls;
        const used  = cr.portentDice.used || [];
        const diceHtml = rolls.map((r, idx) =>
            `<span class="portent-die${used.includes(idx) ? ' used' : ''}"
             onclick="window.usePortentDie('${escapeHtml(cn)}', ${idx})"
             title="${used.includes(idx) ? 'Used' : 'Click to replace a roll with this value'}">[${r}]</span>`
        ).join(' ');
        lines.push(`<div class="resource-row">${iconImg('🎲','14px')} Portent: ${diceHtml}</div>`);
    }

    // Tides of Chaos (Wild Magic Sorcerer)
    if (cr.tidesOfChaos != null) {
        const toc = cr.tidesOfChaos ?? 0;
        lines.push(`<button class="class-ability-btn${toc <= 0 ? ' disabled' : ''}" onclick="window.useClassAbility('${escapeHtml(cn)}','tidesOfChaos')" ${toc<=0?'disabled':''}>${iconImg('🌀','14px')} Tides of Chaos (${toc})</button>`);
        lines.push(`<button class="class-ability-btn" onclick="window.useClassAbility('${escapeHtml(cn)}','wildMagicSurge')">${iconImg('💥','14px')} Wild Magic Surge</button>`);
    }

    // Arcane Ward HP (Abjuration Wizard)
    if (cr.arcaneWardHp != null) {
        lines.push(`<div class="resource-row">${iconImg('🔵','14px')} Arcane Ward: ${cr.arcaneWardHp} HP</div>`);
    }

    // Transmutation Stone
    if (cr.transmutationStone != null) {
        lines.push(`<div class="resource-row">${iconImg('🪨','14px')} Transmutation Stone: ${cr.transmutationStone > 0 ? 'active' : 'inactive'}</div>`);
    }

    return lines.length ? `<div style="margin-top:4px; display:flex; flex-wrap:wrap; gap:5px;">${lines.join('')}</div>` : '';
}

export function addLogEntry(data, time, flavorText, isReplay = false) {
    const log = document.getElementById('roll-log');
    if (!log) return;
    const entry = document.createElement('div');
    const userColor = data.color || '#8B0000';
    const nameStyle = `color:${userColor};font-weight:900;`;

    const _hdr = (icon, label) =>
        `<div class="log-item-header"><span class="log-item-title" style="${nameStyle}">${icon} ${label}</span><span class="log-item-time">${time}</span></div>`;

    if (data.type === "CHAT") {
        entry.className = 'log-item log-chat';
        entry.style.borderLeftColor = userColor;
        entry.innerHTML = `${_hdr('', escapeHtml(data.cName || 'Player'))}
            <div class="log-item-body">${escapeHtml(data.msg || '')}</div>`;

    } else if (data.type === 'ATTACK') {
        const atkIcon = data.attackType === 'ranged' ? iconImg('🏹','14px') : iconImg('⚔️','14px');
        const advDisNote = data.advantage ? ' <span style="color:#27ae60;font-size:0.85em;">⬆ adv</span>' : data.disadvantage ? ' <span style="color:#e67e22;font-size:0.85em;">⬇ dis</span>' : '';
        const condNote = data.condNote ? `<span style="color:#aaa;font-size:0.82em;">${escapeHtml(data.condNote)}</span>` : '';
        let resultLine;
        if (data.crit) {
            const critModNote = data.dmgNote ? ` <span style="color:#aaa;font-size:0.85em;">(${escapeHtml(data.dmgNote)})</span>` : '';
            resultLine = `<span class="log-nat20">CRITICAL HIT!</span> ${atkIcon} <strong>${escapeHtml(data.cName)}</strong> strikes <strong>${escapeHtml(data.target)}</strong> (${iconImg('🎲','14px')}${data.rawRoll}+${data.total - data.rawRoll} vs AC ${data.ac}) for <span style="color:#e74c3c;font-weight:900;">${data.damage}</span> damage!${critModNote}`;
        } else if (data.miss) {
            resultLine = `${iconImg('💨','14px')} <strong>${escapeHtml(data.cName)}</strong> fumbles against <strong>${escapeHtml(data.target)}</strong> — automatic miss!`;
        } else if (data.hit) {
            const modNote = data.dmgNote ? ` <span style="color:#aaa;font-size:0.85em;">(${escapeHtml(data.dmgNote)})</span>` : '';
            resultLine = `${atkIcon} <strong>${escapeHtml(data.cName)}</strong> hits <strong>${escapeHtml(data.target)}</strong> (rolled ${data.total} vs AC ${data.ac})${advDisNote} for <span style="color:#e74c3c;font-weight:900;">${data.damage}</span> damage!${modNote} ${condNote}`;
        } else {
            resultLine = `${iconImg('💨','14px')} <strong>${escapeHtml(data.cName)}</strong> misses <strong>${escapeHtml(data.target)}</strong> (rolled ${data.total} vs AC ${data.ac})${advDisNote} ${condNote}`;
        }
        entry.className = `log-item ${data.crit ? 'log-atk-crit' : data.hit ? 'log-atk-hit' : 'log-atk-miss'}`;
        entry.innerHTML = `${_hdr(atkIcon, data.actionName ? escapeHtml(data.actionName) : 'Combat')}
            <div class="log-item-body">${resultLine}</div>
            <div class="log-item-flavor">${data.flavor || attackFlavor(data)}</div>`;

    } else if (data.type === 'SPELL') {
        const lvlTag = data.spellLevel === 0 ? 'Cantrip'
            : data.upcast ? `Level ${data.spellLevel} ↑${data.castLevel}`
            : `Level ${data.spellLevel}`;
        let resultLine;
        if (data.savingThrow) {
            const saved = data.savedHalf;
            resultLine = `${iconImg('🔮','14px')} <strong>${escapeHtml(data.cName)}</strong> casts <em>${escapeHtml(data.spellName)}</em> on <strong>${escapeHtml(data.target)}</strong> — ${escapeHtml(data.target)} ${saved ? `saves (${iconImg('🎲','14px')}${data.saveRoll} ≥ DC ${data.spellSaveDC}), takes <span style="color:#e74c3c;font-weight:900;">${data.damage}</span> (half)` : `fails (${iconImg('🎲','14px')}${data.saveRoll} &lt; DC ${data.spellSaveDC}), takes <span style="color:#e74c3c;font-weight:900;">${data.damage}</span> damage!`}`;
        } else if (data.dmgDice) {
            if (data.crit) resultLine = `<span class="log-nat20">CRITICAL!</span> ${iconImg('🔮','14px')} <strong>${escapeHtml(data.cName)}</strong> hits <strong>${escapeHtml(data.target)}</strong> with <em>${escapeHtml(data.spellName)}</em> for <span style="color:#e74c3c;font-weight:900;">${data.damage}</span> damage!`;
            else if (!data.hit) resultLine = `${iconImg('💨','14px')} <strong>${escapeHtml(data.cName)}</strong>'s <em>${escapeHtml(data.spellName)}</em> misses <strong>${escapeHtml(data.target)}</strong> (rolled ${data.total} vs AC ${data.ac})`;
            else resultLine = `${iconImg('🔮','14px')} <strong>${escapeHtml(data.cName)}</strong> hits <strong>${escapeHtml(data.target)}</strong> with <em>${escapeHtml(data.spellName)}</em> (rolled ${data.total} vs AC ${data.ac}) for <span style="color:#e74c3c;font-weight:900;">${data.damage}</span> damage!`;
        } else {
            resultLine = `${iconImg('🔮','14px')} <strong>${escapeHtml(data.cName)}</strong> casts <em>${escapeHtml(data.spellName)}</em> on <strong>${escapeHtml(data.target)}</strong>`;
        }
        entry.className = `log-item log-spell${data.crit ? ' crit' : !data.hit && data.dmgDice ? ' miss' : ''}`;
        entry.innerHTML = `${_hdr(iconImg('🔮','14px'), lvlTag)}
            <div class="log-item-body">${resultLine}</div>
            <div class="log-item-flavor spell">${data.flavor || spellFlavor(data)}</div>`;

    } else if (data.type === 'CONCENTRATION') {
        const savedText = data.saved
          ? `${iconImg('🔮','14px')} held! (${iconImg('🎲','14px')}${data.conRoll}+${data.conMod}=${data.conTotal} ≥ DC ${data.dc})`
          : `${iconImg('💔','14px')} broken! (${iconImg('🎲','14px')}${data.conRoll}+${data.conMod}=${data.conTotal} &lt; DC ${data.dc})`;
        entry.className = 'log-item log-conc';
        entry.style.borderLeftColor = data.saved ? '#2ecc71' : '#e74c3c';
        entry.innerHTML = `${_hdr(iconImg('🔮','14px'), 'Concentration')}
            <div class="log-item-body"><strong>${escapeHtml(data.cName)}</strong> CON save — ${savedText}</div>`;

    } else if (data.type === "DAMAGE" || data.type === "HEAL") {
        const isHeal = data.type === "HEAL";
        const hFlavorLine = data.flavor || (isHeal ? healFlavor(data.cName) : flavorText);
        const hResultLine = data.res != null
            ? `${isHeal ? iconImg('💚','14px') : iconImg('💔','14px')} <strong>${escapeHtml(data.cName)}</strong> ${isHeal ? 'healed' : 'took'} <span style="color:${isHeal?'#2ecc71':'#e74c3c'};font-weight:900;">${data.res}</span> HP${data.newHp != null ? ` → ${data.newHp}/${data.maxHp ?? '?'}` : ''}`
            : `${isHeal ? iconImg('💚','14px') : iconImg('💔','14px')} <strong>${escapeHtml(data.cName)}</strong>`;
        entry.className = `log-item ${isHeal ? 'log-heal' : 'log-damage'}`;
        entry.innerHTML = `${_hdr('', isHeal ? iconImg('💚','14px') + ' Heal' : iconImg('💔','14px') + ' Damage')}
            <div class="log-item-body">${hResultLine}</div>
            <div class="log-item-flavor ${isHeal ? 'heal' : ''}">${hFlavorLine}</div>`;

    } else if (data.type === 'FALL') {
        entry.className = 'log-item log-fall';
        entry.innerHTML = `${_hdr(iconImg('💀','14px'), 'Unconscious')}
            <div class="log-item-body"><strong>${escapeHtml(data.cName)}</strong> falls unconscious!</div>`;

    } else if (data.type === 'ABILITY_CHECK') {
        const total = data.total ?? (data.res + (data.mod || 0));
        const modStr = (data.mod || 0) >= 0 ? `+${data.mod||0}` : `${data.mod}`;
        const nat20 = data.res === 20, nat1 = data.res === 1;
        entry.className = 'log-item log-ability';
        entry.innerHTML = `${_hdr(iconImg('🎲','14px'), `${escapeHtml(data.ability)} Check`)}
            <div class="log-item-body">
                <strong>${escapeHtml(data.cName)}</strong> rolled
                <span class="${nat20?'log-nat20':nat1?'log-nat1':''}" style="font-size:1.2em;font-weight:900;">${total}</span>
                <small style="opacity:0.7;"> (${iconImg('🎲','14px')}${data.res}${modStr})</small>
            </div>`;

    } else if (data.type === 'SKILL') {
        const total = data.total ?? (data.res + (data.mod || 0));
        const modStr = (data.mod || 0) >= 0 ? `+${data.mod||0}` : `${data.mod}`;
        const nat20 = data.res === 20, nat1 = data.res === 1;
        const skillDisp = (data.skillName || '').replace(/(^|\s)\w/g, s => s.toUpperCase());
        entry.className = 'log-item log-skill';
        entry.innerHTML = `${_hdr(iconImg('🎲','14px'), escapeHtml(skillDisp))}
            <div class="log-item-body">
                <strong>${escapeHtml(data.cName)}</strong> rolled
                <span class="${nat20?'log-nat20':nat1?'log-nat1':''}" style="font-size:1.2em;font-weight:900;">${total}</span>
                <small style="opacity:0.7;"> (${iconImg('🎲','14px')}${data.res}${modStr})</small>
            </div>`;

    } else if (data.type === "STATUS") {
        entry.className = 'log-item log-status';
        entry.innerHTML = `<div class="log-item-body" style="font-weight:600;">${data.status}</div>`;

    } else if (data.type === 'WILD_MAGIC_SURGE') {
        entry.className = 'log-item log-wild-magic';
        entry.innerHTML = `${_hdr(iconImg('💥','14px'), t('wild_magic_surge_title') || 'Wild Magic Surge')}
            <div class="log-item-body"><strong>${escapeHtml(data.cName)}</strong>: <em>${escapeHtml(data.surgeText || '')}</em></div>`;

    } else if (data.type === 'MANEUVER') {
        entry.className = 'log-item log-maneuver';
        entry.innerHTML = `${_hdr(iconImg('⚔️','14px'), escapeHtml(data.maneuverName || 'Maneuver'))}
            <div class="log-item-body">
                ${data.saveDC ? `<span style="color:#f39c12;">Save DC ${data.saveDC}.</span> ` : ''}
                ${data.extraDamage ? `+<strong>${data.extraDamage}</strong> extra damage. ` : ''}
                ${data.note ? escapeHtml(data.note) : ''}
            </div>`;

    } else if (data.type === 'PORTENT') {
        entry.className = 'log-item log-portent';
        entry.innerHTML = `${_hdr(iconImg('🎲','14px'), t('portent_log_title') || 'Portent Used')}
            <div class="log-item-body"><strong>${escapeHtml(data.cName)}</strong> replaces a roll with portent die [<strong>${data.portentValue}</strong>]</div>`;

    } else if (data.type === 'RESOURCE') {
        entry.className = 'log-item log-resource';
        entry.innerHTML = `${_hdr(iconImg('✨','14px'), escapeHtml(data.resourceName || 'Ability Used'))}
            <div class="log-item-body">${escapeHtml(data.msg || '')}</div>`;

    } else {
        const modeLabel = data.mode === 'adv'
            ? `<span style="color:#27ae60;font-weight:bold;">(${t('adv')})</span>`
            : (data.mode === 'dis' ? `<span style="color:#c0392b;font-weight:bold;">(${t('dis')})</span>` : '');
        entry.className = 'log-item log-generic';
        entry.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="${nameStyle}">${data.cName || 'Player'} <small style="font-weight:600;color:#555;">(${data.pName || 'User'})</small></span>
                <span style="color:#666;font-size:11px;">[${time}]</span>
            </div>
            <div style="color:var(--ink);margin-top:4px;line-height:1.4;font-weight:600;">
                ${t('log_rolled')} <strong>${data.type.toUpperCase()}</strong> ${modeLabel} ${t('log_and_got')}
                <span class="${data.res===20?'log-nat20':data.res===1?'log-nat1':''}" style="font-size:1.3em;">
                    ${data.res + (data.mod || 0)}
                </span>
                <small style="opacity:0.8;font-weight:normal;"> (${data.res}${data.mod >= 0 ? '+' : ''}${data.mod})</small>
            </div>
            ${flavorText ? `<div style="color:#444;font-style:italic;font-size:12px;margin-top:6px;">"${flavorText}"</div>` : ""}`;
    }
    isReplay ? log.appendChild(entry) : log.prepend(entry);
    if (log.children.length > 30) log.removeChild(log.lastChild);
}

export function setDiceCooldown(isActive) {
    const buttons = document.querySelectorAll('.dice-btn, #init-btn, .special-roll-btn, .macro-btn');
    buttons.forEach(btn => {
        btn.disabled = isActive;
        btn.style.filter = isActive ? "grayscale(100%)" : "none";
        btn.style.opacity = isActive ? "0.4" : "1";
        btn.style.cursor = isActive ? "not-allowed" : "pointer";
        btn.style.pointerEvents = isActive ? "none" : "auto";
    });
}

// Show/hide short rest button based on player role (Sprint 16)
export function setShortRestVisible(visible) {
    ['short-rest-btn', 'short-rest-btn-2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? '' : 'none';
    });
}
