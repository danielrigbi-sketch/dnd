// videoChat.js — WebRTC peer-to-peer mesh video chat with Firebase RTDB signaling
import * as db from './firebaseService.js';
import { t } from './i18n.js';
import { createVideoChatPanel, addVideoTile, removeVideoTile, updateTileMuteState, destroyVideoChatPanel, setLocalStream as uiSetLocalStream, showVCPanel, hideVCPanel, updateParticipantCount, setCameraOffPlaceholder } from './videoChatUI.js';

// ── ICE configuration (free Google STUN) ────────────────────────────────
const ICE_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ── Module state ─────────────────────────────────────────────────────────
let _roomCode = null;
let _uid = null;
let _displayName = null;
let _role = null;           // 'dm' | 'player'
let _inCall = false;
let _localStream = null;
let _audioMuted = false;
let _videoMuted = false;

// Map<remoteUid, { pc: RTCPeerConnection, stream: MediaStream }>
const _peers = new Map();

// Firebase listener unsubscribers
const _unsubs = [];

// Retry counters per peer
const _retries = new Map();
const MAX_RETRIES = 2;

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Initialize video chat module — sets up enabled listener but does NOT start media.
 */
export function initVideoChat(roomCode, uid, displayName, role) {
    _roomCode = roomCode;
    _uid = uid;
    _displayName = displayName;
    _role = role;

    // Create the UI panel (hidden until joinCall)
    createVideoChatPanel(role, {
        onToggleMic: toggleMic,
        onToggleCamera: toggleCamera,
        onLeave: leaveCall,
        onEnableToggle: _handleDMEnableToggle,
        onMuteAll: _handleDMMuteAll
    });

    // Listen to DM enabled/disabled state
    const unsubEnabled = db.listenToVideoChatEnabled(_roomCode, (enabled) => {
        const btn = document.getElementById('vc-toggle-btn');
        const ptBtn = document.getElementById('pt-vc-btn');
        const dmBtn = document.getElementById('dm-vc-btn');
        if (enabled === false && _role !== 'dm') {
            // DM disabled video chat — leave if in call, hide buttons
            if (_inCall) leaveCall();
            if (btn) btn.style.display = 'none';
            if (ptBtn) ptBtn.style.display = 'none';
            if (dmBtn) dmBtn.style.display = 'none';
            window.showToast?.(t('vc_dm_disabled'), 'info');
        } else {
            if (btn) btn.style.display = '';
            if (ptBtn) ptBtn.style.display = '';
            if (dmBtn) dmBtn.style.display = '';
        }
    });
    _unsubs.push(unsubEnabled);

    // Listen to muteAll signal
    const unsubMuteAll = db.listenToVideoChatMuteAll(_roomCode, (muteAll) => {
        if (muteAll && _inCall && !_audioMuted) {
            _audioMuted = true;
            if (_localStream) {
                _localStream.getAudioTracks().forEach(t => t.enabled = false);
            }
            db.updateVideoChatParticipant(_roomCode, _uid, { audioMuted: true });
            updateTileMuteState(_uid, true, _videoMuted);
            window.showToast?.(t('vc_dm_muted_all'), 'info');
            // Reset the flag so it can be triggered again
            if (_role === 'dm') {
                db.setVideoChatMuteAll(_roomCode, false);
            }
        }
    });
    _unsubs.push(unsubMuteAll);
}

/**
 * Join the video call — acquires media + starts peer connections.
 */
export async function joinCall() {
    if (_inCall || !_roomCode) return;

    // Acquire local media
    try {
        _localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
            audio: true
        });
    } catch (err) {
        // Try audio-only fallback
        if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
            try {
                _localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                _videoMuted = true;
                window.showToast?.(t('vc_no_camera'), 'info');
            } catch (audioErr) {
                window.showToast?.(t('vc_no_mic'), 'error');
                return;
            }
        } else {
            window.showToast?.(t('vc_no_mic'), 'error');
            return;
        }
    }

    _inCall = true;
    _audioMuted = false;
    if (!_videoMuted) _videoMuted = false;

    // Show panel + local video
    uiSetLocalStream(_localStream, _uid, _displayName);
    showVCPanel();

    // Write participant entry to Firebase
    db.setVideoChatParticipant(_roomCode, _uid, {
        displayName: _displayName,
        joinedAt: Date.now(),
        audioMuted: _audioMuted,
        videoMuted: _videoMuted
    });

    // Listen for other participants
    const unsubParticipants = db.listenToVideoChatParticipants(
        _roomCode,
        _onParticipantAdded,
        _onParticipantRemoved
    );
    _unsubs.push(unsubParticipants);

    // Update toolbar button state
    _updateToolbarButtons(true);
}

