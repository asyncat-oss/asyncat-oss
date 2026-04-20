// den/src/agent/BasalGanglia.js
// ─── Basal Ganglia — Habit Formation + Self-Improvement ─────────────────────────────
// Tracks repeated workflows and auto-creates skills from patterns.
// This is how the agent silently improves over time.

import db from '../db/client.js';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

const MIN_PATTERN_COUNT = 3;
const PATTERN_WINDOW_HOURS = 72;

class BasalGanglia {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    db.prepare(`
      CREATE TABLE IF NOT EXISTS agent_patterns (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        workspace_id TEXT,
        pattern_hash TEXT NOT NULL,
        pattern_summary TEXT NOT NULL,
        tool_sequence TEXT NOT NULL,
        success_count INTEGER DEFAULT 1,
        last_seen_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        auto_skill_created INTEGER DEFAULT 0
      )
    `).run();

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_patterns_user_pattern
      ON agent_patterns(user_id, pattern_hash)
    `).run();

    this.initialized = true;
    console.log('[basal-ganglia] Initialized');
  }

  hashPattern(tools, goal) {
    const key = `${goal.slice(0, 30)}|${tools.slice(0, 5).join('→')}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  async trackWorkflow({ userId, workspaceId, goal, tools, success }) {
    if (!success || !goal || !tools?.length) return;

    await this.initialize();

    const patternHash = this.hashPattern(tools, goal);
    const patternSummary = `${goal.slice(0, 50)} → ${tools.slice(0, 3).join(' → ')}`;

    const existing = db.prepare(`
      SELECT id, success_count FROM agent_patterns
      WHERE user_id = ? AND pattern_hash = ?
    `).get(userId, patternHash);

    if (existing) {
      db.prepare(`
        UPDATE agent_patterns
        SET success_count = success_count + 1,
            last_seen_at = datetime('now')
        WHERE id = ?
      `).run(existing.id);

      if (existing.success_count + 1 >= MIN_PATTERN_COUNT && !existing.auto_skill_created) {
        await this.maybeCreateSkill({ userId, workspaceId, patternHash, patternSummary, tools });
      }
    } else {
      db.prepare(`
        INSERT INTO agent_patterns (id, user_id, workspace_id, pattern_hash, pattern_summary, tool_sequence, last_seen_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(randomUUID(), userId, workspaceId, patternHash, patternSummary, JSON.stringify(tools.slice(0, 10)));
    }
  }

  async maybeCreateSkill({ userId, workspaceId, patternHash, patternSummary, tools }) {
    const skillName = this.generateSkillName(patternSummary);
    const skillBody = this.generateSkillBody(patternSummary, tools);

    if (!skillName || !skillBody) return;

    try {
      const userSkillsDir = path.join(process.env.HOME || process.env.USERPROFILE, '.asyncat', 'skills');
      if (!fs.existsSync(userSkillsDir)) {
        fs.mkdirSync(userSkillsDir, { recursive: true });
      }

      const skillPath = path.join(userSkillsDir, `${skillName}.md`);
      if (fs.existsSync(skillPath)) return;

      const skillContent = `---
name: ${skillName}
description: Auto-generated skill from workflow patterns
brain_region: basal-ganglia
weight: 0.8
tags: [auto-generated, learned]
created_by: basal-ganglia
---

${skillBody}
`;

      fs.writeFileSync(skillPath, skillContent);

      db.prepare(`
        UPDATE agent_patterns
        SET auto_skill_created = 1
        WHERE user_id = ? AND pattern_hash = ?
      `).run(userId, patternHash);

      console.log(`[basal-ganglia] Created skill: ${skillName}`);
    } catch (err) {
      console.error('[basal-ganglia] Failed to create skill:', err.message);
    }
  }

  generateSkillName(summary) {
    const words = summary.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 4);
    if (words.length === 0) return null;
    return `auto-${words.join('-')}`;
  }

  generateSkillBody(summary, tools) {
    return `# Auto-Learned Workflow

This skill was auto-generated from ${MIN_PATTERN_COUNT}+ successful uses.

## When to Use
- ${summary}

## Steps
${tools.map((t, i) => `${i + 1}. Use tool: ${t}`).join('\n')}

## Notes
- Learned from repeated successful workflows
- Consider refining these steps for your use case
`;
  }

  getPatterns(userId, limit = 10) {
    return db.prepare(`
      SELECT pattern_summary, success_count, auto_skill_created, last_seen_at
      FROM agent_patterns
      WHERE user_id = ? AND success_count >= 2
      ORDER BY success_count DESC
      LIMIT ?
    `).all(userId, limit);
  }
}

export const basalGanglia = new BasalGanglia();