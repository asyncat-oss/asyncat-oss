// den/src/db/seed.js
// Auto-seeds the database on first boot.
//
// Solo mode  (SOLO_MODE=true, default):
//   Creates one user + one workspace if the users table is empty.
//   Credentials are read from env vars:
//     SOLO_EMAIL    (default: admin@local)
//     SOLO_PASSWORD (default: changeme — printed as a warning if unchanged)
//
// Server mode (SOLO_MODE=false):
//   Does nothing — users register themselves via /api/auth/register.

import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import db from './client.js';
import logger from '../logger.js';

const SOLO_MODE = process.env.SOLO_MODE !== 'false'; // default true

export async function seed() {
  if (!SOLO_MODE) return;

  const existingUser = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (existingUser) return; // already seeded

  const email    = process.env.SOLO_EMAIL    || 'admin@local';
  const password = process.env.SOLO_PASSWORD || 'changeme';

  if (password === 'changeme') {
    logger.warn(
      'WARNING: Using default password "changeme". ' +
      'Set SOLO_PASSWORD in .env before exposing this instance to a network.',
    );
  }

  const userId      = randomUUID();
  const workspaceId = randomUUID();
  const hash        = await bcrypt.hash(password, 12);

  db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
      VALUES (?, ?, ?, 'Admin', datetime('now'), datetime('now'))
    `).run(userId, email, hash);

    db.prepare(`
      INSERT INTO workspaces (id, name, owner_id, created_at, updated_at)
      VALUES (?, 'My Workspace', ?, datetime('now'), datetime('now'))
    `).run(workspaceId, userId);
  })();

  logger.info(`Database: seeded default user (${email}) and workspace`);
}
