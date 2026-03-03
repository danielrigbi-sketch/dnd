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

// הוספת שורת לוג (מתוקן: שם דמות + שחקן, צבע שעה כהה)
export function addLogEntry(data, time, flavorText) {
    const log = document.getElementById('roll-log');
    if (!log) return;

    const entry = document.createElement('div');
    const userColor = data.color || '#8B0000';
    
    // סגנון השם (Character (Player))
    const nameStyle = `
        color: ${userColor}; 
        font-weight: bold;
        font-size: 1.05em;
        text-shadow: 0.5px 0.5px 0px rgba(0,0,0,0.1);
    `;

    entry.innerHTML = `
        <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
                <span style="${nameStyle}">${data.cName || 'גיבור'} (${data.pName || 'שחקן'})</span>
                <span style="color: #2c1e16; font-size: 11px; font-weight: bold;">${time}</span>
            </div>
            <div style="color: #332211; font-size: 14px; line-height: 1.4;">
                הטיל <strong style="color: #000;">${data.type.toUpperCase()}</strong>
                ${data.mode !== 'normal' ? `<span style="font-size:0.9em; color: #555;">(${(data.mode === 'adv' ? 'יתרון' : 'חיסרון')})</span>` : ''}
                <br>
                קיבל: <span style="font-size: 1.2em; font-weight: 900; color: #000;">${data.res + (data.mod || 0)}</span>
                <small style="color: #666; margin-right: 4px;">(${data.res}${data.mod >= 0 ? '+' : ''}${data.mod})</small>
            </div>
            ${flavorText ? `<div style="color: #5d4037; font-style: italic; font-size: 12px; margin-top: 4px; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 4px;">"${flavorText}"</div>` : ''}
        </div>
    `;

    log.prepend(entry);
    
    // הגבלת מספר ההודעות בלוג כדי לא להכביד על הדף
    if (log.children.length > 30) {
        log.removeChild(log.lastChild);
    }
}
