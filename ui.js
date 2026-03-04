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
    
    // אם האלמנט לא קיים ב-DOM, אין מה להמשיך
    if (!list) return;

    // צעד קריטי: מנקים את הרשימה בכל מקרה! 
    // זה מה שיגרום לרשימה להיעלם מיד כשה-DM עושה איפוס
    list.innerHTML = "";

    // עכשיו בודקים אם יש נתונים. אם אין (data הוא null), פשוט עוצרים כאן
    // אחרי שהרשימה כבר נוקתה מהמסך.
    if (!data) return;

    const items = Object.keys(data).map(key => ({ name: key, ...data[key] }));
    
    // עדכון: הוספת index כדי להציג את המקום בסדר היוזמה
    items.sort((a, b) => b.score - a.score).forEach((i, index) => {
        const div = document.createElement('div');
        div.className = 'tracker-item';
        const playerColor = i.color || '#e74c3c';
        div.style.borderRight = `4px solid ${playerColor}`;
        
        // עדכון מבנה הטקסט: הוספת מספר סידורי ושם השחקן בסוגריים
        div.innerHTML = `
            <span style="font-weight:bold; font-family: 'Assistant', sans-serif;">
                ${index + 1}. ${i.name} (${i.playerName || 'שחקן'})
            </span>
            <span class="init-score">${i.score}</span>
        `;
        list.appendChild(div);
    });
}

// הוספת שורת לוג - פונט מודרני אסיסטנט
export function addLogEntry(data, time, flavorText) {
    const log = document.getElementById('roll-log');
    if (!log) return;

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    const userColor = data.color || '#8B0000';
    const modeLabel = data.mode === 'adv' ? '<span style="color:#2d4238; font-weight:bold;">(יתרון)</span>' : (data.mode === 'dis' ? '<span style="color:#8c5151; font-weight:bold;">(חיסרון)</span>' : '');

    const nameStyle = `
        color: #ffffff !important;
        font-family: 'Assistant', sans-serif !important;
        font-weight: 800 !important;
        font-size: 1.15em;
        text-shadow: 
            -1px -1px 0 #000,  
             1px -1px 0 #000,
            -1px  1px 0 #000,
             1px  1px 0 #000,
             0 0 12px ${userColor}, 
             0 0 20px ${userColor}aa;
    `;

    entry.innerHTML = `
        <div style="margin-bottom: 15px; padding: 12px; border-bottom: 1px solid rgba(0,0,0,0.1); background: rgba(0,0,0,0.02); border-radius: 8px; font-family: 'Assistant', sans-serif !important;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                 <span style="${nameStyle}">${data.cName || 'גיבור'} (${data.pName || 'שחקן'})</span>
                 <span style="color: #2c1e16; font-size: 11px; font-weight: bold; font-family: monospace;">[${time}]</span> 
            </div>
            
            <div style="color: #1a1a1a; margin-top: 4px; line-height: 1.4; font-family: 'Assistant', sans-serif !important;">
                הטיל <strong style="color: #000;">${data.type.toUpperCase()}</strong> ${modeLabel} וקיבל 
                <span style="color: ${data.res === 20 ? '#B8860B' : (data.res === 1 ? '#e74c3c' : '#000')}; font-weight: 900; font-size: 1.3em;">
                    ${data.res + (data.mod || 0)}
                </span>
                <small style="color: #666; font-weight: bold;"> (${data.res}${data.mod >= 0 ? '+' : ''}${data.mod})</small>
            </div>
            
            ${flavorText ? `<div style="color: #5d4037; font-style: italic; font-size: 12px; margin-top: 6px; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 4px; font-family: 'Assistant', sans-serif !important;">"${flavorText}"</div>` : ""}
        </div>
    `;

    log.prepend(entry);
    
    if (log.children.length > 30) {
        log.removeChild(log.lastChild);
    }
}

// ניהול נראות כפתורים בזמן קולדאון
export function setDiceCooldown(isActive) {
    const buttons = document.querySelectorAll('.dice-btn, #init-btn, .special-roll-btn');
    
    buttons.forEach(btn => {
        if (isActive) {
            btn.disabled = true;
            btn.style.filter = "grayscale(100%)";
            btn.style.opacity = "0.4";
            btn.style.cursor = "not-allowed";
            btn.style.pointerEvents = "none";
        } else {
            btn.disabled = false;
            btn.style.filter = "none";
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
            btn.style.pointerEvents = "auto";
        }
    });
}
