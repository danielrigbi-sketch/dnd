// js/core/eventBus.js — ParaDice Typed Event Bus
// Replaces all direct cross-system coupling with a clean pub/sub channel.
//
// Emitted events (contract):
//   'token:moved'       { cName, gx, gy, prevGx, prevGy }
//   'token:placed'      { cName, gx, gy }
//   'token:removed'     { cName }
//   'hp:changed'        { cName, oldHp, newHp, cfg, token }
//   'fog:revealed'      { cells: Set<string> }     // "gx_gy" keys
//   'fog:hidden'        { key: string }
//   'obstacle:changed'  { key, value }
//   'turn:changed'      { index, sc }
//   'scene:switched'    { sceneId }
//   'drag:start'        { cName, gx, gy }
//   'drag:end'          { cName, accepted }
// ─────────────────────────────────────────────────────────────────────────────

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string}   event
   * @param {Function} handler  receives the payload object
   * @returns {Function}        unsubscribe function
   */
  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Subscribe once — auto-removes after first call.
   */
  once(event, handler) {
    const wrap = (payload) => { handler(payload); this.off(event, wrap); };
    return this.on(event, wrap);
  }

  /**
   * Unsubscribe a specific handler.
   */
  off(event, handler) {
    this._listeners.get(event)?.delete(handler);
  }

  /**
   * Emit an event with a payload.
   * Handlers are called synchronously in subscription order.
   * Exceptions in one handler do NOT prevent others from running.
   */
  emit(event, payload) {
    const handlers = this._listeners.get(event);
    if (!handlers) return;
    for (const h of handlers) {
      try { h(payload); } catch (e) { console.error(`[EventBus] Error in "${event}" handler:`, e); }
    }
  }

  /**
   * Remove ALL listeners for an event (or all events if none specified).
   */
  clear(event) {
    if (event) this._listeners.delete(event);
    else       this._listeners.clear();
  }
}

// Singleton for the map engine subsystem graph.
// Import this wherever cross-system communication is needed.
export const mapBus = new EventBus();
