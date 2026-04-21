// Re-exports shared auth middleware. Do not add service-specific logic here.
export { verifyUser, verifyUserMiddleware } from '../../auth/authMiddleware.js';
import { verifyUser, optionalAuth as _optionalAuth } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';

// auth: verifyUser + attach compat db client (req.db) in one step.
// Use this in route files: router.get('/', auth, handler)
export const auth = (req, res, next) => {
  verifyUser(req, res, (err) => {
    if (err) return next(err);
    attachDb(req, res, next);
  });
};

// optionalAuth with db client attached (req.db available even for unauthed requests)
export const optionalAuth = (req, res, next) => {
  _optionalAuth(req, res, () => {
    attachDb(req, res, next);
  });
};
