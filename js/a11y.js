// a11y.js — Israeli accessibility compliance (נגישות)
import { t } from "./i18n.js";

let _panelOpen = false;
let _fontSize = 0; // 0 = normal, 1 = large, 2 = extra large
let _highContrast = false;
let _noAnimations = false;
let _initialized = false;

window._toggleA11yPanel = function() {
    _panelOpen = !_panelOpen;
    let panel = document.getElementById('a11y-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'a11y-panel';
        panel.style.cssText = 'position:fixed;bottom:56px;left:14px;z-index:4500;background:rgba(10,10,20,0.97);border:1px solid rgba(52,152,219,0.5);border-radius:10px;padding:14px;width:220px;box-shadow:0 10px 40px rgba(0,0,0,0.8);';
        panel.innerHTML = `
            <div style="font-weight:bold;color:#3498db;font-size:13px;margin-bottom:10px;">${t('a11y_title')}</div>
            <button id="a11y-font-btn" class="a11y-opt-btn" style="width:100%;padding:8px;margin-bottom:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#ccc;cursor:pointer;text-align:start;font-size:12px;">🔤 ${t('a11y_font_size')}</button>
            <button id="a11y-contrast-btn" class="a11y-opt-btn" style="width:100%;padding:8px;margin-bottom:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#ccc;cursor:pointer;text-align:start;font-size:12px;">🌓 ${t('a11y_high_contrast')}</button>
            <button id="a11y-anim-btn" class="a11y-opt-btn" style="width:100%;padding:8px;margin-bottom:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#ccc;cursor:pointer;text-align:start;font-size:12px;">⏸️ ${t('a11y_stop_animations')}</button>
        `;
        document.body.appendChild(panel);
    }

    if (!_initialized) {
        _initialized = true;

        panel.addEventListener('click', (e) => {
            const btn = e.target.closest('.a11y-opt-btn');
            if (!btn) return;

            if (btn.id === 'a11y-font-btn') {
                _fontSize = (_fontSize + 1) % 3;
                document.documentElement.style.fontSize = ['16px', '20px', '24px'][_fontSize];
                btn.style.background = _fontSize ? 'rgba(52,152,219,0.2)' : 'rgba(255,255,255,0.05)';
            } else if (btn.id === 'a11y-contrast-btn') {
                _highContrast = !_highContrast;
                document.body.classList.toggle('a11y-high-contrast', _highContrast);
                btn.style.background = _highContrast ? 'rgba(52,152,219,0.2)' : 'rgba(255,255,255,0.05)';
            } else if (btn.id === 'a11y-anim-btn') {
                _noAnimations = !_noAnimations;
                document.body.classList.toggle('a11y-no-animations', _noAnimations);
                btn.style.background = _noAnimations ? 'rgba(52,152,219,0.2)' : 'rgba(255,255,255,0.05)';
            }
        });
    }

    panel.style.display = _panelOpen ? 'block' : 'none';
};
