// js/translator.js — Auto-translation service
//
// Translates arbitrary English text to Hebrew (or any target lang) on demand.
// Uses MyMemory public API — free, no API key, 5000 chars/day anonymous.
// All results cached in localStorage (prefix "tr:", TTL 30 days).
//
// Usage:
//   import { translateToHe, translateIfHe } from './translator.js';
//   const text = await translateToHe('The goblin scurries away.');
//   const text = await translateIfHe(rawEnglishString); // noop if lang !== 'he'

import { getLang } from './i18n.js';

const LS_PREFIX = 'tr:';
const TTL       = 30 * 24 * 60 * 60 * 1000; // 30 days
const API_BASE  = 'https://api.mymemory.translated.net/get';

// In-flight dedup: same text requested in parallel → one fetch
const _inflight = new Map();

// ── localStorage helpers ───────────────────────────────────────────────────────

function _lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const { ts, text } = JSON.parse(raw);
    if (Date.now() - ts > TTL) { localStorage.removeItem(LS_PREFIX + key); return null; }
    return text;
  } catch { return null; }
}

function _lsSet(key, text) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify({ ts: Date.now(), text })); }
  catch { /* quota exceeded — silent */ }
}

// ── Core translate ─────────────────────────────────────────────────────────────

/**
 * Translate English text to Hebrew.
 * Returns original text on error so UI never breaks.
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function translateToHe(text) {
  if (!text || !text.trim()) return text;

  const cacheKey = text.slice(0, 200); // use first 200 chars as cache key (enough to be unique)
  const cached   = _lsGet(cacheKey);
  if (cached) return cached;

  // Dedup concurrent calls for the same text
  if (_inflight.has(cacheKey)) return _inflight.get(cacheKey);

  const promise = (async () => {
    try {
      const url = `${API_BASE}?q=${encodeURIComponent(text)}&langpair=en|he`;
      const res  = await fetch(url);
      if (!res.ok) return text;
      const data = await res.json();
      const translated = data?.responseData?.translatedText;
      if (!translated || translated === text) return text;
      _lsSet(cacheKey, translated);
      return translated;
    } catch {
      return text; // network error — return original
    } finally {
      _inflight.delete(cacheKey);
    }
  })();

  _inflight.set(cacheKey, promise);
  return promise;
}

/**
 * Translate only when the UI language is Hebrew; otherwise return original text.
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function translateIfHe(text) {
  if (!text) return '';
  if (getLang() !== 'he') return text;
  return translateToHe(text);
}

/**
 * Translate an array of strings in parallel.
 * @param {string[]} texts
 * @returns {Promise<string[]>}
 */
export async function translateAllIfHe(texts) {
  return Promise.all(texts.map(t => translateIfHe(t)));
}
