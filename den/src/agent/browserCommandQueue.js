/**
 * browserCommandQueue.js
 *
 * The agent's way into a browser. Browser tabs live in the desktop app's
 * main process (electron/browserHost.js), so every command goes there over
 * the host bridge (lib/hostBridge.js) and works whether or not the chat
 * screen, the browser panel or any window is open. When the backend runs
 * without the desktop app, the same commands go to a headless browser
 * (headlessBrowser.js) with the same results.
 *
 * Actions that need the user's yes (typing a password or card number,
 * buy/delete/send buttons, choosing a file) come back from either browser
 * as { needsApproval, approval }; runBrowserAction asks the user through
 * the run's approval card and retries with the approval attached.
 */

import { isHostConnected, requestFromHost } from '../lib/hostBridge.js';
import { approvalAllows, approvalCoversRun } from './approvalDecisions.js';
import { currentCatRun } from './scheduledRunContext.js';
import { getBlockedSites } from '../privacy/blockedSites.js';
import { headlessBrowser, HANDOVER_NEEDS_DESKTOP } from './headlessBrowser.js';

export { HANDOVER_NEEDS_DESKTOP };

// The browser used without the desktop app; tests swap in a stand-in.
let headless = headlessBrowser;
export function useHeadlessBrowser(stand) {
  headless = stand || headlessBrowser;
}

/** Which agent this is, so its tabs and command queue stay its own. */
export function browserOwner(context) {
  const cat = currentCatRun();
  if (cat) return `cat:${cat.catId}`;
  return String(context?.conversationId || context?.session?.id || 'default');
}

/** True when commands go to the desktop app's browser, not the headless one. */
export function isDesktopBrowser() {
  return isHostConnected('browser');
}

/**
 * Send one command to the headless browser, even with the desktop app
 * running (for a page it can't photograph). Throws on failure.
 */
export async function sendHeadlessCommand(action, params = {}, context = {}, { timeoutMs = 30_000 } = {}) {
  return headless.command(action, { ...params, owner: browserOwner(context) }, { timeoutMs });
}

/** Send one command to the agent's browser. Throws on failure. */
export async function sendBrowserCommand(action, params = {}, context = {}, { timeoutMs = 30_000 } = {}) {
  if (!isHostConnected('browser')) return sendHeadlessCommand(action, params, context, { timeoutMs });
  // A Cat browses in its own profile (its logins stay its own) and only on
  // its sites; the desktop app enforces both for the tabs it opens, and
  // keeps every agent tab off the sites the user blocked for agents.
  const cat = currentCatRun();
  return requestFromHost('browser.command', {
    ...params,
    action,
    owner: browserOwner(context),
    conversationId: context?.conversationId || null,
    blockedSites: getBlockedSites(),
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
  if (Array.isArray(shown.fields)) {
    shown.fields = shown.fields.map((field) => ({ ...field, value: '••••••' }));
  } else if (shown.fields && typeof shown.fields === 'object') {
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
