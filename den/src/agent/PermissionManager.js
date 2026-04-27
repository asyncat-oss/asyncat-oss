// den/src/agent/PermissionManager.js
// ─── Permission System ──────────────────────────────────────────────────────
// Controls which tools require user approval before execution.
// In CLI mode: interactive prompt. In API mode: returns permission-required status.

import { PermissionLevel } from './tools/toolRegistry.js';

export class PermissionManager {
  constructor() {
    // Session-level overrides: tools the user has approved for this session
    this._sessionApprovals = new Set();
    // If true, auto-approve moderate-level tools
    this._autoApproveModerate = false;
    // If true, auto-approve everything (--auto-approve flag)
    this._autoApproveAll = false;
    // Callback for CLI interactive prompts (set by CLI agent command)
    this._promptCallback = null;
  }

  /**
   * Set auto-approve mode.
   * @param {'none'|'moderate'|'all'} level
   */
  setAutoApprove(level) {
    this._autoApproveModerate = level === 'moderate' || level === 'all';
    this._autoApproveAll = level === 'all';
  }

  /**
   * Set the interactive prompt callback for CLI mode.
   * @param {(toolName: string, args: object, permission: string) => Promise<'allow'|'deny'|'allow_session'>} cb
   */
  setPromptCallback(cb) {
    this._promptCallback = cb;
  }

  /**
   * Approve a specific tool for the rest of this session.
   * @param {string} toolName
   */
  approveForSession(toolName) {
    this._sessionApprovals.add(toolName);
  }

  /**
   * Check if a tool call is allowed. May prompt the user.
   *
   * @param {string} toolName
   * @param {object} args
   * @param {string} permissionLevel - PermissionLevel value
   * @returns {Promise<{allowed: boolean, reason?: string}>}
   */
  async check(toolName, args, permissionLevel) {
    // Auto-approve all
    if (this._autoApproveAll) {
      return { allowed: true };
    }

    // Safe tools always allowed
    if (permissionLevel === PermissionLevel.SAFE) {
      return { allowed: true };
    }

    // Session-level approval
    if (this._sessionApprovals.has(toolName)) {
      return { allowed: true };
    }

    // Moderate tools: auto-approve if configured
    if (permissionLevel === PermissionLevel.MODERATE && this._autoApproveModerate) {
      return { allowed: true };
    }

    // Interactive prompt (CLI mode)
    if (this._promptCallback) {
      const decision = await this._promptCallback(toolName, args, permissionLevel);

      if (decision === 'allow') return { allowed: true };
      if (decision === 'allow_session') {
        this._sessionApprovals.add(toolName);
        return { allowed: true };
      }
      return { allowed: false, reason: 'User denied permission' };
    }

    // API mode (no prompt callback): deny dangerous, allow moderate
    if (permissionLevel === PermissionLevel.MODERATE) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Tool "${toolName}" requires user permission (level: ${permissionLevel})`,
    };
  }

  /**
   * Reset session approvals (e.g., when starting a new agent session).
   */
  resetSession() {
    this._sessionApprovals.clear();
  }

  /**
   * Get a human-readable description of what a tool will do.
   * Used in permission prompts.
   */
  static describeAction(toolName, args) {
    const descriptions = {
      run_command: () => `Execute shell command: ${args.command}${args.cwd ? ` (in ${args.cwd})` : ''}`,
      run_python: () => `Execute Python code:\n${(args.code || '').slice(0, 200)}`,
      run_node: () => `Execute JavaScript code:\n${(args.code || '').slice(0, 200)}`,
      write_file: () => `Write file: ${args.path} (${(args.content || '').length} chars)`,
      edit_file: () => `Edit file: ${args.path}`,
      file_copy: () => `Copy file: ${args.source} -> ${args.destination}`,
      file_move: () => `Move file: ${args.source} -> ${args.destination}`,
      file_delete: () => `Delete file: ${args.path}`,
      delete_file: () => `Delete file: ${args.path}`,
      delete_task: () => `Delete task: ${args.task_id}`,
      delete_event: () => `Delete event: ${args.event_id}`,
      delete_note: () => `Delete note: ${args.note_id}`,
    };

    const fn = descriptions[toolName];
    if (fn) return fn();
    return `Execute tool "${toolName}" with args: ${JSON.stringify(args).slice(0, 200)}`;
  }
}

export const permissionManager = new PermissionManager();
export default permissionManager;
