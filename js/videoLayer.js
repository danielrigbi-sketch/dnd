// js/videoLayer.js — YouTube Animated Background Layer
// Renders a YouTube video as the lowest layer of the map (below Canvas 2D grid/tokens).
// Stays pixel-perfectly aligned with the canvas world via CSS transform sync.
// ─────────────────────────────────────────────────────────────────────────────
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
//   Screen position of background top-left = (vx + ox*vs, vy + oy*vs)
//   CSS element: natural size mapW*pps × mapH*pps, then:
//     transform: translate(vx+ox*vs px, vy+oy*vs px) scale(vs), transform-origin: 0 0
//   This maps the element to the exact same screen rectangle as the canvas background.
// ─────────────────────────────────────────────────────────────────────────────

export class VideoLayer {

  constructor() {
    this._el       = null;   // #video-bg-layer div
    this._inner    = null;   // #video-bg-inner div
    this._player   = null;   // YT.Player instance
    this._videoId  = null;   // currently loaded video ID
    this._active   = false;  // true when a video is loaded and showing
    this._apiReady = false;  // true when YouTube IFrame API script is loaded
    this._pendingVideoId = null; // queued if API isn't ready yet
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
    } catch (_) {
      // Not a valid URL — not a bare ID either (already checked above)
    }
    return null;
  }

  // ── init(containerEl): call once after DOM is ready ──────────────────────
  // containerEl = the #map-canvas-container element
  init(containerEl) {
    this._el    = containerEl.querySelector('#video-bg-layer') || document.getElementById('video-bg-layer');
    this._inner = containerEl.querySelector('#video-bg-inner') || document.getElementById('video-bg-inner');
    if (!this._el || !this._inner) {
      console.warn('[VideoLayer] #video-bg-layer not found in DOM.');
      return;
    }
    this._loadYTApi();
  }

  // ── load(urlOrId): embed and play a YouTube video ────────────────────────
  load(urlOrId) {
    const id = VideoLayer.parseVideoId(urlOrId);
    if (!id) {
      this._showToast('Invalid YouTube URL. Please paste a youtube.com or youtu.be link.', 'warning');
      return;
    }
    // Same video already playing — nothing to do
    if (id === this._videoId && this._active) return;

    this._videoId = id;

    if (!this._apiReady) {
      // API not yet loaded — queue and wait for onYouTubeIframeAPIReady
      this._pendingVideoId = id;
      this._loadYTApi();
      return;
    }
    this._createPlayer(id);
  }

  // ── unload(): stop the video and hide the layer ──────────────────────────
  unload() {
    this._destroyPlayer();
    this._videoId = null;
    this._active  = false;
    this._pendingVideoId = null;
    if (this._el) this._el.style.display = 'none';
  }

  // ── isActive(): returns true when a video is currently displayed ─────────
  isActive() {
    return this._active;
  }

  // ── syncTransform(vx, vy, vs, ox, oy, pps, mapW, mapH) ──────────────────
  // Called every render frame from mapEngine._render() to keep the iframe
  // perfectly aligned with the canvas world transform.
  syncTransform(vx, vy, vs, ox, oy, pps, mapW, mapH) {
    if (!this._el || !this._active) return;
    const w = Math.max(1, mapW) * pps;
    const h = Math.max(1, mapH) * pps;
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
  }

  // ── Private: load the YouTube IFrame API script lazily ───────────────────
  _loadYTApi() {
    // Already ready
    if (window.YT && window.YT.Player) {
      this._apiReady = true;
      return;
    }
    // Script tag already added to DOM (another instance is loading)
    if (document.getElementById('yt-iframe-api-script')) return;

    const tag = document.createElement('script');
    tag.id  = 'yt-iframe-api-script';
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);

    // YouTube IFrame API calls this global when ready
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      this._apiReady = true;
      if (typeof prev === 'function') prev();
      if (this._pendingVideoId) {
        const id = this._pendingVideoId;
        this._pendingVideoId = null;
        this._createPlayer(id);
      }
    };
  }

  // ── Private: instantiate YT.Player ───────────────────────────────────────
  _createPlayer(videoId) {
    this._destroyPlayer();

    // Create a fresh target div for YT.Player
    const target = document.createElement('div');
    target.id = 'yt-player-target-' + Date.now();
    if (this._inner) {
      this._inner.innerHTML = '';
      this._inner.appendChild(target);
    }

    const embedUrl = [
      `https://www.youtube.com/embed/${videoId}`,
      '?autoplay=1',
      '&mute=1',
      '&loop=1',
      `&playlist=${videoId}`,   // required for loop=1 on a single video
      '&controls=0',
      '&modestbranding=1',
      '&playsinline=1',          // prevents iOS full-screen takeover
      '&rel=0',
      '&enablejsapi=1',
      '&origin=' + encodeURIComponent(window.location.origin),
    ].join('');

    try {
      this._player = new window.YT.Player(target.id, {
        videoId,
        playerVars: {
          autoplay:       1,
          mute:           1,
          loop:           1,
          playlist:       videoId,
          controls:       0,
          modestbranding: 1,
          playsinline:    1,
          rel:            0,
        },
        events: {
          onReady: (e) => {
            e.target.mute();      // guarantee muted (browser policy)
            e.target.playVideo(); // start playback
            this._active = true;
            if (this._el) this._el.style.display = 'block';
          },
          onError: (e) => {
            const msgs = {
              2:   'Invalid YouTube video ID.',
              5:   'YouTube HTML5 player error.',
              100: 'Video not found or private.',
              101: 'This video cannot be embedded.',
              150: 'This video cannot be embedded.',
            };
            const msg = msgs[e.data] || `YouTube error (code ${e.data}).`;
            this._showToast(`🎬 ${msg}`, 'warning');
            this.unload();
          },
        },
      });
    } catch (err) {
      console.error('[VideoLayer] YT.Player creation failed:', err);
      this._showToast('Could not create YouTube player. Check your connection or browser settings.', 'warning');
    }
  }

  // ── Private: cleanly destroy an existing YT.Player instance ─────────────
  _destroyPlayer() {
    if (this._player) {
      try {
        this._player.stopVideo();
        this._player.destroy();
      } catch (_) { /* player may already be gone */ }
      this._player = null;
    }
    this._active = false;
    if (this._inner) this._inner.innerHTML = '';
  }

  // ── Private: show a toast if the app exposes window.showToast ────────────
  _showToast(msg, type = 'info') {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
    else console.warn('[VideoLayer]', msg);
  }
}
