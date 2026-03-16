// js/videoLayer.js — YouTube Animated Background Layer
// Renders a YouTube video as the lowest layer of the map (below Canvas 2D grid/tokens).
// Stays pixel-perfectly aligned with the canvas world via CSS transform sync.
// ─────────────────────────────────────────────────────────────────────────────
//
// APPROACH: Plain <iframe> with embed URL params — no YT.Player / IFrame API.
// autoplay=1&mute=1&loop=1 in the URL handle playback without any postMessage.
// This avoids the origin mismatch errors from www-widgetapi.js.
//
// LAYER ORDER (inside #map-canvas-container):
//   z-index: 0  — #video-bg-layer  (this module — YouTube iframe)
//   z-index: 1  — #map-canvas      (Canvas 2D — grid, obstacles, transparent bg in video mode)
//   z-index: 2  — PixiJS canvas    (GPU tokens, particles)
//   z-index: 3  — #fow-canvas      (Fog of War)
//
// TRANSFORM SYNC MATH:
//   Canvas applies: ctx.translate(vx,vy); ctx.scale(vs,vs)
//   Background drawn at world coords (ox,oy), size mapW*pps × mapH*pps
//   Screen position of top-left = (vx + ox*vs, vy + oy*vs)
//   CSS element: natural size mapW*pps × mapH*pps, then:
//     transform: translate(vx+ox*vs px, vy+oy*vs px) scale(vs), transform-origin: 0 0
// ─────────────────────────────────────────────────────────────────────────────

export class VideoLayer {

  constructor() {
    this._el      = null;   // #video-bg-layer div
    this._inner   = null;   // #video-bg-inner div
    this._iframe  = null;   // the <iframe> element
    this._videoId = null;   // currently loaded video ID
    this._active  = false;  // true when a video is loaded and showing
  }

