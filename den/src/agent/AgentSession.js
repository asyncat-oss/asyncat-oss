// den/src/agent/AgentSession.js
// ─── Agent Session State ─────────────────────────────────────────────────────
// Tracks state for a single agent run: goal, plan, tool history, scratchpad.
// Persists to SQLite for resumability.

import { randomUUID } from 'crypto';
import db from '../db/client.js';

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
  recordToolCall(toolName, args, result) {
    this.toolHistory.push({
      tool: toolName,
      args,
      result,
      timestamp: new Date().toISOString(),
      round: this.totalRounds,
    });
    this.updatedAt = new Date().toISOString();
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

  /** Persist session to database. */
  _persist() {
    try {
      const existing = db.prepare('SELECT id FROM agent_sessions WHERE id = ?').get(this.id);

      if (existing) {
        db.prepare(`
          UPDATE agent_sessions SET
            status = ?, goal = ?, plan = ?, scratchpad = ?,
            tool_history = ?, total_rounds = ?, updated_at = ?
          WHERE id = ?
        `).run(
          this.status, this.goal, JSON.stringify(this.plan),
          JSON.stringify(this.scratchpad), JSON.stringify(this.toolHistory),
          this.totalRounds, this.updatedAt, this.id
        );
      } else {
        db.prepare(`
          INSERT INTO agent_sessions (id, user_id, workspace_id, status, goal, plan, scratchpad, tool_history, total_rounds, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          this.id, this.userId, this.workspaceId, this.status,
          this.goal, JSON.stringify(this.plan), JSON.stringify(this.scratchpad),
          JSON.stringify(this.toolHistory), this.totalRounds,
          this.createdAt, this.updatedAt
        );
      }
    } catch (err) {
      console.error('Failed to persist agent session:', err.message);
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
      });
      session.status = row.status;
      session.plan = JSON.parse(row.plan || '[]');
      session.scratchpad = JSON.parse(row.scratchpad || '{}');
      session.toolHistory = JSON.parse(row.tool_history || '[]');
      session.totalRounds = row.total_rounds || 0;
      session.createdAt = row.created_at;
      session.updatedAt = row.updated_at;
      return session;
    } catch (err) {
      console.error('Failed to load agent session:', err.message);
      return null;
    }
  }

  /** List recent sessions for a user. */
  static listRecent(userId, limit = 20) {
    try {
      return db.prepare(
        'SELECT id, goal, status, total_rounds, created_at, updated_at FROM agent_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?'
      ).all(userId, limit);
    } catch {
      return [];
    }
  }
}

export default AgentSession;
