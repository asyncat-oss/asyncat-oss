// Creates one local profile on first boot.
// The profile is an internal ownership key, not an account or login.

import { randomUUID } from 'crypto';
import db from './client.js';
import logger from '../logger.js';

export async function seed() {
  const existingUser = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (existingUser) return;

  const userId = randomUUID();
  db.prepare(`
    INSERT INTO users (id, email, name, created_at, updated_at)
    VALUES (?, 'local@asyncat', 'User', datetime('now'), datetime('now'))
  `).run(userId);

  logger.info('Database: seeded local profile; workspace setup pending');
}
