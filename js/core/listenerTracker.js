// js/core/listenerTracker.js — Lifecycle-aware listener management
//
// Wraps addEventListener and Firebase onValue/onChildAdded with automatic cleanup.
// Call tracker.destroy() on room change, logout, or component teardown.

/**
 * Tracks DOM event listeners and Firebase unsubscribe functions.
 * Provides a single destroy() call to clean up everything.
 */
export class ListenerTracker {
    constructor(name = 'anonymous') {
        this._name = name;
        /** @type {Array<{el: EventTarget, event: string, handler: Function, opts?: any}>} */
        this._dom = [];
        /** @type {Array<Function>} */
        this._fb = [];
    }

    /**
     * Add a DOM event listener with automatic tracking.
     * @param {EventTarget} el
     * @param {string} event
     * @param {Function} handler
     * @param {boolean|AddEventListenerOptions} [opts]
     */
    on(el, event, handler, opts) {
        if (!el) return;
        el.addEventListener(event, handler, opts);
        this._dom.push({ el, event, handler, opts });
    }

    /**
     * Track a Firebase unsubscribe function (returned by onValue, onChildAdded, etc.)
     * @param {Function} unsub
     */
    track(unsub) {
        if (typeof unsub === 'function') this._fb.push(unsub);
    }

    /**
     * Remove all tracked listeners and Firebase subscriptions.
     */
    destroy() {
        this._dom.forEach(({ el, event, handler, opts }) => {
            try { el.removeEventListener(event, handler, opts); } catch {}
        });
        this._fb.forEach(unsub => {
            try { unsub(); } catch {}
        });
        this._dom = [];
        this._fb = [];
    }

    /** Number of tracked items */
    get count() { return this._dom.length + this._fb.length; }
}
