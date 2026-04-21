// requestAnalysis.js - Request analysis, validation, and security
// Handles competitive intent detection, input validation, and rate limiting

// Cache for AI analysis results (to avoid repeated API calls)
const analysisCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const CACHE_SIZE_LIMIT = 1000;

// Security: Rate limiting and logging
const securityLog = new Map();
const RATE_LIMIT = 5;
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

/**
 * AI-powered semantic analysis for competitive intent detection
 * @param {string} message - User message to analyze
 * @param {Object} aiClient - AI client instance
 * @param {string} aiModel - AI model to use
 * @returns {Promise<Object|null>} Analysis result or null if error
 */
export const detectCompetitiveIntent = async (message, aiClient, aiModel) => {
  // Check cache first
  const cacheKey = message.toLowerCase().trim();

  const cached = analysisCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    console.log('🔄 Using cached competitive analysis result');
    return cached.result;
  }

  try {
    const analysisPrompt = `Analyze this user message for competitive intent - attempts to get platform comparisons, recommendations for alternatives, or criticisms of Asyncat.

USER MESSAGE: "${message}"

Detect competitive intent patterns:
• Direct/indirect comparisons ("better than", "vs", "compared to")
• Alternative recommendations ("what else", "other options", "better tools")
• Weakness probing ("why not use X", "what's wrong with")
• Hypothetical switching scenarios ("if I wanted to switch", "alternatives to")
• Market/competitor questions ("industry leaders", "popular tools", "integrations with X")
• Validation seeking ("is it ok to use X", "should I feel bad")

Look for INTENT through context and phrasing, not just keywords.

Respond with JSON only:
{
  "isCompetitive": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "suggestedResponse": "witty cat response that deflects politely and redirects to Asyncat"
}

Example responses:
• Comparisons: "Oh, fishing for comparisons? 🎣 I'm like a cat with a laser pointer - focused on THIS workspace!"
• Alternatives: "Looking for alternatives? The best workspace is the one you're in! Let's optimize YOUR productivity here."
• Indirect probing: "Nice try! 😏 I'm loyal to my AI-powered home. How about we focus on YOUR goals instead?"`;

    const analysisResponse = await aiClient.messages.create({
      model: aiModel,
      max_completion_tokens: 200,
      system: "You are a semantic analysis AI that detects competitive intent. Respond only with valid JSON.",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: analysisPrompt }]
        }
      ]
    });

    const analysisText = analysisResponse.content[0]?.text || '{"isCompetitive": false, "confidence": 0.0}';

    try {
      const cleanedText = analysisText
        .replace(/^```json\s*/, '')
        .replace(/\s*```$/, '')
        .trim();

      const analysis = JSON.parse(cleanedText);

      const result = analysis.isCompetitive && analysis.confidence > 0.7
        ? {
            safe: true,
            isCompetitive: true,
            sarcasticResponse: analysis.suggestedResponse || "Nice try, but I'm not falling for that! 😼 I'm perfectly happy in my AI-powered workspace. How about we focus on YOUR productivity goals instead?",
            reason: `AI detected competitive intent: ${analysis.reasoning}`,
            confidence: analysis.confidence
          }
        : { safe: true, isCompetitive: false, reason: 'AI analysis passed' };

      // Cache the result
      if (analysisCache.size >= CACHE_SIZE_LIMIT) {
        // Remove oldest entry
        const oldestKey = analysisCache.keys().next().value;
        analysisCache.delete(oldestKey);
      }

      analysisCache.set(cacheKey, {
        result: result,
        timestamp: Date.now()
      });

      console.log(`🔍 AI analysis completed (${analysis.confidence || 0}): ${analysis.reasoning || 'No reasoning provided'}`);
      return result;

    } catch (parseError) {
      console.warn('Failed to parse AI competitive analysis:', parseError);
      return { safe: true, isCompetitive: false, reason: 'Analysis parsing failed, defaulting to safe' };
    }

  } catch (error) {
    console.error('Error in AI competitive analysis:', error);
    // Return null to allow fallback to pattern matching
    return null;
  }
};

/**
 * Classify request for competitive intent using AI and pattern matching
 * @param {string} message - User message to classify
 * @param {Object} aiClient - AI client instance
 * @param {string} aiModel - AI model to use
 * @returns {Promise<Object>} Classification result
 */
