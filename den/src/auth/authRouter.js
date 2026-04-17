// auth/authRouter.js — login, register, logout, me endpoints
// Mounts at /api/auth in den/src/index.js
// Auth is now fully local: bcrypt passwords in SQLite, JWT sessions.
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import db from '../db/client.js';
import { verifyUser } from './authMiddleware.js';

const router = express.Router();

const JWT_SECRET     = process.env.JWT_SECRET     || 'change-this-secret-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SOLO_MODE      = process.env.SOLO_MODE !== 'false'; // default true

// ─── Helpers ──────────────────────────────────────────────────────────────────

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, profile_picture: user.profile_picture };
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !user.password_hash) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = issueToken(user);
    res.json({ success: true, token, user: publicUser(user) });
  } catch (err) {
    console.error('[Auth] login error:', err.message);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// Disabled in solo mode (one user is seeded automatically).

router.post('/register', async (req, res) => {
  if (SOLO_MODE) {
    return res.status(403).json({
      success: false,
      error: 'Registration is disabled in solo mode. Use SOLO_EMAIL / SOLO_PASSWORD in .env.',
    });
  }

  const { email, password, name } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
  }

  try {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Email already in use' });
    }

    const userId      = randomUUID();
    const workspaceId = randomUUID();
    const hash        = await bcrypt.hash(password, 12);

    db.transaction(() => {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(userId, email, hash, name || null);

      db.prepare(`
        INSERT INTO workspaces (id, name, owner_id, created_at, updated_at)
        VALUES (?, 'My Workspace', ?, datetime('now'), datetime('now'))
      `).run(workspaceId, userId);
    })();

    const user  = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const token = issueToken(user);
    res.status(201).json({ success: true, token, user: publicUser(user) });
  } catch (err) {
    console.error('[Auth] register error:', err.message);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get('/me', verifyUser, (req, res) => {
  // Fetch fresh user row so name / avatar changes are reflected immediately
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  res.json({ success: true, user: publicUser(user) });
});

// ─── POST /api/auth/update-password ──────────────────────────────────────────

router.post('/update-password', verifyUser, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(hash, req.user.id);
    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    console.error('[Auth] update-password error:', err.message);
    res.status(500).json({ success: false, error: 'Password update failed' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
// Stateless — client discards the token.

router.post('/logout', (_req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

export default router;
