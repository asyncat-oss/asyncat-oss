import {
  validateAndSanitizeNote,
  validateAndSanitizeChangeset,
  sanitizeNoteData
} from '../utils/sanitizer.js';

/**
 * Middleware to sanitize and validate note creation/update requests
 */
export const sanitizeNoteInput = (req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object') {
      // Sanitize the request body
      req.body = validateAndSanitizeNote(req.body);
      console.log('[SECURITY] Note input sanitized successfully');
    }
    next();
  } catch (error) {
    console.error('[SECURITY] Note sanitization failed:', error.message);
    return res.status(400).json({
      error: 'Invalid input data',
      details: error.message,
      code: 'SANITIZATION_FAILED'
    });
  }
};

/**
 * Middleware to sanitize delta changeset requests
 */
export const sanitizeChangesetInput = (req, res, next) => {
  try {
    console.log('[DEBUG] sanitizeChangesetInput - Request body:', JSON.stringify(req.body, null, 2));

    if (req.body && req.body.changeset) {
      console.log('[DEBUG] Found changeset, validating...');
      console.log('[DEBUG] Changeset structure:', JSON.stringify(req.body.changeset, null, 2));

      // Sanitize the changeset
      req.body.changeset = validateAndSanitizeChangeset(req.body.changeset);
      console.log('[SECURITY] Changeset sanitized successfully');
    } else {
      console.log('[DEBUG] No changeset found in request body');
    }
    next();
  } catch (error) {
    console.error('[SECURITY] Changeset sanitization failed:', error.message);
    console.error('[DEBUG] Full error:', error);
    return res.status(400).json({
      error: 'Invalid changeset data',
      details: error.message,
      code: 'CHANGESET_SANITIZATION_FAILED'
    });
  }
};

/**
 * Middleware to sanitize response data before sending to client
 */
export const sanitizeResponse = (req, res, next) => {
  // Override res.json to sanitize outgoing data
  const originalJson = res.json;

  res.json = function(data) {
    try {
      if (data && typeof data === 'object') {
        // Sanitize response data
        if (data.data && typeof data.data === 'object') {
          data.data = sanitizeNoteData(data.data);
        }

        // Handle arrays of notes
        if (Array.isArray(data.data)) {
          data.data = data.data.map(item => sanitizeNoteData(item));
        }

        // Handle direct note data
        if (data.title !== undefined || data.content !== undefined || data.blocks !== undefined) {
          data = sanitizeNoteData(data);
        }

        console.log('[SECURITY] Response data sanitized');
      }
    } catch (error) {
      console.error('[SECURITY] Response sanitization failed:', error.message);
      // Don't fail the request, just log the error
    }

    return originalJson.call(this, data);
  };

  next();
};

/**
 * Comprehensive security middleware that combines all sanitization
 */
export const securityMiddleware = (req, res, next) => {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Apply response sanitization
  sanitizeResponse(req, res, () => {
    // Log security event
    console.log(`[SECURITY] ${req.method} ${req.path} - Security middleware applied`);
    next();
  });
};

/**
 * Input sanitization for general request bodies
 */
export const sanitizeGeneralInput = (req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object') {
      // Recursively sanitize string values in request body
      req.body = sanitizeObjectStrings(req.body);
      console.log('[SECURITY] General input sanitized');
    }
    next();
  } catch (error) {
    console.error('[SECURITY] General sanitization failed:', error.message);
    return res.status(400).json({
      error: 'Input sanitization failed',
      code: 'GENERAL_SANITIZATION_FAILED'
    });
  }
};

/**
 * Helper function to recursively sanitize string values in objects
 */
const sanitizeObjectStrings = (obj) => {
  if (typeof obj === 'string') {
    // Basic XSS prevention for non-HTML content
    return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
             .replace(/javascript:/gi, '')
             .replace(/on\w+\s*=/gi, '');
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObjectStrings(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObjectStrings(value);
    }
    return sanitized;
  }

  return obj;
};

export default {
  sanitizeNoteInput,
  sanitizeChangesetInput,
  sanitizeResponse,
  securityMiddleware,
  sanitizeGeneralInput
};