  // ── Static utility: parse YouTube video ID from any URL format ───────────
  static parseVideoId(urlOrId) {
    if (!urlOrId || typeof urlOrId !== 'string') return null;
    const s = urlOrId.trim();

    // Bare 11-character video ID (alphanumeric + - _)
    if (/^[A-Za-z0-9_\-]{11}$/.test(s)) return s;

    try {
      const url = new URL(s);
      // https://www.youtube.com/watch?v=VIDEO_ID
      if (url.hostname.includes('youtube.com') && url.searchParams.get('v')) {
        return url.searchParams.get('v');
      }
      // https://youtu.be/VIDEO_ID
      if (url.hostname === 'youtu.be') {
        return url.pathname.replace(/^\//, '').split('/')[0] || null;
      }
      // https://www.youtube.com/embed/VIDEO_ID
      if (url.hostname.includes('youtube.com') && url.pathname.startsWith('/embed/')) {
        return url.pathname.split('/embed/')[1]?.split('?')[0] || null;
      }
      // https://www.youtube.com/shorts/VIDEO_ID
      if (url.hostname.includes('youtube.com') && url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/shorts/')[1]?.split('?')[0] || null;
      }
    } catch (_) { /* not a URL */ }
    return null;
  }

  /**
   * Parse clip start/end and the YouTube `t=` share timestamp from a URL string.
   * Supports:
   *   ?start=30&end=60   — custom clip params (stored by CritRoll)
   *   ?t=30  or  ?t=1m30s — YouTube native share timestamp (used as start)
   * @returns {{ start: number, end: number|null }}
   */
  static parseClipParams(urlOrId) {
    if (!urlOrId || typeof urlOrId !== 'string') return { start: 0, end: null };
    try {
      const url = new URL(urlOrId.trim());
      const p = url.searchParams;

      // Explicit start/end stored by CritRoll
      const start = p.has('start') ? parseInt(p.get('start')) || 0 : null;
      const end   = p.has('end')   ? parseInt(p.get('end'))   || null : null;
      if (start !== null) return { start, end };

      // YouTube share timestamp  t=90  or  t=1m30s
      const t = p.get('t') || '';
      if (t) {
        const mMatch = t.match(/(?:(\d+)m)?(?:(\d+)s?)?/);
        const mins = parseInt(mMatch?.[1] || '0');
        const secs = parseInt(mMatch?.[2] || t);
        const ts = mins * 60 + (isNaN(secs) ? 0 : secs);
        if (ts > 0) return { start: ts, end: null };
      }
    } catch (_) { /* not a parseable URL */ }
    return { start: 0, end: null };
  }

  // ── init(containerEl): call once after DOM is ready ──────────────────────
  init(containerEl) {
    this._el    = containerEl.querySelector('#video-bg-layer') || document.getElementById('video-bg-layer');
    this._inner = containerEl.querySelector('#video-bg-inner') || document.getElementById('video-bg-inner');
    if (!this._el || !this._inner) {
      console.warn('[VideoLayer] #video-bg-layer not found in DOM.');
    }
  }

  // ── load(urlOrId): embed a YouTube video as a plain iframe ───────────────
  load(urlOrId) {
    if (!urlOrId) { this.unload(); return; }

    const id = VideoLayer.parseVideoId(urlOrId);
    if (!id) {
      this._showToast('Invalid YouTube URL. Please paste a youtube.com or youtu.be link.', 'warning');
      return;
    }

    const { start, end } = VideoLayer.parseClipParams(urlOrId);

    // Same video + same clip already playing — nothing to do
    if (id === this._videoId && this._active &&
        start === this._clipStart && end === this._clipEnd) return;

    this._videoId   = id;
    this._clipStart = start;
    this._clipEnd   = end;
    this._createIframe(id, start, end);
  }

  // ── unload(): remove the iframe and hide the layer ───────────────────────
  unload() {
    if (this._inner) this._inner.innerHTML = '';
    this._iframe  = null;
    this._videoId = null;
    this._active  = false;
    if (this._el) this._el.style.display = 'none';
  }

  // ── isActive(): true when a video iframe is loaded ───────────────────────
  isActive() {
    return this._active;
  }

  // ── syncTransform(vx, vy, vs, ox, oy, pps, mapW, mapH) ──────────────────
  // Called every render frame from mapEngine._render() (after ctx.restore()).
  syncTransform(vx, vy, vs, ox, oy, pps, mapW, mapH) {
    if (!this._el || !this._active) return;
    const w  = Math.max(1, mapW) * pps;
    const h  = Math.max(1, mapH) * pps;
    const tx = vx + ox * vs;
    const ty = vy + oy * vs;
    this._el.style.cssText = [
      'position:absolute', 'top:0', 'left:0',
      `width:${w}px`, `height:${h}px`,
      'transform-origin:0 0',
      `transform:translate(${tx}px,${ty}px) scale(${vs})`,
      'pointer-events:none',
      'overflow:hidden',
      'z-index:0',
      'display:block',
    ].join(';');

    // Scale the 1920×1080 iframe to cover the tile area.
    // YouTube serves HD quality based on the iframe's native DOM size (1920×1080).
    // We scale it down via CSS transform so it covers the map tile, preserving HD.
    if (this._inner) {
      const scaleX = w / 1920;
      const scaleY = h / 1080;
      const s = Math.max(scaleX, scaleY); // cover: fill tile, crop excess
      const offsetX = (w - 1920 * s) / 2;
      const offsetY = (h - 1080 * s) / 2;
      this._inner.style.cssText = [
        'position:absolute',
        `left:${offsetX}px`, `top:${offsetY}px`,
        'width:1920px', 'height:1080px',
        'transform-origin:0 0',
        `transform:scale(${s})`,
      ].join(';');
    }
  }

  // ── Private: create and inject the <iframe> ───────────────────────────────
  _createIframe(videoId, start = 0, end = null) {
    if (!this._inner) return;

    // Build embed URL — no enablejsapi, no origin param → no postMessage traffic
    const params = [
      '?autoplay=1',
      '&mute=1',
      '&loop=1',
      `&playlist=${videoId}`,  // required for single-video loop
      '&controls=0',
      '&modestbranding=1',
      '&playsinline=1',        // prevents iOS full-screen takeover
      '&rel=0',
      '&iv_load_policy=3',     // hide video annotations
      '&vq=hd1080',            // request 1080p quality
      '&hd=1',                 // prefer HD
    ];
    // Clip parameters — start/end keep the loop short and buffer-friendly
    if (start > 0)  params.push(`&start=${start}`);
    if (end   > 0)  params.push(`&end=${end}`);

    const src = `https://www.youtube.com/embed/${videoId}` + params.join('');

    const iframe = document.createElement('iframe');
    iframe.src   = src;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.setAttribute('allowfullscreen', 'false');
    // Fixed 1920×1080 natural size — YouTube serves HD quality based on DOM size.
    // The outer div (_inner) is CSS-scaled to cover the map tile area each frame.
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:1920px;height:1080px;border:none;pointer-events:none;';

    this._inner.innerHTML = '';
    this._inner.appendChild(iframe);
    this._iframe = iframe;
    this._active = true;
    if (this._el) this._el.style.display = 'block';
  }

  // ── Private: show a toast via app's global if available ──────────────────
  _showToast(msg, type = 'info') {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
    else console.warn('[VideoLayer]', msg);
  }
}
