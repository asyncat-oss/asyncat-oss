/**
 * browserCommandQueue.js
 *
 * The agent's way into the built-in browser. Browser tabs live in the
 * desktop app's main process (electron/browserHost.js), so every command
 * goes there over the host bridge (lib/hostBridge.js) and works whether or
 * not the chat screen, the browser panel or any window is open. When the
 * backend runs without the desktop app there is no browser, and commands
 * fail at once with a plain message.
 *
 * Actions that need the user's yes (typing a password or card number,
 * buy/delete/send buttons, choosing a file) come back from the desktop app
 * as { needsApproval, approval }; runBrowserAction asks the user through
 * the run's approval card and retries with the approval attached.
 */

import { isHostConnected, requestFromHost } from '../lib/hostBridge.js';
import { approvalAllows, approvalCoversRun } from './approvalDecisions.js';
import { currentCatRun } from './scheduledRunContext.js';

export const NO_DESKTOP_APP = 'The built-in browser needs the Asyncat desktop app, and the backend is running without it. Use fetch_url or web_search instead, or open Asyncat.';

/** Which agent this is, so its tabs and command queue stay its own. */
export function browserOwner(context) {
  const cat = currentCatRun();
  if (cat) return `cat:${cat.catId}`;
  return String(context?.conversationId || context?.session?.id || 'default');
}

export function isBrowserAvailable() {
  return isHostConnected('browser');
}

/** Send one command to the desktop app's browser. Throws on failure. */
export async function sendBrowserCommand(action, params = {}, context = {}, { timeoutMs = 30_000 } = {}) {
  if (!isHostConnected('browser')) throw new Error(NO_DESKTOP_APP);
  // A Cat browses in its own profile (its logins stay its own) and only on
  // its sites; the desktop app enforces both for the tabs it opens.
  const cat = currentCatRun();
  return requestFromHost('browser.command', {
    ...params,
    action,
    owner: browserOwner(context),
    conversationId: context?.conversationId || null,
    ...(cat ? { partition: cat.browserPartition, allowedSites: cat.allowedSites || [], catName: cat.catName || null } : {}),
  }, { timeoutMs, capability: 'browser' });
}

/**
 * Ask the user about one sensitive action. Pre-approving the exact tool for
 * this chat (or "Trust this run" on an earlier card) skips the question;
 * auto-approve does not.
 */
export async function approveSensitiveAction(approval, context, toolName, args = {}) {
  if (context?.isToolApproved?.(toolName)) return { allowed: true };
  if (typeof context?.requestPermission !== 'function') {
    return { allowed: false, reason: `${approval.description}. That needs the user's approval, and nobody can give it in this run.` };
  }
  const decision = await context.requestPermission({
    sessionId: context.session?.id,
    tool: toolName,
    toolCallId: context.toolCallId,
    args,
    permission: 'dangerous',
    description: approval.description,
    workingDir: context.workingDir,
    sensitive: approval.kind,
  });
  if (!approvalAllows(decision?.decision)) {
    return { allowed: false, reason: decision?.reason || 'The user said no.' };
  }
  if (approvalCoversRun(decision?.decision)) context?.approveToolForRun?.(toolName);
  return { allowed: true };
}

/** Strip what must never be shown on an approval card (typed secrets). */
export function redactArgs(args = {}) {
  const shown = { ...args };
  for (const key of ['text', 'value', 'values']) {
    if (key in shown) shown[key] = '••••••';
  }
  if (shown.fields && typeof shown.fields === 'object') {
    shown.fields = Object.fromEntries(Object.keys(shown.fields).map((field) => [field, '••••••']));
  }
  return shown;
}

/**
 * Run a command, asking the user when the desktop app says the action needs
 * a yes. Returns the command's result; never throws.
 */
export async function runBrowserAction(action, params, context, { toolName, args = {}, timeoutMs } = {}) {
  const approvals = [];
  try {
    let result = await sendBrowserCommand(action, { ...params, approvals: [...approvals] }, context, { timeoutMs });
    for (let round = 0; round < 3 && result?.needsApproval && result.approval?.key; round++) {
      const answer = await approveSensitiveAction(result.approval, context, toolName, redactArgs(args));
      if (!answer.allowed) {
        return { success: false, declined: true, error: `Not done: ${result.approval.description}. ${answer.reason}` };
      }
      approvals.push(result.approval.key);
      result = await sendBrowserCommand(action, { ...params, approvals: [...approvals] }, context, { timeoutMs });
    }
    if (result?.needsApproval) return { success: false, error: 'The page kept asking for new approvals, so the action was stopped.' };
    return result;
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}
