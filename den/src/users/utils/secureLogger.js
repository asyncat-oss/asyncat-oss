// secureLogger.js - Backend secure logging utility
const isDevelopment = process.env.NODE_ENV === 'development';

// Backend-specific sensitive patterns
const SENSITIVE_PATTERNS = [
  /apikey=[^&\s]+/gi,
  /key=[^&\s]+/gi,
  /token=[^&\s]+/gi,
  /password=[^&\s]+/gi,
  /secret=[^&\s]+/gi,
  /bearer [^\s]+/gi,
  /authorization: [^\s]+/gi,
  /postgresql:\/\/[^\s]+/gi, // Database connection strings
  /mongodb:\/\/[^\s]+/gi,
  /redis:\/\/[^\s]+/gi,
  /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/]*/gi, // JWT tokens
];

// Function to sanitize strings by removing sensitive data
const sanitizeMessage = (message) => {
  if (typeof message !== 'string') {
    return message;
  }
  
  let sanitized = message;
  
  // Replace sensitive patterns with placeholders
  SENSITIVE_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });
  
  return sanitized;
};

// Function to sanitize objects recursively
const sanitizeObject = (obj, maxDepth = 3, currentDepth = 0) => {
  if (currentDepth > maxDepth || obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return sanitizeMessage(obj);
  }
  
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeObject(item, maxDepth, currentDepth + 1));
    }
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip common credential fields entirely
      if (/^(apikey|api_key|token|password|secret|bearer|authorization|database_url|connection_string)$/i.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeObject(value, maxDepth, currentDepth + 1);
      }
    }
    return sanitized;
  }
  
  return obj;
};

// Secure logger wrapper for backend
export const secureLogger = {
  log: (...args) => {
    if (isDevelopment) {
      const sanitizedArgs = args.map(arg => sanitizeObject(arg));
      console.log(...sanitizedArgs);
    }
  },
  
  warn: (...args) => {
    // Always show warnings, but sanitize them
    const sanitizedArgs = args.map(arg => sanitizeObject(arg));
    console.warn(...sanitizedArgs);
  },
  
  error: (...args) => {
    // Always show errors, but sanitize them
    const sanitizedArgs = args.map(arg => sanitizeObject(arg));
    console.error(...sanitizedArgs);
  },
  
  info: (...args) => {
    if (isDevelopment) {
      const sanitizedArgs = args.map(arg => sanitizeObject(arg));
      console.info(...sanitizedArgs);
    }
  },
  
  debug: (...args) => {
    // Only show debug in development
    if (isDevelopment) {
      const sanitizedArgs = args.map(arg => sanitizeObject(arg));
      console.debug(...sanitizedArgs);
    }
  }
};

export default secureLogger;