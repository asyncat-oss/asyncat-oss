/**
 * Lightweight in-process event bus.
 *
 * Replaces ad-hoc window.dispatchEvent / window.addEventListener usage for
 * app-level custom events (workspaceChanged, projectsUpdated, etc.).
 *
 * Native browser events (scroll, resize, online, offline, beforeunload,
 * unhandledrejection) should still use window directly — this bus is only for
 * application-level signals.
 *
 * Usage:
 *   // Subscribe
 *   const unsub = eventBus.on('projectsUpdated', (data) => { ... });
 *   // later…
 *   unsub(); // or eventBus.off('projectsUpdated', handler)
 *
 *   // Emit
 *   eventBus.emit('projectsUpdated', { projectId: 42 });
 */

const listeners = {};

const eventBus = {
  /**
   * Subscribe to an event. Returns a cleanup function.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} unsubscribe
   */
  on(event, handler) {
    if (!listeners[event]) {
      listeners[event] = new Set();
    }
    listeners[event].add(handler);
    return () => this.off(event, handler);
  },

  /**
   * Unsubscribe a specific handler from an event.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    listeners[event]?.delete(handler);
  },

  /**
   * Emit an event with optional payload data.
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    listeners[event]?.forEach((handler) => {
      try {
        handler(data);
      } catch (err) {
        console.error(`[eventBus] Error in handler for "${event}":`, err);
      }
    });
  },
};

export default eventBus;
