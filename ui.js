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

// עדכון רשימת היוזמה עם אפקט הילה
export function updateInitiativeUI(data) {
    const list = document.getElementById('init-list');
    if (!list || !data) return;
    list.innerHTML = "";
    const items = Object.keys(data).map(key => ({ name: key, ...data[key] }));
    
    items.sort((a, b) => b.score - a.score).forEach(i => {
        const div = document.createElement('div');
        div.className = 'tracker-item';
        
        // הוספת הילה ופס זיהוי לפי הצבע של השחקן
        const playerColor = i.color || '#e74c3c';
        div.style.borderRight = `4px solid ${playerColor}`;
        div.style.boxShadow = `inset 8px 0 10px -5px ${playerColor}`;
        
        div.innerHTML = `
            <span style="font-weight:bold; color: #fff; text-shadow: 1px 1px 2px #000;">${i.name}</span>
            <span class="init-score">${i.score}</span>
        `;
        list.appendChild(div);
    });
}

// הוספת שורת לוג עם אפקט הילה לשם
export function addLogEntry(data, time, flavorText) {
    const log = document.getElementById('roll-log');
    if (!log) return;

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const modeLabel = data.mode === 'adv' ? '<span style="color:#4e6e5d;">(יתרון)</span>' : (data.mode === 'dis' ? '<span style="color:#e74c3c;">(חיסרון)</span>' : '');
    const diceBreakdown = (data.res1 && data.res2) ? `<small style="opacity:0.6;"> [${data.res1}, ${data.res2}]</small>` : '';

    // יצירת סטייל ההילה לשם המשתמש
    const userColor = data.color || '#fff';
    const auraStyle = `text-shadow: 0 0 8px ${userColor}; border-right: 3px solid ${userColor}; padding-right: 8px;`;

    entry.innerHTML = `
        <div style="margin-bottom: 12px; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); border-radius: 8px;">
            <span style="color: #aaa; font-size: 11px;">[${time}]</span> 
            <strong style="${auraStyle} color: #fff;">${data.cName || 'גיבור'}</strong><br>
            הטיל <strong style="color: #fff;">${data.type.toUpperCase()}</strong> ${modeLabel} וקיבל 
            <span style="color: ${data.res === 20 ? '#f1c40f' : (data.res === 1 ? '#e74c3c' : '#fff')}; font-weight: bold; font-size: 1.1em;">
                ${data.res + (data.mod || 0)}
            </span>
            ${diceBreakdown}
            <div style="color: #ddd; font-style: italic; font-size: 13px; margin-top: 4px;">${flavorText}</div>
        </div>
    `;

    log.prepend(entry);
}
