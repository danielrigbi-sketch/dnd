// js/core/sanitize.js — Unified HTML escaping for the entire codebase
//
// IMPORTANT: This is the ONLY escape function the project should use.
// All local _esc() definitions in other files must be replaced with this import.
// The JS-string-escape variant (replacing \ and ') is WRONG for HTML contexts.

/**
 * Escape a string for safe insertion into HTML.
 * Handles the OWASP-recommended five characters: & < > " '
 * @param {*} s — value to escape (coerced to string; nullish → '')
 * @returns {string}
 */
export function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Escape a value for safe embedding inside a JS string literal within an HTML attribute.
 * Use sparingly — prefer data-* attributes + delegated listeners over onclick="...".
 * @param {*} s
 * @returns {string}
 */
export function escapeJSString(s) {
    return String(s ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}
