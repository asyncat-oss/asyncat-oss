// auth/authRouter.js — login, register, logout, me endpoints
// Mounts at /api/auth in den/src/index.js
// Auth is now fully local: bcrypt passwords in SQLite, JWT sessions.
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from '../db/client.js';
import { verifyUser } from './authMiddleware.js';

const router = express.Router();

const JWT_SECRET     = process.env.JWT_SECRET     || 'change-this-secret-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

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
// Registration is disabled in the local build. The local account is seeded once
// and can be edited from the first-run workspace setup or Settings.

router.post('/register', (_req, res) => {
  res.status(403).json({
    success: false,
    error: 'Registration is disabled in the local build. Sign in with the local account.',
  });
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

// ─── PUT /api/auth/local-account ─────────────────────────────────────────────

router.put('/local-account', verifyUser, async (req, res) => {
  const { name, email, password } = req.body;
  const nextName = typeof name === 'string' ? name.trim() : undefined;
  const nextEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;
  const nextPassword = typeof password === 'string' ? password : undefined;

  if (nextEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$|^[^\s@]+@local$/i.test(nextEmail)) {
    return res.status(400).json({ success: false, error: 'Enter a valid email address.' });
  }

  if (nextPassword !== undefined && nextPassword.length > 0 && nextPassword.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
  }

  try {
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!current) return res.status(404).json({ success: false, error: 'User not found' });

    if (nextEmail && nextEmail !== current.email) {
      const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(nextEmail, req.user.id);
      if (existing) return res.status(409).json({ success: false, error: 'Email already in use.' });
    }

    const updates = [];
    const params = [];

    if (nextName !== undefined) {
      updates.push('name = ?');
      params.push(nextName || null);
    }
    if (nextEmail !== undefined) {
      updates.push('email = ?');
      params.push(nextEmail);
    }
    if (nextPassword !== undefined && nextPassword.length > 0) {
      const hash = await bcrypt.hash(nextPassword, 12);
      updates.push('password_hash = ?');
      params.push(hash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No account fields provided.' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.user.id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const token = issueToken(user);
    res.json({ success: true, token, user: publicUser(user) });
  } catch (err) {
    console.error('[Auth] local-account error:', err.message);
    res.status(500).json({ success: false, error: 'Account update failed' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
// Stateless — client discards the token.

router.post('/logout', (_req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

// ─── GET /api/auth/status ────────────────────────────────────────────────────
// Returns local auth metadata for the auth UI

router.get('/status', (_req, res) => {
  const user = db.prepare('SELECT email FROM users LIMIT 1').get();
  const hasWorkspace = !!db.prepare('SELECT id FROM workspaces LIMIT 1').get();
  res.json({
    success: true,
    mode: 'local',
    localEmail: user?.email || process.env.LOCAL_EMAIL || process.env.SOLO_EMAIL || 'admin@local',
    isFirstRun: !hasWorkspace,
  });
});

// ─── POST /api/auth/first-run ─────────────────────────────────────────────────
// Issues a token automatically during first-run (no workspace created yet).
// Once a workspace exists this endpoint returns 403.

router.post('/first-run', (_req, res) => {
  const hasWorkspace = !!db.prepare('SELECT id FROM workspaces LIMIT 1').get();
  if (hasWorkspace) {
    return res.status(403).json({ success: false, error: 'First-run setup already completed.' });
  }
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user) {
    return res.status(404).json({ success: false, error: 'No local user found.' });
  }
  const token = issueToken(user);
  res.json({ success: true, token, user: publicUser(user) });
});

export default router;
