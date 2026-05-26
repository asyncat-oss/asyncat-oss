/**
 * browserCommandQueue.js
 *
 * In-memory store for pending browser commands.
 *
 * Flow:
 *  1. Agent tool calls execBrowserCommand() → registers a pending promise here
 *     and emits a `browser_command` SSE event to the frontend.
 *  2. Frontend receives the SSE event, executes the action on the live preview
 *     webview, then POSTs the result to POST /api/agent/browser/result/:commandId.
 *  3. The route handler calls resolveBrowserCommand() → the agent tool's await
 *     resolves with the result.
 */

const pending = new Map(); // commandId → { resolve, reject, timer }

/**
 * Register a pending browser command and return a Promise that resolves
 * when the frontend POSTs the result back.
 *
 * @param {string} commandId
 * @param {number} [timeoutMs=15000]
 * @returns {Promise<object>} Result from the frontend
 */
export function registerBrowserCommand(commandId, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.delete(commandId)) {
        reject(new Error(`Browser command "${commandId}" timed out after ${timeoutMs}ms. Is the Preview panel open?`));
      }
    }, timeoutMs);

    pending.set(commandId, {
      resolve: (result) => {
        clearTimeout(timer);
        pending.delete(commandId);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timer);
        pending.delete(commandId);
        reject(err);
      },
    });
  });
}

/**
 * Resolve a pending browser command with the result from the frontend.
 * Returns true if the command was found, false if it had already timed out.
 *
 * @param {string} commandId
 * @param {object} result
 * @returns {boolean}
 */
export function resolveBrowserCommand(commandId, result) {
  const entry = pending.get(commandId);
  if (!entry) return false;
  entry.resolve(result);
  return true;
}