/**
 * Leave the video call — stops media, closes connections, cleans up Firebase.
 */
export function leaveCall() {
    if (!_inCall) return;
    _inCall = false;

    // Close all peer connections
    for (const [uid, peer] of _peers) {
        _closePeer(uid);
    }
    _peers.clear();
    _retries.clear();

    // Stop local media
    if (_localStream) {
        _localStream.getTracks().forEach(track => track.stop());
        _localStream = null;
    }

    // Remove from Firebase
    if (_roomCode && _uid) {
        db.removeVideoChatParticipant(_roomCode, _uid);
        db.clearWebRTCSignaling(_roomCode, _uid);
    }

    // Hide panel
    hideVCPanel();
    _updateToolbarButtons(false);
}

/**
 * Toggle microphone mute state.
 */
export function toggleMic() {
    if (!_localStream) return;
    _audioMuted = !_audioMuted;
    _localStream.getAudioTracks().forEach(track => track.enabled = !_audioMuted);
    if (_roomCode && _uid) {
        db.updateVideoChatParticipant(_roomCode, _uid, { audioMuted: _audioMuted });
    }
    updateTileMuteState(_uid, _audioMuted, _videoMuted);
    return _audioMuted;
}

/**
 * Toggle camera on/off.
 */
export function toggleCamera() {
    if (!_localStream) return;
    _videoMuted = !_videoMuted;
    _localStream.getVideoTracks().forEach(track => track.enabled = !_videoMuted);
    if (_roomCode && _uid) {
        db.updateVideoChatParticipant(_roomCode, _uid, { videoMuted: _videoMuted });
    }
    updateTileMuteState(_uid, _audioMuted, _videoMuted);
    if (_videoMuted) {
        setCameraOffPlaceholder(_uid, _displayName);
    }
    return _videoMuted;
}

/** Check if currently in a call. */
export function isInCall() { return _inCall; }

/**
 * Full cleanup — call when leaving the room entirely.
 */
export function destroyVideoChat() {
    leaveCall();
    // Unsubscribe all Firebase listeners
    _unsubs.forEach(u => { try { u?.(); } catch(_){} });
    _unsubs.length = 0;
    destroyVideoChatPanel();
    _roomCode = null;
    _uid = null;
    _displayName = null;
    _role = null;
}

// ── DM controls ──────────────────────────────────────────────────────────

function _handleDMEnableToggle(enabled) {
    if (_role !== 'dm' || !_roomCode) return;
    db.setVideoChatEnabled(_roomCode, enabled);
}

function _handleDMMuteAll() {
    if (_role !== 'dm' || !_roomCode) return;
    db.setVideoChatMuteAll(_roomCode, true);
}

// ── Peer connection management ───────────────────────────────────────────

function _onParticipantAdded(remoteUid, data) {
    if (remoteUid === _uid) return; // skip self
    if (_peers.has(remoteUid)) return; // already connected

    // Add a placeholder tile
    addVideoTile(remoteUid, data.displayName || 'Player', null);
    updateTileMuteState(remoteUid, data.audioMuted, data.videoMuted);
    if (data.videoMuted) {
        setCameraOffPlaceholder(remoteUid, data.displayName || 'Player');
    }
    updateParticipantCount(_peers.size + 1);

    // Polite peer pattern: lower UID creates the offer
    const isOfferer = _uid < remoteUid;

    _createPeerConnection(remoteUid, isOfferer);

    // Listen for mute state changes from this participant
    const unsubMute = db.listenToVideoChatParticipantChanges(_roomCode, remoteUid, (pData) => {
        if (pData) {
            updateTileMuteState(remoteUid, pData.audioMuted, pData.videoMuted);
            if (pData.videoMuted) {
                setCameraOffPlaceholder(remoteUid, pData.displayName || 'Player');
            }
        }
    });
    _unsubs.push(unsubMute);
}

