/**
 * What an answer to an approval card means, in one place.
 *
 * The approval card offers Allow once, Allow for this chat and Always allow
 * (the app remembers the last one and pre-approves the tool on later runs).
 * Asyncat's own agent and the Claude Code bridge used to read these
 * differently: "always" answers were denied by one and allowed by the other.
 */

const DECISIONS = new Set(['allow', 'allow_session', 'allow_always', 'deny']);
const ALIASES = {
  allow_always_tool: 'allow_always',
  allow_always_command: 'allow_always',
};

/** The canonical decision name; anything unknown is a denial. */
export function normalizeApprovalDecision(value) {
  const name = ALIASES[value] || value;
  return DECISIONS.has(name) ? name : 'deny';
}

/** True when the decision lets this call run. */
export function approvalAllows(value) {
  return normalizeApprovalDecision(value) !== 'deny';
}

/** True when the decision also covers later calls of the same tool in this run. */
export function approvalCoversRun(value) {
  const name = normalizeApprovalDecision(value);
  return name === 'allow_session' || name === 'allow_always';
}
