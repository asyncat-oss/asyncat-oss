import {
  validateAndSanitizeNote,
  validateAndSanitizeChangeset,
  sanitizeNoteData
} from '../utils/sanitizer.js';

export const sanitizeNoteInput = (req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = validateAndSanitizeNote(req.body);
    }
    next();
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid input data',
      details: error.message,
      code: 'SANITIZATION_FAILED'
    });
  }
};

export const sanitizeChangesetInput = (req, res, next) => {
  try {
    if (req.body?.changeset) {
      req.body.changeset = validateAndSanitizeChangeset(req.body.changeset);
    }
    next();
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid changeset data',
      details: error.message,
      code: 'CHANGESET_SANITIZATION_FAILED'
    });
  }
};

export const sanitizeResponse = (req, res, next) => {
  const originalJson = res.json;
  res.json = function(data) {
    try {
      if (data && typeof data === 'object') {
        if (data.data && typeof data.data === 'object') {
          data.data = Array.isArray(data.data)
            ? data.data.map(item => sanitizeNoteData(item))
            : sanitizeNoteData(data.data);
        }
        if (data.title !== undefined || data.content !== undefined || data.blocks !== undefined) {
          data = sanitizeNoteData(data);
        }
      }
    } catch (error) {
      console.error('[SECURITY] Response sanitization failed:', error.message);
    }
    return originalJson.call(this, data);
  };
  next();
};

export const securityMiddleware = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  sanitizeResponse(req, res, next);
};

export default {
  sanitizeNoteInput,
  sanitizeChangesetInput,
  sanitizeResponse,
  securityMiddleware,
};
