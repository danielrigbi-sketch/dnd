// ui.js

export function updateModeUI(activeMode) {
    const advBtn = document.getElementById('adv-btn');
    const disBtn = document.getElementById('dis-btn');
    if (!advBtn || !disBtn) return;

    [advBtn, disBtn].forEach(btn => {
        btn.style.filter = "grayscale(100%)";
        btn.style.opacity = "0.4";
        btn.style.border = "1px solid rgba(255,255,255,0.2)";
    });

    if (activeMode === 'adv') {
        advBtn.style.filter = "grayscale(0%)";
        advBtn.style.opacity = "1";
        advBtn.style.border = "2px solid white";
    } else if (activeMode === 'dis') {
        disBtn.style.filter = "grayscale(0%)";
        disBtn.style.opacity = "1";
        disBtn.style.border = "2px solid white";
    }
}

export function updateInitiativeUI(data, currentUserRole) {
    const list = document.getElementById('init-list');
    if (!list) return;

    list.innerHTML = "";
    if (!data) return;

    const items = Object.keys(data).map(key => ({ name: key, ...data[key] }));
    const isDM = currentUserRole === 'dm';
    const myCName = localStorage.getItem('critroll_cName');
    
    items.sort((a, b) => (b.score || 0) - (a.score || 0)).forEach((i, index) => {
        const div = document.createElement('div');
        const isThisCharDM = i.userRole === 'dm';
        div.className = `tracker-item ${isThisCharDM ? 'dm-item' : ''}`;
        
        const playerColor = i.pColor || '#e74c3c';
        div.style.borderRight = `4px solid ${playerColor}`;
        
        if (isThisCharDM) {
            div.innerHTML = `
                <div style="display:flex; gap:10px; align-items:center;">
                    <img src="${i.portrait || 'assets/logo.png'}" class="char-portrait" style="border-color:#f1c40f;">
                    <div>
                        <div style="font-weight:900; color:#f1c40f; font-size:1.1em;">שליט המבוך</div>
                        <div style="font-size:0.75em; opacity:0.8; color:white;">${i.pName}</div>
                    </div>
                </div>
            `;
        } else {
            const hpPercent = (i.hp / i.maxHp) * 100;
            const isDead = i.hp <= 0;
            const isOwner = myCName === i.name;

            div.innerHTML = `
                <div style="display:flex; gap:10px; align-items:center; ${isDead ? 'opacity: 0.6;' : ''}">
                    <img src="${i.portrait || 'https://via.placeholder.com/50'}" class="char-portrait">
                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:900; color:white; font-size:1.1em;">
                                ${i.score > 0 ? (index + 1) + '. ' : ''}${i.name}
                            </span>
                            <span class="init-score">${i.score > 0 ? i.score : '--'}</span>
                        </div>
                        <div style="font-size:0.7em; color:#f3e5ab; margin-top:-2px;">
                            ${i.race || ''} ${i.class || ''} | 🛡️ ${i.ac || '10'} | 🏃 ${i.speed || '30'} | 👁️ ${i.pp || '10'}
                        </div>
                    </div>
                </div>

                <div style="margin-top:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-size:10px; font-weight:bold; color:${hpPercent > 30 ? '#2ecc71' : '#ff7675'}">
                            ❤️ ${i.hp}/${i.maxHp}
                        </span>
                        ${(isDM || isOwner) ? `
                            <div class="hp-controls">
                                <input type="number" id="hp-input-${i.name}" class="hp-amount-input" value="1" min="1">
                                <button class="hp-edit-btn minus" onclick="window.changeHP('${i.name}', false)">-</button>
                                <button class="hp-edit-btn plus" onclick="window.changeHP('${i.name}', true)">+</button>
                            </div>
                        ` : ''}
                    </div>
                    <div style="background:#333; height:6px; border-radius:3px; overflow:hidden; border:1px solid rgba(255,255,255,0.1);">
                        <div style="width:${hpPercent}%; height:100%; background:${hpPercent > 30 ? '#2ecc71' : '#e74c3c'}; transition: width 0.4s ease-out;"></div>
                    </div>
                </div>

                <div class="status-container">
                    ${(i.statuses || []).map(s => `<span class="status-badge" style="background:#636e72">${s}</span>`).join('')}
                    ${isDM ? `<button onclick="toggleStatusPicker('${i.name}')" style="background:none; border:none; color:#f1c40f; cursor:pointer; font-size:14px; padding:0;">✨+</button>` : ''}
                </div>

                <div id="status-picker-${i.name}" style="display:none; position:absolute; background:#2c3e50; border:1px solid #444; padding:5px; border-radius:8px; z-index:100; right:0; top:20px; box-shadow:0 5px 15px rgba(0,0,0,0.5);">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px;">
                        ${['מורעל', 'מוקסם', 'מעולף', 'מפוחד', 'משותק', 'מרוסן', 'עיוור', 'מוטה', 'המום'].map(s => 
                            `<button onclick="window.toggleStatus('${i.name}', '${s}'); this.parentElement.parentElement.style.display='none';" style="font-size:10px; padding:3px; background:#34495e; color:white; border:none; border-radius:4px; cursor:pointer;">${s}</button>`
                        ).join('')}
                    </div>
                </div>
            `;
            if (isDead) div.style.background = "rgba(231, 76, 60, 0.15)";
        }
        list.appendChild(div);
    });
}

