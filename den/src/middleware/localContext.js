import db from '../db/client.js';
import { attachDb } from '../db/sqlite.js';

/**
 * Attach Asyncat's single local profile to every request.
 *
 * The profile ID remains an internal ownership key so existing local projects,
 * notes, and agent history keep their relationships. It is not a login,
 * credential, or authorization boundary.
 */
export const attachLocalContext = (req, res, next) => {
  const user = db
    .prepare('SELECT id, email, name, profile_picture FROM users ORDER BY created_at LIMIT 1')
    .get();

  if (!user) {
    return res.status(503).json({
      success: false,
      error: 'The local profile is not initialized yet.',
    });
  }

  req.user = { ...user, role: 'local' };
  return attachDb(req, res, next);
};
