// den/src/agent/AgentSession.js
// ─── Agent Session State ─────────────────────────────────────────────────────
// Tracks state for a single agent run: goal, plan, tool history, scratchpad.
// Persists to SQLite for resumability.

import { randomUUID } from 'crypto';
import db from '../db/client.js';

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column);
}

function tableExists(table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

if (tableExists('agent_sessions') && !columnExists('agent_sessions', 'working_dir')) {
  try {
    db.prepare('ALTER TABLE agent_sessions ADD COLUMN working_dir TEXT').run();
  } catch (err) {
    console.warn('Failed to add agent_sessions.working_dir:', err.message);
  }
}

if (tableExists('agent_tool_audit') && !columnExists('agent_tool_audit', 'tool_call_id')) {
  try {
    db.prepare('ALTER TABLE agent_tool_audit ADD COLUMN tool_call_id TEXT').run();
  } catch (err) {
    console.warn('Failed to add agent_tool_audit.tool_call_id:', err.message);
  }
}

function toJson(value, fallback = '{}') {
  try { return JSON.stringify(value ?? JSON.parse(fallback)); }
  catch { return fallback; }
}

export class AgentSession {
  constructor({ id, userId, workspaceId, goal, workingDir }) {
    this.id = id || randomUUID();
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.goal = goal;
    this.workingDir = workingDir || process.cwd();
    this.status = 'active'; // active | paused | completed | failed
    this.plan = [];          // array of planned steps
    this.scratchpad = {};    // agent working memory (key-value)
    this.toolHistory = [];   // all tool calls made: { tool, args, result, timestamp }
    this.messages = [];      // conversation messages for this session
    this.totalRounds = 0;
    // Feedback fields
    this.feedbackRating = null;
    this.feedbackComment = null;
    this.wasHelpful = null;
    this.corrections = [];
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  /** Record a tool call and its result. */
  recordToolCall(toolName, args, result, meta = {}) {
    const entry = {
      tool: toolName,
      args,
      result,
      timestamp: new Date().toISOString(),
      round: this.totalRounds,
      toolCallId: meta.toolCallId || null,
      permission: meta.permissionLevel || 'safe',
      permissionDecision: meta.permissionDecision || 'unknown',
      permissionReason: meta.permissionReason || null,
      workingDir: meta.workingDir || this.workingDir,
    };
    this.toolHistory.push(entry);
    this.updatedAt = new Date().toISOString();
    this._persistToolAudit(toolName, args, result, entry, meta);
  }

  /** Add a message to the session conversation. */
  addMessage(role, content) {
    this.messages.push({ role, content, timestamp: new Date().toISOString() });
  }

  /** Increment round counter. */
  nextRound() {
    this.totalRounds++;
    this.updatedAt = new Date().toISOString();
  }

  /** Set a scratchpad value. */
  setScratchpad(key, value) {
    this.scratchpad[key] = value;
  }

  /** Get a scratchpad value. */
  getScratchpad(key) {
    return this.scratchpad[key];
  }

  /** Mark session as completed. */
  complete() {
    this.status = 'completed';
    this.updatedAt = new Date().toISOString();
    this._persist();
  }

  /** Mark session as failed. */
  fail(error) {
    this.status = 'failed';
    this.scratchpad._error = error;
    this.updatedAt = new Date().toISOString();
    this._persist();
  }

  /** Persist session to database (atomic UPSERT). */
  _persist() {
    try {
      db.prepare(`
        INSERT INTO agent_sessions (
          id, user_id, workspace_id, status, goal, plan, scratchpad,
          tool_history, working_dir, total_rounds, feedback_rating, feedback_comment,
          was_helpful, corrections, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          goal = excluded.goal,
          plan = excluded.plan,
          scratchpad = excluded.scratchpad,
          tool_history = excluded.tool_history,
          working_dir = excluded.working_dir,
          total_rounds = excluded.total_rounds,
          feedback_rating = excluded.feedback_rating,
          feedback_comment = excluded.feedback_comment,
          was_helpful = excluded.was_helpful,
          corrections = excluded.corrections,
          updated_at = excluded.updated_at
      `).run(
        this.id, this.userId, this.workspaceId, this.status,
        this.goal, JSON.stringify(this.plan), JSON.stringify(this.scratchpad),
        JSON.stringify(this.toolHistory), this.workingDir, this.totalRounds,
        this.feedbackRating, this.feedbackComment, this.wasHelpful,
        JSON.stringify(this.corrections || []),
        this.createdAt, this.updatedAt
      );
    } catch (err) {
      console.error('Failed to persist agent session:', err.message);
    }
  }

  _persistToolAudit(toolName, args, result, entry, meta = {}) {
    try {
      const existing = db.prepare('SELECT id FROM agent_sessions WHERE id = ?').get(this.id);
      if (!existing) this._persist();

      const success = result?.success === undefined ? null : (result.success ? 1 : 0);
      db.prepare(`
        INSERT INTO agent_tool_audit (
          id, session_id, user_id, workspace_id, tool_name, tool_call_id,
          permission_level, permission_decision, permission_reason,
          working_dir, args, result, success, round, started_at, completed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        this.id,
        this.userId,
        this.workspaceId,
        toolName,
        entry.toolCallId || null,
        entry.permission,
        entry.permissionDecision,
        entry.permissionReason,
        entry.workingDir,
        toJson(args),
        toJson(result, 'null'),
        success,
        entry.round,
        meta.startedAt || entry.timestamp,
        meta.completedAt || new Date().toISOString(),
      );
    } catch (err) {
      console.error('Failed to persist agent tool audit:', err.message);
    }
  }

  setFeedback(rating, comment, wasHelpful) {
    this.feedbackRating = rating;
    this.feedbackComment = comment;
    this.wasHelpful = wasHelpful !== undefined ? (wasHelpful ? 1 : 0) : null;
    this._persist();
  }

  addCorrection(correction) {
    this.corrections = this.corrections || [];
    this.corrections.push({ ...correction, timestamp: new Date().toISOString() });
    this._persist();
  }

  getCorrection() {
    return this.corrections || [];
  }

  /** Save current state. Call periodically during long runs. */
  save() {
    this._persist();
  }

  /** Load a session from database. */
  static load(sessionId) {
    try {
      const row = db.prepare('SELECT * FROM agent_sessions WHERE id = ?').get(sessionId);
      if (!row) return null;

      const session = new AgentSession({
        id: row.id,
        userId: row.user_id,
        workspaceId: row.workspace_id,
        goal: row.goal,
        workingDir: row.working_dir || undefined,
      });
      session.status = row.status;
      session.plan = JSON.parse(row.plan || '[]');
      session.scratchpad = JSON.parse(row.scratchpad || '{}');
      session.toolHistory = JSON.parse(row.tool_history || '[]');
      session.totalRounds = row.total_rounds || 0;
      session.feedbackRating = row.feedback_rating ?? null;
      session.feedbackComment = row.feedback_comment ?? null;
      session.wasHelpful = row.was_helpful ?? null;
      session.corrections = JSON.parse(row.corrections || '[]');
      session.createdAt = row.created_at;
      session.updatedAt = row.updated_at;
      return session;
    } catch (err) {
      console.error('Failed to load agent session:', err.message);
      return null;
    }
  }

  /** List recent sessions for a user. */
  static listRecent(userId, limit = 20, workspaceId = null) {
    try {
      return db.prepare(`
        SELECT s.id, s.goal, s.status, s.working_dir, s.total_rounds, s.created_at, s.updated_at,
               atr.id AS task_run_id, atr.status AS task_run_status,
               atr.last_event_label AS task_run_activity, atr.summary AS task_run_summary,
               c.id AS task_card_id, c.title AS task_card_title,
               ap.name AS profile_name, ap.handle AS profile_handle, ap.icon AS profile_icon
        FROM agent_sessions s
        LEFT JOIN agent_task_runs atr ON atr.session_id = s.id
        LEFT JOIN Cards c ON c.id = atr.card_id
        LEFT JOIN agent_profiles ap ON ap.id = atr.profile_id
        WHERE s.user_id = ?
          AND (? IS NULL OR s.workspace_id = ?)
        ORDER BY s.updated_at DESC
        LIMIT ?
      `).all(userId, workspaceId, workspaceId, limit);
    } catch {
      return [];
    }
  }

  // ── Plan completion helpers ─────────────────────────────────────────────────
  static _AUTO_PLAN_IDS = new Set([
    'auto_plan_inspect', 'auto_plan_understand', 'auto_plan_apply', 'auto_plan_verify',
  ]);

  /**
   * Check if the agent-authored plan is fully completed.
   * Returns true if there is no plan, if the plan is only auto-generated,
   * or if all items have status === 'completed'.
   */
  isPlanComplete() {
    if (!Array.isArray(this.plan) || this.plan.length === 0) return true;
    // Ignore auto-generated plans — they don't represent real task decomposition
    if (this.plan.every(item => AgentSession._AUTO_PLAN_IDS.has(item.id))) return true;
    return this.plan.every(item => item.status === 'completed');
  }

  /** Get plan completion stats. */
  getPlanProgress() {
    if (!Array.isArray(this.plan) || this.plan.length === 0) {
      return { completed: 0, total: 0, percentage: 100 };
    }
    const completed = this.plan.filter(i => i.status === 'completed').length;
    return {
      completed,
      total: this.plan.length,
      percentage: Math.round((completed / this.plan.length) * 100),
    };
  }
}

export default AgentSession;
