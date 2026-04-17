// backgroundTasks.js — module-level singleton for tracking in-flight AI streaming tasks.
// Survives React component unmounts so we can show sidebar indicators even after navigation.

const tasks = new Map(); // conversationId → { status: 'streaming'|'done'|'error', title }
const listeners = new Set();

function notify() {
  const snapshot = new Map(tasks);
  listeners.forEach(fn => fn(snapshot));
}

export const bgTasks = {
  register(id, title) {
    tasks.set(id, { status: 'streaming', title });
    notify();
  },

  complete(id) {
    if (!tasks.has(id)) return;
    tasks.set(id, { ...tasks.get(id), status: 'done' });
    notify();
    // Auto-remove after 3 seconds so the indicator fades away
    setTimeout(() => {
      tasks.delete(id);
      notify();
    }, 3000);
  },

  fail(id) {
    if (!tasks.has(id)) return;
    tasks.set(id, { ...tasks.get(id), status: 'error' });
    notify();
    setTimeout(() => {
      tasks.delete(id);
      notify();
    }, 5000);
  },

  getStatus(id) {
    return tasks.get(id)?.status ?? null;
  },

  isStreaming(id) {
    return tasks.get(id)?.status === 'streaming';
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  snapshot() {
    return new Map(tasks);
  },
};
