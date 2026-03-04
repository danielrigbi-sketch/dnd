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

// עדכון רשימת המשתתפים (Party Dashboard)
export function updateInitiativeUI(data) {
    const list = document.getElementById('init-list');
    if (!list) return;

    list.innerHTML = "";
    if (!data) return;

    // הפיכת האובייקט למערך ומיון לפי היוזמה (score)
    const items = Object.keys(data).map(key => ({ name: key, ...data[key] }));
    
    // מיון: אלו שגילגלו יוזמה למעלה, השאר למטה בסדר אלפביתי
    items.sort((a, b) => (b.score || 0) - (a.score || 0)).forEach((i, index) => {
        const div = document.createElement('div');
        div.className = 'tracker-item';
        
        const playerColor = i.pColor || '#e74c3c';
        div.style.borderRight = `4px solid ${playerColor}`;
        
        const hpPercent = (i.hp / i.maxHp) * 100;
        const isDead = i.hp <= 0;

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; ${isDead ? 'opacity: 0.6;' : ''}">
                <div>
                    <div style="font-weight:900; font-size:1.1em; color: white;">
                        ${i.score > 0 ? (index + 1) + '. ' : ''}${i.name}
                        <span style="font-weight:400; font-size:0.75em; opacity:0.8;">(${i.pName || 'שחקן'})</span>
                    </div>
                    <div style="font-size:0.75em; color: #f3e5ab; margin-top: 1px;">
                        ${i.race || ''} ${i.class || ''}
                    </div>
                </div>
                <div style="text-align:left;">
                    <div class="init-score" style="font-size:1.4em; color:${i.score > 0 ? '#f3e5ab' : '#555'};">
                        ${i.score > 0 ? i.score : '--'}
                    </div>
                </div>
            </div>

            <div style="background: #333; height: 7px; border-radius: 4px; margin: 8px 0 4px 0; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                <div style="width: ${hpPercent}%; height: 100%; background: ${hpPercent > 30 ? '#2ecc71' : '#e74c3c'}; transition: width 0.4s ease-out;"></div>
            </div>

            <div style="display: flex; justify-content: space-between; font-size: 0.8em; font-weight: bold; margin-top: 4px;">
                <span title="דירוג שריון">🛡️ ${i.ac || '10'}</span>
                <span title="הבחנה פסיבית">👁️ ${i.pp || '10'}</span>
                <span title="מהירות">🏃 ${i.speed || '30'}ft</span>
                <span style="color:${hpPercent > 30 ? '#2ecc71' : '#ff7675'}">❤️ ${i.hp}/${i.maxHp}</span>
            </div>
        `;
        
        if (isDead) div.style.background = "rgba(231, 76, 60, 0.1)";
        list.appendChild(div);
    });
}

// הוספת שורת לוג - תומך כעת גם בהטלות וגם בעדכוני חיים
export function addLogEntry(data, time, flavorText) {
    const log = document.getElementById('roll-log');
    if (!log) return;

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    const userColor = data.color || '#8B0000';
    const isHpUpdate = data.type === "DAMAGE" || data.type === "HEAL";

    const nameStyle = `
        color: #ffffff !important;
        font-family: 'Assistant', sans-serif !important;
        font-weight: 800 !important;
        font-size: 1.1em;
        text-shadow: 1px 1px 2px #000, 0 0 10px ${userColor}aa;
    `;

    if (isHpUpdate) {
        // עיצוב הודעת עדכון חיים
        const isHeal = data.type === "HEAL";
        entry.innerHTML = `
            <div style="margin-bottom: 12px; padding: 10px; border-radius: 8px; background: rgba(0,0,0,0.15); border-left: 4px solid ${isHeal ? '#2ecc71' : '#e74c3c'};">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="${nameStyle}">${data.cName}</span>
                    <span style="color: #666; font-size: 10px;">${time}</span>
                </div>
                <div style="color: #fff; margin-top: 5px; font-size: 0.95em;">
                    ${isHeal ? '✨ קיבל ריפוי של' : '💥 ספג נזק של'} 
                    <strong style="color:${isHeal ? '#2ecc71' : '#ff7675'}; font-size: 1.2em;">${data.res}</strong> נקודות.
                    <div style="font-size: 0.8em; opacity: 0.8; margin-top: 2px;">חיים נותרו: ${data.newHp}</div>
                </div>
            </div>
        `;
    } else {
        // עיצוב הטלת קוביות רגילה (הקוד הקיים שלך)
        const modeLabel = data.mode === 'adv' ? '<span style="color:#2ecc71; font-weight:bold;">(יתרון)</span>' : (data.mode === 'dis' ? '<span style="color:#e74c3c; font-weight:bold;">(חיסרון)</span>' : '');
        
        entry.innerHTML = `
            <div style="margin-bottom: 15px; padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.05); border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                     <span style="${nameStyle}">${data.cName || 'גיבור'} <small style="font-weight:400; opacity:0.7;">(${data.pName || 'שחקן'})</small></span>
                     <span style="color: #666; font-size: 11px;">[${time}]</span> 
                </div>
                
                <div style="color: #eee; margin-top: 4px; line-height: 1.4;">
                    הטיל <strong>${data.type.toUpperCase()}</strong> ${modeLabel} וקיבל 
                    <span style="color: ${data.res === 20 ? '#f1c40f' : (data.res === 1 ? '#e74c3c' : '#fff')}; font-weight: 900; font-size: 1.3em;">
                        ${data.res + (data.mod || 0)}
                    </span>
                    <small style="opacity: 0.6;"> (${data.res}${data.mod >= 0 ? '+' : ''}${data.mod})</small>
                </div>
                ${flavorText ? `<div style="color: #f3e5ab; font-style: italic; font-size: 12px; margin-top: 6px; opacity: 0.8;">"${flavorText}"</div>` : ""}
            </div>
        `;
    }

    log.prepend(entry);
    if (log.children.length > 30) log.removeChild(log.lastChild);
}

// ניהול נראות כפתורים בזמן קולדאון
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
