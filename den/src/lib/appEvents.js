// den/src/lib/appEvents.js
// ─── Live updates for the app's screens ──────────────────────────────────────
// Backend code publishes small events ("this chat changed", "a Cat has a new
// inbox item") and the screens get them over one Server-Sent Events stream,
// GET /api/events (events/eventsRouter.js), so they can refresh what they show
// without polling.

import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);
let sequence = 0;

/**
 * Publish an event. `userId` limits it to that user's screens; it isn't sent
 * to them. Returns the event as subscribers see it.
 */
export function publishAppEvent(type, data = {}, { userId = null } = {}) {
  sequence += 1;
  const event = { id: sequence, type, data, at: new Date().toISOString(), userId };
  try {
    emitter.emit('event', event);
  } catch (err) {
    console.warn(`[events] A listener failed on ${type}:`, err.message);
  }
  return event;
}

/** Call `listener(event)` for every event. Returns a function that stops it. */
export function subscribeAppEvents(listener) {
  emitter.on('event', listener);
  return () => emitter.off('event', listener);
}

export function appEventListenerCount() {
  return emitter.listenerCount('event');
}
