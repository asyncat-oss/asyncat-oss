// artifactParser.js - Parse AI responses for artifacts
import crypto from 'crypto';

/**
 * Artifact Parser
 *
 * Detects and extracts artifacts from AI responses
 *
 * Artifact Format:
 * <artifact type="code|document|diagram|canvas" title="Title" language="javascript" editable="true">
 * ... content ...
 * </artifact>
 *
 * Returns:
 * {
 *   content: "Main text without artifacts",
 *   artifacts: [{ id, type, title, content, language, metadata }],
 *   artifactExplanation: "Explanation text before artifacts"
 * }
 */

class ArtifactParser {
  /**
   * Parse AI response for artifacts
   * In UNIFIED mode, if no artifact tags found, auto-wrap the response
   */
  parseResponse(aiResponse, autoWrap = true) {
    if (!aiResponse || typeof aiResponse !== 'string') {
      return {
        content: aiResponse || '',
        artifacts: [],
        artifactExplanation: null
      };
    }

    // Artifact regex pattern
    const artifactPattern = /<artifact\s+([^>]+)>([\s\S]*?)<\/artifact>/gi;

    const artifacts = [];
    let remainingContent = aiResponse;
    let artifactExplanation = null;

    // Find all artifacts
    let match;
    while ((match = artifactPattern.exec(aiResponse)) !== null) {
      const attributes = this.parseAttributes(match[1]);
      const content = match[2].trim();

      // Create artifact object
      const artifact = {
        id: this.generateArtifactId(),
        type: attributes.type || 'document',
        title: attributes.title || 'Response',
        content: content,
        language: attributes.language || null,
        metadata: {
          editable: attributes.editable === 'true' || attributes.editable === true,
          downloadable: attributes.downloadable !== 'false',
          executable: attributes.executable === 'true' || attributes.executable === true
        }
      };

      artifacts.push(artifact);

      // Remove artifact from content
      remainingContent = remainingContent.replace(match[0], '');
    }

    // If artifacts were found, extract explanation (text before first artifact)
    if (artifacts.length > 0) {
      const firstArtifactIndex = aiResponse.indexOf('<artifact');
      if (firstArtifactIndex > 0) {
        artifactExplanation = aiResponse.substring(0, firstArtifactIndex).trim();
      }
    } else if (autoWrap && aiResponse.trim().length > 0) {
      // UNIFIED MODE FALLBACK: No artifact tags found, auto-wrap the response
      
      // Check for separator to split conversation from content
      // Look for horizontal rule (---) which often separates intro from content
      const separatorRegex = /\n\s*---\s*\n/;
      const separatorMatch = separatorRegex.exec(aiResponse);
      
      // Also look for the first major header as a potential split point if no separator
      const headerRegex = /\n#+\s/;
      const headerMatch = headerRegex.exec(aiResponse);
      
      let contentToWrap = aiResponse.trim();
      let conversationPart = '';
      
      if (separatorMatch && separatorMatch.index > 0) {
        // Found a separator, split the content
        conversationPart = aiResponse.substring(0, separatorMatch.index).trim();
        contentToWrap = aiResponse.substring(separatorMatch.index + separatorMatch[0].length).trim();
      } else if (headerMatch && headerMatch.index > 50) {
        // Found a header deeper in the text (likely after an intro), split there
        // We check > 50 to avoid splitting if the response starts immediately with a header
        conversationPart = aiResponse.substring(0, headerMatch.index).trim();
        contentToWrap = aiResponse.substring(headerMatch.index).trim();
      }
      
      // Extract title from first line if it's a header
      let title = 'Response';
      const titleMatch = contentToWrap.match(/^#+\s+(.+)$/m);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }
      
      artifacts.push({
        id: this.generateArtifactId(),
        type: 'document',
        title: title,
        content: contentToWrap,
        language: null,
        metadata: {
          editable: true,
          downloadable: true,
          executable: false
        }
      });
      
      remainingContent = conversationPart; 
    }

    return {
      content: remainingContent.trim(),
      artifacts: artifacts.length > 0 ? artifacts : null,
      artifactExplanation
    };
  }

  /**
   * Parse artifact attributes from tag
   */
  parseAttributes(attributeString) {
    const attributes = {};

    // Pattern to match: attribute="value" or attribute='value' or attribute=value
    const attrPattern = /(\w+)=["']?([^"'>\s]+)["']?/g;

    let match;
    while ((match = attrPattern.exec(attributeString)) !== null) {
      attributes[match[1]] = match[2];
    }

    return attributes;
  }

  /**
   * Generate unique artifact ID
   */
  generateArtifactId() {
    return `artifact_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Check if response should have artifacts
   * This analyzes the user's request to determine if AI should generate artifacts
   */
  shouldGenerateArtifact(userMessage) {
    if (!userMessage || typeof userMessage !== 'string') {
      return false;
    }

    const message = userMessage.toLowerCase();

    // Keywords that suggest artifact generation
    const artifactTriggers = [
      // Web/Page building (HIGH PRIORITY)
      'build me a', 'build a', 'create a webpage', 'create a website',
      'make a webpage', 'make a website', 'design a page',
      'build page', 'create page', 'make page',

      // Code-related
      'write code', 'create code', 'generate code', 'build code',
      'write a function', 'create a function', 'write a class',
      'implement', 'code for', 'program', 'script',
      'write html', 'create html', 'build html',
      'write css', 'write javascript',

      // Component building
      'build me', 'create component', 'make component',
      'build component', 'design component',

      // Document-related
      'write a document', 'create a document', 'draft',
      'template', 'write a letter', 'write an email',
      'create a report', 'generate a report',
      'write an essay', 'generate an essay', 'create an essay',
      'write an article', 'generate an article', 'create an article',
      'write a guide', 'generate a guide', 'create a guide',

      // Diagram-related
      'create a diagram', 'draw a diagram', 'flowchart',
      'architecture diagram', 'visualize', 'sequence diagram',
      'class diagram', 'state diagram', 'gantt', 'mindmap',

      // Interactive/Canvas
      'create an app', 'build an app', 'interactive',
      'calculator', 'tool', 'demo',

      // General artifact indicators
      'example code', 'sample code', 'full code',
      'complete implementation', 'working example',

      // Generic "build" or "create" for substantial things
      'build a complete', 'create a complete',
      'build a full', 'create a full'
    ];

    // Check if message contains any trigger phrases
    const hasArtifactTrigger = artifactTriggers.some(trigger =>
      message.includes(trigger)
    );

    // Check for code block requests (substantial code)
    const asksForSubstantialCode = (
      message.includes('full') ||
      message.includes('complete') ||
      message.includes('entire')
    ) && (
      message.includes('code') ||
      message.includes('implementation') ||
      message.includes('function') ||
      message.includes('class')
    );

    // Check for explicit "build" or "create" followed by specific nouns
    const buildCreatePattern = /(build|create|make|design|write|generate)\s+(me\s+)?(a|an)?\s*(\w+)/i;
    const match = message.match(buildCreatePattern);
    if (match) {
      const noun = match[4].toLowerCase();
      // Common things that should be artifacts
      const artifactNouns = [
        'webpage', 'website', 'page', 'site', 'app', 'application',
        'component', 'widget', 'form', 'calculator', 'game',
        'dashboard', 'interface', 'ui', 'layout',
        'document', 'template', 'report', 'letter',
        'function', 'class', 'script', 'program',
        'essay', 'article', 'guide', 'tutorial', 'blog', 'post', 'story'
      ];

      if (artifactNouns.includes(noun)) {
        return true;
      }
    }

    // Check for standalone artifact nouns at start (e.g., "webpage for dentist")
    const standalonePattern = /^(webpage|website|page|site|app|application|component|calculator|game|dashboard|form|ui)\s+(for|about|of)/i;
    if (message.match(standalonePattern)) {
      return true;
    }

    // Check for "artifact" keyword (explicit request)
    if (message.includes('artifact') || message.includes('as an artifact')) {
      return true;
    }

    return hasArtifactTrigger || asksForSubstantialCode;
  }

  /**
   * Determine artifact type from user message
   */
  determineArtifactType(userMessage) {
    if (!userMessage) return 'code';

    const message = userMessage.toLowerCase();

    // Check for webpage/HTML requests first
    if (message.includes('webpage') || message.includes('website') ||
        message.includes('web page') || message.includes('html page') ||
        message.includes('landing page')) {
      return 'code'; // Webpages are code artifacts
    }

    if (message.includes('document') || message.includes('letter') ||
        message.includes('report') || message.includes('template') ||
        message.includes('essay') || message.includes('article') ||
        message.includes('guide') || message.includes('tutorial') ||
        message.includes('blog') || message.includes('post')) {
      return 'document';
    }

    if (message.includes('diagram') || message.includes('flowchart') ||
        message.includes('visualize') || message.includes('sequence') ||
        message.includes('gantt') || message.includes('mindmap')) {
      return 'diagram';
    }

    if (message.includes('app') || message.includes('calculator') ||
        message.includes('interactive') || message.includes('demo')) {
      return 'canvas';
    }

    // Default to code
    return 'code';
  }

  /**
   * Create system message for AI to generate artifacts
   */
  createArtifactSystemMessage(userMessage) {
    const shouldGenerate = this.shouldGenerateArtifact(userMessage);

    if (!shouldGenerate) {
      return null;
    }

    const artifactType = this.determineArtifactType(userMessage);

    return `
When responding to this request, you should generate an artifact if the user is asking for:
- Substantial code (>30 lines)
- A complete document or template
- A diagram or visualization
- An interactive tool or calculator

Format artifacts like this:

<artifact type="${artifactType}" title="Descriptive Title" language="javascript" editable="true">
... artifact content ...
</artifact>

Rules for artifacts:
1. Put substantial, reusable content in artifacts
2. Keep explanatory text outside the artifact
3. Use appropriate type: code, document, diagram, canvas
4. Include a clear title
5. For code, specify the language
6. Set editable="true" for content users might want to modify
7. Set executable="true" for code that can be run

Before the artifact, provide a brief explanation of what you're creating and why.
`;
  }

  /**
   * Check if user is requesting to edit/modify an existing artifact
   */
  isArtifactEditRequest(userMessage, conversationHistory = []) {
    if (!userMessage || typeof userMessage !== 'string') {
      return { isEdit: false, artifactId: null };
    }

    const message = userMessage.toLowerCase();

    // Keywords that suggest editing existing artifact
    const editTriggers = [
      'change', 'modify', 'update', 'edit', 'fix',
      'improve', 'refactor', 'adjust', 'revise',
      'make it', 'can you make', 'make the',
      'add to', 'remove from', 'replace in',
      'different color', 'different style',
      'change the color', 'change the text',
      'make it bigger', 'make it smaller',
      'add a button', 'add a section',
      'remove the', 'delete the'
    ];

    const hasEditTrigger = editTriggers.some(trigger => message.includes(trigger));

    // Check if there are artifacts in conversation history
    const lastAssistantMessage = [...conversationHistory]
      .reverse()
      .find(msg => msg.role === 'assistant');

    let hasRecentArtifact = false;
    let recentArtifactId = null;

    if (lastAssistantMessage && lastAssistantMessage.artifacts) {
      hasRecentArtifact = lastAssistantMessage.artifacts.length > 0;
      if (hasRecentArtifact) {
        // Get the most recent artifact ID
        recentArtifactId = lastAssistantMessage.artifacts[lastAssistantMessage.artifacts.length - 1].id;
      }
    }

    return {
      isEdit: hasEditTrigger && hasRecentArtifact,
      artifactId: recentArtifactId,
      lastArtifacts: lastAssistantMessage?.artifacts || null
    };
  }

  /**
   * Check if user is requesting multiple artifacts
   */
  shouldGenerateMultipleArtifacts(userMessage) {
    if (!userMessage || typeof userMessage !== 'string') {
      return { shouldGenerate: false, count: 1 };
    }

    const message = userMessage.toLowerCase();

    // Keywords suggesting multiple artifacts
    const multiplePatterns = [
      /(?:two|three|four|five|2|3|4|5)\s+(?:different|separate)?\s*(?:letters?|documents?|pages?|components?|files?)/i,
      /(?:both|all|each)\s+(?:a|an)?\s*(?:letter|document|page|component|file)/i,
      /one\s+for\s+.+\s+and\s+(?:one|another)\s+for/i,
      /first\s+.+\s+second/i,
      /create\s+(?:a|an)?\s*.+\s+and\s+(?:a|an)?/i
    ];

    const hasMultiplePattern = multiplePatterns.some(pattern => pattern.test(message));

    // Extract count if mentioned
    const numberMatch = message.match(/(?:two|three|four|five|2|3|4|5)/i);
    const numberMap = { 'two': 2, 'three': 3, 'four': 4, 'five': 5, '2': 2, '3': 3, '4': 4, '5': 5 };
    const count = numberMatch ? (numberMap[numberMatch[0].toLowerCase()] || 2) : 2;

    return {
      shouldGenerate: hasMultiplePattern,
      count: hasMultiplePattern ? count : 1
    };
  }

  /**
   * Validate artifact structure
   */
  validateArtifact(artifact) {
    if (!artifact || typeof artifact !== 'object') {
      return { valid: false, error: 'Artifact must be an object' };
    }

    if (!artifact.type || !['code', 'document', 'diagram', 'canvas', 'visualization'].includes(artifact.type)) {
      return { valid: false, error: 'Invalid artifact type' };
    }

    if (!artifact.content || typeof artifact.content !== 'string') {
      return { valid: false, error: 'Artifact content is required and must be a string' };
    }

    if (!artifact.title || typeof artifact.title !== 'string') {
      return { valid: false, error: 'Artifact title is required' };
    }

    return { valid: true };
  }
}

// Export singleton instance
export const artifactParser = new ArtifactParser();
export default artifactParser;
