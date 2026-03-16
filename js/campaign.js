// campaign.js — Campaign lobby tab, create/join/manage flow
import * as db from './firebaseService.js';

// ── State ────────────────────────────────────────────────────────────────────
let _uid        = null;
let _userName   = null;
let _pendingUnsubscribe  = null;
let _campaignUnsubscribe = null;

// Callback called when a campaign session should start
// signature: (role: 'dm'|'player', charData: object|null, campaignId: string)
let _onStartCampaign = null;

export function initCampaigns(uid, userName, onStartCampaign) {
    _uid = uid;
    _userName = userName;
    _onStartCampaign = onStartCampaign;
    _renderCampaignTab();
}

// ── Tab Rendering ─────────────────────────────────────────────────────────────
function _renderCampaignTab() {
    const tab = document.getElementById('campaign-tab-content');
    if (!tab) return;

    // Clear any previous listeners
    if (_campaignUnsubscribe) { _campaignUnsubscribe(); _campaignUnsubscribe = null; }

    tab.innerHTML = `
        <div class="campaign-section" id="campaign-dm-section">
            <div class="campaign-section-header">⚔️ הקמפיינים שלי כ-DM</div>
            <button id="new-campaign-btn" class="hover-btn campaign-new-btn">+ קמפיין חדש</button>
            <div id="campaign-new-form" class="campaign-new-form" style="display:none;">
                <input type="text" id="campaign-name-input" class="input-padded" placeholder="שם הקמפיין" style="width:100%; margin-bottom:8px;" maxlength="50">
                <div style="display:flex; gap:8px;">
                    <button id="campaign-create-confirm-btn" class="hover-btn" style="flex:1; background:#e74c3c; color:white; padding:8px; border-radius:6px; font-weight:bold;">צור קמפיין</button>
                    <button id="campaign-create-cancel-btn" class="hover-btn" style="flex:1; background:#555; color:white; padding:8px; border-radius:6px;">ביטול</button>
                </div>
            </div>
            <div id="dm-campaign-list" style="margin-top:12px;"></div>
        </div>

        <div class="campaign-section" id="campaign-player-section">
            <div class="campaign-section-header">🛡️ הקמפיינים שלי כשחקן</div>
            <div style="display:flex; gap:8px; margin-bottom:12px;">
                <input type="text" id="campaign-join-code" class="input-padded" placeholder="קוד קמפיין (6 תווים)" style="flex:1; text-transform:uppercase;" maxlength="6">
                <button id="campaign-request-btn" class="hover-btn" style="background:#3498db; color:white; padding:8px 14px; border-radius:6px; font-weight:bold; white-space:nowrap;">בקש גישה →</button>
            </div>
            <div id="player-campaign-list"></div>
        </div>
    `;

    // New Campaign button
    document.getElementById('new-campaign-btn').addEventListener('click', () => {
        const form = document.getElementById('campaign-new-form');
        form.style.display = form.style.display === 'none' ? 'flex' : 'none';
        form.style.flexDirection = 'column';
        document.getElementById('campaign-name-input').focus();
    });

    document.getElementById('campaign-create-cancel-btn').addEventListener('click', () => {
        document.getElementById('campaign-new-form').style.display = 'none';
    });

    document.getElementById('campaign-create-confirm-btn').addEventListener('click', _createCampaign);

    document.getElementById('campaign-name-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') _createCampaign();
    });

    // Request access button
    document.getElementById('campaign-request-btn').addEventListener('click', _requestAccess);

    document.getElementById('campaign-join-code').addEventListener('keydown', e => {
        if (e.key === 'Enter') _requestAccess();
    });

    // Listen for DM campaigns
    _campaignUnsubscribe = db.listenToCampaignsByDM(_uid, campaigns => {
        _renderDMCampaigns(campaigns);
    });

    // Listen for player campaigns
    const playerUnsub = db.listenToCampaignsByPlayer(_uid, campaigns => {
        _renderPlayerCampaigns(campaigns);
    });

    // Combine unsubscribers
    const origUnsub = _campaignUnsubscribe;
    _campaignUnsubscribe = () => { origUnsub(); playerUnsub(); };
}

