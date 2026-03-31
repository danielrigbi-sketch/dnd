// js/core/domUtils.js — Shared DOM helpers used across the codebase
//
// Replaces 4 separate debounce implementations and provides a cached getElementById.

/** Element cache for $(id) — avoids repeated DOM lookups */
const _elCache = new Map();

/**
 * Cached document.getElementById — subsequent calls for the same id return
 * the cached reference. Call $.clear() if the DOM is rebuilt (rare in this SPA).
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function $(id) {
    if (_elCache.has(id)) return _elCache.get(id);
    const el = document.getElementById(id);
    if (el) _elCache.set(id, el);
    return el;
}
$.clear = () => _elCache.clear();

/**
 * Debounce — delays fn until ms after the last call.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
export function debounce(fn, ms) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/**
 * Throttle — executes fn at most once per ms interval.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
export function throttle(fn, ms) {
    let last = 0;
    let timer = null;
    return (...args) => {
        const now = Date.now();
        const remaining = ms - (now - last);
        clearTimeout(timer);
        if (remaining <= 0) {
            last = now;
            fn(...args);
        } else {
            timer = setTimeout(() => { last = Date.now(); fn(...args); }, remaining);
        }
    };
}
