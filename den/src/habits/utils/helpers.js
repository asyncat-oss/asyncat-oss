// helpers.js — auth + utility helpers for habits routes
import { verifyUser } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';

export { verifyUser };

export const getCurrentDateTime = () => {
  const now = new Date();
  return now.toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone: 'UTC',
  });
};

// authenticate: JWT verify + attach db client as req.db.
// Single composed middleware — drop-in for routes that do: router.get('/', authenticate, handler)
export const authenticate = (req, res, next) => {
  verifyUser(req, res, (err) => {
    if (err) return next(err);
    attachDb(req, res, next);
  });
};
