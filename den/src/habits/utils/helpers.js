// helpers.js — auth + utility helpers for habits routes
import { verifyUser } from '../../auth/authMiddleware.js';
import { attachCompat } from '../../db/compat.js';

export { verifyUser };

export const getCurrentDateTime = () => {
  const now = new Date();
  return now.toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone: 'UTC',
  });
};

// authenticate: JWT verify + attach compat db client as req.supabase.
// Single composed middleware — drop-in for routes that do: router.get('/', authenticate, handler)
export const authenticate = (req, res, next) => {
  verifyUser(req, res, (err) => {
    if (err) return next(err);
    attachCompat(req, res, next);
  });
};
