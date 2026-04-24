// den/src/agent/PermissionRules.js
// ─── Persistent permission allowlist ─────────────────────────────────────────
// Rules are kept in the `permission_rules` table (see migration 002) and
// evaluated by PermissionManager before a user prompt is shown.
//
// A rule matches when:
//   1. tool_name === the call's tool (or tool_name === '*')
//   2. scope applies (global always, workspace only if workspaceId matches)
//   3. If arg_field/arg_pattern are set, args[arg_field] matches the regex
//
// Deny rules take precedence over allow rules. First matching deny wins,
// otherwise first matching allow wins, otherwise no decision (fall through
// to the interactive prompt).

import db from '../db/client.js';
import { randomUUID } from 'crypto';

function safeRegex(pattern) {
  if (!pattern) return null;
  try { return new RegExp(pattern); }
  catch { return null; }
}

export const PermissionRules = {
  /**
   * Add a rule. All fields except tool_name + action are optional.
   */
  add({ userId, workspaceId = null, toolName, argField = null, argPattern = null,
        action = 'allow', scope = 'workspace', note = null }) {
    if (!userId) throw new Error('userId is required');
    if (!toolName) throw new Error('toolName is required');
    if (action !== 'allow' && action !== 'deny') throw new Error('action must be allow or deny');
    if (scope !== 'workspace' && scope !== 'global') throw new Error('scope must be workspace or global');

    const id = randomUUID();
    db.prepare(`
      INSERT INTO permission_rules
        (id, user_id, workspace_id, tool_name, arg_field, arg_pattern, action, scope, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, userId,
      scope === 'global' ? null : (workspaceId || null),
      toolName, argField, argPattern, action, scope, note,
    );
    return { id };
  },

  /** Delete a rule by id. Returns true if a row was deleted. */
  remove(id) {
    const res = db.prepare('DELETE FROM permission_rules WHERE id = ?').run(id);
    return res.changes > 0;
  },

  /** List all rules visible to a given (userId, workspaceId). */
  list({ userId, workspaceId = null }) {
    return db.prepare(`
      SELECT id, user_id, workspace_id, tool_name, arg_field, arg_pattern,
             action, scope, note, created_at
      FROM permission_rules
      WHERE user_id = ?
        AND (scope = 'global' OR workspace_id = ? OR workspace_id IS NULL)
      ORDER BY action DESC, created_at DESC
    `).all(userId, workspaceId || null);
  },

  /**
   * Evaluate rules against a tool call. Returns:
   *   { decision: 'allow' | 'deny', rule } when a rule matches
   *   { decision: null } when no rule matches
   */
  evaluate({ userId, workspaceId = null, toolName, args = {} }) {
    if (!userId || !toolName) return { decision: null };

    const rows = db.prepare(`
      SELECT id, tool_name, arg_field, arg_pattern, action, scope, note, workspace_id
      FROM permission_rules
      WHERE user_id = ?
        AND (tool_name = ? OR tool_name = '*')
        AND (scope = 'global' OR workspace_id = ? OR workspace_id IS NULL)
      ORDER BY
        CASE action WHEN 'deny' THEN 0 ELSE 1 END,
        CASE WHEN arg_pattern IS NULL THEN 1 ELSE 0 END,
        created_at DESC
    `).all(userId, toolName, workspaceId || null);

    for (const rule of rows) {
      if (rule.arg_pattern) {
        const re = safeRegex(rule.arg_pattern);
        if (!re) continue;
        const fieldVal = rule.arg_field ? args?.[rule.arg_field] : JSON.stringify(args);
        if (fieldVal == null) continue;
        if (!re.test(String(fieldVal))) continue;
      }
      return { decision: rule.action, rule };
    }
    return { decision: null };
  },
};

export default PermissionRules;
