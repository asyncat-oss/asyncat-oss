// den/src/db/seed.js
// Auto-seeds the database on first boot.
//
// Creates one local account if the users table is empty.
// Workspace setup is handled by the frontend first-run walkthrough.
// Credentials are read from env vars:
//   LOCAL_EMAIL    (default: admin@local)
//   LOCAL_PASSWORD (default: changeme — printed as a warning if unchanged)

import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import db from './client.js';
import logger from '../logger.js';

export async function seed() {
  const existingUser = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (existingUser) return; // already seeded

  const email    = process.env.LOCAL_EMAIL    || process.env.SOLO_EMAIL    || 'admin@local';
  const password = process.env.LOCAL_PASSWORD || process.env.SOLO_PASSWORD || 'changeme';

  if (password === 'changeme') {
    logger.warn(
      'WARNING: Using default password "changeme". ' +
      'Set LOCAL_PASSWORD in .env before exposing this instance to a network.',
    );
  }

  const userId      = randomUUID();
  const hash        = await bcrypt.hash(password, 12);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
    VALUES (?, ?, ?, 'Admin', datetime('now'), datetime('now'))
  `).run(userId, email, hash);

  logger.info(`Database: seeded default user (${email}); workspace setup pending`);
}
