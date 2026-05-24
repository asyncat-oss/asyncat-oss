// den/src/agent/MemoryConsolidator.js
// ─── Memory Consolidator ─────────────────────────────────────────────────────
// Merges clusters of low-importance, low-access memories of the same type into
// a single dense summary. Triggered automatically when memory count exceeds a
// threshold, and available as an explicit agent tool via optimize_memory.
//
// Mirrors biological memory consolidation: repetition + low salience → compression.

import db from '../db/client.js';
import { randomUUID } from 'crypto';

const CONSOLIDATION_THRESHOLD = 200; // trigger when workspace exceeds this
const MIN_CLUSTER_SIZE = 3;          // minimum memories needed to form a merge cluster
const MAX_CLUSTER_SIZE = 8;          // max memories collapsed per cluster per pass
const PROTECTED_TYPES = new Set(['user', 'feedback']); // never merged

class MemoryConsolidator {
  constructor() {
    this._running = false;
  }

  shouldConsolidate(userId, workspaceId) {
    try {
      const { cnt } = db.prepare(
        'SELECT COUNT(*) AS cnt FROM agent_memory WHERE user_id = ? AND workspace_id = ?'
      ).get(userId, workspaceId) || {};
      return (cnt || 0) > CONSOLIDATION_THRESHOLD;
    } catch { return false; }
  }

  /**
   * Run a full consolidation pass for a workspace.
   * Safe to call concurrently — a lock prevents double-runs.
   * @returns {{ merged: number, deleted: number, skipped: boolean }}
   */
  async consolidate({ userId, workspaceId, aiClient, model }) {
    if (this._running) return { skipped: true, reason: 'consolidation already in progress' };
    this._running = true;
    try {
      return await this._pass({ userId, workspaceId, aiClient, model });
    } catch (err) {
      console.error('[memory-consolidator] Error:', err.message);
      return { merged: 0, deleted: 0, error: err.message };
    } finally {
      this._running = false;
    }
  }

  async _pass({ userId, workspaceId, aiClient, model }) {
    let merged = 0;
    let deleted = 0;

    // Fetch candidates: low-importance, rarely accessed, non-protected types
    const candidates = db.prepare(`
      SELECT id, key, content, memory_type, importance, access_count
      FROM agent_memory
      WHERE user_id = ? AND workspace_id = ?
        AND importance < 0.7
        AND access_count < 3
        AND memory_type NOT IN ('user', 'feedback')
      ORDER BY memory_type, created_at ASC
      LIMIT 120
    `).all(userId, workspaceId);

    if (candidates.length < MIN_CLUSTER_SIZE) {
      return { merged, deleted, skipped: false };
    }

    // Group by type, then process each group in clusters
    const byType = {};
    for (const row of candidates) {
      if (!byType[row.memory_type]) byType[row.memory_type] = [];
      byType[row.memory_type].push(row);
    }

    const llmCreate = aiClient?.client?.chat?.completions?.create?.bind(
      aiClient.client.chat.completions
    );

    for (const [memType, rows] of Object.entries(byType)) {
      if (rows.length < MIN_CLUSTER_SIZE) continue;

      // Process in clusters
      for (let i = 0; i < rows.length; i += MAX_CLUSTER_SIZE) {
        const cluster = rows.slice(i, i + MAX_CLUSTER_SIZE);
        if (cluster.length < MIN_CLUSTER_SIZE) break;

        const summary = await this._mergeCluster(cluster, memType, llmCreate, model);
        if (!summary) continue;

        const mergedKey = `consolidated_${memType}_${randomUUID().slice(0, 8)}`;
        const maxImportance = Math.max(...cluster.map(r => Number(r.importance || 0.5)));

        db.prepare(`
          INSERT INTO agent_memory (id, user_id, workspace_id, memory_type, key, content, tags, importance)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(), userId, workspaceId, memType, mergedKey,
          summary, JSON.stringify(['consolidated']), maxImportance
        );

        const ids = cluster.map(r => r.id);
        const placeholders = ids.map(() => '?').join(',');
        db.prepare(`DELETE FROM agent_memory WHERE id IN (${placeholders})`).run(...ids);

        merged++;
        deleted += ids.length;
      }
    }

    if (merged > 0) {
      console.log(`[memory-consolidator] ${userId}: merged ${merged} clusters, freed ${deleted} entries`);
    }
    return { merged, deleted, skipped: false };
  }

  async _mergeCluster(cluster, memType, llmCreate, model) {
    const clusterContent = cluster.map(r => `[${r.key}]: ${r.content}`).join('\n');

    if (llmCreate && model) {
      try {
        const resp = await llmCreate({
          model,
          max_tokens: 200,
          messages: [
            {
              role: 'system',
              content: [
                'You merge related agent memory entries into one concise summary.',
                'Return only the merged content text — no keys, labels, or explanation.',
                'Keep it under 120 words. Preserve the most important concrete facts.',
              ].join(' '),
            },
            {
              role: 'user',
              content: `Merge these ${memType} memories:\n\n${clusterContent}`,
            },
          ],
        });
        const text = resp.choices?.[0]?.message?.content?.trim();
        if (text && text.length >= 10) return text;
      } catch { /* fall through to mechanical merge */ }
    }

    // Mechanical fallback: concatenate, truncate
    return cluster.map(r => r.content).join(' | ').slice(0, 400);
  }
}

export const memoryConsolidator = new MemoryConsolidator();
