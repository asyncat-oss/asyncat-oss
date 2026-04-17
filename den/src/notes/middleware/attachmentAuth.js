// attachmentAuth.js — JWT-based attachment auth middleware (OSS version)
import { verifyUser } from '../../auth/authMiddleware.js';
import { attachCompat } from '../../db/compat.js';

// Special middleware for attachment routes — same as standard auth but with
// more explicit CORS headers for image requests from <img src="..."> tags.
export const verifyAttachmentAccess = async (req, res, next) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.FRONTEND_URL || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  };

  const token = req.headers.authorization?.replace('Bearer ', '') ||
                req.query.token ||
                req.cookies?.session_token;

  if (!token) {
    return res.status(401).set(corsHeaders).json({ success: false, error: 'Authentication token required' });
  }

  // Temporarily inject token into Authorization header so verifyUser can pick it up
  req.headers.authorization = `Bearer ${token}`;

  verifyUser(req, res, (err) => {
    if (err) {
      return res.status(401).set(corsHeaders).json({ success: false, error: 'Invalid or expired token' });
    }
    attachCompat(req, res, next);
  });
};
