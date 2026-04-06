// js/core/draggable.js — Reusable drag helper for popups/panels
// Usage: makeDraggable(popupElement, handleElement)

/**
 * Makes an element draggable via a handle element (e.g., header).
 * @param {HTMLElement} el — the element to move
 * @param {HTMLElement} handle — the drag handle (e.g., header bar)
 */
export function makeDraggable(el, handle) {
    if (!el || !handle) return;
    let _dx = 0, _dy = 0, _dragging = false;

    handle.style.cursor = 'grab';
    handle.style.userSelect = 'none';
    handle.style.webkitUserSelect = 'none';

    const onDown = (e) => {
        if (e.target.closest('button, input, select, a, .no-drag')) return;
        _dragging = true;
        handle.style.cursor = 'grabbing';
        const rect = el.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        _dx = clientX - rect.left;
        _dy = clientY - rect.top;
        e.preventDefault();
    };

    const onMove = (e) => {
        if (!_dragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const x = Math.max(0, Math.min(window.innerWidth - 50, clientX - _dx));
        const y = Math.max(0, Math.min(window.innerHeight - 30, clientY - _dy));
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.transform = 'none';
    };

    const onUp = () => {
        _dragging = false;
        handle.style.cursor = 'grab';
    };

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
}

/**
 * Ensures an element is scrollable if content overflows.
 * @param {HTMLElement} el — element to make scrollable
 * @param {number} maxH — max height in vh (default 70)
 */
export function makeScrollable(el, maxH = 70) {
    if (!el) return;
    el.style.maxHeight = maxH + 'vh';
    el.style.overflowY = 'auto';
}

/**
 * Ensures an element has a close button. Adds one if missing.
 * @param {HTMLElement} el — the popup/panel element
 * @param {Function} onClose — callback when close is clicked
 * @param {string} [existingCloseSelector] — selector for existing close button (skip if found)
 */
export function ensureCloseButton(el, onClose, existingCloseSelector) {
    if (!el) return;
    if (existingCloseSelector && el.querySelector(existingCloseSelector)) return;
    const btn = document.createElement('button');
    btn.className = 'popup-close-x';
    btn.textContent = '\u2715'; // ✕
    btn.title = 'Close';
    btn.style.cssText = 'position:absolute;top:6px;right:8px;background:none;border:none;color:#888;cursor:pointer;font-size:14px;padding:2px 5px;border-radius:4px;z-index:1;';
    btn.onmouseenter = () => { btn.style.color = '#fff'; btn.style.background = 'rgba(255,255,255,0.1)'; };
    btn.onmouseleave = () => { btn.style.color = '#888'; btn.style.background = 'none'; };
    btn.onclick = (e) => { e.stopPropagation(); onClose(); };
    el.style.position = el.style.position || 'relative';
    el.insertBefore(btn, el.firstChild);
}
