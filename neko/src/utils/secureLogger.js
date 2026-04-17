// secureLogger.js - Safe logging utility that prevents credential exposure
const isDevelopment = process.env.NODE_ENV === 'development' || import.meta.env.DEV;

// In production, we can completely disable certain types of logging
const isProduction = process.env.NODE_ENV === 'production' || import.meta.env.PROD;

// Regex patterns to detect sensitive information
const SENSITIVE_PATTERNS = [
  /apikey=[^&\s]+/gi,
  /key=[^&\s]+/gi,
  /token=[^&\s]+/gi,
  /password=[^&\s]+/gi,
  /secret=[^&\s]+/gi,
  /bearer [^\s]+/gi,
  /authorization: [^\s]+/gi,
  /wss:\/\/[^\/]+\/[^\s?]+\?[^\s]+/gi,
  /https:\/\/[^\/]+\.supabase\.co\/[^\s?]+\?[^\s]+/gi,
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
  
  // Replace specific known sensitive URLs
  sanitized = sanitized.replace(
    /wss:\/\/[^\/]+\.supabase\.co\/realtime\/v1\/websocket\?[^\s]+/gi,
    'wss://[SUPABASE_HOST]/realtime/v1/websocket?[CREDENTIALS_REDACTED]'
  );
  
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
      if (/^(apikey|api_key|token|password|secret|bearer|authorization)$/i.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeObject(value, maxDepth, currentDepth + 1);
      }
    }
    return sanitized;
  }
  
  return obj;
};

// Secure logger wrapper
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

// Connection status messages that don't expose credentials
export const getConnectionStatusMessage = (status, context = '') => {
  const messages = {
    'CONNECTING': `Establishing secure connection${context ? ` for ${context}` : ''}...`,
    'CONNECTED': `Secure connection established${context ? ` for ${context}` : ''}`,
    'DISCONNECTED': `Connection closed${context ? ` for ${context}` : ''}`,
    'RECONNECTING': `Attempting to reconnect${context ? ` for ${context}` : ''}...`,
    'CHANNEL_ERROR': `Connection failed${context ? ` for ${context}` : ''} - using offline mode`,
    'TIMED_OUT': `Connection timeout${context ? ` for ${context}` : ''} - using offline mode`,
    'SUBSCRIBED': `Successfully subscribed${context ? ` to ${context}` : ''}`,
    'SUBSCRIPTION_ERROR': `Subscription failed${context ? ` for ${context}` : ''} - using fallback`
  };
  
  return messages[status] || `Connection status: ${status}${context ? ` (${context})` : ''}`;
};

export default secureLogger;