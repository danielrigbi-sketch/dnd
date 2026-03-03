// ui.js

// עדכון ויזואלי של כפתורי יתרון/חיסרון
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

// עדכון רשימת היוזמה
export function updateInitiativeUI(data) {
    const list = document.getElementById('init-list');
    if (!list || !data) return;
    list.innerHTML = "";
    const items = Object.keys(data).map(key => ({ name: key, ...data[key] }));
    
    items.sort((a, b) => b.score - a.score).forEach(i => {
        const div = document.createElement('div');
        div.className = 'tracker-item';
        
        const playerColor = i.color || '#e74c3c';
        div.style.borderRight = `4px solid ${playerColor}`;
        
        div.innerHTML = `
            <span style="font-weight:bold;">${i.name}</span>
            <span class="init-score">${i.score}</span>
        `;
        list.appendChild(div);
    });
}

// הוספת שורת לוג - פונט לבן בוהק עם הילה צבעונית משתנה
export function addLogEntry(data, time, flavorText) {
    const log = document.getElementById('roll-log');
    if (!log) return;

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    const userColor = data.color || '#8B0000';
    const modeLabel = data.mode === 'adv' ? '<span style="color:#2d4238; font-weight:bold;">(יתרון)</span>' : (data.mode === 'dis' ? '<span style="color:#8c5151; font-weight:bold;">(חיסרון)</span>' : '');

    // בניית ה-Shadow הדינמי: מסגרת שחורה לקריאות + הילה צבעונית
    const dynamicShadow = `
        -1px -1px 0 #000,  
         1px -1px 0 #000,
        -1px  1px 0 #000,
         1px  1px 0 #000,
         0 0 10px ${userColor}, 
         0 0 18px ${userColor}88
    `;

    entry.innerHTML = `
        <div style="margin-bottom: 12px; padding: 12px; border-bottom: 1px solid rgba(0,0,0,0.1); background: rgba(0,0,0,0.03); border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                 <span class="log-player-name" style="text-shadow: ${dynamicShadow};">
                    ${data.cName || 'גיבור'} (${data.pName || 'שחקן'})
                 </span>
                 <span style="color: #2c1e16; font-size: 11px; font-weight: bold; font-family: monospace !important;">[${time}]</span> 
            </div>
            
            <div style="color: #1a1a1a; margin-top: 4px; line-height: 1.4;">
                הטיל <strong style="color: #000;">${data.type.toUpperCase()}</strong> ${modeLabel} וקיבל 
                <span style="color: ${data.res === 20 ? '#B8860B' : (data.res === 1 ? '#e74c3c' : '#000')}; font-weight: 900; font-size: 1.3em;">
                    ${data.res + (data.mod || 0)}
                </span>
                <small style="color: #666; font-weight: bold;"> (${data.res}${data.mod >= 0 ? '+' : ''}${data.mod})</small>
            </div>
            
            ${flavorText ? `<div style="color: #5d4037; font-style: italic; font-size: 12px; margin-top: 6px; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 4px;">"${flavorText}"</div>` : ""}
        </div>
    `;

    log.prepend(entry);
    
    if (log.children.length > 30) {
        log.removeChild(log.lastChild);
    }
}