window.toggleStatusPicker = (name) => {
    const el = document.getElementById(`status-picker-${name}`);
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

export function addLogEntry(data, time, flavorText) {
    const log = document.getElementById('roll-log');
    if (!log) return;

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    const userColor = data.color || '#8B0000';
    const nameStyle = `color: ${userColor} !important; font-family: 'Assistant', sans-serif !important; font-weight: 900; font-size: 1.1em; text-shadow: none;`;

    if (data.type === "DAMAGE" || data.type === "HEAL") {
        const isHeal = data.type === "HEAL";
        entry.innerHTML = `
            <div style="margin-bottom: 12px; padding: 10px; border-radius: 8px; background: rgba(0,0,0,0.05); border-left: 4px solid ${isHeal ? '#2ecc71' : '#e74c3c'};">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="${nameStyle}">${data.cName}</span>
                    <span style="color: #666; font-size: 10px;">${time}</span>
                </div>
                <div style="color: var(--ink); margin-top: 5px; font-size: 0.9em; font-style: italic; font-weight: 600;">"${flavorText}"</div>
            </div>
        `;
    } else if (data.type === "STATUS") {
        entry.innerHTML = `
            <div style="margin-bottom: 12px; padding: 8px; border-radius: 8px; background: rgba(108, 92, 231, 0.1); border: 1px dashed #6c5ce7; text-align:center;">
                <span style="font-size:0.9em; color: var(--ink);">הסטטוס של <strong>${data.cName}</strong> עודכן ל: <span style="color:#6c5ce7; font-weight:bold;">${data.status}</span></span>
            </div>
        `;
    } else {
        const modeLabel = data.mode === 'adv' ? '<span style="color:#27ae60; font-weight:bold;">(יתרון)</span>' : (data.mode === 'dis' ? '<span style="color:#c0392b; font-weight:bold;">(חיסרון)</span>' : '');
        entry.innerHTML = `
            <div style="margin-bottom: 15px; padding: 12px; border-bottom: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.4); border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                     <span style="${nameStyle}">${data.cName || 'גיבור'} <small style="font-weight:600; color:#555;">(${data.pName || 'שחקן'})</small></span>
                     <span style="color: #666; font-size: 11px;">[${time}]</span> 
                </div>
                <div style="color: var(--ink); margin-top: 4px; line-height: 1.4; font-weight: 600;">
                    הטיל <strong>${data.type.toUpperCase()}</strong> ${modeLabel} וקיבל 
                    <span style="color: ${data.res === 20 ? '#b8860b' : (data.res === 1 ? '#c0392b' : 'var(--ink)')}; font-weight: 900; font-size: 1.3em;">
                        ${data.res + (data.mod || 0)}
                    </span>
                    <small style="opacity: 0.8; font-weight: normal;"> (${data.res}${data.mod >= 0 ? '+' : ''}${data.mod})</small>
                </div>
                ${flavorText ? `<div style="color: #444; font-style: italic; font-size: 12px; margin-top: 6px;">"${flavorText}"</div>` : ""}
            </div>
        `;
    }

    log.prepend(entry);
    if (log.children.length > 30) log.removeChild(log.lastChild);
}

export function setDiceCooldown(isActive) {
    const buttons = document.querySelectorAll('.dice-btn, #init-btn, .special-roll-btn');
    buttons.forEach(btn => {
        btn.disabled = isActive;
        btn.style.filter = isActive ? "grayscale(100%)" : "none";
        btn.style.opacity = isActive ? "0.4" : "1";
        btn.style.cursor = isActive ? "not-allowed" : "pointer";
        btn.style.pointerEvents = isActive ? "none" : "auto";
    });
}
