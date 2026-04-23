const isDevelopment = import.meta.env.DEV;

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
  /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+]*/gi,
];

const sanitizeMessage = (message) => {
  if (typeof message !== 'string') {
    return message;
  }

  let sanitized = message;

  SENSITIVE_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });

  sanitized = sanitized.replace(
    /wss:\/\/[^\/]+\.supabase\.co\/realtime\/v1\/websocket\?[^\s]+/gi,
    'wss://[SUPABASE_HOST]/realtime/v1/websocket?[CREDACTED]'
  );

  return sanitized;
};

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

export const secureLogger = {
  log: (...args) => {
    if (isDevelopment) {
      const sanitizedArgs = args.map(arg => sanitizeObject(arg));
      console.log(...sanitizedArgs);
    }
  },

  warn: (...args) => {
    const sanitizedArgs = args.map(arg => sanitizeObject(arg));
    console.warn(...sanitizedArgs);
  },

  error: (...args) => {
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
    if (isDevelopment) {
      const sanitizedArgs = args.map(arg => sanitizeObject(arg));
      console.debug(...sanitizedArgs);
    }
  }
};

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
