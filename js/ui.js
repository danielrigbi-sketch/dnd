// ui.js v119 + W1/E5-B: SVG condition icons via Game-Icons.net
import { t } from "./i18n.js";
import { iconHTML } from "./icons.js";
import { attackFlavor, spellFlavor, healFlavor } from "./combatFlavor.js";
import { SKILL_ABILITIES, skillMod } from "./engine/combatUtils.js";

let expandedCardId = null;
let _lastPlayersData = null;

/** Escape a value for safe interpolation inside a single-quoted JS onclick argument */
const _esc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

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
    // Reset both
    [advBtn, disBtn].forEach(btn => {
        btn.classList.remove('active');
        btn.style.filter = '';
        btn.style.opacity = '';
        btn.style.border = '';
        btn.style.boxShadow = '';
    });
    advBtn.textContent = '▲ Adv';
    disBtn.textContent = '▼ Dis';
    if (activeMode === 'adv') {
        advBtn.classList.add('active');
        advBtn.textContent = '▲ ADV ✓';
    } else if (activeMode === 'dis') {
        disBtn.classList.add('active');
        disBtn.textContent = '▼ DIS ✓';
    }
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
        const isOffline = (i.online === false) && (i.userRole === 'player'); // campaign mode
        let extraClasses = '';
        if (isThisCharDM) extraClasses = 'dm-item';
        if (activeRoller && activeRoller.cName === i.name) extraClasses += ' active-control';
        if (isActiveTurn) extraClasses += ' active-turn';
        if (isDying && !isStable && !isDead) extraClasses += ' dying';
        if (isOffline) extraClasses += ' offline';

        div.className = `tracker-item ${extraClasses}`;
        div.setAttribute('data-combatant', i.name);
        if (isDM) div.draggable = true;

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
            const deleteBtn = isDM ? `<button onclick="window.removeNPC('${_esc(i.name)}')" style="background:none; border:none; color:#ff7675; cursor:pointer; font-size:16px; padding:0 3px;">🗑️</button>` : '';
            const visibilityBtn = isDM ? `<button onclick="window.toggleVisibility('${_esc(i.name)}', ${!!i.isHidden})" style="background:none; border:none; cursor:pointer; font-size:16px; padding:0 3px;">${i.isHidden ? '🙈' : '👁️'}</button>` : '';
            const impersonateBtn = isDM ? `<button onclick="window.impersonate('${_esc(i.name)}')" style="background:none; border:none; color:#9b59b6; cursor:pointer; font-size:16px; padding:0 3px;">🎭</button>` : '';
            const offlineDot = isOffline ? `<span class="offline-dot" title="לא מחובר"></span>` : `<span class="online-dot" title="מחובר"></span>`;

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
                        <button class="macro-btn melee" onclick="window.rollMacro('${_esc(i.name)}', '${_esc(atk.name)}', ${atk.bonus})">⚔️ ${atk.name}</button>
                        ${atk.dmg ? `<button class="macro-btn" style="background:rgba(192,57,43,0.4); border-color:#c0392b;" onclick="window.rollDamageMacro('${_esc(i.name)}', '${_esc(atk.name)}', '${_esc(atk.dmg)}', ${atk.bonus})">🩸 ${atk.dmg}</button>` : ''}
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
                        ${(isDM||isOwner) ? `<button onclick="window.resetDeathSaves('${_esc(i.name)}')" class="ds-reset-btn">↺ Reset</button>` : ''}
                    ` : isDead ? `
                        <div class="ds-dead-badge">💀 DEAD</div>
                        ${(isDM||isOwner) ? `<button onclick="window.resetDeathSaves('${_esc(i.name)}')" class="ds-reset-btn">↺ Reset</button>` : ''}
                    ` : `
                        <div style="font-size:10px; color:#ff7675; font-weight:bold; margin-bottom:5px;">💀 Death Saves</div>
                        <div style="display:flex; gap:8px; align-items:center; justify-content:space-between;">
                            <div style="display:flex; align-items:center; gap:3px;">
                                <span style="font-size:9px; color:#2ecc71; margin-left:2px;">✔</span>
                                ${saves.successes.map((s,idx) => `
                                    <button class="ds-btn ds-success ${s?'active':''}" onclick="window.toggleDeathSave('${_esc(i.name)}','successes',${idx})" ${isDM||isOwner?'':' disabled'}></button>
                                `).join('')}
                            </div>
                            <div style="display:flex; align-items:center; gap:3px;">
                                <span style="font-size:9px; color:#e74c3c; margin-left:2px;">✖</span>
                                ${saves.failures.map((f,idx) => `
                                    <button class="ds-btn ds-fail ${f?'active':''}" onclick="window.toggleDeathSave('${_esc(i.name)}','failures',${idx})" ${isDM||isOwner?'':' disabled'}></button>
                                `).join('')}
                            </div>
                            ${(isDM||isOwner) ? `
                                <div class="hp-controls">
                                    <input type="number" id="hp-input-${i.name}" class="hp-amount-input" value="1" min="1">
                                    <button class="hp-edit-btn plus" onclick="window.changeHP('${_esc(i.name)}', true)" title="Heal">+</button>
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
                                <button class="hp-edit-btn minus" onclick="window.changeHP('${_esc(i.name)}', false)">-</button>
                                <button class="hp-edit-btn plus"  onclick="window.changeHP('${_esc(i.name)}', true)">+</button>
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
                    <div class="portrait-wrap">
                        <img src="${i.portrait || 'https://placehold.co/50x50/555/fff?text=?'}" class="char-portrait" style="${portraitStyle}">
                        ${offlineDot}
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:4px;">
                            <span style="font-weight:900; color:white; font-size:1.05em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                ${i.score > 0 ? (index + 1) + '. ' : ''}${i.name}${isOffline ? ' <span style="color:#777;font-size:10px;font-weight:normal;">(לא מחובר)</span>' : ''}
                            </span>
                            <div style="display:flex; align-items:center; gap:2px; flex-shrink:0;">
                                ${activeBadge}${concBadge}
                                <span class="init-score">${i.score > 0 ? i.score : '--'}</span>
                                <button id="expand-btn-${i.name}" class="expand-btn ${isOpen ? 'open' : ''}" onclick="window.toggleCardExpand('${_esc(i.name)}')">▼</button>
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
                        const _SD={Poisoned:'Disadvantage on attacks & ability checks',Charmed:'Cannot attack the charmer',Unconscious:'Incapacitated; auto-crit on melee ≤5ft',Frightened:'Disadvantage on attacks while source visible',Paralyzed:'Incapacitated; auto-crit on melee ≤5ft; fail STR/DEX saves',Restrained:'Speed 0; attackers have advantage vs you',Blinded:'Attackers have advantage; you have disadvantage',Prone:'Melee vs you: advantage; ranged vs you: disadvantage',Stunned:'Incapacitated; fail STR/DEX saves',Incapacitated:'Cannot take actions or reactions',Invisible:'Your attacks have advantage; others have disadvantage vs you',Exhausted:'Cumulative penalty (see Exhaustion rules)',Deafened:'Auto-fail hearing-based checks',Grappled:'Speed becomes 0',Raging:'Bonus damage; resistance to physical damage',Hasted:'Extra action; double speed; +2 AC',Blessed:'+1d4 to attack rolls and saving throws',Concentrating:'Maintaining a concentration spell'};
                        const col=_SC[s]||'#636e72', ico=_SI[s]||'';
                        const svgIcon = iconHTML(s, col, '13px');
                        const displayIcon = svgIcon || ico;
                        const tip = _SD[s] ? _SD[s] : s;
                        return `<span class="status-badge" title="${tip}" style="background:${col}22;border-color:${col}66;color:${col};display:inline-flex;align-items:center;gap:3px;">${displayIcon} ${s}</span>`;
                    }).join('')}
                    ${isDM ? `
                        <button onclick="toggleStatusPicker('${_esc(i.name)}')" style="background:none; border:none; color:#f1c40f; cursor:pointer; font-size:14px; padding:0;">✨+</button>
                        <button onclick="window.toggleConcentration('${_esc(i.name)}')" title="Toggle Concentration" style="background:none; border:none; cursor:pointer; font-size:14px; padding:0; opacity:${i.concentrating?1:0.4};">🔮</button>
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
                            return `<button onclick="window.toggleStatus('${_esc(i.name)}', '${c.n}'); document.getElementById('status-picker-${i.name}').style.display='none';"
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
                        ${[['STR',i._str],['DEX',i._dex],['CON',i._con],['INT',i._int],['WIS',i._wis],['CHA',i._cha]].some(([,v])=>v) ? `
                        <div class="card-section-label">Abilities</div>
                        <div class="ability-row">
                            ${[['STR',i._str],['DEX',i._dex],['CON',i._con],['INT',i._int],['WIS',i._wis],['CHA',i._cha]].map(([name,score]) => {
                                if (!score) return '';
                                const mod = Math.floor((score - 10) / 2);
                                return `<button class="ability-btn" onclick="window.rollAbilityCheck('${_esc(i.name)}','${name}',${score})" title="${name} check">
                                    <span class="ab-name">${name}</span>
                                    <span class="ab-score">${score}</span>
                                    <span class="ab-mod">${mod >= 0 ? '+'+mod : mod}</span>
                                </button>`;
                            }).join('')}
                        </div>
                        <div style="margin-top:4px;">
                            <div class="card-section-label">Skills</div>
                            <div class="skills-grid">
                                ${Object.entries(SKILL_ABILITIES).sort().map(([skill, abil]) => {
                                    const mod = skillMod(skill, i);
                                    const modStr = mod >= 0 ? '+'+mod : String(mod);
                                    const keyU = skill.replace(/\s+/g, '_');
                                    const skillVal = i.skills?.[skill] ?? i.skills?.[keyU];
                                    const isProf = typeof skillVal === 'number' || !!skillVal;
                                    const dispName = skill.replace(/(^|\s)\w/g, s => s.toUpperCase());
                                    return `<button class="skill-btn${isProf ? ' prof' : ''}"
                                        onclick="window.rollSkillCheck('${_esc(i.name)}','${skill}')"
                                        title="${dispName} (${abil.toUpperCase()})">
                                        <span class="sk-name">${dispName}</span>
                                        <span class="sk-mod">${modStr}</span>
                                    </button>`;
                                }).join('')}
                            </div>
                        </div>` : ''}
                        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.1);">
                            <div style="font-size:10px; color:#aaa; margin-bottom:5px;">${t('card_macros_title')}</div>
                            <div style="display:flex; flex-direction:column; gap:5px;">
                                <div style="display:flex; gap:5px;">
                                    <button class="macro-btn melee" onclick="window.rollMacro('${_esc(i.name)}', '${t('card_melee')}', ${i.melee || 0})">⚔️ ${t('macro_attack')}</button>
                                    <button class="macro-btn" style="background:rgba(192,57,43,0.4); border-color:#c0392b;" onclick="window.rollDamageMacro('${_esc(i.name)}', '${t('card_melee')}', '${_esc(i.meleeDmg || '1d6')}', ${i.melee || 0})">🩸 ${t('macro_dmg')} (${i.meleeDmg || '1d6'})</button>
                                </div>
                                <div style="display:flex; gap:5px;">
                                    <button class="macro-btn" onclick="window.rollMacro('${_esc(i.name)}', '${t('card_ranged')}', ${i.ranged || 0})">🏹 ${t('macro_attack')}</button>
                                    <button class="macro-btn" style="background:rgba(192,57,43,0.4); border-color:#c0392b;" onclick="window.rollDamageMacro('${_esc(i.name)}', '${t('card_ranged')}', '${_esc(i.rangedDmg || '1d6')}', ${i.ranged || 0})">🩸 ${t('macro_dmg')} (${i.rangedDmg || '1d6'})</button>
                                </div>
                                ${customAttacksHTML}
                            </div>
                        </div>
                        ${i.spellSlots && Object.keys(i.spellSlots.max || {}).length > 0 ? `
                        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.1);">
                            <div class="card-section-label" style="color:#9b59b6;">🔮 ${t('spell_slots')}</div>
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
                                                <button class="slot-btn use" onclick="window.useSpellSlot('${_esc(i.name)}',${lv})" ${remaining<=0?'disabled':''} title="Use slot">–</button>
                                                <button class="slot-btn restore" onclick="window.restoreSpellSlot('${_esc(i.name)}',${lv})" ${used<=0?'disabled':''} title="Restore slot">+</button>
                                            ` : ''}
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                            ${canViewStats ? `
                                <button onclick="window.longRest('${_esc(i.name)}')" class="long-rest-btn">🌙 ${t('long_rest')}</button>
                            ` : ''}
                        </div>
                        ` : canViewStats ? `
                        <div style="margin-top:8px; padding-top:8px; border-top:1px dashed rgba(255,255,255,0.1);">
                            ${isDM ? `<button onclick="window.longRest('${_esc(i.name)}')" class="long-rest-btn">🌙 ${t('long_rest')}</button>` : ''}
                        </div>
                        ` : ''}
                        ${canViewStats && i.spellbook && Object.keys(i.spellbook).length > 0 ? `
                        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(155,89,182,0.3);">
                            <div style="font-size:10px; color:#9b59b6; font-weight:bold; margin-bottom:6px;">📖 Spellbook (${Object.keys(i.spellbook).length})</div>
                            <div style="display:flex; flex-direction:column; gap:3px;">
                                ${Object.values(i.spellbook).sort((a,b) => (a.level||0)-(b.level||0)).map(sp => `
                                    <div style="display:flex; align-items:center; gap:5px; padding:3px 5px; background:rgba(155,89,182,0.08); border-radius:5px; border:1px solid rgba(155,89,182,0.2);">
                                        <span style="font-size:10px; color:#9b59b6; font-weight:bold; min-width:14px;">${sp.level === 0 ? 'C' : sp.level}</span>
                                        <span style="font-size:11px; color:white; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${sp.name}">${sp.name}</span>
                                        <span style="font-size:9px; color:#888;">${sp.range || ''}</span>
                                        ${(isDM || isOwner) ? `<button onclick="window.removeSpellFromBook('${_esc(i.name)}','${_esc(sp.slug)}')" style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:11px;padding:0 2px;" title="Remove">✕</button>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${canViewStats && isOwner ? _renderClassAbilities(i) : ''}
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
}

window.toggleStatusPicker = (name) => {
    const el = document.getElementById(`status-picker-${name}`);
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

function _escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Class Abilities section for character card ────────────────────────────────
function _renderClassAbilities(player) {
    const cls = (player.class || '').toLowerCase();
    const cr  = player.classResources || {};
    const lvl = player.level || 1;
    const cn  = player.name;

    // Build buttons based on class
    const btns = [];

    switch (cls) {
        case 'barbarian':
            if (cr.raging) {
                btns.push(`<button class="class-ability-btn active" onclick="window.useClassAbility('${_esc(cn)}','endRage')">🔥 End Rage</button>`);
            } else {
                btns.push(`<button class="class-ability-btn${(cr.rageUses ?? 0) <= 0 ? ' disabled' : ''}" onclick="window.useClassAbility('${_esc(cn)}','rage')" ${(cr.rageUses ?? 0) <= 0 ? 'disabled' : ''}>🔥 Rage (${cr.rageUses ?? 0})</button>`);
            }
            break;
        case 'fighter':
            btns.push(`<button class="class-ability-btn${(cr.secondWind ?? 0) <= 0 ? ' disabled' : ''}" onclick="window.useClassAbility('${_esc(cn)}','secondWind')" ${(cr.secondWind ?? 0) <= 0 ? 'disabled' : ''}>💨 Second Wind (${cr.secondWind ?? 0})</button>`);
            if (lvl >= 2) btns.push(`<button class="class-ability-btn${(cr.actionSurge ?? 0) <= 0 ? ' disabled' : ''}" onclick="window.useClassAbility('${_esc(cn)}','actionSurge')" ${(cr.actionSurge ?? 0) <= 0 ? 'disabled' : ''}>⚡ Action Surge (${cr.actionSurge ?? 0})</button>`);
            break;
        case 'rogue':
            btns.push(`<button class="class-ability-btn" onclick="window.useClassAbility('${_esc(cn)}','hide')">🤫 Hide</button>`);
            break;
        case 'druid':
            if (cr.wildShapeActive) {
                btns.push(`<button class="class-ability-btn active" onclick="window.useClassAbility('${_esc(cn)}','endWildShape')">🐾 End Wild Shape</button>`);
            } else {
                btns.push(`<button class="class-ability-btn${(cr.wildShapeUses ?? 0) <= 0 ? ' disabled' : ''}" onclick="window.useClassAbility('${_esc(cn)}','wildShape')" ${(cr.wildShapeUses ?? 0) <= 0 ? 'disabled' : ''}>🐾 Wild Shape (${cr.wildShapeUses ?? 0})</button>`);
            }
            btns.push(`<button class="class-ability-btn" onclick="window.useClassAbility('${_esc(cn)}','summonAnimal')">🐺 Summon Animal</button>`);
            break;
        default:
            return ''; // no self-ability section for other classes
    }

    if (!btns.length) return '';

    return `
        <div class="class-ability-section">
            <div style="font-size:10px; color:#c9aa71; font-weight:bold; margin-bottom:6px; letter-spacing:0.5px;">⚔ CLASS ABILITIES</div>
            <div style="display:flex; flex-wrap:wrap; gap:5px;">${btns.join('')}</div>
        </div>
    `;
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
        entry.innerHTML = `${_hdr('', _escapeHtml(data.cName || 'Player'))}
            <div class="log-item-body">${_escapeHtml(data.msg || '')}</div>`;

    } else if (data.type === 'ATTACK') {
        const atkIcon = data.attackType === 'ranged' ? '🏹' : '⚔️';
        const advDisNote = data.advantage ? ' <span style="color:#27ae60;font-size:0.85em;">⬆ adv</span>' : data.disadvantage ? ' <span style="color:#e67e22;font-size:0.85em;">⬇ dis</span>' : '';
        const condNote = data.condNote ? `<span style="color:#aaa;font-size:0.82em;">${_escapeHtml(data.condNote)}</span>` : '';
        let resultLine;
        if (data.crit) {
            const critModNote = data.dmgNote ? ` <span style="color:#aaa;font-size:0.85em;">(${_escapeHtml(data.dmgNote)})</span>` : '';
            resultLine = `<span class="log-nat20">CRITICAL HIT!</span> ${atkIcon} <strong>${_escapeHtml(data.cName)}</strong> strikes <strong>${_escapeHtml(data.target)}</strong> (🎲${data.rawRoll}+${data.total - data.rawRoll} vs AC ${data.ac}) for <span style="color:#e74c3c;font-weight:900;">${data.damage}</span> damage!${critModNote}`;
        } else if (data.miss) {
            resultLine = `💨 <strong>${_escapeHtml(data.cName)}</strong> fumbles against <strong>${_escapeHtml(data.target)}</strong> — automatic miss!`;
        } else if (data.hit) {
            const modNote = data.dmgNote ? ` <span style="color:#aaa;font-size:0.85em;">(${_escapeHtml(data.dmgNote)})</span>` : '';
            resultLine = `${atkIcon} <strong>${_escapeHtml(data.cName)}</strong> hits <strong>${_escapeHtml(data.target)}</strong> (rolled ${data.total} vs AC ${data.ac})${advDisNote} for <span style="color:#e74c3c;font-weight:900;">${data.damage}</span> damage!${modNote} ${condNote}`;
        } else {
            resultLine = `💨 <strong>${_escapeHtml(data.cName)}</strong> misses <strong>${_escapeHtml(data.target)}</strong> (rolled ${data.total} vs AC ${data.ac})${advDisNote} ${condNote}`;
        }
        entry.className = `log-item ${data.crit ? 'log-atk-crit' : data.hit ? 'log-atk-hit' : 'log-atk-miss'}`;
        entry.innerHTML = `${_hdr(atkIcon, data.actionName ? _escapeHtml(data.actionName) : 'Combat')}
            <div class="log-item-body">${resultLine}</div>
            <div class="log-item-flavor">${data.flavor || attackFlavor(data)}</div>`;

    } else if (data.type === 'SPELL') {
        const lvlTag = data.spellLevel === 0 ? 'Cantrip'
            : data.upcast ? `Level ${data.spellLevel} ↑${data.castLevel}`
            : `Level ${data.spellLevel}`;
        let resultLine;
        if (data.savingThrow) {
            const saved = data.savedHalf;
            resultLine = `🔮 <strong>${_escapeHtml(data.cName)}</strong> casts <em>${_escapeHtml(data.spellName)}</em> on <strong>${_escapeHtml(data.target)}</strong> — ${_escapeHtml(data.target)} ${saved ? `saves (🎲${data.saveRoll} ≥ DC ${data.spellSaveDC}), takes <span style="color:#e74c3c;font-weight:900;">${data.damage}</span> (half)` : `fails (🎲${data.saveRoll} &lt; DC ${data.spellSaveDC}), takes <span style="color:#e74c3c;font-weight:900;">${data.damage}</span> damage!`}`;
        } else if (data.dmgDice) {
            if (data.crit) resultLine = `<span class="log-nat20">CRITICAL!</span> 🔮 <strong>${_escapeHtml(data.cName)}</strong> hits <strong>${_escapeHtml(data.target)}</strong> with <em>${_escapeHtml(data.spellName)}</em> for <span style="color:#e74c3c;font-weight:900;">${data.damage}</span> damage!`;
            else if (!data.hit) resultLine = `💨 <strong>${_escapeHtml(data.cName)}</strong>'s <em>${_escapeHtml(data.spellName)}</em> misses <strong>${_escapeHtml(data.target)}</strong> (rolled ${data.total} vs AC ${data.ac})`;
            else resultLine = `🔮 <strong>${_escapeHtml(data.cName)}</strong> hits <strong>${_escapeHtml(data.target)}</strong> with <em>${_escapeHtml(data.spellName)}</em> (rolled ${data.total} vs AC ${data.ac}) for <span style="color:#e74c3c;font-weight:900;">${data.damage}</span> damage!`;
        } else {
            resultLine = `🔮 <strong>${_escapeHtml(data.cName)}</strong> casts <em>${_escapeHtml(data.spellName)}</em> on <strong>${_escapeHtml(data.target)}</strong>`;
        }
        entry.className = `log-item log-spell${data.crit ? ' crit' : !data.hit && data.dmgDice ? ' miss' : ''}`;
        entry.innerHTML = `${_hdr('🔮', lvlTag)}
            <div class="log-item-body">${resultLine}</div>
            <div class="log-item-flavor spell">${data.flavor || spellFlavor(data)}</div>`;

    } else if (data.type === 'CONCENTRATION') {
        const savedText = data.saved
          ? `🔮 held! (🎲${data.conRoll}+${data.conMod}=${data.conTotal} ≥ DC ${data.dc})`
          : `💔 broken! (🎲${data.conRoll}+${data.conMod}=${data.conTotal} &lt; DC ${data.dc})`;
        entry.className = 'log-item log-conc';
        entry.style.borderLeftColor = data.saved ? '#2ecc71' : '#e74c3c';
        entry.innerHTML = `${_hdr('🔮', 'Concentration')}
            <div class="log-item-body"><strong>${_escapeHtml(data.cName)}</strong> CON save — ${savedText}</div>`;

    } else if (data.type === "DAMAGE" || data.type === "HEAL") {
        const isHeal = data.type === "HEAL";
        const hFlavorLine = data.flavor || (isHeal ? healFlavor(data.cName) : flavorText);
        const hResultLine = data.res != null
            ? `${isHeal ? '💚' : '💔'} <strong>${_escapeHtml(data.cName)}</strong> ${isHeal ? 'healed' : 'took'} <span style="color:${isHeal?'#2ecc71':'#e74c3c'};font-weight:900;">${data.res}</span> HP${data.newHp != null ? ` → ${data.newHp}/${data.maxHp ?? '?'}` : ''}`
            : `${isHeal ? '💚' : '💔'} <strong>${_escapeHtml(data.cName)}</strong>`;
        entry.className = `log-item ${isHeal ? 'log-heal' : 'log-damage'}`;
        entry.innerHTML = `${_hdr('', isHeal ? '💚 Heal' : '💔 Damage')}
            <div class="log-item-body">${hResultLine}</div>
            <div class="log-item-flavor ${isHeal ? 'heal' : ''}">${hFlavorLine}</div>`;

    } else if (data.type === 'FALL') {
        entry.className = 'log-item log-fall';
        entry.innerHTML = `${_hdr('💀', 'Unconscious')}
            <div class="log-item-body"><strong>${_escapeHtml(data.cName)}</strong> falls unconscious!</div>`;

    } else if (data.type === 'ABILITY_CHECK') {
        const total = data.total ?? (data.res + (data.mod || 0));
        const modStr = (data.mod || 0) >= 0 ? `+${data.mod||0}` : `${data.mod}`;
        const nat20 = data.res === 20, nat1 = data.res === 1;
        entry.className = 'log-item log-ability';
        entry.innerHTML = `${_hdr('🎲', `${_escapeHtml(data.ability)} Check`)}
            <div class="log-item-body">
                <strong>${_escapeHtml(data.cName)}</strong> rolled
                <span class="${nat20?'log-nat20':nat1?'log-nat1':''}" style="font-size:1.2em;font-weight:900;">${total}</span>
                <small style="opacity:0.7;"> (🎲${data.res}${modStr})</small>
            </div>`;

    } else if (data.type === 'SKILL') {
        const total = data.total ?? (data.res + (data.mod || 0));
        const modStr = (data.mod || 0) >= 0 ? `+${data.mod||0}` : `${data.mod}`;
        const nat20 = data.res === 20, nat1 = data.res === 1;
        const skillDisp = (data.skillName || '').replace(/(^|\s)\w/g, s => s.toUpperCase());
        entry.className = 'log-item log-skill';
        entry.innerHTML = `${_hdr('🎲', _escapeHtml(skillDisp))}
            <div class="log-item-body">
                <strong>${_escapeHtml(data.cName)}</strong> rolled
                <span class="${nat20?'log-nat20':nat1?'log-nat1':''}" style="font-size:1.2em;font-weight:900;">${total}</span>
                <small style="opacity:0.7;"> (🎲${data.res}${modStr})</small>
            </div>`;

    } else if (data.type === "STATUS") {
        entry.className = 'log-item log-status';
        entry.innerHTML = `<div class="log-item-body" style="font-weight:600;">${data.status}</div>`;

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
