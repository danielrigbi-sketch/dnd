// videoChatUI.js — Floating video chat overlay panel
import { t } from './i18n.js';

let _panel = null;
let _grid = null;
let _controls = null;
let _header = null;
let _minimized = false;
let _role = null;
let _callbacks = {};
let _localUid = null;
let _enabled = true;

// tile map: uid → { container, video, nameEl, muteIcon, cameraIcon }
const _tiles = new Map();

// ── Drag state ───────────────────────────────────────────────────────────
let _dragOffsetX = 0, _dragOffsetY = 0, _dragging = false;

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Create the video chat panel DOM. Does not show it — call showVCPanel() after joinCall().
 */
export function createVideoChatPanel(role, callbacks) {
    if (_panel) return; // already created
    _role = role;
    _callbacks = callbacks;

    _panel = document.createElement('div');
    _panel.id = 'video-chat-panel';
    _panel.className = 'vc-panel vc-hidden';

    // Header
    _header = document.createElement('div');
    _header.className = 'vc-header';

    const title = document.createElement('span');
    title.className = 'vc-title';
    title.textContent = t('vc_title');

    const headerBtns = document.createElement('div');
    headerBtns.className = 'vc-header-btns';

    // DM gear icon
    if (role === 'dm') {
        const gearBtn = document.createElement('button');
        gearBtn.className = 'vc-header-btn vc-gear-btn';
        gearBtn.title = '⚙';
        gearBtn.textContent = '⚙';
        gearBtn.onclick = _toggleDMDropdown;
        headerBtns.appendChild(gearBtn);

        // DM dropdown (hidden by default)
        const dropdown = document.createElement('div');
        dropdown.className = 'vc-dm-dropdown vc-hidden';
        dropdown.id = 'vc-dm-dropdown';

        const enableLabel = document.createElement('label');
        enableLabel.className = 'vc-dm-option';
        const enableCb = document.createElement('input');
        enableCb.type = 'checkbox';
        enableCb.checked = true;
        enableCb.id = 'vc-enable-checkbox';
        enableCb.onchange = () => {
            _enabled = enableCb.checked;
            _callbacks.onEnableToggle?.(enableCb.checked);
        };
        enableLabel.appendChild(enableCb);
        enableLabel.appendChild(document.createTextNode(' ' + t('vc_enable')));
        dropdown.appendChild(enableLabel);

        const muteAllBtn = document.createElement('button');
        muteAllBtn.className = 'vc-dm-mute-all-btn';
        muteAllBtn.textContent = t('vc_mute_all');
        muteAllBtn.onclick = () => _callbacks.onMuteAll?.();
        dropdown.appendChild(muteAllBtn);

        _panel.appendChild(dropdown);
    }

    // Minimize button
    const minBtn = document.createElement('button');
    minBtn.className = 'vc-header-btn';
    minBtn.textContent = '−';
    minBtn.title = t('vc_minimize');
    minBtn.onclick = _toggleMinimize;
    headerBtns.appendChild(minBtn);

    // Close (leave) button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'vc-header-btn vc-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.title = t('vc_leave');
    closeBtn.onclick = () => _callbacks.onLeave?.();
    headerBtns.appendChild(closeBtn);

    _header.appendChild(title);
    _header.appendChild(headerBtns);
    _panel.appendChild(_header);

    // Make header draggable
    _header.addEventListener('mousedown', _startDrag);
    _header.addEventListener('touchstart', _startDrag, { passive: false });

    // Video grid
    _grid = document.createElement('div');
    _grid.className = 'vc-grid';
    _panel.appendChild(_grid);

    // Controls bar
    _controls = document.createElement('div');
    _controls.className = 'vc-controls';

    const micBtn = _makeControlBtn('vc-mic-btn', t('vc_mute_mic'), '🎤', () => {
        const muted = _callbacks.onToggleMic?.();
        micBtn.classList.toggle('vc-btn-off', muted);
        micBtn.title = muted ? t('vc_unmute_mic') : t('vc_mute_mic');
    });

    const camBtn = _makeControlBtn('vc-cam-btn', t('vc_camera_off'), '📷', () => {
        const muted = _callbacks.onToggleCamera?.();
        camBtn.classList.toggle('vc-btn-off', muted);
        camBtn.title = muted ? t('vc_camera_on') : t('vc_camera_off');
    });

    const leaveBtn = _makeControlBtn('vc-leave-btn', t('vc_leave'), '📞', () => {
        _callbacks.onLeave?.();
    });
    leaveBtn.classList.add('vc-leave-control');

    _controls.appendChild(micBtn);
    _controls.appendChild(camBtn);
    _controls.appendChild(leaveBtn);
    _panel.appendChild(_controls);

    // Participant count badge
    const badge = document.createElement('span');
    badge.className = 'vc-participant-count';
    badge.id = 'vc-participant-count';
    badge.textContent = '0';
    _header.insertBefore(badge, _header.querySelector('.vc-header-btns'));

    document.body.appendChild(_panel);
}

/**
 * Set the local video stream and create the local tile.
 */
export function setLocalStream(stream, uid, displayName) {
    _localUid = uid;
    if (_tiles.has(uid)) {
        // Update existing tile
        const tile = _tiles.get(uid);
        if (tile.video && stream) {
            tile.video.srcObject = stream;
        }
        return;
    }
    _addTile(uid, displayName + ' ' + t('vc_you'), stream, true);
}

/**
 * Add or update a remote participant's video tile.
 */
