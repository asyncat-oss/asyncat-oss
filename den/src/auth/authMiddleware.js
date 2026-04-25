// auth/authMiddleware.js — shared JWT auth middleware
// Replaces the 5 separate Supabase auth middleware copies across services.
// Works entirely offline — no Supabase Auth call needed.
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import db from '../db/client.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const MACHINE_TOKEN_PATH = join(homedir(), '.asyncat_machine_token');

function getMachineToken() {
  try { return readFileSync(MACHINE_TOKEN_PATH, 'utf8').trim(); } catch { return null; }
}

/**
 * Standard verifyUser middleware used across all routes.
 * Reads Bearer token from Authorization header or session_token cookie.
 * Sets req.user = { id, email } on success.
 */
export const verifyUser = async (req, res, next) => {
  const token =
    req.headers.authorization?.replace('Bearer ', '') ||
    req.cookies?.session_token ||
    req.query.token;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  // Machine token: local CLI auth without user credentials.
  // Use the real solo user's ID so DB lookups (provider config, sessions, etc.) work correctly.
  const machineToken = getMachineToken();
  if (machineToken && token === machineToken) {
    const soloUser = db.prepare('SELECT id, email FROM users LIMIT 1').get();
    req.user = soloUser
      ? { id: soloUser.id, email: soloUser.email, role: 'machine' }
      : { id: 'cli', email: 'cli@local', role: 'machine' };
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email, ...payload };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Session expired — please log in again' });
    }
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

/**
 * Alias used by some services (notes).
 */
export const verifyUserMiddleware = verifyUser;

/**
 * Optional auth — sets req.user if a valid token is present, but does not
 * reject the request when no token is provided (for public + authed endpoints).
 */
export const optionalAuth = async (req, _res, next) => {
  const token =
    req.headers.authorization?.replace('Bearer ', '') ||
    req.cookies?.session_token ||
    req.query.token;

  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = { id: payload.sub, email: payload.email, ...payload };
    } catch {
      // ignore invalid / expired tokens in optional mode
    }
  }
  next();
};
