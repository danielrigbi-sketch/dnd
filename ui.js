// עדכון ויזואלי של כפתורי יתרון/חיסרון
export function updateModeUI(activeMode) {
    const advBtn = document.getElementById('adv-btn');
    const disBtn = document.getElementById('dis-btn');
    if (!advBtn || !disBtn) return;

    [advBtn, disBtn].forEach(btn => {
        btn.style.filter = "grayscale(100%)";
        btn.style.opacity = "0.4";
        btn.style.boxShadow = "none";
    });

    if (activeMode === 'adv') {
        advBtn.style.filter = "grayscale(0%)";
        advBtn.style.opacity = "1";
        advBtn.style.boxShadow = "0 4px 0 #2d4238";
    } else if (activeMode === 'dis') {
        disBtn.style.filter = "grayscale(0%)";
        disBtn.style.opacity = "1";
        disBtn.style.boxShadow = "0 4px 0 #5a3232";
    }
}

// עדכון רשימת היוזמה
export function updateInitiativeUI(data) {
    const list = document.getElementById('init-list');
    if (!list || !data) return;
    list.innerHTML = "";
    const items = Object.keys(data).map(key => ({ name: key, ...data[key] }));
    
    items.sort((a, b) => b.score - a.score).forEach(i => {
        const div = document.createElement('div');
        div.className = 'tracker-item';
        
        const playerColor = i.color || '#8B0000';
        div.style.borderRight = `4px solid ${playerColor}`;
        div.style.boxShadow = `inset 8px 0 10px -5px ${playerColor}`;
        
        div.innerHTML = `
            <span style="font-weight:bold; color: #fff; text-shadow: 1px 1px 2px #000;">${i.name}</span>
            <span class="init-score">${i.score}</span>
        `;
        list.appendChild(div);
    });
}

// הוספת שורת לוג - שחזור עיצוב "בליטה והילה" + תיקון שם ושעה
export function addLogEntry(data, time, flavorText) {
    const log = document.getElementById('roll-log');
    if (!log) return;

    const entry = document.createElement('div');
    const userColor = data.color || '#8B0000';
    const modeLabel = data.mode === 'adv' ? '<span style="color:#2d4238; font-weight:bold;">(יתרון)</span>' : (data.mode === 'dis' ? '<span style="color:#8c5151; font-weight:bold;">(חיסרון)</span>' : '');
    
    // שחזור אפקט בליטה (Relief) עם קווי מתאר שחורים + הילה צבעונית
    const nameStyle = `
        color: ${userColor}; 
        text-shadow: 1px 1px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000, 0px 0px 10px ${userColor}66;
        font-weight: 800;
        font-size: 1.1em;
    `;

    entry.innerHTML = `
        <div style="margin-bottom: 12px; padding: 12px; border-radius: 10px; background: rgba(0,0,0,0.05); border-right: 4px solid ${userColor}; box-shadow: 2px 2px 5px rgba(0,0,0,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <strong style="${nameStyle}">${data.cName || 'גיבור'} (${data.pName || 'שחקן'})</strong>
                <span style="color: #2c1e16; font-size: 11px; font-weight: bold; font-family: monospace;">[${time}]</span>
            </div>
            <div style="color: #1a1a1a; line-height: 1.4;">
                הטיל <span style="color: #000; font-weight: bold;">${data.type.toUpperCase()}</span> ${modeLabel}
                <br>
                תוצאה: <span style="font-size: 1.4em; font-weight: 900; color: ${data.res === 20 ? '#B8860B' : (data.res === 1 ? '#8B0000' : '#000')}; text-shadow: 0.5px 0.5px 0px rgba(255,255,255,0.5);">
                    ${data.res + (data.mod || 0)}
                </span>
                <small style="color: #444; font-weight: bold;"> (${data.res}${data.mod >= 0 ? '+' : ''}${data.mod})</small>
            </div>
            ${flavorText ? `<div style="margin-top: 6px; color: #5d4037; font-style: italic; font-size: 12px; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 4px;">"${flavorText}"</div>` : ''}
        </div>
    `;

    log.prepend(entry);
    
    if (log.children.length > 30) {
        log.removeChild(log.lastChild);
    }
}