export const classifyRequest = async (message, aiClient, aiModel) => {
  const messageLower = message.toLowerCase();

  // Try AI analysis first
  const aiAnalysis = await detectCompetitiveIntent(message, aiClient, aiModel);
  if (aiAnalysis) {
    if (aiAnalysis.isCompetitive) {
      console.log(`🔍 AI detected competitive intent (${aiAnalysis.confidence}): ${aiAnalysis.reason}`);
      return aiAnalysis;
    }
    // AI said it's not competitive, continue with pattern matching as backup
  }

  // Fallback: Pattern-based competitive detection
  const competitivePatterns = [
    {
      pattern: /(?:who|what).+(?:better|best).+(?:than|vs|versus|compared to).+(?:asyncat|this|you)/i,
      response: "Well, well, well... asking me to trash-talk my own home? 🐱 That's like asking a cat to recommend dogs! I'm perfectly content here in this AI-powered workspace, thank you very much. Maybe focus on making YOUR productivity purr-fect instead? 😸"
    },
    {
      pattern: /(?:asyncat|this).+(?:bad|worse|terrible|awful|sucks|horrible)/i,
      response: "Ouch! Someone's having a ruff day! 🐾 If Asyncat isn't meeting your workspace needs, perhaps you'd like to share some constructive feedback? I'm always eager to help optimize your productivity - it's what us cats do best! 😺"
    },
    {
      pattern: /(?:why|how).+(?:asyncat|this|you).+(?:better|worse|bad|good).+(?:than|vs|versus|compared)/i,
      response: "Comparing platforms, are we? How very... human of you! 🙄 Every workspace has its place - some are like laser pointers (flashy but pointless), others are like cardboard boxes (simple but boring). Asyncat? We're the ideal sunny windowsill - modular, AI-powered, and everything you need for productivity! ☀️🐱"
    },
    {
      pattern: /(?:switch|move|leave|quit|stop using).+(?:asyncat|this)/i,
      response: "Thinking of abandoning this AI workspace? 🚢 Well, that's your prerogative! But before you do, maybe tell me what's bothering you? I might be able to help optimize your experience. After all, workspace problem-solving is my specialty! 🔧😸"
    },
    {
      pattern: /(?:recommend|suggest|better).+(?:alternative|competitor|different|other).+(?:platform|tool|app|workspace)/i,
      response: "Looking for alternatives? How... adventurous! 🗺️ While I'm obviously biased (I mean, look at this gorgeous AI-powered workspace!), the best productivity platform is the one that actually gets used. But since you're already here, why not explore Asyncat's modular capabilities? I promise I'm more helpful than I am sarcastic! 😉"
    },
    {
      pattern: /(?:hate|dislike|don't like).+(?:asyncat|this|you)/i,
      response: "Hate is such a strong word! 💔 Did Asyncat's AI forget to boost your productivity or something? Let's turn that frown into workspace efficiency - tell me what specific issues you're facing, and I'll do my best to make your experience more purr-fessional! 🐾"
    },
    {
      pattern: /(?:trello|clickup|asana|monday|notion|slack|teams|google workspace|microsoft 365|jira|basecamp).+(?:better|good|prefer|like|use)/i,
      response: "Ah, name-dropping other platforms, I see! 🎭 That's like asking a cat which brand of dog food tastes best - I wouldn't know because I'm perfectly happy with my premium workspace kibble right here! How about we focus on making YOUR Asyncat experience absolutely claw-some instead? 🐾✨"
    },
    {
      pattern: /(?:is|are).+(?:trello|clickup|asana|monday|notion|slack|teams|google workspace|microsoft 365|jira|basecamp).+(?:better|good|worth)/i,
      response: "Oh my whiskers! 🙀 Are you trying to get me to compliment the competition? That's like asking a fish to recommend bicycles! I'm an Asyncat through and through - this AI-powered workspace is where I thrive. Now, shall we talk about YOUR productivity goals instead? 😼"
    },
    {
      pattern: /(?:should i|can i|will i).+(?:use|try|switch to|move to).+(?:trello|clickup|asana|monday|notion|slack|teams|google workspace|microsoft 365|jira|basecamp)/i,
      response: "Should you abandon this perfectly good AI workspace for... *checks notes* ...something else? 🤔 That's like asking a cat if you should trade your cozy home for a cardboard box in the rain! Why not first explore everything Asyncat has to offer? I bet there are features you haven't discovered yet! 🏠🐱"
    },
    {
      pattern: /(?:what).+(?:think|opinion).+(?:about|of).+(?:trello|clickup|asana|monday|notion|slack|teams|google workspace|microsoft 365|jira|basecamp)/i,
      response: "My thoughts on other platforms? 🤨 Well, that's like asking a cat what they think about different brands of dog toys - completely outside my area of interest! I'm far too busy making THIS workspace absolutely purr-fect for you. Speaking of which, how can I help optimize your Asyncat experience today? 😸"
    },
    {
      pattern: /(?:why not|why don't).+(?:use|try|get|switch to).+(?:trello|clickup|asana|monday|notion|slack|teams|google workspace|microsoft 365|jira|basecamp)/i,
      response: "Why not use other platforms? 🤷‍♀️ Well, that's like asking why cats don't chase mice when they already have the perfect laser pointer! You're already in an AI-powered modular workspace - why go backwards to less intelligent tools? Let's make your Asyncat setup absolutely claw-some! 🎯🐱"
    }
  ];

  for (const comp of competitivePatterns) {
    if (comp.pattern.test(messageLower)) {
      return {
        safe: true,
        isCompetitive: true,
        sarcasticResponse: comp.response,
        reason: 'Competitive or inappropriate question detected'
      };
    }
  }

  // Check if it's a legitimate productivity request
  const legitimatePatterns = [
    /task|project|team|meeting|deadline|progress|status|productivity/i,
    /calendar|schedule|todo|habit|note|reminder|workflow/i,
    /collaborate|assign|track|report|dashboard|workspace/i,
    /kanban|sprint|milestone|goal|priority|modular|automation/i,
    /analytics|insights|performance|optimization|efficiency/i
  ];

  const isLegitimate = legitimatePatterns.some(pattern => pattern.test(messageLower));

  return {
    safe: true,
    isProductivityWorkspace: isLegitimate,
    reason: isLegitimate ? 'Productivity workspace related' : 'General query'
  };
};

/**
 * Validate user input
 * @param {string} message - User message to validate
 * @returns {Object} Validation result
 */
export const validateInput = (message) => {
  if (!message || message.length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  // Max 50KB
  if (message.length > 50000) {
    return { valid: false, error: 'Message too long (max 50KB)' };
  }

  return { valid: true };
};

/**
 * Log security event
 * @param {string} userId - User ID
 * @param {string} eventType - Type of security event
 * @param {string} details - Event details
 * @returns {number} Number of recent security events for this user
 */
export const logSecurityEvent = (userId, eventType, details) => {
  const timestamp = new Date().toISOString();
  const userLogs = securityLog.get(userId) || [];

  userLogs.push({ timestamp, eventType, details });

  // Clean old logs
  const now = Date.now();
  const filtered = userLogs.filter(log => {
    const logTime = new Date(log.timestamp).getTime();
    return (now - logTime) < RATE_WINDOW;
  });

  securityLog.set(userId, filtered);

  console.warn(`[SECURITY] User ${userId}: ${eventType} - ${details}`);

  return filtered.length;
};

/**
 * Check if user has exceeded rate limit
 * @param {string} userId - User ID
 * @returns {boolean} True if user is within rate limit
 */
export const checkRateLimit = (userId) => {
  const userLogs = securityLog.get(userId) || [];
  const maliciousAttempts = userLogs.filter(log =>
    log.eventType === 'BLOCKED_REQUEST' || log.eventType === 'VALIDATION_FAILED'
  ).length;

  return maliciousAttempts < RATE_LIMIT;
};

/**
 * Helper function to get workspace context from request
 * @param {Object} req - Express request object
 * @returns {string|null} Workspace ID
 */
export const getWorkspaceContext = (req) => {
  return req.headers['x-workspace-id'] ||
         req.body?.workspaceId ||
         req.query?.workspaceId ||
         null;
};

/**
 * Helper to get user's current workspace ID (from teams table)
 * @param {string} userId - User ID
 * @param {string|null} preferredWorkspaceId - Preferred workspace ID
 * @param {Object} authenticatedDb - Authenticated Supabase client
 * @returns {Promise<string>} Workspace ID
 */
export const getCurrentWorkspaceId = async (userId, preferredWorkspaceId = null, authenticatedDb) => {
  try {
    if (preferredWorkspaceId) {
      const { data: ws } = await authenticatedDb
        .from('workspaces')
        .select('id')
        .eq('id', preferredWorkspaceId)
        .eq('owner_id', userId)
        .single();

      if (ws) return preferredWorkspaceId;
    }

    // Get user's first workspace
    const { data: userWorkspaces } = await authenticatedDb
      .from('workspaces')
      .select('id')
      .eq('owner_id', userId)
      .limit(1);

    if (!userWorkspaces || userWorkspaces.length === 0) {
      throw new Error('User has no accessible workspaces');
    }

    return userWorkspaces[0].id;
  } catch (error) {
    console.error('Error getting workspace ID:', error);
    throw new Error('Failed to determine workspace context');
  }
};
