// ui.js v119
import { t } from "./i18n.js";

let expandedCardId = null;
let _lastPlayersData = null;

window.toggleCardExpand = (name) => {
    expandedCardId = expandedCardId === name ? null : name;
    document.querySelectorAll('.card-details').forEach(el => el.classList.remove('open'));
    document.querySelectorAll('.expand-btn').forEach(el => el.classList.remove('open'));
    if (expandedCardId) {
        const detailsObj = document.getElementById(`details-${name}`);
        const btnObj = document.getElementById(`expand-btn-${name}`);
        if (detailsObj) detailsObj.classList.add('open');
        if (btnObj) btnObj.classList.add('open');
    }
};

export function updateModeUI(activeMode) {
    const advBtn = document.getElementById('adv-btn');
    const disBtn = document.getElementById('dis-btn');
    if (!advBtn || !disBtn) return;
    [advBtn, disBtn].forEach(btn => {
        btn.style.filter = "grayscale(100%)";
        btn.style.opacity = "0.4";
        btn.style.border = "1px solid rgba(255,255,255,0.2)";
    });
    if (activeMode === 'adv') { advBtn.style.filter = "grayscale(0%)"; advBtn.style.opacity = "1"; advBtn.style.border = "2px solid white"; }
    else if (activeMode === 'dis') { disBtn.style.filter = "grayscale(0%)"; disBtn.style.opacity = "1"; disBtn.style.border = "2px solid white"; }
}

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
    const myCName = localStorage.getItem('critroll_cName');

    // Get the active combatant's name
    const activeCombatantName = (activeTurnIndex !== null && sortedCombatants[activeTurnIndex])
        ? sortedCombatants[activeTurnIndex].name : null;

    items.sort((a, b) => (b.score || 0) - (a.score || 0)).forEach((i, index) => {
        if (i.isHidden && !isDM && i.name !== myCName) return;

        const isActiveTurn = (i.name === activeCombatantName);
        const div = document.createElement('div');
        const isThisCharDM = i.userRole === 'dm';
        // Hoist death-save state so it's available for extraClasses
        const _saves   = i.deathSaves || { successes:[false,false,false], failures:[false,false,false] };
        const isDying  = (i.hp || 0) <= 0;
        const isStable = _saves.stable || false;
        const isDead   = _saves.dead   || false;
        let extraClasses = '';
        if (isThisCharDM) extraClasses = 'dm-item';
        if (activeRoller && activeRoller.cName === i.name) extraClasses += ' active-control';
        if (isActiveTurn) extraClasses += ' active-turn';
        if (isDying && !isStable && !isDead) extraClasses += ' dying';

        div.className = `tracker-item ${extraClasses}`;
        div.setAttribute('data-combatant', i.name);

        const playerColor = i.pColor || '#e74c3c';
        div.style.borderRight = `4px solid ${playerColor}`;
        if (i.isHidden) { div.style.opacity = '0.6'; div.style.borderStyle = 'dashed'; div.style.background = 'rgba(0,0,0,0.7)'; }

        if (isThisCharDM) {
            div.innerHTML = `
                <div style="display:flex; gap:10px; align-items:center;">
                    <img src="${i.portrait || 'assets/logo.png'}" class="char-portrait" style="border-color:#f1c40f;">
                    <div>
                        <div style="font-weight:900; color:#f1c40f; font-size:1.1em;">DM</div>
                        <div style="font-size:0.75em; opacity:0.8; color:white;">${i.pName}</div>
                    </div>
                </div>
            `;
        } else {
            const hpPercent = (i.hp / i.maxHp) * 100;
            const isOwner = myCName === i.name;
            const isNPC = i.userRole === 'npc';
            const isOpen = expandedCardId === i.name;
            const saves = _saves; // already computed above
            const deleteBtn = isDM ? `<button onclick="window.removeNPC('${i.name}')" style="background:none; border:none; color:#ff7675; cursor:pointer; font-size:16px; padding:0 3px;">🗑️</button>` : '';
            const visibilityBtn = isDM ? `<button onclick="window.toggleVisibility('${i.name}', ${!!i.isHidden})" style="background:none; border:none; cursor:pointer; font-size:16px; padding:0 3px;">${i.isHidden ? '🙈' : '👁️'}</button>` : '';
            const impersonateBtn = isDM ? `<button onclick="window.impersonate('${i.name}')" style="background:none; border:none; color:#9b59b6; cursor:pointer; font-size:16px; padding:0 3px;">🎭</button>` : '';

            const raceStr = i.race || "";
            const classStr = i.class || "";
            const hasHebrew = /[\u0590-\u05FF]/;
            const displayRace = hasHebrew.test(raceStr) ? raceStr : t("race_" + raceStr.toLowerCase());
            const displayClass = hasHebrew.test(classStr) ? classStr : t("class_" + classStr.toLowerCase());
            let subtext = isNPC ? `⚔️ ${i.class ? i.class : t("default_monster")}` : `${displayRace} ${displayClass}`;

            const canViewStats = isDM || isOwner;
            let customAttacksHTML = '';
            if (i.customAttacks && i.customAttacks.length > 0) {
                customAttacksHTML = i.customAttacks.map(atk => `
                    <div style="display:flex; gap:5px; margin-top:6px;">
                        <button class="macro-btn melee" onclick="window.rollMacro('${i.name}', '${atk.name}', ${atk.bonus})">⚔️ ${atk.name}</button>
                        ${atk.dmg ? `<button class="macro-btn" style="background:rgba(192,57,43,0.4); border-color:#c0392b;" onclick="window.rollDamageMacro('${i.name}', '${atk.name}', '${atk.dmg}', ${atk.bonus})">🩸 ${atk.dmg}</button>` : ''}
                    </div>
                `).join('');
            }

            // Active turn badge
            const activeBadge = isActiveTurn ? `<span class="active-turn-badge">⚔️ NOW</span>` : '';
            // Concentration badge
            const concBadge = i.concentrating ? `<span class="conc-badge">🔮</span>` : '';
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
                        <div class="ds-stable-badge">💚 STABLE</div>
                        ${(isDM||isOwner) ? `<button onclick="window.resetDeathSaves('${i.name}')" class="ds-reset-btn">↺ Reset</button>` : ''}
                    ` : isDead ? `
                        <div class="ds-dead-badge">💀 DEAD</div>
                        ${(isDM||isOwner) ? `<button onclick="window.resetDeathSaves('${i.name}')" class="ds-reset-btn">↺ Reset</button>` : ''}
                    ` : `
                        <div style="font-size:10px; color:#ff7675; font-weight:bold; margin-bottom:5px;">💀 Death Saves</div>
                        <div style="display:flex; gap:8px; align-items:center; justify-content:space-between;">
                            <div style="display:flex; align-items:center; gap:3px;">
                                <span style="font-size:9px; color:#2ecc71; margin-left:2px;">✔</span>
                                ${saves.successes.map((s,idx) => `
                                    <button class="ds-btn ds-success ${s?'active':''}" onclick="window.toggleDeathSave('${i.name}','successes',${idx})" ${isDM||isOwner?'':' disabled'}></button>
                                `).join('')}
                            </div>
                            <div style="display:flex; align-items:center; gap:3px;">
                                <span style="font-size:9px; color:#e74c3c; margin-left:2px;">✖</span>
                                ${saves.failures.map((f,idx) => `
                                    <button class="ds-btn ds-fail ${f?'active':''}" onclick="window.toggleDeathSave('${i.name}','failures',${idx})" ${isDM||isOwner?'':' disabled'}></button>
                                `).join('')}
                            </div>
                            ${(isDM||isOwner) ? `
                                <div class="hp-controls">
                                    <input type="number" id="hp-input-${i.name}" class="hp-amount-input" value="1" min="1">
                                    <button class="hp-edit-btn plus" onclick="window.changeHP('${i.name}', true)" title="Heal">+</button>
                                </div>
                            ` : ''}
                        </div>
                    `}
                </div>
            ` : `
                <div style="margin-top:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-size:10px; font-weight:bold; color:${hpPercent > 30 ? '#2ecc71' : '#ff7675'}">
                            ❤️ ${i.hp}/${i.maxHp}
                        </span>
                        ${(isDM||isOwner) ? `
                            <div class="hp-controls">
                                <input type="number" id="hp-input-${i.name}" class="hp-amount-input" value="1" min="1">
                                <button class="hp-edit-btn minus" onclick="window.changeHP('${i.name}', false)">-</button>
                                <button class="hp-edit-btn plus"  onclick="window.changeHP('${i.name}', true)">+</button>
                            </div>
                        ` : ''}
                    </div>
                    <div style="background:#333; height:6px; border-radius:3px; overflow:hidden; border:1px solid rgba(255,255,255,0.1);">
                        <div style="width:${hpPercent}%; height:100%; background:${hpPercent > 30 ? '#2ecc71' : '#e74c3c'}; transition:width 0.4s ease-out;"></div>
                    </div>
                </div>
            `;

            div.innerHTML = `
                <div style="display:flex; gap:10px; align-items:center; ${isDead?'opacity:0.55;':''}">
                    <img src="${i.portrait || 'https://via.placeholder.com/50'}" class="char-portrait" style="${portraitStyle}">
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:4px;">
                            <span style="font-weight:900; color:white; font-size:1.05em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                ${i.score > 0 ? (index + 1) + '. ' : ''}${i.name}
                            </span>
                            <div style="display:flex; align-items:center; gap:2px; flex-shrink:0;">
                                ${activeBadge}${concBadge}
                                <span class="init-score">${i.score > 0 ? i.score : '--'}</span>
                                <button id="expand-btn-${i.name}" class="expand-btn ${isOpen ? 'open' : ''}" onclick="window.toggleCardExpand('${i.name}')">▼</button>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
                            <div style="font-size:0.7em; color:#f3e5ab; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${subtext}</div>
                            <div style="display:flex; align-items:center; gap:2px; flex-shrink:0;">${impersonateBtn}${visibilityBtn}${deleteBtn}</div>
                        </div>
                    </div>
                </div>
                ${hpBlock}
                <div class="status-container">
                    ${(i.statuses || []).map(s => {
                        const _SC={Poisoned:'#27ae60',Charmed:'#e91e8c',Unconscious:'#636e72',Frightened:'#e67e22',Paralyzed:'#f39c12',Restrained:'#8e44ad',Blinded:'#7f8c8d',Prone:'#c0392b',Stunned:'#d35400',Incapacitated:'#2c3e50',Invisible:'#3498db',Exhausted:'#95a5a6',Deafened:'#7f8c8d',Grappled:'#e74c3c',Raging:'#c0392b',Hasted:'#2ecc71',Blessed:'#f1c40f',Concentrating:'#9b59b6'};
                        const _SI={Poisoned:'🤢',Charmed:'💕',Unconscious:'💀',Frightened:'😨',Paralyzed:'⚡',Restrained:'🕸️',Blinded:'👁️',Prone:'🔻',Stunned:'💫',Incapacitated:'💤',Invisible:'👻',Exhausted:'😵',Deafened:'👂',Grappled:'🤼',Raging:'😤',Hasted:'🏃',Blessed:'✨',Concentrating:'🔮'};
                        const col=_SC[s]||'#636e72', ico=_SI[s]||'';
                        return `<span class="status-badge" style="background:${col}22;border-color:${col}66;color:${col};">${ico} ${s}</span>`;
                    }).join('')}
                    ${isDM ? `
                        <button onclick="toggleStatusPicker('${i.name}')" style="background:none; border:none; color:#f1c40f; cursor:pointer; font-size:14px; padding:0;">✨+</button>
                        <button onclick="window.toggleConcentration('${i.name}')" title="Toggle Concentration" style="background:none; border:none; cursor:pointer; font-size:14px; padding:0; opacity:${i.concentrating?1:0.4};">🔮</button>
                    ` : ''}
                </div>
                <div id="status-picker-${i.name}" style="display:none; position:absolute; background:#2c3e50; border:1px solid #444; padding:5px; border-radius:8px; z-index:100; right:0; top:20px; box-shadow:0 5px 15px rgba(0,0,0,0.5);">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
                        ${[
                            {n:'Poisoned',icon:'🤢',c:'#27ae60'},{n:'Charmed',icon:'💕',c:'#e91e8c'},
                            {n:'Unconscious',icon:'💀',c:'#636e72'},{n:'Frightened',icon:'😨',c:'#e67e22'},
                            {n:'Paralyzed',icon:'⚡',c:'#f39c12'},{n:'Restrained',icon:'🕸️',c:'#8e44ad'},
                            {n:'Blinded',icon:'👁️',c:'#7f8c8d'},{n:'Prone',icon:'🔻',c:'#c0392b'},
                            {n:'Stunned',icon:'💫',c:'#d35400'},{n:'Incapacitated',icon:'💤',c:'#2c3e50'},
                            {n:'Invisible',icon:'👻',c:'#3498db'},{n:'Exhausted',icon:'😵',c:'#95a5a6'},
                            {n:'Deafened',icon:'👂',c:'#7f8c8d'},{n:'Grappled',icon:'🤼',c:'#e74c3c'},
                            {n:'Raging',icon:'😤',c:'#c0392b'},{n:'Hasted',icon:'🏃',c:'#2ecc71'},
                            {n:'Blessed',icon:'✨',c:'#f1c40f'},{n:'Concentrating',icon:'🔮',c:'#9b59b6'}
                        ].map(c => {
                            const active = (i.statuses||[]).includes(c.n);
                            return `<button onclick="window.toggleStatus('${i.name}', '${c.n}'); document.getElementById('status-picker-${i.name}').style.display='none';"
                              title="${c.n}" style="font-size:11px; padding:4px 6px; background:${active ? c.c : 'rgba(255,255,255,0.06)'}; color:white; border:1px solid ${active ? c.c : 'rgba(255,255,255,0.1)'}; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:3px; transition:all 0.15s;">
                              <span>${c.icon}</span><span style="font-size:9px;font-weight:${active?'700':'400'}">${c.n}</span></button>`;
                        }).join('')}
                    </div>
                </div>
                <div id="details-${i.name}" class="card-details ${isOpen ? 'open' : ''}">
                    ${canViewStats ? `
                        <div class="stats-grid">
                            <div class="stat-box"><span>${t('card_defense')}</span>🛡️ ${i.ac || 10}</div>
                            <div class="stat-box"><span>${t('card_speed')}</span>🏃 ${i.speed || 30}</div>
                            <div class="stat-box"><span>${t('card_perc')}</span>👁️ ${i.pp || 10}</div>
                            <div class="stat-box"><span>${t('card_init')}</span>⚡ ${i.initBonus >= 0 ? '+'+(i.initBonus||0) : i.initBonus}</div>
                            <div class="stat-box" style="color:#e74c3c;"><span>${t('card_melee')}</span>⚔️ ${i.melee >= 0 ? '+'+(i.melee||0) : i.melee}</div>
                            <div class="stat-box" style="color:#3498db;"><span>${t('card_ranged')}</span>🏹 ${i.ranged >= 0 ? '+'+(i.ranged||0) : i.ranged}</div>
                        </div>
                        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.1);">
                            <div style="font-size:10px; color:#aaa; margin-bottom:5px;">${t('card_macros_title')}</div>
                            <div style="display:flex; flex-direction:column; gap:5px;">
                                <div style="display:flex; gap:5px;">
                                    <button class="macro-btn melee" onclick="window.rollMacro('${i.name}', '${t('card_melee')}', ${i.melee || 0})">⚔️ ${t('macro_attack')}</button>
                                    <button class="macro-btn" style="background:rgba(192,57,43,0.4); border-color:#c0392b;" onclick="window.rollDamageMacro('${i.name}', '${t('card_melee')}', '${i.meleeDmg || '1d6'}', ${i.melee || 0})">🩸 ${t('macro_dmg')} (${i.meleeDmg || '1d6'})</button>
                                </div>
                                <div style="display:flex; gap:5px;">
                                    <button class="macro-btn" onclick="window.rollMacro('${i.name}', '${t('card_ranged')}', ${i.ranged || 0})">🏹 ${t('macro_attack')}</button>
                                    <button class="macro-btn" style="background:rgba(192,57,43,0.4); border-color:#c0392b;" onclick="window.rollDamageMacro('${i.name}', '${t('card_ranged')}', '${i.rangedDmg || '1d6'}', ${i.ranged || 0})">🩸 ${t('macro_dmg')} (${i.rangedDmg || '1d6'})</button>
                                </div>
                                ${customAttacksHTML}
                            </div>
                        </div>
                        ${i.spellSlots && Object.keys(i.spellSlots.max || {}).length > 0 ? `
                        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.1);">
                            <div style="font-size:10px; color:#9b59b6; font-weight:bold; margin-bottom:6px;">🔮 Spell Slots</div>
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
                                                <button class="slot-btn use" onclick="window.useSpellSlot('${i.name}',${lv})" ${remaining<=0?'disabled':''} title="Use slot">–</button>
                                                <button class="slot-btn restore" onclick="window.restoreSpellSlot('${i.name}',${lv})" ${used<=0?'disabled':''} title="Restore slot">+</button>
                                            ` : ''}
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                            ${canViewStats ? `
                                <button onclick="window.longRest('${i.name}')" class="long-rest-btn">🌙 Long Rest — Full Restore</button>
                            ` : ''}
                        </div>
                        ` : canViewStats ? `
                        <div style="margin-top:8px; padding-top:8px; border-top:1px dashed rgba(255,255,255,0.1);">
                            ${isDM ? `<button onclick="window.longRest('${i.name}')" class="long-rest-btn">🌙 Long Rest</button>` : ''}
                        </div>
                        ` : ''}
                    ` : `
                        <div style="text-align:center; padding:10px 0; color:#888; font-style:italic; font-size:11px;">${t('hidden_data')}</div>
                    `}
                </div>
            `;
            if (isDead) div.style.background = "rgba(231,76,60,0.15)";
        }
        list.appendChild(div);
    });
}

window.toggleStatusPicker = (name) => {
    const el = document.getElementById(`status-picker-${name}`);
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

export function addLogEntry(data, time, flavorText, isReplay = false) {
    const log = document.getElementById('roll-log');
    if (!log) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const userColor = data.color || '#8B0000';
    const nameStyle = `color:${userColor} !important; font-family:'Assistant',sans-serif !important; font-weight:900; font-size:1.1em; text-shadow:none;`;
    if (data.type === "DAMAGE" || data.type === "HEAL") {
        const isHeal = data.type === "HEAL";
        entry.innerHTML = `
            <div style="margin-bottom:12px; padding:10px; border-radius:8px; background:rgba(0,0,0,0.05); border-left:4px solid ${isHeal ? '#2ecc71' : '#e74c3c'};">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="${nameStyle}">${data.cName}</span>
                    <span style="color:#666; font-size:10px;">${time}</span>
                </div>
                <div style="color:var(--ink); margin-top:5px; font-size:0.9em; font-style:italic; font-weight:600;">"${flavorText}"</div>
            </div>`;
    } else if (data.type === "STATUS") {
        entry.innerHTML = `
            <div style="margin-bottom:12px; padding:8px; border-radius:8px; background:rgba(108,92,231,0.1); border:1px dashed #6c5ce7; text-align:center;">
                <span style="font-size:0.9em; color:var(--ink);"><strong>${data.cName}</strong>: <span style="color:#6c5ce7; font-weight:bold;">${data.status}</span></span>
            </div>`;
    } else {
        const modeLabel = data.mode === 'adv'
            ? `<span style="color:#27ae60; font-weight:bold;">(${t('adv')})</span>`
            : (data.mode === 'dis' ? `<span style="color:#c0392b; font-weight:bold;">(${t('dis')})</span>` : '');
        entry.innerHTML = `
            <div style="margin-bottom:15px; padding:12px; border-bottom:1px solid rgba(0,0,0,0.1); background:rgba(255,255,255,0.4); border-radius:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="${nameStyle}">${data.cName || 'Player'} <small style="font-weight:600; color:#555;">(${data.pName || 'User'})</small></span>
                    <span style="color:#666; font-size:11px;">[${time}]</span>
                </div>
                <div style="color:var(--ink); margin-top:4px; line-height:1.4; font-weight:600;">
                    ${t('log_rolled')} <strong>${data.type.toUpperCase()}</strong> ${modeLabel} ${t('log_and_got')}
                    <span style="color:${data.res === 20 ? '#b8860b' : (data.res === 1 ? '#c0392b' : 'var(--ink)')}; font-weight:900; font-size:1.3em;">
                        ${data.res + (data.mod || 0)}
                    </span>
                    <small style="opacity:0.8; font-weight:normal;"> (${data.res}${data.mod >= 0 ? '+' : ''}${data.mod})</small>
                </div>
                ${flavorText ? `<div style="color:#444; font-style:italic; font-size:12px; margin-top:6px;">"${flavorText}"</div>` : ""}
            </div>`;
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
