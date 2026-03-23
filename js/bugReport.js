// bugReport.js — In-app bug report form
import { getDatabase, ref, push, set } from "firebase/database";
import { getAuth } from "firebase/auth";
import { t } from "./i18n.js";
import { getCurrentSub } from "./subscriptionService.js";

const db = getDatabase();
const auth = getAuth();

window._openBugReport = function() {
    let modal = document.getElementById('bug-report-modal');
    if (modal) { modal.style.display = 'flex'; return; }

    modal = document.createElement('div');
    modal.id = 'bug-report-modal';
    modal.className = 'modal-overlay flex-center';
    modal.style.zIndex = '8000';
    modal.innerHTML = `
        <div style="background:linear-gradient(180deg,#1a1a2e,#0a0a1a);border:1px solid rgba(52,152,219,0.4);border-radius:12px;padding:20px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.9);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <span style="font-weight:bold;color:#3498db;font-size:14px;" data-i18n="bug_report_title">${t('bug_report_title')}</span>
                <button onclick="document.getElementById('bug-report-modal').style.display='none'" style="background:none;border:none;color:#666;cursor:pointer;font-size:18px;">✕</button>
            </div>
            <div style="display:flex;gap:6px;margin-bottom:10px;">
                <button class="bug-cat-btn active" data-cat="bug" style="flex:1;padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(52,152,219,0.2);color:#3498db;cursor:pointer;font-size:11px;">${t('bug_category_bug')}</button>
                <button class="bug-cat-btn" data-cat="feature" style="flex:1;padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#aaa;cursor:pointer;font-size:11px;">${t('bug_category_feature')}</button>
                <button class="bug-cat-btn" data-cat="other" style="flex:1;padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#aaa;cursor:pointer;font-size:11px;">${t('bug_category_other')}</button>
            </div>
            <textarea id="bug-desc" rows="5" placeholder="${t('bug_description_ph')}" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#ccc;padding:10px;font-size:12px;resize:vertical;font-family:inherit;"></textarea>
            <button id="bug-submit-btn" style="margin-top:10px;width:100%;padding:10px;border-radius:8px;background:#3498db;color:#fff;border:none;cursor:pointer;font-weight:bold;font-size:13px;">${t('bug_submit')}</button>
        </div>
    `;
    document.body.appendChild(modal);

    let selectedCat = 'bug';
    modal.addEventListener('click', (e) => {
        const btn = e.target.closest('.bug-cat-btn');
        if (!btn) return;
        modal.querySelectorAll('.bug-cat-btn').forEach(b => {
            b.style.background = 'rgba(255,255,255,0.05)';
            b.style.color = '#aaa';
            b.classList.remove('active');
        });
        btn.style.background = 'rgba(52,152,219,0.2)';
        btn.style.color = '#3498db';
        btn.classList.add('active');
        selectedCat = btn.dataset.cat;
    });

    document.getElementById('bug-submit-btn').addEventListener('click', async () => {
        const desc = document.getElementById('bug-desc')?.value.trim();
        if (!desc) return;
        const user = auth.currentUser;
        if (!user) return;
        const sub = getCurrentSub();
        const report = {
            userId: user.uid,
            userEmail: user.email || '',
            userTier: sub.tier,
            category: selectedCat,
            description: desc,
            browser: navigator.userAgent,
            screenSize: `${window.innerWidth}x${window.innerHeight}`,
            page: window.location.pathname,
            status: 'open',
            createdAt: Date.now(),
        };
        try {
            const reportRef = push(ref(db, 'admin/bugReports'));
            await set(reportRef, report);
            document.getElementById('bug-desc').value = '';
            const btn = document.getElementById('bug-submit-btn');
            btn.textContent = t('bug_submitted');
            btn.style.background = '#27ae60';
            setTimeout(() => {
                modal.style.display = 'none';
                btn.textContent = t('bug_submit');
                btn.style.background = '#3498db';
            }, 2000);
        } catch (err) {
            console.error('Bug report failed:', err);
        }
    });
};
