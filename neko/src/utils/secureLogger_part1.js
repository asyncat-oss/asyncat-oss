const isDevelopment = import.meta.env.DEV;

const SENSITIVE_PATTERNS = [
  /apikey=[^&\s]+/gi,
  /key=[^&\s]+/gi,
  /token=[^&\s]+/gi,
  /password=[^&\s]+/gi,
  /secret=[^&\s]+/gi,
  /bearer [^\s]+/gi,
  /authorization: [^\s]+/gi,
  /wss:\/\/[^\/]+\\.[^\s?]+\\?[^\s]+/gi,
  /https:\/\/[^\/]+\\..supabase\.co\/[^\s?]+\\?[^\s]+/gi,
  /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+]*/gi,
];