async function _createCampaign() {
    const nameInput = document.getElementById('campaign-name-input');
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    const campaignId = _genCode();
    const btn = document.getElementById('campaign-create-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'יוצר…';

    try {
        await db.createCampaign(campaignId, {
            name,
            dmUid: _uid,
            dmName: _userName,
            description: ''
        });
        nameInput.value = '';
        document.getElementById('campaign-new-form').style.display = 'none';
        _showToast(`✅ קמפיין נוצר! קוד: ${campaignId}`, 'success');
    } catch(e) {
        console.error('[Campaign] create failed:', e);
        _showToast('שגיאה ביצירת קמפיין.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'צור קמפיין';
    }
}

async function _requestAccess() {
    const codeInput = document.getElementById('campaign-join-code');
    const code = (codeInput.value || '').trim().toUpperCase();
    if (code.length !== 6) { _showToast('יש להזין קוד בן 6 תווים.', 'warning'); return; }

    const btn = document.getElementById('campaign-request-btn');
    btn.disabled = true;

    try {
        // Check if already approved
        const isApproved = await db.isCampaignPlayer(code, _uid);
        if (isApproved) {
            _showToast('כבר יש לך גישה! ראה את הקמפיינים שלך למטה.', 'info');
            return;
        }

        const meta = await db.getCampaignMeta(code);
        if (!meta) { _showToast('קמפיין לא נמצא.', 'warning'); return; }

        const alreadyPending = await db.hasPendingRequest(code, _uid);
        if (alreadyPending) { _showToast('בקשתך כבר ממתינה לאישור DM.', 'info'); return; }

        // Show char name input dialog
        _showRequestDialog(code, meta.name, meta.dmName);
    } catch(e) {
        console.error('[Campaign] request access error:', e);
        _showToast('שגיאה בבדיקת גישה.', 'error');
    } finally {
        btn.disabled = false;
    }
}

function _showRequestDialog(campaignId, campaignName, dmName) {
    const existing = document.getElementById('campaign-request-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'campaign-request-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:4000;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
        <div style="background:#1a1a2e;border:2px solid #3498db;border-radius:14px;padding:28px;max-width:360px;width:90%;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">⚔️</div>
            <h3 style="color:#f1c40f;margin:0 0 6px;">${campaignName}</h3>
            <div style="color:#aaa;font-size:13px;margin-bottom:16px;">DM: ${dmName}</div>
            <input type="text" id="request-char-name" class="input-padded" placeholder="שם הדמות שלך" style="width:100%;margin-bottom:12px;" maxlength="40">
            <div style="display:flex;gap:10px;">
                <button id="request-confirm-btn" class="hover-btn" style="flex:1;background:#3498db;color:white;padding:10px;border-radius:8px;font-weight:bold;">שלח בקשה</button>
                <button id="request-cancel-btn" class="hover-btn" style="flex:1;background:#555;color:white;padding:10px;border-radius:8px;">ביטול</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#request-char-name').focus();

    modal.querySelector('#request-cancel-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    const confirm = async () => {
        const charName = modal.querySelector('#request-char-name').value.trim();
        if (!charName) { modal.querySelector('#request-char-name').focus(); return; }
        try {
            await db.requestCampaignAccess(campaignId, _uid, _userName, charName);
            modal.remove();
            document.getElementById('campaign-join-code').value = '';
            _showToast(`📨 בקשה נשלחה ל-${dmName}. ממתין לאישור…`, 'info');
        } catch(e) {
            console.error('[Campaign] send request error:', e);
            _showToast('שגיאה בשליחת הבקשה.', 'error');
        }
    };

    modal.querySelector('#request-confirm-btn').addEventListener('click', confirm);
    modal.querySelector('#request-char-name').addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
}

// ── DM Campaign Cards ─────────────────────────────────────────────────────────
function _renderDMCampaigns(campaigns) {
    const list = document.getElementById('dm-campaign-list');
    if (!list) return;

    if (!campaigns || Object.keys(campaigns).length === 0) {
        list.innerHTML = '<div style="color:#666;font-size:13px;padding:8px 0;">עדיין אין קמפיינים. צור את הראשון!</div>';
        return;
    }

    list.innerHTML = Object.entries(campaigns).map(([id, c]) => {
        const meta = c.meta || {};
        const playerCount = Object.keys(c.allowedPlayers || {}).length;
        const lastPlayed  = meta.lastSession ? _relativeTime(meta.lastSession) : 'מעולם';
        return `
            <div class="campaign-card" data-id="${id}">
                <div class="campaign-card-title">🗺️ ${_esc(meta.name || id)}</div>
                <div class="campaign-card-meta">קוד: <strong>${id}</strong> · ${playerCount} שחקנים · ${lastPlayed}</div>
                <div class="campaign-card-actions">
                    <button class="hover-btn campaign-resume-btn" onclick="window.__campaignResume('${id}')">▶ המשך</button>
                    <button class="hover-btn campaign-manage-btn" onclick="window.__campaignManage('${id}')">⚙️ ניהול</button>
                </div>
            </div>`;
    }).join('');
}

// ── Player Campaign Cards ─────────────────────────────────────────────────────
function _renderPlayerCampaigns(campaigns) {
    const list = document.getElementById('player-campaign-list');
    if (!list) return;

    if (!campaigns || Object.keys(campaigns).length === 0) {
        list.innerHTML = '<div style="color:#666;font-size:13px;padding:8px 0;">עוד לא הצטרפת לקמפיינים.</div>';
        return;
    }

    list.innerHTML = Object.entries(campaigns).map(([id, c]) => {
        const meta    = c.meta || {};
        const myInfo  = c.allowedPlayers?.[_uid] || {};
        const lastPlayed = meta.lastSession ? _relativeTime(meta.lastSession) : 'טרם';
        return `
            <div class="campaign-card" data-id="${id}">
                <div class="campaign-card-title">🗺️ ${_esc(meta.name || id)}</div>
                <div class="campaign-card-meta">DM: ${_esc(meta.dmName || '?')} · ${_esc(myInfo.charName || '?')} · ${lastPlayed}</div>
                <div class="campaign-card-actions">
                    <button class="hover-btn campaign-rejoin-btn" onclick="window.__campaignRejoin('${id}', '${_esc(myInfo.charName || '')}')">▶ חזור לקמפיין</button>
                </div>
            </div>`;
    }).join('');
}

// ── Global handlers (called from inline onclick) ──────────────────────────────
window.__campaignResume = async (campaignId) => {
    await db.updateCampaignLastSession(campaignId);
    db.setDmUid(campaignId, _uid);
    _onStartCampaign?.('dm', null, campaignId, true);
};

window.__campaignRejoin = (campaignId, charName) => {
    // Player needs to pick their character from vault — open vault with pre-selected context
    // The campaign join will verify approval before startGame
    _openVaultForCampaign(campaignId, charName);
};

window.__campaignManage = (campaignId) => {
    _openManagePanel(campaignId);
};

// ── Vault-for-campaign flow ───────────────────────────────────────────────────
function _openVaultForCampaign(campaignId, linkedCharName) {
    // Show a modal letting the player pick their character from vault, then start
    const modal = document.createElement('div');
    modal.id = 'campaign-vault-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:4000;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
        <div style="background:#1a1a2e;border:2px solid #f1c40f;border-radius:14px;padding:24px;max-width:400px;width:90%;max-height:80vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="color:#f1c40f;margin:0;">בחר דמות לקמפיין</h3>
                <button id="campaign-vault-close" class="close-btn">&times;</button>
            </div>
            <div id="campaign-vault-chars" style="display:flex;flex-direction:column;gap:8px;"></div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#campaign-vault-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Load vault characters
    db.listenToUserCharacters(_uid, chars => {
        const container = document.getElementById('campaign-vault-chars');
        if (!container) return;
        if (!chars) {
            container.innerHTML = '<div style="color:#aaa;">אין דמויות בכספת.</div>';
            return;
        }
        container.innerHTML = '';
        Object.entries(chars).forEach(([id, c]) => {
            const btn = document.createElement('button');
            btn.className = 'hover-btn';
            btn.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px;background:rgba(255,255,255,0.05);border:1px solid #444;border-radius:8px;width:100%;text-align:right;cursor:pointer;';
            btn.innerHTML = `
                <img src="${c.portrait || 'assets/logo.png'}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid ${c.color || '#3498db'}">
                <div>
                    <div style="color:white;font-weight:bold;">${_esc(c.name)}</div>
                    <div style="color:#aaa;font-size:12px;">${_esc(c.class || '')} ${_esc(c.race || '')} · HP ${c.hp || 0}/${c.maxHp || 0}</div>
                </div>
            `;
            btn.addEventListener('click', () => {
                modal.remove();
                _onStartCampaign?.('player', c, campaignId, true);
            });
            container.appendChild(btn);
        });
    });
}

// ── Campaign Manage Panel ─────────────────────────────────────────────────────
function _openManagePanel(campaignId) {
    const existing = document.getElementById('campaign-manage-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'campaign-manage-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:4000;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
        <div style="background:#1a1a2e;border:2px solid #9b59b6;border-radius:14px;padding:24px;max-width:440px;width:90%;max-height:85vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 id="manage-campaign-title" style="color:#9b59b6;margin:0;">⚙️ ניהול קמפיין</h3>
                <button id="manage-close-btn" class="close-btn">&times;</button>
            </div>
            <div style="margin-bottom:16px;">
                <label style="color:#ccc;font-size:13px;display:block;margin-bottom:6px;">שם קמפיין</label>
                <div style="display:flex;gap:8px;">
                    <input type="text" id="manage-campaign-name" class="input-padded" style="flex:1;" maxlength="50">
                    <button id="manage-name-save" class="hover-btn" style="background:#9b59b6;color:white;padding:8px 12px;border-radius:6px;">שמור</button>
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <label style="color:#ccc;font-size:13px;display:block;margin-bottom:6px;">הערות סשן</label>
                <textarea id="manage-campaign-notes" class="input-padded" rows="3" style="width:100%;resize:vertical;" placeholder="הערות, לור, תוכניות…" maxlength="1000"></textarea>
                <button id="manage-notes-save" class="hover-btn" style="margin-top:6px;background:#555;color:white;padding:6px 12px;border-radius:6px;font-size:12px;">שמור הערות</button>
            </div>
            <div style="margin-bottom:16px;">
                <div style="color:#ccc;font-size:13px;margin-bottom:8px;border-top:1px solid #333;padding-top:12px;">שחקנים מאושרים</div>
                <div id="manage-players-list" style="display:flex;flex-direction:column;gap:6px;"></div>
            </div>
            <div id="manage-pending-section" style="display:none;margin-bottom:16px;">
                <div style="color:#f1c40f;font-size:13px;margin-bottom:8px;">⏳ בקשות ממתינות</div>
                <div id="manage-pending-list" style="display:flex;flex-direction:column;gap:6px;"></div>
            </div>
            <div style="border-top:1px solid #333;padding-top:14px;text-align:center;">
                <div style="color:#aaa;font-size:12px;margin-bottom:8px;">קוד קמפיין: <strong style="color:white;font-family:monospace;font-size:16px;letter-spacing:3px;">${campaignId}</strong></div>
                <button id="manage-copy-code" class="hover-btn" style="background:#2c3e50;color:#ccc;padding:6px 14px;border-radius:6px;font-size:12px;">📋 העתק קוד</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#manage-close-btn').addEventListener('click', () => { modal.remove(); _stopManageListeners(); });
    modal.addEventListener('click', e => { if (e.target === modal) { modal.remove(); _stopManageListeners(); } });

    modal.querySelector('#manage-copy-code').addEventListener('click', () => {
        navigator.clipboard.writeText(campaignId).then(() => _showToast('קוד הועתק!', 'success'));
    });

    // Load meta
    db.getCampaignMeta(campaignId).then(meta => {
        if (!meta) return;
        const nameEl = document.getElementById('manage-campaign-name');
        const notesEl = document.getElementById('manage-campaign-notes');
        const titleEl = document.getElementById('manage-campaign-title');
        if (nameEl)  nameEl.value = meta.name || '';
        if (notesEl) notesEl.value = meta.description || '';
        if (titleEl) titleEl.textContent = `⚙️ ${meta.name || campaignId}`;
    });

    document.getElementById('manage-name-save').addEventListener('click', async () => {
        const n = document.getElementById('manage-campaign-name').value.trim();
        if (!n) return;
        await db.updateCampaignMeta(campaignId, { name: n });
        _showToast('שם עודכן!', 'success');
    });

    document.getElementById('manage-notes-save').addEventListener('click', async () => {
        const notes = document.getElementById('manage-campaign-notes').value;
        await db.updateCampaignMeta(campaignId, { description: notes });
        _showToast('הערות נשמרו.', 'success');
    });

    // Allowed players listener
    const p1 = db.listenToCampaignAllowedPlayers(campaignId, players => {
        const container = document.getElementById('manage-players-list');
        if (!container) return;
        if (!players || Object.keys(players).length === 0) {
            container.innerHTML = '<div style="color:#666;font-size:12px;">עדיין אין שחקנים מאושרים.</div>';
            return;
        }
        container.innerHTML = Object.entries(players).map(([uid, p]) => `
            <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04);padding:8px 10px;border-radius:6px;border:1px solid #333;">
                <div>
                    <span style="color:white;font-weight:bold;">${_esc(p.playerName || '?')}</span>
                    <span style="color:#aaa;font-size:12px;margin-right:6px;">· ${_esc(p.charName || '?')}</span>
                </div>
                <button class="hover-btn" onclick="window.__campaignKick('${campaignId}','${uid}')" style="background:#c0392b;color:white;padding:4px 10px;border-radius:4px;font-size:11px;">הסר</button>
            </div>
        `).join('');
    });

    // Pending requests listener
    const p2 = db.listenToPendingRequests(campaignId, pending => {
        const section = document.getElementById('manage-pending-section');
        const container = document.getElementById('manage-pending-list');
        if (!section || !container) return;
        if (!pending || Object.keys(pending).length === 0) {
            section.style.display = 'none';
            return;
        }
        section.style.display = 'block';
        container.innerHTML = Object.entries(pending).map(([uid, r]) => `
            <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(241,196,15,0.06);padding:8px 10px;border-radius:6px;border:1px solid rgba(241,196,15,0.2);">
                <div>
                    <span style="color:#f1c40f;font-weight:bold;">${_esc(r.playerName || '?')}</span>
                    <span style="color:#aaa;font-size:12px;margin-right:6px;">· ${_esc(r.charName || '?')}</span>
                </div>
                <div style="display:flex;gap:6px;">
                    <button class="hover-btn" onclick="window.__campaignApprove('${campaignId}','${uid}')" style="background:#27ae60;color:white;padding:4px 10px;border-radius:4px;font-size:11px;">אשר</button>
                    <button class="hover-btn" onclick="window.__campaignDeny('${campaignId}','${uid}')" style="background:#666;color:white;padding:4px 10px;border-radius:4px;font-size:11px;">דחה</button>
                </div>
            </div>
        `).join('');
    });

    _pendingUnsubscribe = () => { p1(); p2(); };
}

function _stopManageListeners() {
    if (_pendingUnsubscribe) { _pendingUnsubscribe(); _pendingUnsubscribe = null; }
}

// Global approve/deny/kick handlers
window.__campaignApprove = async (campaignId, uid) => {
    await db.approveCampaignPlayer(campaignId, uid);
    _showToast('שחקן אושר!', 'success');
};
window.__campaignDeny = async (campaignId, uid) => {
    await db.denyCampaignRequest(campaignId, uid);
    _showToast('בקשה נדחתה.', 'info');
};
window.__campaignKick = async (campaignId, uid) => {
    if (!confirm('הסר שחקן מהקמפיין?')) return;
    await db.kickCampaignPlayer(campaignId, uid);
    _showToast('שחקן הוסר.', 'info');
};

// ── In-game pending request notification (for DM while in game) ───────────────
let _inGamePendingUnsub = null;

export function watchPendingRequestsInGame(campaignId, onApprove, onDeny) {
    if (_inGamePendingUnsub) { _inGamePendingUnsub(); _inGamePendingUnsub = null; }
    const seenRequests = new Set();

    _inGamePendingUnsub = db.listenToPendingRequests(campaignId, pending => {
        if (!pending) return;
        Object.entries(pending).forEach(([uid, r]) => {
            if (seenRequests.has(uid)) return;
            seenRequests.add(uid);
            _showApprovalToast(campaignId, uid, r, onApprove, onDeny);
        });
    });
}

export function stopWatchingPendingRequests() {
    if (_inGamePendingUnsub) { _inGamePendingUnsub(); _inGamePendingUnsub = null; }
}

function _showApprovalToast(campaignId, uid, req, onApprove, onDeny) {
    const toast = document.createElement('div');
    toast.className = 'cr-toast campaign-request-toast';
    toast.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:9999;background:#1a1a2e;border:2px solid #f1c40f;border-radius:10px;padding:14px 16px;max-width:300px;box-shadow:0 4px 20px rgba(0,0,0,0.8);';
    toast.innerHTML = `
        <div style="color:#f1c40f;font-weight:bold;margin-bottom:6px;">🔔 בקשת גישה לקמפיין</div>
        <div style="color:#ccc;font-size:13px;margin-bottom:10px;"><strong>${_esc(req.playerName)}</strong> רוצה להצטרף כ<strong>${_esc(req.charName)}</strong></div>
        <div style="display:flex;gap:8px;">
            <button class="hover-btn" id="approve-${uid}" style="flex:1;background:#27ae60;color:white;padding:6px;border-radius:6px;font-size:12px;font-weight:bold;">✅ אשר</button>
            <button class="hover-btn" id="deny-${uid}" style="flex:1;background:#c0392b;color:white;padding:6px;border-radius:6px;font-size:12px;font-weight:bold;">❌ דחה</button>
        </div>
    `;
    document.body.appendChild(toast);

    toast.querySelector(`#approve-${uid}`).addEventListener('click', async () => {
        await db.approveCampaignPlayer(campaignId, uid);
        toast.remove();
        onApprove?.(uid, req);
    });
    toast.querySelector(`#deny-${uid}`).addEventListener('click', async () => {
        await db.denyCampaignRequest(campaignId, uid);
        toast.remove();
        onDeny?.(uid, req);
    });

    // Auto-dismiss after 60s
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 60000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function _relativeTime(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1)  return 'עכשיו';
    if (m < 60) return `לפני ${m} דקות`;
    if (h < 24) return `לפני ${h} שעות`;
    return `לפני ${d} ימים`;
}

function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _showToast(msg, type = 'info') {
    // Use global showToast if available, else fallback
    if (typeof window.showToast === 'function') {
        window.showToast(msg, type);
    } else {
        console.log(`[Campaign Toast] ${type}: ${msg}`);
    }
}
