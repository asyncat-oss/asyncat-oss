// Re-exports shared auth middleware. Do not add service-specific logic here.
export { verifyUser, verifyUserMiddleware } from '../../auth/authMiddleware.js';
import { verifyUser, optionalAuth as _optionalAuth } from '../../auth/authMiddleware.js';
import { attachCompat } from '../../db/compat.js';

// auth: verifyUser + attach compat db client (req.supabase) in one step.
// Use this in route files: router.get('/', auth, handler)
export const auth = (req, res, next) => {
  verifyUser(req, res, (err) => {
    if (err) return next(err);
    attachCompat(req, res, next);
  });
};

// optionalAuth with compat client attached (req.supabase available even for unauthed requests)
export const optionalAuth = (req, res, next) => {
  _optionalAuth(req, res, () => {
    attachCompat(req, res, next);
  });
};