function _onParticipantRemoved(remoteUid) {
    _closePeer(remoteUid);
    _peers.delete(remoteUid);
    _retries.delete(remoteUid);
    removeVideoTile(remoteUid);
    updateParticipantCount(_peers.size);
}

function _createPeerConnection(remoteUid, isOfferer) {
    const pc = new RTCPeerConnection(ICE_CONFIG);

    // Add local tracks
    if (_localStream) {
        _localStream.getTracks().forEach(track => pc.addTrack(track, _localStream));
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        _peers.set(remoteUid, { pc, stream: remoteStream });
        addVideoTile(remoteUid, null, remoteStream); // null name = keep existing name
    };

    // ICE candidate handling
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            db.pushIceCandidate(_roomCode, _uid, remoteUid, {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex
            });
        }
    };

    // Connection state monitoring
    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
            const retryCount = _retries.get(remoteUid) || 0;
            if (retryCount < MAX_RETRIES) {
                _retries.set(remoteUid, retryCount + 1);
                setTimeout(() => _reconnectPeer(remoteUid), 3000);
            } else {
                window.showToast?.(t('vc_connection_failed'), 'error');
            }
        }
    };

    _peers.set(remoteUid, { pc, stream: null });

    // Listen for ICE candidates from the remote peer
    const unsubIce = db.listenToIceCandidates(_roomCode, remoteUid, _uid, async (candidate) => {
        try {
            if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (e) { console.warn('[VC] ICE candidate error:', e); }
    });
    _unsubs.push(unsubIce);

    if (isOfferer) {
        _createOffer(pc, remoteUid);
    } else {
        // Listen for offer from the remote peer
        const unsubSignal = db.listenToSignal(_roomCode, remoteUid, _uid, async (signal) => {
            if (!signal) return;
            try {
                if (signal.type === 'offer') {
                    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    db.writeSignal(_roomCode, _uid, remoteUid, { type: 'answer', sdp: answer.sdp });
                } else if (signal.type === 'answer') {
                    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
                }
            } catch (e) { console.warn('[VC] Signal handling error:', e); }
        });
        _unsubs.push(unsubSignal);
    }
}

async function _createOffer(pc, remoteUid) {
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        db.writeSignal(_roomCode, _uid, remoteUid, { type: 'offer', sdp: offer.sdp });

        // Listen for answer
        const unsubAnswer = db.listenToSignal(_roomCode, remoteUid, _uid, async (signal) => {
            if (!signal || signal.type !== 'answer') return;
            try {
                await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
            } catch (e) { console.warn('[VC] Answer error:', e); }
        });
        _unsubs.push(unsubAnswer);
    } catch (e) {
        console.error('[VC] Offer creation failed:', e);
    }
}

function _closePeer(remoteUid) {
    const peer = _peers.get(remoteUid);
    if (peer?.pc) {
        peer.pc.ontrack = null;
        peer.pc.onicecandidate = null;
        peer.pc.oniceconnectionstatechange = null;
        peer.pc.close();
    }
}

function _reconnectPeer(remoteUid) {
    if (!_inCall) return;
    _closePeer(remoteUid);
    _peers.delete(remoteUid);

    // Clean old signaling paths
    db.clearWebRTCPeerSignaling(_roomCode, _uid, remoteUid);

    const isOfferer = _uid < remoteUid;
    _createPeerConnection(remoteUid, isOfferer);
}

// ── Auto quality degradation ─────────────────────────────────────────────

function _checkQualityDegradation() {
    const count = _peers.size + 1; // +1 for self
    if (count >= 6) {
        window.showToast?.(t('vc_audio_only') + ' — 6+ ' + t('vc_participants'), 'info');
    }
    if (_localStream && count >= 4) {
        const videoTrack = _localStream.getVideoTracks()[0];
        if (videoTrack && typeof videoTrack.applyConstraints === 'function') {
            videoTrack.applyConstraints({ width: 320, height: 240 }).catch(() => {});
        }
    }
}

// ── Toolbar button state ─────────────────────────────────────────────────

function _updateToolbarButtons(inCall) {
    const btns = ['vc-toggle-btn', 'pt-vc-btn', 'dm-vc-btn'];
    btns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.toggle('vc-active', inCall);
    });
}
