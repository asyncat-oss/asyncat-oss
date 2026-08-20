// Creates one local profile on first boot.
// The profile is an internal ownership key, not an account or login.

import { randomUUID } from 'crypto';
import db from './client.js';
import logger from '../logger.js';

export async function seed() {
  let user = db.prepare('SELECT id FROM users ORDER BY created_at LIMIT 1').get();
  if (!user) {
    const userId = randomUUID();
    db.prepare(`
      INSERT INTO users (id, email, name, created_at, updated_at)
      VALUES (?, 'local@asyncat', 'User', datetime('now'), datetime('now'))
    `).run(userId);
    user = { id: userId };
    logger.info('Database: seeded local profile');
  }

  // Workspaces remain an internal ownership namespace for backwards-compatible
  // conversation and memory relationships. The product UI is Project-first and
  // never asks the local user to create or select this record.
  const existingWorkspace = db.prepare(
    'SELECT id FROM workspaces WHERE owner_id = ? ORDER BY created_at LIMIT 1'
  ).get(user.id);
  if (!existingWorkspace) {
    db.prepare(`
      INSERT INTO workspaces (id, name, owner_id, description, emoji, created_at, updated_at)
      VALUES (?, 'Asyncat', ?, 'Internal local data namespace', '📦', datetime('now'), datetime('now'))
    `).run(randomUUID(), user.id);
    logger.info('Database: initialized internal project namespace');
  }
}
