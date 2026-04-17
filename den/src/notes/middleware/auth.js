export { verifyUser, verifyUserMiddleware } from '../../auth/authMiddleware.js';
import { verifyUser } from '../../auth/authMiddleware.js';
import { attachCompat } from '../../db/compat.js';

export const auth = (req, res, next) => {
  verifyUser(req, res, (err) => {
    if (err) return next(err);
    attachCompat(req, res, next);
  });
};

// verifyUserMiddleware alias with compat client attached
export const verifyUserWithCompat = auth;