export function addVideoTile(uid, displayName, stream) {
    if (_tiles.has(uid)) {
        // Update stream if provided
        const tile = _tiles.get(uid);
        if (stream && tile.video) {
            tile.video.srcObject = stream;
        }
        return;
    }
    _addTile(uid, displayName, stream, false);
    _updateGridLayout();
}

/**
 * Remove a participant's video tile.
 */
export function removeVideoTile(uid) {
    const tile = _tiles.get(uid);
    if (tile) {
        if (tile.video) tile.video.srcObject = null;
        tile.container.remove();
        _tiles.delete(uid);
        _updateGridLayout();
    }
}

/**
 * Update mute indicators on a tile.
 */
export function updateTileMuteState(uid, audioMuted, videoMuted) {
    const tile = _tiles.get(uid);
    if (!tile) return;
    tile.muteIcon.style.display = audioMuted ? 'block' : 'none';
    if (videoMuted) {
        tile.video.style.display = 'none';
        tile.placeholder.style.display = 'flex';
    } else {
        tile.video.style.display = 'block';
        tile.placeholder.style.display = 'none';
    }
}

/**
 * Show a name placeholder when camera is off.
 */
export function setCameraOffPlaceholder(uid, displayName) {
    const tile = _tiles.get(uid);
    if (!tile) return;
    tile.placeholderText.textContent = displayName?.charAt(0)?.toUpperCase() || '?';
}

/**
 * Update the participant count badge.
 */
export function updateParticipantCount(count) {
    const badge = document.getElementById('vc-participant-count');
    if (badge) badge.textContent = String(count);
}

/**
 * Show the video chat panel.
 */
export function showVCPanel() {
    if (_panel) _panel.classList.remove('vc-hidden');
}

/**
 * Hide the video chat panel.
 */
export function hideVCPanel() {
    if (_panel) _panel.classList.add('vc-hidden');
    // Clear all tiles
    for (const [uid, tile] of _tiles) {
        if (tile.video) tile.video.srcObject = null;
        tile.container.remove();
    }
    _tiles.clear();
}

/**
 * Fully remove the panel from DOM.
 */
export function destroyVideoChatPanel() {
    hideVCPanel();
    if (_panel) {
        _panel.remove();
        _panel = null;
    }
    _grid = null;
    _controls = null;
    _header = null;
    _tiles.clear();
}

// ── Internal helpers ─────────────────────────────────────────────────────

function _addTile(uid, displayName, stream, isLocal) {
    const container = document.createElement('div');
    container.className = 'vc-tile' + (isLocal ? ' vc-tile-local' : '');
    container.dataset.uid = uid;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    if (isLocal) video.muted = true; // mute local playback to avoid echo
    if (stream) video.srcObject = stream;

    const nameEl = document.createElement('div');
    nameEl.className = 'vc-tile-name';
    nameEl.textContent = displayName || '';

    const muteIcon = document.createElement('div');
    muteIcon.className = 'vc-tile-mute';
    muteIcon.textContent = '🔇';
    muteIcon.style.display = 'none';

    // Camera off placeholder
    const placeholder = document.createElement('div');
    placeholder.className = 'vc-tile-placeholder';
    placeholder.style.display = 'none';
    const placeholderText = document.createElement('span');
    placeholderText.className = 'vc-tile-placeholder-text';
    placeholderText.textContent = displayName?.charAt(0)?.toUpperCase() || '?';
    placeholder.appendChild(placeholderText);

    container.appendChild(video);
    container.appendChild(placeholder);
    container.appendChild(nameEl);
    container.appendChild(muteIcon);
    _grid.appendChild(container);

    _tiles.set(uid, { container, video, nameEl, muteIcon, placeholder, placeholderText });
}

function _makeControlBtn(id, title, emoji, onclick) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.className = 'vc-control-btn';
    btn.title = title;
    btn.textContent = emoji;
    btn.onclick = onclick;
    return btn;
}

function _updateGridLayout() {
    if (!_grid) return;
    const count = _tiles.size;
    // Set CSS custom property for grid columns
    let cols = 1;
    if (count >= 5) cols = 3;
    else if (count >= 3) cols = 2;
    else if (count >= 2) cols = 2;
    _grid.style.setProperty('--vc-cols', String(cols));
}

function _toggleMinimize() {
    _minimized = !_minimized;
    if (_panel) _panel.classList.toggle('vc-minimized', _minimized);
}

function _toggleDMDropdown() {
    const dd = document.getElementById('vc-dm-dropdown');
    if (dd) dd.classList.toggle('vc-hidden');
}

// ── Dragging ─────────────────────────────────────────────────────────────

function _startDrag(e) {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    _dragging = true;
    const rect = _panel.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    _dragOffsetX = clientX - rect.left;
    _dragOffsetY = clientY - rect.top;
    document.addEventListener('mousemove', _onDrag);
    document.addEventListener('mouseup', _stopDrag);
    document.addEventListener('touchmove', _onDrag, { passive: false });
    document.addEventListener('touchend', _stopDrag);
    e.preventDefault();
}

function _onDrag(e) {
    if (!_dragging || !_panel) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = Math.max(0, Math.min(window.innerWidth - 100, clientX - _dragOffsetX));
    const y = Math.max(0, Math.min(window.innerHeight - 50, clientY - _dragOffsetY));
    _panel.style.left = x + 'px';
    _panel.style.top = y + 'px';
    _panel.style.right = 'auto'; // override default right positioning
}

function _stopDrag() {
    _dragging = false;
    document.removeEventListener('mousemove', _onDrag);
    document.removeEventListener('mouseup', _stopDrag);
    document.removeEventListener('touchmove', _onDrag);
    document.removeEventListener('touchend', _stopDrag);
}
