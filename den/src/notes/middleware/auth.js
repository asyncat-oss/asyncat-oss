export { verifyUser, verifyUserMiddleware } from '../../auth/authMiddleware.js';
import { verifyUser } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';

export const auth = (req, res, next) => {
  verifyUser(req, res, (err) => {
    if (err) return next(err);
    attachDb(req, res, next);
  });
};

// verifyUserMiddleware alias with db client attached
export const verifyUserWithCompat = auth;
